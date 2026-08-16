import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { ConfigProvider, useConfig } from "./ConfigContext";

vi.mock("../services/api", () => ({
  default: { get: vi.fn() },
}));

import api from "../services/api";

const Sonda = () => {
  const { config, cursos, loading } = useConfig();
  return (
    <div>
      <span data-testid="nome">{config.nome_plataforma}</span>
      <span data-testid="cor">{config.cor_primaria}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="cursos">{cursos.length}</span>
    </div>
  );
};

describe("ConfigContext", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("usa os valores por defeito antes da API responder", () => {
    api.get.mockReturnValue(new Promise(() => {})); // nunca resolve — fica em loading
    render(<ConfigProvider><Sonda /></ConfigProvider>);
    expect(screen.getByTestId("nome").textContent).toBe("SmartHub");
    expect(screen.getByTestId("cor").textContent).toBe("#04122e");
    expect(screen.getByTestId("loading").textContent).toBe("true");
  });

  it("actualiza o config com a resposta da API e marca loading como concluído", async () => {
    api.get.mockResolvedValue({
      data: {
        configuracoes: { nome_plataforma: "Universidade X", cor_primaria: "#123456" },
        cursos: [{ id: 1, nome: "Informática" }, { id: 2, nome: "Gestão" }],
      },
    });
    render(<ConfigProvider><Sonda /></ConfigProvider>);

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("nome").textContent).toBe("Universidade X");
    expect(screen.getByTestId("cor").textContent).toBe("#123456");
    expect(screen.getByTestId("cursos").textContent).toBe("2");
  });

  it("mantém os valores por defeito se a API falhar", async () => {
    api.get.mockRejectedValue(new Error("network down"));
    render(<ConfigProvider><Sonda /></ConfigProvider>);

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("nome").textContent).toBe("SmartHub");
    expect(screen.getByTestId("cursos").textContent).toBe("0");
  });
});
