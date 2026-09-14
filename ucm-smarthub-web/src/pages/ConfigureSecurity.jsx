import { useState, useEffect } from 'react';
import axios from 'axios';
import Layout from '../components/Layout';
import Toast from '../components/Toast';

export default function ConfigureSecurity() {
  const [twoFAativado, setTwoFAativado] = useState(false);
  const [mostrarSetup2FA, setMostrarSetup2FA] = useState(false);
  const [secret, setSecret] = useState('');
  const [codigo2FA, setCodigo2FA] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    verificarStatus2FA();
  }, []);

  const verificarStatus2FA = async () => {
    try {
      const { data } = await axios.get('/api/2fa/status');
      setTwoFAativado(data.ativado);
    } catch {
      // Erro ao verificar 2FA
    } finally {
      setCarregando(false);
    }
  };

  const gerarSecret = async () => {
    try {
      const { data } = await axios.post('/api/2fa/gerar-secret');
      setSecret(data.secret);
      setMostrarSetup2FA(true);
      setToast({ tipo: 'info', mensagem: 'Secret gerado. Escaneie o QR code com sua app de autenticação.' });
    } catch {
      setToast({ tipo: 'erro', mensagem: 'Erro ao gerar secret' });
    }
  };

  const confirmar2FA = async () => {
    if (!codigo2FA.match(/^\d{6}$/)) {
      setToast({ tipo: 'erro', mensagem: 'Código deve ter 6 dígitos' });
      return;
    }

    try {
      await axios.post('/api/2fa/confirmar', { codigo: codigo2FA });
      setToast({ tipo: 'sucesso', mensagem: '2FA ativado com sucesso!' });
      setMostrarSetup2FA(false);
      setCodigo2FA('');
      verificarStatus2FA();
    } catch {
      setToast({ tipo: 'erro', mensagem: 'Código inválido' });
    }
  };

  const desativar2FA = async () => {
    const codigo = prompt('Digite o código 2FA para desativar:');
    if (!codigo) return;

    try {
      await axios.post('/api/2fa/desativar', { codigo });
      setToast({ tipo: 'sucesso', mensagem: '2FA desativado' });
      verificarStatus2FA();
    } catch {
      setToast({ tipo: 'erro', mensagem: 'Código inválido' });
    }
  };

  if (carregando) return <Layout><div style={{ textAlign: 'center', padding: '2rem' }}>Carregando...</div></Layout>;

  return (
    <Layout>
      <div style={{ maxWidth: '600px', margin: '2rem auto', padding: '0 1rem' }}>
        <h1>🔐 Segurança</h1>

        <div style={{ background: '#fff', padding: '2rem', borderRadius: '8px', marginBottom: '1rem' }}>
          <h3>Two-Factor Authentication (2FA)</h3>
          <p style={{ color: '#666' }}>Adicione uma camada extra de segurança à sua conta usando autenticação de dois fatores.</p>

          <div style={{
            background: twoFAativado ? '#d4edda' : '#fff3cd',
            border: `1px solid ${twoFAativado ? '#28a745' : '#ffc107'}`,
            padding: '1rem',
            borderRadius: '4px',
            marginBottom: '1.5rem'
          }}>
            <p style={{ margin: 0 }}>
              Status: <strong>{twoFAativado ? '✅ Ativado' : '⚠️ Desativado'}</strong>
            </p>
          </div>

          {!twoFAativado && !mostrarSetup2FA && (
            <button
              onClick={gerarSecret}
              style={{
                background: '#04122e',
                color: '#fff',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Ativar 2FA
            </button>
          )}

          {mostrarSetup2FA && (
            <div style={{ background: '#f5f5f5', padding: '1.5rem', borderRadius: '4px' }}>
              <h4>Configurar 2FA</h4>
              <p>1. Escaneie este código QR com sua app (Google Authenticator, Authy, etc.):</p>
              <div style={{
                background: '#fff',
                padding: '1rem',
                borderRadius: '4px',
                textAlign: 'center',
                marginBottom: '1rem',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                wordBreak: 'break-all'
              }}>
                {secret}
              </div>
              <p>2. Digite o código de 6 dígitos da sua app:</p>
              <input
                type="text"
                value={codigo2FA}
                onChange={e => setCodigo2FA(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength="6"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  marginBottom: '1rem',
                  fontSize: '1.2rem',
                  textAlign: 'center',
                  letterSpacing: '0.2em',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  onClick={confirmar2FA}
                  style={{
                    flex: 1,
                    background: '#28a745',
                    color: '#fff',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  Confirmar
                </button>
                <button
                  onClick={() => { setMostrarSetup2FA(false); setCodigo2FA(''); }}
                  style={{
                    flex: 1,
                    background: '#ccc',
                    color: '#333',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {twoFAativado && (
            <button
              onClick={desativar2FA}
              style={{
                background: '#dc3545',
                color: '#fff',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Desativar 2FA
            </button>
          )}
        </div>

        <div style={{ background: '#fff', padding: '2rem', borderRadius: '8px' }}>
          <h3>💡 Dicas de Segurança</h3>
          <ul style={{ color: '#666' }}>
            <li>Use senhas fortes e únicas</li>
            <li>Ative 2FA para proteção adicional</li>
            <li>Não partilhe seu email ou senha com ninguém</li>
            <li>Mantenha sua app de autenticação segura</li>
          </ul>
        </div>
      </div>

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} />}
    </Layout>
  );
}
