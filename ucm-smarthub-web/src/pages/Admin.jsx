import React, { useState, useEffect, useCallback } from "react";
import api from "../services/api";
import { ShieldCheck, CheckCircle, XCircle, Clock, AlertTriangle, X, FileText, PlayCircle, MessageCircle, Trash2 } from "lucide-react";
import { CURSOS } from "../constants/cursos";

/* Toast de notificação */
const Toast = ({ message, type, onClose }) => {
  if (!message) return null;
  const styles = {
    success: { bg: "rgba(16,185,129,0.09)", border: "rgba(16,185,129,0.28)", color: "#065f46" },
    error:   { bg: "rgba(239,68,68,0.09)",  border: "rgba(239,68,68,0.28)",  color: "#b91c1c" },
    warn:    { bg: "rgba(245,158,11,0.09)",  border: "rgba(245,158,11,0.28)", color: "#92400e" },
  };
  const s = styles[type] || styles.warn;
  return (
    <div
      className="fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-4 animate-fade-in"
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
      }}
    >
      {type === 'success'
        ? <CheckCircle size={18} style={{ color: "#10b981", flexShrink: 0 }} />
        : <AlertTriangle size={18} style={{ color: "#ef4444", flexShrink: 0 }} />
      }
      <span style={{ fontSize: 14, fontWeight: 600 }}>{message}</span>
      <button onClick={onClose} style={{ opacity: 0.45, marginLeft: 8 }} className="hover:opacity-80 transition-opacity">
        <X size={15} />
      </button>
    </div>
  );
};

