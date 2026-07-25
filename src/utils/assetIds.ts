/**
 * Authoring-time id generation for editor-created assets.
 *
 * Several editors minted ids as `prefix_${Date.now()}` with no random
 * component, so two assets created inside the same millisecond collided —
 * reachable by duplicating twice quickly, and by any scripted/bulk creation.
 * Sprite ids were the worst offender: an entity duplicate got a fresh id
 * while its sprite kept a timestamp-only one.
 *
 * These ids are authoring metadata, never part of the simulation, so the
 * impurity here does not touch the determinism guarantees the engine relies
 * on. Keeping the calls in this module also keeps them out of component
 * render scope, where the react-hooks/purity rule (rightly) objects.
 */

/** `prefix_<ms>_<9 random chars>` — matches the shape ids already stored. */
export function newAssetId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Convenience for the sprite attached to an asset. */
export function newSpriteId(): string {
  return newAssetId('sprite');
}
