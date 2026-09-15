import React, { useState, useEffect, useCallback } from "react";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import api from "../services/api";
import Toast from "./Toast";
import ConfirmModal from "./ConfirmModal";
import { Cartao, BotaoPrimario, BotaoSecundario, Vazio, Spinner, Avatar, formatarData } from "./ui";

const LIMITE = 1000;

const Comentarios = ({ materialId, usuarioId, ehAdmin = false }) => {
  const [comentarios, setComentarios] = useState([]);
  const [paginacao, setPaginacao] = useState({ page: 1, totalPages: 1, total: 0 });
  const [novo, setNovo] = useState("");
  const [aCarregar, setACarregar] = useState(true);
  const [aEnviar, setAEnviar] = useState(false);
  const [confirmar, setConfirmar] = useState({ message: "", id: null });
  const [toast, setToast] = useState({ message: "", type: "" });

  const showToast = (message, type = "success") => setToast({ message, type });

  const carregar = useCallback(async (p = 1) => {
    try {
      const { data } = await api.get(`/materiais/${materialId}/comentarios`, { params: { page: p, limit: 10 } });
      setComentarios(prev => (p === 1 ? data.comentarios : [...prev, ...data.comentarios]));
      setPaginacao(data.pagination);
    } catch {
      showToast("Não foi possível carregar os comentários.", "error");
    } finally {
      setACarregar(false);
    }
  }, [materialId]);

  useEffect(() => { setACarregar(true); carregar(1); }, [carregar]);

  const enviar = async (e) => {
    e.preventDefault();
    if (!novo.trim()) return showToast("Escreva algo antes de publicar.", "warn");
    setAEnviar(true);
    try {
      await api.post(`/materiais/${materialId}/comentarios`, { conteudo: novo.trim() });
      setNovo("");
      showToast("Comentário publicado.");
      carregar(1);
    } catch (err) {
      showToast(err.response?.data?.erro || "Erro ao publicar o comentário.", "error");
    } finally {
      setAEnviar(false);
    }
  };

  const confirmarRemocao = async () => {
    const { id } = confirmar;
    setConfirmar({ message: "", id: null });
    try {
      await api.delete(`/comentarios/${id}`);
      setComentarios(prev => prev.filter(c => c.id !== id));
      setPaginacao(p => ({ ...p, total: Math.max(0, p.total - 1) }));
      showToast("Comentário removido.");
    } catch (err) {
      showToast(err.response?.data?.erro || "Erro ao remover o comentário.", "error");
    }
  };

  return (
    <>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "" })} />
      <ConfirmModal message={confirmar.message} onConfirm={confirmarRemocao} onCancel={() => setConfirmar({ message: "", id: null })} />

      <Cartao icon={MessageCircle} titulo="Comentários" subtitulo={paginacao.total > 0 ? `${paginacao.total} comentário${paginacao.total > 1 ? "s" : ""}` : "Partilhe dúvidas ou notas sobre este material"}>
        {usuarioId && (
          <form onSubmit={enviar} className="mb-6">
            <textarea
              value={novo}
              onChange={e => setNovo(e.target.value.slice(0, LIMITE))}
              placeholder="Escreva um comentário..."
              rows={3}
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-y"
              style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }}
              onFocus={e => (e.target.style.borderColor = "var(--color-navy-mid)")}
              onBlur={e => (e.target.style.borderColor = "var(--border-subtle-strong)")}
            />
            <div className="flex items-center justify-between gap-3 mt-3">
              <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{novo.length}/{LIMITE}</span>
              <BotaoPrimario type="submit" loading={aEnviar} disabled={!novo.trim()}>
                <Send size={15} /> Publicar
              </BotaoPrimario>
            </div>
          </form>
        )}

        {aCarregar ? <Spinner /> : comentarios.length === 0 ? (
          <Vazio icon={MessageCircle}>Ainda não há comentários. Seja o primeiro!</Vazio>
        ) : (
          <ul className="space-y-3">
            {comentarios.map(c => {
              const podeRemover = ehAdmin || c.usuario_id === usuarioId;
              return (
                <li key={c.id} className="flex gap-3 rounded-2xl p-4" style={{ border: "1px solid var(--border-subtle)" }}>
                  <Avatar nome={c.usuario} url={c.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-heading)" }}>{c.usuario}</span>
                        <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{formatarData(c.data_criacao)}</span>
                      </div>
                      {podeRemover && (
                        <button
                          type="button"
                          onClick={() => setConfirmar({ message: "Remover este comentário? Esta acção não pode ser desfeita.", id: c.id })}
                          className="rounded-xl p-1.5 transition-colors hover:bg-red-50"
                          style={{ color: "var(--text-faint)" }}
                          aria-label="Remover comentário"
                          title="Remover"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words" style={{ fontSize: 13.5, color: "var(--text-body)", lineHeight: 1.6 }}>{c.conteudo}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {paginacao.page < paginacao.totalPages && (
          <div className="flex justify-center mt-5">
            <BotaoSecundario type="button" onClick={() => carregar(paginacao.page + 1)}>Carregar mais</BotaoSecundario>
          </div>
        )}
      </Cartao>
    </>
  );
};

export default Comentarios;
