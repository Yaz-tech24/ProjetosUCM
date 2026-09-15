import React, { useState, useEffect, useRef } from "react";
import { FolderPlus, Check, Plus, Lock, Globe } from "lucide-react";
import api from "../services/api";

// Botão "Guardar em colecção" com menu: alterna o material em cada colecção
// do utilizador e permite criar uma nova sem sair da página.
const GuardarEmColecao = ({ materialId, onToast, estiloBotao, className }) => {
  const [aberto, setAberto] = useState(false);
  const [colecoes, setColecoes] = useState([]);
  const [contem, setContem] = useState(new Set());
  const [aCarregar, setACarregar] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [aCriar, setACriar] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aberto]);

  const abrir = async () => {
    if (aberto) return setAberto(false);
    setAberto(true);
    setACarregar(true);
    try {
      const [c, ids] = await Promise.all([api.get("/colecoes"), api.get(`/materiais/${materialId}/colecoes`)]);
      setColecoes(c.data);
      setContem(new Set(ids.data));
    } catch {
      onToast?.("Não foi possível carregar as colecções.", "error");
      setAberto(false);
    } finally {
      setACarregar(false);
    }
  };

  const alternar = async (c) => {
    const estava = contem.has(c.id);
    setContem(prev => { const s = new Set(prev); if (estava) s.delete(c.id); else s.add(c.id); return s; });
    try {
      if (estava) await api.delete(`/colecoes/${c.slug}/materiais/${materialId}`);
      else await api.put(`/colecoes/${c.slug}/materiais/${materialId}`);
      setColecoes(prev => prev.map(x => (x.id === c.id ? { ...x, total_materiais: Number(x.total_materiais) + (estava ? -1 : 1) } : x)));
    } catch (err) {
      setContem(prev => { const s = new Set(prev); if (estava) s.add(c.id); else s.delete(c.id); return s; });
      onToast?.(err.response?.data?.erro || "Erro ao actualizar a colecção.", "error");
    }
  };

  const criar = async (e) => {
    e.preventDefault();
    if (!novoNome.trim()) return;
    setACriar(true);
    try {
      const { data } = await api.post("/colecoes", { nome: novoNome.trim() });
      await api.put(`/colecoes/${data.slug}/materiais/${materialId}`);
      setColecoes(prev => [{ ...data, total_materiais: 1 }, ...prev]);
      setContem(prev => new Set(prev).add(data.id));
      setNovoNome("");
      onToast?.(`Colecção "${data.nome}" criada com este material.`);
    } catch (err) {
      onToast?.(err.response?.data?.erro || "Erro ao criar a colecção.", "error");
    } finally {
      setACriar(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={abrir} className={className} style={estiloBotao} title="Guardar numa colecção" aria-expanded={aberto}>
        <FolderPlus size={16} /><span className="hidden sm:inline xl:hidden 2xl:inline">Colecção{contem.size > 0 ? ` (${contem.size})` : ""}</span>
      </button>
      {aberto && (
        <div className="absolute left-0 top-12 z-40 w-[min(300px,calc(100vw-2rem))] rounded-[20px] p-2 animate-scale-in"
          style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle-strong)", boxShadow: "0 20px 60px rgba(var(--color-navy-mid-rgb),0.18)" }}>
          <p className="px-3 pt-2 pb-1 text-[10.5px] font-bold uppercase" style={{ letterSpacing: "0.12em", color: "var(--text-faint)" }}>As minhas colecções</p>
          {aCarregar ? (
            <p className="px-3 py-3" style={{ fontSize: 13, color: "var(--text-faint)" }}>A carregar…</p>
          ) : colecoes.length === 0 ? (
            <p className="px-3 py-3" style={{ fontSize: 13, color: "var(--text-faint)" }}>Ainda não tem colecções. Crie a primeira abaixo.</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {colecoes.map(c => {
                const dentro = contem.has(c.id);
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => alternar(c)} className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors"
                      style={{ background: dentro ? "rgba(var(--color-navy-mid-rgb),0.08)" : "transparent" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = dentro ? "rgba(var(--color-navy-mid-rgb),0.08)" : "transparent")}>
                      <span className="w-5 h-5 rounded-md grid place-items-center shrink-0" style={{ background: dentro ? "var(--color-navy-mid)" : "var(--surface-input)", border: dentro ? "none" : "1.5px solid var(--border-subtle-strong)", color: "#fff" }}>
                        {dentro && <Check size={12} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-heading)" }}>{c.nome}</span>
                      {c.publica ? <Globe size={12} style={{ color: "var(--text-faint)" }} /> : <Lock size={12} style={{ color: "var(--text-faint)" }} />}
                      <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{c.total_materiais}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <form onSubmit={criar} className="flex gap-1.5 p-2 mt-1" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <input value={novoNome} onChange={e => setNovoNome(e.target.value.slice(0, 100))} placeholder="Nova colecção…"
              className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
            <button type="submit" disabled={aCriar || !novoNome.trim()} className="rounded-xl px-3 grid place-items-center text-white disabled:opacity-50" style={{ background: "var(--color-navy-mid)" }} aria-label="Criar colecção">
              <Plus size={15} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default GuardarEmColecao;
