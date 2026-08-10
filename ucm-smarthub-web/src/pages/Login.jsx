import React, { useState } from "react";
import api from "../services/api";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, User, Lock, Mail, FileText, GraduationCap,
  ArrowRight, Library, MessageCircle, Sparkles, CheckCircle,
  AlertCircle, Globe, Share2, Menu, X,
} from "lucide-react";
import { CURSOS } from "../constants/cursos";

/* ─── Constantes de navegação / footer ─── */
const NAV_LINKS    = ["Sobre Nós", "Projectos", "Carreiras", "Contacto"];
const FOOTER_LINKS = ["Sobre", "Projectos", "Carreiras", "Sitemap"];
const SOCIALS = [
  { Icon: Mail,          href: "mailto:smarthub@ucm.ac.mz" },
  { Icon: Globe,         href: "#" },
  { Icon: MessageCircle, href: "#" },
  { Icon: Share2,        href: "#" },
];

/* ─── Card flutuante no painel hero ─── */
const FloatCard = ({ icon: Icon, label, value, delay, style }) => (
  <div
    className="absolute flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur-md"
    style={{
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.14)",
      boxShadow: "0 8px 32px rgba(2,11,24,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
      animation: `float-card 4.5s ease-in-out ${delay} infinite alternate`,
      ...style,
    }}
  >
    <div
      className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
      style={{
        background: "linear-gradient(135deg, rgba(255,215,0,.25), rgba(255,215,0,.12))",
        border: "1px solid rgba(255,215,0,.35)",
        boxShadow: "0 0 16px rgba(255,215,0,.20)",
      }}
    >
      <Icon size={17} style={{ color: "#ffd700" }} />
    </div>
    <div>
      <p style={{ fontSize: 10, color: "rgba(168,209,255,.55)", fontWeight: 600, lineHeight: 1, marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 15, color: "#fff", fontWeight: 900, lineHeight: 1 }}>{value}</p>
    </div>
  </div>
);

const FEATURES = [
  { icon: Library,       text: "Repositório de materiais aprovados" },
  { icon: MessageCircle, text: "Chat em tempo real com a turma"     },
  { icon: Sparkles,      text: "IA que resume PDFs automaticamente" },
];

/* ── Input reutilizável — DEVE estar fora do Login para não re-montar a cada render ── */
const InputField = ({ icon, ...props }) => (
  <div className="relative">
    <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "#94a3b8" }}>
      {icon}
    </div>
    <input
      {...props}
      className="w-full rounded-2xl py-4 pl-12 pr-4 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400"
      style={{ background: "rgba(240,245,255,.65)", border: "1.5px solid rgba(13,37,74,.11)", boxShadow: "0 2px 8px rgba(13,37,74,.04)" }}
      onFocus={e => { e.target.style.borderColor = "#0d254a"; e.target.style.background = "#fff"; e.target.style.boxShadow = "0 0 0 4px rgba(13,37,74,.08)"; }}
      onBlur={e  => { e.target.style.borderColor = "rgba(13,37,74,.11)"; e.target.style.background = "rgba(240,245,255,.65)"; e.target.style.boxShadow = "0 2px 8px rgba(13,37,74,.04)"; }}
    />
  </div>
);

