import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { generate } from "otplib";

const db = require("../config/db");
const { app } = require("../server");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");
const totp = require("../services/totp");
const { normalizar } = require("../services/codigosRecuperacao");
const crypto = require("crypto");

const HASH_SENHA_CORRECTA = "$2b$10$TTgW.kQFQKp/341.DF1ReeprUkD.AD6zaZFwOVv.GzegkEqrG/UqC";
const tokenDe = (id, papel = "estudante", extra = {}) =>
  jwt.sign({ id, papel, nome: "Teste", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h", ...extra });

function mockSql(regras) {
  const chamadas = [];
  vi.spyOn(db, "query").mockImplementation((sql, params) => {
    chamadas.push({ sql, params });
    for (const [padrao, resultado] of regras) {
      if (padrao.test(sql)) return Promise.resolve(typeof resultado === "function" ? resultado(params) : resultado);
    }
    return Promise.resolve([[]]);
  });
  return chamadas;
}

describe("Sessões com jti", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("o login regista a sessão e o token traz jti", async () => {
    const chamadas = mockSql([
      [/FROM usuarios WHERE email/, [[{ id: 1, email: "a@b.com", senha: HASH_SENHA_CORRECTA, papel: "estudante", nome: "Ana", curso: "Geral", email_verificado: 1 }]]],
      [/INSERT INTO sessoes/, [{ affectedRows: 1 }]],
    ]);
    const res = await request(app).post("/api/login").send({ email: "a@b.com", senha: "senhaCorrecta123" });
    expect(res.status).toBe(200);
    const payload = jwt.decode(res.body.token);
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
    const insert = chamadas.find(c => /INSERT INTO sessoes/.test(c.sql));
    expect(insert.params[0]).toBe(payload.jti);
    expect(insert.params[1]).toBe(1);
  });

  it("um token com jti cuja sessão foi revogada é recusado", async () => {
    mockSql([[/FROM sessoes s JOIN usuarios u/, [[{ usuario_id: 1, revogada_em: new Date(), expira_em: new Date(Date.now() + 3600e3), papel: "estudante", curso: "Geral" }]]]]);
    const token = tokenDe(1, "estudante", { jwtid: crypto.randomUUID() });
    const res = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.erro).toMatch(/Sessão terminada/);
  });

  it("um token com jti cuja sessão está activa passa", async () => {
    mockSql([
      [/FROM sessoes s JOIN usuarios u/, [[{ usuario_id: 1, revogada_em: null, expira_em: new Date(Date.now() + 3600e3), papel: "estudante", curso: "Geral" }]]],
      [/FROM usuarios WHERE id/, [[{ id: 1, nome: "Ana", email: "a@b.com", papel: "estudante", curso: "Geral", avatar_url: null, email_verificado: 1 }]]],
    ]);
    const token = tokenDe(1, "estudante", { jwtid: crypto.randomUUID() });
    const res = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("DELETE /api/sessoes termina as outras sessões, nunca a actual", async () => {
    const jti = crypto.randomUUID();
    const chamadas = mockSql([
      [/FROM sessoes s JOIN usuarios u/, [[{ usuario_id: 1, revogada_em: null, expira_em: new Date(Date.now() + 3600e3), papel: "estudante", curso: "Geral" }]]],
      [/UPDATE sessoes SET revogada_em = NOW\(\) WHERE usuario_id = \? AND revogada_em IS NULL AND jti <> \?/, [{ affectedRows: 2 }]],
    ]);
    const res = await request(app).delete("/api/sessoes").set("Authorization", `Bearer ${tokenDe(1, "estudante", { jwtid: jti })}`);
    expect(res.status).toBe(200);
    expect(res.body.terminadas).toBe(2);
    const upd = chamadas.find(c => /jti <> \?/.test(c.sql));
    expect(upd.params).toEqual([1, jti]);
  });

  it("logout revoga a sessão do token", async () => {
    const jti = crypto.randomUUID();
    const chamadas = mockSql([[/UPDATE sessoes SET revogada_em/, [{ affectedRows: 1 }]]]);
    const res = await request(app).post("/api/logout").set("Cookie", `token=${tokenDe(1, "estudante", { jwtid: jti })}`);
    expect(res.status).toBe(200);
    expect(chamadas.some(c => /UPDATE sessoes SET revogada_em/.test(c.sql) && c.params[0] === jti)).toBe(true);
  });
});

describe("Códigos de recuperação 2FA", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("confirmar o 2FA devolve 10 códigos XXXX-XXXX e guarda-os como hash", async () => {
    const secret = totp.gerarSecret();
    const chamadas = mockSql([
      [/SELECT 2fa_secret_temp FROM usuarios/, [[{ "2fa_secret_temp": secret }]]],
      [/INSERT INTO codigos_recuperacao_2fa/, [{ affectedRows: 10 }]],
    ]);
    const res = await request(app).post("/api/2fa/confirmar").set("Authorization", `Bearer ${tokenDe(7)}`).send({ codigo: await generate({ secret }) });
    expect(res.status).toBe(200);
    expect(res.body.codigos_recuperacao).toHaveLength(10);
    for (const c of res.body.codigos_recuperacao) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const insert = chamadas.find(c => /INSERT INTO codigos_recuperacao_2fa/.test(c.sql));
    const hashEsperado = crypto.createHash("sha256").update(normalizar(res.body.codigos_recuperacao[0])).digest("hex");
    expect(insert.params[1]).toBe(hashEsperado);
    expect(insert.params).not.toContain(res.body.codigos_recuperacao[0]);
  });

  it("o segundo passo do login aceita um código de recuperação não usado (e consome-o)", async () => {
    const secret = totp.gerarSecret();
    const utilizador = { id: 9, email: "bea@teste.com", senha: HASH_SENHA_CORRECTA, papel: "estudante", nome: "Bea", curso: "Geral", email_verificado: 1, "2fa_ativado": 1, "2fa_secret": secret };
    const chamadas = mockSql([
      [/FROM usuarios WHERE email/, [[utilizador]]],
      [/SELECT \* FROM usuarios WHERE id/, [[utilizador]]],
      [/UPDATE codigos_recuperacao_2fa SET usado_em/, [{ affectedRows: 1 }]],
      [/COUNT\(\*\) AS total FROM codigos_recuperacao_2fa/, [[{ total: 9 }]]],
    ]);
    const login = await request(app).post("/api/login").send({ email: "bea@teste.com", senha: "senhaCorrecta123" });
    const res = await request(app).post("/api/login/2fa").send({ token_2fa: login.body.token_2fa, codigo_recuperacao: "abcd-efgh" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    const consumo = chamadas.find(c => /UPDATE codigos_recuperacao_2fa SET usado_em/.test(c.sql));
    expect(consumo.params[0]).toBe(9);
    expect(consumo.params[1]).toBe(crypto.createHash("sha256").update("ABCDEFGH").digest("hex"));
  });

  it("um código de recuperação já usado é recusado", async () => {
    const secret = totp.gerarSecret();
    const utilizador = { id: 9, email: "bea@teste.com", senha: HASH_SENHA_CORRECTA, papel: "estudante", nome: "Bea", curso: "Geral", email_verificado: 1, "2fa_ativado": 1, "2fa_secret": secret };
    mockSql([
      [/FROM usuarios WHERE email/, [[utilizador]]],
      [/SELECT \* FROM usuarios WHERE id/, [[utilizador]]],
      [/UPDATE codigos_recuperacao_2fa SET usado_em/, [{ affectedRows: 0 }]],
    ]);
    const login = await request(app).post("/api/login").send({ email: "bea@teste.com", senha: "senhaCorrecta123" });
    const res = await request(app).post("/api/login/2fa").send({ token_2fa: login.body.token_2fa, codigo_recuperacao: "ABCD-EFGH" });
    expect(res.status).toBe(400);
  });
});

describe("Eliminar a própria conta", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("exige a palavra-passe certa", async () => {
    mockSql([[/SELECT id, senha, papel, 2fa_ativado, 2fa_secret FROM usuarios/, [[{ id: 7, senha: HASH_SENHA_CORRECTA, papel: "estudante", "2fa_ativado": 0 }]]]]);
    const res = await request(app).delete("/api/perfil").set("Authorization", `Bearer ${tokenDe(7)}`).send({ senha: "errada" });
    expect(res.status).toBe(400);
  });

  it("o único administrador não se pode eliminar", async () => {
    mockSql([
      [/SELECT id, senha, papel, 2fa_ativado, 2fa_secret FROM usuarios/, [[{ id: 1, senha: HASH_SENHA_CORRECTA, papel: "admin", "2fa_ativado": 0 }]]],
      [/COUNT\(\*\) AS total FROM usuarios WHERE papel = 'admin'/, [[{ total: 1 }]]],
    ]);
    const res = await request(app).delete("/api/perfil").set("Authorization", `Bearer ${tokenDe(1, "admin")}`).send({ senha: "senhaCorrecta123" });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/único administrador/);
  });
});

describe("Perguntas e respostas", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("rejeita perguntas sem autenticação e com título curto", async () => {
    expect((await request(app).post("/api/perguntas").send({})).status).toBe(401);
    const res = await request(app).post("/api/perguntas").set("Authorization", `Bearer ${tokenDe(7)}`).send({ disciplina: "Geral", titulo: "oi", conteudo: "conteúdo suficiente aqui" });
    expect(res.status).toBe(400);
  });

  it("só quem perguntou pode aceitar uma resposta", async () => {
    mockSql([
      [/SELECT id, usuario_id, titulo, resposta_aceite_id FROM perguntas/, [[{ id: 3, usuario_id: 5, titulo: "T", resposta_aceite_id: null }]]],
    ]);
    const res = await request(app).put("/api/perguntas/3/aceitar/10").set("Authorization", `Bearer ${tokenDe(7)}`);
    expect(res.status).toBe(403);
  });

  it("quem perguntou aceita e quem respondeu é notificado", async () => {
    const chamadas = mockSql([
      [/SELECT id, usuario_id, titulo, resposta_aceite_id FROM perguntas/, [[{ id: 3, usuario_id: 7, titulo: "Como integrar?", resposta_aceite_id: null }]]],
      [/SELECT id, usuario_id FROM respostas WHERE id = \? AND pergunta_id/, [[{ id: 10, usuario_id: 8 }]]],
      [/UPDATE perguntas SET resolvida/, [{ affectedRows: 1 }]],
      [/INSERT INTO notificacoes/, [{ insertId: 1 }]],
    ]);
    const res = await request(app).put("/api/perguntas/3/aceitar/10").set("Authorization", `Bearer ${tokenDe(7)}`);
    expect(res.status).toBe(200);
    expect(res.body.resolvida).toBe(true);
    const notif = chamadas.find(c => /INSERT INTO notificacoes/.test(c.sql));
    expect(notif.params[0]).toBe(8);
    expect(notif.params[1]).toBe("resposta_aceite");
  });
});

