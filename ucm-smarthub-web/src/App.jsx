import React, { useState, useCallback, Suspense, lazy } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import "./App.css";

import SplashScreen from "./components/SplashScreen";
import Layout      from "./components/Layout";
import { useConfig } from "./context/ConfigContext";

// ─── Lazy loading: cada página só carrega quando for acedida ──
// Isto divide o bundle inicial de ~1 MB em pedaços de ~100–200 KB
const Login       = lazy(() => import("./pages/Login"));
const Dashboard   = lazy(() => import("./pages/Dashboard"));
const Repositorio = lazy(() => import("./pages/Repositorio"));
const Visualizador= lazy(() => import("./pages/Visualizador"));
const Admin       = lazy(() => import("./pages/Admin"));
const Chat        = lazy(() => import("./pages/Chat"));

// ─── Fallback de carregamento entre páginas ───────────────────
const PageLoader = () => (
  <div className="h-full flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-3">
      <div
        className="w-10 h-10 rounded-full border-4 animate-spin"
        style={{ borderColor: "rgba(var(--color-navy-mid-rgb),0.12)", borderTopColor: "var(--color-gold)" }}
      />
      <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(var(--color-navy-mid-rgb),0.45)" }}>A carregar...</p>
    </div>
  </div>
);

// ─── Leitura segura do localStorage ──────────────────────────
const lerUsuarioGuardado = () => {
  try {
    const raw = localStorage.getItem('usuarioLogado');
    if (!raw || raw === 'undefined' || raw === 'null') return null;
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem('usuarioLogado');
    return null;
  }
};

// Rede de segurança: token sem perfil guardado → estado corrompido, limpa tudo.
// Corre uma única vez (via lazy init do useState), sem precisar de efeito.
const sessaoValida = () => {
  const token = !!localStorage.getItem('token');
  if (token && !lerUsuarioGuardado()) {
    localStorage.removeItem('token');
    localStorage.removeItem('usuarioLogado');
    return false;
  }
  return token;
};

const App = () => {
  const { config } = useConfig();
  // Utilizadores já autenticados não precisam ver o splash
  const [splash,       setSplash]  = useState(() => !sessaoValida());
  const [isLoggedIn,   setLoggedIn]= useState(sessaoValida);
  const [usuarioLogado,setUsuario] = useState(lerUsuarioGuardado);
  const navigate = useNavigate();

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuarioLogado');
    setUsuario(null);
    setLoggedIn(false);
  }, []);

  const handleLoginSuccess = (dados) => {
    localStorage.setItem('usuarioLogado', JSON.stringify(dados));
    setUsuario(dados);
    setLoggedIn(true);
  };

  // ─── Splash screen (só para utilizadores novos / não autenticados) ───
  if (splash) {
    return (
      <SplashScreen
        onDone={() => {
          setSplash(false);
          if (!isLoggedIn) navigate("/");
        }}
      />
    );
  }

  // ─── Transição token→perfil ───────────────────────────────
  if (isLoggedIn && !usuarioLogado) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4" style={{ background: "var(--color-ice)" }}>
        <div className="w-12 h-12 rounded-full border-4 animate-spin" style={{ borderColor: "rgba(var(--color-navy-mid-rgb),0.15)", borderTopColor: "var(--color-gold)" }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(var(--color-navy-mid-rgb),0.50)" }}>A carregar perfil {config.nome_plataforma}...</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>

        {/* ─── ENTRADA (landing + login na mesma página) ──── */}
        <Route
          path="/"
          element={
            !isLoggedIn
              ? <Login onLogin={handleLoginSuccess} />
              : <Navigate to="/dashboard" replace />
          }
        />
        <Route
          path="/login"
          element={<Navigate to="/" replace />}
        />

        {/* ─── PRIVADAS (Layout sem path, guarda de auth) ─── */}
        <Route
          element={
            isLoggedIn && usuarioLogado
              ? <Layout usuarioLogado={usuarioLogado} onLogout={handleLogout} />
              : <Navigate to="/" replace />
          }
        >
          <Route path="dashboard"   element={<Dashboard   usuarioLogado={usuarioLogado} />} />
          <Route path="repositorio" element={<Repositorio usuarioLogado={usuarioLogado} />} />
          <Route path="video/:id"   element={<Visualizador usuarioLogado={usuarioLogado} />} />
          <Route path="admin"       element={<Admin       usuarioLogado={usuarioLogado} />} />
          <Route path="chat"        element={<Chat        usuarioLogado={usuarioLogado} />} />
        </Route>

        {/* ─── 404 ────────────────────────────────────────── */}
        <Route path="*" element={<Pagina404 navigate={navigate} />} />
      </Routes>
    </Suspense>
  );
};

const Pagina404 = ({ navigate }) => (
  <div className="h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: "var(--color-ice)" }}>
    <div className="animate-fade-in">
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.5em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 12 }}>Erro</p>
      <h1 style={{ fontSize: "clamp(5rem,15vw,9rem)", fontWeight: 900, color: "var(--color-navy-deep)", lineHeight: 1, marginBottom: 16 }}>404</h1>
      <p style={{ fontSize: 18, fontWeight: 700, color: "#64748b", marginBottom: 32 }}>A página que procura não existe.</p>
      <button
        onClick={() => navigate('/dashboard')}
        className="inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-sm font-black text-white uppercase tracking-wider transition-all duration-200"
        style={{ background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", boxShadow: "0 8px 28px rgba(var(--color-navy-deep-rgb),0.38)", letterSpacing: "0.10em" }}
        onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
        onMouseLeave={e => (e.currentTarget.style.transform = "")}
      >
        Voltar ao início
      </button>
    </div>
  </div>
);

export default App;
