// Moved out of DirectionPicker.tsx (2026-10-18 delint): a component file
// that also exports plain values breaks React Fast Refresh.

/**
 * Compass initials for compact readouts (the hero drawer's note line lists
 * every choice on one wrapping line; NORTHWEST three times over would not
 * fit). The full bearing stays in this picker's cap row and in aria labels.
 */
export const BEARING_INITIALS: Record<string, string> = {
  north: 'N', northeast: 'NE', east: 'E', southeast: 'SE',
  south: 'S', southwest: 'SW', west: 'W', northwest: 'NW',
};
