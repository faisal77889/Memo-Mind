import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  User as UserIcon,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  StopCircle,
  ArrowRight,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  Plus,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Edit2,
  Activity,
  Search,
  X,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { SyncModal } from '../components/SyncModal';
import {
  streamAiMessage,
  fetchChatSessions,
  fetchChatSessionDetails,
  renameChatSession,
  deleteChatSession,
  fetchChatActivityStats,
} from '../services/api';
import { sanitizeAiStreamContent } from '../services/aiError';
import { useAuth } from '../context/AuthContext';
import type { ChatMessage, ChatSession, ChatActivityStats } from '../types';

const SUGGESTED_PROMPTS = [
  'What are the key points in my recently saved documents?',
  'Summarize any recent email communications or updates.',
  'Search for project roadmaps or deadlines in my files.',
  'What files and documents do I have in Google Drive?',
];

// Helper to format relative time
function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 172800) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

export const ChatPage: React.FC = () => {
  const { token } = useAuth();

  // Sessions and activity state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeSessionTitle, setActiveSessionTitle] = useState<string>('New Conversation');
  const [activityStats, setActivityStats] = useState<ChatActivityStats | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sessionSearch, setSessionSearch] = useState('');
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Inline editing of chat title
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingTitleText, setEditingTitleText] = useState('');

  // Messages state for active session
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content:
        "Hi! I'm Memo Mind, your personal assistant. I keep track of your Google Drive files and Gmail messages. Ask me anything—like finding a project note, summarizing an email thread, or locating information in a document.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load chat sessions and activity stats from backend
  const loadSessionsAndStats = async (preferredSelectId?: number) => {
    if (!token) return;
    setIsLoadingSessions(true);
    try {
      const [sessionsData, statsData] = await Promise.all([
        fetchChatSessions(token),
        fetchChatActivityStats(token).catch(() => null),
      ]);
      const safeSessions = Array.isArray(sessionsData) ? sessionsData : [];
      setSessions(safeSessions);
      if (statsData) setActivityStats(statsData);

      // If a preferred session ID is given, or if activeSessionId is not set, select the first
      if (preferredSelectId) {
        const found = safeSessions.find((s) => s.id === preferredSelectId);
        if (found) {
          setActiveSessionId(found.id);
          setActiveSessionTitle(found.title);
        }
      }
    } catch (err) {
      console.error('Error loading chat sessions:', err);
      setSessions([]);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  useEffect(() => {
    loadSessionsAndStats();
  }, [token]);

  // Load message turns when an existing session is selected
  const handleSelectSession = async (session: ChatSession) => {
    if (activeSessionId === session.id && !isLoadingHistory) return;
    if (!token) return;

    setActiveSessionId(session.id);
    setActiveSessionTitle(session.title);
    setIsLoadingHistory(true);

    try {
      const details = await fetchChatSessionDetails(token, session.id);
      if (details.turns && details.turns.length > 0) {
        const hydratedMessages: ChatMessage[] = [];
        details.turns.forEach((turn) => {
          hydratedMessages.push({
            id: `turn-${turn.id}-q`,
            sender: 'user',
            content: turn.query,
            timestamp: new Date(turn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          });
          const sanitized = sanitizeAiStreamContent(turn.answer);
          hydratedMessages.push({
            id: `turn-${turn.id}-a`,
            sender: 'assistant',
            content: sanitized.displayContent,
            isError: sanitized.isError,
            errorType: sanitized.errorType,
            timestamp: new Date(turn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          });
        });
        setMessages(hydratedMessages);
      } else {
        // Empty session
        setMessages([
          {
            id: 'welcome-empty',
            sender: 'assistant',
            content: `This is the beginning of "${session.title}". Ask anything about your tracked Drive files and emails!`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err) {
      console.error('Error loading session history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Start a new blank conversation
  const handleStartNewChat = () => {
    setActiveSessionId(null);
    setActiveSessionTitle('New Conversation');
    setMessages([
      {
        id: 'welcome-new',
        sender: 'assistant',
        content:
          "Hi! I'm Memo Mind, your personal assistant. What would you like to search or check in your documents and emails today?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Save renamed title
  const handleSaveRename = async (sessionId: number) => {
    if (!token || !editingTitleText.trim()) {
      setEditingSessionId(null);
      return;
    }
    try {
      const updated = await renameChatSession(token, sessionId, editingTitleText.trim());
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? updated : s)));
      if (activeSessionId === sessionId) {
        setActiveSessionTitle(updated.title);
      }
    } catch (err) {
      console.error('Error renaming chat session:', err);
    } finally {
      setEditingSessionId(null);
      setEditingTitleText('');
    }
  };

  // Delete session
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    if (!token) return;
    if (!window.confirm('Are you sure you want to delete this chat conversation?')) return;

    try {
      await deleteChatSession(token, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        handleStartNewChat();
      }
      // Refresh stats
      fetchChatActivityStats(token).then(setActivityStats).catch(() => {});
    } catch (err) {
      console.error('Error deleting chat session:', err);
    }
  };

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // Adjust textarea height automatically
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  };

  // Stop active streaming
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isStreaming) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: query,
      timestamp,
    };

    const assistantPlaceholderId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantPlaceholderId,
      sender: 'assistant',
      content: '',
      timestamp,
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulatedContent = '';

    await streamAiMessage(
      query,
      (chunk) => {
        accumulatedContent += chunk;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantPlaceholderId
              ? { ...msg, content: accumulatedContent }
              : msg
          )
        );
      },
      async (returnedChatId) => {
        setIsStreaming(false);
        abortControllerRef.current = null;

        // Sanitize final content
        const sanitized = sanitizeAiStreamContent(accumulatedContent);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantPlaceholderId
              ? {
                  ...msg,
                  content: sanitized.displayContent,
                  isStreaming: false,
                  isError: sanitized.isError,
                  errorType: sanitized.errorType,
                }
              : msg
          )
        );

        // Update active session state if new session was created on backend
        if (returnedChatId) {
          setActiveSessionId(returnedChatId);
        }

        // Refresh sessions list and stats in background
        if (token) {
          loadSessionsAndStats(returnedChatId);
        }
      },
      (err) => {
        setIsStreaming(false);
        abortControllerRef.current = null;

        const sanitized = sanitizeAiStreamContent(
          accumulatedContent || err?.message || 'A network error occurred while generating response.'
        );

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantPlaceholderId
              ? {
                  ...msg,
                  content: sanitized.displayContent,
                  isStreaming: false,
                  isError: true,
                  errorType: sanitized.errorType || 'general',
                }
              : msg
          )
        );
      },
      controller.signal,
      activeSessionId || undefined,
      token
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Group sessions by timeframe
  const groupedSessions = useMemo(() => {
    const sessionList = Array.isArray(sessions) ? sessions : [];
    const filtered = sessionList.filter((s) =>
      s && typeof s.title === 'string' && s.title.toLowerCase().includes(sessionSearch.toLowerCase())
    );

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const sevenDaysAgo = today - 6 * 86400000;

    const groups: { [key: string]: ChatSession[] } = {
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      Older: [],
    };

    filtered.forEach((session) => {
      const sessionDate = new Date(session.updated_at).getTime();
      if (sessionDate >= today) {
        groups.Today.push(session);
      } else if (sessionDate >= yesterday) {
        groups.Yesterday.push(session);
      } else if (sessionDate >= sevenDaysAgo) {
        groups['Previous 7 Days'].push(session);
      } else {
        groups.Older.push(session);
      }
    });

    return groups;
  }, [sessions, sessionSearch]);

  const activeSessionObj = Array.isArray(sessions) ? sessions.find((s) => s.id === activeSessionId) : undefined;

  return (
    <div className="h-screen bg-[#f7f7f5] dark:bg-[#101613] flex flex-col text-stone-900 dark:text-stone-100 overflow-hidden transition-colors duration-200">
      <Navbar onRefresh={() => setIsSyncModalOpen(true)} />

      <div className="flex-1 flex overflow-hidden relative">
        {/* ========================================================= */}
        {/* Left Sidebar: Conversations & Calculated Activity Metrics */}
        {/* ========================================================= */}
        <aside
          className={`${
            isSidebarOpen ? 'w-72 sm:w-80' : 'w-0'
          } shrink-0 bg-white dark:bg-[#16211b] border-r border-stone-200 dark:border-[#24352b] flex flex-col transition-all duration-200 overflow-hidden z-20`}
        >
          {/* Sidebar Top: New Chat & Activity Summary */}
          <div className="p-4 border-b border-stone-100 dark:border-[#24352b] space-y-3 shrink-0">
            <button
              onClick={handleStartNewChat}
              className="w-full py-2.5 px-3.5 rounded-xl bg-[#1b3b2e] hover:bg-[#142e24] dark:bg-[#285743] dark:hover:bg-[#1f4534] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              <span>New Conversation</span>
            </button>

            {/* Calculated Chat Activity Metric Pill */}
            {activityStats && (
              <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-[#121c17] border border-stone-200/80 dark:border-[#24352b] flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
                  <Activity className="w-3.5 h-3.5 text-[#1b3b2e] dark:text-[#88d4a6]" />
                  <span>Activity</span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <span className="text-stone-800 dark:text-stone-200">
                    {activityStats.total_messages} turns
                  </span>
                  <span className="text-stone-300 dark:text-stone-600">•</span>
                  <span className="text-stone-500 dark:text-stone-400">
                    {activityStats.total_conversations} chats
                  </span>
                </div>
              </div>
            )}

            {/* Filter / Search input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-stone-50 dark:bg-[#121c17] border border-stone-200 dark:border-[#283b30] text-xs text-stone-800 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-600 focus:outline-none focus:border-[#1b3b2e] dark:focus:border-[#285743]"
              />
              {sessionSearch && (
                <button
                  onClick={() => setSessionSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Sidebar Chat Sessions List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-4 scrollbar-thin">
            {isLoadingSessions && (!Array.isArray(sessions) || sessions.length === 0) ? (
              <div className="p-4 text-center text-xs text-stone-400 space-y-2">
                <div className="w-4 h-4 border-2 border-stone-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <span>Loading past conversations...</span>
              </div>
            ) : !Array.isArray(sessions) || sessions.length === 0 ? (
              <div className="p-6 text-center space-y-2 text-xs text-stone-400">
                <MessageSquare className="w-8 h-8 mx-auto text-stone-300 dark:text-stone-600" />
                <p>No conversations yet. Start a new chat to begin!</p>
              </div>
            ) : (
              Object.entries(groupedSessions).map(([groupTitle, groupItems]) => {
                if (groupItems.length === 0) return null;
                return (
                  <div key={groupTitle} className="space-y-1">
                    <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 block mb-1">
                      {groupTitle}
                    </span>
                    {groupItems.map((session) => {
                      const isActive = activeSessionId === session.id;
                      const isEditing = editingSessionId === session.id;

                      return (
                        <div
                          key={session.id}
                          onClick={() => handleSelectSession(session)}
                          className={`group relative px-3 py-2 rounded-xl cursor-pointer transition text-left flex flex-col gap-1 border ${
                            isActive
                              ? 'bg-[#1b3b2e]/10 dark:bg-[#285743]/25 border-[#1b3b2e]/30 dark:border-[#285743]/60'
                              : 'border-transparent hover:bg-stone-100/70 dark:hover:bg-[#1a2620]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            {isEditing ? (
                              <input
                                autoFocus
                                type="text"
                                value={editingTitleText}
                                onChange={(e) => setEditingTitleText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveRename(session.id);
                                  if (e.key === 'Escape') setEditingSessionId(null);
                                }}
                                onBlur={() => handleSaveRename(session.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full px-2 py-0.5 rounded text-xs bg-white dark:bg-[#121c17] border border-[#1b3b2e] dark:border-[#285743] text-stone-900 dark:text-stone-100"
                              />
                            ) : (
                              <span
                                className={`text-xs font-medium truncate flex-1 ${
                                  isActive
                                    ? 'text-[#1b3b2e] dark:text-[#88d4a6] font-semibold'
                                    : 'text-stone-800 dark:text-stone-200'
                                }`}
                                title={session.title}
                              >
                                {session.title}
                              </span>
                            )}

                            {/* Action Buttons on Hover */}
                            {!isEditing && (
                              <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSessionId(session.id);
                                    setEditingTitleText(session.title);
                                  }}
                                  className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                                  title="Rename"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => handleDeleteSession(e, session.id)}
                                  className="p-1 rounded text-stone-400 hover:text-rose-600 dark:hover:text-rose-400"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Activity indicator: turns count & relative time */}
                          <div className="flex items-center justify-between text-[10px] text-stone-400 dark:text-stone-500">
                            <span className="flex items-center gap-1.5">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  session.activity_level === 'active'
                                    ? 'bg-emerald-500 animate-pulse'
                                    : session.activity_level === 'recent'
                                    ? 'bg-blue-400'
                                    : 'bg-stone-300 dark:bg-stone-600'
                                }`}
                              />
                              <span>
                                {session.total_messages}{' '}
                                {session.total_messages === 1 ? 'turn' : 'turns'}
                              </span>
                            </span>
                            <span>{formatRelativeTime(session.updated_at)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ========================================================= */}
        {/* Main Chat Canvas */}
        {/* ========================================================= */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#f7f7f5] dark:bg-[#101613] p-4 sm:p-6 transition-colors duration-200">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3.5 border-b border-stone-200/90 dark:border-[#24352b] mb-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 rounded-xl bg-white dark:bg-[#16211b] hover:bg-stone-100 dark:hover:bg-[#1c2921] border border-stone-200 dark:border-[#24352b] text-stone-600 dark:text-stone-300 transition shadow-xs"
                title={isSidebarOpen ? 'Hide Conversations' : 'Show Conversations'}
              >
                {isSidebarOpen ? (
                  <PanelLeftClose className="w-4 h-4" />
                ) : (
                  <PanelLeftOpen className="w-4 h-4" />
                )}
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1
                    className="text-base font-bold text-stone-900 dark:text-stone-100 tracking-tight truncate max-w-sm sm:max-w-md"
                    title={activeSessionTitle}
                  >
                    {activeSessionTitle}
                  </h1>

                  {activeSessionObj && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                      {activeSessionObj.total_messages} messages recorded
                    </span>
                  )}
                </div>

                <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                  {activeSessionObj
                    ? `Last active ${formatRelativeTime(activeSessionObj.updated_at)} • Memo Mind assistant`
                    : 'Personal assistant for your Google Drive files and emails'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 bg-white dark:bg-[#18231d] hover:bg-stone-50 dark:hover:bg-[#212f27] border border-stone-200 dark:border-[#283b30] transition flex items-center gap-1.5 shadow-xs"
                title="Sync Library"
              >
                <RefreshCw className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                <span className="hidden sm:inline">Check Updates</span>
              </button>

              <button
                onClick={handleStartNewChat}
                className="p-2 rounded-lg text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#1c2821] border border-stone-200 dark:border-[#283b30] transition"
                title="New conversation"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Thread */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 sm:pr-2 min-h-0 pb-4">
            {isLoadingHistory ? (
              <div className="p-8 text-center space-y-2 text-xs text-stone-400">
                <div className="w-5 h-5 border-2 border-[#1b3b2e] dark:border-[#88d4a6] border-t-transparent rounded-full animate-spin mx-auto" />
                <span>Restoring conversation history...</span>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 sm:gap-4 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}
                  >
                    {!isUser && (
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          msg.isError
                            ? 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-400'
                            : 'bg-[#1b3b2e]/10 dark:bg-[#285743]/30 border border-[#1b3b2e]/20 dark:border-[#285743]/40 text-[#1b3b2e] dark:text-[#88d4a6]'
                        }`}
                      >
                        {msg.isError ? <AlertTriangle className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                      </div>
                    )}

                    <div
                      className={`group relative max-w-[85%] sm:max-w-[78%] rounded-2xl p-4 text-sm leading-relaxed ${
                        isUser
                          ? 'bg-[#1b3b2e] dark:bg-[#285743] text-white rounded-br-none shadow-xs'
                          : msg.isError
                          ? 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 rounded-bl-none shadow-xs'
                          : 'bg-white dark:bg-[#16211b] border border-stone-200/90 dark:border-[#24352b] text-stone-900 dark:text-stone-100 rounded-bl-none shadow-xs'
                      }`}
                    >
                      {/* Error notice header */}
                      {msg.isError && (
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 font-semibold text-xs">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                          <span>
                            {msg.errorType === 'rate_limit'
                              ? 'Rate Limit Exceeded'
                              : msg.errorType === 'context_length'
                              ? 'Context Limit Reached'
                              : msg.errorType === 'quota'
                              ? 'Service Quota Exceeded'
                              : 'Assistant Notice'}
                          </span>
                        </div>
                      )}

                      {/* Content display */}
                      <div className="whitespace-pre-wrap break-words">
                        {msg.content || (
                          <span className="inline-flex items-center gap-1.5 text-stone-400 dark:text-stone-500 italic text-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#1b3b2e] dark:bg-[#88d4a6] animate-ping" />
                            Searching your documents & emails...
                          </span>
                        )}
                      </div>

                      {/* Retry on error */}
                      {msg.isError && !isStreaming && (
                        <div className="mt-3 pt-2.5 border-t border-rose-200 dark:border-rose-900/60 flex items-center gap-2">
                          <button
                            onClick={() => {
                              const idx = messages.findIndex((m) => m.id === msg.id);
                              const prevUserMsg = [...messages.slice(0, idx)]
                                .reverse()
                                .find((m) => m.sender === 'user');
                              if (prevUserMsg) {
                                handleSendMessage(prevUserMsg.content);
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-900/50 hover:bg-rose-200 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center gap-1.5 transition"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Try Again</span>
                          </button>
                        </div>
                      )}

                      {/* Footer: timestamp & copy */}
                      <div
                        className={`flex items-center justify-between text-[11px] mt-2 pt-2 border-t ${
                          isUser
                            ? 'border-white/20 text-white/70'
                            : 'border-stone-100 dark:border-[#24352b] text-stone-400 dark:text-stone-500'
                        }`}
                      >
                        <span>{msg.timestamp}</span>
                        {!msg.isStreaming && msg.content && (
                          <button
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className={`opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1 text-[11px]`}
                            title="Copy message"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-xl bg-stone-200 dark:bg-[#1e2c24] flex items-center justify-center shrink-0 mt-0.5 text-stone-700 dark:text-stone-300">
                        <UserIcon className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Suggested Prompts when chat is fresh */}
            {messages.length <= 1 && (
              <div className="pt-6 max-w-xl mx-auto space-y-3">
                <span className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider block text-center">
                  Try asking about your files:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SUGGESTED_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(prompt)}
                      className="p-3 text-left rounded-xl bg-white dark:bg-[#16211b] hover:bg-stone-50 dark:hover:bg-[#1e2a22] border border-stone-200/90 dark:border-[#24352b] hover:border-[#1b3b2e]/40 dark:hover:border-[#285743] text-xs text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 transition flex items-center justify-between group shadow-xs"
                    >
                      <span className="line-clamp-2">{prompt}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#1b3b2e] dark:group-hover:text-[#88d4a6] shrink-0 ml-2 transition" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="pt-2 shrink-0">
            <div className="relative rounded-2xl bg-white dark:bg-[#16211b] border border-stone-300 dark:border-[#283b30] focus-within:border-[#1b3b2e] dark:focus-within:border-[#285743] shadow-xs transition">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                placeholder="Ask anything about your saved files and emails... (Press Enter to send)"
                rows={1}
                className="w-full bg-transparent px-4 py-3.5 pr-24 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-600 focus:outline-none resize-none max-h-40"
              />

              <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5">
                {isStreaming ? (
                  <button
                    onClick={handleStopStreaming}
                    className="p-2 rounded-xl bg-stone-900 dark:bg-stone-800 hover:bg-stone-800 text-white transition flex items-center gap-1 text-xs font-semibold shadow-xs"
                  >
                    <StopCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">Stop</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!input.trim()}
                    className="p-2 rounded-xl bg-[#1b3b2e] hover:bg-[#142e24] dark:bg-[#285743] dark:hover:bg-[#1f4534] text-white transition disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                    title="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between px-2 pt-1.5 text-[11px] text-stone-500 dark:text-stone-400">
              <span>Shift + Enter for new line</span>
              <span>Memo Mind answers using your tracked Drive documents and emails</span>
            </div>
          </div>
        </main>
      </div>

      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
      />
    </div>
  );
};
