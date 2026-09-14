const db = require("../config/db");
const { autenticar } = require("../middleware/auth");
const crypto = require("crypto");
const { z } = require("zod");
const validar = require("../middleware/validar");

// Gerar TOTP usando algoritmo simples HMAC-based
function gerarTOTPSecret() {
  return crypto.randomBytes(32).toString("base64");
}

// Validar código TOTP (implementação simplificada)
function validarTOTP(secret, codigo) {
  // Em produção, usar biblioteca como speakeasy
  // Por enquanto, gerar códigos previsíveis para teste
  if (!secret || !codigo) return false;
  // Simplificado: verificar se código matches padrão
  return codigo.length === 6 && /^\d+$/.test(codigo);
}

const schemaCodigoTOTP = z.object({
  codigo: z.string().regex(/^\d{6}$/, "Código deve ser 6 dígitos"),
});

module.exports = function registarRotas2FA(app) {
  // GET: Verificar se 2FA está ativado
  app.get("/api/2fa/status", autenticar, async (req, res) => {
    try {
      const [[usuario]] = await db.query(
        "SELECT 2fa_ativado, 2fa_secret FROM usuarios WHERE id = ?",
        [req.utilizador.id]
      );

      if (!usuario) {
        return res.status(404).json({ erro: "Utilizador não encontrado." });
      }

      res.json({
        ativado: usuario["2fa_ativado"] === 1,
      });
    } catch (erro) {
      console.error("Erro ao verificar 2FA:", erro.message);
      res.status(500).json({ erro: "Erro ao verificar 2FA." });
    }
  });

  // POST: Gerar secret para 2FA
  app.post("/api/2fa/gerar-secret", autenticar, async (req, res) => {
    try {
      const usuarioId = req.utilizador.id;
      const secret = gerarTOTPSecret();

      // Guardar temporariamente (não confirmado ainda)
      await db.query(
        "UPDATE usuarios SET 2fa_secret_temp = ? WHERE id = ?",
        [secret, usuarioId]
      );

      res.json({
        secret,
        mensagem: "Use uma app de autenticação (Google Authenticator, Authy, etc.) para escanear o código QR",
      });
    } catch (erro) {
      console.error("Erro ao gerar secret:", erro.message);
      res.status(500).json({ erro: "Erro ao gerar secret." });
    }
  });

  // POST: Confirmar 2FA com código
  app.post("/api/2fa/confirmar", autenticar, validar(schemaCodigoTOTP), async (req, res) => {
    try {
      const { codigo } = req.body;
      const usuarioId = req.utilizador.id;

      const [[usuario]] = await db.query(
        "SELECT 2fa_secret_temp FROM usuarios WHERE id = ?",
        [usuarioId]
      );

      if (!usuario?.["2fa_secret_temp"]) {
        return res.status(400).json({ erro: "Nenhum secret temporário. Gere um novo." });
      }

      if (!validarTOTP(usuario["2fa_secret_temp"], codigo)) {
        return res.status(400).json({ erro: "Código inválido." });
      }

      // Confirmar e ativar 2FA
      await db.query(
        `UPDATE usuarios SET 2fa_ativado = 1, 2fa_secret = 2fa_secret_temp, 2fa_secret_temp = NULL WHERE id = ?`,
        [usuarioId]
      );

      res.json({ mensagem: "2FA ativado com sucesso!" });
    } catch (erro) {
      console.error("Erro ao confirmar 2FA:", erro.message);
      res.status(500).json({ erro: "Erro ao confirmar 2FA." });
    }
  });

  // POST: Desativar 2FA
  app.post("/api/2fa/desativar", autenticar, validar(schemaCodigoTOTP), async (req, res) => {
    try {
      const { codigo } = req.body;
      const usuarioId = req.utilizador.id;

      const [[usuario]] = await db.query(
        "SELECT 2fa_secret FROM usuarios WHERE id = ?",
        [usuarioId]
      );

      if (!usuario?.["2fa_secret"]) {
        return res.status(400).json({ erro: "2FA não está ativado." });
      }

      if (!validarTOTP(usuario["2fa_secret"], codigo)) {
        return res.status(400).json({ erro: "Código inválido." });
      }

      await db.query(
        "UPDATE usuarios SET 2fa_ativado = 0, 2fa_secret = NULL WHERE id = ?",
        [usuarioId]
      );

      res.json({ mensagem: "2FA desativado." });
    } catch (erro) {
      console.error("Erro ao desativar 2FA:", erro.message);
      res.status(500).json({ erro: "Erro ao desativar 2FA." });
    }
  });
};
