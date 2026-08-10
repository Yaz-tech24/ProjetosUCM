/*
 * Filtro de conteúdo — Chat UCM SmartHub
 *
 * Pipeline de normalização aplicado TANTO à mensagem COMO aos termos:
 *   1. minúsculas
 *   2. NFD + remoção de diacríticos  ([̀-ͯ])
 *   3. leet completo  (0→o, 1→i, 3→e, 4→a, 5→s, …)
 *   4. colapso de QUAISQUER caracteres repetidos  (meerda → merda, poorraa → pora)
 *   5. espaços normalizados
 *
 * Como ambos os lados usam a mesma função, "m33rd4" → "merda" e
 * "merda" (termo) → "merda", pelo que a comparação funciona sempre.
 */

/* ── Termos proibidos ──────────────────────────────────────────────── */
const TERMOS = [
  // Palavrões PT
  "porra","merda","foda","foder","fodasse","fodendo","fudendo",
  "caralho","cacete",
  "puta","puto","putaria","putinha","prostituta",
  "viado","bicha","cuzao","corno","cornudo",
  "idiota","imbecil","estupido","retardado","retardada",
  "burro","burra",
  "inutil","otario",
  "vagabundo","vagabunda","safado","safada",
  "desgraçado","desgraçada","miseravel",
  "fdp","filhadaputa","filhodaputa",
  "filho da puta","filha da puta",
  "vai se foder","va se foder","vai tomar","vtnc","vsf","vtc",

  // Insultos / ameaças
  "cala boca","cale a boca","vai morrer","te mato","vou te matar",
  "sua mae","tua mae",

  // Discriminação
  "macaco","raca de","vai preso",

  // EN
  "fuck","fucker","fucking","fck",
  "shit","bitch","bastard","asshole","cunt","dick","cock",
  "nigger","nigga","faggot","retard","whore","slut",
];

/* ── Mapeamento leetspeak completo ─────────────────────────────────── */
const LEET = {
  "0":"o","1":"i","2":"z","3":"e","4":"a",
  "5":"s","6":"g","7":"t","8":"b","9":"g",
  "@":"a","$":"s","!":"i","+":"t",
};

/* ── Normalização ──────────────────────────────────────────────────── */
const norm = (str) =>
  str
    .toLowerCase()
    // 1 — remove acentos (unicode explícito para evitar problemas de encoding)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // 2 — converte leetspeak e símbolos comuns
    .replace(/[0-9@$!+]/g, c => LEET[c] ?? c)
    // 3 — colapsa QUAISQUER caracteres duplicados consecutivos (ee→e, rr→r)
    //     Aplicado tanto na mensagem como nos termos, logo a comparação é simétrica
    .replace(/(.)\1+/g, "$1")
    // 4 — espaços
    .replace(/\s+/g, " ")
    .trim();

/* Pré-compila termos normalizados UMA VEZ ao carregar o módulo, já como
 * regex de fronteira de palavra — evita falsos positivos em que o termo
 * é apenas uma sub-cadeia de uma palavra legítima (ex.: "puta" dentro de
 * "computador" ou "deputado"). Fronteiras funcionam tanto para termos de
 * uma palavra como para frases ("filho da puta"), e formas coladas de
 * evasão ("filhodaputa") já estão listadas explicitamente em TERMOS.
 */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TERMOS_REGEX = TERMOS.map(t => new RegExp(`\\b${escapeRegex(norm(t))}\\b`));

/* ── Detecção de flood (8+ caracteres iguais seguidos) ─────────────── */
const temFlood = (texto) => /(.)\1{7,}/.test(texto);

/* ── Detecção de CAPS LOCK excessivo (>75%, mínimo 10 chars) ───────── */
const temGrito = (texto) => {
  if (texto.length < 10) return false;
  const letras = texto.replace(/[^a-zA-Z]/g, "");
  if (letras.length < 6) return false;
  return letras.replace(/[^A-Z]/g, "").length / letras.length > 0.75;
};

/* ── Função principal ──────────────────────────────────────────────── */
/**
 * @param {string} mensagem
 * @returns {{ bloqueada: boolean, motivo: string|null }}
 */
export const analisarMensagem = (mensagem) => {
  if (!mensagem?.trim())
    return { bloqueada: false, motivo: null };

  if (temFlood(mensagem))
    return { bloqueada: true, motivo: "flood" };

  if (temGrito(mensagem))
    return { bloqueada: true, motivo: "caps" };

  const msgNorm = norm(mensagem);

  for (let i = 0; i < TERMOS_REGEX.length; i++) {
    if (TERMOS_REGEX[i].test(msgNorm)) {
      return { bloqueada: true, motivo: "palavrao" };
    }
  }

  return { bloqueada: false, motivo: null };
};

/* ── Mensagens de aviso ────────────────────────────────────────────── */
export const mensagemAviso = (motivo) => {
  switch (motivo) {
    case "palavrao": return "⚠️ Mensagem bloqueada — linguagem inapropriada não é permitida nesta plataforma.";
    case "flood":    return "⚠️ Mensagem bloqueada — evite repetição excessiva de caracteres.";
    case "caps":     return "⚠️ Escreva normalmente — evite usar CAPS LOCK em excesso.";
    default:         return "⚠️ Mensagem não permitida.";
  }
};
