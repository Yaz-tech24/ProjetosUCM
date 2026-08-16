import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Hash pré-calculado de "senhaCorrecta123" (bcrypt, custo 10) — evita recalcular
// um hash real em cada teste só para simular um utilizador existente.
const HASH_SENHA_CORRECTA = "$2b$10$TTgW.kQFQKp/341.DF1ReeprUkD.AD6zaZFwOVv.GzegkEqrG/UqC";

// Nota importante: vi.mock("../config/db", ...) NÃO intercepta o require() CJS
// que server.js faz internamente (confirmado empiricamente — as chamadas
// continuavam a acertar na BD real). Em vez disso, `require("../config/db")`
// devolve a MESMA instância do pool que o server.js usa (o require() do Node
// dá cache ao módulo), por isso conseguimos substituir directamente o método
// `.query` desse objecto partilhado com vi.spyOn — isto funciona
// independentemente de particularidades de interop CJS/ESM do Vitest.
const db = require("../config/db");
const { app } = require("../server");

/** Substitui db.query por um dispatcher: cada entrada é testada por ordem contra o SQL pedido. */
function mockSql(regrasPorOrdem) {
  vi.spyOn(db, "query").mockImplementation((sql) => {
    for (const [padrao, resultado] of regrasPorOrdem) {
      if (padrao.test(sql)) return Promise.resolve(resultado);
    }
    return Promise.resolve([[]]);
  });
}

function restaurarDb() {
  vi.restoreAllMocks();
}

describe("POST /api/register", () => {
  beforeEach(() => { restaurarDb(); });

  it("rejeita email inválido sem tocar na BD", async () => {
    const spy = vi.spyOn(db, "query");
    const res = await request(app).post("/api/register").send({
      nome: "Ana", email: "nao-e-email", senha: "senha1234", curso: "Geral",
    });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/email/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejeita curso que não existe na lista da BD", async () => {
    mockSql([[/FROM cursos/, [[{ id: 1, nome: "Geral" }]]]]);
    const res = await request(app).post("/api/register").send({
      nome: "Ana", email: "ana@teste.com", senha: "senha1234", curso: "Curso Inventado",
    });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe("Curso inválido.");
  });

  it("rejeita quando o email já está registado", async () => {
    mockSql([
      [/FROM cursos/, [[{ id: 1, nome: "Geral" }]]],
      [/SELECT id FROM usuarios/, [[{ id: 99 }]]],
    ]);
    const res = await request(app).post("/api/register").send({
      nome: "Ana", email: "ana@teste.com", senha: "senha1234", curso: "Geral",
    });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/já está em uso/);
  });

  it("cria a conta com dados válidos", async () => {
    mockSql([
      [/FROM cursos/, [[{ id: 1, nome: "Geral" }]]],
      [/SELECT id FROM usuarios/, [[]]],
      [/INSERT INTO usuarios/, [{ insertId: 42 }]],
      [/FROM configuracoes/, [[{ nome_plataforma: "SmartHub", cor_primaria: "#04122e", cor_destaque: "#ffd700" }]]],
    ]);
    const res = await request(app).post("/api/register").send({
      nome: "Ana", email: "ana@teste.com", senha: "senha1234", curso: "Geral",
    });
    expect(res.status).toBe(201);
  });
});

describe("POST /api/login", () => {
  beforeEach(() => { restaurarDb(); });

  it("rejeita palavra-passe vazia", async () => {
    const res = await request(app).post("/api/login").send({ email: "a@b.com", senha: "" });
    expect(res.status).toBe(400);
  });

  it("rejeita utilizador inexistente com mensagem genérica (não revela se o email existe)", async () => {
    mockSql([[/FROM usuarios WHERE email/, [[]]]]);
    const res = await request(app).post("/api/login").send({ email: "naoexiste-a@teste.com", senha: "qualquer" });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe("Email ou palavra-passe incorrectos.");
  });

  it("rejeita palavra-passe incorrecta com a MESMA mensagem genérica que o utilizador inexistente", async () => {
    mockSql([[/FROM usuarios WHERE email/, [[{ id: 1, email: "naoexiste-b@teste.com", senha: HASH_SENHA_CORRECTA, papel: "estudante", nome: "Ana", curso: "Geral" }]]]]);
    const res = await request(app).post("/api/login").send({ email: "naoexiste-b@teste.com", senha: "errada" });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe("Email ou palavra-passe incorrectos.");
  });

  it("autentica com sucesso e devolve um token", async () => {
    mockSql([[/FROM usuarios WHERE email/, [[{ id: 1, email: "a@b.com", senha: HASH_SENHA_CORRECTA, papel: "estudante", nome: "Ana", curso: "Geral", avatar_url: null }]]]]);
    const res = await request(app).post("/api/login").send({ email: "a@b.com", senha: "senhaCorrecta123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.utilizador.email).toBe("a@b.com");
  });
});

describe("middleware autenticar", () => {
  beforeEach(() => { restaurarDb(); });

  it("rejeita pedidos sem token", async () => {
    const res = await request(app).get("/api/meus-materiais");
    expect(res.status).toBe(401);
    expect(res.body.erro).toMatch(/em falta/);
  });

  it("rejeita tokens inválidos", async () => {
    const res = await request(app).get("/api/meus-materiais").set("Authorization", "Bearer token-invalido");
    expect(res.status).toBe(401);
    expect(res.body.erro).toMatch(/inválido/);
  });
});
