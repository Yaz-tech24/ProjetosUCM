import React, { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

/* Modal de confirmação partilhado (Admin, comentários, subscrições, 2FA) */
const ConfirmModal = ({ message, onConfirm, onCancel }) => {
  const cancelBtnRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  /* Foca o botão "Cancelar" ao abrir e permite fechar com Escape. */
  useEffect(() => {
    if (!message) return;
    cancelBtnRef.current?.focus();
    const handleKeyDown = (e) => { if (e.key === 'Escape') onCancelRef.current(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [message]);

  if (!message) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(var(--color-navy-abyss-rgb),0.55)", backdropFilter: "blur(8px)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="w-full max-w-sm rounded-[28px] p-8 animate-scale-in"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 30px 90px rgba(var(--color-navy-deep-rgb),0.30)",
        }}
      >
        <div
          className="w-16 h-16 rounded-[20px] grid place-items-center mx-auto mb-5"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)" }}
        >
          <AlertTriangle size={30} style={{ color: "#ef4444" }} />
        </div>
        <h3 id="confirm-modal-title" style={{ fontSize: 18, fontWeight: 900, color: "var(--text-heading)", textAlign: "center", marginBottom: 8 }}>
          Confirmar acção
        </h3>
        <p style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.65, marginBottom: 28 }}>
          {message}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            ref={cancelBtnRef}
            onClick={onCancel}
            className="rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-200"
            style={{ background: "var(--surface-hover)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-body)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-ice-mid)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--surface-hover)")}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="rounded-2xl px-5 py-3 text-sm font-bold text-white transition-all duration-200"
            style={{
              background: "linear-gradient(135deg, #dc2626, #ef4444)",
              boxShadow: "0 6px 20px rgba(239,68,68,0.35)",
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)", e.currentTarget.style.boxShadow = "0 8px 28px rgba(239,68,68,0.50)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 6px 20px rgba(239,68,68,0.35)")}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
