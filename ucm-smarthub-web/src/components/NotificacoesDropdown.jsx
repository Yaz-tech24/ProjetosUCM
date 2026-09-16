import React, { useState, useEffect, useRef, useCallback } from "react";
import { adquirirSocket, libertarSocket } from "../services/socket";
import { Bell, X, CheckCheck, MessageCircle, ShieldAlert, FileCheck, CalendarDays, Flag, Award, BellRing, Trash2, Trophy, HandHelping, Newspaper, Activity, PackageCheck } from "lucide-react";
import api from "../services/api";

const ICONES = {
  moderacao: FileCheck, comentario: MessageCircle, resposta: MessageCircle, resposta_aceite: Award,
  novo_material: BellRing, calendario: CalendarDays, lembrete: CalendarDays, denuncia: Flag,
  denuncia_fechada: Flag, seguranca: ShieldAlert,
  conquista: Trophy, pedido: HandHelping, pedido_atendido: PackageCheck, digest: Newspaper, sistema: Activity,
};

const tempoRelativo = (valor) => {
  const diff = (Date.now() - new Date(valor).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d`;
  return new Date(valor).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
};

// Sino do cabeçalho: contador de não lidas, lista com marcar-como-lida, e
// ligação Socket.IO à sala pessoal para receber novas em tempo real.
const NotificacoesDropdown = ({ navigate }) => {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aCarregar, setACarregar] = useState(false);
  const [pagina, setPagina] = useState({ page: 1, totalPages: 1 });
  const ref = useRef(null);

  const carregar = useCallback(async (page = 1) => {
    setACarregar(page === 1);
    try {
      const { data } = await api.get("/notificacoes", { params: { page, limit: 15 } });
      setLista(prev => (page === 1 ? data.notificacoes : [...prev, ...data.notificacoes]));
      setNaoLidas(data.nao_lidas);
      setPagina({ page, totalPages: data.pagination.totalPages });
    } catch {
      /* sem rede — mantém o que havia */
    } finally {
      setACarregar(false);
    }
  }, []);

  // Contador ao montar + socket para novas notificações
  useEffect(() => {
    carregar(1);
    const sock = adquirirSocket();
    const aoReceber = (n) => {
      setLista(prev => [n, ...prev].slice(0, 50));
      setNaoLidas(c => c + 1);
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
        try { new Notification(n.titulo, { body: n.mensagem || "", icon: "/icons/icon-192.png" }); } catch { /* browser sem suporte */ }
      }
    };
    sock.on("notificacao", aoReceber);
    return () => { sock.off("notificacao", aoReceber); libertarSocket(); };
  }, [carregar]);

  useEffect(() => {
    if (!aberto) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aberto]);

  const abrir = () => {
    setAberto(v => !v);
    if (!aberto) {
      carregar(1);
      if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    }
  };

  const marcarLida = async (n) => {
    if (!n.lida) {
      setLista(prev => prev.map(x => (x.id === n.id ? { ...x, lida: 1 } : x)));
      setNaoLidas(c => Math.max(0, c - 1));
      api.put(`/notificacoes/${n.id}/lida`).catch(() => {});
    }
    if (n.link) { setAberto(false); navigate(n.link); }
  };

  const marcarTodas = async () => {
    setLista(prev => prev.map(x => ({ ...x, lida: 1 })));
    setNaoLidas(0);
    api.put("/notificacoes/lidas").catch(() => {});
  };

  const apagar = (n, e) => {
    e.stopPropagation();
    setLista(prev => prev.filter(x => x.id !== n.id));
    if (!n.lida) setNaoLidas(c => Math.max(0, c - 1));
    api.delete(`/notificacoes/${n.id}`).catch(() => {});
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={abrir}
        className="relative w-11 h-11 rounded-2xl grid place-items-center transition-all duration-200"
        style={{ background: aberto ? "var(--color-navy-mid)" : "var(--surface-card-glass)", border: "1.5px solid var(--border-subtle-strong)", boxShadow: "0 2px 12px rgba(var(--color-navy-mid-rgb),0.05)", color: aberto ? "var(--color-gold)" : "var(--text-muted)" }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--color-navy-mid)", e.currentTarget.style.color = "var(--color-gold)")}
        onMouseLeave={e => !aberto && (e.currentTarget.style.background = "var(--surface-card-glass)", e.currentTarget.style.color = "var(--text-muted)")}
        title="Notificações"
        aria-label={`Notificações${naoLidas > 0 ? ` (${naoLidas} por ler)` : ""}`}
      >
        <Bell size={18} />
        {naoLidas > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 rounded-full px-1.5 grid place-items-center text-[10.5px] font-black text-white"
            style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", boxShadow: "0 2px 8px rgba(239,68,68,0.5)" }}>
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="fixed inset-x-4 top-36 sm:absolute sm:inset-x-auto sm:right-0 sm:top-14 z-50 sm:w-[380px] rounded-[20px] overflow-hidden animate-scale-in"
          style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle-strong)", boxShadow: "0 20px 60px rgba(var(--color-navy-mid-rgb),0.18)" }}>
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid rgba(var(--color-navy-mid-rgb),0.07)", background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>Notificações{naoLidas > 0 ? ` · ${naoLidas} por ler` : ""}</span>
            <div className="flex items-center gap-1">
              {naoLidas > 0 && (
                <button onClick={marcarTodas} title="Marcar todas como lidas" aria-label="Marcar todas como lidas" style={{ color: "rgba(255,255,255,0.75)", background: "none", border: "none", cursor: "pointer" }} className="p-1">
                  <CheckCheck size={16} />
                </button>
              )}
              <button onClick={() => setAberto(false)} aria-label="Fechar" style={{ color: "rgba(255,255,255,0.50)", background: "none", border: "none", cursor: "pointer" }} className="p-1">
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto py-1">
            {aCarregar && lista.length === 0 ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 rounded-full border-[3px] animate-spin" style={{ borderColor: "rgba(var(--color-navy-mid-rgb),0.10)", borderTopColor: "var(--text-accent)" }} />
              </div>
            ) : lista.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: "var(--text-faint)" }}>Sem notificações. Quando alguém comentar o seu material ou responder à sua pergunta, aparece aqui.</p>
            ) : lista.map(n => {
              const Icone = ICONES[n.tipo] || Bell;
              return (
                <div key={n.id} role="button" tabIndex={0} onClick={() => marcarLida(n)} onKeyDown={e => e.key === "Enter" && marcarLida(n)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left transition-all cursor-pointer"
                  style={{ background: n.lida ? "transparent" : "rgba(var(--color-gold-rgb),0.07)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = n.lida ? "transparent" : "rgba(var(--color-gold-rgb),0.07)")}>
                  <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0 mt-0.5" style={{ background: "rgba(var(--color-navy-mid-rgb),0.07)", border: "1px solid var(--border-subtle-strong)" }}>
                    <Icone size={15} style={{ color: "var(--text-accent)" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: n.lida ? 600 : 800, color: "var(--text-heading)" }}>
                      {!n.lida && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--color-gold)" }} />}
                      <span className="truncate">{n.titulo}</span>
                    </p>
                    {n.mensagem && <p className="line-clamp-2" style={{ fontSize: 12, color: "var(--text-body)", lineHeight: 1.45 }}>{n.mensagem}</p>}
                    <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{tempoRelativo(n.criado_em)}</p>
                  </div>
                  <button onClick={(e) => apagar(n, e)} className="rounded-lg p-1 shrink-0" style={{ color: "var(--text-faint)" }} aria-label="Apagar notificação" title="Apagar">
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
            {pagina.page < pagina.totalPages && (
              <button onClick={() => carregar(pagina.page + 1)} className="w-full py-2.5 text-xs font-bold" style={{ color: "var(--text-accent)" }}>Carregar mais</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificacoesDropdown;
