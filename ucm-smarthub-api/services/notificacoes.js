const db = require("../config/db");
const mailer = require("./email");
const { getConfiguracoes } = require("./plataforma");

// Socket.IO é injectado pelo server.js depois de criado — este módulo é
// carregado pelas rotas antes de o servidor HTTP existir.
let io = null;
function ligarSocket(instancia) { io = instancia; }
const salaDoUtilizador = (usuarioId) => `user:${usuarioId}`;

// Notificação in-app: grava e, se o utilizador estiver ligado, empurra em
// tempo real para a sala pessoal dele. Best-effort — nunca falha a acção que
// a originou.
async function criarNotificacao(usuarioId, { tipo, titulo, mensagem = null, link = null }) {
  if (!usuarioId) return null;
  try {
    const [r] = await db.query(
      "INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, link) VALUES (?, ?, ?, ?, ?)",
      [usuarioId, tipo, String(titulo).slice(0, 150), mensagem ? String(mensagem).slice(0, 500) : null, link]
    );
    const notificacao = { id: r?.insertId, tipo, titulo, mensagem, link, lida: 0, criado_em: new Date() };
    io?.to(salaDoUtilizador(usuarioId)).emit("notificacao", notificacao);
    return notificacao;
  } catch (erro) {
    console.error("[Notificações] Erro ao criar:", erro.message);
    return null;
  }
}

async function notificarVarios(usuarioIds, dados) {
  for (const id of new Set(usuarioIds.filter(Boolean))) await criarNotificacao(id, dados);
}

// Avisa quem subscreveu a disciplina de um material acabado de aprovar:
// notificação in-app sempre; email só se houver SMTP. O autor não é avisado
// aqui — já recebe o email de moderação.
async function notificarSubscritores(material) {
  await avisarPedidosAbertos(material);
  try {
    const [subscritores] = await db.query(
      `SELECT u.id, u.email, u.nome
       FROM subscricoes_disciplinas s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.disciplina = ? AND u.id <> ?`,
      [material.cadeira, material.autor_id || 0]
    );
    if (subscritores.length === 0) return;

    const link = `/video/${material.id}`;
    await notificarVarios(subscritores.map(s => s.id), {
      tipo: "novo_material",
      titulo: `Novo material em ${material.cadeira}`,
      mensagem: material.titulo,
      link,
    });

    if (!mailer.emailConfigurado()) return;
    const config = await getConfiguracoes();
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    // Sequencial de propósito: dezenas de emails em paralelo contra um SMTP
    // gratuito costumam acabar em throttling — e isto corre em background.
    for (const s of subscritores) {
      await mailer.enviarNovoMaterialSubscrito({
        to: s.email, nome: s.nome,
        titulo: material.titulo, cadeira: material.cadeira, tipo: material.tipo, link: frontendUrl + link,
        nomePlataforma: config.nome_plataforma, corPrimaria: config.cor_primaria, corDestaque: config.cor_destaque,
        logoUrl: config.logo_url,
      });
    }
  } catch (erro) {
    console.error("[Notificações] Erro ao avisar subscritores:", erro.message);
  }
}

// Um material aprovado numa disciplina com pedidos abertos pode ser o que
// alguém andava à procura — avisa quem pediu (e quem apoiou o pedido). Não
// fecha o pedido sozinho: só quem pediu sabe se é mesmo aquilo.
async function avisarPedidosAbertos(material) {
  try {
    const [pedidos] = await db.query(
      "SELECT id, usuario_id, titulo FROM pedidos_materiais WHERE estado = 'aberto' AND disciplina = ? ORDER BY criado_em DESC LIMIT 50",
      [material.cadeira]
    );
    if (pedidos.length === 0) return;
    const destinatarios = new Set();
    for (const p of pedidos) {
      destinatarios.add(p.usuario_id);
      const [apoiantes] = await db.query("SELECT usuario_id FROM pedidos_apoios WHERE pedido_id = ?", [p.id]);
      apoiantes.forEach(a => destinatarios.add(a.usuario_id));
    }
    destinatarios.delete(material.autor_id);
    await notificarVarios([...destinatarios], {
      tipo: "pedido",
      titulo: `Novo material em ${material.cadeira} — pode ser o que pediu`,
      mensagem: material.titulo,
      link: `/video/${material.id}`,
    });
  } catch (erro) {
    console.error("[Notificações] Erro ao avisar pedidos:", erro.message);
  }
}

module.exports = { ligarSocket, avisarPedidosAbertos, salaDoUtilizador, criarNotificacao, notificarVarios, notificarSubscritores };
