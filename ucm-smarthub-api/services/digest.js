const db = require("../config/db");
const mailer = require("./email");
const { getConfiguracoes } = require("./plataforma");
const { criarNotificacao } = require("./notificacoes");

// Digest semanal: "esta semana nas tuas disciplinas" — materiais novos,
// perguntas sem resposta e eventos próximos. Notificação in-app sempre que
// há conteúdo; email só com SMTP e só para quem não desligou no perfil.
//
// Agenda: o job corre de hora a hora e só age na hora configurada do dia
// configurado (por defeito segunda-feira às 07:00, hora do servidor). Cada
// utilizador tem `ultimo_digest_em`, por isso reiniciar o servidor a meio
// nunca repete um envio — e correr o job à mão (admin) respeita a mesma regra.
const DIA_SEMANA = Number(process.env.DIGEST_DIA_SEMANA ?? 1);   // 0 = domingo … 6 = sábado
const HORA = Number(process.env.DIGEST_HORA ?? 7);
const JANELA_DIAS = 7;
const INTERVALO_MS = 60 * 60 * 1000;
const MAX_ITENS = 8;

const escapar = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rotuloEvento = { teste: "Teste", entrega: "Entrega", aula: "Aula", outro: "Evento" };

// Disciplinas que interessam ao utilizador: as subscritas; sem subscrições,
// usa-se o curso dele (os materiais têm `cadeira`, que muitas vezes coincide
// com o nome do curso nas instalações pequenas) — e, se nem isso der, tudo.
async function disciplinasDoUtilizador(utilizador) {
  const [subs] = await db.query("SELECT disciplina FROM subscricoes_disciplinas WHERE usuario_id = ?", [utilizador.id]);
  if (subs.length > 0) return { lista: subs.map(s => s.disciplina), origem: "subscricoes" };
  if (utilizador.curso) {
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM materiais WHERE cadeira = ? AND status = 'aprovado'", [utilizador.curso]);
    if (Number(n) > 0) return { lista: [utilizador.curso], origem: "curso" };
  }
  return { lista: null, origem: "tudo" };
}

async function recolherConteudo(utilizador) {
  const { lista, origem } = await disciplinasDoUtilizador(utilizador);
  const filtro = lista ? `AND ${"cadeira"} IN (${lista.map(() => "?").join(",")})` : "";
  const filtroDisc = lista ? `AND disciplina IN (${lista.map(() => "?").join(",")})` : "";
  const params = lista || [];

  const [materiais] = await db.query(
    `SELECT id, titulo, cadeira, tipo FROM materiais
     WHERE status = 'aprovado' AND data_upload >= DATE_SUB(NOW(), INTERVAL ? DAY) AND autor_id <> ? ${filtro}
     ORDER BY data_upload DESC LIMIT ?`,
    [JANELA_DIAS, utilizador.id, ...params, MAX_ITENS]
  );
  const [perguntas] = await db.query(
    `SELECT id, titulo, disciplina FROM perguntas
     WHERE resolvida = 0 AND usuario_id <> ? AND criado_em >= DATE_SUB(NOW(), INTERVAL ? DAY) ${filtroDisc}
       AND NOT EXISTS (SELECT 1 FROM respostas r WHERE r.pergunta_id = perguntas.id)
     ORDER BY criado_em DESC LIMIT ?`,
    [utilizador.id, JANELA_DIAS * 2, ...params, MAX_ITENS]
  );
  const [eventos] = await db.query(
    `SELECT id, titulo, disciplina, tipo, data_inicio FROM eventos_calendario
     WHERE data_inicio BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY) ${filtroDisc}
     ORDER BY data_inicio ASC LIMIT ?`,
    [JANELA_DIAS, ...params, MAX_ITENS]
  );
  const [[pendentesFlash]] = await db.query(
    `SELECT COUNT(*) AS n FROM flashcards_revisoes WHERE usuario_id = ? AND proxima_revisao <= CURDATE()`,
    [utilizador.id]
  );
  const [pedidos] = await db.query(
    `SELECT id, titulo, disciplina FROM pedidos_materiais
     WHERE estado = 'aberto' AND usuario_id <> ? AND criado_em >= DATE_SUB(NOW(), INTERVAL ? DAY) ${filtroDisc}
     ORDER BY criado_em DESC LIMIT 5`,
    [utilizador.id, JANELA_DIAS, ...params]
  );
  return { materiais, perguntas, eventos, pedidos, flashcards_pendentes: Number(pendentesFlash?.n) || 0, disciplinas: lista, origem };
}

const temConteudo = (c) => c.materiais.length + c.perguntas.length + c.eventos.length + c.pedidos.length > 0 || c.flashcards_pendentes > 0;

