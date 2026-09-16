const { SchemaType } = require("@google/generative-ai");
const { genAI, chamarGemini, extrairJson } = require("./gemini");

const SCHEMA = {
  type: SchemaType.OBJECT,
  properties: { classificacao: { type: SchemaType.STRING }, sugestao: { type: SchemaType.STRING }, motivo: { type: SchemaType.STRING } },
  required: ["classificacao", "sugestao", "motivo"],
};

// Classificação assistida de denúncias: a IA lê o conteúdo reportado e o
// motivo, e SUGERE uma acção ao administrador. Nunca decide sozinha — a fila
// continua a ser fechada por uma pessoa. Falha "fechada" para "incerto":
// sem IA ou com erro, a denúncia fica simplesmente sem sugestão.
const CLASSIFICACOES = ["spam", "ofensivo", "assedio", "direitos_autor", "informacao_errada", "fora_do_ambito", "sem_problema", "incerto"];
const SUGESTOES = ["remover", "ignorar", "rever"];
const TIMEOUT_MS = 12000;

const MOTIVOS_LEGIVEIS = {
  conteudo_improprio: "conteúdo impróprio", direitos_autor: "violação de direitos de autor", spam: "spam",
  informacao_errada: "informação errada", assedio: "assédio", outro: "outro",
};

function construirPrompt({ tipo, motivo, detalhes, conteudo, proposito }) {
  return `És o assistente de moderação de uma plataforma académica universitária.

Propósito da plataforma: ${proposito || "Partilha de materiais de estudo e ajuda entre estudantes."}

Um utilizador reportou o seguinte conteúdo:
Tipo de conteúdo: ${tipo}
Motivo indicado por quem reportou: ${MOTIVOS_LEGIVEIS[motivo] || motivo}
Detalhes de quem reportou: ${detalhes ? detalhes.slice(0, 600) : "(nenhum)"}

Conteúdo reportado (pode estar truncado):
"""
${String(conteudo || "").slice(0, 2500)}
"""

Classifica o conteúdo e sugere uma acção ao administrador humano, que decide no fim.
- classificacao: uma de ${CLASSIFICACOES.join(", ")}
- sugestao: "remover" (violação clara), "ignorar" (denúncia sem fundamento) ou "rever" (ambíguo, precisa de olhar humano)
- motivo: uma frase curta em português europeu a justificar

Sê conservador: em caso de dúvida usa "rever". "remover" só para spam evidente, ofensas ou assédio explícitos, ou violação clara de direitos de autor.

RESPONDE APENAS com JSON válido, sem cercas de código:
{"classificacao":"...","sugestao":"...","motivo":"..."}`;
}

function normalizar(parsed) {
  const classificacao = CLASSIFICACOES.includes(parsed?.classificacao) ? parsed.classificacao : "incerto";
  const sugestao = SUGESTOES.includes(parsed?.sugestao) ? parsed.sugestao : "rever";
  const motivo = typeof parsed?.motivo === "string" ? parsed.motivo.trim().slice(0, 300) : "";
  return { classificacao, sugestao, motivo };
}

async function classificarDenuncia({ tipo, motivo, detalhes, conteudo, proposito }, cliente = genAI) {
  if (!cliente || !conteudo) return null;
  const prompt = construirPrompt({ tipo, motivo, detalhes, conteudo, proposito });
  try {
    // Corre dentro do pedido de denúncia — 2 tentativas e timeout curto para
    // não prender quem reporta; sem sugestão a fila continua a funcionar.
    const { texto } = await chamarGemini({ prompt, recurso: "moderacao_denuncias", json: true, schema: SCHEMA, temperature: 0.1, tentativas: 1, orcamentoMs: 15000, timeoutMs: TIMEOUT_MS, cliente });
    return normalizar(extrairJson(texto));
  } catch (erro) {
    console.error("[Moderação IA] Classificação da denúncia falhou (a ignorar):", erro.message);
    return null;
  }
}

module.exports = { classificarDenuncia, normalizar, CLASSIFICACOES, SUGESTOES };
