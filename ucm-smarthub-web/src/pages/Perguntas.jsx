import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { MessageCircleQuestion, Plus, CheckCircle2, ArrowLeft, Send, Trash2, Search, Eye, MessagesSquare, Award } from "lucide-react";
import api from "../services/api";
import { useConfig } from "../context/ConfigContext";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import BotaoReportar from "../components/Reportar";
import { Cartao, Campo, BotaoPrimario, BotaoSecundario, Spinner, Vazio, Etiqueta, Avatar, formatarData } from "../components/ui";

const Cabecalho = ({ titulo, sub }) => (
  <section className="relative overflow-hidden rounded-[32px] text-white p-9"
    style={{ background: "linear-gradient(135deg, var(--color-navy-abyss), var(--color-navy-deep), var(--color-navy-mid))", boxShadow: "0 24px 80px rgba(var(--color-navy-abyss-rgb),0.45)" }}>
    <p className="text-[10px] font-bold uppercase mb-2" style={{ letterSpacing: "0.4em", opacity: 0.6 }}>Comunidade</p>
    <h1 style={{ fontSize: "clamp(1.6rem,3vw,2.2rem)", fontWeight: 900, lineHeight: 1.1 }}>{titulo}</h1>
    <p className="mt-2" style={{ fontSize: 14, opacity: 0.8, maxWidth: 560 }}>{sub}</p>
  </section>
);

const Select = ({ value, onChange, children, ...props }) => (
  <select value={value} onChange={onChange} {...props}
    className="rounded-2xl px-4 py-3 text-sm outline-none appearance-none"
    style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }}>
    {children}
  </select>
);

const Textarea = (props) => (
  <textarea {...props}
    className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-y"
    style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
);

