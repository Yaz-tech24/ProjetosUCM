const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

const db = require("../config/db");
const { paraUrlAbsoluto } = require("../utils/urls");
const validar = require("../middleware/validar");
const { autenticar } = require("../middleware/auth");
const { uploadsDir, uploadAvatar } = require("../middleware/upload");
const { schemaPerfilDados, schemaPerfilSenha } = require("../schemas");

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
      res.json({ mensagem: "Palavra-passe alterada com sucesso!" });
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
