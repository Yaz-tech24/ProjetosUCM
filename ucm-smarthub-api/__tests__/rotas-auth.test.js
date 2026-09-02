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
      [/COUNT\(\*\) AS total FROM usuarios/, [[{ total: 5 }]]],
      [/INSERT INTO usuarios/, [{ insertId: 42 }]],
      [/FROM configuracoes/, [[{ nome_plataforma: "SmartHub", cor_primaria: "#04122e", cor_destaque: "#ffd700" }]]],
    ]);
    const res = await request(app).post("/api/register").send({
      nome: "Ana", email: "ana@teste.com", senha: "senha1234", curso: "Geral",
    });
    expect(res.status).toBe(201);
    expect(res.body.mensagem).toBe("Utilizador criado com sucesso!");
  });

  it("rejeita registo quando o domínio de email não está na lista configurada pelo admin", async () => {
    mockSql([
      [/FROM configuracoes/, [[{ dominios_email_permitidos: "gmail.com" }]]],
    ]);
    const res = await request(app).post("/api/register").send({
      nome: "Ana", email: "ana@hotmail.com", senha: "senha1234", curso: "Geral",
    });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/domínio/);
  });

  it("não força o papel via body — registo público insere sempre 'estudante' (fora do bootstrap)", async () => {
    let papelInserido;
    vi.spyOn(db, "query").mockImplementation((sql, params) => {
      if (/FROM configuracoes/.test(sql)) return Promise.resolve([[{ dominios_email_permitidos: "" }]]);
      if (/FROM cursos/.test(sql)) return Promise.resolve([[{ id: 1, nome: "Geral" }]]);
      if (/SELECT id FROM usuarios/.test(sql)) return Promise.resolve([[]]);
      if (/COUNT\(\*\) AS total FROM usuarios/.test(sql)) return Promise.resolve([[{ total: 3 }]]);
      if (/INSERT INTO usuarios/.test(sql)) { papelInserido = params[4]; return Promise.resolve([{ insertId: 2 }]); }
      return Promise.resolve([[]]);
    });
    const res = await request(app).post("/api/register").send({
      nome: "Ana", email: "ana2@teste.com", senha: "senha1234", curso: "Geral", papel: "professor",
    });
    expect(res.status).toBe(201);
    expect(papelInserido).toBe("estudante");
  });

  it("torna admin a primeira conta criada numa plataforma vazia", async () => {
    let papelInserido;
    vi.spyOn(db, "query").mockImplementation((sql, params) => {
      if (/FROM cursos/.test(sql)) return Promise.resolve([[{ id: 1, nome: "Geral" }]]);
      if (/SELECT id FROM usuarios/.test(sql)) return Promise.resolve([[]]);
      if (/COUNT\(\*\) AS total FROM usuarios/.test(sql)) return Promise.resolve([[{ total: 0 }]]);
      if (/INSERT INTO usuarios/.test(sql)) { papelInserido = params[4]; return Promise.resolve([{ insertId: 1 }]); }
      if (/FROM configuracoes/.test(sql)) return Promise.resolve([[{ nome_plataforma: "SmartHub", cor_primaria: "#04122e", cor_destaque: "#ffd700" }]]);
      return Promise.resolve([[]]);
    });
    const res = await request(app).post("/api/register").send({
      nome: "Primeiro Admin", email: "primeiro@teste.com", senha: "senha1234", papel: "estudante", curso: "Geral",
    });
    expect(res.status).toBe(201);
    expect(papelInserido).toBe("admin");
    expect(res.body.mensagem).toMatch(/administrador/);
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

describe("Sessão via cookie httpOnly", () => {
  beforeEach(() => { restaurarDb(); });

  it("login define um cookie httpOnly 'token'", async () => {
    mockSql([[/FROM usuarios WHERE email/, [[{ id: 1, email: "a@b.com", senha: HASH_SENHA_CORRECTA, papel: "estudante", nome: "Ana", curso: "Geral", avatar_url: null }]]]]);
    const res = await request(app).post("/api/login").send({ email: "a@b.com", senha: "senhaCorrecta123" });
    const cookies = res.headers["set-cookie"] || [];
    const tokenCookie = cookies.find(c => c.startsWith("token="));
    expect(tokenCookie).toBeTruthy();
    expect(tokenCookie).toMatch(/HttpOnly/i);
  });

  it("GET /api/me autentica pelo cookie de sessão, sem cabeçalho Authorization", async () => {
    const agent = request.agent(app);

    mockSql([[/FROM usuarios WHERE email/, [[{ id: 7, email: "c@d.com", senha: HASH_SENHA_CORRECTA, papel: "estudante", nome: "Carlos", curso: "Geral", avatar_url: null }]]]]);
    await agent.post("/api/login").send({ email: "c@d.com", senha: "senhaCorrecta123" });

    mockSql([[/SELECT id, nome, email, papel, curso, numero_estudante, telefone, avatar_url FROM usuarios WHERE id/, [[{ id: 7, nome: "Carlos", email: "c@d.com", papel: "estudante", curso: "Geral", avatar_url: null }]]]]);
    const res = await agent.get("/api/me");
    expect(res.status).toBe(200);
    expect(res.body.utilizador.email).toBe("c@d.com");
  });

  it("GET /api/me continua a aceitar Authorization: Bearer (clientes de API/Swagger)", async () => {
    const jwt = require("jsonwebtoken");
    const { JWT_SECRET } = require("../middleware/auth");
    const token = jwt.sign({ id: 9, papel: "estudante", nome: "Bea", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h" });

    mockSql([[/SELECT id, nome, email, papel, curso, numero_estudante, telefone, avatar_url FROM usuarios WHERE id/, [[{ id: 9, nome: "Bea", email: "bea@teste.com", papel: "estudante", curso: "Geral", avatar_url: null }]]]]);
    const res = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.utilizador.nome).toBe("Bea");
  });

  it("POST /api/logout limpa o cookie de sessão", async () => {
    const res = await request(app).post("/api/logout");
    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"] || [];
    const tokenCookie = cookies.find(c => c.startsWith("token="));
    expect(tokenCookie).toBeTruthy();
    expect(tokenCookie).toMatch(/Expires=/i); // clearCookie expira o cookie no passado
  });
});

describe("GET /api/status", () => {
  beforeEach(() => { restaurarDb(); });

  it("responde 200 quando a BD está acessível", async () => {
    vi.spyOn(db, "query").mockResolvedValue([[{ 1: 1 }]]);
    const res = await request(app).get("/api/status");
    expect(res.status).toBe(200);
    expect(res.body.bd).toBe("ligada");
  });

  it("responde 503 quando a BD está inacessível — o healthcheck não mente", async () => {
    vi.spyOn(db, "query").mockRejectedValue(new Error("connection refused"));
    const res = await request(app).get("/api/status");
    expect(res.status).toBe(503);
  });
});
