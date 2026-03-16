import type { Puzzle, TileType } from '../types/game';
import { getEnemy } from '../data/enemies';
import { loadTileType } from './assetStorage';

/**
 * Analyze puzzle content and suggest appropriate tags.
 * Returns tags the creator can accept/reject.
 */
export function suggestTags(puzzle: Puzzle): string[] {
  const suggestions = new Set<string>();

  // --- Grid size ---
  const area = puzzle.width * puzzle.height;
  if (area <= 25) suggestions.add('small');
  if (area >= 100) suggestions.add('large');

  // --- Enemy analysis ---
  if (puzzle.enemies.length > 0) {
    suggestions.add('combat');

    let hasBoss = false;
    let hasActive = false;
    for (const pe of puzzle.enemies) {
      const enemy = getEnemy(pe.enemyId);
      if (enemy) {
        if (enemy.health >= 20) hasBoss = true;
        if (pe.active || enemy.behavior?.pattern?.length) hasActive = true;
      }
    }
    if (hasBoss) suggestions.add('boss');
    if (hasActive) suggestions.add('active-enemies');
  }

  if (puzzle.enemies.length === 0) {
    suggestions.add('no-combat');
  }

  // --- Tile analysis ---
  const tileTypeIds = new Set<string>();
  const builtinTypes = new Set<string>();

  for (const row of puzzle.tiles) {
    for (const tile of row) {
      if (tile === null) continue;
      if (typeof tile === 'object' && 'customType' in tile && tile.customType) {
        tileTypeIds.add(tile.customType);
      } else if (typeof tile === 'number' || typeof tile === 'string') {
        builtinTypes.add(String(tile));
      }
    }
  }

  // Check custom tile behaviors
  for (const tileId of tileTypeIds) {
    const tileDef = loadTileType(tileId);
    if (!tileDef) continue;

    const allBehaviors = [
      ...(tileDef.behaviors || []),
      ...(tileDef.offStateBehaviors || []),
    ];

    for (const b of allBehaviors) {
      switch (b.type) {
        case 'damage': suggestions.add('traps'); break;
        case 'ice': suggestions.add('ice'); break;
        case 'teleport': suggestions.add('teleport'); break;
        case 'pressure_plate': suggestions.add('pressure-plates'); break;
        case 'direction_change': suggestions.add('direction-tiles'); break;
      }
    }

    if (tileDef.cadence?.enabled) suggestions.add('timed-tiles');
    if (tileDef.onStateBlocksMovement) suggestions.add('toggling-walls');
  }

  // --- Collectibles ---
  if (puzzle.collectibles && puzzle.collectibles.length > 0) {
    suggestions.add('collectibles');
  }

  // --- Side quests ---
  if (puzzle.sideQuests && puzzle.sideQuests.length > 0) {
    suggestions.add('bonus-objectives');
  }

  // --- Turn limit ---
  if (puzzle.maxTurns && puzzle.maxTurns < 30) {
    suggestions.add('timed');
  }

  // --- Lives ---
  if (puzzle.lives === 0) {
    suggestions.add('unlimited-lives');
  } else if (puzzle.lives === 1) {
    suggestions.add('one-life');
  }

  // --- Character count ---
  if (puzzle.maxCharacters >= 4) {
    suggestions.add('multi-hero');
  }
  if (puzzle.maxCharacters === 1) {
    suggestions.add('solo');
  }

  // --- Objects ---
  if (puzzle.placedObjects && puzzle.placedObjects.length > 0) {
    suggestions.add('objects');
  }

  return Array.from(suggestions).sort();
}
