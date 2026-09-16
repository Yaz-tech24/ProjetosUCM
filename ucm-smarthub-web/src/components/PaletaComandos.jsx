import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, FileText, Film, MessageCircleQuestion, FolderOpen, CalendarDays, HandHelping, Users, CornerDownLeft, Home, Library, MessageCircle, KeyRound, BarChart3, ShieldCheck, User, Layers } from "lucide-react";
import api from "../services/api";

/* Paleta de pesquisa global (Ctrl+K / Cmd+K): materiais, perguntas, colecções,
   eventos e pedidos numa só lista, mais atalhos para páginas. Navegação por
   teclado: ↑ ↓ para escolher, Enter para abrir, Esc para fechar. */
const PAGINAS = [
  { label: "Painel inicial", path: "/dashboard", icon: Home },
  { label: "Repositório", path: "/repositorio", icon: Library },
  { label: "Chat de estudantes", path: "/chat", icon: MessageCircle },
  { label: "Perguntas e respostas", path: "/perguntas", icon: MessageCircleQuestion },
  { label: "Pedidos de materiais", path: "/pedidos", icon: HandHelping },
  { label: "Colecções e favoritos", path: "/colecoes", icon: FolderOpen },
  { label: "Calendário", path: "/calendario", icon: CalendarDays },
  { label: "O meu perfil", path: "/perfil", icon: User },
  { label: "Segurança e sessões", path: "/seguranca", icon: KeyRound },
  { label: "Revisões de flashcards", path: "/dashboard#revisoes", icon: Layers },
];
const PAGINAS_ADMIN = [
  { label: "Administração", path: "/admin", icon: ShieldCheck },
  { label: "Analytics", path: "/analytics", icon: BarChart3 },
];

