// ==========================================
// UCM SMARTHUB - BACKEND API (NODE.JS)
// ==========================================

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const { z } = require("zod");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const util = require("util");
const pdfParse = require("pdf-parse");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();

const swaggerUi = require("swagger-ui-express");

const db = require("./config/db");
const mailer = require("./services/email");
const swaggerSpec = require("./swagger");

const app = express();
const server = http.createServer(app);

// Origens permitidas: variável de ambiente ou localhost em desenvolvimento
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:5174")
  .split(",")
  .map(o => o.trim());

const io = socketIo(server, {
  cors: {
    origin: (origin, cb) => (!origin || CORS_ORIGINS.includes(origin) ? cb(null, true) : cb(new Error("Origem não permitida"))),
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors({
  origin: (origin, cb) => (!origin || CORS_ORIGINS.includes(origin) ? cb(null, true) : cb(new Error("Origem não permitida pelo CORS"))),
  credentials: true,
}));
app.use(helmet({
  // CSP desligada de propósito: o frontend usa muito style={{...}} inline e blocos
  // <style>{...}</style> para animações — uma CSP por defeito bloquearia isso. Os
  // restantes cabeçalhos do helmet (X-Frame-Options, X-Content-Type-Options, HSTS, etc.)
  // continuam activos.
  contentSecurityPolicy: false,
  // Desligada para não bloquear o carregamento de PDFs/vídeos/imagens de /uploads
  // quando o frontend está numa origem diferente (ex.: outro domínio/porta).
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(compression());
app.use(express.json());
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: "SmartHub API — Documentação" }));

const readFile = util.promisify(fs.readFile);

// Garante que a pasta uploads existe ao arrancar
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ─── Middleware JWT ───────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || "ucm_smarthub_dev_secret_mude_em_producao";

function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Token de autenticação em falta." });
  }
  try {
    const token = authHeader.split(" ")[1];
    req.utilizador = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ erro: "Token inválido ou expirado." });
  }
}

function apenasAdmin(req, res, next) {
  if (req.utilizador?.papel !== "admin") {
    return res.status(403).json({ erro: "Acesso restrito a administradores." });
  }
  next();
}

// ─── Rate limiting simples (sem dependências) para rotas de autenticação ──────
// Protege login/registo contra força bruta e spam de contas.
function criarLimitadorTaxa({ janelaMs, maxTentativas }) {
  const tentativasPorChave = new Map();
  return (req, res, next) => {
    const chave = req.ip;
    const agora = Date.now();
    const tentativas = (tentativasPorChave.get(chave) || []).filter(t => agora - t < janelaMs);
    if (tentativas.length >= maxTentativas) {
      return res.status(429).json({ erro: "Demasiadas tentativas. Tente novamente dentro de alguns minutos." });
    }
    tentativas.push(agora);
    tentativasPorChave.set(chave, tentativas);
    next();
  };
}
const limitarLogin = criarLimitadorTaxa({ janelaMs: 15 * 60 * 1000, maxTentativas: 10 });
const limitarRegisto = criarLimitadorTaxa({ janelaMs: 60 * 60 * 1000, maxTentativas: 8 });
// Chat de IA — cada pedido custa dinheiro (API do Gemini); sem limite, um utilizador
// autenticado podia esgotar a quota sozinho.
const limitarChat = criarLimitadorTaxa({ janelaMs: 60 * 1000, maxTentativas: 15 });
const limitarEsqueciSenha = criarLimitadorTaxa({ janelaMs: 60 * 60 * 1000, maxTentativas: 5 });

// Instância Gemini criada uma vez ao arrancar o servidor
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

async function extractPdfText(filePath) {
  const dataBuffer = await readFile(filePath);
  const parsed = await pdfParse(dataBuffer);
  return parsed.text || "";
}

// Modelos a tentar por ordem (testados e confirmados a responder com a chave configurada).
// "gemini-flash-latest" é um alias que a Google mantém apontado ao modelo "flash" mais
// recente disponível — funciona como rede de segurança extra se um modelo fixo for descontinuado.
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
];

async function gerarResumoIA(prompt, fallbackText) {
  if (!genAI) return fallbackText;

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text && text.trim().length > 0) return text;
    } catch {
      // tenta próximo modelo
    }
  }

  return fallbackText;
}

// ==========================================
// CONFIGURAÇÃO DINÂMICA — plataforma neutra, tudo gerido pelo admin
// ==========================================
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const TIPOS_FICHEIRO_VALIDOS = ["pdf", "mp4", "webm", "ogg", "mov"];
const MAPA_TIPOS_MIME = {
  pdf:  ["application/pdf"],
  mp4:  ["video/mp4", "video/x-m4v"],
  webm: ["video/webm"],
  ogg:  ["video/ogg"],
  mov:  ["video/quicktime"],
};
// Tecto técnico absoluto do multer — independente do limite configurado pelo admin,
// que é sempre aplicado depois, no handler da rota.
const TAMANHO_MAXIMO_TECTO_MB = 500;

// ─── Validação de entrada (zod) ────────────────────────────────────────────
// Middleware genérico: valida req.body contra um schema e substitui req.body
// pelos dados já convertidos/normalizados (trim, lowercase, coerção de tipos).
function validar(schema) {
  return (req, res, next) => {
    const resultado = schema.safeParse(req.body);
    if (!resultado.success) {
      const primeiro = resultado.error.issues[0];
      return res.status(400).json({ erro: primeiro?.message || "Dados inválidos." });
    }
    req.body = resultado.data;
    next();
  };
}

const schemaRegisto = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
  email: z.string().trim().toLowerCase().pipe(z.email("Email inválido.")),
  senha: z.string().min(6, "A palavra-passe deve ter pelo menos 6 caracteres."),
  papel: z.enum(["estudante", "professor"]).catch("estudante"),
  curso: z.string().trim().min(1, "Curso inválido."),
});

const schemaLogin = z.object({
  email: z.string().trim().toLowerCase(),
  senha: z.string().min(1, "Palavra-passe é obrigatória."),
});

const schemaMaterial = z.object({
  titulo: z.string().trim().min(1, "O título é obrigatório."),
  cadeira: z.string().trim().min(1, "Disciplina inválida."),
  tipo: z.enum(["PDF", "Vídeo"], { message: "Tipo de material inválido." }),
});

