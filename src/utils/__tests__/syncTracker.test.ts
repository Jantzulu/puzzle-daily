/**
 * Sync tracker unit tests.
 *
 * Focus: the state machine that cloudSync.ts orchestrates. The known race
 * condition — local edit during an in-flight push causes the push-completion
 * to clear a flag that's actually still dirty — lives here, not in cloudSync
 * itself. Testing the tracker directly is higher ROI than mocking the 20+
 * services that cloudSync imports.
 *
 * Full cloudSync orchestration coverage (push/pull happy paths, conflict
 * handling against mocked supabaseService) is a separate, larger scaffolding
 * effort. See docs/projectile-refactor-plan.md-style planning for that.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  trackLocalChange,
  trackCloudTimestamp,
  hasLocalChanges,
  getLocallyChangedIds,
  detectConflicts,
  markPushCompleted,
  resolveConflictKeepLocal,
  resolveConflictAcceptCloud,
  clearSyncState,
} from '../syncTracker';

// Minimal in-memory localStorage shim. Vitest's node env has no window.
function installLocalStorageMock() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
  vi.stubGlobal('localStorage', mock);
  return store;
}

describe('syncTracker', () => {
  beforeEach(() => {
    installLocalStorageMock();
    clearSyncState();
  });

  it('tracks a local change and surfaces it via getLocallyChangedIds', () => {
    trackLocalChange('tile-001');
    trackLocalChange('enemy-002');

    const ids = getLocallyChangedIds();
    expect(ids.has('tile-001')).toBe(true);
    expect(ids.has('enemy-002')).toBe(true);
    expect(hasLocalChanges('tile-001')).toBe(true);
    expect(hasLocalChanges('never-touched')).toBe(false);
  });

  it('detectConflicts reports only assets changed both locally and in cloud since last sync', () => {
    // Local edits on three assets.
    trackLocalChange('a');
    trackLocalChange('b');
    trackLocalChange('c');

    // We last saw cloud versions at these times.
    trackCloudTimestamp('a', '2026-04-01T00:00:00.000Z');
    trackCloudTimestamp('b', '2026-04-01T00:00:00.000Z');
    trackCloudTimestamp('c', '2026-04-01T00:00:00.000Z');

    const conflicts = detectConflicts([
      // 'a' is newer on cloud than what we saw — conflict
      { id: 'a', name: 'Alpha', type: 'tile', updated_at: '2026-04-10T00:00:00.000Z' },
      // 'b' hasn't changed on cloud — no conflict
      { id: 'b', name: 'Beta', type: 'tile', updated_at: '2026-04-01T00:00:00.000Z' },
      // 'd' is new on cloud and we have no local change — no conflict
      { id: 'd', name: 'Delta', type: 'tile', updated_at: '2026-04-10T00:00:00.000Z' },
    ]);

    expect(conflicts.map(c => c.id)).toEqual(['a']);
    expect(conflicts[0].cloudUpdatedAt).toBe('2026-04-10T00:00:00.000Z');
  });

  it('markPushCompleted clears only the explicitly pushed ids', () => {
    trackLocalChange('pushed-1');
    trackLocalChange('pushed-2');
    trackLocalChange('not-pushed');

    markPushCompleted(['pushed-1', 'pushed-2']);

    expect(hasLocalChanges('pushed-1')).toBe(false);
    expect(hasLocalChanges('pushed-2')).toBe(false);
    // Critical: an id that wasn't in the push list must stay dirty.
    expect(hasLocalChanges('not-pushed')).toBe(true);
  });

  /**
   * Known issue: markPushCompleted does not guard against edits that happen
   * BETWEEN push-start (when the id list was gathered) and push-end. If the
   * user edits the same asset during the push, the completion clears the
   * dirty flag even though the tracker's current timestamp reflects an edit
   * newer than what the server received. The next pull will then silently
   * overwrite the post-push edit.
   *
   * This test documents the current (buggy) behavior. When the race is
   * fixed — likely by comparing `localChanges[id]` timestamp against a
   * push-start cutoff — flip the assertion to `.toBe(true)`.
   */
  it('DOCUMENTS BUG: concurrent edit during push is silently cleared', () => {
    // User edits asset at T0.
    trackLocalChange('x');
    const firstChange = getLocallyChangedIds();
    expect(firstChange.has('x')).toBe(true);

    // Push starts, gathers ['x'] to send.
    const idsBeingPushed = ['x'];

    // While push is in flight, user edits 'x' again.
    // (In production this happens because push is async.)
    trackLocalChange('x');

    // Push completes.
    markPushCompleted(idsBeingPushed);

    // Current (buggy) behavior: the second edit is forgotten. The next pull
    // will see cloud X (which is the PRE-second-edit version the server has)
    // and silently clobber local.
    expect(hasLocalChanges('x')).toBe(false); // ← flip to `true` when fixed.
  });

  it('resolveConflictKeepLocal updates known cloud timestamp so it stops firing', () => {
    trackLocalChange('z');
    trackCloudTimestamp('z', '2026-04-01T00:00:00.000Z');

    const newerCloud = '2026-04-05T00:00:00.000Z';
    const first = detectConflicts([
      { id: 'z', name: 'Zeta', type: 'tile', updated_at: newerCloud },
    ]);
    expect(first).toHaveLength(1);

    resolveConflictKeepLocal('z', newerCloud);

    const second = detectConflicts([
      { id: 'z', name: 'Zeta', type: 'tile', updated_at: newerCloud },
    ]);
    expect(second).toHaveLength(0);

    // And the local-change flag must stay set — we kept local, so it's still
    // pending a push.
    expect(hasLocalChanges('z')).toBe(true);
  });

  it('resolveConflictAcceptCloud clears the local-change flag', () => {
    trackLocalChange('y');
    expect(hasLocalChanges('y')).toBe(true);

    resolveConflictAcceptCloud('y');

    expect(hasLocalChanges('y')).toBe(false);
  });
});
