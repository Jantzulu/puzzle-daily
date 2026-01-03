import type { Puzzle } from '../../types/game';
import testPuzzle01 from './test-puzzle-01.json';

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
  // For now, return the test puzzle
  // Later, this will be date-based
  return testPuzzle01 as Puzzle;
};
