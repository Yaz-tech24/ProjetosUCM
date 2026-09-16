const { z } = require("zod");

const db = require("../config/db");
const validar = require("../middleware/validar");
const { autenticar, apenasAdmin } = require("../middleware/auth");
const { limitarComentarios } = require("../middleware/rateLimiters");
const { auditar } = require("../middleware/auditoria");
const { criarNotificacao } = require("../services/notificacoes");
const { atualizarReputacao } = require("../services/reputacao");
const { apagarFicheirosMaterial } = require("../services/ficheirosMaterial");
const { classificarDenuncia } = require("../services/moderacaoDenuncias");
const { getConfiguracoes } = require("../services/plataforma");

const TIPOS = ["material", "comentario", "mensagem", "pergunta", "resposta"];
const MOTIVOS = ["conteudo_improprio", "direitos_autor", "spam", "informacao_errada", "assedio", "outro"];

const schemaDenuncia = z.object({
  tipo: z.enum(TIPOS, { message: "Tipo de conteúdo inválido." }),
  recurso_id: z.coerce.number().int().positive(),
  motivo: z.enum(MOTIVOS, { message: "Motivo inválido." }),
  detalhes: z.string().trim().max(1000, "Máximo 1000 caracteres.").optional().nullable(),
});

// Onde está cada tipo de conteúdo — para confirmar que existe e para o admin
// conseguir vê-lo/removê-lo a partir da fila.
const TABELAS = {
  material:   { tabela: "materiais",             titulo: "titulo",   link: (id) => `/video/${id}` },
  comentario: { tabela: "comentarios_materiais", titulo: "conteudo", link: (id, extra) => `/video/${extra}` },
  mensagem:   { tabela: "mensagens_estudantes",  titulo: "message",  link: () => "/admin" },
  pergunta:   { tabela: "perguntas",             titulo: "titulo",   link: (id) => `/perguntas/${id}` },
  resposta:   { tabela: "respostas",             titulo: "conteudo", link: (id, extra) => `/perguntas/${extra}` },
};

async function descreverRecurso(tipo, id) {
  const def = TABELAS[tipo];
  const [[linha]] = await db.query(`SELECT * FROM \`${def.tabela}\` WHERE id = ?`, [id]);
  if (!linha) return null;
  const extra = tipo === "comentario" ? linha.material_id : tipo === "resposta" ? linha.pergunta_id : null;
  return { existe: true, resumo: String(linha[def.titulo] || "").slice(0, 160), conteudo: String(linha[def.titulo] || ""), link: def.link(id, extra) };
}

