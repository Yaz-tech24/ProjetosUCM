import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";

// Ficheiro isolado de propósito: o limitador de taxa guarda estado num Map ao
// nível do módulo, que persiste durante toda a vida deste ficheiro de teste —
// misturar com outros testes de /api/login tornaria a contagem imprevisível.
const db = require("../config/db");
const { app } = require("../server");

beforeAll(() => {
  vi.spyOn(db, "query").mockResolvedValue([[]]); // "utilizador não encontrado" em todas as tentativas
});

describe("limitador de taxa em /api/login", () => {
  it("bloqueia com 429 depois de exceder o número de tentativas permitidas", async () => {
    let ultimaResposta;
    // limitarLogin permite 10 tentativas — a 11ª deve ser bloqueada.
    for (let i = 0; i < 11; i++) {
      ultimaResposta = await request(app).post("/api/login").send({ email: "x@x.com", senha: "errada" });
    }
    expect(ultimaResposta.status).toBe(429);
    expect(ultimaResposta.body.erro).toMatch(/Demasiadas tentativas/);
  });
});
