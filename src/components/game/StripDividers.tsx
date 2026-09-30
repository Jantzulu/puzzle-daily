import React from 'react';
import { slotBoundaries } from '../../hooks/useElementWidth';

interface StripDividersProps {
  /** Number of equal-width slots in the strip. */
  slotCount: number;
  /** Index of the selected slot, or -1 — the posts either side of it yield. */
  selectedIndex: number;
  /** The strip's measured width in CSS px (0 = not measured: nothing renders). */
  width: number;
}

/**
 * THE POSTS BETWEEN CARDS (2026-09-30) — they replace `divide-x`, a 1px CSS
 * rule (half an art pixel) that ran the full strip height, stopped dead on
 * the drawer's top edge, belonged to the card on its right (so it dimmed
 * with dead enemies) and matched nothing the user paints.
 *
 * A post is 2 art px wide (4 CSS px) on the same art-grid slot boundaries
 * the cards and the selection shape use, sitting in the 8px gutter between two cards'
 * padding. It floats — 8px clear of the strip top and 8px clear of the
 * seam — so it never T-junctions into the drawer. Drawn in the user's own
 * painted recipe as a placeholder: flat two-tone stock lit from the left
 * (like their gate bars), a lit cap row on top and a heavier row at the foot
 * (iron is bottom-heavy by one row). A painted 2x12 tile + caps can later
 * replace it at the same rectangle.
 *
 * The two posts beside the selected card yield (fade out): the selection
 * shape's outline separates it from its neighbours.
 *
 * One overlay per strip, laid UNDER the card row (render it BEFORE the row:
 * the cards are positioned, so tree order puts them on top). Anything a card
 * spills into the gutter — an enemy's count badge sits flush on the slot
 * edge, a stat line can outgrow a narrow slot — paints over the post, never
 * under it. Being outside the cards, the posts also ignore a card's opacity
 * (dead enemies, unselectable heroes).
 */
export const StripDividers: React.FC<StripDividersProps> = ({ slotCount, selectedIndex, width }) => {
  if (slotCount < 2 || width <= 0) return null;
  const b = slotBoundaries(width, slotCount);
  return (
    <div aria-hidden className="absolute inset-y-0 left-0 pointer-events-none" style={{ width }}>
      {b.slice(1, -1).map((x, k) => {
        const boundary = k + 1; // between slot boundary-1 and slot boundary
        const beside = selectedIndex >= 0 && (boundary === selectedIndex || boundary === selectedIndex + 1);
        return (
          <span
            key={boundary}
            className={`strip-post ${beside ? 'strip-post--yield' : ''}`}
            style={{ left: x - 2 }}
          />
        );
      })}
    </div>
  );
};
