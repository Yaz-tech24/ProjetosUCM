import { useState, useEffect } from 'react';
import axios from 'axios';
import Toast from './Toast';

export default function Avaliacoes({ materialId, ehAutenticado }) {
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [minhaNota, setMinhaNota] = useState(0);
  const [meuComentario, setMeuComentario] = useState('');
  const [media, setMedia] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    carregarAvaliacoes();
    if (ehAutenticado) carregarMinhaAvaliacao();
  }, [materialId]);

  const carregarAvaliacoes = async () => {
    try {
      const { data } = await axios.get(`/api/materiais/${materialId}/avaliacoes`);
      setAvaliacoes(data.avaliacoes);
      setMedia(data.estatisticas.media);
    } catch (erro) {
      console.error('Erro ao carregar avaliações:', erro);
    }
  };

  const carregarMinhaAvaliacao = async () => {
    try {
      const { data } = await axios.get(`/api/materiais/${materialId}/minha-avaliacao`);
      setMinhaNota(data.nota);
      setMeuComentario(data.comentario || '');
    } catch {
      // Sem avaliação anterior
    }
  };

  const submeterAvaliacao = async () => {
    if (minhaNota === 0) {
      setToast({ tipo: 'erro', mensagem: 'Seleccione uma nota' });
      return;
    }

    setCarregando(true);
    try {
      await axios.post(`/api/materiais/${materialId}/avaliacoes`, {
        nota: minhaNota,
        comentario: meuComentario,
      });
      setToast({ tipo: 'sucesso', mensagem: 'Avaliação registada!' });
      setMostrarForm(false);
      carregarAvaliacoes();
      carregarMinhaAvaliacao();
    } catch (erro) {
      setToast({ tipo: 'erro', mensagem: 'Erro ao registar avaliação' });
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f5f5f5', borderRadius: '8px' }}>
      <h3>⭐ Avaliações ({avaliacoes.length})</h3>
      <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
        {media > 0 ? `${media} / 5 ⭐` : 'Sem avaliações ainda'}
      </div>

      {ehAutenticado && (
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          style={{
            background: '#ffd700',
            color: '#04122e',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer',
            marginBottom: '1rem',
            fontWeight: 'bold',
          }}
        >
          {mostrarForm ? 'Cancelar' : 'Avaliar Material'}
        </button>
      )}

      {mostrarForm && (
        <div style={{ background: '#fff', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label>Sua Nota:</label>
            <div style={{ fontSize: '2rem', marginTop: '0.5rem' }}>
              {[1, 2, 3, 4, 5].map(n => (
                <span
                  key={n}
                  onClick={() => setMinhaNota(n)}
                  style={{
                    cursor: 'pointer',
                    color: minhaNota >= n ? '#ffd700' : '#ccc',
                    marginRight: '0.5rem',
                    fontSize: '1.8rem',
                  }}
                >
                  ★
                </span>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label>Comentário (opcional):</label>
            <textarea
              value={meuComentario}
              onChange={e => setMeuComentario(e.target.value)}
              maxLength={500}
              placeholder="Partilhe a sua opinião..."
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #ccc',
                marginTop: '0.5rem',
              }}
            />
            <small>{meuComentario.length}/500</small>
          </div>

          <button
            onClick={submeterAvaliacao}
            disabled={carregando}
            style={{
              background: '#04122e',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {carregando ? 'A guardar...' : 'Guardar Avaliação'}
          </button>
        </div>
      )}

      <div>
        {avaliacoes.map(a => (
          <div key={a.id} style={{ background: '#fff', padding: '1rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{a.usuario}</strong>
              <span>{'★'.repeat(a.nota)}{'☆'.repeat(5 - a.nota)}</span>
            </div>
            {a.comentario && <p style={{ margin: '0.5rem 0' }}>{a.comentario}</p>}
            <small style={{ color: '#999' }}>{new Date(a.data_criacao).toLocaleDateString()}</small>
          </div>
        ))}
      </div>

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} />}
    </div>
  );
}
