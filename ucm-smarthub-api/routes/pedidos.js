const { z } = require("zod");

const db = require("../config/db");
const validar = require("../middleware/validar");
const { autenticar } = require("../middleware/auth");
const { limitarComentarios, limitarAvaliacoes } = require("../middleware/rateLimiters");
const { auditar } = require("../middleware/auditoria");
const { criarNotificacao } = require("../services/notificacoes");
const { atualizarReputacao } = require("../services/reputacao");

// Pedidos de materiais ("Alguém tem os slides de…?"): qualquer estudante
// pede; quem tiver o material liga-o ao pedido (ou o próprio autor do pedido
// fecha-o). Quando um material é aprovado numa disciplina com pedidos
// abertos, quem pediu é avisado (ver services/notificacoes.js).
const schemaPedido = z.object({
  disciplina: z.string().trim().min(1, "Escolha a disciplina.").max(150),
  titulo: z.string().trim().min(5, "Descreva o que procura (mínimo 5 caracteres).").max(200, "Máximo 200 caracteres."),
  descricao: z.string().trim().max(1000, "Máximo 1000 caracteres.").optional().nullable(),
});

const schemaAtender = z.object({
  material_id: z.coerce.number().int().positive(),
});

const SELECT_PEDIDO = `p.id, p.disciplina, p.titulo, p.descricao, p.estado, p.material_id, p.atendido_por, p.atendido_em, p.criado_em,
   p.usuario_id, u.nome AS autor, u.avatar_url AS autor_avatar,
   m.titulo AS material_titulo, m.tipo AS material_tipo, ua.nome AS atendido_por_nome,
   (SELECT COUNT(*) FROM pedidos_apoios a WHERE a.pedido_id = p.id) AS apoios`;
const FROM_PEDIDO = `FROM pedidos_materiais p
   JOIN usuarios u ON u.id = p.usuario_id
   LEFT JOIN materiais m ON m.id = p.material_id
   LEFT JOIN usuarios ua ON ua.id = p.atendido_por`;