const normalizar = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const PaletaComandos = ({ aberta, onFechar, navigate, ehAdmin }) => {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState(null);
  const [aProcurar, setAProcurar] = useState(false);
  const [indice, setIndice] = useState(0);
  const inputRef = useRef(null);
  const listaRef = useRef(null);

  useEffect(() => {
    if (aberta) { setQ(""); setResultados(null); setIndice(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [aberta]);

  /* Esc fecha a paleta seja qual for o elemento com foco — o onKeyDown do
     input só apanha a tecla depois de o foco lá chegar (num render lento, o
     Esc carregado logo a seguir a abrir ficava sem efeito). */
  useEffect(() => {
    if (!aberta) return;
    const handler = (e) => { if (e.key === "Escape") { e.preventDefault(); onFechar(); } };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [aberta, onFechar]);

  useEffect(() => {
    if (!aberta) return;
    const termo = q.trim();
    if (termo.length < 2) { setResultados(null); return; }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setAProcurar(true);
      try {
        const { data } = await api.get("/pesquisa", { params: { q: termo }, signal: controller.signal });
        setResultados(data);
        setIndice(0);
      } catch { /* cancelado ou sem rede */ } finally { setAProcurar(false); }
    }, 220);
    return () => { clearTimeout(t); controller.abort(); };
  }, [q, aberta]);

  const itens = useMemo(() => {
    const termo = normalizar(q.trim());
    const paginas = [...PAGINAS, ...(ehAdmin ? PAGINAS_ADMIN : [])]
      .filter(p => !termo || normalizar(p.label).includes(termo))
      .map(p => ({ grupo: "Páginas", key: `p:${p.path}`, label: p.label, icon: p.icon, path: p.path }));
    if (!resultados) return termo ? paginas : paginas.slice(0, 6);
    const lista = [];
    for (const m of resultados.materiais || []) lista.push({ grupo: "Materiais", key: `m:${m.id}`, label: m.titulo, sub: `${m.cadeira} · ${m.tipo}`, icon: m.tipo === "Vídeo" ? Film : FileText, path: `/video/${m.id}` });
    for (const p of resultados.perguntas || []) lista.push({ grupo: "Perguntas", key: `q:${p.id}`, label: p.titulo, sub: `${p.disciplina} · ${p.total_respostas} resposta(s)${p.resolvida ? " · resolvida" : ""}`, icon: MessageCircleQuestion, path: `/perguntas/${p.id}` });
    for (const c of resultados.colecoes || []) lista.push({ grupo: "Colecções", key: `c:${c.slug}`, label: c.nome, sub: `${c.dono} · ${c.total} material(is)${c.publica ? "" : " · privada"}`, icon: FolderOpen, path: `/colecoes/${c.slug}` });
    for (const e of resultados.eventos || []) lista.push({ grupo: "Calendário", key: `e:${e.id}`, label: e.titulo, sub: `${e.disciplina} · ${new Date(e.data_inicio).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}`, icon: CalendarDays, path: "/calendario" });
    for (const p of resultados.pedidos || []) lista.push({ grupo: "Pedidos", key: `r:${p.id}`, label: p.titulo, sub: p.disciplina, icon: HandHelping, path: `/pedidos?id=${p.id}` });
    for (const u of resultados.utilizadores || []) lista.push({ grupo: "Utilizadores", key: `u:${u.id}`, label: u.nome, sub: `${u.email} · ${u.papel}`, icon: Users, path: `/admin?aba=utilizadores&q=${encodeURIComponent(u.email)}` });
    return [...lista, ...paginas];
  }, [q, resultados, ehAdmin]);

  useEffect(() => {
    listaRef.current?.querySelector(`[data-indice="${indice}"]`)?.scrollIntoView({ block: "nearest" });
  }, [indice]);

  if (!aberta) return null;

  const abrir = (item) => {
    onFechar();
    if (item.path.includes("#")) {
      const [path, hash] = item.path.split("#");
      navigate(path);
      setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" }), 250);
    } else navigate(item.path);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndice(i => Math.min(itens.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndice(i => Math.max(0, i - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (itens[indice]) abrir(itens[indice]);
      else if (q.trim()) { onFechar(); navigate(`/repositorio?q=${encodeURIComponent(q.trim())}`); }
    }
    // Escape: tratado pelo listener global acima.
  };

  let grupoAnterior = null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[10vh]" style={{ background: "rgba(var(--color-navy-abyss-rgb),0.55)", backdropFilter: "blur(6px)" }} onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label="Pesquisa global" onClick={e => e.stopPropagation()}
        className="w-full max-w-xl rounded-[24px] overflow-hidden animate-scale-in"
        style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle-strong)", boxShadow: "0 30px 90px rgba(var(--color-navy-deep-rgb),0.35)" }}>
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <Search size={18} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown} placeholder="Pesquisar materiais, perguntas, colecções, eventos…" aria-label="Pesquisar"
            className="flex-1 bg-transparent outline-none text-base" style={{ color: "var(--text-heading)" }} />
          {aProcurar && <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "var(--border-subtle-strong)", borderTopColor: "var(--color-gold)" }} />}
          <kbd className="hidden sm:inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle-strong)", color: "var(--text-faint)" }}>Esc</kbd>
        </div>
        <ul ref={listaRef} className="max-h-[60vh] overflow-y-auto py-2" role="listbox">
          {itens.length === 0 && (
            <li className="px-5 py-8 text-center" style={{ fontSize: 13.5, color: "var(--text-faint)" }}>
              {q.trim().length < 2 ? "Escreva pelo menos 2 caracteres." : aProcurar ? "A procurar…" : <>Sem resultados. <button className="font-bold underline" onClick={() => { onFechar(); navigate(`/pedidos?novo=1&q=${encodeURIComponent(q.trim())}`); }} style={{ color: "var(--text-accent)" }}>Pedir este material</button></>}
            </li>
          )}
          {itens.map((item, i) => {
            const cabecalho = item.grupo !== grupoAnterior;
            grupoAnterior = item.grupo;
            const Icon = item.icon;
            return (
              <React.Fragment key={item.key}>
                {cabecalho && <li className="px-5 pt-3 pb-1 text-[10px] font-black uppercase" style={{ letterSpacing: "0.25em", color: "var(--text-faint)" }} aria-hidden="true">{item.grupo}</li>}
                <li role="option" aria-selected={i === indice} data-indice={i}>
                  <button type="button" onClick={() => abrir(item)} onMouseEnter={() => setIndice(i)}
                    className="w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors"
                    style={{ background: i === indice ? "var(--surface-hover)" : "transparent" }}>
                    <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(var(--color-navy-mid-rgb),0.08)", color: "var(--text-accent)" }}><Icon size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" style={{ fontSize: 14, fontWeight: 700, color: "var(--text-heading)" }}>{item.label}</span>
                      {item.sub && <span className="block truncate" style={{ fontSize: 12, color: "var(--text-faint)" }}>{item.sub}</span>}
                    </span>
                    {i === indice && <CornerDownLeft size={14} style={{ color: "var(--text-faint)", flexShrink: 0 }} />}
                  </button>
                </li>
              </React.Fragment>
            );
          })}
        </ul>
        <div className="hidden sm:flex items-center gap-4 px-5 py-2.5" style={{ borderTop: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-faint)" }}>
          <span><kbd>↑↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span>
          <span className="ml-auto">Enter sem seleção pesquisa no repositório</span>
        </div>
      </div>
    </div>
  );
};

export default PaletaComandos;
