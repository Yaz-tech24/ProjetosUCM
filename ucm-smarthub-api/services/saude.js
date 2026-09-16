const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const mailer = require("./email");
const { genAI } = require("./ia");
const { conversaoDisponivel } = require("./conversao");
const { estadoMigracoes } = require("../db/migracoes");
const { uploadsDir } = require("../middleware/upload");
const { criarNotificacao } = require("./notificacoes");
const { getConfiguracoes } = require("./plataforma");

// Estado de saúde do sistema (BD, LibreOffice, fila de indexação, disco,
// backups) e alertas aos administradores quando algo fica mal durante mais
// do que uma verificação seguida. Cada problema só alerta uma vez por
// `SILENCIO_MS` — e avisa quando se resolve.
const INTERVALO_MS = 5 * 60 * 1000;
const SILENCIO_MS = 6 * 60 * 60 * 1000;
const BACKUPS_DIR = process.env.BACKUPS_DIR || null;             // ex: /backups (montado do host) — opcional
const BACKUP_MAX_HORAS = Number(process.env.BACKUP_MAX_HORAS || 48);
const DISCO_MIN_MB = Number(process.env.DISCO_MIN_MB || 1024);
const INDEXACAO_MAX_PENDENTES = 200;

const VERSAO = (() => { try { return require("../package.json").version; } catch { return null; } })();
const arranque = Date.now();

