const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

const db = require("../config/db");
const mailer = require("../services/email");
const { getConfiguracoes, getCursos } = require("../services/plataforma");
const { paraUrlAbsoluto } = require("../utils/urls");
const validar = require("../middleware/validar");
const { autenticar, apenasAdmin } = require("../middleware/auth");
const { uploadsDir } = require("../middleware/upload");
const { schemaUtilizadorAdmin, emailComDominioPermitido } = require("../schemas");

module.exports = function registarRotasUtilizadores(app) {
  // ==========================================
  // GESTÃO DE UTILIZADORES (admin) — docentes e outros admins só podem ser
  // criados por aqui; o registo público (/api/register) é sempre estudante.
  // ==========================================
  /**
   * @openapi
   * /api/admin/utilizadores:
   *   get:
   *     summary: Lista todos os utilizadores da plataforma (admin)
   *     tags: [Admin]
   *     responses:
   *       200: { description: Lista de utilizadores }
   *   post:
   *     summary: Cria uma conta com qualquer papel — estudante, professor ou admin (admin)
   *     tags: [Admin]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [nome, email, senha, curso]
   *             properties:
   *               nome: { type: string }
   *               email: { type: string }
   *               senha: { type: string, minLength: 8 }
   *               papel: { type: string, enum: [estudante, professor, admin] }
   *               curso: { type: string }
   *     responses:
   *       201: { description: Conta criada, content: { application/json: { schema: { type: object, properties: { utilizador: { $ref: '#/components/schemas/Utilizador' } } } } } }
   *       400: { description: Dados inválidos, domínio de email não permitido, ou email já em uso, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
   */
  app.get("/api/admin/utilizadores", autenticar, apenasAdmin, async (req, res) => {
    try {
      const [utilizadores] = await db.query(
        "SELECT id, nome, email, papel, curso, numero_estudante, telefone, avatar_url, data_criacao FROM usuarios ORDER BY data_criacao DESC"
      );
      res.json(utilizadores.map(u => ({ ...u, avatar_url: paraUrlAbsoluto(u.avatar_url) })));
    } catch (erro) {
      console.error("Erro ao listar utilizadores:", erro.message);
      res.status(500).json({ erro: "Falha ao buscar utilizadores." });
    }
  });

  app.post("/api/admin/utilizadores", autenticar, apenasAdmin, validar(schemaUtilizadorAdmin), async (req, res) => {
    try {
      const { nome, email, senha, papel, curso, numero_estudante, telefone } = req.body;

      const config = await getConfiguracoes();
      if (!emailComDominioPermitido(email, config.dominios_email_permitidos)) {
        return res.status(400).json({ erro: "Este domínio de email não é aceite nesta plataforma." });
      }

      const cursos = await getCursos();
      const cursoValido = cursos.find(c => c.nome === curso)?.nome;
      if (!cursoValido) {
        return res.status(400).json({ erro: "Curso inválido." });
      }

      const [existentes] = await db.query("SELECT id FROM usuarios WHERE email = ?", [email]);
      if (existentes.length > 0) {
        return res.status(400).json({ erro: "Este email já está em uso." });
      }

      const senhaCriptografada = await bcrypt.hash(senha, await bcrypt.genSalt(10));
      let resultado;
      try {
        [resultado] = await db.query(
          "INSERT INTO usuarios (nome, email, senha, curso, papel, numero_estudante, telefone) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [nome, email, senhaCriptografada, cursoValido, papel, numero_estudante || null, telefone || null]
        );
      } catch (erroInsert) {
        // Mesma condição de corrida do registo público — ver comentário em routes/auth.js.
        if (erroInsert.code === "ER_DUP_ENTRY") {
          return res.status(400).json({ erro: "Este email já está em uso." });
        }
        throw erroInsert;
      }

      res.status(201).json({
        mensagem: "Conta criada com sucesso!",
        utilizador: { id: resultado.insertId, nome, email, papel, curso: cursoValido, numero_estudante: numero_estudante || null, telefone: telefone || null },
      });

      mailer.enviarBoasVindas({
        to: email, nome, nomePlataforma: config.nome_plataforma,
        corPrimaria: config.cor_primaria, corDestaque: config.cor_destaque, logoUrl: config.logo_url,
      }).catch(() => {});
    } catch (erro) {
      console.error("Erro ao criar utilizador:", erro.message);
      res.status(500).json({ erro: "Erro interno ao criar utilizador." });
    }
  });

  /**
   * @openapi
   * /api/admin/utilizadores/{id}:
   *   delete:
   *     summary: Remove uma conta de utilizador (admin)
   *     tags: [Admin]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Utilizador removido }
   *       400: { description: "Auto-remoção, último admin, ou utilizador com conteúdo associado", content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
   *       404: { description: Utilizador não encontrado }
   */
  app.delete("/api/admin/utilizadores/:id", autenticar, apenasAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ erro: "ID inválido." });

      if (id === req.utilizador.id) {
        return res.status(400).json({ erro: "Não pode remover a sua própria conta." });
      }

      const [[alvo]] = await db.query("SELECT id, papel, avatar_url FROM usuarios WHERE id = ?", [id]);
      if (!alvo) return res.status(404).json({ erro: "Utilizador não encontrado." });

      if (alvo.papel === "admin") {
        const [[{ total: totalAdmins }]] = await db.query(
          "SELECT COUNT(*) AS total FROM usuarios WHERE papel = 'admin'"
        );
        if (totalAdmins <= 1) {
          return res.status(400).json({ erro: "Não é possível remover o único administrador da plataforma." });
        }
      }

      try {
        await db.query("DELETE FROM usuarios WHERE id = ?", [id]);
      } catch (erroDelete) {
        // O utilizador tem materiais e/ou mensagens associados (FK RESTRICT) —
        // apagar em cascata seria destrutivo demais para fazer sem confirmação
        // explícita, por isso bloqueia com uma mensagem clara em vez disso.
        if (erroDelete.code === "ER_ROW_IS_REFERENCED_2" || erroDelete.code === "ER_ROW_IS_REFERENCED") {
          return res.status(400).json({
            erro: "Não é possível remover: este utilizador tem materiais ou mensagens de chat associados.",
          });
        }
        throw erroDelete;
      }

      if (alvo.avatar_url) {
        fs.unlink(path.join(uploadsDir, path.basename(alvo.avatar_url)), () => {});
      }

      res.json({ mensagem: "Utilizador removido com sucesso." });
    } catch (erro) {
      console.error("Erro ao remover utilizador:", erro.message);
      res.status(500).json({ erro: "Erro interno ao remover utilizador." });
    }
  });
};
