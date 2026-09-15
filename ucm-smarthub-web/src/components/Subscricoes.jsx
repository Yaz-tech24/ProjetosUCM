import React, { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, BellRing, Check } from "lucide-react";
import api from "../services/api";
import Toast from "./Toast";
import { useConfig } from "../context/ConfigContext";
import { Cartao, Vazio, Spinner } from "./ui";

const Subscricoes = () => {
  const { cursos } = useConfig();
  const [subscritas, setSubscritas] = useState(new Set());
  const [aCarregar, setACarregar] = useState(true);
  const [aAlterar, setAAlterar] = useState(null);
  const [toast, setToast] = useState({ message: "", type: "" });

  const showToast = (message, type = "success") => setToast({ message, type });

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get("/subscricoes/minhas-disciplinas");
      setSubscritas(new Set(data.map(s => s.disciplina)));
    } catch {
      showToast("Não foi possível carregar as subscrições.", "error");
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const alternar = async (disciplina) => {
    if (aAlterar) return;
    const estava = subscritas.has(disciplina);
    setAAlterar(disciplina);
    try {
      if (estava) {
        await api.delete(`/subscricoes/disciplinas/${encodeURIComponent(disciplina)}`);
        setSubscritas(prev => { const s = new Set(prev); s.delete(disciplina); return s; });
        showToast(`Deixou de seguir ${disciplina}.`);
      } else {
        await api.post(`/subscricoes/disciplinas/${encodeURIComponent(disciplina)}`);
        setSubscritas(prev => new Set(prev).add(disciplina));
        showToast(`A seguir ${disciplina}. Vai receber um email por cada novo material.`);
      }
    } catch (err) {
      showToast(err.response?.data?.erro || "Erro ao alterar a subscrição.", "error");
    } finally {
      setAAlterar(null);
    }
  };

  return (
    <>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "" })} />
      <Cartao
        icon={BellRing}
        titulo="Disciplinas que sigo"
        subtitulo="Receba um email sempre que for publicado um novo material nas disciplinas escolhidas"
        accao={subscritas.size > 0 && (
          <span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: "rgba(var(--color-gold-rgb),0.18)", color: "var(--color-gold-dark)" }}>
            {subscritas.size} activa{subscritas.size > 1 ? "s" : ""}
          </span>
        )}
      >
        {aCarregar ? <Spinner /> : cursos.length === 0 ? (
          <Vazio icon={BellOff}>Ainda não há disciplinas configuradas.</Vazio>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {cursos.map(c => {
              const activa = subscritas.has(c.nome);
              const ocupada = aAlterar === c.nome;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => alternar(c.nome)}
                  disabled={ocupada}
                  aria-pressed={activa}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-all duration-200 disabled:opacity-60"
                  style={activa ? {
                    background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))",
                    color: "#fff",
                    boxShadow: "0 6px 20px rgba(var(--color-navy-deep-rgb),0.28)",
                  } : {
                    background: "var(--surface-hover)",
                    border: "1.5px solid var(--border-subtle-strong)",
                    color: "var(--text-body)",
                  }}
                >
                  {activa ? <Check size={15} style={{ color: "var(--color-gold)" }} /> : <Bell size={15} />}
                  {c.nome}
                </button>
              );
            })}
          </div>
        )}
      </Cartao>
    </>
  );
};

export default Subscricoes;
