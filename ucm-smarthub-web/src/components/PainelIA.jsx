import React, { useState, useEffect, useCallback } from "react";
import { Sparkles, RefreshCw, Play, ListChecks, AlertTriangle } from "lucide-react";
import api from "../services/api";
import { BotaoPrimario, BotaoSecundario, Spinner } from "./ui";

/* Admin → Sistema → IA: cadeia de modelos, estatísticas por funcionalidade
   (desde o arranque), últimos erros, fila de pré-geração e teste aos modelos. */
const ROTULOS = { resumo: "Resumos", quiz: "Quizzes", flashcards: "Flashcards", traducao: "Traduções", texto: "Chat / perguntas", moderacao_upload: "Moderação de uploads", moderacao_denuncias: "Moderação de denúncias", teste: "Testes", geral: "Outros" };
const rotulo = (k) => ROTULOS[k] || k;
const quando = (iso) => (iso ? new Date(iso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "—");

const PainelIA = ({ onToast }) => {
  const [dados, setDados] = useState(null);
  const [aCarregar, setACarregar] = useState(true);
  const [teste, setTeste] = useState(null);
  const [aTestar, setATestar] = useState(false);
  const [aPregerar, setAPregerar] = useState(false);

  const carregar = useCallback(async () => {
    setACarregar(true);
    try { const { data } = await api.get("/admin/ia"); setDados(data); }
    catch { setDados(null); }
    finally { setACarregar(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const testar = async () => {
    setATestar(true);
    setTeste(null);
    try { const { data } = await api.post("/admin/ia/testar", {}, { timeout: 120000 }); setTeste(data); carregar(); }
    catch (err) { onToast(err.response?.data?.erro || "Não foi possível testar os modelos.", "error"); }
    finally { setATestar(false); }
  };

  const pregerar = async () => {
    setAPregerar(true);
    try {
      const { data } = await api.post("/admin/ia/pregerar", {});
      onToast(data.agendados > 0 ? `${data.agendados} material(is) na fila de pré-geração.` : "Nada por pré-gerar — os materiais mais vistos já têm resumo, quiz e flashcards.");
      carregar();
    } catch (err) { onToast(err.response?.data?.erro || "Não foi possível agendar.", "error"); }
    finally { setAPregerar(false); }
  };

  const recursos = Object.entries(dados?.porRecurso || {}).sort((a, b) => b[1].chamadas - a[1].chamadas);
  const pre = dados?.pre_geracao;

  return (
    <section className="rounded-[28px] overflow-hidden" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 32px rgba(var(--color-navy-mid-rgb),0.07)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-7 py-5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2.5">
          <Sparkles size={19} style={{ color: "var(--text-accent)" }} />
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: "var(--text-heading)" }}>IA (Gemini)</h2>
            <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
              {dados ? (dados.configurada ? <>Modelos por ordem: <strong>{dados.modelos.join(" → ")}</strong> · até {dados.concorrencia_max} chamadas em simultâneo · estatísticas desde {quando(dados.desde)}</> : "GEMINI_API_KEY não definida — funcionalidades de IA desligadas") : "A carregar…"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <BotaoSecundario type="button" onClick={carregar} disabled={aCarregar}><RefreshCw size={14} className={aCarregar ? "animate-spin" : ""} /> Actualizar</BotaoSecundario>
          <BotaoSecundario type="button" onClick={testar} disabled={aTestar || !dados?.configurada}><ListChecks size={14} /> {aTestar ? "A testar…" : "Testar modelos"}</BotaoSecundario>
          <BotaoPrimario type="button" onClick={pregerar} loading={aPregerar} disabled={!dados?.configurada}><Play size={14} /> Pré-gerar backlog</BotaoPrimario>
        </div>
      </div>
      <div className="p-7 space-y-6">
        {aCarregar && !dados ? <Spinner /> : !dados ? <p style={{ fontSize: 13.5, color: "var(--status-danger-text)" }}>Não foi possível obter o estado da IA.</p> : (
          <>
            {teste && (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {teste.modelos.map(m => (
                  <li key={m.modelo} className="rounded-2xl px-4 py-3" style={{ background: m.ok ? "var(--status-success-bg)" : "var(--status-danger-bg)", border: `1px solid ${m.ok ? "var(--status-success-border)" : "var(--status-danger-border)"}` }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: m.ok ? "var(--status-success-text)" : "var(--status-danger-text)" }}>{m.modelo}</p>
                    <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{m.ok ? `respondeu em ${m.ms} ms` : `${m.status ? `HTTP ${m.status}: ` : ""}${m.erro}`}</p>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase" style={{ letterSpacing: "0.12em", color: "var(--text-faint)" }}>Chamadas desde o arranque</p>
              {recursos.length === 0 ? <p style={{ fontSize: 13, color: "var(--text-faint)" }}>Ainda sem chamadas à IA.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ fontSize: 13, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {["Funcionalidade", "Chamadas", "Sucesso", "429 quota", "503 procura", "Repetições", "Tempo médio", "Modelo mais usado"].map(h => <th key={h} className="text-left py-2 pr-4 font-bold">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {recursos.map(([k, r]) => {
                        const modelo = Object.entries(r.modelos || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
                        return (
                          <tr key={k} style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-body)" }}>
                            <td className="py-2 pr-4 font-bold" style={{ color: "var(--text-heading)" }}>{rotulo(k)}</td>
                            <td className="py-2 pr-4">{r.chamadas}</td>
                            <td className="py-2 pr-4" style={{ color: r.taxa_sucesso >= 90 ? "var(--status-success-text)" : r.taxa_sucesso >= 60 ? "var(--status-warning-text)" : "var(--status-danger-text)", fontWeight: 700 }}>{r.taxa_sucesso ?? "—"}%</td>
                            <td className="py-2 pr-4">{r.quota_429}</td>
                            <td className="py-2 pr-4">{r.procura_503}</td>
                            <td className="py-2 pr-4">{r.tentativas_extra}</td>
                            <td className="py-2 pr-4">{r.ms_medio ? `${(r.ms_medio / 1000).toFixed(1)} s` : "—"}</td>
                            <td className="py-2 pr-4" style={{ fontSize: 12 }}>{modelo}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {pre && (
              <div className="rounded-2xl p-4" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)" }}>
                <p className="mb-1 text-[11px] font-bold uppercase" style={{ letterSpacing: "0.12em", color: "var(--text-faint)" }}>Pré-geração em background</p>
                <p style={{ fontSize: 13, color: "var(--text-body)", lineHeight: 1.6 }}>
                  {pre.activa ? <>Activa — ao aprovar um PDF, o resumo, o quiz e os flashcards são gerados de seguida (um material a cada {pre.intervalo_s} s; até {pre.backlog_por_hora} do backlog por hora). <strong>{pre.fila}</strong> na fila{pre.em_curso ? <>, a tratar #{pre.em_curso}</> : ""} · {pre.processados} processado(s), {pre.falhados} falhado(s).</> : "Desligada (IA_PREGERAR=0 ou sem chave)."}
                  {pre.motivo_pausa && <span className="inline-flex items-center gap-1.5 ml-2" style={{ color: "var(--status-warning-text)", fontWeight: 700 }}><AlertTriangle size={13} /> em pausa por {pre.motivo_pausa} até {quando(pre.pausa_ate)}</span>}
                </p>
                {pre.historico?.length > 0 && (
                  <ul className="mt-2 space-y-1" style={{ fontSize: 12, color: "var(--text-faint)" }}>
                    {pre.historico.slice(0, 5).map((h, i) => (
                      <li key={i}>{quando(h.quando)} · material #{h.id} ({h.motivo}) — {h.ok ? (h.feito?.length ? `gerou ${h.feito.join(", ")}` : h.saltado || "nada a fazer") : <span style={{ color: "var(--status-danger-text)" }}>{h.erro}</span>}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {dados.ultimosErros?.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase" style={{ letterSpacing: "0.12em", color: "var(--text-faint)" }}>Últimos erros</p>
                <ul className="space-y-1" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {dados.ultimosErros.slice(0, 8).map((e, i) => <li key={i}><span style={{ color: "var(--text-faint)" }}>{quando(e.quando)}</span> · {rotulo(e.recurso)}{e.status ? ` · HTTP ${e.status}` : ""} — {e.mensagem}</li>)}
                </ul>
              </div>
            )}

            <p style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.6 }}>
              429 = limite de pedidos por minuto/dia do plano gratuito do Gemini; 503 = modelo em alta procura na Google. O servidor repete com espera crescente e passa ao modelo seguinte; se os 429 forem frequentes, activar a facturação no Google AI Studio (pay-as-you-go) é a única solução definitiva.
            </p>
          </>
        )}
      </div>
    </section>
  );
};

export default PainelIA;
