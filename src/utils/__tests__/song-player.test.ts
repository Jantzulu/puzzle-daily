import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { songOfSound, songSeconds, type SynthSong } from '../synth/song';
import type { SynthSound } from '../synth/types';

// Keeping a song playing (songPlayer.ts), without a browser: the audio
// context is a clock the test moves by hand, and render.ts is replaced by a
// list of what it was asked to draw and when.

const drawn: number[] = [];
vi.mock('../synth/render', () => ({
  renderSynthSound: (_ctx: unknown, _out: unknown, at: number) => { drawn.push(at); },
}));

import { playSong } from '../synth/songPlayer';

const blip: SynthSound = {
  version: 1,
  level: 1,
  layers: [{ id: 'a', name: 'Blip', source: 'tone', start: 0, length: 0.1, level: 0.5, attack: 0, hold: 0.02, floor: 0, tail: 0.02, wave: 'square', pitch: { from: 440, to: 440 } }],
};

/** One bar at 120 bpm (2 s), a note on every beat: at 0, 0.5, 1 and 1.5 s. */
const song: SynthSong = {
  version: 1,
  tempo: 120,
  length: 16,
  level: 1,
  tracks: [{ id: 't', name: 'Blips', instrument: blip, root: 69, level: 1, notes: [0, 4, 8, 12].map(at => ({ at, length: 2, key: 69 })) }],
};

function fakeContext() {
  const gain = { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
  const bus = { gain, connect: vi.fn(), disconnect: vi.fn() };
  const ctx = { currentTime: 10, createGain: () => bus };
  return { ctx: ctx as unknown as BaseAudioContext, clock: ctx, bus };
}

/** Let `seconds` go by, on the audio clock and the timers alike, a tick at a time. */
function pass(clock: { currentTime: number }, seconds: number, tick = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += tick) {
    clock.currentTime += tick;
    vi.advanceTimersByTime(tick * 1000);
  }
}

describe('keeping a song playing', () => {
  beforeEach(() => { drawn.length = 0; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('draws only a little ahead of the clock', () => {
    const { ctx } = fakeContext();
    const playback = playSong(ctx, {} as AudioNode, song);
    // A quarter of a second ahead: the first note, not yet the second.
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toBeCloseTo(10.06, 6);
    playback.stop();
  });

  it('once through: every note on its instant, then it says it is over', () => {
    const { ctx, clock } = fakeContext();
    const onEnd = vi.fn();
    playSong(ctx, {} as AudioNode, song, { onEnd });
    pass(clock, 3);
    expect(drawn.map(at => +(at - 10.06).toFixed(3))).toEqual([0, 0.5, 1, 1.5]);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('looped: goes round with no gap at the join, until stopped', () => {
    const { ctx, clock, bus } = fakeContext();
    const onEnd = vi.fn();
    const playback = playSong(ctx, {} as AudioNode, song, { loop: true, onEnd });
    pass(clock, 5);
    // Two and a half times round: the notes keep to the half-second grid across each join.
    const times = drawn.map(at => +(at - 10.06).toFixed(3));
    expect(times.slice(0, 10)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]);
    expect(onEnd).not.toHaveBeenCalled();
    expect(playback.position()).toBeCloseTo((5 - 0.06) % songSeconds(song), 3);

    playback.stop();
    const before = drawn.length;
    pass(clock, 2);
    expect(drawn).toHaveLength(before); // nothing more is drawn
    expect(playback.position()).toBe(-1);
    expect(bus.gain.linearRampToValueAtTime).toHaveBeenCalled(); // a fade, not a click
  });

  it('a page in the background is drawn much further ahead, at once', () => {
    let state = 'visible';
    const listeners = new Set<() => void>();
    vi.stubGlobal('document', {
      get visibilityState() { return state; },
      addEventListener: (_: string, f: () => void) => listeners.add(f),
      removeEventListener: (_: string, f: () => void) => listeners.delete(f),
    });
    const { ctx, clock } = fakeContext();
    const playback = playSong(ctx, {} as AudioNode, song, { loop: true });
    expect(drawn).toHaveLength(1);

    // Hidden: topped up straight away, three seconds ahead.
    state = 'hidden';
    listeners.forEach(f => f());
    expect(drawn.length).toBeGreaterThanOrEqual(6);

    // Timers now come once a second: still no hole in the music.
    for (let i = 0; i < 6; i++) {
      clock.currentTime += 1;
      vi.advanceTimersByTime(50); // one late tick
      const last = Math.max(...drawn);
      expect(last).toBeGreaterThan(clock.currentTime + 1.4); // the next second is already drawn
    }
    const times = drawn.map(at => +(at - 10.06).toFixed(3));
    times.forEach((t, i) => expect(t).toBeCloseTo(i * 0.5, 3)); // every note, none twice

    playback.stop();
    expect(listeners.size).toBe(0);
  });
});

describe('a sound in a music slot', () => {
  it('is a song of one note, as long as the sound', () => {
    const made = songOfSound({ ...blip, echo: { time: 0.2, repeats: 2, fade: 0.5 } });
    // 0.1 s of sound and two echoes 0.2 s apart = 0.5 s = four steps at 120 bpm.
    expect(made.length).toBe(4);
    expect(songSeconds(made)).toBeCloseTo(0.5, 6);
    expect(made.tracks).toHaveLength(1);
    expect(made.tracks[0].notes).toEqual([{ at: 0, length: 4, key: 69 }]);
    expect(made.tracks[0].root).toBe(69); // played at its own pitch
  });
});
