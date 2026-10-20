import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  HardDrive,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { triggerSync, getTaskStatus, getApiErrorMessage } from '../services/api';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

interface ActiveTask {
  id: string;
  source: 'gdrive' | 'gmail' | 'all';
  status: string;
  result?: any;
}

export const SyncModal: React.FC<SyncModalProps> = ({ isOpen, onClose, onSyncComplete }) => {
  const { token } = useAuth();
  const [selectedSource, setSelectedSource] = useState<'all' | 'gdrive' | 'gmail'>('all');
  const [isStartingSync, setIsStartingSync] = useState(false);
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Poll tasks if any are not finished
  useEffect(() => {
    if (!token || activeTasks.length === 0) return;

    const hasPendingTasks = activeTasks.some(
      (t) => t.status !== 'SUCCESS' && t.status !== 'FAILURE'
    );
    if (!hasPendingTasks) return;

    const interval = setInterval(async () => {
      try {
        const updatedTasks = await Promise.all(
          activeTasks.map(async (task) => {
            if (task.status === 'SUCCESS' || task.status === 'FAILURE') {
              return task;
            }
            const statusRes = await getTaskStatus(token, task.id);
            return {
              ...task,
              status: statusRes.status || 'PENDING',
              result: statusRes.result,
            };
          })
        );

        setActiveTasks(updatedTasks);

        const allFinished = updatedTasks.every(
          (t) => t.status === 'SUCCESS' || t.status === 'FAILURE'
        );
        if (allFinished && onSyncComplete) {
          onSyncComplete();
        }
      } catch (err) {
        console.error('Error polling sync task:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [token, activeTasks, onSyncComplete]);

  if (!isOpen) return null;

  const handleStartSync = async () => {
    if (!token) return;
    setIsStartingSync(true);
    setError(null);

    try {
      const sourceParam = selectedSource === 'all' ? undefined : selectedSource;
      const res = await triggerSync(token, sourceParam);

      // Parse task IDs from message
      const msg = res.message || '';
      const extractedTasks: ActiveTask[] = [];

      const singleMatch = msg.match(/task with ([a-f0-9\-]+)/i);
      const dualMatch = msg.match(/task with ([a-f0-9\-]+) and ([a-f0-9\-]+)/i);

      if (dualMatch) {
        extractedTasks.push({ id: dualMatch[1], source: 'gmail', status: 'PENDING' });
        extractedTasks.push({ id: dualMatch[2], source: 'gdrive', status: 'PENDING' });
      } else if (singleMatch) {
        extractedTasks.push({ id: singleMatch[1], source: selectedSource, status: 'PENDING' });
      } else {
        extractedTasks.push({ id: 'active-sync', source: selectedSource, status: 'STARTED' });
      }

      setActiveTasks(extractedTasks);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsStartingSync(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 dark:bg-black/70 backdrop-blur-xs animate-fade-in text-stone-900 dark:text-stone-100">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#16211b] rounded-3xl p-6 sm:p-8 border border-stone-200 dark:border-[#24352b] shadow-xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 dark:border-[#24352b] pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#1b3b2e]/10 dark:bg-[#285743]/30 border border-[#1b3b2e]/20 dark:border-[#285743]/50 flex items-center justify-center text-[#1b3b2e] dark:text-[#88d4a6]">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Sync with Memo Mind</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">Keep your files and emails updated in your personal library</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#1f2e26] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Selection Options */}
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Choose What to Sync
          </label>

          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => setSelectedSource('all')}
              className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-2 ${
                selectedSource === 'all'
                  ? 'bg-[#1b3b2e] dark:bg-[#285743] border-[#1b3b2e] dark:border-[#285743] text-white shadow-xs'
                  : 'bg-stone-50 dark:bg-[#121c17] border-stone-200 dark:border-[#24352b] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#1c2c23]'
              }`}
            >
              <BookOpen className={`w-5 h-5 ${selectedSource === 'all' ? 'text-emerald-200' : 'text-stone-500 dark:text-stone-400'}`} />
              <span className="text-xs font-medium">Both</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSource('gdrive')}
              className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-2 ${
                selectedSource === 'gdrive'
                  ? 'bg-[#1b3b2e] dark:bg-[#285743] border-[#1b3b2e] dark:border-[#285743] text-white shadow-xs'
                  : 'bg-stone-50 dark:bg-[#121c17] border-stone-200 dark:border-[#24352b] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#1c2c23]'
              }`}
            >
              <HardDrive className={`w-5 h-5 ${selectedSource === 'gdrive' ? 'text-emerald-200' : 'text-blue-600 dark:text-blue-400'}`} />
              <span className="text-xs font-medium">Google Drive</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSource('gmail')}
              className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-2 ${
                selectedSource === 'gmail'
                  ? 'bg-[#1b3b2e] dark:bg-[#285743] border-[#1b3b2e] dark:border-[#285743] text-white shadow-xs'
                  : 'bg-stone-50 dark:bg-[#121c17] border-stone-200 dark:border-[#24352b] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#1c2c23]'
              }`}
            >
              <Mail className={`w-5 h-5 ${selectedSource === 'gmail' ? 'text-emerald-200' : 'text-rose-600 dark:text-rose-400'}`} />
              <span className="text-xs font-medium">Gmail</span>
            </button>
          </div>
        </div>

        {/* Sync Mechanism Information */}
        <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-[#121c17] border border-stone-200 dark:border-[#24352b] text-xs text-stone-600 dark:text-stone-300 space-y-1.5">
          <p className="font-semibold text-stone-800 dark:text-stone-200">How Memo Mind Syncs:</p>
          <ul className="space-y-1 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            <li>• Only newly created or modified files and emails are checked.</li>
            <li>• Everything synced becomes immediately searchable by your assistant.</li>
          </ul>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Active Tasks Live Status */}
        {activeTasks.length > 0 && (
          <div className="space-y-2 border-t border-stone-100 dark:border-[#24352b] pt-4">
            <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">Sync Status</span>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {activeTasks.map((task) => {
                const isPending = task.status === 'PENDING' || task.status === 'STARTED';
                const isSuccess = task.status === 'SUCCESS';
                const isFailure = task.status === 'FAILURE';

                const sourceTitle =
                  task.source === 'gdrive'
                    ? 'Google Drive Documents'
                    : task.source === 'gmail'
                    ? 'Gmail Messages'
                    : 'Personal Library';

                return (
                  <div
                    key={task.id}
                    className="p-3 rounded-xl bg-stone-50 dark:bg-[#121c17] border border-stone-200 dark:border-[#24352b] flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      {isPending && <Loader2 className="w-4 h-4 text-[#285743] dark:text-[#88d4a6] animate-spin" />}
                      {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                      {isFailure && <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
                      <div>
                        <span className="font-semibold text-stone-900 dark:text-stone-100">
                          {sourceTitle}
                        </span>
                        <div className="text-[11px] text-stone-500 dark:text-stone-400">
                          {isPending ? 'Syncing latest updates...' : isSuccess ? 'Up to date' : 'Sync error'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          isSuccess
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : isFailure
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                            : 'bg-[#1b3b2e]/10 dark:bg-[#285743]/30 text-[#1b3b2e] dark:text-[#88d4a6] border border-[#1b3b2e]/20 dark:border-[#285743]/40'
                        }`}
                      >
                        {isSuccess ? 'Completed' : isPending ? 'In Progress' : 'Failed'}
                      </span>
                      {task.result && typeof task.result === 'object' && task.result.synced_count !== undefined && (
                        <div className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">
                          {task.result.synced_count} items updated
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-[#1e2f26] transition"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleStartSync}
            disabled={isStartingSync}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#1b3b2e] hover:bg-[#142e24] dark:bg-[#285743] dark:hover:bg-[#1f4534] shadow-xs transition flex items-center gap-2 disabled:opacity-50"
          >
            {isStartingSync ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Checking Updates...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Sync Now</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
