import { useLayoutEffect, useRef } from 'react';
import { announceGateImpact } from '../components/shared/signWobble';
import { playGateSound } from '../utils/gateSounds';

/** How many rungs the gate has: one per menu row (the sound clinks once for each). */
const gateRungs = () => document.querySelectorAll('.menu-gate .nav-gate-item').length || 5;

// gate-rumble-raise 1.25s + gate-clunk 0.4s (index.css), with a little slack.
const RAISE_SHAKE_MS = 1750;
// THE IMPACTS (user ask 2026-10-15: the signs rattle with the gate). The
// gate lands as the slam starts and locks as the clunk starts. LOCKSTEP
// with index.css: gate-slam's delay (1.2s) and gate-clunk's (1.25s).
const SLAM_AT_MS = 1200;
const CLUNK_AT_MS = 1250;

/**
 * SCREEN RUMBLE for the portcullis menu (user call 2026-10-08): body classes
 * that start the CSS shake on `.gate-shake-layer` (the wrapper around the nav
 * and the routed page, so the gate and the rail riding it shake as one):
 *   gate-lowering — the gate drops: a rumble that grows with its speed, then
 *                   the slam as it lands;
 *   gate-raising  — the gate is winched up: a ratcheting rumble, then the
 *                   clunk as it locks at the top.
 * An instant dismissal (a link tap) and the first render play nothing. The
 * layer is never remounted, so a finished animation never replays.
 * gate-lowering stays while the menu is open; gate-raising is cleared once
 * its shake has played, so it can't outrank the page-load settle's own
 * clunk (.gate-shake-layer:has(.gate-settle)) on a later visit to Play.
 * Timing lives in index.css, locked to the gate's own transitions.
 * It also ANNOUNCES the two impacts (announceGateImpact), so the signs on
 * the gate and the rail can rattle. They fire under Reduce Motion too:
 * the gate still lands, only the screen shake is held still.
 * It also plays the gate's SOUND (utils/gateSounds.ts, user ask 2026-11-15):
 * the rumble, a clink per rung, and the landing or the lock, on the same
 * moments as the shake. A gate turned back mid-travel has its sound cut.
 */
export function useGateShake(open: boolean, instantClose: boolean): void {
  const wasOpen = useRef(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The pending impact. A toggle before it lands cancels it: a gate
  // turned back mid-travel never hits.
  const impactTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cuts off the sound of the move under way.
  const cutSound = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const body = document.body;
    if (open && !wasOpen.current) {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      body.classList.remove('gate-raising');
      body.classList.add('gate-lowering');
      if (impactTimer.current) clearTimeout(impactTimer.current);
      impactTimer.current = setTimeout(() => announceGateImpact('slam'), SLAM_AT_MS);
      cutSound.current?.();
      cutSound.current = playGateSound('lower', gateRungs());
    } else if (!open && wasOpen.current) {
      body.classList.remove('gate-lowering');
      if (impactTimer.current) clearTimeout(impactTimer.current);
      impactTimer.current = null;
      cutSound.current?.();
      cutSound.current = null;
      if (!instantClose) {
        cutSound.current = playGateSound('raise', gateRungs());
        body.classList.add('gate-raising');
        clearTimer.current = setTimeout(() => body.classList.remove('gate-raising'), RAISE_SHAKE_MS);
        impactTimer.current = setTimeout(() => announceGateImpact('clunk'), CLUNK_AT_MS);
      }
    }
    wasOpen.current = open;
  }, [open, instantClose]);

  useLayoutEffect(() => () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    if (impactTimer.current) clearTimeout(impactTimer.current);
    cutSound.current?.();
    document.body.classList.remove('gate-lowering', 'gate-raising');
  }, []);
}
