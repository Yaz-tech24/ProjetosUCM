import { describe, it, expect } from "vitest";

// Estes testes só exercitam os schemas zod exportados (funções puras, sem
// tocar na BD) — importar server.js liga-se de facto à BD real configurada em
// .env (só uma ligação de teste em config/db.js, sem correr queries), o que é
// inofensivo aqui.
const {
  schemaRegisto, schemaLogin, schemaMaterial, schemaConfig, schemaCurso,
  schemaPerfilNome, schemaPerfilSenha, schemaEsqueciSenha, schemaReporSenha,
} = require("../server");

describe("schemaRegisto", () => {
  it("aceita dados válidos e normaliza (trim/lowercase)", () => {
    const r = schemaRegisto.safeParse({
      nome: "  Ana  ", email: " Ana@Teste.COM ", senha: "123456", papel: "estudante", curso: "Geral",
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ nome: "Ana", email: "ana@teste.com", senha: "123456", papel: "estudante", curso: "Geral" });
  });

  it("rejeita email inválido", () => {
    const r = schemaRegisto.safeParse({ nome: "Ana", email: "nao-e-email", senha: "123456", curso: "Geral" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toMatch(/email/i);
  });

  it("rejeita password com menos de 6 caracteres", () => {
    const r = schemaRegisto.safeParse({ nome: "Ana", email: "a@b.com", senha: "123", curso: "Geral" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toMatch(/6 caracteres/);
  });

  it("rejeita nome vazio", () => {
    const r = schemaRegisto.safeParse({ nome: "   ", email: "a@b.com", senha: "123456", curso: "Geral" });
    expect(r.success).toBe(false);
  });

  it("papel inválido cai para 'estudante' em vez de rejeitar", () => {
    const r = schemaRegisto.safeParse({ nome: "Ana", email: "a@b.com", senha: "123456", papel: "hacker", curso: "Geral" });
    expect(r.success).toBe(true);
    expect(r.data.papel).toBe("estudante");
  });
});

describe("schemaLogin", () => {
  it("normaliza email e exige palavra-passe não vazia", () => {
    expect(schemaLogin.safeParse({ email: " A@B.com ", senha: "x" }).data.email).toBe("a@b.com");
    expect(schemaLogin.safeParse({ email: "a@b.com", senha: "" }).success).toBe(false);
  });
});

describe("schemaMaterial", () => {
  it("exige título, cadeira e tipo válido", () => {
    expect(schemaMaterial.safeParse({ titulo: "T", cadeira: "Geral", tipo: "PDF" }).success).toBe(true);
    expect(schemaMaterial.safeParse({ titulo: "", cadeira: "Geral", tipo: "PDF" }).success).toBe(false);
    expect(schemaMaterial.safeParse({ titulo: "T", cadeira: "Geral", tipo: "EXE" }).success).toBe(false);
  });
});

describe("schemaConfig", () => {
  const base = {
    nome_plataforma: "SmartHub", tagline: "", descricao_proposito: "",
    cor_primaria: "#04122e", cor_destaque: "#ffd700",
    contacto_email: "", localizacao: "",
    chat_activado: true, ia_activada: true, moderacao_ia_activada: true,
    tipos_ficheiro_permitidos: ["pdf"], tamanho_maximo_mb: 100,
  };

  it("aceita configuração válida", () => {
    expect(schemaConfig.safeParse(base).success).toBe(true);
  });

  it("rejeita cores fora do formato #rrggbb", () => {
    expect(schemaConfig.safeParse({ ...base, cor_primaria: "azul" }).success).toBe(false);
  });

  it("rejeita lista de tipos de ficheiro vazia", () => {
    expect(schemaConfig.safeParse({ ...base, tipos_ficheiro_permitidos: [] }).success).toBe(false);
  });

  it("rejeita tipo de ficheiro fora do conjunto seguro conhecido", () => {
    expect(schemaConfig.safeParse({ ...base, tipos_ficheiro_permitidos: ["exe"] }).success).toBe(false);
  });

  it("limita o tamanho máximo ao tecto técnico", () => {
    expect(schemaConfig.safeParse({ ...base, tamanho_maximo_mb: 99999 }).success).toBe(false);
  });
});

describe("schemaCurso / schemaPerfilNome", () => {
  it("exigem nome não vazio", () => {
    expect(schemaCurso.safeParse({ nome: "Informática" }).success).toBe(true);
    expect(schemaCurso.safeParse({ nome: "" }).success).toBe(false);
    expect(schemaPerfilNome.safeParse({ nome: "" }).success).toBe(false);
  });
});

describe("schemaPerfilSenha", () => {
  it("exige senha actual e nova senha com pelo menos 6 caracteres", () => {
    expect(schemaPerfilSenha.safeParse({ senha_actual: "x", nova_senha: "123456" }).success).toBe(true);
    expect(schemaPerfilSenha.safeParse({ senha_actual: "", nova_senha: "123456" }).success).toBe(false);
    expect(schemaPerfilSenha.safeParse({ senha_actual: "x", nova_senha: "123" }).success).toBe(false);
  });
});

describe("schemaEsqueciSenha / schemaReporSenha", () => {
  it("normalizam e validam", () => {
    expect(schemaEsqueciSenha.safeParse({ email: " A@B.com " }).data.email).toBe("a@b.com");
    expect(schemaReporSenha.safeParse({ token: "abc", novaSenha: "123456" }).success).toBe(true);
    expect(schemaReporSenha.safeParse({ token: "", novaSenha: "123456" }).success).toBe(false);
  });
});
