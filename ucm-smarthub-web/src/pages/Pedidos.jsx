import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HandHelping, Plus, Send, Search, Trash2, CheckCircle2, XCircle, Link2, FileText, Film, ThumbsUp, PackageCheck } from "lucide-react";
import api from "../services/api";
import { useConfig } from "../context/ConfigContext";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import PartilharMaterial from "../components/PartilharMaterial";
import { Cartao, Campo, BotaoPrimario, BotaoSecundario, Spinner, Vazio, Etiqueta, Avatar, formatarData } from "../components/ui";

/* Pedidos de materiais: "alguém tem…?" — qualquer estudante pede numa
   disciplina; quem tiver o material liga-o ao pedido (fica "atendido" e quem
   pediu é avisado). Quando um material é aprovado numa disciplina com
   pedidos abertos, quem pediu também é notificado. */
const Select = ({ value, onChange, children, ...props }) => (
  <select value={value} onChange={onChange} {...props}
    className="rounded-2xl px-4 py-3 text-sm outline-none appearance-none"
    style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }}>
    {children}
  </select>
);

const ESTADOS = { aberto: { label: "Aberto", cor: "var(--status-warning-text)", bg: "var(--status-warning-bg)", border: "var(--status-warning-border)" }, atendido: { label: "Atendido", cor: "var(--status-success-text)", bg: "var(--status-success-bg)", border: "var(--status-success-border)" }, fechado: { label: "Fechado", cor: "var(--text-faint)", bg: "var(--surface-hover)", border: "var(--border-subtle-strong)" } };

