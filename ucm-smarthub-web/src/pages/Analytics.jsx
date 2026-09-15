import React, { useState, useEffect, useCallback } from "react";
import { BarChart3, Users, FileText, MessageCircle, Star, Library, TrendingUp, ScrollText, Activity } from "lucide-react";
import api from "../services/api";
import Toast from "../components/Toast";
import { Cartao, Vazio, Spinner, BotaoSecundario, formatarData } from "../components/ui";

const Numero = ({ icon: Icon, valor, label, destaque }) => (
  <div className="rounded-[24px] p-5" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 24px rgba(var(--color-navy-mid-rgb),0.06)" }}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-[10.5px] font-bold uppercase" style={{ letterSpacing: "0.12em", color: "var(--text-faint)" }}>{label}</span>
      <Icon size={17} style={{ color: "var(--text-accent)" }} />
    </div>
    <p style={{ fontSize: 30, fontWeight: 900, color: "var(--text-heading)", lineHeight: 1 }}>{valor ?? "—"}</p>
    {destaque && <p className="mt-1.5" style={{ fontSize: 12, color: "var(--text-faint)" }}>{destaque}</p>}
  </div>
);

const Tabela = ({ colunas, linhas, chave, vazio }) => (
  linhas.length === 0 ? <Vazio icon={Library}>{vazio}</Vazio> : (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm" style={{ minWidth: 520 }}>
        <thead>
          <tr>
            {colunas.map(c => (
              <th key={c.label} className={`px-3 py-2 text-[10.5px] font-bold uppercase ${c.alinhar === "right" ? "text-right" : "text-left"}`} style={{ letterSpacing: "0.10em", color: "var(--text-faint)", borderBottom: "1px solid var(--border-subtle)" }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={chave(l)} className="transition-colors" style={{ borderBottom: "1px solid var(--border-subtle)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}>
              {colunas.map(c => (
                <td key={c.label} className={`px-3 py-3 ${c.alinhar === "right" ? "text-right" : ""}`} style={{ color: c.forte ? "var(--text-heading)" : "var(--text-body)", fontWeight: c.forte ? 800 : 500 }}>
                  {c.render(l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
);

const num = (v, casas = 0) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(casas));

const Analytics = () => {
  const [aba, setAba] = useState("resumo");
  const [dashboard, setDashboard] = useState(null);
  const [disciplinas, setDisciplinas] = useState([]);
  const [populares, setPopulares] = useState([]);
  const [atividade, setAtividade] = useState([]);
  const [auditoria, setAuditoria] = useState({ linhas: [], page: 1, totalPages: 1 });
  const [aCarregar, setACarregar] = useState(true);
  const [toast, setToast] = useState({ message: "", type: "" });

  const carregarAuditoria = useCallback(async (page = 1) => {
    const { data } = await api.get("/admin/auditoria", { params: { page, limit: 25 } });
    setAuditoria(a => ({ linhas: page === 1 ? data.auditoria : [...a.linhas, ...data.auditoria], page, totalPages: data.pagination.totalPages }));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [d, disc, pop, act] = await Promise.all([
          api.get("/admin/analytics/dashboard"),
          api.get("/admin/analytics/disciplinas"),
          api.get("/admin/analytics/materiais-populares"),
          api.get("/admin/analytics/atividade"),
        ]);
        setDashboard(d.data);
        setDisciplinas(disc.data);
        setPopulares(pop.data);
        setAtividade(act.data);
        await carregarAuditoria(1);
      } catch (err) {
        setToast({ message: err.response?.data?.erro || "Não foi possível carregar as estatísticas.", type: "error" });
      } finally {
        setACarregar(false);
      }
    })();
  }, [carregarAuditoria]);

  const abas = [
    { key: "resumo", label: "Resumo", icon: BarChart3 },
    { key: "disciplinas", label: "Disciplinas", icon: Library },
    { key: "populares", label: "Mais populares", icon: TrendingUp },
    { key: "atividade", label: "Actividade", icon: Activity },
    { key: "auditoria", label: "Auditoria", icon: ScrollText },
  ];

  const maxUploads = Math.max(1, ...atividade.map(a => Number(a.uploads) || 0));

  return (
    <>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "" })} />

      <div className="space-y-8 animate-fade-in">
        <section className="relative overflow-hidden rounded-[32px] text-white p-9"
          style={{ background: "linear-gradient(135deg, var(--color-navy-abyss), var(--color-navy-deep), var(--color-navy-mid))", boxShadow: "0 24px 80px rgba(var(--color-navy-abyss-rgb),0.45)" }}>
          <p className="text-[10px] font-bold uppercase mb-2" style={{ letterSpacing: "0.4em", opacity: 0.6 }}>Administração</p>
          <h1 style={{ fontSize: "clamp(1.6rem,3vw,2.2rem)", fontWeight: 900, lineHeight: 1.1 }}>Analytics</h1>
          <p className="mt-2" style={{ fontSize: 14, opacity: 0.8 }}>Como a plataforma está a ser usada — utilizadores, materiais, avaliações e registo de acções.</p>
        </section>

        <div className="flex flex-wrap gap-2">
          {abas.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setAba(key)}
              className="flex items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-200"
              style={aba === key
                ? { background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", color: "#fff", boxShadow: "0 6px 24px rgba(var(--color-navy-deep-rgb),0.30)" }
                : { background: "var(--surface-card-glass)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-body)" }}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {aCarregar ? <Spinner label="A calcular estatísticas..." /> : (
          <>
            {aba === "resumo" && dashboard && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Numero icon={Users} valor={dashboard.usuarios.total} label="Utilizadores" destaque={`${dashboard.usuarios.estudantes} estudantes · ${dashboard.usuarios.professores} docentes · ${dashboard.usuarios.admins} admins`} />
                  <Numero icon={FileText} valor={dashboard.materiais.total} label="Materiais" destaque={`${dashboard.materiais.aprovados} aprovados · ${dashboard.materiais.pendentes} pendentes`} />
                  <Numero icon={MessageCircle} valor={dashboard.chat.total_mensagens} label="Mensagens de chat" destaque={`${dashboard.chat.usuarios_ativos} utilizadores activos`} />
                  <Numero icon={Star} valor={num(dashboard.avaliacoes.media_geral, 1)} label="Média das avaliações" destaque={`${dashboard.avaliacoes.total} avaliações em ${dashboard.avaliacoes.materiais_avaliados} materiais`} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Numero icon={TrendingUp} valor={dashboard.atividade.hoje} label="Uploads hoje" />
                  <Numero icon={Activity} valor={dashboard.atividade.ultima_semana} label="Uploads últimos 7 dias" />
                  <Numero icon={Users} valor={dashboard.usuarios.emails_verificados} label="Emails verificados" destaque={`de ${dashboard.usuarios.total} contas`} />
                </div>
              </div>
            )}

            {aba === "disciplinas" && (
              <Cartao icon={Library} titulo="Materiais por disciplina">
                <Tabela
                  vazio="Ainda não há materiais."
                  chave={l => l.cadeira}
                  linhas={disciplinas}
                  colunas={[
                    { label: "Disciplina", forte: true, render: l => l.cadeira },
                    { label: "Total", alinhar: "right", render: l => l.total },
                    { label: "Aprovados", alinhar: "right", render: l => l.aprovados },
                    { label: "Média", alinhar: "right", render: l => num(l.media_avaliacoes, 1) },
                  ]}
                />
              </Cartao>
            )}

            {aba === "populares" && (
              <Cartao icon={TrendingUp} titulo="Materiais mais avaliados e comentados">
                <Tabela
                  vazio="Ainda não há materiais aprovados."
                  chave={l => l.id}
                  linhas={populares}
                  colunas={[
                    { label: "Material", forte: true, render: l => <a href={`/video/${l.id}`} style={{ color: "var(--text-heading)" }}>{l.titulo}</a> },
                    { label: "Disciplina", render: l => l.cadeira },
                    { label: "Tipo", render: l => l.tipo },
                    { label: "Avaliações", alinhar: "right", render: l => l.total_avaliacoes },
                    { label: "Média", alinhar: "right", render: l => num(l.media_nota, 1) },
                    { label: "Comentários", alinhar: "right", render: l => l.total_comentarios },
                  ]}
                />
              </Cartao>
            )}

            {aba === "atividade" && (
              <Cartao icon={Activity} titulo="Uploads por dia" subtitulo="Últimos 30 dias">
                {atividade.length === 0 ? <Vazio icon={Activity}>Sem uploads nos últimos 30 dias.</Vazio> : (
                  <div className="flex items-end gap-1.5 h-44 overflow-x-auto pb-1">
                    {[...atividade].reverse().map(a => {
                      const altura = Math.max(6, (Number(a.uploads) / maxUploads) * 100);
                      return (
                        <div key={a.data} className="flex flex-col items-center gap-1 shrink-0" style={{ width: 28 }} title={`${formatarData(a.data)}: ${a.uploads} upload(s) de ${a.autores} autor(es)`}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-faint)" }}>{a.uploads}</span>
                          <div className="w-full rounded-t-lg" style={{ height: `${altura}%`, background: "linear-gradient(180deg,var(--color-gold),var(--color-gold-dark))" }} />
                          <span style={{ fontSize: 9, color: "var(--text-faint)" }}>{new Date(a.data).getDate()}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Cartao>
            )}

            {aba === "auditoria" && (
              <Cartao icon={ScrollText} titulo="Registo de acções" subtitulo="Quem fez o quê, quando e de onde">
                <Tabela
                  vazio="Ainda não há acções registadas."
                  chave={l => l.id}
                  linhas={auditoria.linhas}
                  colunas={[
                    { label: "Quando", render: l => new Date(l.data_hora).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) },
                    { label: "Utilizador", forte: true, render: l => l.usuario || "—" },
                    { label: "Acção", render: l => <code style={{ fontSize: 12 }}>{l.acao}</code> },
                    { label: "Descrição", render: l => l.descricao },
                    { label: "IP", render: l => <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{l.ip_origem}</span> },
                  ]}
                />
                {auditoria.page < auditoria.totalPages && (
                  <div className="flex justify-center mt-5">
                    <BotaoSecundario type="button" onClick={() => carregarAuditoria(auditoria.page + 1)}>Carregar mais</BotaoSecundario>
                  </div>
                )}
              </Cartao>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default Analytics;
