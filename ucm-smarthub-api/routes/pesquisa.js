const db = require("../config/db");
const { autenticar } = require("../middleware/auth");
const { consultaBooleana } = require("../services/indexacao");

// Pesquisa unificada (paleta Ctrl+K): os melhores resultados de cada tipo
// numa só chamada. Cada bloco é independente — se um falhar (ex: índice
// FULLTEXT ainda a construir), os outros continuam a vir.
const LIMITE = 5;

async function pesquisarMateriais(q, like) {
  const booleana = consultaBooleana(q);
  const [linhas] = await db.query(
    `SELECT m.id, m.titulo, m.cadeira, m.tipo, m.visualizacoes
     FROM materiais m
     WHERE m.status = 'aprovado' AND (m.titulo LIKE ? ${booleana ? "OR MATCH(m.titulo, m.texto_extraido) AGAINST (? IN BOOLEAN MODE)" : ""})
     ORDER BY (m.titulo LIKE ?) DESC, m.visualizacoes DESC, m.data_upload DESC
     LIMIT ?`,
    booleana ? [like, booleana, like, LIMITE] : [like, like, LIMITE]
  );
  return linhas;
}

async function pesquisarPerguntas(like) {
  const [linhas] = await db.query(
    `SELECT p.id, p.titulo, p.disciplina, p.resolvida,
            (SELECT COUNT(*) FROM respostas r WHERE r.pergunta_id = p.id) AS total_respostas
     FROM perguntas p WHERE p.titulo LIKE ? OR p.conteudo LIKE ?
     ORDER BY p.criado_em DESC LIMIT ?`,
    [like, like, LIMITE]
  );
  return linhas;
}

async function pesquisarColecoes(like, usuarioId) {
  const [linhas] = await db.query(
    `SELECT c.slug, c.nome, c.publica, u.nome AS dono,
            (SELECT COUNT(*) FROM colecoes_materiais cm WHERE cm.colecao_id = c.id) AS total
     FROM colecoes c JOIN usuarios u ON u.id = c.usuario_id
     WHERE (c.publica = 1 OR c.usuario_id = ?) AND c.nome LIKE ?
     ORDER BY (c.usuario_id = ?) DESC, c.atualizado_em DESC LIMIT ?`,
    [usuarioId, like, usuarioId, LIMITE]
  );
  return linhas;
}

async function pesquisarEventos(like) {
  const [linhas] = await db.query(
    `SELECT id, titulo, disciplina, tipo, data_inicio FROM eventos_calendario
     WHERE (titulo LIKE ? OR disciplina LIKE ?) AND data_inicio >= DATE_SUB(NOW(), INTERVAL 1 DAY)
     ORDER BY data_inicio ASC LIMIT ?`,
    [like, like, LIMITE]
  );
  return linhas;
}

async function pesquisarPedidos(like) {
  const [linhas] = await db.query(
    `SELECT id, titulo, disciplina, estado FROM pedidos_materiais
     WHERE estado = 'aberto' AND (titulo LIKE ? OR disciplina LIKE ?)
     ORDER BY criado_em DESC LIMIT ?`,
    [like, like, 3]
  );
  return linhas;
}

async function pesquisarUtilizadores(like, ehAdmin) {
  if (!ehAdmin) return [];
  const [linhas] = await db.query(
    `SELECT id, nome, email, papel, curso FROM usuarios
     WHERE (nome LIKE ? OR email LIKE ?) AND email <> 'conta-eliminada@sistema.local'
     ORDER BY nome ASC LIMIT ?`,
    [like, like, LIMITE]
  );
  return linhas;
}

module.exports = function registarRotasPesquisa(app) {
  /**
   * @openapi
   * /api/pesquisa:
   *   get:
   *     summary: Pesquisa global — materiais, perguntas, colecções, eventos e pedidos numa só chamada
   *     tags: [Pesquisa]
   *     parameters:
   *       - in: query
   *         name: q
   *         required: true
   *         schema: { type: string, minLength: 2 }
   *     responses:
   *       200: { description: Até 5 resultados por tipo (utilizadores só para admins) }
   */
  app.get("/api/pesquisa", autenticar, async (req, res) => {
    const q = String(req.query.q || "").trim().slice(0, 100);
    if (q.length < 2) return res.json({ q, materiais: [], perguntas: [], colecoes: [], eventos: [], pedidos: [], utilizadores: [] });
    const like = `%${q}%`;
    const seguro = (p) => p.catch(erro => { console.error("[Pesquisa] Bloco falhou:", erro.message); return []; });
    const [materiais, perguntas, colecoes, eventos, pedidos, utilizadores] = await Promise.all([
      seguro(pesquisarMateriais(q, like)),
      seguro(pesquisarPerguntas(like)),
      seguro(pesquisarColecoes(like, req.utilizador.id)),
      seguro(pesquisarEventos(like)),
      seguro(pesquisarPedidos(like)),
      seguro(pesquisarUtilizadores(like, req.utilizador.papel === "admin")),
    ]);
    res.json({ q, materiais, perguntas, colecoes, eventos, pedidos, utilizadores });
  });
};