const schemaConfig = z.object({
  nome_plataforma: z.string().trim().min(1, "O nome da plataforma é obrigatório."),
  tagline: z.string().trim().catch(""),
  descricao_proposito: z.string().trim().catch(""),
  cor_primaria: z.string().regex(HEX_COLOR_REGEX, "Cores inválidas — use o formato #rrggbb."),
  cor_destaque: z.string().regex(HEX_COLOR_REGEX, "Cores inválidas — use o formato #rrggbb."),
  contacto_email: z.string().trim().catch(""),
  localizacao: z.string().trim().catch(""),
  link_facebook: z.string().trim().catch(""),
  link_instagram: z.string().trim().catch(""),
  link_linkedin: z.string().trim().catch(""),
  chat_activado: z.coerce.boolean(),
  ia_activada: z.coerce.boolean(),
  moderacao_ia_activada: z.coerce.boolean(),
  tipos_ficheiro_permitidos: z.array(z.enum(TIPOS_FICHEIRO_VALIDOS))
    .min(1, "Seleccione pelo menos um tipo de ficheiro permitido."),
  tamanho_maximo_mb: z.coerce.number().int().min(1).max(TAMANHO_MAXIMO_TECTO_MB),
});

const schemaCurso = z.object({
  nome: z.string().trim().min(1, "O nome do curso é obrigatório."),
});

const schemaPerfilNome = z.object({
  nome: z.string().trim().min(1, "O nome é obrigatório."),
});

const schemaPerfilSenha = z.object({
  senha_actual: z.string().min(1, "Indique a palavra-passe actual."),
  nova_senha: z.string().min(6, "A nova palavra-passe deve ter pelo menos 6 caracteres."),
});

const schemaEsqueciSenha = z.object({
  email: z.string().trim().toLowerCase(),
});

const schemaReporSenha = z.object({
  token: z.string().min(1, "Token em falta."),
  novaSenha: z.string().min(6, "A nova palavra-passe deve ter pelo menos 6 caracteres."),
});

async function getConfiguracoes() {
  const [[config]] = await db.query("SELECT * FROM configuracoes WHERE id = 1");
  return config || {};
}

async function getCursos() {
  const [rows] = await db.query("SELECT id, nome FROM cursos ORDER BY nome ASC");
  return rows;
}

async function getEstatisticas() {
  const [[{ total_materiais }]] = await db.query(
    "SELECT COUNT(*) as total_materiais FROM materiais WHERE status = 'aprovado'"
  );
  const [[{ total_utilizadores }]] = await db.query(
    "SELECT COUNT(*) as total_utilizadores FROM usuarios"
  );
  const [[{ total_mensagens }]] = await db.query(
    "SELECT COUNT(*) as total_mensagens FROM mensagens_estudantes"
  );
  const [[{ total_pdfs }]] = await db.query(
    "SELECT COUNT(*) as total_pdfs FROM materiais WHERE status = 'aprovado' AND tipo = 'PDF'"
  );
  const [[{ total_videos }]] = await db.query(
    "SELECT COUNT(*) as total_videos FROM materiais WHERE status = 'aprovado' AND tipo = 'Vídeo'"
  );
  const [[{ materiais_hoje }]] = await db.query(
    "SELECT COUNT(*) as materiais_hoje FROM materiais WHERE status = 'aprovado' AND DATE(data_upload) = CURDATE()"
  );
  return { total_materiais, total_utilizadores, total_mensagens, total_pdfs, total_videos, materiais_hoje };
}

// Verifica com a IA se um material corresponde ao propósito configurado da plataforma.
// Nunca bloqueia sozinha — apenas sinaliza para revisão humana no painel de admin.
// Em caso de erro/resposta inesperada, falha "aberta" (não sinaliza), para nunca travar
// uploads legítimos por uma falha da IA.
// `cliente` é injectável (por defeito o genAI real) para permitir testar esta
// função com um cliente falso, sem depender de mocking do módulo do SDK.
async function verificarConformidadeIA(config, { titulo, cadeira, tipo }, cliente = genAI) {
  if (!config.moderacao_ia_activada || !cliente) return { sinalizado: false, motivo: null };

  const prompt = `Avalia se o material académico abaixo é compatível com o propósito desta plataforma.

Propósito da plataforma: ${config.descricao_proposito || "Plataforma académica para partilha de materiais de estudo."}

Material submetido:
Título: ${titulo}
Disciplina/curso: ${cadeira}
Tipo: ${tipo}

Responde APENAS com um JSON válido, sem texto adicional, neste formato exacto:
{"conforme": true, "motivo": ""}
ou, se não corresponder ao propósito:
{"conforme": false, "motivo": "razão curta e específica em português"}`;

  try {
    const model = cliente.getGenerativeModel({ model: GEMINI_MODELS[0] });
    const result = await model.generateContent(prompt);
    const texto = result.response.text().trim();
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { sinalizado: false, motivo: null };

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.conforme === false) {
      return { sinalizado: true, motivo: String(parsed.motivo || "Possível desvio do propósito da plataforma.").slice(0, 500) };
    }
    return { sinalizado: false, motivo: null };
  } catch (erro) {
    console.error("Erro na moderação por IA (a ignorar, não bloqueia o upload):", erro.message);
    return { sinalizado: false, motivo: null };
  }
}

// Serve ficheiros da pasta uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ==========================================
// MULTER — materiais (tipos/tamanho reais validados no handler, a partir da configuração)
// ==========================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const nomeUnico = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extensao = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + nomeUnico + extensao);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: TAMANHO_MAXIMO_TECTO_MB * 1024 * 1024 },
  fileFilter: async (req, file, cb) => {
    try {
      const config = await getConfiguracoes();
      const mimesPermitidos = (config.tipos_ficheiro_permitidos || "")
        .split(",").map(t => t.trim()).filter(Boolean)
        .flatMap(t => MAPA_TIPOS_MIME[t] || []);
      if (mimesPermitidos.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Tipo de ficheiro não permitido pela configuração actual da plataforma."));
      }
    } catch {
      cb(new Error("Não foi possível validar o tipo de ficheiro."));
    }
  },
});

// ─── Multer — logótipo da plataforma (imagens pequenas) ──────────────────────
const TIPOS_IMAGEM = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const filtroImagem = (req, file, cb) => {
  if (TIPOS_IMAGEM.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Formato de imagem não suportado. Use PNG, JPG, SVG ou WebP."));
  }
};

const uploadLogo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `logo-${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB é mais que suficiente para um logótipo
  fileFilter: filtroImagem,
});

// ─── Multer — avatar de utilizador ────────────────────────────────────────
const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `avatar-${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: filtroImagem,
});

