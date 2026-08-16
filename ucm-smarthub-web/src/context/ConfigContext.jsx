/* eslint-disable react-refresh/only-export-components -- padrão habitual de Context: Provider + hook no mesmo ficheiro */
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "../services/api";
import { aplicarPaleta } from "../utils/palette";

/*
 * Configuração da plataforma — nome, logótipo, cores, cursos e funcionalidades
 * activadas — vinda da BD (GET /api/config, pública). Os valores por defeito
 * abaixo são exactamente os mesmos que o backend usa na primeira migração,
 * para que não haja "flash" entre o primeiro render e a resposta da API.
 */
const CONFIG_DEFEITO = {
  nome_plataforma: "SmartHub",
  tagline: "Aprenda · Partilhe · Cresça",
  descricao_proposito: "",
  logo_url: null,
  cor_primaria: "#04122e",
  cor_destaque: "#ffd700",
  contacto_email: "",
  localizacao: "",
  link_facebook: "",
  link_instagram: "",
  link_linkedin: "",
  chat_activado: true,
  ia_activada: true,
  moderacao_ia_activada: true,
  tipos_ficheiro_permitidos: "pdf,mp4,webm,ogg,mov",
  tamanho_maximo_mb: 100,
};

const ConfigContext = createContext({
  config: CONFIG_DEFEITO,
  cursos: [],
  loading: true,
  refetchConfig: () => {},
});

export const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(CONFIG_DEFEITO);
  const [cursos, setCursos] = useState([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const res = await api.get("/config");
      setConfig({ ...CONFIG_DEFEITO, ...res.data.configuracoes });
      setCursos(res.data.cursos || []);
    } catch {
      // Falha de rede/API — mantém os defaults, a app continua utilizável
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    aplicarPaleta(config.cor_primaria, config.cor_destaque);
  }, [config.cor_primaria, config.cor_destaque]);

  useEffect(() => {
    document.title = config.nome_plataforma;
  }, [config.nome_plataforma]);

  // Favicon — reflecte o logótipo do admin quando existir; volta ao ícone
  // por defeito do projecto quando o logótipo é removido.
  useEffect(() => {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = config.logo_url || "/vite.svg";
  }, [config.logo_url]);

  return (
    <ConfigContext.Provider value={{ config, cursos, loading, refetchConfig: carregar }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => useContext(ConfigContext);
