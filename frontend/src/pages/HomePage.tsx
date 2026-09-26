import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Layers, HardDrive, LogOut, CheckCircle } from 'lucide-react';

export const HomePage: React.FC = () => {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-lg w-full glass-panel rounded-3xl p-8 border border-slate-800 shadow-2xl text-center space-y-6">
        {/* Brand Icon */}
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/25 flex items-center justify-center">
          <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
            <Layers className="w-7 h-7 text-indigo-400" />
          </div>
        </div>

        {/* Hello World Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold text-white tracking-tight">
            Hello World
          </h1>
          <p className="text-sm text-slate-400">
            Welcome to the Corporate Synapse Home Portal.
          </p>
        </div>

        {/* Token and Auth State Indicator */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-left space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              Authenticated (access_token stored)
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
              localStorage
            </span>
          </div>

          <div className="font-mono text-[11px] text-slate-300 break-all bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 max-h-24 overflow-y-auto">
            {token ? `access_token: ${token}` : 'No access_token found'}
          </div>

          {user?.name && (
            <p className="text-xs text-slate-400 pt-1">
              Logged in as: <span className="text-slate-200 font-medium">{user.name}</span>
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <Link
            to="/drive"
            className="w-full sm:flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/25 transition flex items-center justify-center gap-2"
          >
            <HardDrive className="w-4 h-4" />
            <span>Go to Drive Explorer</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full sm:w-auto py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
