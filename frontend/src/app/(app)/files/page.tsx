'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
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
import { filesAPI } from '../../../services/api';
import UploadProgressIndicator from '../../components/UploadProgressIndicator';
import { canPreviewFile, formatFileSize, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, openBlobPreview, saveBlob, timeAgo } from '../_utils';

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
  return <Files className="h-5 w-5 text-slate-600" />;
}

function fileIconBg(mimeType: string) {
  if (mimeType.startsWith('image/')) return 'bg-pink-50';
  if (mimeType.startsWith('video/')) return 'bg-violet-50';
  if (mimeType.startsWith('audio/')) return 'bg-blue-50';
  if (mimeType === 'application/pdf') return 'bg-red-50';
  return 'bg-slate-50';
}

function matchesType(mimeType: string, filter: string) {
  if (filter === 'All') return true;
  if (filter === 'Documents') return !mimeType.startsWith('image/') && !mimeType.startsWith('video/') && !mimeType.startsWith('audio/');
  if (filter === 'Images') return mimeType.startsWith('image/');
  if (filter === 'Videos') return mimeType.startsWith('video/');
  if (filter === 'Audio') return mimeType.startsWith('audio/');
  return true;
}

export default function FilesPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  async function loadFiles(search = query) {
    setLoading(true);
    setError('');
    try {
      const data = await filesAPI.getWorkspace(search || undefined);
      setFiles(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setError('Files could not be loaded.');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadFiles('');
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => loadFiles(query), 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File exceeds the maximum upload size of ${MAX_UPLOAD_LABEL}.`);
      event.target.value = '';
      return;
    }
    setUploading(true);
    setError('');
    try {
      await filesAPI.upload(file);
      await loadFiles('');
      setQuery('');
    } catch {
      setError('File upload failed.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function handleDownload(file: FileItem) {
    setError('');
    try {
      const response = await filesAPI.download(file.id);
      saveBlob(response.data, file.filename);
    } catch {
      setError('Download is not available for this file.');
    }
  }

  async function handleView(file: FileItem) {
    setError('');
    try {
      const response = await filesAPI.view(file.id);
      const opened = openBlobPreview(response.data, file.mimeType);
      if (!opened) {
        setError('Preview could not be opened. Allow pop-ups or use Download.');
      }
    } catch {
      setError('Preview is not available for this file.');
    }
  }

  const displayed = files.filter((file) => matchesType(file.mimeType, typeFilter));

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <Files className="h-5 w-5 text-blue-700" />
          <h1 className="text-lg font-bold text-slate-950">Files</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {displayed.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadFiles()}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            title="Refresh files"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <input ref={inputRef} type="file" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {uploading ? (
              <UploadProgressIndicator label="Uploading..." />
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload
              </>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {uploading && (
          <UploadProgressIndicator
            variant="banner"
            label="Uploading file..."
            className="mb-4"
          />
        )}

        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={() => loadFiles()} className="font-semibold hover:text-red-900">
              Retry
            </button>
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400"
              placeholder="Search files..."
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
            <Filter className="ml-2 h-4 w-4 text-slate-400" />
            {fileTypes.map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                  typeFilter === type ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900'
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
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${
                  view === mode ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading files...</div>
        ) : displayed.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-slate-400">
            <Files className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No files yet</p>
            <p className="text-xs text-slate-400">Upload your first file to share it with the team.</p>
          </div>
        ) : view === 'list' ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {displayed.map((file) => (
              <div
                key={file.id}
                className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${fileIconBg(file.mimeType)}`}>
                  {fileIcon(file.mimeType)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{file.filename}</div>
                  <div className="truncate text-xs text-slate-500">
                    {file.uploader?.profile?.displayName || 'Unknown uploader'} - {timeAgo(file.createdAt)}
                  </div>
                </div>
                <span className="text-xs text-slate-500">{formatFileSize(file.fileSizeBytes)}</span>
                <button
                  onClick={() => handleView(file)}
                  disabled={!canPreviewFile(file.mimeType)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                  title={
                    canPreviewFile(file.mimeType)
                      ? `View ${file.filename}`
                      : 'Preview not available for this file type'
                  }
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDownload(file)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  title={`Download ${file.filename}`}
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {displayed.map((file) => (
              <div key={file.id} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-200">
                <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-xl ${fileIconBg(file.mimeType)}`}>
                  {fileIcon(file.mimeType)}
                </div>
                <div className="truncate text-sm font-semibold text-slate-900">{file.filename}</div>
                <div className="mt-1 text-xs text-slate-500">{formatFileSize(file.fileSizeBytes)}</div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => handleView(file)}
                    disabled={!canPreviewFile(file.mimeType)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </button>
                  <button
                    onClick={() => handleDownload(file)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
