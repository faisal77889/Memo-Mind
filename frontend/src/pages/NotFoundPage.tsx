import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Home, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#f7f7f5] dark:bg-[#101613] flex flex-col items-center justify-center p-4 text-center transition-colors duration-200">
      <div className="w-12 h-12 rounded-xl bg-[#1b3b2e] dark:bg-[#285743] flex items-center justify-center text-white mb-4 shadow-xs">
        <BookOpen className="w-6 h-6 text-[#a3d9b8]" />
      </div>
      <h1 className="text-4xl font-serif font-bold text-stone-900 dark:text-stone-100 tracking-tight mb-2">404</h1>
      <h2 className="text-lg font-medium text-stone-700 dark:text-stone-300 mb-2">Page Not Found</h2>
      <p className="text-sm text-stone-500 dark:text-stone-400 max-w-sm mb-6">
        The page you are looking for does not exist or may have been moved.
      </p>
      <div className="flex items-center gap-3">
        <Link
          to="/home"
          className="px-4 py-2.5 rounded-xl bg-[#1b3b2e] hover:bg-[#142e24] dark:bg-[#285743] dark:hover:bg-[#1f4534] text-xs font-medium text-white shadow-xs transition flex items-center gap-2"
        >
          <Home className="w-4 h-4" />
          <span>Go to Home</span>
        </Link>
        <Link
          to="/login"
          className="px-4 py-2.5 rounded-xl bg-white dark:bg-[#18231d] border border-stone-200 dark:border-[#283b30] hover:bg-stone-100 dark:hover:bg-[#212f27] text-xs font-medium text-stone-700 dark:text-stone-200 transition flex items-center gap-2 shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Sign In</span>
        </Link>
      </div>
    </div>
  );
};
