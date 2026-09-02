import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { io as ioClient } from "socket.io-client";

// Testes de integração REAIS do handshake do Socket.IO — ao contrário dos
// outros ficheiros de teste (que mockam db.query e nunca abrem uma ligação
// de rede a sério), isto liga-se de facto a um servidor HTTP numa porta
// efémera. É a única forma de apanhar bugs como o que motivou este ficheiro:
// `cookie.parse is not a function` (a API mudou de nome na v2 do pacote
// "cookie") só rebentava quando um cliente Socket.IO REAL tentava ligar-se —
// os testes com mocks nunca exercitam este caminho, porque o middleware
// io.use() só corre no handshake real, e uma excepção não apanhada ali
// dentro derrubava o processo Node inteiro (não só a ligação em causa).
const { server } = require("../server");
const { JWT_SECRET } = require("../middleware/auth");

let url;

beforeAll(() => new Promise((resolve) => {
  server.listen(0, () => {
    const { port } = server.address();
    url = `http://localhost:${port}`;
    resolve();
  });
}));

afterAll(() => new Promise((resolve) => server.close(resolve)));

function ligar(options) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, { transports: ["websocket"], forceNew: true, ...options });
    const timer = setTimeout(() => reject(new Error("timeout a ligar")), 5000);
    socket.on("connect", () => { clearTimeout(timer); resolve(socket); });
    socket.on("connect_error", (erro) => { clearTimeout(timer); reject(erro); });
  });
}

describe("Socket.IO — autenticação da ligação de chat", () => {
  it("liga com sucesso quando o cookie 'token' tem um JWT válido (o bug real: cookie.parse não existe na v2 do pacote)", async () => {
    const token = jwt.sign({ id: 1, papel: "estudante", nome: "Ana", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h" });
    const socket = await ligar({ extraHeaders: { Cookie: `token=${token}` } });
    expect(socket.connected).toBe(true);
    socket.close();
  });

  it("liga com sucesso via auth.token explícito (clientes não-browser)", async () => {
    const token = jwt.sign({ id: 2, papel: "estudante", nome: "Bea", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h" });
    const socket = await ligar({ auth: { token } });
    expect(socket.connected).toBe(true);
    socket.close();
  });

  it("rejeita a ligação sem cookie nem token, e o servidor continua vivo para a ligação seguinte", async () => {
    await expect(ligar({})).rejects.toMatchObject({ data: { codigo: "auth_necessaria" } });

    // Prova de que o processo não morreu: antes desta correcção, uma
    // excepção não apanhada dentro de io.use() matava o servidor inteiro,
    // e esta segunda ligação (perfeitamente válida) teria falhado também.
    const token = jwt.sign({ id: 3, papel: "estudante", nome: "Carlos", curso: "Geral" }, JWT_SECRET, { expiresIn: "1h" });
    const socket = await ligar({ extraHeaders: { Cookie: `token=${token}` } });
    expect(socket.connected).toBe(true);
    socket.close();
  });

  it("um cabeçalho Cookie malformado não derruba o servidor — cai para 'auth_necessaria' em vez de rebentar", async () => {
    await expect(ligar({ extraHeaders: { Cookie: "===isto não é um cookie válido===" } }))
      .rejects.toMatchObject({ data: { codigo: "auth_necessaria" } });
  });
});
