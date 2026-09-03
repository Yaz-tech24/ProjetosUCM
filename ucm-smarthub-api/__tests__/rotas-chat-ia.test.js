import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// Cobre as duas rotas de conversa com a IA (assistente geral e chat por
// material) — distintas do chat entre estudantes via Socket.IO, já coberto
// por socketChat.test.js. O caminho de "resposta real da IA" depende de
// GEMINI_API_KEY estar configurada (varia por ambiente — presente localmente,
// ausente em CI salvo configuração explícita), por isso não é testado aqui
// sem chamadas de rede reais; o que cobrimos é o que a rota decide sempre,
// em qualquer ambiente, ANTES desse ponto: autenticação, validação da
// mensagem, e o gate de "desactivado pelo administrador".
const db = require("../config/db");
const { app } = require("../server");
const { MENSAGEM_IA_MAX } = require("../services/ia");

const JWT_SECRET = process.env.JWT_SECRET || "ucm_smarthub_dev_secret_mude_em_producao";
const tokenEstudante = jwt.sign({ id: 1, papel: "estudante", nome: "Ana", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h" });

function mockSql(regrasPorOrdem) {
  vi.spyOn(db, "query").mockImplementation((sql) => {
    for (const [padrao, resultado] of regrasPorOrdem) {
      if (padrao.test(sql)) return Promise.resolve(resultado);
    }
    return Promise.resolve([[]]);
  });
}

const mockConfigIaInactiva = () => mockSql([[/FROM configuracoes/, [[{ ia_activada: false }]]]]);

describe("POST /api/chat", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("rejeita pedidos sem autenticação", async () => {
    const res = await request(app).post("/api/chat").send({ mensagem: "Olá" });
    expect(res.status).toBe(401);
  });

  it("rejeita mensagem vazia", async () => {
    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", `Bearer ${tokenEstudante}`)
      .send({ mensagem: "   " });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/Mensagem em falta/);
  });

  it("rejeita mensagem demasiado longa", async () => {
    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", `Bearer ${tokenEstudante}`)
      .send({ mensagem: "a".repeat(MENSAGEM_IA_MAX + 1) });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/demasiado longa/);
  });

  it("devolve 503 quando a IA está desactivada pelo administrador", async () => {
    mockConfigIaInactiva();
    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", `Bearer ${tokenEstudante}`)
      .send({ mensagem: "Explica-me recursão." });
    expect(res.status).toBe(503);
    expect(res.body.erro).toMatch(/desactivado/);
  });
});

describe("POST /api/materiais/:id/chat", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("rejeita pedidos sem autenticação", async () => {
    const res = await request(app).post("/api/materiais/1/chat").send({ mensagem: "Explica melhor." });
    expect(res.status).toBe(401);
  });

  it("rejeita mensagem vazia", async () => {
    const res = await request(app)
      .post("/api/materiais/1/chat")
      .set("Authorization", `Bearer ${tokenEstudante}`)
      .send({ mensagem: "" });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/Mensagem em falta/);
  });

  it("rejeita mensagem demasiado longa", async () => {
    const res = await request(app)
      .post("/api/materiais/1/chat")
      .set("Authorization", `Bearer ${tokenEstudante}`)
      .send({ mensagem: "a".repeat(MENSAGEM_IA_MAX + 1) });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/demasiado longa/);
  });

  it("devolve 503 quando a IA está desactivada pelo administrador", async () => {
    mockConfigIaInactiva();
    const res = await request(app)
      .post("/api/materiais/1/chat")
      .set("Authorization", `Bearer ${tokenEstudante}`)
      .send({ mensagem: "Explica melhor o segundo conceito." });
    expect(res.status).toBe(503);
    expect(res.body.erro).toMatch(/desactivado/);
  });
});
