import React, { useState, useEffect } from "react";
import api, { getFavoritos } from "../services/api";
import { useNavigate } from "react-router-dom";
import {
  Library, PlayCircle, FileText, ChevronRight,
  Sparkles, ArrowRight, MessageCircle, TrendingUp,
  Users, Heart, BookOpen, Upload,
} from "lucide-react";
import { useConfig } from "../context/ConfigContext";

/* Card de estatística */
const StatCard = ({ icon: Icon, label, value, iconBg, glow, delay }) => (
  <div
    className="rounded-[24px] p-5 flex flex-col gap-3 animate-fade-in"
    style={{
      background: "rgba(255,255,255,0.09)",
      border: "1px solid rgba(255,255,255,0.12)",
      backdropFilter: "blur(16px)",
      animationDelay: delay,
    }}
  >
    <div className="flex items-center justify-between">
      <div className="w-11 h-11 rounded-2xl grid place-items-center" style={{ background: iconBg, boxShadow: glow }}>
        <Icon size={20} style={{ color: "var(--color-gold)" }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.28em", color: "rgba(var(--color-blue-sky-rgb),0.55)", textTransform: "uppercase" }}>
        {label}
      </span>
    </div>
    <p className="text-3xl font-black text-white leading-none"
      style={{ opacity: value === '--' ? 0.40 : 1 }}>{value ?? '—'}</p>
  </div>
);

/* Card de material compacto */
const MiniCard = ({ m, onClick }) => (
  <article
    onClick={onClick}
    className="group flex items-center gap-4 rounded-[20px] p-4 cursor-pointer transition-all duration-250"
    style={{
      background: "var(--surface-card-glass)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: "1px solid var(--border-subtle)",
      boxShadow: "0 2px 14px rgba(var(--color-navy-mid-rgb),0.06)",
    }}
    onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-3px)", e.currentTarget.style.boxShadow = "0 10px 36px rgba(var(--color-navy-mid-rgb),0.14), 0 0 0 1px rgba(var(--color-gold-rgb),0.12)")}
    onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 2px 14px rgba(var(--color-navy-mid-rgb),0.06)")}
  >
    <div
      className="w-11 h-11 rounded-2xl grid place-items-center shrink-0 transition-transform duration-250 group-hover:scale-110"
      style={m.tipo === 'Vídeo'
        ? { background: "#eff6ff", border: "1px solid #bfdbfe" }
        : { background: "#fff1f2", border: "1px solid #fecdd3" }
      }
    >
      {m.tipo === 'Vídeo'
        ? <PlayCircle size={20} style={{ color: "var(--color-navy-mid)" }} />
        : <FileText   size={20} style={{ color: "#be123c" }} />}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-bold truncate transition-colors group-hover:text-[var(--color-navy-mid)]" style={{ color: "var(--text-heading)" }}>
        {m.titulo}
      </p>
      <p style={{ fontSize: 12, color: "var(--text-faint)" }}>{m.cadeira} · {m.tipo}</p>
    </div>
    <ChevronRight size={16} className="shrink-0 transition-transform group-hover:translate-x-1" style={{ color: "var(--text-faint)" }} />
  </article>
);

