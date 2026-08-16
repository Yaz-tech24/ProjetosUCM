import React, { useState, useEffect } from "react";
import api from "../services/api";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, User, Lock, Mail, GraduationCap, MapPin, Info,
  ArrowRight, Library, MessageCircle, Sparkles, CheckCircle,
  AlertCircle, Menu, X,
} from "lucide-react";
import { useConfig } from "../context/ConfigContext";
import { FacebookIcon, InstagramIcon, LinkedinIcon } from "../components/SocialIcons";

/* ─── Painel "Sobre" — mostra a informação real e editável pelo admin
   (nome, propósito, localização, contacto) em vez de links falsos ─── */
const SobreModal = ({ config, onClose }) => (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center px-4"
    style={{ background: "rgba(var(--color-navy-abyss-rgb),0.55)", backdropFilter: "blur(8px)" }}
    onClick={onClose}
  >
    <div
      className="w-full max-w-md rounded-[28px] p-8 animate-scale-in"
      style={{ background: "#fff", border: "1px solid rgba(var(--color-navy-mid-rgb),0.08)", boxShadow: "0 30px 90px rgba(var(--color-navy-deep-rgb),0.30)" }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl grid place-items-center shrink-0"
            style={{ background: "linear-gradient(135deg,var(--color-gold-dark),var(--color-gold))", color: "var(--color-navy-deep)" }}>
            {config.logo_url
              ? <img src={config.logo_url} alt={config.nome_plataforma} className="w-full h-full object-contain rounded-2xl" />
              : <BookOpen size={22} />}
          </div>
          <h3 style={{ fontSize: 19, fontWeight: 900, color: "var(--color-navy-deep)" }}>{config.nome_plataforma}</h3>
        </div>
        <button onClick={onClose} style={{ color: "#94a3b8" }}><X size={18} /></button>
      </div>

      {config.descricao_proposito && (
        <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.7, marginBottom: 20 }}>{config.descricao_proposito}</p>
      )}

      <div className="space-y-3">
        {config.localizacao && (
          <div className="flex items-center gap-3">
            <MapPin size={16} style={{ color: "var(--color-navy-mid)", flexShrink: 0 }} />
            <span style={{ fontSize: 13.5, color: "#334155" }}>{config.localizacao}</span>
          </div>
        )}
        {config.contacto_email && (
          <a href={`mailto:${config.contacto_email}`} className="flex items-center gap-3" style={{ textDecoration: "none" }}>
            <Mail size={16} style={{ color: "var(--color-navy-mid)", flexShrink: 0 }} />
            <span style={{ fontSize: 13.5, color: "var(--color-navy-mid)", fontWeight: 600 }}>{config.contacto_email}</span>
          </a>
        )}
      </div>

      {(config.link_facebook || config.link_instagram || config.link_linkedin) && (
        <div className="flex items-center gap-4 mt-6 pt-5" style={{ borderTop: "1px solid #f1f5f9" }}>
          {config.link_facebook  && <a href={config.link_facebook}  className="lp-social"><FacebookIcon size={16} /></a>}
          {config.link_instagram && <a href={config.link_instagram} className="lp-social"><InstagramIcon size={16} /></a>}
          {config.link_linkedin  && <a href={config.link_linkedin}  className="lp-social"><LinkedinIcon size={16} /></a>}
        </div>
      )}
    </div>
  </div>
);

/* ─── Card flutuante no painel hero ─── */
const FloatCard = ({ icon: Icon, label, value, delay, style }) => (
  <div
    className="absolute flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur-md"
    style={{
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.14)",
      boxShadow: "0 8px 32px rgba(var(--color-navy-abyss-rgb),0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
      animation: `float-card 4.5s ease-in-out ${delay} infinite alternate`,
      ...style,
    }}
  >
    <div
      className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
      style={{
        background: "linear-gradient(135deg, rgba(var(--color-gold-rgb),.25), rgba(var(--color-gold-rgb),.12))",
        border: "1px solid rgba(var(--color-gold-rgb),.35)",
        boxShadow: "0 0 16px rgba(var(--color-gold-rgb),.20)",
      }}
    >
      <Icon size={17} style={{ color: "var(--color-gold)" }} />
    </div>
    <div>
      <p style={{ fontSize: 10, color: "rgba(var(--color-blue-sky-rgb),.55)", fontWeight: 600, lineHeight: 1, marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 15, color: "#fff", fontWeight: 900, lineHeight: 1 }}>{value}</p>
    </div>
  </div>
);

