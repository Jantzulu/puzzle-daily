import { useEffect, type RefObject } from 'react';
import { resnapWithin } from '../game/panelSkins';

// ============================================================================
// THE LOOSE SIGN — the wobble every sign bolted to the iron shares
// ============================================================================
// User asks 2026-10-15: poke a LIVES/TURNS plaque and it rocks on a bolt
// that isn't as tight as it should be; when the portcullis menu LANDS (the
// slam) its signs rattle the same way; and the rail's plaques rattle when
// the gate lands and, a little, when it locks shut. One routine for all.
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

// ─── The gate's impacts ─────────────────────────────────────────────────────

/** The menu gate LANDS when it opens (the slam) and LOCKS when it closes (the clunk). */
export type GateImpact = 'slam' | 'clunk';
const GATE_IMPACT = 'gate-impact';

/** useGateShake announces each impact at the moment it hits. */
export const announceGateImpact = (kind: GateImpact) => {
  window.dispatchEvent(new CustomEvent<GateImpact>(GATE_IMPACT, { detail: kind }));
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
      const s = strength((e as CustomEvent<GateImpact>).detail, el);
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