// ==========================================
// AUTENTICAÇÃO
// ==========================================
/**
 * @openapi
 * /api/register:
 *   post:
 *     summary: Cria uma nova conta
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
 *               senha: { type: string, minLength: 6 }
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

    await db.query(
      "INSERT INTO usuarios (nome, email, senha, curso, papel) VALUES (?, ?, ?, ?, ?)",
      [nome, email, senhaCriptografada, cursoValido, papel]
    );

    res.status(201).json({ mensagem: "Utilizador criado com sucesso!" });

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

    const [utilizadores] = await db.query(
      "SELECT * FROM usuarios WHERE email = ?",
      [email]
    );

    if (utilizadores.length === 0) {
      return res.status(400).json({ erro: "Utilizador não encontrado no sistema." });
    }

    const utilizador = utilizadores[0];
    const senhaValida = await bcrypt.compare(senha, utilizador.senha);

    if (!senhaValida) {
      return res.status(400).json({ erro: "Palavra-passe incorreta." });
    }

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
 *               novaSenha: { type: string, minLength: 6 }
 *     responses:
 *       200: { description: Palavra-passe reposta }
 *       400: { description: Token inválido ou expirado, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
 */
app.post("/api/repor-senha", validar(schemaReporSenha), async (req, res) => {
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

// ==========================================
// PERFIL DO UTILIZADOR
// ==========================================
/**
 * @openapi
 * /api/perfil:
 *   put:
 *     summary: Actualiza o nome do próprio perfil
 *     tags: [Perfil]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [nome], properties: { nome: { type: string } } }
 *     responses:
 *       200:
 *         description: Perfil actualizado
 *         content: { application/json: { schema: { type: object, properties: { utilizador: { $ref: '#/components/schemas/Utilizador' } } } } }
 *       401: { description: Não autenticado }
 */
app.put("/api/perfil", autenticar, validar(schemaPerfilNome), async (req, res) => {
  try {
    await db.query("UPDATE usuarios SET nome = ? WHERE id = ?", [req.body.nome, req.utilizador.id]);
    const [[utilizador]] = await db.query(
      "SELECT id, nome, email, papel, curso, avatar_url FROM usuarios WHERE id = ?",
      [req.utilizador.id]
    );
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
 *               nova_senha: { type: string, minLength: 6 }
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
    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
    const avatar_url = `${baseUrl}/uploads/${req.file.filename}`;
    await db.query("UPDATE usuarios SET avatar_url = ? WHERE id = ?", [avatar_url, req.utilizador.id]);

    if (actual?.avatar_url) {
      fs.unlink(path.join(uploadsDir, path.basename(actual.avatar_url)), () => {});
    }
    res.json({ mensagem: "Avatar actualizado!", avatar_url });
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

// ==========================================
// REPOSITÓRIO E MODERAÇÃO
// ==========================================
/**
 * @openapi
 * /api/materiais:
 *   get:
 *     summary: Lista materiais aprovados (paginado, com filtros)
 *     tags: [Materiais]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 12 }
 *       - in: query
 *         name: busca
 *         schema: { type: string }
 *       - in: query
 *         name: tipo
 *         schema: { type: string, enum: [PDF, Vídeo] }
 *       - in: query
 *         name: cadeira
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista paginada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 materiais: { type: array, items: { $ref: '#/components/schemas/Material' } }
 *                 pagination: { type: object }
 *   post:
 *     summary: Submete um novo material para aprovação
 *     tags: [Materiais]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [titulo, cadeira, tipo, arquivo]
 *             properties:
 *               titulo: { type: string }
 *               cadeira: { type: string }
 *               tipo: { type: string, enum: [PDF, Vídeo] }
 *               arquivo: { type: string, format: binary }
 *     responses:
 *       201: { description: Enviado para aprovação }
 *       400: { description: Dados ou ficheiro inválidos, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
 */
app.get("/api/materiais", async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
    const offset = (page - 1) * limit;
    const busca   = req.query.busca   ? `%${req.query.busca}%` : null;
    const tipo    = req.query.tipo    || null; // "PDF" | "Vídeo" | null = todos
    const cadeira = req.query.cadeira || null; // filtro por disciplina

    const params = [];
    let where = "WHERE m.status = 'aprovado'";

    if (busca)   { where += " AND m.titulo LIKE ?"; params.push(busca);   }
    if (tipo)    { where += " AND m.tipo = ?";      params.push(tipo);    }
    if (cadeira) { where += " AND m.cadeira = ?";   params.push(cadeira); }

    const [materiais] = await db.query(
      `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.url_arquivo, m.data_upload, m.status, u.nome AS autor
       FROM materiais m
       JOIN usuarios u ON m.autor_id = u.id
       ${where}
       ORDER BY m.data_upload DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM materiais m ${where}`,
      params
    );

    res.status(200).json({
      materiais,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (erro) {
    console.error("Erro ao listar materiais:", erro.message);
    res.status(500).json({ erro: "Falha ao buscar materiais." });
  }
});

/**
 * @openapi
 * /api/materiais/{id}:
 *   get:
 *     summary: Obtém um material aprovado pelo ID
 *     tags: [Materiais]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Material encontrado, content: { application/json: { schema: { $ref: '#/components/schemas/Material' } } } }
 *       404: { description: Não encontrado, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
 */
app.get("/api/materiais/:id", async (req, res) => {
  try {
    const materialId = parseInt(req.params.id, 10);
    const [resultado] = await db.query(
      `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.url_arquivo, m.data_upload, m.status, u.nome AS autor
       FROM materiais m
       JOIN usuarios u ON m.autor_id = u.id
       WHERE m.status = 'aprovado' AND m.id = ?`,
      [materialId]
    );

    if (resultado.length === 0) {
      return res.status(404).json({ erro: "Material não encontrado." });
    }
    res.status(200).json(resultado[0]);
  } catch (erro) {
    console.error("Erro ao buscar material:", erro.message);
    res.status(500).json({ erro: "Falha ao buscar material." });
  }
});

/**
 * @openapi
 * /api/materiais/{id}/resumo:
 *   get:
 *     summary: Gera (ou devolve) o resumo por IA de um material
 *     tags: [Materiais]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Resumo gerado, content: { application/json: { schema: { type: object, properties: { resumo: { type: string } } } } } }
 *       404: { description: Material não encontrado }
 *       503: { description: IA desactivada pelo administrador }
 */
app.get("/api/materiais/:id/resumo", autenticar, async (req, res) => {
  try {
    const config = await getConfiguracoes();
    if (!config.ia_activada) {
      return res.status(503).json({ erro: "Resumos por IA desactivados pelo administrador." });
    }

    const materialId = parseInt(req.params.id, 10);
    const [resultado] = await db.query(
      `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.url_arquivo, u.nome AS autor
       FROM materiais m
       JOIN usuarios u ON m.autor_id = u.id
       WHERE m.status = 'aprovado' AND m.id = ?`,
      [materialId]
    );

    if (resultado.length === 0) {
      return res.status(404).json({ erro: "Material não encontrado." });
    }

    const material = resultado[0];
    let resumoTexto = "";

    if (material.tipo === "PDF") {
      const fileName = path.basename(material.url_arquivo);
      const filePath = path.join(__dirname, "uploads", fileName);

      if (!fs.existsSync(filePath)) {
        console.error("PDF não encontrado no disco:", filePath);
        return res.status(404).json({ erro: "Ficheiro PDF não encontrado no servidor." });
      }

      let pdfText = "";
      try {
        pdfText = await extractPdfText(filePath);
      } catch (pdfErro) {
        console.error("Erro ao extrair texto do PDF:", pdfErro.message);
        // Continua sem texto — Gemini usará título e disciplina
      }

      const trimmedText = pdfText.slice(0, 12000);
      const temTexto = trimmedText.trim().length > 0;

      const promptResumo = temTexto
        ? `És o assistente académico de IA da plataforma "${config.nome_plataforma}".

Analisa o documento académico abaixo e produz um resumo de estudo completo em português europeu.

USA EXACTAMENTE este formato de secções (os títulos em maiúsculas são obrigatórios):

VISÃO GERAL
[2 a 3 frases que expliquem o tema central do documento, o seu propósito e a sua importância para a disciplina]

CONCEITOS FUNDAMENTAIS
• [Nome do conceito]: [Definição clara e precisa em 1-2 frases]
• [Repete para cada conceito relevante — mínimo 3, máximo 7]

MÉTODOS E PROCEDIMENTOS
• [Descreve cada método, fórmula, processo ou técnica que o estudante deve saber aplicar]
• [Inclui passos ou condições de aplicação quando relevante]
• [Omite esta secção se o material for puramente teórico]

PONTOS-CHAVE PARA O EXAME
• [Tema ou questão com alta probabilidade de aparecer na avaliação]
• [Mínimo 3, máximo 5 pontos — específicos e accionáveis]

DICA DE ESTUDO
[1 a 2 frases com uma estratégia concreta e eficaz para estudar este material específico]

REGRAS ABSOLUTAS:
- Usa EXACTAMENTE os títulos de secção em maiúsculas como indicado
- Cada bullet começa obrigatoriamente com "• " (bullet + espaço)
- Baseia-te APENAS no conteúdo do documento — nunca inventes factos
- Português europeu, linguagem académica mas acessível ao estudante universitário
- Não uses markdown (**negrito**, _itálico_) — texto simples apenas

Documento:
Título: ${material.titulo}
Disciplina: ${material.cadeira}

Conteúdo:
${trimmedText}`
        : `És o assistente académico de IA da plataforma "${config.nome_plataforma}".

Com base no título e disciplina abaixo, cria um resumo de estudo estruturado em português europeu.

USA EXACTAMENTE este formato:

VISÃO GERAL
[2-3 frases sobre o que esta matéria aborda e a sua importância na disciplina]

CONCEITOS FUNDAMENTAIS
• [Conceito essencial 1 desta disciplina/tema]: [Definição]
• [Conceito essencial 2]: [Definição]
• [Conceito essencial 3]: [Definição]

PONTOS-CHAVE PARA O EXAME
• [Ponto 1 que normalmente sai nos exames desta matéria]
• [Ponto 2]
• [Ponto 3]

DICA DE ESTUDO
[Estratégia concreta para estudar este tema]

Título: ${material.titulo}
Disciplina: ${material.cadeira}`;

      const fallback = `VISÃO GERAL
Este documento aborda os conceitos fundamentais de ${material.cadeira} apresentados em "${material.titulo}". Compreender esta matéria é essencial para o aproveitamento académico na disciplina.

CONCEITOS FUNDAMENTAIS
• Definições base: Identifique e memorize os termos técnicos e definições centrais apresentados pelo autor.
• Princípios teóricos: Compreenda os fundamentos que sustentam a disciplina e as suas aplicações práticas.
• Relações entre conceitos: Analise como os diferentes tópicos se relacionam entre si.

PONTOS-CHAVE PARA O EXAME
• Questões de definição e identificação de conceitos teóricos.
• Aplicação prática dos métodos e procedimentos estudados.
• Análise e interpretação de casos práticos da disciplina.

DICA DE ESTUDO
Leia o material duas vezes: primeiro para compreensão geral, depois sublinhando os conceitos-chave. Crie um mapa mental ligando os tópicos principais antes de resolver exercícios práticos.`;

      resumoTexto = await gerarResumoIA(promptResumo, fallback);
    } else {
      // Vídeo ou outro tipo
      const promptResumo = `És o assistente académico de IA da plataforma "${config.nome_plataforma}".

Com base nos metadados do material abaixo, gera 3 notas de estudo em português europeu, numeradas de 1 a 3, úteis para quem vai ver ou rever este conteúdo:

1. O que aprender — o tema ou competência central que este material ensina
2. Como estudar — a abordagem prática recomendada para tirar o máximo partido do conteúdo
3. Para o exame — o conceito ou questão mais provável em avaliação desta matéria

Título: ${material.titulo}
Disciplina: ${material.cadeira}
Tipo de material: ${material.tipo}

Responde APENAS com as 3 notas numeradas. Sem introdução, sem conclusão.`;

      const fallback = `1. Este material aborda os conceitos essenciais de ${material.cadeira} — foque-se nas definições e princípios apresentados.
2. Tome notas durante a visualização e relacione cada conceito com exemplos da vida real ou de exercícios do manual.
3. Reveja os temas que normalmente aparecem nos exames de ${material.cadeira} e verifique se o material os cobre.`;

      resumoTexto = await gerarResumoIA(promptResumo, fallback);
    }

    res.status(200).json({ resumo: resumoTexto });
  } catch (erro) {
    console.error("Erro ao gerar resumo:", erro.message);
    res.status(500).json({ erro: "Falha ao gerar resumo do material." });
  }
});

app.post("/api/materiais", autenticar, upload.single("arquivo"), async (req, res) => {
  // Remove o ficheiro que o multer já gravou em disco, caso a validação ou a BD falhem
  const limparFicheiroOrfao = () => {
    if (req.file) fs.unlink(req.file.path, () => {});
  };

  try {
    if (!req.file) {
      return res.status(400).json({ erro: "Por favor, anexe um ficheiro." });
    }

    const parsed = schemaMaterial.safeParse(req.body);
    if (!parsed.success) {
      limparFicheiroOrfao();
      return res.status(400).json({ erro: parsed.error.issues[0]?.message || "Dados inválidos." });
    }
    const { titulo, cadeira, tipo } = parsed.data;

    const config = await getConfiguracoes();

    const limiteBytes = (config.tamanho_maximo_mb || 100) * 1024 * 1024;
    if (req.file.size > limiteBytes) {
      limparFicheiroOrfao();
      return res.status(400).json({ erro: `Ficheiro demasiado grande. Limite actual: ${config.tamanho_maximo_mb} MB.` });
    }

    const cursos = await getCursos();
    if (!cursos.some(c => c.nome === cadeira)) {
      limparFicheiroOrfao();
      return res.status(400).json({ erro: "Disciplina inválida." });
    }

    const { sinalizado, motivo } = await verificarConformidadeIA(config, { titulo, cadeira, tipo });

    // Usa sempre o ID do utilizador autenticado — ignora qualquer autor_id do body
    const autor_id = req.utilizador.id;
    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
    const url_arquivo = `${baseUrl}/uploads/${req.file.filename}`;
    const [resultado] = await db.query(
      "INSERT INTO materiais (titulo, cadeira, tipo, url_arquivo, autor_id, status, ia_sinalizado, ia_motivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [titulo, cadeira, tipo, url_arquivo, autor_id, "pendente", sinalizado, motivo]
    );

    res.status(201).json({
      mensagem: "Ficheiro enviado para aprovação.",
      id_novo_material: resultado.insertId,
    });
  } catch (erro) {
    limparFicheiroOrfao();
    console.error("Erro ao gravar material:", erro.message);
    res.status(500).json({ erro: "Erro ao gravar ficheiro na base de dados." });
  }
});

/**
 * @openapi
 * /api/admin/pendentes:
 *   get:
 *     summary: Lista materiais à espera de aprovação (admin)
 *     tags: [Admin]
 *     responses:
 *       200: { description: Lista de pendentes, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Material' } } } } }
 *       403: { description: Acesso restrito a administradores }
 */
app.get("/api/admin/pendentes", autenticar, apenasAdmin, async (req, res) => {
  try {
    const [materiais] = await db.query(
      `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.data_upload, m.ia_sinalizado, m.ia_motivo, u.nome AS autor
       FROM materiais m JOIN usuarios u ON m.autor_id = u.id
       WHERE m.status = 'pendente' ORDER BY m.data_upload ASC`
    );
    res.status(200).json(materiais);
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao buscar materiais pendentes." });
  }
});

// ==========================================
// CONFIGURAÇÃO DA PLATAFORMA — identidade, cores, funcionalidades, cursos
// ==========================================
/**
 * @openapi
 * /api/config:
 *   get:
 *     summary: Devolve a configuração pública da plataforma e a lista de cursos
 *     tags: [Configuração]
 *     security: []
 *     responses:
 *       200:
 *         description: Configuração actual
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configuracoes: { $ref: '#/components/schemas/Configuracao' }
 *                 cursos: { type: array, items: { $ref: '#/components/schemas/Curso' } }
 */
app.get("/api/config", async (req, res) => {
  try {
    const [configuracoes, cursos] = await Promise.all([getConfiguracoes(), getCursos()]);
    res.json({ configuracoes, cursos });
  } catch (erro) {
    console.error("Erro ao buscar configuração:", erro.message);
    res.status(500).json({ erro: "Falha ao buscar configuração." });
  }
});

/**
 * @openapi
 * /api/admin/config:
 *   put:
 *     summary: Actualiza a configuração da plataforma (admin)
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Configuracao' }
 *     responses:
 *       200: { description: Configuração actualizada }
 *       400: { description: Dados inválidos, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
 */
app.put("/api/admin/config", autenticar, apenasAdmin, validar(schemaConfig), async (req, res) => {
  try {
    const {
      nome_plataforma, tagline, descricao_proposito, cor_primaria, cor_destaque,
      contacto_email, localizacao, link_facebook, link_instagram, link_linkedin,
      chat_activado, ia_activada, moderacao_ia_activada,
      tipos_ficheiro_permitidos, tamanho_maximo_mb,
    } = req.body;

    await db.query(
      `UPDATE configuracoes SET
         nome_plataforma = ?, tagline = ?, descricao_proposito = ?, cor_primaria = ?, cor_destaque = ?,
         contacto_email = ?, localizacao = ?, link_facebook = ?, link_instagram = ?, link_linkedin = ?,
         chat_activado = ?, ia_activada = ?, moderacao_ia_activada = ?,
         tipos_ficheiro_permitidos = ?, tamanho_maximo_mb = ?
       WHERE id = 1`,
      [
        nome_plataforma, tagline, descricao_proposito,
        cor_primaria, cor_destaque, contacto_email, localizacao,
        link_facebook, link_instagram, link_linkedin,
        chat_activado, ia_activada, moderacao_ia_activada,
        tipos_ficheiro_permitidos.join(","), tamanho_maximo_mb,
      ]
    );

    res.json({ mensagem: "Configuração actualizada com sucesso!", configuracoes: await getConfiguracoes() });
  } catch (erro) {
    console.error("Erro ao actualizar configuração:", erro.message);
    res.status(500).json({ erro: "Falha ao actualizar configuração." });
  }
});

/**
 * @openapi
 * /api/admin/config/logo:
 *   post:
 *     summary: Carrega/substitui o logótipo da plataforma (admin)
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema: { type: object, properties: { logo: { type: string, format: binary } } }
 *     responses:
 *       200: { description: Logótipo actualizado }
 *   delete:
 *     summary: Remove o logótipo da plataforma (admin, volta ao ícone por defeito)
 *     tags: [Admin]
 *     responses:
 *       200: { description: Logótipo removido }
 */
app.post("/api/admin/config/logo", autenticar, apenasAdmin, uploadLogo.single("logo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: "Nenhuma imagem enviada." });

    const configAntiga = await getConfiguracoes();
    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
    const logo_url = `${baseUrl}/uploads/${req.file.filename}`;
    await db.query("UPDATE configuracoes SET logo_url = ? WHERE id = 1", [logo_url]);

    if (configAntiga.logo_url) {
      fs.unlink(path.join(uploadsDir, path.basename(configAntiga.logo_url)), () => {});
    }
    res.json({ mensagem: "Logótipo actualizado!", logo_url });
  } catch (erro) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error("Erro ao gravar logótipo:", erro.message);
    res.status(500).json({ erro: "Falha ao actualizar logótipo." });
  }
});

app.delete("/api/admin/config/logo", autenticar, apenasAdmin, async (req, res) => {
  try {
    const config = await getConfiguracoes();
    await db.query("UPDATE configuracoes SET logo_url = NULL WHERE id = 1");
    if (config.logo_url) {
      fs.unlink(path.join(uploadsDir, path.basename(config.logo_url)), () => {});
    }
    res.json({ mensagem: "Logótipo removido." });
  } catch (erro) {
    console.error("Erro ao remover logótipo:", erro.message);
    res.status(500).json({ erro: "Falha ao remover logótipo." });
  }
});

/**
 * @openapi
 * /api/admin/cursos:
 *   post:
 *     summary: Adiciona um curso/disciplina (admin)
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [nome], properties: { nome: { type: string } } }
 *     responses:
 *       201: { description: Curso adicionado }
 *       400: { description: "Nome inválido ou já existe", content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
 * /api/admin/cursos/{id}:
 *   put:
 *     summary: Renomeia um curso (admin)
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [nome], properties: { nome: { type: string } } }
 *     responses:
 *       200: { description: Curso actualizado }
 *   delete:
 *     summary: Remove um curso da lista (admin)
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Curso removido }
 */
app.post("/api/admin/cursos", autenticar, apenasAdmin, validar(schemaCurso), async (req, res) => {
  try {
    const { nome } = req.body;
    await db.query("INSERT INTO cursos (nome) VALUES (?)", [nome]);
    res.status(201).json({ mensagem: "Curso adicionado.", cursos: await getCursos() });
  } catch (erro) {
    if (erro.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ erro: "Este curso já existe." });
    }
    console.error("Erro ao adicionar curso:", erro.message);
    res.status(500).json({ erro: "Falha ao adicionar curso." });
  }
});

app.put("/api/admin/cursos/:id", autenticar, apenasAdmin, validar(schemaCurso), async (req, res) => {
  try {
    const { nome } = req.body;
    await db.query("UPDATE cursos SET nome = ? WHERE id = ?", [nome, req.params.id]);
    res.json({ mensagem: "Curso actualizado.", cursos: await getCursos() });
  } catch (erro) {
    if (erro.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ erro: "Este curso já existe." });
    }
    console.error("Erro ao actualizar curso:", erro.message);
    res.status(500).json({ erro: "Falha ao actualizar curso." });
  }
});

