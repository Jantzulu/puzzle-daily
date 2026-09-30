/**
 * The board's index-keyed render records across retries / resets / replay
 * step-backs (boardIndexPrune.ts). User report 2026-09-30: on every run
 * after the first, a scheduled visitor no longer walked in — its copy lands
 * at the same array index each run, and run 1's finished walk-in entry
 * suppressed the new one.
 */
import { describe, it, expect } from 'vitest';
import { staleMidGameWalkIns, indicesBeyond, type MidGameWalkEntry } from '../../components/game/boardIndexPrune';

const entries = (e: Record<number, MidGameWalkEntry>) => new Map(Object.entries(e).map(([k, v]) => [Number(k), v]));
const enemies = (n: number, spawned: Record<number, number> = {}) =>
  Array.from({ length: n }, (_, i) => (spawned[i] !== undefined ? { spawnedOnTurn: spawned[i] } : {}));

describe('staleMidGameWalkIns', () => {
  it('a retry (setup state, array back to the placements) drops the visitor walk', () => {
    expect(staleMidGameWalkIns(entries({ 6: { midGame: true, spawnTurn: 2 } }), enemies(6), 0)).toEqual([6]);
  });

  it('the same visitor, still on the board, keeps its walk (a walk can outlast its turn)', () => {
    expect(staleMidGameWalkIns(entries({ 6: { midGame: true, spawnTurn: 2 } }), enemies(7, { 6: 2 }), 3)).toEqual([]);
  });

  it('a different entity now at that index (summon / raise) drops the walk', () => {
    expect(staleMidGameWalkIns(entries({ 6: { midGame: true, spawnTurn: 2 } }), enemies(7, { 6: 1 }), 3)).toEqual([6]);
  });

  it('a replay step-back to before the spawn turn drops the walk', () => {
    expect(staleMidGameWalkIns(entries({ 6: { midGame: true, spawnTurn: 2 } }), enemies(7, { 6: 2 }), 1)).toEqual([6]);
  });

  it('a later update on the spawn turn itself does not restart the walk', () => {
    expect(staleMidGameWalkIns(entries({ 6: { midGame: true, spawnTurn: 2 } }), enemies(7, { 6: 2 }), 2)).toEqual([]);
  });

  it('pre-game entrance walks are never touched', () => {
    expect(staleMidGameWalkIns(entries({ 1: {}, 9: {} }), enemies(3), 0)).toEqual([]);
  });
});

describe('indicesBeyond', () => {
  it('returns only the keys the current array no longer has', () => {
    expect(indicesBeyond([0, 3, 6, 7], 6)).toEqual([6, 7]);
    expect(indicesBeyond([0, 5], 6)).toEqual([]);
  });
});
