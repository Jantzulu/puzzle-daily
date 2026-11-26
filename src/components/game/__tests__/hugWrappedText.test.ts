import { describe, expect, it } from 'vitest';
import { linesExtent } from '../hugWrappedText';

// The quest scroll hugs its text when the text wraps (hugWrappedText.ts).
// What can be pinned without a browser: how the lines' extent is read off
// their fragments.

const r = (left: number, right: number) => ({ left, right, width: right - left });

describe('the extent of wrapped lines', () => {
  it('runs from the leftmost fragment to the rightmost, whichever lines they are on', () => {
    // Two centred lines: the first longer than the second.
    expect(linesExtent([r(40, 300), r(70, 270)])).toBe(260);
    // A line in several fragments (an icon, then words).
    expect(linesExtent([r(40, 56), r(60, 300), r(90, 250)])).toBe(260);
  });

  it('ignores empty fragments, and is nothing when there is no text', () => {
    expect(linesExtent([r(500, 500), r(40, 300)])).toBe(260);
    expect(linesExtent([])).toBe(0);
    expect(linesExtent([r(10, 10)])).toBe(0);
  });
});
