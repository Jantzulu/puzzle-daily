// Which "Tap a hero / Tap an enemy for more info" chips the player has
// already acted on (user call 2026-10-19: once they've tapped a card the
// hint has done its job). Module state ON PURPOSE: it outlives route
// changes and re-mounts, and a page refresh brings the hints back.
type TapHintKind = 'hero' | 'enemy';

const seen = new Set<TapHintKind>();

export const isTapHintSeen = (kind: TapHintKind): boolean => seen.has(kind);

export const markTapHintSeen = (kind: TapHintKind): void => {
  seen.add(kind);
};
