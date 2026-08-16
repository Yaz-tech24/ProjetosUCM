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
// O token em si tem 256 bits de entropia (impraticável de adivinhar), mas um
// limite generoso aqui é defesa em profundidade barata contra automatismos.
const limitarReporSenha = criarLimitadorTaxa({ janelaMs: 60 * 60 * 1000, maxTentativas: 20 });

// ─── Bloqueio de conta por tentativas falhadas ────────────────────────────
// Complementa o limite por IP acima: um atacante que rode várias origens/IPs
// contra a MESMA conta continua bloqueado, porque isto é indexado por email.
const FALHAS_LOGIN_MAX = 5;
const BLOQUEIO_CONTA_MS = 15 * 60 * 1000;
const falhasLoginPorEmail = new Map(); // email -> { falhas, bloqueadoAte }

function contaBloqueada(email) {
  const registo = falhasLoginPorEmail.get(email);
  return !!(registo?.bloqueadoAte && Date.now() < registo.bloqueadoAte);
}

function registarFalhaLogin(email) {
  const registo = falhasLoginPorEmail.get(email) || { falhas: 0, bloqueadoAte: 0 };
  registo.falhas += 1;
  if (registo.falhas >= FALHAS_LOGIN_MAX) {
    registo.bloqueadoAte = Date.now() + BLOQUEIO_CONTA_MS;
    registo.falhas = 0;
  }
  falhasLoginPorEmail.set(email, registo);
}

const limparFalhasLogin = (email) => falhasLoginPorEmail.delete(email);

module.exports = {
  limitarLogin, limitarRegisto, limitarChat, limitarEsqueciSenha, limitarReporSenha,
  contaBloqueada, registarFalhaLogin, limparFalhasLogin,
};
