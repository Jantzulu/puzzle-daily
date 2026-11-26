import { useCallback, useEffect, useRef } from 'react';

// ============================================================================
// A BOX THAT HUGS TEXT THAT HAS WRAPPED
// ============================================================================
// User, 2026-11-25, of the quest scroll: "Sometimes, the width of the scroll
// does not seem to match the text, as in the text goes to a second line, but
// the width of the scroll is the max width, leaving a huge space between the
// text and the end of the scroll."
//
// That is how CSS sizes a box to its text: a box told to fit its content
// (the scroll is `w-fit`) is as wide as the text would be on ONE line, or as
// wide as there is room for, whichever is less. The moment the text needs a
// second line the box is at "as wide as there is room for", and the lines,
// which `text-wrap: balance` then evens out, are both well short of it.
// There is no CSS for "as wide as the longest line after wrapping".
//
// So it is measured: lay the text out with no limit, read where its lines
// actually begin and end, and give the element that as its max-width. The
// wrap cannot change when that is applied (every line already fits in it),
// so it settles in one pass.

/** The extent of a set of line fragments: from the leftmost edge to the rightmost (0 if there are none). */
export function linesExtent(rects: readonly { left: number; right: number; width: number }[]): number {
  let left = Infinity;
  let right = -Infinity;
  for (const r of rects) {
    if (!(r.width > 0)) continue;
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
  }
  return right > left ? right - left : 0;
}

/**
 * Give this to the element that holds the wrapping text (as its `ref`). The
 * element is kept no wider than its longest line: measured when it mounts,
 * when its text changes, when the window changes size and when the fonts
 * arrive.
 */
export function useHugWrappedText<T extends HTMLElement>(): (el: T | null) => void {
  const elRef = useRef<T | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const attach = useCallback((el: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    elRef.current = el;
    if (!el) return;

    const measure = () => {
      el.style.maxWidth = '';
      const box = el.getBoundingClientRect();
      const laidOut = el.offsetWidth;
      if (!laidOut || !box.width) return;
      // The scroll may be drawn smaller than it is laid out (the minimized
      // quest is at half size, by a transform): rects are in drawn px.
      const scale = box.width / laidOut;
      const range = document.createRange();
      range.selectNodeContents(el);
      const extent = linesExtent(Array.from(range.getClientRects())) / scale;
      // (One px to spare: a line that fits to the hundredth of a pixel must not wrap again.)
      if (extent > 0 && extent + 1 < laidOut) el.style.maxWidth = `${Math.ceil(extent) + 1}px`;
    };

    measure();
    // Its text changes as the puzzle is played (the counts in "Defeat the Bats (2)").
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    window.addEventListener('resize', measure);
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) measure(); });
    cleanupRef.current = () => {
      alive = false;
      mo.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => () => { cleanupRef.current?.(); }, []);
  return attach;
}
