const db = require("../config/db");
const mailer = require("./email");
const { getConfiguracoes } = require("./plataforma");
const { notificarVarios } = require("./notificacoes");

// Lembretes de eventos do calendário: de hora a hora procura eventos que
// começam nas próximas 24 h e ainda não foram lembrados, e avisa quem segue a
// disciplina — notificação in-app sempre, email quando há SMTP.
const INTERVALO_MS = 60 * 60 * 1000;
const ANTECEDENCIA_HORAS = 24;

const rotulo = { teste: "Teste", entrega: "Entrega", aula: "Aula", outro: "Evento" };

async function enviarLembretes() {
  try {
    const [eventos] = await db.query(
      `SELECT id, disciplina, titulo, tipo, data_inicio FROM eventos_calendario
       WHERE lembrete_enviado = 0 AND data_inicio BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? HOUR)
       ORDER BY data_inicio ASC LIMIT 100`,
      [ANTECEDENCIA_HORAS]
    );
    if (eventos.length === 0) return 0;

    const config = mailer.emailConfigurado() ? await getConfiguracoes() : null;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    for (const evento of eventos) {
      // Marca antes de enviar — se o processo cair a meio, vale mais falhar um
      // lembrete do que repeti-lo a toda a gente na próxima hora.
      await db.query("UPDATE eventos_calendario SET lembrete_enviado = 1 WHERE id = ?", [evento.id]);

      const [subscritores] = await db.query(
        "SELECT u.id, u.email, u.nome FROM subscricoes_disciplinas s JOIN usuarios u ON u.id = s.usuario_id WHERE s.disciplina = ?",
        [evento.disciplina]
      );
      if (subscritores.length === 0) continue;

      const quando = new Date(evento.data_inicio).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
      await notificarVarios(subscritores.map(s => s.id), {
        tipo: "lembrete",
        titulo: `Amanhã: ${rotulo[evento.tipo] || "Evento"} de ${evento.disciplina}`,
        mensagem: `${evento.titulo} — ${quando}`,
        link: "/calendario",
      });

      if (!config) continue;
      for (const s of subscritores) {
        await mailer.enviarEmail({
          to: s.email,
          subject: `Lembrete: ${evento.titulo} (${evento.disciplina}) — ${config.nome_plataforma || "SmartHub"}`,
          html: `<p>Olá, ${String(s.nome).replace(/[<>&]/g, "")},</p>
                 <p>Lembramos que <strong>${String(evento.titulo).replace(/[<>&]/g, "")}</strong> (${rotulo[evento.tipo] || "evento"} de ${String(evento.disciplina).replace(/[<>&]/g, "")}) é <strong>${quando}</strong>.</p>
                 <p><a href="${frontendUrl}/calendario">Ver o calendário</a></p>`,
        });
      }
    }
    console.log(`[Lembretes] ${eventos.length} evento(s) lembrado(s).`);
    return eventos.length;
  } catch (erro) {
    console.error("[Lembretes] Erro:", erro.message);
    return 0;
  }
}

function agendarLembretes() {
  setTimeout(() => enviarLembretes(), 30 * 1000).unref?.();
  setInterval(() => enviarLembretes(), INTERVALO_MS).unref?.();
}

module.exports = { enviarLembretes, agendarLembretes, ANTECEDENCIA_HORAS };
