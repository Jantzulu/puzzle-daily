import { describe, expect, it } from 'vitest';
import { BUILT_IN_SOUNDS } from '../../../../utils/synth/builtIn';
import { soundLength, type SynthSound } from '../../../../utils/synth/types';
import { LAYER_STARTERS, SOUND_STARTERS, envelopePoints, layerFromStarter, noteName, nudgeLayer } from '../forgeModel';
import { builtInKey, forgeReducer, initialForgeState, isUnsaved, keyAssetId, keyBuiltInId, mineKey, savedFor, type ForgeState } from '../forgeState';

// The audio itself cannot be rendered here (no Web Audio outside a browser;
// the six built-in sounds were compared sample by sample against the
// recipes they replaced, in the browser, when they were moved to data).
// These pin the parts that are plain logic.

const withLevel = (sound: SynthSound, level: number): SynthSound => ({ ...sound, level });

describe('built-in page sounds', () => {
  it('are well-formed: unique ids, layers with a length and a level', () => {
    const ids = BUILT_IN_SOUNDS.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BUILT_IN_SOUNDS) {
      expect(b.sound.layers.length).toBeGreaterThan(0);
      const layerIds = b.sound.layers.map(l => l.id);
      expect(new Set(layerIds).size).toBe(layerIds.length);
      for (const l of b.sound.layers) {
        expect(l.length).toBeGreaterThan(0);
        expect(l.level).toBeGreaterThan(0);
        expect(l.attack).toBeLessThanOrEqual(l.length);
        expect(l.floor).toBeGreaterThan(0);
      }
    }
  });

  it('match the lengths of the animations they ride', () => {
    const length = (id: string) => soundLength(BUILT_IN_SOUNDS.find(b => b.id === id)!.sound);
    expect(length('scroll-roll')).toBeCloseTo(0.5, 6); // index.css .quest-closing
    expect(length('scroll-unroll')).toBeCloseTo(0.65, 6); // the unfurl
  });
});

describe('forge editing state', () => {
  const key = builtInKey('torch-out');
  const start = (): ForgeState => initialForgeState([]);
  const edit = (state: ForgeState, level: number, tag: string, time: number) =>
    forgeReducer(state, { type: 'edit', key, sound: withLevel(state.work[key].sound, level), tag, time });

  it('keys round-trip', () => {
    expect(keyBuiltInId(builtInKey('scroll-land'))).toBe('scroll-land');
    expect(keyAssetId(mineKey('sound_123'))).toBe('sound_123');
    expect(keyBuiltInId(mineKey('x'))).toBeNull();
    expect(keyAssetId(key)).toBeNull();
  });

  it('a run of edits to one control is a single undo step', () => {
    let s = start();
    const original = s.work[key].sound.level;
    s = edit(s, 0.3, 'level', 1000);
    s = edit(s, 0.4, 'level', 1200);
    s = edit(s, 0.5, 'level', 1400);
    expect(s.work[key].past).toHaveLength(1);
    s = forgeReducer(s, { type: 'undo', key });
    expect(s.work[key].sound.level).toBe(original);
    s = forgeReducer(s, { type: 'redo', key });
    expect(s.work[key].sound.level).toBe(0.5);
  });

  it('a pause, or a different control, starts a new undo step', () => {
    let s = start();
    s = edit(s, 0.3, 'level', 1000);
    s = edit(s, 0.4, 'level', 5000); // long pause
    s = edit(s, 0.45, 'other', 5100); // another control
    expect(s.work[key].past).toHaveLength(3);
  });

  it('a drag is one undo step however long it takes', () => {
    let s = start();
    const original = s.work[key].sound.level;
    const drag = (state: ForgeState, level: number, time: number) =>
      forgeReducer(state, { type: 'edit', key, sound: withLevel(state.work[key].sound, level), tag: 'drag-1', time, sticky: true });
    s = drag(s, 0.3, 1000);
    s = drag(s, 0.4, 9000); // the finger rested for eight seconds
    s = drag(s, 0.5, 30000);
    expect(s.work[key].past).toHaveLength(1);
    s = forgeReducer(s, { type: 'undo', key });
    expect(s.work[key].sound.level).toBe(original);
  });

  it('an edit after an undo drops the redo', () => {
    let s = start();
    s = edit(s, 0.3, 'a', 1000);
    s = forgeReducer(s, { type: 'undo', key });
    expect(s.work[key].future).toHaveLength(1);
    s = edit(s, 0.6, 'b', 9000);
    expect(s.work[key].future).toHaveLength(0);
  });

  it('knows when a sound differs from what is saved', () => {
    let s = start();
    const saved = savedFor(key, []);
    expect(saved?.edited).toBe(false);
    expect(isUnsaved(s.work[key], saved, true)).toBe(false);
    s = edit(s, 0.9, 'level', 1000);
    expect(isUnsaved(s.work[key], saved, true)).toBe(true);
    // A new sound with nothing saved yet is unsaved.
    expect(isUnsaved(s.work[key], null, false)).toBe(true);
  });

  it("a device's saved edit of a page sound is what counts as saved", () => {
    const shipped = BUILT_IN_SOUNDS.find(b => b.id === 'torch-out')!.sound;
    const mine = withLevel(shipped, 0.5);
    const saved = savedFor(key, [{ id: 'chrome_torch-out', name: 'x', synth: mine, createdAt: '' }]);
    expect(saved?.edited).toBe(true);
    expect(saved?.sound.level).toBe(0.5);
  });
});

describe('forge helpers', () => {
  it('names notes', () => {
    expect(noteName(440)).toBe('A4');
    expect(noteName(1568)).toBe('G6');
    expect(noteName(0)).toBe('');
  });

  it('every starting point makes a playable layer or sound', () => {
    for (const starter of LAYER_STARTERS) {
      const layer = layerFromStarter(starter.id);
      expect(layer.id).toBeTruthy();
      expect(layer.length).toBeGreaterThan(0);
      expect(layer.level).toBeGreaterThan(0);
    }
    for (const starter of SOUND_STARTERS) {
      const sound = starter.make();
      expect(sound.layers.length).toBeGreaterThan(0);
      expect(soundLength(sound)).toBeGreaterThan(0);
    }
  });

  it('traces a loudness curve that starts and ends where the layer does', () => {
    const layer = layerFromStarter('whoosh');
    const points = envelopePoints(layer);
    expect(points[0]).toEqual([0, 0]); // it swells from silence
    expect(points[points.length - 1][0]).toBeCloseTo(layer.length, 6);
    expect(points[points.length - 1][1]).toBe(0); // and its tail reaches silence
    expect(Math.max(...points.map(p => p[1]))).toBe(1);
  });

  it('Surprise me bends a layer without changing its loudness or breaking it', () => {
    const layer = layerFromStarter('buzz');
    let n = 0;
    const next = nudgeLayer(layer, 0.2, () => [0.9, 0.1, 0.8, 0.3][n++ % 4]);
    expect(next.level).toBe(layer.level);
    expect(next.length).toBeGreaterThan(0);
    expect(next.attack).toBeLessThanOrEqual(next.length);
    expect(next.pitch?.from).not.toBe(layer.pitch?.from);
  });
});
