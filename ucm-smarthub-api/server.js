// ==========================================
// SMARTHUB - BACKEND API (NODE.JS)
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
const cookieParser = require("cookie-parser");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config({ quiet: true });

const swaggerUi = require("swagger-ui-express");

const db = require("./config/db");
const swaggerSpec = require("./swagger");
const { genAI } = require("./services/ia");
const { autenticar, apenasAdmin } = require("./middleware/auth");
const { correrMigracoes } = require("./db/migracoes");

const app = express();
const server = http.createServer(app);

// Em produção o pedido passa por DOIS proxies antes de chegar aqui: Traefik
// (entrypoint público, TLS) e depois o Caddy (docker-compose.yml) — sem
// confiar nos dois hops, req.ip (usado por todos os limitadores de taxa por
// IP) resolvia sempre para o IP interno do Traefik, o mesmo para todos os
// pedidos, tornando os limites efectivamente globais para a plataforma
// inteira em vez de por-cliente (foi exactamente isto que, com o valor "1"
// anterior, causou o registo a bloquear ao fim de poucos pedidos combinados
// de todos os utilizadores). "2" confia exactamente estes dois hops
// conhecidos; superior a "true" (que confiaria numa cadeia arbitrária de
// proxies, mais fácil de contornar por spoofing de X-Forwarded-For).
app.set("trust proxy", 2);

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
app.use(cookieParser());
// Só admins — o schema completo (incluindo rotas de moderação/gestão de
// utilizadores) não deve ficar publicamente indexável/descobrível numa
// plataforma em produção com dados reais de estudantes.
app.use("/api/docs", autenticar, apenasAdmin, swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: "SmartHub API — Documentação" }));

// Serve ficheiros da pasta uploads
// X-Frame-Options: SAMEORIGIN (definido pelo helmet acima) bloqueia o
// <iframe> do visualizador de PDF sempre que o frontend está numa origem
// diferente da API — acontece sempre em desenvolvimento local (frontend na
// porta 5173, API na 5000, portas diferentes = origens diferentes) e é
// exactamente a mesma razão pela qual crossOriginResourcePolicy já está
// como "cross-origin" acima. Removido só aqui: estes ficheiros são conteúdo
// estático já validado no upload, sem dados de sessão — ao contrário do
// resto da aplicação, onde a protecção contra clickjacking continua activa.
app.use("/uploads", (req, res, next) => {
  res.removeHeader("X-Frame-Options");
  next();
}, express.static(path.join(__dirname, "uploads")));

// ─── Rotas — cada módulo regista os seus próprios endpoints em `app` ──────
require("./routes/auth")(app);
require("./routes/perfil")(app);
require("./routes/utilizadores")(app);
require("./routes/materiais")(app);
require("./routes/config")(app);
require("./routes/stats")(app);
require("./routes/chat")(app, io);
require("./services/notificacoes").ligarSocket(io);
require("./routes/status")(app);
require("./routes/avaliacoes")(app);
require("./routes/comentarios")(app);
require("./routes/subscricoes")(app);
require("./routes/reputacao")(app);
require("./routes/analytics")(app);
require("./routes/2fa")(app);
require("./routes/sessoes")(app);
require("./routes/notificacoes")(app);
require("./routes/quiz")(app);
require("./routes/colecoes")(app);
require("./routes/perguntas")(app);
require("./routes/denuncias")(app);
require("./routes/calendario")(app);
require("./routes/tags")(app);
require("./routes/leitura")(app);
require("./routes/flashcards")(app);
require("./routes/pedidos")(app);
require("./routes/pesquisa")(app);
require("./routes/estudo")(app);
require("./routes/sistema")(app);

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


const PORT = process.env.PORT || 5000;

async function iniciar() {
  // Em produção, um JWT_SECRET não definido cairia silenciosamente para o
  // valor de desenvolvimento — que está visível no código-fonte público —
  // permitindo forjar tokens (incluindo de admin). Falha alto e a arrancar
  // em vez de arriscar isso; em desenvolvimento continua a funcionar sem
  // configuração extra.
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
    console.error("[SmartHub] JWT_SECRET não está definida. Defina uma chave forte e aleatória (ex: openssl rand -hex 32) antes de arrancar em produção.");
    process.exit(1);
  }

  // Migrações correm ANTES de aceitar pedidos — evita respostas a /api/config,
  // /api/register, etc. antes de as tabelas novas existirem.
  await correrMigracoes();
  // Tarefas de fundo: indexação de PDFs para pesquisa, lembretes do calendário,
  // digest semanal, limpeza diária (sessões, auditoria, notificações) e o
  // monitor de saúde. Todas com .unref() — não seguram o processo.
  require("./services/indexacao").agendarIndexacao();
  require("./services/lembretes").agendarLembretes();
  require("./services/digest").agendarDigest();
  require("./services/manutencao").agendarManutencao();
  require("./services/saude").agendarMonitor();
  require("./services/preGeracao").agendarPreGeracao();
  server.listen(PORT, () => {
    console.log(`[SmartHub] Servidor activo na porta ${PORT} | ${new Date().toISOString()}`);
    if (!genAI) console.warn("[SmartHub] GEMINI_API_KEY não definida — funcionalidades de IA desactivadas.");
    if (!process.env.JWT_SECRET) console.warn("[SmartHub] JWT_SECRET não definida — a usar valor de desenvolvimento. Defina JWT_SECRET em produção.");
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

// `server` também é exportado (além de `app`) para que os testes de
// integração do Socket.IO (ver __tests__/socketChat.test.js) possam fazer
// server.listen(0) numa porta efémera — um socket.io-client real não
// consegue ligar-se só com o `app` do Express, precisa de um servidor HTTP
// a ouvir de facto.
module.exports = { app, server };
