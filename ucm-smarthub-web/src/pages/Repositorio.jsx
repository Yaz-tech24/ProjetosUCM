import React, { useState, useEffect, useCallback, useMemo } from "react";
import api, { getFavoritos, toggleFavorito } from "../services/api";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search, Plus, X, ChevronLeft, ChevronRight,
  Upload, BookOpen, PlayCircle, FileText, Filter, Heart, CheckCircle,
} from "lucide-react";
import { useConfig } from "../context/ConfigContext";

/* Card de material com botão de favorito */
const MaterialCard = ({ m, onClick, favs, onToggleFav }) => {
  const isFav = favs.includes(m.id);
  return (
    <article
      className="group relative overflow-hidden rounded-[28px] cursor-pointer transition-all duration-350"
      style={{
        background: "var(--surface-card-glass)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "0 4px 28px rgba(var(--color-navy-mid-rgb),0.07)",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-5px)"; e.currentTarget.style.boxShadow = "0 18px 56px rgba(var(--color-navy-mid-rgb),0.16), 0 0 0 1px rgba(var(--color-gold-rgb),0.14)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 28px rgba(var(--color-navy-mid-rgb),0.07)"; }}
    >
      <div
        className="absolute top-0 inset-x-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ height: 3, background: "linear-gradient(90deg, transparent, var(--color-gold-dark), var(--color-gold), var(--color-gold-light), transparent)" }}
      />

      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold"
            style={m.tipo === 'Vídeo'
              ? { background: "#eff6ff", border: "1px solid #bfdbfe", color: "var(--color-navy-mid)" }
              : { background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }
            }
          >
            {m.tipo === 'Vídeo' ? <PlayCircle size={13} /> : <FileText size={13} />}
            {m.tipo}
          </div>

          {/* Botão de favorito */}
          <button
            onClick={e => { e.stopPropagation(); onToggleFav(m.id); }}
            className="w-9 h-9 rounded-xl grid place-items-center transition-all duration-200"
            style={isFav
              ? { background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }
              : { background: "var(--surface-hover)", border: "1px solid var(--border-subtle-strong)", color: "var(--text-faint)" }
            }
            onMouseEnter={e => !isFav && (e.currentTarget.style.color = "#ef4444", e.currentTarget.style.borderColor = "rgba(239,68,68,0.25)")}
            onMouseLeave={e => !isFav && (e.currentTarget.style.color = "var(--text-faint)", e.currentTarget.style.borderColor = "var(--border-subtle-strong)")}
            title={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          >
            <Heart size={15} fill={isFav ? "#ef4444" : "none"} />
          </button>
        </div>

        <h3
          onClick={onClick}
          className="text-lg font-bold mb-1 leading-snug transition-colors group-hover:text-[var(--color-navy-mid)]"
          style={{ color: "var(--text-heading)" }}
        >
          {m.titulo}
        </h3>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.25em", color: "var(--text-faint)", marginBottom: 12 }}>
          {m.cadeira}
        </p>
        <p style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 20 }}>
          {m.autor} · {new Date(m.data_upload).toLocaleDateString("pt-PT")}
        </p>

        <div
          onClick={onClick}
          className="flex items-center justify-between cursor-pointer"
          style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-navy-mid)", textTransform: "uppercase", letterSpacing: "0.2em" }}>
            Ver mais
          </span>
          <ChevronRight size={15} className="transition-transform group-hover:translate-x-1" style={{ color: "var(--color-navy-mid)" }} />
        </div>
      </div>
    </article>
  );
};

