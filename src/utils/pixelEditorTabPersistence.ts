/**
 * Multi-tab localStorage persistence for the pixel editor.
 * Saves all open tabs so they restore on page refresh.
 */

import type { PersistedTabsData } from '../types/pixelEditorDocument';
import { safeLocalStorageSet } from './assetStorage';

const TABS_STORAGE_KEY = 'pixel_editor_tabs';

export function writeTabsPersistence(data: PersistedTabsData): boolean {
  return safeLocalStorageSet(TABS_STORAGE_KEY, JSON.stringify(data));
}

export function readTabsPersistence(): PersistedTabsData | null {
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version === 1 && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
      return parsed as PersistedTabsData;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearTabsPersistence(): void {
  try { localStorage.removeItem(TABS_STORAGE_KEY); } catch { /* ignore */ }
}
