import { useState, useEffect } from 'react';
import axios from 'axios';

export default function Reputacao({ usuarioId }) {
  const [reputacao, setReputacao] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [tab, setTab] = useState('perfil');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId]);

  const carregarDados = async () => {
    setCarregando(true);
    try {
      if (usuarioId) {
        const { data } = await axios.get(`/api/utilizadores/${usuarioId}/reputacao`);
        setReputacao(data.reputacao);
      }
      const { data: lb } = await axios.get('/api/leaderboard');
      setLeaderboard(lb);
    } catch (erro) {
      console.error('Erro ao carregar reputação:', erro);
    } finally {
      setCarregando(false);
    }
  };

  if (carregando) return <div style={{ textAlign: 'center', padding: '2rem' }}>Carregando...</div>;

  return (
    <div style={{ padding: '1.5rem', background: '#f5f5f5', borderRadius: '8px' }}>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setTab('perfil')}
          style={{
            background: tab === 'perfil' ? '#04122e' : '#fff',
            color: tab === 'perfil' ? '#fff' : '#04122e',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          Meu Perfil
        </button>
        <button
          onClick={() => setTab('leaderboard')}
          style={{
            background: tab === 'leaderboard' ? '#04122e' : '#fff',
            color: tab === 'leaderboard' ? '#fff' : '#04122e',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          🏆 Leaderboard
        </button>
      </div>

      {tab === 'perfil' && reputacao && (
        <div style={{ background: '#fff', padding: '2rem', borderRadius: '8px' }}>
          <h2>{reputacao.nome}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
            <div style={{ textAlign: 'center', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Pontos</h4>
              <div style={{ fontSize: '2rem', color: '#ffd700', fontWeight: 'bold' }}>{reputacao.pontos}</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Materiais</h4>
              <div style={{ fontSize: '2rem', color: '#04122e', fontWeight: 'bold' }}>
                {reputacao.materiais_aprovados}/{reputacao.materiais_submetidos}
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Média</h4>
              <div style={{ fontSize: '2rem', color: '#059669', fontWeight: 'bold' }}>
                {reputacao.media_avaliacoes ? `${reputacao.media_avaliacoes.toFixed(1)} ⭐` : 'N/A'}
              </div>
            </div>
          </div>
          {reputacao.emblema && (
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#fffacd', borderRadius: '8px', textAlign: 'center' }}>
              <h4>🏅 {reputacao.emblema}</h4>
            </div>
          )}
        </div>
      )}

      {tab === 'leaderboard' && (
        <div style={{ background: '#fff', padding: '2rem', borderRadius: '8px' }}>
          <h3>🏆 Top 10 Contribuidores</h3>
          <div style={{ marginTop: '1rem' }}>
            {leaderboard.map((u, idx) => (
              <div
                key={u.usuario_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '1rem',
                  background: idx === 0 ? '#fffacd' : idx === 1 ? '#e8e8e8' : idx === 2 ? '#ffd7b5' : '#f5f5f5',
                  marginBottom: '0.5rem',
                  borderRadius: '4px',
                  borderLeft: `4px solid ${idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : '#ccc'}`,
                }}
              >
                <div style={{ fontSize: '1.5rem', marginRight: '1rem', fontWeight: 'bold', minWidth: '30px' }}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}
                </div>
                <div style={{ flex: 1 }}>
                  <strong>{u.nome}</strong>
                  <div style={{ color: '#666', fontSize: '0.9rem' }}>
                    {u.materiais_aprovados} materiais · {u.media_avaliacoes ? `${u.media_avaliacoes.toFixed(1)} ⭐` : 'Sem avaliações'}
                  </div>
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ffd700' }}>{u.pontos} pts</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