app.delete("/api/admin/cursos/:id", autenticar, apenasAdmin, async (req, res) => {
  try {
    await db.query("DELETE FROM cursos WHERE id = ?", [req.params.id]);
    res.json({ mensagem: "Curso removido.", cursos: await getCursos() });
  } catch (erro) {
    console.error("Erro ao remover curso:", erro.message);
    res.status(500).json({ erro: "Falha ao remover curso." });
  }
});

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

// Materiais enviados pelo próprio utilizador
/**
 * @openapi
 * /api/meus-materiais:
 *   get:
 *     summary: Lista os materiais submetidos pelo próprio utilizador
 *     tags: [Materiais]
 *     responses:
 *       200: { description: Lista de materiais, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Material' } } } } }
 */
app.get("/api/meus-materiais", autenticar, async (req, res) => {
  try {
    const [materiais] = await db.query(
      `SELECT id, titulo, cadeira, tipo, status, data_upload
       FROM materiais
       WHERE autor_id = ?
       ORDER BY data_upload DESC
       LIMIT 20`,
      [req.utilizador.id]
    );
    res.json(materiais);
  } catch (erro) {
    console.error("Erro ao buscar meus materiais:", erro.message);
    res.status(500).json({ erro: "Falha ao buscar os seus materiais." });
  }
});

