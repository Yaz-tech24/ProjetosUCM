import { describe, it, expect } from "vitest";

// Estes testes só exercitam os schemas zod exportados (funções puras) —
// importam directamente de schemas/, sem tocar em server.js nem na BD.
const {
  schemaRegisto, schemaUtilizadorAdmin, schemaLogin, schemaMaterial, schemaConfig, schemaCurso,
  schemaPerfilDados, schemaPerfilSenha, schemaEsqueciSenha, schemaReporSenha,
  emailComDominioPermitido,
} = require("../schemas");

describe("schemaRegisto", () => {
  it("aceita dados válidos e normaliza (trim/lowercase) — sem campo papel: registo público é sempre estudante", () => {
    const r = schemaRegisto.safeParse({
      nome: "  Ana  ", email: " Ana@Teste.COM ", senha: "senha1234", curso: "Geral",
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ nome: "Ana", email: "ana@teste.com", senha: "senha1234", curso: "Geral", numero_estudante: "", telefone: "" });
  });

  it("ignora um campo 'papel' enviado pelo cliente (não pode ser forçado via API)", () => {
    const r = schemaRegisto.safeParse({ nome: "Ana", email: "a@b.com", senha: "senha1234", curso: "Geral", papel: "admin" });
    expect(r.success).toBe(true);
    expect(r.data.papel).toBeUndefined();
  });

  it("rejeita email inválido", () => {
    const r = schemaRegisto.safeParse({ nome: "Ana", email: "nao-e-email", senha: "senha1234", curso: "Geral" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toMatch(/email/i);
  });

  it("rejeita password com menos de 8 caracteres", () => {
    const r = schemaRegisto.safeParse({ nome: "Ana", email: "a@b.com", senha: "abc123", curso: "Geral" });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toMatch(/8 caracteres/);
  });

  it("rejeita password só com números ou só com letras", () => {
    expect(schemaRegisto.safeParse({ nome: "Ana", email: "a@b.com", senha: "12345678", curso: "Geral" }).success).toBe(false);
    expect(schemaRegisto.safeParse({ nome: "Ana", email: "a@b.com", senha: "apenasletras", curso: "Geral" }).success).toBe(false);
  });

  it("rejeita nome vazio", () => {
    const r = schemaRegisto.safeParse({ nome: "   ", email: "a@b.com", senha: "senha1234", curso: "Geral" });
    expect(r.success).toBe(false);
  });
});

describe("schemaUtilizadorAdmin", () => {
  it("aceita papel professor/admin — só disponível na criação pelo admin", () => {
    const base = { nome: "Prof. Ana", email: "prof@teste.com", senha: "senha1234", curso: "Geral" };
    expect(schemaUtilizadorAdmin.safeParse({ ...base, papel: "professor" }).data.papel).toBe("professor");
    expect(schemaUtilizadorAdmin.safeParse({ ...base, papel: "admin" }).data.papel).toBe("admin");
  });

  it("papel inválido cai para 'professor' em vez de rejeitar", () => {
    const r = schemaUtilizadorAdmin.safeParse({ nome: "Ana", email: "a@b.com", senha: "senha1234", curso: "Geral", papel: "hacker" });
    expect(r.success).toBe(true);
    expect(r.data.papel).toBe("professor");
  });
});

describe("emailComDominioPermitido", () => {
  it("sem restrição configurada, aceita qualquer domínio", () => {
    expect(emailComDominioPermitido("a@qualquercoisa.com", "")).toBe(true);
    expect(emailComDominioPermitido("a@qualquercoisa.com", null)).toBe(true);
  });

  it("com restrição, só aceita os domínios listados (case-insensitive)", () => {
    expect(emailComDominioPermitido("a@gmail.com", "gmail.com")).toBe(true);
    expect(emailComDominioPermitido("a@GMAIL.com", "gmail.com")).toBe(true);
    expect(emailComDominioPermitido("a@hotmail.com", "gmail.com")).toBe(false);
    expect(emailComDominioPermitido("a@ucm.ac.mz", "gmail.com, ucm.ac.mz")).toBe(true);
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
    link_facebook: "", link_instagram: "", link_linkedin: "",
    dominios_email_permitidos: "",
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

describe("schemaCurso / schemaPerfilDados", () => {
  it("exigem nome não vazio", () => {
    expect(schemaCurso.safeParse({ nome: "Informática" }).success).toBe(true);
    expect(schemaCurso.safeParse({ nome: "" }).success).toBe(false);
    expect(schemaPerfilDados.safeParse({ nome: "" }).success).toBe(false);
  });

  it("numero_estudante e telefone são opcionais, sem bloquear por dados inválidos", () => {
    expect(schemaPerfilDados.safeParse({ nome: "Ana" }).success).toBe(true);
    const r = schemaPerfilDados.safeParse({ nome: "Ana", numero_estudante: "12345", telefone: "+258 84 000 0000" });
    expect(r.success).toBe(true);
    expect(r.data.numero_estudante).toBe("12345");
  });
});

describe("schemaPerfilSenha", () => {
  it("exige senha actual e nova senha forte (8+ caracteres, letra e número)", () => {
    expect(schemaPerfilSenha.safeParse({ senha_actual: "x", nova_senha: "senha1234" }).success).toBe(true);
    expect(schemaPerfilSenha.safeParse({ senha_actual: "", nova_senha: "senha1234" }).success).toBe(false);
    expect(schemaPerfilSenha.safeParse({ senha_actual: "x", nova_senha: "abc123" }).success).toBe(false);
    expect(schemaPerfilSenha.safeParse({ senha_actual: "x", nova_senha: "12345678" }).success).toBe(false);
  });
});

describe("schemaEsqueciSenha / schemaReporSenha", () => {
  it("normalizam e validam", () => {
    expect(schemaEsqueciSenha.safeParse({ email: " A@B.com " }).data.email).toBe("a@b.com");
    expect(schemaReporSenha.safeParse({ token: "abc", novaSenha: "senha1234" }).success).toBe(true);
    expect(schemaReporSenha.safeParse({ token: "", novaSenha: "senha1234" }).success).toBe(false);
    expect(schemaReporSenha.safeParse({ token: "abc", novaSenha: "12345678" }).success).toBe(false);
  });
});
