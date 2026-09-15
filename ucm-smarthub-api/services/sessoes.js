const crypto = require("crypto");
const db = require("../config/db");

// Cada sessão emitida fica registada com o `jti` do JWT — é isso que permite
// listar dispositivos e revogar uma sessão (ou todas) antes de o token expirar
// sozinho, o que um JWT puro não consegue.
const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000;
const INTERVALO_ULTIMO_USO_MS = 5 * 60 * 1000;

const ultimaEscrita = new Map(); // jti -> timestamp da última actualização de ultimo_uso

function descreverDispositivo(userAgent = "") {
  const ua = String(userAgent).slice(0, 255);
  const so = /Windows/i.test(ua) ? "Windows" : /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Mac OS/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Desconhecido";
  const browser = /Edg\//i.test(ua) ? "Edge" : /OPR\//i.test(ua) ? "Opera" : /Chrome\//i.test(ua) ? "Chrome" : /Firefox\//i.test(ua) ? "Firefox" : /Safari\//i.test(ua) ? "Safari" : "Browser";
  return `${browser} · ${so}`;
}

async function criarSessao({ usuarioId, req }) {
  const jti = crypto.randomUUID();
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS);
  await db.query(
    "INSERT INTO sessoes (jti, usuario_id, dispositivo, ip, expira_em) VALUES (?, ?, ?, ?, ?)",
    [jti, usuarioId, descreverDispositivo(req?.headers?.["user-agent"]), req?.ip || null, expiraEm]
  );
  return { jti, expiraEm };
}

// Uma consulta por pedido autenticado (chave primária) — o preço de poder
// terminar sessões. ultimo_uso só se escreve de 5 em 5 minutos por sessão.
async function sessaoActiva(jti) {
  const [[sessao]] = await db.query(
    "SELECT usuario_id, revogada_em, expira_em FROM sessoes WHERE jti = ?",
    [jti]
  );
  if (!sessao || sessao.revogada_em || new Date(sessao.expira_em) < new Date()) return false;

  const agora = Date.now();
  if ((ultimaEscrita.get(jti) || 0) + INTERVALO_ULTIMO_USO_MS < agora) {
    ultimaEscrita.set(jti, agora);
    db.query("UPDATE sessoes SET ultimo_uso = NOW() WHERE jti = ?", [jti]).catch(() => {});
  }
  return true;
}

async function listarSessoes(usuarioId) {
  const [sessoes] = await db.query(
    `SELECT jti, dispositivo, ip, criado_em, ultimo_uso, expira_em
     FROM sessoes
     WHERE usuario_id = ? AND revogada_em IS NULL AND expira_em > NOW()
     ORDER BY ultimo_uso DESC`,
    [usuarioId]
  );
  return sessoes;
}

async function revogarSessao(jti, usuarioId) {
  const [r] = await db.query(
    "UPDATE sessoes SET revogada_em = NOW() WHERE jti = ? AND usuario_id = ? AND revogada_em IS NULL",
    [jti, usuarioId]
  );
  ultimaEscrita.delete(jti);
  return r.affectedRows > 0;
}

async function revogarOutrasSessoes(usuarioId, jtiActual) {
  const [r] = await db.query(
    "UPDATE sessoes SET revogada_em = NOW() WHERE usuario_id = ? AND revogada_em IS NULL AND jti <> ?",
    [usuarioId, jtiActual || ""]
  );
  return r.affectedRows;
}

async function revogarTodasSessoes(usuarioId) {
  const [r] = await db.query(
    "UPDATE sessoes SET revogada_em = NOW() WHERE usuario_id = ? AND revogada_em IS NULL",
    [usuarioId]
  );
  return r.affectedRows;
}

// Limpa sessões expiradas há mais de 30 dias — o histórico recente fica para
// o utilizador ver "último acesso"; o resto só ocupa espaço.
async function purgarSessoesAntigas() {
  try {
    await db.query("DELETE FROM sessoes WHERE expira_em < DATE_SUB(NOW(), INTERVAL 30 DAY)");
  } catch { /* best-effort */ }
}

module.exports = {
  DURACAO_SESSAO_MS, criarSessao, sessaoActiva, listarSessoes,
  revogarSessao, revogarOutrasSessoes, revogarTodasSessoes, purgarSessoesAntigas, descreverDispositivo,
};