/**
 * @openapi
 * /api/admin/materiais/{id}/status:
 *   put:
 *     summary: Aprova ou rejeita um material pendente (admin)
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [acao], properties: { acao: { type: string, enum: [aprovar, rejeitar] } } }
 *     responses:
 *       200: { description: Material processado }
 *       400: { description: Acção inválida, content: { application/json: { schema: { $ref: '#/components/schemas/Erro' } } } }
 */
app.put("/api/admin/materiais/:id/status", autenticar, apenasAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { acao } = req.body;

    if (acao !== "aprovar" && acao !== "rejeitar") {
      return res.status(400).json({ erro: "Acção inválida. Use 'aprovar' ou 'rejeitar'." });
    }

    const [[material]] = await db.query(
      `SELECT m.titulo, m.url_arquivo, u.email AS autor_email, u.nome AS autor_nome
       FROM materiais m JOIN usuarios u ON m.autor_id = u.id
       WHERE m.id = ?`,
      [id]
    );

    if (acao === "aprovar") {
      await db.query("UPDATE materiais SET status = 'aprovado' WHERE id = ?", [id]);
      res.json({ mensagem: "Material aprovado com sucesso!" });
    } else {
      await db.query("DELETE FROM materiais WHERE id = ?", [id]);
      if (material?.url_arquivo) {
        const fileName = path.basename(material.url_arquivo);
        fs.unlink(path.join(uploadsDir, fileName), () => {});
      }
      res.json({ mensagem: "Material rejeitado e apagado." });
    }

    // Notifica o autor por email — não bloqueia a resposta nem falha a moderação.
    if (material) {
      getConfiguracoes().then(config => {
        mailer.enviarModeracaoMaterial({
          to: material.autor_email, nome: material.autor_nome, titulo: material.titulo,
          aprovado: acao === "aprovar",
          nomePlataforma: config.nome_plataforma, corPrimaria: config.cor_primaria, corDestaque: config.cor_destaque,
          logoUrl: config.logo_url,
        });
      }).catch(() => {});
    }
  } catch (erro) {
    console.error("Erro na moderação:", erro.message);
    res.status(500).json({ erro: "Erro ao processar moderação." });
  }
});

