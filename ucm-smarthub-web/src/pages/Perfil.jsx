import React, { useState, useEffect } from "react";
import api from "../services/api";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  User, Mail, GraduationCap, ShieldCheck, Lock, Upload, Trash2,
  Save, KeyRound, IdCard, Phone, AlertTriangle, UserX, Newspaper,
} from "lucide-react";
import { useConfig } from "../context/ConfigContext";
import Toast from "../components/Toast";
import { Cartao, Campo, BotaoPrimario, BotaoSecundario } from "../components/ui";
import ConfirmModal from "../components/ConfirmModal";
import Reputacao from "../components/Reputacao";
import Subscricoes from "../components/Subscricoes";
import EstatisticasEstudo from "../components/EstatisticasEstudo";
import Conquistas from "../components/Conquistas";

const Perfil = ({ usuarioLogado, onUpdateUsuario, onLogout }) => {
  const { config } = useConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [digest, setDigest] = useState(usuarioLogado?.digest_semanal !== false);
  const [aGuardarDigest, setAGuardarDigest] = useState(false);
  const [eliminarAberto, setEliminarAberto] = useState(false);

  /* Link directo a uma secção (ex: notificação de conquista → /perfil?sep=conquistas) */
  useEffect(() => {
    const sep = searchParams.get("sep");
    if (sep) setTimeout(() => document.getElementById(`perfil-${sep}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }, [searchParams]);

  const alternarDigest = async () => {
    const novo = !digest;
    setAGuardarDigest(true);
    try {
      await api.put("/perfil/preferencias", { digest_semanal: novo });
      setDigest(novo);
      onUpdateUsuario({ digest_semanal: novo });
      showToast(novo ? "Resumo semanal activado." : "Resumo semanal desligado.");
    } catch (err) {
      showToast(err.response?.data?.erro || "Não foi possível guardar.", "error");
    } finally {
      setAGuardarDigest(false);
    }
  };
  const [senhaEliminar, setSenhaEliminar] = useState("");
  const [codigoEliminar, setCodigoEliminar] = useState("");
  const [confirmarEliminar, setConfirmarEliminar] = useState("");
  const [aEliminar, setAEliminar] = useState(false);

  const handleEliminarConta = async () => {
    setConfirmarEliminar("");
    setAEliminar(true);
    try {
      await api.delete("/perfil", { data: { senha: senhaEliminar, codigo: codigoEliminar || undefined } });
      localStorage.removeItem("usuarioLogado");
      onLogout?.();
      navigate("/");
    } catch (err) {
      showToast(err.response?.data?.erro || "Não foi possível eliminar a conta.", "error");
    } finally {
      setAEliminar(false);
    }
  };

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

        {/* ═══ ESTUDO ══════════════════════════════════════════ */}
        <div id="perfil-estudo"><EstatisticasEstudo /></div>
        <div id="perfil-conquistas"><Conquistas usuarioId={usuarioLogado.id} proprio /></div>

        {/* ═══ COMUNIDADE ═════════════════════════════════════ */}
        <Reputacao usuarioId={usuarioLogado.id} />
        <Subscricoes />

        {/* ═══ COMUNICAÇÃO ════════════════════════════════════ */}
        <Cartao icon={Newspaper} titulo="Resumo semanal" subtitulo="Uma vez por semana: materiais novos, perguntas sem resposta e eventos das suas disciplinas">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p style={{ fontSize: 13.5, color: "var(--text-body)", maxWidth: 460, lineHeight: 1.6 }}>
              Chega como notificação na plataforma{config.contacto_email !== undefined ? " e, se o email estiver configurado, também por email" : ""}. Só é enviado quando há novidades nas disciplinas que subscreve.
            </p>
            <button type="button" role="switch" aria-checked={digest} onClick={alternarDigest} disabled={aGuardarDigest}
              className="inline-flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all disabled:opacity-60"
              style={digest ? { background: "var(--status-success-bg)", border: "1px solid var(--status-success-border)", color: "var(--status-success-text)" } : { background: "var(--surface-hover)", border: "1px solid var(--border-subtle-strong)", color: "var(--text-muted)" }}>
              <span className="relative inline-block w-10 h-6 rounded-full transition-colors" style={{ background: digest ? "var(--status-success-text)" : "var(--border-subtle-strong)" }}>
                <span className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all" style={{ left: digest ? 22 : 4 }} />
              </span>
              {digest ? "Activado" : "Desligado"}
            </button>
          </div>
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

        {/* ═══ ZONA DE PERIGO ═════════════════════════════════ */}
        <Cartao icon={UserX} titulo="Eliminar a conta" subtitulo="Os materiais, comentários e perguntas que publicou ficam na plataforma como “Conta eliminada”; tudo o resto é apagado">
          {!eliminarAberto ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p style={{ fontSize: 13.5, color: "var(--text-body)", maxWidth: 460 }}>
                Esta acção é definitiva. Favoritos, colecções, subscrições, reputação e sessões desaparecem; não há forma de recuperar a conta depois.
              </p>
              <BotaoSecundario type="button" onClick={() => setEliminarAberto(true)} style={{ color: "var(--status-danger-text)", borderColor: "var(--status-danger-border)" }}>
                <Trash2 size={15} /> Quero eliminar a conta
              </BotaoSecundario>
            </div>
          ) : (
            <form onSubmit={e => { e.preventDefault(); setConfirmarEliminar("Eliminar a conta definitivamente? Não há volta atrás."); }} className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl p-4" style={{ background: "var(--status-danger-bg)", border: "1px solid var(--status-danger-border)" }}>
                <AlertTriangle size={18} style={{ color: "var(--status-danger-text)", flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 13, color: "var(--status-danger-text)", lineHeight: 1.6 }}>
                  Confirme a palavra-passe{usuarioLogado?.["2fa_ativado"] ? " e um código 2FA (da app ou de recuperação)" : ""} para continuar.
                </p>
              </div>
              <Campo label="Palavra-passe" icon={<KeyRound size={16} />} type="password" value={senhaEliminar} onChange={e => setSenhaEliminar(e.target.value)} required autoComplete="current-password" />
              {usuarioLogado?.["2fa_ativado"] && (
                <Campo label="Código 2FA" icon={<ShieldCheck size={16} />} type="text" value={codigoEliminar} onChange={e => setCodigoEliminar(e.target.value)} required autoComplete="one-time-code" placeholder="000000 ou XXXX-XXXX" />
              )}
              <div className="flex justify-end gap-2">
                <BotaoSecundario type="button" onClick={() => { setEliminarAberto(false); setSenhaEliminar(""); setCodigoEliminar(""); }}>Cancelar</BotaoSecundario>
                <BotaoPrimario type="submit" loading={aEliminar} disabled={!senhaEliminar} style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", boxShadow: "0 6px 20px rgba(239,68,68,0.35)" }}>
                  <Trash2 size={15} /> Eliminar definitivamente
                </BotaoPrimario>
              </div>
            </form>
          )}
        </Cartao>

      </div>
      <ConfirmModal message={confirmarEliminar} onConfirm={handleEliminarConta} onCancel={() => setConfirmarEliminar("")} />
    </>
  );
};

export default Perfil;
