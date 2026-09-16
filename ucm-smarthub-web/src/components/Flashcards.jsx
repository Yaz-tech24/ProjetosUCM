import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Layers, RotateCcw, Check, X, Brain, ChevronRight, Sparkles } from "lucide-react";
import api from "../services/api";
import { CartaoOuSeccao, Spinner, Vazio, BotaoPrimario, BotaoSecundario } from "./ui";

/* Flashcards gerados por IA a partir do PDF, revistos com repetição espaçada
   (SM-2 simplificado no servidor). O aluno vê a frente, vira o cartão e
   classifica: errei / difícil / fácil — o servidor agenda a próxima revisão. */
const RESULTADOS = [
  { key: "errei",   label: "Errei",   hint: "revê amanhã",  icon: X,     estilo: { background: "var(--status-danger-bg)",  border: "1px solid var(--status-danger-border)",  color: "var(--status-danger-text)" } },
  { key: "dificil", label: "Difícil", hint: "cresce pouco", icon: Brain, estilo: { background: "var(--status-warning-bg)", border: "1px solid var(--status-warning-border)", color: "var(--status-warning-text)" } },
  { key: "facil",   label: "Fácil",   hint: "espaça mais",  icon: Check, estilo: { background: "var(--status-success-bg)", border: "1px solid var(--status-success-border)", color: "var(--status-success-text)" } },
];

