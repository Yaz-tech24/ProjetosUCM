import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Toast from '../components/Toast';

export default function VerificarEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [sucesso, setSucesso] = useState(false);
  const [toast, setToast] = useState(null);
  const [email, setEmail] = useState('');
  const [enviadoNovamente, setEnviadoNovamente] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      verificarToken(token);
    } else {
      setCarregando(false);
    }
  }, [searchParams]);

  const verificarToken = async (token) => {
    try {
      await axios.post('/api/verificar-email', { token });
      setSucesso(true);
      setToast({ tipo: 'sucesso', mensagem: 'Email verificado com sucesso!' });
      setTimeout(() => navigate('/login'), 2000);
    } catch (erro) {
      setToast({ tipo: 'erro', mensagem: 'Token inválido ou expirado. Tente pedir um novo.' });
      setCarregando(false);
    }
  };

  const reenviarEmail = async () => {
    if (!email.trim()) {
      setToast({ tipo: 'erro', mensagem: 'Digite o seu email' });
      return;
    }

    try {
      await axios.post('/api/reenviar-verificacao-email', { email });
      setToast({ tipo: 'sucesso', mensagem: 'Email reenviado! Verifique a sua caixa de entrada.' });
      setEnviadoNovamente(true);
    } catch (erro) {
      setToast({ tipo: 'erro', mensagem: 'Erro ao reenviar email' });
    }
  };

  if (carregando && !sucesso) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #04122e 0%, #1a2847 100%)'
      }}>
        <div style={{
          background: '#fff',
          padding: '2rem',
          borderRadius: '12px',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <h2>🔄 Verificando Email...</h2>
          <p style={{ color: '#666' }}>Por favor aguarde</p>
        </div>
      </div>
    );
  }

  if (sucesso) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #04122e 0%, #1a2847 100%)'
      }}>
        <div style={{
          background: '#fff',
          padding: '2rem',
          borderRadius: '12px',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <h2 style={{ color: '#04122e' }}>✅ Verificado!</h2>
          <p style={{ color: '#666' }}>Seu email foi confirmado com sucesso. Redirecionando...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #04122e 0%, #1a2847 100%)',
      padding: '1rem'
    }}>
      <div style={{
        background: '#fff',
        padding: '2rem',
        borderRadius: '12px',
        maxWidth: '400px',
        width: '100%'
      }}>
        <h2 style={{ color: '#04122e', marginBottom: '1rem' }}>Verificar Email</h2>

        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          {enviadoNovamente
            ? 'Email reenviado! Clique no link que recebeu.'
            : 'Não recebeu o email de verificação?'}
        </p>

        <input
          type="email"
          placeholder="Seu email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '4px',
            border: '1px solid #ccc',
            marginBottom: '1rem',
            boxSizing: 'border-box',
          }}
        />

        <button
          onClick={reenviarEmail}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: '#04122e',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: 'pointer',
            marginBottom: '1rem',
          }}
        >
          Reenviar Email de Verificação
        </button>

        <p style={{ color: '#999', fontSize: '0.9rem', textAlign: 'center' }}>
          Já tem uma conta verificada? <a href="/login" style={{ color: '#04122e', textDecoration: 'none', fontWeight: 'bold' }}>Entrar</a>
        </p>
      </div>

      {toast && <Toast tipo={toast.tipo} mensagem={toast.mensagem} />}
    </div>
  );
}