module.exports = function registarRotasDenuncias(app) {
  /**
   * @openapi
   * /api/denuncias:
   *   post:
   *     summary: Reporta um material, comentário, mensagem de chat, pergunta ou resposta
   *     tags: [Denúncias]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tipo, recurso_id, motivo]
   *             properties:
   *               tipo: { type: string, enum: [material, comentario, mensagem, pergunta, resposta] }
   *               recurso_id: { type: integer }
   *               motivo: { type: string, enum: [conteudo_improprio, direitos_autor, spam, informacao_errada, assedio, outro] }
   *               detalhes: { type: string }
   *     responses:
   *       201: { description: Denúncia registada }
   *       409: { description: Já denunciou este conteúdo }
   */
  app.post("/api/denuncias", autenticar, limitarComentarios, validar(schemaDenuncia), async (req, res) => {
    try {
      const { tipo, recurso_id, motivo, detalhes } = req.body;
      const recurso = await descreverRecurso(tipo, recurso_id);
      if (!recurso) return res.status(404).json({ erro: "Esse conteúdo já não existe." });

      const [[repetida]] = await db.query(
        "SELECT id FROM denuncias WHERE tipo = ? AND recurso_id = ? AND usuario_id = ? AND estado = 'pendente'",
        [tipo, recurso_id, req.utilizador.id]
      );
      if (repetida) return res.status(409).json({ erro: "Já reportou este conteúdo. Um administrador vai analisá-lo." });

      const [r] = await db.query(
        "INSERT INTO denuncias (tipo, recurso_id, usuario_id, motivo, detalhes) VALUES (?, ?, ?, ?, ?)",
        [tipo, recurso_id, req.utilizador.id, motivo, detalhes || null]
      );
      auditar(req.utilizador.id, "denunciar_conteudo", tipo, recurso_id, `Motivo: ${motivo}`, req.ip);

      // Sugestão da IA para o admin (best-effort, nunca bloqueia a denúncia).
      // Materiais não têm texto curto para classificar — ficam para revisão humana.
      if (tipo !== "material") {
        const config = await getConfiguracoes().catch(() => ({}));
        if (config.moderacao_ia_activada) {
          const ia = await classificarDenuncia({ tipo, motivo, detalhes, conteudo: recurso.conteudo, proposito: config.descricao_proposito });
          if (ia) {
            await db.query("UPDATE denuncias SET ia_classificacao = ?, ia_sugestao = ?, ia_motivo = ? WHERE id = ?", [ia.classificacao, ia.sugestao, ia.motivo, r.insertId]).catch(() => {});
          }
        }
      }

      // Avisa os admins em tempo real — a fila só é útil se alguém a vir.
      const [admins] = await db.query("SELECT id FROM usuarios WHERE papel = 'admin'");
      for (const a of admins) {
        criarNotificacao(a.id, { tipo: "denuncia", titulo: `Nova denúncia (${tipo})`, mensagem: recurso.resumo, link: "/admin?aba=denuncias" });
      }
      res.status(201).json({ id: r.insertId, mensagem: "Obrigado. A denúncia foi registada e será analisada por um administrador." });
    } catch (erro) {
      console.error("Erro ao registar denúncia:", erro.message);
      res.status(500).json({ erro: "Erro ao registar a denúncia." });
    }
  });

  /**
   * @openapi
   * /api/admin/denuncias:
   *   get:
   *     summary: Fila de denúncias (admin), com resumo e link do conteúdo reportado
   *     tags: [Denúncias]
   *     parameters:
   *       - in: query
   *         name: estado
   *         schema: { type: string, enum: [pendente, resolvida, ignorada], default: pendente }
   *     responses:
   *       200: { description: Lista paginada + total pendente }
   */
  app.get("/api/admin/denuncias", autenticar, apenasAdmin, async (req, res) => {
    try {
      const estado = ["pendente", "resolvida", "ignorada"].includes(req.query.estado) ? req.query.estado : "pendente";
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
      const offset = (page - 1) * limit;
      const [denuncias] = await db.query(
        `SELECT d.id, d.tipo, d.recurso_id, d.motivo, d.detalhes, d.estado, d.criado_em, d.resolvida_em,
                d.ia_classificacao, d.ia_sugestao, d.ia_motivo,
                u.nome AS denunciante, a.nome AS resolvida_por_nome
         FROM denuncias d
         LEFT JOIN usuarios u ON u.id = d.usuario_id
         LEFT JOIN usuarios a ON a.id = d.resolvida_por
         WHERE d.estado = ? ORDER BY d.criado_em DESC LIMIT ? OFFSET ?`,
        [estado, limit, offset]
      );
      const enriquecidas = [];
      for (const d of denuncias) {
        const recurso = await descreverRecurso(d.tipo, d.recurso_id);
        // `conteudo` completo só serve à IA — a fila mostra o resumo.
        const publico = { ...(recurso || { existe: false, resumo: "(conteúdo já removido)", link: null }) };
        delete publico.conteudo;
        enriquecidas.push({ ...d, recurso: publico });
      }
      const [[{ total }]] = await db.query("SELECT COUNT(*) AS total FROM denuncias WHERE estado = ?", [estado]);
      const [[{ pendentes }]] = await db.query("SELECT COUNT(*) AS pendentes FROM denuncias WHERE estado = 'pendente'");
      res.json({ denuncias: enriquecidas, pendentes: Number(pendentes) || 0, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (erro) {
      console.error("Erro ao listar denúncias:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar denúncias." });
    }
  });

  /**
   * @openapi
   * /api/admin/denuncias/{id}:
   *   put:
   *     summary: Fecha uma denúncia como resolvida ou ignorada; opcionalmente remove o conteúdo reportado
   *     tags: [Denúncias]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [estado], properties: { estado: { type: string, enum: [resolvida, ignorada] }, remover_conteudo: { type: boolean } } }
   *     responses:
   *       200: { description: Actualizada }
   */
  app.put("/api/admin/denuncias/:id", autenticar, apenasAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const estado = req.body?.estado === "ignorada" ? "ignorada" : "resolvida";
      const remover = req.body?.remover_conteudo === true;
      const [[denuncia]] = await db.query("SELECT id, tipo, recurso_id, usuario_id FROM denuncias WHERE id = ?", [id]);
      if (!denuncia) return res.status(404).json({ erro: "Denúncia não encontrada." });

      if (remover && estado === "resolvida") {
        const def = TABELAS[denuncia.tipo];
        if (denuncia.tipo === "material") {
          // Mesmo tratamento da remoção normal: ficheiro fora do disco e
          // reputação do autor recalculada.
          const [[m]] = await db.query("SELECT autor_id FROM materiais WHERE id = ?", [denuncia.recurso_id]);
          await apagarFicheirosMaterial(denuncia.recurso_id);
          await db.query("DELETE FROM materiais WHERE id = ?", [denuncia.recurso_id]);
          if (m?.autor_id) atualizarReputacao(m.autor_id);
        } else {
          await db.query(`DELETE FROM \`${def.tabela}\` WHERE id = ?`, [denuncia.recurso_id]);
        }
        auditar(req.utilizador.id, "remover_conteudo_denunciado", denuncia.tipo, denuncia.recurso_id, `Removido a partir da denúncia #${id}`, req.ip);
      }
      // Todas as denúncias pendentes sobre o mesmo conteúdo fecham juntas.
      await db.query(
        "UPDATE denuncias SET estado = ?, resolvida_por = ?, resolvida_em = NOW() WHERE tipo = ? AND recurso_id = ? AND estado = 'pendente'",
        [estado, req.utilizador.id, denuncia.tipo, denuncia.recurso_id]
      );
      auditar(req.utilizador.id, `denuncia_${estado}`, "denuncias", id, `${denuncia.tipo} #${denuncia.recurso_id}`, req.ip);
      if (denuncia.usuario_id) {
        criarNotificacao(denuncia.usuario_id, {
          tipo: "denuncia_fechada",
          titulo: estado === "resolvida" ? "A sua denúncia foi resolvida" : "A sua denúncia foi analisada",
          mensagem: estado === "resolvida" ? (remover ? "O conteúdo foi removido. Obrigado por ajudar a manter a plataforma limpa." : "Foram tomadas medidas.") : "O conteúdo foi analisado e não viola as regras.",
        });
      }
      res.json({ mensagem: estado === "resolvida" ? (remover ? "Conteúdo removido e denúncia resolvida." : "Denúncia resolvida.") : "Denúncia ignorada." });
    } catch (erro) {
      console.error("Erro ao fechar denúncia:", erro.message);
      res.status(500).json({ erro: "Erro ao actualizar a denúncia." });
    }
  });
};
