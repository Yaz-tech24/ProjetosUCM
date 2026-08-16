const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const db = require("../config/db");
const mailer = require("../services/email");
const { getConfiguracoes, getCursos } = require("../services/plataforma");
const validar = require("../middleware/validar");
const { JWT_SECRET } = require("../middleware/auth");
const {
  limitarLogin, limitarRegisto, limitarEsqueciSenha, limitarReporSenha,
  contaBloqueada, registarFalhaLogin, limparFalhasLogin,
} = require("../middleware/rateLimiters");
const {
  schemaRegisto, schemaLogin, schemaEsqueciSenha, schemaReporSenha,
} = require("../schemas");

// Hash bcrypt fixo sem correspondência real — usado quando o email não existe,
// para que bcrypt.compare() corra sempre e o tempo de resposta não denuncie
// se a conta existe ou não (mitigação de ataques de temporização).
const SENHA_DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8xLzKLBiOJvOl5UaGz6zw2p4A5v8Nu";

module.exports = function registarRotasAuth(app) {
  // ==========================================
  // AUTENTICAÇÃO
  // ==========================================
  /**
   * @openapi
   * /api/register:
   *   post:
   *     summary: Cria uma nova conta (a primeira conta da plataforma torna-se admin automaticamente)
   *     tags: [Autenticação]
   *     security: []
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
   *               papel: { type: string, enum: [estudante, professor] }
   *               curso: { type: string }
   *     responses:
   *       201: { description: Conta criada }
   *       400: { description: Dados inválidos ou email já em uso, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
   */
  app.post("/api/register", limitarRegisto, validar(schemaRegisto), async (req, res) => {
    try {
      const { nome, email, senha, papel } = req.body;

      const cursos = await getCursos();
      const cursoValido = cursos.find(c => c.nome === req.body.curso)?.nome;
      if (!cursoValido) {
        return res.status(400).json({ erro: "Curso inválido." });
      }

      const [existentes] = await db.query(
        "SELECT id FROM usuarios WHERE email = ?",
        [email]
      );
      if (existentes.length > 0) {
        return res
          .status(400)
          .json({ erro: "Este email institucional já está em uso." });
      }

      const salt = await bcrypt.genSalt(10);
      const senhaCriptografada = await bcrypt.hash(senha, salt);

      // Bootstrap: numa instalação nova (sem nenhum utilizador ainda), a primeira
      // conta criada torna-se admin automaticamente — sem isto não haveria
      // nenhuma forma de configurar a plataforma numa instalação de raiz.
      const [[{ total }]] = await db.query("SELECT COUNT(*) AS total FROM usuarios");
      const papelFinal = total === 0 ? "admin" : papel;

      await db.query(
        "INSERT INTO usuarios (nome, email, senha, curso, papel) VALUES (?, ?, ?, ?, ?)",
        [nome, email, senhaCriptografada, cursoValido, papelFinal]
      );

      res.status(201).json({
        mensagem: papelFinal === "admin"
          ? "Conta de administrador criada com sucesso! É a primeira conta da plataforma."
          : "Utilizador criado com sucesso!",
      });

      // Email de boas-vindas — não bloqueia a resposta; falhas de envio já são
      // engolidas dentro do próprio serviço de email.
      getConfiguracoes().then(config => {
        mailer.enviarBoasVindas({
          to: email, nome, nomePlataforma: config.nome_plataforma,
          corPrimaria: config.cor_primaria, corDestaque: config.cor_destaque, logoUrl: config.logo_url,
        });
      }).catch(() => {});
    } catch (erro) {
      console.error("Erro no registo:", erro.message);
      res.status(500).json({ erro: "Erro interno ao registar utilizador." });
    }
  });

  /**
   * @openapi
   * /api/login:
   *   post:
   *     summary: Autentica um utilizador e devolve um token JWT
   *     tags: [Autenticação]
   *     security: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, senha]
   *             properties:
   *               email: { type: string }
   *               senha: { type: string }
   *     responses:
   *       200:
   *         description: Login aprovado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 token: { type: string }
   *                 utilizador: { $ref: '#/components/schemas/Utilizador' }
   *       400: { description: Credenciais inválidas, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
   *       429: { description: Demasiadas tentativas }
   */
  app.post("/api/login", limitarLogin, validar(schemaLogin), async (req, res) => {
    try {
      const { email, senha } = req.body;

      if (contaBloqueada(email)) {
        return res.status(429).json({ erro: "Demasiadas tentativas falhadas. Tente novamente dentro de 15 minutos ou recupere a palavra-passe." });
      }

      const [utilizadores] = await db.query(
        "SELECT * FROM usuarios WHERE email = ?",
        [email]
      );

      // bcrypt.compare corre sempre, mesmo sem utilizador — evita que o tempo de
      // resposta revele se o email está ou não registado (ver SENHA_DUMMY_HASH acima).
      const utilizador = utilizadores[0];
      const senhaValida = await bcrypt.compare(senha, utilizador?.senha || SENHA_DUMMY_HASH);

      if (!utilizador || !senhaValida) {
        registarFalhaLogin(email);
        // Mensagem genérica de propósito — não revela se o email existe no sistema.
        return res.status(400).json({ erro: "Email ou palavra-passe incorrectos." });
      }

      limparFalhasLogin(email);

      const token = jwt.sign(
        { id: utilizador.id, papel: utilizador.papel, nome: utilizador.nome, curso: utilizador.curso },
        JWT_SECRET,
        { expiresIn: "8h" }
      );

      res.status(200).json({
        mensagem: "Login aprovado!",
        token,
        utilizador: {
          id: utilizador.id,
          nome: utilizador.nome,
          email: utilizador.email,
          papel: utilizador.papel,
          curso: utilizador.curso,
          avatar_url: utilizador.avatar_url,
        },
      });
    } catch (erro) {
      console.error("Erro no login:", erro.message);
      res.status(500).json({ erro: "Erro interno ao validar credenciais." });
    }
  });

  // ==========================================
  // RECUPERAÇÃO DE PASSWORD
  // ==========================================
  /**
   * @openapi
   * /api/esqueci-senha:
   *   post:
   *     summary: Pede um link de recuperação de password por email
   *     tags: [Autenticação]
   *     security: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { type: object, required: [email], properties: { email: { type: string } } }
   *     responses:
   *       200: { description: "Resposta genérica (não revela se o email existe)" }
   */
  app.post("/api/esqueci-senha", limitarEsqueciSenha, validar(schemaEsqueciSenha), async (req, res) => {
    // Resposta sempre igual, quer o email exista ou não — evita confirmar a
    // quem está a fazer o pedido se um dado email tem ou não conta na plataforma.
    const respostaGenerica = { mensagem: "Se esse email existir, foi enviado um link de recuperação." };
    try {
      const { email } = req.body;
      const [[utilizador]] = await db.query("SELECT id, nome FROM usuarios WHERE email = ?", [email]);
      if (!utilizador) return res.json(respostaGenerica);

      const tokenBruto = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(tokenBruto).digest("hex");
      const expira = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

      await db.query(
        "UPDATE usuarios SET reset_token = ?, reset_token_expira = ? WHERE id = ?",
        [tokenHash, expira, utilizador.id]
      );

      res.json(respostaGenerica);

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      const config = await getConfiguracoes();
      mailer.enviarRecuperacaoPassword({
        to: email, nome: utilizador.nome,
        link: `${frontendUrl}/repor-senha?token=${tokenBruto}`,
        nomePlataforma: config.nome_plataforma, corPrimaria: config.cor_primaria, corDestaque: config.cor_destaque,
        logoUrl: config.logo_url,
      });
    } catch (erro) {
      console.error("Erro ao pedir recuperação de password:", erro.message);
      res.json(respostaGenerica);
    }
  });

  /**
   * @openapi
   * /api/repor-senha:
   *   post:
   *     summary: Repõe a password usando o token recebido por email
   *     tags: [Autenticação]
   *     security: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [token, novaSenha]
   *             properties:
   *               token: { type: string }
   *               novaSenha: { type: string, minLength: 8 }
   *     responses:
   *       200: { description: Palavra-passe reposta }
   *       400: { description: Token inválido ou expirado, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
   */
  app.post("/api/repor-senha", limitarReporSenha, validar(schemaReporSenha), async (req, res) => {
    try {
      const { token, novaSenha } = req.body;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const [[utilizador]] = await db.query(
        "SELECT id FROM usuarios WHERE reset_token = ? AND reset_token_expira > NOW()",
        [tokenHash]
      );
      if (!utilizador) {
        return res.status(400).json({ erro: "Link inválido ou expirado. Peça um novo." });
      }

      const senhaCriptografada = await bcrypt.hash(novaSenha, await bcrypt.genSalt(10));
      await db.query(
        "UPDATE usuarios SET senha = ?, reset_token = NULL, reset_token_expira = NULL WHERE id = ?",
        [senhaCriptografada, utilizador.id]
      );

      res.json({ mensagem: "Palavra-passe reposta com sucesso. Já pode entrar." });
    } catch (erro) {
      console.error("Erro ao repor password:", erro.message);
      res.status(500).json({ erro: "Erro ao repor a palavra-passe." });
    }
  });
};
