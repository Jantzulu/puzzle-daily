/**
 * Auto-Save with Recovery
 *
 * Periodically saves the editor state to localStorage so work isn't lost
 * on accidental page close, browser crash, or navigation away.
 * On next editor load, detects unsaved work and prompts for recovery.
 */
import type { Puzzle } from '../types/game';
import { safeLocalStorageSet } from './assetStorage';

const AUTOSAVE_KEY = 'editor_autosave';
const AUTOSAVE_INTERVAL_MS = 30_000; // 30 seconds

export interface AutoSaveData {
  puzzle: Puzzle;
  puzzleId: string;
  puzzleName: string;
  savedAt: string;
}

/** Save the current editor puzzle to the auto-save slot */
export function writeAutoSave(puzzle: Puzzle): boolean {
  const data: AutoSaveData = {
    puzzle,
    puzzleId: puzzle.id,
    puzzleName: puzzle.name,
    savedAt: new Date().toISOString(),
  };
  return safeLocalStorageSet(AUTOSAVE_KEY, JSON.stringify(data));
}

/** Read the auto-save slot (returns null if empty or corrupt) */
export function readAutoSave(): AutoSaveData | null {
  const stored = localStorage.getItem(AUTOSAVE_KEY);
  if (!stored) return null;
  try {
    const data = JSON.parse(stored) as AutoSaveData;
    // Basic validation
    if (!data.puzzle || !data.puzzleId || !data.savedAt) return null;
    return data;
  } catch {
    return null;
  }
}

/** Clear the auto-save slot (called on manual save, new puzzle, or recovery dismiss) */
export function clearAutoSave(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
}

/** Check if an auto-save exists that is newer than the corresponding manual save */
export function hasRecoverableAutoSave(manualSavedAt?: string): AutoSaveData | null {
  const autoSave = readAutoSave();
  if (!autoSave) return null;

  // If there's no manual save timestamp, the auto-save is always recoverable
  if (!manualSavedAt) return autoSave;

  // Compare timestamps — auto-save must be newer than the manual save
  const autoTime = new Date(autoSave.savedAt).getTime();
  const manualTime = new Date(manualSavedAt).getTime();

  return autoTime > manualTime ? autoSave : null;
}

export { AUTOSAVE_INTERVAL_MS };
