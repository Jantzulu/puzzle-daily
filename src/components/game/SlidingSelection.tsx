import React, { useState } from 'react';
import { slotBoundaries } from '../../hooks/useElementWidth';

interface SlidingSelectionProps {
  /** Number of equal-width slots in the strip (count of cards actually rendered). */
  slotCount: number;
  /** Index of the selected slot, or -1 for none. */
  selectedIndex: number;
  /** Tailwind text class for the caret, e.g. 'text-copper-400'. */
  caretClass: string;
  /**
   * The strip's measured width in CSS px (useElementWidth on the same
   * `relative` wrapper). 0 = not measured yet: nothing renders.
   */
  width: number;
}

// The caret: a stepped chevron on the 2px art grid — 8x4 art px, a flat
// 2-art apex and a 1:1 stair, the same slope as the quest box's ornament and
// the play frame's finials. It replaced a smooth vector triangle whose 7:8
// slope sat on no pixel grid (2026-09-30).
const CARET_W = 16;
const CARET_H = 8;
const CARET_PATH = 'M6 0h4v2h2v2h2v2h2v2H0V6h2V4h2V2h2z';

/**
 * Sliding selection caret for an equal-width card strip: the up-pointing
 * caret straddling the strip's bottom edge (half above, half below, into the
 * drawer), gliding from the previous selection to the new one instead of
 * snapping. Transform/opacity only — the page-decoration rendering rule
 * (never animate layout, filters, or geometry). The selection TINT is
 * deliberately NOT here — it lives on the cards and crossfades (see the
 * design record below).
 *
 * Render as the first child of a `relative` wrapper around the strip, and
 * pass that wrapper's measured width. At rest the caret sits on the 2px ART
 * GRID (centred on its slot between the same boundaries the strip's posts
 * use), so the stepped shape stays crisp; it glides by transform.
 */
export const SlidingSelection: React.FC<SlidingSelectionProps> = ({ slotCount, selectedIndex, caretClass, width }) => {
  // The last slot that was actually SHOWN. Updated only while something is
  // selected: re-renders while nothing is selected used to overwrite it with
  // -1 (parking the caret on slot 0), so a deselect drifted toward the first
  // card as it faded and a select-from-none flew in from the first card.
  // (State adjusted during render — React's pattern for "remember the last
  // prop value", with no ref read in render.)
  const [lastShown, setLastShown] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  if (selectedIndex >= 0 && selectedIndex !== lastShown) setLastShown(selectedIndex);

  if (slotCount <= 0 || width <= 0) return null;

  const visible = selectedIndex >= 0;
  // While fading out, hold the last shown slot so the exit happens in place.
  const anchor = Math.min(visible ? selectedIndex : lastShown, slotCount - 1);
  const b = slotBoundaries(width, slotCount);
  // Left edge on the 2px art grid, as near the slot's centre as the grid allows.
  const x = 2 * Math.round(((b[anchor] + b[anchor + 1]) / 2 - CARET_W / 2) / 2);

  // The transition is UNCONDITIONAL. The first version enabled the
  // transform transition only on the render that changed the selection —
  // but the strips re-render again immediately (the info panel's
  // open/render state cascades right behind the selection change), which
  // flipped the class back and CANCELLED the in-flight slide, so switches
  // snapped. With the classes constant, no re-render can kill the motion.
  // Select-from-none simply fades in while gliding from the last shown
  // slot — continuity, not a glitch (the caret is transparent as it starts).
  return (
    <>
      {/* Design record (2026-07-16, four iterations with the user): the
          selection TINT deliberately does NOT slide. A flat rect read as
          a sliding box; soft-sided, bloom-pair, and seam-straddling
          gradients each traded one artifact for another. The resolution:
          the tint lives back on the cards themselves — flat, exactly
          matching the info panel's wash (one seamless "this unit → these
          attributes" surface, the original approved look) — and
          crossfades between cards via their transition-colors. Only the
          CARET glides, because it has no bounds to expose. Do not
          reintroduce a moving highlight rectangle here. */}
      {/* KEYED BY GEOMETRY: a resize, a rotation or a slot count change
          (a summon adding an ally card mid-run) remounts the caret already
          at its new x, so it moves WITH the cards. Kept, the px transform
          would change and the 300ms glide would trail the cards across the
          strip. Selection changes keep the key, so they still glide. */}
      <div
        key={`${width}:${slotCount}`}
        aria-hidden
        className="absolute bottom-0 left-0 z-10 pointer-events-none transition-[transform,opacity] duration-300 ease-out"
        style={{ transform: `translateX(${x}px)`, opacity: visible ? 1 : 0 }}
      >
        <svg
          width={CARET_W}
          height={CARET_H}
          viewBox={`0 0 ${CARET_W} ${CARET_H}`}
          shapeRendering="crispEdges"
          className={`block ${caretClass}`}
          style={{ transform: 'translateY(50%)' }}
        >
          <path d={CARET_PATH} fill="currentColor" />
        </svg>
      </div>
    </>
  );
};
