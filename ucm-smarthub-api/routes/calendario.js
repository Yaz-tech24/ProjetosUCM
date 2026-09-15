const { z } = require("zod");

const db = require("../config/db");
const validar = require("../middleware/validar");
const { autenticar, apenasDocenteOuAdmin } = require("../middleware/auth");
const { auditar } = require("../middleware/auditoria");
const { notificarVarios } = require("../services/notificacoes");

const TIPOS = ["teste", "entrega", "aula", "outro"];

const schemaEvento = z.object({
  disciplina: z.string().trim().min(1, "Escolha a disciplina."),
  titulo: z.string().trim().min(3, "Título demasiado curto.").max(150, "Máximo 150 caracteres."),
  descricao: z.string().trim().max(2000, "Máximo 2000 caracteres.").optional().nullable(),
  tipo: z.enum(TIPOS).default("outro"),
  data_inicio: z.coerce.date({ message: "Data de início inválida." }),
  data_fim: z.coerce.date().optional().nullable(),
}).refine(e => !e.data_fim || e.data_fim >= e.data_inicio, { message: "A data de fim tem de ser depois do início.", path: ["data_fim"] });

const SELECT_EVENTO = `e.id, e.disciplina, e.titulo, e.descricao, e.tipo, e.data_inicio, e.data_fim, e.criado_por, e.criado_em, u.nome AS criado_por_nome`;

async function subscritoresDe(disciplina, excepto) {
  const [linhas] = await db.query("SELECT usuario_id FROM subscricoes_disciplinas WHERE disciplina = ? AND usuario_id <> ?", [disciplina, excepto || 0]);
  return linhas.map(l => l.usuario_id);
}

