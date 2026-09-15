const { z } = require("zod");

const db = require("../config/db");
const validar = require("../middleware/validar");
const { autenticar } = require("../middleware/auth");
const { limitar2FA } = require("../middleware/rateLimiters");
const { auditar } = require("../middleware/auditoria");
const { getConfiguracoes } = require("../services/plataforma");
const totp = require("../services/totp");
const recuperacao = require("../services/codigosRecuperacao");

const schemaCodigo = z.object({
  codigo: z.string().regex(/^\d{6}$/, "O código tem de ter 6 dígitos."),
});

module.exports = function registarRotas2FA(app) {
  /**
   * @openapi
   * /api/2fa/status:
   *   get:
   *     summary: Estado do 2FA do utilizador autenticado, incluindo quantos códigos de recuperação restam
   *     tags: [Segurança]
   *     responses:
   *       200: { description: Estado, content: { application/json: { schema: { type: object, properties: { ativado: { type: boolean }, codigos_restantes: { type: integer } } } } } }
   */
  app.get("/api/2fa/status", autenticar, async (req, res) => {
    try {
      const [[utilizador]] = await db.query("SELECT 2fa_ativado FROM usuarios WHERE id = ?", [req.utilizador.id]);
      if (!utilizador) return res.status(404).json({ erro: "Utilizador não encontrado." });
      const ativado = utilizador["2fa_ativado"] === 1;
      res.json({ ativado, codigos_restantes: ativado ? await recuperacao.contarCodigosRestantes(req.utilizador.id) : 0 });
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
   *     summary: Confirma o secret pendente com um código da app, activa o 2FA e devolve os códigos de recuperação (só desta vez)
   *     tags: [Segurança]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [codigo], properties: { codigo: { type: string, pattern: '^\\d{6}$' } } }
   *     responses:
   *       200: { description: 2FA activado, content: { application/json: { schema: { type: object, properties: { mensagem: { type: string }, codigos_recuperacao: { type: array, items: { type: string } } } } } } }
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
      const codigos = await recuperacao.gerarCodigosRecuperacao(req.utilizador.id);
      auditar(req.utilizador.id, "activar_2fa", "usuarios", req.utilizador.id, "Activou a autenticação de dois factores", req.ip);

      res.json({
        mensagem: "2FA activado. Guarde os códigos de recuperação num sítio seguro — não voltam a ser mostrados.",
        codigos_recuperacao: codigos,
      });
    } catch (erro) {
      console.error("Erro ao confirmar 2FA:", erro.message);
      res.status(500).json({ erro: "Erro ao confirmar 2FA." });
    }
  });

  /**
   * @openapi
   * /api/2fa/codigos-recuperacao/regenerar:
   *   post:
   *     summary: Invalida os códigos de recuperação actuais e gera 10 novos (exige um código válido da app)
   *     tags: [Segurança]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [codigo], properties: { codigo: { type: string, pattern: '^\\d{6}$' } } }
   *     responses:
   *       200: { description: Novos códigos }
   *       400: { description: Código inválido ou 2FA não activo }
   */
  app.post("/api/2fa/codigos-recuperacao/regenerar", autenticar, limitar2FA, validar(schemaCodigo), async (req, res) => {
    try {
      const [[utilizador]] = await db.query("SELECT 2fa_secret, 2fa_ativado FROM usuarios WHERE id = ?", [req.utilizador.id]);
      if (!utilizador?.["2fa_secret"] || utilizador["2fa_ativado"] !== 1) {
        return res.status(400).json({ erro: "O 2FA não está activo." });
      }
      if (!(await totp.verificarCodigo(utilizador["2fa_secret"], req.body.codigo))) {
        return res.status(400).json({ erro: "Código inválido." });
      }
      const codigos = await recuperacao.gerarCodigosRecuperacao(req.utilizador.id);
      auditar(req.utilizador.id, "regenerar_codigos_2fa", "usuarios", req.utilizador.id, "Gerou novos códigos de recuperação", req.ip);
      res.json({ mensagem: "Códigos anteriores invalidados. Guarde os novos.", codigos_recuperacao: codigos });
    } catch (erro) {
      console.error("Erro ao regenerar códigos:", erro.message);
      res.status(500).json({ erro: "Erro ao gerar códigos." });
    }
  });

  /**
   * @openapi
   * /api/2fa/desativar:
   *   post:
   *     summary: Desactiva o 2FA (exige um código válido da app) e apaga os códigos de recuperação
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
      await recuperacao.apagarCodigos(req.utilizador.id);
      auditar(req.utilizador.id, "desactivar_2fa", "usuarios", req.utilizador.id, "Desactivou a autenticação de dois factores", req.ip);

      res.json({ mensagem: "2FA desactivado." });
    } catch (erro) {
      console.error("Erro ao desactivar 2FA:", erro.message);
      res.status(500).json({ erro: "Erro ao desactivar 2FA." });
    }
  });
};
