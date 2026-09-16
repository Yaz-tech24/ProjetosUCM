import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookMarked, Layers, ChevronRight, FileText, PlayCircle } from "lucide-react";
import api from "../services/api";

/* Painel inicial: "continuar a ler" (página onde ficou) e flashcards a rever
   hoje. Só aparece quando há algo — sem rede ou sem dados não ocupa espaço. */
const ContinuarEstudo = () => {
  const navigate = useNavigate();
  const [leituras, setLeituras] = useState([]);
  const [revisoes, setRevisoes] = useState(null);

  useEffect(() => {
    let activo = true;
    api.get("/leituras").then(r => { if (activo) setLeituras(r.data || []); }).catch(() => {});
    api.get("/flashcards/pendentes").then(r => { if (activo) setRevisoes(r.data); }).catch(() => {});
    return () => { activo = false; };
  }, []);

  const temRevisoes = revisoes && revisoes.total > 0;
  if (leituras.length === 0 && !temRevisoes) return null;

  return (
    <section id="revisoes" className="grid gap-4 lg:grid-cols-2 animate-fade-in">
      {leituras.length > 0 && (
        <div className="rounded-[24px] p-5" style={{ background: "var(--surface-card-glass)", backdropFilter: "blur(12px)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 24px rgba(var(--color-navy-mid-rgb),0.06)" }}>
          <h2 className="flex items-center gap-2 mb-3" style={{ fontSize: 16, fontWeight: 900, color: "var(--text-heading)" }}>
            <BookMarked size={17} style={{ color: "var(--text-accent)" }} /> Continuar a ler
          </h2>
          <ul className="space-y-2">
            {leituras.slice(0, 4).map(l => {
              const pct = l.total_paginas ? Math.min(100, Math.round((l.pagina / l.total_paginas) * 100)) : null;
              return (
                <li key={l.id}>
                  <button type="button" onClick={() => navigate(`/video/${l.id}?sep=leitura`)}
                    className="w-full flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-all"
                    style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)" }}
                    onMouseEnter={e => (e.currentTarget.style.transform = "translateX(3px)")}
                    onMouseLeave={e => (e.currentTarget.style.transform = "")}>
                    {l.tipo === "Vídeo" ? <PlayCircle size={18} style={{ color: "var(--color-navy-mid)", flexShrink: 0 }} /> : <FileText size={18} style={{ color: "#be123c", flexShrink: 0 }} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-heading)" }}>{l.titulo}</span>
                      <span className="block" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{l.cadeira} · página {l.pagina}{l.total_paginas ? ` de ${l.total_paginas}` : ""}</span>
                      {pct !== null && (
                        <span className="block mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--border-subtle-strong)" }}>
                          <span className="block h-full" style={{ width: `${pct}%`, background: "var(--color-gold)" }} />
                        </span>
                      )}
                    </span>
                    <ChevronRight size={15} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {temRevisoes && (
        <div className="rounded-[24px] p-5" style={{ background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", color: "#fff", boxShadow: "0 12px 40px rgba(var(--color-navy-deep-rgb),0.30)" }}>
          <h2 className="flex items-center gap-2 mb-1" style={{ fontSize: 16, fontWeight: 900 }}>
            <Layers size={17} style={{ color: "var(--color-gold)" }} /> Revisões de hoje
          </h2>
          <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>{revisoes.total} flashcard{revisoes.total === 1 ? "" : "s"} à espera — 5 minutos chegam.</p>
          <ul className="space-y-2">
            {revisoes.materiais.slice(0, 4).map(m => (
              <li key={m.material_id}>
                <button type="button" onClick={() => navigate(`/video/${m.material_id}?sep=flashcards`)}
                  className="w-full flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-all"
                  style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontSize: 13.5, fontWeight: 700 }}>{m.titulo}</span>
                    <span className="block" style={{ fontSize: 11.5, opacity: 0.7 }}>{m.cadeira}</span>
                  </span>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-black" style={{ background: "var(--color-gold)", color: "var(--color-navy-deep)" }}>{m.pendentes}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default ContinuarEstudo;
