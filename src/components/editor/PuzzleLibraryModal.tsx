import React, { useState, useMemo, useEffect } from 'react';
import type { SavedPuzzle } from '../../utils/puzzleStorage';
import { getPuzzleFolders, addPuzzleFolder, deletePuzzleFolder, setPuzzleFolder } from '../../utils/puzzleStorage';

interface PuzzleLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzles: SavedPuzzle[];
  onLoad: (puzzleId: string) => void;
  onDelete: (puzzleId: string) => void;
  onPuzzlesChanged?: () => void; // Called when folder assignment changes
  currentPuzzleId?: string;
}

type SortOption = 'name' | 'date_newest' | 'date_oldest' | 'size';

export const PuzzleLibraryModal: React.FC<PuzzleLibraryModalProps> = ({
  isOpen,
  onClose,
  puzzles,
  onLoad,
  onDelete,
  onPuzzlesChanged,
  currentPuzzleId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_newest');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // null = all, '' = unfiled
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [movingPuzzle, setMovingPuzzle] = useState<string | null>(null);

  // Load folders when modal opens
  useEffect(() => {
    if (isOpen) {
      setFolders(getPuzzleFolders());
      setSearchQuery('');
      setConfirmDelete(null);
      setShowNewFolderInput(false);
      setNewFolderName('');
      setFolderToDelete(null);
      setMovingPuzzle(null);
    }
  }, [isOpen]);

  // Count puzzles per folder
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = { _unfiled: 0, _all: puzzles.length };
    folders.forEach(f => counts[f] = 0);

    puzzles.forEach(p => {
      if (p.folder && folders.includes(p.folder)) {
        counts[p.folder]++;
      } else {
        counts._unfiled++;
      }
    });

    return counts;
  }, [puzzles, folders]);

  // Filter and sort puzzles
  const filteredPuzzles = useMemo(() => {
    let result = [...puzzles];

    // Filter by folder
    if (selectedFolder === '') {
      // Unfiled only
      result = result.filter(p => !p.folder || !folders.includes(p.folder));
    } else if (selectedFolder !== null) {
      // Specific folder
      result = result.filter(p => p.folder === selectedFolder);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query)
      );
    }

    // Sort
    switch (sortBy) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'date_newest':
        result.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
        break;
      case 'date_oldest':
        result.sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime());
        break;
      case 'size':
        result.sort((a, b) => (b.width * b.height) - (a.width * a.height));
        break;
    }

    return result;
  }, [puzzles, searchQuery, sortBy, selectedFolder, folders]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (movingPuzzle) {
          setMovingPuzzle(null);
        } else if (confirmDelete) {
          setConfirmDelete(null);
        } else if (folderToDelete) {
          setFolderToDelete(null);
        } else if (showNewFolderInput) {
          setShowNewFolderInput(false);
          setNewFolderName('');
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, confirmDelete, folderToDelete, showNewFolderInput, movingPuzzle]);

  if (!isOpen) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleLoad = (puzzleId: string) => {
    onLoad(puzzleId);
    onClose();
  };

  const handleDeleteClick = (puzzleId: string) => {
    setConfirmDelete(puzzleId);
  };

  const handleConfirmDelete = (puzzleId: string) => {
    onDelete(puzzleId);
    setConfirmDelete(null);
  };

  const handleCreateFolder = () => {
    if (addPuzzleFolder(newFolderName)) {
      setFolders(getPuzzleFolders());
      setNewFolderName('');
      setShowNewFolderInput(false);
    }
  };

  const handleDeleteFolder = (folderName: string) => {
    deletePuzzleFolder(folderName);
    setFolders(getPuzzleFolders());
    setFolderToDelete(null);
    if (selectedFolder === folderName) {
      setSelectedFolder(null);
    }
    onPuzzlesChanged?.();
  };

  const handleMovePuzzle = (puzzleId: string, folder: string | undefined) => {
    setPuzzleFolder(puzzleId, folder);
    setMovingPuzzle(null);
    onPuzzlesChanged?.();
  };

  const getFolderDisplayName = () => {
    if (selectedFolder === null) return 'All Puzzles';
    if (selectedFolder === '') return 'Unfiled';
    return selectedFolder;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Puzzle Library</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - Folders */}
          <div className="w-48 border-r border-gray-700 flex flex-col">
            <div className="p-3 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Folders</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {/* All Puzzles */}
              <button
                onClick={() => setSelectedFolder(null)}
                className={`w-full text-left px-3 py-2 rounded text-sm flex justify-between items-center ${
                  selectedFolder === null
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-800 text-gray-300'
                }`}
              >
                <span>All Puzzles</span>
                <span className="text-xs opacity-70">{folderCounts._all}</span>
              </button>

              {/* Unfiled */}
              <button
                onClick={() => setSelectedFolder('')}
                className={`w-full text-left px-3 py-2 rounded text-sm flex justify-between items-center ${
                  selectedFolder === ''
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-800 text-gray-300'
                }`}
              >
                <span>Unfiled</span>
                <span className="text-xs opacity-70">{folderCounts._unfiled}</span>
              </button>

              {/* Divider */}
              {folders.length > 0 && <div className="border-t border-gray-700 my-2" />}

              {/* Custom folders */}
              {folders.map(folder => (
                <div key={folder} className="group relative">
                  {folderToDelete === folder ? (
                    <div className="px-2 py-1 bg-red-900/50 rounded text-sm">
                      <p className="text-red-300 text-xs mb-2">Delete "{folder}"?</p>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setFolderToDelete(null)}
                          className="flex-1 px-2 py-1 bg-gray-600 rounded text-xs hover:bg-gray-500"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDeleteFolder(folder)}
                          className="flex-1 px-2 py-1 bg-red-600 rounded text-xs hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedFolder(folder)}
                      className={`w-full text-left px-3 py-2 rounded text-sm flex justify-between items-center ${
                        selectedFolder === folder
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-800 text-gray-300'
                      }`}
                    >
                      <span className="truncate flex-1">{folder}</span>
                      <span className="text-xs opacity-70 ml-1">{folderCounts[folder] || 0}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderToDelete(folder);
                        }}
                        className="ml-1 p-1 opacity-0 group-hover:opacity-100 hover:text-red-400"
                        title="Delete folder"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </button>
                  )}
                </div>
              ))}

              {/* New folder input */}
              {showNewFolderInput ? (
                <div className="px-2 py-1">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateFolder();
                      if (e.key === 'Escape') {
                        setShowNewFolderInput(false);
                        setNewFolderName('');
                      }
                    }}
                    placeholder="Folder name..."
                    className="w-full px-2 py-1 text-sm bg-gray-800 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    autoFocus
                  />
                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={() => {
                        setShowNewFolderInput(false);
                        setNewFolderName('');
                      }}
                      className="flex-1 px-2 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateFolder}
                      disabled={!newFolderName.trim()}
                      className="flex-1 px-2 py-1 text-xs bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Create
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewFolderInput(true)}
                  className="w-full text-left px-3 py-2 rounded text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                >
                  + New Folder
                </button>
              )}
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search and Sort */}
            <div className="p-4 border-b border-gray-700 space-y-3">
              <div className="flex gap-3">
                {/* Search */}
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search puzzles..."
                    className="w-full px-4 py-2 pl-10 bg-gray-800 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    autoFocus
                  />
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="px-3 py-2 bg-gray-800 rounded border border-gray-600 text-sm"
                >
                  <option value="date_newest">Newest First</option>
                  <option value="date_oldest">Oldest First</option>
                  <option value="name">Name (A-Z)</option>
                  <option value="size">Size (Largest)</option>
                </select>
              </div>

              {/* Stats */}
              <div className="flex items-center justify-between text-sm text-gray-400">
                <span>{getFolderDisplayName()}</span>
                <span>
                  {filteredPuzzles.length === puzzles.length
                    ? `${puzzles.length} puzzle${puzzles.length !== 1 ? 's' : ''}`
                    : `${filteredPuzzles.length} of ${puzzles.length} puzzles`
                  }
                </span>
              </div>
            </div>

            {/* Puzzle List */}
            <div className="flex-1 overflow-y-auto p-4">
              {puzzles.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p className="text-lg font-medium">No saved puzzles yet</p>
                  <p className="text-sm mt-1">Save your first puzzle to see it here</p>
                </div>
              ) : filteredPuzzles.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-lg font-medium">No puzzles match your search</p>
                  <p className="text-sm mt-1">Try a different search term or folder</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPuzzles.map((puzzle) => (
                    <div
                      key={puzzle.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        puzzle.id === currentPuzzleId
                          ? 'bg-blue-900/30 border-blue-600'
                          : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      {confirmDelete === puzzle.id ? (
                        // Delete confirmation
                        <div className="flex items-center justify-between">
                          <span className="text-red-400">Delete "{puzzle.name}"?</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="px-3 py-1 text-sm bg-gray-600 rounded hover:bg-gray-500"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleConfirmDelete(puzzle.id)}
                              className="px-3 py-1 text-sm bg-red-600 rounded hover:bg-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ) : movingPuzzle === puzzle.id ? (
                        // Move to folder UI
                        <div>
                          <p className="text-sm text-gray-400 mb-2">Move "{puzzle.name}" to:</p>
                          <div className="flex flex-wrap gap-1">
                            <button
                              onClick={() => handleMovePuzzle(puzzle.id, undefined)}
                              className={`px-2 py-1 text-xs rounded ${
                                !puzzle.folder ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                              }`}
                            >
                              Unfiled
                            </button>
                            {folders.map(f => (
                              <button
                                key={f}
                                onClick={() => handleMovePuzzle(puzzle.id, f)}
                                className={`px-2 py-1 text-xs rounded ${
                                  puzzle.folder === f ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                                }`}
                              >
                                {f}
                              </button>
                            ))}
                            <button
                              onClick={() => setMovingPuzzle(null)}
                              className="px-2 py-1 text-xs bg-gray-600 rounded hover:bg-gray-500"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Normal puzzle display
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold truncate">{puzzle.name}</h3>
                              {puzzle.id === currentPuzzleId && (
                                <span className="px-1.5 py-0.5 text-xs bg-blue-600 rounded">Current</span>
                              )}
                              {puzzle.folder && (
                                <span className="px-1.5 py-0.5 text-xs bg-gray-700 rounded text-gray-400">
                                  {puzzle.folder}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                              <span>{puzzle.width}x{puzzle.height}</span>
                              <span>{puzzle.enemies.length} enem{puzzle.enemies.length === 1 ? 'y' : 'ies'}</span>
                              <span className="text-xs">{formatDate(puzzle.savedAt)}</span>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => setMovingPuzzle(puzzle.id)}
                              className="px-2 py-1.5 text-sm bg-gray-700 rounded hover:bg-gray-600 text-gray-400 hover:text-white"
                              title="Move to folder"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleLoad(puzzle.id)}
                              className="px-4 py-1.5 text-sm bg-blue-600 rounded hover:bg-blue-700 font-medium"
                            >
                              Load
                            </button>
                            <button
                              onClick={() => handleDeleteClick(puzzle.id)}
                              className="px-2 py-1.5 text-sm bg-gray-700 rounded hover:bg-red-600 text-gray-400 hover:text-white"
                              title="Delete puzzle"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
