import React from 'react';
import { localDateKey } from '../../utils/localDate';
import { markPageEntered, puzzleDateLabel } from './enterGateState';

/**
 * TAP TO ENTER (user pick 2026-11-15). A browser lets a page make no sound
 * until the visitor has tapped or clicked it, so on a fresh page load the
 * quest scroll used to land and unfurl in silence. This card stands where
 * the board will be, showing today's date, until the first tap; that tap is
 * what unlocks sound, and the board and the scroll make their entrance
 * after it.
 *
 * TODAY'S date, not the puzzle's own `date` field: that field is the day
 * the puzzle was MADE in the editor (and the built-in demo puzzle says
 * January 1, 2026). The card only ever shows on a fresh page load, where the
 * puzzle is the daily, so the day being played is today, by the player's
 * own calendar (utils/localDate.ts, the same day the daily is chosen by).
 *
 * It only appears when it is needed: on a page nobody has touched yet
 * (enterGateState.ts pageAlreadyEntered). Arriving at a puzzle from
 * elsewhere in the app (a tap already happened) goes straight in, as before.
 *
 * A tap ANYWHERE on the page enters, not just on the card.
 */
export const EnterGate: React.FC<{ onEnter: () => void }> = ({ onEnter }) => {
  const [title] = React.useState(() => puzzleDateLabel(localDateKey()) ?? '');
  const enter = React.useRef(onEnter);
  React.useEffect(() => { enter.current = onEnter; });
  React.useEffect(() => {
    const onTap = () => {
      markPageEntered();
      enter.current();
    };
    document.addEventListener('click', onTap);
    return () => document.removeEventListener('click', onTap);
  }, []);

  return (
    <button
      type="button"
      className="enter-gate absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-transparent border-0 p-4 cursor-pointer"
      aria-label={`${title}. Enter the dungeon`}
    >
      <span className="enter-gate-date">{title}</span>
      <span className="enter-gate-rule" aria-hidden="true" />
      <span className="enter-gate-hint hud-label">Tap to enter</span>
    </button>
  );
};
