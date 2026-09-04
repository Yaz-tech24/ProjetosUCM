import React, { useState } from "react";
import api from "../services/api";
import {
  User, Mail, GraduationCap, ShieldCheck, Lock, Upload, Trash2,
  Save, KeyRound, IdCard, Phone,
} from "lucide-react";
import { useConfig } from "../context/ConfigContext";
import Toast from "../components/Toast";

/* Cartão base reutilizado nas 3 secções */
const Cartao = ({ icon: Icon, titulo, subtitulo, children }) => (
  <section
    className="rounded-[28px] p-7 animate-fade-in"
    style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 24px rgba(var(--color-navy-mid-rgb),0.06)" }}
  >
    <div className="flex items-center gap-3 mb-6">
      <div className="w-11 h-11 rounded-2xl grid place-items-center shrink-0"
        style={{ background: "rgba(var(--color-navy-mid-rgb),0.07)", border: "1px solid var(--border-subtle-strong)" }}>
        <Icon size={19} style={{ color: "var(--text-accent)" }} />
      </div>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--text-heading)" }}>{titulo}</h3>
        {subtitulo && <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>{subtitulo}</p>}
      </div>
    </div>
    {children}
  </section>
);

const Campo = ({ label, icon, hint, ...props }) => (
  <label className="block">
    <span className="block mb-2 text-xs font-bold uppercase" style={{ letterSpacing: "0.10em", color: "var(--text-muted)" }}>{label}</span>
    <div className="relative">
      {icon && (
        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-faint)" }}>{icon}</div>
      )}
      <input
        {...props}
        className={`w-full rounded-2xl py-3.5 ${icon ? 'pl-12' : 'pl-4'} pr-4 text-sm outline-none transition-all duration-200`}
        style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)", opacity: props.disabled ? 0.6 : 1 }}
        onFocus={e => !props.disabled && (e.target.style.borderColor = "var(--color-navy-mid)", e.target.style.boxShadow = "0 0 0 4px rgba(var(--color-navy-mid-rgb),0.08)")}
        onBlur={e => (e.target.style.borderColor = "var(--border-subtle-strong)", e.target.style.boxShadow = "")}
      />
    </div>
    {hint && <span className="block mt-1.5" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{hint}</span>}
  </label>
);

