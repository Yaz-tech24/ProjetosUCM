const db = require("../config/db");
const { autenticar } = require("../middleware/auth");
const { limitarChat, limitarAvaliacoes } = require("../middleware/rateLimiters");
const { auditar } = require("../middleware/auditoria");
const { getConfiguracoes } = require("../services/plataforma");
const { indexarMaterial } = require("../services/indexacao");
const { verificarConquistas } = require("../services/conquistas");
const flashcards = require("../services/flashcards");

async function carregarCartoes(materialId, usuarioId) {
  const [linhas] = await db.query(
    `SELECT f.id, f.ordem, f.frente, f.verso, f.gerado_em,
            r.facilidade, r.intervalo_dias, r.repeticoes, r.total_revisoes, r.proxima_revisao, r.ultima_revisao
     FROM flashcards f
     LEFT JOIN flashcards_revisoes r ON r.flashcard_id = f.id AND r.usuario_id = ?
     WHERE f.material_id = ?
     ORDER BY f.ordem ASC, f.id ASC`,
    [usuarioId, materialId]
  );
  return linhas;
}

// Um cartão está "pendente" se nunca foi revisto ou se a próxima revisão já
// passou (comparação por data, não por hora — "hoje" conta).
const hoje = () => new Date().toISOString().slice(0, 10);
const pendente = (c) => !c.proxima_revisao || String(c.proxima_revisao).slice(0, 10) <= hoje();

function resumir(cartoes) {
  const total = cartoes.length;
  const novos = cartoes.filter(c => !c.ultima_revisao).length;
  const pendentes = cartoes.filter(pendente).length;
  const dominados = cartoes.filter(c => Number(c.intervalo_dias) >= 21).length;
  return { total, novos, pendentes, dominados };
}

