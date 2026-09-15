/* eslint-disable react-refresh/only-export-components -- modal + botão + lista de motivos partilhados */
import React, { useState, useEffect, useRef } from "react";
import { Flag, Send } from "lucide-react";
import api from "../services/api";
import { BotaoPrimario, BotaoSecundario, Etiqueta } from "./ui";

export const MOTIVOS = [
  { valor: "conteudo_improprio", label: "Conteúdo impróprio ou ofensivo" },
  { valor: "direitos_autor", label: "Viola direitos de autor" },
  { valor: "spam", label: "Spam ou publicidade" },
  { valor: "informacao_errada", label: "Informação errada ou enganadora" },
  { valor: "assedio", label: "Assédio ou ataque a alguém" },
  { valor: "outro", label: "Outro motivo" },
];

/* Modal de denúncia — usado para materiais, comentários, perguntas e respostas */
export const ModalReportar = ({ tipo, recursoId, aberto, onFechar, onToast }) => {
  const [motivo, setMotivo] = useState("conteudo_improprio");
  const [detalhes, setDetalhes] = useState("");
  const [aEnviar, setAEnviar] = useState(false);
  const primeiroRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    primeiroRef.current?.focus();
    const handler = (e) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const enviar = async (e) => {
    e.preventDefault();
    setAEnviar(true);
    try {
      const { data } = await api.post("/denuncias", { tipo, recurso_id: recursoId, motivo, detalhes: detalhes.trim() || null });
      onToast?.(data.mensagem);
      setDetalhes("");
      onFechar();
    } catch (err) {
      onToast?.(err.response?.data?.erro || "Erro ao enviar a denúncia.", "error");
    } finally {
      setAEnviar(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(var(--color-navy-abyss-rgb),0.55)", backdropFilter: "blur(8px)" }}>
      <form onSubmit={enviar} role="dialog" aria-modal="true" aria-labelledby="reportar-titulo"
        className="w-full max-w-md rounded-[28px] p-7 animate-scale-in space-y-4"
        style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 30px 90px rgba(var(--color-navy-deep-rgb),0.30)" }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl grid place-items-center" style={{ background: "var(--status-danger-bg)", border: "1px solid var(--status-danger-border)" }}>
            <Flag size={18} style={{ color: "var(--status-danger-text)" }} />
          </div>
          <div>
            <h3 id="reportar-titulo" style={{ fontSize: 16, fontWeight: 900, color: "var(--text-heading)" }}>Reportar conteúdo</h3>
            <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Um administrador vai analisar. A denúncia é confidencial.</p>
          </div>
        </div>
        <div>
          <Etiqueta>Motivo</Etiqueta>
          <select ref={primeiroRef} value={motivo} onChange={e => setMotivo(e.target.value)} className="w-full rounded-2xl px-4 py-3 text-sm outline-none appearance-none"
            style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }}>
            {MOTIVOS.map(m => <option key={m.valor} value={m.valor}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <Etiqueta>Detalhes (opcional)</Etiqueta>
          <textarea value={detalhes} onChange={e => setDetalhes(e.target.value.slice(0, 1000))} rows={3} placeholder="O que está errado? Onde?"
            className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-y" style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
        </div>
        <div className="flex justify-end gap-2">
          <BotaoSecundario type="button" onClick={onFechar}>Cancelar</BotaoSecundario>
          <BotaoPrimario type="submit" loading={aEnviar} style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", boxShadow: "0 6px 20px rgba(239,68,68,0.35)" }}><Send size={15} /> Enviar denúncia</BotaoPrimario>
        </div>
      </form>
    </div>
  );
};

/* Botão discreto que abre o modal */
const BotaoReportar = ({ tipo, recursoId, onToast, compacto = false }) => {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className={`inline-flex items-center gap-1.5 rounded-xl transition-colors hover:bg-red-50 ${compacto ? "p-1.5" : "px-3 py-2 text-xs font-bold"}`}
        style={{ color: "var(--text-faint)" }} title="Reportar" aria-label="Reportar conteúdo">
        <Flag size={compacto ? 14 : 15} />{!compacto && " Reportar"}
      </button>
      <ModalReportar tipo={tipo} recursoId={recursoId} aberto={aberto} onFechar={() => setAberto(false)} onToast={onToast} />
    </>
  );
};

export default BotaoReportar;
