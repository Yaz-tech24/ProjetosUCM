const db = require("../config/db");
const { autenticar, apenasAdmin } = require("../middleware/auth");

module.exports = function registarRotasReputacao(app) {
  // GET: Perfil de reputação de um utilizador
  app.get("/api/utilizadores/:id/reputacao", async (req, res) => {
    try {
      const usuarioId = parseInt(req.params.id, 10);

      const [[reputacao]] = await db.query(
        `SELECT r.pontos, r.materiais_submetidos, r.materiais_aprovados, r.media_avaliacoes, r.emblema,
                u.nome, u.email, u.papel, u.data_criacao
         FROM reputacao_usuarios r
         LEFT JOIN usuarios u ON r.usuario_id = u.id
         WHERE r.usuario_id = ?`,
        [usuarioId]
      );

      if (!reputacao) {
        return res.status(404).json({ erro: "Utilizador não encontrado." });
      }

      // Estatísticas adicionais
      const [[stats]] = await db.query(
        `SELECT
           COUNT(DISTINCT m.id) as total_materiais,
           SUM(CASE WHEN m.status = 'aprovado' THEN 1 ELSE 0 END) as aprovados,
           COALESCE(AVG(a.nota), 0) as media_avaliacoes_calc
         FROM materiais m
         LEFT JOIN avaliacoes a ON m.id = a.material_id
         WHERE m.autor_id = ?`,
        [usuarioId]
      );

      res.json({
        reputacao,
        estatisticas: stats,
      });
    } catch (erro) {
      console.error("Erro ao buscar reputação:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar perfil." });
    }
  });

  // GET: Leaderboard top 10 utilizadores
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const [leaderboard] = await db.query(
        `SELECT r.usuario_id, u.nome, r.pontos, r.materiais_aprovados, r.media_avaliacoes, r.emblema
         FROM reputacao_usuarios r
         JOIN usuarios u ON r.usuario_id = u.id
         WHERE r.pontos > 0
         ORDER BY r.pontos DESC
         LIMIT 10`
      );

      res.json(leaderboard);
    } catch (erro) {
      console.error("Erro ao buscar leaderboard:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar leaderboard." });
    }
  });

  // Função auxiliar para atualizar reputação (chamada por webhook/scheduler)
  async function atualizarReputacao(usuarioId) {
    try {
      // Calcular estatísticas
      const [[stats]] = await db.query(
        `SELECT
           COUNT(DISTINCT m.id) as total_submetidos,
           SUM(CASE WHEN m.status = 'aprovado' THEN 1 ELSE 0 END) as total_aprovados,
           COALESCE(AVG(a.nota), 0) as media_nota
         FROM materiais m
         LEFT JOIN avaliacoes a ON m.id = a.material_id
         WHERE m.autor_id = ?`,
        [usuarioId]
      );

      // Calcular pontos: 10 por material aprovado + bónus por média de avaliação
      const pontos = (stats.total_aprovados || 0) * 10 + Math.floor((stats.media_nota || 0) * 5);

      // Determinar emblema baseado em métricas
      let emblema = null;
      if ((stats.total_aprovados || 0) >= 10) emblema = "Produtor Verificado";
      if ((stats.media_nota || 0) >= 4.5) emblema = "Excelente Qualidade";
      if ((stats.total_aprovados || 0) >= 5 && (stats.media_nota || 0) >= 4.0) emblema = "Confiável";

      // Atualizar ou inserir registro
      await db.query(
        `INSERT INTO reputacao_usuarios (usuario_id, pontos, materiais_submetidos, materiais_aprovados, media_avaliacoes, emblema)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         pontos = ?, materiais_submetidos = ?, materiais_aprovados = ?, media_avaliacoes = ?, emblema = ?`,
        [
          usuarioId, pontos, stats.total_submetidos, stats.total_aprovados, stats.media_nota || 0, emblema,
          pontos, stats.total_submetidos, stats.total_aprovados, stats.media_nota || 0, emblema,
        ]
      );
    } catch (erro) {
      console.error("[Reputação] Erro ao atualizar:", erro.message);
    }
  }

  module.exports.atualizarReputacao = atualizarReputacao;
};