const BotaoPrimario = ({ loading, children, ...props }) => (
  <button
    {...props}
    disabled={loading || props.disabled}
    className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold text-white transition-all duration-200 disabled:opacity-60"
    style={{ background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", boxShadow: "0 6px 24px rgba(var(--color-navy-deep-rgb),0.30)" }}
    onMouseEnter={e => !loading && (e.currentTarget.style.transform = "translateY(-1px)")}
    onMouseLeave={e => (e.currentTarget.style.transform = "")}
  >
    {loading ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : children}
  </button>
);

const Perfil = ({ usuarioLogado, onUpdateUsuario }) => {
  const { config } = useConfig();

  const [nome, setNome]           = useState(usuarioLogado?.nome || "");
  const [numeroEstudante, setNumeroEstudante] = useState(usuarioLogado?.numero_estudante || "");
  const [telefone, setTelefone]   = useState(usuarioLogado?.telefone || "");
  const [savingNome, setSavingNome] = useState(false);

  const [senhaActual, setSenhaActual] = useState("");
  const [novaSenha, setNovaSenha]     = useState("");
  const [savingSenha, setSavingSenha] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);

  const [toast, setToast] = useState({ message: "", type: "" });
  const showToast = (message, type = "success") => setToast({ message, type });

  const handleSalvarNome = async (e) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setSavingNome(true);
    try {
      const res = await api.put("/perfil", { nome: nome.trim(), numero_estudante: numeroEstudante, telefone });
      onUpdateUsuario(res.data.utilizador);
      showToast("Dados actualizados com sucesso!");
    } catch (err) {
      showToast(err.response?.data?.erro || "Erro ao actualizar os dados.", "error");
    } finally {
      setSavingNome(false);
    }
  };

  const handleMudarSenha = async (e) => {
    e.preventDefault();
    setSavingSenha(true);
    try {
      await api.put("/perfil/senha", { senha_actual: senhaActual, nova_senha: novaSenha });
      setSenhaActual("");
      setNovaSenha("");
      showToast("Palavra-passe alterada com sucesso!");
    } catch (err) {
      showToast(err.response?.data?.erro || "Erro ao alterar a palavra-passe.", "error");
    } finally {
      setSavingSenha(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await api.post("/perfil/avatar", formData, { headers: { "Content-Type": "multipart/form-data" } });
      onUpdateUsuario({ ...usuarioLogado, avatar_url: res.data.avatar_url });
      showToast("Avatar actualizado!");
    } catch (err) {
      showToast(err.response?.data?.erro || "Erro ao enviar avatar.", "error");
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoverAvatar = async () => {
    try {
      await api.delete("/perfil/avatar");
      onUpdateUsuario({ ...usuarioLogado, avatar_url: null });
      showToast("Avatar removido.");
    } catch {
      showToast("Erro ao remover avatar.", "error");
    }
  };

  return (
    <>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "" })} />

      <div className="space-y-8 animate-fade-in max-w-3xl">

        {/* ═══ HEADER HERO ═══════════════════════════════════ */}
        <section
          className="relative overflow-hidden rounded-[32px] text-white"
          style={{
            background: "linear-gradient(-45deg, var(--color-navy-abyss), var(--color-navy-deep), var(--color-navy), var(--color-navy-mid))",
            backgroundSize: "400% 400%",
            animation: "aurora-perfil 10s ease infinite",
            boxShadow: "0 24px 80px rgba(var(--color-navy-abyss-rgb),0.50)",
            padding: "2.8rem",
          }}
        >
          <style>{`
            @keyframes aurora-perfil {
              0%,100% { background-position: 0%   50%; }
              50%      { background-position: 100% 50%; }
            }
          `}</style>
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }} />

          <div className="relative flex items-center gap-6">
            <div className="relative shrink-0">
              <div
                className="w-24 h-24 rounded-[28px] grid place-items-center overflow-hidden text-3xl font-black"
                style={{
                  background: usuarioLogado.avatar_url ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,var(--color-gold-dark),var(--color-gold),var(--color-gold-light))",
                  color: "var(--color-navy-deep)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  boxShadow: "0 10px 36px rgba(0,0,0,0.30)",
                }}
              >
                {usuarioLogado.avatar_url
                  ? <img src={usuarioLogado.avatar_url} alt={usuarioLogado.nome} className="w-full h-full object-cover" />
                  : usuarioLogado.nome?.charAt(0).toUpperCase() || 'U'}
              </div>
              <label
                className="absolute -bottom-2 -right-2 w-9 h-9 rounded-xl grid place-items-center cursor-pointer transition-transform duration-200"
                style={{ background: "var(--color-gold)", color: "var(--color-navy-deep)", boxShadow: "0 4px 14px rgba(0,0,0,0.35)" }}
                title="Alterar avatar"
                onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.10)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "")}
              >
                {avatarUploading
                  ? <div className="w-4 h-4 rounded-full border-2 border-navy-900/30 border-t-transparent animate-spin" />
                  : <Upload size={15} />}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarUpload} disabled={avatarUploading} className="hidden" />
              </label>
            </div>

            <div className="min-w-0 flex-1">
              <p className="mb-1.5 text-[11px] font-bold uppercase" style={{ letterSpacing: "0.4em", color: "rgba(var(--color-gold-rgb),0.65)" }}>
                O meu perfil
              </p>
              <h1 className="truncate" style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em" }}>{usuarioLogado.nome}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
                  style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)" }}>
                  <ShieldCheck size={13} /> {usuarioLogado.papel}
                </span>
                {usuarioLogado.curso && (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
                    style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)" }}>
                    <GraduationCap size={13} /> {usuarioLogado.curso}
                  </span>
                )}
              </div>
              {usuarioLogado.avatar_url && (
                <button onClick={handleRemoverAvatar} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold transition-colors"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#fca5a5")}
                  onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
                >
                  <Trash2 size={12} /> Remover avatar
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ═══ INFORMAÇÕES PESSOAIS ══════════════════════════ */}
        <Cartao icon={User} titulo="Informações pessoais" subtitulo={`A gerir a conta em ${config.nome_plataforma}`}>
          <form onSubmit={handleSalvarNome} className="space-y-4">
            <Campo label="Nome completo" icon={<User size={16} />} type="text" value={nome} onChange={e => setNome(e.target.value)} required />
            <Campo label="Email" icon={<Mail size={16} />} type="email" value={usuarioLogado.email} disabled readOnly />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Número de estudante" icon={<IdCard size={16} />} type="text" value={numeroEstudante} onChange={e => setNumeroEstudante(e.target.value)} />
              <Campo label="Telefone" icon={<Phone size={16} />} type="tel" value={telefone} onChange={e => setTelefone(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <BotaoPrimario type="submit" loading={savingNome}>
                <Save size={16} /> Guardar alterações
              </BotaoPrimario>
            </div>
          </form>
        </Cartao>

        {/* ═══ SEGURANÇA ══════════════════════════════════════ */}
        <Cartao icon={Lock} titulo="Segurança" subtitulo="Altere a sua palavra-passe periodicamente">
          <form onSubmit={handleMudarSenha} className="space-y-4">
            <Campo label="Palavra-passe actual" icon={<KeyRound size={16} />} type="password" value={senhaActual} onChange={e => setSenhaActual(e.target.value)} required />
            <Campo label="Nova palavra-passe" icon={<Lock size={16} />} type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} minLength={8} required
              hint="Mínimo 8 caracteres, com pelo menos uma letra e um número." />
            <div className="flex justify-end">
              <BotaoPrimario type="submit" loading={savingSenha}>
                <Lock size={16} /> Alterar palavra-passe
              </BotaoPrimario>
            </div>
          </form>
        </Cartao>

      </div>
    </>
  );
};

export default Perfil;
