import { useState } from 'react';
import type React from 'react';
import type { GameState } from '../../types/game';
import { describeTile, initialCursor, moveCursor, type TileCursor } from './boardKeyboard';

/**
 * Keyboard tile cursor for the board canvas (see boardKeyboard.ts). Returns
 * the cursor to draw (null when the board isn't keyboard-focused), its
 * spoken description, and the handlers the canvas wears. Enter/Space calls
 * the same onTileClick a tap does.
 */
export function useBoardCursor(
  gameState: GameState,
  onTileClick: ((x: number, y: number) => void) | undefined,
) {
  const [rawCursor, setCursor] = useState<TileCursor | null>(null);
  const { width, height } = gameState.puzzle;
  // A puzzle swap can leave the cursor outside the new board.
  const cursor = rawCursor && rawCursor.x < width && rawCursor.y < height ? rawCursor : null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!onTileClick) return;
    const from = cursor ?? initialCursor(width, height);
    const moved = moveCursor(from, e.key, width, height);
    if (moved) {
      e.preventDefault(); // arrows would scroll the page
      setCursor(cursor ? moved : from); // first press just reveals the cursor
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setCursor(from);
      onTileClick(from.x, from.y);
    }
  };

  // A tap or click focuses the canvas too; only keyboard focus shows the cursor.
  const onFocus = (e: React.FocusEvent<HTMLCanvasElement>) => {
    if (onTileClick && e.currentTarget.matches(':focus-visible')) {
      setCursor(c => c ?? initialCursor(width, height));
    }
  };
  const onBlur = () => setCursor(null);

  return {
    cursor,
    description: cursor ? describeTile(gameState, cursor.x, cursor.y) : '',
    onKeyDown,
    onFocus,
    onBlur,
  };
}
