/**
 * Case 01: basic melee spell (canonical attack path).
 *
 * Hero casts a MELEE-template spell at an adjacent enemy. Spell resolves
 * instantly — no projectile is spawned. Purpose: prove the harness handles
 * the SpellAsset code path and that MELEE damage application is deterministic.
 *
 * NOTE: MELEE spells resolve instantly (same turn as cast), no projectile
 * object involved. For projectile-path coverage, see case 02+.
 */
import {
  clearAllRegistries,
  registerTestCharacter,
  registerTestEnemy,
  registerTestSpell,
  createTestCharacterDef,
  createTestEnemyDef,
  createTestPuzzle,
  createTestEnemy,
  createTestGameState,
} from '../../helpers';
import { Direction, ActionType, SpellTemplate } from '../../../../types/game';
import type { CorpusCase } from '../types';

export const meleeAttackCase: CorpusCase = {
  id: '01-melee-attack',
  description: 'Hero casts MELEE spell, adjacent enemy dies in one hit',
  setup: () => {
    clearAllRegistries();

    // Minimal MELEE spell: 1-tile reach, 3 damage, uses caster's facing.
    // Sprite fields are all optional at runtime (only read for visuals); empty
    // object is fine for logic-only tests.
    registerTestSpell('slash', {
      id: 'slash',
      name: 'Slash',
      description: 'Basic melee',
      thumbnailIcon: '',
      templateType: SpellTemplate.MELEE,
      directionMode: 'current_facing',
      damage: 3,
      meleeRange: 1,
      sprites: {},
    });

    registerTestCharacter(
      createTestCharacterDef({
        id: 'hero-caster',
        health: 10,
        behavior: [{ type: ActionType.SPELL, spellId: 'slash' }],
      })
    );
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-weak', health: 3 }));

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 5,
        height: 5,
        enemies: [createTestEnemy({ enemyId: 'goblin-weak', x: 1, y: 0, currentHealth: 3 })],
        availableCharacters: ['hero-caster'],
        winConditions: [{ type: 'defeat_all_enemies' }],
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 0, y: 0, facing: Direction.EAST }],
  maxTurns: 10,
};
