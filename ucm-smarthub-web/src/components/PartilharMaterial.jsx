import React, { useState, useEffect, useRef } from "react";
import { Paperclip, Search, FileText, Film, X } from "lucide-react";
import api from "../services/api";

/* Botão "anexar material" do chat: pesquisa no repositório e devolve o
   material escolhido (só o id é enviado ao servidor — título e tipo vêm da BD). */
const PartilharMaterial = ({ onEscolher, seleccionado, onLimpar }) => {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [aProcurar, setAProcurar] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aberto]);

  useEffect(() => {
    if (!aberto || q.trim().length < 2) { setResultados([]); return; }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setAProcurar(true);
      try {
        const { data } = await api.get("/pesquisa", { params: { q: q.trim() }, signal: controller.signal });
        setResultados(data.materiais || []);
      } catch { /* cancelado ou sem rede */ } finally { setAProcurar(false); }
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [q, aberto]);

  if (seleccionado) {
    return (
      <span className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-bold max-w-full" style={{ background: "rgba(var(--color-gold-rgb),0.12)", border: "1px solid rgba(var(--color-gold-rgb),0.35)", color: "var(--text-accent)" }}>
        {seleccionado.tipo === "Vídeo" ? <Film size={13} /> : <FileText size={13} />}
        <span className="truncate" style={{ maxWidth: 220 }}>{seleccionado.titulo}</span>
        <button type="button" onClick={onLimpar} aria-label="Remover material anexado" style={{ color: "var(--text-faint)" }}><X size={13} /></button>
      </span>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setAberto(v => !v)} title="Partilhar um material do repositório" aria-label="Partilhar material"
        className="w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-2xl grid place-items-center transition-all"
        style={{ background: "var(--surface-hover)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-muted)" }}>
        <Paperclip size={17} />
      </button>
      {aberto && (
        <div className="absolute bottom-full mb-2 left-0 w-[min(22rem,calc(100vw-3rem))] rounded-2xl p-3 z-30 animate-fade-in" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle-strong)", boxShadow: "0 16px 48px rgba(var(--color-navy-deep-rgb),0.22)" }}>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)" }}>
            <Search size={14} style={{ color: "var(--text-faint)" }} />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Procurar material…" aria-label="Procurar material para partilhar"
              className="bg-transparent outline-none text-sm w-full" style={{ color: "var(--text-heading)" }} />
          </div>
          <ul className="mt-2 max-h-56 overflow-y-auto space-y-1">
            {aProcurar && <li className="px-2 py-2" style={{ fontSize: 12, color: "var(--text-faint)" }}>A procurar…</li>}
            {!aProcurar && q.trim().length >= 2 && resultados.length === 0 && <li className="px-2 py-2" style={{ fontSize: 12, color: "var(--text-faint)" }}>Sem resultados.</li>}
            {resultados.map(m => (
              <li key={m.id}>
                <button type="button" onClick={() => { onEscolher(m); setAberto(false); setQ(""); }}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors"
                  style={{ color: "var(--text-body)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}>
                  {m.tipo === "Vídeo" ? <Film size={14} style={{ color: "var(--text-accent)", flexShrink: 0 }} /> : <FileText size={14} style={{ color: "#be123c", flexShrink: 0 }} />}
                  <span className="min-w-0">
                    <span className="block truncate" style={{ fontSize: 13, fontWeight: 700 }}>{m.titulo}</span>
                    <span className="block truncate" style={{ fontSize: 11, color: "var(--text-faint)" }}>{m.cadeira}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PartilharMaterial;
