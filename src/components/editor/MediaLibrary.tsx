import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOptionalAuth } from '../../contexts/AuthContext';
import { uploadMedia, listMedia, deleteMedia, MEDIA_FOLDERS } from '../../utils/mediaStorage';
import type { MediaFile, MediaFolder } from '../../utils/mediaStorage';
import { toast } from '../shared/Toast';

// ─── Shared Inner Component ─────────────────────────────────────

interface MediaLibraryInnerProps {
  onSelect?: (url: string) => void;
  initialFolder?: MediaFolder;
}

export const MediaLibraryInner: React.FC<MediaLibraryInnerProps> = ({ onSelect, initialFolder }) => {
  const auth = useOptionalAuth();
  const [folder, setFolder] = useState<MediaFolder>(initialFolder || 'characters');
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const userId = auth?.user?.id;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listMedia(folder);
      setFiles(result);
    } catch {
      toast.error('Failed to load media');
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleUpload = async (fileList: FileList | File[]) => {
    if (!userId) {
      toast.warning('Sign in to upload media');
      return;
    }
    setUploading(true);
    let uploaded = 0;
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('image/')) continue;
      const result = await uploadMedia(file, folder, userId);
      if (result) uploaded++;
    }
    if (uploaded > 0) {
      toast.success(`Uploaded ${uploaded} file${uploaded > 1 ? 's' : ''}`);
      refresh();
    } else {
      toast.error('Upload failed');
    }
    setUploading(false);
  };

  const handleDelete = async (path: string) => {
    const ok = await deleteMedia(path);
    if (ok) {
      toast.success('Deleted');
      setFiles(prev => prev.filter(f => f.path !== path));
    } else {
      toast.error('Delete failed');
    }
    setDeleteConfirm(null);
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => toast.success('URL copied'));
  };

  // Drag & drop handlers
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
  };

  const filtered = search
    ? files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : files;

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Folder tabs */}
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {MEDIA_FOLDERS.map(f => (
          <button
            key={f.key}
            onClick={() => { setFolder(f.key); setSearch(''); }}
            className={`dungeon-tab whitespace-nowrap ${folder === f.key ? 'dungeon-tab-active' : ''}`}
          >
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {/* Upload area + search */}
      <div className="flex gap-2 mb-3">
        <div
          ref={dropRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`flex-1 border-2 border-dashed rounded p-2 text-center text-xs transition-colors cursor-pointer ${
            dragOver ? 'border-copper-400 bg-copper-900/20' : 'border-stone-600 hover:border-stone-500'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <span className="text-stone-400 animate-pulse">Uploading...</span>
          ) : (
            <span className="text-stone-400">Drop files here or click to upload</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter..."
          className="w-32 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
        />
      </div>

      {/* File grid */}
      <div className="flex-1 overflow-y-auto dungeon-scrollbar">
        {loading ? (
          <div className="text-center py-8 text-stone-400 animate-pulse">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-stone-500 text-sm">
            {search ? 'No files match your filter' : 'No files uploaded yet'}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {filtered.map(file => (
              <div
                key={file.path}
                className="group relative bg-stone-800 rounded border border-stone-700 hover:border-copper-400 transition-colors overflow-hidden"
              >
                {/* Thumbnail */}
                <div
                  className={`aspect-square sprite-preview-bg flex items-center justify-center p-1 ${onSelect ? 'cursor-pointer' : ''}`}
                  onClick={() => onSelect?.(file.url)}
                  title={onSelect ? 'Click to select' : file.name}
                >
                  <img
                    src={file.url}
                    alt={file.name}
                    className="max-w-full max-h-full object-contain"
                    loading="lazy"
                  />
                </div>

                {/* Info row */}
                <div className="px-1.5 py-1 text-[10px] text-stone-400 truncate" title={file.name}>
                  {file.name}
                  {file.size > 0 && <span className="ml-1 text-stone-500">{formatSize(file.size)}</span>}
                </div>

                {/* Action buttons (hover) */}
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); copyUrl(file.url); }}
                    className="w-6 h-6 bg-stone-900/80 hover:bg-arcane-700 rounded text-xs flex items-center justify-center"
                    title="Copy URL"
                  >
                    📋
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(file.path); }}
                    className="w-6 h-6 bg-stone-900/80 hover:bg-blood-700 rounded text-xs flex items-center justify-center"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={() => setDeleteConfirm(null)}>
          <div className="dungeon-panel p-4 max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-stone-300 mb-3">Delete this file? This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="dungeon-btn px-3 py-1 text-sm">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="dungeon-btn-danger px-3 py-1 text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Modal Version ──────────────────────────────────────────────

interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  initialFolder?: MediaFolder;
}

export const MediaLibraryModal: React.FC<MediaLibraryModalProps> = ({ isOpen, onClose, onSelect, initialFolder }) => {
  if (!isOpen) return null;

  const handleSelect = (url: string) => {
    onSelect(url);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="dungeon-panel w-full max-w-4xl h-[80vh] flex flex-col p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medieval text-copper-400">Cloud Media Library</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-parchment-100 text-xl px-2">✕</button>
        </div>
        <MediaLibraryInner onSelect={handleSelect} initialFolder={initialFolder} />
      </div>
    </div>
  );
};
