// Scoring Engine - Calculates puzzle completion scores and rankings
import type { GameState, PuzzleScore, SideQuest, RankTier } from '../types/game';

// Scoring constants
const BASE_POINTS = 1000;
const CHAR_BONUS_PER_UNDER_PAR = 200;
const TURN_BONUS_PER_UNDER_PAR = 25;
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

  // Calculate rank (bronze/silver/gold)
  // Gold = meet both pars, Silver = meet one par, Bronze = win but no pars met
  let rank: RankTier = 'bronze';
  if (metCharPar && metTurnPar) {
    rank = 'gold';
  } else if (metCharPar || metTurnPar) {
    rank = 'silver';
  }

  // Calculate bonuses for beating par
  const charBonus = metCharPar && puzzle.parCharacters
    ? Math.max(0, puzzle.parCharacters - charsUsed) * CHAR_BONUS_PER_UNDER_PAR
    : 0;
  const turnBonus = metTurnPar && puzzle.parTurns
    ? Math.max(0, puzzle.parTurns - turnsUsed) * TURN_BONUS_PER_UNDER_PAR
    : 0;
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
