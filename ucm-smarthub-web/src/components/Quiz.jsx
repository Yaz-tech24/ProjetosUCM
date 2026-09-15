import React, { useState } from "react";
import { BrainCircuit, CheckCircle2, XCircle, RotateCcw, Sparkles, Trophy } from "lucide-react";
import api from "../services/api";
import { Cartao, BotaoPrimario, BotaoSecundario, Spinner } from "./ui";

// Quiz de escolha múltipla gerado por IA a partir do PDF. Só é pedido ao
// servidor quando o utilizador quer — gerar custa uma chamada ao Gemini.
const Quiz = ({ materialId, tipo, onToast }) => {
  const [estado, setEstado] = useState("inicio"); // inicio | a-carregar | a-responder | corrigido | erro
  const [quiz, setQuiz] = useState(null);
  const [respostas, setRespostas] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [aSubmeter, setASubmeter] = useState(false);

  const carregar = async () => {
    setEstado("a-carregar");
    try {
      const { data } = await api.get(`/materiais/${materialId}/quiz`, { timeout: 90000 });
      setQuiz(data);
      setRespostas(Array(data.perguntas.length).fill(null));
      setResultado(null);
      setEstado("a-responder");
    } catch (err) {
      setErro(err.response?.data?.erro || "Não foi possível preparar o quiz agora.");
      setEstado("erro");
    }
  };

  const submeter = async () => {
    if (respostas.some(r => r === null)) return onToast?.("Responda a todas as perguntas antes de corrigir.", "warn");
    setASubmeter(true);
    try {
      const { data } = await api.post(`/materiais/${materialId}/quiz/respostas`, { respostas });
      setResultado(data);
      setEstado("corrigido");
      onToast?.(data.passou ? `${data.percentagem}% — passou! +2 pontos de reputação.` : `${data.percentagem}% — reveja as explicações e tente de novo.`, data.passou ? "success" : "warn");
    } catch (err) {
      onToast?.(err.response?.data?.erro || "Erro ao corrigir.", "error");
    } finally {
      setASubmeter(false);
    }
  };

  if (tipo !== "PDF") return null;

  return (
    <Cartao
      icon={BrainCircuit}
      titulo="Testar conhecimentos"
      subtitulo="10 perguntas de escolha múltipla geradas por IA a partir deste documento"
      accao={quiz?.melhor && (
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black" style={{ background: "rgba(var(--color-gold-rgb),0.18)", color: "var(--color-gold-dark)" }}>
          <Trophy size={13} /> Melhor: {quiz.melhor.pontuacao}/{quiz.melhor.total}
        </span>
      )}
    >
      {estado === "inicio" && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p style={{ fontSize: 13.5, color: "var(--text-body)", maxWidth: 460 }}>
            Passar (70% ou mais) conta 2 pontos para a sua reputação. Pode repetir as vezes que quiser.
          </p>
          <BotaoPrimario type="button" onClick={carregar}><Sparkles size={15} /> Começar o quiz</BotaoPrimario>
        </div>
      )}

      {estado === "a-carregar" && <Spinner label="A preparar as perguntas — na primeira vez pode demorar meio minuto…" />}

      {estado === "erro" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p style={{ fontSize: 13.5, color: "var(--status-danger-text)" }}>{erro}</p>
          <BotaoSecundario type="button" onClick={carregar}><RotateCcw size={15} /> Tentar de novo</BotaoSecundario>
        </div>
      )}

      {(estado === "a-responder" || estado === "corrigido") && quiz && (
        <div className="space-y-5">
          {estado === "corrigido" && resultado && (
            <div className="rounded-2xl p-5 text-white" style={{ background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))" }}>
              <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.7, fontWeight: 700 }}>Resultado</p>
              <p style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.1 }}>{resultado.pontuacao}<span style={{ fontSize: 18, opacity: 0.7 }}>/{resultado.total}</span> <span style={{ fontSize: 16, color: "var(--color-gold)" }}>· {resultado.percentagem}%</span></p>
              <p style={{ fontSize: 13.5, opacity: 0.85 }}>{resultado.passou ? "Passou. Bom trabalho!" : "Ainda não chegou aos 70%. Reveja as explicações abaixo e volte a tentar."}</p>
            </div>
          )}

          <ol className="space-y-4">
            {quiz.perguntas.map((p, i) => {
              const detalhe = resultado?.detalhe?.[i];
              return (
                <li key={p.n} className="rounded-2xl p-4" style={{ border: "1px solid var(--border-subtle)" }}>
                  <p className="mb-3" style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text-heading)" }}>
                    <span style={{ color: "var(--text-faint)", marginRight: 8 }}>{p.n}.</span>{p.pergunta}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {p.opcoes.map((o, j) => {
                      const escolhida = respostas[i] === j;
                      const certa = detalhe && detalhe.correcta === j;
                      const errada = detalhe && escolhida && !detalhe.certa;
                      return (
                        <button
                          key={j}
                          type="button"
                          disabled={estado === "corrigido"}
                          onClick={() => setRespostas(r => r.map((v, k) => (k === i ? j : v)))}
                          className="flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm transition-all disabled:cursor-default"
                          style={{
                            border: `1.5px solid ${certa ? "var(--status-success-border)" : errada ? "var(--status-danger-border)" : escolhida ? "var(--color-navy-mid)" : "var(--border-subtle-strong)"}`,
                            background: certa ? "var(--status-success-bg)" : errada ? "var(--status-danger-bg)" : escolhida ? "rgba(var(--color-navy-mid-rgb),0.08)" : "var(--surface-input)",
                            color: "var(--text-heading)", fontWeight: escolhida || certa ? 700 : 500,
                          }}
                        >
                          <span className="w-5 h-5 rounded-full grid place-items-center shrink-0 text-[11px] font-black"
                            style={{ background: escolhida || certa ? "var(--color-navy-mid)" : "var(--surface-hover)", color: escolhida || certa ? "#fff" : "var(--text-faint)" }}>
                            {certa ? <CheckCircle2 size={13} /> : errada ? <XCircle size={13} /> : String.fromCharCode(65 + j)}
                          </span>
                          <span>{o}</span>
                        </button>
                      );
                    })}
                  </div>
                  {detalhe?.explicacao && (
                    <p className="mt-3 rounded-xl px-3.5 py-2.5" style={{ fontSize: 13, background: "var(--surface-hover)", color: "var(--text-body)", lineHeight: 1.55 }}>
                      <strong style={{ color: "var(--text-heading)" }}>Porquê:</strong> {detalhe.explicacao}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="flex justify-end gap-2">
            {estado === "corrigido"
              ? <BotaoSecundario type="button" onClick={() => { setRespostas(Array(quiz.perguntas.length).fill(null)); setResultado(null); setEstado("a-responder"); }}><RotateCcw size={15} /> Repetir</BotaoSecundario>
              : <BotaoPrimario type="button" onClick={submeter} loading={aSubmeter} disabled={respostas.some(r => r === null)}><CheckCircle2 size={15} /> Corrigir ({respostas.filter(r => r !== null).length}/{quiz.perguntas.length})</BotaoPrimario>}
          </div>
        </div>
      )}
    </Cartao>
  );
};

export default Quiz;
