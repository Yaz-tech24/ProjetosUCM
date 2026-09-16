const { SchemaType } = require("@google/generative-ai");
const { genAI, chamarGemini, extrairJson } = require("./gemini");

const SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    cartoes: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.OBJECT, properties: { frente: { type: SchemaType.STRING }, verso: { type: SchemaType.STRING } }, required: ["frente", "verso"] },
    },
  },
  required: ["cartoes"],
};

// Flashcards gerados por IA a partir do texto do PDF, revistos com uma
// versão simplificada do algoritmo SM-2 (o do Anki): cada resposta do
// estudante ("errei", "difícil", "fácil") ajusta a facilidade do cartão e o
// intervalo até à próxima revisão.
const TOTAL_CARTOES = 20;
const LIMITE_TEXTO = 14000;
const FACILIDADE_MIN = 1.3;
const FACILIDADE_INICIAL = 2.5;

function construirPrompt({ nomePlataforma, titulo, cadeira, texto }) {
  return `És o assistente académico de IA da plataforma "${nomePlataforma}".

Com base no documento académico abaixo (disciplina: ${cadeira}; título: "${titulo}"), cria ${TOTAL_CARTOES} flashcards em português europeu para um estudante universitário memorizar a matéria por repetição espaçada.

REGRAS:
- A "frente" é uma pergunta curta, uma definição a completar ou um termo; o "verso" é a resposta directa (1 a 3 frases, no máximo 300 caracteres).
- Cobre conceitos, definições, fórmulas, datas, passos de procedimentos e relações causa-efeito que estejam de facto no documento.
- Um facto por cartão. Sem perguntas de sim/não.
- Não inventes nada que não esteja no documento.

RESPONDE APENAS com JSON válido, sem texto antes ou depois e sem cercas de código, exactamente neste formato:
{"cartoes":[{"frente":"...","verso":"..."}]}

DOCUMENTO:
${texto}`;
}

function validarCartoes(dados) {
  const lista = Array.isArray(dados?.cartoes) ? dados.cartoes : [];
  const vistos = new Set();
  const validos = [];
  for (const c of lista) {
    if (!c || typeof c.frente !== "string" || typeof c.verso !== "string") continue;
    const frente = c.frente.trim().slice(0, 500);
    const verso = c.verso.trim().slice(0, 1000);
    if (!frente || !verso || vistos.has(frente.toLowerCase())) continue;
    vistos.add(frente.toLowerCase());
    validos.push({ frente, verso });
    if (validos.length >= TOTAL_CARTOES) break;
  }
  if (validos.length < 6) throw new Error(`A IA devolveu só ${validos.length} cartão(ões) válido(s).`);
  return validos;
}

async function gerarFlashcards({ nomePlataforma, titulo, cadeira, texto }, cliente = genAI) {
  const prompt = construirPrompt({ nomePlataforma, titulo, cadeira, texto: String(texto).slice(0, LIMITE_TEXTO) });
  const { texto: resposta, modelo } = await chamarGemini({ prompt, recurso: "flashcards", json: true, schema: SCHEMA, temperature: 0.4, cliente });
  try {
    return { cartoes: validarCartoes(extrairJson(resposta)), modelo };
  } catch (erro) {
    throw Object.assign(new Error(`Não foi possível gerar os flashcards: ${erro.message}`), { status: 502 });
  }
}

// SM-2 simplificado. `estado` é a linha actual de flashcards_revisoes (ou
// null na primeira revisão); devolve o estado novo. Intervalos em dias.
//   errei   → recomeça: revê amanhã, facilidade desce
//   dificil → intervalo cresce pouco, facilidade desce ligeiramente
//   facil   → intervalo cresce pela facilidade (1 → 6 → ×facilidade …)
const RESULTADOS = ["errei", "dificil", "facil"];

function proximoEstado(estado, resultado) {
  const facilidadeActual = Number(estado?.facilidade) || FACILIDADE_INICIAL;
  const repeticoes = Number(estado?.repeticoes) || 0;
  const intervaloActual = Number(estado?.intervalo_dias) || 0;
  const total = (Number(estado?.total_revisoes) || 0) + 1;

  if (resultado === "errei") {
    return { facilidade: Math.max(FACILIDADE_MIN, facilidadeActual - 0.2), repeticoes: 0, intervalo_dias: 1, total_revisoes: total };
  }
  if (resultado === "dificil") {
    const intervalo = repeticoes === 0 ? 1 : Math.max(1, Math.round(intervaloActual * 1.2));
    return { facilidade: Math.max(FACILIDADE_MIN, facilidadeActual - 0.15), repeticoes: repeticoes + 1, intervalo_dias: intervalo, total_revisoes: total };
  }
  // facil
  let intervalo;
  if (repeticoes === 0) intervalo = 1;
  else if (repeticoes === 1) intervalo = 6;
  else intervalo = Math.max(1, Math.round(intervaloActual * facilidadeActual));
  return { facilidade: Math.min(3.5, facilidadeActual + 0.1), repeticoes: repeticoes + 1, intervalo_dias: Math.min(intervalo, 365), total_revisoes: total };
}

function dataMaisDias(dias) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

module.exports = { gerarFlashcards, proximoEstado, dataMaisDias, RESULTADOS, TOTAL_CARTOES, FACILIDADE_INICIAL };