// ==========================================
// CHAT COM IA (GEMINI) — protegido por autenticação
// ==========================================
/**
 * @openapi
 * /api/chat:
 *   post:
 *     summary: Envia uma pergunta ao assistente académico de IA
 *     tags: [Chat IA]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [mensagem], properties: { mensagem: { type: string } } }
 *     responses:
 *       200: { description: Resposta da IA, content: { application/json: { schema: { type: object, properties: { resposta: { type: string } } } } } }
 *       429: { description: Demasiados pedidos }
 *       503: { description: IA desactivada ou não configurada }
 */
app.post("/api/chat", autenticar, limitarChat, async (req, res) => {
  try {
    const { mensagem } = req.body;
    if (!mensagem || !mensagem.trim()) {
      return res.status(400).json({ erro: "Mensagem em falta." });
    }

    const config = await getConfiguracoes();
    if (!config.ia_activada) {
      return res.status(503).json({ erro: "Assistente de IA desactivado pelo administrador." });
    }
    if (!genAI) {
      return res.status(503).json({ erro: "Serviço de IA não configurado." });
    }

    const utilizadorNome = req.utilizador?.nome || "estudante";
    const utilizadorCurso = req.utilizador?.curso || "";
    const dataHoje = new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
    const prompt = `És o assistente académico de IA oficial da plataforma "${config.nome_plataforma}".

Identidade e tom:
- Culto, directo e encorajador — como um tutor experiente que respeita o tempo do estudante
- Trata o estudante pelo primeiro nome quando adequado
- Português europeu, linguagem académica mas acessível

Capacidades:
- Explicar conceitos de qualquer disciplina com clareza e exemplos concretos
- Para exercícios matemáticos, físicos ou técnicos: mostra os passos intermédios
- Sugerir métodos de estudo, técnicas de memorização e preparação para exames
- Orientar na estrutura de trabalhos académicos e relatórios

Regras de resposta:
- Extensão: máximo 5 frases corridas OU uma lista de 3 pontos numerados — escolhe o formato mais adequado à pergunta
- Vai sempre directo ao essencial — sem introduções, sem "Claro que sim!", sem despedidas
- Se não souberes algo com certeza, diz claramente e indica onde pesquisar
- Nunca inventes factos, datas, autores ou resultados
- Evita emojis — usa linguagem para transmitir energia e precisão

Contexto da sessão:
- Estudante: ${utilizadorNome}${utilizadorCurso ? ` | Curso: ${utilizadorCurso}` : ""}
- Data: ${dataHoje}

Pergunta do estudante: ${mensagem}`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(prompt);
    const resposta = result.response.text();
    res.status(200).json({ resposta });
  } catch (erro) {
    console.error("Erro na IA chat:", erro.message);
    res.status(500).json({
      erro: "A IA está temporariamente indisponível. Tente novamente em instantes.",
    });
  }
});

