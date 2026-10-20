import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
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
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { SyncModal } from '../components/SyncModal';
import { streamAiMessage } from '../services/api';
import { sanitizeAiStreamContent } from '../services/aiError';
import type { ChatMessage } from '../types';

const SUGGESTED_PROMPTS = [
  'What are the key points in my recently saved documents?',
  'Summarize any recent email communications or updates.',
  'Search for project roadmaps or deadlines in my files.',
  'What files and documents do I have in Google Drive?',
];

export const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('cs_chat_messages');
      if (saved) {
        const parsed: ChatMessage[] = JSON.parse(saved);
        return parsed.map((m) => {
          if (m.sender === 'assistant' && m.content) {
            const sanitized = sanitizeAiStreamContent(m.content);
            return {
              ...m,
              content: sanitized.displayContent,
              isError: sanitized.isError || m.isError,
              errorType: sanitized.errorType || m.errorType,
            };
          }
          return m;
        });
      }
    } catch {}
    return [
      {
        id: 'welcome',
        sender: 'assistant',
        content:
          "Hi! I'm Memo Mind, your personal assistant. I keep track of your Google Drive files and Gmail messages. Ask me anything—like finding a project note, summarizing an email thread, or locating information in a document.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist messages to local storage
  useEffect(() => {
    try {
      localStorage.setItem('cs_chat_messages', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Auto-scroll to bottom
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
    setMessages((prev) =>
      prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg))
    );
  };

  // Submit query
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isStreaming) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const userMsgId = `user_${Date.now()}`;
    const assistantMsgId = `ai_${Date.now()}`;

    // Add user message & placeholder assistant message
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        content: query,
        timestamp,
      },
      {
        id: assistantMsgId,
        sender: 'assistant',
        content: '',
        timestamp,
        isStreaming: true,
      },
    ]);

    setIsStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulatedContent = '';

    await streamAiMessage(
      query,
      (chunk) => {
        accumulatedContent += chunk;
        const sanitized = sanitizeAiStreamContent(accumulatedContent);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: sanitized.displayContent,
                  isStreaming: !sanitized.isError,
                  isError: sanitized.isError,
                  errorType: sanitized.errorType,
                }
              : msg
          )
        );
      },
      () => {
        setIsStreaming(false);
        abortControllerRef.current = null;
        const sanitized = sanitizeAiStreamContent(accumulatedContent);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
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
      },
      (err) => {
        setIsStreaming(false);
        abortControllerRef.current = null;
        const rawErr = accumulatedContent || err?.message || 'Service unavailable';
        const sanitized = sanitizeAiStreamContent(rawErr);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content:
                    sanitized.displayContent ||
                    '⚠️ Unable to connect to Memo Mind. Please check your connection and try again.',
                  isStreaming: false,
                  isError: true,
                  errorType: sanitized.errorType || 'general',
                }
              : msg
          )
        );
      },
      controller.signal
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    if (window.confirm('Clear all conversation messages?')) {
      const initialMsg: ChatMessage = {
        id: 'welcome',
        sender: 'assistant',
        content:
          "Conversation history cleared. Feel free to ask any question about your Google Drive files or Gmail messages!",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([initialMsg]);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f7f5] dark:bg-[#101613] text-stone-900 dark:text-stone-100 flex flex-col transition-colors duration-200">
      <Navbar onRefresh={() => setIsSyncModalOpen(true)} />

      {/* Main chat layout */}
      <div className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col min-h-0">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-200/90 dark:border-[#24352b] mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1b3b2e] dark:bg-[#285743] flex items-center justify-center text-white shadow-xs">
              <BookOpen className="w-4 h-4 text-[#a3d9b8]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-stone-900 dark:text-stone-100 tracking-tight">
                  Ask Memo
                </h1>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                  Ready
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Your personal assistant for your Google Drive files and emails
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSyncModalOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 bg-white dark:bg-[#18231d] hover:bg-stone-50 dark:hover:bg-[#212f27] border border-stone-200 dark:border-[#283b30] transition flex items-center gap-1.5 shadow-xs"
              title="Sync Library"
            >
              <RefreshCw className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
              <span className="hidden sm:inline">Check Updates</span>
            </button>

            <button
              onClick={handleClearHistory}
              className="p-2 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-stone-200 dark:border-[#283b30] transition"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message Thread Area */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 sm:pr-2 min-h-0 pb-4">
          {messages.map((msg) => {
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
                  {/* Error Header */}
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

                  {/* Quick Retry for Error Messages */}
                  {msg.isError && !isStreaming && (
                    <div className="mt-3 pt-2.5 border-t border-rose-200 dark:border-rose-900/60 flex items-center gap-2">
                      <button
                        onClick={() => {
                          const idx = messages.findIndex((m) => m.id === msg.id);
                          const prevUserMsg = [...messages.slice(0, idx)].reverse().find((m) => m.sender === 'user');
                          if (prevUserMsg) {
                            handleSendMessage(prevUserMsg.content);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-[#18231d] hover:bg-stone-100 dark:hover:bg-[#212f27] border border-stone-300 dark:border-[#283b30] text-stone-800 dark:text-stone-200 transition shadow-xs"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Retry Question</span>
                      </button>
                    </div>
                  )}

                  {/* Message Footer */}
                  <div
                    className={`mt-2 flex items-center gap-2 text-[10px] ${
                      isUser
                        ? 'text-emerald-100/80 justify-end'
                        : msg.isError
                        ? 'text-rose-500 justify-between'
                        : 'text-stone-400 dark:text-stone-500 justify-between'
                    }`}
                  >
                    <span>{msg.timestamp}</span>

                    {!isUser && msg.content && (
                      <button
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        className="opacity-0 group-hover:opacity-100 transition p-1 hover:text-stone-800 dark:hover:text-stone-200"
                        title="Copy answer"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-[#1b3b2e]/10 dark:bg-[#285743]/30 flex items-center justify-center shrink-0 mt-0.5 text-[#1b3b2e] dark:text-[#a3d9b8]">
                    <UserIcon className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Queries Pill List */}
        {messages.length <= 2 && !isStreaming && (
          <div className="py-2 space-y-1.5 shrink-0">
            <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#285743] dark:text-[#88d4a6]" />
              Suggested questions:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(prompt)}
                  className="p-2.5 rounded-xl bg-white dark:bg-[#16211b] hover:bg-stone-50 dark:hover:bg-[#1f2c24] border border-stone-200/90 dark:border-[#24352b] text-left text-xs text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 transition flex items-center justify-between group shadow-xs"
                >
                  <span className="truncate pr-2">{prompt}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-900 dark:group-hover:text-stone-100 shrink-0 transition" />
                </button>
              ))}
            </div>
          </div>
        )}

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
      </div>

      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
      />
    </div>
  );
};
