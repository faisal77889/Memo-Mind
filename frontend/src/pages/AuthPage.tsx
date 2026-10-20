import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  BookOpen,
  Mail,
  HardDrive,
  MessageSquare,
  AlertCircle,
  KeyRound,
  Sparkles,
  Sun,
  Moon,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { token, isAuthenticated, login, loginWithGoogle } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [customToken, setCustomToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already authenticated, redirect to /home immediately
  useEffect(() => {
    if (isAuthenticated || token) {
      navigate('/home', { replace: true });
    }
  }, [isAuthenticated, token, navigate]);

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setOauthLoading(true);

    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not connect to Google. Please try again.';
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
    <div className="min-h-screen bg-[#f7f7f5] dark:bg-[#101613] flex flex-col justify-center relative overflow-hidden px-4 py-12 sm:px-6 lg:px-8 text-stone-900 dark:text-stone-100 transition-colors duration-200">
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 bg-white/80 dark:bg-[#18231d]/80 border border-stone-200 dark:border-[#283b30] shadow-xs transition"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          type="button"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#285743]" />}
        </button>
      </div>

      <div className="relative max-w-5xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Column: Product Value & Features */}
        <div className="lg:col-span-6 space-y-8 text-left hidden lg:block">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1b3b2e]/10 dark:bg-[#285743]/30 border border-[#1b3b2e]/20 dark:border-[#285743]/50 text-[#1b3b2e] dark:text-[#88d4a6] text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-[#285743] dark:text-[#88d4a6]" />
            <span>Your Personal Memory Assistant</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-bold text-stone-900 dark:text-stone-100 tracking-tight leading-tight">
              Remember everything,{' '}
              <span className="text-[#1b3b2e] dark:text-[#6ec896]">effortlessly.</span>
            </h1>
            <p className="text-stone-600 dark:text-stone-300 text-base leading-relaxed max-w-lg">
              Memo Mind connects with your Google Drive and Gmail so you can search documents, track conversation threads, and get instant answers from your personal files.
            </p>
          </div>

          {/* Feature List */}
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-white dark:bg-[#16211b] border border-stone-200/90 dark:border-[#24352b] shadow-xs">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/40 shrink-0">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Google Drive Documents</h4>
                <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5 leading-relaxed">
                  Search through spreadsheets, slides, PDFs, and notes without digging through nested folders.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-white dark:bg-[#16211b] border border-stone-200/90 dark:border-[#24352b] shadow-xs">
              <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-800/40 shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Gmail Messages</h4>
                <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5 leading-relaxed">
                  Keep track of important emails with sender previews, dates, and full text search.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-white dark:bg-[#16211b] border border-stone-200/90 dark:border-[#24352b] shadow-xs">
              <div className="p-2.5 rounded-xl bg-[#1b3b2e]/10 dark:bg-[#285743]/30 text-[#1b3b2e] dark:text-[#88d4a6] border border-[#1b3b2e]/20 dark:border-[#285743]/40 shrink-0">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Ask Memo Anything</h4>
                <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5 leading-relaxed">
                  Ask questions in plain English and get thoughtful, accurate answers referenced directly to your documents.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Google Sign In Card */}
        <div className="lg:col-span-6">
          <div className="w-full bg-white dark:bg-[#16211b] rounded-3xl p-8 sm:p-10 border border-stone-200 dark:border-[#24352b] shadow-xs relative transition-colors duration-200 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#1b3b2e] dark:bg-[#285743] flex items-center justify-center text-white shadow-xs shrink-0">
                <BookOpen className="w-6 h-6 text-[#a3d9b8]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">Welcome to Memo Mind</h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">Sign in with Google to connect your library</p>
              </div>
            </div>

            {/* Error message */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Primary Google Login Button */}
            <div className="space-y-3 pt-2">
              <button
                onClick={handleGoogleLogin}
                disabled={oauthLoading}
                type="button"
                className="w-full py-3.5 px-5 rounded-2xl border border-stone-300 dark:border-[#2b4134] bg-white dark:bg-[#1c2c23] hover:bg-stone-50 dark:hover:bg-[#23382c] text-stone-800 dark:text-stone-100 font-semibold text-sm flex items-center justify-center gap-3 transition shadow-xs hover:shadow-sm cursor-pointer disabled:opacity-60"
              >
                {oauthLoading ? (
                  <div className="w-5 h-5 border-2 border-[#1b3b2e] dark:border-[#88d4a6] border-t-transparent rounded-full animate-spin" />
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
                <span className="text-sm">
                  {oauthLoading ? 'Connecting to Google...' : 'Continue with Google'}
                </span>
              </button>

              <p className="text-[11px] text-stone-500 dark:text-stone-400 text-center leading-relaxed">
                Connects directly to your Google Drive and Gmail accounts securely.
              </p>
            </div>

            {/* Why Google Login card */}
            <div className="p-4 rounded-2xl bg-stone-50 dark:bg-[#121c17] border border-stone-200/80 dark:border-[#24352b] space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-800 dark:text-stone-200">
                <ShieldCheck className="w-4 h-4 text-[#1b3b2e] dark:text-[#88d4a6]" />
                <span>What Memo Mind connects:</span>
              </div>
              <ul className="space-y-1.5 text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#285743] dark:text-[#88d4a6] shrink-0 mt-0.5" />
                  <span>Read access to your Google Drive documents & spreadsheets</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#285743] dark:text-[#88d4a6] shrink-0 mt-0.5" />
                  <span>Read access to your Gmail messages & conversation threads</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#285743] dark:text-[#88d4a6] shrink-0 mt-0.5" />
                  <span>No passwords stored — authenticated directly via Google</span>
                </li>
              </ul>
            </div>

            {/* Subtle access code option */}
            <div className="pt-2 border-t border-stone-100 dark:border-[#24352b] flex flex-col items-center">
              <button
                type="button"
                onClick={() => setShowTokenInput(!showTokenInput)}
                className="inline-flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 transition py-1"
              >
                <KeyRound className="w-3.5 h-3.5 text-stone-400" />
                <span>Have an access token? Click here</span>
              </button>

              {showTokenInput && (
                <form onSubmit={handleDirectTokenLogin} className="mt-3 w-full p-3.5 rounded-xl bg-stone-50 dark:bg-[#121c17] border border-stone-200 dark:border-[#24352b] space-y-2.5">
                  <span className="text-xs font-semibold text-stone-700 dark:text-stone-300 block">Access Token</span>
                  <input
                    type="text"
                    value={customToken}
                    onChange={(e) => setCustomToken(e.target.value)}
                    placeholder="Paste access token here..."
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#18231d] border border-stone-200 dark:border-[#283b30] text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:outline-none focus:border-[#1b3b2e] dark:focus:border-[#285743]"
                  />
                  <button
                    type="submit"
                    disabled={!customToken.trim()}
                    className="w-full py-1.5 rounded-lg bg-[#1b3b2e] hover:bg-[#142e24] dark:bg-[#285743] dark:hover:bg-[#1f4534] text-xs font-semibold text-white transition disabled:opacity-40"
                  >
                    Continue
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
