const { z } = require("zod");

const db = require("../config/db");
const validar = require("../middleware/validar");
const { autenticar } = require("../middleware/auth");
const { limitar2FA } = require("../middleware/rateLimiters");
const { auditar } = require("../middleware/auditoria");
const { getConfiguracoes } = require("../services/plataforma");
const totp = require("../services/totp");

const schemaCodigo = z.object({
  codigo: z.string().regex(/^\d{6}$/, "O código tem de ter 6 dígitos."),
});

module.exports = function registarRotas2FA(app) {
  /**
   * @openapi
   * /api/2fa/status:
   *   get:
   *     summary: Indica se o utilizador autenticado tem 2FA activo
   *     tags: [Segurança]
   *     responses:
   *       200: { description: Estado, content: { application/json: { schema: { type: object, properties: { ativado: { type: boolean } } } } } }
   */
  app.get("/api/2fa/status", autenticar, async (req, res) => {
    try {
      const [[utilizador]] = await db.query("SELECT 2fa_ativado FROM usuarios WHERE id = ?", [req.utilizador.id]);
      if (!utilizador) return res.status(404).json({ erro: "Utilizador não encontrado." });
      res.json({ ativado: utilizador["2fa_ativado"] === 1 });
    } catch (erro) {
      console.error("Erro ao verificar 2FA:", erro.message);
      res.status(500).json({ erro: "Erro ao verificar 2FA." });
    }
  });

  /**
   * @openapi
   * /api/2fa/gerar-secret:
   *   post:
   *     summary: Gera um novo secret TOTP (pendente até ser confirmado com um código válido)
   *     tags: [Segurança]
   *     responses:
   *       200: { description: Secret, URL otpauth e QR code em data URL }
   *       400: { description: 2FA já activo }
   */
  app.post("/api/2fa/gerar-secret", autenticar, limitar2FA, async (req, res) => {
    try {
      const [[utilizador]] = await db.query("SELECT email, 2fa_ativado FROM usuarios WHERE id = ?", [req.utilizador.id]);
      if (!utilizador) return res.status(404).json({ erro: "Utilizador não encontrado." });
      if (utilizador["2fa_ativado"] === 1) {
        return res.status(400).json({ erro: "O 2FA já está activo. Desactive-o primeiro para gerar um novo secret." });
      }

      const secret = totp.gerarSecret();
      await db.query("UPDATE usuarios SET 2fa_secret_temp = ? WHERE id = ?", [secret, req.utilizador.id]);

      const config = await getConfiguracoes();
      const otpauthUrl = totp.gerarOtpauthUrl({ secret, email: utilizador.email, emissor: config.nome_plataforma || "SmartHub" });
      const qrCode = await totp.gerarQrCodeDataUrl(otpauthUrl);

      res.json({ secret, otpauthUrl, qrCode });
    } catch (erro) {
      console.error("Erro ao gerar secret 2FA:", erro.message);
      res.status(500).json({ erro: "Erro ao gerar secret." });
    }
  });

  /**
   * @openapi
   * /api/2fa/confirmar:
   *   post:
   *     summary: Confirma o secret pendente com um código da app e activa o 2FA
   *     tags: [Segurança]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [codigo], properties: { codigo: { type: string, pattern: '^\\d{6}$' } } }
   *     responses:
   *       200: { description: 2FA activado }
   *       400: { description: Código inválido ou sem secret pendente }
   */
  app.post("/api/2fa/confirmar", autenticar, limitar2FA, validar(schemaCodigo), async (req, res) => {
    try {
      const [[utilizador]] = await db.query("SELECT 2fa_secret_temp FROM usuarios WHERE id = ?", [req.utilizador.id]);
      const secretPendente = utilizador?.["2fa_secret_temp"];
      if (!secretPendente) {
        return res.status(400).json({ erro: "Não há nenhum secret pendente. Gere um novo primeiro." });
      }

      if (!(await totp.verificarCodigo(secretPendente, req.body.codigo))) {
        return res.status(400).json({ erro: "Código inválido. Confirme que a hora do telemóvel está certa e tente de novo." });
      }

      await db.query(
        "UPDATE usuarios SET 2fa_ativado = 1, 2fa_secret = 2fa_secret_temp, 2fa_secret_temp = NULL WHERE id = ?",
        [req.utilizador.id]
      );
      auditar(req.utilizador.id, "activar_2fa", "usuarios", req.utilizador.id, "Activou a autenticação de dois factores", req.ip);

      res.json({ mensagem: "2FA activado. A partir de agora o login pede um código da app." });
    } catch (erro) {
      console.error("Erro ao confirmar 2FA:", erro.message);
      res.status(500).json({ erro: "Erro ao confirmar 2FA." });
    }
  });

  /**
   * @openapi
   * /api/2fa/desativar:
   *   post:
   *     summary: Desactiva o 2FA (exige um código válido da app)
   *     tags: [Segurança]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [codigo], properties: { codigo: { type: string, pattern: '^\\d{6}$' } } }
   *     responses:
   *       200: { description: 2FA desactivado }
   *       400: { description: Código inválido ou 2FA não activo }
   */
  app.post("/api/2fa/desativar", autenticar, limitar2FA, validar(schemaCodigo), async (req, res) => {
    try {
      const [[utilizador]] = await db.query("SELECT 2fa_secret, 2fa_ativado FROM usuarios WHERE id = ?", [req.utilizador.id]);
      if (!utilizador?.["2fa_secret"] || utilizador["2fa_ativado"] !== 1) {
        return res.status(400).json({ erro: "O 2FA não está activo." });
      }

      if (!(await totp.verificarCodigo(utilizador["2fa_secret"], req.body.codigo))) {
        return res.status(400).json({ erro: "Código inválido." });
      }

      await db.query(
        "UPDATE usuarios SET 2fa_ativado = 0, 2fa_secret = NULL, 2fa_secret_temp = NULL WHERE id = ?",
        [req.utilizador.id]
      );
      auditar(req.utilizador.id, "desactivar_2fa", "usuarios", req.utilizador.id, "Desactivou a autenticação de dois factores", req.ip);

      res.json({ mensagem: "2FA desactivado." });
    } catch (erro) {
      console.error("Erro ao desactivar 2FA:", erro.message);
      res.status(500).json({ erro: "Erro ao desactivar 2FA." });
    }
  });
};
