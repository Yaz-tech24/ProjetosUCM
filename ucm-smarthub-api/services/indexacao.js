const path = require("path");
const fs = require("fs");
const db = require("../config/db");
const { extractPdfText } = require("./ia");
const { uploadsDir } = require("../middleware/upload");

// Texto dos PDFs guardado em materiais.texto_extraido para (1) pesquisa
// FULLTEXT dentro do conteúdo e (2) alimentar resumo, chat e quizzes sem
// reextrair o ficheiro a cada pedido.
const LIMITE_CARACTERES = 300000;

function caminhoDoMaterial(urlArquivo) {
  const nome = path.basename(String(urlArquivo || ""));
  if (!nome || nome.includes("..")) return null;
  return path.join(uploadsDir, nome);
}

async function indexarMaterial(materialId, urlArquivo) {
  try {
    const caminho = caminhoDoMaterial(urlArquivo);
    if (!caminho || !fs.existsSync(caminho)) return false;
    const texto = (await extractPdfText(caminho)).replace(/\s+/g, " ").trim().slice(0, LIMITE_CARACTERES);
    await db.query("UPDATE materiais SET texto_extraido = ?, texto_indexado_em = NOW() WHERE id = ?", [texto || null, materialId]);
    return true;
  } catch (erro) {
    // Marca como tentado para não repetir para sempre um PDF corrompido.
    await db.query("UPDATE materiais SET texto_indexado_em = NOW() WHERE id = ?", [materialId]).catch(() => {});
    console.error(`[Indexação] Falhou material ${materialId}:`, erro.message);
    return false;
  }
}

// Corre em background no arranque e de hora a hora: apanha materiais
// anteriores a esta funcionalidade e os que falharam a indexação imediata.
let aCorrer = false;
async function indexarPendentes(limite = 50) {
  if (aCorrer) return 0;
  aCorrer = true;
  let feitos = 0;
  try {
    const [pendentes] = await db.query(
      "SELECT id, url_arquivo FROM materiais WHERE tipo = 'PDF' AND texto_indexado_em IS NULL ORDER BY id LIMIT ?",
      [limite]
    );
    for (const m of pendentes) {
      if (await indexarMaterial(m.id, m.url_arquivo)) feitos++;
    }
    if (feitos > 0) console.log(`[Indexação] ${feitos} material(is) indexado(s) para pesquisa.`);
  } catch (erro) {
    console.error("[Indexação] Erro ao procurar pendentes:", erro.message);
  } finally {
    aCorrer = false;
  }
  return feitos;
}

function agendarIndexacao() {
  setTimeout(() => indexarPendentes().catch(() => {}), 10 * 1000).unref?.();
  setInterval(() => indexarPendentes().catch(() => {}), 60 * 60 * 1000).unref?.();
}

// Transforma "cálculo integral" em "+cálculo* +integral*" — cada palavra é
// obrigatória e pode ser prefixo. Caracteres com significado no modo booleano
// do MySQL (+ - < > ( ) ~ * " @) são removidos do input.
function consultaBooleana(busca) {
  return String(busca || "")
    .split(/\s+/)
    .map(p => p.replace(/[+\-<>()~*"@]/g, "").trim())
    .filter(p => p.length >= 2)
    .map(p => `+${p}*`)
    .join(" ");
}

module.exports = { indexarMaterial, indexarPendentes, agendarIndexacao, consultaBooleana, LIMITE_CARACTERES };
