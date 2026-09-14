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
require("./routes/status")(app);
require("./routes/avaliacoes")(app);
require("./routes/comentarios")(app);
require("./routes/subscricoes")(app);
require("./routes/reputacao")(app);
require("./routes/analytics")(app);
require("./routes/2fa")(app);
require("./routes/tags")(app);

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
  try {
    await db.query(`ALTER TABLE usuarios ADD COLUMN numero_estudante VARCHAR(50) NULL`);
  } catch {
    // Coluna já existe — ignorar
  }
  try {
    await db.query(`ALTER TABLE usuarios ADD COLUMN telefone VARCHAR(30) NULL`);
  } catch {
    // Coluna já existe — ignorar
  }
  try {
    await db.query(`ALTER TABLE usuarios ADD COLUMN email_verificado TINYINT(1) NOT NULL DEFAULT 0`);
  } catch {
    // Coluna já existe — ignorar
  }
  try {
    await db.query(`ALTER TABLE usuarios ADD COLUMN email_token VARCHAR(255) NULL`);
  } catch {
    // Coluna já existe — ignorar
  }
  try {
    await db.query(`ALTER TABLE usuarios ADD COLUMN email_token_expira DATETIME NULL`);
  } catch {
    // Coluna já existe — ignorar
  }
  try {
    await db.query(`ALTER TABLE usuarios ADD COLUMN 2fa_ativado TINYINT(1) NOT NULL DEFAULT 0`);
  } catch {
    // Coluna já existe — ignorar
  }
  try {
    await db.query(`ALTER TABLE usuarios ADD COLUMN 2fa_secret VARCHAR(255) NULL`);
  } catch {
    // Coluna já existe — ignorar
  }
  try {
    await db.query(`ALTER TABLE usuarios ADD COLUMN 2fa_secret_temp VARCHAR(255) NULL`);
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
  // Cache do resumo por IA — sem isto, abrir o mesmo material duas vezes (ou só
  // recarregar a página) reextraía o PDF e pagava outra chamada ao Gemini para
  // devolver exactamente o mesmo texto. Só se gera de novo quando o utilizador
  // pede explicitamente ("Regenerar resumo").
  try {
    await db.query(`ALTER TABLE materiais ADD COLUMN resumo_texto MEDIUMTEXT NULL`);
  } catch {
    // Coluna já existe — ignorar
  }
  try {
    await db.query(`ALTER TABLE materiais ADD COLUMN resumo_gerado_em DATETIME NULL`);
  } catch {
    // Coluna já existe — ignorar
  }

  // Índices — quase todas as leituras de materiais filtram por status e ordenam
  // por data_upload, e o histórico/moderação de chat filtra por curso e ordena
  // por timestamp; sem índice, cada uma dessas consultas varre a tabela inteira.
  try {
    await db.query(`CREATE INDEX idx_materiais_status_data ON materiais (status, data_upload)`);
  } catch {
    // Índice já existe — ignorar
  }
  try {
    await db.query(`CREATE INDEX idx_mensagens_curso_timestamp ON mensagens_estudantes (curso, timestamp)`);
  } catch {
    // Índice já existe — ignorar
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

  // Tabelas de novas funcionalidades (criadas idempotentemente)
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS auditoria (
        id            INT NOT NULL AUTO_INCREMENT,
        usuario_id    INT,
        acao          VARCHAR(100) NOT NULL,
        recurso       VARCHAR(100),
        recurso_id    INT,
        descricao     TEXT,
        dados_antigos JSON,
        dados_novos   JSON,
        data_hora     TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        ip_origem     VARCHAR(45),
        PRIMARY KEY (id),
        KEY usuario_id (usuario_id),
        KEY idx_auditoria_data_acao (data_hora, acao)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch {
    // Tabela já existe
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS avaliacoes (
        id            INT NOT NULL AUTO_INCREMENT,
        material_id   INT NOT NULL,
        usuario_id    INT NOT NULL,
        nota          INT NOT NULL,
        comentario    TEXT,
        data_criacao  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY material_usuario (material_id, usuario_id),
        KEY usuario_id (usuario_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch {
    // Tabela já existe
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS comentarios_materiais (
        id            INT NOT NULL AUTO_INCREMENT,
        material_id   INT NOT NULL,
        usuario_id    INT NOT NULL,
        conteudo      TEXT NOT NULL,
        data_criacao  TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY material_id (material_id),
        KEY usuario_id (usuario_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch {
    // Tabela já existe
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS reputacao_usuarios (
        id            INT NOT NULL AUTO_INCREMENT,
        usuario_id    INT NOT NULL UNIQUE,
        pontos        INT NOT NULL DEFAULT 0,
        materiais_submetidos INT NOT NULL DEFAULT 0,
        materiais_aprovados INT NOT NULL DEFAULT 0,
        media_avaliacoes DECIMAL(3,2),
        emblema       VARCHAR(50),
        data_atualizacao TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch {
    // Tabela já existe
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS subscricoes_disciplinas (
        id            INT NOT NULL AUTO_INCREMENT,
        usuario_id    INT NOT NULL,
        disciplina    VARCHAR(100) NOT NULL,
        data_subscrition TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY usuario_disciplina (usuario_id, disciplina)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch {
    // Tabela já existe
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS quotas_utilizadores (
        id            INT NOT NULL AUTO_INCREMENT,
        usuario_id    INT NOT NULL UNIQUE,
        bytes_usados  BIGINT NOT NULL DEFAULT 0,
        materiais_este_mes INT NOT NULL DEFAULT 0,
        data_reset_cota TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch {
    // Tabela já existe
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id    INT NOT NULL AUTO_INCREMENT,
        nome  VARCHAR(50) NOT NULL UNIQUE,
        cor   CHAR(7) NOT NULL DEFAULT '#ffd700',
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch {
    // Tabela já existe
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS materiais_tags (
        id           INT NOT NULL AUTO_INCREMENT,
        material_id  INT NOT NULL,
        tag_id       INT NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY material_tag (material_id, tag_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch {
    // Tabela já existe
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
    console.error("[SmartHub] JWT_SECRET não está definida. Defina uma chave forte e aleatória (ex: openssl rand -hex 32) antes de arrancar em produção.");
    process.exit(1);
  }

  // Migrações correm ANTES de aceitar pedidos — evita respostas a /api/config,
  // /api/register, etc. antes de as tabelas novas existirem.
  await runMigrations();
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
