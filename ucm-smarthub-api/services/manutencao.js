const db = require("../config/db");
const { purgarSessoesAntigas } = require("./sessoes");

// Tarefas diárias de limpeza. Cada uma é independente e best-effort — uma
// falha não impede as outras. Retenções configuráveis por variável de
// ambiente (dias); 0 desliga a purga respectiva.
const RETENCAO_AUDITORIA_DIAS = Number(process.env.RETENCAO_AUDITORIA_DIAS ?? 365);
const RETENCAO_NOTIFICACOES_DIAS = Number(process.env.RETENCAO_NOTIFICACOES_DIAS ?? 90);
const RETENCAO_EVENTOS_DIAS = Number(process.env.RETENCAO_EVENTOS_DIAS ?? 180);
const INTERVALO_MS = 24 * 60 * 60 * 1000;

async function purgarAuditoria() {
  if (!(RETENCAO_AUDITORIA_DIAS > 0)) return 0;
  const [r] = await db.query("DELETE FROM auditoria WHERE data_hora < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT 5000", [RETENCAO_AUDITORIA_DIAS]);
  return r.affectedRows || 0;
}

// Notificações lidas antigas; as não lidas ficam (o utilizador ainda não as viu).
async function purgarNotificacoes() {
  if (!(RETENCAO_NOTIFICACOES_DIAS > 0)) return 0;
  const [r] = await db.query("DELETE FROM notificacoes WHERE lida = 1 AND criado_em < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT 5000", [RETENCAO_NOTIFICACOES_DIAS]);
  return r.affectedRows || 0;
}

// Eventos do calendário já passados há muito e as denúncias fechadas antigas.
async function purgarAntigos() {
  if (!(RETENCAO_EVENTOS_DIAS > 0)) return 0;
  const [e] = await db.query("DELETE FROM eventos_calendario WHERE data_inicio < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT 5000", [RETENCAO_EVENTOS_DIAS]);
  const [d] = await db.query("DELETE FROM denuncias WHERE estado <> 'pendente' AND resolvida_em < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT 5000", [RETENCAO_AUDITORIA_DIAS || 365]);
  return (e.affectedRows || 0) + (d.affectedRows || 0);
}

async function correrManutencao() {
  const resultados = {};
  for (const [nome, fn] of [["sessoes", purgarSessoesAntigas], ["auditoria", purgarAuditoria], ["notificacoes", purgarNotificacoes], ["antigos", purgarAntigos]]) {
    try {
      resultados[nome] = await fn();
    } catch (erro) {
      console.error(`[Manutenção] ${nome} falhou:`, erro.message);
      resultados[nome] = null;
    }
  }
  console.log("[Manutenção] Limpeza diária:", JSON.stringify(resultados));
  return resultados;
}

function agendarManutencao() {
  setTimeout(() => correrManutencao().catch(() => {}), 5 * 60 * 1000).unref?.();
  setInterval(() => correrManutencao().catch(() => {}), INTERVALO_MS).unref?.();
}

module.exports = { correrManutencao, agendarManutencao, purgarAuditoria, purgarNotificacoes, RETENCAO_AUDITORIA_DIAS, RETENCAO_NOTIFICACOES_DIAS };
