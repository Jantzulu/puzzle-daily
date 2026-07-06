import type { PlacedCharacter, Direction } from '../types/game';

/**
 * Crash recovery for the player daily (sibling of dailyState.ts, which owns
 * lives + outcome lock). Mobile browsers kill background tabs freely — this
 * persists the setup placements so a reload comes back with the loadout
 * intact. Mid-RUN state is deliberately not saved: the simulation is
 * deterministic from placements, so restoring to setup with the same
 * loadout loses nothing, and lives already persist via dailyState.
 *
 * Keyed by puzzle date + id; a mismatch on either means stale — start fresh.
 */

const KEY = 'daily_setup_recovery_v1';

export interface SavedSetup {
  puzzleDate: string;
  puzzleId: string;
  placements: PlacedCharacter[];
  spellDirectionOverrides: Record<string, Record<string, Direction>>;
}

export function saveSetupState(state: SavedSetup): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable — recovery just won't survive this session.
  }
}

export function loadSetupState(puzzleDate: string, puzzleId: string): SavedSetup | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSetup;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.puzzleDate !== puzzleDate || parsed.puzzleId !== puzzleId) return null;
    if (!Array.isArray(parsed.placements) || parsed.placements.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSetupState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ditto
  }
}