async function verificarBd() {
  const inicio = Date.now();
  try {
    await db.query("SELECT 1");
    return { ok: true, latencia_ms: Date.now() - inicio };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

async function verificarIndexacao() {
  try {
    const [[{ pendentes }]] = await db.query("SELECT COUNT(*) AS pendentes FROM materiais WHERE tipo = 'PDF' AND texto_indexado_em IS NULL");
    const [[{ falhados }]] = await db.query("SELECT COUNT(*) AS falhados FROM materiais WHERE tipo = 'PDF' AND texto_indexado_em IS NOT NULL AND texto_extraido IS NULL");
    const n = Number(pendentes) || 0;
    return { ok: n < INDEXACAO_MAX_PENDENTES, pendentes: n, sem_texto: Number(falhados) || 0 };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}

async function verificarDisco() {
  try {
    if (typeof fs.promises.statfs !== "function") return { ok: true, indisponivel: true };
    const st = await fs.promises.statfs(uploadsDir);
    const livreMb = Math.round((Number(st.bavail) * Number(st.bsize)) / (1024 * 1024));
    const totalMb = Math.round((Number(st.blocks) * Number(st.bsize)) / (1024 * 1024));
    return { ok: livreMb >= DISCO_MIN_MB, livre_mb: livreMb, total_mb: totalMb };
  } catch (erro) {
    return { ok: true, indisponivel: true, erro: erro.message };
  }
}

async function tamanhoUploads() {
  try {
    const ficheiros = await fs.promises.readdir(uploadsDir);
    let bytes = 0;
    for (const f of ficheiros) {
      try { const st = await fs.promises.stat(path.join(uploadsDir, f)); if (st.isFile()) bytes += st.size; } catch { /* apagado entretanto */ }
    }
    return { ficheiros: ficheiros.length, mb: Math.round(bytes / (1024 * 1024)) };
  } catch {
    return null;
  }
}

async function verificarBackups() {
  if (!BACKUPS_DIR) return { ok: true, configurado: false };
  try {
    const nomes = (await fs.promises.readdir(BACKUPS_DIR)).filter(n => /\.sql\.gz$/.test(n));
    let maisRecente = null;
    for (const n of nomes) {
      const st = await fs.promises.stat(path.join(BACKUPS_DIR, n));
      if (!maisRecente || st.mtimeMs > maisRecente.mtimeMs) maisRecente = { nome: n, mtimeMs: st.mtimeMs, mb: Math.round(st.size / (1024 * 1024) * 10) / 10 };
    }
    if (!maisRecente) return { ok: false, configurado: true, ultimo: null, erro: "Nenhum backup encontrado." };
    const horas = (Date.now() - maisRecente.mtimeMs) / 3600e3;
    return { ok: horas <= BACKUP_MAX_HORAS, configurado: true, ultimo: maisRecente.nome, ha_horas: Math.round(horas), mb: maisRecente.mb, total: nomes.length };
  } catch (erro) {
    return { ok: false, configurado: true, erro: erro.message };
  }
}

async function estadoDetalhado() {
  const [bd, indexacao, disco, backups, libreoffice, migracoes, uploads] = await Promise.all([
    verificarBd(), verificarIndexacao(), verificarDisco(), verificarBackups(),
    conversaoDisponivel().then(ok => ({ ok, disponivel: ok })).catch(() => ({ ok: false, disponivel: false })),
    estadoMigracoes().catch(erro => ({ erro: erro.message })),
    tamanhoUploads(),
  ]);
  const digest = require("./digest");
  const servicos = {
    bd, indexacao, disco, backups,
    libreoffice: { ...libreoffice, critico: false },
    ia: { ok: true, configurada: Boolean(genAI) },
    email: { ok: true, configurado: mailer.emailConfigurado() },
    migracoes,
    digest: { dia_semana: digest.DIA_SEMANA, hora: digest.HORA },
    uploads,
  };
  const problemas = Object.entries(servicos)
    .filter(([, v]) => v && v.ok === false && v.critico !== false)
    .map(([k]) => k);
  return {
    estado: problemas.length === 0 ? "ok" : (bd.ok ? "degradado" : "critico"),
    problemas,
    versao: VERSAO,
    uptime_s: Math.round((Date.now() - arranque) / 1000),
    node: process.version,
    verificado_em: new Date().toISOString(),
    servicos,
  };
}

// ── Alertas ──────────────────────────────────────────────────────────────
const DESCRICOES = {
  bd: "Base de dados inacessível",
  indexacao: "Fila de indexação de PDFs parada ou demasiado grande",
  disco: "Pouco espaço em disco na pasta de uploads",
  backups: "Backup da base de dados em atraso ou inexistente",
};
const falhasSeguidas = new Map();   // servico -> nº de verificações seguidas a falhar
const ultimoAlerta = new Map();     // servico -> timestamp do último alerta enviado
const activos = new Set();          // problemas actualmente alertados

async function avisarAdmins(assunto, corpo) {
  try {
    const [admins] = await db.query("SELECT id, email, nome FROM usuarios WHERE papel = 'admin'").catch(() => [[]]);
    for (const a of admins) await criarNotificacao(a.id, { tipo: "sistema", titulo: assunto, mensagem: corpo.slice(0, 500), link: "/admin?aba=sistema" });
    if (!mailer.emailConfigurado() || admins.length === 0) return;
    const config = await getConfiguracoes().catch(() => ({}));
    for (const a of admins) {
      await mailer.enviarEmail({
        to: a.email,
        subject: `[${config.nome_plataforma || "SmartHub"}] ${assunto}`,
        html: mailer.layoutEmail(config.nome_plataforma || "SmartHub", config.cor_primaria || "#04122e", config.cor_destaque || "#ffd700",
          `<p>Olá, ${mailer.escapeHtml(a.nome)},</p><p>${mailer.escapeHtml(corpo)}</p><p style="color:#64748b;font-size:12px">Alerta automático do monitor de saúde. Detalhes em Administração → Sistema.</p>`,
          config.logo_url),
      });
    }
  } catch (erro) {
    console.error("[Saúde] Falha ao avisar admins:", erro.message);
  }
}

async function verificarEAlertar() {
  const estado = await estadoDetalhado();
  const agora = Date.now();
  for (const servico of Object.keys(DESCRICOES)) {
    const info = estado.servicos[servico];
    const falhou = info && info.ok === false;
    // A BD inacessível impede o próprio alerta in-app; o email ainda sai.
    if (falhou) {
      const n = (falhasSeguidas.get(servico) || 0) + 1;
      falhasSeguidas.set(servico, n);
      const silencioPassou = agora - (ultimoAlerta.get(servico) || 0) > SILENCIO_MS;
      if (n >= 2 && silencioPassou) {
        ultimoAlerta.set(servico, agora);
        activos.add(servico);
        const detalhe = info.erro || (servico === "disco" ? `${info.livre_mb} MB livres` : servico === "backups" ? `último há ${info.ha_horas} h` : servico === "indexacao" ? `${info.pendentes} pendentes` : "");
        console.error(`[Saúde] ALERTA: ${DESCRICOES[servico]} (${detalhe})`);
        await avisarAdmins(`Alerta: ${DESCRICOES[servico]}`, `${DESCRICOES[servico]}. ${detalhe ? `Detalhe: ${detalhe}.` : ""} Verificação falhada ${n} vezes seguidas (a cada ${INTERVALO_MS / 60000} min).`);
      }
    } else {
      falhasSeguidas.set(servico, 0);
      if (activos.has(servico)) {
        activos.delete(servico);
        console.log(`[Saúde] Resolvido: ${DESCRICOES[servico]}`);
        await avisarAdmins(`Resolvido: ${DESCRICOES[servico]}`, `${DESCRICOES[servico]} — voltou ao normal.`);
      }
    }
  }
  return estado;
}

function agendarMonitor() {
  setTimeout(() => verificarEAlertar().catch(erro => console.error("[Saúde] Erro:", erro.message)), 60 * 1000).unref?.();
  setInterval(() => verificarEAlertar().catch(erro => console.error("[Saúde] Erro:", erro.message)), INTERVALO_MS).unref?.();
}

module.exports = { estadoDetalhado, verificarEAlertar, agendarMonitor, verificarBackups, verificarDisco, verificarIndexacao, DESCRICOES, BACKUP_MAX_HORAS, DISCO_MIN_MB };
