import type { GameState, PlacedCharacter, PlacedEnemy, EntityParty } from '../types/game';
import { StatusEffectType } from '../types/game';

// ============================================================================
// PARTY MODEL — who fights for whom
// ============================================================================
// Foundation for summons / allies / necromancy (docs/feature-backlog.md).
// Team membership used to be derived structurally at every callsite
// (placedCharacters = heroes, puzzle.enemies = enemies, with charm XORed in
// ad hoc). These helpers centralize the derivation and let an explicit
// `party` field override the structural default.
//
// IMPORTANT SEMANTICS, preserved exactly from the pre-refactor code:
//  - Enemy casters are WRAPPED as PlacedCharacter objects (characterId =
//    enemyId, built field-by-field in simulation.ts) before running the
//    shared action code, so an entity's SHAPE cannot identify its team.
//    The structural fallback therefore matches the historical check: an
//    entity is enemy-party iff its id appears in puzzle.enemies. Wrap sites
//    must copy `party` through (they do — see tempCharForTrigger).
//  - Charm is a TEMPORARY inversion applied on top of the base party, never
//    written into the field. `entityParty` answers "whose side are you on,
//    really"; `effectiveParty` answers "whose side are you fighting for
//    this turn".
// Determinism: pure functions of game state, no clocks, no randomness.

export type CombatEntity = PlacedCharacter | PlacedEnemy;

/** Charmed entities temporarily fight for the other side. */
export function isEntityCharmed(entity: CombatEntity): boolean {
  if (!entity.statusEffects) return false;
  return entity.statusEffects.some(e => e.type === StatusEffectType.CHARM);
}

/** The entity's id in the shared identity space the engine already uses
 *  (enemy wrappers carry their enemyId as characterId). */
function combatId(entity: CombatEntity): string {
  return 'enemyId' in entity ? entity.enemyId : entity.characterId;
}

/**
 * Base party: the explicit field when set (summons/allies/necromancy),
 * else the structural default — enemy-party iff the id lives in
 * puzzle.enemies. Identical to the historical derivation for all existing
 * content, where the field is always absent.
 */
export function entityParty(entity: CombatEntity, gameState: GameState): EntityParty {
  if (entity.party) return entity.party;
  const id = combatId(entity);
  return gameState.puzzle.enemies.some(e => e.enemyId === id) ? 'enemy' : 'hero';
}

/** Base party with charm's temporary inversion applied. */
export function effectiveParty(entity: CombatEntity, gameState: GameState): EntityParty {
  const base = entityParty(entity, gameState);
  if (!isEntityCharmed(entity)) return base;
  return base === 'hero' ? 'enemy' : 'hero';
}

/** Do these two currently fight for opposing sides? */
export function areHostile(a: CombatEntity, b: CombatEntity, gameState: GameState): boolean {
  return effectiveParty(a, gameState) !== effectiveParty(b, gameState);
}
