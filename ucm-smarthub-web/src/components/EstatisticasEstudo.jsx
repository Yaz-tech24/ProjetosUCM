import React, { useState, useEffect } from "react";
import { BarChart3, Flame, Timer, BookOpenCheck, Layers, Target } from "lucide-react";
import api from "../services/api";
import { Cartao, Spinner } from "./ui";

/* Estatísticas de estudo do próprio utilizador: 8 semanas de actividade,
   totais e sequência de dias seguidos. Gráfico em CSS puro (sem biblioteca). */
const rotuloSemana = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });

const EstatisticasEstudo = () => {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let activo = true;
    api.get("/perfil/estatisticas").then(r => { if (activo) setDados(r.data); }).catch(() => { if (activo) setErro(true); });
    return () => { activo = false; };
  }, []);

  const semanas = dados?.semanas || [];
  const maximo = Math.max(1, ...semanas.map(s => s.leituras + s.quizzes + s.revisoes));
  const t = dados?.totais || {};
  const horas = Math.round((t.minutos_estimados || 0) / 60);

  return (
    <Cartao icon={BarChart3} titulo="O meu estudo" subtitulo="Actividade nas últimas 8 semanas — só você vê isto">
      {erro ? <p style={{ fontSize: 13, color: "var(--text-faint)" }}>Sem dados por agora.</p> : !dados ? <Spinner /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Flame, label: "Sequência", valor: `${dados.sequencia.actual} dia${dados.sequencia.actual === 1 ? "" : "s"}`, sub: `melhor: ${dados.sequencia.melhor}`, cor: "#f97316" },
              { icon: Timer, label: "Tempo estimado", valor: horas >= 1 ? `${horas} h` : `${t.minutos_estimados || 0} min`, sub: `${dados.dias_activos} dias activos`, cor: "var(--text-accent)" },
              { icon: BookOpenCheck, label: "Materiais lidos", valor: t.materiais_lidos || 0, sub: `${t.leituras_concluidas || 0} concluídos`, cor: "var(--status-success-text)" },
              { icon: Target, label: "Quizzes passados", valor: `${t.quizzes_passados || 0}/${t.quizzes_feitos || 0}`, sub: `${t.flashcards_revistos || 0} flashcards revistos`, cor: "var(--color-gold-dark)" },
            ].map(({ icon: Icon, label, valor, sub, cor }) => (
              <div key={label} className="rounded-2xl p-4" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)" }}>
                <Icon size={16} style={{ color: cor }} />
                <p style={{ fontSize: 22, fontWeight: 900, color: "var(--text-heading)", marginTop: 8, lineHeight: 1 }}>{valor}</p>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
                <p style={{ fontSize: 11, color: "var(--text-faint)" }}>{sub}</p>
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center gap-4 mb-3" style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 600 }}>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--color-navy-mid)" }} /> Leituras</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--color-gold)" }} /> Quizzes</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#34d399" }} /> Flashcards</span>
            </div>
            <div className="grid grid-cols-8 gap-2 items-end" style={{ height: 140 }} role="img" aria-label="Actividade semanal">
              {semanas.map(s => {
                const total = s.leituras + s.quizzes + s.revisoes;
                const altura = (v) => `${(v / maximo) * 100}%`;
                return (
                  <div key={s.inicio} className="flex flex-col justify-end h-full" title={`Semana de ${rotuloSemana(s.inicio)}: ${s.leituras} leitura(s), ${s.quizzes} quiz(zes), ${s.revisoes} revisão(ões)`}>
                    <div className="flex flex-col justify-end rounded-t-lg overflow-hidden" style={{ height: total ? altura(total) : 3, minHeight: 3, background: total ? "transparent" : "var(--border-subtle-strong)" }}>
                      <div style={{ flex: s.revisoes, background: "#34d399" }} />
                      <div style={{ flex: s.quizzes, background: "var(--color-gold)" }} />
                      <div style={{ flex: s.leituras, background: "var(--color-navy-mid)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-8 gap-2 mt-1.5">
              {semanas.map(s => <p key={s.inicio} className="text-center truncate" style={{ fontSize: 9.5, color: "var(--text-faint)" }}>{rotuloSemana(s.inicio)}</p>)}
            </div>
          </div>
          {(t.flashcards_dominados || 0) > 0 && (
            <p className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--text-faint)" }}><Layers size={12} /> {t.flashcards_dominados} flashcard(s) dominado(s) (intervalo ≥ 3 semanas).</p>
          )}
        </div>
      )}
    </Cartao>
  );
};

export default EstatisticasEstudo;
