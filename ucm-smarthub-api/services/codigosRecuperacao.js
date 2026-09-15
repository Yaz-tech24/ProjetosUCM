const crypto = require("crypto");
const db = require("../config/db");

// 10 códigos de uso único gerados ao activar o 2FA. Guardados só como hash —
// quem tem a tabela não tem os códigos. Alfabeto sem 0/O/1/I para poderem
// ser lidos de um papel sem ambiguidade.
const TOTAL_CODIGOS = 10;
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const hash = (codigo) => crypto.createHash("sha256").update(codigo).digest("hex");

function normalizar(codigo) {
  return String(codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function gerarCodigo() {
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// Substitui todos os códigos existentes e devolve os novos em claro — a única
// vez que existem fora do hash.
async function gerarCodigosRecuperacao(usuarioId) {
  const codigos = Array.from({ length: TOTAL_CODIGOS }, gerarCodigo);
  await db.query("DELETE FROM codigos_recuperacao_2fa WHERE usuario_id = ?", [usuarioId]);
  await db.query(
    "INSERT INTO codigos_recuperacao_2fa (usuario_id, codigo_hash) VALUES " + codigos.map(() => "(?, ?)").join(", "),
    codigos.flatMap(c => [usuarioId, hash(normalizar(c))])
  );
  return codigos;
}

async function consumirCodigoRecuperacao(usuarioId, codigo) {
  const normalizado = normalizar(codigo);
  if (normalizado.length !== 8) return false;
  const [r] = await db.query(
    "UPDATE codigos_recuperacao_2fa SET usado_em = NOW() WHERE usuario_id = ? AND codigo_hash = ? AND usado_em IS NULL",
    [usuarioId, hash(normalizado)]
  );
  return r.affectedRows === 1;
}

async function contarCodigosRestantes(usuarioId) {
  const [[{ total }]] = await db.query(
    "SELECT COUNT(*) AS total FROM codigos_recuperacao_2fa WHERE usuario_id = ? AND usado_em IS NULL",
    [usuarioId]
  );
  return Number(total) || 0;
}

async function apagarCodigos(usuarioId) {
  await db.query("DELETE FROM codigos_recuperacao_2fa WHERE usuario_id = ?", [usuarioId]);
}

module.exports = { TOTAL_CODIGOS, gerarCodigosRecuperacao, consumirCodigoRecuperacao, contarCodigosRestantes, apagarCodigos, normalizar };
