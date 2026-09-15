/* eslint-disable react-refresh/only-export-components -- primitivas + utilitários de formatação no mesmo módulo */
import React from "react";

/* Primitivas de UI partilhadas pelas páginas de perfil, segurança, analytics
   e pelos componentes de comunidade — mantêm todos no mesmo sistema visual. */

export const Cartao = ({ icon: Icon, titulo, subtitulo, accao, children }) => (
  <section
    className="rounded-[28px] p-7 animate-fade-in"
    style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 24px rgba(var(--color-navy-mid-rgb),0.06)" }}
  >
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <div className="w-11 h-11 rounded-2xl grid place-items-center shrink-0"
        style={{ background: "rgba(var(--color-navy-mid-rgb),0.07)", border: "1px solid var(--border-subtle-strong)" }}>
        <Icon size={19} style={{ color: "var(--text-accent)" }} />
      </div>
      {/* basis-48: o título reserva ~12rem; se a acção não couber ao lado, desce para a linha seguinte */}
      <div className="min-w-0 flex-1 basis-48">
        <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--text-heading)" }}>{titulo}</h3>
        {subtitulo && <p style={{ fontSize: 12.5, color: "var(--text-faint)" }}>{subtitulo}</p>}
      </div>
      {accao && <div className="shrink-0 ml-auto">{accao}</div>}
    </div>
    {children}
  </section>
);

/* Dentro de um painel com separadores, o cartão completo (ícone + título)
   repetiria o rótulo do separador — fica só a linha de subtítulo/acção. */
export const CartaoOuSeccao = ({ embutido, icon, titulo, subtitulo, accao, children }) => (
  embutido ? (
    <div>
      {(subtitulo || accao) && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <p style={{ fontSize: 13, color: "var(--text-faint)" }}>{subtitulo}</p>
          {accao && <div className="shrink-0">{accao}</div>}
        </div>
      )}
      {children}
    </div>
  ) : (
    <Cartao icon={icon} titulo={titulo} subtitulo={subtitulo} accao={accao}>{children}</Cartao>
  )
);

export const Campo = ({ label, icon, hint, ...props }) => (
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

export const BotaoPrimario = ({ loading, children, ...props }) => (
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

export const BotaoSecundario = ({ children, ...props }) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-200 disabled:opacity-60 ${props.className || ""}`}
    style={{ background: "var(--surface-hover)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-body)", ...(props.style || {}) }}
    onMouseEnter={e => (e.currentTarget.style.background = "var(--color-ice-mid)")}
    onMouseLeave={e => (e.currentTarget.style.background = "var(--surface-hover)")}
  >
    {children}
  </button>
);

export const Etiqueta = ({ children }) => (
  <span className="block mb-2 text-xs font-bold uppercase" style={{ letterSpacing: "0.10em", color: "var(--text-muted)" }}>{children}</span>
);

export const Vazio = ({ icon: Icon, children }) => (
  <div className="text-center py-10">
    {Icon && <Icon size={28} className="mx-auto mb-3" style={{ color: "var(--text-faint)" }} />}
    <p style={{ fontSize: 13.5, color: "var(--text-faint)" }}>{children}</p>
  </div>
);

export const Spinner = ({ label = "A carregar..." }) => (
  <div className="flex items-center justify-center gap-3 py-8">
    <div className="w-6 h-6 rounded-full border-[3px] animate-spin" style={{ borderColor: "rgba(var(--color-navy-mid-rgb),0.12)", borderTopColor: "var(--color-gold)" }} />
    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-faint)" }}>{label}</span>
  </div>
);

export const Avatar = ({ nome, url, tamanho = 36 }) => (
  <div className="rounded-full overflow-hidden grid place-items-center shrink-0 font-black text-white"
    style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.4, background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))" }}>
    {url ? <img src={url} alt={nome} className="w-full h-full object-cover" /> : (nome?.charAt(0).toUpperCase() || "U")}
  </div>
);

export const formatarData = (valor) => {
  if (!valor) return "";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
};
