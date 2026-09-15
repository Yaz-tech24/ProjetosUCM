import React, { useState, useEffect, useCallback } from "react";
import { ShieldCheck, ShieldOff, Smartphone, KeyRound, Copy, Check, Lock, LifeBuoy, Download, RefreshCw, MonitorSmartphone, LogOut, X } from "lucide-react";
import api from "../services/api";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import { Cartao, BotaoPrimario, BotaoSecundario, Spinner, Etiqueta, Vazio } from "../components/ui";

const CampoCodigo = ({ valor, onChange, autoFocus, id }) => (
  <input
    id={id}
    type="text"
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern="\d{6}"
    maxLength={6}
    autoFocus={autoFocus}
    value={valor}
    onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
    placeholder="000000"
    className="w-full rounded-2xl py-3.5 px-4 text-center outline-none transition-all"
    style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)", fontSize: 24, letterSpacing: "0.5em", fontWeight: 800 }}
    onFocus={e => (e.target.style.borderColor = "var(--color-navy-mid)")}
    onBlur={e => (e.target.style.borderColor = "var(--border-subtle-strong)")}
  />
);

/* Códigos de recuperação — só existem em claro neste momento; copiar/descarregar */
const CodigosRecuperacao = ({ codigos, onFechar }) => {
  const [copiado, setCopiado] = useState(false);
  const texto = codigos.join("\n");
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sem clipboard */ }
  };
  const descarregar = () => {
    const blob = new Blob([`Códigos de recuperação 2FA — guarde em local seguro. Cada um só funciona uma vez.\n\n${texto}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "codigos-recuperacao-smarthub.txt" });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--status-warning-bg)", border: "1px solid var(--status-warning-border)" }}>
      <p style={{ fontSize: 14, fontWeight: 800, color: "var(--status-warning-text)" }}>Guarde estes códigos agora — não voltam a ser mostrados.</p>
      <p className="mt-1 mb-4" style={{ fontSize: 13, color: "var(--text-body)" }}>Se perder o telemóvel, qualquer um destes códigos entra no lugar do código da app. Cada um só funciona uma vez.</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        {codigos.map(c => (
          <code key={c} className="rounded-xl px-2 py-2 text-center" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle-strong)", fontSize: 13.5, fontWeight: 800, color: "var(--text-heading)", letterSpacing: "0.06em" }}>{c}</code>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 justify-end">
        <BotaoSecundario type="button" onClick={copiar}>{copiado ? <Check size={15} /> : <Copy size={15} />} {copiado ? "Copiado" : "Copiar"}</BotaoSecundario>
        <BotaoSecundario type="button" onClick={descarregar}><Download size={15} /> Descarregar .txt</BotaoSecundario>
        <BotaoPrimario type="button" onClick={onFechar}><Check size={15} /> Já guardei</BotaoPrimario>
      </div>
    </div>
  );
};

const Seguranca = ({ usuarioLogado, onUpdateUsuario }) => {
  const [ativado, setAtivado] = useState(false);
  const [codigosRestantes, setCodigosRestantes] = useState(0);
  const [aCarregar, setACarregar] = useState(true);
  const [setup, setSetup] = useState(null); // { secret, otpauthUrl, qrCode }
  const [codigo, setCodigo] = useState("");
  const [modo, setModo] = useState(null); // null | 'desactivar' | 'regenerar'
  const [aProcessar, setAProcessar] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [codigosNovos, setCodigosNovos] = useState(null);
  const [sessoes, setSessoes] = useState([]);
  const [aCarregarSessoes, setACarregarSessoes] = useState(true);
  const [confirmar, setConfirmar] = useState({ message: "", accao: null });
  const [toast, setToast] = useState({ message: "", type: "" });

  const showToast = (message, type = "success") => setToast({ message, type });

  const carregarEstado = useCallback(async () => {
    try {
      const { data } = await api.get("/2fa/status");
      setAtivado(data.ativado);
      setCodigosRestantes(data.codigos_restantes || 0);
    } catch {
      showToast("Não foi possível verificar o estado do 2FA.", "error");
    } finally {
      setACarregar(false);
    }
  }, []);

  const carregarSessoes = useCallback(async () => {
    try {
      const { data } = await api.get("/sessoes");
      setSessoes(data);
    } catch {
      setSessoes([]);
    } finally {
      setACarregarSessoes(false);
    }
  }, []);

  useEffect(() => { carregarEstado(); carregarSessoes(); }, [carregarEstado, carregarSessoes]);

  const iniciarSetup = async () => {
    setAProcessar(true);
    try {
      const { data } = await api.post("/2fa/gerar-secret");
      setSetup(data);
      setCodigo("");
    } catch (err) {
      showToast(err.response?.data?.erro || "Erro ao gerar o código QR.", "error");
    } finally {
      setAProcessar(false);
    }
  };

  const confirmarSetup = async (e) => {
    e.preventDefault();
    if (codigo.length !== 6) return showToast("Introduza os 6 dígitos da app.", "warn");
    setAProcessar(true);
    try {
      const { data } = await api.post("/2fa/confirmar", { codigo });
      setAtivado(true);
      setSetup(null);
      setCodigo("");
      setCodigosNovos(data.codigos_recuperacao || []);
      setCodigosRestantes((data.codigos_recuperacao || []).length);
      onUpdateUsuario?.({ "2fa_ativado": true });
      showToast("2FA activado. Guarde os códigos de recuperação.");
    } catch (err) {
      showToast(err.response?.data?.erro || "Código inválido.", "error");
    } finally {
      setAProcessar(false);
    }
  };

  const submeterComCodigo = async (e) => {
    e.preventDefault();
    if (codigo.length !== 6) return showToast("Introduza os 6 dígitos da app para confirmar.", "warn");
    setAProcessar(true);
    try {
      if (modo === "desactivar") {
        await api.post("/2fa/desativar", { codigo });
        setAtivado(false);
        setCodigosRestantes(0);
        onUpdateUsuario?.({ "2fa_ativado": false });
        showToast("2FA desactivado.", "warn");
      } else {
        const { data } = await api.post("/2fa/codigos-recuperacao/regenerar", { codigo });
        setCodigosNovos(data.codigos_recuperacao || []);
        setCodigosRestantes((data.codigos_recuperacao || []).length);
        showToast("Novos códigos gerados. Os antigos já não funcionam.");
      }
      setModo(null);
      setCodigo("");
    } catch (err) {
      showToast(err.response?.data?.erro || "Código inválido.", "error");
    } finally {
      setAProcessar(false);
    }
  };

  const copiarSecret = async () => {
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      showToast("Não foi possível copiar. Seleccione o texto manualmente.", "warn");
    }
  };

  const terminarSessao = (s) => {
    setConfirmar({
      message: s.actual ? "Terminar a sessão actual? Vai ter de voltar a entrar." : `Terminar a sessão em ${s.dispositivo || "dispositivo desconhecido"}?`,
      accao: async () => {
        try {
          const { data } = await api.delete(`/sessoes/${s.jti}`);
          if (data.era_actual) { window.location.href = "/"; return; }
          setSessoes(prev => prev.filter(x => x.jti !== s.jti));
          showToast("Sessão terminada.");
        } catch (err) {
          showToast(err.response?.data?.erro || "Erro ao terminar a sessão.", "error");
        }
      },
    });
  };

  const terminarOutras = () => {
    setConfirmar({
      message: "Terminar todas as outras sessões? Só este dispositivo continua ligado.",
      accao: async () => {
        try {
          const { data } = await api.delete("/sessoes");
          showToast(data.mensagem);
          carregarSessoes();
        } catch (err) {
          showToast(err.response?.data?.erro || "Erro ao terminar sessões.", "error");
        }
      },
    });
  };

  const executarConfirmacao = async () => {
    const accao = confirmar.accao;
    setConfirmar({ message: "", accao: null });
    await accao?.();
  };

  const formatarQuando = (v) => new Date(v).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });

  return (
    <>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "" })} />
      <ConfirmModal message={confirmar.message} onConfirm={executarConfirmacao} onCancel={() => setConfirmar({ message: "", accao: null })} />

      <div className="space-y-8 animate-fade-in max-w-3xl">
        <section className="relative overflow-hidden rounded-[32px] text-white p-9"
          style={{ background: "linear-gradient(135deg, var(--color-navy-abyss), var(--color-navy-deep), var(--color-navy-mid))", boxShadow: "0 24px 80px rgba(var(--color-navy-abyss-rgb),0.45)" }}>
          <p className="text-[10px] font-bold uppercase mb-2" style={{ letterSpacing: "0.4em", opacity: 0.6 }}>Conta de {usuarioLogado?.nome?.split(" ")[0]}</p>
          <h1 style={{ fontSize: "clamp(1.6rem,3vw,2.2rem)", fontWeight: 900, lineHeight: 1.1 }}>Segurança</h1>
          <p className="mt-2" style={{ fontSize: 14, opacity: 0.8, maxWidth: 520 }}>
            Autenticação de dois factores, códigos de recuperação e os dispositivos onde a sua conta está ligada.
          </p>
        </section>

        {codigosNovos && <CodigosRecuperacao codigos={codigosNovos} onFechar={() => setCodigosNovos(null)} />}

        <Cartao
          icon={ativado ? ShieldCheck : ShieldOff}
          titulo="Autenticação de dois factores (2FA)"
          subtitulo={ativado ? "Activa — o login pede um código da app" : "Inactiva — só a palavra-passe protege a conta"}
          accao={(
            <span className="rounded-full px-3 py-1 text-xs font-black"
              style={ativado ? { background: "var(--status-success-bg)", color: "var(--status-success-text)", border: "1px solid var(--status-success-border)" }
                             : { background: "var(--status-warning-bg)", color: "var(--status-warning-text)", border: "1px solid var(--status-warning-border)" }}>
              {ativado ? "ACTIVA" : "INACTIVA"}
            </span>
          )}
        >
          {aCarregar ? <Spinner /> : ativado ? (
            modo ? (
              <form onSubmit={submeterComCodigo} className="space-y-4">
                <p style={{ fontSize: 13.5, color: "var(--text-body)" }}>
                  {modo === "desactivar" ? "Para desactivar, confirme com o código actual da app." : "Para gerar novos códigos de recuperação, confirme com o código actual da app. Os antigos deixam de funcionar."}
                </p>
                <CampoCodigo id="codigo-2fa-accao" valor={codigo} onChange={setCodigo} autoFocus />
                <div className="flex justify-end gap-2">
                  <BotaoSecundario type="button" onClick={() => { setModo(null); setCodigo(""); }}>Cancelar</BotaoSecundario>
                  {modo === "desactivar"
                    ? <BotaoPrimario type="submit" loading={aProcessar} style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", boxShadow: "0 6px 20px rgba(239,68,68,0.35)" }}><ShieldOff size={15} /> Desactivar 2FA</BotaoPrimario>
                    : <BotaoPrimario type="submit" loading={aProcessar}><RefreshCw size={15} /> Gerar novos códigos</BotaoPrimario>}
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)" }}>
                  <div className="flex items-center gap-3">
                    <LifeBuoy size={20} style={{ color: codigosRestantes <= 2 ? "var(--status-danger-text)" : "var(--text-accent)" }} />
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-heading)" }}>Códigos de recuperação</p>
                      <p style={{ fontSize: 12.5, color: codigosRestantes <= 2 ? "var(--status-danger-text)" : "var(--text-faint)" }}>
                        {codigosRestantes === 0 ? "Não tem códigos — gere novos antes que precise deles." : `${codigosRestantes} por usar. Cada um entra uma vez, se perder o telemóvel.`}
                      </p>
                    </div>
                  </div>
                  <BotaoSecundario type="button" onClick={() => { setModo("regenerar"); setCodigo(""); }}><RefreshCw size={15} /> Gerar novos</BotaoSecundario>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p style={{ fontSize: 13.5, color: "var(--text-body)", maxWidth: 420 }}>
                    Se trocar de telemóvel, desactive o 2FA antes e volte a activá-lo no novo aparelho.
                  </p>
                  <BotaoSecundario type="button" onClick={() => { setModo("desactivar"); setCodigo(""); }}><ShieldOff size={15} /> Desactivar</BotaoSecundario>
                </div>
              </div>
            )
          ) : !setup ? (
            <div className="space-y-5">
              <ol className="space-y-2.5" style={{ fontSize: 13.5, color: "var(--text-body)" }}>
                {[
                  ["Instale uma app de autenticação", "Google Authenticator, Microsoft Authenticator, Authy ou semelhante."],
                  ["Leia o código QR", "Ou introduza a chave manualmente na app."],
                  ["Confirme com o código de 6 dígitos", "Recebe também 10 códigos de recuperação para o caso de perder o telemóvel."],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full grid place-items-center shrink-0 text-xs font-black text-white" style={{ background: "var(--color-navy-mid)" }}>{i + 1}</span>
                    <span><strong style={{ color: "var(--text-heading)" }}>{t}</strong> — {d}</span>
                  </li>
                ))}
              </ol>
              <div className="flex justify-end">
                <BotaoPrimario type="button" onClick={iniciarSetup} loading={aProcessar}><Smartphone size={15} /> Activar 2FA</BotaoPrimario>
              </div>
            </div>
          ) : (
            <form onSubmit={confirmarSetup} className="grid gap-6 md:grid-cols-[220px_1fr]">
              <div className="rounded-2xl p-3 grid place-items-center" style={{ background: "#fff", border: "1px solid var(--border-subtle-strong)" }}>
                <img src={setup.qrCode} alt="Código QR para a app de autenticação" width={200} height={200} style={{ imageRendering: "pixelated" }} />
              </div>
              <div className="space-y-4 min-w-0">
                <div>
                  <Etiqueta>Chave manual (se não conseguir ler o QR)</Etiqueta>
                  <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle-strong)" }}>
                    <KeyRound size={15} style={{ color: "var(--text-faint)" }} />
                    <code className="flex-1 truncate" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-heading)", letterSpacing: "0.08em" }}>{setup.secret}</code>
                    <button type="button" onClick={copiarSecret} className="rounded-lg p-1.5" style={{ color: "var(--text-accent)" }} aria-label="Copiar chave">
                      {copiado ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                </div>
                <div>
                  <Etiqueta>Código da app</Etiqueta>
                  <CampoCodigo id="codigo-2fa-setup" valor={codigo} onChange={setCodigo} autoFocus />
                </div>
                <div className="flex justify-end gap-2">
                  <BotaoSecundario type="button" onClick={() => { setSetup(null); setCodigo(""); }}>Cancelar</BotaoSecundario>
                  <BotaoPrimario type="submit" loading={aProcessar} disabled={codigo.length !== 6}><Lock size={15} /> Confirmar e activar</BotaoPrimario>
                </div>
              </div>
            </form>
          )}
        </Cartao>

        <Cartao
          icon={MonitorSmartphone}
          titulo="Sessões activas"
          subtitulo="Dispositivos onde a sua conta está ligada neste momento"
          accao={sessoes.length > 1 && (
            <BotaoSecundario type="button" onClick={terminarOutras}><LogOut size={15} /> Terminar as outras</BotaoSecundario>
          )}
        >
          {aCarregarSessoes ? <Spinner /> : sessoes.length === 0 ? (
            <Vazio icon={MonitorSmartphone}>Sem sessões registadas — a sua sessão actual é anterior a esta funcionalidade. Saia e volte a entrar para a ver aqui.</Vazio>
          ) : (
            <ul className="space-y-2">
              {sessoes.map(s => (
                <li key={s.jti} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                  style={{ border: `1px solid ${s.actual ? "rgba(var(--color-gold-rgb),0.55)" : "var(--border-subtle)"}`, background: s.actual ? "rgba(var(--color-gold-rgb),0.07)" : "transparent" }}>
                  <MonitorSmartphone size={18} style={{ color: "var(--text-accent)" }} />
                  <div className="min-w-0 flex-1">
                    <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-heading)" }}>
                      {s.dispositivo || "Dispositivo desconhecido"}
                      {s.actual && <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: "rgba(var(--color-gold-rgb),0.2)", color: "var(--color-gold-dark)" }}>Esta sessão</span>}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-faint)" }}>
                      IP {s.ip || "—"} · último uso {formatarQuando(s.ultimo_uso)} · iniciada {formatarQuando(s.criado_em)}
                    </p>
                  </div>
                  <button type="button" onClick={() => terminarSessao(s)} className="rounded-xl p-2 transition-colors hover:bg-red-50" style={{ color: "var(--text-faint)" }} aria-label="Terminar sessão" title="Terminar sessão">
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
};

export default Seguranca;
