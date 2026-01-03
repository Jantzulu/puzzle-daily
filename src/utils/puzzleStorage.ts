import type { Puzzle } from '../types/game';

const STORAGE_KEY = 'saved_puzzles';

export interface SavedPuzzle extends Puzzle {
  savedAt: string;
}

export const savePuzzle = (puzzle: Puzzle): void => {
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

  localStorage.setItem(STORAGE_KEY, JSON.stringify(puzzles));
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
};

export const loadPuzzle = (puzzleId: string): SavedPuzzle | null => {
  const puzzles = getSavedPuzzles();
  return puzzles.find(p => p.id === puzzleId) || null;
};
