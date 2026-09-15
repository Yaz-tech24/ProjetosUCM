import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { generate } from "otplib";

const db = require("../config/db");
const { app } = require("../server");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");
const totp = require("../services/totp");

// Hash de "senhaCorrecta123" — ver rotas-auth.test.js
const HASH_SENHA_CORRECTA = "$2b$10$TTgW.kQFQKp/341.DF1ReeprUkD.AD6zaZFwOVv.GzegkEqrG/UqC";

const tokenDe = (id) => jwt.sign({ id, papel: "estudante", nome: "Teste", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h" });
const codigoValido = (secret) => generate({ secret });

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

describe("Activação de 2FA", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("gerar-secret devolve secret base32, URL otpauth e QR code", async () => {
    mockSql([
      [/SELECT email, 2fa_ativado FROM usuarios/, [[{ email: "ana@teste.com", "2fa_ativado": 0 }]]],
      [/UPDATE usuarios SET 2fa_secret_temp/, [{ affectedRows: 1 }]],
      [/FROM configuracoes/, [[{ nome_plataforma: "SmartHub" }]]],
    ]);
    const res = await request(app).post("/api/2fa/gerar-secret").set("Authorization", `Bearer ${tokenDe(7)}`);
    expect(res.status).toBe(200);
    expect(res.body.secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(res.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/SmartHub:ana%40teste\.com\?/);
    expect(res.body.qrCode).toMatch(/^data:image\/png;base64,/);
  });

  it("recusa gerar um novo secret quando o 2FA já está activo", async () => {
    mockSql([[/SELECT email, 2fa_ativado FROM usuarios/, [[{ email: "ana@teste.com", "2fa_ativado": 1 }]]]]);
    const res = await request(app).post("/api/2fa/gerar-secret").set("Authorization", `Bearer ${tokenDe(7)}`);
    expect(res.status).toBe(400);
  });

  it("confirmar rejeita um código errado (não aceita qualquer sequência de 6 dígitos)", async () => {
    const secret = totp.gerarSecret();
    const chamadas = mockSql([[/SELECT 2fa_secret_temp FROM usuarios/, [[{ "2fa_secret_temp": secret }]]]]);
    const errado = String((parseInt(await codigoValido(secret), 10) + 1) % 1000000).padStart(6, "0");
    const res = await request(app).post("/api/2fa/confirmar")
      .set("Authorization", `Bearer ${tokenDe(7)}`)
      .send({ codigo: errado });
    expect(res.status).toBe(400);
    expect(chamadas.some(c => /UPDATE usuarios SET 2fa_ativado = 1/.test(c.sql))).toBe(false);
  });

  it("confirmar activa o 2FA com um código válido da app", async () => {
    const secret = totp.gerarSecret();
    const chamadas = mockSql([
      [/SELECT 2fa_secret_temp FROM usuarios/, [[{ "2fa_secret_temp": secret }]]],
      [/UPDATE usuarios SET 2fa_ativado = 1/, [{ affectedRows: 1 }]],
    ]);
    const res = await request(app).post("/api/2fa/confirmar")
      .set("Authorization", `Bearer ${tokenDe(7)}`)
      .send({ codigo: await codigoValido(secret) });
    expect(res.status).toBe(200);
    expect(chamadas.some(c => /UPDATE usuarios SET 2fa_ativado = 1/.test(c.sql))).toBe(true);
  });
});

describe("Login com 2FA activo", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  const utilizador2FA = (secret) => ({
    id: 9, email: "bea@teste.com", senha: HASH_SENHA_CORRECTA, papel: "estudante", nome: "Bea", curso: "Geral",
    avatar_url: null, email_verificado: 1, "2fa_ativado": 1, "2fa_secret": secret,
  });

  it("com a palavra-passe certa devolve requer_2fa e NÃO cria sessão", async () => {
    mockSql([[/FROM usuarios WHERE email/, [[utilizador2FA(totp.gerarSecret())]]]]);
    const res = await request(app).post("/api/login").send({ email: "bea@teste.com", senha: "senhaCorrecta123" });
    expect(res.status).toBe(200);
    expect(res.body.requer_2fa).toBe(true);
    expect(res.body.token_2fa).toBeTruthy();
    expect(res.body.token).toBeUndefined();
    expect((res.headers["set-cookie"] || []).some(c => c.startsWith("token="))).toBe(false);
  });

  it("o token intermédio é recusado como sessão, mesmo que o utilizador exista (anti-bypass)", async () => {
    const secret = totp.gerarSecret();
    mockSql([
      [/FROM usuarios WHERE email/, [[utilizador2FA(secret)]]],
      [/FROM usuarios WHERE id/, [[utilizador2FA(secret)]]],
    ]);
    const login = await request(app).post("/api/login").send({ email: "bea@teste.com", senha: "senhaCorrecta123" });
    const res = await request(app).get("/api/me").set("Authorization", `Bearer ${login.body.token_2fa}`);
    expect(res.status).toBe(401);
    const viaCookie = await request(app).get("/api/me").set("Cookie", `token=${login.body.token_2fa}`);
    expect(viaCookie.status).toBe(401);
  });

  it("segundo passo com código válido emite a sessão", async () => {
    const secret = totp.gerarSecret();
    mockSql([
      [/FROM usuarios WHERE email/, [[utilizador2FA(secret)]]],
      [/SELECT \* FROM usuarios WHERE id/, [[utilizador2FA(secret)]]],
    ]);
    const login = await request(app).post("/api/login").send({ email: "bea@teste.com", senha: "senhaCorrecta123" });
    const res = await request(app).post("/api/login/2fa").send({ token_2fa: login.body.token_2fa, codigo: await codigoValido(secret) });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.utilizador.email).toBe("bea@teste.com");
    expect((res.headers["set-cookie"] || []).some(c => c.startsWith("token=") && /HttpOnly/i.test(c))).toBe(true);
  });

  it("segundo passo com código errado é recusado", async () => {
    const secret = totp.gerarSecret();
    mockSql([
      [/FROM usuarios WHERE email/, [[utilizador2FA(secret)]]],
      [/SELECT \* FROM usuarios WHERE id/, [[utilizador2FA(secret)]]],
    ]);
    const login = await request(app).post("/api/login").send({ email: "bea@teste.com", senha: "senhaCorrecta123" });
    const errado = String((parseInt(await codigoValido(secret), 10) + 1) % 1000000).padStart(6, "0");
    const res = await request(app).post("/api/login/2fa").send({ token_2fa: login.body.token_2fa, codigo: errado });
    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  it("segundo passo recusa um JWT de sessão normal no lugar do token intermédio", async () => {
    const secret = totp.gerarSecret();
    mockSql([[/SELECT \* FROM usuarios WHERE id/, [[utilizador2FA(secret)]]]]);
    const res = await request(app).post("/api/login/2fa").send({ token_2fa: tokenDe(9), codigo: await codigoValido(secret) });
    expect(res.status).toBe(401);
  });
});