function construirHtml({ utilizador, conteudo, config, frontendUrl }) {
  const cor = config.cor_primaria || "#04122e";
  const secao = (titulo, itens) => itens.length ? `<h3 style="margin:22px 0 8px;font-size:14px;color:${cor};text-transform:uppercase;letter-spacing:.08em">${titulo}</h3><ul style="margin:0;padding-left:18px">${itens.join("")}</ul>` : "";
  const li = (href, texto, extra) => `<li style="margin:6px 0"><a href="${frontendUrl}${href}" style="color:${cor};font-weight:700;text-decoration:none">${escapar(texto)}</a>${extra ? ` <span style="color:#64748b">— ${escapar(extra)}</span>` : ""}</li>`;
  const escopo = conteudo.origem === "subscricoes" ? `nas disciplinas que subscreves (${conteudo.disciplinas.map(escapar).join(", ")})`
    : conteudo.origem === "curso" ? `em ${escapar(conteudo.disciplinas[0])}` : "na plataforma";
  const corpo = `
    <p>Olá, ${escapar(utilizador.nome)},</p>
    <p>Eis o que aconteceu esta semana ${escopo}:</p>
    ${secao(`Materiais novos (${conteudo.materiais.length})`, conteudo.materiais.map(m => li(`/video/${m.id}`, m.titulo, `${m.cadeira} · ${m.tipo}`)))}
    ${secao(`Perguntas sem resposta (${conteudo.perguntas.length})`, conteudo.perguntas.map(p => li(`/perguntas/${p.id}`, p.titulo, p.disciplina)))}
    ${secao(`Pedidos de materiais (${conteudo.pedidos.length})`, conteudo.pedidos.map(p => li(`/pedidos?id=${p.id}`, p.titulo, p.disciplina)))}
    ${secao(`Próximos ${JANELA_DIAS} dias (${conteudo.eventos.length})`, conteudo.eventos.map(e => li("/calendario", `${rotuloEvento[e.tipo] || "Evento"}: ${e.titulo}`, `${e.disciplina} · ${new Date(e.data_inicio).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}`)))}
    ${conteudo.flashcards_pendentes > 0 ? `<p style="margin-top:22px;padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px">Tens <strong>${conteudo.flashcards_pendentes}</strong> flashcard(s) à espera de revisão. <a href="${frontendUrl}/dashboard" style="color:${cor};font-weight:700">Rever agora</a></p>` : ""}
    <p style="margin-top:28px;color:#64748b;font-size:12px">Recebes este resumo semanal porque tens uma conta na ${escapar(config.nome_plataforma || "SmartHub")}. Podes desligá-lo no teu <a href="${frontendUrl}/perfil" style="color:${cor}">perfil</a>.</p>`;
  return corpo;
}

function resumoCurto(conteudo) {
  const partes = [];
  if (conteudo.materiais.length) partes.push(`${conteudo.materiais.length} material(is) novo(s)`);
  if (conteudo.perguntas.length) partes.push(`${conteudo.perguntas.length} pergunta(s) sem resposta`);
  if (conteudo.eventos.length) partes.push(`${conteudo.eventos.length} evento(s) nos próximos dias`);
  if (conteudo.pedidos.length) partes.push(`${conteudo.pedidos.length} pedido(s) de materiais`);
  if (conteudo.flashcards_pendentes) partes.push(`${conteudo.flashcards_pendentes} flashcard(s) a rever`);
  return partes.join(" · ");
}

// Envia o digest a um utilizador (in-app + email). Devolve o que fez.
async function enviarDigestA(utilizador, { config, frontendUrl, forcar = false, comEmail = true }) {
  const conteudo = await recolherConteudo(utilizador);
  if (!temConteudo(conteudo)) {
    if (!forcar) await db.query("UPDATE usuarios SET ultimo_digest_em = NOW() WHERE id = ?", [utilizador.id]);
    return { enviado: false, motivo: "sem_conteudo" };
  }
  await criarNotificacao(utilizador.id, { tipo: "digest", titulo: "O teu resumo semanal", mensagem: resumoCurto(conteudo), link: "/dashboard" });
  let email = false;
  if (comEmail && mailer.emailConfigurado() && utilizador.email_verificado) {
    email = await mailer.enviarEmail({
      to: utilizador.email,
      subject: `Resumo semanal — ${config.nome_plataforma || "SmartHub"}`,
      html: mailer.layoutEmail(config.nome_plataforma || "SmartHub", config.cor_primaria, config.cor_destaque, construirHtml({ utilizador, conteudo, config, frontendUrl }), config.logo_url),
    });
  }
  await db.query("UPDATE usuarios SET ultimo_digest_em = NOW() WHERE id = ?", [utilizador.id]);
  return { enviado: true, email, resumo: resumoCurto(conteudo) };
}

// Corre para todos os utilizadores elegíveis que ainda não receberam nesta
// semana. `forcar` ignora a janela horária (accionado pelo admin).
async function enviarDigests({ forcar = false } = {}) {
  const agora = new Date();
  if (!forcar && (agora.getDay() !== DIA_SEMANA || agora.getHours() !== HORA)) return { corrido: false };
  const config = await getConfiguracoes();
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const [utilizadores] = await db.query(
    `SELECT id, nome, email, curso, email_verificado FROM usuarios
     WHERE digest_semanal = 1 AND email <> 'conta-eliminada@sistema.local'
       AND (ultimo_digest_em IS NULL OR ultimo_digest_em < DATE_SUB(NOW(), INTERVAL 6 DAY))
     ORDER BY id LIMIT 2000`
  );
  let enviados = 0, emails = 0;
  for (const u of utilizadores) {
    try {
      const r = await enviarDigestA(u, { config, frontendUrl });
      if (r.enviado) enviados++;
      if (r.email) emails++;
    } catch (erro) {
      console.error(`[Digest] Falhou para o utilizador ${u.id}:`, erro.message);
    }
  }
  console.log(`[Digest] ${enviados} resumo(s) semanal(is) enviado(s) (${emails} por email) de ${utilizadores.length} elegíveis.`);
  return { corrido: true, elegiveis: utilizadores.length, enviados, emails };
}

function agendarDigest() {
  setInterval(() => enviarDigests().catch(erro => console.error("[Digest] Erro:", erro.message)), INTERVALO_MS).unref?.();
}

module.exports = { enviarDigests, enviarDigestA, recolherConteudo, construirHtml, resumoCurto, agendarDigest, DIA_SEMANA, HORA };
