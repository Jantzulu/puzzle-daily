import React from 'react';
import { createPortal } from 'react-dom';
import { localDateKey } from '../../utils/localDate';
import { ENTRY_LIFT_MS, markPageEntered, puzzleDateLabel, setEntryDark } from './enterGateState';
import { playChromeSound } from '../../utils/chromeSounds';

/**
 * TAP TO ENTER (user pick 2026-11-15). A browser lets a page make no sound
 * until the visitor has tapped or clicked it, so on a fresh page load the
 * quest scroll used to land and unfurl in silence. Until the first tap the
 * page waits, showing today's date; that tap is what unlocks sound, and the
 * board and the scroll make their entrance after it.
 *
 * THE DARK ENTRY (user idea, same day): the wait is in DARKNESS. Everything
 * under the navbar (which stays lit, user call) is covered, and the tap
 * wakes the dungeon: the torches catch one after the other, their light
 * spreads from them, and the gate, which nobody has seen hanging open,
 * winches home as the light reaches it (Game.tsx holds its settle).
 *
 * HOW THE DARK LIFTS: two layers the colour of the page, one solid and one
 * with a wide soft hole around the torches. Both simply fade, slowly, at
 * about the board's own pace; the holed one runs a little behind, so the
 * torches' end of the page leads and the far end follows. Only opacity ever
 * animates (the mobile rule for page decoration). Under Reduce Motion it is
 * the same: fades always run.
 * WHAT THE USER'S EYE SAID (2026-11-15/16), which is why it is this plain:
 *   - a flicker on the dark as each torch caught read as a fault ("lights
 *     up, then almost immediately dims and then lights up again"). The
 *     dark only ever gets lighter.
 *   - four quick staged fades made the heroes panel and everything below
 *     "just pop in without fading in" (each was 0.3-0.5 s, next to a board
 *     that takes 1.4 s). Everything now fades over more than a second.
 *   - sparks from the torches and a warm glow swelling out of them: "I
 *     dont like the sparks or the radiant glow". Removed; do not bring
 *     them back.
 *
 * TODAY'S date, not the puzzle's own `date` field: that field is the day
 * the puzzle was MADE in the editor (and the built-in demo puzzle says
 * January 1, 2026). This only ever shows on a fresh page load, where the
 * puzzle is the daily, so the day being played is today, by the player's
 * own calendar (utils/localDate.ts, the same day the daily is chosen by).
 *
 * It only appears when it is needed: on a page nobody has touched yet
 * (enterGateState.ts startsEntered). Arriving at a puzzle from elsewhere in
 * the app (a tap already happened) goes straight in, as before.
 *
 * A tap ANYWHERE on the page enters, the navbar included.
 *
 * The card lifts a little as it fades.
 */
export const EnterGate: React.FC<{ onEnter: () => void; onGone: () => void }> = ({ onEnter, onGone }) => {
  const [title] = React.useState(() => puzzleDateLabel(localDateKey()) ?? '');
  const [lifting, setLifting] = React.useState(false);
  const darkRef = React.useRef<HTMLDivElement>(null);
  const calls = React.useRef({ onEnter, onGone });
  React.useEffect(() => { calls.current = { onEnter, onGone }; });

  // START AT THE TOP (user report 2026-11-16: "you can load into the landing
  // page with it having been scrolled partially down, and it does not let
  // you scroll the page on mobile"). A reload puts the page back where it
  // was scrolled to; the entry is staged from the top (the gate is up
  // there), so while the dark is up the browser is told not to do that.
  // The dark itself no longer blocks scrolling (index.css).
  React.useLayoutEffect(() => {
    const before = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    return () => { history.scrollRestoration = before; };
  }, []);

  // The dark starts where the navbar ends.
  React.useLayoutEffect(() => {
    const el = darkRef.current;
    if (!el) return;
    const place = () => {
      const nav = document.querySelector('nav');
      el.style.top = `${Math.max(0, Math.round(nav?.getBoundingClientRect().bottom ?? 0))}px`;
    };
    place();
    // The navbar grows a little as its font and art arrive: follow it.
    const nav = document.querySelector('nav');
    const watch = nav && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (nav) watch?.observe(nav);
    void document.fonts?.ready.then(place);
    const later = [150, 600, 1500].map(ms => window.setTimeout(place, ms));
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    return () => {
      watch?.disconnect();
      later.forEach(id => window.clearTimeout(id));
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place);
    };
  }, []);

  React.useEffect(() => {
    let gone: number | undefined;
    const onTap = () => {
      document.removeEventListener('click', onTap);
      // The light comes from the torches: the middle of the ones on screen
      // (or low and central when none is).
      const el = darkRef.current;
      if (el) {
        const box = el.getBoundingClientRect();
        const torches = [...document.querySelectorAll('.lintel-torch')]
          .map(t => t.getBoundingClientRect())
          .filter(r => r.width > 0 && r.bottom > box.top && r.top < window.innerHeight);
        if (torches.length > 0) {
          const x = torches.reduce((sum, r) => sum + r.left + r.width / 2, 0) / torches.length;
          const y = torches.reduce((sum, r) => sum + r.top + r.height / 2, 0) / torches.length;
          el.style.setProperty('--entry-lx', `${Math.round(x - box.left)}px`);
          el.style.setProperty('--entry-ly', `${Math.round(y - box.top)}px`);
        }
      }
      markPageEntered();
      playChromeSound('entry-rumble'); // a low rumble as the page comes out of the dark (user ask 2026-11-16)
      setEntryDark(false); // the torches catch
      setLifting(true);
      calls.current.onEnter();
      gone = window.setTimeout(() => calls.current.onGone(), ENTRY_LIFT_MS);
    };
    document.addEventListener('click', onTap);
    return () => {
      document.removeEventListener('click', onTap);
      window.clearTimeout(gone);
    };
  }, []);

  // Hung off <body>: outside the layer that shakes with the gate (a moving
  // ancestor would unpin it) and above every panel's own stacking order.
  return createPortal(
    <div ref={darkRef} className={`entry-dark${lifting ? ' entry-dark--lifting' : ''}`}>
      <span className="entry-dark-layer entry-dark-far" aria-hidden="true" />
      <span className="entry-dark-layer entry-dark-solid" aria-hidden="true" />
      <button type="button" className="enter-gate" aria-label={`${title}. Enter the dungeon`}>
        <span className="enter-gate-date">{title}</span>
        <span className="enter-gate-rule" aria-hidden="true" />
        <span className="enter-gate-hint hud-label">Tap to enter</span>
      </button>
    </div>,
    document.body,
  );
};
