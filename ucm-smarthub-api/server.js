// ==========================================
// UCM SMARTHUB - BACKEND API (NODE.JS)
//
// Este ficheiro só trata do arranque: middlewares globais, montagem das
// rotas (cada domínio tem o seu módulo em routes/), migrações e o ciclo de
// vida do processo (arranque/paragem graciosa). A lógica de cada rota vive
// em routes/, schemas de validação em schemas/, middlewares reutilizáveis em
// middleware/, e integrações externas (email, IA) em services/.
// ==========================================

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config({ quiet: true });

const swaggerUi = require("swagger-ui-express");

const db = require("./config/db");
const swaggerSpec = require("./swagger");
const { genAI } = require("./services/ia");

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

// Serve ficheiros da pasta uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ─── Rotas — cada módulo regista os seus próprios endpoints em `app` ──────
require("./routes/auth")(app);
require("./routes/perfil")(app);
require("./routes/utilizadores")(app);
require("./routes/materiais")(app);
require("./routes/config")(app);
require("./routes/stats")(app);
require("./routes/chat")(app, io);
require("./routes/status")(app);

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
  try {
    await db.query(`ALTER TABLE configuracoes ADD COLUMN dominios_email_permitidos VARCHAR(255) NULL`);
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
      link_facebook VARCHAR(255) NULL,
      link_instagram VARCHAR(255) NULL,
      link_linkedin VARCHAR(255) NULL,
      dominios_email_permitidos VARCHAR(255) NULL,
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
  // Em produção, um JWT_SECRET não definido cairia silenciosamente para o
  // valor de desenvolvimento — que está visível no código-fonte público —
  // permitindo forjar tokens (incluindo de admin). Falha alto e a arrancar
  // em vez de arriscar isso; em desenvolvimento continua a funcionar sem
  // configuração extra.
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
    console.error("[UCM SmartHub] JWT_SECRET não está definida. Defina uma chave forte e aleatória (ex: openssl rand -hex 32) antes de arrancar em produção.");
    process.exit(1);
  }

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

module.exports = { app };
