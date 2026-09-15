const db = require("../config/db");
const { autenticar } = require("../middleware/auth");
const { paraUrlAbsoluto } = require("../utils/urls");

module.exports = function registarRotasReputacao(app) {
  /**
   * @openapi
   * /api/utilizadores/{id}/reputacao:
   *   get:
   *     summary: Perfil público de reputação de um utilizador (pontos, materiais, emblema)
   *     tags: [Comunidade]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Reputação }
   *       404: { description: Utilizador não encontrado }
   */
  app.get("/api/utilizadores/:id/reputacao", autenticar, async (req, res) => {
    try {
      const usuarioId = parseInt(req.params.id, 10);
      if (!Number.isInteger(usuarioId)) return res.status(400).json({ erro: "ID inválido." });

      // LEFT JOIN a partir de usuarios: quem ainda não tem linha em
      // reputacao_usuarios (nunca submeteu nada) aparece com zeros em vez de 404.
      const [[perfil]] = await db.query(
        `SELECT u.id, u.nome, u.papel, u.curso, u.avatar_url, u.data_criacao,
                COALESCE(r.pontos, 0) AS pontos,
                COALESCE(r.materiais_submetidos, 0) AS materiais_submetidos,
                COALESCE(r.materiais_aprovados, 0) AS materiais_aprovados,
                COALESCE(r.media_avaliacoes, 0) AS media_avaliacoes,
                r.emblema
         FROM usuarios u
         LEFT JOIN reputacao_usuarios r ON r.usuario_id = u.id
         WHERE u.id = ?`,
        [usuarioId]
      );
      if (!perfil) return res.status(404).json({ erro: "Utilizador não encontrado." });

      const [[{ posicao }]] = await db.query(
        "SELECT COUNT(*) + 1 AS posicao FROM reputacao_usuarios WHERE pontos > ?",
        [perfil.pontos]
      );

      res.json({
        reputacao: {
          ...perfil,
          avatar_url: paraUrlAbsoluto(perfil.avatar_url),
          media_avaliacoes: Number(perfil.media_avaliacoes),
          posicao,
        },
      });
    } catch (erro) {
      console.error("Erro ao buscar reputação:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar perfil." });
    }
  });

  /**
   * @openapi
   * /api/leaderboard:
   *   get:
   *     summary: Top 10 utilizadores por pontos de reputação
   *     tags: [Comunidade]
   *     responses:
   *       200: { description: Lista ordenada }
   */
  app.get("/api/leaderboard", autenticar, async (req, res) => {
    try {
      const [leaderboard] = await db.query(
        `SELECT r.usuario_id, u.nome, u.curso, u.avatar_url, r.pontos, r.materiais_aprovados, r.media_avaliacoes, r.emblema
         FROM reputacao_usuarios r
         JOIN usuarios u ON r.usuario_id = u.id
         WHERE r.pontos > 0 AND u.email <> 'conta-eliminada@sistema.local'
         ORDER BY r.pontos DESC, r.materiais_aprovados DESC
         LIMIT 10`
      );
      res.json(leaderboard.map(l => ({
        ...l,
        avatar_url: paraUrlAbsoluto(l.avatar_url),
        media_avaliacoes: Number(l.media_avaliacoes),
      })));
    } catch (erro) {
      console.error("Erro ao buscar leaderboard:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar leaderboard." });
    }
  });
};
