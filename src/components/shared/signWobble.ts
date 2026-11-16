import { useEffect, type RefObject } from 'react';
import { resnapWithin } from '../game/panelSkins';
import { GATE_SETTLE_STRENGTH, gateKnockStrength, playGateKnock } from '../../utils/gateSounds';
import { chromeSoundRecipe } from '../../utils/chromeSounds';
import { soundManager } from '../../utils/soundManager';
import { renderSynthSound } from '../../utils/synth/render';

// ============================================================================
// THE LOOSE SIGN — the wobble every sign bolted to the iron shares
// ============================================================================
// User asks 2026-10-15: poke a LIVES/TURNS plaque and it rocks on a bolt
// that isn't as tight as it should be; when the portcullis menu LANDS (the
// slam) its signs rattle the same way; and the rail's plaques rattle when
// the gate lands, when it locks shut, when the rail settles on page load,
// and when a pulled gate knocks home. One routine for all.
//
// The individual `rotate` property (Web Animations), clear of useCrispSnap's
// left/top. Each wobble starts from wherever the last one left the sign, so
// nothing jumps; once it settles, the sign and anything snapped inside it
// re-snap (a snap that ran mid-wobble measured the tilted box). Runs under
// Reduce Motion too (user call: minimal movement, in a project full of it).

/** Degrees per stop at strength 1, times the side (+1 = clockwise first). */
const WOBBLE_STOPS = [
  { offset: 0.12, deg: 2.5 },
  { offset: 0.3, deg: -1.8 },
  { offset: 0.48, deg: 1.1 },
  { offset: 0.66, deg: -0.6 },
  { offset: 0.84, deg: 0.25 },
];
const WOBBLE_MS = 550;
const running = new WeakMap<Element, Animation>();

/** Rock `el` on its loose bolt: `side` +1 dips the right half first. */
export function wobbleSign(el: HTMLElement, side: 1 | -1, strength = 1) {
  const from = parseFloat(getComputedStyle(el).rotate) || 0;
  running.get(el)?.cancel();
  const anim = el.animate([
    { offset: 0, rotate: `${from}deg`, easing: 'ease-out' },
    ...WOBBLE_STOPS.map(s => ({ offset: s.offset, rotate: `${s.deg * side * strength}deg`, easing: 'ease-in-out' })),
    { offset: 1, rotate: '0deg' },
  ], { duration: WOBBLE_MS });
  running.set(el, anim);
  anim.finished.then(() => {
    if (running.get(el) === anim) running.delete(el);
    resnapWithin(el);
  }, () => { /* cancelled by a newer wobble */ });
}

// ─── The creak ──────────────────────────────────────────────────────────────
// (user ask 2026-11-15: "a sound for the signs that can wobble ... something
// creaky"). The page sound sign-creak (utils/synth/builtIn.ts), as long as
// the wobble. Each one a little different in pitch, the two sides a touch
// apart, so a sign poked twice does not repeat itself. Pokes in a flurry
// share one creak: the wobble restarts, the sound does not pile up.
const CREAK_GAP_MS = 180;
let lastCreakAt = -Infinity;
function playSignCreak(strength: number, side: 1 | -1, delay = 0) {
  const now = performance.now();
  if (now - lastCreakAt < CREAK_GAP_MS) return;
  lastCreakAt = now;
  const gain = Math.max(0.05, Math.min(1, strength));
  const recipe = chromeSoundRecipe('sign-creak');
  const pitch = (side > 0 ? 1.03 : 0.97) * (0.98 + Math.random() * 0.04);
  const shuffle = Math.random();
  soundManager.playSynth((ctx, out, at) => {
    const level = ctx.createGain();
    level.gain.value = gain;
    level.connect(out);
    renderSynthSound(ctx, level, at + delay, recipe, { pitch, shuffle });
  });
}

/** A finger pokes a sign: it rocks (the poked half dips first) and creaks. */
export function pokeSign(el: HTMLElement, side: 1 | -1) {
  wobbleSign(el, side);
  playSignCreak(1, side);
}

/**
 * The gate's impacts rattle every sign at once: ONE creak for the lot, well
 * under the poke's (the impact has its own, much larger sound), a moment
 * after the hit.
 */
const IMPACT_CREAK = { slam: 0.5, clunk: 0.35, knock: 0.4, settle: 0.3 };
const IMPACT_CREAK_DELAY_S = 0.06;

// ─── The gate's impacts ─────────────────────────────────────────────────────

/**
 * The iron's impacts. The menu gate LANDS when it opens (slam) and LOCKS
 * when it closes (clunk), both announced by useGateShake. The rail SETTLES
 * on page load with its soft clunk (settle, from Game). A pulled gate
 * KNOCKS home (knock, from gateJostle).
 */
export type GateImpact = 'slam' | 'clunk' | 'settle' | 'knock';
type GateImpactDetail = { kind: GateImpact; force: number };
const GATE_IMPACT = 'gate-impact';

/** Announce an impact at the moment it hits; its force scales every sign's rattle. */
export const announceGateImpact = (kind: GateImpact, force = 1) => {
  window.dispatchEvent(new CustomEvent<GateImpactDetail>(GATE_IMPACT, { detail: { kind, force } }));
  // The two smaller locks sound here (utils/gateSounds.ts). The menu
  // gate's slam and clunk are part of its own move's sound (useGateShake).
  if (kind === 'settle') playGateKnock(GATE_SETTLE_STRENGTH);
  else if (kind === 'knock') playGateKnock(gateKnockStrength(force));
  playSignCreak(IMPACT_CREAK[kind] * force, Math.random() < 0.5 ? -1 : 1, IMPACT_CREAK_DELAY_S);
};

/** Up to this much lag per sign, so a row of signs rattles one by one, not as a block. */
const IMPACT_LAG_MS = 60;

/**
 * Rattle the sign in `ref` on the gate's impacts. `strength` says how hard
 * for each kind (0 = not this one); keep it a stable, module-level function.
 * Each sign picks its own side, and a little of its own strength and lag.
 */
export function useGateImpactWobble(
  ref: RefObject<HTMLElement | null>,
  strength: (kind: GateImpact, el: HTMLElement) => number,
) {
  useEffect(() => {
    const timers = new Set<number>();
    const onImpact = (e: Event) => {
      const el = ref.current;
      if (!el) return;
      const { kind, force } = (e as CustomEvent<GateImpactDetail>).detail;
      const s = strength(kind, el) * force;
      if (!(s > 0)) return;
      const side = Math.random() < 0.5 ? -1 : 1;
      const jitter = 0.8 + Math.random() * 0.2;
      const t = window.setTimeout(() => {
        timers.delete(t);
        wobbleSign(el, side, s * jitter);
      }, Math.random() * IMPACT_LAG_MS);
      timers.add(t);
    };
    window.addEventListener(GATE_IMPACT, onImpact);
    return () => {
      window.removeEventListener(GATE_IMPACT, onImpact);
      timers.forEach(clearTimeout);
    };
  }, [ref, strength]);
}
