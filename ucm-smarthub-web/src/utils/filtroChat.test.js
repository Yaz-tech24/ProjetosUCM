import { describe, it, expect } from "vitest";
import { analisarMensagem, mensagemAviso } from "./filtroChat";

describe("analisarMensagem", () => {
  it("permite mensagens normais", () => {
    expect(analisarMensagem("Bom dia, alguém tem os apontamentos de hoje?")).toEqual({ bloqueada: false, motivo: null });
  });

  it("permite mensagem vazia ou só espaços", () => {
    expect(analisarMensagem("")).toEqual({ bloqueada: false, motivo: null });
    expect(analisarMensagem("   ")).toEqual({ bloqueada: false, motivo: null });
  });

  it("não sinaliza falsos positivos — 'computador', 'deputado', 'disputa'", () => {
    expect(analisarMensagem("O meu computador não liga.").bloqueada).toBe(false);
    expect(analisarMensagem("O deputado falou sobre o orçamento.").bloqueada).toBe(false);
    expect(analisarMensagem("Houve uma disputa sobre as notas.").bloqueada).toBe(false);
  });

  it("bloqueia palavrões directos", () => {
    const r = analisarMensagem("isto é uma merda");
    expect(r).toEqual({ bloqueada: true, motivo: "palavrao" });
  });

  it("bloqueia variações leetspeak", () => {
    expect(analisarMensagem("m3rd4").bloqueada).toBe(true);
    expect(analisarMensagem("p0rr4").bloqueada).toBe(true);
  });

  it("bloqueia caracteres repetidos usados para evadir o filtro", () => {
    expect(analisarMensagem("meerdaaa").bloqueada).toBe(true);
  });

  it("bloqueia flood de caracteres repetidos", () => {
    const r = analisarMensagem("aaaaaaaaaaaaaaaa");
    expect(r).toEqual({ bloqueada: true, motivo: "flood" });
  });

  it("bloqueia CAPS LOCK excessivo em mensagens longas", () => {
    const r = analisarMensagem("PORQUE ESTAO TODOS EM SILENCIO AGORA");
    expect(r).toEqual({ bloqueada: true, motivo: "caps" });
  });

  it("não bloqueia CAPS LOCK em mensagens curtas", () => {
    expect(analisarMensagem("OK").bloqueada).toBe(false);
  });
});

describe("mensagemAviso", () => {
  it("devolve uma mensagem específica para cada motivo", () => {
    expect(mensagemAviso("palavrao")).toMatch(/linguagem inapropriada/);
    expect(mensagemAviso("flood")).toMatch(/repetição excessiva/);
    expect(mensagemAviso("caps")).toMatch(/CAPS LOCK/);
    expect(mensagemAviso("outro")).toMatch(/não permitida/);
  });
});
