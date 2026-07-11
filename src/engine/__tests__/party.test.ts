import { describe, it, expect } from 'vitest';
import { entityParty, effectiveParty, areHostile, isEntityCharmed, isAttackTarget } from '../party';
import { StatusEffectType, Direction } from '../../types/game';
import type { GameState, PlacedCharacter, PlacedEnemy, StatusEffectInstance } from '../../types/game';

// Minimal state: party derivation only reads puzzle.enemies.
function stateWithEnemies(enemyIds: string[]): GameState {
  return {
    puzzle: {
      enemies: enemyIds.map(id => makeEnemy(id)),
    },
  } as unknown as GameState;
}

function makeEnemy(enemyId: string, extra: Partial<PlacedEnemy> = {}): PlacedEnemy {
  return { enemyId, x: 0, y: 0, currentHealth: 3, dead: false, ...extra };
}

function makeCharacter(characterId: string, extra: Partial<PlacedCharacter> = {}): PlacedCharacter {
  return {
    characterId,
    x: 1,
    y: 1,
    facing: Direction.EAST,
    currentHealth: 3,
    actionIndex: 0,
    active: true,
    dead: false,
    ...extra,
  };
}

function charm(): StatusEffectInstance {
  return {
    id: 'charm_1',
    type: StatusEffectType.CHARM,
    statusAssetId: 'charm_asset',
    duration: 3,
    appliedOnTurn: 0,
  };
}

describe('entityParty — structural defaults (all existing content)', () => {
  it('a placed character is hero-party', () => {
    const gs = stateWithEnemies(['goblin']);
    expect(entityParty(makeCharacter('knight'), gs)).toBe('hero');
  });

  it('a placed enemy is enemy-party', () => {
    const gs = stateWithEnemies(['goblin']);
    expect(entityParty(makeEnemy('goblin'), gs)).toBe('enemy');
  });

  it('an enemy WRAPPED as a character (characterId = enemyId) stays enemy-party', () => {
    // Enemy casters run the shared action code wrapped as PlacedCharacter —
    // the structural lookup must see through the disguise, as the old
    // inline derivation did.
    const gs = stateWithEnemies(['goblin']);
    expect(entityParty(makeCharacter('goblin'), gs)).toBe('enemy');
  });
});

describe('entityParty — explicit override (summons / allies / necromancy)', () => {
  it('explicit party beats the structural default', () => {
    const gs = stateWithEnemies(['royal-guard']);
    // An Ally: lives in the enemies array, fights for the heroes.
    expect(entityParty(makeEnemy('royal-guard', { party: 'hero' }), gs)).toBe('hero');
    // A hero-shaped entity flipped to the enemy side.
    expect(entityParty(makeCharacter('traitor', { party: 'enemy' }), gs)).toBe('enemy');
  });

  it('explicit party survives the caster wrapper', () => {
    const gs = stateWithEnemies(['royal-guard']);
    // Wrap sites copy `party` through — a hero-party ally acting via the
    // wrapper must not be mistaken for an enemy by the id lookup.
    expect(entityParty(makeCharacter('royal-guard', { party: 'hero' }), gs)).toBe('hero');
  });
});

describe('effectiveParty — charm inverts on top', () => {
  it('charmed hero fights for the enemy; charmed enemy fights for heroes', () => {
    const gs = stateWithEnemies(['goblin']);
    expect(effectiveParty(makeCharacter('knight', { statusEffects: [charm()] }), gs)).toBe('enemy');
    expect(effectiveParty(makeEnemy('goblin', { statusEffects: [charm()] }), gs)).toBe('hero');
  });

  it('charm inverts the EXPLICIT party too', () => {
    const gs = stateWithEnemies(['royal-guard']);
    expect(effectiveParty(makeEnemy('royal-guard', { party: 'hero', statusEffects: [charm()] }), gs)).toBe('enemy');
  });

  it('charm never touches the base party', () => {
    const gs = stateWithEnemies(['goblin']);
    const charmed = makeEnemy('goblin', { statusEffects: [charm()] });
    expect(entityParty(charmed, gs)).toBe('enemy'); // base unchanged
    expect(isEntityCharmed(charmed)).toBe(true);
  });
});

describe('areHostile', () => {
  it('hero vs enemy are hostile; same party is not', () => {
    const gs = stateWithEnemies(['goblin']);
    const knight = makeCharacter('knight');
    const goblin = makeEnemy('goblin');
    expect(areHostile(knight, goblin, gs)).toBe(true);
    expect(areHostile(knight, makeCharacter('mage'), gs)).toBe(false);
  });

  it('an ally (enemy-shaped, hero-party) is NOT hostile to heroes', () => {
    const gs = stateWithEnemies(['royal-guard', 'goblin']);
    const ally = makeEnemy('royal-guard', { party: 'hero' });
    expect(areHostile(makeCharacter('knight'), ally, gs)).toBe(false);
    expect(areHostile(ally, makeEnemy('goblin'), gs)).toBe(true);
  });
});

describe('isAttackTarget — the charm asymmetry (caster effective, target base)', () => {
  it('a hero can still strike a charmed enemy (its charm is ignored on the target side)', () => {
    const gs = stateWithEnemies(['goblin']);
    const charmedGoblin = makeEnemy('goblin', { statusEffects: [charm()] });
    // areHostile says "same side this turn" — but the old list-based
    // targeting let heroes hit charmed enemies, and that must not change.
    expect(areHostile(makeCharacter('knight'), charmedGoblin, gs)).toBe(false);
    expect(isAttackTarget(makeCharacter('knight'), charmedGoblin, gs)).toBe(true);
  });

  it('a charmed enemy strikes its own base side, including other charmed enemies', () => {
    const gs = stateWithEnemies(['goblin', 'orc']);
    const charmedGoblin = makeEnemy('goblin', { statusEffects: [charm()] });
    expect(isAttackTarget(charmedGoblin, makeEnemy('orc'), gs)).toBe(true);
    expect(isAttackTarget(charmedGoblin, makeEnemy('orc', { statusEffects: [charm()] }), gs)).toBe(true);
    expect(isAttackTarget(charmedGoblin, makeCharacter('knight'), gs)).toBe(false);
  });

  it('same base party is never a target when nobody is charmed', () => {
    const gs = stateWithEnemies(['goblin']);
    expect(isAttackTarget(makeCharacter('knight'), makeCharacter('mage'), gs)).toBe(false);
    expect(isAttackTarget(makeEnemy('goblin'), makeEnemy('goblin'), gs)).toBe(false);
  });

  it('a hero-party summon living in puzzle.enemies is a target for enemies, not heroes', () => {
    const gs = stateWithEnemies(['skeleton', 'goblin']);
    const summon = makeEnemy('skeleton', { party: 'hero' });
    expect(isAttackTarget(makeEnemy('goblin'), summon, gs)).toBe(true);
    expect(isAttackTarget(makeCharacter('knight'), summon, gs)).toBe(false);
    expect(isAttackTarget(summon, makeEnemy('goblin'), gs)).toBe(true);
  });
});