const Flashcards = ({ materialId, embutido, podeRegenerar, onToast }) => {
  const [dados, setDados] = useState(null);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState(null);
  const [fila, setFila] = useState([]);          // ids por rever nesta sessão
  const [indice, setIndice] = useState(0);
  const [virado, setVirado] = useState(false);
  const [aResponder, setAResponder] = useState(false);
  const [modo, setModo] = useState("pendentes");  // pendentes | todos
  const [feitos, setFeitos] = useState(0);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro(null);
    try {
      const { data } = await api.get(`/materiais/${materialId}/flashcards`, { timeout: 90000 });
      setDados(data);
    } catch (err) {
      setErro(err.response?.data?.erro || "Não foi possível preparar os flashcards.");
    } finally {
      setACarregar(false);
    }
  }, [materialId]);

  useEffect(() => { carregar(); }, [carregar]);

  const porId = useMemo(() => new Map((dados?.cartoes || []).map(c => [c.id, c])), [dados]);

  const iniciar = (qual) => {
    const lista = (dados?.cartoes || []).filter(c => qual === "todos" || c.pendente).map(c => c.id);
    setModo(qual);
    setFila(lista);
    setIndice(0);
    setVirado(false);
    setFeitos(0);
  };

  const actual = fila.length > 0 && indice < fila.length ? porId.get(fila[indice]) : null;

  const responder = async (resultado) => {
    if (!actual || aResponder) return;
    setAResponder(true);
    try {
      const { data } = await api.post(`/flashcards/${actual.id}/revisao`, { resultado });
      setDados(prev => ({
        ...prev,
        cartoes: prev.cartoes.map(c => (c.id === actual.id ? { ...c, pendente: false, novo: false, intervalo_dias: data.intervalo_dias, proxima_revisao: data.proxima_revisao, repeticoes: data.repeticoes } : c)),
      }));
      setFeitos(f => f + 1);
      // Um cartão errado volta ao fim da fila desta sessão — sai quando acertar.
      if (resultado === "errei") setFila(f => [...f, actual.id]);
      setIndice(i => i + 1);
      setVirado(false);
    } catch (err) {
      onToast?.(err.response?.data?.erro || "Não foi possível registar a revisão.", "error");
    } finally {
      setAResponder(false);
    }
  };

  const regenerar = async () => {
    try {
      await api.delete(`/materiais/${materialId}/flashcards`);
      setFila([]);
      await carregar();
      onToast?.("Flashcards gerados de novo.");
    } catch (err) {
      onToast?.(err.response?.data?.erro || "Não foi possível regenerar.", "error");
    }
  };

  const resumo = dados?.resumo;
  const terminou = fila.length > 0 && indice >= fila.length;
  const pendentesAgora = (dados?.cartoes || []).filter(c => c.pendente).length;

  return (
    <CartaoOuSeccao
      embutido={embutido}
      icon={Layers}
      titulo="Flashcards"
      subtitulo={resumo ? `${resumo.total} cartões · ${pendentesAgora} por rever hoje · ${resumo.dominados} dominados` : "Memorização por repetição espaçada"}
      accao={podeRegenerar && dados && !aCarregar ? (
        <button onClick={regenerar} className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--text-faint)" }} title="Gerar cartões novos a partir do PDF">
          <RotateCcw size={13} /> Regenerar
        </button>
      ) : null}
    >
      {aCarregar ? (
        <div className="py-6 text-center">
          <Spinner label="A preparar os cartões…" />
          <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Na primeira vez a IA lê o documento — pode demorar alguns segundos.</p>
        </div>
      ) : erro ? (
        <div className="text-center py-8 space-y-3">
          <p style={{ fontSize: 13.5, color: "var(--status-danger-text)" }}>{erro}</p>
          <BotaoSecundario type="button" onClick={carregar}>Tentar novamente</BotaoSecundario>
        </div>
      ) : !dados?.cartoes?.length ? (
        <Vazio icon={Layers}>Sem cartões para este material.</Vazio>
      ) : fila.length === 0 ? (
        /* Ecrã inicial: escolher o que rever */
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Por rever", valor: pendentesAgora, cor: "var(--color-gold)" },
            { label: "Novos", valor: dados.cartoes.filter(c => c.novo).length, cor: "var(--text-accent)" },
            { label: "Dominados", valor: resumo.dominados, cor: "var(--status-success-text)" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-4 text-center" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)" }}>
              <p style={{ fontSize: 26, fontWeight: 900, color: s.cor, lineHeight: 1 }}>{s.valor}</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 6 }}>{s.label}</p>
            </div>
          ))}
          <div className="sm:col-span-3 flex flex-wrap gap-2 justify-center pt-2">
            <BotaoPrimario type="button" onClick={() => iniciar("pendentes")} disabled={pendentesAgora === 0}>
              <Sparkles size={15} /> Rever pendentes ({pendentesAgora})
            </BotaoPrimario>
            <BotaoSecundario type="button" onClick={() => iniciar("todos")}>Rever todos ({dados.cartoes.length})</BotaoSecundario>
          </div>
          {pendentesAgora === 0 && (
            <p className="sm:col-span-3 text-center" style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
              Tudo revisto por hoje. Os próximos cartões aparecem {proximaData(dados.cartoes)}.
            </p>
          )}
        </div>
      ) : terminou ? (
        <div className="text-center py-8 space-y-4">
          <div className="w-16 h-16 rounded-[22px] grid place-items-center mx-auto" style={{ background: "var(--status-success-bg)", border: "1px solid var(--status-success-border)" }}>
            <Check size={28} style={{ color: "var(--status-success-text)" }} />
          </div>
          <h4 style={{ fontSize: 18, fontWeight: 900, color: "var(--text-heading)" }}>Sessão concluída</h4>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>{feitos} revisão(ões) registada(s). Volta {pendentesAgora > 0 ? "quando quiseres" : proximaData(dados.cartoes)}.</p>
          <BotaoSecundario type="button" onClick={() => setFila([])}>Voltar</BotaoSecundario>
        </div>
      ) : (
        /* Cartão actual */
        <div className="space-y-4">
          <div className="flex items-center justify-between" style={{ fontSize: 12, color: "var(--text-faint)", fontWeight: 600 }}>
            <span>Cartão {Math.min(indice + 1, fila.length)} de {fila.length} · {modo === "todos" ? "todos" : "pendentes"}</span>
            <button onClick={() => setFila([])} className="font-bold" style={{ color: "var(--text-faint)" }}>Sair</button>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-hover)" }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(indice / fila.length) * 100}%`, background: "linear-gradient(90deg,var(--color-gold-dark),var(--color-gold))" }} />
          </div>

          <button
            type="button"
            onClick={() => setVirado(v => !v)}
            className="w-full text-left rounded-[24px] p-6 sm:p-8 min-h-[190px] flex flex-col justify-between transition-all duration-200"
            style={virado
              ? { background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", color: "#fff", boxShadow: "0 12px 40px rgba(var(--color-navy-deep-rgb),0.35)" }
              : { background: "var(--surface-hover)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }}
            aria-label={virado ? "Ver a pergunta" : "Ver a resposta"}
          >
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase", opacity: 0.6 }}>{virado ? "Resposta" : "Pergunta"}</span>
            <p style={{ fontSize: virado ? 15 : 17, fontWeight: virado ? 500 : 800, lineHeight: 1.55, marginTop: 14, whiteSpace: "pre-wrap" }}>{virado ? actual.verso : actual.frente}</p>
            <span className="inline-flex items-center gap-1 mt-4" style={{ fontSize: 12, opacity: 0.6 }}>
              {virado ? "Toca para voltar à pergunta" : <>Toca para ver a resposta <ChevronRight size={13} /></>}
            </span>
          </button>

          {virado ? (
            <div className="grid grid-cols-3 gap-2">
              {RESULTADOS.map(({ key, label, hint, icon: Icon, estilo }) => (
                <button key={key} type="button" onClick={() => responder(key)} disabled={aResponder}
                  className="rounded-2xl px-3 py-3 text-sm font-bold flex flex-col items-center gap-1 transition-transform duration-150 disabled:opacity-60"
                  style={estilo}
                  onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "")}
                >
                  <span className="inline-flex items-center gap-1.5"><Icon size={15} /> {label}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.75 }}>{hint}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center" style={{ fontSize: 12, color: "var(--text-faint)" }}>Pensa na resposta antes de virar o cartão.</p>
          )}
        </div>
      )}
    </CartaoOuSeccao>
  );
};

function proximaData(cartoes) {
  const datas = cartoes.map(c => c.proxima_revisao).filter(Boolean).sort();
  if (!datas.length) return "em breve";
  const d = new Date(datas[0] + "T12:00:00");
  const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
  const dias = Math.round((d - hoje) / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

export default Flashcards;
