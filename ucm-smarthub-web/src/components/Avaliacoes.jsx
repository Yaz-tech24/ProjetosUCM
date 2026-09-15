import React, { useState, useEffect, useCallback } from "react";
import { Star, Trash2, MessageSquareQuote } from "lucide-react";
import api from "../services/api";
import Toast from "./Toast";
import { Cartao, BotaoPrimario, BotaoSecundario, Vazio, Spinner, Avatar, formatarData } from "./ui";

const Estrelas = ({ valor, onChange, tamanho = 22, interactivo = false, hover, setHover }) => (
  <div className="inline-flex items-center gap-1" role={interactivo ? "radiogroup" : undefined} aria-label={interactivo ? "Nota" : `${valor} em 5 estrelas`}>
    {[1, 2, 3, 4, 5].map(n => {
      const activa = n <= (hover || valor);
      return (
        <button
          key={n}
          type="button"
          disabled={!interactivo}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => setHover?.(n)}
          onMouseLeave={() => setHover?.(0)}
          aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
          className={`transition-transform ${interactivo ? "cursor-pointer hover:scale-110" : "cursor-default"}`}
          style={{ lineHeight: 0 }}
        >
          <Star size={tamanho} fill={activa ? "var(--color-gold)" : "transparent"} style={{ color: activa ? "var(--color-gold)" : "var(--text-faint)" }} />
        </button>
      );
    })}
  </div>
);

const Avaliacoes = ({ materialId, usuarioId }) => {
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [estatisticas, setEstatisticas] = useState({ media: 0, total: 0, totalPages: 1 });
  const [pagina, setPagina] = useState(1);
  const [minha, setMinha] = useState({ nota: 0, comentario: "" });
  const [tinhaAvaliacao, setTinhaAvaliacao] = useState(false);
  const [hover, setHover] = useState(0);
  const [aCarregar, setACarregar] = useState(true);
  const [aGuardar, setAGuardar] = useState(false);
  const [toast, setToast] = useState({ message: "", type: "" });

  const showToast = (message, type = "success") => setToast({ message, type });

  const carregar = useCallback(async (p = 1) => {
    try {
      const { data } = await api.get(`/materiais/${materialId}/avaliacoes`, { params: { page: p, limit: 5 } });
      setAvaliacoes(prev => (p === 1 ? data.avaliacoes : [...prev, ...data.avaliacoes]));
      setEstatisticas(data.estatisticas);
      setPagina(p);
    } catch {
      showToast("Não foi possível carregar as avaliações.", "error");
    } finally {
      setACarregar(false);
    }
  }, [materialId]);

  const carregarMinha = useCallback(async () => {
    try {
      const { data } = await api.get(`/materiais/${materialId}/minha-avaliacao`);
      setMinha({ nota: data.nota, comentario: data.comentario || "" });
      setTinhaAvaliacao(true);
    } catch {
      setTinhaAvaliacao(false);
    }
  }, [materialId]);

  useEffect(() => {
    setACarregar(true);
    carregar(1);
    if (usuarioId) carregarMinha();
  }, [carregar, carregarMinha, usuarioId]);

  const submeter = async (e) => {
    e.preventDefault();
    if (minha.nota === 0) return showToast("Escolha uma nota de 1 a 5 estrelas.", "warn");
    setAGuardar(true);
    try {
      await api.post(`/materiais/${materialId}/avaliacoes`, { nota: minha.nota, comentario: minha.comentario });
      showToast(tinhaAvaliacao ? "Avaliação actualizada." : "Obrigado pela sua avaliação!");
      setTinhaAvaliacao(true);
      carregar(1);
    } catch (err) {
      showToast(err.response?.data?.erro || "Erro ao registar a avaliação.", "error");
    } finally {
      setAGuardar(false);
    }
  };

  const remover = async () => {
    try {
      await api.delete(`/materiais/${materialId}/avaliacoes`);
      setMinha({ nota: 0, comentario: "" });
      setTinhaAvaliacao(false);
      showToast("Avaliação removida.");
      carregar(1);
    } catch (err) {
      showToast(err.response?.data?.erro || "Erro ao remover a avaliação.", "error");
    }
  };

  const media = Number(estatisticas.media) || 0;

  return (
    <>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "" })} />
      <Cartao
        icon={Star}
        titulo="Avaliações"
        subtitulo={estatisticas.total > 0 ? `${estatisticas.total} avaliação${estatisticas.total > 1 ? "ões" : ""}` : "Seja o primeiro a avaliar este material"}
        accao={estatisticas.total > 0 && (
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 26, fontWeight: 900, color: "var(--text-heading)", lineHeight: 1 }}>{media.toFixed(1)}</span>
            <Estrelas valor={Math.round(media)} tamanho={16} />
          </div>
        )}
      >
        {usuarioId && (
          <form onSubmit={submeter} className="rounded-2xl p-5 mb-6" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)" }}>
            <p className="mb-3 text-xs font-bold uppercase" style={{ letterSpacing: "0.10em", color: "var(--text-muted)" }}>
              {tinhaAvaliacao ? "A sua avaliação" : "Avalie este material"}
            </p>
            <div className="flex flex-wrap items-center gap-4 mb-3">
              <Estrelas valor={minha.nota} onChange={n => setMinha(m => ({ ...m, nota: n }))} interactivo hover={hover} setHover={setHover} tamanho={28} />
              <span style={{ fontSize: 13, color: "var(--text-faint)" }}>
                {["", "Fraco", "Razoável", "Bom", "Muito bom", "Excelente"][hover || minha.nota] || "Toque nas estrelas"}
              </span>
            </div>
            <textarea
              value={minha.comentario}
              onChange={e => setMinha(m => ({ ...m, comentario: e.target.value.slice(0, 500) }))}
              placeholder="Comentário opcional (até 500 caracteres)"
              rows={2}
              className="w-full rounded-2xl px-4 py-3 text-sm outline-none resize-y"
              style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }}
            />
            <div className="flex items-center justify-between gap-3 mt-3">
              <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{minha.comentario.length}/500</span>
              <div className="flex gap-2">
                {tinhaAvaliacao && (
                  <BotaoSecundario type="button" onClick={remover}><Trash2 size={15} /> Remover</BotaoSecundario>
                )}
                <BotaoPrimario type="submit" loading={aGuardar}>
                  <Star size={15} /> {tinhaAvaliacao ? "Actualizar" : "Avaliar"}
                </BotaoPrimario>
              </div>
            </div>
          </form>
        )}

        {aCarregar ? <Spinner /> : avaliacoes.length === 0 ? (
          <Vazio icon={MessageSquareQuote}>Ainda não há avaliações.</Vazio>
        ) : (
          <ul className="space-y-3">
            {avaliacoes.map(a => (
              <li key={a.id} className="flex gap-3 rounded-2xl p-4" style={{ border: "1px solid var(--border-subtle)" }}>
                <Avatar nome={a.usuario} url={a.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-heading)" }}>{a.usuario}</span>
                    <Estrelas valor={a.nota} tamanho={14} />
                    <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{formatarData(a.data_criacao)}</span>
                  </div>
                  {a.comentario && <p className="mt-1.5" style={{ fontSize: 13.5, color: "var(--text-body)", lineHeight: 1.6 }}>{a.comentario}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {pagina < (estatisticas.totalPages || 1) && (
          <div className="flex justify-center mt-5">
            <BotaoSecundario type="button" onClick={() => carregar(pagina + 1)}>Carregar mais</BotaoSecundario>
          </div>
        )}
      </Cartao>
    </>
  );
};

export default Avaliacoes;
