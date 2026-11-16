import { describe, expect, it } from 'vitest';
import { GATE_SECONDS, GATE_SETTLE_STRENGTH, gateKnockStrength, gatePlan, gateTimeAt } from '../gateSounds';
import { layersLength, stretchSound, type SynthSound } from '../synth/types';

// What the menu gate's sound plays, and when (the audio itself needs a
// browser). The numbers mirror index.css: the gate lands at 86% of 1.4s and
// rebounds at 94% and 100%; it is winched up in pulls whose pawl catches
// at 29.5%, 53% and 76.5%, and locks at 1.25s.

describe('the gate sound follows the gate', () => {
  it('finds when the gate has travelled a share of its way', () => {
    for (const move of ['lower', 'raise'] as const) {
      expect(gateTimeAt(move, 0)).toBeLessThan(0.07);
      let last = 0;
      for (let p = 0.05; p <= 1; p += 0.05) {
        const t = gateTimeAt(move, p);
        expect(t).toBeGreaterThanOrEqual(last); // never goes back in time
        last = t;
      }
    }
    // Lowering reaches the ground at 86% of the move, not at its end.
    expect(gateTimeAt('lower', 1)).toBeCloseTo(0.86, 6);
    expect(gateTimeAt('raise', 1)).toBeCloseTo(1, 6);
  });

  it('lowering: the chug, one clack per rung, the crash, two smaller rebounds', () => {
    const plan = gatePlan('lower', 5);
    const of = (sound: string) => plan.filter(s => s.sound === sound);
    expect(of('gate-rung')).toHaveLength(5);
    expect(of('gate-rumble')).toHaveLength(1);
    expect(of('gate-rumble')[0].fit).toBeCloseTo(0.86 * 1.4, 6); // it rumbles until it lands
    // One crash (it rings for two seconds; it is not played again for the bounces).
    const lands = of('gate-land');
    expect(lands.map(s => +s.at.toFixed(3))).toEqual([1.204]);
    expect(lands[0].gain).toBe(1);
    // The two rebounds are the smaller clank, each quieter than the last.
    const rebounds = of('gate-lock');
    expect(rebounds.map(s => +s.at.toFixed(3))).toEqual([1.316, 1.4]);
    expect(rebounds[0].gain).toBeLessThan(1);
    expect(rebounds[1].gain).toBeLessThan(rebounds[0].gain);
    // Every rung has come out before the gate lands.
    for (const rung of of('gate-rung')) expect(rung.at).toBeLessThan(lands[0].at);
  });

  it('rising: one clack per rung, the pawl catching between pulls, the crash at the top', () => {
    const plan = gatePlan('raise', 5);
    const rungs = plan.filter(s => s.sound === 'gate-rung');
    const catches = rungs.filter(s => s.pitch < 0.9);
    expect(rungs.length - catches.length).toBe(5);
    expect(catches.map(s => +s.at.toFixed(3))).toEqual([0.369, 0.663, 0.956]);
    // The top is the same crash as the landing, a touch smaller.
    const top = plan.filter(s => s.sound === 'gate-land');
    expect(top).toHaveLength(1);
    expect(top[0].at).toBeCloseTo(GATE_SECONDS.raise, 6);
    expect(top[0].gain).toBeLessThan(1);
    expect(top[0].gain).toBeGreaterThan(0.7);
    expect(plan[plan.length - 1].sound).toBe('gate-land'); // nothing after it
    expect(plan.filter(s => s.sound === 'gate-lock')).toHaveLength(0);
  });

  it('counts the rungs it is given', () => {
    expect(gatePlan('lower', 3).filter(s => s.sound === 'gate-rung')).toHaveLength(3);
    expect(gatePlan('lower', 7).filter(s => s.sound === 'gate-rung')).toHaveLength(7);
    // A plan is in time order.
    const plan = gatePlan('raise', 6);
    for (let i = 1; i < plan.length; i++) expect(plan[i].at).toBeGreaterThanOrEqual(plan[i - 1].at);
  });

  it('the page-load settle and a grabbed gate are quieter than the menu gate', () => {
    expect(GATE_SETTLE_STRENGTH).toBeLessThan(1);
    expect(gateKnockStrength(1)).toBeLessThan(GATE_SETTLE_STRENGTH);
    expect(gateKnockStrength(0.5)).toBeLessThan(gateKnockStrength(1)); // a shallower pull knocks more softly
    expect(gateKnockStrength(0)).toBeGreaterThan(0);
  });
});

describe('stretching a sound', () => {
  it('scales every time and leaves pitch and level alone', () => {
    const sound: SynthSound = {
      version: 1,
      level: 0.3,
      echo: { time: 0.1, repeats: 2, fade: 0.5 },
      layers: [{
        id: 'a', name: 'A', source: 'tone', wave: 'sine', start: 0.2, length: 1, level: 0.5, attack: 0.1, hold: 0.2, floor: 0.1, tail: 0.05,
        pitch: { from: 400, to: 200, via: { value: 300, at: 0.4 }, arriveAt: 0.8 },
        filters: [{ type: 'lowpass', cutoff: { from: 900, to: 500, via: { value: 700, at: 0.5 } } }],
      }],
    };
    const twice = stretchSound(sound, 2);
    const l = twice.layers[0];
    expect([l.start, l.length, l.attack, l.hold, l.tail]).toEqual([0.4, 2, 0.2, 0.4, 0.1]);
    expect(l.pitch).toEqual({ from: 400, to: 200, via: { value: 300, at: 0.8 }, arriveAt: 1.6 });
    expect(l.filters?.[0].cutoff.via).toEqual({ value: 700, at: 1 });
    expect(twice.echo?.time).toBe(0.2);
    expect(twice.level).toBe(0.3);
    expect(l.level).toBe(0.5);
    expect(layersLength(twice)).toBeCloseTo(2 * layersLength(sound), 9);
    expect(sound.layers[0].length).toBe(1); // the original is untouched
  });
});
