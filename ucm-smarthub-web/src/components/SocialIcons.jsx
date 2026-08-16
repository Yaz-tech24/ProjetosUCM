import React from "react";

/*
 * Ícones de redes sociais — lucide-react não inclui logótipos de marcas
 * (removidos por questões de licenciamento), por isso definimos aqui SVGs
 * minimalistas próprios, com a mesma API (`size`) dos ícones lucide usados
 * no resto da app, para poderem ser trocados livremente.
 */
const criarIcone = (nome, path) => {
  const Icone = ({ size = 20, ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      {path}
    </svg>
  );
  Icone.displayName = nome;
  return Icone;
};

export const FacebookIcon = criarIcone("FacebookIcon",
  <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.89h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
);

export const InstagramIcon = criarIcone("InstagramIcon",
  <path d="M12 2c2.72 0 3.06.01 4.12.06 1.06.05 1.79.22 2.43.47.66.26 1.22.6 1.77 1.15.55.55.9 1.11 1.15 1.77.25.64.42 1.37.47 2.43.05 1.06.06 1.4.06 4.12s-.01 3.06-.06 4.12c-.05 1.06-.22 1.79-.47 2.43a4.9 4.9 0 0 1-1.15 1.77 4.9 4.9 0 0 1-1.77 1.15c-.64.25-1.37.42-2.43.47-1.06.05-1.4.06-4.12.06s-3.06-.01-4.12-.06c-1.06-.05-1.79-.22-2.43-.47a4.9 4.9 0 0 1-1.77-1.15 4.9 4.9 0 0 1-1.15-1.77c-.25-.64-.42-1.37-.47-2.43C2.01 15.06 2 14.72 2 12s.01-3.06.06-4.12c.05-1.06.22-1.79.47-2.43.26-.66.6-1.22 1.15-1.77A4.9 4.9 0 0 1 5.45.53c.64-.25 1.37-.42 2.43-.47C8.94 2.01 9.28 2 12 2Zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Zm5.2-8.4a1.17 1.17 0 1 1 0-2.34 1.17 1.17 0 0 1 0 2.34Z" />
);

export const LinkedinIcon = criarIcone("LinkedinIcon",
  <path d="M6.94 5.5a2.44 2.44 0 1 1-4.88 0 2.44 2.44 0 0 1 4.88 0ZM2.4 8.75h4.1V21.5H2.4V8.75Zm7.13 0h3.93v1.74h.06c.55-1.03 1.88-2.12 3.87-2.12 4.14 0 4.9 2.72 4.9 6.26v7.87h-4.1v-6.98c0-1.67-.03-3.8-2.32-3.8-2.33 0-2.69 1.82-2.69 3.7v7.08h-4.1V8.75Z" />
);