module.exports = function registarRotasCalendario(app) {
  /**
   * @openapi
   * /api/calendario:
   *   get:
   *     summary: Eventos académicos num intervalo (por defeito, os próximos 60 dias), opcionalmente de uma disciplina ou só das disciplinas que o utilizador segue
   *     tags: [Calendário]
   *     parameters:
   *       - in: query
   *         name: de
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: ate
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: disciplina
   *         schema: { type: string }
   *       - in: query
   *         name: minhas
   *         schema: { type: boolean }
   *     responses:
   *       200: { description: Eventos ordenados por data }
   *   post:
   *     summary: Cria um evento (docente ou admin). Os subscritores da disciplina são notificados na hora e lembrados 24 h antes.
   *     tags: [Calendário]
   *     responses:
   *       201: { description: Criado }
   */
  app.get("/api/calendario", autenticar, async (req, res) => {
    try {
      const de = req.query.de ? new Date(req.query.de) : new Date();
      const ate = req.query.ate ? new Date(req.query.ate) : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) return res.status(400).json({ erro: "Datas inválidas." });
      const params = [de, ate];
      let where = "WHERE e.data_inicio BETWEEN ? AND ?";
      if (req.query.disciplina) { where += " AND e.disciplina = ?"; params.push(String(req.query.disciplina)); }
      if (req.query.minhas === "true") {
        where += " AND e.disciplina IN (SELECT disciplina FROM subscricoes_disciplinas WHERE usuario_id = ?)";
        params.push(req.utilizador.id);
      }
      const [eventos] = await db.query(
        `SELECT ${SELECT_EVENTO} FROM eventos_calendario e LEFT JOIN usuarios u ON u.id = e.criado_por ${where} ORDER BY e.data_inicio ASC LIMIT 500`,
        params
      );
      res.json(eventos);
    } catch (erro) {
      console.error("Erro ao listar calendário:", erro.message);
      res.status(500).json({ erro: "Erro ao buscar o calendário." });
    }
  });

  app.post("/api/calendario", autenticar, apenasDocenteOuAdmin, validar(schemaEvento), async (req, res) => {
    try {
      const { disciplina, titulo, descricao, tipo, data_inicio, data_fim } = req.body;
      const [[curso]] = await db.query("SELECT id FROM cursos WHERE nome = ?", [disciplina]);
      if (!curso) return res.status(400).json({ erro: "Disciplina inválida." });
      const [r] = await db.query(
        "INSERT INTO eventos_calendario (disciplina, titulo, descricao, tipo, data_inicio, data_fim, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [disciplina, titulo, descricao || null, tipo, data_inicio, data_fim || null, req.utilizador.id]
      );
      auditar(req.utilizador.id, "criar_evento", "calendario", r.insertId, `${tipo}: ${titulo} (${disciplina})`, req.ip);
      const quando = new Date(data_inicio).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
      await notificarVarios(await subscritoresDe(disciplina, req.utilizador.id), {
        tipo: "calendario", titulo: `${disciplina}: ${titulo}`, mensagem: `${tipo === "teste" ? "Teste" : tipo === "entrega" ? "Entrega" : tipo === "aula" ? "Aula" : "Evento"} marcado para ${quando}.`, link: "/calendario",
      });
      res.status(201).json({ id: r.insertId, mensagem: "Evento criado. Os subscritores da disciplina foram avisados." });
    } catch (erro) {
      console.error("Erro ao criar evento:", erro.message);
      res.status(500).json({ erro: "Erro ao criar o evento." });
    }
  });

  /**
   * @openapi
   * /api/calendario/{id}:
   *   put:
   *     summary: Edita um evento (quem o criou ou admin)
   *     tags: [Calendário]
   *     responses:
   *       200: { description: Actualizado }
   *   delete:
   *     summary: Apaga um evento (quem o criou ou admin)
   *     tags: [Calendário]
   *     responses:
   *       200: { description: Apagado }
   */
  async function eventoEditavel(req, res) {
    const id = parseInt(req.params.id, 10);
    const [[evento]] = await db.query("SELECT id, titulo, disciplina, criado_por, data_inicio FROM eventos_calendario WHERE id = ?", [id]);
    if (!evento) { res.status(404).json({ erro: "Evento não encontrado." }); return null; }
    if (evento.criado_por !== req.utilizador.id && req.utilizador.papel !== "admin") {
      res.status(403).json({ erro: "Só quem criou o evento ou um administrador o pode alterar." }); return null;
    }
    return evento;
  }

  app.put("/api/calendario/:id", autenticar, apenasDocenteOuAdmin, validar(schemaEvento), async (req, res) => {
    try {
      const evento = await eventoEditavel(req, res);
      if (!evento) return;
      const { disciplina, titulo, descricao, tipo, data_inicio, data_fim } = req.body;
      // Se a data mudou, o lembrete de 24 h volta a ser devido.
      const dataMudou = new Date(evento.data_inicio).getTime() !== new Date(data_inicio).getTime();
      await db.query(
        `UPDATE eventos_calendario SET disciplina = ?, titulo = ?, descricao = ?, tipo = ?, data_inicio = ?, data_fim = ?${dataMudou ? ", lembrete_enviado = 0" : ""} WHERE id = ?`,
        [disciplina, titulo, descricao || null, tipo, data_inicio, data_fim || null, evento.id]
      );
      auditar(req.utilizador.id, "editar_evento", "calendario", evento.id, titulo, req.ip);
      res.json({ mensagem: "Evento actualizado." });
    } catch (erro) {
      console.error("Erro ao editar evento:", erro.message);
      res.status(500).json({ erro: "Erro ao editar o evento." });
    }
  });

  app.delete("/api/calendario/:id", autenticar, apenasDocenteOuAdmin, async (req, res) => {
    try {
      const evento = await eventoEditavel(req, res);
      if (!evento) return;
      await db.query("DELETE FROM eventos_calendario WHERE id = ?", [evento.id]);
      auditar(req.utilizador.id, "apagar_evento", "calendario", evento.id, evento.titulo, req.ip);
      res.json({ mensagem: "Evento apagado." });
    } catch (erro) {
      console.error("Erro ao apagar evento:", erro.message);
      res.status(500).json({ erro: "Erro ao apagar o evento." });
    }
  });
};