module.exports = function registarRotasPedidos(app) {
  /**
   * @openapi
   * /api/pedidos:
   *   get:
   *     summary: Pedidos de materiais (filtráveis por disciplina e estado)
   *     tags: [Pedidos]
   *     parameters:
   *       - in: query
   *         name: disciplina
   *         schema: { type: string }
   *       - in: query
   *         name: estado
   *         schema: { type: string, enum: [aberto, atendido, fechado, todos], default: aberto }
   *       - in: query
   *         name: meus
   *         schema: { type: string, enum: ["1"] }
   *     responses:
   *       200: { description: Lista paginada, com `apoiei` por pedido }
   *   post:
   *     summary: Pede um material numa disciplina
   *     tags: [Pedidos]
   *     responses:
   *       201: { description: Criado }
   */
  app.get("/api/pedidos", autenticar, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 15));
      const offset = (page - 1) * limit;
      const params = [];
      let where = "WHERE 1=1";
      const estado = ["aberto", "atendido", "fechado", "todos"].includes(req.query.estado) ? req.query.estado : "aberto";
      if (estado !== "todos") { where += " AND p.estado = ?"; params.push(estado); }
      if (req.query.disciplina) { where += " AND p.disciplina = ?"; params.push(String(req.query.disciplina)); }
      if (req.query.meus === "1") { where += " AND p.usuario_id = ?"; params.push(req.utilizador.id); }
      if (req.query.busca) { where += " AND (p.titulo LIKE ? OR p.descricao LIKE ?)"; const b = `%${String(req.query.busca).slice(0, 100)}%`; params.push(b, b); }

      const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM pedidos_materiais p ${where}`, params);
      const [pedidos] = await db.query(
        `SELECT ${SELECT_PEDIDO}, EXISTS(SELECT 1 FROM pedidos_apoios a WHERE a.pedido_id = p.id AND a.usuario_id = ?) AS apoiei
         ${FROM_PEDIDO} ${where}
         ORDER BY (p.estado = 'aberto') DESC, apoios DESC, p.criado_em DESC
         LIMIT ? OFFSET ?`,
        [req.utilizador.id, ...params, limit, offset]
      );
      res.json({
        pedidos: pedidos.map(p => ({ ...p, apoios: Number(p.apoios), apoiei: Boolean(Number(p.apoiei)) })),
        pagination: { page, limit, total: Number(total), totalPages: Math.max(1, Math.ceil(Number(total) / limit)) },
      });
    } catch (erro) {
      console.error("Erro ao listar pedidos:", erro.message);
      res.status(500).json({ erro: "Erro ao listar pedidos." });
    }
  });

  app.post("/api/pedidos", autenticar, limitarComentarios, validar(schemaPedido), async (req, res) => {
    try {
      const { disciplina, titulo, descricao } = req.body;
      const [[{ abertos }]] = await db.query("SELECT COUNT(*) AS abertos FROM pedidos_materiais WHERE usuario_id = ? AND estado = 'aberto'", [req.utilizador.id]);
      if (Number(abertos) >= 10) return res.status(400).json({ erro: "Tem 10 pedidos abertos. Feche alguns antes de criar mais." });
      const [r] = await db.query(
        "INSERT INTO pedidos_materiais (usuario_id, disciplina, titulo, descricao) VALUES (?, ?, ?, ?)",
        [req.utilizador.id, disciplina, titulo, descricao || null]
      );
      auditar(req.utilizador.id, "criar_pedido", "pedido", r.insertId, titulo, req.ip);

      // Quem subscreve a disciplina pode ter o material — é a quem mais vale
      // a pena perguntar.
      const [subscritores] = await db.query(
        "SELECT usuario_id FROM subscricoes_disciplinas WHERE disciplina = ? AND usuario_id <> ? LIMIT 200",
        [disciplina, req.utilizador.id]
      );
      for (const s of subscritores) {
        await criarNotificacao(s.usuario_id, { tipo: "pedido", titulo: `Pedido de material em ${disciplina}`, mensagem: titulo, link: `/pedidos?id=${r.insertId}` });
      }
      const [[criado]] = await db.query(`SELECT ${SELECT_PEDIDO} ${FROM_PEDIDO} WHERE p.id = ?`, [r.insertId]);
      res.status(201).json({ ...criado, apoios: 0, apoiei: false });
    } catch (erro) {
      console.error("Erro ao criar pedido:", erro.message);
      res.status(500).json({ erro: "Erro ao criar o pedido." });
    }
  });

  /**
   * @openapi
   * /api/pedidos/{id}/apoiar:
   *   put:
   *     summary: Alterna o apoio do utilizador a um pedido ("também preciso")
   *     tags: [Pedidos]
   *     responses:
   *       200: { description: "{ apoiei, apoios }" }
   * /api/pedidos/{id}/atender:
   *   put:
   *     summary: Liga um material aprovado ao pedido e marca-o como atendido (quem pediu é notificado)
   *     tags: [Pedidos]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [material_id], properties: { material_id: { type: integer } } }
   *     responses:
   *       200: { description: Pedido atendido }
   * /api/pedidos/{id}/fechar:
   *   put:
   *     summary: Fecha um pedido sem material (autor do pedido ou admin)
   *     tags: [Pedidos]
   *     responses:
   *       200: { description: Fechado }
   * /api/pedidos/{id}:
   *   delete:
   *     summary: Apaga um pedido (autor ou admin)
   *     tags: [Pedidos]
   *     responses:
   *       200: { description: Apagado }
   */
  app.put("/api/pedidos/:id/apoiar", autenticar, limitarAvaliacoes, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [[pedido]] = await db.query("SELECT id, usuario_id, estado FROM pedidos_materiais WHERE id = ?", [id]);
      if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
      if (pedido.usuario_id === req.utilizador.id) return res.status(400).json({ erro: "É o seu próprio pedido." });
      const [r] = await db.query("DELETE FROM pedidos_apoios WHERE pedido_id = ? AND usuario_id = ?", [id, req.utilizador.id]);
      let apoiei = false;
      if (!r.affectedRows) {
        await db.query("INSERT IGNORE INTO pedidos_apoios (pedido_id, usuario_id) VALUES (?, ?)", [id, req.utilizador.id]);
        apoiei = true;
      }
      const [[{ apoios }]] = await db.query("SELECT COUNT(*) AS apoios FROM pedidos_apoios WHERE pedido_id = ?", [id]);
      res.json({ apoiei, apoios: Number(apoios) });
    } catch (erro) {
      console.error("Erro ao apoiar pedido:", erro.message);
      res.status(500).json({ erro: "Erro ao registar o apoio." });
    }
  });

  app.put("/api/pedidos/:id/atender", autenticar, limitarAvaliacoes, validar(schemaAtender), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [[pedido]] = await db.query("SELECT id, usuario_id, titulo, estado FROM pedidos_materiais WHERE id = ?", [id]);
      if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
      if (pedido.estado !== "aberto") return res.status(400).json({ erro: "Este pedido já não está aberto." });
      const [[material]] = await db.query("SELECT id, titulo FROM materiais WHERE id = ? AND status = 'aprovado'", [req.body.material_id]);
      if (!material) return res.status(404).json({ erro: "Material não encontrado ou ainda não aprovado." });

      await db.query(
        "UPDATE pedidos_materiais SET estado = 'atendido', material_id = ?, atendido_por = ?, atendido_em = NOW() WHERE id = ?",
        [material.id, req.utilizador.id, id]
      );
      auditar(req.utilizador.id, "atender_pedido", "pedido", id, `Material #${material.id}`, req.ip);

      // Avisa quem pediu e quem apoiou.
      const [apoiantes] = await db.query("SELECT usuario_id FROM pedidos_apoios WHERE pedido_id = ?", [id]);
      const destinatarios = new Set([pedido.usuario_id, ...apoiantes.map(a => a.usuario_id)]);
      destinatarios.delete(req.utilizador.id);
      for (const uid of destinatarios) {
        await criarNotificacao(uid, { tipo: "pedido_atendido", titulo: "O material que pediu está disponível", mensagem: `${pedido.titulo} → ${material.titulo}`, link: `/video/${material.id}` });
      }
      if (pedido.usuario_id !== req.utilizador.id) {
        await atualizarReputacao(req.utilizador.id); // também verifica conquistas
      }
      const [[actualizado]] = await db.query(`SELECT ${SELECT_PEDIDO} ${FROM_PEDIDO} WHERE p.id = ?`, [id]);
      res.json({ ...actualizado, apoios: Number(actualizado.apoios) });
    } catch (erro) {
      console.error("Erro ao atender pedido:", erro.message);
      res.status(500).json({ erro: "Erro ao atender o pedido." });
    }
  });

  app.put("/api/pedidos/:id/fechar", autenticar, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [[pedido]] = await db.query("SELECT id, usuario_id, estado FROM pedidos_materiais WHERE id = ?", [id]);
      if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
      if (req.utilizador.papel !== "admin" && pedido.usuario_id !== req.utilizador.id) return res.status(403).json({ erro: "Só quem pediu ou um administrador pode fechar." });
      if (pedido.estado !== "aberto") return res.status(400).json({ erro: "Este pedido já não está aberto." });
      await db.query("UPDATE pedidos_materiais SET estado = 'fechado' WHERE id = ?", [id]);
      auditar(req.utilizador.id, "fechar_pedido", "pedido", id, null, req.ip);
      res.json({ mensagem: "Pedido fechado." });
    } catch (erro) {
      console.error("Erro ao fechar pedido:", erro.message);
      res.status(500).json({ erro: "Erro ao fechar o pedido." });
    }
  });

  app.delete("/api/pedidos/:id", autenticar, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [[pedido]] = await db.query("SELECT id, usuario_id FROM pedidos_materiais WHERE id = ?", [id]);
      if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
      if (req.utilizador.papel !== "admin" && pedido.usuario_id !== req.utilizador.id) return res.status(403).json({ erro: "Só quem pediu ou um administrador pode apagar." });
      await db.query("DELETE FROM pedidos_materiais WHERE id = ?", [id]);
      auditar(req.utilizador.id, "apagar_pedido", "pedido", id, null, req.ip);
      res.json({ mensagem: "Pedido apagado." });
    } catch (erro) {
      console.error("Erro ao apagar pedido:", erro.message);
      res.status(500).json({ erro: "Erro ao apagar o pedido." });
    }
  });
};
