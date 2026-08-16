/* eslint-disable react-refresh/only-export-components -- padrão habitual de Context: Provider + hook no mesmo ficheiro */
import React, { createContext, useContext, useEffect, useState } from "react";

const TEMA_KEY = "ucm_tema";

const lerTemaGuardado = () => {
  try {
    const guardado = localStorage.getItem(TEMA_KEY);
    return guardado === "claro" || guardado === "escuro" ? guardado : null;
  } catch {
    return null;
  }
};

const prefereSistemaEscuro = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

const ThemeContext = createContext({
  tema: "claro",
  alternarTema: () => {},
});

export const ThemeProvider = ({ children }) => {
  const [tema, setTema] = useState(() => lerTemaGuardado() || (prefereSistemaEscuro() ? "escuro" : "claro"));

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema === "escuro" ? "dark" : "light");
  }, [tema]);

  // Segue mudanças do tema do sistema em tempo real, mas só enquanto o
  // utilizador nunca escolheu explicitamente um tema (via alternarTema).
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const handler = (e) => { if (!lerTemaGuardado()) setTema(e.matches ? "escuro" : "claro"); };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  const alternarTema = () => {
    setTema(actual => {
      const novo = actual === "escuro" ? "claro" : "escuro";
      try { localStorage.setItem(TEMA_KEY, novo); } catch { /* localStorage indisponível — segue apenas em memória */ }
      return novo;
    });
  };

  return (
    <ThemeContext.Provider value={{ tema, alternarTema }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
