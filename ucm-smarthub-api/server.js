// ==========================================
// UCM SMARTHUB - BACKEND API (NODE.JS)
// ==========================================

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const util = require("util");
const pdfParse = require("pdf-parse");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();

const db = require("./config/db");

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
app.use(express.json());

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
async function verificarConformidadeIA(config, { titulo, cadeira, tipo }) {
  if (!config.moderacao_ia_activada || !genAI) return { sinalizado: false, motivo: null };

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
    const model = genAI.getGenerativeModel({ model: GEMINI_MODELS[0] });
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
const uploadLogo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `logo-${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB é mais que suficiente para um logótipo
  fileFilter: (req, file, cb) => {
    const tiposImagem = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (tiposImagem.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Formato de imagem não suportado. Use PNG, JPG, SVG ou WebP."));
    }
  },
});

// ==========================================
// AUTENTICAÇÃO
// ==========================================
app.post("/api/register", limitarRegisto, async (req, res) => {
  try {
    const nome  = (req.body.nome  || "").trim();
    const email = (req.body.email || "").trim().toLowerCase();
    const senha = req.body.senha  || "";
    const papel = ["estudante", "professor"].includes(req.body.papel)
      ? req.body.papel
      : "estudante";

    if (!nome || !email || !senha) {
      return res.status(400).json({ erro: "Nome, email e senha são obrigatórios." });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ erro: "Email inválido." });
    }
    if (senha.length < 6) {
      return res.status(400).json({ erro: "A palavra-passe deve ter pelo menos 6 caracteres." });
    }

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
  } catch (erro) {
    console.error("Erro no registo:", erro.message);
    res.status(500).json({ erro: "Erro interno ao registar utilizador." });
  }
});

app.post("/api/login", limitarLogin, async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const senha = req.body.senha || "";

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
      },
    });
  } catch (erro) {
    console.error("Erro no login:", erro.message);
    res.status(500).json({ erro: "Erro interno ao validar credenciais." });
  }
});

// ==========================================
// REPOSITÓRIO E MODERAÇÃO
// ==========================================
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
    const titulo  = (req.body.titulo  || "").trim();
    const cadeira = req.body.cadeira;
    const tipo    = req.body.tipo;

    if (!req.file) {
      return res.status(400).json({ erro: "Por favor, anexe um ficheiro." });
    }
    if (!titulo) {
      limparFicheiroOrfao();
      return res.status(400).json({ erro: "O título é obrigatório." });
    }

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
    if (!["PDF", "Vídeo"].includes(tipo)) {
      limparFicheiroOrfao();
      return res.status(400).json({ erro: "Tipo de material inválido." });
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
app.get("/api/config", async (req, res) => {
  try {
    const [configuracoes, cursos] = await Promise.all([getConfiguracoes(), getCursos()]);
    res.json({ configuracoes, cursos });
  } catch (erro) {
    console.error("Erro ao buscar configuração:", erro.message);
    res.status(500).json({ erro: "Falha ao buscar configuração." });
  }
});

app.put("/api/admin/config", autenticar, apenasAdmin, async (req, res) => {
  try {
    const {
      nome_plataforma, tagline, descricao_proposito, cor_primaria, cor_destaque,
      contacto_email, localizacao, chat_activado, ia_activada, moderacao_ia_activada,
      tipos_ficheiro_permitidos, tamanho_maximo_mb,
    } = req.body;

    if (!nome_plataforma || !nome_plataforma.trim()) {
      return res.status(400).json({ erro: "O nome da plataforma é obrigatório." });
    }
    if (!HEX_COLOR_REGEX.test(cor_primaria || "") || !HEX_COLOR_REGEX.test(cor_destaque || "")) {
      return res.status(400).json({ erro: "Cores inválidas — use o formato #rrggbb." });
    }
    const tipos = Array.isArray(tipos_ficheiro_permitidos) ? tipos_ficheiro_permitidos : [];
    const tiposValidos = tipos.filter(t => TIPOS_FICHEIRO_VALIDOS.includes(t));
    if (tiposValidos.length === 0) {
      return res.status(400).json({ erro: "Seleccione pelo menos um tipo de ficheiro permitido." });
    }
    const tamanho = Math.min(TAMANHO_MAXIMO_TECTO_MB, Math.max(1, parseInt(tamanho_maximo_mb, 10) || 100));

    await db.query(
      `UPDATE configuracoes SET
         nome_plataforma = ?, tagline = ?, descricao_proposito = ?, cor_primaria = ?, cor_destaque = ?,
         contacto_email = ?, localizacao = ?, chat_activado = ?, ia_activada = ?, moderacao_ia_activada = ?,
         tipos_ficheiro_permitidos = ?, tamanho_maximo_mb = ?
       WHERE id = 1`,
      [
        nome_plataforma.trim(), (tagline || "").trim(), (descricao_proposito || "").trim(),
        cor_primaria, cor_destaque, (contacto_email || "").trim(), (localizacao || "").trim(),
        !!chat_activado, !!ia_activada, !!moderacao_ia_activada,
        tiposValidos.join(","), tamanho,
      ]
    );

    res.json({ mensagem: "Configuração actualizada com sucesso!", configuracoes: await getConfiguracoes() });
  } catch (erro) {
    console.error("Erro ao actualizar configuração:", erro.message);
    res.status(500).json({ erro: "Falha ao actualizar configuração." });
  }
});

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

app.post("/api/admin/cursos", autenticar, apenasAdmin, async (req, res) => {
  try {
    const nome = (req.body.nome || "").trim();
    if (!nome) return res.status(400).json({ erro: "O nome do curso é obrigatório." });
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

app.put("/api/admin/cursos/:id", autenticar, apenasAdmin, async (req, res) => {
  try {
    const nome = (req.body.nome || "").trim();
    if (!nome) return res.status(400).json({ erro: "O nome do curso é obrigatório." });
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

app.put("/api/admin/materiais/:id/status", autenticar, apenasAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { acao } = req.body;

    if (acao === "aprovar") {
      await db.query("UPDATE materiais SET status = 'aprovado' WHERE id = ?", [id]);
      res.json({ mensagem: "Material aprovado com sucesso!" });
    } else if (acao === "rejeitar") {
      const [[material]] = await db.query("SELECT url_arquivo FROM materiais WHERE id = ?", [id]);
      await db.query("DELETE FROM materiais WHERE id = ?", [id]);
      if (material?.url_arquivo) {
        const fileName = path.basename(material.url_arquivo);
        fs.unlink(path.join(uploadsDir, fileName), () => {});
      }
      res.json({ mensagem: "Material rejeitado e apagado." });
    } else {
      res.status(400).json({ erro: "Acção inválida. Use 'aprovar' ou 'rejeitar'." });
    }
  } catch (erro) {
    console.error("Erro na moderação:", erro.message);
    res.status(500).json({ erro: "Erro ao processar moderação." });
  }
});

// ==========================================
// CHAT COM IA (GEMINI) — protegido por autenticação
// ==========================================
app.post("/api/chat", autenticar, async (req, res) => {
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
app.get("/api/status", (req, res) => {
  res.json({ mensagem: "Servidor Operacional", status: "ONLINE" });
});

// ==========================================
// TRATAMENTO GLOBAL DE ERROS (deve ficar por último)
// ==========================================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 400;
  const mensagem = err.message || "Erro interno do servidor.";
  console.error(`[ERRO ${status}] ${mensagem}`);
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

iniciar().catch(erro => {
  console.error("Falha fatal ao iniciar o servidor:", erro.message);
  process.exit(1);
});
