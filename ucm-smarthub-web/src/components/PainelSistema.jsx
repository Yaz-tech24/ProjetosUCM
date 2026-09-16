import React, { useState, useEffect, useCallback } from "react";
import { Activity, Database, HardDrive, FileText, Cpu, Mail, Sparkles, RefreshCw, Newspaper, Send, Eye, Trash2, Archive, ServerCog } from "lucide-react";
import api from "../services/api";
import ConfirmModal from "./ConfirmModal";
import { BotaoPrimario, BotaoSecundario, Spinner } from "./ui";

/* Admin → Sistema: estado detalhado (BD, LibreOffice, indexação, disco,
   backups, migrações), envio do digest semanal e limpeza manual. */
const Ponto = ({ ok, neutro }) => (
  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={neutro
    ? { background: "var(--text-faint)" }
    : ok ? { background: "#34d399", boxShadow: "0 0 8px rgba(52,211,153,0.80)" } : { background: "#f59e0b", boxShadow: "0 0 8px rgba(245,158,11,0.70)" }} />
);

const Linha = ({ icon: Icon, titulo, ok, neutro, detalhe }) => (
  <li className="flex items-start gap-3 rounded-2xl px-4 py-3" style={{ background: "var(--surface-hover)", border: `1px solid ${ok === false && !neutro ? "var(--status-warning-border)" : "var(--border-subtle)"}` }}>
    <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(var(--color-navy-mid-rgb),0.08)", color: "var(--text-accent)" }}><Icon size={16} /></span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2" style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text-heading)" }}><Ponto ok={ok} neutro={neutro} /> {titulo}</span>
      <span className="block" style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.5 }}>{detalhe}</span>
    </span>
  </li>
);