describe("Calendário e denúncias — permissões", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("estudantes não criam eventos; docentes sim", async () => {
    const corpo = { disciplina: "Geral", titulo: "Teste 1", tipo: "teste", data_inicio: "2030-01-10T10:00:00Z" };
    expect((await request(app).post("/api/calendario").set("Authorization", `Bearer ${tokenDe(7)}`).send(corpo)).status).toBe(403);
    mockSql([
      [/SELECT id FROM cursos WHERE nome/, [[{ id: 1 }]]],
      [/INSERT INTO eventos_calendario/, [{ insertId: 4 }]],
    ]);
    const res = await request(app).post("/api/calendario").set("Authorization", `Bearer ${tokenDe(2, "professor")}`).send(corpo);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(4);
  });

  it("rejeita evento com fim antes do início", async () => {
    const res = await request(app).post("/api/calendario").set("Authorization", `Bearer ${tokenDe(2, "professor")}`)
      .send({ disciplina: "Geral", titulo: "Teste 1", tipo: "teste", data_inicio: "2030-01-10T10:00:00Z", data_fim: "2030-01-09T10:00:00Z" });
    expect(res.status).toBe(400);
  });

  it("uma denúncia repetida sobre o mesmo conteúdo devolve 409", async () => {
    mockSql([
      [/SELECT \* FROM `materiais` WHERE id/, [[{ id: 5, titulo: "Apontamentos" }]]],
      [/SELECT id FROM denuncias WHERE tipo/, [[{ id: 1 }]]],
    ]);
    const res = await request(app).post("/api/denuncias").set("Authorization", `Bearer ${tokenDe(7)}`).send({ tipo: "material", recurso_id: 5, motivo: "spam" });
    expect(res.status).toBe(409);
  });

  it("a fila de denúncias é só para admins", async () => {
    expect((await request(app).get("/api/admin/denuncias").set("Authorization", `Bearer ${tokenDe(7)}`)).status).toBe(403);
  });
});

