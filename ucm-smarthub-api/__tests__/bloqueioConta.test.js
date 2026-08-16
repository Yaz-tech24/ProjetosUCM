import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";

// Ficheiro isolado de propósito, tal como rateLimit.test.js: o bloqueio de
// conta guarda estado num Map ao nível do módulo (por email), que persiste
// durante toda a vida deste ficheiro de teste — misturar com outros testes
// de /api/login tornaria a contagem de falhas imprevisível. Usa também um
// email exclusivo para não ser afectado pelo limitador de taxa por IP
// (10 tentativas/15min) partilhado com outros ficheiros de teste.
const db = require("../config/db");
const { app } = require("../server");

const EMAIL = "vitima-bloqueio@teste.com";

beforeAll(() => {
  vi.spyOn(db, "query").mockResolvedValue([[]]); // "utilizador não encontrado" em todas as tentativas
});

describe("bloqueio de conta em /api/login", () => {
  it("bloqueia a CONTA (não o IP) depois de 5 tentativas falhadas para o mesmo email", async () => {
    let ultimaResposta;
    for (let i = 0; i < 5; i++) {
      ultimaResposta = await request(app).post("/api/login").send({ email: EMAIL, senha: "errada" });
      expect(ultimaResposta.status).toBe(400);
    }
    // A 6ª tentativa é bloqueada por causa das 5 falhas anteriores, não pelo limite de IP
    ultimaResposta = await request(app).post("/api/login").send({ email: EMAIL, senha: "errada" });
    expect(ultimaResposta.status).toBe(429);
    expect(ultimaResposta.body.erro).toMatch(/Demasiadas tentativas falhadas/);
  });
});
