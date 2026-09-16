const db = require("../config/db");
const { criarNotificacao } = require("./notificacoes");

// Conquistas calculadas a partir das tabelas de origem (nunca por contadores
// incrementais) — tal como a reputação, uma remoção ou correcção manual nunca
// as deixa dessincronizadas: só se ganham, nunca se perdem (ficam registadas
// em `conquistas` com a data em que foram obtidas).
const CONQUISTAS = [
  { codigo: "primeiro_upload",     nome: "Primeiro contributo",   descricao: "Primeiro material aprovado no repositório.",        icone: "upload",   metrica: "aprovados",        alvo: 1 },
  { codigo: "cinco_uploads",       nome: "Contribuidor regular",  descricao: "Cinco materiais aprovados.",                       icone: "upload",   metrica: "aprovados",        alvo: 5 },
  { codigo: "vinte_uploads",       nome: "Pilar do repositório",  descricao: "Vinte materiais aprovados.",                       icone: "upload",   metrica: "aprovados",        alvo: 20 },
  { codigo: "primeira_resposta",   nome: "Boa resposta",          descricao: "Primeira resposta aceite como solução.",           icone: "answer",   metrica: "respostas_aceites", alvo: 1 },
  { codigo: "dez_respostas",       nome: "Mentor",                descricao: "Dez respostas aceites como solução.",              icone: "answer",   metrica: "respostas_aceites", alvo: 10 },
  { codigo: "quiz_perfeito",       nome: "Quiz perfeito",         descricao: "100% num quiz gerado por IA.",                    icone: "quiz",     metrica: "quizzes_perfeitos", alvo: 1 },
  { codigo: "cinco_quizzes",       nome: "Sempre a testar",       descricao: "Cinco quizzes passados (≥ 70%).",                 icone: "quiz",     metrica: "quizzes_passados", alvo: 5 },
  { codigo: "curioso",             nome: "Curioso",               descricao: "Dez materiais diferentes abertos.",                icone: "read",     metrica: "materiais_abertos", alvo: 10 },
  { codigo: "leitor_voraz",        nome: "Leitor voraz",          descricao: "Cinquenta materiais diferentes abertos.",          icone: "read",     metrica: "materiais_abertos", alvo: 50 },
  { codigo: "leitor_offline",      nome: "Leitor offline",        descricao: "Guardou um PDF para ler sem internet.",           icone: "offline",  metrica: "offline",          alvo: 1 },
  { codigo: "cem_revisoes",        nome: "Memória de elefante",   descricao: "Cem revisões de flashcards.",                     icone: "cards",    metrica: "revisoes",         alvo: 100 },
  { codigo: "sequencia_7",         nome: "Uma semana seguida",    descricao: "Sete dias seguidos a estudar na plataforma.",     icone: "streak",   metrica: "sequencia",        alvo: 7 },
  { codigo: "sequencia_30",        nome: "Um mês seguido",        descricao: "Trinta dias seguidos a estudar na plataforma.",   icone: "streak",   metrica: "sequencia",        alvo: 30 },
  { codigo: "colecionador",        nome: "Colecionador",          descricao: "Uma colecção pública com pelo menos 5 materiais.", icone: "folder",   metrica: "colecoes_publicas", alvo: 1 },
  { codigo: "bom_samaritano",      nome: "Bom samaritano",        descricao: "Atendeu um pedido de material de outro estudante.", icone: "gift",     metrica: "pedidos_atendidos", alvo: 1 },
  { codigo: "anotador",            nome: "Anotador",              descricao: "Vinte notas ou marcadores em PDFs.",              icone: "note",     metrica: "anotacoes",        alvo: 20 },
];

// Dias consecutivos (até hoje ou até ontem) com actividade: abrir material,
// responder a quiz ou rever flashcards. Calculado sobre os últimos 400 dias.
function calcularSequencia(dias) {
  const conjunto = new Set(dias);
  const umDia = 86400e3;
  const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
  const chave = (d) => new Date(d).toISOString().slice(0, 10);
  let inicio = conjunto.has(chave(hoje)) ? hoje.getTime() : conjunto.has(chave(hoje.getTime() - umDia)) ? hoje.getTime() - umDia : null;
  let actual = 0;
  if (inicio !== null) {
    for (let t = inicio; conjunto.has(chave(t)); t -= umDia) actual++;
  }
  // Melhor sequência de sempre (dentro da janela)
  const ordenados = [...conjunto].sort();
  let melhor = 0, corrida = 0, anterior = null;
  for (const d of ordenados) {
    const t = new Date(d + "T12:00:00Z").getTime();
    corrida = anterior !== null && t - anterior === umDia ? corrida + 1 : 1;
    anterior = t;
    if (corrida > melhor) melhor = corrida;
  }
  return { actual, melhor };
}

