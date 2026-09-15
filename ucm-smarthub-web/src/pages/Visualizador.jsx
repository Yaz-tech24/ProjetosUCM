import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "../services/api";
import useFavoritos from "../hooks/useFavoritos";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, DownloadCloud, Sparkles, RotateCcw, Heart, Share2, Trash2, Send, MessageCircle, Eye, WifiOff, CloudDownload, CloudOff, Star, BrainCircuit, History } from "lucide-react";
import { useConfig } from "../context/ConfigContext";
import Toast from "../components/Toast";
import Avaliacoes from "../components/Avaliacoes";
import Comentarios from "../components/Comentarios";
import TagsMaterial from "../components/TagsMaterial";
import Quiz from "../components/Quiz";
import VersoesMaterial from "../components/VersoesMaterial";
import GuardarEmColecao from "../components/GuardarEmColecao";
import BotaoReportar from "../components/Reportar";
import { guardarMaterialOffline, removerMaterialOffline, estaGuardadoOffline, obterMaterialOffline, obterUrlLocal } from "../services/offline";

/* ── Renderiza o resumo estruturado devolvido pela IA ── */
const SummaryRenderer = ({ text }) => {
  const SECOES_CONHECIDAS = [
    "VISÃO GERAL", "CONCEITOS FUNDAMENTAIS", "MÉTODOS E PROCEDIMENTOS",
    "PONTOS-CHAVE PARA O EXAME", "DICA DE ESTUDO",
  ];

  const isSecao   = (l) => SECOES_CONHECIDAS.some(s => l.trim().toUpperCase() === s) || /^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ\s]{6,}$/.test(l.trim());
  const isBullet  = (l) => l.trim().startsWith("• ") || l.trim().startsWith("- ");
  const limparBullet = (l) => l.trim().replace(/^[•-]\s*/, "");
  // A IA por vezes ignora a instrução "sem markdown" do prompt — remove
  // **negrito**/__negrito__ que sobrevivam, para nunca mostrar asteriscos literais.
  const limparMarkdown = (s) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");

  const linhas = text.split('\n').filter(l => l.trim().length > 0);

  return (
    <div className="space-y-1">
      {linhas.map((linha, i) => {
        if (isSecao(linha)) return (
          <div key={i} style={{ paddingTop: i === 0 ? 0 : 14, paddingBottom: 6 }}>
            <div className="flex items-center gap-2.5">
              <div style={{ width: 3, height: 16, borderRadius: 2, background: "linear-gradient(180deg,var(--color-gold-dark),var(--color-gold))", flexShrink: 0 }} />
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.38em", color: "rgba(var(--color-gold-rgb),0.85)", textTransform: "uppercase" }}>
                {limparMarkdown(linha.trim())}
              </p>
            </div>
          </div>
        );

        if (isBullet(linha)) {
          const partes = limparMarkdown(limparBullet(linha)).split(/:(.+)/);
          const temLabel = partes.length > 1;
          return (
            <div key={i} className="flex items-start gap-3" style={{ paddingLeft: 8, paddingTop: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-gold)", boxShadow: "0 0 5px rgba(var(--color-gold-rgb),0.60)", flexShrink: 0, marginTop: 7 }} />
              <p style={{ fontSize: 13.5, color: "rgba(226,232,240,0.88)", lineHeight: 1.65 }}>
                {temLabel
                  ? <><strong style={{ color: "#fff", fontWeight: 700 }}>{partes[0].trim()}</strong>:{partes[1]}</>
                  : partes[0]}
              </p>
            </div>
          );
        }

        return (
          <p key={i} style={{ fontSize: 13.5, color: "rgba(var(--color-blue-sky-rgb),0.80)", lineHeight: 1.70, paddingTop: 2 }}>
            {limparMarkdown(linha.trim())}
          </p>
        );
      })}
    </div>
  );
};

/* Deriva o MIME type do vídeo a partir da extensão real do ficheiro —
   os uploads podem ser mp4/webm/ogg/mov (ver tipos_ficheiro_permitidos em Admin.jsx). */
