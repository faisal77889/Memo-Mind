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
}

export const FileDetailsModal: React.FC<FileDetailsModalProps> = ({ file, onClose }) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg glass-panel rounded-2xl p-6 shadow-2xl shadow-indigo-950/50 border border-slate-700/60 overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <FileIcon mimeType={file.mimeType} className="w-7 h-7" />
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white truncate max-w-[340px]" title={file.name}>
                {file.name}
              </h3>
              <p className="text-xs text-slate-400 font-mono truncate">{file.mimeType}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metadata Details Grid */}
        <div className="py-4 space-y-3">
          {/* File ID */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-indigo-400" />
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  Google File ID
                </span>
                <span className="text-xs font-mono text-slate-200 truncate max-w-[280px]">
                  {file.id}
                </span>
              </div>
            </div>
            <button
              onClick={handleCopyId}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs"
              title="Copy ID"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* File Size */}
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  Size
                </span>
                <span className="text-xs font-medium text-slate-200">
                  {formatFileSize(file.size)}
                </span>
              </div>
            </div>

            {/* Last Modified */}
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="min-w-0">
                <span className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  Modified
                </span>
                <span className="text-xs font-medium text-slate-200 truncate block">
                  {formatDate(file.modifiedTime)}
                </span>
              </div>
            </div>
          </div>

          {/* AI Synapse Status Card */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900/40 border border-indigo-500/20 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
            <div className="text-xs space-y-1">
              <span className="font-semibold text-indigo-300 block">Synapse Knowledge Indexing</span>
              <p className="text-slate-400 text-[11px]">
                Ready for vector embedding and semantic corporate search via backend data pipeline.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
          >
            Close
          </button>
          <a
            href={getDriveLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-md shadow-indigo-500/20 transition flex items-center gap-1.5"
          >
            <span>Open in Google Drive</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
