import React, { useState, useRef, useEffect } from 'react';
import { getFolders, createFolder, deleteFolder, renameFolder, type AssetFolder, type AssetCategory } from '../../utils/assetStorage';

interface FolderDropdownProps {
  category: AssetCategory;
  selectedFolderId: string | null; // null = "All", empty string = "Uncategorized"
  onFolderSelect: (folderId: string | null) => void;
  onFoldersChange?: () => void; // Called when folders are created/deleted/renamed
}

export const FolderDropdown: React.FC<FolderDropdownProps> = ({
  category,
  selectedFolderId,
  onFolderSelect,
  onFoldersChange,
}) => {
  const [folders, setFolders] = useState<AssetFolder[]>(() => getFolders(category));
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshFolders = () => {
    setFolders(getFolders(category));
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
        setEditingFolderId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when creating/editing
  useEffect(() => {
    if ((isCreating || editingFolderId) && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating, editingFolderId]);

  const getSelectedLabel = (): string => {
    if (selectedFolderId === null) return 'All';
    if (selectedFolderId === '') return 'Uncategorized';
    const folder = folders.find(f => f.id === selectedFolderId);
    return folder?.name || 'Unknown';
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    createFolder(newFolderName.trim(), category);
    setNewFolderName('');
    setIsCreating(false);
    refreshFolders();
    onFoldersChange?.();
  };

  const handleRenameFolder = (folderId: string) => {
    if (!editingName.trim()) return;
    renameFolder(folderId, editingName.trim());
    setEditingFolderId(null);
    setEditingName('');
    refreshFolders();
    onFoldersChange?.();
  };

  const handleDeleteFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this folder? Assets will be moved to Uncategorized.')) return;
    deleteFolder(folderId);
    if (selectedFolderId === folderId) {
      onFolderSelect(null); // Reset to "All"
    }
    refreshFolders();
    onFoldersChange?.();
  };

  const startEditing = (folder: AssetFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolderId(folder.id);
    setEditingName(folder.name);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-gray-700 rounded text-sm flex items-center justify-between hover:bg-gray-600 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-gray-400">Folder:</span>
          <span>{getSelectedLabel()}</span>
        </span>
        <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg max-h-64 overflow-y-auto">
          {/* All option */}
          <button
            onClick={() => { onFolderSelect(null); setIsOpen(false); }}
            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              selectedFolderId === null ? 'bg-blue-600' : ''
            }`}
          >
            <span>All</span>
          </button>

          {/* Uncategorized option */}
          <button
            onClick={() => { onFolderSelect(''); setIsOpen(false); }}
            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-700 transition-colors flex items-center gap-2 ${
              selectedFolderId === '' ? 'bg-blue-600' : ''
            }`}
          >
            <span>Uncategorized</span>
          </button>

          {/* Divider */}
          {folders.length > 0 && <div className="border-t border-gray-600 my-1" />}

          {/* Folder list */}
          {folders.map(folder => (
            <div
              key={folder.id}
              className={`flex items-center group ${
                selectedFolderId === folder.id ? 'bg-blue-600' : 'hover:bg-gray-700'
              }`}
            >
              {editingFolderId === folder.id ? (
                <div className="flex-1 px-2 py-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameFolder(folder.id);
                      if (e.key === 'Escape') { setEditingFolderId(null); setEditingName(''); }
                    }}
                    onBlur={() => handleRenameFolder(folder.id)}
                    className="w-full px-2 py-1 bg-gray-600 rounded text-sm"
                  />
                </div>
              ) : (
                <>
                  <button
                    onClick={() => { onFolderSelect(folder.id); setIsOpen(false); }}
                    className="flex-1 px-3 py-2 text-left text-sm flex items-center gap-2"
                  >
                    <span>{folder.name}</span>
                  </button>
                  <div className="flex items-center gap-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => startEditing(folder, e)}
                      className="p-1 text-xs text-gray-400 hover:text-white"
                      title="Rename"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => handleDeleteFolder(folder.id, e)}
                      className="p-1 text-xs text-gray-400 hover:text-red-400"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Divider */}
          <div className="border-t border-gray-600 my-1" />

          {/* Create new folder */}
          {isCreating ? (
            <div className="px-2 py-2">
              <input
                ref={inputRef}
                type="text"
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') { setIsCreating(false); setNewFolderName(''); }
                }}
                className="w-full px-2 py-1 bg-gray-600 rounded text-sm"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleCreateFolder}
                  className="flex-1 px-2 py-1 bg-green-600 rounded text-xs hover:bg-green-700"
                >
                  Create
                </button>
                <button
                  onClick={() => { setIsCreating(false); setNewFolderName(''); }}
                  className="flex-1 px-2 py-1 bg-gray-600 rounded text-xs hover:bg-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full px-3 py-2 text-left text-sm text-green-400 hover:bg-gray-700 transition-colors"
            >
              + New Folder
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Hook to get assets filtered by folder
export function useFilteredAssets<T extends { folderId?: string }>(
  assets: T[],
  selectedFolderId: string | null
): T[] {
  if (selectedFolderId === null) {
    // "All" - show all assets
    return assets;
  }
  if (selectedFolderId === '') {
    // "Uncategorized" - show assets without a folder
    return assets.filter(a => !a.folderId);
  }
  // Specific folder - show assets in that folder
  return assets.filter(a => a.folderId === selectedFolderId);
}
