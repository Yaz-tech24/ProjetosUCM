import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // PWA: instalável no telemóvel e com a app-shell em cache para abrir sem
    // rede. Os PDFs guardados "para offline" vão para a Cache API a partir da
    // própria app (services/offline.js) — o service worker só trata da shell
    // e das respostas GET da API mais recentes (network-first).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'vite.svg'],
      manifest: {
        name: 'SmartHub — Plataforma Académica',
        short_name: 'SmartHub',
        description: 'Materiais de estudo, perguntas e respostas, quizzes por IA e calendário académico — UCM Tete.',
        lang: 'pt',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#04122e',
        theme_color: '#04122e',
        icons: [
          { src: 'icons/icon-64.png', sizes: '64x64', type: 'image/png' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // O iframe do PDF, o <a download> e o Swagger são pedidos de
        // NAVEGAÇÃO para /uploads e /api — sem esta lista o Workbox
        // respondia-lhes com o index.html e o React mostrava o 404 dentro
        // do visualizador. Em produção estes caminhos são da mesma origem.
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//, /^\/socket\.io\//],
        // O cookie de sessão nunca é cacheado (as respostas da API são
        // network-first e expiram em 1 h); os uploads não passam por aqui.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/api\/(config|materiais|materiais\/\d+|favoritos|favoritos\/materiais|colecoes|colecoes\/[^/]+|notificacoes|calendario|perguntas|perguntas\/\d+)$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: { cacheName: 'smarthub-api', networkTimeoutSeconds: 6, expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 } },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com' || url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'smarthub-fontes', expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],

  // ─── Servidor de desenvolvimento ──────────────────────────
  server: {
    port: 5173,
    open: false,
    // Pré-carrega dependências pesadas ao arrancar o dev server
    warmup: {
      clientFiles: [
        './src/main.jsx',
        './src/App.jsx',
        './src/pages/Dashboard.jsx',
        './src/pages/Login.jsx',
      ],
    },
  },

  // ─── Pré-visualização do build de produção (npm run preview) ─────
  // Proxy para a API local, para o build se comportar como em produção
  // (API, uploads e socket na MESMA origem — é assim que o Caddy serve).
  preview: {
    port: 4173,
    proxy: {
      '/api': 'http://localhost:5055',
      '/uploads': 'http://localhost:5055',
      '/socket.io': { target: 'http://localhost:5055', ws: true },
    },
  },

  // ─── Pré-bundling de dependências (elimina waterfalls de módulos) ──
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'axios',
      'lucide-react',
      'socket.io-client',
    ],
  },

  // ─── Build de produção ─────────────────────────────────────
  build: {
    // Avisa só acima de 800 KB (chunks menores são normais)
    chunkSizeWarningLimit: 800,

    rollupOptions: {
      output: {
        // Code splitting manual: divide o bundle em pedaços menores
        manualChunks(id) {
          // React core
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          // Router
          if (id.includes('node_modules/react-router')) {
            return 'router';
          }
          // Ícones (lucide tem centenas de ícones — isolar é importante)
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }
          // Socket.IO
          if (id.includes('node_modules/socket.io-client')) {
            return 'socket';
          }
          // Axios e resto das libs
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },

    // Minificação agressiva
    minify: 'esbuild',
    target: 'es2020',

    // Gera source maps só em dev, não em prod
    sourcemap: false,
  },
});
