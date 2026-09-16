// Leitura offline de PDFs: o ficheiro vai para a Cache API e os metadados
// para localStorage. O PDF é depois mostrado a partir de um blob URL — o
// service worker não consegue servir o iframe porque, em produção, os
// uploads vivem noutra origem (a da API).
const CACHE = 'smarthub-offline-v1';
const CHAVE = 'smarthub_offline';

const suportado = () => typeof caches !== 'undefined' && typeof window !== 'undefined';

function lerLista() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch { return {}; }
}
function gravarLista(obj) {
  try { localStorage.setItem(CHAVE, JSON.stringify(obj)); } catch { /* sem espaço */ }
}

export function listarOffline() {
  return Object.values(lerLista()).sort((a, b) => (b.guardado_em || 0) - (a.guardado_em || 0));
}

export function estaGuardadoOffline(id) {
  return Boolean(lerLista()[Number(id)]);
}

export function obterMaterialOffline(id) {
  return lerLista()[Number(id)] || null;
}

export async function guardarMaterialOffline(material) {
  if (!suportado()) throw new Error('Este browser não suporta guardar para leitura offline.');
  const resposta = await fetch(material.url_arquivo, { mode: 'cors', credentials: 'omit' });
  if (!resposta.ok) throw new Error('Não foi possível descarregar o ficheiro.');
  const cache = await caches.open(CACHE);
  await cache.put(material.url_arquivo, resposta);
  const lista = lerLista();
  lista[material.id] = {
    id: material.id, titulo: material.titulo, cadeira: material.cadeira, tipo: material.tipo,
    url_arquivo: material.url_arquivo, autor: material.autor, data_upload: material.data_upload,
    versao: material.versao, guardado_em: Date.now(),
    // O resumo por IA viaja com a cópia — é texto, cabe no localStorage.
    resumo: material.resumo || null,
  };
  gravarLista(lista);
  return lista[material.id];
}

// Guarda (ou actualiza) o resumo na cópia offline já existente.
export function actualizarResumoOffline(id, resumo) {
  const lista = lerLista();
  const item = lista[Number(id)];
  if (!item || !resumo) return false;
  item.resumo = resumo;
  gravarLista(lista);
  return true;
}

export async function removerMaterialOffline(id) {
  const lista = lerLista();
  const item = lista[Number(id)];
  if (item && suportado()) {
    try { const cache = await caches.open(CACHE); await cache.delete(item.url_arquivo); } catch { /* já não existia */ }
  }
  delete lista[Number(id)];
  gravarLista(lista);
}

// Devolve um blob URL se o ficheiro estiver em cache; senão null.
export async function obterUrlLocal(url) {
  if (!suportado() || !url) return null;
  try {
    const cache = await caches.open(CACHE);
    const resposta = await cache.match(url);
    if (!resposta) return null;
    return URL.createObjectURL(await resposta.blob());
  } catch {
    return null;
  }
}

export async function tamanhoOffline() {
  if (!suportado() || !navigator.storage?.estimate) return null;
  try { const { usage } = await navigator.storage.estimate(); return usage || 0; } catch { return null; }
}
