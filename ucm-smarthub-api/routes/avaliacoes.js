const db = require("../config/db");
const { autenticar } = require("../middleware/auth");
const { auditar } = require("../middleware/auditoria");
const { limitarAvaliacoes } = require("../middleware/rateLimiters");
const { atualizarReputacaoDoAutor } = require("../services/reputacao");
const { z } = require("zod");
const validar = require("../middleware/validar");

const schemaAvaliacao = z.object({
  nota: z.coerce.number().int().min(1, "Nota mínima é 1").max(5, "Nota máxima é 5"),
  comentario: z.string().trim().max(500, "Comentário máximo é 500 caracteres").optional().catch(""),
});

module.exports = function registarRotasAvaliacoes(app) {
  // POST: Submeter ou atualizar avaliação
  app.post("/api/materiais/:id/avaliacoes", autenticar, limitarAvaliacoes, validar(schemaAvaliacao), async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const { nota, comentario } = req.body;
      const usuarioId = req.utilizador.id;

      // Verificar que material existe
      const [[material]] = await db.query(
        "SELECT id FROM materiais WHERE id = ? AND status = 'aprovado'",
        [materialId]
      );
      if (!material) {
        return res.status(404).json({ erro: "Material não encontrado." });
      }

      // Inserir ou atualizar avaliação
      await db.query(
        `INSERT INTO avaliacoes (material_id, usuario_id, nota, comentario)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE nota = ?, comentario = ?`,
        [materialId, usuarioId, nota, comentario || null, nota, comentario || null]
      );

      auditar(usuarioId, "avaliar_material", "materiais", materialId, `Avaliação ${nota} estrelas`, req.ip);
      atualizarReputacaoDoAutor(materialId);

      res.status(201).json({ mensagem: "Avaliação registada com sucesso." });
    } catch (erro) {
      console.error("Erro ao submeter avaliação:", erro.message);
      res.status(500).json({ erro: "Erro ao registar avaliação." });
    }
  });

  // GET: Listar avaliações de um material
  app.get("/api/materiais/:id/avaliacoes", async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
      const offset = (page - 1) * limit;

      const [avaliacoes] = await db.query(
        `SELECT a.id, a.nota, a.comentario, a.data_criacao, u.nome AS usuario, u.avatar_url
         FROM avaliacoes a
         JOIN usuarios u ON a.usuario_id = u.id
         WHERE a.material_id = ?
         ORDER BY a.data_criacao DESC
         LIMIT ? OFFSET ?`,
        [materialId, limit, offset]
      );

      const [[{ total }]] = await db.query(
        "SELECT COUNT(*) as total FROM avaliacoes WHERE material_id = ?",
        [materialId]
      );

      const [[{ media }]] = await db.query(
        "SELECT AVG(nota) as media FROM avaliacoes WHERE material_id = ?",
        [materialId]
      );

      res.json({
        avaliacoes,
        estatisticas: {
          media: media ? parseFloat(media).toFixed(1) : 0,
          total,
          totalPages: Math.ceil(total / limit),
        },
        pagination: { page, limit, total },
      });
    } catch (erro) {
      console.error("Erro ao listar avaliações:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar avaliações." });
    }
  });

  // DELETE: Remover avaliação
  app.delete("/api/materiais/:id/avaliacoes", autenticar, async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const usuarioId = req.utilizador.id;

      const [resultado] = await db.query(
        "DELETE FROM avaliacoes WHERE material_id = ? AND usuario_id = ?",
        [materialId, usuarioId]
      );

      if (resultado.affectedRows === 0) {
        return res.status(404).json({ erro: "Avaliação não encontrada." });
      }

      auditar(usuarioId, "remover_avaliacao", "materiais", materialId, "Removeu a sua avaliação", req.ip);
      atualizarReputacaoDoAutor(materialId);

      res.json({ mensagem: "Avaliação removida com sucesso." });
    } catch (erro) {
      console.error("Erro ao remover avaliação:", erro.message);
      res.status(500).json({ erro: "Erro ao remover avaliação." });
    }
  });

  // GET: Avaliação do utilizador autenticado para um material
  app.get("/api/materiais/:id/minha-avaliacao", autenticar, async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const usuarioId = req.utilizador.id;

      const [[avaliacao]] = await db.query(
        "SELECT id, nota, comentario, data_criacao FROM avaliacoes WHERE material_id = ? AND usuario_id = ?",
        [materialId, usuarioId]
      );

      if (!avaliacao) {
        return res.status(404).json({ erro: "Não tem avaliação para este material." });
      }

      res.json(avaliacao);
    } catch (erro) {
      console.error("Erro ao buscar avaliação:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar avaliação." });
    }
  });
};
