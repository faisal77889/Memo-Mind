import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Layers,
  Lock,
  Mail,
  User as UserIcon,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Key,
  Eye,
  EyeOff,
  HardDrive,
  Cpu,
} from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { token, isAuthenticated, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [customToken, setCustomToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already authenticated, redirect to /home immediately
  useEffect(() => {
    if (isAuthenticated || token) {
      navigate('/home', { replace: true });
    }
  }, [isAuthenticated, token, navigate]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    if (isSignUp && !name) {
      setErrorMessage('Please enter your full name.');
      return;
    }

    setErrorMessage(
      'Google OAuth 2.0 is the active enterprise authentication provider. Please click "Continue with Google" or authenticate with a JWT token.'
    );
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setOauthLoading(true);

    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not initialize Google OAuth';
      setErrorMessage(msg);
      setOauthLoading(false);
    }
  };

  const handleDirectTokenLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customToken.trim()) return;

    login(customToken.trim());
    navigate('/home', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center relative overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      {/* Background glowing decorations */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-indigo-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[450px] h-[450px] bg-purple-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-10 left-10 w-[350px] h-[350px] bg-cyan-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Grid Pattern Overlay */}
      <div 
        className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370a_1px,transparent_1px),linear-gradient(to_bottom,#1f29370a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" 
      />

      <div className="relative max-w-5xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Column: Brand Hero & Capabilities */}
        <div className="lg:col-span-6 space-y-8 text-left hidden lg:block">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Corporate Synapse Platform v1.0</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.15]">
              Enterprise Knowledge{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-300 bg-clip-text text-transparent">
                Unified & Searchable
              </span>
            </h1>
            <p className="text-slate-400 text-base leading-relaxed">
              Connect your Google Drive, Gmail, and enterprise data streams into a high-performance vector synapse with role-based security.
            </p>
          </div>

          {/* Feature Badges */}
          <div className="space-y-3.5 pt-2">
            <div className="flex items-center gap-3 p-3 rounded-xl glass-card border-slate-800">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200">Google Drive Real-time Sync</h4>
                <p className="text-xs text-slate-400">Browse files, docs, spreadsheets, and search metadata seamlessly.</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl glass-card border-slate-800">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200">OAuth 2.0 & JWT Security</h4>
                <p className="text-xs text-slate-400">Granular permissions with token exchange and refresh lifecycle.</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl glass-card border-slate-800">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200">Vector Search Ingestion</h4>
                <p className="text-xs text-slate-400">Automated embedding pipeline for high-speed enterprise semantic search.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Authentication Card */}
        <div className="lg:col-span-6">
          <div className="w-full glass-panel rounded-3xl p-7 sm:p-9 shadow-2xl border border-slate-800/80 relative">
            
            {/* Logo */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/20">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <Layers className="w-5 h-5 text-indigo-400" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Corporate Synapse</h2>
                <p className="text-xs text-slate-400">Sign in to access your workspace</p>
              </div>
            </div>

            {/* Tab switch */}
            <div className="flex rounded-xl bg-slate-900/90 p-1 mb-6 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setErrorMessage(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  !isSignUp
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  setErrorMessage(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  isSignUp
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Error banner */}
            {errorMessage && (
              <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Google OAuth Button */}
            <button
              onClick={handleGoogleLogin}
              disabled={oauthLoading}
              type="button"
              className="w-full py-3.5 px-4 rounded-xl border border-slate-700 bg-slate-900/90 hover:bg-slate-800/90 text-white font-medium text-sm flex items-center justify-center gap-3 shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-60 cursor-pointer group"
            >
              {oauthLoading ? (
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span className="group-hover:text-indigo-200 transition-colors font-semibold">
                {oauthLoading
                  ? 'Connecting to Google...'
                  : isSignUp
                  ? 'Sign up with Google Workspace'
                  : 'Continue with Google'}
              </span>
            </button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900 px-3 text-slate-500 font-mono tracking-wider">
                  or credentials
                </span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm placeholder:text-slate-600 focus:outline-none transition"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Work Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm placeholder:text-slate-600 focus:outline-none transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Password
                  </label>
                  {!isSignUp && (
                    <span className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer">
                      Forgot password?
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl glass-input text-sm placeholder:text-slate-600 focus:outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-600/30 transition duration-200 flex items-center justify-center gap-2 mt-2"
              >
                <span>{isSignUp ? 'Create Corporate Account' : 'Sign In to Synapse'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Bottom Actions: Direct Token Auth Drawer Toggle */}
            <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-center text-xs">
              <button
                type="button"
                onClick={() => setShowTokenModal(!showTokenModal)}
                className="inline-flex items-center gap-1.5 text-slate-400 hover:text-indigo-300 transition cursor-pointer"
              >
                <Key className="w-3.5 h-3.5 text-indigo-400" />
                <span>Manual JWT Access Token Auth</span>
              </button>
            </div>

            {/* Direct Token Input Drawer */}
            {showTokenModal && (
              <form onSubmit={handleDirectTokenLogin} className="mt-4 p-3.5 rounded-xl bg-slate-900/95 border border-indigo-500/30 space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-300">Paste JWT Access Token</span>
                  <span className="text-[10px] text-slate-500 font-mono">Bearer scheme</span>
                </div>
                <input
                  type="text"
                  value={customToken}
                  onChange={(e) => setCustomToken(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!customToken.trim()}
                  className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition disabled:opacity-40"
                >
                  Authenticate & Go to /home
                </button>
              </form>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
