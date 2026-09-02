const db = require("../config/db");
const { autenticar, apenasAdmin } = require("../middleware/auth");
const { genAI } = require("../services/ia");
const { emailConfigurado } = require("../services/email");

module.exports = function registarRotasStatus(app) {
  // ==========================================
  // STATUS
  // ==========================================
  /**
   * @openapi
   * /api/status:
   *   get:
   *     summary: Verificação de saúde do servidor (health check) — inclui teste real à BD
   *     tags: [Sistema]
   *     security: []
   *     responses:
   *       200: { description: Servidor e base de dados operacionais }
   *       503: { description: Base de dados inacessível, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
   */
  app.get("/api/status", async (req, res) => {
    try {
      await db.query("SELECT 1");
      res.json({ mensagem: "Servidor Operacional", status: "ONLINE", bd: "ligada" });
    } catch (erro) {
      console.error("Healthcheck falhou — BD inacessível:", erro.message);
      res.status(503).json({ mensagem: "Base de dados inacessível", status: "DEGRADADO", erro: "bd_inacessivel" });
    }
  });

  /**
   * @openapi
   * /api/admin/status:
   *   get:
   *     summary: Estado detalhado dos serviços integrados — BD, IA e email (admin)
   *     tags: [Admin]
   *     responses:
   *       200: { description: Estado de cada serviço (ligada/inacessivel, configurada/nao_configurada) }
   */
  app.get("/api/admin/status", autenticar, apenasAdmin, async (req, res) => {
    let bd = "ligada";
    try {
      await db.query("SELECT 1");
    } catch {
      bd = "inacessivel";
    }
    res.json({
      bd,
      ia: genAI ? "configurada" : "nao_configurada",
      email: emailConfigurado() ? "configurada" : "nao_configurada",
    });
  });
};
