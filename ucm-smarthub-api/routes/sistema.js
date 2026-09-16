const db = require("../config/db");
const { autenticar, apenasAdmin } = require("../middleware/auth");
const { auditar } = require("../middleware/auditoria");
const saude = require("../services/saude");
const digest = require("../services/digest");
const manutencao = require("../services/manutencao");
const { getConfiguracoes } = require("../services/plataforma");
const gemini = require("../services/gemini");
const preGeracao = require("../services/preGeracao");

module.exports = function registarRotasSistema(app) {
  /**
   * @openapi
   * /api/health:
   *   get:
   *     summary: Saúde resumida (público, para monitorização externa) — 200 ok/degradado, 503 se a BD estiver em baixo
   *     tags: [Sistema]
   *     security: []
   *     responses:
   *       200: { description: "{ estado, versao, uptime_s }" }
   *       503: { description: Base de dados inacessível }
   */
  app.get("/api/health", async (req, res) => {
    try {
      const estado = await saude.estadoDetalhado();
      res.status(estado.servicos.bd.ok ? 200 : 503).json({ estado: estado.estado, versao: estado.versao, uptime_s: estado.uptime_s, problemas: estado.problemas });
    } catch (erro) {
      res.status(503).json({ estado: "critico", erro: erro.message });
    }
  });

  /**
   * @openapi
   * /api/admin/sistema:
   *   get:
   *     summary: Estado detalhado do sistema — BD, LibreOffice, indexação, disco, backups, migrações (admin)
   *     tags: [Admin]
   *     responses:
   *       200: { description: Estado por serviço }
   */
  app.get("/api/admin/sistema", autenticar, apenasAdmin, async (req, res) => {
    try {
      res.json(await saude.estadoDetalhado());
    } catch (erro) {
      console.error("Erro no estado do sistema:", erro.message);
      res.status(500).json({ erro: "Erro ao obter o estado do sistema." });
    }
  });

  /**
   * @openapi
   * /api/admin/digest/previsualizar:
   *   get:
   *     summary: Pré-visualiza o digest semanal do próprio admin (HTML) sem enviar
   *     tags: [Admin]
   *     responses:
   *       200: { description: "{ html, resumo, tem_conteudo }" }
   * /api/admin/digest/enviar:
   *   post:
   *     summary: Envia já o digest semanal a quem ainda não o recebeu esta semana (admin)
   *     tags: [Admin]
   *     responses:
   *       200: { description: Contagens do envio }
   * /api/admin/manutencao:
   *   post:
   *     summary: Corre já a limpeza diária (sessões expiradas, auditoria antiga, notificações lidas)
   *     tags: [Admin]
   *     responses:
   *       200: { description: Linhas removidas por tabela }
   */
  app.get("/api/admin/digest/previsualizar", autenticar, apenasAdmin, async (req, res) => {
    try {
      const [[utilizador]] = await db.query("SELECT id, nome, email, curso, email_verificado FROM usuarios WHERE id = ?", [req.utilizador.id]);
      const config = await getConfiguracoes();
      const conteudo = await digest.recolherConteudo(utilizador);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      res.json({
        tem_conteudo: digest.resumoCurto(conteudo).length > 0,
        resumo: digest.resumoCurto(conteudo),
        html: digest.construirHtml({ utilizador, conteudo, config, frontendUrl }),
        conteudo,
      });
    } catch (erro) {
      console.error("Erro ao pré-visualizar digest:", erro.message);
      res.status(500).json({ erro: "Erro ao gerar a pré-visualização." });
    }
  });

  app.post("/api/admin/digest/enviar", autenticar, apenasAdmin, async (req, res) => {
    try {
      const resultado = await digest.enviarDigests({ forcar: true });
      auditar(req.utilizador.id, "enviar_digest", "sistema", null, JSON.stringify(resultado), req.ip);
      res.json(resultado);
    } catch (erro) {
      console.error("Erro ao enviar digest:", erro.message);
      res.status(500).json({ erro: "Erro ao enviar o digest." });
    }
  });

  /**
   * @openapi
   * /api/admin/ia:
   *   get:
   *     summary: Estado da IA — modelos, estatísticas por funcionalidade, últimos erros e fila de pré-geração (admin)
   *     tags: [Admin]
   *     responses:
   *       200: { description: Estado }
   * /api/admin/ia/testar:
   *   post:
   *     summary: Faz um pedido mínimo a cada modelo da cadeia e reporta qual responde (admin)
   *     tags: [Admin]
   *     responses:
   *       200: { description: Resultado por modelo }
   * /api/admin/ia/pregerar:
   *   post:
   *     summary: Agenda a pré-geração de resumo/quiz/flashcards para um material ou para o backlog (admin)
   *     tags: [Admin]
   *     requestBody:
   *       content:
   *         application/json:
   *           schema: { type: object, properties: { material_id: { type: integer } } }
   *     responses:
   *       200: { description: Agendado }
   */
  app.get("/api/admin/ia", autenticar, apenasAdmin, async (req, res) => {
    res.json({ ...gemini.estatisticasIA(), pre_geracao: preGeracao.estadoPreGeracao() });
  });

  app.post("/api/admin/ia/testar", autenticar, apenasAdmin, async (req, res) => {
    try {
      const resultado = await gemini.testarModelos();
      auditar(req.utilizador.id, "testar_modelos_ia", "sistema", null, JSON.stringify(resultado.modelos?.map(m => ({ m: m.modelo, ok: m.ok }))), req.ip);
      res.json(resultado);
    } catch (erro) {
      res.status(500).json({ erro: erro.message });
    }
  });

  app.post("/api/admin/ia/pregerar", autenticar, apenasAdmin, async (req, res) => {
    try {
      const materialId = Number.isInteger(req.body?.material_id) ? req.body.material_id : null;
      const agendados = materialId ? (preGeracao.agendar(materialId, "admin") ? 1 : 0) : await preGeracao.agendarBacklog();
      res.json({ agendados, estado: preGeracao.estadoPreGeracao() });
    } catch (erro) {
      res.status(500).json({ erro: erro.message });
    }
  });

  app.post("/api/admin/manutencao", autenticar, apenasAdmin, async (req, res) => {
    try {
      const resultado = await manutencao.correrManutencao();
      auditar(req.utilizador.id, "correr_manutencao", "sistema", null, JSON.stringify(resultado), req.ip);
      res.json(resultado);
    } catch (erro) {
      console.error("Erro na manutenção:", erro.message);
      res.status(500).json({ erro: "Erro ao correr a manutenção." });
    }
  });
};
