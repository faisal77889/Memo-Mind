import React, { useState } from 'react';
import type { DriveFile } from '../types';
import { FileIcon } from './FileIcon';
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Calendar,
  HardDrive,
  Code2,
  Sparkles,
} from 'lucide-react';

interface FileDetailsModalProps {
  file: DriveFile | null;
  onClose: () => void;
  onIndex?: (file: DriveFile) => Promise<void>;
  isIndexing?: boolean;
  isIndexed?: boolean;
  indexError?: string | null;
}

export const FileDetailsModal: React.FC<FileDetailsModalProps> = ({
  file,
  onClose,
  onIndex,
  isIndexing = false,
  isIndexed = false,
  indexError = null,
}) => {
  const [copied, setCopied] = useState(false);

  if (!file) return null;

  const formatFileSize = (bytes?: string | number) => {
    if (bytes === undefined || bytes === null || bytes === 0 || bytes === '0') {
      if (file.mimeType.includes('folder')) return 'Directory';
      return 'Google Workspace Item';
    }
    const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(num)) return 'Unknown';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Not available';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
    } catch {
      return isoString;
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(file.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getDriveLink = () => {
    if (file.webViewLink) return file.webViewLink;
    if (file.mimeType.includes('folder')) {
      return `https://drive.google.com/drive/folders/${file.id}`;
    }
    return `https://drive.google.com/file/d/${file.id}/view`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 dark:bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#16211b] rounded-2xl p-6 shadow-xl border border-stone-200 dark:border-[#24352b] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-stone-100 dark:border-[#24352b]">
          <div className="flex items-center gap-3 min-w-0">
            <FileIcon mimeType={file.mimeType} className="w-7 h-7" />
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 truncate max-w-[340px]" title={file.name}>
                {file.name}
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-mono truncate">{file.mimeType}</p>
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
          {/* File ID */}
          <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#121c17] border border-stone-200/80 dark:border-[#24352b] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-stone-500 dark:text-stone-400" />
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold">
                  Google File ID
                </span>
                <span className="text-xs font-mono text-stone-700 dark:text-stone-300 truncate max-w-[280px]">
                  {file.id}
                </span>
              </div>
            </div>
            <button
              onClick={handleCopyId}
              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1c2c23] border border-stone-200 dark:border-[#2b4134] hover:bg-stone-100 dark:hover:bg-[#23382c] text-stone-700 dark:text-stone-200 transition flex items-center gap-1 text-xs shadow-xs"
              title="Copy ID"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-stone-500" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* File Size */}
            <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#121c17] border border-stone-200/80 dark:border-[#24352b] flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-[#1b3b2e] dark:text-[#88d4a6] shrink-0" />
              <div>
                <span className="block text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold">
                  Size
                </span>
                <span className="text-xs font-medium text-stone-800 dark:text-stone-200">
                  {formatFileSize(file.size)}
                </span>
              </div>
            </div>

            {/* Last Modified */}
            <div className="p-3 rounded-xl bg-stone-50 dark:bg-[#121c17] border border-stone-200/80 dark:border-[#24352b] flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
              <div className="min-w-0">
                <span className="block text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold">
                  Modified
                </span>
                <span className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate block">
                  {formatDate(file.modifiedTime)}
                </span>
              </div>
            </div>
          </div>

          {/* Memo Mind Memory Status Card */}
          <div className="p-3.5 rounded-xl bg-[#1b3b2e]/5 dark:bg-[#285743]/15 border border-[#1b3b2e]/15 dark:border-[#285743]/30 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-[#1b3b2e] dark:text-[#88d4a6] mt-0.5 shrink-0" />
            <div className="text-xs space-y-1 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-900 dark:text-stone-100 block">Memo Mind Status</span>
                {isIndexed && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                    <Check className="w-3 h-3" /> In Memory
                  </span>
                )}
              </div>
              <p className="text-stone-600 dark:text-stone-300 text-xs leading-relaxed">
                {file.mimeType.includes('folder')
                  ? 'Folders cannot be saved directly. You can save individual files from inside the folder.'
                  : isIndexed
                  ? 'This document is in your Memo Mind library. You can ask questions about it anytime.'
                  : 'Save this document into Memo Mind so your assistant can reference its content.'}
              </p>
              {indexError && (
                <p className="text-rose-600 dark:text-rose-400 text-xs font-medium pt-1">
                  {indexError}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-stone-100 dark:border-[#24352b] flex items-center justify-between gap-3">
          {/* Add to Memo Mind Button */}
          {onIndex && !file.mimeType.includes('folder') ? (
            <button
              onClick={() => onIndex(file)}
              disabled={isIndexing || isIndexed}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition ${
                isIndexed
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-default'
                  : isIndexing
                  ? 'bg-[#1b3b2e]/10 dark:bg-[#285743]/30 text-[#1b3b2e] dark:text-[#88d4a6] border border-[#1b3b2e]/20 cursor-wait'
                  : 'bg-[#1b3b2e] hover:bg-[#142e24] dark:bg-[#285743] dark:hover:bg-[#1f4534] text-white shadow-xs'
              }`}
            >
              {isIndexing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Saving to Memo...</span>
                </>
              ) : isIndexed ? (
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
              href={getDriveLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-[#1b3b2e] hover:bg-[#142e24] dark:bg-[#285743] dark:hover:bg-[#1f4534] transition flex items-center gap-1.5 shadow-xs"
            >
              <span>Open in Drive</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
