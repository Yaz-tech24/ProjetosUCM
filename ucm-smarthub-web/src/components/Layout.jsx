import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { BookOpen, Home, Library, ShieldCheck, Search, MessageCircle, LogOut, Bell, X, FileText, PlayCircle } from 'lucide-react';
import Chatbot from './Chatbot';
import api from '../services/api';

const NAV_ITEMS = [
  { label: 'Painel Inicial',  icon: Home,          path: '/dashboard'   },
  { label: 'Repositório',     icon: Library,       path: '/repositorio' },
  { label: 'Chat Estudantes', icon: MessageCircle, path: '/chat'        },
];

const Layout = ({ usuarioLogado, onLogout }) => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [searchTerm,   setSearchTerm]   = useState('');
  const [notifOpen,    setNotifOpen]    = useState(false);
  const [notifMats,    setNotifMats]    = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef(null);

  /* Carrega os 5 materiais mais recentes para as notificações */
  const loadNotifs = async () => {
    if (notifMats.length > 0) { setNotifOpen(o => !o); return; }
    setNotifLoading(true);
    setNotifOpen(true);
    try {
      const res = await api.get('/materiais?page=1&limit=5');
      setNotifMats(res.data.materiais || []);
    } catch { setNotifMats([]); }
    finally { setNotifLoading(false); }
  };

  /* Fecha ao clicar fora */
  useEffect(() => {
    const handler = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => { if (onLogout) onLogout(); navigate('/login'); };

  /* Pesquisa global: navega para repositório com ?q= */
  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    navigate(`/repositorio?q=${encodeURIComponent(searchTerm.trim())}`);
    setSearchTerm('');
  };

  if (!usuarioLogado) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: "var(--color-ice)" }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-12 h-12 rounded-full border-4 animate-spin"
            style={{ borderColor: "rgba(var(--color-navy-mid-rgb),0.15)", borderTopColor: "var(--color-gold)" }}
          />
          <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(var(--color-navy-mid-rgb),0.50)" }}>A redirecionar...</p>
        </div>
      </div>
    );
  }

  const isActive = (path) => location.pathname === path;

  return (
    <div className="flex min-h-screen font-sans" style={{
      background: `
        radial-gradient(ellipse at 8%  8%,  rgba(var(--color-gold-rgb),.08)    0%, transparent 36%),
        radial-gradient(ellipse at 92% 92%, rgba(0,51,102,.08)     0%, transparent 36%),
        radial-gradient(ellipse at 55% 45%, rgba(var(--color-blue-sky-rgb),.06)  0%, transparent 54%),
        var(--color-ice)
      `,
      color: "#0f172a",
    }}>

      {/* ═══ SIDEBAR ══════════════════════════════════════════════ */}
      <aside
        className="w-72 xl:w-80 flex flex-col relative overflow-hidden"
        style={{
          background: "linear-gradient(-45deg, var(--color-navy-abyss), var(--color-navy-deep), var(--color-navy), #0a1d38)",
          backgroundSize: "400% 400%",
          animation: "aurora-sidebar 14s ease infinite",
          boxShadow: "8px 0 48px rgba(var(--color-navy-abyss-rgb),0.45)",
        }}
      >
        <style>{`
          @keyframes aurora-sidebar {
            0%,100% { background-position: 0%   50%; }
            50%      { background-position: 100% 50%; }
          }
          @keyframes glow-logo-small {
            0%,100% { box-shadow: 0 0 24px rgba(var(--color-gold-rgb),0.45); }
            50%      { box-shadow: 0 0 42px rgba(var(--color-gold-rgb),0.75), 0 0 70px rgba(var(--color-gold-rgb),0.25); }
          }
          @keyframes badge-pulse {
            0%,100% { transform: scale(1); }
            50%      { transform: scale(1.18); }
          }
        `}</style>

        <div
          className="absolute inset-0 pointer-events-none opacity-35"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
        <div
          className="absolute top-0 bottom-0 left-0 w-[2px] pointer-events-none"
          style={{ background: "linear-gradient(180deg, transparent, rgba(var(--color-gold-rgb),0.6) 30%, rgba(var(--color-gold-rgb),0.3) 70%, transparent)" }}
        />

        {/* Barra dourada topo */}
        <div
          className="h-[3px] shrink-0"
          style={{ background: "linear-gradient(90deg, transparent, var(--color-gold-dark), var(--color-gold), var(--color-gold-light), var(--color-gold), var(--color-gold-dark), transparent)" }}
        />

        {/* Logo */}
        <div className="relative px-7 pt-7 pb-6 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-4">
            <div
              className="w-[52px] h-[52px] rounded-[18px] grid place-items-center shrink-0"
              style={{
                background: "linear-gradient(135deg, var(--color-gold-dark) 0%, var(--color-gold) 55%, var(--color-gold-light) 100%)",
                color: "var(--color-navy-deep)",
                animation: "glow-logo-small 2.5s ease-in-out infinite",
              }}
            >
              <BookOpen size={24} strokeWidth={1.7} />
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.38em", color: "rgba(var(--color-blue-sky-rgb),0.60)", textTransform: "uppercase" }}>UCM</p>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.1 }}>SmartHub</h1>
            </div>
          </div>
        </div>

        {/* Navegação */}
        <nav className="relative flex-1 px-5 pt-7 pb-4 space-y-1.5 overflow-y-auto">
          <p className="px-4 mb-5 text-[10px] font-bold uppercase" style={{ letterSpacing: "0.35em", color: "rgba(255,255,255,0.20)" }}>
            Menu Principal
          </p>

          {NAV_ITEMS.map(({ label, icon: Icon, path }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="w-full flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold transition-all duration-250"
                style={active ? {
                  background: "linear-gradient(135deg, var(--color-gold-dark), var(--color-gold), var(--color-gold-light))",
                  color: "var(--color-navy-deep)", fontWeight: 800,
                  boxShadow: "0 6px 24px rgba(var(--color-gold-rgb),0.40)",
                } : { color: "rgba(200,215,240,0.70)" }}
                onMouseEnter={e => !active && (e.currentTarget.style.background = "rgba(255,255,255,0.07)", e.currentTarget.style.color = "#fff")}
                onMouseLeave={e => !active && (e.currentTarget.style.background = "", e.currentTarget.style.color = "rgba(200,215,240,0.70)")}
              >
                <Icon size={19} />
                <span>{label}</span>
                {active && <span className="ml-auto w-2 h-2 rounded-full" style={{ background: "rgba(var(--color-navy-deep-rgb),0.40)" }} />}
              </button>
            );
          })}

          {usuarioLogado?.papel === 'admin' && (
            <>
              <p className="px-4 pt-6 mb-2 text-[10px] font-bold uppercase" style={{ letterSpacing: "0.35em", color: "rgba(255,255,255,0.20)" }}>
                Gestão
              </p>
              <button
                onClick={() => navigate('/admin')}
                className="w-full flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold transition-all duration-250"
                style={isActive('/admin') ? {
                  background: "rgba(255,255,255,0.95)", color: "var(--color-navy-mid)", fontWeight: 800,
                  boxShadow: "0 4px 16px rgba(var(--color-navy-abyss-rgb),0.25)",
                } : { border: "1px solid rgba(255,255,255,0.09)", color: "rgba(200,215,240,0.70)" }}
                onMouseEnter={e => !isActive('/admin') && (e.currentTarget.style.background = "rgba(255,255,255,0.07)", e.currentTarget.style.color = "#fff")}
                onMouseLeave={e => !isActive('/admin') && (e.currentTarget.style.background = "", e.currentTarget.style.color = "rgba(200,215,240,0.70)")}
              >
                <ShieldCheck size={19} />
                <span>Administração</span>
              </button>
            </>
          )}
        </nav>

        {/* Card de utilizador + logout */}
        <div className="relative px-5 pb-7 pt-4 space-y-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div
            className="flex items-center gap-3 rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}
          >
            <div
              className="w-11 h-11 rounded-2xl grid place-items-center text-base font-black shrink-0"
              style={{ background: "linear-gradient(135deg, var(--color-gold-dark), var(--color-gold), var(--color-gold-light))", color: "var(--color-navy-deep)", boxShadow: "0 4px 14px rgba(var(--color-gold-rgb),0.40)" }}
            >
              {usuarioLogado.nome?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold" style={{ color: "#fff" }}>{usuarioLogado.nome}</p>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.25em", color: "rgba(var(--color-blue-sky-rgb),0.50)", fontWeight: 600 }}>
                {usuarioLogado.papel} {usuarioLogado.curso ? `· ${usuarioLogado.curso}` : ''}
              </p>
            </div>
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "#34d399", boxShadow: "0 0 8px rgba(52,211,153,0.80)" }} />
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200"
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(200,215,240,0.60)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.40)"; e.currentTarget.style.color = "#fca5a5"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; e.currentTarget.style.color = "rgba(200,215,240,0.60)"; }}
          >
            <LogOut size={16} /> Terminar Sessão
          </button>
        </div>
      </aside>

      {/* ═══ CONTEÚDO PRINCIPAL ═══════════════════════════════════ */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header sticky com pesquisa funcional */}
        <header
          className="sticky top-0 z-20 px-8 py-5"
          style={{
            background: "rgba(var(--color-ice-rgb),0.88)",
            backdropFilter: "blur(28px) saturate(180%)",
            WebkitBackdropFilter: "blur(28px) saturate(180%)",
            borderBottom: "1px solid rgba(var(--color-navy-mid-rgb),0.08)",
            boxShadow: "0 1px 24px rgba(var(--color-navy-mid-rgb),0.06)",
          }}
        >
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.38em", color: "#94a3b8", textTransform: "uppercase" }}>
                UCM Tete · SmartHub
              </p>
              <h2 className="mt-1.5 leading-tight" style={{ fontSize: 26, fontWeight: 900, color: "var(--color-navy-deep)", letterSpacing: "-0.02em" }}>
                Bem-vindo,{' '}
                <span style={{ background: "linear-gradient(135deg, var(--color-navy-deep), var(--color-navy-mid))", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  {usuarioLogado?.nome?.split(' ')[0]}
                </span>
              </h2>
            </div>

            <div className="flex items-center gap-3">
              {/* Pesquisa que funciona */}
              <form onSubmit={handleSearch} className="flex items-center">
                <div
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 w-full max-w-sm transition-all duration-200"
                  style={{ background: "rgba(255,255,255,0.80)", border: "1.5px solid rgba(var(--color-navy-mid-rgb),0.10)", boxShadow: "0 2px 12px rgba(var(--color-navy-mid-rgb),0.05)" }}
                >
                  <Search size={17} style={{ color: "#94a3b8", flexShrink: 0 }} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Pesquisar materiais... (Enter)"
                    className="bg-transparent outline-none text-sm w-full"
                    style={{ color: "#0f172a" }}
                  />
                </div>
              </form>

              {/* Notificações — dropdown com materiais recentes */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={loadNotifs}
                  className="relative w-11 h-11 rounded-2xl grid place-items-center transition-all duration-200"
                  style={{ background: notifOpen ? "var(--color-navy-mid)" : "rgba(255,255,255,0.80)", border: "1.5px solid rgba(var(--color-navy-mid-rgb),0.10)", boxShadow: "0 2px 12px rgba(var(--color-navy-mid-rgb),0.05)", color: notifOpen ? "var(--color-gold)" : "#64748b" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--color-navy-mid)", e.currentTarget.style.color = "var(--color-gold)")}
                  onMouseLeave={e => !notifOpen && (e.currentTarget.style.background = "rgba(255,255,255,0.80)", e.currentTarget.style.color = "#64748b")}
                  title="Materiais recentes"
                >
                  <Bell size={18} />
                </button>

                {notifOpen && (
                  <div className="absolute right-0 top-14 z-50 w-80 rounded-[20px] overflow-hidden animate-scale-in"
                    style={{ background: "#fff", border: "1px solid rgba(var(--color-navy-mid-rgb),0.10)", boxShadow: "0 20px 60px rgba(var(--color-navy-mid-rgb),0.18)" }}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4"
                      style={{ borderBottom: "1px solid rgba(var(--color-navy-mid-rgb),0.07)", background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>Materiais Recentes</span>
                      <button onClick={() => setNotifOpen(false)} style={{ color: "rgba(255,255,255,0.50)", background: "none", border: "none", cursor: "pointer" }}>
                        <X size={15} />
                      </button>
                    </div>
                    {/* Lista */}
                    <div className="py-2">
                      {notifLoading ? (
                        <div className="flex justify-center py-6">
                          <div className="w-6 h-6 rounded-full border-[3px] animate-spin" style={{ borderColor: "rgba(var(--color-navy-mid-rgb),0.10)", borderTopColor: "var(--color-navy-mid)" }} />
                        </div>
                      ) : notifMats.length === 0 ? (
                        <p className="text-center py-6 text-sm" style={{ color: "#94a3b8" }}>Nenhum material disponível.</p>
                      ) : notifMats.map(m => (
                        <button key={m.id} onClick={() => { navigate(`/video/${m.id}`); setNotifOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
                          style={{ background: "transparent" }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--color-ice)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: "grid", placeItems: "center",
                            background: m.tipo === 'Vídeo' ? "#eff6ff" : "#fff1f2",
                            border: `1px solid ${m.tipo === 'Vídeo' ? "#bfdbfe" : "#fecdd3"}` }}>
                            {m.tipo === 'Vídeo' ? <PlayCircle size={15} style={{ color: "var(--color-navy-mid)" }} /> : <FileText size={15} style={{ color: "#be123c" }} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate" style={{ fontSize: 13, fontWeight: 700, color: "var(--color-navy-deep)" }}>{m.titulo}</p>
                            <p style={{ fontSize: 11, color: "#94a3b8" }}>{m.cadeira}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(var(--color-navy-mid-rgb),0.07)" }}>
                      <button onClick={() => { navigate('/repositorio'); setNotifOpen(false); }}
                        className="w-full rounded-xl py-2 text-xs font-bold transition-all"
                        style={{ background: "var(--color-ice)", color: "var(--color-navy-mid)" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--color-ice-mid)"}
                        onMouseLeave={e => e.currentTarget.style.background = "var(--color-ice)"}
                      >
                        Ver todos no Repositório →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8" style={{
          background: `
            radial-gradient(ellipse at 18% 18%, rgba(var(--color-blue-accent-rgb),.055) 0%, transparent 48%),
            radial-gradient(ellipse at 82% 82%, rgba(var(--color-navy-mid-rgb),.045)  0%, transparent 48%),
            radial-gradient(ellipse at 50% 50%, rgba(var(--color-blue-sky-rgb),.035) 0%, transparent 62%),
            transparent
          `
        }}>
          <Outlet />
        </div>

        <Chatbot usuarioLogado={usuarioLogado} />
      </main>
    </div>
  );
};

export default Layout;
