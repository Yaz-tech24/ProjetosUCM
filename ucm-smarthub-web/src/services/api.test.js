import { describe, it, expect, beforeEach, afterEach } from "vitest";
import api, { getFavoritos, isFavorito, toggleFavorito } from "./api";

const FAVORITOS_KEY = "ucm_favoritos";

describe("favoritos (localStorage)", () => {
  beforeEach(() => localStorage.clear());

  it("getFavoritos devolve [] quando não há nada guardado", () => {
    expect(getFavoritos()).toEqual([]);
  });

  it("getFavoritos devolve [] em vez de rebentar com JSON inválido", () => {
    localStorage.setItem(FAVORITOS_KEY, "{isto não é json válido");
    expect(getFavoritos()).toEqual([]);
  });

  it("getFavoritos lê e devolve os ids guardados", () => {
    localStorage.setItem(FAVORITOS_KEY, JSON.stringify([1, 2, 3]));
    expect(getFavoritos()).toEqual([1, 2, 3]);
  });

  it("isFavorito reconhece um id guardado, incluindo quando vem como string", () => {
    localStorage.setItem(FAVORITOS_KEY, JSON.stringify([5]));
    expect(isFavorito(5)).toBe(true);
    expect(isFavorito("5")).toBe(true);
    expect(isFavorito(6)).toBe(false);
  });

  it("toggleFavorito adiciona um id que ainda não está guardado", () => {
    const resultado = toggleFavorito(7);
    expect(resultado).toBe(true);
    expect(getFavoritos()).toEqual([7]);
  });

  it("toggleFavorito remove um id já guardado", () => {
    localStorage.setItem(FAVORITOS_KEY, JSON.stringify([7, 8]));
    const resultado = toggleFavorito(7);
    expect(resultado).toBe(false);
    expect(getFavoritos()).toEqual([8]);
  });

  it("toggleFavorito normaliza o id para número antes de guardar", () => {
    toggleFavorito("9");
    expect(getFavoritos()).toEqual([9]);
  });
});

describe("interceptor de resposta (sessão expirada)", () => {
  // Acede directamente ao handler "rejected" registado em api.js — testa a
  // lógica do interceptor isoladamente, sem depender de uma ligação de rede
  // real ou de uma biblioteca de mocking de HTTP.
  const rejectedHandler = api.interceptors.response.handlers[0].rejected;

  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("usuarioLogado", JSON.stringify({ id: 1, nome: "Ana" }));
    delete window.location;
    window.location = { ...originalLocation, href: "", pathname: "/dashboard" };
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it("limpa a sessão local e redirecciona para '/' quando o servidor devolve 401", async () => {
    await expect(rejectedHandler({ response: { status: 401 } })).rejects.toBeTruthy();
    expect(localStorage.getItem("usuarioLogado")).toBeNull();
    expect(window.location.href).toBe("/");
  });

  it("não redirecciona de novo quando já está na página de entrada", async () => {
    window.location.pathname = "/";
    await expect(rejectedHandler({ response: { status: 401 } })).rejects.toBeTruthy();
    expect(localStorage.getItem("usuarioLogado")).toBeNull();
    expect(window.location.href).toBe(""); // inalterado — evita um ciclo de redirecionamentos
  });

  it("mantém a sessão local para outros códigos de erro (ex: 500)", async () => {
    await expect(rejectedHandler({ response: { status: 500 } })).rejects.toBeTruthy();
    expect(localStorage.getItem("usuarioLogado")).not.toBeNull();
    expect(window.location.href).toBe("");
  });

  it("propaga sempre o erro original, para o código chamador conseguir reagir", async () => {
    const erroOriginal = { response: { status: 400, data: { erro: "Pedido inválido." } } };
    await expect(rejectedHandler(erroOriginal)).rejects.toBe(erroOriginal);
  });
});
