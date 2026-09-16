const crypto = require("crypto");
const db = require("../config/db");
const { genAI, GEMINI_MODELS } = require("./ia");

// Tradução do resumo por IA (PT ↔ EN) com cache em `traducoes`. O hash do
// texto de origem invalida a tradução quando o resumo é regenerado.
const IDIOMAS = { pt: "português europeu", en: "inglês" };
const LIMITE_TEXTO = 20000;

const hashDe = (texto) => crypto.createHash("sha256").update(String(texto)).digest("hex");

function construirPrompt(texto, idioma) {
  return `Traduz o texto abaixo para ${IDIOMAS[idioma]}. É um resumo de estudo académico com secções em maiúsculas e bullets.

REGRAS:
- Mantém EXACTAMENTE a estrutura: linhas de título em maiúsculas, bullets a começar por "• ", quebras de linha.
- Traduz também os títulos das secções.
- Não acrescentes, resumas nem comentes nada. Só a tradução.
- Termos técnicos: usa a forma corrente na área académica em ${IDIOMAS[idioma]}.

TEXTO:
${texto}`;
}

async function traduzir(texto, idioma) {
  if (!genAI) throw Object.assign(new Error("IA não configurada neste servidor."), { status: 503 });
  if (!IDIOMAS[idioma]) throw Object.assign(new Error("Idioma não suportado."), { status: 400 });
  const prompt = construirPrompt(String(texto).slice(0, LIMITE_TEXTO), idioma);
  let ultimoErro = null;
  for (const modelo of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelo, generationConfig: { temperature: 0.2 } });
      const resultado = await model.generateContent(prompt);
      const saida = resultado.response.text().trim();
      if (saida.length > 20) return saida;
    } catch (erro) {
      ultimoErro = erro;
    }
  }
  throw Object.assign(new Error(`Não foi possível traduzir: ${ultimoErro?.message || "sem resposta da IA"}`), { status: 502 });
}

// Devolve a tradução (da cache se o texto de origem não mudou). `traduzirFn`
// é injectável para testes.
async function traduzirComCache({ materialId, campo, idioma, texto }, traduzirFn = traduzir) {
  const hash = hashDe(texto);
  const [[cache]] = await db.query(
    "SELECT texto, origem_hash, gerado_em FROM traducoes WHERE material_id = ? AND campo = ? AND idioma = ?",
    [materialId, campo, idioma]
  );
  if (cache && cache.origem_hash === hash) return { texto: cache.texto, cache: true };
  const traduzido = await traduzirFn(texto, idioma);
  await db.query(
    `INSERT INTO traducoes (material_id, campo, idioma, texto, origem_hash) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE texto = VALUES(texto), origem_hash = VALUES(origem_hash), gerado_em = NOW()`,
    [materialId, campo, idioma, traduzido, hash]
  );
  return { texto: traduzido, cache: false };
}

module.exports = { traduzir, traduzirComCache, IDIOMAS, hashDe };
