const { autenticar } = require("../middleware/auth");
const { auditar } = require("../middleware/auditoria");
const sessoes = require("../services/sessoes");

module.exports = function registarRotasSessoes(app) {
  /**
   * @openapi
   * /api/sessoes:
   *   get:
   *     summary: Sessões activas do utilizador autenticado (dispositivo, IP, último uso)
   *     tags: [Segurança]
   *     responses:
   *       200: { description: Lista; `actual` marca a sessão que fez o pedido }
   */
  app.get("/api/sessoes", autenticar, async (req, res) => {
    try {
      const lista = await sessoes.listarSessoes(req.utilizador.id);
      res.json(lista.map(s => ({ ...s, actual: s.jti === req.sessaoJti })));
    } catch (erro) {
      console.error("Erro ao listar sessões:", erro.message);
      res.status(500).json({ erro: "Erro ao listar sessões." });
    }
  });

  /**
   * @openapi
   * /api/sessoes/{jti}:
   *   delete:
   *     summary: Termina uma sessão específica (a própria ou de outro dispositivo)
   *     tags: [Segurança]
   *     parameters:
   *       - in: path
   *         name: jti
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200: { description: Sessão terminada }
   *       404: { description: Sessão não encontrada ou já terminada }
   */
  app.delete("/api/sessoes/:jti", autenticar, async (req, res) => {
    try {
      const jti = String(req.params.jti);
      const revogada = await sessoes.revogarSessao(jti, req.utilizador.id);
      if (!revogada) return res.status(404).json({ erro: "Sessão não encontrada ou já terminada." });
      auditar(req.utilizador.id, "terminar_sessao", "sessoes", null, jti === req.sessaoJti ? "Terminou a sessão actual" : "Terminou uma sessão noutro dispositivo", req.ip);
      res.json({ mensagem: "Sessão terminada.", era_actual: jti === req.sessaoJti });
    } catch (erro) {
      console.error("Erro ao terminar sessão:", erro.message);
      res.status(500).json({ erro: "Erro ao terminar sessão." });
    }
  });

  /**
   * @openapi
   * /api/sessoes/outras:
   *   delete:
   *     summary: Termina todas as sessões excepto a actual
   *     tags: [Segurança]
   *     responses:
   *       200: { description: Número de sessões terminadas }
   */
  app.delete("/api/sessoes", autenticar, async (req, res) => {
    try {
      const total = await sessoes.revogarOutrasSessoes(req.utilizador.id, req.sessaoJti);
      auditar(req.utilizador.id, "terminar_outras_sessoes", "sessoes", null, `Terminou ${total} sessão(ões) noutros dispositivos`, req.ip);
      res.json({ mensagem: total === 0 ? "Não havia outras sessões activas." : `${total} sessão${total === 1 ? "" : "ões"} terminada${total === 1 ? "" : "s"}.`, terminadas: total });
    } catch (erro) {
      console.error("Erro ao terminar sessões:", erro.message);
      res.status(500).json({ erro: "Erro ao terminar sessões." });
    }
  });
};
