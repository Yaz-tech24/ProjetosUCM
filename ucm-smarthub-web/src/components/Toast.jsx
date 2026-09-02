import React from "react";
import { CheckCircle, AlertTriangle, X } from "lucide-react";

/* Toast de notificação — componente partilhado entre Admin.jsx e Perfil.jsx */
const Toast = ({ message, type, onClose }) => {
  if (!message) return null;
  const cor = type === 'error' ? "#ef4444" : type === 'warn' ? "#f59e0b" : "#10b981";
  return (
    <div
      className="fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-4 animate-fade-in"
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-subtle-strong)",
        borderLeftWidth: 3,
        borderLeftColor: cor,
        color: "var(--text-heading)",
        boxShadow: "0 10px 40px rgba(0,0,0,0.16)",
      }}
    >
      {type === 'success'
        ? <CheckCircle size={18} style={{ color: "#10b981", flexShrink: 0 }} />
        : <AlertTriangle size={18} style={{ color: type === 'warn' ? "#f59e0b" : "#ef4444", flexShrink: 0 }} />
      }
      <span style={{ fontSize: 14, fontWeight: 600 }}>{message}</span>
      <button onClick={onClose} aria-label="Fechar notificação" style={{ opacity: 0.45, marginLeft: 8, color: "var(--text-heading)" }} className="hover:opacity-80 transition-opacity">
        <X size={15} />
      </button>
    </div>
  );
};

export default Toast;