async function diasComActividade(usuarioId) {
  const [linhas] = await db.query(
    `SELECT DISTINCT DATE(criado_em) AS dia FROM (
       SELECT criado_em FROM materiais_acessos WHERE usuario_id = ? AND criado_em >= DATE_SUB(CURDATE(), INTERVAL 400 DAY)
       UNION ALL SELECT criado_em FROM quiz_resultados WHERE usuario_id = ? AND criado_em >= DATE_SUB(CURDATE(), INTERVAL 400 DAY)
       UNION ALL SELECT ultima_revisao FROM flashcards_revisoes WHERE usuario_id = ? AND ultima_revisao >= DATE_SUB(CURDATE(), INTERVAL 400 DAY)
     ) t ORDER BY dia`,
    [usuarioId, usuarioId, usuarioId]
  );
  return linhas.map(l => (l.dia instanceof Date ? l.dia.toISOString().slice(0, 10) : String(l.dia).slice(0, 10)));
}

async function calcularMetricas(usuarioId) {
  const [[m]] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM materiais WHERE autor_id = ? AND status = 'aprovado') AS aprovados,
       (SELECT COUNT(*) FROM perguntas p JOIN respostas r ON r.id = p.resposta_aceite_id WHERE r.usuario_id = ?) AS respostas_aceites,
       (SELECT COUNT(DISTINCT quiz_id) FROM quiz_resultados WHERE usuario_id = ? AND pontuacao = total AND total > 0) AS quizzes_perfeitos,
       (SELECT COUNT(DISTINCT quiz_id) FROM quiz_resultados WHERE usuario_id = ? AND pontuacao * 100 >= total * 70) AS quizzes_passados,
       (SELECT COUNT(DISTINCT material_id) FROM materiais_acessos WHERE usuario_id = ? AND tipo = 'abertura') AS materiais_abertos,
       (SELECT COUNT(*) FROM eventos_utilizador WHERE usuario_id = ? AND tipo = 'offline') AS offline,
       (SELECT COALESCE(SUM(total_revisoes), 0) FROM flashcards_revisoes WHERE usuario_id = ?) AS revisoes,
       (SELECT COUNT(*) FROM colecoes c WHERE c.usuario_id = ? AND c.publica = 1 AND (SELECT COUNT(*) FROM colecoes_materiais cm WHERE cm.colecao_id = c.id) >= 5) AS colecoes_publicas,
       (SELECT COUNT(*) FROM pedidos_materiais WHERE atendido_por = ? AND estado = 'atendido' AND usuario_id <> ?) AS pedidos_atendidos,
       (SELECT COUNT(*) FROM anotacoes WHERE usuario_id = ?) AS anotacoes`,
    [usuarioId, usuarioId, usuarioId, usuarioId, usuarioId, usuarioId, usuarioId, usuarioId, usuarioId, usuarioId, usuarioId]
  );
  const sequencia = calcularSequencia(await diasComActividade(usuarioId));
  const metricas = {};
  for (const [k, v] of Object.entries(m || {})) metricas[k] = Number(v) || 0;
  metricas.sequencia = sequencia.actual;
  metricas.melhor_sequencia = sequencia.melhor;
  // A conquista de sequência conta a melhor de sempre — perder a corrida hoje
  // não pode tirar um emblema já merecido.
  metricas.sequencia_para_conquista = Math.max(sequencia.actual, sequencia.melhor);
  return metricas;
}

// Verifica todas as conquistas do utilizador; regista e notifica as novas.
// Best-effort: nunca falha a acção que a chamou.
async function verificarConquistas(usuarioId) {
  if (!usuarioId) return [];
  try {
    const metricas = await calcularMetricas(usuarioId);
    const [existentes] = await db.query("SELECT codigo FROM conquistas WHERE usuario_id = ?", [usuarioId]);
    const ja = new Set(existentes.map(e => e.codigo));
    const novas = [];
    for (const c of CONQUISTAS) {
      if (ja.has(c.codigo)) continue;
      const valor = c.metrica === "sequencia" ? metricas.sequencia_para_conquista : metricas[c.metrica];
      if ((valor || 0) >= c.alvo) {
        await db.query("INSERT IGNORE INTO conquistas (usuario_id, codigo) VALUES (?, ?)", [usuarioId, c.codigo]);
        novas.push(c);
      }
    }
    for (const c of novas) {
      await criarNotificacao(usuarioId, { tipo: "conquista", titulo: `Nova conquista: ${c.nome}`, mensagem: c.descricao, link: "/perfil?sep=conquistas" });
    }
    return novas;
  } catch (erro) {
    console.error("[Conquistas] Erro ao verificar:", erro.message);
    return [];
  }
}

async function listarConquistas(usuarioId) {
  const [obtidas] = await db.query("SELECT codigo, obtida_em FROM conquistas WHERE usuario_id = ?", [usuarioId]);
  const porCodigo = new Map(obtidas.map(o => [o.codigo, o.obtida_em]));
  const metricas = await calcularMetricas(usuarioId);
  return {
    obtidas: obtidas.length,
    total: CONQUISTAS.length,
    conquistas: CONQUISTAS.map(c => {
      const valor = c.metrica === "sequencia" ? metricas.sequencia_para_conquista : metricas[c.metrica] || 0;
      return { ...c, obtida: porCodigo.has(c.codigo), obtida_em: porCodigo.get(c.codigo) || null, progresso: Math.min(valor, c.alvo) };
    }),
  };
}

module.exports = { CONQUISTAS, verificarConquistas, listarConquistas, calcularMetricas, calcularSequencia };
