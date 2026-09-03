import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import Login from "./Login";

vi.mock("../services/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
import api from "../services/api";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const configFalso = {
  nome_plataforma: "SmartHub",
  tagline: "Aprenda · Partilhe · Cresça",
  descricao_proposito: "",
  logo_url: null,
  contacto_email: "",
  localizacao: "",
  link_facebook: "",
  link_instagram: "",
  link_linkedin: "",
  chat_activado: true,
  ia_activada: true,
};
const cursosFalsos = [{ id: 1, nome: "Informática" }, { id: 2, nome: "Gestão" }];

vi.mock("../context/ConfigContext", () => ({
  useConfig: () => ({ config: configFalso, cursos: cursosFalsos }),
}));

describe("Login", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
    // /stats/publicas é pedido ao montar, independentemente do teste — sem
    // isto, cada teste tinha de o mockar mesmo quando não lhe interessa.
    api.get.mockResolvedValue({ data: null });
  });

  afterEach(() => cleanup());

  it("mostra o formulário de entrada por defeito", () => {
    render(<Login onLogin={vi.fn()} />);
    expect(screen.getByPlaceholderText("Email institucional")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Palavra-passe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Entrar no SmartHub/i })).toBeInTheDocument();
  });

  it("faz login com sucesso: chama a API, onLogin e navega para o painel", async () => {
    const onLogin = vi.fn();
    api.post.mockResolvedValue({ data: { utilizador: { id: 1, nome: "Ana", papel: "estudante" } } });
    render(<Login onLogin={onLogin} />);

    fireEvent.change(screen.getByPlaceholderText("Email institucional"), { target: { value: "ana@ucm.ac.mz" } });
    fireEvent.change(screen.getByPlaceholderText("Palavra-passe"), { target: { value: "senhaCorrecta123" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar no SmartHub/i }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith({ id: 1, nome: "Ana", papel: "estudante" }));
    expect(api.post).toHaveBeenCalledWith("/login", { email: "ana@ucm.ac.mz", senha: "senhaCorrecta123" });
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("mostra a mensagem de erro do servidor quando o login falha", async () => {
    api.post.mockRejectedValue({ response: { data: { erro: "Email ou senha incorretos." } } });
    render(<Login onLogin={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Email institucional"), { target: { value: "ana@ucm.ac.mz" } });
    fireEvent.change(screen.getByPlaceholderText("Palavra-passe"), { target: { value: "errada" } });
    fireEvent.click(screen.getByRole("button", { name: /Entrar no SmartHub/i }));

    expect(await screen.findByText("Email ou senha incorretos.")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("alterna para o formulário de registo", () => {
    render(<Login onLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Criar conta gratuita/i }));
    expect(screen.getByPlaceholderText("Nome completo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Criar Conta$/i })).toBeInTheDocument();
  });

  it("regista uma nova conta com sucesso e volta ao formulário de entrada", async () => {
    api.post.mockResolvedValue({});
    render(<Login onLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Criar conta gratuita/i }));

    fireEvent.change(screen.getByPlaceholderText("Nome completo"), { target: { value: "Bruno Silva" } });
    fireEvent.change(screen.getByPlaceholderText("Email institucional"), { target: { value: "bruno@ucm.ac.mz" } });
    fireEvent.change(screen.getByPlaceholderText("Palavra-passe"), { target: { value: "senhaForte123" } });
    fireEvent.click(screen.getByRole("button", { name: /^Criar Conta$/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/register", {
      nome: "Bruno Silva", email: "bruno@ucm.ac.mz", senha: "senhaForte123",
      curso: "Informática", numero_estudante: "", telefone: "",
    }));
    // Sucesso devolve ao ecrã de entrada, não deixa a conta recém-criada num formulário órfão.
    expect(await screen.findByText(/Conta criada/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Entrar no SmartHub/i })).toBeInTheDocument();
  });

  it("pede recuperação de palavra-passe", async () => {
    api.post.mockResolvedValue({});
    render(<Login onLogin={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Esqueceu a senha/i }));

    const campoEmail = screen.getByPlaceholderText("Email institucional");
    fireEvent.change(campoEmail, { target: { value: "ana@ucm.ac.mz" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar link de recuperação/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/esqueci-senha", { email: "ana@ucm.ac.mz" }));
    expect(await screen.findByText(/Se esse email existir/i)).toBeInTheDocument();
  });
});
