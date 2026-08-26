// Espelho, em CommonJS, de ucm-smarthub-web/src/utils/filtroChat.js — o
// frontend já bloqueia estas mensagens antes de enviar, mas quem ligar
// directamente ao socket.io (fora da app) contorna esse filtro. Isto garante
// que a mesma regra é aplicada aqui, do lado do servidor, antes de gravar e
// difundir a mensagem. Manter as duas listas sincronizadas se uma mudar.

/* ── Termos proibidos ──────────────────────────────────────────────── */
const TERMOS = [
  // Palavrões PT
  "porra", "merda", "foda", "foder", "fodasse", "fodendo", "fudendo",
  "caralho", "cacete",
  "puta", "puto", "putaria", "putinha", "prostituta",
  "viado", "bicha", "cuzao", "corno", "cornudo",
  "idiota", "imbecil", "estupido", "retardado", "retardada",
  "burro", "burra",
  "inutil", "otario",
  "vagabundo", "vagabunda", "safado", "safada",
  "desgraçado", "desgraçada", "miseravel",
  "fdp", "filhadaputa", "filhodaputa",
  "filho da puta", "filha da puta",
  "vai se foder", "va se foder", "vai tomar", "vtnc", "vsf", "vtc",

  // Insultos / ameaças
  "cala boca", "cale a boca", "vai morrer", "te mato", "vou te matar",
  "sua mae", "tua mae",

  // Discriminação
  "macaco", "raca de", "vai preso",

  // EN
  "fuck", "fucker", "fucking", "fck",
  "shit", "bitch", "bastard", "asshole", "cunt", "dick", "cock",
  "nigger", "nigga", "faggot", "retard", "whore", "slut",
];

/* ── Mapeamento leetspeak completo ─────────────────────────────────── */
const LEET = {
  "0": "o", "1": "i", "2": "z", "3": "e", "4": "a",
  "5": "s", "6": "g", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "!": "i", "+": "t",
};

/* ── Normalização ──────────────────────────────────────────────────── */
const norm = (str) =>
  str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0-9@$!+]/g, c => LEET[c] ?? c)
    .replace(/(.)\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TERMOS_REGEX = TERMOS.map(t => new RegExp(`\\b${escapeRegex(norm(t))}\\b`));

const temFlood = (texto) => /(.)\1{7,}/.test(texto);

const temGrito = (texto) => {
  if (texto.length < 10) return false;
  const letras = texto.replace(/[^a-zA-Z]/g, "");
  if (letras.length < 6) return false;
  return letras.replace(/[^A-Z]/g, "").length / letras.length > 0.75;
};

/**
 * @param {string} mensagem
 * @returns {{ bloqueada: boolean, motivo: string|null }}
 */
function analisarMensagem(mensagem) {
  if (!mensagem?.trim()) return { bloqueada: false, motivo: null };
  if (temFlood(mensagem)) return { bloqueada: true, motivo: "flood" };
  if (temGrito(mensagem)) return { bloqueada: true, motivo: "caps" };

  const msgNorm = norm(mensagem);
  for (let i = 0; i < TERMOS_REGEX.length; i++) {
    if (TERMOS_REGEX[i].test(msgNorm)) return { bloqueada: true, motivo: "palavrao" };
  }
  return { bloqueada: false, motivo: null };
}

function mensagemAviso(motivo) {
  switch (motivo) {
    case "palavrao": return "Mensagem bloqueada — linguagem inapropriada não é permitida nesta plataforma.";
    case "flood":    return "Mensagem bloqueada — evite repetição excessiva de caracteres.";
    case "caps":     return "Escreva normalmente — evite usar CAPS LOCK em excesso.";
    default:         return "Mensagem não permitida.";
  }
}

module.exports = { analisarMensagem, mensagemAviso };
