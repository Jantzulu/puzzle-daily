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

  it('markPushCompleted clears dirty flags for ids whose local change is at/before pushStartTime', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T10:00:00.000Z'));
    trackLocalChange('pushed-1');
    vi.setSystemTime(new Date('2026-04-16T10:00:01.000Z'));
    trackLocalChange('pushed-2');
    vi.setSystemTime(new Date('2026-04-16T10:00:02.000Z'));
    trackLocalChange('not-pushed');

    // Push kicks off AFTER all three edits land.
    const pushStartTime = '2026-04-16T10:00:03.000Z';
    markPushCompleted(['pushed-1', 'pushed-2'], pushStartTime);

    expect(hasLocalChanges('pushed-1')).toBe(false);
    expect(hasLocalChanges('pushed-2')).toBe(false);
    // Critical: an id that wasn't in the push list must stay dirty.
    expect(hasLocalChanges('not-pushed')).toBe(true);
    vi.useRealTimers();
  });

  /**
   * Regression test for the push/edit race.
   *
   * If the user edits an asset BETWEEN push-start (when the id list was
   * gathered) and push-end, the dirty flag must stay set — the post-start
   * edit has not been uploaded yet, and clearing the flag would let a
   * subsequent pull silently overwrite it.
   *
   * markPushCompleted guards against this by comparing each asset's local
   * change timestamp to pushStartTime. Only ids whose most recent edit is
   * at or before pushStartTime have their flag cleared.
   */
  it('markPushCompleted preserves dirty flag for assets edited during the push', () => {
    vi.useFakeTimers();

    // T1 — user edits asset.
    vi.setSystemTime(new Date('2026-04-16T10:00:00.000Z'));
    trackLocalChange('x');
    expect(getLocallyChangedIds().has('x')).toBe(true);

    // T2 — push starts, captures its cutoff and gathers ['x'] to send.
    vi.setSystemTime(new Date('2026-04-16T10:00:01.000Z'));
    const pushStartTime = new Date().toISOString();
    const idsBeingPushed = ['x'];

    // T3 — while push is in flight, user edits 'x' again.
    vi.setSystemTime(new Date('2026-04-16T10:00:02.000Z'));
    trackLocalChange('x');

    // T4 — push completes.
    vi.setSystemTime(new Date('2026-04-16T10:00:03.000Z'));
    markPushCompleted(idsBeingPushed, pushStartTime);

    // The second edit (T3) is newer than pushStartTime (T2), so the flag
    // must remain set so the next push picks it up and the next pull does
    // not overwrite it.
    expect(hasLocalChanges('x')).toBe(true);
    vi.useRealTimers();
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
