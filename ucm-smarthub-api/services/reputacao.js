const db = require("../config/db");

const PONTOS_POR_MATERIAL_APROVADO = 10;
const PONTOS_POR_ESTRELA_MEDIA = 5;
const PONTOS_POR_QUIZ_PASSADO = 2;   // ≥ 70% num quiz, contado uma vez por quiz
const PONTOS_POR_RESPOSTA_ACEITE = 5;
const PONTOS_POR_PEDIDO_ATENDIDO = 3;  // ligou um material a um pedido de outro estudante

function calcularEmblema({ aprovados, media }) {
  if (aprovados >= 5 && media >= 4.0) return "Confiável";
  if (media >= 4.5 && aprovados >= 1) return "Excelente Qualidade";
  if (aprovados >= 10) return "Produtor Verificado";
  return null;
}

// Recalcula a partir das tabelas de origem (materiais + avaliacoes) em vez de
// incrementar contadores — assim uma remoção, rejeição ou correcção manual
// nunca deixa a reputação dessincronizada. Best-effort: um erro aqui nunca
// deve falhar a acção que a desencadeou (aprovar um material, avaliar).
async function atualizarReputacao(usuarioId) {
  if (!usuarioId) return;
  try {
    const [[stats]] = await db.query(
      `SELECT
         COUNT(DISTINCT m.id) AS submetidos,
         COUNT(DISTINCT CASE WHEN m.status = 'aprovado' THEN m.id END) AS aprovados,
         COALESCE(AVG(a.nota), 0) AS media
       FROM materiais m
       LEFT JOIN avaliacoes a ON a.material_id = m.id
       WHERE m.autor_id = ?`,
      [usuarioId]
    );

    const [[extras]] = await db.query(
      `SELECT
         (SELECT COUNT(DISTINCT quiz_id) FROM quiz_resultados WHERE usuario_id = ? AND pontuacao * 100 >= total * 70) AS quizzes,
         (SELECT COUNT(*) FROM perguntas p JOIN respostas r ON r.id = p.resposta_aceite_id WHERE r.usuario_id = ?) AS respostas_aceites,
         (SELECT COUNT(*) FROM pedidos_materiais WHERE atendido_por = ? AND estado = 'atendido' AND usuario_id <> ?) AS pedidos_atendidos`,
      [usuarioId, usuarioId, usuarioId, usuarioId]
    );

    const aprovados = Number(stats.aprovados) || 0;
    const media = Number(stats.media) || 0;
    const pontos = aprovados * PONTOS_POR_MATERIAL_APROVADO
      + Math.round(media * PONTOS_POR_ESTRELA_MEDIA)
      + (Number(extras?.quizzes) || 0) * PONTOS_POR_QUIZ_PASSADO
      + (Number(extras?.respostas_aceites) || 0) * PONTOS_POR_RESPOSTA_ACEITE
      + (Number(extras?.pedidos_atendidos) || 0) * PONTOS_POR_PEDIDO_ATENDIDO;
    const emblema = calcularEmblema({ aprovados, media });

    await db.query(
      `INSERT INTO reputacao_usuarios (usuario_id, pontos, materiais_submetidos, materiais_aprovados, media_avaliacoes, emblema)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         pontos = VALUES(pontos),
         materiais_submetidos = VALUES(materiais_submetidos),
         materiais_aprovados = VALUES(materiais_aprovados),
         media_avaliacoes = VALUES(media_avaliacoes),
         emblema = VALUES(emblema)`,
      [usuarioId, pontos, Number(stats.submetidos) || 0, aprovados, media.toFixed(2), emblema]
    );
  } catch (erro) {
    console.error("[Reputação] Erro ao actualizar:", erro.message);
  }
  // Os mesmos eventos que mudam a reputação (material aprovado, resposta
  // aceite, quiz passado) podem desbloquear conquistas — verificadas aqui
  // para não repetir a chamada em cada rota. Lazy: conquistas.js importa
  // notificacoes, que não depende deste módulo, mas evita-se o ciclo à mesma.
  await require("./conquistas").verificarConquistas(usuarioId);
}

// Quem avaliou um material afecta a reputação do AUTOR desse material.
async function atualizarReputacaoDoAutor(materialId) {
  try {
    const [[material]] = await db.query("SELECT autor_id FROM materiais WHERE id = ?", [materialId]);
    if (material) await atualizarReputacao(material.autor_id);
  } catch (erro) {
    console.error("[Reputação] Erro ao localizar autor:", erro.message);
  }
}

module.exports = { atualizarReputacao, atualizarReputacaoDoAutor, calcularEmblema };
