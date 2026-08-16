const db = require("../config/db");
const { paraUrlAbsoluto } = require("../utils/urls");

async function getConfiguracoes() {
  const [[config]] = await db.query("SELECT * FROM configuracoes WHERE id = 1");
  if (!config) return {};
  // logo_url é guardado como caminho relativo — converte-se aqui, num único
  // sítio, para que todos os consumidores (rotas, emails) recebam sempre um
  // URL absoluto correcto face ao domínio ACTUAL da instância.
  return { ...config, logo_url: paraUrlAbsoluto(config.logo_url) };
}

async function getCursos() {
  const [rows] = await db.query("SELECT id, nome FROM cursos ORDER BY nome ASC");
  return rows;
}

async function getEstatisticas() {
  const [[{ total_materiais }]] = await db.query(
    "SELECT COUNT(*) as total_materiais FROM materiais WHERE status = 'aprovado'"
  );
  const [[{ total_utilizadores }]] = await db.query(
    "SELECT COUNT(*) as total_utilizadores FROM usuarios"
  );
  const [[{ total_mensagens }]] = await db.query(
    "SELECT COUNT(*) as total_mensagens FROM mensagens_estudantes"
  );
  const [[{ total_pdfs }]] = await db.query(
    "SELECT COUNT(*) as total_pdfs FROM materiais WHERE status = 'aprovado' AND tipo = 'PDF'"
  );
  const [[{ total_videos }]] = await db.query(
    "SELECT COUNT(*) as total_videos FROM materiais WHERE status = 'aprovado' AND tipo = 'Vídeo'"
  );
  const [[{ materiais_hoje }]] = await db.query(
    "SELECT COUNT(*) as materiais_hoje FROM materiais WHERE status = 'aprovado' AND DATE(data_upload) = CURDATE()"
  );
  return { total_materiais, total_utilizadores, total_mensagens, total_pdfs, total_videos, materiais_hoje };
}

module.exports = { getConfiguracoes, getCursos, getEstatisticas };