/* ─── Lista ─── */
const ListaPerguntas = ({ usuarioLogado, onToast }) => {
  const navigate = useNavigate();
  const { cursos } = useConfig();
  const [params, setParams] = useSearchParams();
  const disciplina = params.get("disciplina") || "";
  const estado = params.get("estado") || "";
  const [busca, setBusca] = useState("");
  const [perguntas, setPerguntas] = useState([]);
  const [paginacao, setPaginacao] = useState({ page: 1, totalPages: 1, total: 0 });
  const [aCarregar, setACarregar] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [form, setForm] = useState({ disciplina: usuarioLogado?.curso || "", titulo: "", conteudo: "" });
  const [aPublicar, setAPublicar] = useState(false);

  const carregar = useCallback(async (page = 1) => {
    setACarregar(true);
    try {
      const { data } = await api.get("/perguntas", { params: { page, limit: 15, disciplina: disciplina || undefined, estado: estado || undefined, busca: busca || undefined } });
      setPerguntas(prev => (page === 1 ? data.perguntas : [...prev, ...data.perguntas]));
      setPaginacao(data.pagination);
    } catch {
      setPerguntas([]);
    } finally {
      setACarregar(false);
    }
  }, [disciplina, estado, busca]);

  useEffect(() => { const t = setTimeout(() => carregar(1), busca ? 350 : 0); return () => clearTimeout(t); }, [carregar, busca]);

  const setParam = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n); };

  const publicar = async (e) => {
    e.preventDefault();
    setAPublicar(true);
    try {
      const { data } = await api.post("/perguntas", form);
      onToast("Pergunta publicada.");
      navigate(`/perguntas/${data.id}`);
    } catch (err) {
      onToast(err.response?.data?.erro || "Erro ao publicar.", "error");
    } finally {
      setAPublicar(false);
    }
  };

  return (
    <>
      <Cabecalho titulo="Perguntas e respostas" sub="Tire dúvidas por disciplina. Quem perguntou marca a resposta que resolveu — e quem respondeu ganha 5 pontos de reputação." />

      <Cartao icon={Plus} titulo="Fazer uma pergunta" accao={!formAberto && <BotaoPrimario type="button" onClick={() => setFormAberto(true)}><Plus size={15} /> Nova pergunta</BotaoPrimario>}>
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
              <Campo label="Título" type="text" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value.slice(0, 200) }))} placeholder="Resuma a dúvida numa frase" required minLength={8} />
            </div>
            <div>
              <Etiqueta>Descrição</Etiqueta>
              <Textarea rows={5} value={form.conteudo} onChange={e => setForm(f => ({ ...f, conteudo: e.target.value.slice(0, 5000) }))} placeholder="O que já tentou? Onde está a dificuldade? Quanto mais contexto, melhor a resposta." required />
            </div>
            <div className="flex justify-end gap-2">
              <BotaoSecundario type="button" onClick={() => setFormAberto(false)}>Cancelar</BotaoSecundario>
              <BotaoPrimario type="submit" loading={aPublicar} disabled={!form.disciplina || form.titulo.trim().length < 8 || form.conteudo.trim().length < 10}><Send size={15} /> Publicar</BotaoPrimario>
            </div>
          </form>
        ) : (
          <p style={{ fontSize: 13.5, color: "var(--text-body)" }}>Antes de perguntar, pesquise abaixo — pode já haver resposta.</p>
        )}
      </Cartao>

      <Cartao icon={MessageCircleQuestion} titulo={`${paginacao.total} pergunta${paginacao.total !== 1 ? "s" : ""}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" size={16} style={{ color: "var(--text-faint)" }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar perguntas…"
              className="w-full rounded-2xl py-3 pl-11 pr-4 text-sm outline-none" style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
          </div>
          <Select value={disciplina} onChange={e => setParam("disciplina", e.target.value)}>
            <option value="">Todas as disciplinas</option>
            {cursos.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </Select>
          <Select value={estado} onChange={e => setParam("estado", e.target.value)}>
            <option value="">Todas</option>
            <option value="abertas">Por resolver</option>
            <option value="resolvidas">Resolvidas</option>
          </Select>
        </div>

        {aCarregar && perguntas.length === 0 ? <Spinner /> : perguntas.length === 0 ? (
          <Vazio icon={MessageCircleQuestion}>Ainda não há perguntas{disciplina ? ` em ${disciplina}` : ""}. Seja o primeiro a perguntar.</Vazio>
        ) : (
          <ul className="space-y-2">
            {perguntas.map(p => (
              <li key={p.id}>
                <button type="button" onClick={() => navigate(`/perguntas/${p.id}`)} className="w-full flex gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors"
                  style={{ border: "1px solid var(--border-subtle)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}>
                  <div className="w-12 shrink-0 text-center rounded-xl py-1.5" style={{ background: p.resolvida ? "var(--status-success-bg)" : "var(--surface-hover)", color: p.resolvida ? "var(--status-success-text)" : "var(--text-muted)" }}>
                    <p style={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}>{p.total_respostas}</p>
                    <p className="text-[9.5px] font-bold uppercase" style={{ letterSpacing: "0.06em" }}>{p.resolvida ? "resolv." : "resp."}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2" style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text-heading)" }}>
                      {p.resolvida ? <CheckCircle2 size={15} style={{ color: "var(--status-success-text)", flexShrink: 0 }} /> : null}
                      <span className="truncate">{p.titulo}</span>
                    </p>
                    <p className="truncate mt-0.5" style={{ fontSize: 13, color: "var(--text-body)" }}>{p.conteudo}</p>
                    <p className="mt-1" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                      {p.disciplina} · {p.autor} · {formatarData(p.criado_em)} · <Eye size={11} className="inline" /> {p.visualizacoes}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {paginacao.page < paginacao.totalPages && (
          <div className="flex justify-center mt-5"><BotaoSecundario type="button" onClick={() => carregar(paginacao.page + 1)}>Carregar mais</BotaoSecundario></div>
        )}
      </Cartao>
    </>
  );
};

/* ─── Detalhe ─── */
const VerPergunta = ({ id, usuarioLogado, onToast }) => {
  const navigate = useNavigate();
  const [pergunta, setPergunta] = useState(null);
  const [erro, setErro] = useState("");
  const [resposta, setResposta] = useState("");
  const [aResponder, setAResponder] = useState(false);
  const [confirmar, setConfirmar] = useState({ message: "", accao: null });

  const carregar = useCallback(async () => {
    try { const { data } = await api.get(`/perguntas/${id}`); setPergunta(data); }
    catch (err) { setErro(err.response?.status === 404 ? "Esta pergunta já não existe." : "Não foi possível abrir a pergunta."); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const responder = async (e) => {
    e.preventDefault();
    setAResponder(true);
    try {
      await api.post(`/perguntas/${id}/respostas`, { conteudo: resposta.trim() });
      setResposta("");
      onToast("Resposta publicada.");
      carregar();
    } catch (err) {
      onToast(err.response?.data?.erro || "Erro ao responder.", "error");
    } finally {
      setAResponder(false);
    }
  };

  const aceitar = async (r) => {
    try {
      const { data } = await api.put(`/perguntas/${id}/aceitar/${r.id}`);
      onToast(data.mensagem);
      carregar();
    } catch (err) {
      onToast(err.response?.data?.erro || "Erro ao marcar.", "error");
    }
  };

  const apagarPergunta = () => setConfirmar({
    message: "Apagar esta pergunta e todas as respostas?",
    accao: async () => { try { await api.delete(`/perguntas/${id}`); onToast("Pergunta apagada."); navigate("/perguntas"); } catch (err) { onToast(err.response?.data?.erro || "Erro ao apagar.", "error"); } },
  });
  const apagarResposta = (r) => setConfirmar({
    message: "Apagar esta resposta?",
    accao: async () => { try { await api.delete(`/respostas/${r.id}`); onToast("Resposta apagada."); carregar(); } catch (err) { onToast(err.response?.data?.erro || "Erro ao apagar.", "error"); } },
  });

  if (erro) return (
    <Cartao icon={MessageCircleQuestion} titulo="Pergunta indisponível">
      <p style={{ fontSize: 14, color: "var(--text-body)" }}>{erro}</p>
      <div className="mt-4"><BotaoSecundario type="button" onClick={() => navigate("/perguntas")}><ArrowLeft size={15} /> Todas as perguntas</BotaoSecundario></div>
    </Cartao>
  );
  if (!pergunta) return <Spinner label="A abrir a pergunta…" />;

  const ehAdmin = usuarioLogado?.papel === "admin";
  const ehAutor = pergunta.usuario_id === usuarioLogado?.id;

  return (
    <>
      <ConfirmModal message={confirmar.message} onConfirm={async () => { const a = confirmar.accao; setConfirmar({ message: "", accao: null }); await a?.(); }} onCancel={() => setConfirmar({ message: "", accao: null })} />
      <div className="flex items-center gap-2">
        <BotaoSecundario type="button" onClick={() => navigate("/perguntas")}><ArrowLeft size={15} /> Perguntas</BotaoSecundario>
        <button type="button" onClick={() => navigate(`/perguntas?disciplina=${encodeURIComponent(pergunta.disciplina)}`)} className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: "var(--surface-hover)", color: "var(--text-accent)" }}>{pergunta.disciplina}</button>
      </div>

      <Cartao
        icon={pergunta.resolvida ? CheckCircle2 : MessageCircleQuestion}
        titulo={pergunta.titulo}
        subtitulo={`${pergunta.autor} · ${formatarData(pergunta.criado_em)} · ${pergunta.visualizacoes} visualizaç${pergunta.visualizacoes === 1 ? "ão" : "ões"}${pergunta.resolvida ? " · Resolvida" : ""}`}
        accao={(
          <div className="flex items-center gap-1">
            {!ehAutor && <BotaoReportar tipo="pergunta" recursoId={pergunta.id} compacto onToast={onToast} />}
            {(ehAutor || ehAdmin) && <button type="button" onClick={apagarPergunta} className="rounded-xl p-2" style={{ color: "var(--text-faint)" }} aria-label="Apagar pergunta"><Trash2 size={15} /></button>}
          </div>
        )}
      >
        <p className="whitespace-pre-wrap break-words" style={{ fontSize: 14.5, color: "var(--text-body)", lineHeight: 1.7 }}>{pergunta.conteudo}</p>
      </Cartao>

      <Cartao icon={MessagesSquare} titulo={`${pergunta.respostas.length} resposta${pergunta.respostas.length !== 1 ? "s" : ""}`}>
        {pergunta.respostas.length === 0 ? (
          <Vazio icon={MessagesSquare}>Ainda ninguém respondeu. Sabe a resposta? Ajude abaixo.</Vazio>
        ) : (
          <ul className="space-y-3">
            {pergunta.respostas.map(r => (
              <li key={r.id} className="flex gap-3 rounded-2xl p-4" style={{ border: `1.5px solid ${r.aceite ? "var(--status-success-border)" : "var(--border-subtle)"}`, background: r.aceite ? "var(--status-success-bg)" : "transparent" }}>
                <Avatar nome={r.autor} url={r.autor_avatar} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-heading)" }}>{r.autor}</span>
                      {r.autor_papel === "professor" && <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: "rgba(var(--color-gold-rgb),0.2)", color: "var(--color-gold-dark)" }}>Docente</span>}
                      {r.aceite && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: "var(--status-success-text)", color: "#fff" }}><Award size={10} /> Solução</span>}
                      <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{formatarData(r.criado_em)}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {ehAutor && !pergunta.resolvida && <button type="button" onClick={() => aceitar(r)} className="rounded-xl px-2.5 py-1.5 text-xs font-bold" style={{ background: "var(--status-success-bg)", color: "var(--status-success-text)", border: "1px solid var(--status-success-border)" }}>Resolveu</button>}
                      {ehAutor && r.aceite && <button type="button" onClick={() => aceitar(r)} className="rounded-xl px-2.5 py-1.5 text-xs font-bold" style={{ color: "var(--text-faint)" }}>Desmarcar</button>}
                      {r.usuario_id !== usuarioLogado?.id && <BotaoReportar tipo="resposta" recursoId={r.id} compacto onToast={onToast} />}
                      {(r.usuario_id === usuarioLogado?.id || ehAdmin) && <button type="button" onClick={() => apagarResposta(r)} className="rounded-xl p-1.5" style={{ color: "var(--text-faint)" }} aria-label="Apagar resposta"><Trash2 size={14} /></button>}
                    </div>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap break-words" style={{ fontSize: 13.5, color: "var(--text-body)", lineHeight: 1.65 }}>{r.conteudo}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={responder} className="mt-6 space-y-3">
          <Etiqueta>A sua resposta</Etiqueta>
          <Textarea rows={4} value={resposta} onChange={e => setResposta(e.target.value.slice(0, 5000))} placeholder="Explique com as suas palavras. Se citar um material do repositório, cole o link." />
          <div className="flex justify-end">
            <BotaoPrimario type="submit" loading={aResponder} disabled={resposta.trim().length < 2}><Send size={15} /> Responder</BotaoPrimario>
          </div>
        </form>
      </Cartao>
    </>
  );
};

const Perguntas = ({ usuarioLogado }) => {
  const { id } = useParams();
  const [toast, setToast] = useState({ message: "", type: "" });
  const onToast = (message, type = "success") => setToast({ message, type });
  return (
    <>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "" })} />
      <div className="space-y-6 animate-fade-in max-w-4xl">
        {id ? <VerPergunta id={id} usuarioLogado={usuarioLogado} onToast={onToast} /> : <ListaPerguntas usuarioLogado={usuarioLogado} onToast={onToast} />}
      </div>
    </>
  );
};

export default Perguntas;