const Repositorio = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { config, cursos } = useConfig();

  /* Estado — inicializado a partir do URL ?q= e ?tipo= */
  const [materiais,       setMateriais]       = useState([]);
  const [filtroCadeira,   setFiltroCadeira]   = useState("Todas");
  const [filtroTipo,      setFiltroTipo]      = useState(searchParams.get('tipo') || "Todos");
  const [buscaTermo,      setBuscaTermo]      = useState(searchParams.get('q') || "");
  const [currentPage,     setCurrentPage]     = useState(1);
  const [totalPages,      setTotalPages]      = useState(1);
  const [totalResultados, setTotalResultados] = useState(0);
  const [loading,         setLoading]         = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newMaterial,     setNewMaterial]     = useState({ titulo: "", cadeira: "", tipo: "PDF" });
  const [arquivoReal,     setArquivoReal]     = useState(null);
  const [uploadErro,      setUploadErro]      = useState('');
  const [uploadSucesso,   setUploadSucesso]   = useState(false);
  const [favs,            setFavs]            = useState(getFavoritos);

  const TIPOS_MATERIAL_DISPONIVEIS = useMemo(() => {
    const tiposPermitidos = (config.tipos_ficheiro_permitidos || '').split(',');
    return [
      ...(tiposPermitidos.includes('pdf') ? ['PDF'] : []),
      ...(['mp4', 'webm', 'ogg', 'mov'].some(t => tiposPermitidos.includes(t)) ? ['Vídeo'] : []),
    ];
  }, [config.tipos_ficheiro_permitidos]);

  const fetchMateriais = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 12 });
      if (buscaTermo.trim())        params.set('busca',   buscaTermo.trim());
      if (filtroTipo !== 'Todos')   params.set('tipo',    filtroTipo);
      if (filtroCadeira !== 'Todas') params.set('cadeira', filtroCadeira);

      const res = await api.get(`/materiais?${params}`);
      setMateriais(res.data.materiais || []);
      setTotalPages(res.data.pagination?.totalPages || 1);
      setTotalResultados(res.data.pagination?.total || 0);
      setCurrentPage(page);
    } catch {
      // mantém lista vazia — erro de rede não quebra a página
    } finally {
      setLoading(false);
    }
  }, [buscaTermo, filtroTipo, filtroCadeira]);

  /* Recarrega ao mudar qualquer filtro */
  useEffect(() => { fetchMateriais(1); }, [fetchMateriais]);

  /* Pré-selecciona o primeiro curso disponível no formulário de upload */
  useEffect(() => {
    if (!newMaterial.cadeira && cursos.length > 0) {
      setNewMaterial(m => ({ ...m, cadeira: cursos[0].nome }));
    }
  }, [cursos, newMaterial.cadeira]);

  /* Garante que o tipo seleccionado continua permitido pela configuração actual */
  useEffect(() => {
    if (TIPOS_MATERIAL_DISPONIVEIS.length > 0 && !TIPOS_MATERIAL_DISPONIVEIS.includes(newMaterial.tipo)) {
      setNewMaterial(m => ({ ...m, tipo: TIPOS_MATERIAL_DISPONIVEIS[0] }));
    }
  }, [TIPOS_MATERIAL_DISPONIVEIS, newMaterial.tipo]);

  /* Sincroniza URL params — reage só a mudanças no URL (ex: pesquisa global do Layout),
     não ao estado local, para não reverter o que o utilizador está a escrever aqui. */
  useEffect(() => {
    const q   = searchParams.get('q') || '';
    const tip = searchParams.get('tipo') || 'Todos';
    if (q   !== buscaTermo)  setBuscaTermo(q);
    if (tip !== filtroTipo)  setFiltroTipo(tip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!arquivoReal) return setUploadErro("Por favor, seleccione um ficheiro.");
    const formData = new FormData();
    formData.append("titulo",  newMaterial.titulo);
    formData.append("cadeira", newMaterial.cadeira);
    formData.append("tipo",    newMaterial.tipo);
    formData.append("arquivo", arquivoReal);
    try {
      await api.post("/materiais", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setShowUploadModal(false);
      setNewMaterial({ titulo: "", cadeira: "Informática", tipo: "PDF" });
      setArquivoReal(null);
      setUploadErro('');
      setUploadSucesso(true);
      setTimeout(() => setUploadSucesso(false), 5000);
      fetchMateriais(1);
    } catch (err) {
      setUploadErro(err.response?.data?.erro || "Erro ao enviar. Verifique o ficheiro e tente novamente.");
    }
  };

  const handleToggleFav = (id) => {
    toggleFavorito(id);
    setFavs(getFavoritos());
  };

  /* Filtro de cadeira agora é server-side — materiais já chegam filtrados */
  const materiaisFiltrados = materiais;

  const TIPOS = ["Todos", "PDF", "Vídeo"];

  return (
    <div className="space-y-8 animate-fade-in">

      {/* Toast de upload enviado */}
      {uploadSucesso && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-4 animate-fade-in"
          style={{ background: "var(--surface-card)", borderLeft: "3px solid #10b981", border: "1px solid var(--border-subtle-strong)", borderLeftWidth: 3, borderLeftColor: "#10b981", color: "var(--text-heading)", boxShadow: "0 10px 40px rgba(0,0,0,0.16)" }}>
          <CheckCircle size={18} style={{ color: "#10b981", flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 700 }}>Material enviado para aprovação!</p>
            <p style={{ fontSize: 12, opacity: 0.75 }}>O admin irá rever e publicar em breve.</p>
          </div>
          <button onClick={() => setUploadSucesso(false)} style={{ opacity: 0.45, marginLeft: 8, background: "none", border: "none", cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* ═══ HEADER ════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden rounded-[32px] text-white"
        style={{
          background: "linear-gradient(-45deg,var(--color-navy-abyss),var(--color-navy-deep),var(--color-navy),var(--color-navy-mid))",
          backgroundSize: "400% 400%",
          animation: "aurora-repo 10s ease infinite",
          boxShadow: "0 24px 80px rgba(var(--color-navy-abyss-rgb),0.50)",
          padding: "2.8rem",
        }}
      >
        <style>{`@keyframes aurora-repo { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }`}</style>
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 22% 28%, rgba(var(--color-gold-rgb),0.12) 0%, transparent 55%)" }} />
        <div className="absolute top-0 inset-x-0" style={{ height: 3, background: "linear-gradient(90deg, transparent, var(--color-gold-dark), var(--color-gold), var(--color-gold-light), transparent)", opacity: 0.85 }} />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.38em", color: "rgba(var(--color-blue-sky-rgb),0.65)", textTransform: "uppercase", marginBottom: 8 }}>Repositório Digital</p>
            <h1 style={{ fontSize: "clamp(1.8rem,3.5vw,2.8rem)", fontWeight: 900, letterSpacing: "-0.025em", lineHeight: 1.1 }}>Materiais da Comunidade</h1>
            <p style={{ marginTop: 12, maxWidth: 480, color: "rgba(var(--color-blue-sky-rgb),0.80)", fontSize: 15, lineHeight: 1.65 }}>
              Encontre guias, apresentações e vídeos aprovados para a sua aprendizagem.
            </p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-2.5 rounded-full font-black text-sm shrink-0 transition-all duration-250"
            style={{ background: "linear-gradient(135deg,var(--color-gold-dark),var(--color-gold),var(--color-gold-light))", color: "var(--color-navy-deep)", padding: "12px 28px", boxShadow: "0 8px 28px rgba(var(--color-gold-rgb),0.50), inset 0 1px 0 rgba(255,255,255,0.35)" }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)", e.currentTarget.style.boxShadow = "0 14px 40px rgba(var(--color-gold-rgb),0.65), inset 0 1px 0 rgba(255,255,255,0.35)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 8px 28px rgba(var(--color-gold-rgb),0.50), inset 0 1px 0 rgba(255,255,255,0.35)")}
          >
            <Plus size={19} /> Partilhar material
          </button>
        </div>
      </section>

      {/* ═══ FILTROS ═══════════════════════════════════════════════ */}
      <section
        className="rounded-[28px] p-6 space-y-5"
        style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 28px rgba(var(--color-navy-mid-rgb),0.06)" }}
      >
        {/* Linha 1: busca + cadeira */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" size={17} style={{ color: "var(--text-faint)" }} />
            <input
              type="text"
              placeholder="Buscar por título..."
              value={buscaTermo}
              onChange={e => setBuscaTermo(e.target.value)}
              className="w-full rounded-2xl py-3.5 pl-12 pr-4 text-sm outline-none transition-all duration-200"
              style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }}
              onFocus={e => (e.target.style.borderColor = "var(--color-navy-mid)", e.target.style.background = "var(--surface-card)", e.target.style.boxShadow = "0 0 0 4px rgba(var(--color-navy-mid-rgb),0.07)")}
              onBlur={e => (e.target.style.borderColor = "var(--border-subtle-strong)", e.target.style.background = "var(--surface-input)", e.target.style.boxShadow = "")}
            />
          </div>

          <div className="relative">
            <Filter className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" size={16} style={{ color: "var(--text-faint)" }} />
            <select
              className="rounded-2xl py-3.5 pl-11 pr-8 text-sm outline-none transition-all duration-200 appearance-none"
              style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-body)", minWidth: 200 }}
              value={filtroCadeira}
              onChange={e => setFiltroCadeira(e.target.value)}
            >
              <option value="Todas">Todas as cadeiras</option>
              {cursos.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
            </select>
          </div>
        </div>

        {/* Linha 2: filtro por tipo + stats */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Toggle PDF/Vídeo/Todos */}
          <div
            className="inline-flex rounded-2xl p-1.5"
            style={{ background: "var(--surface-hover)", border: "1.5px solid var(--border-subtle-strong)" }}
          >
            {TIPOS.map(t => (
              <button
                key={t}
                onClick={() => setFiltroTipo(t)}
                className="rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200"
                style={filtroTipo === t
                  ? { background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", color: "#fff", boxShadow: "0 3px 12px rgba(var(--color-navy-deep-rgb),0.28)" }
                  : { color: "var(--text-muted)" }
                }
              >
                {t}
              </button>
            ))}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4">
            <span style={{ fontSize: 13, color: "var(--text-faint)", fontWeight: 600 }}>
              {totalResultados} resultado{totalResultados !== 1 ? 's' : ''} · Pág. {currentPage}/{totalPages}
            </span>
          </div>
        </div>
      </section>

      {/* ═══ GRID DE MATERIAIS ═════════════════════════════════════ */}
      <section>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {loading ? (
            <div className="col-span-full rounded-[28px] p-14 text-center" style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)" }}>
              <div className="w-10 h-10 rounded-full border-4 animate-spin mx-auto mb-4" style={{ borderColor: "rgba(var(--color-navy-mid-rgb),0.10)", borderTopColor: "var(--color-navy-mid)" }} />
              <p style={{ color: "var(--text-faint)", fontWeight: 600 }}>Carregando materiais...</p>
            </div>
          ) : materiaisFiltrados.length === 0 ? (
            <div className="col-span-full rounded-[28px] p-14 text-center" style={{ border: "2px dashed var(--border-subtle-strong)", background: "var(--surface-card)" }}>
              <p style={{ fontSize: 16, fontWeight: 900, color: "var(--text-faint)" }}>Nenhum material encontrado.</p>
              {buscaTermo && (
                <button onClick={() => setBuscaTermo('')} className="mt-3 text-sm font-semibold" style={{ color: "var(--color-navy-mid)" }}>
                  Limpar pesquisa
                </button>
              )}
            </div>
          ) : (
            materiaisFiltrados.map(m => (
              <MaterialCard
                key={m.id}
                m={m}
                favs={favs}
                onToggleFav={handleToggleFav}
                onClick={() => navigate(`/video/${m.id}`)}
              />
            ))
          )}
        </div>
      </section>

      {/* ═══ PAGINAÇÃO ════════════════════════════════════════════ */}
      {totalPages > 1 && (
        <div
          className="flex flex-wrap items-center justify-center gap-3 rounded-[28px] p-5"
          style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "0 4px 20px rgba(var(--color-navy-mid-rgb),0.05)" }}
        >
          <button
            onClick={() => fetchMateriais(currentPage - 1)}
            disabled={currentPage === 1}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ border: "1.5px solid var(--border-subtle-strong)", background: "var(--surface-hover)", color: "var(--text-body)" }}
            onMouseEnter={e => currentPage > 1 && (e.currentTarget.style.background = "var(--color-navy-mid)", e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => currentPage > 1 && (e.currentTarget.style.background = "var(--surface-hover)", e.currentTarget.style.color = "var(--text-body)")}
          >
            <ChevronLeft size={15} /> Anterior
          </button>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)" }}>Página {currentPage} de {totalPages}</span>
          <button
            onClick={() => fetchMateriais(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ border: "1.5px solid var(--border-subtle-strong)", background: "var(--surface-hover)", color: "var(--text-body)" }}
            onMouseEnter={e => currentPage < totalPages && (e.currentTarget.style.background = "var(--color-navy-mid)", e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => currentPage < totalPages && (e.currentTarget.style.background = "var(--surface-hover)", e.currentTarget.style.color = "var(--text-body)")}
          >
            Próximo <ChevronRight size={15} />
          </button>
        </div>
      )}

      {/* ═══ MODAL UPLOAD ══════════════════════════════════════════ */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6" style={{ background: "rgba(var(--color-navy-abyss-rgb),0.60)", backdropFilter: "blur(8px)" }}>
          <div className="w-full max-w-2xl overflow-hidden rounded-[36px] animate-scale-in" style={{ background: "var(--surface-card)", boxShadow: "0 40px 120px rgba(var(--color-navy-abyss-rgb),0.50)" }}>
            <div className="relative flex items-center justify-between gap-4 px-8 py-7 text-white" style={{ background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid),var(--color-navy-bright))" }}>
              <div className="absolute top-0 inset-x-0" style={{ height: 3, background: "linear-gradient(90deg, transparent, var(--color-gold-dark), var(--color-gold), var(--color-gold-light), transparent)", opacity: 0.85 }} />
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.38em", color: "rgba(var(--color-blue-sky-rgb),0.65)", textTransform: "uppercase", marginBottom: 4 }}>Enviar Material</p>
                <h2 style={{ fontSize: 24, fontWeight: 900 }}>Submeta o seu conteúdo</h2>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="rounded-full p-3 transition-all duration-200"
                style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.22)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-6 p-8">
              {uploadErro && (
                <div className="rounded-2xl px-5 py-3.5 text-sm font-medium" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", color: "#b91c1c" }}>
                  ⚠️ {uploadErro}
                </div>
              )}

              {[
                { label: "Título", type: "text", value: newMaterial.titulo, onChange: e => setNewMaterial({...newMaterial, titulo: e.target.value}) },
              ].map(({ label, ...props }) => (
                <div key={label}>
                  <label style={{ display: "block", marginBottom: 10, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.28em", color: "var(--text-muted)" }}>{label}</label>
                  <input
                    required
                    className="w-full rounded-2xl px-5 py-4 text-sm outline-none transition-all duration-200"
                    style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-heading)" }}
                    onFocus={e => (e.target.style.borderColor = "var(--color-navy-mid)", e.target.style.background = "var(--surface-card)", e.target.style.boxShadow = "0 0 0 4px rgba(var(--color-navy-mid-rgb),0.07)")}
                    onBlur={e => (e.target.style.borderColor = "var(--border-subtle-strong)", e.target.style.background = "var(--surface-input)", e.target.style.boxShadow = "")}
                    {...props}
                  />
                </div>
              ))}

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label style={{ display: "block", marginBottom: 10, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.28em", color: "var(--text-muted)" }}>Disciplina</label>
                  <select
                    value={newMaterial.cadeira}
                    onChange={e => setNewMaterial({...newMaterial, cadeira: e.target.value})}
                    className="w-full rounded-2xl px-5 py-4 text-sm outline-none appearance-none"
                    style={{ background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-body)" }}
                  >
                    {cursos.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: 10, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.28em", color: "var(--text-muted)" }}>Tipo</label>
                  <div className="grid grid-cols-2 gap-3">
                    {TIPOS_MATERIAL_DISPONIVEIS.map(tipo => (
                      <button
                        key={tipo} type="button"
                        onClick={() => setNewMaterial({...newMaterial, tipo})}
                        className="rounded-2xl px-4 py-4 text-sm font-bold transition-all duration-200"
                        style={newMaterial.tipo === tipo
                          ? { background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", color: "#fff", boxShadow: "0 6px 20px rgba(var(--color-navy-deep-rgb),0.32)" }
                          : { background: "var(--surface-input)", border: "1.5px solid var(--border-subtle-strong)", color: "var(--text-body)" }
                        }
                      >
                        {tipo}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 10, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.28em", color: "var(--text-muted)" }}>Ficheiro</label>
                <input
                  type="file"
                  accept={newMaterial.tipo === 'PDF' ? '.pdf' : 'video/mp4,video/x-m4v,video/*'}
                  onChange={e => setArquivoReal(e.target.files[0])}
                  required
                  className="w-full rounded-2xl px-4 py-5 text-sm cursor-pointer transition-all duration-200"
                  style={{ background: "var(--surface-input)", border: "2px dashed var(--border-subtle-strong)", color: "var(--text-muted)" }}
                />
                <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>Tamanho máximo: {config.tamanho_maximo_mb} MB</p>
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2.5 rounded-full py-4 text-sm font-black uppercase tracking-wider transition-all duration-250"
                style={{ background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", color: "#fff", boxShadow: "0 8px 28px rgba(var(--color-navy-deep-rgb),0.38)", letterSpacing: "0.10em" }}
                onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)", e.currentTarget.style.boxShadow = "0 12px 40px rgba(var(--color-navy-deep-rgb),0.50)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "", e.currentTarget.style.boxShadow = "0 8px 28px rgba(var(--color-navy-deep-rgb),0.38)")}
              >
                <Upload size={17} /> Enviar para Aprovação
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Repositorio;
