import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 20000, // 20 segundos — evita que chamadas à IA fiquem penduradas
});

// ─── Injeta token JWT em todos os pedidos ───
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Trata respostas de erro globalmente ───
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado ou inválido → limpar sessão e redirecionar
      localStorage.removeItem('token');
      localStorage.removeItem('usuarioLogado');
      window.location.href = '/login';
    }
    // Timeout ou sem ligação ao servidor
    if (error.code === 'ECONNABORTED' || !error.response) {
      console.warn('[API] Servidor inacessível ou timeout:', error.message);
    }
    return Promise.reject(error);
  }
);

export default api;

// ─── Utilitário: favoritos em localStorage ───────────────────────────────────
const FAVORITOS_KEY = 'ucm_favoritos';

export const getFavoritos = () => {
  try {
    return JSON.parse(localStorage.getItem(FAVORITOS_KEY) || '[]');
  } catch {
    return [];
  }
};

export const isFavorito = (id) => getFavoritos().includes(Number(id));

export const toggleFavorito = (id) => {
  const favs = getFavoritos();
  const numId = Number(id);
  const novos = favs.includes(numId) ? favs.filter(f => f !== numId) : [...favs, numId];
  localStorage.setItem(FAVORITOS_KEY, JSON.stringify(novos));
  return novos.includes(numId);
};
