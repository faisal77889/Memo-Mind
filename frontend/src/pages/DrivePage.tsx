import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getDriveFiles, searchDriveFiles, getApiErrorMessage } from '../services/api';
import type { DriveFile } from '../types';
import { Navbar } from '../components/Navbar';
import { FileIcon } from '../components/FileIcon';
import { FileDetailsModal } from '../components/FileDetailsModal';
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
  Database,
} from 'lucide-react';

type FileCategory = 'all' | 'documents' | 'spreadsheets' | 'presentations' | 'pdfs' | 'images' | 'folders';
type SortField = 'modifiedTime' | 'name' | 'size';
type SortOrder = 'asc' | 'desc';

export const DrivePage: React.FC = () => {
  const { token, logout } = useAuth();

  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<FileCategory>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortField, setSortField] = useState<SortField>('modifiedTime');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);

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
          // Call backend search endpoint
          response = await searchDriveFiles(token, query.trim(), 50);
        } else {
          // Call backend list files endpoint
          response = await getDriveFiles(token, 50);
        }

        setFiles(response.files || []);
      } catch (err: unknown) {
        console.error('Error fetching drive files:', err);
        const msg = getApiErrorMessage(err);
        if (msg.includes('401') || msg.toLowerCase().includes('revoked') || msg.toLowerCase().includes('token')) {
          setError('Google Drive authorization expired or revoked. Please sign in again.');
        } else {
          setError(msg || 'Unable to load Google Drive files. Check backend service status.');
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

  // Sorted files
  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      if (sortField === 'name') {
        return sortOrder === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      }
      if (sortField === 'size') {
        const sizeA = typeof a.size === 'string' ? parseInt(a.size, 10) || 0 : a.size || 0;
        const sizeB = typeof b.size === 'string' ? parseInt(b.size, 10) || 0 : b.size || 0;
        return sortOrder === 'asc' ? sizeA - sizeB : sizeB - sizeA;
      }
      if (sortField === 'modifiedTime') {
        const dateA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
        const dateB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      }
      return 0;
    });
  }, [filteredFiles, sortField, sortOrder]);

  const formatFileSize = (bytes?: string | number) => {
    if (bytes === undefined || bytes === null || bytes === 0 || bytes === '0') {
      return '--';
    }
    const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(num)) return '--';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '--';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
      if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
    } catch {
      return isoString;
    }
  };

  const getDriveLink = (file: DriveFile) => {
    if (file.webViewLink) return file.webViewLink;
    if (file.mimeType.includes('folder')) {
      return `https://drive.google.com/drive/folders/${file.id}`;
    }
    return `https://drive.google.com/file/d/${file.id}/view`;
  };

  // Category filters metadata
  const categories = [
    { id: 'all' as FileCategory, label: 'All Files', icon: HardDrive },
    { id: 'documents' as FileCategory, label: 'Docs', icon: FileText },
    { id: 'spreadsheets' as FileCategory, label: 'Sheets', icon: FileSpreadsheet },
    { id: 'presentations' as FileCategory, label: 'Slides', icon: Presentation },
    { id: 'pdfs' as FileCategory, label: 'PDFs', icon: FileText },
    { id: 'folders' as FileCategory, label: 'Folders', icon: Folder },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100">
      <Navbar onRefresh={() => fetchFiles(searchQuery, true)} isRefreshing={isRefreshing} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top Hero / Stats Banner */}
        <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-indigo-950/60 via-slate-900/80 to-purple-950/40 border border-slate-800 shadow-xl">
          {/* Subtle glow background */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                <Database className="w-3.5 h-3.5 text-indigo-400" />
                <span>Google Drive Synapse Ingestion</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Enterprise Drive Workspace
              </h1>
              <p className="text-slate-400 text-sm max-w-2xl">
                Browse, search, and inspect corporate files indexed directly from Google Drive API.
              </p>
            </div>

            {/* Quick Metrics Cards */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="flex-1 md:flex-initial px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-center">
                <span className="block text-2xl font-extrabold text-white">
                  {files.length}
                </span>
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Files Loaded
                </span>
              </div>
              <div className="flex-1 md:flex-initial px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-center">
                <span className="block text-2xl font-extrabold text-indigo-400 flex items-center justify-center gap-1">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  Live
                </span>
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  API Status
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Error Alert Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm text-rose-300">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => fetchFiles(searchQuery)}
                className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold transition"
              >
                Retry Request
              </button>
              <button
                onClick={logout}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
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
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search drive files by name or type..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl glass-input text-sm placeholder:text-slate-500 focus:outline-none transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Right Tools: Sort & View Toggle */}
            <div className="flex items-center gap-2 self-end md:self-center">
              {/* Sort Selector */}
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="bg-transparent text-slate-300 focus:outline-none cursor-pointer"
                >
                  <option value="modifiedTime" className="bg-slate-900">Last Modified</option>
                  <option value="name" className="bg-slate-900">Name</option>
                  <option value="size" className="bg-slate-900">Size</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="text-slate-400 hover:text-white px-1 font-mono"
                  title="Toggle ascending / descending"
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>

              {/* View Toggle (Grid / List) */}
              <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition ${
                    viewMode === 'grid'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Grid view"
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg transition ${
                    viewMode === 'list'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
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
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
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
                className="p-5 rounded-2xl glass-card border-slate-800/80 space-y-4 animate-pulse"
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-slate-800" />
                  <div className="w-16 h-4 rounded-lg bg-slate-800" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-slate-800 rounded w-4/5" />
                  <div className="h-3 bg-slate-800/60 rounded w-1/2" />
                </div>
                <div className="pt-3 border-t border-slate-800/50 flex justify-between">
                  <div className="h-3 bg-slate-800 rounded w-20" />
                  <div className="h-3 bg-slate-800 rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedFiles.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center rounded-3xl glass-card border-slate-800/80 space-y-4 my-8">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-900 flex items-center justify-center text-slate-500 border border-slate-800">
              <HardDrive className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-white">No files found</h3>
              <p className="text-sm text-slate-400 max-w-sm mx-auto">
                {searchQuery
                  ? `No matching drive files found for "${searchQuery}". Try another keyword.`
                  : 'No files returned from Google Drive API.'}
              </p>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition"
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
                className="group relative p-5 rounded-2xl glass-card hover:bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/40 shadow-lg hover:shadow-indigo-500/10 transition-all duration-300 cursor-pointer flex flex-col justify-between"
              >
                <div>
                  {/* Top card header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <FileIcon mimeType={file.mimeType} className="w-6 h-6" />
                    <span className="text-[11px] font-mono text-slate-500 bg-slate-900/90 px-2 py-0.5 rounded-md border border-slate-800">
                      {formatFileSize(file.size)}
                    </span>
                  </div>

                  {/* File title */}
                  <h3
                    className="text-sm font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors line-clamp-2 leading-snug mb-1"
                    title={file.name}
                  >
                    {file.name}
                  </h3>

                  <p className="text-[11px] font-mono text-slate-500 truncate mb-4">
                    {file.mimeType.split('.').pop() || file.mimeType}
                  </p>
                </div>

                {/* Bottom Card Footer */}
                <div className="pt-3 border-t border-slate-800/70 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {formatDate(file.modifiedTime)}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={getDriveLink(file)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                      title="Open in Google Drive"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(file);
                      }}
                      className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition"
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
          <div className="rounded-2xl glass-card border border-slate-800/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Name</th>
                    <th className="py-3.5 px-4 hidden md:table-cell">Type</th>
                    <th className="py-3.5 px-4">Size</th>
                    <th className="py-3.5 px-4 hidden sm:table-cell">Last Modified</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sortedFiles.map((file) => (
                    <tr
                      key={file.id}
                      onClick={() => setSelectedFile(file)}
                      className="hover:bg-slate-900/60 transition cursor-pointer group"
                    >
                      <td className="py-3.5 px-4 flex items-center gap-3">
                        <FileIcon mimeType={file.mimeType} className="w-4 h-4" />
                        <span className="font-medium text-slate-200 group-hover:text-indigo-300 transition truncate max-w-xs sm:max-w-md">
                          {file.name}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 hidden md:table-cell text-slate-400 font-mono text-[11px] truncate max-w-[150px]">
                        {file.mimeType}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono">
                        {formatFileSize(file.size)}
                      </td>
                      <td className="py-3.5 px-4 hidden sm:table-cell text-slate-400">
                        {formatDate(file.modifiedTime)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={getDriveLink(file)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                            title="Open in Google Drive"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFile(file);
                            }}
                            className="p-1 rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition"
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
      <FileDetailsModal file={selectedFile} onClose={() => setSelectedFile(null)} />
    </div>
  );
};
