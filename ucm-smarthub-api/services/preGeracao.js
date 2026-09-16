const db = require("../config/db");
const { genAI } = require("./gemini");
const { getConfiguracoes } = require("./plataforma");
const { gerarResumoMaterial } = require("./resumo");
const { garantirQuiz, garantirFlashcards } = require("./geracaoIA");

// Pré-geração em background: quando um PDF é aprovado (ou recebe uma versão
// nova), o resumo, o quiz e os flashcards são gerados de seguida, com calma,
// para que o aluno os encontre já feitos — em vez de esperar 20 s pela IA
// (e de apanhar um 429/503) na primeira abertura. É a melhoria que mais
// reduz erros vistos pelos alunos: o caminho interactivo passa a ser leitura
// de cache.
//
// Ritmo deliberadamente lento (um material de cada vez, pausa entre
// chamadas) para caber no plano gratuito do Gemini; em 429 pausa 10 min, em
// 503 pausa 2 min, e o material volta ao fim da fila.
const ACTIVA = process.env.IA_PREGERAR !== "0";
const INTERVALO_ENTRE_MATERIAIS_MS = Number(process.env.IA_PREGERAR_INTERVALO_MS) || 20000;
const INTERVALO_ENTRE_CHAMADAS_MS = 3000;
const PAUSA_QUOTA_MS = 10 * 60 * 1000;
const PAUSA_PROCURA_MS = 2 * 60 * 1000;
const BACKLOG_POR_HORA = Number(process.env.IA_PREGERAR_BACKLOG_HORA ?? 3);

const fila = [];               // ids por ordem de chegada
const naFila = new Set();
const estado = { emCurso: null, processados: 0, falhados: 0, ultimo: null, pausaAte: 0, motivoPausa: null, historico: [] };
let aCorrer = false;

const dormir = (ms) => new Promise(r => setTimeout(r, ms).unref?.());

function agendar(materialId, motivo = "aprovacao") {
  if (!ACTIVA || !genAI || !materialId || naFila.has(materialId)) return false;
  fila.push({ id: Number(materialId), motivo, desde: Date.now() });
  naFila.add(Number(materialId));
  processar().catch(() => {});
  return true;
}

function registarHistorico(entrada) {
  estado.historico.unshift({ ...entrada, quando: new Date().toISOString() });
  estado.historico = estado.historico.slice(0, 20);
}

async function tratarMaterial(item) {
  const [[material]] = await db.query(
    "SELECT id, titulo, cadeira, tipo, url_arquivo, texto_extraido, texto_indexado_em, resumo_texto FROM materiais WHERE id = ? AND status = 'aprovado'",
    [item.id]
  );
  if (!material) return { saltado: "não aprovado ou removido" };
  if (material.tipo !== "PDF") return { saltado: "não é PDF" };
  const config = await getConfiguracoes();
  if (!config.ia_activada) return { saltado: "IA desactivada nas configurações" };

  const feito = [];
  if (!material.resumo_texto) {
    const r = await gerarResumoMaterial(material, config);
    if (r.provisorio) throw Object.assign(new Error(r.erro || "resumo falhou"), { status: r.status });
    feito.push("resumo");
    await dormir(INTERVALO_ENTRE_CHAMADAS_MS);
  }
  try {
    const q = await garantirQuiz(material, config);
    if (q.gerado) { feito.push("quiz"); await dormir(INTERVALO_ENTRE_CHAMADAS_MS); }
  } catch (erro) {
    if (erro.codigo === "sem_texto" || erro.codigo === "nao_pdf") return { saltado: erro.message, feito };
    throw erro;
  }
  const f = await garantirFlashcards(material, config);
  if (f.gerado) feito.push("flashcards");
  return { feito };
}

async function processar() {
  if (aCorrer) return;
  aCorrer = true;
  try {
    while (fila.length > 0) {
      const agora = Date.now();
      if (estado.pausaAte > agora) { await dormir(estado.pausaAte - agora); continue; }
      const item = fila.shift();
      naFila.delete(item.id);
      estado.emCurso = item.id;
      try {
        const r = await tratarMaterial(item);
        estado.processados++;
        estado.ultimo = { id: item.id, ok: true, ...r };
        registarHistorico({ id: item.id, motivo: item.motivo, ok: true, feito: r.feito || [], saltado: r.saltado || null });
      } catch (erro) {
        estado.falhados++;
        estado.ultimo = { id: item.id, ok: false, erro: erro.message };
        registarHistorico({ id: item.id, motivo: item.motivo, ok: false, erro: erro.message, status: erro.status || null });
        // Quota/alta procura: pausa e devolve o material ao fim da fila (uma vez).
        if (erro.status === 429 || erro.status === 503) {
          estado.pausaAte = Date.now() + (erro.status === 429 ? PAUSA_QUOTA_MS : PAUSA_PROCURA_MS);
          estado.motivoPausa = erro.status === 429 ? "quota (429)" : "alta procura (503)";
          if (!item.repetido) { fila.push({ ...item, repetido: true }); naFila.add(item.id); }
        }
      } finally {
        estado.emCurso = null;
      }
      if (fila.length > 0) await dormir(INTERVALO_ENTRE_MATERIAIS_MS);
    }
  } finally {
    aCorrer = false;
  }
}

// Backlog: de hora a hora, os materiais mais vistos que ainda não têm resumo,
// quiz ou flashcards — poucos de cada vez, para não gastar a quota diária.
async function agendarBacklog() {
  if (!ACTIVA || !genAI || BACKLOG_POR_HORA <= 0) return 0;
  try {
    const [linhas] = await db.query(
      `SELECT m.id FROM materiais m
       WHERE m.status = 'aprovado' AND m.tipo = 'PDF' AND m.texto_extraido IS NOT NULL AND LENGTH(m.texto_extraido) >= 400
         AND (m.resumo_texto IS NULL
              OR NOT EXISTS (SELECT 1 FROM quizzes q WHERE q.material_id = m.id)
              OR NOT EXISTS (SELECT 1 FROM flashcards f WHERE f.material_id = m.id))
       ORDER BY m.visualizacoes DESC, m.data_upload DESC
       LIMIT ?`,
      [BACKLOG_POR_HORA]
    );
    let n = 0;
    for (const l of linhas) if (agendar(l.id, "backlog")) n++;
    return n;
  } catch (erro) {
    console.error("[Pré-geração] Backlog falhou:", erro.message);
    return 0;
  }
}

function agendarPreGeracao() {
  if (!ACTIVA || !genAI) return;
  setTimeout(() => agendarBacklog(), 90 * 1000).unref?.();
  setInterval(() => agendarBacklog(), 60 * 60 * 1000).unref?.();
}

function estadoPreGeracao() {
  return {
    activa: ACTIVA && Boolean(genAI),
    fila: fila.length,
    em_curso: estado.emCurso,
    processados: estado.processados,
    falhados: estado.falhados,
    ultimo: estado.ultimo,
    pausa_ate: estado.pausaAte > Date.now() ? new Date(estado.pausaAte).toISOString() : null,
    motivo_pausa: estado.pausaAte > Date.now() ? estado.motivoPausa : null,
    intervalo_s: INTERVALO_ENTRE_MATERIAIS_MS / 1000,
    backlog_por_hora: BACKLOG_POR_HORA,
    historico: estado.historico,
  };
}

module.exports = { agendar, agendarBacklog, agendarPreGeracao, estadoPreGeracao, tratarMaterial };
