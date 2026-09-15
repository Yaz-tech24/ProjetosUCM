const db = require("../config/db");
const { autenticar } = require("../middleware/auth");

module.exports = function registarRotasNotificacoes(app) {
  /**
   * @openapi
   * /api/notificacoes:
   *   get:
   *     summary: Notificações do utilizador (mais recentes primeiro) e total por ler
   *     tags: [Notificações]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 20 }
   *     responses:
   *       200: { description: Lista paginada + nao_lidas }
   */
  app.get("/api/notificacoes", autenticar, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
      const offset = (page - 1) * limit;
      const [notificacoes] = await db.query(
        `SELECT id, tipo, titulo, mensagem, link, lida, criado_em
         FROM notificacoes WHERE usuario_id = ?
         ORDER BY criado_em DESC, id DESC
         LIMIT ? OFFSET ?`,
        [req.utilizador.id, limit, offset]
      );
      const [[{ total }]] = await db.query("SELECT COUNT(*) AS total FROM notificacoes WHERE usuario_id = ?", [req.utilizador.id]);
      const [[{ nao_lidas }]] = await db.query("SELECT COUNT(*) AS nao_lidas FROM notificacoes WHERE usuario_id = ? AND lida = 0", [req.utilizador.id]);
      res.json({ notificacoes, nao_lidas: Number(nao_lidas) || 0, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (erro) {
      console.error("Erro ao listar notificações:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar notificações." });
    }
  });

  /**
   * @openapi
   * /api/notificacoes/lidas:
   *   put:
   *     summary: Marca todas as notificações como lidas
   *     tags: [Notificações]
   *     responses:
   *       200: { description: Quantas foram marcadas }
   */
  app.put("/api/notificacoes/lidas", autenticar, async (req, res) => {
    try {
      const [r] = await db.query("UPDATE notificacoes SET lida = 1 WHERE usuario_id = ? AND lida = 0", [req.utilizador.id]);
      res.json({ marcadas: r.affectedRows });
    } catch (erro) {
      console.error("Erro ao marcar notificações:", erro.message);
      res.status(500).json({ erro: "Erro ao actualizar notificações." });
    }
  });

  /**
   * @openapi
   * /api/notificacoes/{id}/lida:
   *   put:
   *     summary: Marca uma notificação como lida
   *     tags: [Notificações]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: OK }
   */
  app.put("/api/notificacoes/:id/lida", autenticar, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      await db.query("UPDATE notificacoes SET lida = 1 WHERE id = ? AND usuario_id = ?", [id, req.utilizador.id]);
      res.json({ mensagem: "Lida." });
    } catch (erro) {
      console.error("Erro ao marcar notificação:", erro.message);
      res.status(500).json({ erro: "Erro ao actualizar notificação." });
    }
  });

  /**
   * @openapi
   * /api/notificacoes/{id}:
   *   delete:
   *     summary: Apaga uma notificação
   *     tags: [Notificações]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Apagada }
   */
  app.delete("/api/notificacoes/:id", autenticar, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      await db.query("DELETE FROM notificacoes WHERE id = ? AND usuario_id = ?", [id, req.utilizador.id]);
      res.json({ mensagem: "Apagada." });
    } catch (erro) {
      console.error("Erro ao apagar notificação:", erro.message);
      res.status(500).json({ erro: "Erro ao apagar notificação." });
    }
  });
};
