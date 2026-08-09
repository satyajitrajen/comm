import React, { useEffect, useRef, useState, ChangeEvent } from 'react';
import {
  Download,
  Eye,
  FileText,
  Files,
  Filter,
  Image as ImageIcon,
  Music,
  RefreshCw,
  Search,
  Upload,
  Video,
} from 'lucide-react';
import { filesAPI } from '../api/api';
import { formatFileSize, timeAgo } from '../utils/utils';

type FileItem = {
  id: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: string | number;
  createdAt: string;
  uploader?: { profile?: { displayName?: string | null } | null } | null;
};

const fileTypes = ['All', 'Documents', 'Images', 'Videos', 'Audio'];

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon className="h-5 w-5 text-pink-600" />;
  if (mimeType.startsWith('video/')) return <Video className="h-5 w-5 text-violet-600" />;
  if (mimeType.startsWith('audio/')) return <Music className="h-5 w-5 text-blue-600" />;
  if (mimeType === 'application/pdf') return <FileText className="h-5 w-5 text-red-600" />;
  return <Files className="h-5 w-5 text-indigo-600" />;
}

function fileIconBg(mimeType: string) {
  if (mimeType.startsWith('image/')) return 'bg-pink-50';
  if (mimeType.startsWith('video/')) return 'bg-violet-50';
  if (mimeType.startsWith('audio/')) return 'bg-blue-50';
  if (mimeType === 'application/pdf') return 'bg-red-50';
  return 'bg-indigo-50';
}

function matchesType(mimeType: string, filter: string) {
  if (filter === 'All') return true;
  if (filter === 'Documents') return !mimeType.startsWith('image/') && !mimeType.startsWith('video/') && !mimeType.startsWith('audio/');
  if (filter === 'Images') return mimeType.startsWith('image/');
  if (filter === 'Videos') return mimeType.startsWith('video/');
  if (filter === 'Audio') return mimeType.startsWith('audio/');
  return true;
}

export const FilesView: React.FC = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadFiles = async (search = query) => {
    setLoading(true);
    setError('');
    try {
      const data = await filesAPI.getWorkspace(search || undefined);
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const formatted = items.map((f: any) => ({
        id: f.id,
        filename: f.filename || f.originalName || f.name || 'File Attachment',
        mimeType: f.mimeType || 'application/octet-stream',
        fileSizeBytes: f.fileSizeBytes || f.sizeBytes || 0,
        createdAt: f.createdAt || new Date().toISOString(),
        uploader: f.uploader || { profile: { displayName: f.user?.profile?.displayName || 'Team Member' } },
      }));
      setFiles(formatted);
    } catch (err) {
      console.warn('Failed to load files from API:', err);
      setError('Files could not be loaded.');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles('');
  }, []);

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await filesAPI.upload(file);
      await loadFiles('');
    } catch (err) {
      console.error('File upload failed:', err);
      setError('File upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = async (file: FileItem) => {
    try {
      const response = await filesAPI.download(file.id);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.warn('Download failed from API:', err);
    }
  };

  const displayed = files.filter((f) => matchesType(f.mimeType, typeFilter));

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden bg-slate-50 select-none">
      {/* Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <Files className="h-5 w-5 text-indigo-600" />
          <h1 className="text-base font-bold text-slate-900">Workspace Files</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{displayed.length}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadFiles()}
            disabled={loading}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title="Refresh files"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <input ref={inputRef} type="file" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-xs"
          >
            <Upload className="h-4 w-4" />
            <span>{uploading ? 'Uploading...' : 'Upload File'}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 font-semibold">
            <span>{error}</span>
            <button onClick={() => loadFiles()} className="hover:underline">
              Retry
            </button>
          </div>
        )}

        {/* Filter Controls Bar */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-indigo-500"
              placeholder="Search files..."
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
            <Filter className="ml-2 h-3.5 w-3.5 text-slate-400" />
            {fileTypes.map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                  typeFilter === type ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(['list', 'grid'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={`rounded-md px-3 py-1 text-xs font-bold capitalize transition-colors ${
                  view === mode ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* File Stream */}
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading files...</div>
        ) : displayed.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-slate-400">
            <Files className="h-10 w-10 text-slate-300" />
            <p className="text-xs font-semibold">No files match your search query.</p>
          </div>
        ) : view === 'list' ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
            {displayed.map((file) => (
              <div
                key={file.id}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50 transition-colors"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${fileIconBg(file.mimeType)}`}>
                  {fileIcon(file.mimeType)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-slate-900">{file.filename}</div>
                  <div className="truncate text-[10px] text-slate-400">
                    {file.uploader?.profile?.displayName || 'Team Member'} • {timeAgo(file.createdAt)}
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-500">{formatFileSize(file.fileSizeBytes)}</span>
                <button
                  onClick={() => handleDownload(file)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  title="Download File"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {displayed.map((file) => (
              <div key={file.id} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300 shadow-2xs transition-all flex flex-col justify-between">
                <div>
                  <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl ${fileIconBg(file.mimeType)}`}>
                    {fileIcon(file.mimeType)}
                  </div>
                  <div className="truncate text-xs font-bold text-slate-900">{file.filename}</div>
                  <div className="mt-1 text-[10px] text-slate-400 font-mono">{formatFileSize(file.fileSizeBytes)}</div>
                </div>
                <button
                  onClick={() => handleDownload(file)}
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
