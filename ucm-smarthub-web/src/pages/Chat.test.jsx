import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent, act } from "@testing-library/react";
import Chat from "./Chat";

vi.mock("../services/api", () => ({
  default: { get: vi.fn(), delete: vi.fn() },
}));
import api from "../services/api";

/* Socket falso: guarda os handlers registados via .on() para os testes
   conseguirem simular eventos recebidos do servidor com socket._trigger(). */
function criarSocketFalso() {
  const handlers = {};
  return {
    on: vi.fn((evento, cb) => { (handlers[evento] ||= []).push(cb); }),
    off: vi.fn((evento, cb) => { handlers[evento] = (handlers[evento] || []).filter(h => h !== cb); }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    _trigger: (evento, payload) => { (handlers[evento] || []).forEach(h => h(payload)); },
  };
}

let socketFalso;
vi.mock("socket.io-client", () => ({
  default: vi.fn(() => socketFalso),
}));

const configFalso = { chat_activado: true };
const cursosFalsos = [{ id: 1, nome: "Geral" }, { id: 2, nome: "Informática" }];
vi.mock("../context/ConfigContext", () => ({
  useConfig: () => ({ config: configFalso, cursos: cursosFalsos }),
}));

const utilizadorEstudante = { id: 1, nome: "Ana", papel: "estudante", curso: "Informática" };
const utilizadorAdmin     = { id: 9, nome: "Admin", papel: "admin", curso: "Informática" };

describe("Chat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    socketFalso = criarSocketFalso();
    api.get.mockResolvedValue({ data: [] });
    api.delete.mockResolvedValue({});
  });

  afterEach(() => cleanup());

  it("mostra o aviso de chat desactivado em vez da sala, quando o admin o desliga", () => {
    configFalso.chat_activado = false;
    render(<Chat usuarioLogado={utilizadorEstudante} />);
    expect(screen.getByText("Chat desactivado")).toBeInTheDocument();
    configFalso.chat_activado = true; // repõe para os restantes testes
  });

  it("entra automaticamente na sala do curso do próprio utilizador", async () => {
    render(<Chat usuarioLogado={utilizadorEstudante} />);
    await waitFor(() => expect(socketFalso.emit).toHaveBeenCalledWith("joinRoom", { curso: "Informática" }));
  });

  it("cai na primeira sala disponível quando o curso do utilizador não tem sala própria", async () => {
    render(<Chat usuarioLogado={{ ...utilizadorEstudante, curso: "Curso Sem Sala" }} />);
    await waitFor(() => expect(socketFalso.emit).toHaveBeenCalledWith("joinRoom", { curso: "Geral" }));
  });

  it("carrega e mostra o histórico de mensagens da sala", async () => {
    api.get.mockResolvedValue({
      data: [{ id: 1, message: "Olá turma!", userId: 2, userName: "Bruno", timestamp: new Date().toISOString(), curso: "Informática" }],
    });
    render(<Chat usuarioLogado={utilizadorEstudante} />);
    expect(await screen.findByText("Olá turma!")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining("/chat/messages?curso="),
      expect.anything()
    );
  });

  it("mostra uma mensagem recebida em tempo real via socket", async () => {
    render(<Chat usuarioLogado={utilizadorEstudante} />);
    await waitFor(() => expect(socketFalso.emit).toHaveBeenCalledWith("joinRoom", { curso: "Informática" }));

    act(() => {
      socketFalso._trigger("message", {
        id: 5, message: "Mensagem em directo", userId: 2, userName: "Carlos",
        timestamp: new Date().toISOString(), curso: "Informática",
      });
    });
    expect(await screen.findByText("Mensagem em directo")).toBeInTheDocument();
  });

  it("envia uma mensagem válida via socket.emit e limpa o campo", async () => {
    render(<Chat usuarioLogado={utilizadorEstudante} />);
    await waitFor(() => expect(socketFalso.emit).toHaveBeenCalledWith("joinRoom", { curso: "Informática" }));

    const campo = screen.getByPlaceholderText(/Mensagem em/i);
    fireEvent.change(campo, { target: { value: "Alguém já fez o exercício 3?" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));

    expect(socketFalso.emit).toHaveBeenCalledWith("sendMessage", {
      message: "Alguém já fez o exercício 3?", curso: "Informática",
    });
    expect(campo.value).toBe("");
  });

  it("bloqueia uma mensagem reprovada pelo filtro de conteúdo e mostra o aviso, sem a enviar", async () => {
    render(<Chat usuarioLogado={utilizadorEstudante} />);
    await waitFor(() => expect(socketFalso.emit).toHaveBeenCalledWith("joinRoom", { curso: "Informática" }));
    socketFalso.emit.mockClear();

    const campo = screen.getByPlaceholderText(/Mensagem em/i);
    fireEvent.change(campo, { target: { value: "és um idiota" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));

    expect(await screen.findByText(/linguagem inapropriada/i)).toBeInTheDocument();
    expect(socketFalso.emit).not.toHaveBeenCalledWith("sendMessage", expect.anything());
  });

  it("só mostra o botão de apagar mensagem para administradores", async () => {
    api.get.mockResolvedValue({
      data: [{ id: 1, message: "Minha mensagem", userId: 1, userName: "Ana", timestamp: new Date().toISOString(), curso: "Informática" }],
    });
    const { unmount } = render(<Chat usuarioLogado={utilizadorEstudante} />);
    await screen.findByText("Minha mensagem");
    expect(screen.queryByTitle("Apagar mensagem")).not.toBeInTheDocument();
    unmount();

    render(<Chat usuarioLogado={{ ...utilizadorAdmin, id: 1 }} />);
    await screen.findByText("Minha mensagem");
    expect(screen.getByTitle("Apagar mensagem")).toBeInTheDocument();
  });

  it("pede confirmação e apaga a mensagem quando um admin confirma", async () => {
    api.get.mockResolvedValue({
      data: [{ id: 42, message: "Mensagem a remover", userId: 1, userName: "Ana", timestamp: new Date().toISOString(), curso: "Informática" }],
    });
    render(<Chat usuarioLogado={{ ...utilizadorAdmin, id: 1 }} />);
    await screen.findByText("Mensagem a remover");

    fireEvent.click(screen.getByTitle("Apagar mensagem"));
    expect(await screen.findByText("Apagar mensagem?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Apagar$/i }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/admin/mensagens/42"));
  });
});
