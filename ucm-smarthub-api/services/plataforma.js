const db = require("../config/db");
const { paraUrlAbsoluto } = require("../utils/urls");

// getConfiguracoes() é chamado em quase todos os pedidos (incluindo no
// fileFilter do multer, a cada upload) para ler uma linha que quase nunca
// muda — cache-se em memória, com invalidação explícita sempre que a
// configuração é escrita (ver invalidarCacheConfig(), chamado nas rotas de
// escrita em routes/config.js), em vez de reconsultar a BD em cada pedido.
let configCache = null;

function invalidarCacheConfig() {
  configCache = null;
}

async function getConfiguracoes() {
  // Cache desligada em testes: cada teste mocka a BD com uma configuração
  // diferente e espera vê-la reflectida de imediato, sem partilhar estado
  // entre casos de teste através de uma cache a nível de módulo.
  const cacheActiva = process.env.NODE_ENV !== "test";
  if (cacheActiva && configCache) return configCache;

  const [[config]] = await db.query("SELECT * FROM configuracoes WHERE id = 1");
  if (!config) return {};
  // logo_url é guardado como caminho relativo — converte-se aqui, num único
  // sítio, para que todos os consumidores (rotas, emails) recebam sempre um
  // URL absoluto correcto face ao domínio ACTUAL da instância.
  const resultado = { ...config, logo_url: paraUrlAbsoluto(config.logo_url) };
  if (cacheActiva) configCache = resultado;
  return resultado;
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

module.exports = { getConfiguracoes, getCursos, getEstatisticas, invalidarCacheConfig };
