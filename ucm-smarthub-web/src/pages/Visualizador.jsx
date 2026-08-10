import React, { useState, useEffect, useCallback } from "react";
import api, { isFavorito, toggleFavorito } from "../services/api";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, DownloadCloud, Sparkles, RotateCcw, Heart, Share2 } from "lucide-react";

/* ── Renderiza o resumo estruturado devolvido pela IA ── */
const SummaryRenderer = ({ text }) => {
  const SECOES_CONHECIDAS = [
    "VISÃO GERAL", "CONCEITOS FUNDAMENTAIS", "MÉTODOS E PROCEDIMENTOS",
    "PONTOS-CHAVE PARA O EXAME", "DICA DE ESTUDO",
  ];

  const isSecao   = (l) => SECOES_CONHECIDAS.some(s => l.trim().toUpperCase() === s) || /^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ\s]{6,}$/.test(l.trim());
  const isBullet  = (l) => l.trim().startsWith("• ") || l.trim().startsWith("- ");
  const limparBullet = (l) => l.trim().replace(/^[•-]\s*/, "");

  const linhas = text.split('\n').filter(l => l.trim().length > 0);

  return (
    <div className="space-y-1">
      {linhas.map((linha, i) => {
        if (isSecao(linha)) return (
          <div key={i} style={{ paddingTop: i === 0 ? 0 : 14, paddingBottom: 6 }}>
            <div className="flex items-center gap-2.5">
              <div style={{ width: 3, height: 16, borderRadius: 2, background: "linear-gradient(180deg,var(--color-gold-dark),var(--color-gold))", flexShrink: 0 }} />
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.38em", color: "rgba(var(--color-gold-rgb),0.85)", textTransform: "uppercase" }}>
                {linha.trim()}
              </p>
            </div>
          </div>
        );

        if (isBullet(linha)) {
          const partes = limparBullet(linha).split(/:(.+)/);
          const temLabel = partes.length > 1;
          return (
            <div key={i} className="flex items-start gap-3" style={{ paddingLeft: 8, paddingTop: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-gold)", boxShadow: "0 0 5px rgba(var(--color-gold-rgb),0.60)", flexShrink: 0, marginTop: 7 }} />
              <p style={{ fontSize: 13.5, color: "rgba(226,232,240,0.88)", lineHeight: 1.65 }}>
                {temLabel
                  ? <><strong style={{ color: "#fff", fontWeight: 700 }}>{partes[0].trim()}</strong>:{partes[1]}</>
                  : partes[0]}
              </p>
            </div>
          );
        }

        return (
          <p key={i} style={{ fontSize: 13.5, color: "rgba(var(--color-blue-sky-rgb),0.80)", lineHeight: 1.70, paddingTop: 2 }}>
            {linha.trim()}
          </p>
        );
      })}
    </div>
  );
};

