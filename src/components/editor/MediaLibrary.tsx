import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOptionalAuth } from '../../contexts/AuthContext';
import { browseMedia, uploadMedia, deleteMedia, createFolder, copyMedia, moveMedia, renameMedia } from '../../utils/mediaStorage';
import type { MediaEntry } from '../../utils/mediaStorage';
import { toast } from '../shared/Toast';

// ─── Shared Inner Component ─────────────────────────────────────

interface MediaLibraryInnerProps {
  onSelect?: (url: string) => void;
  initialPath?: string;
}

export const MediaLibraryInner: React.FC<MediaLibraryInnerProps> = ({ onSelect, initialPath }) => {
  const auth = useOptionalAuth();
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [entries, setEntries] = useState<MediaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [clipboard, setClipboard] = useState<{ path: string; name: string; mode: 'copy' | 'cut' } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await browseMedia(currentPath);
      setEntries(result);
    } catch {
      toast.error('Failed to load media');
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleUpload = async (fileList: FileList | File[]) => {
    if (!auth?.user) {
      toast.warning('Sign in to upload media');
      return;
    }
    setUploading(true);
    let uploaded = 0;
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('image/')) continue;
      const result = await uploadMedia(file, currentPath);
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
      setEntries(prev => prev.filter(e => e.path !== path));
    } else {
      toast.error('Delete failed');
    }
    setDeleteConfirm(null);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!name) {
      toast.warning('Enter a folder name');
      return;
    }
    const folderPath = currentPath ? `${currentPath}/${name}` : name;
    const ok = await createFolder(folderPath);
    if (ok) {
      toast.success(`Created folder "${name}"`);
      setNewFolderName('');
      setShowNewFolder(false);
      refresh();
    } else {
      toast.error('Failed to create folder');
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => toast.success('URL copied'));
  };

  const handleCopyFile = (entry: MediaEntry) => {
    setClipboard({ path: entry.path, name: entry.name, mode: 'copy' });
    toast.info(`Copied "${entry.name}" to clipboard`);
  };

  const handleCutFile = (entry: MediaEntry) => {
    setClipboard({ path: entry.path, name: entry.name, mode: 'cut' });
    toast.info(`Cut "${entry.name}" to clipboard`);
  };

  const handlePaste = async () => {
    if (!clipboard) return;
    const destPath = currentPath ? `${currentPath}/${clipboard.name}` : clipboard.name;
    if (destPath === clipboard.path) {
      toast.warning('Source and destination are the same');
      return;
    }
    let ok: boolean;
    if (clipboard.mode === 'copy') {
      ok = await copyMedia(clipboard.path, destPath);
    } else {
      ok = await moveMedia(clipboard.path, destPath);
    }
    if (ok) {
      toast.success(clipboard.mode === 'copy' ? 'Pasted (copy)' : 'Moved');
      setClipboard(null);
      refresh();
    } else {
      toast.error(`${clipboard.mode === 'copy' ? 'Copy' : 'Move'} failed`);
    }
  };

  const handleRename = async (path: string) => {
    const newName = renameValue.trim();
    if (!newName) { setRenaming(null); return; }
    const ok = await renameMedia(path, newName);
    if (ok) {
      toast.success('Renamed');
      setRenaming(null);
      refresh();
    } else {
      toast.error('Rename failed');
    }
  };

  const handleMoveToFolder = async (entry: MediaEntry) => {
    const dest = window.prompt('Move to folder path:', currentPath);
    if (dest === null) return;
    const destPath = dest ? `${dest}/${entry.name}` : entry.name;
    const ok = await moveMedia(entry.path, destPath);
    if (ok) {
      toast.success('Moved');
      refresh();
    } else {
      toast.error('Move failed');
    }
  };

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    setSearch('');
  };

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
    setSearch('');
  };

  // Drag & drop handlers
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
  };

  // Build breadcrumbs
  const pathParts = currentPath.split('/').filter(Boolean);
  const breadcrumbs = [
    { label: 'root', path: '' },
    ...pathParts.map((part, i) => ({
      label: part,
      path: pathParts.slice(0, i + 1).join('/'),
    })),
  ];

  const filtered = search
    ? entries.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : entries;

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-1 mb-3 text-sm overflow-x-auto">
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={crumb.path}>
            {i > 0 && <span className="text-stone-600">/</span>}
            <button
              onClick={() => navigateTo(crumb.path)}
              className={`px-1.5 py-0.5 rounded hover:bg-stone-700 transition-colors whitespace-nowrap ${
                i === breadcrumbs.length - 1 ? 'text-copper-400 font-medium' : 'text-stone-400'
              }`}
            >
              {i === 0 ? '📂' : ''} {crumb.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Upload area + search + new folder */}
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
        <button
          onClick={() => setShowNewFolder(!showNewFolder)}
          className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs text-stone-300 whitespace-nowrap"
          title="New folder"
        >
          📁+
        </button>
        {clipboard && (
          <button
            onClick={handlePaste}
            className="px-2 py-1 bg-copper-700 hover:bg-copper-600 rounded text-xs text-parchment-100 whitespace-nowrap"
            title={`Paste "${clipboard.name}" here (${clipboard.mode})`}
          >
            📥 Paste
          </button>
        )}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter..."
          className="w-28 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
        />
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            placeholder="Folder name..."
            className="flex-1 px-2 py-1.5 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-copper-400"
            autoFocus
          />
          <button onClick={handleCreateFolder} className="px-3 py-1 bg-copper-600 hover:bg-copper-500 rounded text-xs text-parchment-100">
            Create
          </button>
          <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs text-stone-300">
            Cancel
          </button>
        </div>
      )}

      {/* Content grid */}
      <div className="flex-1 overflow-y-auto dungeon-scrollbar">
        {loading ? (
          <div className="text-center py-8 text-stone-400 animate-pulse">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-stone-500 text-sm">
            {search ? 'No files match your filter' : 'Empty folder'}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {/* Back button when inside a folder */}
            {currentPath && !search && (
              <div
                onClick={navigateUp}
                className="group relative bg-stone-800 rounded border border-stone-700 hover:border-copper-400 transition-colors overflow-hidden cursor-pointer"
              >
                <div className="aspect-square flex items-center justify-center text-2xl text-stone-400 group-hover:text-copper-400">
                  ⬆️
                </div>
                <div className="px-1.5 py-1 text-[10px] text-stone-400 text-center">..</div>
              </div>
            )}

            {filtered.map(entry => (
              <div
                key={entry.path}
                className="group relative bg-stone-800 rounded border border-stone-700 hover:border-copper-400 transition-colors overflow-hidden"
              >
                {entry.isFolder ? (
                  /* Folder */
                  <div
                    className="aspect-square flex items-center justify-center text-2xl cursor-pointer text-stone-400 group-hover:text-copper-400"
                    onClick={() => navigateTo(entry.path)}
                    title={`Open ${entry.name}`}
                  >
                    📁
                  </div>
                ) : (
                  /* File thumbnail */
                  <div
                    className={`aspect-square sprite-preview-bg flex items-center justify-center p-1 ${onSelect ? 'cursor-pointer' : ''}`}
                    onClick={() => entry.url && onSelect?.(entry.url)}
                    title={onSelect ? 'Click to select' : entry.name}
                  >
                    <img
                      src={entry.url}
                      alt={entry.name}
                      className="max-w-full max-h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                )}

                {/* Name row */}
                {renaming === entry.path ? (
                  <div className="px-1 py-0.5 flex gap-0.5">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(entry.path); if (e.key === 'Escape') setRenaming(null); }}
                      className="flex-1 min-w-0 px-1 py-0.5 bg-stone-700 rounded text-[10px] text-parchment-100 focus:outline-none focus:ring-1 focus:ring-copper-400"
                      autoFocus
                    />
                    <button onClick={() => handleRename(entry.path)} className="text-[10px] text-copper-400 hover:text-copper-300">✓</button>
                  </div>
                ) : (
                  <div className="px-1.5 py-1 text-[10px] text-stone-400 truncate" title={entry.name}>
                    {entry.name}
                    {!entry.isFolder && entry.size && entry.size > 0 && (
                      <span className="ml-1 text-stone-500">{formatSize(entry.size)}</span>
                    )}
                  </div>
                )}

                {/* Action buttons (hover) - only for files */}
                {!entry.isFolder && (
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); entry.url && copyUrl(entry.url); }}
                      className="w-6 h-6 bg-stone-900/80 hover:bg-arcane-700 rounded text-xs flex items-center justify-center"
                      title="Copy URL"
                    >
                      📋
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopyFile(entry); }}
                      className="w-6 h-6 bg-stone-900/80 hover:bg-arcane-700 rounded text-xs flex items-center justify-center"
                      title="Copy file"
                    >
                      ⧉
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCutFile(entry); }}
                      className="w-6 h-6 bg-stone-900/80 hover:bg-amber-700 rounded text-xs flex items-center justify-center"
                      title="Cut (move)"
                    >
                      ✂
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenaming(entry.path); setRenameValue(entry.name); }}
                      className="w-6 h-6 bg-stone-900/80 hover:bg-arcane-700 rounded text-xs flex items-center justify-center"
                      title="Rename"
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMoveToFolder(entry); }}
                      className="w-6 h-6 bg-stone-900/80 hover:bg-arcane-700 rounded text-xs flex items-center justify-center"
                      title="Move to folder..."
                    >
                      ➜
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(entry.path); }}
                      className="w-6 h-6 bg-stone-900/80 hover:bg-blood-700 rounded text-xs flex items-center justify-center"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                )}
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
  initialPath?: string;
}

export const MediaLibraryModal: React.FC<MediaLibraryModalProps> = ({ isOpen, onClose, onSelect, initialPath }) => {
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
        <MediaLibraryInner onSelect={handleSelect} initialPath={initialPath} />
      </div>
    </div>
  );
};
