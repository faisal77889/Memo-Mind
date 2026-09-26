import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authGoogle, getApiErrorMessage } from '../services/api';
import { Layers, AlertCircle } from 'lucide-react';

export const OAuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuth = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const code = searchParams.get('code') || hashParams.get('code');
      const token =
        searchParams.get('access_token') ||
        searchParams.get('token') ||
        hashParams.get('access_token') ||
        hashParams.get('token');
      const authError = searchParams.get('error') || hashParams.get('error');

      if (authError) {
        setError(`Google authorization error: ${authError}`);
        return;
      }

      // If token is already present directly in query/hash
      if (token) {
        login(token);
        navigate('/home', { replace: true });
        return;
      }

      // If code is returned, exchange it with backend
      if (code) {
        try {
          const response = await authGoogle(code);
          if (response.access_token) {
            login(response.access_token);
            navigate('/home', { replace: true });
          } else if (response.url) {
            // Need re-consent
            window.location.href = response.url;
          } else {
            setError('No access token received from authentication exchange.');
          }
        } catch (err: unknown) {
          setError(getApiErrorMessage(err) || 'Failed to exchange authorization code for access token.');
        }
      } else {
        setError('No authorization parameters found in the callback URL.');
      }
    };

    handleAuth();
  }, [searchParams, login, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full glass-panel rounded-3xl p-6 border border-rose-500/20 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white">Authentication Failed</h2>
          <p className="text-xs text-rose-300">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="relative flex items-center justify-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
          <Layers className="w-8 h-8 text-indigo-400 animate-pulse" />
        </div>
        <div className="absolute inset-0 rounded-2xl border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-300">
        Completing Google Workspace Authentication...
      </p>
    </div>
  );
};
