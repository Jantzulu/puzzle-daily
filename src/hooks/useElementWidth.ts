import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * The live content-box width of one element, in CSS px (0 until measured).
 * Measured before paint on mount (layout effect) and kept current by a
 * ResizeObserver, so pixel-snapped overlays can place themselves on whole
 * pixels from the first frame instead of flashing at a fallback position.
 *
 * Returns a callback ref — attach it to the element to measure.
 */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  const lastRef = useRef(0);

  const ref = useCallback((node: T | null) => setEl(node), []);

  useLayoutEffect(() => {
    if (!el) return;
    const read = (sync: boolean) => {
      const w = el.clientWidth;
      if (w !== lastRef.current) {
        lastRef.current = w;
        // From the observer, commit before this frame paints: a plain
        // setState there lands a frame late, and the overlays would sit on
        // the old boundaries for one frame of every resize.
        if (sync) flushSync(() => setWidth(w));
        else setWidth(w);
      }
    };
    read(false);
    const ro = new ResizeObserver(() => read(true));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  return [ref, width];
}

/**
 * Boundaries of `count` equal slots across `width`, on the 2px ART GRID
 * (Z=2) anchored at the strip's left edge: b[0] = 0, b[count] = width,
 * b[i] = 2 * round(i * width / count / 2). Shared by the card strip's
 * posts, its selection caret and the selection shape, so all of them land
 * on the same whole art pixels (the slots themselves are fractional —
 * 353 / 3 = 117.67).
 */
export function slotBoundaries(width: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= count; i++) out.push(i === count ? width : 2 * Math.round((i * width) / count / 2));
  return out;
}