describe("Favoritos e quiz", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("sincronizar favoritos só aceita materiais aprovados e devolve a lista final", async () => {
    mockSql([
      [/SELECT id FROM materiais WHERE status = 'aprovado' AND id IN/, [[{ id: 1 }, { id: 3 }]]],
      [/INSERT IGNORE INTO favoritos/, [{ affectedRows: 2 }]],
      [/SELECT material_id FROM favoritos/, [[{ material_id: 3 }, { material_id: 1 }]]],
    ]);
    const res = await request(app).post("/api/favoritos/sincronizar").set("Authorization", `Bearer ${tokenDe(7)}`).send({ ids: [1, 2, 3, "x"] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([3, 1]);
  });

  it("o quiz devolve as perguntas sem a resposta certa e corrige as submissões", async () => {
    const perguntas = [
      { pergunta: "2+2?", opcoes: ["3", "4", "5", "6"], correcta: 1, explicacao: "Aritmética." },
      { pergunta: "Capital de Moçambique?", opcoes: ["Beira", "Tete", "Maputo", "Nampula"], correcta: 2, explicacao: "Maputo." },
    ];
    mockSql([
      [/FROM configuracoes/, [[{ ia_activada: 1, nome_plataforma: "SmartHub" }]]],
      [/FROM materiais WHERE id = \? AND status = 'aprovado'/, [[{ id: 5, titulo: "T", cadeira: "Geral", tipo: "PDF", url_arquivo: "/uploads/x.pdf", texto_extraido: "x".repeat(500), texto_indexado_em: new Date() }]]],
      [/SELECT id, perguntas, modelo, gerado_em FROM quizzes/, [[{ id: 2, perguntas, modelo: "teste", gerado_em: new Date() }]]],
      [/MAX\(pontuacao\)/, [[{ pontuacao: null, total: null, tentativas: 0 }]]],
      [/INSERT INTO quiz_resultados/, [{ insertId: 1 }]],
    ]);
    const res = await request(app).get("/api/materiais/5/quiz").set("Authorization", `Bearer ${tokenDe(7)}`);
    expect(res.status).toBe(200);
    expect(res.body.perguntas).toHaveLength(2);
    expect(res.body.perguntas[0].correcta).toBeUndefined();
    expect(res.body.perguntas[0].explicacao).toBeUndefined();

    const corr = await request(app).post("/api/materiais/5/quiz/respostas").set("Authorization", `Bearer ${tokenDe(7)}`).send({ respostas: [1, 0] });
    expect(corr.status).toBe(200);
    expect(corr.body.pontuacao).toBe(1);
    expect(corr.body.total).toBe(2);
    expect(corr.body.detalhe[1].correcta).toBe(2);
    expect(corr.body.passou).toBe(false);
  });
});
