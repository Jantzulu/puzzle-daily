import { useEffect, useState } from 'react';
import { msUntilNextLocalMidnight } from '../../utils/localDate';

/**
 * Countdown to the next daily puzzle — next local midnight, matching the
 * local-date keying in fetchTodaysPuzzle/dailyPuzzleCache. Rendered once the
 * player's day is decided (won or lost). When it reaches zero the next daily
 * exists server-side, so it flips to a refresh prompt instead of counting
 * negative.
 */

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

export function NextPuzzleCountdown({ className = '' }: { className?: string }) {
  const [remaining, setRemaining] = useState(() => msUntilNextLocalMidnight());

  useEffect(() => {
    // Recompute from the clock each tick (rather than decrementing) so the
    // display stays correct through tab-switches and setInterval throttling.
    const id = setInterval(() => setRemaining(msUntilNextLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  if (remaining <= 0) {
    return (
      <button
        onClick={() => window.location.reload()}
        className={`dungeon-btn px-4 py-2 text-sm font-bold ${className}`}
      >
        A new puzzle awaits — refresh
      </button>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-0.5 ${className}`}>
      <span className="text-[10px] uppercase tracking-widest text-parchment-300/70">
        Next puzzle in
      </span>
      <span className="font-medieval text-xl font-bold text-copper-300 tabular-nums">
        {formatRemaining(remaining)}
      </span>
    </div>
  );
}
