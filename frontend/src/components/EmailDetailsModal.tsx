import React, { useState } from 'react';
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Mail,
  GitBranch,
  Sparkles,
  Code2,
  CheckCircle,
} from 'lucide-react';
import type { GmailMessageItem } from '../types';

interface EmailDetailsModalProps {
  message: GmailMessageItem | null;
  onClose: () => void;
  onSync?: (message: GmailMessageItem) => Promise<void>;
  isSyncing?: boolean;
  isSynced?: boolean;
  syncError?: string | null;
}

export const EmailDetailsModal: React.FC<EmailDetailsModalProps> = ({
  message,
  onClose,
  onSync,
  isSyncing = false,
  isSynced = false,
  syncError = null,
}) => {
  const [copied, setCopied] = useState(false);

  if (!message) return null;

  const handleCopyId = () => {
    navigator.clipboard.writeText(message.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getGmailLink = () => {
    return `https://mail.google.com/mail/u/0/#all/${message.threadId || message.id}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 dark:bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#16211b] rounded-2xl p-6 shadow-xl border border-stone-200 dark:border-[#24352b] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-stone-100 dark:border-[#24352b]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#1b3b2e]/10 dark:bg-[#285743]/30 border border-[#1b3b2e]/20 dark:border-[#285743]/50 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-[#1b3b2e] dark:text-[#88d4a6]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 truncate max-w-[340px]">
                {message.subject || `Email Message #${message.id.slice(0, 8)}`}
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-mono truncate">
                Thread: {message.threadId || 'Single Message'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#1f2e26] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metadata Details Grid */}
        <div className="py-4 space-y-3">
          {/* Message ID */}
          <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#121c17] border border-stone-200/80 dark:border-[#24352b] flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Code2 className="w-4 h-4 text-stone-500 dark:text-stone-400 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold">
                  Gmail Message ID
                </span>
                <span className="text-xs font-mono text-stone-700 dark:text-stone-300 truncate max-w-[280px]">
                  {message.id}
                </span>
              </div>
            </div>
            <button
              onClick={handleCopyId}
              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1c2c23] border border-stone-200 dark:border-[#2b4134] hover:bg-stone-100 dark:hover:bg-[#23382c] text-stone-700 dark:text-stone-200 transition flex items-center gap-1 text-xs shrink-0 shadow-xs"
              title="Copy Message ID"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-stone-500" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {/* Sender & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#121c17] border border-stone-200/80 dark:border-[#24352b]">
              <span className="block text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold mb-1">
                From
              </span>
              <span className="text-xs text-stone-800 dark:text-stone-200 truncate block font-medium" title={message.from}>
                {message.from || 'Unknown Sender'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#121c17] border border-stone-200/80 dark:border-[#24352b]">
              <span className="block text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold mb-1">
                Date
              </span>
              <span className="text-xs text-stone-800 dark:text-stone-200 truncate block font-medium">
                {message.date || 'Not available'}
              </span>
            </div>
          </div>

          {/* Snippet Preview */}
          {message.snippet && (
            <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#121c17] border border-stone-200/80 dark:border-[#24352b] space-y-1">
              <span className="block text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold">
                Email Preview
              </span>
              <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed italic">
                "{message.snippet}"
              </p>
            </div>
          )}

          {/* Thread ID */}
          <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#121c17] border border-stone-200/80 dark:border-[#24352b] flex items-center gap-2.5">
            <GitBranch className="w-4 h-4 text-stone-500 dark:text-stone-400 shrink-0" />
            <div className="min-w-0">
              <span className="block text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold">
                Conversation Thread ID
              </span>
              <span className="text-xs font-mono text-stone-700 dark:text-stone-300 truncate block">
                {message.threadId}
              </span>
            </div>
          </div>

          {/* Memo Mind Status Card */}
          <div className="p-3.5 rounded-xl bg-[#1b3b2e]/5 dark:bg-[#285743]/15 border border-[#1b3b2e]/15 dark:border-[#285743]/30 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-[#1b3b2e] dark:text-[#88d4a6] mt-0.5 shrink-0" />
            <div className="text-xs space-y-1 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-900 dark:text-stone-100 block">Memo Mind Status</span>
                {isSynced && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle className="w-3 h-3" /> In Memory
                  </span>
                )}
              </div>
              <p className="text-stone-600 dark:text-stone-300 text-xs leading-relaxed">
                {isSynced
                  ? 'This email is saved in Memo Mind. You can ask questions about it anytime.'
                  : 'Save this email so your Memo Mind assistant can reference its contents.'}
              </p>
              {syncError && (
                <p className="text-rose-600 dark:text-rose-400 text-xs font-medium pt-1">
                  {syncError}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-stone-100 dark:border-[#24352b] flex items-center justify-between gap-3">
          {onSync ? (
            <button
              onClick={() => onSync(message)}
              disabled={isSyncing || isSynced}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition ${
                isSynced
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-default'
                  : isSyncing
                  ? 'bg-[#1b3b2e]/10 dark:bg-[#285743]/30 text-[#1b3b2e] dark:text-[#88d4a6] border border-[#1b3b2e]/20 cursor-wait'
                  : 'bg-[#1b3b2e] hover:bg-[#142e24] dark:bg-[#285743] dark:hover:bg-[#1f4534] text-white shadow-xs'
              }`}
            >
              {isSyncing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Saving to Memo...</span>
                </>
              ) : isSynced ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Saved to Memo Mind</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Save to Memo Mind</span>
                </>
              )}
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 bg-stone-100 dark:bg-[#1e2f26] hover:bg-stone-200 dark:hover:bg-[#273d32] transition"
            >
              Close
            </button>
            <a
              href={getGmailLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-[#1b3b2e] hover:bg-[#142e24] dark:bg-[#285743] dark:hover:bg-[#1f4534] transition flex items-center gap-1.5 shadow-xs"
            >
              <span>Open in Gmail</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
