import { useState, useEffect } from 'react';
import axios from 'axios';
import Toast from './Toast';

export default function Comentarios({ materialId, usuarioId }) {
  const [comentarios, setComentarios] = useState([]);
  const [novoComentario, setNovoComentario] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    carregarComentarios();
  }, [materialId]);

  const carregarComentarios = async () => {
    try {
      const { data } = await axios.get(`/api/materiais/${materialId}/comentarios`);
      setComentarios(data.comentarios);
    } catch (erro) {
      console.error('Erro ao carregar comentários:', erro);
    }
  };

  const submeterComentario = async () => {
    if (!novoComentario.trim()) {
      setToast({ tipo: 'erro', mensagem: 'Comentário não pode ser vazio' });
      return;
    }

    setCarregando(true);
    try {
      await axios.post(`/api/materiais/${materialId}/comentarios`, {
        conteudo: novoComentario,
      });
      setToast({ tipo: 'sucesso', mensagem: 'Comentário adicionado!' });
      setNovoComentario('');
      carregarComentarios();
    } catch (erro) {
      setToast({ tipo: 'erro', mensagem: 'Erro ao adicionar comentário' });
    } finally {
      setCarregando(false);
    }
  };

  const removerComentario = async (id) => {
    if (!confirm('Tem certeza?')) return;
    try {
      await axios.delete(`/api/comentarios/${id}`);
      setToast({ tipo: 'sucesso', mensagem: 'Comentário removido' });
      carregarComentarios();
    } catch (erro) {
      setToast({ tipo: 'erro', mensagem: 'Erro ao remover comentário' });
    }
  };

  return (
    <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f5f5f5', borderRadius: '8px' }}>
      <h3>💬 Comentários ({comentarios.length})</h3>

      {usuarioId && (
        <div style={{ background: '#fff', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
          <textarea
            value={novoComentario}
            onChange={e => setNovoComentario(e.target.value)}
            maxLength={1000}
            placeholder="Deixe um comentário..."
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #ccc',
              marginBottom: '0.5rem',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <small>{novoComentario.length}/1000</small>
            <button
              onClick={submeterComentario}
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
              {carregando ? 'A enviar...' : 'Enviar'}
            </button>
          </div>
        </div>
      )}

      <div>
        {comentarios.map(c => (
          <div key={c.id} style={{ background: '#fff', padding: '1rem', marginBottom: '0.5rem', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <strong>{c.usuario}</strong>
              {c.usuario_id === usuarioId && (
                <button
                  onClick={() => removerComentario(c.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#dc3545',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  ✕ Remover
                </button>
              )}
            </div>
            <p style={{ margin: '0.5rem 0' }}>{c.conteudo}</p>
            <small style={{ color: '#999' }}>{new Date(c.data_criacao).toLocaleDateString()}</small>
          </div>
        ))}
      </div>

      {comentarios.length === 0 && (
        <p style={{ color: '#999', textAlign: 'center', padding: '2rem' }}>Sem comentários ainda. Seja o primeiro!</p>
      )}

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} />}
    </div>
  );
}
