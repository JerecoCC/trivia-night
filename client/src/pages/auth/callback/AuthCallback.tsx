/**
 * AuthCallback – Landing page after Google OAuth redirect.
 * The server sends the JWT as a ?token= query param.
 * We store it, verify it against /auth/me, then hard-reload into /dashboard
 * so AuthContext picks up the token on mount.
 */
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

import { API } from '@/lib/apiClient';

const AuthCallbackPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      navigate('/login?error=no_token');
      return;
    }

    localStorage.setItem('token', token);

    axios
      .get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(() => window.location.replace('/dashboard'))
      .catch(() => {
        localStorage.removeItem('token');
        navigate('/login?error=auth_failed');
      });
  }, [navigate, params]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg,#0d1b2a 0%,#1b3a5c 100%)',
        color: '#fff',
        fontSize: 18,
      }}
    >
      Signing you in…
    </div>
  );
};

export default AuthCallbackPage;
