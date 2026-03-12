/**
 * Pixel Editor State Management
 *
 * Provides in-memory persistence for the Pixel Editor state across tab switches
 * and as a fallback when the editor ref is unavailable during unmount.
 * State is NOT persisted to localStorage - it resets on page refresh.
 */

export interface CachedPixelEditorState {
  projectJson: string;
  projectName: string;
  dirty: boolean;
  currentPngPath: string | null;
  currentProjectPath: string | null;
  currentProjectUrl: string | null;
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  activeFrameIndex: number;
  activeLayerIndex: number;
  customColors: string[];
}

let cachedState: CachedPixelEditorState | null = null;

export function cachePixelEditorState(state: CachedPixelEditorState): void {
  cachedState = { ...state };
}

export function getCachedPixelEditorState(): CachedPixelEditorState | null {
  return cachedState ? { ...cachedState } : null;
}

export function clearCachedPixelEditorState(): void {
  cachedState = null;
}

export function hasCachedPixelEditorState(): boolean {
  return cachedState !== null;
}
