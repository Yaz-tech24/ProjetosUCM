import React, { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Bell, ClipboardList, BookOpen, FileCheck, Sparkles } from "lucide-react";
import api from "../services/api";
import { useConfig } from "../context/ConfigContext";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import { Cartao, Campo, BotaoPrimario, BotaoSecundario, Spinner, Vazio, Etiqueta } from "../components/ui";

const TIPOS = {
  teste: { label: "Teste", icon: ClipboardList, cor: "#dc2626" },
  entrega: { label: "Entrega", icon: FileCheck, cor: "#d97706" },
  aula: { label: "Aula", icon: BookOpen, cor: "#2563eb" },
  outro: { label: "Evento", icon: Sparkles, cor: "#7c3aed" },
};
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const chaveDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const paraInputLocal = (valor) => {
  const d = valor ? new Date(valor) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const FORM_VAZIO = { disciplina: "", titulo: "", descricao: "", tipo: "teste", data_inicio: "", data_fim: "" };

const Calendario = ({ usuarioLogado }) => {
  const { cursos } = useConfig();
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [eventos, setEventos] = useState([]);
  const [aCarregar, setACarregar] = useState(true);
  const [soMinhas, setSoMinhas] = useState(false);
  const [disciplina, setDisciplina] = useState("");
  const [diaSel, setDiaSel] = useState(null);
  const [form, setForm] = useState(null); // null | { ...FORM_VAZIO, id? }
  const [aGuardar, setAGuardar] = useState(false);
  const [confirmar, setConfirmar] = useState({ message: "", accao: null });
  const [toast, setToast] = useState({ message: "", type: "" });

  const onToast = (message, type = "success") => setToast({ message, type });
  const podeEditar = ["admin", "professor"].includes(usuarioLogado?.papel);

  const carregar = useCallback(async () => {
    setACarregar(true);
    try {
      const de = new Date(mes.getFullYear(), mes.getMonth(), 1);
      const ate = new Date(mes.getFullYear(), mes.getMonth() + 1, 0, 23, 59, 59);
      const { data } = await api.get("/calendario", { params: { de: de.toISOString(), ate: ate.toISOString(), disciplina: disciplina || undefined, minhas: soMinhas ? "true" : undefined } });
      setEventos(data);
    } catch {
      setEventos([]);
    } finally {
      setACarregar(false);
    }
  }, [mes, disciplina, soMinhas]);

  useEffect(() => { carregar(); }, [carregar]);

  const porDia = useMemo(() => {
    const m = new Map();
    for (const e of eventos) { const k = chaveDia(new Date(e.data_inicio)); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
    return m;
  }, [eventos]);

  const grelha = useMemo(() => {
    const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const offset = (primeiro.getDay() + 6) % 7; // semana começa à segunda
    const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const celulas = [];
    for (let i = 0; i < offset; i++) celulas.push(null);
    for (let d = 1; d <= diasNoMes; d++) celulas.push(new Date(mes.getFullYear(), mes.getMonth(), d));
    while (celulas.length % 7 !== 0) celulas.push(null);
    return celulas;
  }, [mes]);

  const hoje = chaveDia(new Date());
  const listaVisivel = diaSel ? (porDia.get(diaSel) || []) : eventos;

  const abrirNovo = (dia) => setForm({ ...FORM_VAZIO, disciplina: disciplina || cursos[0]?.nome || "", data_inicio: paraInputLocal(dia ? new Date(`${dia}T10:00:00`) : null) });
  const abrirEditar = (e) => setForm({ id: e.id, disciplina: e.disciplina, titulo: e.titulo, descricao: e.descricao || "", tipo: e.tipo, data_inicio: paraInputLocal(e.data_inicio), data_fim: e.data_fim ? paraInputLocal(e.data_fim) : "" });

  const guardar = async (ev) => {
    ev.preventDefault();
    setAGuardar(true);
    try {
      const corpo = { ...form, data_inicio: new Date(form.data_inicio).toISOString(), data_fim: form.data_fim ? new Date(form.data_fim).toISOString() : null, descricao: form.descricao || null };
      if (form.id) { await api.put(`/calendario/${form.id}`, corpo); onToast("Evento actualizado."); }
      else { const { data } = await api.post("/calendario", corpo); onToast(data.mensagem); }
      setForm(null);
      carregar();
    } catch (err) {
      onToast(err.response?.data?.erro || "Erro ao guardar o evento.", "error");
    } finally {
      setAGuardar(false);
    }
  };

  const apagar = (e) => setConfirmar({
    message: `Apagar "${e.titulo}"?`,
    accao: async () => { try { await api.delete(`/calendario/${e.id}`); onToast("Evento apagado."); carregar(); } catch (err) { onToast(err.response?.data?.erro || "Erro ao apagar.", "error"); } },
  });

  return (
    <>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "" })} />
      <ConfirmModal message={confirmar.message} onConfirm={async () => { const a = confirmar.accao; setConfirmar({ message: "", accao: null }); await a?.(); }} onCancel={() => setConfirmar({ message: "", accao: null })} />

      <div className="space-y-6 animate-fade-in">
        <section className="relative overflow-hidden rounded-[32px] text-white p-9"
          style={{ background: "linear-gradient(135deg, var(--color-navy-abyss), var(--color-navy-deep), var(--color-navy-mid))", boxShadow: "0 24px 80px rgba(var(--color-navy-abyss-rgb),0.45)" }}>
          <p className="text-[10px] font-bold uppercase mb-2" style={{ letterSpacing: "0.4em", opacity: 0.6 }}>Académico</p>
          <h1 style={{ fontSize: "clamp(1.6rem,3vw,2.2rem)", fontWeight: 900, lineHeight: 1.1 }}>Calendário</h1>
          <p className="mt-2" style={{ fontSize: 14, opacity: 0.8, maxWidth: 560 }}>
            Testes, entregas e aulas por disciplina. Quem segue uma disciplina recebe um lembrete 24 horas antes de cada evento.
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-2xl p-1" style={{ background: "var(--surface-card)", border: "1.5px solid var(--border-subtle-strong)" }}>
            <button type="button" onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="rounded-xl p-2" style={{ color: "var(--text-muted)" }} aria-label="Mês anterior"><ChevronLeft size={18} /></button>
            <span className="px-3 min-w-[170px] text-center" style={{ fontSize: 14, fontWeight: 900, color: "var(--text-heading)" }}>{MESES[mes.getMonth()]} {mes.getFullYear()}</span>
            <button type="button" onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="rounded-xl p-2" style={{ color: "var(--text-muted)" }} aria-label="Mês seguinte"><ChevronRight size={18} /></button>
          </div>
          <select value={disciplina} onChange={e => setDisciplina(e.target.value)} className="rounded-2xl px-4 py-3 text-sm outline-none appearance-none"
            style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }}>
            <option value="">Todas as disciplinas</option>
            {cursos.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 cursor-pointer" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-body)" }}>
            <input type="checkbox" checked={soMinhas} onChange={e => setSoMinhas(e.target.checked)} className="w-4 h-4" /> <Bell size={14} /> Só as que sigo
          </label>
          {podeEditar && <BotaoPrimario type="button" onClick={() => abrirNovo(diaSel)} className="ml-auto"><Plus size={15} /> Novo evento</BotaoPrimario>}
        </div>

        {form && (
          <Cartao icon={CalendarDays} titulo={form.id ? "Editar evento" : "Novo evento"}>
            <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
              <div>
                <Etiqueta>Disciplina</Etiqueta>
                <select value={form.disciplina} onChange={e => setForm(f => ({ ...f, disciplina: e.target.value }))} required className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none appearance-none"
                  style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }}>
                  <option value="">Escolher…</option>
                  {cursos.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <Etiqueta>Tipo</Etiqueta>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(TIPOS).map(([k, t]) => (
                    <button key={k} type="button" onClick={() => setForm(f => ({ ...f, tipo: k }))} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-all"
                      style={form.tipo === k ? { background: t.cor, color: "#fff" } : { background: "var(--surface-hover)", color: "var(--text-body)", border: "1px solid var(--border-subtle-strong)" }}>
                      <t.icon size={13} /> {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2"><Campo label="Título" type="text" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value.slice(0, 150) }))} placeholder="Ex.: 1.º teste — capítulos 1 a 3" required minLength={3} /></div>
              <Campo label="Início" type="datetime-local" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} required />
              <Campo label="Fim (opcional)" type="datetime-local" value={form.data_fim} onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))} />
              <div className="sm:col-span-2">
                <Etiqueta>Descrição (opcional)</Etiqueta>
                <textarea rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value.slice(0, 2000) }))} placeholder="Sala, matéria, o que levar…"
                  className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-y" style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }} />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <BotaoSecundario type="button" onClick={() => setForm(null)}>Cancelar</BotaoSecundario>
                <BotaoPrimario type="submit" loading={aGuardar} disabled={!form.disciplina || form.titulo.trim().length < 3 || !form.data_inicio}>{form.id ? "Guardar" : "Criar e avisar subscritores"}</BotaoPrimario>
              </div>
            </form>
          </Cartao>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Cartao icon={CalendarDays} titulo={`${MESES[mes.getMonth()]} ${mes.getFullYear()}`} subtitulo={`${eventos.length} evento${eventos.length !== 1 ? "s" : ""} este mês`}>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DIAS.map(d => <div key={d} className="text-center text-[10.5px] font-bold uppercase py-1" style={{ letterSpacing: "0.1em", color: "var(--text-faint)" }}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grelha.map((d, i) => {
                if (!d) return <div key={`v${i}`} />;
                const k = chaveDia(d);
                const doDia = porDia.get(k) || [];
                const sel = diaSel === k;
                return (
                  <button key={k} type="button" onClick={() => setDiaSel(sel ? null : k)}
                    className="min-h-[62px] rounded-xl p-1.5 text-left transition-all"
                    style={{ border: `1.5px solid ${sel ? "var(--color-navy-mid)" : k === hoje ? "rgba(var(--color-gold-rgb),0.6)" : "var(--border-subtle)"}`, background: sel ? "rgba(var(--color-navy-mid-rgb),0.08)" : k === hoje ? "rgba(var(--color-gold-rgb),0.08)" : "transparent" }}>
                    <span style={{ fontSize: 12, fontWeight: k === hoje ? 900 : 700, color: k === hoje ? "var(--color-gold-dark)" : "var(--text-heading)" }}>{d.getDate()}</span>
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {doDia.slice(0, 3).map(e => <span key={e.id} className="w-2 h-2 rounded-full" style={{ background: TIPOS[e.tipo]?.cor || "#7c3aed" }} title={e.titulo} />)}
                      {doDia.length > 3 && <span style={{ fontSize: 9, color: "var(--text-faint)" }}>+{doDia.length - 3}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-4">
              {Object.entries(TIPOS).map(([k, t]) => <span key={k} className="inline-flex items-center gap-1.5" style={{ fontSize: 11.5, color: "var(--text-faint)" }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: t.cor }} /> {t.label}</span>)}
            </div>
          </Cartao>

          <Cartao icon={ClipboardList} titulo={diaSel ? `Dia ${diaSel.split("-").reverse().join("/")}` : "Eventos do mês"} accao={diaSel && <BotaoSecundario type="button" onClick={() => setDiaSel(null)}>Ver mês</BotaoSecundario>}>
            {aCarregar ? <Spinner /> : listaVisivel.length === 0 ? (
              <Vazio icon={CalendarDays}>{diaSel ? "Nada marcado neste dia." : soMinhas ? "Nenhum evento nas disciplinas que segue este mês." : "Nenhum evento este mês."}</Vazio>
            ) : (
              <ul className="space-y-2">
                {listaVisivel.map(e => {
                  const t = TIPOS[e.tipo] || TIPOS.outro;
                  const inicio = new Date(e.data_inicio);
                  const podeEste = podeEditar && (usuarioLogado?.papel === "admin" || e.criado_por === usuarioLogado?.id);
                  return (
                    <li key={e.id} className="flex gap-3 rounded-2xl p-3.5" style={{ border: "1px solid var(--border-subtle)", borderLeft: `4px solid ${t.cor}` }}>
                      <div className="text-center shrink-0 w-11">
                        <p style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: "var(--text-heading)" }}>{inicio.getDate()}</p>
                        <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-faint)" }}>{MESES[inicio.getMonth()].slice(0, 3)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5" style={{ fontSize: 14, fontWeight: 800, color: "var(--text-heading)" }}><t.icon size={13} style={{ color: t.cor }} /> {e.titulo}</p>
                        <p style={{ fontSize: 12, color: "var(--text-faint)" }}>
                          {e.disciplina} · {inicio.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}{e.data_fim ? `–${new Date(e.data_fim).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}` : ""}{e.criado_por_nome ? ` · ${e.criado_por_nome}` : ""}
                        </p>
                        {e.descricao && <p className="mt-1 whitespace-pre-wrap" style={{ fontSize: 12.5, color: "var(--text-body)" }}>{e.descricao}</p>}
                      </div>
                      {podeEste && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button type="button" onClick={() => abrirEditar(e)} className="rounded-lg p-1.5" style={{ color: "var(--text-faint)" }} aria-label="Editar"><Pencil size={14} /></button>
                          <button type="button" onClick={() => apagar(e)} className="rounded-lg p-1.5" style={{ color: "var(--text-faint)" }} aria-label="Apagar"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
};

export default Calendario;
