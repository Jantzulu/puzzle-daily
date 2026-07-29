import type { Character, Direction, SpellAsset } from '../types/game';
import { loadSpellAsset } from './assetStorage';

/**
 * Player direction input during setup — the single source for "which choices
 * must the player make before this hero can be placed" and which directions
 * each compass offers. Four call sites must agree (CharacterSelector's
 * compass UI, the placement gates in Game/TrainingGrounds, and the solver's
 * permutation) — they all route through here.
 */

export const ALL_COMPASS_DIRECTIONS: Direction[] = [
  'north', 'northeast', 'east', 'southeast',
  'south', 'southwest', 'west', 'northwest',
] as Direction[];

/** Normalize an authored allowed-subset: unset/empty/garbage-only = all 8. */
function normalizeAllowed(allowed: Direction[] | undefined): Direction[] {
  const valid = (allowed ?? []).filter(d => ALL_COMPASS_DIRECTIONS.includes(d));
  return valid.length > 0 ? valid : ALL_COMPASS_DIRECTIONS;
}

/** Directions the facing compass offers for this hero. */
export function allowedFacingDirections(character: Character): Direction[] {
  return normalizeAllowed(character.allowedFacingDirections);
}

/** Directions this spell's compass offers (aim or redirect input alike). */
export function allowedSpellDirections(spell: SpellAsset): Direction[] {
  return normalizeAllowed(spell.allowedInputDirections);
}

/**
 * Spells whose direction the player chooses: redirect spells with
 * redirectAcceptsUserInput (the input aims the target's NEW facing) and any
 * other spell with directionAcceptsUserInput (the input aims the cast
 * direction). Both store their choice in spellDirectionOverrides.
 */
export function getDirectionInputSpells(character: Character | null | undefined): SpellAsset[] {
  if (!character) return [];
  return character.behavior
    .filter(a => a.type === 'spell' && a.spellId)
    .map(a => loadSpellAsset(a.spellId!))
    .filter((s): s is SpellAsset => !!s && (
      (s.templateType === 'redirect' && !!s.redirectAcceptsUserInput) ||
      (s.templateType !== 'redirect' && !!s.directionAcceptsUserInput)
    ));
}

/**
 * Caption shown above a compass (and named in the placement-gate warning).
 * Always the spell's display name — "spell" is internal vocabulary (a sword
 * swing is a "spell" to the engine), but the asset name is thematically
 * right by construction: "Cleave Direction", "Fireball Direction".
 */
export function spellDirectionCaption(spell: SpellAsset): string {
  return `${spell.name} Direction`;
}

export const FACING_CAPTION = 'Facing Direction';

/**
 * Captions for the inputs the player has NOT yet chosen for this hero.
 * Empty array = free to place. A stored choice OUTSIDE the allowed subset
 * counts as not chosen (covers a creator narrowing the subset after a
 * recovered setup stored the old choice).
 */
export function getMissingDirectionInputs(
  character: Character,
  pendingFacing: Direction | undefined,
  pendingSpellOverrides: Record<string, Direction> | undefined
): string[] {
  const missing: string[] = [];
  if (character.facingAcceptsUserInput
      && !(pendingFacing && allowedFacingDirections(character).includes(pendingFacing))) {
    missing.push(FACING_CAPTION);
  }
  const inputSpells = getDirectionInputSpells(character);
  for (const spell of inputSpells) {
    const choice = pendingSpellOverrides?.[spell.id];
    if (!(choice && allowedSpellDirections(spell).includes(choice))) {
      missing.push(spellDirectionCaption(spell));
    }
  }
  return missing;
}
