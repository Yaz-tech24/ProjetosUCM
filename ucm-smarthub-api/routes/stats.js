const { getEstatisticas } = require("../services/plataforma");
const { autenticar } = require("../middleware/auth");

module.exports = function registarRotasStats(app) {
  // ==========================================
  // ESTATÍSTICAS GERAIS (dashboard)
  // ==========================================
  /**
   * @openapi
   * /api/stats:
   *   get:
   *     summary: Estatísticas gerais da plataforma (autenticado)
   *     tags: [Estatísticas]
   *     responses:
   *       200: { description: Contagens agregadas }
   * /api/stats/publicas:
   *   get:
   *     summary: Versão pública das estatísticas (sem autenticação)
   *     tags: [Estatísticas]
   *     security: []
   *     responses:
   *       200: { description: Contagens agregadas }
   */
  app.get("/api/stats", autenticar, async (req, res) => {
    try {
      res.json(await getEstatisticas());
    } catch (erro) {
      console.error("Erro nas stats:", erro.message);
      res.status(500).json({ erro: "Falha ao buscar estatísticas." });
    }
  });

  // Versão pública — só contagens agregadas, sem dados sensíveis — usada na página de entrada
  app.get("/api/stats/publicas", async (req, res) => {
    try {
      res.json(await getEstatisticas());
    } catch (erro) {
      console.error("Erro nas stats públicas:", erro.message);
      res.status(500).json({ erro: "Falha ao buscar estatísticas." });
    }
  });
};
