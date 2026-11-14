import React from 'react';
import type { PuzzleScore } from '../../types/game';
import { getRankEmoji, getRankName } from '../../engine/scoring';

/**
 * The top of the victory screen, played out in beats (user pick
 * 2026-11-13): the trophy drops in, the rank appears, the points count up,
 * then the two par checks stamp down one after the other. About two
 * seconds, and nothing waits on it: every button below works throughout.
 *
 * A given win plays its beats ONCE. Reopening the screen from the
 * collapsed banner shows the settled result.
 *
 * Small flavor, so it runs under Reduce Motion too (the settled scope:
 * reduced variants are for big motion only). Transform and opacity only,
 * plus the trophy's existing glow.
 */

// Beat timings (ms), measured from the screen appearing. The panel itself
// scales in over the first ~550ms (animate-panel-scale-in).
const COUNT_START_MS = 950;
const COUNT_MS = 700;
const STAMP_START_MS = COUNT_START_MS + COUNT_MS + 100;
const STAMP_GAP_MS = 200;

/** Wins whose beats have already played this visit. */
const played = new WeakSet<PuzzleScore>();

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const VictoryTally: React.FC<{
  score: PuzzleScore;
  parCharacters: number | undefined;
  parTurns: number | undefined;
}> = ({ score, parCharacters, parTurns }) => {
  const [play] = React.useState(() => !played.has(score));
  const total = score.totalPoints;
  const [shown, setShown] = React.useState(play ? 0 : total);
  const [counted, setCounted] = React.useState(!play);

  React.useEffect(() => {
    played.add(score);
    if (!play) return;
    let raf = 0;
    const start = performance.now() + COUNT_START_MS;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / COUNT_MS));
      setShown(Math.round(total * easeOutCubic(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setCounted(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, score, total]);

  const stamp = (order: number): { className: string; style?: React.CSSProperties } =>
    play
      ? { className: 'victory-stamp', style: { animationDelay: `${STAMP_START_MS + order * STAMP_GAP_MS}ms` } }
      : { className: '' };
  const heroStamp = stamp(0);
  const turnStamp = stamp(1);

  return (
    <>
      {/* Trophy and Rank */}
      <div className={`text-4xl mb-1 ${play ? 'victory-trophy-drop' : 'animate-victory-glow'}`}>{getRankEmoji(score.rank)}</div>
      <h2 className={`text-xl md:text-2xl font-bold font-medieval text-moss-200 text-shadow-dungeon${play ? ' victory-rank-in' : ''}`}>
        {getRankName(score.rank)}
      </h2>

      {/* Stats for Gold trophy */}
      {score.rank === 'gold' && (
        <p className={`text-sm text-moss-300 mt-1${play ? ' victory-rank-in' : ''}`}>
          ({score.stats.charactersUsed} hero{score.stats.charactersUsed !== 1 ? 'es' : ''}, {score.stats.turnsUsed} turn{score.stats.turnsUsed !== 1 ? 's' : ''})
        </p>
      )}

      {/* Total Score: counts up; screen readers get the final figure */}
      <div
        className={`mt-3 text-2xl font-bold text-copper-300 text-shadow-glow-copper${play && counted ? ' victory-points-pop' : ''}`}
        aria-label={`${total.toLocaleString()} points`}
      >
        <span aria-hidden="true">{shown.toLocaleString()} pts</span>
      </div>

      {/* Par Status */}
      <div className="mt-2 flex justify-center gap-4 text-xs">
        <span className={`${score.parMet.characters ? 'text-moss-300' : 'text-stone-500'} ${heroStamp.className}`} style={heroStamp.style}>
          {score.parMet.characters ? '✓' : '✗'} Hero Par ({parCharacters ?? '-'})
        </span>
        <span className={`${score.parMet.turns ? 'text-moss-300' : 'text-stone-500'} ${turnStamp.className}`} style={turnStamp.style}>
          {score.parMet.turns ? '✓' : '✗'} Turn Par ({parTurns ?? '-'})
        </span>
      </div>
    </>
  );
};
