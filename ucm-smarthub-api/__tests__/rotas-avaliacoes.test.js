import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Mesma estratégia dos outros testes de rotas: substituir db.query no pool
// partilhado (ver comentário em rotas-auth.test.js).
const db = require("../config/db");
const { app } = require("../server");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");

const tokenDe = (id, papel = "estudante") =>
  jwt.sign({ id, papel, nome: "Teste", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h" });

function mockSql(regrasPorOrdem) {
  const chamadas = [];
  vi.spyOn(db, "query").mockImplementation((sql, params) => {
    chamadas.push({ sql, params });
    for (const [padrao, resultado] of regrasPorOrdem) {
      if (padrao.test(sql)) return Promise.resolve(typeof resultado === "function" ? resultado(params) : resultado);
    }
    return Promise.resolve([[]]);
  });
  return chamadas;
}

describe("POST /api/materiais/:id/avaliacoes", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("rejeita pedidos sem autenticação", async () => {
    const res = await request(app).post("/api/materiais/1/avaliacoes").send({ nota: 5 });
    expect(res.status).toBe(401);
  });

  it("rejeita nota fora do intervalo 1–5 sem tocar na BD", async () => {
    const spy = vi.spyOn(db, "query");
    const res = await request(app).post("/api/materiais/1/avaliacoes")
      .set("Authorization", `Bearer ${tokenDe(7)}`)
      .send({ nota: 6, comentario: "x" });
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("devolve 404 quando o material não existe ou não está aprovado", async () => {
    mockSql([[/FROM materiais WHERE id = \? AND status = 'aprovado'/, [[]]]]);
    const res = await request(app).post("/api/materiais/99/avaliacoes")
      .set("Authorization", `Bearer ${tokenDe(7)}`)
      .send({ nota: 4 });
    expect(res.status).toBe(404);
  });

  it("regista a avaliação com o id do utilizador autenticado (ignora o body)", async () => {
    const chamadas = mockSql([
      [/FROM materiais WHERE id = \? AND status = 'aprovado'/, [[{ id: 1 }]]],
      [/INSERT INTO avaliacoes/, [{ affectedRows: 1 }]],
      [/SELECT autor_id FROM materiais/, [[{ autor_id: 3 }]]],
    ]);
    const res = await request(app).post("/api/materiais/1/avaliacoes")
      .set("Authorization", `Bearer ${tokenDe(7)}`)
      .send({ nota: 5, comentario: "Excelente", usuario_id: 999 });
    expect(res.status).toBe(201);
    const insert = chamadas.find(c => /INSERT INTO avaliacoes/.test(c.sql));
    expect(insert.params.slice(0, 3)).toEqual([1, 7, 5]);
  });
});

describe("GET /api/materiais/:id/avaliacoes", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("lista avaliações com estatísticas, sem autenticação", async () => {
    mockSql([
      [/SELECT a\.id, a\.nota/, [[{ id: 1, nota: 5, comentario: "Top", data_criacao: new Date(), usuario: "Ana", avatar_url: null }]]],
      [/COUNT\(\*\) as total FROM avaliacoes/, [[{ total: 1 }]]],
      [/AVG\(nota\) as media FROM avaliacoes/, [[{ media: 5 }]]],
    ]);
    const res = await request(app).get("/api/materiais/1/avaliacoes");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.avaliacoes)).toBe(true);
    expect(res.body.avaliacoes[0].usuario).toBe("Ana");
    expect(res.body.estatisticas.total).toBe(1);
    expect(res.body.estatisticas.media).toBe("5.0");
  });
});

describe("DELETE /api/materiais/:id/avaliacoes", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("só apaga a avaliação do próprio utilizador", async () => {
    const chamadas = mockSql([
      [/DELETE FROM avaliacoes/, [{ affectedRows: 1 }]],
      [/SELECT autor_id FROM materiais/, [[{ autor_id: 3 }]]],
    ]);
    const res = await request(app).delete("/api/materiais/1/avaliacoes")
      .set("Authorization", `Bearer ${tokenDe(7)}`);
    expect(res.status).toBe(200);
    const del = chamadas.find(c => /DELETE FROM avaliacoes/.test(c.sql));
    expect(del.params).toEqual([1, 7]);
  });

  it("devolve 404 quando não havia avaliação para apagar", async () => {
    mockSql([[/DELETE FROM avaliacoes/, [{ affectedRows: 0 }]]]);
    const res = await request(app).delete("/api/materiais/1/avaliacoes")
      .set("Authorization", `Bearer ${tokenDe(7)}`);
    expect(res.status).toBe(404);
  });
});
