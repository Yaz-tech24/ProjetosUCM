const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

const db = require("../config/db");
const { paraUrlAbsoluto } = require("../utils/urls");
const validar = require("../middleware/validar");
const { autenticar } = require("../middleware/auth");
const { auditar } = require("../middleware/auditoria");
const { uploadsDir, uploadAvatar } = require("../middleware/upload");
const { schemaPerfilDados, schemaPerfilSenha } = require("../schemas");
const sessoes = require("../services/sessoes");
const totp = require("../services/totp");
const { consumirCodigoRecuperacao } = require("../services/codigosRecuperacao");
const { eliminarConta } = require("../services/eliminarConta");

module.exports = function registarRotasPerfil(app) {
  // ==========================================
  // PERFIL DO UTILIZADOR
  // ==========================================
  /**
   * @openapi
   * /api/perfil:
   *   put:
   *     summary: Actualiza o nome, número de identificação institucional e telefone do próprio perfil
   *     tags: [Perfil]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [nome], properties: { nome: { type: string }, numero_estudante: { type: string }, telefone: { type: string } } }
   *     responses:
   *       200:
   *         description: Perfil actualizado
   *         content: { application/json: { schema: { type: object, properties: { utilizador: { $ref: '#/components/schemas/Utilizador' } } } } }
   *       401: { description: Não autenticado }
   */
  app.put("/api/perfil", autenticar, validar(schemaPerfilDados), async (req, res) => {
    try {
      const { nome, numero_estudante, telefone } = req.body;
      await db.query(
        "UPDATE usuarios SET nome = ?, numero_estudante = ?, telefone = ? WHERE id = ?",
        [nome, numero_estudante || null, telefone || null, req.utilizador.id]
      );
      const [[utilizador]] = await db.query(
        "SELECT id, nome, email, papel, curso, numero_estudante, telefone, avatar_url FROM usuarios WHERE id = ?",
        [req.utilizador.id]
      );
      utilizador.avatar_url = paraUrlAbsoluto(utilizador.avatar_url);
      res.json({ mensagem: "Perfil actualizado com sucesso!", utilizador });
    } catch (erro) {
      console.error("Erro ao actualizar perfil:", erro.message);
      res.status(500).json({ erro: "Falha ao actualizar perfil." });
    }
  });

  /**
   * @openapi
   * /api/perfil/preferencias:
   *   put:
   *     summary: Preferências de comunicação (por agora, o resumo semanal por email/notificação)
   *     tags: [Perfil]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, properties: { digest_semanal: { type: boolean } } }
   *     responses:
   *       200: { description: Guardado }
   */
  app.put("/api/perfil/preferencias", autenticar, async (req, res) => {
    try {
      if (typeof req.body?.digest_semanal !== "boolean") return res.status(400).json({ erro: "Indique digest_semanal (true/false)." });
      await db.query("UPDATE usuarios SET digest_semanal = ? WHERE id = ?", [req.body.digest_semanal ? 1 : 0, req.utilizador.id]);
      res.json({ digest_semanal: req.body.digest_semanal });
    } catch (erro) {
      console.error("Erro ao guardar preferências:", erro.message);
      res.status(500).json({ erro: "Falha ao guardar as preferências." });
    }
  });

  /**
   * @openapi
   * /api/perfil/senha:
   *   put:
   *     summary: Muda a palavra-passe do próprio utilizador
   *     tags: [Perfil]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [senha_actual, nova_senha]
   *             properties:
   *               senha_actual: { type: string }
   *               nova_senha: { type: string, minLength: 8 }
   *     responses:
   *       200: { description: Palavra-passe alterada }
   *       400: { description: Palavra-passe actual incorrecta, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
   */
  app.put("/api/perfil/senha", autenticar, validar(schemaPerfilSenha), async (req, res) => {
    try {
      const { senha_actual, nova_senha } = req.body;
      const [[utilizador]] = await db.query("SELECT senha FROM usuarios WHERE id = ?", [req.utilizador.id]);
      const senhaValida = await bcrypt.compare(senha_actual, utilizador.senha);
      if (!senhaValida) {
        return res.status(400).json({ erro: "Palavra-passe actual incorrecta." });
      }
      const senhaCriptografada = await bcrypt.hash(nova_senha, await bcrypt.genSalt(10));
      await db.query("UPDATE usuarios SET senha = ? WHERE id = ?", [senhaCriptografada, req.utilizador.id]);
      // Quem muda a palavra-passe normalmente é porque desconfia que alguém
      // a tinha — as outras sessões (possivelmente do intruso) caem já.
      const terminadas = await sessoes.revogarOutrasSessoes(req.utilizador.id, req.sessaoJti);
      auditar(req.utilizador.id, "alterar_senha", "usuarios", req.utilizador.id, `Alterou a palavra-passe (${terminadas} outra(s) sessão(ões) terminada(s))`, req.ip);
      res.json({ mensagem: terminadas > 0 ? `Palavra-passe alterada. ${terminadas} sessão${terminadas === 1 ? "" : "ões"} noutros dispositivos foi${terminadas === 1 ? "" : "ram"} terminada${terminadas === 1 ? "" : "s"}.` : "Palavra-passe alterada com sucesso!" });
    } catch (erro) {
      console.error("Erro ao mudar password:", erro.message);
      res.status(500).json({ erro: "Falha ao alterar a palavra-passe." });
    }
  });

  /**
   * @openapi
   * /api/perfil/avatar:
   *   post:
   *     summary: Carrega/substitui o avatar do utilizador
   *     tags: [Perfil]
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema: { type: object, properties: { avatar: { type: string, format: binary } } }
   *     responses:
   *       200: { description: Avatar actualizado }
   *   delete:
   *     summary: Remove o avatar do utilizador
   *     tags: [Perfil]
   *     responses:
   *       200: { description: Avatar removido }
   */
  app.post("/api/perfil/avatar", autenticar, uploadAvatar.single("avatar"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ erro: "Nenhuma imagem enviada." });

      const [[actual]] = await db.query("SELECT avatar_url FROM usuarios WHERE id = ?", [req.utilizador.id]);
      const caminhoRelativo = `/uploads/${req.file.filename}`;
      await db.query("UPDATE usuarios SET avatar_url = ? WHERE id = ?", [caminhoRelativo, req.utilizador.id]);

      if (actual?.avatar_url) {
        fs.unlink(path.join(uploadsDir, path.basename(actual.avatar_url)), () => {});
      }
      res.json({ mensagem: "Avatar actualizado!", avatar_url: paraUrlAbsoluto(caminhoRelativo) });
    } catch (erro) {
      if (req.file) fs.unlink(req.file.path, () => {});
      console.error("Erro ao gravar avatar:", erro.message);
      res.status(500).json({ erro: "Falha ao actualizar avatar." });
    }
  });

  /**
   * @openapi
   * /api/perfil:
   *   delete:
   *     summary: Elimina a própria conta. Materiais, comentários, perguntas e respostas ficam anonimizados ("Conta eliminada"); o resto é apagado.
   *     tags: [Perfil]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [senha]
   *             properties:
   *               senha: { type: string }
   *               codigo: { type: string, description: "Obrigatório se o 2FA estiver activo: código da app ou código de recuperação" }
   *     responses:
   *       200: { description: Conta eliminada }
   *       400: { description: Palavra-passe/código errados ou único administrador }
   */
  app.delete("/api/perfil", autenticar, async (req, res) => {
    try {
      const { senha, codigo } = req.body || {};
      if (typeof senha !== "string" || !senha) return res.status(400).json({ erro: "Confirme a palavra-passe." });

      const [[utilizador]] = await db.query("SELECT id, senha, papel, 2fa_ativado, 2fa_secret FROM usuarios WHERE id = ?", [req.utilizador.id]);
      if (!utilizador) return res.status(404).json({ erro: "Utilizador não encontrado." });
      if (!(await bcrypt.compare(senha, utilizador.senha || ""))) {
        return res.status(400).json({ erro: "Palavra-passe incorrecta." });
      }
      if (utilizador["2fa_ativado"] === 1) {
        const c = String(codigo || "").trim();
        const ok = /^\d{6}$/.test(c)
          ? await totp.verificarCodigo(utilizador["2fa_secret"], c)
          : await consumirCodigoRecuperacao(utilizador.id, c);
        if (!ok) return res.status(400).json({ erro: "Código 2FA inválido." });
      }
      if (utilizador.papel === "admin") {
        const [[{ total }]] = await db.query("SELECT COUNT(*) AS total FROM usuarios WHERE papel = 'admin'");
        if (total <= 1) return res.status(400).json({ erro: "É o único administrador. Nomeie outro antes de eliminar a sua conta." });
      }

      const { email } = await eliminarConta(utilizador.id);
      auditar(null, "eliminar_conta", "usuarios", utilizador.id, `Conta ${email} eliminada pelo próprio`, req.ip);
      res.clearCookie("token", { path: "/" });
      res.json({ mensagem: "A sua conta foi eliminada. Até breve." });
    } catch (erro) {
      if (erro.status) return res.status(erro.status).json({ erro: erro.message });
      console.error("Erro ao eliminar conta:", erro.message);
      res.status(500).json({ erro: "Não foi possível eliminar a conta. Tente novamente." });
    }
  });

  app.delete("/api/perfil/avatar", autenticar, async (req, res) => {
    try {
      const [[actual]] = await db.query("SELECT avatar_url FROM usuarios WHERE id = ?", [req.utilizador.id]);
      await db.query("UPDATE usuarios SET avatar_url = NULL WHERE id = ?", [req.utilizador.id]);
      if (actual?.avatar_url) {
        fs.unlink(path.join(uploadsDir, path.basename(actual.avatar_url)), () => {});
      }
      res.json({ mensagem: "Avatar removido." });
    } catch (erro) {
      console.error("Erro ao remover avatar:", erro.message);
      res.status(500).json({ erro: "Falha ao remover avatar." });
    }
  });
};
