import React, { useState, useEffect, useCallback } from "react";
import { History, Upload, Download, FileUp } from "lucide-react";
import api from "../services/api";
import { CartaoOuSeccao, BotaoPrimario, BotaoSecundario, Spinner, Etiqueta, formatarData } from "./ui";

// Histórico de versões do ficheiro; o autor (ou um admin) pode enviar uma
// versão nova sem perder avaliações e comentários.
const VersoesMaterial = ({ material, podeEditar, aceitaFicheiros, onToast, onAtualizado, embutido = false }) => {
  const [dados, setDados] = useState(null);
  const [aCarregar, setACarregar] = useState(true);
  const [aEnviar, setAEnviar] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [ficheiro, setFicheiro] = useState(null);
  const [notas, setNotas] = useState("");

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get(`/materiais/${material.id}/versoes`);
      setDados(data);
    } catch {
      setDados(null);
    } finally {
      setACarregar(false);
    }
  }, [material.id]);

  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async (e) => {
    e.preventDefault();
    if (!ficheiro) return onToast?.("Escolha o ficheiro da nova versão.", "warn");
    setAEnviar(true);
    try {
      const fd = new FormData();
      fd.append("arquivo", ficheiro);
      if (notas.trim()) fd.append("notas", notas.trim());
      const { data } = await api.post(`/materiais/${material.id}/versoes`, fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 });
      onToast?.(data.mensagem, data.status === "pendente" ? "warn" : "success");
      setFormAberto(false);
      setFicheiro(null);
      setNotas("");
      carregar();
      onAtualizado?.(data);
    } catch (err) {
      onToast?.(err.response?.data?.erro || "Erro ao enviar a nova versão.", "error");
    } finally {
      setAEnviar(false);
    }
  };

  const anteriores = dados?.anteriores || [];
  if (!podeEditar && anteriores.length === 0) return null;

  return (
    <CartaoOuSeccao
      embutido={embutido}
      icon={History}
      titulo={`Versão ${dados?.actual?.versao || material.versao || 1}`}
      subtitulo={`${embutido ? `Versão actual: ${dados?.actual?.versao || material.versao || 1} · ` : ""}${anteriores.length > 0 ? `${anteriores.length} versão${anteriores.length > 1 ? "ões" : ""} anterior${anteriores.length > 1 ? "es" : ""} disponível${anteriores.length > 1 ? "eis" : ""}` : "primeira versão deste material"}`}
      accao={podeEditar && !formAberto && (
        <BotaoSecundario type="button" onClick={() => setFormAberto(true)}><Upload size={15} /> Nova versão</BotaoSecundario>
      )}
    >
      {formAberto && (
        <form onSubmit={enviar} className="rounded-2xl p-5 mb-5 space-y-4" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)" }}>
          <p style={{ fontSize: 13, color: "var(--text-body)" }}>
            Avaliações, comentários e tags mantêm-se. O resumo e o quiz são gerados de novo. Se a moderação por IA levantar dúvidas, a nova versão fica pendente até um administrador aprovar.
          </p>
          <div>
            <Etiqueta>Ficheiro ({material.tipo === "PDF" ? "PDF" + (aceitaFicheiros?.includes(".docx") ? ", DOCX ou PPTX" : "") : "vídeo"})</Etiqueta>
            <label className="flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer" style={{ background: "var(--surface-input)", border: "1.5px dashed var(--border-subtle-strong)", color: "var(--text-body)" }}>
              <FileUp size={18} style={{ color: "var(--text-accent)" }} />
              <span className="truncate" style={{ fontSize: 13.5, fontWeight: 600 }}>{ficheiro ? ficheiro.name : "Escolher ficheiro…"}</span>
              <input type="file" className="hidden" accept={aceitaFicheiros} onChange={e => setFicheiro(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div>
            <Etiqueta>O que mudou (opcional)</Etiqueta>
            <input value={notas} onChange={e => setNotas(e.target.value.slice(0, 500))} placeholder="Ex.: corrigido o capítulo 3, adicionados exercícios"
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none" style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
          </div>
          <div className="flex justify-end gap-2">
            <BotaoSecundario type="button" onClick={() => { setFormAberto(false); setFicheiro(null); }}>Cancelar</BotaoSecundario>
            <BotaoPrimario type="submit" loading={aEnviar} disabled={!ficheiro}><Upload size={15} /> Enviar versão {(dados?.actual?.versao || 1) + 1}</BotaoPrimario>
          </div>
        </form>
      )}

      {dados?.actual?.notas && (
        <p className="mb-4 rounded-2xl px-4 py-3" style={{ fontSize: 13, background: "var(--surface-hover)", color: "var(--text-body)" }}>
          <strong style={{ color: "var(--text-heading)" }}>Nesta versão:</strong> {dados.actual.notas}
        </p>
      )}
      {aCarregar ? <Spinner /> : anteriores.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "var(--text-faint)" }}>Ainda não há versões anteriores.</p>
      ) : (
        <ul className="space-y-2">
          {anteriores.map(v => (
            <li key={v.id} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ border: "1px solid var(--border-subtle)" }}>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-black" style={{ background: "var(--surface-hover)", color: "var(--text-accent)" }}>v{v.versao}</span>
              <div className="min-w-0 flex-1">
                <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-heading)" }}>{formatarData(v.criado_em)}{v.autor ? ` · ${v.autor}` : ""}</p>
                {v.notas && <p className="truncate" style={{ fontSize: 12.5, color: "var(--text-faint)" }}>{v.notas}</p>}
              </div>
              <a href={v.url_arquivo} download className="rounded-xl p-2" style={{ color: "var(--text-accent)" }} title="Descarregar esta versão" aria-label={`Descarregar versão ${v.versao}`}>
                <Download size={16} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </CartaoOuSeccao>
  );
};

export default VersoesMaterial;
