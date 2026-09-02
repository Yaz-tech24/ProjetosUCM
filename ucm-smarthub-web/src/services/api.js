import axios from 'axios';

// withCredentials: a sessão viaja num cookie httpOnly (definido pelo backend
// no login) em vez de um token guardado em localStorage — o browser envia-o
// sozinho em todos os pedidos, e nenhum JavaScript nesta app consegue lê-lo
// ou escrevê-lo, o que reduz o impacto de um eventual XSS na aplicação.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 20000, // 20 segundos — evita que chamadas à IA fiquem penduradas
  withCredentials: true,
});

// ─── Trata respostas de erro globalmente ───
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Sessão expirada ou inválida → limpar a cache local do utilizador e
      // voltar ao início (o cookie de sessão, esse, já foi rejeitado/expirou
      // do lado do servidor; não há nada a limpar aqui além da cache).
      localStorage.removeItem('usuarioLogado');
      if (window.location.pathname !== '/') window.location.href = '/';
    }
    // Timeout ou sem ligação ao servidor — nunca para um pedido cancelado de
    // propósito (AbortController), que também não tem error.response.
    if (error.code !== 'ERR_CANCELED' && (error.code === 'ECONNABORTED' || !error.response)) {
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