const mb = (v) => (v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${v} MB`);

const PainelSistema = ({ onToast }) => {
  const [estado, setEstado] = useState(null);
  const [aCarregar, setACarregar] = useState(true);
  const [aEnviar, setAEnviar] = useState(false);
  const [aLimpar, setALimpar] = useState(false);
  const [previsualizacao, setPrevisualizacao] = useState(null);
  const [confirmar, setConfirmar] = useState(null);

  const carregar = useCallback(async () => {
    setACarregar(true);
    try { const { data } = await api.get("/admin/sistema"); setEstado(data); }
    catch { setEstado(null); }
    finally { setACarregar(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const enviarDigest = async () => {
    setAEnviar(true);
    try {
      const { data } = await api.post("/admin/digest/enviar", {}, { timeout: 5 * 60 * 1000 });
      onToast(`Digest: ${data.enviados} enviado(s) (${data.emails} por email) de ${data.elegiveis} elegíveis.`);
    } catch (err) { onToast(err.response?.data?.erro || "Erro ao enviar o digest.", "error"); }
    finally { setAEnviar(false); }
  };

  const previsualizar = async () => {
    try { const { data } = await api.get("/admin/digest/previsualizar"); setPrevisualizacao(data); }
    catch (err) { onToast(err.response?.data?.erro || "Erro ao gerar a pré-visualização.", "error"); }
  };

  const limpar = async () => {
    setALimpar(true);
    try {
      const { data } = await api.post("/admin/manutencao", {}, { timeout: 120000 });
      onToast(`Limpeza: ${Object.entries(data).map(([k, v]) => `${k} ${v ?? "erro"}`).join(" · ")}`);
      carregar();
    } catch (err) { onToast(err.response?.data?.erro || "Erro na manutenção.", "error"); }
    finally { setALimpar(false); }
  };

  const s = estado?.servicos;
  return (
    <div className="space-y-6">
      <ConfirmModal message={confirmar?.mensagem || ""} onConfirm={async () => { const a = confirmar?.accao; setConfirmar(null); await a?.(); }} onCancel={() => setConfirmar(null)} />

      <section className="rounded-[28px] overflow-hidden" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 32px rgba(var(--color-navy-mid-rgb),0.07)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-7 py-5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-2.5">
            <Activity size={19} style={{ color: "var(--text-accent)" }} />
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: "var(--text-heading)" }}>Saúde do sistema</h2>
              <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
                {estado ? <>Estado <strong style={{ color: estado.estado === "ok" ? "var(--status-success-text)" : "var(--status-warning-text)" }}>{estado.estado}</strong> · versão {estado.versao || "?"} · Node {estado.node} · activo há {Math.round(estado.uptime_s / 3600)} h · verificado a cada 5 min; alertas por notificação/email aos admins</> : "A verificar…"}
              </p>
            </div>
          </div>
          <BotaoSecundario type="button" onClick={carregar} disabled={aCarregar}><RefreshCw size={14} className={aCarregar ? "animate-spin" : ""} /> Actualizar</BotaoSecundario>
        </div>
        <div className="p-7">
          {aCarregar && !estado ? <Spinner /> : !s ? <p style={{ fontSize: 13.5, color: "var(--status-danger-text)" }}>Não foi possível obter o estado.</p> : (
            <ul className="grid gap-3 md:grid-cols-2">
              <Linha icon={Database} titulo="Base de dados" ok={s.bd.ok} detalhe={s.bd.ok ? `Ligada · ${s.bd.latencia_ms} ms` : `Inacessível: ${s.bd.erro}`} />
              <Linha icon={FileText} titulo="Conversão Office → PDF (LibreOffice)" ok={s.libreoffice.disponivel} neutro={!s.libreoffice.disponivel} detalhe={s.libreoffice.disponivel ? "Disponível — DOCX/PPTX podem ser aceites nas configurações" : "Não instalado neste servidor — uploads Office são recusados com aviso"} />
              <Linha icon={Cpu} titulo="Indexação de PDFs para pesquisa" ok={s.indexacao.ok} detalhe={s.indexacao.erro || `${s.indexacao.pendentes} por indexar · ${s.indexacao.sem_texto} sem texto (digitalizados) · corre de hora a hora`} />
              <Linha icon={HardDrive} titulo="Disco (pasta de uploads)" ok={s.disco.ok} neutro={s.disco.indisponivel} detalhe={s.disco.indisponivel ? "Sem leitura do espaço livre neste sistema" : `${mb(s.disco.livre_mb)} livres de ${mb(s.disco.total_mb)}${s.uploads ? ` · uploads: ${s.uploads.ficheiros} ficheiro(s), ${mb(s.uploads.mb)}` : ""}`} />
              <Linha icon={Archive} titulo="Backups da base de dados" ok={s.backups.ok} neutro={!s.backups.configurado} detalhe={!s.backups.configurado ? "BACKUPS_DIR não definido — a API não consegue ver a pasta de backups (defina-a para monitorizar)" : s.backups.erro || `Último: ${s.backups.ultimo} há ${s.backups.ha_horas} h (${s.backups.mb} MB) · ${s.backups.total} guardado(s)`} />
              <Linha icon={ServerCog} titulo="Migrações do esquema" ok={!s.migracoes.erro && s.migracoes.pendentes?.length === 0} detalhe={s.migracoes.erro || `${s.migracoes.aplicadas}/${s.migracoes.total} aplicadas${s.migracoes.ultima ? ` · última: ${s.migracoes.ultima.nome}` : ""}`} />
              <Linha icon={Sparkles} titulo="IA (Gemini)" ok={s.ia.configurada} neutro={!s.ia.configurada} detalhe={s.ia.configurada ? "Chave configurada — resumos, quizzes, flashcards, traduções e moderação assistida" : "GEMINI_API_KEY não definida"} />
              <Linha icon={Mail} titulo="Email (SMTP)" ok={s.email.configurado} neutro={!s.email.configurado} detalhe={s.email.configurado ? `Configurado · digest semanal ${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][s.digest.dia_semana]} às ${String(s.digest.hora).padStart(2, "0")}:00` : "Não configurado — emails não são enviados; o digest chega só como notificação"} />
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-[28px] p-7" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 32px rgba(var(--color-navy-mid-rgb),0.07)" }}>
          <h3 className="flex items-center gap-2 mb-1" style={{ fontSize: 16, fontWeight: 900, color: "var(--text-heading)" }}><Newspaper size={17} style={{ color: "var(--text-accent)" }} /> Resumo semanal</h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>Enviado automaticamente uma vez por semana a quem não o desligou no perfil. Pode forçar o envio agora — quem já recebeu nos últimos 6 dias é saltado.</p>
          <div className="flex flex-wrap gap-2">
            <BotaoSecundario type="button" onClick={previsualizar}><Eye size={14} /> Pré-visualizar o meu</BotaoSecundario>
            <BotaoPrimario type="button" loading={aEnviar} onClick={() => setConfirmar({ mensagem: "Enviar o resumo semanal agora a todos os utilizadores elegíveis?", accao: enviarDigest })}><Send size={14} /> Enviar agora</BotaoPrimario>
          </div>
          {previsualizacao && (
            <div className="mt-4 rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border-subtle-strong)" }}>
              <div className="px-4 py-2 flex items-center justify-between" style={{ background: "var(--surface-hover)", fontSize: 12, color: "var(--text-faint)" }}>
                <span>{previsualizacao.tem_conteudo ? previsualizacao.resumo : "Sem novidades — não seria enviado"}</span>
                <button type="button" onClick={() => setPrevisualizacao(null)} style={{ fontWeight: 700 }}>Fechar</button>
              </div>
              <iframe title="Pré-visualização do digest" srcDoc={previsualizacao.html} sandbox="" className="w-full" style={{ height: 360, background: "#fff", border: 0 }} />
            </div>
          )}
        </div>
        <div className="rounded-[28px] p-7" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 32px rgba(var(--color-navy-mid-rgb),0.07)" }}>
          <h3 className="flex items-center gap-2 mb-1" style={{ fontSize: 16, fontWeight: 900, color: "var(--text-heading)" }}><Trash2 size={17} style={{ color: "var(--text-accent)" }} /> Limpeza e retenção</h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>Corre todos os dias: sessões expiradas (30 d), registos de acesso (2 anos), auditoria e denúncias fechadas (365 d), notificações lidas (90 d), eventos passados (180 d). Ajustável por variáveis de ambiente.</p>
          <BotaoSecundario type="button" disabled={aLimpar} onClick={() => setConfirmar({ mensagem: "Correr a limpeza diária agora?", accao: limpar })}><Trash2 size={14} /> {aLimpar ? "A limpar…" : "Correr limpeza agora"}</BotaoSecundario>
        </div>
      </section>
    </div>
  );
};

export default PainelSistema;