const Dashboard = ({ usuarioLogado }) => {
  const { config } = useConfig();
  const [materiais, setMateriais]       = useState([]);
  const [meusMateriais, setMeusMat]     = useState([]);
  const [stats, setStats]               = useState(null);
  const [favMateriais, setFavMateriais] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    /* Materiais recentes */
    api.get("/materiais?page=1&limit=3")
      .then(res => setMateriais(res.data.materiais || []))
      .catch(() => setMateriais([]));

    /* Estatísticas — em caso de erro fica null → cards mostram "--" */
    api.get("/stats")
      .then(res => setStats(res.data))
      .catch(() => setStats({ total_materiais: '--', total_utilizadores: '--', total_pdfs: '--', total_videos: '--' }));

    /* Materiais do utilizador */
    api.get("/meus-materiais")
      .then(res => setMeusMat(res.data || []))
      .catch(() => setMeusMat([]));

    /* Favoritos */
    const ids = getFavoritos();
    if (ids.length > 0) {
      api.get("/materiais?limit=50")
        .then(res => {
          const todos = res.data.materiais || [];
          setFavMateriais(todos.filter(m => ids.includes(m.id)));
        })
        .catch(() => setFavMateriais([]));
    }
  }, []);

  const statCards = [
    {
      icon: Library, label: "Materiais",
      value: stats?.total_materiais ?? '…',
      iconBg: "linear-gradient(135deg, var(--color-navy-deep), var(--color-navy-mid))",
      glow: "0 6px 20px rgba(var(--color-navy-deep-rgb),0.40)", delay: "0.1s",
    },
    {
      icon: Users, label: "Estudantes",
      value: stats?.total_utilizadores ?? '…',
      iconBg: "linear-gradient(135deg, #0a3d62, var(--color-blue-accent))",
      glow: "0 6px 20px rgba(var(--color-blue-accent-rgb),0.35)", delay: "0.15s",
    },
    {
      icon: TrendingUp, label: "PDFs",
      value: stats?.total_pdfs ?? '…',
      iconBg: "linear-gradient(135deg, #be123c, #e11d48)",
      glow: "0 6px 20px rgba(225,29,72,0.35)", delay: "0.20s",
    },
    {
      icon: PlayCircle, label: "Vídeos",
      value: stats?.total_videos ?? '…',
      iconBg: "linear-gradient(135deg, #059669, #10b981)",
      glow: "0 6px 20px rgba(16,185,129,0.35)", delay: "0.25s",
    },
  ];

  return (
    <div className="grid gap-8 animate-fade-in">

      {/* ═══ HERO ══════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden rounded-[32px] text-white"
        style={{
          background: "linear-gradient(-45deg, var(--color-navy-abyss), var(--color-navy-deep), var(--color-navy), var(--color-navy-mid))",
          backgroundSize: "400% 400%",
          animation: "aurora-dash 10s ease infinite",
          boxShadow: "0 28px 90px rgba(var(--color-navy-abyss-rgb),0.55)",
          padding: "3rem",
        }}
      >
        <style>{`
          @keyframes aurora-dash {
            0%,100% { background-position: 0%   50%; }
            50%      { background-position: 100% 50%; }
          }
        `}</style>

        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse at 22% 28%, rgba(var(--color-gold-rgb),0.13) 0%, transparent 55%)",
        }} />
        <div className="absolute top-0 inset-x-0" style={{
          height: 3,
          background: "linear-gradient(90deg, transparent, var(--color-gold-dark), var(--color-gold), var(--color-gold-light), transparent)",
          opacity: 0.85,
        }} />

        <div className="relative grid gap-10 lg:grid-cols-[1.6fr_1fr] items-center">
          <div className="space-y-6">
            <div
              className="inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-[11px] font-bold uppercase"
              style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)", letterSpacing: "0.32em", color: "rgba(var(--color-gold-rgb),0.90)", backdropFilter: "blur(8px)" }}
            >
              <Sparkles size={14} style={{ color: "var(--color-gold)" }} /> {config.nome_plataforma}
            </div>

            <h1 className="font-black leading-tight" style={{ fontSize: "clamp(2.2rem,4vw,3rem)", letterSpacing: "-0.025em" }}>
              Olá, {usuarioLogado?.nome?.split(" ")[0]}!
            </h1>

            <p style={{ fontSize: 17, color: "rgba(var(--color-blue-sky-rgb),0.85)", lineHeight: 1.65, maxWidth: 440 }}>
              {stats?.materiais_hoje > 0
                ? `🎉 ${stats.materiais_hoje} novo(s) material(is) adicionado(s) hoje!`
                : "Descubra conteúdos novos e recursos recomendados no seu painel."}
            </p>

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                onClick={() => navigate("/repositorio")}
                className="inline-flex items-center gap-2.5 rounded-full font-black text-sm transition-all duration-250"
                style={{ background: "linear-gradient(135deg, var(--color-gold-dark), var(--color-gold), var(--color-gold-light))", color: "var(--color-navy-deep)", padding: "12px 28px", boxShadow: "0 8px 30px rgba(var(--color-gold-rgb),0.50), inset 0 1px 0 rgba(255,255,255,0.35)" }}
                onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)", e.currentTarget.style.boxShadow = "0 14px 40px rgba(var(--color-gold-rgb),0.65), inset 0 1px 0 rgba(255,255,255,0.35)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 8px 30px rgba(var(--color-gold-rgb),0.50), inset 0 1px 0 rgba(255,255,255,0.35)")}
              >
                Explorar Repositório <ArrowRight size={17} />
              </button>
              <button
                onClick={() => navigate("/chat")}
                className="inline-flex items-center gap-2.5 rounded-full font-semibold text-sm transition-all duration-250"
                style={{ border: "1.5px solid rgba(255,255,255,0.20)", background: "rgba(255,255,255,0.09)", color: "#fff", padding: "12px 28px", backdropFilter: "blur(8px)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.17)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
              >
                <MessageCircle size={17} /> Entrar no Chat
              </button>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-3">
            {statCards.map(s => <StatCard key={s.label} {...s} />)}
          </div>
        </div>
      </section>

      {/* ═══ ACESSO RÁPIDO ═════════════════════════════════════════ */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: Library,       label: "Repositório",   desc: "Materiais aprovados", path: "/repositorio", bg: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", glow: "rgba(var(--color-navy-mid-rgb),0.40)" },
          ...(config.chat_activado ? [{ icon: MessageCircle, label: "Chat", desc: "Turma em tempo real", path: "/chat", bg: "linear-gradient(135deg,#0a3d62,var(--color-blue-accent))", glow: "rgba(var(--color-blue-accent-rgb),0.35)" }] : []),
          ...(config.ia_activada ? [{ icon: Sparkles, label: "Assistente IA", desc: "IA de estudo activa", path: "/repositorio", bg: "linear-gradient(135deg,#3b0764,#7c3aed)", glow: "rgba(124,58,237,0.35)" }] : []),
        ].map(({ icon: Icon, label, desc, path, bg, glow }) => (
          <button
            key={label} onClick={() => navigate(path)}
            className="group flex items-center gap-4 rounded-[24px] p-5 text-left transition-all duration-300"
            style={{
              background: "var(--surface-card-glass)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 4px 24px rgba(var(--color-navy-mid-rgb),0.06)",
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-3px)", e.currentTarget.style.boxShadow = `0 12px 40px ${glow}`)}
            onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 4px 24px rgba(var(--color-navy-mid-rgb),0.06)")}
          >
            <div className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 transition-transform group-hover:scale-110" style={{ background: bg, boxShadow: `0 6px 20px ${glow}` }}>
              <Icon size={22} style={{ color: "var(--color-gold)" }} />
            </div>
            <div className="min-w-0">
              <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text-heading)" }}>{label}</p>
              <p style={{ fontSize: 12, color: "var(--text-faint)" }}>{desc}</p>
            </div>
            <ChevronRight size={18} className="ml-auto transition-all group-hover:translate-x-1" style={{ color: "var(--text-faint)" }} />
          </button>
        ))}
      </section>

      {/* ═══ GRID: Materiais recentes + Favoritos + Meus uploads ═══ */}
      <div className="grid gap-8 xl:grid-cols-3">

        {/* Materiais recentes */}
        <div className="xl:col-span-2 space-y-5">
          <SectionHeader title="Materiais Recentes" icon={Library} onMore={() => navigate('/repositorio')} />
          <div className="space-y-3">
            {materiais.length === 0 ? (
              <EmptyState text="Ainda sem materiais publicados." />
            ) : (
              materiais.map(m => (
                <MiniCard key={m.id} m={m} onClick={() => navigate(`/video/${m.id}`)} />
              ))
            )}
          </div>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-8">
          {/* Favoritos */}
          <div className="space-y-4">
            <SectionHeader title="Favoritos" icon={Heart} color="#be123c" small />
            {favMateriais.length === 0 ? (
              <div className="rounded-[20px] p-5 text-center" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)" }}>
                <Heart size={24} style={{ color: "var(--text-faint)", margin: "0 auto 8px" }} />
                <p style={{ fontSize: 13, color: "var(--text-faint)" }}>Guarde materiais com ❤️ no repositório</p>
              </div>
            ) : (
              <div className="space-y-2">
                {favMateriais.slice(0, 3).map(m => (
                  <MiniCard key={m.id} m={m} onClick={() => navigate(`/video/${m.id}`)} />
                ))}
              </div>
            )}
          </div>

          {/* Meus uploads */}
          <div className="space-y-4">
            <SectionHeader title="Meus Uploads" icon={Upload} color="#7c3aed" small />
            {meusMateriais.length === 0 ? (
              <div className="rounded-[20px] p-5 text-center" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)" }}>
                <BookOpen size={24} style={{ color: "var(--text-faint)", margin: "0 auto 8px" }} />
                <p style={{ fontSize: 13, color: "var(--text-faint)" }}>Ainda não submeteu nenhum material</p>
              </div>
            ) : (
              <div className="space-y-2">
                {meusMateriais.slice(0, 4).map(m => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-[18px] p-3.5"
                    style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate" style={{ color: "var(--text-heading)" }}>{m.titulo}</p>
                      <p style={{ fontSize: 11, color: "var(--text-faint)" }}>{m.cadeira}</p>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase shrink-0"
                      style={m.status === 'aprovado'
                        ? { background: "var(--status-success-bg)", border: "1px solid var(--status-success-border)", color: "var(--status-success-text)" }
                        : m.status === 'pendente'
                        ? { background: "var(--status-warning-bg)", border: "1px solid var(--status-warning-border)", color: "var(--status-warning-text)" }
                        : { background: "var(--status-danger-bg)", border: "1px solid var(--status-danger-border)", color: "var(--status-danger-text)" }
                      }
                    >
                      {m.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* Auxiliares de UI */
const SectionHeader = ({ title, icon: Icon, color = "var(--color-navy-mid)", onMore, small }) => (
  <div className="flex items-center justify-between">
    <h2
      className="flex items-center gap-2"
      style={{ fontSize: small ? 16 : 20, fontWeight: 900, color: "var(--text-heading)", letterSpacing: "-0.01em" }}
    >
      <Icon size={small ? 17 : 20} style={{ color }} /> {title}
    </h2>
    {onMore && (
      <button
        onClick={onMore}
        className="text-sm font-bold transition-colors"
        style={{ color: "var(--color-navy-mid)" }}
      >
        Ver todos <ChevronRight size={14} style={{ display: "inline" }} />
      </button>
    )}
  </div>
);

const EmptyState = ({ text }) => (
  <div
    className="rounded-[20px] p-10 text-center"
    style={{ border: "2px dashed var(--border-subtle-strong)", background: "var(--surface-card)" }}
  >
    <p style={{ fontSize: 14, color: "var(--text-faint)" }}>{text}</p>
  </div>
);

export default Dashboard;
