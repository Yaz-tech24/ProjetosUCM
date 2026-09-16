const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { uploadsDir } = require("../middleware/upload");

// Exporta um conjunto de materiais como .zip em streaming (nunca carrega os
// ficheiros todos em memória). Só PDFs — os vídeos são grandes demais para
// um download em bloco e já têm link directo.
const LIMITE_MB = Number(process.env.ZIP_LIMITE_MB || 300);
const NOME_MAX = 80;

const nomeFicheiroSeguro = (titulo) =>
  String(titulo || "material")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")     // remove acentos
    .replace(/[^a-zA-Z0-9 _.-]+/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, NOME_MAX) || "material";

const caminhoLocal = (urlArquivo) => {
  const nome = path.basename(String(urlArquivo || ""));
  return nome && !nome.includes("..") ? path.join(uploadsDir, nome) : null;
};

// Prepara a lista: confirma que cada ficheiro existe, soma tamanhos e
// aplica o limite. Devolve { entradas, bytes, ignorados } ou lança 413.
async function prepararEntradas(materiais) {
  const entradas = [];
  const usados = new Set();
  let bytes = 0;
  let ignorados = 0;
  for (const [i, m] of materiais.entries()) {
    if (m.tipo !== "PDF") { ignorados++; continue; }
    const caminho = caminhoLocal(m.url_arquivo);
    if (!caminho) { ignorados++; continue; }
    let st;
    try { st = await fs.promises.stat(caminho); } catch { ignorados++; continue; }
    if (!st.isFile()) { ignorados++; continue; }
    bytes += st.size;
    let nome = `${String(i + 1).padStart(2, "0")} - ${nomeFicheiroSeguro(m.titulo)}.pdf`;
    while (usados.has(nome)) nome = nome.replace(/\.pdf$/, "_.pdf");
    usados.add(nome);
    entradas.push({ caminho, nome, bytes: st.size });
  }
  if (bytes > LIMITE_MB * 1024 * 1024) {
    throw Object.assign(new Error(`A colecção tem ${Math.round(bytes / 1048576)} MB em PDFs — o limite para exportar em ZIP é ${LIMITE_MB} MB.`), { status: 413 });
  }
  return { entradas, bytes, ignorados };
}

// Escreve o zip directamente na resposta HTTP. Deve ser chamado depois de
// definir os cabeçalhos; qualquer erro depois de começar a escrever só pode
// ser registado (a resposta já vai a meio).
function escreverZip(res, entradas, { leiame } = {}) {
  return new Promise((resolve, reject) => {
    const arquivo = archiver("zip", { zlib: { level: 1 } }); // PDFs já vêm comprimidos — nível baixo é mais rápido
    arquivo.on("error", reject);
    arquivo.on("warning", (erro) => { if (erro.code !== "ENOENT") reject(erro); });
    res.on("close", resolve);
    arquivo.pipe(res);
    if (leiame) arquivo.append(leiame, { name: "LEIA-ME.txt" });
    for (const e of entradas) arquivo.file(e.caminho, { name: e.nome });
    arquivo.finalize().catch(reject);
  });
}

module.exports = { prepararEntradas, escreverZip, nomeFicheiroSeguro, LIMITE_MB };
