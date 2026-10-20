import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getDriveFiles, searchDriveFiles, downloadAndIndexDriveFile, getApiErrorMessage } from '../services/api';
import type { DriveFile } from '../types';
import { Navbar } from '../components/Navbar';
import { FileIcon } from '../components/FileIcon';
import { FileDetailsModal } from '../components/FileDetailsModal';
import { SyncModal } from '../components/SyncModal';
import {
  Search,
  Grid,
  List as ListIcon,
  ArrowUpDown,
  ExternalLink,
  Info,
  HardDrive,
  FileText,
  FileSpreadsheet,
  Presentation,
  Folder,
  AlertTriangle,
  Clock,
  CheckCircle,
  RefreshCw,
  Sparkles,
  Check,
  Loader2,
  X,
  Bookmark,
} from 'lucide-react';

type FileCategory = 'all' | 'documents' | 'spreadsheets' | 'presentations' | 'pdfs' | 'images' | 'folders';
type SortField = 'modifiedTime' | 'name' | 'size';
type SortOrder = 'asc' | 'desc';

export const DrivePage: React.FC = () => {
  const { token, logout } = useAuth();

  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<FileCategory>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortField, setSortField] = useState<SortField>('modifiedTime');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [indexingFiles, setIndexingFiles] = useState<Record<string, boolean>>({});
  const [indexedFiles, setIndexedFiles] = useState<Set<string>>(new Set());
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Auto-dismiss feedback toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Index individual file via /download/google/drive/files/{file_id}
  const handleIndexFile = useCallback(
    async (file: DriveFile) => {
      if (!token) return;
      if (file.mimeType.includes('folder')) {
        setToastMessage({
          type: 'info',
          text: `"${file.name}" is a folder. You can save individual files inside to Memo Mind.`,
        });
        return;
      }

      setIndexingFiles((prev) => ({ ...prev, [file.id]: true }));
      setFileErrors((prev) => {
        const updated = { ...prev };
        delete updated[file.id];
        return updated;
      });

      try {
        await downloadAndIndexDriveFile(token, file.id);
        setIndexedFiles((prev) => new Set(prev).add(file.id));
        setToastMessage({
          type: 'success',
          text: `"${file.name}" saved to Memo Mind! You can now ask questions about it.`,
        });
      } catch (err: unknown) {
        console.error(`Error indexing file ${file.id}:`, err);
        const msg = getApiErrorMessage(err);
        if (msg.includes('already exist') || msg.includes('409')) {
          setIndexedFiles((prev) => new Set(prev).add(file.id));
          setToastMessage({
            type: 'info',
            text: `"${file.name}" is already in your Memo Mind library.`,
          });
        } else {
          setFileErrors((prev) => ({ ...prev, [file.id]: msg }));
          setToastMessage({
            type: 'error',
            text: `Could not save "${file.name}": ${msg}`,
          });
        }
      } finally {
        setIndexingFiles((prev) => ({ ...prev, [file.id]: false }));
      }
    },
    [token]
  );

  // Fetch files from backend Google Drive API
  const fetchFiles = useCallback(
    async (query?: string, isBackground = false) => {
      if (!token) return;

      if (isBackground) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        let response;
        if (query && query.trim().length > 0) {
          response = await searchDriveFiles(token, query.trim(), 50);
        } else {
          response = await getDriveFiles(token, 50);
        }

        setFiles(response.files || []);
      } catch (err: unknown) {
        console.error('Error fetching drive files:', err);
        const msg = getApiErrorMessage(err);
        if (msg.includes('401') || msg.toLowerCase().includes('revoked') || msg.toLowerCase().includes('token')) {
          setError('Google Drive connection expired. Please sign in again.');
        } else {
          setError(msg || 'Unable to load Google Drive files. Please check your connection.');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [token]
  );

  // Initial load
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Debounced search handling
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery.trim()) {
        fetchFiles(searchQuery);
      } else {
        fetchFiles();
      }
    }, 400);

    return () => clearTimeout(handler);
  }, [searchQuery, fetchFiles]);

  // Client-side filtering by category
  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      if (activeCategory === 'all') return true;
      if (activeCategory === 'documents') {
        return (
          file.mimeType.includes('document') ||
          file.mimeType.includes('word') ||
          file.mimeType.includes('text/plain')
        );
      }
      if (activeCategory === 'spreadsheets') {
        return (
          file.mimeType.includes('spreadsheet') ||
          file.mimeType.includes('excel') ||
          file.mimeType.includes('csv')
        );
      }
      if (activeCategory === 'presentations') {
        return (
          file.mimeType.includes('presentation') ||
          file.mimeType.includes('powerpoint')
        );
      }
      if (activeCategory === 'pdfs') {
        return file.mimeType.includes('pdf');
      }
      if (activeCategory === 'images') {
        return file.mimeType.startsWith('image/');
      }
      if (activeCategory === 'folders') {
        return file.mimeType.includes('folder');
      }
      return true;
    });
  }, [files, activeCategory]);

  // Sorting
  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      if (sortField === 'modifiedTime') {
        const timeA = new Date(a.modifiedTime || 0).getTime();
        const timeB = new Date(b.modifiedTime || 0).getTime();
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }
      if (sortField === 'name') {
        return sortOrder === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      }
      if (sortField === 'size') {
        const sizeA = typeof a.size === 'number' ? a.size : parseInt(a.size || '0', 10);
        const sizeB = typeof b.size === 'number' ? b.size : parseInt(b.size || '0', 10);
        return sortOrder === 'asc' ? sizeA - sizeB : sizeB - sizeA;
      }
      return 0;
    });
  }, [filteredFiles, sortField, sortOrder]);

  const formatFileSize = (bytes?: string | number) => {
    if (bytes === undefined || bytes === null) return '--';
    const num = typeof bytes === 'number' ? bytes : parseInt(bytes, 10);
    if (isNaN(num) || num === 0) return '--';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '--';
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const getDriveLink = (file: DriveFile) => {
    if (file.webViewLink) return file.webViewLink;
    return `https://drive.google.com/file/d/${file.id}/view`;
  };

  const categories = [
    { id: 'all' as FileCategory, label: 'All Files', icon: HardDrive },
    { id: 'documents' as FileCategory, label: 'Docs', icon: FileText },
    { id: 'spreadsheets' as FileCategory, label: 'Sheets', icon: FileSpreadsheet },
    { id: 'presentations' as FileCategory, label: 'Slides', icon: Presentation },
    { id: 'pdfs' as FileCategory, label: 'PDFs', icon: FileText },
    { id: 'folders' as FileCategory, label: 'Folders', icon: Folder },
  ];

  return (
    <div className="min-h-screen bg-[#f7f7f5] dark:bg-[#101613] flex flex-col text-stone-900 dark:text-stone-100 transition-colors duration-200">
      <Navbar onRefresh={() => setIsSyncModalOpen(true)} isRefreshing={isRefreshing} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top Header Banner */}
        <div className="rounded-3xl p-6 sm:p-8 bg-white dark:bg-[#16211b] border border-stone-200/90 dark:border-[#24352b] shadow-xs transition-colors duration-200">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                Google Drive Documents
              </h1>
              <p className="text-stone-600 dark:text-stone-300 text-sm max-w-xl">
                Browse documents, spreadsheets, slides, and PDFs tracked from your Google Drive.
              </p>
            </div>

            {/* Quick Metrics & Actions */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="px-4 py-2.5 rounded-2xl bg-stone-50 dark:bg-[#1f2c24] border border-stone-200 dark:border-[#283b30] text-center">
                <span className="block text-xl font-bold text-stone-900 dark:text-stone-100">
                  {files.length}
                </span>
                <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                  Total Files
                </span>
              </div>

              <div className="px-4 py-2.5 rounded-2xl bg-stone-50 dark:bg-[#1f2c24] border border-stone-200 dark:border-[#283b30] text-center">
                <span className="block text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1.5 py-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                  Connected
                </span>
                <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                  Drive Status
                </span>
              </div>

              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="px-4 py-3 rounded-2xl bg-[#1b3b2e] hover:bg-[#142e24] dark:bg-[#285743] dark:hover:bg-[#1f4534] text-white transition flex items-center gap-2 text-xs font-semibold shadow-xs"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Sync with Drive</span>
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
                onClick={() => fetchFiles(searchQuery)}
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

        {/* Controls Bar: Search, Category Filters, Sort, View Toggle */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files by name or type..."
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
              {/* Sort Selector */}
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#16211b] border border-stone-200 dark:border-[#283b30] text-xs text-stone-700 dark:text-stone-300 shadow-xs">
                <ArrowUpDown className="w-3.5 h-3.5 text-stone-400" />
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="bg-transparent text-stone-800 dark:text-stone-200 focus:outline-none cursor-pointer"
                >
                  <option value="modifiedTime">Last Modified</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 px-1 font-mono"
                  title="Toggle ascending / descending"
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>

              {/* View Toggle (Grid / List) */}
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

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 shrink-0 transition ${
                    isActive
                      ? 'bg-[#1b3b2e] text-white dark:bg-[#285743] dark:text-white shadow-xs'
                      : 'bg-white dark:bg-[#16211b] hover:bg-stone-100 dark:hover:bg-[#1f2c24] text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 border border-stone-200/90 dark:border-[#24352b]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        {isLoading ? (
          /* Loading Skeletons */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="p-5 rounded-2xl bg-white border border-stone-200 space-y-4 animate-pulse shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-stone-100" />
                  <div className="w-16 h-4 rounded-lg bg-stone-100" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-stone-100 rounded w-4/5" />
                  <div className="h-3 bg-stone-100 rounded w-1/2" />
                </div>
                <div className="pt-3 border-t border-stone-100 flex justify-between">
                  <div className="h-3 bg-stone-100 rounded w-20" />
                  <div className="h-3 bg-stone-100 rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedFiles.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center rounded-3xl bg-white border border-stone-200 shadow-sm space-y-4 my-8">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-stone-100 flex items-center justify-center text-stone-400 border border-stone-200">
              <HardDrive className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-stone-900">No files found</h3>
              <p className="text-sm text-stone-500 max-w-sm mx-auto">
                {searchQuery
                  ? `No matching drive files found for "${searchQuery}". Try another keyword.`
                  : 'No files found in your Google Drive.'}
              </p>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 transition"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedFiles.map((file) => (
              <div
                key={file.id}
                onClick={() => setSelectedFile(file)}
                className="group relative p-5 rounded-2xl bg-white dark:bg-[#16211b] hover:bg-stone-50/50 dark:hover:bg-[#1c2922] border border-stone-200/90 dark:border-[#24352b] shadow-xs hover:border-[#1b3b2e]/40 dark:hover:border-[#285743] transition cursor-pointer flex flex-col justify-between"
              >
                <div>
                  {/* Top card header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <FileIcon mimeType={file.mimeType} className="w-6 h-6" />
                    <span className="text-[11px] font-mono text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-[#121915] px-2 py-0.5 rounded-md border border-stone-200 dark:border-[#283b30]">
                      {formatFileSize(file.size)}
                    </span>
                  </div>

                  {/* File title */}
                  <h3
                    className="text-sm font-semibold text-stone-900 dark:text-stone-100 group-hover:text-[#1b3b2e] dark:group-hover:text-[#88d4a6] transition line-clamp-2 leading-snug mb-1"
                    title={file.name}
                  >
                    {file.name}
                  </h3>

                  <p className="text-[11px] text-stone-400 dark:text-stone-500 truncate mb-4">
                    {file.mimeType.split('.').pop() || file.mimeType}
                  </p>
                </div>

                {/* Bottom Card Footer */}
                <div className="pt-3 border-t border-stone-100 dark:border-[#24352b] flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                  <span className="flex items-center gap-1 text-[11px]">
                    <Clock className="w-3 h-3 text-stone-400" />
                    {formatDate(file.modifiedTime)}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {/* Track in Memo Mind Button */}
                    {!file.mimeType.includes('folder') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleIndexFile(file);
                        }}
                        disabled={indexingFiles[file.id] || indexedFiles.has(file.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition ${
                          indexedFiles.has(file.id)
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 cursor-default'
                            : indexingFiles[file.id]
                            ? 'bg-[#1b3b2e]/10 dark:bg-[#285743]/30 text-[#1b3b2e] dark:text-[#88d4a6] border border-[#1b3b2e]/20 dark:border-[#285743]/40 cursor-wait'
                            : 'bg-stone-100 dark:bg-[#1e2a22] hover:bg-stone-200 dark:hover:bg-[#25362c] text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-[#283b30]'
                        }`}
                        title={
                          indexedFiles.has(file.id)
                            ? 'Saved to Memo Mind'
                            : indexingFiles[file.id]
                            ? 'Saving to Memo Mind...'
                            : 'Save to Memo Mind for question answering'
                        }
                      >
                        {indexingFiles[file.id] ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-[#1b3b2e] dark:text-[#88d4a6]" />
                            <span>Saving...</span>
                          </>
                        ) : indexedFiles.has(file.id) ? (
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
                    )}

                    <a
                      href={getDriveLink(file)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#1e2a22] transition"
                      title="Open in Google Drive"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(file);
                      }}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
                      title="File Details"
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
                    <th className="py-3.5 px-4">Name</th>
                    <th className="py-3.5 px-4 hidden md:table-cell">Type</th>
                    <th className="py-3.5 px-4">Size</th>
                    <th className="py-3.5 px-4 hidden sm:table-cell">Last Modified</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-[#202e26]">
                  {sortedFiles.map((file) => (
                    <tr
                      key={file.id}
                      onClick={() => setSelectedFile(file)}
                      className="hover:bg-stone-50/70 dark:hover:bg-[#1c2821]/70 transition cursor-pointer group"
                    >
                      <td className="py-3.5 px-4 flex items-center gap-3">
                        <FileIcon mimeType={file.mimeType} className="w-4 h-4" />
                        <span className="font-medium text-stone-900 dark:text-stone-100 group-hover:text-[#1b3b2e] dark:group-hover:text-[#88d4a6] transition truncate max-w-xs sm:max-w-md">
                          {file.name}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 hidden md:table-cell text-stone-500 dark:text-stone-400 font-mono text-[11px] truncate max-w-[150px]">
                        {file.mimeType}
                      </td>
                      <td className="py-3.5 px-4 text-stone-500 dark:text-stone-400 font-mono">
                        {formatFileSize(file.size)}
                      </td>
                      <td className="py-3.5 px-4 hidden sm:table-cell text-stone-500 dark:text-stone-400">
                        {formatDate(file.modifiedTime)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!file.mimeType.includes('folder') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleIndexFile(file);
                              }}
                              disabled={indexingFiles[file.id] || indexedFiles.has(file.id)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                                indexedFiles.has(file.id)
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 cursor-default'
                                  : indexingFiles[file.id]
                                  ? 'bg-[#1b3b2e]/10 dark:bg-[#285743]/30 text-[#1b3b2e] dark:text-[#88d4a6] border border-[#1b3b2e]/20 dark:border-[#285743]/40 cursor-wait'
                                  : 'bg-stone-100 dark:bg-[#1e2a22] hover:bg-stone-200 dark:hover:bg-[#25362c] text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-[#283b30]'
                              }`}
                              title={
                                indexedFiles.has(file.id)
                                  ? 'Saved to Memo Mind'
                                  : indexingFiles[file.id]
                                  ? 'Saving to Memo Mind...'
                                  : 'Save to Memo Mind for question answering'
                              }
                            >
                              {indexingFiles[file.id] ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin text-[#1b3b2e] dark:text-[#88d4a6]" />
                                  <span>Saving...</span>
                                </>
                              ) : indexedFiles.has(file.id) ? (
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
                          )}

                          <a
                            href={getDriveLink(file)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#1e2a22] transition"
                            title="Open in Google Drive"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFile(file);
                            }}
                            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
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

      {/* File Details Slide-over Modal */}
      <FileDetailsModal
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
        onIndex={handleIndexFile}
        isIndexing={selectedFile ? !!indexingFiles[selectedFile.id] : false}
        isIndexed={selectedFile ? indexedFiles.has(selectedFile.id) : false}
        indexError={selectedFile ? fileErrors[selectedFile.id] : null}
      />

      {/* Sync Workspace Modal */}
      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncComplete={() => fetchFiles(searchQuery, true)}
      />

      {/* Floating Feedback Toast */}
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
