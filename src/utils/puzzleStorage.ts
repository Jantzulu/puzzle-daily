import type { Puzzle } from '../types/game';
import { safeLocalStorageSet } from './assetStorage';

const STORAGE_KEY = 'saved_puzzles';
const PENDING_PUZZLE_DELETIONS_KEY = 'pending_puzzle_deletions';

// ============ PENDING DELETIONS TRACKING ============
// Tracks puzzles deleted locally so they can be synced to cloud on next push

export interface PendingPuzzleDeletion {
  id: string;
  deletedAt: string;
}

export const getPendingPuzzleDeletions = (): PendingPuzzleDeletion[] => {
  const stored = localStorage.getItem(PENDING_PUZZLE_DELETIONS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    return [];
  }
};

export const addPendingPuzzleDeletion = (id: string): void => {
  const deletions = getPendingPuzzleDeletions();
  // Don't add duplicates
  if (!deletions.some(d => d.id === id)) {
    deletions.push({ id, deletedAt: new Date().toISOString() });
    localStorage.setItem(PENDING_PUZZLE_DELETIONS_KEY, JSON.stringify(deletions));
  }
};

export const clearPendingPuzzleDeletions = (): void => {
  localStorage.removeItem(PENDING_PUZZLE_DELETIONS_KEY);
};

export const removePendingPuzzleDeletion = (id: string): void => {
  const deletions = getPendingPuzzleDeletions().filter(d => d.id !== id);
  localStorage.setItem(PENDING_PUZZLE_DELETIONS_KEY, JSON.stringify(deletions));
};

export interface SavedPuzzle extends Puzzle {
  savedAt: string;
  folder?: string; // Optional folder for organization
}

// ============ PUZZLE FOLDERS ============

const PUZZLE_FOLDERS_KEY = 'puzzle_folders';

export const getPuzzleFolders = (): string[] => {
  const stored = localStorage.getItem(PUZZLE_FOLDERS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    return [];
  }
};

export const addPuzzleFolder = (folderName: string): boolean => {
  const folders = getPuzzleFolders();
  const normalizedName = folderName.trim();
  if (!normalizedName || folders.includes(normalizedName)) {
    return false;
  }
  folders.push(normalizedName);
  folders.sort((a, b) => a.localeCompare(b));
  localStorage.setItem(PUZZLE_FOLDERS_KEY, JSON.stringify(folders));
  return true;
};

export const deletePuzzleFolder = (folderName: string): void => {
  const folders = getPuzzleFolders().filter(f => f !== folderName);
  localStorage.setItem(PUZZLE_FOLDERS_KEY, JSON.stringify(folders));

  // Also remove folder from all puzzles that were in it
  const puzzles = getSavedPuzzles();
  const updated = puzzles.map(p =>
    p.folder === folderName ? { ...p, folder: undefined } : p
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

export const renamePuzzleFolder = (oldName: string, newName: string): boolean => {
  const normalizedNew = newName.trim();
  if (!normalizedNew) return false;

  const folders = getPuzzleFolders();
  const index = folders.indexOf(oldName);
  if (index === -1 || folders.includes(normalizedNew)) return false;

  folders[index] = normalizedNew;
  folders.sort((a, b) => a.localeCompare(b));
  localStorage.setItem(PUZZLE_FOLDERS_KEY, JSON.stringify(folders));

  // Update all puzzles that were in the old folder
  const puzzles = getSavedPuzzles();
  const updated = puzzles.map(p =>
    p.folder === oldName ? { ...p, folder: normalizedNew } : p
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return true;
};

export const setPuzzleFolder = (puzzleId: string, folder: string | undefined): boolean => {
  const puzzles = getSavedPuzzles();
  const index = puzzles.findIndex(p => p.id === puzzleId);
  if (index === -1) return false;

  puzzles[index] = { ...puzzles[index], folder };
  return safeLocalStorageSet(STORAGE_KEY, JSON.stringify(puzzles));
};

export const savePuzzle = (puzzle: Puzzle): boolean => {
  // Validate puzzle has required fields
  if (!puzzle.id) {
    console.error('[PuzzleStorage] Cannot save puzzle without ID:', puzzle.name);
    alert('Cannot save puzzle: Missing ID');
    return false;
  }

  const puzzles = getSavedPuzzles();
  const savedPuzzle: SavedPuzzle = {
    ...puzzle,
    savedAt: new Date().toISOString(),
  };

  // Update existing or add new
  const existingIndex = puzzles.findIndex(p => p.id === puzzle.id);
  if (existingIndex >= 0) {
    puzzles[existingIndex] = savedPuzzle;
  } else {
    puzzles.push(savedPuzzle);
  }

  const success = safeLocalStorageSet(STORAGE_KEY, JSON.stringify(puzzles));
  if (success) {
    console.log(`[PuzzleStorage] Saved puzzle: ${puzzle.id} (${puzzle.name})`);
  }
  return success;
};

export const getSavedPuzzles = (): SavedPuzzle[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to parse saved puzzles:', e);
    return [];
  }
};

export const deletePuzzle = (puzzleId: string): void => {
  const puzzles = getSavedPuzzles();
  const filtered = puzzles.filter(p => p.id !== puzzleId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));

  // Track deletion for cloud sync
  addPendingPuzzleDeletion(puzzleId);
};

export const loadPuzzle = (puzzleId: string): SavedPuzzle | null => {
  const puzzles = getSavedPuzzles();
  return puzzles.find(p => p.id === puzzleId) || null;
};
