/**
 * Pixel Editor Auto-Save with Recovery
 *
 * Periodically saves the pixel editor state to localStorage so work isn't lost
 * on accidental page close, browser crash, or navigation away.
 */
import { safeLocalStorageSet } from './assetStorage';

const AUTOSAVE_KEY = 'pixel_editor_autosave';
const AUTOSAVE_INTERVAL_MS = 30_000; // 30 seconds

export interface PixelAutoSaveData {
  projectJson: string;
  projectName: string;
  currentPngPath: string | null;
  currentProjectPath: string | null;
  currentProjectUrl: string | null;
  savedAt: string;
}

/** Save the current pixel editor state to the auto-save slot */
export function writePixelAutoSave(data: PixelAutoSaveData): boolean {
  return safeLocalStorageSet(AUTOSAVE_KEY, JSON.stringify(data));
}

/** Read the auto-save slot (returns null if empty or corrupt) */
export function readPixelAutoSave(): PixelAutoSaveData | null {
  const stored = localStorage.getItem(AUTOSAVE_KEY);
  if (!stored) return null;
  try {
    const data = JSON.parse(stored) as PixelAutoSaveData;
    if (!data.projectJson || !data.savedAt) return null;
    return data;
  } catch {
    return null;
  }
}

/** Clear the auto-save slot */
export function clearPixelAutoSave(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
}

export { AUTOSAVE_INTERVAL_MS };
