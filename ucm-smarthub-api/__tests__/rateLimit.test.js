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
    // limitarLogin permite 150 tentativas (dimensionado para ~100 utilizadores
    // atrás do mesmo IP de campus) — a 151ª deve ser bloqueada. Na prática o
    // bloqueio por conta (5 falhas, ver FALHAS_LOGIN_MAX) dispara bem antes
    // disso e já devolve 429 para as tentativas seguintes; o loop grande
    // continua a exercitar (e não quebrar) o limitador de IP por baixo.
    for (let i = 0; i < 151; i++) {
      ultimaResposta = await request(app).post("/api/login").send({ email: "x@x.com", senha: "errada" });
    }
    expect(ultimaResposta.status).toBe(429);
    expect(ultimaResposta.body.erro).toMatch(/Demasiadas tentativas/);
  }, 20000);
});
