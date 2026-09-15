import React, { useState, useEffect } from "react";
import { Tag, Plus, X } from "lucide-react";
import api from "../services/api";
import { corTextoContraste as corTexto } from "../utils/palette";

export const Etiqueta = ({ nome, cor, onRemover, onClick, activa }) => (
  <span
    onClick={onClick}
    role={onClick ? "button" : undefined}
    className={`inline-flex items-center gap-1.5 rounded-full pl-3 pr-2.5 py-1 text-[11.5px] font-black uppercase tracking-wide transition-all ${onClick ? "cursor-pointer hover:-translate-y-px" : ""}`}
    style={{ background: cor, color: corTexto(cor), letterSpacing: "0.06em", outline: activa ? "2px solid var(--color-navy-mid)" : "none", outlineOffset: 2, opacity: activa === false ? 0.55 : 1 }}
  >
    <Tag size={11} /> {nome}
    {onRemover && (
      <button type="button" onClick={e => { e.stopPropagation(); onRemover(); }} className="rounded-full p-0.5 hover:bg-black/15" aria-label={`Remover tag ${nome}`}>
        <X size={11} />
      </button>
    )}
  </span>
);

// Etiquetas de um material; admins podem adicionar/remover a partir do
// catálogo global de tags (gerido em Administração → Configurações).
const TagsMaterial = ({ materialId, ehAdmin = false, onErro }) => {
  const [tags, setTags] = useState([]);
  const [todas, setTodas] = useState([]);
  const [aEscolher, setAEscolher] = useState(false);
  const [versao, setVersao] = useState(0);
  const carregar = () => setVersao(v => v + 1);

  useEffect(() => {
    let activo = true;
    api.get(`/materiais/${materialId}/tags`)
      .then(res => { if (activo) setTags(res.data); })
      .catch(() => { if (activo) setTags([]); });
    return () => { activo = false; };
  }, [materialId, versao]);

  const abrirEscolha = async () => {
    try {
      const { data } = await api.get("/tags");
      setTodas(data);
      setAEscolher(true);
    } catch {
      onErro?.("Não foi possível carregar as tags.");
    }
  };

  const adicionar = async (tag) => {
    try {
      await api.post(`/admin/materiais/${materialId}/tags/${tag.id}`);
      setAEscolher(false);
      carregar();
    } catch (err) {
      onErro?.(err.response?.data?.erro || "Erro ao adicionar a tag.");
    }
  };

  const remover = async (tag) => {
    try {
      await api.delete(`/admin/materiais/${materialId}/tags/${tag.id}`);
      setTags(prev => prev.filter(t => t.id !== tag.id));
    } catch (err) {
      onErro?.(err.response?.data?.erro || "Erro ao remover a tag.");
    }
  };

  if (tags.length === 0 && !ehAdmin) return null;

  const disponiveis = todas.filter(t => !tags.some(x => x.id === t.id));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map(t => <Etiqueta key={t.id} nome={t.nome} cor={t.cor} onRemover={ehAdmin ? () => remover(t) : undefined} />)}
      {ehAdmin && !aEscolher && (
        <button type="button" onClick={abrirEscolha}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-bold transition-colors"
          style={{ border: "1.5px dashed var(--border-subtle-strong)", color: "var(--text-faint)" }}>
          <Plus size={12} /> Tag
        </button>
      )}
      {ehAdmin && aEscolher && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl p-2" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)" }}>
          {disponiveis.length === 0
            ? <span className="px-2" style={{ fontSize: 12, color: "var(--text-faint)" }}>Sem mais tags. Crie novas em Administração → Configurações.</span>
            : disponiveis.map(t => <Etiqueta key={t.id} nome={t.nome} cor={t.cor} onClick={() => adicionar(t)} />)}
          <button type="button" onClick={() => setAEscolher(false)} className="rounded-full p-1" style={{ color: "var(--text-faint)" }} aria-label="Fechar">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
};

export default TagsMaterial;