// ==========================================
// SOCKET.IO — CHAT ENTRE ESTUDANTES (SALAS POR CURSO)
// ==========================================
io.on("connection", (socket) => {
  // Cliente pede para entrar numa sala de curso
  socket.on("joinRoom", ({ curso }) => {
    const sala = curso || "Geral";
    // Sai de todas as salas excepto a própria do socket
    socket.rooms.forEach((room) => {
      if (room !== socket.id) socket.leave(room);
    });
    socket.join(sala);
  });

  socket.on("sendMessage", async (data) => {
    const { message, userId, userName, curso } = data;
    const sala = curso || "Geral";
    try {
      const [resultado] = await db.query(
        "INSERT INTO mensagens_estudantes (user_id, message, timestamp, curso) VALUES (?, ?, NOW(), ?)",
        [userId, message, sala]
      );
      // Emite com o ID da BD para permitir apagar em tempo real
      io.to(sala).emit("message", { id: resultado.insertId, message, userId, userName, timestamp: new Date(), curso: sala });
    } catch (error) {
      // Fallback: se a coluna curso não existir ainda, guarda sem ela
      try {
        await db.query(
          "INSERT INTO mensagens_estudantes (user_id, message, timestamp) VALUES (?, ?, NOW())",
          [userId, message]
        );
        io.to(sala).emit("message", { message, userId, userName, timestamp: new Date(), curso: sala });
      } catch (e) {
        console.error("Erro ao guardar mensagem:", e.message);
      }
    }
  });
});

/**
 * @openapi
 * /api/chat/messages:
 *   get:
 *     summary: Histórico de mensagens de uma sala de curso
 *     tags: [Chat]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: curso
 *         schema: { type: string, default: Geral }
 *     responses:
 *       200: { description: Últimas 60 mensagens da sala }
 */
app.get("/api/chat/messages", async (req, res) => {
  const curso = req.query.curso || "Geral";
  try {
    const [messages] = await db.query(
      `SELECT m.id, m.message, m.timestamp, m.user_id AS userId,
              COALESCE(u.nome, 'Utilizador') AS userName,
              COALESCE(m.curso, 'Geral') AS curso
       FROM mensagens_estudantes m
       LEFT JOIN usuarios u ON m.user_id = u.id
       WHERE COALESCE(m.curso, 'Geral') = ?
       ORDER BY m.timestamp DESC
       LIMIT 60`,
      [curso]
    );
    res.status(200).json(messages.reverse());
  } catch {
    // Fallback sem filtro de curso (coluna ainda não existe)
    try {
      const [messages] = await db.query(
        `SELECT m.message, m.timestamp, m.user_id AS userId,
                COALESCE(u.nome, 'Utilizador') AS userName
         FROM mensagens_estudantes m
         LEFT JOIN usuarios u ON m.user_id = u.id
         ORDER BY m.timestamp DESC
         LIMIT 60`
      );
      res.status(200).json(messages.reverse());
    } catch (error) {
      res.status(500).json({ erro: "Erro ao buscar mensagens." });
    }
  }
});

// ==========================================
// MODERAÇÃO DO CHAT — apenas admins
// ==========================================

/* Lista todas as mensagens (paginada, filtrável por curso) */
/**
 * @openapi
 * /api/admin/mensagens:
 *   get:
 *     summary: Lista mensagens do chat para moderação (admin)
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: curso
 *         schema: { type: string }
 *     responses:
 *       200: { description: Até 80 mensagens, mais recentes primeiro }
 * /api/admin/mensagens/{id}:
 *   delete:
 *     summary: Apaga uma mensagem do chat (admin)
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Mensagem apagada }
 *       404: { description: Mensagem não encontrada }
 */
app.get("/api/admin/mensagens", autenticar, apenasAdmin, async (req, res) => {
  const curso = req.query.curso || null;
  const limit = 80;
  try {
    const whereCurso = curso ? "WHERE COALESCE(m.curso,'Geral') = ?" : "";
    const params = curso ? [curso, limit] : [limit];
    const [rows] = await db.query(
      `SELECT m.id, m.message, m.timestamp, m.user_id AS userId,
              COALESCE(u.nome,'Utilizador') AS userName,
              COALESCE(m.curso,'Geral') AS curso
       FROM mensagens_estudantes m
       LEFT JOIN usuarios u ON m.user_id = u.id
       ${whereCurso}
       ORDER BY m.timestamp DESC
       LIMIT ?`,
      params
    );
    res.json(rows);
  } catch {
    res.status(500).json({ erro: "Erro ao buscar mensagens." });
  }
});

/* Apaga uma mensagem e notifica todos os clientes em tempo real */
app.delete("/api/admin/mensagens/:id", autenticar, apenasAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ erro: "ID inválido." });
  try {
    const [[msg]] = await db.query("SELECT id, curso FROM mensagens_estudantes WHERE id = ?", [id]);
    if (!msg) return res.status(404).json({ erro: "Mensagem não encontrada." });

    await db.query("DELETE FROM mensagens_estudantes WHERE id = ?", [id]);

    // Notifica a sala do curso E todos os clientes (garante remoção imediata em todas as salas)
    io.to(msg.curso || "Geral").emit("messageDeleted", { id });
    io.emit("messageDeleted", { id });

    res.json({ mensagem: "Mensagem apagada." });
  } catch {
    res.status(500).json({ erro: "Erro ao apagar mensagem." });
  }
});

// ==========================================
// STATUS
// ==========================================
/**
 * @openapi
 * /api/status:
 *   get:
 *     summary: Verificação de saúde do servidor (health check)
 *     tags: [Sistema]
 *     security: []
 *     responses:
 *       200: { description: Servidor operacional }
 */
app.get("/api/status", (req, res) => {
  res.json({ mensagem: "Servidor Operacional", status: "ONLINE" });
});

