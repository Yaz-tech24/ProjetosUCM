import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

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
      if (padrao.test(sql)) return Promise.resolve(resultado);
    }
    return Promise.resolve([[]]);
  });
  return chamadas;
}

describe("POST /api/materiais/:id/comentarios", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("rejeita pedidos sem autenticação", async () => {
    const res = await request(app).post("/api/materiais/1/comentarios").send({ conteudo: "olá" });
    expect(res.status).toBe(401);
  });

  it("rejeita comentário vazio ou só com espaços", async () => {
    const res = await request(app).post("/api/materiais/1/comentarios")
      .set("Authorization", `Bearer ${tokenDe(7)}`)
      .send({ conteudo: "   " });
    expect(res.status).toBe(400);
  });

  it("rejeita comentário com mais de 1000 caracteres", async () => {
    const res = await request(app).post("/api/materiais/1/comentarios")
      .set("Authorization", `Bearer ${tokenDe(7)}`)
      .send({ conteudo: "a".repeat(1001) });
    expect(res.status).toBe(400);
  });

  it("não permite comentar materiais que não estão aprovados", async () => {
    mockSql([[/FROM materiais WHERE id = \? AND status = 'aprovado'/, [[]]]]);
    const res = await request(app).post("/api/materiais/5/comentarios")
      .set("Authorization", `Bearer ${tokenDe(7)}`)
      .send({ conteudo: "Bom material" });
    expect(res.status).toBe(404);
  });

  it("grava o comentário com o id do utilizador autenticado", async () => {
    const chamadas = mockSql([
      [/FROM materiais WHERE id = \? AND status = 'aprovado'/, [[{ id: 5 }]]],
      [/INSERT INTO comentarios_materiais/, [{ insertId: 11 }]],
    ]);
    const res = await request(app).post("/api/materiais/5/comentarios")
      .set("Authorization", `Bearer ${tokenDe(7)}`)
      .send({ conteudo: "  Bom material  " });
    expect(res.status).toBe(201);
    const insert = chamadas.find(c => /INSERT INTO comentarios_materiais/.test(c.sql));
    expect(insert.params[0]).toBe(5);
    expect(insert.params[1]).toBe(7);
    expect(insert.params[2]).toBe("Bom material");
  });
});

describe("DELETE /api/comentarios/:id", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("um estudante não pode apagar o comentário de outro", async () => {
    const chamadas = mockSql([[/SELECT id, usuario_id, material_id FROM comentarios_materiais/, [[{ id: 11, usuario_id: 8, material_id: 5 }]]]]);
    const res = await request(app).delete("/api/comentarios/11").set("Authorization", `Bearer ${tokenDe(7)}`);
    expect(res.status).toBe(403);
    expect(chamadas.some(c => /DELETE FROM comentarios_materiais/.test(c.sql))).toBe(false);
  });

  it("o autor pode apagar o seu comentário", async () => {
    mockSql([
      [/SELECT id, usuario_id, material_id FROM comentarios_materiais/, [[{ id: 11, usuario_id: 7, material_id: 5 }]]],
      [/DELETE FROM comentarios_materiais/, [{ affectedRows: 1 }]],
    ]);
    const res = await request(app).delete("/api/comentarios/11").set("Authorization", `Bearer ${tokenDe(7)}`);
    expect(res.status).toBe(200);
  });

  it("um admin pode apagar qualquer comentário", async () => {
    mockSql([
      [/SELECT id, usuario_id, material_id FROM comentarios_materiais/, [[{ id: 11, usuario_id: 8, material_id: 5 }]]],
      [/DELETE FROM comentarios_materiais/, [{ affectedRows: 1 }]],
    ]);
    const res = await request(app).delete("/api/comentarios/11").set("Authorization", `Bearer ${tokenDe(1, "admin")}`);
    expect(res.status).toBe(200);
  });
});
