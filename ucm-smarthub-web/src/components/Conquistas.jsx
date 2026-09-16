import React, { useState, useEffect } from "react";
import { Trophy, Upload, MessageCircle, BrainCircuit, BookOpen, WifiOff, Layers, Flame, FolderOpen, Gift, StickyNote, Lock } from "lucide-react";
import api from "../services/api";
import { Cartao, Spinner, formatarData } from "./ui";

/* Conquistas (badges) do utilizador: obtidas em cor, por obter a cinzento com
   a barra de progresso. Os critérios são calculados no servidor. */
const ICONES = { upload: Upload, answer: MessageCircle, quiz: BrainCircuit, read: BookOpen, offline: WifiOff, cards: Layers, streak: Flame, folder: FolderOpen, gift: Gift, note: StickyNote };

const Conquistas = ({ usuarioId, proprio = true }) => {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let activo = true;
    const pedido = proprio ? api.get("/perfil/conquistas") : api.get(`/utilizadores/${usuarioId}/conquistas`);
    pedido.then(r => { if (activo) setDados(proprio ? r.data : { conquistas: r.data.map(c => ({ ...c, obtida: true })), obtidas: r.data.length, total: r.data.length }); })
      .catch(() => { if (activo) setErro(true); });
    return () => { activo = false; };
  }, [usuarioId, proprio]);

  return (
    <Cartao icon={Trophy} titulo="Conquistas" subtitulo={dados ? `${dados.obtidas} de ${dados.total} desbloqueadas` : "Emblemas por estudar, partilhar e ajudar"}>
      {erro ? <p style={{ fontSize: 13, color: "var(--text-faint)" }}>Sem dados por agora.</p> : !dados ? <Spinner /> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {dados.conquistas.map(c => {
            const Icon = ICONES[c.icone] || Trophy;
            const pct = c.obtida ? 100 : Math.round(((c.progresso || 0) / c.alvo) * 100);
            return (
              <li key={c.codigo} className="flex items-center gap-3 rounded-2xl p-3.5" title={c.descricao}
                style={{ background: c.obtida ? "rgba(var(--color-gold-rgb),0.10)" : "var(--surface-hover)", border: `1px solid ${c.obtida ? "rgba(var(--color-gold-rgb),0.40)" : "var(--border-subtle)"}`, opacity: c.obtida ? 1 : 0.85 }}>
                <span className="w-11 h-11 rounded-2xl grid place-items-center shrink-0"
                  style={c.obtida ? { background: "linear-gradient(135deg,var(--color-gold-dark),var(--color-gold))", color: "var(--color-navy-deep)", boxShadow: "0 4px 14px rgba(var(--color-gold-rgb),0.35)" } : { background: "var(--surface-card)", border: "1px solid var(--border-subtle-strong)", color: "var(--text-faint)" }}>
                  {c.obtida ? <Icon size={19} /> : <Lock size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate" style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text-heading)" }}>{c.nome}</span>
                  <span className="block" style={{ fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.4 }}>{c.descricao}</span>
                  {c.obtida ? (
                    c.obtida_em && <span className="block mt-1" style={{ fontSize: 10.5, color: "var(--color-gold-dark)", fontWeight: 700 }}>Obtida a {formatarData(c.obtida_em)}</span>
                  ) : (
                    <span className="block mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-subtle-strong)" }} aria-label={`${c.progresso || 0} de ${c.alvo}`}>
                      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: "var(--color-navy-mid)" }} />
                    </span>
                  )}
                </span>
                {!c.obtida && <span className="shrink-0" style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)" }}>{c.progresso || 0}/{c.alvo}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Cartao>
  );
};

export default Conquistas;
