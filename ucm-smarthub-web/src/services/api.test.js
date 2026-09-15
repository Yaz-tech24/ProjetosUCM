import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import api from "./api";
import { obterFavoritos, alternarFavorito, limparCacheFavoritos, subscreverFavoritos } from "./favoritos";

const FAVORITOS_KEY = "ucm_favoritos";

// Os favoritos vivem no servidor; o que a app guardava em localStorage é
// enviado uma única vez para ser juntado. Estes testes substituem o axios
// por mocks — não há rede.
describe("favoritos (servidor)", () => {
  beforeEach(() => {
    localStorage.clear();
    limparCacheFavoritos();
    vi.restoreAllMocks();
  });

  it("sem favoritos locais pede a lista ao servidor", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [3, 1] });
    const post = vi.spyOn(api, "post");
    expect(await obterFavoritos()).toEqual([3, 1]);
    expect(get).toHaveBeenCalledWith("/favoritos");
    expect(post).not.toHaveBeenCalled();
  });

  it("migra os favoritos antigos do localStorage uma única vez e esquece-os", async () => {
    localStorage.setItem(FAVORITOS_KEY, JSON.stringify([1, 2]));
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: [1, 2, 5] });
    expect(await obterFavoritos()).toEqual([1, 2, 5]);
    expect(post).toHaveBeenCalledWith("/favoritos/sincronizar", { ids: [1, 2] });
    expect(localStorage.getItem(FAVORITOS_KEY)).toBeNull();
  });

  it("não rebenta com JSON inválido no localStorage", async () => {
    localStorage.setItem(FAVORITOS_KEY, "{isto não é json válido");
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    expect(await obterFavoritos()).toEqual([]);
  });

  it("sem servidor usa os favoritos locais para não ficar em branco", async () => {
    localStorage.setItem(FAVORITOS_KEY, JSON.stringify([4]));
    vi.spyOn(api, "post").mockRejectedValue(new Error("offline"));
    expect(await obterFavoritos()).toEqual([4]);
  });

  it("alternar adiciona (PUT) e remove (DELETE), normalizando o id para número", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    const put = vi.spyOn(api, "put").mockResolvedValue({ data: { favorito: true } });
    const del = vi.spyOn(api, "delete").mockResolvedValue({ data: { favorito: false } });
    expect(await alternarFavorito("7")).toBe(true);
    expect(put).toHaveBeenCalledWith("/favoritos/7");
    expect(await obterFavoritos()).toEqual([7]);
    expect(await alternarFavorito(7)).toBe(false);
    expect(del).toHaveBeenCalledWith("/favoritos/7");
    expect(await obterFavoritos()).toEqual([]);
  });

  it("volta atrás na actualização optimista se o servidor recusar", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    vi.spyOn(api, "put").mockRejectedValue(new Error("500"));
    const ouvinte = vi.fn();
    subscreverFavoritos(ouvinte);
    await expect(alternarFavorito(9)).rejects.toThrow();
    expect(await obterFavoritos()).toEqual([]);
    // avisou ao adicionar (optimista) e ao reverter
    expect(ouvinte).toHaveBeenCalledTimes(2);
    expect(ouvinte).toHaveBeenLastCalledWith([]);
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
