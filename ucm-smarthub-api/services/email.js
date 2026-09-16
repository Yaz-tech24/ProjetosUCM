/*
 * Serviço de email — SMTP genérico via nodemailer (funciona com Gmail SMTP,
 * SendGrid, Resend, Mailtrap, etc.). Se as variáveis SMTP_* não estiverem
 * definidas, degrada graciosamente: regista um aviso e não envia nada, em vez
 * de rebentar o pedido que o chamou — mesmo padrão já usado para o Gemini
 * (genAI fica null se GEMINI_API_KEY não existir).
 */
const nodemailer = require("nodemailer");

// Escapa nome/título de utilizador antes de os inserir no HTML do email —
// sem isto, um nome ou título com marcação (ex: "<a href=...>") alterava o
// email realmente recebido pelo destinatário.
const escapeHtml = (valor) =>
  String(valor ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

let transporte;
let tentouCriar = false;

function getTransporte() {
  if (tentouCriar) return transporte;
  tentouCriar = true;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    transporte = null;
    return null;
  }
  transporte = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporte;
}

const REMETENTE = () => process.env.SMTP_FROM || process.env.SMTP_USER;

function emailConfigurado() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

async function enviarEmail({ to, subject, html }) {
  const t = getTransporte();
  if (!t) {
    console.warn(`[email] Serviço de email não configurado — email para "${to}" ("${subject}") não foi enviado.`);
    return false;
  }
  try {
    await t.sendMail({ from: REMETENTE(), to, subject, html });
    return true;
  } catch (erro) {
    console.error("[email] Falha ao enviar email:", erro.message);
    return false;
  }
}

// Nome por defeito quando a configuração ainda não foi carregada/definida —
// evita assuntos como "Bem-vindo(a) à undefined!".
const NOME_POR_DEFEITO = "SmartHub";
const nomeOu = (nome) => (nome && String(nome).trim()) || NOME_POR_DEFEITO;

