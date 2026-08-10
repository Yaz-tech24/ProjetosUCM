import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import api from '../services/api';
import { Send, Users, ShieldAlert, Trash2 } from 'lucide-react';
import { CURSOS } from '../constants/cursos';
import { analisarMensagem, mensagemAviso } from '../utils/filtroChat';

const Chat = ({ usuarioLogado }) => {
  const cursoPadrao = CURSOS.includes(usuarioLogado?.curso) ? usuarioLogado.curso : CURSOS[0];
  const [cursoActivo, setCursoActivo] = useState(cursoPadrao);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [avisoFiltro,     setAvisoFiltro]     = useState('');
  const [confirmDelete,   setConfirmDelete]   = useState(null); // id da mensagem a apagar
  const isAdmin = usuarioLogado?.papel === 'admin';
  const messagesEndRef = useRef(null);
  const socketRef      = useRef(null);
  const avisoTimer     = useRef(null);

  /* Liga o socket uma única vez, ao montar */
  useEffect(() => {
    const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace('/api', '');
    const sock = io(apiBase);
    socketRef.current = sock;
    return () => {
      sock.disconnect();
      socketRef.current = null;
    };
  }, []);

  /* Ao mudar de curso: entra na sala, regista os listeners com o curso actual
     e carrega o histórico — tudo num só efeito, sem registos duplicados */
  useEffect(() => {
    const sock = socketRef.current;
    if (!sock) return;

    sock.emit('joinRoom', { curso: cursoActivo });

    const handleMessage = (msg) => {
      if (msg.curso === cursoActivo || !msg.curso) {
        setMessages(prev => [...prev, msg]);
      }
    };
    const handleDeleted = ({ id }) => {
      setMessages(prev => prev.filter(m => m.id !== id));
    };
    sock.on('message', handleMessage);
    sock.on('messageDeleted', handleDeleted);

    const load = async () => {
      setLoadingMessages(true);
      setMessages([]);
      try {
        const res = await api.get(`/chat/messages?curso=${encodeURIComponent(cursoActivo)}`);
        setMessages(res.data || []);
      } catch (err) {
        console.error('Erro ao carregar mensagens:', err);
      } finally {
        setLoadingMessages(false);
      }
    };
    load();

    return () => {
      sock.off('message', handleMessage);
      sock.off('messageDeleted', handleDeleted);
    };
  }, [cursoActivo]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const apagarMensagem = async (id) => {
    try {
      await api.delete(`/admin/mensagens/${id}`);
      setConfirmDelete(null);
    } catch {
      mostrarAviso('Erro ao apagar mensagem.');
    }
  };

  const mostrarAviso = (texto) => {
    setAvisoFiltro(texto);
    clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAvisoFiltro(''), 4000);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socketRef.current) return;

    const { bloqueada, motivo } = analisarMensagem(newMessage);
    if (bloqueada) {
      mostrarAviso(mensagemAviso(motivo));
      return;
    }

    socketRef.current.emit('sendMessage', {
      message: newMessage,
      userId: usuarioLogado?.id || 0,
      userName: usuarioLogado?.nome || 'Estudante',
      curso: cursoActivo,
    });
    setNewMessage('');
  };

  return (
    <>
    {/* Modal de confirmação de apagar */}
    {confirmDelete !== null && (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{ background: "rgba(2,11,24,0.55)", backdropFilter: "blur(8px)" }}>
        <div className="w-full max-w-sm rounded-[28px] p-8 animate-scale-in"
          style={{ background: "#fff", boxShadow: "0 30px 90px rgba(4,18,46,0.30)" }}>
          <div className="w-14 h-14 rounded-[18px] grid place-items-center mx-auto mb-5"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)" }}>
            <Trash2 size={26} style={{ color: "#ef4444" }} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 900, color: "#04122e", textAlign: "center", marginBottom: 8 }}>
            Apagar mensagem?
          </h3>
          <p style={{ fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 1.6, marginBottom: 24 }}>
            Esta acção é permanente e remove a mensagem para todos os utilizadores.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setConfirmDelete(null)}
              className="rounded-2xl px-4 py-3 text-sm font-bold transition-all"
              style={{ background: "#f0f5ff", border: "1.5px solid rgba(13,37,74,0.10)", color: "#475569" }}>
              Cancelar
            </button>
            <button onClick={() => apagarMensagem(confirmDelete)}
              className="rounded-2xl px-4 py-3 text-sm font-bold text-white transition-all"
              style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", boxShadow: "0 6px 20px rgba(239,68,68,0.35)" }}>
              Apagar
            </button>
          </div>
        </div>
      </div>
    )}

    <div
      className="flex h-[calc(100vh-160px)] flex-col overflow-hidden animate-fade-in"
      style={{
        borderRadius: 32,
        border: "1px solid rgba(13,37,74,0.08)",
        background: "#fff",
        boxShadow: "0 10px 56px rgba(13,37,74,0.12)",
      }}
    >
      {/* Barra dourada topo */}
      <div
        className="shrink-0"
        style={{
          height: 3,
          background: "linear-gradient(90deg, transparent, #c9a800, #ffd700, #ffe88a, transparent)",
          opacity: 0.90,
        }}
      />

      {/* Header */}
      <header
        className="px-7 pt-6 pb-0 text-white shrink-0"
        style={{
          background: "linear-gradient(-45deg, #020b18, #04122e, #071832, #0d254a)",
          backgroundSize: "400% 400%",
          animation: "aurora-chat 10s ease infinite",
        }}
      >
        <style>{`
          @keyframes aurora-chat {
            0%,100% { background-position: 0%   50%; }
            50%      { background-position: 100% 50%; }
          }
        `}</style>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.38em", color: "rgba(168,209,255,0.60)", textTransform: "uppercase", marginBottom: 4 }}>
              Chat Estudantil
            </p>
            <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em" }}>
              Conversa em Tempo Real
            </h1>
          </div>

          {/* Indicador de sala */}
          <div
            className="inline-flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-semibold"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: "#34d399", boxShadow: "0 0 8px rgba(52,211,153,0.90)" }}
            />
            <span style={{ color: "rgba(255,255,255,0.65)" }}>Sala:</span>
            <span style={{ color: "#ffd700", fontWeight: 900 }}>{cursoActivo}</span>
          </div>
        </div>

        {/* Abas de curso */}
        <div className="flex gap-1 overflow-x-auto pb-0" style={{ scrollbarWidth: "none" }}>
          {CURSOS.map(curso => {
            const active = cursoActivo === curso;
            return (
              <button
                key={curso}
                onClick={() => setCursoActivo(curso)}
                className="shrink-0 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all duration-200"
                style={active
                  ? {
                      background: "#fff",
                      color: "#0d254a",
                      borderBottom: "3px solid #ffd700",
                      boxShadow: "0 -2px 12px rgba(255,215,0,0.15)",
                    }
                  : {
                      color: "rgba(255,255,255,0.45)",
                      borderBottom: "3px solid transparent",
                    }
                }
              >
                {curso}
                {curso === usuarioLogado?.curso && (
                  <span style={{ marginLeft: 6, color: "#ffd700", fontSize: 9 }}>●</span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Mensagens */}
      <main
        className="flex-1 overflow-y-auto p-6 space-y-4"
        style={{
          background: `
            radial-gradient(ellipse at 20% 25%, rgba(30,95,224,.06)  0%, transparent 50%),
            radial-gradient(ellipse at 80% 75%, rgba(168,209,255,.05) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(255,215,0,.025) 0%, transparent 55%),
            #f0f5ff
          `
        }}
      >
        {loadingMessages ? (
          <div className="flex items-center justify-center py-16">
            <div
              className="w-8 h-8 rounded-full border-4 animate-spin"
              style={{ borderColor: "rgba(13,37,74,0.10)", borderTopColor: "#0d254a" }}
            />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12 gap-4">
            <div
              className="w-16 h-16 rounded-2xl grid place-items-center"
              style={{
                background: "#f0f5ff",
                border: "1px solid rgba(13,37,74,0.08)",
              }}
            >
              <Users size={26} style={{ color: "#94a3b8" }} />
            </div>
            <p style={{ fontWeight: 800, color: "#475569", fontSize: 16 }}>Sala {cursoActivo} vazia</p>
            <p style={{ fontSize: 14, color: "#94a3b8" }}>Seja o primeiro a iniciar a conversa neste curso!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isOwn = msg.userId === usuarioLogado?.id;
            return (
              <div key={msg.id ?? index} className={`group flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                {/* Avatar para mensagens de outros */}
                {!isOwn && (
                  <div
                    className="w-8 h-8 rounded-xl grid place-items-center text-xs font-black shrink-0"
                    style={{
                      background: "linear-gradient(135deg, #04122e, #0d254a)",
                      color: "#ffd700",
                      boxShadow: "0 3px 10px rgba(4,18,46,0.25)",
                    }}
                  >
                    {msg.userName?.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Botão apagar — admin, lado esquerdo nas mensagens próprias */}
                {isAdmin && isOwn && msg.id && (
                  <button
                    onClick={() => setConfirmDelete(msg.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 w-7 h-7 rounded-lg grid place-items-center"
                    style={{ background: "rgba(239,68,68,0.10)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.20)" }}
                    title="Apagar mensagem"
                  >
                    <Trash2 size={13} />
                  </button>
                )}

                <div
                  className="max-w-xs lg:max-w-md px-5 py-3.5 rounded-2xl text-sm"
                  style={isOwn ? {
                    background: "linear-gradient(135deg, #c9a800, #ffd700, #ffe88a)",
                    color: "#04122e",
                    fontWeight: 600,
                    borderBottomRightRadius: 6,
                    boxShadow: "0 6px 20px rgba(255,215,0,0.35)",
                  } : {
                    background: "#fff",
                    color: "#334155",
                    border: "1px solid rgba(13,37,74,0.08)",
                    borderBottomLeftRadius: 6,
                    boxShadow: "0 2px 10px rgba(13,37,74,0.06)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.2em", marginBottom: 6,
                      color: isOwn ? "rgba(4,18,46,0.50)" : "rgba(13,37,74,0.55)",
                    }}
                  >
                    {msg.userName}
                  </div>
                  <div style={{ lineHeight: 1.55 }}>{msg.message}</div>
                  <div
                    style={{
                      fontSize: 10, marginTop: 6,
                      color: isOwn ? "rgba(4,18,46,0.38)" : "#94a3b8",
                    }}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString("pt-PT")}
                  </div>
                </div>

                {/* Avatar para mensagens próprias */}
                {isOwn && (
                  <div
                    className="w-8 h-8 rounded-xl grid place-items-center text-xs font-black shrink-0"
                    style={{
                      background: "linear-gradient(135deg, #c9a800, #ffd700)",
                      color: "#04122e",
                      boxShadow: "0 3px 10px rgba(255,215,0,0.40)",
                    }}
                  >
                    {usuarioLogado?.nome?.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Botão apagar — admin, mensagens de outros */}
                {isAdmin && !isOwn && msg.id && (
                  <button
                    onClick={() => setConfirmDelete(msg.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 w-7 h-7 rounded-lg grid place-items-center"
                    style={{ background: "rgba(239,68,68,0.10)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.20)" }}
                    title="Apagar mensagem"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Aviso do filtro */}
      {avisoFiltro && (
        <div
          className="mx-6 mb-0 mt-3 flex items-center gap-3 rounded-2xl px-4 py-3 animate-fade-in shrink-0"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.28)",
            color: "#b91c1c",
          }}
        >
          <ShieldAlert size={16} style={{ flexShrink: 0, color: "#ef4444" }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{avisoFiltro}</span>
        </div>
      )}

      {/* Input de envio */}
      <footer
        className="px-6 py-5 shrink-0"
        style={{
          borderTop: "1px solid rgba(13,37,74,0.08)",
          background: "#fff",
        }}
      >
        <form onSubmit={sendMessage} className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value.slice(0, 500))}
              placeholder={`Mensagem em ${cursoActivo}...`}
              className="w-full rounded-2xl px-5 py-4 text-sm outline-none transition-all duration-200"
              style={{
                background: "#f0f5ff",
                border: `1.5px solid ${newMessage.length >= 480 ? "rgba(245,158,11,0.50)" : "rgba(13,37,74,0.09)"}`,
                color: "#0f172a",
                paddingRight: newMessage.length > 400 ? "4rem" : undefined,
              }}
              onFocus={e => (e.target.style.borderColor = "#0d254a", e.target.style.background = "#fff", e.target.style.boxShadow = "0 0 0 4px rgba(13,37,74,0.07)")}
              onBlur={e => (e.target.style.borderColor = newMessage.length >= 480 ? "rgba(245,158,11,0.50)" : "rgba(13,37,74,0.09)", e.target.style.background = "#f0f5ff", e.target.style.boxShadow = "")}
              required
            />
            {newMessage.length > 400 && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold pointer-events-none"
                style={{ color: newMessage.length >= 480 ? "#f59e0b" : "#94a3b8" }}>
                {500 - newMessage.length}
              </span>
            )}
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-sm font-black uppercase tracking-wider shrink-0 transition-all duration-250"
            style={{
              background: "linear-gradient(135deg, #c9a800, #ffd700, #ffe88a)",
              color: "#04122e",
              boxShadow: "0 6px 22px rgba(255,215,0,0.45)",
              letterSpacing: "0.08em",
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)", e.currentTarget.style.boxShadow = "0 10px 30px rgba(255,215,0,0.60)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 6px 22px rgba(255,215,0,0.45)")}
          >
            <Send size={16} /> Enviar
          </button>
        </form>
      </footer>
    </div>
    </>
  );
};

export default Chat;
