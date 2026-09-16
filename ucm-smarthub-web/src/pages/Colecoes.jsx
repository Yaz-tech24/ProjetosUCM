import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FolderOpen, FolderPlus, Globe, Lock, Share2, Trash2, Pencil, FileText, PlayCircle, X, ArrowLeft, Check, WifiOff, CloudOff, FileArchive } from "lucide-react";
import api from "../services/api";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import { Cartao, Campo, BotaoPrimario, BotaoSecundario, Spinner, Vazio, formatarData } from "../components/ui";
import { listarOffline, removerMaterialOffline } from "../services/offline";

const Cabecalho = ({ titulo, sub }) => (
  <section className="relative overflow-hidden rounded-[32px] text-white p-9"
    style={{ background: "linear-gradient(135deg, var(--color-navy-abyss), var(--color-navy-deep), var(--color-navy-mid))", boxShadow: "0 24px 80px rgba(var(--color-navy-abyss-rgb),0.45)" }}>
    <p className="text-[10px] font-bold uppercase mb-2" style={{ letterSpacing: "0.4em", opacity: 0.6 }}>Estudo</p>
    <h1 style={{ fontSize: "clamp(1.6rem,3vw,2.2rem)", fontWeight: 900, lineHeight: 1.1 }}>{titulo}</h1>
    <p className="mt-2" style={{ fontSize: 14, opacity: 0.8, maxWidth: 560 }}>{sub}</p>
  </section>
);

const LinhaMaterial = ({ m, onAbrir, accao }) => (
  <li className="flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors" style={{ border: "1px solid var(--border-subtle)" }}
    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
    onMouseLeave={e => (e.currentTarget.style.background = "")}>
    <button type="button" onClick={() => onAbrir(m)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
      <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: m.tipo === "Vídeo" ? "#eff6ff" : "#fff1f2", border: `1px solid ${m.tipo === "Vídeo" ? "#bfdbfe" : "#fecdd3"}` }}>
        {m.tipo === "Vídeo" ? <PlayCircle size={16} style={{ color: "var(--color-navy-mid)" }} /> : <FileText size={16} style={{ color: "#be123c" }} />}
      </span>
      <span className="min-w-0">
        <span className="block truncate" style={{ fontSize: 14, fontWeight: 800, color: "var(--text-heading)" }}>{m.titulo}</span>
        <span className="block truncate" style={{ fontSize: 12, color: "var(--text-faint)" }}>{m.cadeira}{m.autor ? ` · ${m.autor}` : ""}{m.data_upload ? ` · ${formatarData(m.data_upload)}` : ""}</span>
      </span>
    </button>
    {accao}
  </li>
);

