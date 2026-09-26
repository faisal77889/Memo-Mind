import React from 'react';
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  FileImage,
  FileCode,
  FileArchive,
  FileVideo,
  FileAudio,
  Folder,
  File,
} from 'lucide-react';

interface FileIconProps {
  mimeType: string;
  className?: string;
}

export const FileIcon: React.FC<FileIconProps> = ({ mimeType, className = 'w-6 h-6' }) => {
  // Google Docs or Word
  if (
    mimeType.includes('document') ||
    mimeType.includes('word') ||
    mimeType.includes('text/plain')
  ) {
    return (
      <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
        <FileText className={className} />
      </div>
    );
  }

  // Google Sheets or Excel
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return (
      <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
        <FileSpreadsheet className={className} />
      </div>
    );
  }

  // Google Slides or PPT
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
    return (
      <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
        <Presentation className={className} />
      </div>
    );
  }

  // PDF
  if (mimeType.includes('pdf')) {
    return (
      <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20">
        <FileText className={className} />
      </div>
    );
  }

  // Folder
  if (mimeType.includes('folder')) {
    return (
      <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20">
        <Folder className={className} />
      </div>
    );
  }

  // Image
  if (mimeType.startsWith('image/')) {
    return (
      <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20">
        <FileImage className={className} />
      </div>
    );
  }

  // Video
  if (mimeType.startsWith('video/')) {
    return (
      <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400 ring-1 ring-pink-500/20">
        <FileVideo className={className} />
      </div>
    );
  }

  // Audio
  if (mimeType.startsWith('audio/')) {
    return (
      <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20">
        <FileAudio className={className} />
      </div>
    );
  }

  // Code / JSON / XML
  if (
    mimeType.includes('code') ||
    mimeType.includes('python') ||
    mimeType.includes('javascript') ||
    mimeType.includes('json') ||
    mimeType.includes('html')
  ) {
    return (
      <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20">
        <FileCode className={className} />
      </div>
    );
  }

  // Archive / Zip
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('compressed') || mimeType.includes('rar')) {
    return (
      <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20">
        <FileArchive className={className} />
      </div>
    );
  }

  // Generic fallback
  return (
    <div className="p-2 rounded-xl bg-slate-800 text-slate-400 ring-1 ring-slate-700/50">
      <File className={className} />
    </div>
  );
};
