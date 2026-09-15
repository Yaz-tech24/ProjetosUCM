import React, { useState, useEffect, useCallback } from "react";
import { Flag, ExternalLink, Trash2, Check, EyeOff, Inbox } from "lucide-react";
import api from "../services/api";
import ConfirmModal from "./ConfirmModal";
import { BotaoSecundario, Spinner, Vazio, formatarData } from "./ui";
import { MOTIVOS } from "./Reportar";

const rotuloMotivo = (v) => MOTIVOS.find(m => m.valor === v)?.label || v;
const rotuloTipo = { material: "Material", comentario: "Comentário", mensagem: "Mensagem de chat", pergunta: "Pergunta", resposta: "Resposta" };

// Fila de denúncias do Admin: ver o conteúdo, removê-lo e fechar a denúncia,
// ou marcá-la como ignorada. Fechar uma fecha todas as pendentes sobre o
// mesmo conteúdo.
const FilaDenuncias = ({ navigate, onToast, onContagem }) => {
  const [estado, setEstado] = useState("pendente");
  const [lista, setLista] = useState([]);
  const [aCarregar, setACarregar] = useState(true);
  const [pagina, setPagina] = useState({ page: 1, totalPages: 1, total: 0 });
  const [confirmar, setConfirmar] = useState({ message: "", accao: null });

  const carregar = useCallback(async (page = 1) => {
    setACarregar(page === 1);
    try {
      const { data } = await api.get("/admin/denuncias", { params: { estado, page, limit: 20 } });
      setLista(prev => (page === 1 ? data.denuncias : [...prev, ...data.denuncias]));
      setPagina({ page, totalPages: data.pagination.totalPages, total: data.pagination.total });
      onContagem?.(data.pendentes);
    } catch {
      setLista([]);
    } finally {
      setACarregar(false);
    }
  }, [estado, onContagem]);

  useEffect(() => { carregar(1); }, [carregar]);

  const fechar = async (d, novoEstado, remover = false) => {
    try {
      const { data } = await api.put(`/admin/denuncias/${d.id}`, { estado: novoEstado, remover_conteudo: remover });
      onToast(data.mensagem, novoEstado === "resolvida" ? "success" : "warn");
      carregar(1);
    } catch (err) {
      onToast(err.response?.data?.erro || "Erro ao actualizar a denúncia.", "error");
    }
  };

  const pedirRemocao = (d) => setConfirmar({
    message: `Remover ${rotuloTipo[d.tipo].toLowerCase()} reportado e fechar a denúncia? O conteúdo é apagado definitivamente.`,
    accao: () => fechar(d, "resolvida", true),
  });

  return (
    <section className="rounded-[28px] overflow-hidden" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 32px rgba(var(--color-navy-mid-rgb),0.07)" }}>
      <ConfirmModal message={confirmar.message} onConfirm={async () => { const a = confirmar.accao; setConfirmar({ message: "", accao: null }); await a?.(); }} onCancel={() => setConfirmar({ message: "", accao: null })} />
      <div className="flex flex-wrap items-center justify-between gap-3 px-7 py-5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2.5">
          <Flag size={19} style={{ color: "var(--text-accent)" }} />
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: "var(--text-heading)" }}>Denúncias</h2>
            <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>{pagina.total} {estado}{pagina.total !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="inline-flex rounded-2xl p-1" style={{ background: "var(--surface-hover)", border: "1.5px solid var(--border-subtle-strong)" }}>
          {[["pendente", "Pendentes"], ["resolvida", "Resolvidas"], ["ignorada", "Ignoradas"]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setEstado(k)} className="rounded-xl px-3.5 py-2 text-xs font-bold transition-all"
              style={estado === k ? { background: "var(--surface-card)", color: "var(--text-heading)", boxShadow: "0 2px 8px rgba(var(--color-navy-mid-rgb),0.10)" } : { color: "var(--text-muted)" }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-7">
        {aCarregar ? <Spinner /> : lista.length === 0 ? (
          <Vazio icon={Inbox}>{estado === "pendente" ? "Nada por analisar. Boa!" : `Sem denúncias ${estado}s.`}</Vazio>
        ) : (
          <ul className="space-y-3">
            {lista.map(d => (
              <li key={d.id} className="rounded-2xl p-4" style={{ border: "1px solid var(--border-subtle)" }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-black uppercase" style={{ background: "rgba(var(--color-navy-mid-rgb),0.08)", color: "var(--text-accent)", letterSpacing: "0.08em" }}>{rotuloTipo[d.tipo]} #{d.recurso_id}</span>
                      <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-black" style={{ background: "var(--status-danger-bg)", color: "var(--status-danger-text)" }}>{rotuloMotivo(d.motivo)}</span>
                      <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>por {d.denunciante || "conta eliminada"} · {formatarData(d.criado_em)}</span>
                    </p>
                    <p className="mt-2" style={{ fontSize: 13.5, fontWeight: 700, color: d.recurso.existe ? "var(--text-heading)" : "var(--text-faint)", fontStyle: d.recurso.existe ? "normal" : "italic" }}>
                      {d.recurso.resumo}
                    </p>
                    {d.detalhes && <p className="mt-1" style={{ fontSize: 13, color: "var(--text-body)" }}>“{d.detalhes}”</p>}
                    {d.resolvida_por_nome && <p className="mt-1" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>Fechada por {d.resolvida_por_nome} em {formatarData(d.resolvida_em)}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 w-full lg:w-auto lg:shrink-0">
                    {d.recurso.link && d.recurso.existe && (
                      <BotaoSecundario type="button" onClick={() => navigate(d.recurso.link)} className="!px-3 !py-2 text-xs"><ExternalLink size={14} /> Ver</BotaoSecundario>
                    )}
                    {estado === "pendente" && (
                      <>
                        {d.recurso.existe && (
                          <BotaoSecundario type="button" onClick={() => pedirRemocao(d)} className="!px-3 !py-2 text-xs" style={{ color: "var(--status-danger-text)", borderColor: "var(--status-danger-border)" }}><Trash2 size={14} /> Remover</BotaoSecundario>
                        )}
                        <BotaoSecundario type="button" onClick={() => fechar(d, "resolvida")} className="!px-3 !py-2 text-xs"><Check size={14} /> Resolvida</BotaoSecundario>
                        <BotaoSecundario type="button" onClick={() => fechar(d, "ignorada")} className="!px-3 !py-2 text-xs"><EyeOff size={14} /> Ignorar</BotaoSecundario>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pagina.page < pagina.totalPages && (
          <div className="flex justify-center mt-5"><BotaoSecundario type="button" onClick={() => carregar(pagina.page + 1)}>Carregar mais</BotaoSecundario></div>
        )}
      </div>
    </section>
  );
};

export default FilaDenuncias;
