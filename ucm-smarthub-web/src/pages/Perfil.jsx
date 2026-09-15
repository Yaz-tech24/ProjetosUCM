import React, { useState } from "react";
import api from "../services/api";
import {
  User, Mail, GraduationCap, ShieldCheck, Lock, Upload, Trash2,
  Save, KeyRound, IdCard, Phone,
} from "lucide-react";
import { useConfig } from "../context/ConfigContext";
import Toast from "../components/Toast";
import { Cartao, Campo, BotaoPrimario } from "../components/ui";
import Reputacao from "../components/Reputacao";
import Subscricoes from "../components/Subscricoes";

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

        {/* ═══ COMUNIDADE ═════════════════════════════════════ */}
        <Reputacao usuarioId={usuarioLogado.id} />
        <Subscricoes />

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