const EXTENSAO_PARA_MIME = { mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg", mov: "video/quicktime" };
const getVideoMimeType = (url) => {
  if (!url) return "video/mp4";
  const semQuery = url.split(/[?#]/)[0];
  const ext = semQuery.split('.').pop()?.toLowerCase();
  return EXTENSAO_PARA_MIME[ext] || "video/mp4";
};

const Visualizador = ({ usuarioLogado }) => {
  const { config } = useConfig();
  const { id } = useParams();
  const navigate = useNavigate();

  const [material,       setMaterial]       = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [erroCarregar,   setErroCarregar]   = useState(null); // 'nao_encontrado' | 'ligacao' | null
  const [summary,        setSummary]        = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError,   setSummaryError]   = useState(null);
  const { ehFavorito, alternar: alternarFavorito } = useFavoritos();
  const [copiado,        setCopiado]        = useState(false);
  const [confirmRemover, setConfirmRemover] = useState(false);
  const [removendo,      setRemovendo]      = useState(false);
  const [toast,          setToast]          = useState({ message: '', type: '' });
  const [chatMessages,   setChatMessages]   = useState([]);
  const [chatInput,      setChatInput]      = useState('');
  const [chatEnviando,   setChatEnviando]   = useState(false);
  const [offline,        setOffline]        = useState(false);   // guardado para leitura offline
  const [aGuardarOffline, setAGuardarOffline] = useState(false);
  const [urlLocal,       setUrlLocal]       = useState(null);    // blob URL do PDF em cache
  const [semRede,        setSemRede]        = useState(false);   // a mostrar a cópia offline
  const [searchParams]   = useSearchParams();
  const [separador,      setSeparador]      = useState(() => searchParams.get('sep') || 'avaliacoes');

  const summaryAbortRef = useRef(null);
  const chatEndRef      = useRef(null);

  /* AbortController evita que uma resposta antiga (de um "id" anterior, se o
     utilizador navegar rapidamente entre materiais) sobrescreva o estado actual. */
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setErroCarregar(null);
    setSemRede(false);
    setOffline(estaGuardadoOffline(id));
    api.get(`/materiais/${id}`, { signal: controller.signal })
      .then(res => {
        setMaterial(res.data);
        // Conta uma abertura (o servidor ignora repetições em 30 min).
        api.post(`/materiais/${id}/acesso`, { tipo: 'abertura' }).catch(() => {});
      })
      .catch(err => {
        if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.name === 'AbortError') return;
        // Sem rede mas com cópia guardada: abre a cópia offline.
        const copia = !err.response && obterMaterialOffline(id);
        if (copia) { setMaterial(copia); setSemRede(true); return; }
        setMaterial(null);
        // Distingue "não existe" de "não foi possível verificar" — mostrar a
        // mesma mensagem para os dois esconde uma falha de rede real atrás
        // de um "não encontrado" que sugere (erradamente) que o link está morto.
        setErroCarregar(err.response?.status === 404 ? 'nao_encontrado' : 'ligacao');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);

  /* Se o PDF estiver guardado offline, mostra-o a partir da cache (blob URL) */
  useEffect(() => {
    let activo = true;
    let urlCriado = null;
    if (material?.url_arquivo && material.tipo === 'PDF' && offline) {
      obterUrlLocal(material.url_arquivo).then(u => { if (activo) { urlCriado = u; setUrlLocal(u); } });
    } else {
      setUrlLocal(null);
    }
    return () => { activo = false; if (urlCriado) URL.revokeObjectURL(urlCriado); };
  }, [material, offline]);

  const handleOffline = async () => {
    if (!material || aGuardarOffline) return;
    setAGuardarOffline(true);
    try {
      if (offline) {
        await removerMaterialOffline(material.id);
        setOffline(false);
        setToast({ message: "Cópia offline removida.", type: "success" });
      } else {
        await guardarMaterialOffline(material);
        setOffline(true);
        setToast({ message: "Guardado. Pode abrir este PDF sem ligação à internet.", type: "success" });
      }
    } catch (err) {
      setToast({ message: err.message || "Não foi possível guardar para offline.", type: "error" });
    } finally {
      setAGuardarOffline(false);
    }
  };

  const registarDownload = () => { api.post(`/materiais/${material.id}/acesso`, { tipo: 'download' }).catch(() => {}); };

  const fetchSummary = useCallback(async (forcar = false) => {
    if (!material) return;
    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      // Sem forcar: o backend devolve o resumo já gerado antes (cache), se existir
      // — só recalcula (e volta a pagar a IA) quando o utilizador pede "Regenerar".
      const res = await api.get(`/materiais/${id}/resumo${forcar ? '?forcar=true' : ''}`, { signal: controller.signal });
      setSummary(res.data.resumo || 'Resumo não disponível.');
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.name === 'AbortError') return;
      setSummaryError('Não foi possível gerar o resumo no momento.');
    } finally {
      if (!controller.signal.aborted) setSummaryLoading(false);
    }
  }, [material, id]);

  useEffect(() => { if (material) fetchSummary(); }, [material, fetchSummary]);

  /* Cancela o pedido de resumo em curso ao desmontar (ex: utilizador navega para outra página). */
  useEffect(() => () => summaryAbortRef.current?.abort(), []);

  /* Limpa a conversa ao trocar de material — perguntas sobre o PDF anterior não
     fazem sentido a seguir a uma navegação para outro documento. */
  useEffect(() => { setChatMessages([]); setChatInput(''); }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [chatMessages, chatEnviando]);

  const handleEnviarChat = async (e) => {
    e.preventDefault();
    const texto = chatInput.trim();
    if (!texto || chatEnviando) return;
    setChatMessages(prev => [...prev, { autor: 'utilizador', texto }]);
    setChatInput('');
    setChatEnviando(true);
    try {
      const res = await api.post(`/materiais/${id}/chat`, { mensagem: texto });
      setChatMessages(prev => [...prev, { autor: 'ia', texto: res.data.resposta }]);
    } catch (err) {
      const erroTexto = err.response?.data?.erro || 'Não foi possível responder agora. Tente novamente.';
      setChatMessages(prev => [...prev, { autor: 'ia', texto: erroTexto }]);
    } finally {
      setChatEnviando(false);
    }
  };

  const fav = material ? ehFavorito(material.id) : false;
  const handleToggleFav = () => {
    alternarFavorito(material.id).catch(() => setToast({ message: "Não foi possível guardar o favorito.", type: "error" }));
  };

  const handleCopiarLink = () => {
    if (!navigator.clipboard) {
      // Fallback para navegadores sem Clipboard API
      const input = document.createElement('input');
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      return;
    }
    navigator.clipboard.writeText(window.location.href)
      .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); })
      .catch(() => {}); // permissão negada — sem crash
  };

  const podeRemover = usuarioLogado && material && (usuarioLogado.papel === "admin" || material.autor_id === usuarioLogado.id);

  const confirmarRemocao = async () => {
    setRemovendo(true);
    try {
      await api.delete(`/materiais/${material.id}`);
      navigate('/repositorio');
    } catch (err) {
      setToast({ message: err.response?.data?.erro || "Erro ao remover material.", type: "error" });
      setConfirmRemover(false);
    } finally {
      setRemovendo(false);
    }
  };

  /* Acessibilidade do modal de confirmação: foca-o ao abrir e fecha com Esc */
  const confirmRemoverRef = useRef(null);
  useEffect(() => {
    if (!confirmRemover) return;
    confirmRemoverRef.current?.focus();
    const onKeyDown = (e) => { if (e.key === 'Escape') setConfirmRemover(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmRemover]);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 gap-4">
        <div className="w-12 h-12 rounded-full border-4 animate-spin" style={{ borderColor: "rgba(var(--color-navy-mid-rgb),0.12)", borderTopColor: "var(--color-gold)" }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)" }}>A carregar o material...</p>
      </div>
    );
  }

  if (!material) {
    const ligacaoFalhou = erroCarregar === 'ligacao';
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-5 animate-fade-in">
        <div className="w-24 h-24 rounded-[28px] grid place-items-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
          <DownloadCloud size={38} style={{ color: "#ef4444" }} />
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: "var(--text-heading)" }}>
          {ligacaoFalhou ? "Não foi possível carregar" : "Material não encontrado"}
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
          {ligacaoFalhou
            ? "Falha de ligação ao servidor. Verifique a sua ligação e tente novamente."
            : "Este recurso não existe no repositório."}
        </p>
        <div className="flex items-center gap-3">
          {ligacaoFalhou && (
            <button
              onClick={() => navigate(0)}
              className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold transition-all duration-200 mt-2"
              style={{ background: "var(--surface-card)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-accent)" }}
            >
              Tentar novamente
            </button>
          )}
          <button
            onClick={() => navigate('/repositorio')}
            className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white transition-all duration-200 mt-2"
            style={{ background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", boxShadow: "0 6px 22px rgba(var(--color-navy-deep-rgb),0.35)" }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "")}
          >
            <ArrowLeft size={16} /> Voltar ao Repositório
          </button>
        </div>
      </div>
    );
  }

  const isVideo = material.tipo === "Vídeo";
  const isPDF   = material.tipo === "PDF";

  return (
    <>
    <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />
    <div className="animate-fade-in h-full flex flex-col xl:flex-row gap-7 pb-24 xl:pb-0">

      {/* ─── Coluna esquerda ─── */}
      <div className="flex-1 space-y-6">

        {/* Barra de acções */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate("/repositorio")}
            className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold transition-all duration-200"
            style={{ background: "var(--surface-card)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-accent)", boxShadow: "0 2px 10px rgba(var(--color-navy-mid-rgb),0.06)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-navy-mid)", e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--surface-card)", e.currentTarget.style.color = "var(--text-accent)")}
          >
            <ArrowLeft size={17} /> Voltar
          </button>

          <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
            {/* Favorito */}
            <button
              onClick={handleToggleFav}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all duration-200"
              style={fav
                ? { background: "rgba(239,68,68,0.09)", border: "1.5px solid rgba(239,68,68,0.28)", color: "#dc2626" }
                : { background: "var(--surface-card)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-muted)", boxShadow: "0 2px 10px rgba(var(--color-navy-mid-rgb),0.06)" }
              }
              title={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            >
              <Heart size={16} fill={fav ? "#dc2626" : "none"} />
              <span className="hidden sm:inline xl:hidden 2xl:inline">{fav ? "Guardado" : "Guardar"}</span>
            </button>

            {!semRede && (
              <GuardarEmColecao
                materialId={material.id}
                onToast={(m, t = "success") => setToast({ message: m, type: t })}
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all duration-200"
                estiloBotao={{ background: "var(--surface-card)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-muted)", boxShadow: "0 2px 10px rgba(var(--color-navy-mid-rgb),0.06)" }}
              />
            )}

            {isPDF && (
              <button
                onClick={handleOffline}
                disabled={aGuardarOffline}
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all duration-200 disabled:opacity-60"
                style={offline
                  ? { background: "var(--status-success-bg)", border: "1.5px solid var(--status-success-border)", color: "var(--status-success-text)" }
                  : { background: "var(--surface-card)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-muted)", boxShadow: "0 2px 10px rgba(var(--color-navy-mid-rgb),0.06)" }}
                title={offline ? "Remover a cópia offline" : "Guardar para ler sem internet"}
              >
                {offline ? <CloudOff size={16} /> : <CloudDownload size={16} />}
                <span className="hidden sm:inline xl:hidden 2xl:inline">{aGuardarOffline ? "A guardar…" : offline ? "Offline ✓" : "Offline"}</span>
              </button>
            )}

            {/* Copiar link */}
            <button
              onClick={handleCopiarLink}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all duration-200"
              style={{ background: "var(--surface-card)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-muted)", boxShadow: "0 2px 10px rgba(var(--color-navy-mid-rgb),0.06)" }}
            >
              <Share2 size={16} />
              <span className="hidden sm:inline xl:hidden 2xl:inline">{copiado ? "Copiado!" : "Partilhar"}</span>
            </button>

            {/* Download (apenas PDF) */}
            {isPDF && (
              <a
                href={urlLocal || material.url_arquivo}
                download
                target="_blank"
                rel="noreferrer"
                onClick={registarDownload}
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black transition-all duration-200"
                style={{ background: "linear-gradient(135deg,var(--color-gold-dark),var(--color-gold))", color: "var(--color-navy-deep)", boxShadow: "0 4px 16px rgba(var(--color-gold-rgb),0.40)" }}
                onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)", e.currentTarget.style.boxShadow = "0 6px 22px rgba(var(--color-gold-rgb),0.60)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 4px 16px rgba(var(--color-gold-rgb),0.40)")}
              >
                <DownloadCloud size={16} /><span className="sm:hidden xl:inline 2xl:hidden">PDF</span><span className="hidden sm:inline xl:hidden 2xl:inline">Download PDF</span>
              </a>
            )}

            {/* Remover (só o autor ou um admin) */}
            {podeRemover && (
              <button
                onClick={() => setConfirmRemover(true)}
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all duration-200"
                style={{ background: "rgba(239,68,68,0.09)", border: "1.5px solid rgba(239,68,68,0.28)", color: "#dc2626" }}
                title="Remover material"
              >
                <Trash2 size={16} /><span className="hidden sm:inline xl:hidden 2xl:inline">Remover</span>
              </button>
            )}
          </div>
        </div>

        {semRede && (
          <div className="flex items-center gap-3 rounded-2xl px-5 py-3" style={{ background: "var(--status-warning-bg)", border: "1px solid var(--status-warning-border)", color: "var(--status-warning-text)" }}>
            <WifiOff size={18} />
            <p style={{ fontSize: 13.5, fontWeight: 600 }}>Sem ligação — a mostrar a cópia guardada neste dispositivo. Avaliações, comentários e resumo ficam disponíveis quando a ligação voltar.</p>
          </div>
        )}

        {/* Player de media */}
        <div
          className="overflow-hidden"
          style={{ borderRadius: 28, border: "1px solid rgba(var(--color-navy-mid-rgb),0.08)", background: "var(--color-navy-abyss)", boxShadow: "0 20px 70px rgba(var(--color-navy-abyss-rgb),0.45)" }}
        >
          {isVideo ? (
            <video controls className="w-full" style={{ minHeight: "50vh", background: "#000" }} autoPlay>
              <source src={material.url_arquivo} type={getVideoMimeType(material.url_arquivo)} />
              O seu navegador não suporta a visualização deste vídeo.
            </video>
          ) : isPDF ? (
            <iframe
              src={urlLocal || material.url_arquivo}
              className="w-full"
              style={{ minHeight: "72vh", background: "#fff" }}
              title={`PDF — ${material.titulo}`}
            />
          ) : (
            <div
              className="flex flex-col items-center justify-center p-14 text-center text-white"
              style={{ minHeight: "40vh", background: "linear-gradient(145deg,var(--color-navy-abyss),var(--color-navy-deep),var(--color-navy))" }}
            >
              <div className="w-24 h-24 rounded-[28px] grid place-items-center mb-7" style={{ background: "rgba(var(--color-gold-rgb),0.12)", border: "1px solid rgba(var(--color-gold-rgb),0.25)" }}>
                <DownloadCloud size={40} style={{ color: "var(--color-gold)" }} />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 900, marginBottom: 10 }}>Visualização indisponível</h3>
              <p style={{ color: "rgba(var(--color-blue-sky-rgb),0.60)", fontSize: 14, marginBottom: 28, maxWidth: 360, lineHeight: 1.65 }}>
                Este material não pode ser exibido diretamente.
              </p>
              <a
                href={material.url_arquivo}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full font-black text-sm transition-all"
                style={{ background: "linear-gradient(135deg,var(--color-gold-dark),var(--color-gold),var(--color-gold-light))", color: "var(--color-navy-deep)", padding: "12px 28px", boxShadow: "0 8px 28px rgba(var(--color-gold-rgb),0.50)" }}
              >
                Baixar Documento <ExternalLink size={16} />
              </a>
            </div>
          )}
        </div>

        {/* Info do material */}
        <div className="rounded-[28px] p-7" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 28px rgba(var(--color-navy-mid-rgb),0.07)" }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "var(--text-heading)", marginBottom: 16, lineHeight: 1.3 }}>{material.titulo}</h1>
          <div className="flex flex-wrap gap-3">
            {[
              { label: `📚 ${material.cadeira}`, bg: "var(--surface-hover)",              border: "var(--border-subtle-strong)", color: "var(--text-body)" },
              { label: `👤 ${material.autor}`,   bg: "rgba(var(--color-navy-mid-rgb),0.06)", border: "rgba(var(--color-navy-mid-rgb),0.12)", color: "var(--text-accent)" },
              { label: `📅 ${new Date(material.data_upload).toLocaleDateString("pt-PT")}`, bg: "var(--surface-hover)", border: "var(--border-subtle-strong)", color: "var(--text-muted)" },
              { label: material.tipo === 'Vídeo' ? '🎬 Vídeo' : material.formato_original ? `📄 PDF (de ${material.formato_original.toUpperCase()})` : '📄 PDF',    bg: material.tipo === 'Vídeo' ? "#eff6ff" : "#fff1f2", border: material.tipo === 'Vídeo' ? "#bfdbfe" : "#fecdd3", color: material.tipo === 'Vídeo' ? "var(--color-navy-mid)" : "#be123c" },
              ...(material.versao > 1 ? [{ label: `v${material.versao}`, bg: "var(--surface-hover)", border: "var(--border-subtle-strong)", color: "var(--text-accent)" }] : []),
            ].map(({ label, bg, border, color }) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" style={{ background: bg, border: `1px solid ${border}`, color }}>
                {label}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <TagsMaterial materialId={material.id} ehAdmin={usuarioLogado?.papel === 'admin'} onErro={msg => setToast({ message: msg, type: 'error' })} />
            {!semRede && (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12.5, color: "var(--text-faint)" }} title="Aberturas · downloads">
                  <Eye size={14} /> {material.visualizacoes ?? 0} · <DownloadCloud size={14} /> {material.downloads ?? 0}
                </span>
                <BotaoReportar tipo="material" recursoId={material.id} onToast={(m, t = "success") => setToast({ message: m, type: t })} />
              </div>
            )}
          </div>
        </div>

        {/* Avaliações, comentários, quiz e versões num só painel com separadores — só com ligação */}
        {!semRede && (() => {
          const mostrarToast = (m, t = "success") => setToast({ message: m, type: t });
          const separadores = [
            { key: 'avaliacoes', label: 'Avaliações', icon: Star },
            { key: 'comentarios', label: 'Comentários', icon: MessageCircle },
            ...(config.ia_activada && isPDF ? [{ key: 'quiz', label: 'Quiz', icon: BrainCircuit }] : []),
            ...(podeRemover || material.versao > 1 ? [{ key: 'versoes', label: material.versao > 1 ? `Versões (v${material.versao})` : 'Versões', icon: History }] : []),
          ];
          const activo = separadores.some(s => s.key === separador) ? separador : 'avaliacoes';
          return (
            <section className="rounded-[28px] overflow-hidden" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 28px rgba(var(--color-navy-mid-rgb),0.07)" }}>
              <div role="tablist" aria-label="Secções do material" className="flex gap-1 p-2 overflow-x-auto" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                {separadores.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={activo === key}
                    onClick={() => setSeparador(key)}
                    className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-all duration-200"
                    style={activo === key
                      ? { background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", color: "#fff", boxShadow: "0 4px 14px rgba(var(--color-navy-deep-rgb),0.28)" }
                      : { color: "var(--text-muted)" }}
                    onMouseEnter={e => activo !== key && (e.currentTarget.style.background = "var(--surface-hover)")}
                    onMouseLeave={e => activo !== key && (e.currentTarget.style.background = "")}
                  >
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>
              <div role="tabpanel" className="p-5 sm:p-7">
                {activo === 'avaliacoes' && <Avaliacoes embutido materialId={material.id} usuarioId={usuarioLogado?.id} />}
                {activo === 'comentarios' && <Comentarios embutido materialId={material.id} usuarioId={usuarioLogado?.id} ehAdmin={usuarioLogado?.papel === 'admin'} />}
                {activo === 'quiz' && <Quiz embutido materialId={material.id} tipo={material.tipo} onToast={mostrarToast} />}
                {activo === 'versoes' && (
                  <VersoesMaterial
                    embutido
                    material={material}
                    podeEditar={podeRemover}
                    aceitaFicheiros={material.tipo === 'PDF' ? (config.tipos_ficheiro_permitidos?.includes('docx') || config.tipos_ficheiro_permitidos?.includes('pptx') ? '.pdf,.docx,.pptx,.doc,.ppt' : '.pdf') : 'video/*'}
                    onToast={mostrarToast}
                    onAtualizado={(d) => setMaterial(m => ({ ...m, versao: d.versao, url_arquivo: d.url_arquivo }))}
                  />
                )}
              </div>
            </section>
          );
        })()}
      </div>

      {/* ─── Coluna direita: resumo IA ─── */}
      <div className="w-full xl:w-96 shrink-0">
        <div
          className="sticky top-24 overflow-hidden text-white"
          style={{
            borderRadius: 28,
            background: "linear-gradient(-45deg,var(--color-navy-abyss),var(--color-navy-deep),var(--color-navy),var(--color-navy-mid))",
            backgroundSize: "400% 400%",
            animation: "aurora-vis 10s ease infinite",
            boxShadow: "0 18px 60px rgba(var(--color-navy-abyss-rgb),0.45)",
          }}
        >
          <style>{`@keyframes aurora-vis { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }`}</style>
          <div style={{ height: 3, background: "linear-gradient(90deg, transparent, var(--color-gold-dark), var(--color-gold), var(--color-gold-light), transparent)", opacity: 0.85 }} />
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 20% 20%, rgba(var(--color-gold-rgb),0.10) 0%, transparent 55%)" }} />

          <div className="relative p-7">
            <div className="flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl grid place-items-center" style={{ background: "linear-gradient(135deg,var(--color-gold-dark),var(--color-gold))", color: "var(--color-navy-deep)", boxShadow: "0 6px 20px rgba(var(--color-gold-rgb),0.50)" }}>
                  <Sparkles size={22} />
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.38em", color: "rgba(var(--color-blue-sky-rgb),0.55)", textTransform: "uppercase", marginBottom: 3 }}>IA Gemini</p>
                  <h3 style={{ fontSize: 18, fontWeight: 900, color: "#fff", lineHeight: 1 }}>Resumo IA</h3>
                </div>
              </div>
              <button
                onClick={() => fetchSummary(true)}
                disabled={summaryLoading}
                className="w-10 h-10 rounded-xl grid place-items-center transition-all duration-200 disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.55)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.18)", e.currentTarget.style.color = "#fff")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.09)", e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
                title="Regenerar resumo"
                aria-label="Regenerar resumo"
              >
                <RotateCcw size={15} className={summaryLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div
              className="space-y-1 overflow-y-auto pr-1"
              style={{ maxHeight: "65vh", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.12) transparent" }}
            >
              {summaryLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-9 h-9 rounded-full border-[3px] animate-spin" style={{ borderColor: "rgba(255,255,255,0.12)", borderTopColor: "var(--color-gold)" }} />
                  <p style={{ fontSize: 13, color: "rgba(var(--color-blue-sky-rgb),0.50)" }}>A analisar o documento...</p>
                  <p style={{ fontSize: 11, color: "rgba(var(--color-blue-sky-rgb),0.30)" }}>Pode demorar alguns segundos</p>
                </div>
              ) : summaryError ? (
                <div className="flex flex-col items-center gap-3 text-center py-8 rounded-[18px]"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p style={{ fontSize: 14, color: "#fca5a5", lineHeight: 1.65 }}>{summaryError}</p>
                  <button onClick={() => fetchSummary()}
                    className="rounded-xl px-4 py-2 text-xs font-bold transition-all"
                    style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.70)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.10)"}
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : summary ? (
                <SummaryRenderer text={summary} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <div className="w-9 h-9 rounded-full border-[3px] animate-spin" style={{ borderColor: "rgba(255,255,255,0.12)", borderTopColor: "var(--color-gold)" }} />
                  <p style={{ fontSize: 13, color: "rgba(var(--color-blue-sky-rgb),0.35)" }}>A preparar resumo...</p>
                </div>
              )}
            </div>

            {/* Chat de acompanhamento — perguntas dirigidas à IA sobre este material específico */}
            {summary && !summaryLoading && !summaryError && (
              <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.10)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <MessageCircle size={14} style={{ color: "var(--color-gold)" }} />
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.30em", color: "rgba(var(--color-blue-sky-rgb),0.55)", textTransform: "uppercase" }}>
                    Perguntar à IA sobre este material
                  </p>
                </div>

                {chatMessages.length > 0 && (
                  <div
                    className="space-y-2.5 overflow-y-auto pr-1 mb-3"
                    style={{ maxHeight: 260, scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.12) transparent" }}
                  >
                    {chatMessages.map((msg, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: msg.autor === 'utilizador' ? "flex-end" : "flex-start" }}>
                        <div
                          className="max-w-[88%] px-3.5 py-2.5 rounded-2xl"
                          style={msg.autor === 'utilizador'
                            ? { background: "rgba(255,255,255,0.14)", color: "#fff", fontSize: 13, lineHeight: 1.6, borderBottomRightRadius: 5 }
                            : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(226,232,240,0.90)", fontSize: 13, lineHeight: 1.65, borderBottomLeftRadius: 5, whiteSpace: "pre-wrap" }
                          }
                        >
                          {msg.texto}
                        </div>
                      </div>
                    ))}
                    {chatEnviando && (
                      <div className="flex items-center gap-2" style={{ padding: "2px 2px" }}>
                        <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(255,255,255,0.15)", borderTopColor: "var(--color-gold)" }} />
                        <span style={{ fontSize: 12, color: "rgba(var(--color-blue-sky-rgb),0.45)" }}>A pensar...</span>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}

                <form onSubmit={handleEnviarChat} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    maxLength={4000}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Ex: explica melhor o segundo conceito..."
                    disabled={chatEnviando}
                    className="flex-1 px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
                    style={{ background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(255,255,255,0.12)", color: "#fff" }}
                    onFocus={e => (e.target.style.borderColor = "var(--color-gold)", e.target.style.background = "rgba(255,255,255,0.12)")}
                    onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.12)", e.target.style.background = "rgba(255,255,255,0.08)")}
                  />
                  <button
                    type="submit"
                    disabled={chatEnviando || !chatInput.trim()}
                    className="w-10 h-10 rounded-xl grid place-items-center transition-all duration-200 disabled:opacity-40 shrink-0"
                    style={{ background: "linear-gradient(135deg,var(--color-gold-dark),var(--color-gold))", color: "var(--color-navy-deep)", boxShadow: "0 4px 16px rgba(var(--color-gold-rgb),0.35)" }}
                    aria-label="Enviar pergunta"
                  >
                    <Send size={15} />
                  </button>
                </form>
              </div>
            )}

            <p style={{ fontSize: 11, color: "rgba(var(--color-blue-sky-rgb),0.28)", marginTop: 14, textAlign: "center", lineHeight: 1.5 }}>
              Gerado por IA Gemini · {config.nome_plataforma}
            </p>
          </div>
        </div>
      </div>
    </div>

    {/* Modal de confirmação de remoção — só o autor ou um admin chegam aqui */}
    {confirmRemover && (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{ background: "rgba(var(--color-navy-abyss-rgb),0.55)", backdropFilter: "blur(8px)" }}
        onClick={() => setConfirmRemover(false)}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-remover-material-titulo"
          ref={confirmRemoverRef}
          tabIndex={-1}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-sm rounded-[28px] p-8 animate-scale-in"
          style={{ background: "var(--surface-card)", boxShadow: "0 30px 90px rgba(var(--color-navy-deep-rgb),0.30)", outline: "none" }}>
          <div className="w-14 h-14 rounded-[18px] grid place-items-center mx-auto mb-5"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)" }}>
            <Trash2 size={26} style={{ color: "#ef4444" }} />
          </div>
          <h3 id="confirm-remover-material-titulo" style={{ fontSize: 17, fontWeight: 900, color: "var(--text-heading)", textAlign: "center", marginBottom: 8 }}>
            Remover &quot;{material.titulo}&quot;?
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6, marginBottom: 24 }}>
            Esta acção é permanente — o material deixa de estar disponível no repositório.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setConfirmRemover(false)} disabled={removendo}
              className="rounded-2xl px-4 py-3 text-sm font-bold transition-all disabled:opacity-60"
              style={{ background: "var(--surface-hover)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-body)" }}>
              Cancelar
            </button>
            <button onClick={confirmarRemocao} disabled={removendo}
              className="rounded-2xl px-4 py-3 text-sm font-bold text-white transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", boxShadow: "0 6px 20px rgba(239,68,68,0.35)" }}>
              {removendo ? "A remover..." : "Remover"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default Visualizador;
