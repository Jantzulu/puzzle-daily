import type { PlacedObject } from '../types/game';

// Visibility rule for scheduled decoration objects (object spawn levers,
// 2026-07-21). Pure integer math on the current turn so the game board,
// replays, and any future preview UI can never disagree.
//
// Timeline semantics (matches scheduled visitors): setup is turn 0 and
// executeTurn increments at dawn, so `spawnTurn: 3` first shows the moment
// turn 3 begins. `despawnTurn` is exclusive — the object is gone at that
// dawn. `repeatEvery` repeats the [spawnTurn, despawnTurn) window on a
// cadence; it needs a bounded window to mean anything and is ignored
// without a valid despawnTurn. A despawnTurn at or before spawnTurn is
// treated as unset rather than hiding the object forever — the editor
// prevents authoring it, but stale data should fail visible, not vanish.
export function isPlacedObjectVisible(obj: PlacedObject, currentTurn: number): boolean {
  const spawn = obj.spawnTurn ?? 0;
  if (currentTurn < spawn) return false;
  const despawn = obj.despawnTurn;
  if (despawn === undefined || despawn <= spawn) return true;
  const repeat = obj.repeatEvery;
  if (repeat === undefined || repeat < 1) return currentTurn < despawn;
  return (currentTurn - spawn) % repeat < despawn - spawn;
}
