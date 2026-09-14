const db = require("../config/db");
const { autenticar } = require("../middleware/auth");
const { auditar } = require("../middleware/auditoria");

module.exports = function registarRotasSubscricoes(app) {
  // POST: Subscrever a uma disciplina
  app.post("/api/subscricoes/disciplinas/:disciplina", autenticar, async (req, res) => {
    try {
      const disciplina = req.params.disciplina.trim();
      const usuarioId = req.utilizador.id;

      if (!disciplina || disciplina.length === 0) {
        return res.status(400).json({ erro: "Disciplina inválida." });
      }

      // Verificar que disciplina existe
      const [[cursoExists]] = await db.query(
        "SELECT id FROM cursos WHERE nome = ?",
        [disciplina]
      );
      if (!cursoExists) {
        return res.status(400).json({ erro: "Disciplina não existe." });
      }

      try {
        await db.query(
          "INSERT INTO subscricoes_disciplinas (usuario_id, disciplina) VALUES (?, ?)",
          [usuarioId, disciplina]
        );
      } catch (erro) {
        if (erro.code === "ER_DUP_ENTRY") {
          return res.status(400).json({ erro: "Já está subscrito a esta disciplina." });
        }
        throw erro;
      }

      auditar(usuarioId, "subscrever_disciplina", "disciplinas", null, `Subscrito a ${disciplina}`, req.ip);

      res.status(201).json({ mensagem: `Subscrito a "${disciplina}" com sucesso. Receberá notificações de novos materiais.` });
    } catch (erro) {
      console.error("Erro ao subscrever disciplina:", erro.message);
      res.status(500).json({ erro: "Erro ao subscrever disciplina." });
    }
  });

  // DELETE: Desinscrever de uma disciplina
  app.delete("/api/subscricoes/disciplinas/:disciplina", autenticar, async (req, res) => {
    try {
      const disciplina = req.params.disciplina.trim();
      const usuarioId = req.utilizador.id;

      const [resultado] = await db.query(
        "DELETE FROM subscricoes_disciplinas WHERE usuario_id = ? AND disciplina = ?",
        [usuarioId, disciplina]
      );

      if (resultado.affectedRows === 0) {
        return res.status(404).json({ erro: "Não estava subscrito a esta disciplina." });
      }

      auditar(usuarioId, "desinscrever_disciplina", "disciplinas", null, `Desinscrição de ${disciplina}`, req.ip);

      res.json({ mensagem: `Desinscrição de "${disciplina}" com sucesso.` });
    } catch (erro) {
      console.error("Erro ao desinscrever disciplina:", erro.message);
      res.status(500).json({ erro: "Erro ao desinscrever disciplina." });
    }
  });

  // GET: Listar disciplinas que o utilizador está subscrito
  app.get("/api/subscricoes/minhas-disciplinas", autenticar, async (req, res) => {
    try {
      const usuarioId = req.utilizador.id;

      const [subscricoes] = await db.query(
        `SELECT disciplina, data_subscrition FROM subscricoes_disciplinas
         WHERE usuario_id = ?
         ORDER BY data_subscrition DESC`,
        [usuarioId]
      );

      res.json(subscricoes);
    } catch (erro) {
      console.error("Erro ao listar subscrições:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar subscrições." });
    }
  });

  // GET: Listar utilizadores subscritos a uma disciplina (admin)
  app.get("/api/admin/subscricoes/:disciplina", autenticar, async (req, res) => {
    try {
      if (req.utilizador.papel !== "admin") {
        return res.status(403).json({ erro: "Acesso restrito a administradores." });
      }

      const disciplina = req.params.disciplina.trim();
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
      const offset = (page - 1) * limit;

      const [subscricoes] = await db.query(
        `SELECT s.id, s.usuario_id, s.data_subscrition, u.nome, u.email
         FROM subscricoes_disciplinas s
         JOIN usuarios u ON s.usuario_id = u.id
         WHERE s.disciplina = ?
         ORDER BY s.data_subscrition DESC
         LIMIT ? OFFSET ?`,
        [disciplina, limit, offset]
      );

      const [[{ total }]] = await db.query(
        "SELECT COUNT(*) as total FROM subscricoes_disciplinas WHERE disciplina = ?",
        [disciplina]
      );

      res.json({
        subscricoes,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (erro) {
      console.error("Erro ao listar subscrições:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar subscrições." });
    }
  });
};
