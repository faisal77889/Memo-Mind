import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  BookOpen,
  HardDrive,
  Mail,
  LogOut,
  User as UserIcon,
  RefreshCw,
  MessageSquare,
  Home,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface NavbarProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onRefresh, isRefreshing = false }) => {
  const { user, logout, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-stone-200/90 dark:border-[#24352b] bg-white/90 dark:bg-[#141d18]/90 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <div className="flex items-center space-x-8">
            <Link to="/home" className="flex items-center space-x-3 group">
              <div className="w-8 h-8 rounded-lg bg-[#1b3b2e] dark:bg-[#285743] flex items-center justify-center text-white shadow-xs transition group-hover:scale-105">
                <BookOpen className="w-4 h-4 text-[#a3d9b8]" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-bold text-stone-900 dark:text-stone-100 tracking-tight leading-tight">
                  Memo Mind
                </span>
                <span className="text-[10px] font-medium text-stone-500 dark:text-[#7f998c] uppercase tracking-wider">
                  Personal Assistant
                </span>
              </div>
            </Link>

            {/* Navigation links */}
            {isAuthenticated && (
              <nav className="hidden md:flex items-center space-x-1">
                <Link
                  to="/home"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    location.pathname === '/home'
                      ? 'bg-[#1b3b2e]/10 text-[#1b3b2e] dark:bg-[#285743]/30 dark:text-[#88d4a6]'
                      : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-[#1c2922]'
                  }`}
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Home</span>
                </Link>

                <Link
                  to="/drive"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    location.pathname.startsWith('/drive')
                      ? 'bg-[#1b3b2e]/10 text-[#1b3b2e] dark:bg-[#285743]/30 dark:text-[#88d4a6]'
                      : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-[#1c2922]'
                  }`}
                >
                  <HardDrive className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  <span>Google Drive</span>
                </Link>

                <Link
                  to="/gmail"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    location.pathname.startsWith('/gmail')
                      ? 'bg-[#1b3b2e]/10 text-[#1b3b2e] dark:bg-[#285743]/30 dark:text-[#88d4a6]'
                      : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-[#1c2922]'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span>Gmail</span>
                </Link>

                <Link
                  to="/chat"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                    location.pathname.startsWith('/chat')
                      ? 'bg-[#1b3b2e] text-white dark:bg-[#2e624c] dark:text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-[#1c2922]'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[#a3d9b8]" />
                  <span>Ask Memo</span>
                </Link>
              </nav>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center space-x-2.5">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-[#1d2a23] border border-stone-200 dark:border-[#283b30] transition"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-[#285743]" />
              )}
            </button>

            {onRefresh && isAuthenticated && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Check for new files & emails"
                className="p-2 rounded-lg text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-[#1d2a23] border border-stone-200 dark:border-[#283b30] transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#285743] dark:text-[#7fcaa0]' : ''}`} />
              </button>
            )}

            {isAuthenticated ? (
              <div className="flex items-center space-x-3 pl-2.5 border-l border-stone-200 dark:border-[#283b30]">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-full bg-[#1b3b2e]/10 dark:bg-[#285743]/30 text-[#1b3b2e] dark:text-[#a3d9b8] flex items-center justify-center text-xs font-semibold">
                    {user?.name ? user.name.charAt(0).toUpperCase() : <UserIcon className="w-3.5 h-3.5" />}
                  </div>
                  <span className="hidden sm:inline text-xs font-medium text-stone-700 dark:text-stone-300 max-w-[130px] truncate">
                    {user?.name || user?.email || 'My Account'}
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-[#1b3b2e] hover:bg-[#142e24] dark:bg-[#285743] dark:hover:bg-[#1f4534] transition shadow-xs"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
