const { GoogleGenerativeAI } = require("@google/generative-ai");

// Cliente único do Gemini para toda a plataforma. Tudo o que fala com a IA
// (resumo, chat, quiz, flashcards, tradução, moderação) passa por
// chamarGemini(), que trata do que cada chamada avulsa não tratava:
//
//  - cadeia de modelos (GEMINI_MODELOS ou a lista por defeito), passando ao
//    seguinte quando um não existe ou está indisponível;
//  - repetição com espera exponencial em erros transitórios (429 quota/
//    ritmo, 503 "high demand", 500, rede, timeout) — a maioria destes erros
//    resolve-se em segundos, e antes cada modelo era tentado UMA vez;
//  - limite de chamadas em simultâneo: o plano gratuito tem poucos pedidos
//    por minuto; uma turma a abrir o mesmo material ao mesmo tempo gerava
//    uma rajada de 429. Os pedidos a mais esperam em fila em vez de falhar;
//  - erros com código e mensagem em português para o utilizador;
//  - estatísticas em memória (por funcionalidade) para Admin → Sistema.
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Ordem de preferência; "gemini-flash-latest" é um alias que a Google mantém
// apontado ao flash mais recente — rede de segurança se um nome fixo for
// descontinuado. Substituível por GEMINI_MODELOS="a,b,c" sem tocar no código.
const MODELOS_POR_DEFEITO = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest"];
const GEMINI_MODELS = (process.env.GEMINI_MODELOS || "").split(",").map(m => m.trim()).filter(Boolean);
if (GEMINI_MODELS.length === 0) GEMINI_MODELS.push(...MODELOS_POR_DEFEITO);

const CONCORRENCIA_MAX = Math.max(1, Number(process.env.GEMINI_CONCORRENCIA) || 2);
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 45000;
const ESPERA_BASE_MS = 1500;

// ── Classificação de erros ───────────────────────────────────────────────
function statusDoErro(erro) {
  if (erro?.status && Number.isInteger(erro.status)) return erro.status;
  const m = String(erro?.message || "").match(/\[(\d{3})\s/);
  return m ? Number(m[1]) : null;
}
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const ehTimeout = (erro) => /timeout|ETIMEDOUT|ECONNRESET|fetch failed|network/i.test(String(erro?.message || ""));
const ehRetryable = (erro) => RETRYABLE.has(statusDoErro(erro)) || ehTimeout(erro);
// 404 = modelo não existe/não está disponível para esta chave → próximo modelo, sem esperar.
const ehModeloIndisponivel = (erro) => statusDoErro(erro) === 404;
// 400/401/403 = chave inválida, pedido malformado, região bloqueada → repetir não ajuda.
const ehFatal = (erro) => [400, 401, 403].includes(statusDoErro(erro));

class ErroIA extends Error {
  constructor(mensagem, { status = 502, codigo = "ia_indisponivel", causa = null } = {}) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.causa = causa;
  }
}

function descreverFalha(erro) {
  const s = statusDoErro(erro);
  if (s === 429) return new ErroIA("A IA atingiu o limite de pedidos deste minuto (plano gratuito). Tente de novo dentro de um minuto.", { status: 429, codigo: "quota", causa: erro });
  if (s === 503) return new ErroIA("O modelo de IA está com muita procura neste momento. Tente de novo dentro de instantes.", { status: 503, codigo: "alta_procura", causa: erro });
  if (ehTimeout(erro)) return new ErroIA("A IA demorou demasiado a responder. Tente de novo.", { status: 504, codigo: "timeout", causa: erro });
  if (ehFatal(erro)) return new ErroIA("A IA recusou o pedido (chave inválida ou pedido rejeitado). Um administrador deve verificar a configuração.", { status: 502, codigo: "configuracao", causa: erro });
  if (ehModeloIndisponivel(erro)) return new ErroIA("Nenhum dos modelos de IA configurados está disponível para esta chave.", { status: 502, codigo: "modelo_indisponivel", causa: erro });
  return new ErroIA(`A IA falhou: ${String(erro?.message || "sem resposta").slice(0, 160)}`, { status: 502, codigo: "erro", causa: erro });
}

// ── Fila de concorrência ─────────────────────────────────────────────────
let emCurso = 0;
const espera = [];
function adquirirVaga() {
  if (emCurso < CONCORRENCIA_MAX) { emCurso++; return Promise.resolve(); }
  return new Promise(resolve => espera.push(resolve));
}
function libertarVaga() {
  const proximo = espera.shift();
  if (proximo) proximo(); else emCurso = Math.max(0, emCurso - 1);
}

// ── Estatísticas (memória do processo) ───────────────────────────────────
const stats = { desde: new Date().toISOString(), porRecurso: {}, ultimosErros: [] };
function registar(recurso, { ok, ms, modelo, tentativas, erro }) {
  const r = stats.porRecurso[recurso] || (stats.porRecurso[recurso] = { chamadas: 0, ok: 0, falhas: 0, quota_429: 0, procura_503: 0, tentativas_extra: 0, ms_total: 0, modelos: {} });
  r.chamadas++;
  r.ms_total += ms;
  r.tentativas_extra += Math.max(0, tentativas - 1);
  if (ok) { r.ok++; r.modelos[modelo] = (r.modelos[modelo] || 0) + 1; }
  else {
    r.falhas++;
    const s = statusDoErro(erro);
    if (s === 429) r.quota_429++;
    if (s === 503) r.procura_503++;
    stats.ultimosErros.unshift({ recurso, quando: new Date().toISOString(), status: s, mensagem: String(erro?.message || "").slice(0, 200) });
    stats.ultimosErros = stats.ultimosErros.slice(0, 20);
  }
}
function estatisticasIA() {
  const porRecurso = {};
  for (const [k, r] of Object.entries(stats.porRecurso)) {
    porRecurso[k] = { ...r, ms_medio: r.ok ? Math.round(r.ms_total / r.ok) : null, taxa_sucesso: r.chamadas ? Math.round((r.ok / r.chamadas) * 100) : null };
  }
  return { configurada: Boolean(genAI), modelos: GEMINI_MODELS, concorrencia_max: CONCORRENCIA_MAX, em_curso: emCurso, em_espera: espera.length, desde: stats.desde, porRecurso, ultimosErros: stats.ultimosErros };
}

