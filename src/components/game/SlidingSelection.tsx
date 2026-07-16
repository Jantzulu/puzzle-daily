import React, { useEffect, useRef } from 'react';

interface SlidingSelectionProps {
  /** Number of equal-width slots in the strip (count of cards actually rendered). */
  slotCount: number;
  /** Index of the selected slot, or -1 for none. */
  selectedIndex: number;
  /** Ember glow color as "r, g, b" — copper for hero/ally strips, blood for enemies. */
  emberRgb: string;
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
export const SlidingSelection: React.FC<SlidingSelectionProps> = ({ slotCount, selectedIndex, emberRgb, caretClass }) => {
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
      {/* Ember bloom anchored at the card's BOTTOM-CENTER — the caret
          point where the info panel connects. Radial with the far stop
          inside the card, so there is no hard edge on ANY side (the flat
          rect and then the straight-sided gradient both read as a sliding
          box — user feedback, twice). Brightest at the strip/panel seam,
          where SelectionBloom answers it from below: one pool of light
          saying "this lit unit is what the panel describes." */}
      <div
        aria-hidden
        className={`absolute inset-y-0 left-0 pointer-events-none ${transition}`}
        style={{
          ...slotStyle,
          backgroundImage: `radial-gradient(120% 135% at 50% 100%, rgba(${emberRgb}, 0.28) 0%, rgba(${emberRgb}, 0.13) 42%, rgba(${emberRgb}, 0) 72%)`,
        }}
      />
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

/**
 * The answering half of the selection glow: a bloom at the TOP of the info
 * panel, positioned under the selected card with the same slot math and
 * the same always-on transition, so it glides in step with the card's
 * ember above. The two gradients meet at the caret line and read as one
 * pool of light connecting the unit to its attributes/behavior panel.
 * Render as the first child of the (position: relative) panel container;
 * returns null with nothing selected — the panel is closing then anyway.
 */
export const SelectionBloom: React.FC<{
  slotCount: number;
  selectedIndex: number;
  emberRgb: string;
}> = ({ slotCount, selectedIndex, emberRgb }) => {
  if (slotCount <= 0 || selectedIndex < 0) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 h-14 transition-transform duration-300 ease-out"
      style={{
        width: `${100 / slotCount}%`,
        transform: `translateX(${selectedIndex * 100}%)`,
        backgroundImage: `radial-gradient(90% 100% at 50% 0%, rgba(${emberRgb}, 0.22) 0%, rgba(${emberRgb}, 0.09) 55%, rgba(${emberRgb}, 0) 100%)`,
      }}
    />
  );
};
