// ─── Rate limiting simples (sem dependências) para rotas de autenticação ──────
// Protege login/registo contra força bruta e spam de contas.
//
// Nota sobre memória: cada IP/email que alguma vez bate num destes limites
// fica com uma entrada no Map correspondente. Sem limpeza, isto cresce sem
// limite ao longo de meses de actividade (nunca mais liberta memória do
// processo). Cada limitador limpa-se sozinho periodicamente — ver
// limparPeriodicamente() abaixo.
function criarLimitadorTaxa({ janelaMs, maxTentativas }) {
  const tentativasPorChave = new Map();

  const limpar = () => {
    const agora = Date.now();
    for (const [chave, tentativas] of tentativasPorChave) {
      const activas = tentativas.filter(t => agora - t < janelaMs);
      if (activas.length === 0) tentativasPorChave.delete(chave);
      else tentativasPorChave.set(chave, activas);
    }
  };
  // .unref() — este temporizador nunca deve, por si só, impedir o processo
  // Node de terminar (relevante em testes e em paragem graciosa do servidor).
  const intervalo = setInterval(limpar, Math.max(janelaMs, 10 * 60 * 1000));
  intervalo.unref?.();

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
// Chave por IP: em campus/redes móveis com NAT partilhado, muitos estudantes reais
// podem aparecer com o mesmo IP — um limite baixo aqui bloqueia turmas inteiras a
// meio do registo (visto em produção: registos param de ser aceites depois de ~8-10
// pedidos vindos da mesma rede, muito antes de ser um ataque real). 200/hora continua
// a impedir scripts de spam em massa sem penalizar picos legítimos de utilizadores.
const limitarRegisto = criarLimitadorTaxa({ janelaMs: 60 * 60 * 1000, maxTentativas: 200 });
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

// Purga contas cujo bloqueio já expirou e que não tiveram nenhuma falha nova
// entretanto — mesmo raciocínio de memória que os limitadores acima.
const intervaloFalhas = setInterval(() => {
  const agora = Date.now();
  for (const [email, registo] of falhasLoginPorEmail) {
    if (agora >= registo.bloqueadoAte) falhasLoginPorEmail.delete(email);
  }
}, 30 * 60 * 1000);
intervaloFalhas.unref?.();

module.exports = {
  limitarLogin, limitarRegisto, limitarChat, limitarEsqueciSenha, limitarReporSenha,
  contaBloqueada, registarFalhaLogin, limparFalhasLogin,
};
