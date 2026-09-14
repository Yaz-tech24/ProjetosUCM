import { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import Toast from '../components/Toast';

export default function Analytics() {
  const [dados, setDados] = useState(null);
  const [disciplinas, setDisciplinas] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [auditoria, setAuditoria] = useState([]);
  const [tab, setTab] = useState('dashboard');
  const [carregando, setCarregando] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setCarregando(true);
    try {
      const [dash, disc, mat, aud] = await Promise.all([
        axios.get('/api/admin/analytics/dashboard'),
        axios.get('/api/admin/analytics/disciplinas'),
        axios.get('/api/admin/analytics/materiais-populares'),
        axios.get('/api/admin/auditoria'),
      ]);

      setDados(dash.data);
      setDisciplinas(disc.data);
      setMateriais(mat.data);
      setAuditoria(aud.data.auditoria);
    } catch (erro) {
      setToast({ tipo: 'erro', mensagem: 'Erro ao carregar dados' });
      console.error(erro);
    } finally {
      setCarregando(false);
    }
  };

  if (carregando) return <Layout><div style={{ textAlign: 'center', padding: '2rem' }}>Carregando...</div></Layout>;

  return (
    <Layout>
      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <h1>📊 Dashboard de Analytics</h1>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', overflowX: 'auto' }}>
          {['dashboard', 'disciplinas', 'populares', 'auditoria'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? '#04122e' : '#fff',
                color: tab === t ? '#fff' : '#04122e',
                border: '1px solid #ccc',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
              }}
            >
              {t === 'dashboard' && '📈 Dashboard'}
              {t === 'disciplinas' && '📚 Disciplinas'}
              {t === 'populares' && '⭐ Populares'}
              {t === 'auditoria' && '🔍 Auditoria'}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && dados && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h4 style={{ color: '#666', margin: '0 0 1rem 0' }}>👥 Utilizadores</h4>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#04122e' }}>{dados.usuarios.total}</div>
                <small style={{ color: '#999' }}>
                  {dados.usuarios.estudantes} estudantes · {dados.usuarios.professores} professores
                </small>
              </div>

              <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h4 style={{ color: '#666', margin: '0 0 1rem 0' }}>📚 Materiais Aprovados</h4>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#04122e' }}>{dados.materiais.aprovados}</div>
                <small style={{ color: '#999' }}>
                  {dados.materiais.pendentes} pendentes · {dados.materiais.rejeitados} rejeitados
                </small>
              </div>

              <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h4 style={{ color: '#666', margin: '0 0 1rem 0' }}>💬 Chat (30 dias)</h4>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#04122e' }}>{dados.chat.total_mensagens}</div>
                <small style={{ color: '#999' }}>{dados.chat.usuarios_ativos} usuários ativos</small>
              </div>

              <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h4 style={{ color: '#666', margin: '0 0 1rem 0' }}>⭐ Avaliações</h4>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#04122e' }}>
                  {dados.avaliacoes.media_geral?.toFixed(1) || 'N/A'}
                </div>
                <small style={{ color: '#999' }}>{dados.avaliacoes.total} avaliações</small>
              </div>
            </div>
          </div>
        )}

        {tab === 'disciplinas' && (
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px' }}>
            <h3>Materiais por Disciplina</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ccc' }}>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Disciplina</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>Total</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>Aprovados</th>
                  <th style={{ padding: '1rem', textAlign: 'center' }}>Média</th>
                </tr>
              </thead>
              <tbody>
                {disciplinas.map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '1rem' }}>{d.cadeira}</td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>{d.total}</td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>{d.aprovados}</td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      {d.media_avaliacoes ? d.media_avaliacoes.toFixed(1) : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'populares' && (
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px' }}>
            <h3>🏆 Materiais Mais Populares</h3>
            {materiais.map((m, i) => (
              <div key={m.id} style={{ padding: '1rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>#{i + 1} - {m.titulo}</strong>
                  <div style={{ color: '#666', fontSize: '0.9rem' }}>{m.cadeira}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div>⭐ {m.media_nota?.toFixed(1) || 'N/A'} ({m.total_avaliacoes} avaliações)</div>
                  <small style={{ color: '#666' }}>💬 {m.total_comentarios} comentários</small>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'auditoria' && (
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px' }}>
            <h3>🔍 Log de Auditoria</h3>
            <div style={{ marginTop: '1rem', maxHeight: '600px', overflowY: 'auto' }}>
              {auditoria.map((a, i) => (
                <div key={i} style={{ padding: '0.75rem', borderBottom: '1px solid #eee', fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 'bold', color: '#04122e' }}>{a.acao}</span> ·
                  <span style={{ color: '#666' }}> {a.usuario || 'Sistema'}</span> ·
                  <small style={{ color: '#999' }}> {new Date(a.data_hora).toLocaleString()}</small>
                  {a.descricao && <div style={{ color: '#666', marginTop: '0.25rem' }}>{a.descricao}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} />}
    </Layout>
  );
}
