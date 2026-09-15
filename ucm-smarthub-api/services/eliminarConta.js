const path = require("path");
const fs = require("fs");
const db = require("../config/db");
const { uploadsDir } = require("../middleware/upload");

// Conta-sentinela que herda o conteúdo público de quem elimina a conta:
// materiais, comentários, perguntas e respostas continuam a existir (têm
// valor para os outros estudantes) mas passam a aparecer como "Conta
// eliminada". Sem palavra-passe, por isso ninguém consegue entrar com ela.
const EMAIL_SENTINELA = "conta-eliminada@sistema.local";

async function obterSentinela(conn) {
  const [[existente]] = await conn.query("SELECT id FROM usuarios WHERE email = ?", [EMAIL_SENTINELA]);
  if (existente) return existente.id;
  const [[curso]] = await conn.query("SELECT nome FROM cursos ORDER BY id LIMIT 1");
  const [r] = await conn.query(
    "INSERT INTO usuarios (nome, email, senha, curso, papel, email_verificado) VALUES ('Conta eliminada', ?, NULL, ?, 'estudante', 1)",
    [EMAIL_SENTINELA, curso?.nome || "Geral"]
  );
  return r.insertId;
}

// Tudo numa transacção: ou o utilizador desaparece com o conteúdo reatribuído,
// ou nada muda. As tabelas com ON DELETE CASCADE (sessões, códigos 2FA,
// favoritos, colecções, subscrições, reputação, notificações, resultados de
// quizzes, avaliações) esvaziam-se sozinhas; auditoria e denúncias ficam com
// usuario_id NULL.
async function eliminarConta(usuarioId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[utilizador]] = await conn.query("SELECT id, email, avatar_url FROM usuarios WHERE id = ? FOR UPDATE", [usuarioId]);
    if (!utilizador) throw Object.assign(new Error("Utilizador não encontrado."), { status: 404 });

    const sentinela = await obterSentinela(conn);
    const reatribuir = [
      ["materiais", "autor_id"],
      ["mensagens_estudantes", "user_id"],
      ["comentarios_materiais", "usuario_id"],
      ["perguntas", "usuario_id"],
      ["respostas", "usuario_id"],
      ["versoes_materiais", "autor_id"],
      ["eventos_calendario", "criado_por"],
    ];
    for (const [tabela, coluna] of reatribuir) {
      await conn.query(`UPDATE \`${tabela}\` SET \`${coluna}\` = ? WHERE \`${coluna}\` = ?`, [sentinela, usuarioId]);
    }
    await conn.query("DELETE FROM usuarios WHERE id = ?", [usuarioId]);
    await conn.commit();

    if (utilizador.avatar_url) {
      fs.unlink(path.join(uploadsDir, path.basename(utilizador.avatar_url)), () => {});
    }
    return { email: utilizador.email };
  } catch (erro) {
    await conn.rollback().catch(() => {});
    throw erro;
  } finally {
    conn.release();
  }
}

module.exports = { eliminarConta, EMAIL_SENTINELA };
