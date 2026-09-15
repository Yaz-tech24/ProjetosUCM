const db = require("../config/db");
const mailer = require("./email");
const { getConfiguracoes } = require("./plataforma");

// Avisa por email quem subscreveu a disciplina de um material acabado de
// aprovar. Fire-and-forget: corre depois da resposta e nunca falha a
// moderação — se o SMTP não estiver configurado, enviarEmail já o regista.
// O autor não é avisado aqui: já recebe o email de moderação.
async function notificarSubscritores(material) {
  if (!mailer.emailConfigurado()) return;
  try {
    const [subscritores] = await db.query(
      `SELECT u.email, u.nome
       FROM subscricoes_disciplinas s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.disciplina = ? AND u.id <> ?`,
      [material.cadeira, material.autor_id || 0]
    );
    if (subscritores.length === 0) return;

    const config = await getConfiguracoes();
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const link = `${frontendUrl}/video/${material.id}`;

    // Sequencial de propósito: dezenas de emails em paralelo contra um SMTP
    // gratuito costumam acabar em throttling — e isto corre em background.
    for (const s of subscritores) {
      await mailer.enviarNovoMaterialSubscrito({
        to: s.email, nome: s.nome,
        titulo: material.titulo, cadeira: material.cadeira, tipo: material.tipo, link,
        nomePlataforma: config.nome_plataforma, corPrimaria: config.cor_primaria, corDestaque: config.cor_destaque,
        logoUrl: config.logo_url,
      });
    }
  } catch (erro) {
    console.error("[Notificações] Erro ao avisar subscritores:", erro.message);
  }
}

module.exports = { notificarSubscritores };
