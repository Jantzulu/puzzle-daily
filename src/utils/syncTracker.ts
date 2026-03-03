/**
 * Sync Tracker - Per-asset sync state tracking via localStorage
 *
 * Tracks local modifications and cloud timestamps to enable:
 * - Incremental push (only changed assets)
 * - Incremental pull (only newer cloud assets)
 * - Conflict detection (both local and cloud changed)
 */

const SYNC_STATE_KEY = 'cloud_sync_state';

interface SyncState {
  lastPushTime: string | null;
  lastPullTime: string | null;
  /** Assets modified locally since last push. Maps id -> local modification ISO timestamp */
  localChanges: Record<string, string>;
  /** Last known cloud updated_at per asset. Maps id -> cloud ISO timestamp */
  cloudTimestamps: Record<string, string>;
}

export interface SyncConflict {
  id: string;
  name: string;
  type: string;
  localModifiedAt: string;
  cloudUpdatedAt: string;
}

function loadState(): SyncState {
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { lastPushTime: null, lastPullTime: null, localChanges: {}, cloudTimestamps: {} };
}

function saveState(state: SyncState): void {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[SyncTracker] Failed to save state:', e);
  }
}

/**
 * Record that an asset was modified locally
 */
export function trackLocalChange(id: string): void {
  const state = loadState();
  state.localChanges[id] = new Date().toISOString();
  saveState(state);
}

/**
 * Record the cloud timestamp for an asset (after push or pull)
 */
export function trackCloudTimestamp(id: string, cloudUpdatedAt: string): void {
  const state = loadState();
  state.cloudTimestamps[id] = cloudUpdatedAt;
  saveState(state);
}

/**
 * Check if an asset has local changes that haven't been pushed
 */
export function hasLocalChanges(id: string): boolean {
  const state = loadState();
  return !!state.localChanges[id];
}

/**
 * Get all asset IDs with local changes since last push
 */
export function getLocallyChangedIds(): Set<string> {
  const state = loadState();
  return new Set(Object.keys(state.localChanges));
}

/**
 * Get the last push timestamp (for filtering what to push)
 */
export function getLastPushTime(): string | null {
  return loadState().lastPushTime;
}

/**
 * Get the last pull timestamp (for incremental pull)
 */
export function getLastPullTime(): string | null {
  return loadState().lastPullTime;
}

/**
 * Detect conflicts: assets that were both modified locally and updated in cloud
 * since our last sync
 */
export function detectConflicts(
  cloudAssets: Array<{ id: string; name: string; type: string; updated_at: string }>
): SyncConflict[] {
  const state = loadState();
  const conflicts: SyncConflict[] = [];

  for (const cloud of cloudAssets) {
    const localChange = state.localChanges[cloud.id];
    const knownCloudTime = state.cloudTimestamps[cloud.id];

    // Conflict = we changed it locally AND cloud has a newer version than what we last saw
    if (localChange && knownCloudTime && cloud.updated_at > knownCloudTime) {
      conflicts.push({
        id: cloud.id,
        name: cloud.name,
        type: cloud.type,
        localModifiedAt: localChange,
        cloudUpdatedAt: cloud.updated_at,
      });
    }
  }

  return conflicts;
}

/**
 * Mark push as completed - clear local changes for pushed IDs and record time
 */
export function markPushCompleted(pushedIds: string[]): void {
  const state = loadState();
  for (const id of pushedIds) {
    delete state.localChanges[id];
  }
  state.lastPushTime = new Date().toISOString();
  saveState(state);
}

/**
 * Mark pull as completed - record time
 */
export function markPullCompleted(): void {
  const state = loadState();
  state.lastPullTime = new Date().toISOString();
  saveState(state);
}

/**
 * Resolve a conflict by keeping local version (skip this asset during pull)
 */
export function resolveConflictKeepLocal(id: string, cloudUpdatedAt: string): void {
  const state = loadState();
  // Update our known cloud timestamp so we don't flag this again
  state.cloudTimestamps[id] = cloudUpdatedAt;
  saveState(state);
}

/**
 * Resolve a conflict by accepting cloud version (clear local change)
 */
export function resolveConflictAcceptCloud(id: string): void {
  const state = loadState();
  delete state.localChanges[id];
  saveState(state);
}

/**
 * Clear all sync tracking state (useful after cache clear)
 */
export function clearSyncState(): void {
  localStorage.removeItem(SYNC_STATE_KEY);
}