const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const comTimeout = (promessa, ms) => Promise.race([
  promessa,
  new Promise((_, reject) => { const t = setTimeout(() => reject(new Error(`timeout após ${ms} ms`)), ms); t.unref?.(); }),
]);

/**
 * Chama o Gemini com cadeia de modelos, repetições e fila.
 * @param {object} o
 * @param {string} o.prompt
 * @param {string} o.recurso        rótulo para estatísticas (resumo, quiz, flashcards…)
 * @param {boolean} [o.json]        pede JSON puro (responseMimeType)
 * @param {object} [o.schema]       responseSchema (saída estruturada) — garante a forma do JSON
 * @param {number} [o.temperature]
 * @param {number} [o.tentativas]   tentativas por modelo em erros transitórios (por defeito 3)
 * @param {number} [o.orcamentoMs]  tempo total máximo a insistir (modelos × tentativas); por defeito 60 s
 * @param {object} [o.cliente]      cliente injectável (testes); por defeito o real
 * @param {string[]} [o.modelos]    cadeia alternativa
 * @returns {Promise<{ texto: string, modelo: string, tentativas: number }>}
 */
async function chamarGemini({ prompt, recurso = "geral", json = false, schema = null, temperature, tentativas = 3, orcamentoMs = 60000, cliente = genAI, modelos = GEMINI_MODELS, timeoutMs = TIMEOUT_MS, esperaBaseMs = ESPERA_BASE_MS }) {
  if (!cliente) throw new ErroIA("IA não configurada neste servidor (GEMINI_API_KEY em falta).", { status: 503, codigo: "nao_configurada" });
  const inicio = Date.now();
  let totalTentativas = 0;
  let ultimoErro = null;
  await adquirirVaga();
  try {
    for (const modelo of modelos) {
      for (let n = 1; n <= tentativas; n++) {
        // Orçamento de tempo: quem espera é um estudante — a partir daqui
        // vale mais devolver o erro (e a mensagem "tente de novo") do que
        // continuar a percorrer modelos.
        if (totalTentativas > 0 && Date.now() - inicio > orcamentoMs) break;
        totalTentativas++;
        try {
          const generationConfig = {};
          if (json) generationConfig.responseMimeType = "application/json";
          if (schema) generationConfig.responseSchema = schema;
          if (temperature !== undefined) generationConfig.temperature = temperature;
          const model = cliente.getGenerativeModel({ model: modelo, ...(Object.keys(generationConfig).length ? { generationConfig } : {}) });
          const resultado = await comTimeout(model.generateContent(prompt), timeoutMs);
          const texto = resultado.response.text();
          if (!texto || !texto.trim()) throw new Error("resposta vazia");
          registar(recurso, { ok: true, ms: Date.now() - inicio, modelo, tentativas: totalTentativas });
          return { texto, modelo, tentativas: totalTentativas };
        } catch (erro) {
          ultimoErro = erro;
          if (ehFatal(erro)) break;                                      // não vale a pena insistir em nada
          if (ehModeloIndisponivel(erro)) break;                         // próximo modelo já
          if (!ehRetryable(erro) && !/resposta vazia/.test(erro.message)) break;
          if (n < tentativas && Date.now() - inicio < orcamentoMs) await dormir(esperaBaseMs * 2 ** (n - 1) + Math.random() * (esperaBaseMs / 3));
        }
      }
      if (ehFatal(ultimoErro) || Date.now() - inicio > orcamentoMs) break;
    }
  } finally {
    libertarVaga();
  }
  registar(recurso, { ok: false, ms: Date.now() - inicio, modelo: null, tentativas: totalTentativas, erro: ultimoErro });
  throw descreverFalha(ultimoErro);
}

// Extrai o objecto JSON de uma resposta que pode vir com cercas ``` ou texto à volta.
function extrairJson(texto) {
  const semCercas = String(texto).replace(/```(?:json)?/gi, "").trim();
  const inicio = semCercas.indexOf("{");
  const fim = semCercas.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) throw new Error("Resposta sem JSON.");
  return JSON.parse(semCercas.slice(inicio, fim + 1));
}

// Ping rápido a cada modelo da cadeia — para o admin ver o que responde.
async function testarModelos(cliente = genAI) {
  if (!cliente) return { configurada: false, modelos: [] };
  const resultados = [];
  for (const modelo of GEMINI_MODELS) {
    const inicio = Date.now();
    try {
      await chamarGemini({ prompt: "Responde só com a palavra OK.", recurso: "teste", tentativas: 1, cliente, modelos: [modelo], timeoutMs: 20000 });
      resultados.push({ modelo, ok: true, ms: Date.now() - inicio });
    } catch (erro) {
      resultados.push({ modelo, ok: false, ms: Date.now() - inicio, status: erro.causa ? statusDoErro(erro.causa) : erro.status, erro: erro.message });
    }
  }
  return { configurada: true, modelos: resultados };
}

module.exports = { genAI, GEMINI_MODELS, chamarGemini, extrairJson, ErroIA, estatisticasIA, testarModelos, statusDoErro, CONCORRENCIA_MAX };
