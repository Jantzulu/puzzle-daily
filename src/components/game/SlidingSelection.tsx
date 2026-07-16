import React, { useEffect, useRef } from 'react';

interface SlidingSelectionProps {
  /** Number of equal-width slots in the strip (count of cards actually rendered). */
  slotCount: number;
  /** Index of the selected slot, or -1 for none. */
  selectedIndex: number;
  /** Tailwind bg class for the slot tint, e.g. 'bg-copper-900/15'. */
  tintClass: string;
  /** Tailwind text class for the caret, e.g. 'text-copper-400'. */
  caretClass: string;
}

/**
 * Sliding selection indicator for an equal-width card strip: a slot-sized
 * highlight tint plus the up-pointing caret straddling the strip's bottom
 * edge, both translating smoothly from the previous selection to the new one
 * instead of snapping. Transform/opacity only — the page-decoration
 * rendering rule (never animate layout, filters, or geometry).
 *
 * Render as the first child of a `relative` wrapper around the strip; the
 * cards paint above the tint because they are positioned later in the DOM,
 * so the tint shows through their transparent backgrounds exactly like the
 * old per-card bg did. Width and translateX are both in slot units (the
 * element is one slot wide, so translateX(100%) is one slot over), keeping
 * the math free of pixel measurement.
 *
 * Selecting from nothing fades in at the target slot (no cross-strip swoop
 * from a stale position); deselecting fades out in place.
 */
export const SlidingSelection: React.FC<SlidingSelectionProps> = ({ slotCount, selectedIndex, tintClass, caretClass }) => {
  const lastIndexRef = useRef(selectedIndex);
  const prev = lastIndexRef.current;
  useEffect(() => { lastIndexRef.current = selectedIndex; });

  if (slotCount <= 0) return null;

  const visible = selectedIndex >= 0;
  // While fading out, hold the last selected slot so the exit happens in place.
  const anchor = visible ? selectedIndex : prev >= 0 ? prev : 0;
  // The transition is UNCONDITIONAL. The first version enabled the
  // transform transition only on the render that changed the selection —
  // but the strips re-render again immediately (the info panel's
  // open/render state cascades right behind the selection change), which
  // flipped the class back and CANCELLED the in-flight slide, so switches
  // snapped. With the classes constant, no re-render can kill the motion.
  // Select-from-none simply fades in while gliding from the last anchor —
  // continuity, not a glitch (the overlay is transparent when it starts).
  const transition = 'transition-[transform,opacity] duration-300 ease-out';
  const slotStyle: React.CSSProperties = {
    width: `${100 / slotCount}%`,
    transform: `translateX(${anchor * 100}%)`,
    opacity: visible ? 1 : 0,
  };

  return (
    <>
      <div aria-hidden className={`absolute inset-y-0 left-0 pointer-events-none ${tintClass} ${transition}`} style={slotStyle} />
      <div aria-hidden className={`absolute bottom-0 left-0 z-10 pointer-events-none ${transition}`} style={slotStyle}>
        {/* Same caret the cards used to own: centered in the slot, half
            below the strip edge so it straddles into the info area. */}
        <svg
          width="14" height="8" viewBox="0 0 14 8" fill="currentColor"
          className={`mx-auto block ${caretClass}`}
          style={{ transform: 'translateY(50%)' }}
        >
          <path d="M7 0L14 8H0z" />
        </svg>
      </div>
    </>
  );
};
