/**
 * Editor State Management
 *
 * Provides in-memory persistence for the Map Editor state across tab switches.
 * State is NOT persisted to localStorage - it resets on page refresh.
 * Only "Clear Grid" or page refresh will clear the state.
 */

import type { TileOrNull, PlacedEnemy, PlacedCollectible, PlacedObject, WinCondition, BorderConfig } from '../types/game';

export interface EditorPuzzleState {
  gridWidth: number;
  gridHeight: number;
  tiles: TileOrNull[][];
  enemies: PlacedEnemy[];
  collectibles: PlacedCollectible[];
  placedObjects: PlacedObject[];

  // Metadata
  puzzleName: string;
  puzzleId: string;
  maxCharacters: number;
  maxTurns?: number;
  availableCharacters: string[];
  winConditions: WinCondition[];
  borderConfig?: BorderConfig;
  skinId?: string;

  // Editor state
  selectedTool: string;
}

// In-memory storage for editor state
let cachedEditorState: EditorPuzzleState | null = null;

/**
 * Save the current editor state to memory
 */
export function cacheEditorState(state: EditorPuzzleState): void {
  cachedEditorState = JSON.parse(JSON.stringify(state)); // Deep clone
}

/**
 * Get the cached editor state (returns null if none exists)
 */
export function getCachedEditorState(): EditorPuzzleState | null {
  return cachedEditorState ? JSON.parse(JSON.stringify(cachedEditorState)) : null;
}

/**
 * Clear the cached editor state (called on "Clear Grid" or explicit reset)
 */
export function clearCachedEditorState(): void {
  cachedEditorState = null;
}

/**
 * Check if there's a cached state available
 */
export function hasCachedEditorState(): boolean {
  return cachedEditorState !== null;
}
