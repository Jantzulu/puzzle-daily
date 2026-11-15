import type { Puzzle } from '../../types/game';
import testPuzzle01 from './test-puzzle-01.json';
import { localDateKey } from '../../utils/localDate';

export const puzzles: Record<string, Puzzle> = {
  [testPuzzle01.id]: testPuzzle01 as Puzzle,
};

export const getPuzzle = (id: string): Puzzle | undefined => {
  return puzzles[id];
};

export const getAllPuzzles = (): Puzzle[] => {
  return Object.values(puzzles);
};

export const getTodaysPuzzle = (): Puzzle => {
  // The built-in puzzle, shown when no daily can be had (nothing scheduled
  // yet, or offline with no cache). It stands in for TODAY's daily, so it
  // carries today's date: its file says 2026-01-01, and keyed by that the
  // player site's daily lock would never roll over (win it once and it
  // stayed finished forever).
  return { ...(testPuzzle01 as Puzzle), date: localDateKey() };
};
