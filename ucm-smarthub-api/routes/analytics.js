const db = require("../config/db");
const { autenticar, apenasAdmin } = require("../middleware/auth");

module.exports = function registarRotasAnalytics(app) {
  // GET: Dashboard geral de analytics
  app.get("/api/admin/analytics/dashboard", autenticar, apenasAdmin, async (req, res) => {
    try {
      // Utilizadores
      const [[statsUsuarios]] = await db.query(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN papel = 'estudante' THEN 1 ELSE 0 END) as estudantes,
           SUM(CASE WHEN papel = 'professor' THEN 1 ELSE 0 END) as professores,
           SUM(CASE WHEN papel = 'admin' THEN 1 ELSE 0 END) as admins,
           SUM(CASE WHEN email_verificado = 1 THEN 1 ELSE 0 END) as emails_verificados
         FROM usuarios`
      );

      // Materiais
      const [[statsMateriais]] = await db.query(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'aprovado' THEN 1 ELSE 0 END) as aprovados,
           SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
           SUM(CASE WHEN status = 'rejeitado' THEN 1 ELSE 0 END) as rejeitados,
           SUM(CASE WHEN tipo = 'PDF' THEN 1 ELSE 0 END) as pdfs,
           SUM(CASE WHEN tipo = 'Vídeo' THEN 1 ELSE 0 END) as videos,
           COALESCE(SUM(visualizacoes), 0) as aberturas,
           COALESCE(SUM(downloads), 0) as downloads
         FROM materiais`
      );

      // Atividade (últimos 7 dias)
      const [[statsAtividade]] = await db.query(
        `SELECT
           SUM(CASE WHEN DATE(data_upload) = CURDATE() THEN 1 ELSE 0 END) as hoje,
           SUM(CASE WHEN data_upload >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as ultima_semana
         FROM materiais
         WHERE status = 'aprovado'`
      );

      // Chat
      const [[statsChat]] = await db.query(
        `SELECT
           COUNT(*) as total_mensagens,
           COUNT(DISTINCT user_id) as usuarios_ativos,
           COUNT(DISTINCT curso) as disciplinas
         FROM mensagens_estudantes
         WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
      );

      // Avaliações
      const [[statsAvaliacoes]] = await db.query(
        `SELECT
           COUNT(*) as total,
           AVG(nota) as media_geral,
           COUNT(DISTINCT material_id) as materiais_avaliados,
           COUNT(DISTINCT usuario_id) as usuarios_que_avaliaram
         FROM avaliacoes`
      );

      res.json({
        usuarios: statsUsuarios,
        materiais: statsMateriais,
        atividade: statsAtividade,
        chat: statsChat,
        avaliacoes: statsAvaliacoes,
      });
    } catch (erro) {
      console.error("Erro ao buscar analytics:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar dados." });
    }
  });

  // GET: Materiais por disciplina
  app.get("/api/admin/analytics/disciplinas", autenticar, apenasAdmin, async (req, res) => {
    try {
      const [disciplinas] = await db.query(
        `SELECT
           cadeira,
           COUNT(*) as total,
           SUM(CASE WHEN status = 'aprovado' THEN 1 ELSE 0 END) as aprovados,
           AVG(CASE WHEN status = 'aprovado' THEN (SELECT AVG(nota) FROM avaliacoes a WHERE a.material_id = m.id) END) as media_avaliacoes
         FROM materiais m
         GROUP BY cadeira
         ORDER BY total DESC`
      );

      res.json(disciplinas);
    } catch (erro) {
      console.error("Erro ao buscar analytics por disciplina:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar dados." });
    }
  });

  // GET: Atividade diária (últimos 30 dias)
  app.get("/api/admin/analytics/atividade", autenticar, apenasAdmin, async (req, res) => {
    try {
      const [atividade] = await db.query(
        `SELECT
           DATE(data_upload) as data,
           COUNT(*) as uploads,
           COUNT(DISTINCT autor_id) as autores
         FROM materiais
         WHERE data_upload >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY DATE(data_upload)
         ORDER BY data DESC`
      );

      res.json(atividade);
    } catch (erro) {
      console.error("Erro ao buscar atividade:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar dados." });
    }
  });

  // GET: Top 10 materiais mais avaliados
  app.get("/api/admin/analytics/materiais-populares", autenticar, apenasAdmin, async (req, res) => {
    try {
      const [materiais] = await db.query(
        `SELECT
           m.id, m.titulo, m.cadeira, m.tipo, m.data_upload, m.visualizacoes, m.downloads,
           (SELECT COUNT(*) FROM avaliacoes a WHERE a.material_id = m.id) AS total_avaliacoes,
           (SELECT AVG(a.nota) FROM avaliacoes a WHERE a.material_id = m.id) AS media_nota,
           (SELECT COUNT(*) FROM comentarios_materiais c WHERE c.material_id = m.id) AS total_comentarios
         FROM materiais m
         WHERE m.status = 'aprovado'
         ORDER BY m.visualizacoes DESC, total_avaliacoes DESC, m.data_upload DESC
         LIMIT 10`
      );

      res.json(materiais);
    } catch (erro) {
      console.error("Erro ao buscar materiais populares:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar dados." });
    }
  });

  // GET: Log de auditoria
  app.get("/api/admin/auditoria", autenticar, apenasAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
      const offset = (page - 1) * limit;

      const [auditoria] = await db.query(
        `SELECT a.id, a.acao, a.recurso, a.descricao, a.data_hora, u.nome as usuario, a.ip_origem
         FROM auditoria a
         LEFT JOIN usuarios u ON a.usuario_id = u.id
         ORDER BY a.data_hora DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      const [[{ total }]] = await db.query("SELECT COUNT(*) as total FROM auditoria");

      res.json({
        auditoria,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (erro) {
      console.error("Erro ao buscar auditoria:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar auditoria." });
    }
  });
};
