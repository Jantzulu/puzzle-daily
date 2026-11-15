// The portcullis menu's sound (user ask 2026-11-15): it matches how long the
// gate takes, how many rungs it has, and ends on a final sound for landing
// and for locking at the top.
//
// The gate's motion is exact and lives in index.css; this file mirrors its
// two timing curves so each sound lands on the moment it is seen:
//   LOWERING (the menu opens, 1.4s): the iron rumbles as it falls, each rung
//     clinks as it comes out from under the bar, it LANDS at 86% of the
//     way through, and rebounds twice.
//   RISING (the menu closes, 1.25s): the winch hauls in four pulls, each
//     rung clinks as it goes back under the bar, the pawl CATCHES between
//     pulls, and it LOCKS at the top.
// The pieces are page sounds (utils/synth/builtIn.ts: gate-rumble,
// gate-rung, gate-land, gate-lock), so each can be tuned in the Sound Forge.
// gatePlan is pure (what plays when); playGateSound schedules it.

import { chromeSoundRecipe, type ChromeSound } from './chromeSounds';
import { soundManager } from './soundManager';
import { renderSynthSound } from './synth/render';
import { layersLength, stretchSound } from './synth/types';

export type GateMove = 'lower' | 'raise';

/** LOCKSTEP with index.css: the open and close transition durations (s). */
export const GATE_SECONDS: Record<GateMove, number> = { lower: 1.4, raise: 1.25 };

/**
 * LOCKSTEP with index.css --gate-ease-lower and --gate-ease-raise: how far
 * the gate has travelled (0-1) at each percent of the move. If those curves
 * change, change these.
 */
const TRAVEL: Record<GateMove, ReadonlyArray<readonly [number, number]>> = {
  lower: [
    [0, 0], [5, 0.0015], [10, 0.006], [14, 0.014], [18, 0.0285], [22, 0.0494], [26, 0.0768], [30, 0.1106], [34, 0.1509], [38, 0.1976],
    [42, 0.2508], [46, 0.3104], [50, 0.3764], [56, 0.4804], [62, 0.5843], [68, 0.6882], [74, 0.7921], [80, 0.8961], [86, 1],
    [90, 0.988], [94, 1], [97, 0.997], [100, 1],
  ],
  raise: [
    [0, 0], [6, 0.003], [11.9, 0.0329], [17.8, 0.1152], [23.6, 0.2099], [29.5, 0.2522], [35.4, 0.2822], [41.3, 0.3644], [47.1, 0.4591],
    [53, 0.5015], [58.9, 0.5314], [64.8, 0.6137], [70.6, 0.7084], [76.5, 0.7508], [82.4, 0.7807], [88.3, 0.8629], [94.1, 0.9576], [100, 1],
  ],
};

/** The moments that matter, as shares of the move (index.css, same numbers). */
const LAND_AT = 0.86;
const REBOUNDS_AT = [0.94, 1] as const;
const CATCHES_AT = [0.295, 0.53, 0.765] as const;

/** When (0-1 of the move) the gate FIRST reaches `travelled` (0-1) of its way. */
export function gateTimeAt(move: GateMove, travelled: number): number {
  const curve = TRAVEL[move];
  for (let i = 1; i < curve.length; i++) {
    const [t0, p0] = curve[i - 1];
    const [t1, p1] = curve[i];
    if (p1 >= travelled && p1 > p0) return (t0 + ((travelled - p0) / (p1 - p0)) * (t1 - t0)) / 100;
  }
  return 1;
}

export interface GateStep {
  sound: ChromeSound;
  /** Seconds after the move starts. */
  at: number;
  /** Loudness next to the sound's own level (1 = as made). */
  gain: number;
  /** Pitch next to the sound's own (1 = as made). */
  pitch: number;
  /** Make the sound last this long (s) instead of its own length. */
  fit?: number;
}