function layout(nomePlataforma, corPrimaria, corDestaque, conteudoHtml, logoUrl) {
  const cabecalho = logoUrl
    ? `<img src="${logoUrl}" alt="${nomePlataforma}" height="32" style="height:32px;max-width:160px;object-fit:contain;vertical-align:middle;">`
    : `<span style="color:#ffffff;font-size:20px;font-weight:900;">${nomePlataforma}</span>`;
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f0f5ff;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:32px 16px;">
    <tr><td style="padding:26px 32px;background:${corPrimaria};border-radius:16px 16px 0 0;">
      ${cabecalho}
    </td></tr>
    <tr><td style="padding:32px;background:#ffffff;border-radius:0 0 16px 16px;color:#334155;font-size:14px;line-height:1.65;">
      ${conteudoHtml}
    </td></tr>
    <tr><td style="padding:16px 32px;text-align:center;color:#94a3b8;font-size:11px;">
      ${nomePlataforma}
    </td></tr>
  </table>
</body></html>`;
}

async function enviarVerificacaoEmail({ to, nome, linkVerificacao, nomePlataforma: nomePlataformaBruto, corPrimaria, corDestaque, logoUrl }) {
  const nomePlataforma = nomeOu(nomePlataformaBruto);
  const nomeSeguro = escapeHtml(nome);
  return enviarEmail({
    to,
    subject: `Confirma o teu email — ${nomePlataforma}`,
    html: layout(nomePlataforma, corPrimaria, corDestaque, `
      <p>Olá, ${nomeSeguro},</p>
      <p>Bem-vindo(a) à <strong>${nomePlataforma}</strong>! Para ativar a tua conta, confirma o teu email clicando no botão abaixo. Este link é válido por 24 horas:</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${linkVerificacao}" style="background:${corDestaque};color:#04122e;text-decoration:none;font-weight:800;padding:12px 28px;border-radius:12px;display:inline-block;">Confirmar Email</a>
      </p>
      <p>Se não criaste esta conta, ignora este email.</p>
    `, logoUrl),
  });
}

async function enviarBoasVindas({ to, nome, nomePlataforma: nomePlataformaBruto, corPrimaria, corDestaque, logoUrl }) {
  const nomePlataforma = nomeOu(nomePlataformaBruto);
  const nomeSeguro = escapeHtml(nome);
  return enviarEmail({
    to,
    subject: `Bem-vindo(a) à ${nomePlataforma}!`,
    html: layout(nomePlataforma, corPrimaria, corDestaque, `
      <p>Olá, ${nomeSeguro},</p>
      <p>A tua conta na <strong>${nomePlataforma}</strong> foi criada com sucesso. Já podes entrar e começar a explorar os materiais disponíveis.</p>
    `, logoUrl),
  });
}

async function enviarRecuperacaoPassword({ to, nome, link, nomePlataforma: nomePlataformaBruto, corPrimaria, corDestaque, logoUrl }) {
  const nomePlataforma = nomeOu(nomePlataformaBruto);
  const nomeSeguro = escapeHtml(nome);
  return enviarEmail({
    to,
    subject: `Repor palavra-passe — ${nomePlataforma}`,
    html: layout(nomePlataforma, corPrimaria, corDestaque, `
      <p>Olá, ${nomeSeguro},</p>
      <p>Recebemos um pedido para repor a tua palavra-passe. Este link é válido por 30 minutos:</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${link}" style="background:${corDestaque};color:#04122e;text-decoration:none;font-weight:800;padding:12px 28px;border-radius:12px;display:inline-block;">Repor palavra-passe</a>
      </p>
      <p>Se não pediste isto, ignora este email — a tua conta continua segura.</p>
    `, logoUrl),
  });
}

async function enviarModeracaoMaterial({ to, nome, titulo, aprovado, nomePlataforma: nomePlataformaBruto, corPrimaria, corDestaque, logoUrl }) {
  const nomePlataforma = nomeOu(nomePlataformaBruto);
  const nomeSeguro = escapeHtml(nome);
  const tituloSeguro = escapeHtml(titulo);
  return enviarEmail({
    to,
    subject: aprovado ? `O teu material foi aprovado — ${nomePlataforma}` : `O teu material foi rejeitado — ${nomePlataforma}`,
    html: layout(nomePlataforma, corPrimaria, corDestaque, `
      <p>Olá, ${nomeSeguro},</p>
      <p>O material <strong>"${tituloSeguro}"</strong> que submeteste foi ${
        aprovado
          ? '<strong style="color:#059669">aprovado</strong> e já está disponível no repositório.'
          : '<strong style="color:#dc2626">rejeitado</strong> pela moderação.'
      }</p>
    `, logoUrl),
  });
}

async function enviarNovoMaterialSubscrito({ to, nome, titulo, cadeira, tipo, link, nomePlataforma: nomePlataformaBruto, corPrimaria, corDestaque, logoUrl }) {
  const nomePlataforma = nomeOu(nomePlataformaBruto);
  const nomeSeguro = escapeHtml(nome);
  const tituloSeguro = escapeHtml(titulo);
  const cadeiraSegura = escapeHtml(cadeira);
  return enviarEmail({
    to,
    subject: `Novo material em ${cadeira} — ${nomePlataforma}`,
    html: layout(nomePlataforma, corPrimaria, corDestaque, `
      <p>Olá, ${nomeSeguro},</p>
      <p>Foi publicado um novo ${tipo === "PDF" ? "documento" : "vídeo"} na disciplina <strong>${cadeiraSegura}</strong> que subscreves:</p>
      <p style="font-size:18px;font-weight:bold;color:${corPrimaria}">"${tituloSeguro}"</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:${corPrimaria};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir material</a>
      </p>
      <p style="color:#64748b;font-size:12px">Recebes este email porque subscreveste a disciplina ${cadeiraSegura}. Podes cancelar a subscrição no teu perfil.</p>
    `, logoUrl),
  });
}

module.exports = { enviarEmail, layoutEmail: layout, escapeHtml, enviarVerificacaoEmail, enviarBoasVindas, enviarRecuperacaoPassword, enviarModeracaoMaterial, enviarNovoMaterialSubscrito, emailConfigurado };
