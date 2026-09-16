import { describe, it, expect } from "vitest";

// Cliente partilhado do Gemini: cadeia de modelos, repetições com espera,
// classificação de erros e fila de concorrência — tudo com um cliente falso.
const { chamarGemini, ErroIA, estatisticasIA, testarModelos } = require("../services/gemini");

const erroHttp = (status, msg = "erro") => Object.assign(new Error(`[GoogleGenerativeAI Error]: Error fetching: [${status} ${msg}] detalhe`), {});
const resposta = (texto) => ({ response: { text: () => texto } });

// Cliente falso que responde por modelo com uma fila de resultados (função ou valor).
function clienteFalso(planos) {
  const chamadas = [];
  return {
    chamadas,
    getGenerativeModel: ({ model, generationConfig }) => ({
      generateContent: async (prompt) => {
        chamadas.push({ model, generationConfig, prompt });
        const fila = planos[model] || planos["*"] || [];
        const proximo = fila.length > 1 ? fila.shift() : fila[0];
        if (typeof proximo === "function") return proximo();
        if (proximo instanceof Error) throw proximo;
        return resposta(proximo ?? "OK");
      },
    }),
  };
}

// Esperas entre tentativas encurtadas para os testes correrem em milissegundos.
const rapido = { esperaBaseMs: 2 };

describe("chamarGemini", () => {
  it("devolve o texto do primeiro modelo que responde", async () => {
    const c = clienteFalso({ "m1": ["resposta A"] });
    const r = await chamarGemini({ prompt: "olá", recurso: "t1", cliente: c, modelos: ["m1", "m2"] });
    expect(r).toMatchObject({ texto: "resposta A", modelo: "m1", tentativas: 1 });
  });

  it("repete o mesmo modelo em 503 e só depois passa ao seguinte", async () => {
    const c = clienteFalso({ "m1": [erroHttp(503, "Service Unavailable"), erroHttp(503, "Service Unavailable"), "depois de insistir"] });
    const r = await chamarGemini({ prompt: "x", recurso: "t2", cliente: c, modelos: ["m1", "m2"], tentativas: 3, ...rapido });
    expect(r.texto).toBe("depois de insistir");
    expect(r.tentativas).toBe(3);
    expect(c.chamadas.every(ch => ch.model === "m1")).toBe(true);
  });

  it("em 404 (modelo inexistente) passa logo ao modelo seguinte sem repetir", async () => {
    const c = clienteFalso({ "velho": [erroHttp(404, "Not Found")], "novo": ["ok do novo"] });
    const r = await chamarGemini({ prompt: "x", recurso: "t3", cliente: c, modelos: ["velho", "novo"], tentativas: 3, ...rapido });
    expect(r.modelo).toBe("novo");
    expect(c.chamadas.filter(ch => ch.model === "velho")).toHaveLength(1);
  });

  it("quota esgotada em todos os modelos → ErroIA 429 com mensagem para o utilizador", async () => {
    const c = clienteFalso({ "*": [erroHttp(429, "Too Many Requests")] });
    await expect(chamarGemini({ prompt: "x", recurso: "t4", cliente: c, modelos: ["a", "b"], tentativas: 2, ...rapido }))
      .rejects.toMatchObject({ status: 429, codigo: "quota" });
    expect(c.chamadas).toHaveLength(4); // 2 modelos × 2 tentativas
  });

  it("alta procura (503) em tudo → ErroIA 503", async () => {
    const c = clienteFalso({ "*": [erroHttp(503, "Service Unavailable")] });
    const erro = await chamarGemini({ prompt: "x", recurso: "t5", cliente: c, modelos: ["a"], tentativas: 2 }).catch(e => e);
    expect(erro).toBeInstanceOf(ErroIA);
    expect(erro.status).toBe(503);
    expect(erro.message).toMatch(/muita procura/);
  });

  it("chave inválida (400/403) não repete nem tenta outros modelos", async () => {
    const c = clienteFalso({ "*": [erroHttp(403, "Forbidden")] });
    const erro = await chamarGemini({ prompt: "x", recurso: "t6", cliente: c, modelos: ["a", "b", "c"], tentativas: 3 }).catch(e => e);
    expect(erro.codigo).toBe("configuracao");
    expect(c.chamadas).toHaveLength(1);
  });

  it("sem cliente (chave em falta) → 503 nao_configurada", async () => {
    await expect(chamarGemini({ prompt: "x", cliente: null })).rejects.toMatchObject({ status: 503, codigo: "nao_configurada" });
  });

  it("pede JSON e schema quando indicado", async () => {
    const c = clienteFalso({ "m": ['{"a":1}'] });
    await chamarGemini({ prompt: "x", recurso: "t7", cliente: c, modelos: ["m"], json: true, schema: { type: "OBJECT" }, temperature: 0.1 });
    expect(c.chamadas[0].generationConfig).toEqual({ responseMimeType: "application/json", responseSchema: { type: "OBJECT" }, temperature: 0.1 });
  });

  it("a fila limita as chamadas em simultâneo ao máximo configurado", async () => {
    let emCurso = 0, pico = 0;
    const lento = () => new Promise(res => { emCurso++; pico = Math.max(pico, emCurso); setTimeout(() => { emCurso--; res(resposta("ok")); }, 80); });
    const c = clienteFalso({ "*": [lento] });
    await Promise.all(Array.from({ length: 6 }, (_, i) => chamarGemini({ prompt: String(i), recurso: "t8", cliente: c, modelos: ["m"] })));
    expect(pico).toBeLessThanOrEqual(2); // GEMINI_CONCORRENCIA por defeito
    expect(c.chamadas).toHaveLength(6);
  });

  it("regista estatísticas por recurso", async () => {
    const s = estatisticasIA();
    expect(s.porRecurso.t1).toMatchObject({ chamadas: 1, ok: 1, falhas: 0 });
    expect(s.porRecurso.t4).toMatchObject({ chamadas: 1, ok: 0, falhas: 1, quota_429: 1 });
    expect(s.porRecurso.t2.tentativas_extra).toBe(2);
    expect(s.ultimosErros.some(e => e.recurso === "t5" && e.status === 503)).toBe(true);
  });

  it("testarModelos reporta cada modelo da cadeia", async () => {
    const c = clienteFalso({ "*": ["OK"] });
    const r = await testarModelos(c);
    expect(r.configurada).toBe(true);
    expect(r.modelos.length).toBeGreaterThan(0);
    expect(r.modelos.every(m => m.ok === true && typeof m.ms === "number")).toBe(true);
  });
});