// ==========================================
// TRATAMENTO GLOBAL DE ERROS (deve ficar por último)
// ==========================================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 400;
  console.error(`[ERRO ${status}] ${err.message}`);
  // Em produção, erros 500 inesperados não expõem detalhes internos ao cliente.
  // Mensagens de negócio (400/401/403/404, já explícitas nas rotas) continuam iguais.
  const expoe = status < 500 || process.env.NODE_ENV !== "production";
  const mensagem = expoe ? (err.message || "Erro interno do servidor.") : "Erro interno do servidor.";
  res.status(status).json({ erro: mensagem });
});

async function runMigrations() {
  try {
    await db.query(
      `ALTER TABLE mensagens_estudantes ADD COLUMN curso VARCHAR(100) NOT NULL DEFAULT 'Geral'`
    );
    console.log("✅ Migração: coluna 'curso' adicionada à tabela mensagens_estudantes.");
  } catch {
    // Coluna já existe — ignorar
  }

  try {
    await db.query(`ALTER TABLE materiais ADD COLUMN ia_sinalizado BOOLEAN NOT NULL DEFAULT FALSE`);
  } catch {
    // Coluna já existe — ignorar
  }
  try {
    await db.query(`ALTER TABLE materiais ADD COLUMN ia_motivo TEXT NULL`);
  } catch {
    // Coluna já existe — ignorar
  }

  try {
    await db.query(`ALTER TABLE usuarios ADD COLUMN avatar_url VARCHAR(255) NULL`);
  } catch {
    // Coluna já existe — ignorar
  }
  try {
    await db.query(`ALTER TABLE usuarios ADD COLUMN reset_token VARCHAR(255) NULL`);
  } catch {
    // Coluna já existe — ignorar
  }
  try {
    await db.query(`ALTER TABLE usuarios ADD COLUMN reset_token_expira DATETIME NULL`);
  } catch {
    // Coluna já existe — ignorar
  }

  for (const coluna of ["link_facebook", "link_instagram", "link_linkedin"]) {
    try {
      await db.query(`ALTER TABLE configuracoes ADD COLUMN ${coluna} VARCHAR(255) NULL`);
    } catch {
      // Coluna já existe — ignorar
    }
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      id INT PRIMARY KEY DEFAULT 1,
      nome_plataforma VARCHAR(100) NOT NULL DEFAULT 'SmartHub',
      tagline VARCHAR(150) NOT NULL DEFAULT 'Aprenda · Partilhe · Cresça',
      descricao_proposito TEXT,
      logo_url VARCHAR(255) NULL,
      cor_primaria CHAR(7) NOT NULL DEFAULT '#04122e',
      cor_destaque CHAR(7) NOT NULL DEFAULT '#ffd700',
      contacto_email VARCHAR(150) NULL,
      localizacao VARCHAR(150) NULL,
      link_facebook VARCHAR(255) NULL,
      link_instagram VARCHAR(255) NULL,
      link_linkedin VARCHAR(255) NULL,
      chat_activado BOOLEAN NOT NULL DEFAULT TRUE,
      ia_activada BOOLEAN NOT NULL DEFAULT TRUE,
      moderacao_ia_activada BOOLEAN NOT NULL DEFAULT TRUE,
      tipos_ficheiro_permitidos VARCHAR(100) NOT NULL DEFAULT 'pdf,mp4,webm,ogg,mov',
      tamanho_maximo_mb INT NOT NULL DEFAULT 100
    )
  `);
  const [[{ total: totalConfig }]] = await db.query("SELECT COUNT(*) as total FROM configuracoes");
  if (totalConfig === 0) {
    await db.query(
      `INSERT INTO configuracoes (id, descricao_proposito) VALUES (1, ?)`,
      ["Plataforma académica para partilha de materiais de estudo, comunicação entre estudantes e resumos gerados por inteligência artificial."]
    );
    console.log("✅ Migração: linha de configuração por defeito criada.");
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS cursos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(150) NOT NULL UNIQUE
    )
  `);
  const [[{ total: totalCursos }]] = await db.query("SELECT COUNT(*) as total FROM cursos");
  if (totalCursos === 0) {
    await db.query("INSERT INTO cursos (nome) VALUES ('Geral')");
    console.log("✅ Migração: curso por defeito 'Geral' criado.");
  }
}

const PORT = process.env.PORT || 5000;

async function iniciar() {
  // Migrações correm ANTES de aceitar pedidos — evita respostas a /api/config,
  // /api/register, etc. antes de as tabelas novas existirem.
  await runMigrations();
  server.listen(PORT, () => {
    console.log(`[UCM SmartHub] Servidor activo na porta ${PORT} | ${new Date().toISOString()}`);
    if (!genAI) console.warn("[UCM SmartHub] GEMINI_API_KEY não definida — funcionalidades de IA desactivadas.");
    if (!process.env.JWT_SECRET) console.warn("[UCM SmartHub] JWT_SECRET não definida — a usar valor de desenvolvimento. Defina JWT_SECRET em produção.");
  });
}

// ─── Paragem graciosa ───────────────────────────────────────────────────────
// Importante em containers Docker: o orquestrador manda SIGTERM e espera o
// processo sair sozinho; sem isto, ligações activas e o pool da BD são
// cortados abruptamente em vez de fechados de forma limpa.
let aEncerrar = false;
async function encerrar(sinal) {
  if (aEncerrar) return;
  aEncerrar = true;
  console.log(`\n[SmartHub] Sinal ${sinal} recebido — a encerrar graciosamente...`);
  await new Promise((resolve) => io.close(() => resolve()));
  console.log("[SmartHub] Servidor HTTP e Socket.IO fechados.");
  try {
    await db.end();
    console.log("[SmartHub] Pool de BD fechado.");
  } catch (erro) {
    console.error("[SmartHub] Erro ao fechar o pool da BD:", erro.message);
  }
  process.exit(0);
}

// Só arranca o servidor de facto quando este ficheiro é corrido directamente
// (node server.js) — não quando é importado por testes (require/import), que
// só precisam do `app` do Express para usar com supertest, sem abrir portas
// nem ligar à BD/Gemini reais.
if (require.main === module) {
  iniciar().catch(erro => {
    console.error("Falha fatal ao iniciar o servidor:", erro.message);
    process.exit(1);
  });
  process.on("SIGTERM", () => encerrar("SIGTERM"));
  process.on("SIGINT", () => encerrar("SIGINT"));
}

module.exports = {
  app,
  validar,
  schemaRegisto, schemaLogin, schemaMaterial, schemaConfig, schemaCurso,
  schemaPerfilNome, schemaPerfilSenha, schemaEsqueciSenha, schemaReporSenha,
  verificarConformidadeIA,
};
