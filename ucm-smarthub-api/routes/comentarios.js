const db = require("../config/db");
const { autenticar } = require("../middleware/auth");
const { auditar } = require("../middleware/auditoria");
const { limitarComentarios } = require("../middleware/rateLimiters");
const { criarNotificacao } = require("../services/notificacoes");
const { z } = require("zod");
const validar = require("../middleware/validar");

const schemaComentario = z.object({
  conteudo: z.string().trim().min(1, "Comentário não pode ser vazio").max(1000, "Comentário máximo é 1000 caracteres"),
});

module.exports = function registarRotasComentarios(app) {
  // POST: Submeter comentário
  app.post("/api/materiais/:id/comentarios", autenticar, limitarComentarios, validar(schemaComentario), async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const { conteudo } = req.body;
      const usuarioId = req.utilizador.id;

      // Verificar que material existe
      const [[material]] = await db.query(
        "SELECT id, titulo, autor_id FROM materiais WHERE id = ? AND status = 'aprovado'",
        [materialId]
      );
      if (!material) {
        return res.status(404).json({ erro: "Material não encontrado." });
      }

      const [resultado] = await db.query(
        "INSERT INTO comentarios_materiais (material_id, usuario_id, conteudo) VALUES (?, ?, ?)",
        [materialId, usuarioId, conteudo]
      );

      auditar(usuarioId, "comentar_material", "materiais", materialId, "Adicionou um comentário", req.ip);
      if (material.autor_id !== usuarioId) {
        criarNotificacao(material.autor_id, { tipo: "comentario", titulo: `${req.utilizador.nome} comentou o seu material`, mensagem: `${material.titulo}: "${conteudo.slice(0, 120)}"`, link: `/video/${materialId}` });
      }

      res.status(201).json({
        id: resultado.insertId,
        material_id: materialId,
        usuario_id: usuarioId,
        conteudo,
        data_criacao: new Date().toISOString(),
      });
    } catch (erro) {
      console.error("Erro ao submeter comentário:", erro.message);
      res.status(500).json({ erro: "Erro ao registar comentário." });
    }
  });

  // GET: Listar comentários de um material
  app.get("/api/materiais/:id/comentarios", async (req, res) => {
    try {
      const materialId = parseInt(req.params.id, 10);
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
      const offset = (page - 1) * limit;

      const [comentarios] = await db.query(
        `SELECT c.id, c.conteudo, c.data_criacao, u.id AS usuario_id, u.nome AS usuario, u.avatar_url
         FROM comentarios_materiais c
         JOIN usuarios u ON c.usuario_id = u.id
         WHERE c.material_id = ?
         ORDER BY c.data_criacao DESC
         LIMIT ? OFFSET ?`,
        [materialId, limit, offset]
      );

      const [[{ total }]] = await db.query(
        "SELECT COUNT(*) as total FROM comentarios_materiais WHERE material_id = ?",
        [materialId]
      );

      res.json({
        comentarios,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (erro) {
      console.error("Erro ao listar comentários:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar comentários." });
    }
  });

  // DELETE: Remover comentário (próprio ou admin)
  app.delete("/api/comentarios/:id", autenticar, async (req, res) => {
    try {
      const comentarioId = parseInt(req.params.id, 10);
      const usuarioId = req.utilizador.id;
      const ehAdmin = req.utilizador.papel === "admin";

      const [[comentario]] = await db.query(
        "SELECT id, usuario_id, material_id FROM comentarios_materiais WHERE id = ?",
        [comentarioId]
      );

      if (!comentario) {
        return res.status(404).json({ erro: "Comentário não encontrado." });
      }

      if (comentario.usuario_id !== usuarioId && !ehAdmin) {
        return res.status(403).json({ erro: "Só pode remover os seus comentários." });
      }

      await db.query("DELETE FROM comentarios_materiais WHERE id = ?", [comentarioId]);

      auditar(usuarioId, "remover_comentario", "materiais", comentario.material_id, "Removeu um comentário", req.ip);

      res.json({ mensagem: "Comentário removido com sucesso." });
    } catch (erro) {
      console.error("Erro ao remover comentário:", erro.message);
      res.status(500).json({ erro: "Erro ao remover comentário." });
    }
  });
};
