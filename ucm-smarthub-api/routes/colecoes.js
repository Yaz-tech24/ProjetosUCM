const crypto = require("crypto");
const { z } = require("zod");

const db = require("../config/db");
const validar = require("../middleware/validar");
const { autenticar } = require("../middleware/auth");
const { limitarAvaliacoes } = require("../middleware/rateLimiters");
const { auditar } = require("../middleware/auditoria");
const { paraUrlAbsoluto } = require("../utils/urls");

const schemaColecao = z.object({
  nome: z.string().trim().min(2, "Dê um nome à colecção.").max(100, "Máximo 100 caracteres."),
  descricao: z.string().trim().max(500, "Máximo 500 caracteres.").optional().nullable(),
  publica: z.coerce.boolean().optional().default(false),
});

const gerarSlug = () => crypto.randomBytes(9).toString("base64url").slice(0, 12);

const SELECT_MATERIAL = `m.id, m.titulo, m.cadeira, m.tipo, m.url_arquivo, m.data_upload, m.visualizacoes, u.nome AS autor`;
const comUrl = (m) => ({ ...m, url_arquivo: paraUrlAbsoluto(m.url_arquivo) });

module.exports = function registarRotasColecoes(app) {
  // ══════════════════════════ FAVORITOS ══════════════════════════
  /**
   * @openapi
   * /api/favoritos:
   *   get:
   *     summary: IDs dos materiais favoritos do utilizador (guardados no servidor — seguem-no entre dispositivos)
   *     tags: [Colecções]
   *     responses:
   *       200: { description: Lista de IDs }
   */
  app.get("/api/favoritos", autenticar, async (req, res) => {
    try {
      const [linhas] = await db.query("SELECT material_id FROM favoritos WHERE usuario_id = ? ORDER BY criado_em DESC", [req.utilizador.id]);
      res.json(linhas.map(l => l.material_id));
    } catch (erro) {
      console.error("Erro ao listar favoritos:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar favoritos." });
    }
  });

  /**
   * @openapi
   * /api/favoritos/{materialId}:
   *   put:
   *     summary: Marca um material como favorito
   *     tags: [Colecções]
   *     responses:
   *       200: { description: Marcado }
   *   delete:
   *     summary: Retira um material dos favoritos
   *     tags: [Colecções]
   *     responses:
   *       200: { description: Retirado }
   */
  app.put("/api/favoritos/:materialId", autenticar, limitarAvaliacoes, async (req, res) => {
    try {
      const materialId = parseInt(req.params.materialId, 10);
      const [[material]] = await db.query("SELECT id FROM materiais WHERE id = ? AND status = 'aprovado'", [materialId]);
      if (!material) return res.status(404).json({ erro: "Material não encontrado." });
      await db.query("INSERT IGNORE INTO favoritos (usuario_id, material_id) VALUES (?, ?)", [req.utilizador.id, materialId]);
      res.json({ favorito: true });
    } catch (erro) {
      console.error("Erro ao marcar favorito:", erro.message);
      res.status(500).json({ erro: "Erro ao marcar favorito." });
    }
  });

  app.delete("/api/favoritos/:materialId", autenticar, limitarAvaliacoes, async (req, res) => {
    try {
      const materialId = parseInt(req.params.materialId, 10);
      await db.query("DELETE FROM favoritos WHERE usuario_id = ? AND material_id = ?", [req.utilizador.id, materialId]);
      res.json({ favorito: false });
    } catch (erro) {
      console.error("Erro ao retirar favorito:", erro.message);
      res.status(500).json({ erro: "Erro ao retirar favorito." });
    }
  });

  /**
   * @openapi
   * /api/favoritos/sincronizar:
   *   post:
   *     summary: Junta os favoritos que a app guardava no browser aos do servidor (migração única)
   *     tags: [Colecções]
   *     requestBody:
   *       content:
   *         application/json:
   *           schema: { type: object, properties: { ids: { type: array, items: { type: integer } } } }
   *     responses:
   *       200: { description: Lista final de IDs }
   */
  app.post("/api/favoritos/sincronizar", autenticar, async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(Number).filter(Number.isInteger))].slice(0, 500) : [];
      if (ids.length > 0) {
        const [validos] = await db.query("SELECT id FROM materiais WHERE status = 'aprovado' AND id IN (?)", [ids]);
        if (validos.length > 0) {
          await db.query("INSERT IGNORE INTO favoritos (usuario_id, material_id) VALUES " + validos.map(() => "(?, ?)").join(","), validos.flatMap(v => [req.utilizador.id, v.id]));
        }
      }
      const [linhas] = await db.query("SELECT material_id FROM favoritos WHERE usuario_id = ? ORDER BY criado_em DESC", [req.utilizador.id]);
      res.json(linhas.map(l => l.material_id));
    } catch (erro) {
      console.error("Erro ao sincronizar favoritos:", erro.message);
      res.status(500).json({ erro: "Erro ao sincronizar favoritos." });
    }
  });

  /**
   * @openapi
   * /api/favoritos/materiais:
   *   get:
   *     summary: Materiais favoritos completos (para a lista "Guardados")
   *     tags: [Colecções]
   *     responses:
   *       200: { description: Materiais }
   */
  app.get("/api/favoritos/materiais", autenticar, async (req, res) => {
    try {
      const [materiais] = await db.query(
        `SELECT ${SELECT_MATERIAL}, f.criado_em AS guardado_em
         FROM favoritos f JOIN materiais m ON m.id = f.material_id JOIN usuarios u ON u.id = m.autor_id
         WHERE f.usuario_id = ? AND m.status = 'aprovado'
         ORDER BY f.criado_em DESC`,
        [req.utilizador.id]
      );
      res.json(materiais.map(comUrl));
    } catch (erro) {
      console.error("Erro ao listar favoritos:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar favoritos." });
    }
  });

  // ══════════════════════════ COLECÇÕES ══════════════════════════
  /**
   * @openapi
   * /api/colecoes:
   *   get:
   *     summary: Colecções do utilizador autenticado
   *     tags: [Colecções]
   *     responses:
   *       200: { description: Lista com contagem de materiais }
   *   post:
   *     summary: Cria uma colecção
   *     tags: [Colecções]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [nome], properties: { nome: { type: string }, descricao: { type: string }, publica: { type: boolean } } }
   *     responses:
   *       201: { description: Criada (inclui slug para partilha) }
   */
  app.get("/api/colecoes", autenticar, async (req, res) => {
    try {
      const [colecoes] = await db.query(
        `SELECT c.id, c.nome, c.descricao, c.publica, c.slug, c.criado_em, c.atualizado_em,
                (SELECT COUNT(*) FROM colecoes_materiais cm WHERE cm.colecao_id = c.id) AS total_materiais
         FROM colecoes c WHERE c.usuario_id = ? ORDER BY c.atualizado_em DESC`,
        [req.utilizador.id]
      );
      res.json(colecoes);
    } catch (erro) {
      console.error("Erro ao listar colecções:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar colecções." });
    }
  });

  app.post("/api/colecoes", autenticar, limitarAvaliacoes, validar(schemaColecao), async (req, res) => {
    try {
      const { nome, descricao, publica } = req.body;
      const [[{ total }]] = await db.query("SELECT COUNT(*) AS total FROM colecoes WHERE usuario_id = ?", [req.utilizador.id]);
      if (total >= 50) return res.status(400).json({ erro: "Limite de 50 colecções por utilizador." });
      const slug = gerarSlug();
      const [r] = await db.query(
        "INSERT INTO colecoes (usuario_id, nome, descricao, publica, slug) VALUES (?, ?, ?, ?, ?)",
        [req.utilizador.id, nome, descricao || null, publica ? 1 : 0, slug]
      );
      auditar(req.utilizador.id, "criar_colecao", "colecoes", r.insertId, `Criou a colecção "${nome}"`, req.ip);
      res.status(201).json({ id: r.insertId, nome, descricao: descricao || null, publica: publica ? 1 : 0, slug, total_materiais: 0 });
    } catch (erro) {
      console.error("Erro ao criar colecção:", erro.message);
      res.status(500).json({ erro: "Erro ao criar colecção." });
    }
  });

  /**
   * @openapi
   * /api/colecoes/{slug}:
   *   get:
   *     summary: Uma colecção com os seus materiais. Pública para toda a gente autenticada se `publica`; senão só o dono.
   *     tags: [Colecções]
   *     responses:
   *       200: { description: Colecção + materiais }
   *       404: { description: Não existe ou é privada }
   *   put:
   *     summary: Edita nome, descrição e visibilidade (só o dono)
   *     tags: [Colecções]
   *     responses:
   *       200: { description: Actualizada }
   *   delete:
   *     summary: Apaga a colecção (só o dono)
   *     tags: [Colecções]
   *     responses:
   *       200: { description: Apagada }
   */
  app.get("/api/colecoes/:slug", autenticar, async (req, res) => {
    try {
      const [[colecao]] = await db.query(
        `SELECT c.id, c.nome, c.descricao, c.publica, c.slug, c.usuario_id, c.criado_em, c.atualizado_em, u.nome AS dono
         FROM colecoes c JOIN usuarios u ON u.id = c.usuario_id WHERE c.slug = ?`,
        [String(req.params.slug)]
      );
      if (!colecao || (!colecao.publica && colecao.usuario_id !== req.utilizador.id)) {
        return res.status(404).json({ erro: "Colecção não encontrada ou privada." });
      }
      const [materiais] = await db.query(
        `SELECT ${SELECT_MATERIAL}, cm.ordem, cm.adicionado_em
         FROM colecoes_materiais cm JOIN materiais m ON m.id = cm.material_id JOIN usuarios u ON u.id = m.autor_id
         WHERE cm.colecao_id = ? AND m.status = 'aprovado'
         ORDER BY cm.ordem ASC, cm.adicionado_em ASC`,
        [colecao.id]
      );
      res.json({ ...colecao, minha: colecao.usuario_id === req.utilizador.id, materiais: materiais.map(comUrl) });
    } catch (erro) {
      console.error("Erro ao abrir colecção:", erro.message);
      res.status(500).json({ erro: "Erro ao abrir colecção." });
    }
  });

  async function colecaoDoDono(slug, usuarioId) {
    const [[c]] = await db.query("SELECT id, nome FROM colecoes WHERE slug = ? AND usuario_id = ?", [String(slug), usuarioId]);
    return c || null;
  }

  app.put("/api/colecoes/:slug", autenticar, validar(schemaColecao), async (req, res) => {
    try {
      const colecao = await colecaoDoDono(req.params.slug, req.utilizador.id);
      if (!colecao) return res.status(404).json({ erro: "Colecção não encontrada." });
      const { nome, descricao, publica } = req.body;
      await db.query("UPDATE colecoes SET nome = ?, descricao = ?, publica = ? WHERE id = ?", [nome, descricao || null, publica ? 1 : 0, colecao.id]);
      res.json({ mensagem: "Colecção actualizada." });
    } catch (erro) {
      console.error("Erro ao editar colecção:", erro.message);
      res.status(500).json({ erro: "Erro ao editar colecção." });
    }
  });

  app.delete("/api/colecoes/:slug", autenticar, async (req, res) => {
    try {
      const colecao = await colecaoDoDono(req.params.slug, req.utilizador.id);
      if (!colecao) return res.status(404).json({ erro: "Colecção não encontrada." });
      await db.query("DELETE FROM colecoes WHERE id = ?", [colecao.id]);
      auditar(req.utilizador.id, "apagar_colecao", "colecoes", colecao.id, `Apagou a colecção "${colecao.nome}"`, req.ip);
      res.json({ mensagem: "Colecção apagada." });
    } catch (erro) {
      console.error("Erro ao apagar colecção:", erro.message);
      res.status(500).json({ erro: "Erro ao apagar colecção." });
    }
  });

  /**
   * @openapi
   * /api/colecoes/{slug}/materiais/{materialId}:
   *   put:
   *     summary: Adiciona um material à colecção (só o dono)
   *     tags: [Colecções]
   *     responses:
   *       200: { description: Adicionado }
   *   delete:
   *     summary: Retira um material da colecção (só o dono)
   *     tags: [Colecções]
   *     responses:
   *       200: { description: Retirado }
   */
  app.put("/api/colecoes/:slug/materiais/:materialId", autenticar, limitarAvaliacoes, async (req, res) => {
    try {
      const colecao = await colecaoDoDono(req.params.slug, req.utilizador.id);
      if (!colecao) return res.status(404).json({ erro: "Colecção não encontrada." });
      const materialId = parseInt(req.params.materialId, 10);
      const [[material]] = await db.query("SELECT id FROM materiais WHERE id = ? AND status = 'aprovado'", [materialId]);
      if (!material) return res.status(404).json({ erro: "Material não encontrado." });
      const [[{ proxima }]] = await db.query("SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima FROM colecoes_materiais WHERE colecao_id = ?", [colecao.id]);
      await db.query("INSERT IGNORE INTO colecoes_materiais (colecao_id, material_id, ordem) VALUES (?, ?, ?)", [colecao.id, materialId, proxima]);
      await db.query("UPDATE colecoes SET atualizado_em = NOW() WHERE id = ?", [colecao.id]);
      res.json({ mensagem: `Adicionado a "${colecao.nome}".` });
    } catch (erro) {
      console.error("Erro ao adicionar à colecção:", erro.message);
      res.status(500).json({ erro: "Erro ao adicionar à colecção." });
    }
  });

  app.delete("/api/colecoes/:slug/materiais/:materialId", autenticar, async (req, res) => {
    try {
      const colecao = await colecaoDoDono(req.params.slug, req.utilizador.id);
      if (!colecao) return res.status(404).json({ erro: "Colecção não encontrada." });
      await db.query("DELETE FROM colecoes_materiais WHERE colecao_id = ? AND material_id = ?", [colecao.id, parseInt(req.params.materialId, 10)]);
      res.json({ mensagem: "Retirado da colecção." });
    } catch (erro) {
      console.error("Erro ao retirar da colecção:", erro.message);
      res.status(500).json({ erro: "Erro ao retirar da colecção." });
    }
  });

  /**
   * @openapi
   * /api/materiais/{id}/colecoes:
   *   get:
   *     summary: Em que colecções do utilizador está este material (para o botão "Guardar em…")
   *     tags: [Colecções]
   *     responses:
   *       200: { description: IDs das colecções }
   */
  app.get("/api/materiais/:id/colecoes", autenticar, async (req, res) => {
    try {
      const [linhas] = await db.query(
        "SELECT c.id FROM colecoes c JOIN colecoes_materiais cm ON cm.colecao_id = c.id WHERE c.usuario_id = ? AND cm.material_id = ?",
        [req.utilizador.id, parseInt(req.params.id, 10)]
      );
      res.json(linhas.map(l => l.id));
    } catch (erro) {
      console.error("Erro ao consultar colecções do material:", erro.message);
      res.status(500).json({ erro: "Erro ao consultar colecções." });
    }
  });
};
