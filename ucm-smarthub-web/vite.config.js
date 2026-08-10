import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

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
