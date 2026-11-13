// ============================================================================
// BOARD KEYBOARD — a tile cursor for keyboard and screen-reader players
// ============================================================================
// The board is a canvas, so by itself it is silent to a screen reader and
// unreachable from the keyboard. These helpers give it a tile cursor: arrow
// keys move it, Enter/Space acts on the tile exactly as a tap would (the
// same onTileClick), and every move is described in words for a live region.
// Input only: nothing here changes what a tap can do. Pure functions of game
// state, so they're testable without a canvas.

import type { GameState } from '../../types/game';
import { TileType } from '../../types/game';
import { getCharacter } from '../../data/characters';
import { getEnemy } from '../../data/enemies';
import { entityParty } from '../../engine/party';

export interface TileCursor {
  x: number;
  y: number;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/** Where the cursor starts when the board takes keyboard focus. */
export function initialCursor(width: number, height: number): TileCursor {
  return { x: Math.floor((width - 1) / 2), y: Math.floor((height - 1) / 2) };
}

/**
 * The cursor after an arrow key, clamped to the board. Returns null for any
 * other key so the caller can leave the event alone.
 */
export function moveCursor(cursor: TileCursor, key: string, width: number, height: number): TileCursor | null {
  const step = ARROWS[key];
  if (!step) return null;
  return {
    x: Math.max(0, Math.min(width - 1, cursor.x + step[0])),
    y: Math.max(0, Math.min(height - 1, cursor.y + step[1])),
  };
}

/** What stands on a tile, in words: position first, then terrain, then who. */
export function describeTile(gameState: GameState, x: number, y: number): string {
  const where = `Column ${x + 1}, row ${y + 1}.`;
  const tile = gameState.puzzle.tiles[y]?.[x];
  if (!tile) return `${where} No floor.`;
  if (tile.type === TileType.WALL) return `${where} Wall.`;

  const who: string[] = [];
  for (const c of gameState.placedCharacters) {
    if (c.dead || c.x !== x || c.y !== y) continue;
    const name = getCharacter(c.characterId)?.name ?? 'Hero';
    who.push(`Hero ${name}, ${c.currentHealth} health, facing ${c.facing}.`);
  }
  for (const e of gameState.puzzle.enemies) {
    if (e.dead || e.x !== x || e.y !== y) continue;
    const name = getEnemy(e.enemyId)?.name ?? 'Enemy';
    const side = entityParty(e, gameState) === 'hero' ? 'Ally' : 'Enemy';
    who.push(`${side} ${name}, ${e.currentHealth} health.`);
  }

  const terrain = tile.type === TileType.GOAL ? 'Goal tile.' : who.length ? '' : 'Empty floor.';
  return [where, terrain, ...who].filter(Boolean).join(' ');
}

/** The board's accessible name: its size and how to drive it. */
export function boardLabel(width: number, height: number): string {
  return `Dungeon board, ${width} columns by ${height} rows. Arrow keys move the cursor. Enter acts on the tile.`;
}
