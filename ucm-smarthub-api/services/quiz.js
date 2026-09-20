const { SchemaType } = require("@google/generative-ai");
const { genAI, chamarGemini, extrairJson } = require("./gemini");

// Saída estruturada: o modelo é obrigado a devolver exactamente esta forma —
// acaba com as respostas "quase JSON" que a validação abaixo rejeitava.
const SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    perguntas: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          pergunta: { type: SchemaType.STRING },
          opcoes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          correcta: { type: SchemaType.INTEGER },
          explicacao: { type: SchemaType.STRING },
        },
        required: ["pergunta", "opcoes", "correcta", "explicacao"],
      },
    },
  },
  required: ["perguntas"],
};

const TOTAL_PERGUNTAS = 10;
const OPCOES_POR_PERGUNTA = 4;
const LIMITE_TEXTO = 60000;

function construirPrompt({ nomePlataforma, titulo, cadeira, texto }) {
  return `És o assistente académico de IA da plataforma "${nomePlataforma}".

Com base no documento académico abaixo (disciplina: ${cadeira}; título: "${titulo}"), cria um teste de ${TOTAL_PERGUNTAS} perguntas de escolha múltipla em português europeu para um estudante universitário verificar se percebeu a matéria.

REGRAS:
- Cada pergunta tem exactamente ${OPCOES_POR_PERGUNTA} opções e UMA só correcta.
- As perguntas cobrem partes diferentes do documento, das mais simples às mais exigentes.
- As opções erradas têm de ser plausíveis (erros comuns), não absurdas.
- A explicação diz porque é que a correcta está certa, em 1–2 frases.
- Não inventes factos que não estejam no documento.

RESPONDE APENAS com JSON válido, sem texto antes ou depois e sem cercas de código, exactamente neste formato:
{"perguntas":[{"pergunta":"...","opcoes":["...","...","...","..."],"correcta":0,"explicacao":"..."}]}

DOCUMENTO:
${texto}`;
}

function validarPerguntas(dados) {
  const lista = Array.isArray(dados?.perguntas) ? dados.perguntas : [];
  const validas = lista
    .filter(p => p && typeof p.pergunta === "string" && Array.isArray(p.opcoes) && p.opcoes.length === OPCOES_POR_PERGUNTA
      && p.opcoes.every(o => typeof o === "string" && o.trim()) && Number.isInteger(p.correcta) && p.correcta >= 0 && p.correcta < OPCOES_POR_PERGUNTA)
    .map(p => ({
      pergunta: p.pergunta.trim().slice(0, 500),
      opcoes: p.opcoes.map(o => o.trim().slice(0, 300)),
      correcta: p.correcta,
      explicacao: typeof p.explicacao === "string" ? p.explicacao.trim().slice(0, 600) : "",
    }))
    .slice(0, TOTAL_PERGUNTAS);
  if (validas.length < 5) throw new Error(`A IA devolveu só ${validas.length} pergunta(s) válida(s).`);
  return validas;
}

async function gerarQuiz({ nomePlataforma, titulo, cadeira, texto }, cliente = genAI) {
  const prompt = construirPrompt({ nomePlataforma, titulo, cadeira, texto: String(texto).slice(0, LIMITE_TEXTO) });
  // Erros de rede/quota chegam já classificados (ErroIA, com status 429/503/502);
  // uma resposta bem recebida mas inválida é falha de conteúdo → 502.
  const { texto: resposta, modelo } = await chamarGemini({ prompt, recurso: "quiz", json: true, schema: SCHEMA, temperature: 0.4, cliente });
  try {
    return { perguntas: validarPerguntas(extrairJson(resposta)), modelo };
  } catch (erro) {
    throw Object.assign(new Error(`Não foi possível gerar o quiz: ${erro.message}`), { status: 502 });
  }
}

// Sem a resposta certa nem a explicação — só depois de responder.
const semSolucoes = (perguntas) => perguntas.map(({ pergunta, opcoes }, i) => ({ n: i + 1, pergunta, opcoes }));

function corrigir(perguntas, respostas) {
  const detalhe = perguntas.map((p, i) => {
    const escolhida = Number.isInteger(respostas?.[i]) ? respostas[i] : null;
    return { n: i + 1, escolhida, correcta: p.correcta, certa: escolhida === p.correcta, explicacao: p.explicacao };
  });
  return { pontuacao: detalhe.filter(d => d.certa).length, total: perguntas.length, detalhe };
}

module.exports = { gerarQuiz, semSolucoes, corrigir, TOTAL_PERGUNTAS, LIMITE_TEXTO };
