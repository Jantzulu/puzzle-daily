import React from 'react';
import { DEAD_END_ART as ART } from '../../assets/ui-kits/deadEnd';

/**
 * The 404 page's scene (user pick 2026-11-13): a caved-in corridor with
 * eyes in the dark. The eyes blink and glance about; tap a pair and it
 * startles shut, then creeps back a few seconds later somewhere else. A
 * little dust trickles from the broken arch.
 *
 * The still image is the art drop-in (assets/ui-kits/deadEnd.ts); the eyes
 * and the dust are drawn over it here.
 *
 * COST: transform and opacity only, no script per frame. It runs under
 * Reduce Motion too (the settled scope: minimal flavor always runs).
 */

/** Three watchers. `near` eyes are 2 art px, the far ones 1. */
const WATCHERS = [
  { color: '#ffb347', near: true, blinkMs: 4300, startSpot: 0 },
  { color: '#c9e27a', near: false, blinkMs: 5700, startSpot: 3 },
  { color: '#e8553d', near: true, blinkMs: 3600, startSpot: 5 },
] as const;

/** How long a startled pair takes to shut, and to dare coming back. */
const SHUT_MS = 260;
const RETURN_MS = 4200;
const RETURN_STAGGER_MS = 900;

type EyeState = 'open' | 'startled' | 'gone';
interface Eye { spot: number; state: EyeState; visits: number }

export const DeadEndScene: React.FC = () => {
  const [eyes, setEyes] = React.useState<Eye[]>(() =>
    WATCHERS.map(w => ({ spot: w.startSpot, state: 'open', visits: 0 })));
  const timers = React.useRef<Array<ReturnType<typeof setTimeout>>>([]);
  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const startle = (index: number) => {
    setEyes(prev => prev.map((e, i) => (i === index && e.state === 'open' ? { ...e, state: 'startled' } : e)));
    timers.current.push(setTimeout(() => {
      setEyes(prev => prev.map((e, i) => (i === index ? { ...e, state: 'gone' } : e)));
    }, SHUT_MS));
    timers.current.push(setTimeout(() => {
      setEyes(prev => {
        // The next spot round the list that nobody is watching from.
        const taken = new Set(prev.filter((_, i) => i !== index).map(e => e.spot));
        let spot = prev[index].spot;
        for (let step = 1; step <= ART.eyeSpots.length; step++) {
          const candidate = (prev[index].spot + step) % ART.eyeSpots.length;
          if (!taken.has(candidate)) { spot = candidate; break; }
        }
        return prev.map((e, i) => (i === index ? { spot, state: 'open', visits: e.visits + 1 } : e));
      });
    }, RETURN_MS + index * RETURN_STAGGER_MS));
  };

  return (
    <div
      className="dead-end"
      style={{ '--dead-end-w': ART.width, '--dead-end-h': ART.height } as React.CSSProperties}
    >
      <img className="dead-end-art" src={ART.url} alt="A collapsed dungeon corridor" draggable={false} />

      {ART.dust.map((d, i) => (
        <span
          key={i}
          className="dead-end-dust"
          aria-hidden="true"
          style={{ '--x': d.x, '--from': d.from, '--fall': d.to - d.from, '--i': i } as React.CSSProperties}
        />
      ))}

      {eyes.map((eye, i) => {
        if (eye.state === 'gone') return null;
        const watcher = WATCHERS[i];
        const [x, y] = ART.eyeSpots[eye.spot];
        const size = watcher.near ? 2 : 1;
        return (
          <button
            // A new key each visit restarts the opening animation.
            key={`${i}-${eye.visits}`}
            type="button"
            className={`dead-end-watcher${eye.state === 'startled' ? ' dead-end-watcher--startled' : ''}`}
            style={{
              '--x': x, '--y': y, '--size': size,
              '--eye': watcher.color,
              '--blink': `${watcher.blinkMs}ms`,
              '--phase': `${-i * 1300}ms`,
              '--open-delay': `${eye.visits === 0 ? 400 + i * 350 : 0}ms`,
            } as React.CSSProperties}
            onClick={() => startle(i)}
            disabled={eye.state !== 'open'}
            aria-label="Eyes in the dark"
          >
            <span className="dead-end-glow" aria-hidden="true" />
            <span className="dead-end-eyes" aria-hidden="true"><i /><i /></span>
          </button>
        );
      })}
    </div>
  );
};