/* ─── Lista das minhas colecções + offline ─── */
const MinhasColecoes = ({ onToast }) => {
  const navigate = useNavigate();
  const [colecoes, setColecoes] = useState([]);
  const [aCarregar, setACarregar] = useState(true);
  const [form, setForm] = useState({ nome: "", descricao: "", publica: false });
  const [aCriar, setACriar] = useState(false);
  const [confirmar, setConfirmar] = useState({ message: "", accao: null });
  const [offline, setOffline] = useState(listarOffline());

  const carregar = useCallback(async () => {
    try { const { data } = await api.get("/colecoes"); setColecoes(data); } catch { setColecoes([]); } finally { setACarregar(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const criar = async (e) => {
    e.preventDefault();
    setACriar(true);
    try {
      const { data } = await api.post("/colecoes", form);
      setColecoes(prev => [data, ...prev]);
      setForm({ nome: "", descricao: "", publica: false });
      onToast(`Colecção "${data.nome}" criada.`);
    } catch (err) {
      onToast(err.response?.data?.erro || "Erro ao criar a colecção.", "error");
    } finally {
      setACriar(false);
    }
  };

  const apagar = (c) => setConfirmar({
    message: `Apagar a colecção "${c.nome}"? Os materiais continuam no repositório.`,
    accao: async () => {
      try { await api.delete(`/colecoes/${c.slug}`); setColecoes(prev => prev.filter(x => x.id !== c.id)); onToast("Colecção apagada."); }
      catch (err) { onToast(err.response?.data?.erro || "Erro ao apagar.", "error"); }
    },
  });

  const removerOffline = async (m) => {
    await removerMaterialOffline(m.id);
    setOffline(listarOffline());
    onToast("Cópia offline removida.");
  };

  return (
    <>
      <ConfirmModal message={confirmar.message} onConfirm={async () => { const a = confirmar.accao; setConfirmar({ message: "", accao: null }); await a?.(); }} onCancel={() => setConfirmar({ message: "", accao: null })} />
      <Cabecalho titulo="Colecções de estudo" sub="Agrupe materiais por tema ou exame e partilhe a lista por link. As colecções públicas podem ser abertas por qualquer colega com o link." />

      <Cartao icon={FolderPlus} titulo="Nova colecção">
        <form onSubmit={criar} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Campo label="Nome" type="text" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value.slice(0, 100) }))} placeholder="Ex.: Exame de Cálculo I" required />
          <Campo label="Descrição (opcional)" type="text" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value.slice(0, 500) }))} placeholder="Para que serve" />
          <div className="flex items-center gap-3 pb-1">
            <label className="inline-flex items-center gap-2 cursor-pointer" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-body)" }}>
              <input type="checkbox" checked={form.publica} onChange={e => setForm(f => ({ ...f, publica: e.target.checked }))} className="w-4 h-4" /> Pública
            </label>
            <BotaoPrimario type="submit" loading={aCriar} disabled={form.nome.trim().length < 2}><FolderPlus size={15} /> Criar</BotaoPrimario>
          </div>
        </form>
      </Cartao>

      <Cartao icon={FolderOpen} titulo="As minhas colecções" subtitulo={colecoes.length > 0 ? `${colecoes.length} colecção${colecoes.length > 1 ? "ões" : ""}` : "Ainda não criou nenhuma"}>
        {aCarregar ? <Spinner /> : colecoes.length === 0 ? (
          <Vazio icon={FolderOpen}>Crie a primeira colecção acima, ou use “Colecção” na página de qualquer material.</Vazio>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {colecoes.map(c => (
              <li key={c.id} className="rounded-2xl p-4 flex flex-col gap-2 transition-colors" style={{ border: "1px solid var(--border-subtle)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                <button type="button" onClick={() => navigate(`/colecoes/${c.slug}`)} className="text-left">
                  <p className="flex items-center gap-2" style={{ fontSize: 15, fontWeight: 900, color: "var(--text-heading)" }}>
                    {c.nome} {c.publica ? <Globe size={13} style={{ color: "var(--text-faint)" }} /> : <Lock size={13} style={{ color: "var(--text-faint)" }} />}
                  </p>
                  {c.descricao && <p className="mt-0.5" style={{ fontSize: 12.5, color: "var(--text-faint)" }}>{c.descricao}</p>}
                  <p className="mt-1" style={{ fontSize: 12, color: "var(--text-faint)" }}>{c.total_materiais} material{Number(c.total_materiais) !== 1 ? "is" : ""} · actualizada {formatarData(c.atualizado_em)}</p>
                </button>
                <div className="flex justify-end gap-1">
                  <button type="button" onClick={() => navigate(`/colecoes/${c.slug}`)} className="rounded-xl px-3 py-1.5 text-xs font-bold" style={{ color: "var(--text-accent)", background: "var(--surface-hover)" }}>Abrir</button>
                  <button type="button" onClick={() => apagar(c)} className="rounded-xl p-1.5" style={{ color: "var(--text-faint)" }} aria-label="Apagar colecção"><Trash2 size={15} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao icon={WifiOff} titulo="Guardados para leitura offline" subtitulo="PDFs disponíveis neste dispositivo mesmo sem internet">
        {offline.length === 0 ? (
          <Vazio icon={CloudOff}>Nenhum ainda. Na página de um PDF, use o botão “Offline”.</Vazio>
        ) : (
          <ul className="space-y-2">
            {offline.map(m => (
              <LinhaMaterial key={m.id} m={m} onAbrir={() => navigate(`/video/${m.id}`)}
                accao={<button type="button" onClick={() => removerOffline(m)} className="rounded-xl p-2" style={{ color: "var(--text-faint)" }} aria-label="Remover cópia offline" title="Remover cópia offline"><X size={15} /></button>} />
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
};

/* ─── Uma colecção (própria ou partilhada) ─── */
const VerColecao = ({ slug, onToast }) => {
  const navigate = useNavigate();
  const [colecao, setColecao] = useState(null);
  const [erro, setErro] = useState("");
  const [aCarregar, setACarregar] = useState(true);
  const [aEditar, setAEditar] = useState(false);
  const [form, setForm] = useState({ nome: "", descricao: "", publica: false });
  const [copiado, setCopiado] = useState(false);
  const [aExportar, setAExportar] = useState(false);

  const carregar = useCallback(async () => {
    setACarregar(true);
    try {
      const { data } = await api.get(`/colecoes/${slug}`);
      setColecao(data);
      setForm({ nome: data.nome, descricao: data.descricao || "", publica: Boolean(data.publica) });
    } catch (err) {
      setErro(err.response?.status === 404 ? "Esta colecção não existe ou é privada." : "Não foi possível abrir a colecção.");
    } finally {
      setACarregar(false);
    }
  }, [slug]);
  useEffect(() => { carregar(); }, [carregar]);

  const guardar = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/colecoes/${slug}`, form);
      setColecao(c => ({ ...c, ...form, publica: form.publica ? 1 : 0 }));
      setAEditar(false);
      onToast("Colecção actualizada.");
    } catch (err) {
      onToast(err.response?.data?.erro || "Erro ao guardar.", "error");
    }
  };

  const retirar = async (m) => {
    try {
      await api.delete(`/colecoes/${slug}/materiais/${m.id}`);
      setColecao(c => ({ ...c, materiais: c.materiais.filter(x => x.id !== m.id) }));
    } catch (err) {
      onToast(err.response?.data?.erro || "Erro ao retirar.", "error");
    }
  };

  /* ZIP com os PDFs: pedido autenticado (cookie) em blob e download local —
     um <a href> directo não levava a sessão em desenvolvimento (origens
     diferentes) e não permitia mostrar o estado "a preparar". */
  const exportarZip = async () => {
    setAExportar(true);
    try {
      const res = await api.get(`/colecoes/${slug}/zip`, { responseType: "blob", timeout: 10 * 60 * 1000 });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(colecao?.nome || "colecao").replace(/[^\w\s.-]+/g, " ").trim()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      onToast("ZIP pronto — a transferir.");
    } catch (err) {
      let mensagem = "Não foi possível exportar a colecção.";
      if (err.response?.data instanceof Blob) {
        try { mensagem = JSON.parse(await err.response.data.text()).erro || mensagem; } catch { /* corpo não-JSON */ }
      } else if (err.response?.data?.erro) mensagem = err.response.data.erro;
      onToast(mensagem, "error");
    } finally {
      setAExportar(false);
    }
  };

  const partilhar = async () => {
    const url = `${window.location.origin}/colecoes/${slug}`;
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    catch { onToast(url, "warn"); }
  };

  if (aCarregar) return <Spinner label="A abrir a colecção…" />;
  if (erro) return (
    <Cartao icon={Lock} titulo="Colecção indisponível">
      <p style={{ fontSize: 14, color: "var(--text-body)" }}>{erro}</p>
      <div className="mt-4"><BotaoSecundario type="button" onClick={() => navigate("/colecoes")}><ArrowLeft size={15} /> As minhas colecções</BotaoSecundario></div>
    </Cartao>
  );

  return (
    <>
      <Cabecalho titulo={colecao.nome} sub={colecao.descricao || `Colecção de ${colecao.dono}`} />
      <Cartao
        icon={colecao.publica ? Globe : Lock}
        titulo={`${colecao.materiais.length} material${colecao.materiais.length !== 1 ? "is" : ""}`}
        subtitulo={`${colecao.publica ? "Pública — qualquer colega com o link pode abrir" : "Privada — só o dono a vê"} · por ${colecao.dono}`}
        accao={(
          <div className="flex flex-wrap gap-2">
            <BotaoSecundario type="button" onClick={() => navigate("/colecoes")}><ArrowLeft size={15} /> Voltar</BotaoSecundario>
            {colecao.publica && <BotaoSecundario type="button" onClick={partilhar}>{copiado ? <Check size={15} /> : <Share2 size={15} />} {copiado ? "Link copiado" : "Partilhar"}</BotaoSecundario>}
            {colecao.materiais.some(m => m.tipo === "PDF") && (
              <BotaoSecundario type="button" onClick={exportarZip} disabled={aExportar} title="Descarregar todos os PDFs num único ficheiro .zip">
                <FileArchive size={15} /> {aExportar ? "A preparar…" : "ZIP"}
              </BotaoSecundario>
            )}
            {colecao.minha && <BotaoSecundario type="button" onClick={() => setAEditar(v => !v)}><Pencil size={15} /> Editar</BotaoSecundario>}
          </div>
        )}
      >
        {aEditar && (
          <form onSubmit={guardar} className="rounded-2xl p-5 mb-5 grid gap-4 sm:grid-cols-2" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)" }}>
            <Campo label="Nome" type="text" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value.slice(0, 100) }))} required />
            <Campo label="Descrição" type="text" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value.slice(0, 500) }))} />
            <div className="sm:col-span-2 flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 cursor-pointer" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-body)" }}>
                <input type="checkbox" checked={form.publica} onChange={e => setForm(f => ({ ...f, publica: e.target.checked }))} className="w-4 h-4" /> Pública (partilhável por link)
              </label>
              <div className="flex gap-2">
                <BotaoSecundario type="button" onClick={() => setAEditar(false)}>Cancelar</BotaoSecundario>
                <BotaoPrimario type="submit"><Check size={15} /> Guardar</BotaoPrimario>
              </div>
            </div>
          </form>
        )}
        {colecao.materiais.length === 0 ? (
          <Vazio icon={FolderOpen}>Ainda não tem materiais. Use “Colecção” na página de um material para o juntar aqui.</Vazio>
        ) : (
          <ul className="space-y-2">
            {colecao.materiais.map(m => (
              <LinhaMaterial key={m.id} m={m} onAbrir={() => navigate(`/video/${m.id}`)}
                accao={colecao.minha && <button type="button" onClick={() => retirar(m)} className="rounded-xl p-2" style={{ color: "var(--text-faint)" }} aria-label="Retirar da colecção" title="Retirar"><X size={15} /></button>} />
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
};

const Colecoes = () => {
  const { slug } = useParams();
  const [toast, setToast] = useState({ message: "", type: "" });
  const onToast = (message, type = "success") => setToast({ message, type });
  return (
    <>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "" })} />
      <div className="space-y-8 animate-fade-in max-w-4xl">
        {slug ? <VerColecao slug={slug} onToast={onToast} /> : <MinhasColecoes onToast={onToast} />}
      </div>
    </>
  );
};


export default Colecoes;
