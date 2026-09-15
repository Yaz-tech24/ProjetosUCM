const db = require("../config/db");
const { autenticar } = require("../middleware/auth");
const { limitarChat, limitarAvaliacoes } = require("../middleware/rateLimiters");
const { auditar } = require("../middleware/auditoria");
const { getConfiguracoes } = require("../services/plataforma");
const { indexarMaterial } = require("../services/indexacao");
const { atualizarReputacao } = require("../services/reputacao");
const quiz = require("../services/quiz");

async function carregarQuiz(materialId) {
  const [[linha]] = await db.query("SELECT id, perguntas, modelo, gerado_em FROM quizzes WHERE material_id = ?", [materialId]);
  if (!linha) return null;
  const perguntas = typeof linha.perguntas === "string" ? JSON.parse(linha.perguntas) : linha.perguntas;
  return { ...linha, perguntas };
}

module.exports = function registarRotasQuiz(app) {
  /**
   * @openapi
   * /api/materiais/{id}/quiz:
   *   get:
   *     summary: Quiz de escolha múltipla gerado por IA a partir do PDF (gerado na primeira vez e guardado). Devolve as perguntas sem as soluções.
   *     tags: [Quizzes]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Perguntas + melhor resultado do utilizador }
   *       400: { description: Material sem texto (vídeo ou PDF digitalizado) }
   *       503: { description: IA desactivada ou não configurada }
   */
  app.get("/api/materiais/:id/quiz", autenticar, limitarChat, async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const config = await getConfiguracoes();
      if (!config.ia_activada) return res.status(503).json({ erro: "Funcionalidades de IA desactivadas pelo administrador." });

      const [[material]] = await db.query(
        "SELECT id, titulo, cadeira, tipo, url_arquivo, texto_extraido, texto_indexado_em FROM materiais WHERE id = ? AND status = 'aprovado'",
        [materialId]
      );
      if (!material) return res.status(404).json({ erro: "Material não encontrado." });

      let existente = await carregarQuiz(materialId);
      if (!existente) {
        if (material.tipo !== "PDF") return res.status(400).json({ erro: "Os quizzes só estão disponíveis para documentos PDF." });
        let texto = material.texto_extraido;
        if (!texto && !material.texto_indexado_em) {
          await indexarMaterial(materialId, material.url_arquivo);
          const [[actualizado]] = await db.query("SELECT texto_extraido FROM materiais WHERE id = ?", [materialId]);
          texto = actualizado?.texto_extraido;
        }
        if (!texto || texto.trim().length < 400) {
          return res.status(400).json({ erro: "Este PDF não tem texto suficiente para gerar perguntas (pode ser uma digitalização)." });
        }
        const { perguntas, modelo } = await quiz.gerarQuiz({ nomePlataforma: config.nome_plataforma, titulo: material.titulo, cadeira: material.cadeira, texto });
        await db.query(
          "INSERT INTO quizzes (material_id, perguntas, modelo) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE perguntas = VALUES(perguntas), modelo = VALUES(modelo), gerado_em = NOW()",
          [materialId, JSON.stringify(perguntas), modelo]
        );
        existente = await carregarQuiz(materialId);
      }

      const [[melhor]] = await db.query(
        "SELECT MAX(pontuacao) AS pontuacao, MAX(total) AS total, COUNT(*) AS tentativas FROM quiz_resultados WHERE quiz_id = ? AND usuario_id = ?",
        [existente.id, req.utilizador.id]
      );

      res.json({
        quiz_id: existente.id,
        gerado_em: existente.gerado_em,
        perguntas: quiz.semSolucoes(existente.perguntas),
        melhor: melhor?.tentativas > 0 ? { pontuacao: melhor.pontuacao, total: melhor.total, tentativas: melhor.tentativas } : null,
      });
    } catch (erro) {
      if (erro.status) return res.status(erro.status).json({ erro: erro.message });
      console.error("Erro no quiz:", erro.message);
      res.status(500).json({ erro: "Erro ao preparar o quiz." });
    }
  });

  /**
   * @openapi
   * /api/materiais/{id}/quiz/respostas:
   *   post:
   *     summary: Submete respostas ao quiz e recebe a correcção com explicações. Passar (≥70%) conta para a reputação.
   *     tags: [Quizzes]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [respostas], properties: { respostas: { type: array, items: { type: integer, nullable: true } } } }
   *     responses:
   *       200: { description: Pontuação e correcção }
   */
  app.post("/api/materiais/:id/quiz/respostas", autenticar, limitarAvaliacoes, async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const existente = await carregarQuiz(materialId);
      if (!existente) return res.status(404).json({ erro: "Este material ainda não tem quiz. Abra-o primeiro." });

      const respostas = Array.isArray(req.body?.respostas) ? req.body.respostas.map(r => (Number.isInteger(r) ? r : null)) : null;
      if (!respostas || respostas.length !== existente.perguntas.length) {
        return res.status(400).json({ erro: `Envie ${existente.perguntas.length} respostas (uma por pergunta).` });
      }

      const resultado = quiz.corrigir(existente.perguntas, respostas);
      await db.query(
        "INSERT INTO quiz_resultados (quiz_id, usuario_id, pontuacao, total, respostas) VALUES (?, ?, ?, ?, ?)",
        [existente.id, req.utilizador.id, resultado.pontuacao, resultado.total, JSON.stringify(respostas)]
      );
      const passou = resultado.pontuacao / resultado.total >= 0.7;
      auditar(req.utilizador.id, "responder_quiz", "materiais", materialId, `Quiz: ${resultado.pontuacao}/${resultado.total}`, req.ip);
      if (passou) atualizarReputacao(req.utilizador.id);

      res.json({ ...resultado, passou, percentagem: Math.round((resultado.pontuacao / resultado.total) * 100) });
    } catch (erro) {
      console.error("Erro ao corrigir quiz:", erro.message);
      res.status(500).json({ erro: "Erro ao corrigir o quiz." });
    }
  });

  /**
   * @openapi
   * /api/materiais/{id}/quiz:
   *   delete:
   *     summary: Apaga o quiz guardado para ser gerado de novo (só admin)
   *     tags: [Quizzes]
   *     responses:
   *       200: { description: Apagado }
   */
  app.delete("/api/materiais/:id/quiz", autenticar, async (req, res) => {
    try {
      if (req.utilizador.papel !== "admin") return res.status(403).json({ erro: "Só administradores podem regenerar quizzes." });
      const materialId = parseInt(req.params.id, 10);
      await db.query("DELETE FROM quizzes WHERE material_id = ?", [materialId]);
      auditar(req.utilizador.id, "apagar_quiz", "materiais", materialId, "Apagou o quiz para regeneração", req.ip);
      res.json({ mensagem: "Quiz apagado. Será gerado de novo na próxima abertura." });
    } catch (erro) {
      console.error("Erro ao apagar quiz:", erro.message);
      res.status(500).json({ erro: "Erro ao apagar o quiz." });
    }
  });
};
