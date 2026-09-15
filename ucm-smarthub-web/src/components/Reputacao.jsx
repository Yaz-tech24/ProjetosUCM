import React, { useState, useEffect, useCallback } from "react";
import { Trophy, Award, FileCheck, Star, Medal, Crown } from "lucide-react";
import api from "../services/api";
import { Cartao, Vazio, Spinner, Avatar } from "./ui";

const MEDALHAS = ["#d4af37", "#a8a9ad", "#b87333"];

const Estatistica = ({ icon: Icon, valor, label }) => (
  <div className="rounded-2xl p-4 text-center" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)" }}>
    <Icon size={18} className="mx-auto mb-1.5" style={{ color: "var(--text-accent)" }} />
    <p style={{ fontSize: 22, fontWeight: 900, color: "var(--text-heading)", lineHeight: 1.1 }}>{valor}</p>
    <p className="text-[10.5px] font-bold uppercase mt-1" style={{ letterSpacing: "0.10em", color: "var(--text-faint)" }}>{label}</p>
  </div>
);

const Reputacao = ({ usuarioId }) => {
  const [aba, setAba] = useState("perfil");
  const [perfil, setPerfil] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [aCarregar, setACarregar] = useState(true);

  const carregar = useCallback(async () => {
    setACarregar(true);
    try {
      const [r1, r2] = await Promise.all([
        usuarioId ? api.get(`/utilizadores/${usuarioId}/reputacao`) : Promise.resolve({ data: { reputacao: null } }),
        api.get("/leaderboard"),
      ]);
      setPerfil(r1.data.reputacao);
      setLeaderboard(r2.data);
    } catch {
      setPerfil(null);
      setLeaderboard([]);
    } finally {
      setACarregar(false);
    }
  }, [usuarioId]);

  useEffect(() => { carregar(); }, [carregar]);

  const abas = [
    { key: "perfil", label: "A minha reputação", icon: Award },
    { key: "top", label: "Top 10", icon: Trophy },
  ];

  return (
    <Cartao
      icon={Trophy}
      titulo="Reputação"
      subtitulo="10 pontos por material aprovado, mais um bónus pela média das avaliações recebidas"
      accao={(
        <div className="flex gap-1.5 rounded-2xl p-1" style={{ background: "var(--surface-hover)", border: "1px solid var(--border-subtle)" }}>
          {abas.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setAba(key)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all"
              style={aba === key ? { background: "var(--surface-card)", color: "var(--text-heading)", boxShadow: "0 2px 8px rgba(var(--color-navy-mid-rgb),0.10)" } : { color: "var(--text-faint)" }}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      )}
    >
      {aCarregar ? <Spinner /> : aba === "perfil" ? (
        !perfil ? <Vazio icon={Award}>Sem dados de reputação ainda.</Vazio> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 rounded-2xl p-5 text-white"
              style={{ background: "linear-gradient(135deg,var(--color-navy-deep),var(--color-navy-mid))", boxShadow: "0 10px 30px rgba(var(--color-navy-deep-rgb),0.30)" }}>
              <Avatar nome={perfil.nome} url={perfil.avatar_url} tamanho={52} />
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate" style={{ fontSize: 17, fontWeight: 900 }}>{perfil.nome}</p>
                <p style={{ fontSize: 12.5, opacity: 0.75 }}>
                  {perfil.emblema ? `Emblema: ${perfil.emblema}` : "Publique materiais de qualidade para ganhar um emblema"}
                </p>
              </div>
              <div className="text-right ml-auto">
                <p style={{ fontSize: 30, fontWeight: 900, color: "var(--color-gold)", lineHeight: 1 }}>{perfil.pontos}</p>
                <p className="text-[10.5px] font-bold uppercase" style={{ letterSpacing: "0.12em", opacity: 0.7 }}>pontos · #{perfil.posicao}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Estatistica icon={FileCheck} valor={perfil.materiais_aprovados} label="Aprovados" />
              <Estatistica icon={Medal} valor={perfil.materiais_submetidos} label="Submetidos" />
              <Estatistica icon={Star} valor={perfil.media_avaliacoes ? perfil.media_avaliacoes.toFixed(1) : "—"} label="Média" />
            </div>
          </div>
        )
      ) : (
        leaderboard.length === 0 ? <Vazio icon={Trophy}>Ainda ninguém pontuou. Publique o primeiro material aprovado!</Vazio> : (
          <ol className="space-y-2">
            {leaderboard.map((u, i) => {
              const souEu = u.usuario_id === usuarioId;
              return (
                <li key={u.usuario_id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                  style={{ border: `1px solid ${souEu ? "rgba(var(--color-gold-rgb),0.55)" : "var(--border-subtle)"}`, background: souEu ? "rgba(var(--color-gold-rgb),0.08)" : "transparent" }}>
                  <span className="w-7 text-center shrink-0" style={{ fontSize: 15, fontWeight: 900, color: MEDALHAS[i] || "var(--text-faint)" }}>
                    {i < 3 ? <Crown size={18} fill={MEDALHAS[i]} style={{ color: MEDALHAS[i] }} /> : i + 1}
                  </span>
                  <Avatar nome={u.nome} url={u.avatar_url} tamanho={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate" style={{ fontSize: 14, fontWeight: 800, color: "var(--text-heading)" }}>{u.nome}{souEu && " (eu)"}</p>
                    <p style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                      {u.materiais_aprovados} aprovado{u.materiais_aprovados !== 1 ? "s" : ""}{u.emblema ? ` · ${u.emblema}` : ""}
                    </p>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 900, color: "var(--text-heading)" }}>{u.pontos} <small style={{ fontSize: 10, color: "var(--text-faint)" }}>pts</small></span>
                </li>
              );
            })}
          </ol>
        )
      )}
    </Cartao>
  );
};

export default Reputacao;