/* ══════════════════════════════════════════════════════════════
   PÁGINA UNIFICADA — Landing + Login + Registo
══════════════════════════════════════════════════════════════ */
const Login = ({ onLogin }) => {
  const navigate = useNavigate();

  /* form state */
  const [isRegistering,    setIsRegistering]    = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [mensagem,         setMensagem]         = useState({ texto: "", tipo: "" });
  const [nome,             setNome]             = useState("");
  const [email,            setEmail]            = useState("");
  const [senha,            setSenha]            = useState("");
  const [codigoEstudante,  setCodigoEstudante]  = useState("");
  const [papel,            setPapel]            = useState("estudante");
  const [curso,            setCurso]            = useState("Informática");

  /* navbar mobile */
  const [mobileMenu, setMobileMenu] = useState(false);

  const validarCodigo = (c) => /^708\d{6}$/.test(c);

  const handleRegister = async (e) => {
    e.preventDefault();
    setMensagem({ texto: "", tipo: "" });
    if (papel === "estudante" && !validarCodigo(codigoEstudante))
      return setMensagem({ texto: "Código UCM inválido. Deve ter 9 dígitos e começar por 708.", tipo: "erro" });
    setLoading(true);
    try {
      await api.post("/register", { nome, email, senha, papel, curso, codigo: papel === "estudante" ? codigoEstudante : null });
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
    setPapel("estudante");
    setCurso("Informática");
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
          0%,100% { box-shadow: 0 0 24px rgba(255,215,0,.45); }
          50%      { box-shadow: 0 0 48px rgba(255,215,0,.80), 0 0 80px rgba(255,215,0,.25); }
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
        .lp-navlink { font-size:13px; font-weight:500; color:rgba(13,37,74,.65); text-decoration:none; transition:color .2s; }
        .lp-navlink:hover { color:#04122e; }
        .lp-footlink { font-size:11px; color:#64748b; text-decoration:none; transition:color .2s; }
        .lp-footlink:hover { color:#04122e; }
        .lp-social { color:#94a3b8; transition:color .2s; }
        .lp-social:hover { color:#c9a800; }
      `}</style>

      {/* ╔══════════════════════════════════════════════════════════╗
          ║  WRAPPER PRINCIPAL — flex column                        ║
          ╚══════════════════════════════════════════════════════════╝ */}
      <div
        style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          background: `
            radial-gradient(ellipse at 8%  8%,  rgba(255,215,0,.07)   0%, transparent 35%),
            radial-gradient(ellipse at 92% 92%, rgba(0,51,102,.07)    0%, transparent 35%),
            #f0f5ff
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
            background:"radial-gradient(ellipse, rgba(30,95,224,.22) 0%, rgba(30,95,224,.11) 38%, rgba(168,209,255,.06) 62%, transparent 78%)",
            filter:"blur(62px)",
            animation:"aurora-breath 7s ease-in-out infinite",
          }} />
          <div style={{
            position:"absolute", left:"50%", top:"50%",
            transform:"translate(-50%,-50%)",
            width:"min(38vw,420px)", height:"min(38vw,420px)", borderRadius:"50%",
            background:"radial-gradient(ellipse, rgba(59,130,246,.35) 0%, rgba(30,95,224,.18) 45%, transparent 72%)",
            filter:"blur(32px)",
            animation:"aurora-core 4.5s ease-in-out infinite alternate",
          }} />
          <div style={{
            position:"absolute", left:"50%", top:"50%",
            transform:"translate(-50%,-50%)",
            width:"min(26vw,290px)", height:"min(26vw,290px)", borderRadius:"50%",
            background:"radial-gradient(ellipse, rgba(168,209,255,.28) 0%, rgba(59,130,246,.10) 55%, transparent 75%)",
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
            background:"rgba(240,245,255,.90)",
            backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)",
            borderBottom:"1px solid rgba(13,37,74,.09)",
            boxShadow:"0 1px 20px rgba(13,37,74,.05)",
          }}
        >
          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:12, cursor:"default" }}>
            <div
              style={{
                width:40, height:40, borderRadius:13,
                background:"linear-gradient(135deg,#c9a800,#ffd700,#ffe88a)",
                display:"grid", placeItems:"center", color:"#04122e",
                boxShadow:"0 0 24px rgba(255,215,0,.45)",
                animation:"glow-logo-s 2.5s ease-in-out infinite",
              }}
            >
              <BookOpen size={20} strokeWidth={1.7} />
            </div>
            <div style={{ lineHeight:1 }}>
              <span style={{ display:"block", fontSize:9, fontWeight:700, letterSpacing:".44em", color:"rgba(13,37,74,.45)", textTransform:"uppercase", marginBottom:2 }}>UCM</span>
              <span style={{ display:"block", fontSize:18, fontWeight:900, color:"#04122e", letterSpacing:"-.02em" }}>SmartHub</span>
            </div>
          </div>

          {/* Links desktop */}
          <div className="hidden lg:flex" style={{ gap:28, alignItems:"center" }}>
            {NAV_LINKS.map(l => <a key={l} href="#" className="lp-navlink">{l}</a>)}
          </div>

          {/* Hamburger mobile */}
          <button
            className="lg:hidden"
            onClick={() => setMobileMenu(m => !m)}
            style={{ background:"none", border:"none", cursor:"pointer", padding:4, color:"#04122e" }}
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
              background:"rgba(240,245,255,.97)", backdropFilter:"blur(16px)",
              borderBottom:"1px solid rgba(13,37,74,.08)",
              padding:"18px 40px", display:"flex", flexDirection:"column", gap:18,
              boxShadow:"0 8px 32px rgba(13,37,74,.10)",
            }}
          >
            {NAV_LINKS.map(l => (
              <a key={l} href="#" className="lp-navlink" style={{ fontSize:14 }}
                onClick={() => setMobileMenu(false)}>
                {l}
              </a>
            ))}
          </div>
        )}

        {/* ── PAINÉIS (hero + formulário) ────────────────────────── */}
        <div style={{ flex:1, display:"flex", position:"relative", overflow:"hidden", minHeight:0 }}>

          {/* ═══ PAINEL ESQUERDO — HERO ═════════════════════════════ */}
          <div
            className="hidden lg:flex relative flex-1 flex-col justify-between overflow-hidden"
            style={{
              padding:"3.5rem",
              background:"linear-gradient(-45deg,#020b18,#04122e,#071832,#0d254a,#0a1f3d)",
              backgroundSize:"400% 400%",
              animation:"aurora-hero 10s ease infinite",
            }}
          >
            {/* dot pattern */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ backgroundImage:"radial-gradient(circle,rgba(255,255,255,.045) 1px,transparent 1px)", backgroundSize:"30px 30px" }} />
            {/* gold glow */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background:"radial-gradient(ellipse at 30% 35%,rgba(255,215,0,.10) 0%,transparent 55%)" }} />
            {/* gold top bar */}
            <div className="absolute top-0 inset-x-0"
              style={{ height:3, background:"linear-gradient(90deg,transparent,#c9a800,#ffd700,#ffe88a,transparent)" }} />
            {/* decorative corners */}
            {["top-5 left-5 border-t-2 border-l-2","top-5 right-5 border-t-2 border-r-2",
              "bottom-5 left-5 border-b-2 border-l-2","bottom-5 right-5 border-b-2 border-r-2"].map(c => (
              <div key={c} className={`absolute w-8 h-8 ${c}`} style={{ borderColor:"rgba(255,215,0,.28)" }} />
            ))}

            {/* float cards */}
            <FloatCard icon={Library}       label="Materiais aprovados" value="120+" delay="0s"   style={{ top:"17%", right:"6%"  }} />
            <FloatCard icon={MessageCircle} label="Mensagens hoje"       value="34"   delay="0.9s" style={{ top:"42%", right:"3%"  }} />
            <FloatCard icon={Sparkles}      label="Resumos gerados"      value="890"  delay="1.6s" style={{ bottom:"21%", right:"7%" }} />

            {/* logo */}
            <div className="relative z-10 flex items-center gap-4">
              <div style={{ width:54, height:54, borderRadius:18, display:"grid", placeItems:"center",
                background:"linear-gradient(135deg,#c9a800,#ffd700,#ffe88a)", color:"#04122e",
                boxShadow:"0 0 36px rgba(255,215,0,.55)", animation:"glow-logo-s 2.5s ease-in-out infinite" }}>
                <BookOpen size={26} strokeWidth={1.7} />
              </div>
              <div>
                <p style={{ fontSize:10, fontWeight:700, letterSpacing:".44em", color:"rgba(168,209,255,.60)", textTransform:"uppercase" }}>UCM</p>
                <p style={{ fontSize:22, fontWeight:900, color:"#fff", lineHeight:1.1, letterSpacing:"-.02em" }}>SmartHub</p>
              </div>
            </div>

            {/* headline + features */}
            <div className="relative z-10 max-w-sm space-y-9">
              <div>
                <p className="mb-5 text-[11px] font-bold uppercase"
                  style={{ letterSpacing:".5em", color:"rgba(255,215,0,.60)" }}>
                  Plataforma académica · UCM Tete
                </p>
                <h1 className="text-[3.4rem] font-black leading-[1.02] tracking-tight text-white"
                  style={{ textShadow:"0 0 50px rgba(255,215,0,.18)" }}>
                  Aprenda.<br />
                  <span style={{ background:"linear-gradient(135deg,#c9a800,#ffd700,#ffe88a)",
                    WebkitBackgroundClip:"text", backgroundClip:"text", WebkitTextFillColor:"transparent" }}>
                    Partilhe.
                  </span><br />
                  Cresça.
                </h1>
              </div>

              <ul className="space-y-4">
                {FEATURES.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-4">
                    <div style={{ width:36, height:36, borderRadius:12, display:"grid", placeItems:"center", flexShrink:0,
                      background:"rgba(255,215,0,.12)", border:"1px solid rgba(255,215,0,.25)" }}>
                      <Icon size={16} style={{ color:"#ffd700" }} />
                    </div>
                    <span style={{ fontSize:14, color:"rgba(168,209,255,.80)", fontWeight:500 }}>{text}</span>
                  </li>
                ))}
              </ul>

              {/* social proof */}
              <div className="flex items-center gap-4 pt-1">
                <div className="flex -space-x-2.5">
                  {["#0d254a","#1a3a6b","#2a5298","#1e5fe0"].map((bg, i) => (
                    <div key={i}
                      style={{ width:36, height:36, borderRadius:"50%", display:"grid", placeItems:"center",
                        fontSize:12, fontWeight:900, color:"#fff", flexShrink:0,
                        background:bg, border:"2px solid rgba(255,255,255,.15)", boxShadow:"0 2px 8px rgba(2,11,24,.4)" }}>
                      {["A","B","C","D"][i]}
                    </div>
                  ))}
                </div>
                <p style={{ fontSize:12, color:"rgba(255,255,255,.40)", fontWeight:500 }}>
                  Já usado por centenas de estudantes
                </p>
              </div>
            </div>

            {/* copyright */}
            <p style={{ fontSize:10, color:"rgba(255,255,255,.18)", fontWeight:500, letterSpacing:".10em", position:"relative", zIndex:10 }}>
              © 2025 Universidade Católica de Moçambique · Extensão de Tete
            </p>
          </div>

          {/* ═══ PAINEL DIREITO — FORMULÁRIO ════════════════════════ */}
          <div
            className="flex flex-col justify-center items-center w-full lg:w-[490px] xl:w-[530px] shrink-0 overflow-y-auto"
            style={{
              padding:"2.5rem 3.5rem",
              background:"#ffffff",
              boxShadow:"-28px 0 90px rgba(4,18,46,.14)",
              position:"relative", zIndex:15,
            }}
          >
            {/* Logo mobile */}
            <div className="flex items-center gap-3 mb-8 lg:hidden self-start">
              <div style={{ width:44, height:44, borderRadius:14, display:"grid", placeItems:"center",
                background:"linear-gradient(135deg,#0d254a,#071832)", color:"#ffd700",
                boxShadow:"0 4px 16px rgba(13,37,74,.35)" }}>
                <BookOpen size={21} />
              </div>
              <span style={{ fontSize:20, fontWeight:900, color:"#0d254a" }}>SmartHub UCM</span>
            </div>

            <div className="w-full max-w-[370px]">

              {/* badge de estado */}
              <div className="mb-9">
                <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-5"
                  style={{ background:"rgba(13,37,74,.06)", border:"1px solid rgba(13,37,74,.10)" }}>
                  <div className="w-2 h-2 rounded-full" style={{ background:"#10b981", boxShadow:"0 0 6px rgba(16,185,129,.80)" }} />
                  <span style={{ fontSize:10, fontWeight:700, letterSpacing:".4em", color:"rgba(13,37,74,.60)", textTransform:"uppercase" }}>
                    {isRegistering ? "Novo acesso" : "Acesso seguro"}
                  </span>
                </div>
                <h2 className="leading-tight mb-2"
                  style={{ fontSize:"2.1rem", fontWeight:900, color:"#04122e", letterSpacing:"-.025em" }}>
                  {isRegistering ? "Criar conta UCM" : "Bem‑vindo\nde volta"}
                </h2>
                <p style={{ fontSize:14, color:"#94a3b8", lineHeight:1.65 }}>
                  {isRegistering
                    ? "Junte-se à comunidade académica da UCM Tete."
                    : "Aceda ao seu espaço de aprendizagem."}
                </p>
              </div>

              {/* alerta */}
              {mensagem.texto && (
                <div className="flex items-start gap-3 rounded-2xl px-4 py-3.5 mb-5 text-sm"
                  style={{
                    background: mensagem.tipo === "erro" ? "rgba(239,68,68,.07)" : "rgba(16,185,129,.07)",
                    border:     mensagem.tipo === "erro" ? "1px solid rgba(239,68,68,.25)" : "1px solid rgba(16,185,129,.25)",
                    color:      mensagem.tipo === "erro" ? "#b91c1c" : "#065f46",
                  }}>
                  {mensagem.tipo === "erro"
                    ? <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    : <CheckCircle size={16} className="shrink-0 mt-0.5" />}
                  <span style={{ fontWeight:600 }}>{mensagem.texto}</span>
                </div>
              )}

              <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">

                {isRegistering && (
                  <>
                    {/* toggle aluno / docente */}
                    <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl"
                      style={{ background:"#f0f5ff", border:"1px solid rgba(13,37,74,.09)" }}>
                      {[["estudante","Aluno"],["professor","Docente"]].map(([v, lbl]) => (
                        <button key={v} type="button" onClick={() => setPapel(v)}
                          className="rounded-xl py-2.5 text-sm font-bold transition-all duration-200"
                          style={papel === v
                            ? { background:"linear-gradient(135deg,#04122e,#0d254a)", color:"#fff", boxShadow:"0 4px 16px rgba(4,18,46,.30)" }
                            : { color:"#64748b" }}>
                          {v === "estudante" ? "🎓" : "👨‍🏫"} {lbl}
                        </button>
                      ))}
                    </div>

                    <InputField icon={<User size={17} />}
                      type="text" placeholder="Nome completo" required
                      value={nome} onChange={e => setNome(e.target.value)} />

                    {papel === "estudante" && (
                      <InputField icon={<FileText size={17} />}
                        type="text" placeholder="Código estudante (708xxxxxx)" required
                        value={codigoEstudante} onChange={e => setCodigoEstudante(e.target.value)} />
                    )}

                    <div className="relative">
                      <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color:"#94a3b8" }}>
                        <GraduationCap size={17} />
                      </div>
                      <select value={curso} onChange={e => setCurso(e.target.value)}
                        className="w-full rounded-2xl py-4 pl-12 pr-4 text-sm outline-none transition-all duration-200 appearance-none"
                        style={{ background:"rgba(240,245,255,.65)", border:"1.5px solid rgba(13,37,74,.11)", color:"#0f172a" }}>
                        {CURSOS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </>
                )}

                <InputField icon={<Mail size={17} />}
                  type="email" placeholder="Email institucional" required
                  value={email} onChange={e => setEmail(e.target.value)} />

                <InputField icon={<Lock size={17} />}
                  type="password" placeholder="Palavra-passe" required
                  value={senha} onChange={e => setSenha(e.target.value)} />

                {!isRegistering && (
                  <div className="flex justify-end -mt-1">
                    <button type="button" className="text-xs font-semibold transition-colors hover:text-[#0d254a]"
                      style={{ color:"#94a3b8" }}>
                      Esqueceu a senha?
                    </button>
                  </div>
                )}

                {/* botão principal */}
                <button
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-[14px] text-sm font-black uppercase tracking-[.10em] transition-all duration-250 disabled:opacity-60 mt-1"
                  style={{
                    background:"linear-gradient(135deg,#04122e 0%,#0d254a 60%,#1a3a6b 100%)",
                    color:"#fff",
                    boxShadow:"0 8px 32px rgba(4,18,46,.38), inset 0 1px 0 rgba(255,255,255,.08)",
                  }}
                  onMouseEnter={e => !loading && (e.currentTarget.style.transform="translateY(-2px)", e.currentTarget.style.boxShadow="0 12px 40px rgba(4,18,46,.50), inset 0 1px 0 rgba(255,255,255,.08)")}
                  onMouseLeave={e => (e.currentTarget.style.transform="", e.currentTarget.style.boxShadow="0 8px 32px rgba(4,18,46,.38), inset 0 1px 0 rgba(255,255,255,.08)")}
                >
                  {loading
                    ? <div className="w-5 h-5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
                    : <>{isRegistering ? "Criar Conta" : "Entrar no SmartHub"}<ArrowRight size={17} /></>
                  }
                </button>
              </form>

              {/* divisor */}
              <div className="relative my-6">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px" style={{ background:"#e8effc" }} />
                <div className="relative flex justify-center">
                  <span className="px-4 text-xs" style={{ background:"#fff", color:"#94a3b8", fontWeight:500 }}>
                    {isRegistering ? "Já tem conta?" : "Ainda não tem acesso?"}
                  </span>
                </div>
              </div>

              <button onClick={switchMode}
                className="w-full rounded-2xl py-3.5 text-sm font-bold transition-all duration-200"
                style={{ background:"rgba(13,37,74,.05)", border:"1.5px solid rgba(13,37,74,.10)", color:"#0d254a" }}
                onMouseEnter={e => (e.currentTarget.style.background="rgba(13,37,74,.09)", e.currentTarget.style.borderColor="rgba(13,37,74,.20)")}
                onMouseLeave={e => (e.currentTarget.style.background="rgba(13,37,74,.05)", e.currentTarget.style.borderColor="rgba(13,37,74,.10)")}
              >
                {isRegistering ? "Entrar na minha conta →" : "Criar conta gratuita →"}
              </button>

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
            background:"rgba(240,245,255,.90)",
            backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)",
            borderTop:"1px solid rgba(13,37,74,.09)",
          }}
        >
          <div>
            <p style={{ fontSize:11, color:"#04122e", fontWeight:700, marginBottom:2 }}>UCM Extensão de Tete</p>
            <p style={{ fontSize:10, color:"#94a3b8" }}>Tete, Moçambique · smarthub@ucm.ac.mz</p>
          </div>

          <div className="hidden sm:flex" style={{ gap:20 }}>
            {FOOTER_LINKS.map(l => <a key={l} href="#" className="lp-footlink">{l}</a>)}
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