/** What plays, and when, for one move of a gate with `rungs` rungs. */
export function gatePlan(move: GateMove, rungs: number): GateStep[] {
  const seconds = GATE_SECONDS[move];
  const count = Math.max(1, Math.min(12, Math.round(rungs)));
  const steps: GateStep[] = [];
  // The iron moving, for as long as it moves.
  steps.push({ sound: 'gate-rumble', at: 0, gain: move === 'lower' ? 1 : 0.8, pitch: 1, fit: (move === 'lower' ? LAND_AT : 1) * seconds });
  // One clink per rung, as its middle passes the bar's edge. Each a touch
  // different in pitch, so a run of them is not one sound repeated.
  for (let k = 0; k < count; k++) {
    const at = gateTimeAt(move, (k + 0.5) / count) * seconds;
    steps.push({ sound: 'gate-rung', at, gain: move === 'lower' ? 1 : 0.8, pitch: (move === 'lower' ? 1 : 1.12) * (k % 2 ? 0.95 : 1.04) });
  }
  if (move === 'lower') {
    // It hits the ground, then bounces twice, each smaller.
    steps.push({ sound: 'gate-land', at: LAND_AT * seconds, gain: 1, pitch: 1 });
    steps.push({ sound: 'gate-land', at: REBOUNDS_AT[0] * seconds, gain: 0.28, pitch: 1.2 });
    steps.push({ sound: 'gate-land', at: REBOUNDS_AT[1] * seconds, gain: 0.1, pitch: 1.35 });
  } else {
    // The pawl catches between the winch's pulls, then it locks on top.
    for (const share of CATCHES_AT) steps.push({ sound: 'gate-rung', at: share * seconds, gain: 1.5, pitch: 0.6 });
    steps.push({ sound: 'gate-lock', at: seconds, gain: 1, pitch: 1 });
  }
  return steps.sort((a, b) => a.at - b.at);
}

/**
 * The gate's SMALLER locks (user note 2026-11-15: these "should be less
 * intense and loud than the slam of opening and closing" the menu):
 *   the page-load settle   the rail is winched up its last few px and locks
 *   a grabbed gate         pulled down and let go, it knocks home
 * Both are the gate meeting its upper stop, so both are the lock sound,
 * quieter and pitched up a little (a smaller, lighter meeting). `strength`
 * is 0-1 of the menu gate's full lock.
 */
export function playGateKnock(strength: number): void {
  const gain = Math.max(0.05, Math.min(1, strength));
  const recipe = chromeSoundRecipe('gate-lock');
  soundManager.playSynth((ctx, out, at) => {
    const level = ctx.createGain();
    level.gain.value = gain;
    level.connect(out);
    renderSynthSound(ctx, level, at, recipe, { pitch: 1.3 - 0.25 * gain });
  });
}

/** How strong each smaller lock is, next to the menu gate's (1). */
export const GATE_SETTLE_STRENGTH = 0.5;
export const gateKnockStrength = (force: number) => 0.22 + 0.2 * Math.max(0, Math.min(1, force));

/**
 * Play a move's sound now. Returns a function that cuts it off (the gate
 * was turned back before it finished, or dismissed at once).
 */
export function playGateSound(move: GateMove, rungs: number): () => void {
  const plan = gatePlan(move, rungs);
  let cancelled = false;
  let cut: (() => void) | null = null;
  soundManager.playSynth((ctx, out, at) => {
    if (cancelled) return;
    const voice = ctx.createGain();
    voice.connect(out);
    for (const step of plan) {
      let recipe = chromeSoundRecipe(step.sound);
      if (step.fit) {
        const own = layersLength(recipe);
        if (own > 0) recipe = stretchSound(recipe, step.fit / own);
      }
      const level = ctx.createGain();
      level.gain.value = step.gain;
      level.connect(voice);
      renderSynthSound(ctx, level, at + step.at, recipe, { pitch: step.pitch, shuffle: step.at });
    }
    cut = () => {
      const now = ctx.currentTime;
      voice.gain.cancelScheduledValues(now);
      voice.gain.setValueAtTime(voice.gain.value, now);
      voice.gain.linearRampToValueAtTime(0, now + 0.04);
    };
  });
  return () => {
    cancelled = true;
    cut?.();
  };
}