module.exports = function registarRotasFlashcards(app) {
  /**
   * @openapi
   * /api/materiais/{id}/flashcards:
   *   get:
   *     summary: Flashcards do material (gerados por IA na primeira vez) com o estado de revisão do utilizador
   *     tags: [Flashcards]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Cartões + resumo (total, novos, pendentes, dominados) }
   *       400: { description: Material sem texto suficiente }
   *       503: { description: IA desactivada ou não configurada }
   *   delete:
   *     summary: Apaga os flashcards do material para serem gerados de novo (autor ou admin)
   *     tags: [Flashcards]
   *     responses:
   *       200: { description: Apagados }
   */
  app.get("/api/materiais/:id/flashcards", autenticar, limitarChat, async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const config = await getConfiguracoes();
      if (!config.ia_activada) return res.status(503).json({ erro: "Funcionalidades de IA desactivadas pelo administrador." });

      const [[material]] = await db.query(
        "SELECT id, titulo, cadeira, tipo, url_arquivo, texto_extraido, texto_indexado_em FROM materiais WHERE id = ? AND status = 'aprovado'",
        [materialId]
      );
      if (!material) return res.status(404).json({ erro: "Material não encontrado." });

      let cartoes = await carregarCartoes(materialId, req.utilizador.id);
      if (cartoes.length === 0) {
        if (material.tipo !== "PDF") return res.status(400).json({ erro: "Os flashcards só estão disponíveis para documentos PDF." });
        let texto = material.texto_extraido;
        if (!texto && !material.texto_indexado_em) {
          await indexarMaterial(materialId, material.url_arquivo);
          const [[actualizado]] = await db.query("SELECT texto_extraido FROM materiais WHERE id = ?", [materialId]);
          texto = actualizado?.texto_extraido;
        }
        if (!texto || texto.trim().length < 400) {
          return res.status(400).json({ erro: "Este PDF não tem texto suficiente para gerar flashcards (pode ser uma digitalização)." });
        }
        const { cartoes: gerados, modelo } = await flashcards.gerarFlashcards({ nomePlataforma: config.nome_plataforma, titulo: material.titulo, cadeira: material.cadeira, texto });
        // Só insere se entretanto ninguém gerou (dois pedidos simultâneos).
        const [[{ existentes }]] = await db.query("SELECT COUNT(*) AS existentes FROM flashcards WHERE material_id = ?", [materialId]);
        if (Number(existentes) === 0) {
          for (const [i, c] of gerados.entries()) {
            await db.query("INSERT INTO flashcards (material_id, ordem, frente, verso, modelo) VALUES (?, ?, ?, ?, ?)", [materialId, i, c.frente, c.verso, modelo]);
          }
        }
        cartoes = await carregarCartoes(materialId, req.utilizador.id);
      }

      res.json({
        material_id: materialId,
        resumo: resumir(cartoes),
        cartoes: cartoes.map(c => ({
          id: c.id, frente: c.frente, verso: c.verso,
          pendente: pendente(c), novo: !c.ultima_revisao,
          intervalo_dias: Number(c.intervalo_dias) || 0, repeticoes: Number(c.repeticoes) || 0,
          proxima_revisao: c.proxima_revisao ? String(c.proxima_revisao).slice(0, 10) : null,
        })),
      });
    } catch (erro) {
      if (erro.status) return res.status(erro.status).json({ erro: erro.message });
      console.error("Erro nos flashcards:", erro.message);
      res.status(500).json({ erro: "Erro ao preparar os flashcards." });
    }
  });

  app.delete("/api/materiais/:id/flashcards", autenticar, async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const [[material]] = await db.query("SELECT id, autor_id FROM materiais WHERE id = ?", [materialId]);
      if (!material) return res.status(404).json({ erro: "Material não encontrado." });
      if (req.utilizador.papel !== "admin" && material.autor_id !== req.utilizador.id) {
        return res.status(403).json({ erro: "Só o autor ou um administrador podem regenerar os flashcards." });
      }
      await db.query("DELETE FROM flashcards WHERE material_id = ?", [materialId]);
      auditar(req.utilizador.id, "regenerar_flashcards", "material", materialId, null, req.ip);
      res.json({ mensagem: "Flashcards apagados. Serão gerados de novo na próxima abertura." });
    } catch (erro) {
      console.error("Erro ao apagar flashcards:", erro.message);
      res.status(500).json({ erro: "Erro ao apagar os flashcards." });
    }
  });

  /**
   * @openapi
   * /api/flashcards/{id}/revisao:
   *   post:
   *     summary: Regista a revisão de um cartão (errei / dificil / facil) e agenda a próxima
   *     tags: [Flashcards]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [resultado], properties: { resultado: { type: string, enum: [errei, dificil, facil] } } }
   *     responses:
   *       200: { description: Estado novo do cartão (intervalo, próxima revisão) }
   */
  app.post("/api/flashcards/:id/revisao", autenticar, limitarAvaliacoes, async (req, res) => {
    try {
      const flashcardId = parseInt(req.params.id, 10);
      const resultado = String(req.body?.resultado || "");
      if (!flashcards.RESULTADOS.includes(resultado)) return res.status(400).json({ erro: "Resultado inválido (errei, dificil ou facil)." });

      const [[cartao]] = await db.query("SELECT id, material_id FROM flashcards WHERE id = ?", [flashcardId]);
      if (!cartao) return res.status(404).json({ erro: "Cartão não encontrado." });

      const [[actual]] = await db.query(
        "SELECT facilidade, intervalo_dias, repeticoes, total_revisoes FROM flashcards_revisoes WHERE usuario_id = ? AND flashcard_id = ?",
        [req.utilizador.id, flashcardId]
      );
      const novo = flashcards.proximoEstado(actual || null, resultado);
      const proxima = flashcards.dataMaisDias(novo.intervalo_dias);
      await db.query(
        `INSERT INTO flashcards_revisoes (usuario_id, flashcard_id, facilidade, intervalo_dias, repeticoes, total_revisoes, proxima_revisao, ultima_revisao)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE facilidade = VALUES(facilidade), intervalo_dias = VALUES(intervalo_dias), repeticoes = VALUES(repeticoes),
           total_revisoes = VALUES(total_revisoes), proxima_revisao = VALUES(proxima_revisao), ultima_revisao = NOW()`,
        [req.utilizador.id, flashcardId, novo.facilidade.toFixed(2), novo.intervalo_dias, novo.repeticoes, novo.total_revisoes, proxima]
      );
      verificarConquistas(req.utilizador.id).catch(() => {});
      res.json({ flashcard_id: flashcardId, resultado, intervalo_dias: novo.intervalo_dias, proxima_revisao: proxima, repeticoes: novo.repeticoes });
    } catch (erro) {
      console.error("Erro ao registar revisão:", erro.message);
      res.status(500).json({ erro: "Erro ao registar a revisão." });
    }
  });

  /**
   * @openapi
   * /api/flashcards/pendentes:
   *   get:
   *     summary: Cartões a rever hoje, agrupados por material (para o painel inicial)
   *     tags: [Flashcards]
   *     responses:
   *       200: { description: Total pendente e lista por material }
   */
  app.get("/api/flashcards/pendentes", autenticar, async (req, res) => {
    try {
      const [linhas] = await db.query(
        `SELECT m.id AS material_id, m.titulo, m.cadeira,
                COUNT(*) AS pendentes,
                SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END) AS novos
         FROM flashcards f
         JOIN materiais m ON m.id = f.material_id AND m.status = 'aprovado'
         LEFT JOIN flashcards_revisoes r ON r.flashcard_id = f.id AND r.usuario_id = ?
         WHERE (r.id IS NOT NULL AND r.proxima_revisao <= CURDATE())
            OR (r.id IS NULL AND EXISTS (SELECT 1 FROM flashcards_revisoes r2 JOIN flashcards f2 ON f2.id = r2.flashcard_id WHERE r2.usuario_id = ? AND f2.material_id = m.id))
         GROUP BY m.id, m.titulo, m.cadeira
         ORDER BY pendentes DESC
         LIMIT 10`,
        [req.utilizador.id, req.utilizador.id]
      );
      const total = linhas.reduce((s, l) => s + Number(l.pendentes), 0);
      res.json({ total, materiais: linhas.map(l => ({ ...l, pendentes: Number(l.pendentes), novos: Number(l.novos) })) });
    } catch (erro) {
      console.error("Erro ao listar flashcards pendentes:", erro.message);
      res.status(500).json({ erro: "Erro ao listar revisões pendentes." });
    }
  });
};