/* Modal de confirmação */
const ConfirmModal = ({ message, onConfirm, onCancel }) => {
  if (!message) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(2,11,24,0.55)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-sm rounded-[28px] p-8 animate-scale-in"
        style={{
          background: "#fff",
          border: "1px solid rgba(13,37,74,0.08)",
          boxShadow: "0 30px 90px rgba(4,18,46,0.30)",
        }}
      >
        <div
          className="w-16 h-16 rounded-[20px] grid place-items-center mx-auto mb-5"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)" }}
        >
          <AlertTriangle size={30} style={{ color: "#ef4444" }} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 900, color: "#04122e", textAlign: "center", marginBottom: 8 }}>
          Confirmar acção
        </h3>
        <p style={{ fontSize: 14, color: "#64748b", textAlign: "center", lineHeight: 1.65, marginBottom: 28 }}>
          {message}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-200"
            style={{ background: "#f0f5ff", border: "1.5px solid rgba(13,37,74,0.10)", color: "#475569" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#e8effc")}
            onMouseLeave={e => (e.currentTarget.style.background = "#f0f5ff")}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="rounded-2xl px-5 py-3 text-sm font-bold text-white transition-all duration-200"
            style={{
              background: "linear-gradient(135deg, #dc2626, #ef4444)",
              boxShadow: "0 6px 20px rgba(239,68,68,0.35)",
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)", e.currentTarget.style.boxShadow = "0 8px 28px rgba(239,68,68,0.50)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 6px 20px rgba(239,68,68,0.35)")}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

const Admin = ({ usuarioLogado }) => {
  const [aba, setAba]           = useState('materiais'); // 'materiais' | 'chat'
  const [pendentes, setPendentes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState({ message: '', type: '' });
  const [confirm, setConfirm]   = useState({ message: '', id: null, tipo: 'material' });

  /* ── Chat moderation state ── */
  const [mensagens,     setMensagens]     = useState([]);
  const [loadingChat,   setLoadingChat]   = useState(false);
  const [cursoChatFiltro, setCursoChatFiltro] = useState('');

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: '' }), 4500);
  }, []);

  const fetchPendentes = useCallback(async () => {
    try {
      const res = await api.get("/admin/pendentes");
      setPendentes(res.data || []);
    } catch (err) {
      console.error("Erro ao buscar pendentes:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMensagens = useCallback(async (curso = '') => {
    setLoadingChat(true);
    try {
      const url = curso ? `/admin/mensagens?curso=${encodeURIComponent(curso)}` : '/admin/mensagens';
      const res = await api.get(url);
      setMensagens(res.data || []);
    } catch {
      showToast('Erro ao carregar mensagens.', 'error');
    } finally {
      setLoadingChat(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (usuarioLogado?.papel === "admin") {
      fetchPendentes();
      fetchMensagens();
    }
  }, [usuarioLogado, fetchPendentes, fetchMensagens]);

  useEffect(() => {
    if (aba === 'chat') fetchMensagens(cursoChatFiltro);
  }, [aba, cursoChatFiltro, fetchMensagens]);

  if (usuarioLogado?.papel !== "admin") {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
        <div
          className="w-24 h-24 rounded-[32px] grid place-items-center mb-6"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}
        >
          <ShieldCheck size={44} style={{ color: "#ef4444" }} />
        </div>
        <h2 style={{ fontSize: 30, fontWeight: 900, color: "#04122e", marginBottom: 12 }}>Acesso Negado</h2>
        <p style={{ fontSize: 15, color: "#64748b", maxWidth: 400, lineHeight: 1.65 }}>
          Esta área é reservada a administradores do UCM SmartHub.
          O seu perfil actual é de <strong style={{ color: "#0d254a" }}>{usuarioLogado?.papel}</strong>.
        </p>
      </div>
    );
  }

  const handleRejeitar = (id) => {
    setConfirm({ message: 'Tem a certeza que deseja rejeitar e apagar este material?', id, tipo: 'material' });
  };

  const handleApagarMensagem = (id) => {
    setConfirm({ message: 'Apagar esta mensagem permanentemente para todos os utilizadores?', id, tipo: 'mensagem' });
  };

  const handleConfirmRejeitar = async () => {
    const { id, tipo } = confirm;
    setConfirm({ message: '', id: null, tipo: 'material' });
    try {
      if (tipo === 'mensagem') {
        await api.delete(`/admin/mensagens/${id}`);
        setMensagens(prev => prev.filter(m => m.id !== id));
        showToast('Mensagem apagada.', 'success');
      } else {
        await api.put(`/admin/materiais/${id}/status`, { acao: 'rejeitar' });
        showToast('Material rejeitado e removido do sistema.', 'error');
        fetchPendentes();
      }
    } catch {
      showToast('Erro ao processar. Verifique a ligação ao servidor.', 'error');
    }
  };

  const handleAprovar = async (id) => {
    try {
      await api.put(`/admin/materiais/${id}/status`, { acao: 'aprovar' });
      showToast('Material aprovado e publicado no repositório!', 'success');
      fetchPendentes();
    } catch {
      showToast('Erro ao aprovar. Verifique a ligação ao servidor.', 'error');
    }
  };

  return (
    <>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />
      <ConfirmModal
        message={confirm.message}
        onConfirm={handleConfirmRejeitar}
        onCancel={() => setConfirm({ message: '', id: null })}
      />

      <div className="space-y-8 animate-fade-in">

        {/* ═══ HEADER HERO ══════════════════════════════════════════ */}
        <section
          className="relative overflow-hidden rounded-[32px] text-white"
          style={{
            background: "linear-gradient(-45deg, #020b18, #04122e, #071832, #0d254a)",
            backgroundSize: "400% 400%",
            animation: "aurora-admin 10s ease infinite",
            boxShadow: "0 24px 80px rgba(2,11,24,0.50)",
            padding: "2.8rem",
          }}
        >
          <style>{`
            @keyframes aurora-admin {
              0%,100% { background-position: 0%   50%; }
              50%      { background-position: 100% 50%; }
            }
          `}</style>

          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }} />
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "radial-gradient(ellipse at 75% 25%, rgba(255,215,0,0.10) 0%, transparent 55%)",
          }} />
          <div className="absolute top-0 inset-x-0" style={{
            height: 3,
            background: "linear-gradient(90deg, transparent, #c9a800, #ffd700, #ffe88a, transparent)",
            opacity: 0.85,
          }} />

          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.38em", color: "rgba(168,209,255,0.60)", textTransform: "uppercase", marginBottom: 8 }}>
                Administração
              </p>
              <h1 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", fontWeight: 900, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                Painel Administrativo
              </h1>
              <p style={{ marginTop: 12, color: "rgba(168,209,255,0.75)", fontSize: 15 }}>
                Moderação e aprovação de materiais submetidos pela comunidade.
              </p>
            </div>

            {/* Contador de pendentes */}
            <div
              className="inline-flex items-center gap-4 rounded-2xl px-6 py-4 shrink-0"
              style={{
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.16)",
                backdropFilter: "blur(8px)",
              }}
            >
              <div
                className="w-12 h-12 rounded-2xl grid place-items-center"
                style={{
                  background: pendentes.length > 0
                    ? "linear-gradient(135deg, #c9a800, #ffd700)"
                    : "rgba(52,211,153,0.25)",
                  boxShadow: pendentes.length > 0
                    ? "0 6px 20px rgba(255,215,0,0.45)"
                    : "0 6px 20px rgba(52,211,153,0.25)",
                  color: pendentes.length > 0 ? "#04122e" : "#34d399",
                }}
              >
                <Clock size={22} />
              </div>
              <div>
                <p style={{ fontSize: 28, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{pendentes.length}</p>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3em", color: "rgba(168,209,255,0.60)" }}>
                  Pendentes
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ ABAS ════════════════════════════════════════════════ */}
        <div className="flex gap-2">
          {[
            { key: 'materiais', label: 'Fila de Aprovação', icon: Clock, badge: pendentes.length },
            { key: 'chat',      label: 'Moderação do Chat', icon: MessageCircle, badge: mensagens.length },
          ].map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setAba(key)}
              className="flex items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-200"
              style={aba === key ? {
                background: "linear-gradient(135deg,#04122e,#0d254a)",
                color: "#fff",
                boxShadow: "0 6px 24px rgba(4,18,46,0.30)",
              } : {
                background: "rgba(255,255,255,0.85)",
                border: "1.5px solid rgba(13,37,74,0.10)",
                color: "#475569",
              }}
            >
              <Icon size={16} />
              {label}
              {badge > 0 && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-black"
                  style={aba === key
                    ? { background: "rgba(255,215,0,0.22)", color: "#ffd700" }
                    : { background: "rgba(13,37,74,0.10)", color: "#0d254a" }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══ FILA DE APROVAÇÃO ════════════════════════════════════ */}
        {aba === 'materiais' && (<>
        <section
          className="rounded-[28px] overflow-hidden"
          style={{
            background: "#fff",
            border: "1px solid rgba(13,37,74,0.08)",
            boxShadow: "0 4px 32px rgba(13,37,74,0.07)",
          }}
        >
          {/* Cabeçalho da secção */}
          <div
            className="flex items-center justify-between gap-4 px-7 py-5"
            style={{ borderBottom: "1px solid rgba(13,37,74,0.06)" }}
          >
            <h2
              className="flex items-center gap-2.5"
              style={{ fontSize: 18, fontWeight: 900, color: "#04122e" }}
            >
              <Clock size={19} style={{ color: "#0d254a" }} />
              Fila de Aprovação
            </h2>
            <span
              className="rounded-full px-4 py-1.5 text-xs font-bold uppercase"
              style={{
                background: pendentes.length > 0 ? "rgba(255,215,0,0.12)" : "rgba(16,185,129,0.09)",
                border: pendentes.length > 0 ? "1px solid rgba(255,215,0,0.35)" : "1px solid rgba(16,185,129,0.28)",
                color: pendentes.length > 0 ? "#8a6800" : "#065f46",
                letterSpacing: "0.25em",
              }}
            >
              {pendentes.length} pendentes
            </span>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center p-14">
                <div
                  className="w-12 h-12 rounded-full border-4 animate-spin mx-auto mb-4"
                  style={{ borderColor: "rgba(13,37,74,0.10)", borderTopColor: "#0d254a" }}
                />
                <p style={{ color: "#64748b", fontWeight: 600 }}>Carregando materiais pendentes...</p>
              </div>
            ) : pendentes.length === 0 ? (
              <div
                className="text-center rounded-[24px] p-14"
                style={{
                  border: "2px dashed rgba(16,185,129,0.25)",
                  background: "rgba(16,185,129,0.04)",
                }}
              >
                <div
                  className="w-18 h-18 rounded-2xl grid place-items-center mx-auto mb-5"
                  style={{
                    width: 64, height: 64,
                    background: "rgba(16,185,129,0.10)",
                    border: "1px solid rgba(16,185,129,0.22)",
                  }}
                >
                  <CheckCircle size={32} style={{ color: "#10b981" }} />
                </div>
                <p style={{ fontSize: 18, fontWeight: 900, color: "#065f46" }}>Tudo em dia!</p>
                <p style={{ fontSize: 14, color: "rgba(6,95,70,0.65)", marginTop: 6 }}>
                  Não há nenhum material aguardando aprovação.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendentes.map((m) => (
                  <div
                    key={m.id}
                    className="group flex flex-col gap-5 rounded-[24px] p-6 transition-all duration-250"
                    style={{
                      border: "1px solid rgba(13,37,74,0.08)",
                      background: "#fff",
                      boxShadow: "0 2px 14px rgba(13,37,74,0.05)",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)", e.currentTarget.style.boxShadow = "0 10px 36px rgba(13,37,74,0.12)")}
                    onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 2px 14px rgba(13,37,74,0.05)")}
                  >
                    <div>
                      <h3
                        style={{ fontSize: 20, fontWeight: 900, color: "#04122e", marginBottom: 12 }}
                        className="group-hover:text-[#0d254a] transition-colors"
                      >
                        {m.titulo}
                      </h3>

                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: `👤 ${m.autor}`,   bg: "#f0f5ff", border: "rgba(13,37,74,0.10)", color: "#475569" },
                          { label: `📚 ${m.cadeira}`, bg: "#eff6ff", border: "#bfdbfe",             color: "#0d254a" },
                          {
                            label: m.tipo === 'Vídeo' ? `▶ ${m.tipo}` : `📄 ${m.tipo}`,
                            bg: m.tipo === 'Vídeo' ? "#eff6ff" : "#fff1f2",
                            border: m.tipo === 'Vídeo' ? "#bfdbfe" : "#fecdd3",
                            color: m.tipo === 'Vídeo' ? "#0d254a" : "#be123c",
                          },
                          {
                            label: `📅 ${new Date(m.data_upload).toLocaleDateString("pt-PT")}`,
                            bg: "#f0f5ff", border: "rgba(13,37,74,0.10)", color: "#64748b",
                          },
                        ].map(({ label, bg, border, color }) => (
                          <span
                            key={label}
                            className="rounded-full px-3.5 py-1.5 text-xs font-semibold"
                            style={{ background: bg, border: `1px solid ${border}`, color }}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div
                      className="grid gap-3 sm:grid-cols-2 pt-1"
                      style={{ borderTop: "1px solid rgba(13,37,74,0.06)" }}
                    >
                      {/* Botão Rejeitar */}
                      <button
                        onClick={() => handleRejeitar(m.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold transition-all duration-200"
                        style={{
                          background: "rgba(239,68,68,0.07)",
                          border: "1.5px solid rgba(239,68,68,0.22)",
                          color: "#dc2626",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#ef4444", e.currentTarget.style.color = "#fff", e.currentTarget.style.boxShadow = "0 6px 20px rgba(239,68,68,0.35)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,0.07)", e.currentTarget.style.color = "#dc2626", e.currentTarget.style.boxShadow = "")}
                      >
                        <XCircle size={17} /> Rejeitar
                      </button>

                      {/* Botão Aprovar */}
                      <button
                        onClick={() => handleAprovar(m.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold text-white transition-all duration-200"
                        style={{
                          background: "linear-gradient(135deg, #059669, #10b981)",
                          boxShadow: "0 6px 20px rgba(16,185,129,0.35)",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)", e.currentTarget.style.boxShadow = "0 10px 28px rgba(16,185,129,0.50)")}
                        onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 6px 20px rgba(16,185,129,0.35)")}
                      >
                        <CheckCircle size={17} /> Aprovar e Publicar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        </>)}

        {/* ═══ MODERAÇÃO DO CHAT ════════════════════════════════════ */}
        {aba === 'chat' && (
          <section
            className="rounded-[28px] overflow-hidden"
            style={{ background: "#fff", border: "1px solid rgba(13,37,74,0.08)", boxShadow: "0 4px 32px rgba(13,37,74,0.07)" }}
          >
            {/* Cabeçalho + filtro */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-7 py-5"
              style={{ borderBottom: "1px solid rgba(13,37,74,0.06)" }}>
              <h2 className="flex items-center gap-2.5"
                style={{ fontSize: 18, fontWeight: 900, color: "#04122e" }}>
                <MessageCircle size={19} style={{ color: "#0d254a" }} />
                Mensagens do Chat
              </h2>
              <div className="flex items-center gap-3">
                <select
                  value={cursoChatFiltro}
                  onChange={e => setCursoChatFiltro(e.target.value)}
                  className="rounded-2xl px-4 py-2.5 text-sm outline-none appearance-none"
                  style={{ background: "#f0f5ff", border: "1.5px solid rgba(13,37,74,0.09)", color: "#334155", minWidth: 180 }}
                >
                  <option value="">Todos os cursos</option>
                  {CURSOS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                  onClick={() => fetchMensagens(cursoChatFiltro)}
                  className="rounded-2xl px-4 py-2.5 text-sm font-bold transition-all"
                  style={{ background: "#f0f5ff", border: "1.5px solid rgba(13,37,74,0.09)", color: "#0d254a" }}
                >
                  Actualizar
                </button>
              </div>
            </div>

            <div className="p-6">
              {loadingChat ? (
                <div className="text-center p-12">
                  <div className="w-10 h-10 rounded-full border-4 animate-spin mx-auto mb-3"
                    style={{ borderColor: "rgba(13,37,74,0.10)", borderTopColor: "#0d254a" }} />
                  <p style={{ color: "#64748b", fontWeight: 600 }}>A carregar mensagens...</p>
                </div>
              ) : mensagens.length === 0 ? (
                <div className="text-center rounded-[24px] p-12"
                  style={{ border: "2px dashed rgba(13,37,74,0.10)", background: "#f8faff" }}>
                  <MessageCircle size={32} style={{ color: "#cbd5e1", margin: "0 auto 12px" }} />
                  <p style={{ fontSize: 16, fontWeight: 900, color: "#94a3b8" }}>Nenhuma mensagem encontrada.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mensagens.map(msg => (
                    <div
                      key={msg.id}
                      className="group flex items-start gap-4 rounded-[18px] px-5 py-4 transition-all"
                      style={{ background: "#f8faff", border: "1px solid rgba(13,37,74,0.06)" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(13,37,74,0.14)"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(13,37,74,0.06)"}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: "linear-gradient(135deg,#04122e,#0d254a)",
                        display: "grid", placeItems: "center",
                        color: "#ffd700", fontWeight: 900, fontSize: 14,
                      }}>
                        {msg.userName?.charAt(0).toUpperCase()}
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span style={{ fontSize: 13, fontWeight: 800, color: "#04122e" }}>{msg.userName}</span>
                          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                            style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#0d254a", letterSpacing: "0.15em" }}>
                            {msg.curso}
                          </span>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>
                            {new Date(msg.timestamp).toLocaleString("pt-PT")}
                          </span>
                        </div>
                        <p style={{ fontSize: 14, color: "#334155", lineHeight: 1.55 }}>{msg.message}</p>
                      </div>

                      {/* Botão apagar */}
                      <button
                        onClick={() => handleApagarMensagem(msg.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 rounded-xl p-2"
                        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)", color: "#ef4444" }}
                        title="Apagar mensagem"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

      </div>
    </>
  );
};

export default Admin;
