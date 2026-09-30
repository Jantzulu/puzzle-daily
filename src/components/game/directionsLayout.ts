/**
 * ON-DEVICE COMPARISON SWITCH (temporary, 2026-09-30) — where a hero's
 * direction inputs live in the hero panel. Same idea as `?cardscale`: flip
 * the layout with a reload instead of a rebuild, so the options can be
 * judged on a real phone against real heroes.
 *
 *   (no flag)          'column'  the shipped layout: Actions | Directions | Attributes
 *   ?directions=rail   'rail'    phones only: Directions keeps its look but sits at
 *                                the right edge, Actions stacked above Attributes
 *                                beside it (640px and up stays 'column')
 *   ?directions=card   'card'    Directions leaves the drawer; an aim plate on the
 *                                hero card opens the picker sheet, which carries
 *                                one tab per choice
 *
 * Read once at module load; anything else falls back to 'column'. Delete this
 * file and the losing branches once one layout wins.
 */
export type DirectionsLayout = 'column' | 'rail' | 'card';

function readDirectionsLayout(): DirectionsLayout {
  try {
    const raw = new URLSearchParams(window.location.search).get('directions');
    return raw === 'rail' || raw === 'card' ? raw : 'column';
  } catch {
    return 'column'; // no window (tests) or malformed URL — the shipped layout wins
  }
}

export const DIRECTIONS_LAYOUT: DirectionsLayout = readDirectionsLayout();
