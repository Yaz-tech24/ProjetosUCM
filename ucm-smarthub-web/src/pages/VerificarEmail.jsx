import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MailCheck, MailWarning, Mail, Send, ArrowLeft } from "lucide-react";
import api from "../services/api";
import { useConfig } from "../context/ConfigContext";
import { Campo, BotaoPrimario } from "../components/ui";

// Página pública (fora do Layout): destino do link enviado por email e
// formulário para pedir um novo link.
const VerificarEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { config } = useConfig();
  const token = searchParams.get("token");

  const [estado, setEstado] = useState(token ? "a-verificar" : "pedir"); // a-verificar | sucesso | falhou | pedir
  const [mensagem, setMensagem] = useState("");
  const [email, setEmail] = useState("");
  const [aEnviar, setAEnviar] = useState(false);
  const [enviado, setEnviado] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    api.post("/verificar-email", { token })
      .then(res => {
        if (cancelado) return;
        setEstado("sucesso");
        setMensagem(res.data.mensagem);
        setTimeout(() => navigate("/"), 3000);
      })
      .catch(err => {
        if (cancelado) return;
        setEstado("falhou");
        setMensagem(err.response?.data?.erro || "Link inválido ou expirado.");
      });
    return () => { cancelado = true; };
  }, [token, navigate]);

  const reenviar = async (e) => {
    e.preventDefault();
    setAEnviar(true);
    try {
      const res = await api.post("/reenviar-verificacao-email", { email: email.trim() });
      setEnviado(res.data.mensagem);
    } catch (err) {
      setEnviado(err.response?.data?.erro || "Não foi possível enviar. Tente de novo dentro de alguns minutos.");
    } finally {
      setAEnviar(false);
    }
  };

  const Icone = estado === "sucesso" ? MailCheck : estado === "falhou" ? MailWarning : Mail;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "linear-gradient(135deg, var(--color-navy-abyss), var(--color-navy-deep), var(--color-navy-mid))" }}>
      <div className="w-full max-w-md rounded-[28px] p-8 animate-scale-in"
        style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 30px 90px rgba(var(--color-navy-abyss-rgb),0.45)" }}>
        <div className="w-16 h-16 rounded-[20px] grid place-items-center mx-auto mb-5"
          style={{ background: "rgba(var(--color-gold-rgb),0.14)", border: "1px solid rgba(var(--color-gold-rgb),0.35)" }}>
          <Icone size={30} style={{ color: "var(--color-gold-dark)" }} />
        </div>

        {estado === "a-verificar" && (
          <>
            <h1 className="text-center" style={{ fontSize: 20, fontWeight: 900, color: "var(--text-heading)" }}>A verificar o seu email…</h1>
            <p className="text-center mt-2" style={{ fontSize: 13.5, color: "var(--text-muted)" }}>Só um momento.</p>
          </>
        )}

        {estado === "sucesso" && (
          <>
            <h1 className="text-center" style={{ fontSize: 20, fontWeight: 900, color: "var(--text-heading)" }}>Email confirmado</h1>
            <p className="text-center mt-2" style={{ fontSize: 13.5, color: "var(--text-muted)" }}>{mensagem} A redireccionar para o login…</p>
            <div className="flex justify-center mt-6">
              <BotaoPrimario type="button" onClick={() => navigate("/")}>Entrar agora</BotaoPrimario>
            </div>
          </>
        )}

        {(estado === "falhou" || estado === "pedir") && (
          <>
            <h1 className="text-center" style={{ fontSize: 20, fontWeight: 900, color: "var(--text-heading)" }}>
              {estado === "falhou" ? "Link inválido ou expirado" : "Confirmar o email"}
            </h1>
            <p className="text-center mt-2 mb-6" style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
              {estado === "falhou" ? mensagem + " " : ""}Introduza o email da sua conta em {config.nome_plataforma} para receber um novo link (válido por 24 horas).
            </p>
            {enviado ? (
              <p className="rounded-2xl px-4 py-3 text-center" style={{ fontSize: 13.5, background: "var(--status-success-bg)", color: "var(--status-success-text)", border: "1px solid var(--status-success-border)" }}>{enviado}</p>
            ) : (
              <form onSubmit={reenviar} className="space-y-4">
                <Campo label="Email" icon={<Mail size={16} />} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
                <BotaoPrimario type="submit" loading={aEnviar} className="w-full"><Send size={15} /> Enviar novo link</BotaoPrimario>
              </form>
            )}
          </>
        )}

        <button type="button" onClick={() => navigate("/")} className="mt-6 mx-auto flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--text-faint)" }}>
          <ArrowLeft size={13} /> Voltar ao início
        </button>
      </div>
    </div>
  );
};

export default VerificarEmail;
