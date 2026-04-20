/**
 * Case 09: slow homing projectile, straight-line visual path.
 *
 * Known-fragile path per CLAUDE_HANDOFF.md: slow homing (speed 1–2) has
 * historically had visual tracking issues, and the Phase C retro singled
 * out straight-line homing anchor-reset as a "separate, low-risk visual-
 * only change" worth doing independently. Target is stationary here, so
 * the test locks in current deterministic logical behavior; the visual
 * fragility is a separate concern that doesn't affect `resolveProjectiles`.
 *
 * Hero has WAIT actions to stay active for multi-turn traversal (same
 * pattern as case 05).
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

export const homingStraightSlowCase: CorpusCase = {
  id: '09-homing-straight-slow',
  description: 'Slow homing bolt (speed 1, straight path) lands on stationary enemy across multiple turns',
  setup: () => {
    clearAllRegistries();

    registerTestSpell('slow-homing-bolt', {
      id: 'slow-homing-bolt',
      name: 'Slow Homing Bolt',
      description: 'LINEAR projectile, speed 1, homing',
      thumbnailIcon: '',
      templateType: SpellTemplate.LINEAR,
      directionMode: 'current_facing',
      damage: 3,
      range: 6,
      projectileSpeed: 1,
      sprites: {},
    });

    registerTestCharacter(
      createTestCharacterDef({
        id: 'hero-caster',
        health: 10,
        behavior: [
          {
            type: ActionType.SPELL,
            spellId: 'slow-homing-bolt',
            autoTargetNearestEnemy: true,
            homing: true,
            homingPathStyle: 'straight',
          },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
          { type: ActionType.WAIT },
        ],
      })
    );
    registerTestEnemy(createTestEnemyDef({ id: 'goblin-weak', health: 3 }));

    return createTestGameState({
      puzzle: createTestPuzzle({
        width: 8,
        height: 5,
        enemies: [createTestEnemy({ enemyId: 'goblin-weak', x: 3, y: 1, currentHealth: 3 })],
        availableCharacters: ['hero-caster'],
        winConditions: [{ type: 'defeat_all_enemies' }],
      }),
      gameStatus: 'setup',
    });
  },
  placements: [{ characterId: 'hero-caster', x: 0, y: 0, facing: Direction.EAST }],
  maxTurns: 12,
};
