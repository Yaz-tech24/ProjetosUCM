const db = require("../config/db");
const { autenticar } = require("../middleware/auth");
const { limitarAvaliacoes } = require("../middleware/rateLimiters");
const { listarConquistas, verificarConquistas, calcularSequencia } = require("../services/conquistas");

// Estatísticas de estudo do próprio utilizador e conquistas — tudo agregado
// a partir de materiais_acessos, quiz_resultados e flashcards_revisoes.
const SEMANAS = 8;
const MINUTOS_POR_ABERTURA = 12; // estimativa conservadora por material aberto

function inicioDaSemana(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dia = (x.getDay() + 6) % 7; // segunda = 0
  x.setDate(x.getDate() - dia);
  return x;
}
const chaveDia = (d) => new Date(d).toISOString().slice(0, 10);

module.exports = function registarRotasEstudo(app) {
  /**
   * @openapi
   * /api/perfil/estatisticas:
   *   get:
   *     summary: Estatísticas de estudo do utilizador (últimas 8 semanas, totais, sequência de dias)
   *     tags: [Perfil]
   *     responses:
   *       200: { description: "{ semanas[], totais, sequencia }" }
   */
  app.get("/api/perfil/estatisticas", autenticar, async (req, res) => {
    try {
      const uid = req.utilizador.id;
      const [acessos] = await db.query(
        "SELECT DATE(criado_em) AS dia, COUNT(*) AS n, COUNT(DISTINCT material_id) AS materiais FROM materiais_acessos WHERE usuario_id = ? AND tipo = 'abertura' AND criado_em >= DATE_SUB(CURDATE(), INTERVAL 400 DAY) GROUP BY DATE(criado_em)",
        [uid]
      );
      const [quizzes] = await db.query(
        "SELECT DATE(criado_em) AS dia, COUNT(*) AS n, SUM(pontuacao * 100 >= total * 70) AS passados FROM quiz_resultados WHERE usuario_id = ? AND criado_em >= DATE_SUB(CURDATE(), INTERVAL 400 DAY) GROUP BY DATE(criado_em)",
        [uid]
      );
      const [revisoes] = await db.query(
        "SELECT DATE(ultima_revisao) AS dia, SUM(total_revisoes) AS n FROM flashcards_revisoes WHERE usuario_id = ? AND ultima_revisao >= DATE_SUB(CURDATE(), INTERVAL 400 DAY) GROUP BY DATE(ultima_revisao)",
        [uid]
      );
      const [[totais]] = await db.query(
        `SELECT
           (SELECT COUNT(DISTINCT material_id) FROM materiais_acessos WHERE usuario_id = ? AND tipo = 'abertura') AS materiais_lidos,
           (SELECT COUNT(*) FROM materiais_acessos WHERE usuario_id = ? AND tipo = 'abertura') AS aberturas,
           (SELECT COUNT(*) FROM quiz_resultados WHERE usuario_id = ?) AS quizzes_feitos,
           (SELECT COUNT(DISTINCT quiz_id) FROM quiz_resultados WHERE usuario_id = ? AND pontuacao * 100 >= total * 70) AS quizzes_passados,
           (SELECT COALESCE(SUM(total_revisoes), 0) FROM flashcards_revisoes WHERE usuario_id = ?) AS flashcards_revistos,
           (SELECT COUNT(*) FROM flashcards_revisoes WHERE usuario_id = ? AND intervalo_dias >= 21) AS flashcards_dominados,
           (SELECT COUNT(*) FROM anotacoes WHERE usuario_id = ?) AS anotacoes,
           (SELECT COUNT(*) FROM leituras WHERE usuario_id = ? AND total_paginas IS NOT NULL AND pagina >= total_paginas) AS leituras_concluidas`,
        [uid, uid, uid, uid, uid, uid, uid, uid]
      );

      // Agrega por semana (segunda a domingo), últimas 8 semanas incluindo a actual
      const semanas = [];
      const inicioActual = inicioDaSemana(new Date());
      for (let i = SEMANAS - 1; i >= 0; i--) {
        const inicio = new Date(inicioActual); inicio.setDate(inicio.getDate() - i * 7);
        const fim = new Date(inicio); fim.setDate(fim.getDate() + 7);
        const dentro = (dia) => { const t = new Date(chaveDia(dia) + "T12:00:00"); return t >= inicio && t < fim; };
        const leituras = acessos.filter(a => dentro(a.dia)).reduce((s, a) => s + Number(a.n), 0);
        const q = quizzes.filter(a => dentro(a.dia));
        const r = revisoes.filter(a => dentro(a.dia)).reduce((s, a) => s + Number(a.n), 0);
        semanas.push({
          inicio: chaveDia(inicio),
          leituras,
          quizzes: q.reduce((s, a) => s + Number(a.n), 0),
          quizzes_passados: q.reduce((s, a) => s + Number(a.passados || 0), 0),
          revisoes: r,
          minutos: leituras * MINUTOS_POR_ABERTURA + r,
        });
      }

      const dias = new Set([...acessos, ...quizzes, ...revisoes].map(x => chaveDia(x.dia)));
      const sequencia = calcularSequencia([...dias]);
      const t = {};
      for (const [k, v] of Object.entries(totais || {})) t[k] = Number(v) || 0;
      t.minutos_estimados = t.aberturas * MINUTOS_POR_ABERTURA + t.flashcards_revistos;

      res.json({ semanas, totais: t, sequencia, dias_activos: dias.size });
    } catch (erro) {
      console.error("Erro nas estatísticas:", erro.message);
      res.status(500).json({ erro: "Erro ao calcular as estatísticas." });
    }
  });

  /**
   * @openapi
   * /api/perfil/conquistas:
   *   get:
   *     summary: Conquistas do utilizador (obtidas e por obter, com progresso)
   *     tags: [Perfil]
   *     responses:
   *       200: { description: Lista completa }
   * /api/utilizadores/{id}/conquistas:
   *   get:
   *     summary: Conquistas obtidas por outro utilizador (público entre utilizadores autenticados)
   *     tags: [Perfil]
   *     responses:
   *       200: { description: Só as obtidas }
   * /api/eventos:
   *   post:
   *     summary: Regista um evento do cliente que conta para conquistas (ex. guardar PDF offline)
   *     tags: [Perfil]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [tipo], properties: { tipo: { type: string, enum: [offline] }, referencia: { type: integer } } }
   *     responses:
   *       200: { description: Registado; devolve conquistas novas }
   */
  app.get("/api/perfil/conquistas", autenticar, async (req, res) => {
    try {
      // Garante que conquistas ganhas por acções antigas aparecem mesmo que
      // nunca tenham sido verificadas na altura.
      await verificarConquistas(req.utilizador.id);
      res.json(await listarConquistas(req.utilizador.id));
    } catch (erro) {
      console.error("Erro nas conquistas:", erro.message);
      res.status(500).json({ erro: "Erro ao carregar as conquistas." });
    }
  });

  app.get("/api/utilizadores/:id/conquistas", autenticar, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { conquistas } = await listarConquistas(id);
      res.json(conquistas.filter(c => c.obtida).map(({ codigo, nome, descricao, icone, obtida_em }) => ({ codigo, nome, descricao, icone, obtida_em })));
    } catch (erro) {
      console.error("Erro nas conquistas:", erro.message);
      res.status(500).json({ erro: "Erro ao carregar as conquistas." });
    }
  });

  const TIPOS_EVENTO = ["offline"];
  app.post("/api/eventos", autenticar, limitarAvaliacoes, async (req, res) => {
    try {
      const tipo = String(req.body?.tipo || "");
      if (!TIPOS_EVENTO.includes(tipo)) return res.status(400).json({ erro: "Tipo de evento inválido." });
      const referencia = Number.isInteger(req.body?.referencia) ? req.body.referencia : 0;
      await db.query("INSERT IGNORE INTO eventos_utilizador (usuario_id, tipo, referencia) VALUES (?, ?, ?)", [req.utilizador.id, tipo, referencia]);
      const novas = await verificarConquistas(req.utilizador.id);
      res.json({ registado: true, conquistas_novas: novas.map(c => ({ codigo: c.codigo, nome: c.nome })) });
    } catch (erro) {
      console.error("Erro ao registar evento:", erro.message);
      res.status(500).json({ erro: "Erro ao registar o evento." });
    }
  });
};
