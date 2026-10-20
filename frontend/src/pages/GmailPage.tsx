import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getGmailList, syncGmailMessage, getApiErrorMessage } from '../services/api';
import type { GmailMessageItem } from '../types';
import { Navbar } from '../components/Navbar';
import { EmailDetailsModal } from '../components/EmailDetailsModal';
import { SyncModal } from '../components/SyncModal';
import {
  Search,
  Grid,
  List as ListIcon,
  ArrowUpDown,
  ExternalLink,
  Info,
  Mail,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Sparkles,
  Check,
  Loader2,
  X,
  Bookmark,
} from 'lucide-react';

type SortOrder = 'asc' | 'desc';

export const GmailPage: React.FC = () => {
  const { token, logout } = useAuth();

  const [messages, setMessages] = useState<GmailMessageItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedMessage, setSelectedMessage] = useState<GmailMessageItem | null>(null);

  // Individual message sync state
  const [syncingMessages, setSyncingMessages] = useState<Record<string, boolean>>({});
  const [syncedMessages, setSyncedMessages] = useState<Set<string>>(new Set());
  const [messageErrors, setMessageErrors] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Fetch messages from backend
  const fetchMessages = useCallback(
    async (isBackground = false) => {
      if (!token) return;

      if (isBackground) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await getGmailList(token, 25);
        const fetchedMessages = response.messages || [];
        setMessages(fetchedMessages);

        // Pre-populate already synced messages from is_indexed
        const alreadyIndexed = new Set<string>();
        fetchedMessages.forEach((m) => {
          if (m.is_indexed) {
            alreadyIndexed.add(m.id);
          }
        });
        if (alreadyIndexed.size > 0) {
          setSyncedMessages((prev) => new Set([...prev, ...alreadyIndexed]));
        }
      } catch (err: unknown) {
        console.error('Error fetching Gmail messages:', err);
        const msg = getApiErrorMessage(err);
        if (msg.includes('401') || msg.toLowerCase().includes('revoked') || msg.toLowerCase().includes('token')) {
          setError('Gmail access expired. Please sign in again.');
        } else {
          setError(msg || 'Unable to load Gmail messages. Please check your connection.');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Sync individual message
  const handleSyncMessage = useCallback(
    async (msgItem: GmailMessageItem) => {
      if (!token) return;

      setSyncingMessages((prev) => ({ ...prev, [msgItem.id]: true }));
      setMessageErrors((prev) => {
        const updated = { ...prev };
        delete updated[msgItem.id];
        return updated;
      });

      try {
        await syncGmailMessage(token, msgItem.id);
        setSyncedMessages((prev) => new Set(prev).add(msgItem.id));
        setToastMessage({
          type: 'success',
          text: `"${msgItem.subject || 'Email'}" saved to Memo Mind!`,
        });
      } catch (err: unknown) {
        console.error(`Error syncing Gmail message ${msgItem.id}:`, err);
        const errMsg = getApiErrorMessage(err);
        if (errMsg.includes('already exist') || errMsg.includes('409')) {
          setSyncedMessages((prev) => new Set(prev).add(msgItem.id));
          setToastMessage({
            type: 'info',
            text: `"${msgItem.subject || 'Email'}" is already saved in Memo Mind.`,
          });
        } else {
          setMessageErrors((prev) => ({ ...prev, [msgItem.id]: errMsg }));
          setToastMessage({
            type: 'error',
            text: `Could not save email: ${errMsg}`,
          });
        }
      } finally {
        setSyncingMessages((prev) => ({ ...prev, [msgItem.id]: false }));
      }
    },
    [token]
  );

  // Search filter across subject, sender, snippet, and IDs
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase().trim();
    return messages.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.threadId.toLowerCase().includes(q) ||
        (m.subject && m.subject.toLowerCase().includes(q)) ||
        (m.from && m.from.toLowerCase().includes(q)) ||
        (m.snippet && m.snippet.toLowerCase().includes(q))
    );
  }, [messages, searchQuery]);

  // Sorted messages
  const sortedMessages = useMemo(() => {
    return [...filteredMessages].sort((a, b) => {
      return sortOrder === 'asc' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    });
  }, [filteredMessages, sortOrder]);

  const getGmailLink = (msg: GmailMessageItem) => {
    return `https://mail.google.com/mail/u/0/#all/${msg.threadId || msg.id}`;
  };

  return (
    <div className="min-h-screen bg-[#f7f7f5] dark:bg-[#101613] flex flex-col text-stone-900 dark:text-stone-100 transition-colors duration-200">
      <Navbar onRefresh={() => setIsSyncModalOpen(true)} isRefreshing={isRefreshing} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top Header Banner */}
        <div className="rounded-3xl p-6 sm:p-8 bg-white dark:bg-[#16211b] border border-stone-200/90 dark:border-[#24352b] shadow-xs transition-colors duration-200">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                Gmail Messages
              </h1>
              <p className="text-stone-600 dark:text-stone-300 text-sm max-w-xl">
                Browse, search, and preview emails tracked by Memo Mind from your connected Google inbox.
              </p>
            </div>

            {/* Quick Metrics & Actions */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="px-4 py-2.5 rounded-2xl bg-stone-50 dark:bg-[#1f2c24] border border-stone-200 dark:border-[#283b30] text-center">
                <span className="block text-xl font-bold text-stone-900 dark:text-stone-100">
                  {messages.length}
                </span>
                <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                  Total Messages
                </span>
              </div>

              <div className="px-4 py-2.5 rounded-2xl bg-stone-50 dark:bg-[#1f2c24] border border-stone-200 dark:border-[#283b30] text-center">
                <span className="block text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1.5 py-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                  Connected
                </span>
                <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                  Gmail Status
                </span>
              </div>

              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="px-4 py-3 rounded-2xl bg-[#1b3b2e] hover:bg-[#142e24] dark:bg-[#285743] dark:hover:bg-[#1f4534] text-white transition flex items-center gap-2 text-xs font-semibold shadow-xs"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Sync with Gmail</span>
              </button>
            </div>
          </div>
        </div>

        {/* Error Alert Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm text-rose-800 dark:text-rose-300">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => fetchMessages()}
                className="px-3 py-1.5 rounded-lg bg-rose-100 dark:bg-rose-900/40 hover:bg-rose-200 dark:hover:bg-rose-900/60 text-rose-900 dark:text-rose-200 text-xs font-semibold transition"
              >
                Retry
              </button>
              <button
                onClick={logout}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#18231d] border border-stone-300 dark:border-[#283b30] hover:bg-stone-50 dark:hover:bg-[#212f27] text-stone-700 dark:text-stone-300 text-xs font-semibold transition"
              >
                Sign In Again
              </button>
            </div>
          </div>
        )}

        {/* Controls Bar */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search emails by subject, sender, or preview..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white dark:bg-[#16211b] border border-stone-300 dark:border-[#283b30] text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:outline-none focus:border-[#1b3b2e] dark:focus:border-[#285743] transition shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              >
                Clear
              </button>
            )}
          </div>

          {/* Right Tools: Sort & View Toggle */}
          <div className="flex items-center gap-2 self-end md:self-center">
            {/* Sort Toggle */}
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#16211b] border border-stone-200 dark:border-[#283b30] text-xs text-stone-700 dark:text-stone-300 shadow-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-stone-400" />
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-1 font-medium"
              >
                <span>Sort</span>
                <span className="text-xs text-stone-400">{sortOrder === 'asc' ? '↑' : '↓'}</span>
              </button>
            </div>

            {/* View Toggle */}
            <div className="flex rounded-xl bg-stone-100 dark:bg-[#1f2c24] p-1 border border-stone-200 dark:border-[#283b30]">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-[#16211b] text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
                title="Grid view"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-[#16211b] text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
                title="List view"
              >
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        {isLoading ? (
          /* Skeletons */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl bg-white dark:bg-[#16211b] border border-stone-200 dark:border-[#283b30] space-y-4 animate-pulse shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-[#1f2c24]" />
                  <div className="w-20 h-4 rounded-lg bg-stone-100 dark:bg-[#1f2c24]" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-stone-100 dark:bg-[#1f2c24] rounded w-4/5" />
                  <div className="h-3 bg-stone-100 dark:bg-[#1f2c24] rounded w-1/2" />
                </div>
                <div className="pt-3 border-t border-stone-100 dark:border-[#283b30] flex justify-between">
                  <div className="h-3 bg-stone-100 dark:bg-[#1f2c24] rounded w-24" />
                  <div className="h-3 bg-stone-100 dark:bg-[#1f2c24] rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedMessages.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center rounded-3xl bg-white dark:bg-[#16211b] border border-stone-200 dark:border-[#283b30] shadow-xs space-y-4 my-8">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-stone-100 dark:bg-[#1f2c24] flex items-center justify-center text-stone-400 border border-stone-200 dark:border-[#283b30]">
              <Mail className="w-8 h-8 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">No messages found</h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 max-w-sm mx-auto">
                {searchQuery
                  ? `No messages matched "${searchQuery}".`
                  : 'No messages returned from your Gmail.'}
              </p>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-800 dark:text-stone-200 bg-stone-100 dark:bg-[#1f2c24] hover:bg-stone-200 dark:hover:bg-[#283b30] border border-stone-300 dark:border-[#283b30] transition"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedMessages.map((msg) => (
              <div
                key={msg.id}
                onClick={() => setSelectedMessage(msg)}
                className="group relative p-5 rounded-2xl bg-white dark:bg-[#16211b] hover:bg-stone-50/50 dark:hover:bg-[#1c2922] border border-stone-200/90 dark:border-[#24352b] shadow-xs hover:border-[#1b3b2e]/40 dark:hover:border-[#285743] transition cursor-pointer flex flex-col justify-between"
              >
                <div>
                  {/* Top card header: Sender & Date */}
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-800/40 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate block max-w-[170px]" title={msg.from}>
                          {msg.from || 'Google User'}
                        </span>
                        <span className="text-[10px] text-stone-400 dark:text-stone-500 block truncate">
                          {msg.date || 'Recent Message'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Subject Title */}
                  <h3
                    className="text-sm font-semibold text-stone-900 dark:text-stone-100 group-hover:text-[#1b3b2e] dark:group-hover:text-[#88d4a6] transition line-clamp-1 leading-snug mb-1.5"
                    title={msg.subject || msg.id}
                  >
                    {msg.subject || `Email #${msg.id.slice(0, 8)}`}
                  </h3>

                  {/* Snippet Preview */}
                  <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2 leading-relaxed mb-4 min-h-[2.5rem]">
                    {msg.snippet || 'No preview snippet available.'}
                  </p>
                </div>

                {/* Bottom Card Footer */}
                <div className="pt-3 border-t border-stone-100 dark:border-[#24352b] flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                  {/* Save to Memo Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSyncMessage(msg);
                    }}
                    disabled={syncingMessages[msg.id] || syncedMessages.has(msg.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition ${
                      syncedMessages.has(msg.id)
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 cursor-default'
                        : syncingMessages[msg.id]
                        ? 'bg-[#1b3b2e]/10 dark:bg-[#285743]/30 text-[#1b3b2e] dark:text-[#88d4a6] border border-[#1b3b2e]/20 dark:border-[#285743]/40 cursor-wait'
                        : 'bg-stone-100 dark:bg-[#1e2a22] hover:bg-stone-200 dark:hover:bg-[#25362c] text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-[#283b30]'
                    }`}
                    title={
                      syncedMessages.has(msg.id)
                        ? 'Saved to Memo Mind'
                        : syncingMessages[msg.id]
                        ? 'Saving to Memo Mind...'
                        : 'Save to Memo Mind for question answering'
                    }
                  >
                    {syncingMessages[msg.id] ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-[#1b3b2e] dark:text-[#88d4a6]" />
                        <span>Saving...</span>
                      </>
                    ) : syncedMessages.has(msg.id) ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>Saved</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-3 h-3 text-stone-500 dark:text-stone-400" />
                        <span>Save to Memo</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={getGmailLink(msg)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#1e2a22] transition"
                      title="Open in Gmail"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMessage(msg);
                      }}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#1e2a22] transition"
                      title="Email Details"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List View */
          <div className="rounded-2xl bg-white dark:bg-[#16211b] border border-stone-200/90 dark:border-[#24352b] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-700 dark:text-stone-300">
                <thead className="bg-stone-50/80 dark:bg-[#121915]/80 text-stone-500 dark:text-stone-400 uppercase tracking-wider font-semibold border-b border-stone-200 dark:border-[#24352b]">
                  <tr>
                    <th className="py-3.5 px-4">Subject & Preview</th>
                    <th className="py-3.5 px-4 hidden md:table-cell">From</th>
                    <th className="py-3.5 px-4 hidden sm:table-cell">Date</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-[#202e26]">
                  {sortedMessages.map((msg) => (
                    <tr
                      key={msg.id}
                      onClick={() => setSelectedMessage(msg)}
                      className="hover:bg-stone-50/70 dark:hover:bg-[#1c2821]/70 transition cursor-pointer group"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-3 max-w-sm sm:max-w-md">
                          <Mail className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="font-semibold text-stone-900 dark:text-stone-100 group-hover:text-[#1b3b2e] dark:group-hover:text-[#88d4a6] transition block truncate">
                              {msg.subject || `Email #${msg.id.slice(0, 8)}`}
                            </span>
                            <span className="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-1">
                              {msg.snippet || 'No preview snippet available'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 hidden md:table-cell text-stone-600 dark:text-stone-300 text-xs truncate max-w-[160px]" title={msg.from}>
                        {msg.from || '--'}
                      </td>
                      <td className="py-3.5 px-4 hidden sm:table-cell text-stone-400 dark:text-stone-500 text-xs">
                        {msg.date || '--'}
                      </td>
                      <td className="py-3.5 px-4">
                        {syncedMessages.has(msg.id) ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/40">
                            <Check className="w-3 h-3" /> Saved
                          </span>
                        ) : syncingMessages[msg.id] ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1b3b2e] dark:text-[#88d4a6] bg-[#1b3b2e]/10 dark:bg-[#285743]/30 px-2 py-0.5 rounded-md border border-[#1b3b2e]/20 dark:border-[#285743]/40">
                            <Loader2 className="w-3 h-3 animate-spin" /> Saving
                          </span>
                        ) : (
                          <span className="text-[11px] text-stone-400 dark:text-stone-500">Not Saved</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSyncMessage(msg);
                            }}
                            disabled={syncingMessages[msg.id] || syncedMessages.has(msg.id)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                              syncedMessages.has(msg.id)
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 cursor-default'
                                : syncingMessages[msg.id]
                                ? 'bg-[#1b3b2e]/10 dark:bg-[#285743]/30 text-[#1b3b2e] dark:text-[#88d4a6] border border-[#1b3b2e]/20 dark:border-[#285743]/40 cursor-wait'
                                : 'bg-stone-100 dark:bg-[#1e2a22] hover:bg-stone-200 dark:hover:bg-[#25362c] text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-[#283b30]'
                            }`}
                            title="Save to Memo Mind for question answering"
                          >
                            {syncingMessages[msg.id] ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin text-[#1b3b2e] dark:text-[#88d4a6]" />
                                <span>Saving...</span>
                              </>
                            ) : syncedMessages.has(msg.id) ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>Saved</span>
                              </>
                            ) : (
                              <>
                                <Bookmark className="w-3 h-3 text-stone-500 dark:text-stone-400" />
                                <span>Save to Memo</span>
                              </>
                            )}
                          </button>

                          <a
                            href={getGmailLink(msg)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#1e2a22] transition"
                            title="Open in Gmail"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMessage(msg);
                            }}
                            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#1e2a22] transition"
                            title="Details"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Email Details Modal */}
      <EmailDetailsModal
        message={selectedMessage}
        onClose={() => setSelectedMessage(null)}
        onSync={handleSyncMessage}
        isSyncing={selectedMessage ? !!syncingMessages[selectedMessage.id] : false}
        isSynced={selectedMessage ? syncedMessages.has(selectedMessage.id) : false}
        syncError={selectedMessage ? messageErrors[selectedMessage.id] : null}
      />

      {/* Workspace Sync Modal */}
      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncComplete={() => fetchMessages(true)}
      />

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md animate-fade-in">
          <div className="p-4 rounded-2xl shadow-lg border border-stone-200 dark:border-[#283b30] bg-white dark:bg-[#16211b] flex items-start gap-3 text-stone-800 dark:text-stone-200">
            {toastMessage.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : toastMessage.type === 'error' ? (
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <Sparkles className="w-5 h-5 text-[#285743] dark:text-[#88d4a6] shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs font-medium leading-relaxed">
              {toastMessage.text}
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#1f2c24] transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
