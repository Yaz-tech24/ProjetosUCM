const util = require("util");
const fs = require("fs");
const { PDFParse } = require("pdf-parse");
// Cliente partilhado: cadeia de modelos, repetições, fila e estatísticas
// vivem em services/gemini.js — aqui ficam só as funções de negócio.
const { genAI, GEMINI_MODELS, chamarGemini, extrairJson } = require("./gemini");

const readFile = util.promisify(fs.readFile);

async function extractPdfText(filePath) {
  const dataBuffer = await readFile(filePath);
  // pdf-parse 2.x expõe uma classe (não uma função callable como em versões
  // anteriores) — new PDFParse({ data }) + getText() é a API actual.
  const parser = new PDFParse({ data: dataBuffer });
  try {
    const resultado = await parser.getText();
    return resultado.text || "";
  } finally {
    await parser.destroy();
  }
}

// Texto livre com fallback: nunca lança — quem chama decide o que mostrar
// quando a IA não responde (o resumo genérico, a mensagem "tente de novo").
// `recurso` rotula a chamada nas estatísticas de Admin → Sistema.
async function gerarResumoIA(prompt, fallbackText, { recurso = "texto", cliente = genAI } = {}) {
  if (!cliente) return fallbackText;
  try {
    const { texto } = await chamarGemini({ prompt, recurso, cliente });
    return texto;
  } catch (erro) {
    console.error(`[IA] ${recurso}: ${erro.message}`);
    return fallbackText;
  }
}

// Verifica com a IA se um material corresponde ao propósito configurado da plataforma.
// Nunca bloqueia sozinha — apenas sinaliza para revisão humana no painel de admin.
// Em caso de erro/resposta inesperada, falha "aberta" (não sinaliza), para nunca travar
// uploads legítimos por uma falha da IA.
// `cliente` é injectável (por defeito o genAI real) para permitir testar esta
// função com um cliente falso, sem depender de mocking do módulo do SDK.
async function verificarConformidadeIA(config, { titulo, cadeira, tipo }, cliente = genAI) {
  if (!config.moderacao_ia_activada || !cliente) return { sinalizado: false, motivo: null };

  const prompt = `Avalia se o material académico abaixo é compatível com o propósito desta plataforma.

Propósito da plataforma: ${config.descricao_proposito || "Plataforma académica para partilha de materiais de estudo."}

Material submetido:
Título: ${titulo}
Disciplina/curso: ${cadeira}
Tipo: ${tipo}

Responde APENAS com um JSON válido, sem texto adicional, neste formato exacto:
{"conforme": true, "motivo": ""}
ou, se não corresponder ao propósito:
{"conforme": false, "motivo": "razão curta e específica em português"}`;

  try {
    // JSON puro pedido ao modelo; a extracção tolerante mantém-se como rede
    // de segurança para respostas envoltas em texto/cercas. A moderação corre
    // no upload com o aluno à espera: uma tentativa por modelo, 15 s no total.
    const { texto } = await chamarGemini({ prompt, recurso: "moderacao_upload", json: true, tentativas: 1, orcamentoMs: 15000, cliente });
    const parsed = extrairJson(texto);
    if (parsed.conforme === false) {
      return { sinalizado: true, motivo: String(parsed.motivo || "Possível desvio do propósito da plataforma.").slice(0, 500) };
    }
    return { sinalizado: false, motivo: null };
  } catch (erro) {
    console.error("Erro na moderação por IA (a ignorar, não bloqueia o upload):", erro.message);
    return { sinalizado: false, motivo: null };
  }
}

// Tecto para qualquer texto livre de estudante que entre directamente num prompt
// (mensagem do chat geral, pergunta sobre um material). Sem isto, o único limite
// real era o corpo JSON completo do Express (100 KB) — generoso demais para uma
// pergunta, e caro em tokens da API do Gemini se abusado dentro do rate limit.
const MENSAGEM_IA_MAX = 4000;

module.exports = { genAI, GEMINI_MODELS, MENSAGEM_IA_MAX, extractPdfText, gerarResumoIA, verificarConformidadeIA };
