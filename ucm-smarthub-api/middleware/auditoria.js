const db = require("../config/db");

// Registar ação de auditoria (executado em background, não bloqueia)
async function registarAuditoria(usuarioId, acao, recurso, recursoId, descricao, dadosAntigos, dadosNovos, ipOrigem) {
  try {
    await db.query(
      `INSERT INTO auditoria (usuario_id, acao, recurso, recurso_id, descricao, dados_antigos, dados_novos, ip_origem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuarioId || null,
        acao,
        recurso || null,
        recursoId || null,
        descricao || null,
        dadosAntigos ? JSON.stringify(dadosAntigos) : null,
        dadosNovos ? JSON.stringify(dadosNovos) : null,
        ipOrigem || null,
      ]
    );
  } catch (erro) {
    console.error("[Auditoria] Erro ao registar:", erro.message);
    // Não relança — logging de auditoria é best-effort
  }
}

// Wrapper para ações que alteram dados (UPDATE, DELETE, etc.)
async function auditar(usuarioId, acao, recurso, recursoId, descricao, ipOrigem) {
  // Fire-and-forget — não bloqueia a resposta
  setImmediate(() => {
    registarAuditoria(usuarioId, acao, recurso, recursoId, descricao, null, null, ipOrigem).catch(() => {});
  });
}

module.exports = { registarAuditoria, auditar };
