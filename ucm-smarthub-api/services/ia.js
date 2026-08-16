const util = require("util");
const fs = require("fs");
const { PDFParse } = require("pdf-parse");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const readFile = util.promisify(fs.readFile);

// Instância Gemini criada uma vez ao carregar o módulo
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// Modelos a tentar por ordem (testados e confirmados a responder com a chave configurada).
// "gemini-flash-latest" é um alias que a Google mantém apontado ao modelo "flash" mais
// recente disponível — funciona como rede de segurança extra se um modelo fixo for descontinuado.
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
];

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

async function gerarResumoIA(prompt, fallbackText) {
  if (!genAI) return fallbackText;

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text && text.trim().length > 0) return text;
    } catch {
      // tenta próximo modelo
    }
  }

  return fallbackText;
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
    const model = cliente.getGenerativeModel({ model: GEMINI_MODELS[0] });
    const result = await model.generateContent(prompt);
    const texto = result.response.text().trim();
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { sinalizado: false, motivo: null };

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.conforme === false) {
      return { sinalizado: true, motivo: String(parsed.motivo || "Possível desvio do propósito da plataforma.").slice(0, 500) };
    }
    return { sinalizado: false, motivo: null };
  } catch (erro) {
    console.error("Erro na moderação por IA (a ignorar, não bloqueia o upload):", erro.message);
    return { sinalizado: false, motivo: null };
  }
}

module.exports = { genAI, GEMINI_MODELS, extractPdfText, gerarResumoIA, verificarConformidadeIA };