const Visualizador = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [material,       setMaterial]       = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [summary,        setSummary]        = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError,   setSummaryError]   = useState(null);
  const [fav,            setFav]            = useState(false);
  const [copiado,        setCopiado]        = useState(false);

  useEffect(() => {
    api.get(`/materiais/${id}`)
      .then(res => { setMaterial(res.data); setFav(isFavorito(res.data.id)); })
      .catch(() => setMaterial(null))
      .finally(() => setLoading(false));
  }, [id]);

  const fetchSummary = useCallback(async () => {
    if (!material) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await api.get(`/materiais/${id}/resumo`);
      setSummary(res.data.resumo || 'Resumo não disponível.');
    } catch {
      setSummaryError('Não foi possível gerar o resumo no momento.');
    } finally {
      setSummaryLoading(false);
    }
  }, [material, id]);

  useEffect(() => { if (material) fetchSummary(); }, [material, fetchSummary]);

  const handleToggleFav = () => {
    const novo = toggleFavorito(material.id);
    setFav(novo);
  };

  const handleCopiarLink = () => {
    if (!navigator.clipboard) {
      // Fallback para navegadores sem Clipboard API
      const input = document.createElement('input');
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      return;
    }
    navigator.clipboard.writeText(window.location.href)
      .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); })
      .catch(() => {}); // permissão negada — sem crash
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 gap-4">
        <div className="w-12 h-12 rounded-full border-4 animate-spin" style={{ borderColor: "rgba(var(--color-navy-mid-rgb),0.12)", borderTopColor: "var(--color-gold)" }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: "#64748b" }}>A carregar o material...</p>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-5 animate-fade-in">
        <div className="w-24 h-24 rounded-[28px] grid place-items-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
          <DownloadCloud size={38} style={{ color: "#ef4444" }} />
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: "var(--color-navy-deep)" }}>Material não encontrado</h2>
        <p style={{ fontSize: 14, color: "#64748b" }}>Este recurso não existe no repositório da UCM.</p>
        <button
          onClick={() => navigate('/repositorio')}
          className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white transition-all duration-200 mt-2"
          style={{ background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", boxShadow: "0 6px 22px rgba(var(--color-navy-deep-rgb),0.35)" }}
          onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
          onMouseLeave={e => (e.currentTarget.style.transform = "")}
        >
          <ArrowLeft size={16} /> Voltar ao Repositório
        </button>
      </div>
    );
  }

  const isVideo = material.tipo === "Vídeo";
  const isPDF   = material.tipo === "PDF";

  return (
    <div className="animate-fade-in h-full flex flex-col xl:flex-row gap-7">

      {/* ─── Coluna esquerda ─── */}
      <div className="flex-1 space-y-6">

        {/* Barra de acções */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate("/repositorio")}
            className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold transition-all duration-200"
            style={{ background: "#fff", border: "1.5px solid rgba(var(--color-navy-mid-rgb),0.10)", color: "var(--color-navy-mid)", boxShadow: "0 2px 10px rgba(var(--color-navy-mid-rgb),0.06)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-navy-mid)", e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.background = "#fff", e.currentTarget.style.color = "var(--color-navy-mid)")}
          >
            <ArrowLeft size={17} /> Voltar
          </button>

          <div className="flex items-center gap-2 ml-auto">
            {/* Favorito */}
            <button
              onClick={handleToggleFav}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all duration-200"
              style={fav
                ? { background: "rgba(239,68,68,0.09)", border: "1.5px solid rgba(239,68,68,0.28)", color: "#dc2626" }
                : { background: "#fff", border: "1.5px solid rgba(var(--color-navy-mid-rgb),0.10)", color: "#64748b", boxShadow: "0 2px 10px rgba(var(--color-navy-mid-rgb),0.06)" }
              }
              title={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            >
              <Heart size={16} fill={fav ? "#dc2626" : "none"} />
              {fav ? "Guardado" : "Guardar"}
            </button>

            {/* Copiar link */}
            <button
              onClick={handleCopiarLink}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all duration-200"
              style={{ background: "#fff", border: "1.5px solid rgba(var(--color-navy-mid-rgb),0.10)", color: "#64748b", boxShadow: "0 2px 10px rgba(var(--color-navy-mid-rgb),0.06)" }}
            >
              <Share2 size={16} />
              {copiado ? "Copiado!" : "Partilhar"}
            </button>

            {/* Download (apenas PDF) */}
            {isPDF && (
              <a
                href={material.url_arquivo}
                download
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black transition-all duration-200"
                style={{ background: "linear-gradient(135deg,var(--color-gold-dark),var(--color-gold))", color: "var(--color-navy-deep)", boxShadow: "0 4px 16px rgba(var(--color-gold-rgb),0.40)" }}
                onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)", e.currentTarget.style.boxShadow = "0 6px 22px rgba(var(--color-gold-rgb),0.60)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 4px 16px rgba(var(--color-gold-rgb),0.40)")}
              >
                <DownloadCloud size={16} /> Download PDF
              </a>
            )}
          </div>
        </div>

        {/* Player de media */}
        <div
          className="overflow-hidden"
          style={{ borderRadius: 28, border: "1px solid rgba(var(--color-navy-mid-rgb),0.08)", background: "var(--color-navy-abyss)", boxShadow: "0 20px 70px rgba(var(--color-navy-abyss-rgb),0.45)" }}
        >
          {isVideo ? (
            <video controls className="w-full" style={{ minHeight: "50vh", background: "#000" }} autoPlay>
              <source src={material.url_arquivo} type="video/mp4" />
              O seu navegador não suporta a visualização deste vídeo.
            </video>
          ) : isPDF ? (
            <iframe
              src={material.url_arquivo}
              className="w-full"
              style={{ minHeight: "72vh", background: "#fff" }}
              title={`PDF — ${material.titulo}`}
            />
          ) : (
            <div
              className="flex flex-col items-center justify-center p-14 text-center text-white"
              style={{ minHeight: "40vh", background: "linear-gradient(145deg,var(--color-navy-abyss),var(--color-navy-deep),var(--color-navy))" }}
            >
              <div className="w-24 h-24 rounded-[28px] grid place-items-center mb-7" style={{ background: "rgba(var(--color-gold-rgb),0.12)", border: "1px solid rgba(var(--color-gold-rgb),0.25)" }}>
                <DownloadCloud size={40} style={{ color: "var(--color-gold)" }} />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 900, marginBottom: 10 }}>Visualização indisponível</h3>
              <p style={{ color: "rgba(var(--color-blue-sky-rgb),0.60)", fontSize: 14, marginBottom: 28, maxWidth: 360, lineHeight: 1.65 }}>
                Este material não pode ser exibido diretamente.
              </p>
              <a
                href={material.url_arquivo}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full font-black text-sm transition-all"
                style={{ background: "linear-gradient(135deg,var(--color-gold-dark),var(--color-gold),var(--color-gold-light))", color: "var(--color-navy-deep)", padding: "12px 28px", boxShadow: "0 8px 28px rgba(var(--color-gold-rgb),0.50)" }}
              >
                Baixar Documento <ExternalLink size={16} />
              </a>
            </div>
          )}
        </div>

        {/* Info do material */}
        <div className="rounded-[28px] p-7" style={{ background: "#fff", border: "1px solid rgba(var(--color-navy-mid-rgb),0.08)", boxShadow: "0 4px 28px rgba(var(--color-navy-mid-rgb),0.07)" }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "var(--color-navy-deep)", marginBottom: 16, lineHeight: 1.3 }}>{material.titulo}</h1>
          <div className="flex flex-wrap gap-3">
            {[
              { label: `📚 ${material.cadeira}`, bg: "var(--color-ice)",              border: "rgba(var(--color-navy-mid-rgb),0.10)", color: "#475569" },
              { label: `👤 ${material.autor}`,   bg: "rgba(var(--color-navy-mid-rgb),0.06)", border: "rgba(var(--color-navy-mid-rgb),0.12)", color: "var(--color-navy-mid)" },
              { label: `📅 ${new Date(material.data_upload).toLocaleDateString("pt-PT")}`, bg: "var(--color-ice)", border: "rgba(var(--color-navy-mid-rgb),0.10)", color: "#64748b" },
              { label: material.tipo === 'Vídeo' ? '🎬 Vídeo' : '📄 PDF',    bg: material.tipo === 'Vídeo' ? "#eff6ff" : "#fff1f2", border: material.tipo === 'Vídeo' ? "#bfdbfe" : "#fecdd3", color: material.tipo === 'Vídeo' ? "var(--color-navy-mid)" : "#be123c" },
            ].map(({ label, bg, border, color }) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" style={{ background: bg, border: `1px solid ${border}`, color }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Coluna direita: resumo IA ─── */}
      <div className="w-full xl:w-96 shrink-0">
        <div
          className="sticky top-24 overflow-hidden text-white"
          style={{
            borderRadius: 28,
            background: "linear-gradient(-45deg,var(--color-navy-abyss),var(--color-navy-deep),var(--color-navy),var(--color-navy-mid))",
            backgroundSize: "400% 400%",
            animation: "aurora-vis 10s ease infinite",
            boxShadow: "0 18px 60px rgba(var(--color-navy-abyss-rgb),0.45)",
          }}
        >
          <style>{`@keyframes aurora-vis { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }`}</style>
          <div style={{ height: 3, background: "linear-gradient(90deg, transparent, var(--color-gold-dark), var(--color-gold), var(--color-gold-light), transparent)", opacity: 0.85 }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 20% 20%, rgba(var(--color-gold-rgb),0.10) 0%, transparent 55%)" }} />

          <div className="relative p-7">
            <div className="flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl grid place-items-center" style={{ background: "linear-gradient(135deg,var(--color-gold-dark),var(--color-gold))", color: "var(--color-navy-deep)", boxShadow: "0 6px 20px rgba(var(--color-gold-rgb),0.50)" }}>
                  <Sparkles size={22} />
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.38em", color: "rgba(var(--color-blue-sky-rgb),0.55)", textTransform: "uppercase", marginBottom: 3 }}>IA Gemini</p>
                  <h3 style={{ fontSize: 18, fontWeight: 900, color: "#fff", lineHeight: 1 }}>Smart Resumo</h3>
                </div>
              </div>
              <button
                onClick={fetchSummary}
                disabled={summaryLoading}
                className="w-10 h-10 rounded-xl grid place-items-center transition-all duration-200 disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.55)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.18)", e.currentTarget.style.color = "#fff")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.09)", e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
                title="Regenerar resumo"
              >
                <RotateCcw size={15} className={summaryLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div
              className="space-y-1 overflow-y-auto pr-1"
              style={{ maxHeight: "65vh", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.12) transparent" }}
            >
              {summaryLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-9 h-9 rounded-full border-[3px] animate-spin" style={{ borderColor: "rgba(255,255,255,0.12)", borderTopColor: "var(--color-gold)" }} />
                  <p style={{ fontSize: 13, color: "rgba(var(--color-blue-sky-rgb),0.50)" }}>A analisar o documento...</p>
                  <p style={{ fontSize: 11, color: "rgba(var(--color-blue-sky-rgb),0.30)" }}>Pode demorar alguns segundos</p>
                </div>
              ) : summaryError ? (
                <div className="flex flex-col items-center gap-3 text-center py-8 rounded-[18px]"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p style={{ fontSize: 14, color: "#fca5a5", lineHeight: 1.65 }}>{summaryError}</p>
                  <button onClick={fetchSummary}
                    className="rounded-xl px-4 py-2 text-xs font-bold transition-all"
                    style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.70)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.10)"}
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : summary ? (
                <SummaryRenderer text={summary} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <div className="w-9 h-9 rounded-full border-[3px] animate-spin" style={{ borderColor: "rgba(255,255,255,0.12)", borderTopColor: "var(--color-gold)" }} />
                  <p style={{ fontSize: 13, color: "rgba(var(--color-blue-sky-rgb),0.35)" }}>A preparar resumo...</p>
                </div>
              )}
            </div>

            <p style={{ fontSize: 11, color: "rgba(var(--color-blue-sky-rgb),0.28)", marginTop: 14, textAlign: "center", lineHeight: 1.5 }}>
              Gerado por IA Gemini · UCM SmartHub
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Visualizador;
