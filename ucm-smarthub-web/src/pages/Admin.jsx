import React, { useState, useEffect, useCallback } from "react";
import api from "../services/api";
import {
  ShieldCheck, CheckCircle, XCircle, Clock, AlertTriangle, X, MessageCircle, Trash2,
  Settings, Upload, Plus, Save, Sparkles,
} from "lucide-react";
import { useConfig } from "../context/ConfigContext";

const TIPOS_FICHEIRO_OPCOES = [
  { valor: "pdf",  label: "PDF" },
  { valor: "mp4",  label: "MP4" },
  { valor: "webm", label: "WebM" },
  { valor: "ogg",  label: "Ogg" },
  { valor: "mov",  label: "QuickTime (.mov)" },
];

/* Toast de notificação */
const Toast = ({ message, type, onClose }) => {
  if (!message) return null;
  const cor = type === 'error' ? "#ef4444" : type === 'warn' ? "#f59e0b" : "#10b981";
  return (
    <div
      className="fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-4 animate-fade-in"
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-subtle-strong)",
        borderLeftWidth: 3,
        borderLeftColor: cor,
        color: "var(--text-heading)",
        boxShadow: "0 10px 40px rgba(0,0,0,0.16)",
      }}
    >
      {type === 'success'
        ? <CheckCircle size={18} style={{ color: "#10b981", flexShrink: 0 }} />
        : <AlertTriangle size={18} style={{ color: type === 'warn' ? "#f59e0b" : "#ef4444", flexShrink: 0 }} />
      }
      <span style={{ fontSize: 14, fontWeight: 600 }}>{message}</span>
      <button onClick={onClose} style={{ opacity: 0.45, marginLeft: 8, color: "var(--text-heading)" }} className="hover:opacity-80 transition-opacity">
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
      style={{ background: "rgba(var(--color-navy-abyss-rgb),0.55)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-sm rounded-[28px] p-8 animate-scale-in"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 30px 90px rgba(var(--color-navy-deep-rgb),0.30)",
        }}
      >
        <div
          className="w-16 h-16 rounded-[20px] grid place-items-center mx-auto mb-5"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)" }}
        >
          <AlertTriangle size={30} style={{ color: "#ef4444" }} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 900, color: "var(--text-heading)", textAlign: "center", marginBottom: 8 }}>
          Confirmar acção
        </h3>
        <p style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.65, marginBottom: 28 }}>
          {message}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-200"
            style={{ background: "var(--surface-hover)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-body)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-ice-mid)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--surface-hover)")}
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
  const { config, cursos, refetchConfig } = useConfig();
  const [aba, setAba]           = useState('materiais'); // 'materiais' | 'chat' | 'config'
  const [pendentes, setPendentes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState({ message: '', type: '' });
  const [confirm, setConfirm]   = useState({ message: '', id: null, tipo: 'material' });

  /* ── Chat moderation state ── */
  const [mensagens,     setMensagens]     = useState([]);
  const [loadingChat,   setLoadingChat]   = useState(false);
  const [cursoChatFiltro, setCursoChatFiltro] = useState('');

  /* ── Configurações state ── */
  const [configForm,    setConfigForm]    = useState(null);
  const [savingConfig,  setSavingConfig]  = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [novoCurso,     setNovoCurso]     = useState('');

  /* Semeia o rascunho local uma única vez, quando a configuração chega */
  useEffect(() => {
    if (!configForm && config) {
      setConfigForm({ ...config, tipos_ficheiro_permitidos: (config.tipos_ficheiro_permitidos || '').split(',') });
    }
  }, [config, configForm]);

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
        <h2 style={{ fontSize: 30, fontWeight: 900, color: "var(--text-heading)", marginBottom: 12 }}>Acesso Negado</h2>
        <p style={{ fontSize: 15, color: "var(--text-muted)", maxWidth: 400, lineHeight: 1.65 }}>
          Esta área é reservada a administradores da {config.nome_plataforma}.
          O seu perfil actual é de <strong style={{ color: "var(--color-navy-mid)" }}>{usuarioLogado?.papel}</strong>.
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

  const handleRemoverCurso = (id) => {
    setConfirm({ message: 'Remover este curso da lista? Materiais e contas já criados com ele não são afectados.', id, tipo: 'curso' });
  };

  const handleConfirmRejeitar = async () => {
    const { id, tipo } = confirm;
    setConfirm({ message: '', id: null, tipo: 'material' });
    try {
      if (tipo === 'mensagem') {
        await api.delete(`/admin/mensagens/${id}`);
        setMensagens(prev => prev.filter(m => m.id !== id));
        showToast('Mensagem apagada.', 'success');
      } else if (tipo === 'curso') {
        await api.delete(`/admin/cursos/${id}`);
        showToast('Curso removido.', 'success');
        await refetchConfig();
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

  const handleSalvarConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await api.put('/admin/config', configForm);
      showToast('Configuração guardada com sucesso!', 'success');
      await refetchConfig();
    } catch (err) {
      showToast(err.response?.data?.erro || 'Erro ao guardar configuração.', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      await api.post('/admin/config/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      showToast('Logótipo actualizado!', 'success');
      await refetchConfig();
    } catch (err) {
      showToast(err.response?.data?.erro || 'Erro ao enviar logótipo.', 'error');
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoverLogo = async () => {
    try {
      await api.delete('/admin/config/logo');
      showToast('Logótipo removido.', 'success');
      await refetchConfig();
    } catch {
      showToast('Erro ao remover logótipo.', 'error');
    }
  };

  const handleAdicionarCurso = async (e) => {
    e.preventDefault();
    if (!novoCurso.trim()) return;
    try {
      await api.post('/admin/cursos', { nome: novoCurso.trim() });
      setNovoCurso('');
      showToast('Curso adicionado.', 'success');
      await refetchConfig();
    } catch (err) {
      showToast(err.response?.data?.erro || 'Erro ao adicionar curso.', 'error');
    }
  };

  const toggleTipoFicheiro = (valor) => {
    setConfigForm(f => ({
      ...f,
      tipos_ficheiro_permitidos: f.tipos_ficheiro_permitidos.includes(valor)
        ? f.tipos_ficheiro_permitidos.filter(t => t !== valor)
        : [...f.tipos_ficheiro_permitidos, valor],
    }));
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
            background: "linear-gradient(-45deg, var(--color-navy-abyss), var(--color-navy-deep), var(--color-navy), var(--color-navy-mid))",
            backgroundSize: "400% 400%",
            animation: "aurora-admin 10s ease infinite",
            boxShadow: "0 24px 80px rgba(var(--color-navy-abyss-rgb),0.50)",
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
            background: "radial-gradient(ellipse at 75% 25%, rgba(var(--color-gold-rgb),0.10) 0%, transparent 55%)",
          }} />
          <div className="absolute top-0 inset-x-0" style={{
            height: 3,
            background: "linear-gradient(90deg, transparent, var(--color-gold-dark), var(--color-gold), var(--color-gold-light), transparent)",
            opacity: 0.85,
          }} />

          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.38em", color: "rgba(var(--color-blue-sky-rgb),0.60)", textTransform: "uppercase", marginBottom: 8 }}>
                Administração
              </p>
              <h1 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", fontWeight: 900, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                Painel Administrativo
              </h1>
              <p style={{ marginTop: 12, color: "rgba(var(--color-blue-sky-rgb),0.75)", fontSize: 15 }}>
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
                    ? "linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))"
                    : "rgba(52,211,153,0.25)",
                  boxShadow: pendentes.length > 0
                    ? "0 6px 20px rgba(var(--color-gold-rgb),0.45)"
                    : "0 6px 20px rgba(52,211,153,0.25)",
                  color: pendentes.length > 0 ? "var(--color-navy-deep)" : "#34d399",
                }}
              >
                <Clock size={22} />
              </div>
              <div>
                <p style={{ fontSize: 28, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{pendentes.length}</p>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3em", color: "rgba(var(--color-blue-sky-rgb),0.60)" }}>
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
            { key: 'config',    label: 'Configurações',     icon: Settings, badge: 0 },
          ].map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setAba(key)}
              className="flex items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-200"
              style={aba === key ? {
                background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))",
                color: "#fff",
                boxShadow: "0 6px 24px rgba(var(--color-navy-deep-rgb),0.30)",
              } : {
                background: "var(--surface-card-glass)",
                border: "1.5px solid var(--border-subtle-strong)",
                color: "var(--text-body)",
              }}
            >
              <Icon size={16} />
              {label}
              {badge > 0 && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-black"
                  style={aba === key
                    ? { background: "rgba(var(--color-gold-rgb),0.22)", color: "var(--color-gold)" }
                    : { background: "rgba(var(--color-navy-mid-rgb),0.10)", color: "var(--color-navy-mid)" }}>
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
            background: "var(--surface-card)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 4px 32px rgba(var(--color-navy-mid-rgb),0.07)",
          }}
        >
          {/* Cabeçalho da secção */}
          <div
            className="flex items-center justify-between gap-4 px-7 py-5"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <h2
              className="flex items-center gap-2.5"
              style={{ fontSize: 18, fontWeight: 900, color: "var(--text-heading)" }}
            >
              <Clock size={19} style={{ color: "var(--color-navy-mid)" }} />
              Fila de Aprovação
            </h2>
            <span
              className="rounded-full px-4 py-1.5 text-xs font-bold uppercase"
              style={{
                background: pendentes.length > 0 ? "rgba(var(--color-gold-rgb),0.12)" : "rgba(16,185,129,0.09)",
                border: pendentes.length > 0 ? "1px solid rgba(var(--color-gold-rgb),0.35)" : "1px solid rgba(16,185,129,0.28)",
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
                  style={{ borderColor: "rgba(var(--color-navy-mid-rgb),0.10)", borderTopColor: "var(--color-navy-mid)" }}
                />
                <p style={{ color: "var(--text-muted)", fontWeight: 600 }}>Carregando materiais pendentes...</p>
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
                <p style={{ fontSize: 18, fontWeight: 900, color: "var(--status-success-text)" }}>Tudo em dia!</p>
                <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 6 }}>
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
                      border: "1px solid var(--border-subtle)",
                      background: "var(--surface-card)",
                      boxShadow: "0 2px 14px rgba(var(--color-navy-mid-rgb),0.05)",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)", e.currentTarget.style.boxShadow = "0 10px 36px rgba(var(--color-navy-mid-rgb),0.12)")}
                    onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 2px 14px rgba(var(--color-navy-mid-rgb),0.05)")}
                  >
                    <div>
                      <h3
                        style={{ fontSize: 20, fontWeight: 900, color: "var(--text-heading)", marginBottom: 12 }}
                        className="group-hover:text-[var(--color-navy-mid)] transition-colors"
                      >
                        {m.titulo}
                      </h3>

                      {m.ia_sinalizado === 1 && (
                        <div
                          className="flex items-start gap-2.5 rounded-2xl px-4 py-3 mb-3"
                          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}
                        >
                          <AlertTriangle size={16} style={{ color: "#d97706", flexShrink: 0, marginTop: 1 }} />
                          <p style={{ fontSize: 13, color: "#92400e", lineHeight: 1.5 }}>
                            <strong>IA sinalizou:</strong> {m.ia_motivo || "possível desvio do propósito da plataforma."}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: `👤 ${m.autor}`,   bg: "var(--surface-hover)", border: "var(--border-subtle-strong)", color: "var(--text-body)" },
                          { label: `📚 ${m.cadeira}`, bg: "#eff6ff", border: "#bfdbfe",             color: "var(--color-navy-mid)" },
                          {
                            label: m.tipo === 'Vídeo' ? `▶ ${m.tipo}` : `📄 ${m.tipo}`,
                            bg: m.tipo === 'Vídeo' ? "#eff6ff" : "#fff1f2",
                            border: m.tipo === 'Vídeo' ? "#bfdbfe" : "#fecdd3",
                            color: m.tipo === 'Vídeo' ? "var(--color-navy-mid)" : "#be123c",
                          },
                          {
                            label: `📅 ${new Date(m.data_upload).toLocaleDateString("pt-PT")}`,
                            bg: "var(--surface-hover)", border: "var(--border-subtle-strong)", color: "var(--text-muted)",
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
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
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
            style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 32px rgba(var(--color-navy-mid-rgb),0.07)" }}
          >
            {/* Cabeçalho + filtro */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-7 py-5"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <h2 className="flex items-center gap-2.5"
                style={{ fontSize: 18, fontWeight: 900, color: "var(--text-heading)" }}>
                <MessageCircle size={19} style={{ color: "var(--color-navy-mid)" }} />
                Mensagens do Chat
              </h2>
              <div className="flex items-center gap-3">
                <select
                  value={cursoChatFiltro}
                  onChange={e => setCursoChatFiltro(e.target.value)}
                  className="rounded-2xl px-4 py-2.5 text-sm outline-none appearance-none"
                  style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-body)", minWidth: 180 }}
                >
                  <option value="">Todos os cursos</option>
                  {cursos.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                </select>
                <button
                  onClick={() => fetchMensagens(cursoChatFiltro)}
                  className="rounded-2xl px-4 py-2.5 text-sm font-bold transition-all"
                  style={{ background: "var(--surface-hover)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--color-navy-mid)" }}
                >
                  Actualizar
                </button>
              </div>
            </div>

            <div className="p-6">
              {loadingChat ? (
                <div className="text-center p-12">
                  <div className="w-10 h-10 rounded-full border-4 animate-spin mx-auto mb-3"
                    style={{ borderColor: "rgba(var(--color-navy-mid-rgb),0.10)", borderTopColor: "var(--color-navy-mid)" }} />
                  <p style={{ color: "var(--text-muted)", fontWeight: 600 }}>A carregar mensagens...</p>
                </div>
              ) : mensagens.length === 0 ? (
                <div className="text-center rounded-[24px] p-12"
                  style={{ border: "2px dashed var(--border-subtle-strong)", background: "var(--surface-hover)" }}>
                  <MessageCircle size={32} style={{ color: "var(--text-faint)", margin: "0 auto 12px" }} />
                  <p style={{ fontSize: 16, fontWeight: 900, color: "var(--text-faint)" }}>Nenhuma mensagem encontrada.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {mensagens.map(msg => (
                    <div
                      key={msg.id}
                      className="group flex items-start gap-4 rounded-[18px] px-5 py-4 transition-all"
                      style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)" }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-subtle-strong)"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-subtle)"}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))",
                        display: "grid", placeItems: "center",
                        color: "var(--color-gold)", fontWeight: 900, fontSize: 14,
                      }}>
                        {msg.userName?.charAt(0).toUpperCase()}
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-heading)" }}>{msg.userName}</span>
                          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                            style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "var(--color-navy-mid)", letterSpacing: "0.15em" }}>
                            {msg.curso}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
                            {new Date(msg.timestamp).toLocaleString("pt-PT")}
                          </span>
                        </div>
                        <p style={{ fontSize: 14, color: "var(--text-body)", lineHeight: 1.55 }}>{msg.message}</p>
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

        {/* ═══ CONFIGURAÇÕES ════════════════════════════════════════ */}
        {aba === 'config' && configForm && (
          <div className="space-y-6">

            <form onSubmit={handleSalvarConfig}>
              <section
                className="rounded-[28px] overflow-hidden"
                style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 32px rgba(var(--color-navy-mid-rgb),0.07)" }}
              >
                <div className="flex items-center gap-2.5 px-7 py-5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <Settings size={19} style={{ color: "var(--color-navy-mid)" }} />
                  <h2 style={{ fontSize: 18, fontWeight: 900, color: "var(--text-heading)" }}>Identidade e Funcionalidades</h2>
                </div>

                <div className="p-7 space-y-6">
                  {/* Logótipo */}
                  <div className="flex items-center gap-5">
                    <div style={{
                      width: 72, height: 72, borderRadius: 20, display: "grid", placeItems: "center",
                      background: configForm.logo_url ? "var(--surface-hover)" : "linear-gradient(135deg,var(--color-gold-dark),var(--color-gold))",
                      border: "1px solid var(--border-subtle-strong)", overflow: "hidden", flexShrink: 0,
                    }}>
                      {configForm.logo_url
                        ? <img src={configForm.logo_url} alt="Logótipo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        : <Sparkles size={28} style={{ color: "var(--color-navy-deep)" }} />}
                    </div>
                    <div className="flex flex-col gap-2 items-start">
                      <label
                        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold cursor-pointer transition-all"
                        style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--color-navy-mid)" }}
                      >
                        <Upload size={15} /> {logoUploading ? "A enviar..." : "Carregar logótipo"}
                        <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoUpload} disabled={logoUploading} className="hidden" />
                      </label>
                      {configForm.logo_url && (
                        <button type="button" onClick={handleRemoverLogo} className="text-xs font-semibold" style={{ color: "#dc2626" }}>
                          Remover logótipo
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label style={{ display: "block", marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--text-muted)" }}>Nome da plataforma</label>
                      <input required value={configForm.nome_plataforma}
                        onChange={e => setConfigForm(f => ({ ...f, nome_plataforma: e.target.value }))}
                        className="w-full rounded-2xl px-5 py-3.5 text-sm outline-none"
                        style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--text-muted)" }}>Tagline</label>
                      <input value={configForm.tagline}
                        onChange={e => setConfigForm(f => ({ ...f, tagline: e.target.value }))}
                        className="w-full rounded-2xl px-5 py-3.5 text-sm outline-none"
                        style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--text-muted)" }}>Propósito da plataforma</label>
                    <textarea rows={3} value={configForm.descricao_proposito || ''}
                      onChange={e => setConfigForm(f => ({ ...f, descricao_proposito: e.target.value }))}
                      className="w-full rounded-2xl px-5 py-3.5 text-sm outline-none resize-none"
                      style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
                    <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6, lineHeight: 1.5 }}>
                      Mostrado publicamente e usado pela IA para avaliar se os materiais submetidos correspondem ao propósito da plataforma.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label style={{ display: "block", marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--text-muted)" }}>Email de contacto</label>
                      <input type="email" value={configForm.contacto_email || ''}
                        onChange={e => setConfigForm(f => ({ ...f, contacto_email: e.target.value }))}
                        className="w-full rounded-2xl px-5 py-3.5 text-sm outline-none"
                        style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--text-muted)" }}>Localização</label>
                      <input value={configForm.localizacao || ''}
                        onChange={e => setConfigForm(f => ({ ...f, localizacao: e.target.value }))}
                        className="w-full rounded-2xl px-5 py-3.5 text-sm outline-none"
                        style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label style={{ display: "block", marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--text-muted)" }}>Cor primária</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={configForm.cor_primaria}
                          onChange={e => setConfigForm(f => ({ ...f, cor_primaria: e.target.value }))}
                          style={{ width: 48, height: 44, borderRadius: 12, border: "1.5px solid rgba(var(--color-navy-mid-rgb),0.15)", cursor: "pointer", padding: 2 }} />
                        <input type="text" value={configForm.cor_primaria}
                          onChange={e => setConfigForm(f => ({ ...f, cor_primaria: e.target.value }))}
                          className="flex-1 rounded-2xl px-4 py-3 text-sm outline-none font-mono"
                          style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--text-muted)" }}>Cor de destaque</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={configForm.cor_destaque}
                          onChange={e => setConfigForm(f => ({ ...f, cor_destaque: e.target.value }))}
                          style={{ width: 48, height: 44, borderRadius: 12, border: "1.5px solid rgba(var(--color-navy-mid-rgb),0.15)", cursor: "pointer", padding: 2 }} />
                        <input type="text" value={configForm.cor_destaque}
                          onChange={e => setConfigForm(f => ({ ...f, cor_destaque: e.target.value }))}
                          className="flex-1 rounded-2xl px-4 py-3 text-sm outline-none font-mono"
                          style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
                      </div>
                    </div>
                  </div>

                  {/* Toggles de funcionalidades */}
                  <div>
                    <label style={{ display: "block", marginBottom: 10, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--text-muted)" }}>Funcionalidades</label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        { key: 'chat_activado',          label: 'Chat entre estudantes' },
                        { key: 'ia_activada',             label: 'Assistente de IA' },
                        { key: 'moderacao_ia_activada',   label: 'Moderação de IA nos uploads' },
                      ].map(({ key, label }) => (
                        <button key={key} type="button" onClick={() => setConfigForm(f => ({ ...f, [key]: !f[key] }))}
                          className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-sm font-bold transition-all"
                          style={configForm[key]
                            ? { background: "rgba(16,185,129,0.08)", border: "1.5px solid rgba(16,185,129,0.30)", color: "#065f46" }
                            : { background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-muted)" }}
                        >
                          {label}
                          <span style={{ width: 34, height: 20, borderRadius: 99, background: configForm[key] ? "#10b981" : "#cbd5e1", position: "relative", flexShrink: 0, transition: "background .2s" }}>
                            <span style={{ position: "absolute", top: 2, left: configForm[key] ? 16 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tipos de ficheiro */}
                  <div>
                    <label style={{ display: "block", marginBottom: 10, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--text-muted)" }}>Tipos de ficheiro permitidos</label>
                    <div className="flex flex-wrap gap-2">
                      {TIPOS_FICHEIRO_OPCOES.map(({ valor, label }) => {
                        const activo = configForm.tipos_ficheiro_permitidos.includes(valor);
                        return (
                          <button key={valor} type="button" onClick={() => toggleTipoFicheiro(valor)}
                            className="rounded-xl px-4 py-2.5 text-xs font-bold transition-all"
                            style={activo
                              ? { background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", color: "#fff" }
                              : { background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-muted)" }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="max-w-xs">
                    <label style={{ display: "block", marginBottom: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.22em", color: "var(--text-muted)" }}>Tamanho máximo por ficheiro (MB)</label>
                    <input type="number" min={1} max={500} value={configForm.tamanho_maximo_mb}
                      onChange={e => setConfigForm(f => ({ ...f, tamanho_maximo_mb: e.target.value }))}
                      className="w-full rounded-2xl px-5 py-3.5 text-sm outline-none"
                      style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
                  </div>

                  <button type="submit" disabled={savingConfig}
                    className="inline-flex items-center gap-2.5 rounded-2xl px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white transition-all duration-200 disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", boxShadow: "0 8px 28px rgba(var(--color-navy-deep-rgb),0.38)", letterSpacing: "0.08em" }}
                  >
                    <Save size={16} /> {savingConfig ? "A guardar..." : "Guardar configuração"}
                  </button>
                </div>
              </section>
            </form>

            {/* Cursos / Disciplinas */}
            <section
              className="rounded-[28px] overflow-hidden"
              style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 32px rgba(var(--color-navy-mid-rgb),0.07)" }}
            >
              <div className="flex items-center gap-2.5 px-7 py-5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <ShieldCheck size={19} style={{ color: "var(--color-navy-mid)" }} />
                <h2 style={{ fontSize: 18, fontWeight: 900, color: "var(--text-heading)" }}>Cursos / Disciplinas</h2>
              </div>
              <div className="p-7">
                <form onSubmit={handleAdicionarCurso} className="flex gap-3 mb-6">
                  <input value={novoCurso} onChange={e => setNovoCurso(e.target.value)} placeholder="Nome do novo curso"
                    className="flex-1 rounded-2xl px-5 py-3.5 text-sm outline-none"
                    style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
                  <button type="submit"
                    className="inline-flex items-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold text-white shrink-0 transition-all"
                    style={{ background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))" }}>
                    <Plus size={16} /> Adicionar
                  </button>
                </form>
                <div className="flex flex-wrap gap-2">
                  {cursos.length === 0 && (
                    <p style={{ fontSize: 13, color: "var(--text-faint)" }}>Nenhum curso configurado ainda.</p>
                  )}
                  {cursos.map(c => (
                    <span key={c.id}
                      className="inline-flex items-center gap-2 rounded-full pl-4 pr-2 py-2 text-sm font-semibold"
                      style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle-strong)", color: "var(--text-body)" }}
                    >
                      {c.nome}
                      <button type="button" onClick={() => handleRemoverCurso(c.id)}
                        className="rounded-full p-1 transition-colors"
                        style={{ color: "var(--text-faint)" }}
                        title="Remover curso"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

      </div>
    </>
  );
};

export default Admin;
