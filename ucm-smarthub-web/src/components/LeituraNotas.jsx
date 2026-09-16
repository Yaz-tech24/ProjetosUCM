import React, { useState, useEffect, useCallback } from "react";
import { BookMarked, Bookmark, StickyNote, Trash2, ArrowRight, Save } from "lucide-react";
import api from "../services/api";
import { CartaoOuSeccao, Spinner, Vazio, BotaoPrimario } from "./ui";

/* Progresso de leitura (página onde ficou) + marcadores e notas por página.
   O visualizador de PDF é o do browser (iframe), que não expõe a página
   actual — o aluno indica-a e a app abre o PDF nessa página (#page=N). */
const CORES = ["#ffd700", "#60a5fa", "#34d399", "#f472b6"];

const LeituraNotas = ({ materialId, embutido, paginaActual, onIrParaPagina, onToast }) => {
  const [dados, setDados] = useState(null);
  const [aCarregar, setACarregar] = useState(true);
  const [pagina, setPagina] = useState("");
  const [totalPaginas, setTotalPaginas] = useState("");
  const [novaNota, setNovaNota] = useState({ tipo: "nota", pagina: "", texto: "", cor: CORES[0] });
  const [aGuardar, setAGuardar] = useState(false);

  const carregar = useCallback(async () => {
    setACarregar(true);
    try {
      const { data } = await api.get(`/materiais/${materialId}/leitura`);
      setDados(data);
      setPagina(data.pagina ? String(data.pagina) : "");
      setTotalPaginas(data.total_paginas ? String(data.total_paginas) : "");
    } catch {
      setDados({ pagina: null, total_paginas: null, anotacoes: [] });
    } finally {
      setACarregar(false);
    }
  }, [materialId]);

  useEffect(() => { carregar(); }, [carregar]);

  /* A página que o visualizador abriu (via marcador) reflecte-se no campo. */
  useEffect(() => { if (paginaActual) setPagina(String(paginaActual)); }, [paginaActual]);

  const guardarProgresso = async (e) => {
    e?.preventDefault();
    const p = parseInt(pagina, 10);
    if (!p || p < 1) return onToast?.("Indique a página onde ficou.", "error");
    setAGuardar(true);
    try {
      const { data } = await api.put(`/materiais/${materialId}/leitura`, { pagina: p, total_paginas: parseInt(totalPaginas, 10) || null });
      setDados(d => ({ ...d, pagina: data.pagina, total_paginas: data.total_paginas }));
      onToast?.(`Guardado: retoma na página ${p}.`);
    } catch (err) {
      onToast?.(err.response?.data?.erro || "Não foi possível guardar.", "error");
    } finally {
      setAGuardar(false);
    }
  };

  const criarAnotacao = async (e) => {
    e.preventDefault();
    if (!novaNota.texto.trim()) return;
    setAGuardar(true);
    try {
      const { data } = await api.post(`/materiais/${materialId}/anotacoes`, {
        tipo: novaNota.tipo, pagina: parseInt(novaNota.pagina, 10) || parseInt(pagina, 10) || 1, texto: novaNota.texto.trim(), cor: novaNota.cor,
      });
      setDados(d => ({ ...d, anotacoes: [...d.anotacoes, data].sort((a, b) => a.pagina - b.pagina || a.id - b.id) }));
      setNovaNota(n => ({ ...n, texto: "", pagina: "" }));
    } catch (err) {
      onToast?.(err.response?.data?.erro || "Não foi possível guardar a anotação.", "error");
    } finally {
      setAGuardar(false);
    }
  };

  const apagar = async (id) => {
    try {
      await api.delete(`/anotacoes/${id}`);
      setDados(d => ({ ...d, anotacoes: d.anotacoes.filter(a => a.id !== id) }));
    } catch {
      onToast?.("Não foi possível apagar.", "error");
    }
  };

  const progresso = dados?.pagina && dados?.total_paginas ? Math.min(100, Math.round((dados.pagina / dados.total_paginas) * 100)) : null;
  const marcadores = (dados?.anotacoes || []).filter(a => a.tipo === "marcador");
  const notas = (dados?.anotacoes || []).filter(a => a.tipo === "nota");

  return (
    <CartaoOuSeccao embutido={embutido} icon={BookMarked} titulo="Leitura" subtitulo="Onde ficou, marcadores e notas — só seus, sincronizados entre dispositivos">
      {aCarregar ? <Spinner label="A carregar a leitura…" /> : (
        <div className="space-y-6">
          {/* Progresso */}
          <form onSubmit={guardarProgresso} className="rounded-2xl p-4 space-y-3" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="block mb-1.5 text-[11px] font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--text-muted)" }}>Estou na página</span>
                <input type="number" min={1} value={pagina} onChange={e => setPagina(e.target.value)} placeholder="ex: 12" aria-label="Página actual"
                  className="w-28 rounded-xl px-3 py-2.5 text-sm outline-none" style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
              </label>
              <label className="block">
                <span className="block mb-1.5 text-[11px] font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--text-muted)" }}>de (total)</span>
                <input type="number" min={1} value={totalPaginas} onChange={e => setTotalPaginas(e.target.value)} placeholder="opcional" aria-label="Total de páginas"
                  className="w-28 rounded-xl px-3 py-2.5 text-sm outline-none" style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
              </label>
              <BotaoPrimario type="submit" loading={aGuardar}><Save size={14} /> Guardar página</BotaoPrimario>
              {dados?.pagina > 1 && (
                <button type="button" onClick={() => onIrParaPagina?.(dados.pagina)} className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--text-accent)" }}>
                  Abrir na página {dados.pagina} <ArrowRight size={14} />
                </button>
              )}
            </div>
            {progresso !== null && (
              <div>
                <div className="flex justify-between mb-1" style={{ fontSize: 11.5, color: "var(--text-faint)", fontWeight: 600 }}>
                  <span>Progresso</span><span>{progresso}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border-subtle-strong)" }}>
                  <div className="h-full rounded-full" style={{ width: `${progresso}%`, background: "linear-gradient(90deg,var(--color-gold-dark),var(--color-gold))" }} />
                </div>
              </div>
            )}
          </form>

          {/* Nova anotação */}
          <form onSubmit={criarAnotacao} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {[{ key: "nota", label: "Nota", icon: StickyNote }, { key: "marcador", label: "Marcador", icon: Bookmark }].map(({ key, label, icon: Icon }) => (
                <button key={key} type="button" onClick={() => setNovaNota(n => ({ ...n, tipo: key }))}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold"
                  style={novaNota.tipo === key ? { background: "var(--color-navy-mid)", color: "#fff" } : { background: "var(--surface-hover)", border: "1px solid var(--border-subtle-strong)", color: "var(--text-muted)" }}>
                  <Icon size={13} /> {label}
                </button>
              ))}
              <input type="number" min={1} value={novaNota.pagina} onChange={e => setNovaNota(n => ({ ...n, pagina: e.target.value }))} placeholder={`pág. ${pagina || 1}`} aria-label="Página da anotação"
                className="w-24 rounded-xl px-3 py-2 text-xs outline-none" style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
              <div className="flex items-center gap-1.5 ml-auto">
                {CORES.map(c => (
                  <button key={c} type="button" onClick={() => setNovaNota(n => ({ ...n, cor: c }))} aria-label={`Cor ${c}`}
                    className="w-5 h-5 rounded-full transition-transform" style={{ background: c, outline: novaNota.cor === c ? "2px solid var(--text-heading)" : "none", outlineOffset: 2, transform: novaNota.cor === c ? "scale(1.15)" : "" }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <input type="text" value={novaNota.texto} maxLength={2000} onChange={e => setNovaNota(n => ({ ...n, texto: e.target.value }))}
                placeholder={novaNota.tipo === "marcador" ? "Nome do marcador (ex: Capítulo 3 — Integrais)" : "Escreva a nota…"} aria-label="Texto da anotação"
                className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none" style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
              <BotaoPrimario type="submit" loading={aGuardar} disabled={!novaNota.texto.trim()}>Adicionar</BotaoPrimario>
            </div>
          </form>

          {/* Listas */}
          {marcadores.length === 0 && notas.length === 0 ? (
            <Vazio icon={StickyNote}>Ainda sem marcadores nem notas neste material.</Vazio>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {[{ titulo: "Marcadores", lista: marcadores, icon: Bookmark }, { titulo: "Notas", lista: notas, icon: StickyNote }].map(({ titulo, lista, icon: Icon }) => lista.length > 0 && (
                <div key={titulo}>
                  <p className="mb-2 text-[11px] font-bold uppercase inline-flex items-center gap-1.5" style={{ letterSpacing: "0.12em", color: "var(--text-faint)" }}><Icon size={12} /> {titulo} ({lista.length})</p>
                  <ul className="space-y-2">
                    {lista.map(a => (
                      <li key={a.id} className="group flex items-start gap-3 rounded-2xl px-4 py-3" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)", borderLeft: `4px solid ${a.cor || "var(--color-gold)"}` }}>
                        <button type="button" onClick={() => onIrParaPagina?.(a.pagina)} className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-black" title={`Abrir na página ${a.pagina}`}
                          style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle-strong)", color: "var(--text-accent)" }}>
                          p. {a.pagina}
                        </button>
                        <p className="flex-1 min-w-0" style={{ fontSize: 13.5, color: "var(--text-body)", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{a.texto}</p>
                        <button type="button" onClick={() => apagar(a.id)} className="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" aria-label="Apagar anotação" style={{ color: "var(--status-danger-text)" }}>
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </CartaoOuSeccao>
  );
};

export default LeituraNotas;
