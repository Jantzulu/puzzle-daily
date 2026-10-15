import { useCallback, useEffect, useRef } from 'react';
import { announceGateImpact } from '../shared/signWobble';

// ============================================================================
// THE JOSTLE (user idea 2026-10-15): the closed portcullis can be grabbed and
// pulled down a little against its chain, and it winches back home when let
// go. Flavour only: nothing in the game reads it.
// ============================================================================
// A few px, not the page-load settle's 24 (user call: "it only needs to move
// a bit to give the effect some life"). The pull runs into growing tension,
// approaching JOSTLE_MAX_PX. Released, the gate winches up a whole px at a
// time (the art stays crisp the whole way) and, from a real pull, knocks
// against its stop: home, a 1px rebound, home. The knock rattles the rail's
// plaques (shared/signWobble.ts), harder for a deeper pull.
//
// Grab anywhere on the rail except its buttons. Only a DOWNWARD pull grabs,
// so a swipe up on a phone still scrolls the page: touch decides on its
// first touchmove, the one moment iOS lets a page keep a gesture from
// scrolling. Off while the menu gate is open or moving, during the
// page-load settle, and through replay (the caller's `enabled`). The pull is
// the individual `translate` property on the sticky wrapper, so it composes
// with the settle and the menu ride (transform, same element) and the
// riding sag (on the rail itself). Whole px only, so the crisp snaps inside
// (useCrispSnap measures fractions) never see it. It winches home under
// Reduce Motion too (user call 2026-10-15: minimal movement, in a project
// full of it).

/** How far the pull can bring the gate down, in px. */
export const JOSTLE_MAX_PX = 8;
/** The chain's tension: finger travel per e-fold of the remaining pull. */
const JOSTLE_TENSION_PX = 24;
/** The winch home, per px. */
const WINCH_MS_PER_PX = 18;
/** A pull this deep (px) knocks the gate against its stop on the way home. */
const KNOCK_FROM_PX = 4;
/** The knock: home for KNOCK_HIT_MS, then 1px down until KNOCK_MS. */
const KNOCK_HIT_MS = 30;
const KNOCK_MS = 100;

const pullFor = (travel: number) =>
  Math.round(JOSTLE_MAX_PX * (1 - Math.exp(-Math.max(0, travel) / JOSTLE_TENSION_PX)));
// pullFor's inverse: the finger travel that holds the gate `px` down, so a
// grab mid-winch picks it up where it is.
const travelFor = (px: number) =>
  -JOSTLE_TENSION_PX * Math.log(1 - Math.min(px / JOSTLE_MAX_PX, 0.9));

const menuGateBusy = () => {
  const c = document.body.classList;
  return c.contains('menu-gate-lowered') || c.contains('gate-lowering') || c.contains('gate-raising');
};

/**
 * Returns the callback ref for the rail's sticky wrapper (.quest-panel-sticky).
 * A React 19 ref with cleanup, so a remounted wrapper re-attaches. Sets
 * data-jostle while grabbable (the grab cursor) and data-jostling mid-pull.
 */
export function useGateJostle(enabled: boolean) {
  const enabledRef = useRef(enabled);
  const wrapRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    enabledRef.current = enabled;
    wrapRef.current?.toggleAttribute('data-jostle', enabled);
  }, [enabled]);

  return useCallback((wrap: HTMLDivElement | null) => {
    if (!wrap) return;
    wrapRef.current = wrap;
    wrap.toggleAttribute('data-jostle', enabledRef.current);
    let pointerId: number | null = null;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let base = 0;
    let depth = 0;
    let home: Animation | null = null;
    let knockTimer: number | undefined;

    const setDepth = (px: number) => {
      depth = px;
      wrap.style.translate = px ? `0 ${px}px` : '';
    };

    const winchHome = () => {
      const from = depth;
      setDepth(0);
      const glide = from * WINCH_MS_PER_PX;
      const knock = from >= KNOCK_FROM_PX;
      const total = glide + (knock ? KNOCK_MS : 0);
      const frames: Keyframe[] = [{ offset: 0, translate: `0 ${from}px`, easing: `steps(${from}, end)` }];
      if (knock) {
        frames.push(
          { offset: glide / total, translate: '0 0', easing: 'step-end' },
          { offset: (glide + KNOCK_HIT_MS) / total, translate: '0 1px', easing: 'step-end' },
        );
      }
      frames.push({ offset: 1, translate: '0 0' });
      const anim = wrap.animate(frames, { duration: total });
      home = anim;
      anim.finished.then(() => { if (home === anim) home = null; }, () => { /* caught by a new grab */ });
      if (knock) knockTimer = window.setTimeout(() => announceGateImpact('knock', from / JOSTLE_MAX_PX), glide);
    };

    const grab = () => {
      dragging = true;
      wrap.setAttribute('data-jostling', '');
      try { if (pointerId !== null) wrap.setPointerCapture(pointerId); } catch { /* the pointer is gone */ }
    };

    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      pointerId = null;
      dragging = false;
      wrap.removeAttribute('data-jostling');
      if (depth > 0) winchHome();
    };

    const isDownward = (dx: number, dy: number) => dy > 0 && dy >= Math.abs(dx);

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        // Touch decides in onTouchMove, the only place that can stop a scroll.
        if (e.pointerType === 'touch') return;
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        if (!isDownward(dx, dy)) { finish(); return; }
        grab();
      }
      setDepth(pullFor(base + dy));
    };

    const onTouchMove = (e: TouchEvent) => {
      if (pointerId === null) return;
      if (!dragging) {
        const t = e.touches[0];
        if (!t) return;
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (!isDownward(dx, dy)) { finish(); return; }
        grab();
        setDepth(pullFor(base + dy));
      }
      e.preventDefault();
    };

    const onDown = (e: PointerEvent) => {
      if (!enabledRef.current || pointerId !== null || !e.isPrimary || e.button !== 0 || menuGateBusy()) return;
      const target = e.target as HTMLElement;
      if (!target.closest('.control-rail') || target.closest('button, a')) return;
      if (home) {
        // Caught mid-winch: hold it where it is (and it never knocks).
        const y = /\S+\s+(-?[\d.]+)px/.exec(getComputedStyle(wrap).translate)?.[1];
        home.cancel();
        home = null;
        window.clearTimeout(knockTimer);
        setDepth(Math.round(parseFloat(y ?? '0') || 0));
      }
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      base = depth ? travelFor(depth) : 0;
      // A mouse drag must not select the labels.
      if (e.pointerType === 'mouse') e.preventDefault();
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    };

    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      wrap.removeEventListener('pointerdown', onDown);
      wrap.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      home?.cancel();
      window.clearTimeout(knockTimer);
      wrap.style.translate = '';
      wrap.removeAttribute('data-jostling');
      if (wrapRef.current === wrap) wrapRef.current = null;
    };
  }, []);
}
