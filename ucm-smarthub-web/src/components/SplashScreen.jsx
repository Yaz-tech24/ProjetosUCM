import React, { useEffect, useState, useMemo } from "react";
import { BookOpen } from "lucide-react";

/* Partículas flutuantes geradas aleatoriamente */
const Particle = ({ style }) => (
  <div
    className="absolute rounded-full pointer-events-none"
    style={{
      width:  style.size,
      height: style.size,
      left:   style.left,
      top:    style.top,
      background: style.isGold
        ? `radial-gradient(circle, rgba(255,215,0,${style.opacity}) 0%, transparent 70%)`
        : `radial-gradient(circle, rgba(168,209,255,${style.opacity}) 0%, transparent 70%)`,
      animation: `particle-rise ${style.duration}s ease-out ${style.delay}s infinite`,
    }}
  />
);

const SplashScreen = ({ onDone }) => {
  const [phase, setPhase] = useState("enter"); // enter → show → fill → exit

  useEffect(() => {
    // Tempo total: ~1.7s (era 2.8s) — mais rápido, menos espera
    const t1 = setTimeout(() => setPhase("show"),   80);
    const t2 = setTimeout(() => setPhase("fill"),  500);
    const t3 = setTimeout(() => setPhase("exit"), 1600);
    const t4 = setTimeout(() => onDone(),          1950);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onDone]);

  /* Gera partículas de forma determinística */
  const particles = useMemo(() => (
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      size:     `${4 + (i * 3) % 8}px`,
      left:     `${(i * 17 + 5) % 96}%`,
      top:      `${(i * 13 + 20) % 80}%`,
      opacity:  0.4 + (i % 4) * 0.15,
      duration: 3.5 + (i % 5) * 0.8,
      delay:    (i % 7) * 0.4,
      isGold:   i % 3 === 0,
    }))
  ), []);

  const visible = phase !== "enter";
  const exiting = phase === "exit";

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(-45deg, #020b18, #04122e, #071832, #0d254a)",
        backgroundSize: "400% 400%",
        animation: "aurora 8s ease infinite",
        opacity: exiting ? 0 : 1,
        transition: exiting ? "opacity 0.40s cubic-bezier(0.4,0,1,1)" : "none",
        pointerEvents: exiting ? "none" : "all",
      }}
    >
      {/* CSS de animações inline */}
      <style>{`
        @keyframes aurora {
          0%,100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        @keyframes particle-rise {
          0%   { opacity: 0; transform: translateY(0) scale(0); }
          15%  { opacity: 1; }
          85%  { opacity: 0.5; }
          100% { opacity: 0; transform: translateY(-140px) scale(2); }
        }
        @keyframes ring-pulse {
          0%,100% { transform: scale(1);    opacity: 0.45; }
          50%      { transform: scale(1.14); opacity: 0.10; }
        }
        @keyframes spin-slow    { to { transform: rotate(360deg);  } }
        @keyframes spin-reverse { to { transform: rotate(-360deg); } }
        @keyframes glow-logo {
          0%,100% { box-shadow: 0 0 40px rgba(255,215,0,0.5), 0 0 80px rgba(255,215,0,0.2); }
          50%      { box-shadow: 0 0 70px rgba(255,215,0,0.8), 0 0 140px rgba(255,215,0,0.35); }
        }
        @keyframes progress-elastic {
          0%   { width: 0%;   }
          60%  { width: 95%;  }
          80%  { width: 88%;  }
          100% { width: 100%; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Partículas */}
      {particles.map(p => <Particle key={p.id} style={p} />)}

      {/* Gradiente de profundidade central */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 48%, rgba(255,215,0,0.08) 0%, transparent 65%)" }}
      />

      {/* Padrão de pontos */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Conteúdo principal */}
      <div
        className="relative flex flex-col items-center gap-8"
        style={{
          opacity:   visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* Logo com anéis rotativos */}
        <div className="relative flex items-center justify-center">

          {/* Anel externo — rotação lenta */}
          <div
            className="absolute rounded-full border border-dashed"
            style={{
              width: 144, height: 144,
              borderColor: "rgba(255,215,0,0.20)",
              animation: "spin-slow 12s linear infinite",
            }}
          />

          {/* Anel médio — rotação reversa */}
          <div
            className="absolute rounded-full border"
            style={{
              width: 120, height: 120,
              borderColor: "rgba(168,209,255,0.18)",
              borderStyle: "dashed",
              animation: "spin-reverse 8s linear infinite",
            }}
          />

          {/* Anel pulsante */}
          <div
            className="absolute rounded-full border border-[#ffd700]/25"
            style={{
              width: 104, height: 104,
              animation: "ring-pulse 2.2s ease-in-out infinite",
            }}
          />

          {/* Ícone central */}
          <div
            className="relative w-[88px] h-[88px] rounded-[26px] grid place-items-center text-[#071832]"
            style={{
              background: "linear-gradient(135deg, #c9a800 0%, #ffd700 50%, #ffe88a 100%)",
              animation: "glow-logo 2.5s ease-in-out infinite",
            }}
          >
            <BookOpen size={42} strokeWidth={1.6} />
          </div>
        </div>

        {/* Marca */}
        <div className="text-center space-y-2" style={{ animation: "fade-up 0.6s 0.2s both" }}>
          <p
            className="text-[11px] font-bold uppercase tracking-[0.7em]"
            style={{ color: "rgba(168,209,255,0.50)" }}
          >
            UCM · EXTENSÃO DE TETE
          </p>
          <h1
            className="text-[3.4rem] font-black text-white tracking-tight leading-none"
            style={{
              textShadow: "0 0 50px rgba(255,215,0,0.30)",
              fontFamily: "Inter, sans-serif",
            }}
          >
            SmartHub
          </h1>
          <p className="text-sm font-light tracking-widest" style={{ color: "rgba(168,209,255,0.55)" }}>
            Aprenda &nbsp;·&nbsp; Partilhe &nbsp;·&nbsp; Cresça
          </p>
        </div>

        {/* Barra de progresso premium */}
        <div className="flex flex-col items-center gap-3 w-56" style={{ animation: "fade-up 0.6s 0.4s both" }}>
          <div
            className="w-full h-[5px] rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.10)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, #c9a800, #ffd700, #ffe88a)",
                boxShadow: "0 0 16px rgba(255,215,0,0.7)",
                width: phase === "fill" || phase === "exit" ? "100%" : "0%",
                transition: phase === "fill"
                  ? "width 1.9s cubic-bezier(0.3, 0, 0.1, 1)"
                  : "none",
              }}
            />
          </div>
          <p
            className="text-[10px] font-mono uppercase tracking-[0.5em]"
            style={{ color: "rgba(168,209,255,0.35)" }}
          >
            A iniciar sistema...
          </p>
        </div>
      </div>

      {/* Rodapé */}
      <p
        className="absolute bottom-8 text-[10px] font-medium tracking-widest"
        style={{ color: "rgba(255,255,255,0.15)" }}
      >
        © 2025 Universidade Católica de Moçambique
      </p>
    </div>
  );
};

export default SplashScreen;
