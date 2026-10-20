import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import { SyncModal } from '../components/SyncModal';
import {
  HardDrive,
  MessageSquare,
  Mail,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  BookOpen,
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const { user } = useAuth();
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f7f7f5] dark:bg-[#101613] text-stone-900 dark:text-stone-100 flex flex-col transition-colors duration-200">
      <Navbar onRefresh={() => setIsSyncModalOpen(true)} />

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Hero Section */}
        <div className="rounded-3xl p-8 sm:p-12 border border-stone-200/90 dark:border-[#24352b] bg-white dark:bg-[#16211b] shadow-xs relative overflow-hidden transition-colors duration-200">
          <div className="max-w-2xl space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#1b3b2e]/10 dark:bg-[#285743]/30 text-[#1b3b2e] dark:text-[#88d4a6] border border-[#1b3b2e]/20 dark:border-[#285743]/50">
              <Sparkles className="w-3.5 h-3.5 text-[#285743] dark:text-[#88d4a6]" />
              <span>Your Personal Assistant</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-100 leading-tight">
              Everything in Drive & Gmail, <span className="text-[#1b3b2e] dark:text-[#6ec896]">remembered for you.</span>
            </h1>

            <p className="text-sm sm:text-base text-stone-600 dark:text-stone-300 leading-relaxed">
              Memo Mind keeps track of your Google Drive documents, spreadsheets, PDFs, and Gmail messages so you can ask questions, find answers, and never lose track of important information.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/chat"
                className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#1b3b2e] hover:bg-[#142e24] dark:bg-[#285743] dark:hover:bg-[#1f4534] shadow-xs transition flex items-center gap-2"
              >
                <MessageSquare className="w-4 h-4 text-[#a3d9b8]" />
                <span>Ask Memo a Question</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                to="/drive"
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-stone-700 dark:text-stone-200 bg-stone-100 dark:bg-[#1e2a22] hover:bg-stone-200 dark:hover:bg-[#25362c] border border-stone-200 dark:border-[#283b30] transition flex items-center gap-2"
              >
                <HardDrive className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>Google Drive</span>
              </Link>

              <Link
                to="/gmail"
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-stone-700 dark:text-stone-200 bg-stone-100 dark:bg-[#1e2a22] hover:bg-stone-200 dark:hover:bg-[#25362c] border border-stone-200 dark:border-[#283b30] transition flex items-center gap-2"
              >
                <Mail className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>Gmail</span>
              </Link>

              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-[#1e2a22] transition flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Sync Library</span>
              </button>
            </div>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Ask Memo */}
          <div className="rounded-2xl p-6 bg-white dark:bg-[#16211b] border border-stone-200/90 dark:border-[#24352b] shadow-xs hover:border-[#1b3b2e]/40 dark:hover:border-[#285743] transition flex flex-col justify-between group space-y-4">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#1b3b2e]/10 dark:bg-[#285743]/30 text-[#1b3b2e] dark:text-[#88d4a6] border border-[#1b3b2e]/20 dark:border-[#285743]/40 flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                Ask Memo
              </h3>
              <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                Ask questions about your project notes, emails, or spreadsheets in plain English and get quick, reliable answers with direct file citations.
              </p>
            </div>
            <Link
              to="/chat"
              className="text-xs font-semibold text-[#1b3b2e] dark:text-[#88d4a6] hover:underline flex items-center gap-1.5 transition pt-2"
            >
              <span>Ask a question</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
            </Link>
          </div>

          {/* Card 2: Google Drive */}
          <div className="rounded-2xl p-6 bg-white dark:bg-[#16211b] border border-stone-200/90 dark:border-[#24352b] shadow-xs hover:border-[#1b3b2e]/40 dark:hover:border-[#285743] transition flex flex-col justify-between group space-y-4">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center justify-center">
                <HardDrive className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                Google Drive Files
              </h3>
              <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                Browse documents, sheets, slides, and PDFs. Preview files directly or save them into Memo Mind for instant search anytime.
              </p>
            </div>
            <Link
              to="/drive"
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1.5 transition pt-2"
            >
              <span>Browse your files</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
            </Link>
          </div>

          {/* Card 3: Gmail */}
          <div className="rounded-2xl p-6 bg-white dark:bg-[#16211b] border border-stone-200/90 dark:border-[#24352b] shadow-xs hover:border-[#1b3b2e]/40 dark:hover:border-[#285743] transition flex flex-col justify-between group space-y-4">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 border border-teal-200/60 dark:border-teal-800/40 flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                Gmail Messages
              </h3>
              <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                Keep track of important emails with sender information, clear subject lines, and preview snippets. Always know what was said.
              </p>
            </div>
            <Link
              to="/gmail"
              className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1.5 transition pt-2"
            >
              <span>View messages</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
            </Link>
          </div>
        </div>

        {/* Status Bar */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#16211b] border border-stone-200/90 dark:border-[#24352b] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs transition-colors duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-stone-600 dark:text-stone-300">
              Personal account: <strong className="text-stone-900 dark:text-stone-100 font-semibold">{user?.email || user?.name || 'Connected'}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-[#1d2a22] border border-stone-200 dark:border-[#283b30] text-stone-700 dark:text-stone-300 font-medium">
              Google Drive Connected
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-[#1d2a22] border border-stone-200 dark:border-[#283b30] text-stone-700 dark:text-stone-300 font-medium">
              Gmail Connected
            </span>
            <button
              onClick={() => setIsSyncModalOpen(true)}
              className="text-[#1b3b2e] dark:text-[#88d4a6] hover:underline font-semibold pl-2"
            >
              Sync Settings
            </button>
          </div>
        </div>
      </main>

      {/* Sync Modal */}
      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
      />
    </div>
  );
};