/* ── Input reutilizável — DEVE estar fora do Login para não re-montar a cada render ── */
const InputField = ({ icon, ...props }) => (
  <div className="relative">
    <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-faint)" }}>
      {icon}
    </div>
    <input
      {...props}
      className="w-full rounded-2xl py-4 pl-12 pr-4 text-sm outline-none transition-all duration-200"
      style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", boxShadow: "0 2px 8px rgba(var(--color-navy-mid-rgb),.04)", color: "var(--text-heading)" }}
      onFocus={e => { e.target.style.borderColor = "var(--color-navy-mid)"; e.target.style.background = "var(--surface-card)"; e.target.style.boxShadow = "0 0 0 4px rgba(var(--color-navy-mid-rgb),.08)"; }}
      onBlur={e  => { e.target.style.borderColor = "var(--border-subtle-strong)"; e.target.style.background = "var(--surface-input)"; e.target.style.boxShadow = "0 2px 8px rgba(var(--color-navy-mid-rgb),.04)"; }}
    />
  </div>
);

/* ══════════════════════════════════════════════════════════════
   PÁGINA UNIFICADA — Landing + Login + Registo
══════════════════════════════════════════════════════════════ */
const Login = ({ onLogin }) => {
  const navigate = useNavigate();
  const { config, cursos } = useConfig();

  /* form state */
  const [isRegistering,    setIsRegistering]    = useState(false);
  const [esqueciSenha,     setEsqueciSenha]     = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [mensagem,         setMensagem]         = useState({ texto: "", tipo: "" });
  const [nome,             setNome]             = useState("");
  const [email,            setEmail]            = useState("");
  const [senha,            setSenha]            = useState("");
  const [curso,            setCurso]            = useState("");
  const [stats,            setStats]            = useState(null);
  const [emailRecuperacao, setEmailRecuperacao] = useState("");

  /* navbar mobile */
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sobreAberto, setSobreAberto] = useState(false);

  /* Selecciona o primeiro curso disponível assim que a lista carrega */
  useEffect(() => {
    if (!curso && cursos.length > 0) setCurso(cursos[0].nome);
  }, [cursos, curso]);

  /* Números reais para o painel — nunca dados fabricados */
  useEffect(() => {
    api.get("/stats/publicas").then(res => setStats(res.data)).catch(() => setStats(null));
  }, []);

  // Headline do hero — deriva-se do tagline configurado pelo admin (separado por "·"),
  // com o mesmo efeito visual de 3 linhas de sempre. Cai para as 3 palavras por
  // defeito se o tagline estiver vazio ou não tiver o separador esperado.
  const segmentosTagline = (config.tagline || "").split("·").map(s => s.trim()).filter(Boolean);
  const HEADLINE_LINHAS = segmentosTagline.length >= 2 ? segmentosTagline : ["Aprenda", "Partilhe", "Cresça"];
  const indiceDestaque = Math.floor((HEADLINE_LINHAS.length - 1) / 2);

  const SOCIALS = [
    { Icon: Mail,          href: config.contacto_email ? `mailto:${config.contacto_email}` : null },
    { Icon: FacebookIcon,  href: config.link_facebook || null },
    { Icon: InstagramIcon, href: config.link_instagram || null },
    { Icon: LinkedinIcon,  href: config.link_linkedin || null },
  ].filter(s => s.href);

  const FEATURES = [
    { icon: Library, text: "Repositório de materiais aprovados" },
    ...(config.chat_activado ? [{ icon: MessageCircle, text: "Chat em tempo real com a turma" }] : []),
    ...(config.ia_activada   ? [{ icon: Sparkles, text: "IA que resume PDFs automaticamente" }] : []),
  ];

  const handleRegister = async (e) => {
    e.preventDefault();
    setMensagem({ texto: "", tipo: "" });
    setLoading(true);
    try {
      await api.post("/register", { nome, email, senha, curso });
      setMensagem({ texto: "Conta criada! Faça login para entrar.", tipo: "sucesso" });
      setIsRegistering(false);
      setSenha("");
    } catch (err) {
      setMensagem({ texto: err.response?.data?.erro || "Erro ao registar.", tipo: "erro" });
    } finally { setLoading(false); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setMensagem({ texto: "", tipo: "" });
    setLoading(true);
    try {
      const res = await api.post("/login", { email, senha });
      localStorage.setItem("token", res.data.token);
      onLogin(res.data.utilizador);
      navigate("/dashboard");
    } catch (err) {
      setMensagem({ texto: err.response?.data?.erro || "Email ou senha incorretos.", tipo: "erro" });
    } finally { setLoading(false); }
  };

  const switchMode = () => {
    setIsRegistering(v => !v);
    setMensagem({ texto: "", tipo: "" });
    setCurso(cursos[0]?.nome || "");
  };

  const handleEsqueciSenha = async (e) => {
    e.preventDefault();
    setMensagem({ texto: "", tipo: "" });
    setLoading(true);
    try {
      await api.post("/esqueci-senha", { email: emailRecuperacao });
      setMensagem({ texto: "Se esse email existir, foi enviado um link de recuperação.", tipo: "sucesso" });
    } catch (err) {
      setMensagem({ texto: err.response?.data?.erro || "Erro ao pedir recuperação de password.", tipo: "erro" });
    } finally { setLoading(false); }
  };

  const abrirEsqueciSenha = () => {
    setEsqueciSenha(true);
    setMensagem({ texto: "", tipo: "" });
    setEmailRecuperacao(email);
  };

  return (
    <>
      <style>{`
        @keyframes float-card {
          from { transform: translateY(0px) rotate(-.5deg); }
          to   { transform: translateY(-12px) rotate(.5deg); }
        }
        @keyframes aurora-hero {
          0%,100% { background-position: 0%   50%; }
          50%      { background-position: 100% 50%; }
        }
        @keyframes shimmer-line {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%);  }
        }
        @keyframes spin-slow    { to { transform: rotate(360deg);  } }
        @keyframes spin-reverse { to { transform: rotate(-360deg); } }
        @keyframes glow-logo-s {
          0%,100% { box-shadow: 0 0 24px rgba(var(--color-gold-rgb),.45); }
          50%      { box-shadow: 0 0 48px rgba(var(--color-gold-rgb),.80), 0 0 80px rgba(var(--color-gold-rgb),.25); }
        }

        /* aurora central azul */
        @keyframes aurora-breath {
          0%,100% { transform:translate(-50%,-50%) scale(1);    opacity:.90; }
          50%      { transform:translate(-50%,-50%) scale(1.08); opacity:.70; }
        }
        @keyframes aurora-core {
          0%   { transform:translate(-50%,-50%) scale(.92); opacity:.75; }
          100% { transform:translate(-50%,-50%) scale(1.10); opacity:1;   }
        }
        @keyframes aurora-drift {
          0%,100% { transform:translate(-50%,-50%) rotate(0deg)  scale(1);   opacity:.50; }
          33%     { transform:translate(-48%,-52%) rotate(8deg)  scale(1.05);opacity:.70; }
          66%     { transform:translate(-52%,-48%) rotate(-6deg) scale(.97); opacity:.55; }
        }

        /* nav / footer links */
        .lp-navlink { font-size:13px; font-weight:500; color:rgba(var(--color-navy-mid-rgb),.65); text-decoration:none; transition:color .2s; }
        .lp-navlink:hover { color:var(--color-navy-deep); }
        .lp-footlink { font-size:11px; color:#64748b; text-decoration:none; transition:color .2s; }
        .lp-footlink:hover { color:var(--color-navy-deep); }
        .lp-social { color:#94a3b8; transition:color .2s; }
        .lp-social:hover { color:var(--color-gold-dark); }
      `}</style>

      {/* ╔══════════════════════════════════════════════════════════╗
          ║  WRAPPER PRINCIPAL — flex column                        ║
          ╚══════════════════════════════════════════════════════════╝ */}
      <div
        style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          background: `
            radial-gradient(ellipse at 8%  8%,  rgba(var(--color-gold-rgb),.07)   0%, transparent 35%),
            radial-gradient(ellipse at 92% 92%, rgba(0,51,102,.07)    0%, transparent 35%),
            var(--color-ice)
          `,
          position: "relative",
        }}
      >

        {/* ── AURORA AZUL CENTRAL (camada global) ────────────────── */}
        <div aria-hidden="true" style={{ position:"absolute", inset:0, zIndex:10, pointerEvents:"none", overflow:"hidden" }}>
          <div style={{
            position:"absolute", left:"50%", top:"50%",
            transform:"translate(-50%,-50%)",
            width:"min(75vw,820px)", height:"min(75vw,820px)", borderRadius:"50%",
            background:"radial-gradient(ellipse, rgba(var(--color-blue-accent-rgb),.22) 0%, rgba(var(--color-blue-accent-rgb),.11) 38%, rgba(var(--color-blue-sky-rgb),.06) 62%, transparent 78%)",
            filter:"blur(62px)",
            animation:"aurora-breath 7s ease-in-out infinite",
          }} />
          <div style={{
            position:"absolute", left:"50%", top:"50%",
            transform:"translate(-50%,-50%)",
            width:"min(38vw,420px)", height:"min(38vw,420px)", borderRadius:"50%",
            background:"radial-gradient(ellipse, rgba(59,130,246,.35) 0%, rgba(var(--color-blue-accent-rgb),.18) 45%, transparent 72%)",
            filter:"blur(32px)",
            animation:"aurora-core 4.5s ease-in-out infinite alternate",
          }} />
          <div style={{
            position:"absolute", left:"50%", top:"50%",
            transform:"translate(-50%,-50%)",
            width:"min(26vw,290px)", height:"min(26vw,290px)", borderRadius:"50%",
            background:"radial-gradient(ellipse, rgba(var(--color-blue-sky-rgb),.28) 0%, rgba(59,130,246,.10) 55%, transparent 75%)",
            filter:"blur(20px)",
            animation:"aurora-drift 9s ease-in-out infinite",
          }} />
        </div>

        {/* ── NAVBAR ─────────────────────────────────────────────── */}
        <nav
          style={{
            position:"relative", zIndex:30, flexShrink:0,
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"14px 40px",
            background:"rgba(var(--color-ice-rgb),.90)",
            backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)",
            borderBottom:"1px solid rgba(var(--color-navy-mid-rgb),.09)",
            boxShadow:"0 1px 20px rgba(var(--color-navy-mid-rgb),.05)",
          }}
        >
          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:12, cursor:"default" }}>
            <div
              style={{
                width:40, height:40, borderRadius:13,
                background:"linear-gradient(135deg,var(--color-gold-dark),var(--color-gold),var(--color-gold-light))",
                display:"grid", placeItems:"center", color:"var(--color-navy-deep)",
                boxShadow:"0 0 24px rgba(var(--color-gold-rgb),.45)",
                animation:"glow-logo-s 2.5s ease-in-out infinite",
              }}
            >
              {config.logo_url
                ? <img src={config.logo_url} alt={config.nome_plataforma} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 13 }} />
                : <BookOpen size={20} strokeWidth={1.7} />}
            </div>
            <div style={{ lineHeight:1 }}>
              <span style={{ display:"block", fontSize:18, fontWeight:900, color:"var(--color-navy-deep)", letterSpacing:"-.02em" }}>{config.nome_plataforma}</span>
            </div>
          </div>

          {/* Links desktop */}
          <div className="hidden lg:flex" style={{ gap:28, alignItems:"center" }}>
            <button type="button" onClick={() => setSobreAberto(true)} className="lp-navlink" style={{ background:"none", border:"none", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
              <Info size={14} /> Sobre
            </button>
            {config.contacto_email && (
              <a href={`mailto:${config.contacto_email}`} className="lp-navlink">Contacto</a>
            )}
          </div>

          {/* Hamburger mobile */}
          <button
            className="lg:hidden"
            onClick={() => setMobileMenu(m => !m)}
            style={{ background:"none", border:"none", cursor:"pointer", padding:4, color:"var(--color-navy-deep)" }}
          >
            {mobileMenu ? <X size={22} /> : <Menu size={22} />}
          </button>
        </nav>

        {/* Mobile menu */}
        {mobileMenu && (
          <div
            className="lg:hidden"
            style={{
              position:"relative", zIndex:25,
              background:"rgba(var(--color-ice-rgb),.97)", backdropFilter:"blur(16px)",
              borderBottom:"1px solid rgba(var(--color-navy-mid-rgb),.08)",
              padding:"18px 40px", display:"flex", flexDirection:"column", gap:18,
              boxShadow:"0 8px 32px rgba(var(--color-navy-mid-rgb),.10)",
            }}
          >
            <button type="button" onClick={() => { setSobreAberto(true); setMobileMenu(false); }}
              className="lp-navlink" style={{ fontSize:14, background:"none", border:"none", cursor:"pointer", textAlign:"left", display:"inline-flex", alignItems:"center", gap:6 }}>
              <Info size={14} /> Sobre
            </button>
            {config.contacto_email && (
              <a href={`mailto:${config.contacto_email}`} className="lp-navlink" style={{ fontSize:14 }} onClick={() => setMobileMenu(false)}>
                Contacto
              </a>
            )}
          </div>
        )}

        {sobreAberto && <SobreModal config={config} onClose={() => setSobreAberto(false)} />}

        {/* ── PAINÉIS (hero + formulário) ────────────────────────── */}
        <div style={{ flex:1, display:"flex", position:"relative", overflow:"hidden", minHeight:0 }}>

          {/* ═══ PAINEL ESQUERDO — HERO ═════════════════════════════ */}
          <div
            className="hidden lg:flex relative flex-1 flex-col justify-between overflow-hidden"
            style={{
              padding:"3.5rem",
              background:"linear-gradient(-45deg,var(--color-navy-abyss),var(--color-navy-deep),var(--color-navy),var(--color-navy-mid),#0a1f3d)",
              backgroundSize:"400% 400%",
              animation:"aurora-hero 10s ease infinite",
            }}
          >
            {/* dot pattern */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ backgroundImage:"radial-gradient(circle,rgba(255,255,255,.045) 1px,transparent 1px)", backgroundSize:"30px 30px" }} />
            {/* gold glow */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background:"radial-gradient(ellipse at 30% 35%,rgba(var(--color-gold-rgb),.10) 0%,transparent 55%)" }} />
            {/* gold top bar */}
            <div className="absolute top-0 inset-x-0"
              style={{ height:3, background:"linear-gradient(90deg,transparent,var(--color-gold-dark),var(--color-gold),var(--color-gold-light),transparent)" }} />
            {/* decorative corners */}
            {["top-5 left-5 border-t-2 border-l-2","top-5 right-5 border-t-2 border-r-2",
              "bottom-5 left-5 border-b-2 border-l-2","bottom-5 right-5 border-b-2 border-r-2"].map(c => (
              <div key={c} className={`absolute w-8 h-8 ${c}`} style={{ borderColor:"rgba(var(--color-gold-rgb),.28)" }} />
            ))}

            {/* float cards — números reais, não mostrados enquanto não há dados */}
            {stats && (
              <>
                <FloatCard icon={Library}       label="Materiais aprovados" value={stats.total_materiais} delay="0s"   style={{ top:"17%", right:"6%"  }} />
                <FloatCard icon={MessageCircle} label="Mensagens trocadas"  value={stats.total_mensagens} delay="0.9s" style={{ top:"42%", right:"3%"  }} />
                <FloatCard icon={Sparkles}      label="Estudantes"          value={stats.total_utilizadores} delay="1.6s" style={{ bottom:"21%", right:"7%" }} />
              </>
            )}

            {/* logo */}
            <div className="relative z-10 flex items-center gap-4">
              <div style={{ width:54, height:54, borderRadius:18, display:"grid", placeItems:"center",
                background:"linear-gradient(135deg,var(--color-gold-dark),var(--color-gold),var(--color-gold-light))", color:"var(--color-navy-deep)",
                boxShadow:"0 0 36px rgba(var(--color-gold-rgb),.55)", animation:"glow-logo-s 2.5s ease-in-out infinite" }}>
                {config.logo_url
                  ? <img src={config.logo_url} alt={config.nome_plataforma} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 18 }} />
                  : <BookOpen size={26} strokeWidth={1.7} />}
              </div>
              <div>
                <p style={{ fontSize:22, fontWeight:900, color:"#fff", lineHeight:1.1, letterSpacing:"-.02em" }}>{config.nome_plataforma}</p>
              </div>
            </div>

            {/* headline + features */}
            <div className="relative z-10 max-w-sm space-y-9">
              <div>
                <p className="mb-5 text-[11px] font-bold uppercase"
                  style={{ letterSpacing:".5em", color:"rgba(var(--color-gold-rgb),.60)" }}>
                  Plataforma académica
                </p>
                <h1 className="text-[3.4rem] font-black leading-[1.02] tracking-tight text-white"
                  style={{ textShadow:"0 0 50px rgba(var(--color-gold-rgb),.18)" }}>
                  {HEADLINE_LINHAS.map((linha, i) => (
                    <React.Fragment key={i}>
                      {i === indiceDestaque
                        ? <span style={{ background:"linear-gradient(135deg,var(--color-gold-dark),var(--color-gold),var(--color-gold-light))",
                            WebkitBackgroundClip:"text", backgroundClip:"text", WebkitTextFillColor:"transparent" }}>
                            {linha}.
                          </span>
                        : `${linha}.`}
                      {i < HEADLINE_LINHAS.length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </h1>
              </div>

              <ul className="space-y-4">
                {FEATURES.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-4">
                    <div style={{ width:36, height:36, borderRadius:12, display:"grid", placeItems:"center", flexShrink:0,
                      background:"rgba(var(--color-gold-rgb),.12)", border:"1px solid rgba(var(--color-gold-rgb),.25)" }}>
                      <Icon size={16} style={{ color:"var(--color-gold)" }} />
                    </div>
                    <span style={{ fontSize:14, color:"rgba(var(--color-blue-sky-rgb),.80)", fontWeight:500 }}>{text}</span>
                  </li>
                ))}
              </ul>

              {/* social proof — só aparece quando há utilizadores reais a mostrar */}
              {stats?.total_utilizadores > 0 && (
                <p style={{ fontSize:12, color:"rgba(255,255,255,.40)", fontWeight:500 }}>
                  Já usado por {stats.total_utilizadores} estudante{stats.total_utilizadores !== 1 ? 's' : ''} e professores
                </p>
              )}
            </div>

            {/* copyright */}
            <p style={{ fontSize:10, color:"rgba(255,255,255,.18)", fontWeight:500, letterSpacing:".10em", position:"relative", zIndex:10 }}>
              © {new Date().getFullYear()} {config.nome_plataforma}
            </p>
          </div>

          {/* ═══ PAINEL DIREITO — FORMULÁRIO ════════════════════════ */}
          <div
            className="flex flex-col justify-center items-center w-full lg:w-[490px] xl:w-[530px] shrink-0 overflow-y-auto"
            style={{
              padding:"2.5rem 3.5rem",
              background:"var(--surface-card)",
              boxShadow:"-28px 0 90px rgba(var(--color-navy-deep-rgb),.14)",
              position:"relative", zIndex:15,
            }}
          >
            {/* Logo mobile */}
            <div className="flex items-center gap-3 mb-8 lg:hidden self-start">
              <div style={{ width:44, height:44, borderRadius:14, display:"grid", placeItems:"center",
                background:"linear-gradient(135deg,var(--color-navy-mid),var(--color-navy))", color:"var(--color-gold)",
                boxShadow:"0 4px 16px rgba(var(--color-navy-mid-rgb),.35)" }}>
                {config.logo_url
                  ? <img src={config.logo_url} alt={config.nome_plataforma} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 14 }} />
                  : <BookOpen size={21} />}
              </div>
              <span style={{ fontSize:20, fontWeight:900, color:"var(--text-heading)" }}>{config.nome_plataforma}</span>
            </div>

            <div className="w-full max-w-[370px]">

              {/* badge de estado */}
              <div className="mb-9">
                <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-5"
                  style={{ background:"var(--surface-hover)", border:"1px solid var(--border-subtle-strong)" }}>
                  <div className="w-2 h-2 rounded-full" style={{ background:"#10b981", boxShadow:"0 0 6px rgba(16,185,129,.80)" }} />
                  <span style={{ fontSize:10, fontWeight:700, letterSpacing:".4em", color:"var(--text-muted)", textTransform:"uppercase" }}>
                    {esqueciSenha ? "Recuperação" : isRegistering ? "Novo acesso" : "Acesso seguro"}
                  </span>
                </div>
                <h2 className="leading-tight mb-2"
                  style={{ fontSize:"2.1rem", fontWeight:900, color:"var(--text-heading)", letterSpacing:"-.025em" }}>
                  {esqueciSenha ? "Recuperar acesso" : isRegistering ? "Criar conta" : "Bem‑vindo\nde volta"}
                </h2>
                <p style={{ fontSize:14, color:"var(--text-faint)", lineHeight:1.65 }}>
                  {esqueciSenha
                    ? "Indique o seu email e enviamos um link para repor a palavra-passe."
                    : isRegistering
                    ? "Junte-se à nossa comunidade académica como estudante. Contas de docente são criadas pela administração."
                    : "Aceda ao seu espaço de aprendizagem."}
                </p>
              </div>

              {/* alerta */}
              {mensagem.texto && (
                <div className="flex items-start gap-3 rounded-2xl px-4 py-3.5 mb-5 text-sm"
                  style={{
                    background: mensagem.tipo === "erro" ? "var(--status-danger-bg)" : "var(--status-success-bg)",
                    border:     mensagem.tipo === "erro" ? "1px solid var(--status-danger-border)" : "1px solid var(--status-success-border)",
                    color:      mensagem.tipo === "erro" ? "var(--status-danger-text)" : "var(--status-success-text)",
                  }}>
                  {mensagem.tipo === "erro"
                    ? <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    : <CheckCircle size={16} className="shrink-0 mt-0.5" />}
                  <span style={{ fontWeight:600 }}>{mensagem.texto}</span>
                </div>
              )}

              {esqueciSenha ? (
                <form onSubmit={handleEsqueciSenha} className="space-y-4">
                  <InputField icon={<Mail size={17} />}
                    type="email" placeholder="Email institucional" required
                    value={emailRecuperacao} onChange={e => setEmailRecuperacao(e.target.value)} />

                  <button
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-[14px] text-sm font-black uppercase tracking-[.10em] transition-all duration-250 disabled:opacity-60 mt-1"
                    style={{
                      background:"linear-gradient(135deg,var(--color-navy-deep) 0%,var(--color-navy-mid) 60%,var(--color-navy-bright) 100%)",
                      color:"#fff",
                      boxShadow:"0 8px 32px rgba(var(--color-navy-deep-rgb),.38), inset 0 1px 0 rgba(255,255,255,.08)",
                    }}
                  >
                    {loading
                      ? <div className="w-5 h-5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
                      : <>Enviar link de recuperação<ArrowRight size={17} /></>
                    }
                  </button>

                  <button type="button" onClick={() => setEsqueciSenha(false)}
                    className="w-full text-center text-xs font-semibold pt-1 transition-colors hover:text-[var(--color-navy-mid)]"
                    style={{ color:"var(--text-faint)" }}>
                    ← Voltar ao início de sessão
                  </button>
                </form>
              ) : (
              <>
              <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">

                {isRegistering && (
                  <>
                    <InputField icon={<User size={17} />}
                      type="text" placeholder="Nome completo" required
                      value={nome} onChange={e => setNome(e.target.value)} />

                    <div className="relative">
                      <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color:"var(--text-faint)" }}>
                        <GraduationCap size={17} />
                      </div>
                      <select value={curso} onChange={e => setCurso(e.target.value)}
                        className="w-full rounded-2xl py-4 pl-12 pr-4 text-sm outline-none transition-all duration-200 appearance-none"
                        style={{ background:"var(--surface-input)", border:"1.5px solid var(--border-subtle-strong)", color:"var(--text-heading)" }}>
                        {cursos.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                      </select>
                    </div>
                  </>
                )}

                <InputField icon={<Mail size={17} />}
                  type="email" placeholder="Email institucional" required
                  value={email} onChange={e => setEmail(e.target.value)} />

                <div>
                  <InputField icon={<Lock size={17} />}
                    type="password" placeholder="Palavra-passe" required minLength={isRegistering ? 8 : undefined}
                    value={senha} onChange={e => setSenha(e.target.value)} />
                  {isRegistering && (
                    <p className="mt-1.5 px-1" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                      Mínimo 8 caracteres, com pelo menos uma letra e um número.
                    </p>
                  )}
                </div>

                {!isRegistering && (
                  <div className="flex justify-end -mt-1">
                    <button type="button" onClick={abrirEsqueciSenha} className="text-xs font-semibold transition-colors hover:text-[var(--color-navy-mid)]"
                      style={{ color:"var(--text-faint)" }}>
                      Esqueceu a senha?
                    </button>
                  </div>
                )}

                {/* botão principal */}
                <button
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-[14px] text-sm font-black uppercase tracking-[.10em] transition-all duration-250 disabled:opacity-60 mt-1"
                  style={{
                    background:"linear-gradient(135deg,var(--color-navy-deep) 0%,var(--color-navy-mid) 60%,var(--color-navy-bright) 100%)",
                    color:"#fff",
                    boxShadow:"0 8px 32px rgba(var(--color-navy-deep-rgb),.38), inset 0 1px 0 rgba(255,255,255,.08)",
                  }}
                  onMouseEnter={e => !loading && (e.currentTarget.style.transform="translateY(-2px)", e.currentTarget.style.boxShadow="0 12px 40px rgba(var(--color-navy-deep-rgb),.50), inset 0 1px 0 rgba(255,255,255,.08)")}
                  onMouseLeave={e => (e.currentTarget.style.transform="", e.currentTarget.style.boxShadow="0 8px 32px rgba(var(--color-navy-deep-rgb),.38), inset 0 1px 0 rgba(255,255,255,.08)")}
                >
                  {loading
                    ? <div className="w-5 h-5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
                    : <>{isRegistering ? "Criar Conta" : "Entrar no SmartHub"}<ArrowRight size={17} /></>
                  }
                </button>
              </form>

              {/* divisor */}
              <div className="relative my-6">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px" style={{ background:"var(--border-subtle-strong)" }} />
                <div className="relative flex justify-center">
                  <span className="px-4 text-xs" style={{ background:"var(--surface-card)", color:"var(--text-faint)", fontWeight:500 }}>
                    {isRegistering ? "Já tem conta?" : "Ainda não tem acesso?"}
                  </span>
                </div>
              </div>

              <button onClick={switchMode}
                className="w-full rounded-2xl py-3.5 text-sm font-bold transition-all duration-200"
                style={{ background:"var(--surface-hover)", border:"1.5px solid var(--border-subtle-strong)", color:"var(--color-navy-mid)" }}
                onMouseEnter={e => (e.currentTarget.style.background="var(--color-ice-mid)", e.currentTarget.style.borderColor="var(--border-subtle-strong)")}
                onMouseLeave={e => (e.currentTarget.style.background="var(--surface-hover)", e.currentTarget.style.borderColor="var(--border-subtle-strong)")}
              >
                {isRegistering ? "Entrar na minha conta →" : "Criar conta gratuita →"}
              </button>
              </>
              )}
            </div>
          </div>
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────── */}
        <footer
          style={{
            position:"relative", zIndex:30, flexShrink:0,
            display:"flex", alignItems:"center", justifyContent:"space-between",
            flexWrap:"wrap", gap:12,
            padding:"13px 40px",
            background:"rgba(var(--color-ice-rgb),.90)",
            backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)",
            borderTop:"1px solid rgba(var(--color-navy-mid-rgb),.09)",
          }}
        >
          <div>
            <p style={{ fontSize:11, color:"var(--color-navy-deep)", fontWeight:700, marginBottom:2 }}>{config.nome_plataforma}</p>
            {(config.localizacao || config.contacto_email) && (
              <p style={{ fontSize:10, color:"#94a3b8" }}>
                {[config.localizacao, config.contacto_email].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <div className="hidden sm:flex" style={{ gap:20 }}>
            <button type="button" onClick={() => setSobreAberto(true)} className="lp-footlink" style={{ background:"none", border:"none", cursor:"pointer" }}>Sobre</button>
            {config.contacto_email && <a href={`mailto:${config.contacto_email}`} className="lp-footlink">Contacto</a>}
          </div>

          <div style={{ display:"flex", gap:14, alignItems:"center" }}>
            {SOCIALS.map(({ Icon, href }, i) => (
              <a key={i} href={href} className="lp-social"><Icon size={14} /></a>
            ))}
          </div>
        </footer>

      </div>
    </>
  );
};

export default Login;
