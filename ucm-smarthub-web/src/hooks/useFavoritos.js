import { useState, useEffect, useCallback } from 'react';
import { obterFavoritos, alternarFavorito, subscreverFavoritos } from '../services/favoritos';

// Lista de IDs favoritos partilhada por todas as páginas — qualquer
// alteração (noutra página ou noutro componente) reflecte-se aqui.
export default function useFavoritos() {
  const [favoritos, setFavoritos] = useState([]);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let activo = true;
    obterFavoritos().then(ids => { if (activo) { setFavoritos(ids); setPronto(true); } });
    const cancelar = subscreverFavoritos(ids => { if (activo) setFavoritos(ids); });
    return () => { activo = false; cancelar(); };
  }, []);

  const alternar = useCallback((id) => alternarFavorito(id), []);
  const ehFavorito = useCallback((id) => favoritos.includes(Number(id)), [favoritos]);

  return { favoritos, ehFavorito, alternar, pronto };
}
