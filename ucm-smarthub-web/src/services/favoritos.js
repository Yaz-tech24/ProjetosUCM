import api from './api';

// Favoritos guardados no servidor (seguem o utilizador entre dispositivos).
// Os que a app guardava em localStorage são enviados uma única vez para
// serem juntados aos do servidor, e depois esquecidos.
const CHAVE_ANTIGA = 'ucm_favoritos';
let cache = null;
let aCarregar = null;
const ouvintes = new Set();

const avisar = () => ouvintes.forEach(fn => fn([...cache]));

export function subscreverFavoritos(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export async function obterFavoritos() {
  if (cache) return [...cache];
  if (!aCarregar) {
    aCarregar = (async () => {
      let locais = [];
      try { locais = JSON.parse(localStorage.getItem(CHAVE_ANTIGA) || '[]'); } catch { locais = []; }
      try {
        const { data } = locais.length > 0
          ? await api.post('/favoritos/sincronizar', { ids: locais })
          : await api.get('/favoritos');
        cache = new Set(data);
        try { localStorage.removeItem(CHAVE_ANTIGA); } catch { /* sem storage */ }
      } catch {
        // Sem servidor (offline): usa o que havia localmente para não ficar em branco.
        cache = new Set(locais.map(Number));
      }
      return [...cache];
    })().finally(() => { aCarregar = null; });
  }
  return aCarregar;
}

export async function alternarFavorito(id) {
  await obterFavoritos();
  const numId = Number(id);
  const era = cache.has(numId);
  // Optimista: a interface muda já; se o servidor recusar, volta atrás.
  if (era) cache.delete(numId); else cache.add(numId);
  avisar();
  try {
    if (era) await api.delete(`/favoritos/${numId}`);
    else await api.put(`/favoritos/${numId}`);
  } catch (erro) {
    if (era) cache.add(numId); else cache.delete(numId);
    avisar();
    throw erro;
  }
  return !era;
}

export function limparCacheFavoritos() {
  cache = null;
}
