import React from 'react';
import { Link } from 'react-router-dom';
import { Layers, Home, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-6">
        <Layers className="w-8 h-8 text-indigo-400" />
      </div>
      <h1 className="text-4xl font-extrabold text-white tracking-tight mb-2">404</h1>
      <h2 className="text-xl font-bold text-slate-200 mb-3">Page Not Found</h2>
      <p className="text-sm text-slate-400 max-w-sm mb-6">
        The requested Synapse route does not exist or you might not have sufficient permissions.
      </p>
      <div className="flex items-center gap-3">
        <Link
          to="/drive"
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition flex items-center gap-2"
        >
          <Home className="w-4 h-4" />
          <span>Go to Drive Hub</span>
        </Link>
        <Link
          to="/login"
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Login</span>
        </Link>
      </div>
    </div>
  );
};
