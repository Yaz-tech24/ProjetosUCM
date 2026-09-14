import { useState, useEffect } from 'react';
import axios from 'axios';
import Toast from './Toast';

export default function Subscricoes() {
  const [disciplinas, setDisciplinas] = useState([]);
  const [minhasSubscricoes, setMinhasSubscricoes] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    carregarDisciplinas();
    carregarSubscricoes();
  }, []);

  const carregarDisciplinas = async () => {
    try {
      const { data } = await axios.get('/api/config');
      // Assumindo que cursos estão em config ou em endpoint separado
      setDisciplinas(data.cursos || []);
    } catch {
      // Erro ao carregar disciplinas
    }
  };

  const carregarSubscricoes = async () => {
    try {
      const { data } = await axios.get('/api/subscricoes/minhas-disciplinas');
      setMinhasSubscricoes(data.map(s => s.disciplina));
    } catch {
      // Erro ao carregar subscrições
    }
  };

  const subscrever = async (disciplina) => {
    setCarregando(true);
    try {
      await axios.post(`/api/subscricoes/disciplinas/${encodeURIComponent(disciplina)}`);
      setToast({ tipo: 'sucesso', mensagem: `Subscrito a ${disciplina}!` });
      carregarSubscricoes();
    } catch {
      setToast({ tipo: 'erro', mensagem: 'Erro ao subscrever' });
    } finally {
      setCarregando(false);
    }
  };

  const desinscrever = async (disciplina) => {
    if (!confirm(`Desinscrever de ${disciplina}?`)) return;
    setCarregando(true);
    try {
      await axios.delete(`/api/subscricoes/disciplinas/${encodeURIComponent(disciplina)}`);
      setToast({ tipo: 'sucesso', mensagem: `Desinscrição de ${disciplina}` });
      carregarSubscricoes();
    } catch {
      setToast({ tipo: 'erro', mensagem: 'Erro ao desinscrever' });
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', background: '#f5f5f5', borderRadius: '8px' }}>
      <h2>📬 Minhas Subscrições</h2>
      <p style={{ color: '#666' }}>Receba notificações de novos materiais nas disciplinas que segue</p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '1rem',
        marginTop: '1.5rem'
      }}>
        {disciplinas.map(d => {
          const estaSubscrito = minhasSubscricoes.includes(d.nome || d);
          return (
            <div
              key={d.id || d}
              style={{
                background: estaSubscrito ? '#04122e' : '#fff',
                color: estaSubscrito ? '#fff' : '#04122e',
                padding: '1rem',
                borderRadius: '8px',
                textAlign: 'center',
                border: `2px solid ${estaSubscrito ? '#ffd700' : '#ccc'}`,
              }}
            >
              <h4 style={{ margin: '0 0 1rem 0' }}>{d.nome || d}</h4>
              <button
                onClick={() => estaSubscrito ? desinscrever(d.nome || d) : subscrever(d.nome || d)}
                disabled={carregando}
                style={{
                  background: estaSubscrito ? '#ffd700' : '#04122e',
                  color: estaSubscrito ? '#04122e' : '#fff',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  width: '100%',
                }}
              >
                {estaSubscrito ? '✓ Subscrito' : '+ Subscrever'}
              </button>
            </div>
          );
        })}
      </div>

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} />}
    </div>
  );
}
