import { describe, it, expect } from 'vitest';
import { isPlacedObjectVisible } from '../objectSchedule';
import type { PlacedObject } from '../../types/game';

const obj = (fields: Partial<PlacedObject> = {}): PlacedObject => ({
  objectId: 'test-object',
  x: 2,
  y: 2,
  ...fields,
});

describe('isPlacedObjectVisible (object spawn levers)', () => {
  it('default placement (no schedule fields) is always visible, including setup', () => {
    for (const turn of [0, 1, 5, 100]) {
      expect(isPlacedObjectVisible(obj(), turn)).toBe(true);
    }
  });

  it('spawnTurn hides the object until that turn dawns', () => {
    const o = obj({ spawnTurn: 3 });
    expect(isPlacedObjectVisible(o, 0)).toBe(false);
    expect(isPlacedObjectVisible(o, 2)).toBe(false);
    expect(isPlacedObjectVisible(o, 3)).toBe(true);
    expect(isPlacedObjectVisible(o, 99)).toBe(true);
  });

  it('despawnTurn alone shows from setup and is exclusive at the dawn', () => {
    const o = obj({ despawnTurn: 5 });
    expect(isPlacedObjectVisible(o, 0)).toBe(true);
    expect(isPlacedObjectVisible(o, 4)).toBe(true);
    expect(isPlacedObjectVisible(o, 5)).toBe(false);
    expect(isPlacedObjectVisible(o, 6)).toBe(false);
  });

  it('spawn + despawn bound a single visibility window', () => {
    const o = obj({ spawnTurn: 3, despawnTurn: 5 });
    expect(isPlacedObjectVisible(o, 2)).toBe(false);
    expect(isPlacedObjectVisible(o, 3)).toBe(true);
    expect(isPlacedObjectVisible(o, 4)).toBe(true);
    expect(isPlacedObjectVisible(o, 5)).toBe(false);
  });

  it('repeatEvery repeats the window on its cadence', () => {
    // Visible turns 3-4, hidden 5-6, visible 7-8, hidden 9-10, ...
    const o = obj({ spawnTurn: 3, despawnTurn: 5, repeatEvery: 4 });
    const expected: Array<[number, boolean]> = [
      [2, false], [3, true], [4, true], [5, false], [6, false],
      [7, true], [8, true], [9, false], [10, false], [11, true],
    ];
    for (const [turn, visible] of expected) {
      expect(isPlacedObjectVisible(o, turn), `turn ${turn}`).toBe(visible);
    }
  });

  it('repeatEvery without a despawnTurn is ignored (visible from spawn on)', () => {
    const o = obj({ spawnTurn: 2, repeatEvery: 3 });
    expect(isPlacedObjectVisible(o, 1)).toBe(false);
    for (const turn of [2, 3, 4, 5, 6, 20]) {
      expect(isPlacedObjectVisible(o, turn), `turn ${turn}`).toBe(true);
    }
  });

  it('a window at least as long as the cadence is always visible after spawn', () => {
    const o = obj({ spawnTurn: 1, despawnTurn: 5, repeatEvery: 2 });
    expect(isPlacedObjectVisible(o, 0)).toBe(false);
    for (const turn of [1, 2, 3, 4, 5, 6, 50]) {
      expect(isPlacedObjectVisible(o, turn), `turn ${turn}`).toBe(true);
    }
  });

  it('a despawnTurn at or before spawnTurn fails visible (treated as unset)', () => {
    const o = obj({ spawnTurn: 4, despawnTurn: 4 });
    expect(isPlacedObjectVisible(o, 3)).toBe(false);
    expect(isPlacedObjectVisible(o, 4)).toBe(true);
    expect(isPlacedObjectVisible(o, 10)).toBe(true);
  });
});
