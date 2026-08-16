import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

const db = require("../config/db");
const { app } = require("../server");

const JWT_SECRET = process.env.JWT_SECRET || "ucm_smarthub_dev_secret_mude_em_producao";
const tokenAdmin = jwt.sign({ id: 1, papel: "admin", nome: "Admin", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h" });
const tokenEstudante = jwt.sign({ id: 2, papel: "estudante", nome: "Ana", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h" });

function mockSql(regrasPorOrdem) {
  vi.spyOn(db, "query").mockImplementation((sql, params) => {
    for (const [padrao, resultado] of regrasPorOrdem) {
      if (padrao.test(sql)) return Promise.resolve(typeof resultado === "function" ? resultado(params) : resultado);
    }
    return Promise.resolve([[]]);
  });
}

describe("POST /api/admin/utilizadores", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("rejeita pedidos de quem não é admin", async () => {
    const res = await request(app)
      .post("/api/admin/utilizadores")
      .set("Authorization", `Bearer ${tokenEstudante}`)
      .send({ nome: "Prof", email: "prof@teste.com", senha: "senha1234", papel: "professor", curso: "Geral" });
    expect(res.status).toBe(403);
  });

  it("rejeita pedidos sem autenticação", async () => {
    const res = await request(app).post("/api/admin/utilizadores").send({});
    expect(res.status).toBe(401);
  });

  it("cria uma conta de docente com sucesso", async () => {
    let papelInserido;
    mockSql([
      [/FROM configuracoes/, [[{ dominios_email_permitidos: "" }]]],
      [/FROM cursos/, [[{ id: 1, nome: "Geral" }]]],
      [/SELECT id FROM usuarios/, [[]]],
      [/INSERT INTO usuarios/, (params) => { papelInserido = params[4]; return [{ insertId: 9 }]; }],
    ]);
    const res = await request(app)
      .post("/api/admin/utilizadores")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ nome: "Prof. João", email: "prof@teste.com", senha: "senha1234", papel: "professor", curso: "Geral" });
    expect(res.status).toBe(201);
    expect(papelInserido).toBe("professor");
    expect(res.body.utilizador.papel).toBe("professor");
  });

  it("rejeita quando o domínio de email não está na lista configurada", async () => {
    mockSql([
      [/FROM configuracoes/, [[{ dominios_email_permitidos: "gmail.com" }]]],
      [/FROM cursos/, [[{ id: 1, nome: "Geral" }]]],
    ]);
    const res = await request(app)
      .post("/api/admin/utilizadores")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ nome: "Prof", email: "prof@hotmail.com", senha: "senha1234", papel: "professor", curso: "Geral" });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/domínio/);
  });

  it("aceita quando o domínio de email está na lista configurada", async () => {
    mockSql([
      [/FROM configuracoes/, [[{ dominios_email_permitidos: "gmail.com" }]]],
      [/FROM cursos/, [[{ id: 1, nome: "Geral" }]]],
      [/SELECT id FROM usuarios/, [[]]],
      [/INSERT INTO usuarios/, [{ insertId: 10 }]],
    ]);
    const res = await request(app)
      .post("/api/admin/utilizadores")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ nome: "Prof", email: "prof@gmail.com", senha: "senha1234", papel: "professor", curso: "Geral" });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/admin/utilizadores", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("rejeita quem não é admin", async () => {
    const res = await request(app).get("/api/admin/utilizadores").set("Authorization", `Bearer ${tokenEstudante}`);
    expect(res.status).toBe(403);
  });

  it("lista utilizadores para o admin", async () => {
    mockSql([[/FROM usuarios ORDER BY data_criacao/, [[{ id: 1, nome: "Ana", email: "a@b.com", papel: "estudante", curso: "Geral", avatar_url: null }]]]]);
    const res = await request(app).get("/api/admin/utilizadores").set("Authorization", `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
