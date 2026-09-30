import { useCallback, useLayoutEffect, useRef, useState } from 'react';

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
    const read = () => {
      const w = el.clientWidth;
      if (w !== lastRef.current) {
        lastRef.current = w;
        setWidth(w);
      }
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  return [ref, width];
}

/**
 * Whole-pixel boundaries of `count` equal slots across `width`:
 * b[0] = 0, b[count] = width, b[i] = round(i * width / count). Shared by the
 * card strip's dividers and its selection caret so both land on the same
 * pixels (the slots themselves are fractional — 353 / 3 = 117.67).
 */
export function slotBoundaries(width: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= count; i++) out.push(i === count ? width : Math.round((i * width) / count));
  return out;
}
