// Scoring Engine - Calculates puzzle completion scores and rankings
import type { GameState, PuzzleScore, SideQuest, RankTier } from '../types/game';

// Scoring constants
const BASE_POINTS = 1000;
const CHAR_BONUS_PER_UNDER_PAR = 200;
const CHAR_PENALTY_PER_OVER_PAR = 100;  // Penalty for each character over par
const TURN_BONUS_PER_UNDER_PAR = 25;
const TURN_PENALTY_PER_OVER_PAR = 15;   // Penalty for each turn over par
const LIVES_BONUS_PER_LIFE = 100;

/**
 * Calculate the score for a completed puzzle
 */
export function calculateScore(
  gameState: GameState,
  livesRemaining: number,
  livesTotal: number
): PuzzleScore {
  const puzzle = gameState.puzzle;
  const charsUsed = gameState.placedCharacters.length;
  const turnsUsed = gameState.currentTurn;

  // Check par - if no par set, consider it met
  const metCharPar = puzzle.parCharacters ? charsUsed <= puzzle.parCharacters : true;
  const metTurnPar = puzzle.parTurns ? turnsUsed <= puzzle.parTurns : true;
  const noLivesLost = livesRemaining === livesTotal;

  // Calculate rank (bronze/silver/gold)
  // Gold = meet both pars AND no lives lost
  // Silver = meet at least one par OR meet both pars but lost lives
  // Bronze = win but no pars met, or only met one par with lives lost
  let rank: RankTier = 'bronze';
  if (metCharPar && metTurnPar && noLivesLost) {
    rank = 'gold';
  } else if (metCharPar && metTurnPar) {
    // Met both pars but lost lives = silver
    rank = 'silver';
  } else if (metCharPar || metTurnPar) {
    rank = 'silver';
  }

  // Calculate character bonus/penalty
  // Bonus for under par, penalty for over par
  let charBonus = 0;
  if (puzzle.parCharacters) {
    const charDiff = puzzle.parCharacters - charsUsed;
    if (charDiff >= 0) {
      charBonus = charDiff * CHAR_BONUS_PER_UNDER_PAR;
    } else {
      charBonus = charDiff * CHAR_PENALTY_PER_OVER_PAR; // charDiff is negative, so this subtracts
    }
  }

  // Calculate turn bonus/penalty
  let turnBonus = 0;
  if (puzzle.parTurns) {
    const turnDiff = puzzle.parTurns - turnsUsed;
    if (turnDiff >= 0) {
      turnBonus = turnDiff * TURN_BONUS_PER_UNDER_PAR;
    } else {
      turnBonus = turnDiff * TURN_PENALTY_PER_OVER_PAR; // turnDiff is negative, so this subtracts
    }
  }

  const livesBonus = livesRemaining * LIVES_BONUS_PER_LIFE;

  // Check side quests
  const completedQuests = checkSideQuests(gameState);
  const questPoints = completedQuests.reduce((sum, qid) => {
    const quest = puzzle.sideQuests?.find(q => q.id === qid);
    return sum + (quest?.bonusPoints ?? 0);
  }, 0);

  return {
    rank,
    totalPoints: BASE_POINTS + charBonus + turnBonus + livesBonus + questPoints,
    breakdown: {
      basePoints: BASE_POINTS,
      characterBonus: charBonus,
      turnBonus: turnBonus,
      livesBonus: livesBonus,
      sideQuestPoints: questPoints,
    },
    completedSideQuests: completedQuests,
    parMet: { characters: metCharPar, turns: metTurnPar },
    stats: {
      charactersUsed: charsUsed,
      turnsUsed: turnsUsed,
      livesRemaining: livesRemaining,
    },
  };
}

/**
 * Check which side quests have been completed
 */
function checkSideQuests(gameState: GameState): string[] {
  const completed: string[] = [];
  const puzzle = gameState.puzzle;

  for (const quest of puzzle.sideQuests ?? []) {
    if (isSideQuestCompleted(quest, gameState)) {
      completed.push(quest.id);
    }
  }
  return completed;
}

/**
 * Check if a specific side quest has been completed
 */
function isSideQuestCompleted(
  quest: SideQuest,
  gameState: GameState
): boolean {
  switch (quest.type) {
    case 'collect_all_items':
      // All collectibles must be collected
      return gameState.puzzle.collectibles.every(c => c.collected);

    case 'no_damage_taken':
      // All characters must be at max health
      return gameState.placedCharacters.every(c =>
        c.currentHealth === c.maxHealth
      );

    case 'use_specific_character':
      // The specified character must be in the party
      return gameState.placedCharacters.some(c =>
        c.characterId === quest.params?.characterId
      );

    case 'avoid_character':
      // The specified character must NOT be in the party
      return !gameState.placedCharacters.some(c =>
        c.characterId === quest.params?.characterId
      );

    case 'speed_run':
      // Complete within the specified turn limit
      return gameState.currentTurn <= (quest.params?.turns ?? 999);

    case 'minimalist':
      // Complete with at most the specified character count
      return gameState.placedCharacters.length <= (quest.params?.characterCount ?? 1);

    case 'no_deaths':
      // No characters died during the puzzle
      return gameState.placedCharacters.every(c => !c.dead);

    case 'custom':
      // Custom quests cannot be auto-checked
      return false;

    default:
      return false;
  }
}

/**
 * Get the emoji for a rank tier (for social sharing)
 */
export function getRankEmoji(rank: RankTier): string {
  switch (rank) {
    case 'gold': return '🏆';
    case 'silver': return '🥈';
    case 'bronze': return '🥉';
    default: return '🏆';
  }
}

/**
 * Get the display name for a rank tier
 */
export function getRankName(rank: RankTier): string {
  switch (rank) {
    case 'gold': return 'Gold Trophy';
    case 'silver': return 'Silver Trophy';
    case 'bronze': return 'Bronze Trophy';
    default: return 'Trophy';
  }
}

/**
 * Format a score for social sharing
 * Example: "🏆 Gold Trophy (1 char, 8 turns) - 1450 pts"
 */
export function formatScoreForSharing(score: PuzzleScore, puzzleName: string): string {
  const emoji = getRankEmoji(score.rank);
  const rankName = getRankName(score.rank);
  const { charactersUsed, turnsUsed } = score.stats;

  const charText = charactersUsed === 1 ? '1 char' : `${charactersUsed} chars`;
  const turnText = turnsUsed === 1 ? '1 turn' : `${turnsUsed} turns`;

  return `${emoji} ${rankName} on "${puzzleName}" (${charText}, ${turnText}) - ${score.totalPoints} pts`;
}
