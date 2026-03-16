/**
 * Combat Log — diffs two GameState snapshots to produce human-readable turn events.
 * No modifications to simulation.ts needed; works by comparing before/after states.
 */
import type { GameState, PlacedCharacter, PlacedEnemy, PlacedCollectible } from '../types/game';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { loadCollectible } from '../utils/assetStorage';

export type LogEventType = 'move' | 'damage' | 'death' | 'collect' | 'spell' | 'status' | 'game';

export interface CombatLogEntry {
  turn: number;
  type: LogEventType;
  icon: string;
  text: string;
}

/** Get display name for a character */
function charName(id: string): string {
  return getCharacter(id)?.name || id;
}

/** Get display name for an enemy */
function enemyName(id: string): string {
  return getEnemy(id)?.name || id;
}

/**
 * Diff two game states and produce log entries for a single turn.
 */
export function diffTurn(before: GameState, after: GameState): CombatLogEntry[] {
  const entries: CombatLogEntry[] = [];
  const turn = after.currentTurn;

  // --- Character events ---
  for (const charAfter of after.placedCharacters) {
    const charBefore = before.placedCharacters.find(c => c.characterId === charAfter.characterId && c.x === charAfter.x && c.y === charAfter.y)
      || before.placedCharacters.find(c => c.characterId === charAfter.characterId);
    if (!charBefore) continue;
    const name = charName(charAfter.characterId);

    // Movement
    if (charBefore.x !== charAfter.x || charBefore.y !== charAfter.y) {
      if (!charAfter.dead) {
        entries.push({ turn, type: 'move', icon: '\u27A1', text: `${name} moved to (${charAfter.x + 1}, ${charAfter.y + 1})` });
      }
    }

    // Damage taken
    if (charAfter.currentHealth < charBefore.currentHealth) {
      const dmg = charBefore.currentHealth - charAfter.currentHealth;
      entries.push({ turn, type: 'damage', icon: '\uD83D\uDCA5', text: `${name} took ${dmg} damage (${charAfter.currentHealth} HP left)` });
    }

    // Healing
    if (charAfter.currentHealth > charBefore.currentHealth) {
      const heal = charAfter.currentHealth - charBefore.currentHealth;
      entries.push({ turn, type: 'status', icon: '\uD83D\uDC9A', text: `${name} healed ${heal} HP (${charAfter.currentHealth} HP)` });
    }

    // Death
    if (!charBefore.dead && charAfter.dead) {
      entries.push({ turn, type: 'death', icon: '\uD83D\uDC80', text: `${name} was defeated` });
    }
  }

  // --- Enemy events ---
  const beforeEnemies = before.puzzle.enemies;
  const afterEnemies = after.puzzle.enemies;

  for (let i = 0; i < afterEnemies.length; i++) {
    const eBefore = beforeEnemies[i];
    const eAfter = afterEnemies[i];
    if (!eBefore || !eAfter) continue;
    const name = enemyName(eAfter.enemyId);

    // Movement
    if (eBefore.x !== eAfter.x || eBefore.y !== eAfter.y) {
      if (!eAfter.dead) {
        entries.push({ turn, type: 'move', icon: '\u27A1', text: `${name} moved to (${eAfter.x + 1}, ${eAfter.y + 1})` });
      }
    }

    // Damage taken
    if (eAfter.currentHealth < eBefore.currentHealth) {
      const dmg = eBefore.currentHealth - eAfter.currentHealth;
      entries.push({ turn, type: 'damage', icon: '\u2694', text: `${name} took ${dmg} damage (${eAfter.currentHealth} HP left)` });
    }

    // Death
    if (!eBefore.dead && eAfter.dead) {
      entries.push({ turn, type: 'death', icon: '\u2620', text: `${name} was defeated!` });
    }
  }

  // --- Collectible events ---
  const beforeColls = before.puzzle.collectibles;
  const afterColls = after.puzzle.collectibles;

  for (let i = 0; i < afterColls.length; i++) {
    const cBefore = beforeColls[i];
    const cAfter = afterColls[i];
    if (!cBefore || !cAfter) continue;

    if (!cBefore.collected && cAfter.collected) {
      const collDef = cAfter.collectibleId ? loadCollectible(cAfter.collectibleId) : null;
      const collName = collDef?.name || 'item';
      entries.push({ turn, type: 'collect', icon: '\uD83D\uDC8E', text: `Collected ${collName} at (${cAfter.x + 1}, ${cAfter.y + 1})` });
    }
  }

  // --- Projectile events ---
  const beforeProjectiles = before.activeProjectiles?.length || 0;
  const afterProjectiles = after.activeProjectiles?.length || 0;
  if (afterProjectiles > beforeProjectiles) {
    const newCount = afterProjectiles - beforeProjectiles;
    entries.push({ turn, type: 'spell', icon: '\u2728', text: `${newCount} projectile${newCount > 1 ? 's' : ''} launched` });
  }

  // --- Game status events ---
  if (before.gameStatus !== after.gameStatus) {
    if (after.gameStatus === 'victory') {
      entries.push({ turn, type: 'game', icon: '\uD83C\uDFC6', text: 'Victory!' });
    } else if (after.gameStatus === 'defeat') {
      entries.push({ turn, type: 'game', icon: '\uD83D\uDEAB', text: 'Defeat' });
    }
  }

  // If nothing notable happened, add a quiet turn entry
  if (entries.length === 0) {
    entries.push({ turn, type: 'game', icon: '\u23F3', text: 'No notable events' });
  }

  return entries;
}

/** Style classes for each event type */
export const logTypeStyles: Record<LogEventType, string> = {
  move: 'text-blue-300',
  damage: 'text-red-300',
  death: 'text-red-400 font-semibold',
  collect: 'text-yellow-300',
  spell: 'text-purple-300',
  status: 'text-green-300',
  game: 'text-amber-300 font-semibold',
};
