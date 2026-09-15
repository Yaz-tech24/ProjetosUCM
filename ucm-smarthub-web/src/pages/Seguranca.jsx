import React, { useState, useEffect, useCallback } from "react";
import { ShieldCheck, ShieldOff, Smartphone, KeyRound, Copy, Check, Lock } from "lucide-react";
import api from "../services/api";
import Toast from "../components/Toast";
import { Cartao, BotaoPrimario, BotaoSecundario, Spinner, Etiqueta } from "../components/ui";

const CampoCodigo = ({ valor, onChange, autoFocus }) => (
  <input
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

const Seguranca = ({ usuarioLogado, onUpdateUsuario }) => {
  const [ativado, setAtivado] = useState(false);
  const [aCarregar, setACarregar] = useState(true);
  const [setup, setSetup] = useState(null); // { secret, otpauthUrl, qrCode }
  const [codigo, setCodigo] = useState("");
  const [aProcessar, setAProcessar] = useState(false);
  const [aDesactivar, setADesactivar] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [toast, setToast] = useState({ message: "", type: "" });

  const showToast = (message, type = "success") => setToast({ message, type });

  const carregarEstado = useCallback(async () => {
    try {
      const { data } = await api.get("/2fa/status");
      setAtivado(data.ativado);
    } catch {
      showToast("Não foi possível verificar o estado do 2FA.", "error");
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => { carregarEstado(); }, [carregarEstado]);

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

  const confirmar = async (e) => {
    e.preventDefault();
    if (codigo.length !== 6) return showToast("Introduza os 6 dígitos da app.", "warn");
    setAProcessar(true);
    try {
      await api.post("/2fa/confirmar", { codigo });
      setAtivado(true);
      setSetup(null);
      setCodigo("");
      onUpdateUsuario?.({ "2fa_ativado": true });
      showToast("2FA activado. A partir de agora o login pede um código da app.");
    } catch (err) {
      showToast(err.response?.data?.erro || "Código inválido.", "error");
    } finally {
      setAProcessar(false);
    }
  };

  const desactivar = async (e) => {
    e.preventDefault();
    if (codigo.length !== 6) return showToast("Introduza os 6 dígitos da app para confirmar.", "warn");
    setAProcessar(true);
    try {
      await api.post("/2fa/desativar", { codigo });
      setAtivado(false);
      setADesactivar(false);
      setCodigo("");
      onUpdateUsuario?.({ "2fa_ativado": false });
      showToast("2FA desactivado.", "warn");
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

  return (
    <>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "" })} />

      <div className="space-y-8 animate-fade-in max-w-3xl">
        <section className="relative overflow-hidden rounded-[32px] text-white p-9"
          style={{ background: "linear-gradient(135deg, var(--color-navy-abyss), var(--color-navy-deep), var(--color-navy-mid))", boxShadow: "0 24px 80px rgba(var(--color-navy-abyss-rgb),0.45)" }}>
          <p className="text-[10px] font-bold uppercase mb-2" style={{ letterSpacing: "0.4em", opacity: 0.6 }}>Conta de {usuarioLogado?.nome?.split(" ")[0]}</p>
          <h1 style={{ fontSize: "clamp(1.6rem,3vw,2.2rem)", fontWeight: 900, lineHeight: 1.1 }}>Segurança</h1>
          <p className="mt-2" style={{ fontSize: 14, opacity: 0.8, maxWidth: 520 }}>
            A autenticação de dois factores pede um código temporário da sua app de autenticação sempre que entra — mesmo que alguém descubra a sua palavra-passe, não consegue entrar sem o seu telemóvel.
          </p>
        </section>

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
            aDesactivar ? (
              <form onSubmit={desactivar} className="space-y-4">
                <p style={{ fontSize: 13.5, color: "var(--text-body)" }}>Para desactivar, confirme com o código actual da app.</p>
                <CampoCodigo valor={codigo} onChange={setCodigo} autoFocus />
                <div className="flex justify-end gap-2">
                  <BotaoSecundario type="button" onClick={() => { setADesactivar(false); setCodigo(""); }}>Cancelar</BotaoSecundario>
                  <BotaoPrimario type="submit" loading={aProcessar} style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", boxShadow: "0 6px 20px rgba(239,68,68,0.35)" }}>
                    <ShieldOff size={15} /> Desactivar 2FA
                  </BotaoPrimario>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p style={{ fontSize: 13.5, color: "var(--text-body)", maxWidth: 420 }}>
                  Se trocar de telemóvel, desactive o 2FA antes e volte a activá-lo no novo aparelho.
                </p>
                <BotaoSecundario type="button" onClick={() => setADesactivar(true)}><ShieldOff size={15} /> Desactivar</BotaoSecundario>
              </div>
            )
          ) : !setup ? (
            <div className="space-y-5">
              <ol className="space-y-2.5" style={{ fontSize: 13.5, color: "var(--text-body)" }}>
                {[
                  ["Instale uma app de autenticação", "Google Authenticator, Microsoft Authenticator, Authy ou semelhante."],
                  ["Leia o código QR", "Ou introduza a chave manualmente na app."],
                  ["Confirme com o código de 6 dígitos", "A app gera um código novo a cada 30 segundos."],
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
            <form onSubmit={confirmar} className="grid gap-6 md:grid-cols-[220px_1fr]">
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
                  <CampoCodigo valor={codigo} onChange={setCodigo} autoFocus />
                </div>
                <div className="flex justify-end gap-2">
                  <BotaoSecundario type="button" onClick={() => { setSetup(null); setCodigo(""); }}>Cancelar</BotaoSecundario>
                  <BotaoPrimario type="submit" loading={aProcessar} disabled={codigo.length !== 6}><Lock size={15} /> Confirmar e activar</BotaoPrimario>
                </div>
              </div>
            </form>
          )}
        </Cartao>
      </div>
    </>
  );
};

export default Seguranca;
