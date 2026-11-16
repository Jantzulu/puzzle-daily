import React from 'react';
import { createPortal } from 'react-dom';
import { localDateKey } from '../../utils/localDate';
import { ENTRY_LIFT_MS, markPageEntered, puzzleDateLabel, setEntryDark } from './enterGateState';

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
 * HOW THE LIGHT SPREADS, cheaply: four layers the colour of the page, one
 * solid and three with a hole around the torches (small, medium, large).
 * They fade out one after another, so the lit pool grows in soft steps.
 * Only opacity ever animates (the mobile rule for page decoration); a mask
 * or a gradient that changes size would repaint the whole screen each
 * frame. Under Reduce Motion it is the same: fades always run.
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
 * THE FLOURISHES (user ask, same day: "any other effects to the transition
 * to make it more interesting"), each its own element so one can go without
 * the others, each only transform and opacity:
 *   the WASH    a warm bloom of firelight (the torch light's own colours)
 *               that swells out from the torches ahead of the lifting dark
 *               and thins away.
 *   the SPARKS  a few 2px embers thrown up from each torch as it catches.
 *   the CARD    lifts a little as it fades, instead of only fading.
 */

/** One torch's embers: where each ends up (px), how long it flies and when it leaves (ms). Fixed, so every entry looks the same. */
const SPARKS = [
  { dx: -13, rise: -44, ms: 760, wait: 0 },
  { dx: 7, rise: -58, ms: 880, wait: 30 },
  { dx: -4, rise: -66, ms: 940, wait: 70 },
  { dx: 15, rise: -36, ms: 700, wait: 90 },
  { dx: -18, rise: -28, ms: 640, wait: 120 },
  { dx: 3, rise: -50, ms: 820, wait: 150 },
  { dx: 10, rise: -70, ms: 980, wait: 190 },
  { dx: -9, rise: -54, ms: 860, wait: 230 },
];
/** = LintelTorch FOLLOW_MS: the second torch catches this long after the first. */
const SECOND_TORCH_MS = 220;
export const EnterGate: React.FC<{ onEnter: () => void; onGone: () => void }> = ({ onEnter, onGone }) => {
  const [title] = React.useState(() => puzzleDateLabel(localDateKey()) ?? '');
  const [lifting, setLifting] = React.useState(false);
  /** Where each torch's flame is, inside the dark, at the tap. */
  const [flames, setFlames] = React.useState<Array<{ x: number; y: number }>>([]);
  const darkRef = React.useRef<HTMLDivElement>(null);
  const calls = React.useRef({ onEnter, onGone });
  React.useEffect(() => { calls.current = { onEnter, onGone }; });

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
        const lit = [...document.querySelectorAll<HTMLElement>('.lintel-torch')]
          .map(t => ({ t, r: t.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && r.bottom > box.top && r.top < window.innerHeight);
        const torches = lit.map(({ r }) => r);
        setFlames(lit.map(({ t, r }) => {
          const style = getComputedStyle(t);
          const fx = parseFloat(style.getPropertyValue('--torch-flame-x'));
          const fy = parseFloat(style.getPropertyValue('--torch-flame-y'));
          return {
            x: Math.round(r.left - box.left + (Number.isFinite(fx) ? fx : r.width / 2)),
            y: Math.round(r.top - box.top + (Number.isFinite(fy) ? fy : r.height / 3)),
          };
        }));
        if (torches.length > 0) {
          const x = torches.reduce((sum, r) => sum + r.left + r.width / 2, 0) / torches.length;
          const y = torches.reduce((sum, r) => sum + r.top + r.height / 2, 0) / torches.length;
          const spread = Math.max(...torches.map(r => r.right)) - Math.min(...torches.map(r => r.left));
          el.style.setProperty('--entry-lx', `${Math.round(x - box.left)}px`);
          el.style.setProperty('--entry-ly', `${Math.round(y - box.top)}px`);
          el.style.setProperty('--entry-pool', `${Math.round(spread / 2 + 70)}px`);
        }
      }
      markPageEntered();
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
      <span className="entry-dark-layer entry-dark-mid" aria-hidden="true" />
      <span className="entry-dark-layer entry-dark-pool" aria-hidden="true" />
      <span className="entry-dark-layer entry-dark-solid" aria-hidden="true" />
      <span className="entry-dark-wash" aria-hidden="true" />
      {flames.map((flame, i) => (
        <span
          key={i}
          className="entry-sparks"
          style={{ left: flame.x, top: flame.y, '--spark-torch': `${i * SECOND_TORCH_MS}ms` } as React.CSSProperties}
          aria-hidden="true"
        >
          {SPARKS.map((s, k) => (
            <i key={k} style={{ '--spark-dx': `${s.dx}px`, '--spark-rise': `${s.rise}px`, '--spark-ms': `${s.ms}ms`, '--spark-wait': `${s.wait}ms` } as React.CSSProperties} />
          ))}
        </span>
      ))}
      <button type="button" className="enter-gate" aria-label={`${title}. Enter the dungeon`}>
        <span className="enter-gate-date">{title}</span>
        <span className="enter-gate-rule" aria-hidden="true" />
        <span className="enter-gate-hint hud-label">Tap to enter</span>
      </button>
    </div>,
    document.body,
  );
};
