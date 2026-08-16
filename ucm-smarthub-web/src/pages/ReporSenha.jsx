import React, { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import api from "../services/api";
import { BookOpen, Lock, ArrowRight, CheckCircle, AlertCircle, ArrowLeft } from "lucide-react";
import { useConfig } from "../context/ConfigContext";

const ReporSenha = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { config } = useConfig();
  const token = searchParams.get("token") || "";

  const [novaSenha, setNovaSenha]   = useState("");
  const [confirmar, setConfirmar]   = useState("");
  const [loading, setLoading]       = useState(false);
  const [sucesso, setSucesso]       = useState(false);
  const [mensagem, setMensagem]     = useState({ texto: "", tipo: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensagem({ texto: "", tipo: "" });

    if (novaSenha !== confirmar) {
      setMensagem({ texto: "As palavras-passe não coincidem.", tipo: "erro" });
      return;
    }

    setLoading(true);
    try {
      await api.post("/repor-senha", { token, novaSenha });
      setSucesso(true);
    } catch (err) {
      setMensagem({ texto: err.response?.data?.erro || "Erro ao repor a palavra-passe.", tipo: "erro" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        background: `
          radial-gradient(ellipse at 8%  8%,  rgba(var(--color-gold-rgb),.07)   0%, transparent 35%),
          radial-gradient(ellipse at 92% 92%, rgba(0,51,102,.07)    0%, transparent 35%),
          var(--color-ice)
        `,
        padding: "2rem",
      }}
    >
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div style={{
            width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center",
            background: "linear-gradient(135deg,var(--color-navy-mid),var(--color-navy))", color: "var(--color-gold)",
            boxShadow: "0 4px 16px rgba(var(--color-navy-mid-rgb),.35)",
          }}>
            {config.logo_url
              ? <img src={config.logo_url} alt={config.nome_plataforma} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 14 }} />
              : <BookOpen size={21} />}
          </div>
          <span style={{ fontSize: 20, fontWeight: 900, color: "var(--text-heading)" }}>{config.nome_plataforma}</span>
        </div>

        <div
          className="rounded-[28px] p-8"
          style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 24px 80px rgba(var(--color-navy-deep-rgb),0.16)" }}
        >
          {!token ? (
            <div className="text-center py-4">
              <AlertCircle size={36} style={{ color: "#ef4444", margin: "0 auto 16px" }} />
              <h2 style={{ fontSize: 18, fontWeight: 900, color: "var(--text-heading)", marginBottom: 8 }}>Link inválido</h2>
              <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24 }}>
                Este link de recuperação está incompleto. Peça um novo através da página de entrada.
              </p>
              <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: "var(--color-navy-mid)" }}>
                <ArrowLeft size={15} /> Voltar à entrada
              </Link>
            </div>
          ) : sucesso ? (
            <div className="text-center py-4">
              <CheckCircle size={36} style={{ color: "#10b981", margin: "0 auto 16px" }} />
              <h2 style={{ fontSize: 18, fontWeight: 900, color: "var(--text-heading)", marginBottom: 8 }}>Palavra-passe reposta!</h2>
              <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24 }}>
                Já pode entrar na sua conta com a nova palavra-passe.
              </p>
              <button
                onClick={() => navigate("/")}
                className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-3.5 text-sm font-black uppercase tracking-[.10em] text-white"
                style={{ background: "linear-gradient(135deg,var(--color-navy-deep) 0%,var(--color-navy-mid) 60%,var(--color-navy-bright) 100%)", boxShadow: "0 8px 32px rgba(var(--color-navy-deep-rgb),.38)" }}
              >
                Ir para a entrada <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "var(--text-heading)", marginBottom: 6 }}>Nova palavra-passe</h2>
              <p style={{ fontSize: 13.5, color: "var(--text-faint)", marginBottom: 24, lineHeight: 1.6 }}>
                Escolha uma nova palavra-passe para a sua conta.
              </p>

              {mensagem.texto && (
                <div className="flex items-start gap-3 rounded-2xl px-4 py-3.5 mb-5 text-sm"
                  style={{ background: "var(--status-danger-bg)", border: "1px solid var(--status-danger-border)", color: "var(--status-danger-text)" }}>
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span style={{ fontWeight: 600 }}>{mensagem.texto}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-faint)" }}>
                    <Lock size={17} />
                  </div>
                  <input
                    type="password" placeholder="Nova palavra-passe" required minLength={6}
                    value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
                    className="w-full rounded-2xl py-4 pl-12 pr-4 text-sm outline-none transition-all duration-200"
                    style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }}
                  />
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-faint)" }}>
                    <Lock size={17} />
                  </div>
                  <input
                    type="password" placeholder="Confirmar palavra-passe" required minLength={6}
                    value={confirmar} onChange={e => setConfirmar(e.target.value)}
                    className="w-full rounded-2xl py-4 pl-12 pr-4 text-sm outline-none transition-all duration-200"
                    style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }}
                  />
                </div>

                <button
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-[14px] text-sm font-black uppercase tracking-[.10em] transition-all duration-250 disabled:opacity-60 mt-1"
                  style={{ background: "linear-gradient(135deg,var(--color-navy-deep) 0%,var(--color-navy-mid) 60%,var(--color-navy-bright) 100%)", color: "#fff", boxShadow: "0 8px 32px rgba(var(--color-navy-deep-rgb),.38)" }}
                >
                  {loading
                    ? <div className="w-5 h-5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
                    : <>Repor palavra-passe <ArrowRight size={17} /></>}
                </button>
              </form>

              <div className="text-center mt-6">
                <Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: "#94a3b8" }}>
                  <ArrowLeft size={13} /> Voltar à entrada
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReporSenha;
