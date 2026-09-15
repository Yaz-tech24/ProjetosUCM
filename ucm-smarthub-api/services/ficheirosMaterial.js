const path = require("path");
const fs = require("fs");
const db = require("../config/db");
const { uploadsDir } = require("../middleware/upload");

const nomeSeguro = (urlArquivo) => {
  const nome = path.basename(String(urlArquivo || ""));
  return nome && !nome.includes("..") ? nome : null;
};

// Apaga do disco o ficheiro actual E os das versões anteriores de um
// material. Tem de correr ANTES do DELETE FROM materiais — as linhas de
// versoes_materiais caem em cascata e deixariam os ficheiros órfãos.
async function apagarFicheirosMaterial(materialId) {
  try {
    const [[material]] = await db.query("SELECT url_arquivo FROM materiais WHERE id = ?", [materialId]);
    const [versoes] = await db.query("SELECT url_arquivo FROM versoes_materiais WHERE material_id = ?", [materialId]);
    for (const url of [material?.url_arquivo, ...versoes.map(v => v.url_arquivo)]) {
      const nome = nomeSeguro(url);
      if (nome) fs.unlink(path.join(uploadsDir, nome), () => {});
    }
  } catch (erro) {
    console.error("[Ficheiros] Erro ao apagar ficheiros do material:", erro.message);
  }
}

module.exports = { apagarFicheirosMaterial, nomeSeguro };
