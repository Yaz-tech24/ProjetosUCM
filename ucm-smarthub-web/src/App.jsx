import React, { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import "./App.css";

import SplashScreen from "./components/SplashScreen";
import Layout      from "./components/Layout";
import api          from "./services/api";
import { useConfig } from "./context/ConfigContext";

// ─── Lazy loading: cada página só carrega quando for acedida ──
// Isto divide o bundle inicial de ~1 MB em pedaços de ~100–200 KB
const Login       = lazy(() => import("./pages/Login"));
const Dashboard   = lazy(() => import("./pages/Dashboard"));
const Repositorio = lazy(() => import("./pages/Repositorio"));
const Visualizador= lazy(() => import("./pages/Visualizador"));
const Admin       = lazy(() => import("./pages/Admin"));
const Chat        = lazy(() => import("./pages/Chat"));
const Perfil      = lazy(() => import("./pages/Perfil"));
const ReporSenha  = lazy(() => import("./pages/ReporSenha"));

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
// A sessão real vive num cookie httpOnly que este código nunca consegue ler
// (ver services/api.js) — o utilizador guardado aqui é só uma cache
// optimista para não mostrar um ecrã em branco enquanto a sessão é
// confirmada junto do servidor (ver o efeito de verificação abaixo).
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

const App = () => {
  const { config } = useConfig();
  const usuarioCache = lerUsuarioGuardado();
  // Utilizadores já autenticados (segundo a cache) não precisam ver o splash
  const [splash,        setSplash]      = useState(() => !usuarioCache);
  const [isLoggedIn,    setLoggedIn]    = useState(!!usuarioCache);
  const [usuarioLogado, setUsuario]     = useState(usuarioCache);
  // Enquanto há cache mas a sessão ainda não foi confirmada pelo servidor
  const [verificando,   setVerificando] = useState(!!usuarioCache);
  const navigate = useNavigate();

  // Confirma a sessão junto do servidor uma única vez, ao carregar — o
  // cookie httpOnly pode ter expirado ou sido invalidado sem que a cache
  // local saiba disso, por isso nunca se confia cegamente no localStorage
  // para decidir se o utilizador continua autenticado.
  useEffect(() => {
    if (!usuarioCache) return;
    api.get('/me')
      .then(res => {
        setUsuario(res.data.utilizador);
        localStorage.setItem('usuarioLogado', JSON.stringify(res.data.utilizador));
      })
      .catch(() => {
        localStorage.removeItem('usuarioLogado');
        setUsuario(null);
        setLoggedIn(false);
      })
      .finally(() => setVerificando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = useCallback(() => {
    api.post('/logout').catch(() => {}); // limpa o cookie no servidor; falha aqui não impede o logout local
    localStorage.removeItem('usuarioLogado');
    setUsuario(null);
    setLoggedIn(false);
  }, []);

  const handleLoginSuccess = (dados) => {
    localStorage.setItem('usuarioLogado', JSON.stringify(dados));
    setUsuario(dados);
    setLoggedIn(true);
  };

  const handleUpdateUsuario = useCallback((dados) => {
    setUsuario(atual => {
      const actualizado = { ...atual, ...dados };
      localStorage.setItem('usuarioLogado', JSON.stringify(actualizado));
      return actualizado;
    });
  }, []);

  // ─── Splash screen (só para utilizadores novos / não autenticados) ───
  // Nota: não força navegação para "/" ao terminar — as próprias rotas já
  // tratam do redireccionamento de utilizadores não autenticados, e forçar
  // aqui destruía deep links públicos como /repor-senha?token=...
  if (splash) {
    return <SplashScreen onDone={() => setSplash(false)} />;
  }

  // ─── A confirmar a sessão junto do servidor (ver efeito acima) ──
  if (verificando) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4" style={{ background: "var(--surface-page)" }}>
        <div className="w-12 h-12 rounded-full border-4 animate-spin" style={{ borderColor: "rgba(var(--color-navy-mid-rgb),0.15)", borderTopColor: "var(--color-gold)" }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)" }}>A carregar perfil {config.nome_plataforma}...</p>
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
        <Route
          path="/repor-senha"
          element={
            !isLoggedIn
              ? <ReporSenha />
              : <Navigate to="/dashboard" replace />
          }
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
          <Route path="perfil"      element={<Perfil      usuarioLogado={usuarioLogado} onUpdateUsuario={handleUpdateUsuario} />} />
        </Route>

        {/* ─── 404 ────────────────────────────────────────── */}
        <Route path="*" element={<Pagina404 navigate={navigate} />} />
      </Routes>
    </Suspense>
  );
};

const Pagina404 = ({ navigate }) => (
  <div className="h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background: "var(--surface-page)" }}>
    <div className="animate-fade-in">
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.5em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 12 }}>Erro</p>
      <h1 style={{ fontSize: "clamp(5rem,15vw,9rem)", fontWeight: 900, color: "var(--text-heading)", lineHeight: 1, marginBottom: 16 }}>404</h1>
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
