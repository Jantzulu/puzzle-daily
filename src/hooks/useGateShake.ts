import { useLayoutEffect, useRef } from 'react';

/**
 * SCREEN RUMBLE for the portcullis menu (user call 2026-10-08): body classes
 * that start the CSS shake on `.gate-shake-layer` (the wrapper around the nav
 * and the routed page, so the gate and the rail riding it shake as one):
 *   gate-lowering — the gate drops: a rumble that grows with its speed, then
 *                   the slam as it lands;
 *   gate-raising  — the gate is winched up: a ratcheting rumble, then the
 *                   clunk as it locks at the top.
 * An instant dismissal (a link tap) and the first render play nothing. A
 * class stays until the next change — the layer is never remounted, so a
 * finished animation never replays. Timing lives in index.css, locked to the
 * gate's own transitions.
 */
export function useGateShake(open: boolean, instantClose: boolean): void {
  const wasOpen = useRef(false);

  useLayoutEffect(() => {
    const body = document.body;
    if (open && !wasOpen.current) {
      body.classList.remove('gate-raising');
      body.classList.add('gate-lowering');
    } else if (!open && wasOpen.current) {
      body.classList.remove('gate-lowering');
      if (!instantClose) body.classList.add('gate-raising');
    }
    wasOpen.current = open;
  }, [open, instantClose]);

  useLayoutEffect(() => () => {
    document.body.classList.remove('gate-lowering', 'gate-raising');
  }, []);
}