const Pedidos = ({ usuarioLogado }) => {
  const navigate = useNavigate();
  const { cursos } = useConfig();
  const [params, setParams] = useSearchParams();
  const disciplina = params.get("disciplina") || "";
  const estado = params.get("estado") || "aberto";
  const destaque = Number(params.get("id")) || null;
  const [busca, setBusca] = useState("");
  const [pedidos, setPedidos] = useState([]);
  const [paginacao, setPaginacao] = useState({ page: 1, totalPages: 1, total: 0 });
  const [aCarregar, setACarregar] = useState(true);
  const [formAberto, setFormAberto] = useState(() => params.get("novo") === "1");
  const [form, setForm] = useState({ disciplina: usuarioLogado?.curso || "", titulo: params.get("q") || "", descricao: "" });
  const [aPublicar, setAPublicar] = useState(false);
  const [aAtender, setAAtender] = useState(null);     // id do pedido a que se está a ligar um material
  const [materialEscolhido, setMaterialEscolhido] = useState(null);
  const [confirmar, setConfirmar] = useState(null);   // { mensagem, accao }
  const [toast, setToast] = useState({ message: "", type: "" });
  const onToast = (message, type = "success") => setToast({ message, type });

  const carregar = useCallback(async (page = 1) => {
    setACarregar(true);
    try {
      const { data } = await api.get("/pedidos", { params: { page, limit: 15, disciplina: disciplina || undefined, estado, busca: busca || undefined } });
      setPedidos(prev => (page === 1 ? data.pedidos : [...prev, ...data.pedidos]));
      setPaginacao(data.pagination);
    } catch {
      setPedidos([]);
    } finally {
      setACarregar(false);
    }
  }, [disciplina, estado, busca]);

  useEffect(() => { const t = setTimeout(() => carregar(1), busca ? 350 : 0); return () => clearTimeout(t); }, [carregar, busca]);

  useEffect(() => {
    if (!destaque || aCarregar) return;
    document.getElementById(`pedido-${destaque}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [destaque, aCarregar]);

  const setParam = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); n.delete("id"); setParams(n); };
  const actualizar = (p) => setPedidos(prev => prev.map(x => (x.id === p.id ? { ...x, ...p } : x)));

  const publicar = async (e) => {
    e.preventDefault();
    setAPublicar(true);
    try {
      const { data } = await api.post("/pedidos", { disciplina: form.disciplina, titulo: form.titulo.trim(), descricao: form.descricao.trim() || null });
      onToast("Pedido publicado. Quem subscreve a disciplina foi avisado.");
      setForm(f => ({ ...f, titulo: "", descricao: "" }));
      setFormAberto(false);
      if (estado === "aberto" || estado === "todos") {
        setPedidos(prev => [data, ...prev]);
        setPaginacao(p => ({ ...p, total: p.total + 1 }));
      }
    } catch (err) {
      onToast(err.response?.data?.erro || "Erro ao publicar o pedido.", "error");
    } finally {
      setAPublicar(false);
    }
  };

  const apoiar = async (p) => {
    try {
      const { data } = await api.put(`/pedidos/${p.id}/apoiar`);
      actualizar({ id: p.id, ...data });
    } catch (err) {
      onToast(err.response?.data?.erro || "Não foi possível registar.", "error");
    }
  };

  const atender = async (p) => {
    if (!materialEscolhido) return;
    try {
      const { data } = await api.put(`/pedidos/${p.id}/atender`, { material_id: materialEscolhido.id });
      actualizar(data);
      setAAtender(null);
      setMaterialEscolhido(null);
      onToast(p.usuario_id === usuarioLogado?.id ? "Pedido marcado como atendido." : "Obrigado! Quem pediu foi avisado — ganhou 3 pontos de reputação.");
    } catch (err) {
      onToast(err.response?.data?.erro || "Não foi possível atender o pedido.", "error");
    }
  };

  const fechar = (p) => setConfirmar({
    mensagem: "Fechar este pedido sem ligar um material?",
    accao: async () => {
      try { await api.put(`/pedidos/${p.id}/fechar`); actualizar({ id: p.id, estado: "fechado" }); onToast("Pedido fechado."); }
      catch (err) { onToast(err.response?.data?.erro || "Erro ao fechar.", "error"); }
    },
  });
  const apagar = (p) => setConfirmar({
    mensagem: "Apagar este pedido definitivamente?",
    accao: async () => {
      try { await api.delete(`/pedidos/${p.id}`); setPedidos(prev => prev.filter(x => x.id !== p.id)); onToast("Pedido apagado."); }
      catch (err) { onToast(err.response?.data?.erro || "Erro ao apagar.", "error"); }
    },
  });

  const ehAdmin = usuarioLogado?.papel === "admin";

  return (
    <>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "" })} />
      <ConfirmModal message={confirmar?.mensagem || ""} onConfirm={async () => { const a = confirmar?.accao; setConfirmar(null); await a?.(); }} onCancel={() => setConfirmar(null)} />

      <div className="space-y-6 animate-fade-in max-w-4xl">
        <section className="relative overflow-hidden rounded-[32px] text-white p-9"
          style={{ background: "linear-gradient(135deg, var(--color-navy-abyss), var(--color-navy-deep), var(--color-navy-mid))", boxShadow: "0 24px 80px rgba(var(--color-navy-abyss-rgb),0.45)" }}>
          <p className="text-[10px] font-bold uppercase mb-2" style={{ letterSpacing: "0.4em", opacity: 0.6 }}>Comunidade</p>
          <h1 style={{ fontSize: "clamp(1.6rem,3vw,2.2rem)", fontWeight: 900, lineHeight: 1.1 }}>Pedidos de materiais</h1>
          <p className="mt-2" style={{ fontSize: 14, opacity: 0.8, maxWidth: 600 }}>Não encontra os slides, o manual ou o exame de uma disciplina? Peça aqui. Quem tiver o material liga-o ao pedido e ganha 3 pontos de reputação.</p>
        </section>

        <Cartao icon={Plus} titulo="Pedir um material" accao={!formAberto && <BotaoPrimario type="button" onClick={() => setFormAberto(true)}><Plus size={15} /> Novo pedido</BotaoPrimario>}>
          {formAberto ? (
            <form onSubmit={publicar} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                <div>
                  <Etiqueta>Disciplina</Etiqueta>
                  <Select value={form.disciplina} onChange={e => setForm(f => ({ ...f, disciplina: e.target.value }))} required style={{ width: "100%" }}>
                    <option value="">Escolher…</option>
                    {cursos.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                  </Select>
                </div>
                <Campo label="O que procura" type="text" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value.slice(0, 200) }))} placeholder="ex: Slides do capítulo 3 — Integrais" required minLength={5} />
              </div>
              <Campo label="Detalhes (opcional)" type="text" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value.slice(0, 1000) }))} placeholder="Ano lectivo, docente, edição do livro…" />
              <div className="flex justify-end gap-2">
                <BotaoSecundario type="button" onClick={() => setFormAberto(false)}>Cancelar</BotaoSecundario>
                <BotaoPrimario type="submit" loading={aPublicar} disabled={!form.disciplina || form.titulo.trim().length < 5}><Send size={15} /> Publicar pedido</BotaoPrimario>
              </div>
            </form>
          ) : (
            <p style={{ fontSize: 13.5, color: "var(--text-body)" }}>Antes de pedir, pesquise no repositório — e veja se alguém já pediu o mesmo (apoie o pedido em vez de repetir).</p>
          )}
        </Cartao>

        <Cartao icon={HandHelping} titulo={`${paginacao.total} pedido${paginacao.total !== 1 ? "s" : ""}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" size={16} style={{ color: "var(--text-faint)" }} />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar pedidos…" aria-label="Pesquisar pedidos"
                className="w-full rounded-2xl py-3 pl-11 pr-4 text-sm outline-none" style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
            </div>
            <Select value={disciplina} onChange={e => setParam("disciplina", e.target.value)} aria-label="Filtrar por disciplina">
              <option value="">Todas as disciplinas</option>
              {cursos.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
            </Select>
            <Select value={estado} onChange={e => setParam("estado", e.target.value)} aria-label="Filtrar por estado">
              <option value="aberto">Abertos</option>
              <option value="atendido">Atendidos</option>
              <option value="fechado">Fechados</option>
              <option value="todos">Todos</option>
            </Select>
          </div>

          {aCarregar && pedidos.length === 0 ? <Spinner /> : pedidos.length === 0 ? (
            <Vazio icon={HandHelping}>Sem pedidos {estado === "aberto" ? "abertos" : ""} nesta selecção.</Vazio>
          ) : (
            <ul className="space-y-3">
              {pedidos.map(p => {
                const meu = p.usuario_id === usuarioLogado?.id;
                const e = ESTADOS[p.estado] || ESTADOS.aberto;
                return (
                  <li key={p.id} id={`pedido-${p.id}`} className="rounded-2xl p-5 transition-all"
                    style={{ background: "var(--surface-hover)", border: `1px solid ${destaque === p.id ? "var(--color-gold)" : "var(--border-subtle)"}`, boxShadow: destaque === p.id ? "0 0 0 4px rgba(var(--color-gold-rgb),0.18)" : "none" }}>
                    <div className="flex flex-wrap items-start gap-3">
                      <Avatar nome={p.autor} url={p.autor_avatar} tamanho={36} />
                      <div className="min-w-0 flex-1 basis-56">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 style={{ fontSize: 15, fontWeight: 800, color: "var(--text-heading)" }}>{p.titulo}</h4>
                          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase" style={{ background: e.bg, border: `1px solid ${e.border}`, color: e.cor, letterSpacing: "0.08em" }}>{e.label}</span>
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 3 }}>{p.disciplina} · {p.autor}{meu ? " (você)" : ""} · {formatarData(p.criado_em)}</p>
                        {p.descricao && <p className="mt-2" style={{ fontSize: 13.5, color: "var(--text-body)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{p.descricao}</p>}
                        {p.estado === "atendido" && p.material_id && (
                          <button type="button" onClick={() => navigate(`/video/${p.material_id}`)}
                            className="mt-3 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold"
                            style={{ background: "var(--status-success-bg)", border: "1px solid var(--status-success-border)", color: "var(--status-success-text)" }}>
                            {p.material_tipo === "Vídeo" ? <Film size={14} /> : <FileText size={14} />} {p.material_titulo || "Abrir material"}
                            {p.atendido_por_nome && <span style={{ fontWeight: 500, opacity: 0.8 }}>· por {p.atendido_por_nome}</span>}
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 ml-auto">
                        {!meu && p.estado === "aberto" && (
                          <button type="button" onClick={() => apoiar(p)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold"
                            style={p.apoiei ? { background: "var(--color-navy-mid)", color: "#fff" } : { background: "var(--surface-card)", border: "1px solid var(--border-subtle-strong)", color: "var(--text-muted)" }}
                            title={p.apoiei ? "Retirar apoio" : "Também preciso deste material"}>
                            <ThumbsUp size={13} /> {p.apoiei ? "Também preciso" : "Também preciso"} · {p.apoios}
                          </button>
                        )}
                        {meu && p.estado === "aberto" && <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--text-faint)" }}><ThumbsUp size={13} /> {p.apoios}</span>}
                        {p.estado === "aberto" && (
                          <BotaoSecundario type="button" onClick={() => { setAAtender(aAtender === p.id ? null : p.id); setMaterialEscolhido(null); }} className="text-xs">
                            <Link2 size={13} /> {meu ? "Já encontrei" : "Tenho este material"}
                          </BotaoSecundario>
                        )}
                        {(meu || ehAdmin) && p.estado === "aberto" && (
                          <button type="button" onClick={() => fechar(p)} className="w-9 h-9 rounded-xl grid place-items-center" title="Fechar pedido" aria-label="Fechar pedido" style={{ color: "var(--text-faint)" }}><XCircle size={16} /></button>
                        )}
                        {(meu || ehAdmin) && (
                          <button type="button" onClick={() => apagar(p)} className="w-9 h-9 rounded-xl grid place-items-center" title="Apagar pedido" aria-label="Apagar pedido" style={{ color: "var(--status-danger-text)" }}><Trash2 size={16} /></button>
                        )}
                      </div>
                    </div>
                    {aAtender === p.id && (
                      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl p-3" style={{ background: "var(--surface-card)", border: "1px dashed var(--border-subtle-strong)" }}>
                        <PartilharMaterial seleccionado={materialEscolhido} onEscolher={setMaterialEscolhido} onLimpar={() => setMaterialEscolhido(null)} />
                        <p className="flex-1 min-w-[12rem]" style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                          {materialEscolhido ? "Confirme para ligar este material ao pedido." : "Escolha o material do repositório que responde a este pedido. Ainda não está lá? Faça o upload primeiro no Repositório."}
                        </p>
                        <BotaoPrimario type="button" onClick={() => atender(p)} disabled={!materialEscolhido}><PackageCheck size={15} /> Atender pedido</BotaoPrimario>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {paginacao.page < paginacao.totalPages && (
            <div className="text-center mt-5">
              <BotaoSecundario type="button" onClick={() => carregar(paginacao.page + 1)} disabled={aCarregar}>Carregar mais</BotaoSecundario>
            </div>
          )}
        </Cartao>
        <p className="text-center" style={{ fontSize: 12, color: "var(--text-faint)" }}><CheckCircle2 size={12} className="inline mr-1" />Quem atende um pedido de outro estudante ganha 3 pontos de reputação e a conquista “Bom samaritano”.</p>
      </div>
    </>
  );
};

export default Pedidos;
