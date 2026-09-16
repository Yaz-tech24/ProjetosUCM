import { io } from 'socket.io-client';

// Uma única ligação Socket.IO partilhada por toda a app (sino de notificações
// no cabeçalho + página do chat). Cada consumidor "adquire" a ligação e
// "liberta-a" ao desmontar; a ligação só é fechada quando ninguém a usa —
// sem isto, abrir o chat criava uma segunda ligação em paralelo à do sino.
let socket = null;
let utilizadores = 0;

const apiBase = () => (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api\/?$/, '');

export function adquirirSocket() {
  if (!socket) {
    // withCredentials: o cookie httpOnly de sessão é a identidade da ligação
    // (ver io.use() em routes/chat.js) — nunca se envia userId do cliente.
    socket = io(apiBase(), { withCredentials: true, reconnectionDelayMax: 10000 });
  }
  utilizadores++;
  return socket;
}

export function libertarSocket() {
  utilizadores = Math.max(0, utilizadores - 1);
  if (utilizadores === 0 && socket) {
    socket.disconnect();
    socket = null;
  }
}

// Só para testes/diagnóstico.
export const socketActivo = () => socket;
