import type { GameState, PlacedCharacter, PlacedEnemy } from '../types/game';
import { ActionType } from '../types/game';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { executeAction } from './actions';

/**
 * Execute one turn of the simulation
 * Modifies gameState in place and returns it
 */
export function executeTurn(gameState: GameState): GameState {
  if (gameState.gameStatus !== 'running') {
    return gameState;
  }

  gameState.currentTurn++;

  // Process each active character
  for (const character of gameState.placedCharacters) {
    if (!character.active || character.dead) {
      continue;
    }

    const charData = getCharacter(character.characterId);
    if (!charData) {
      console.error(`Character ${character.characterId} not found`);
      continue;
    }

    // Get current action
    let currentAction = charData.behavior[character.actionIndex];

    if (!currentAction) {
      // No more actions, deactivate
      character.active = false;
      continue;
    }

    // Handle REPEAT action - loop back to beginning
    // Check for both enum value and string key
    if (currentAction.type === ActionType.REPEAT || currentAction.type === 'REPEAT') {
      // Reset to beginning, but don't increment after
      character.actionIndex = -1; // Will be incremented to 0 below
    } else {
      // Execute the action
      const updatedCharacter = executeAction(character, currentAction, gameState);

      // Update character in game state
      Object.assign(character, updatedCharacter);
    }

    // Advance to next action
    character.actionIndex++;
  }

  // Process each active enemy
  for (const enemy of gameState.puzzle.enemies) {
    if (enemy.dead) {
      continue;
    }

    const enemyData = getEnemy(enemy.enemyId);
    if (!enemyData || !enemyData.behavior || enemyData.behavior.type !== 'active') {
      continue; // Skip static enemies
    }

    // Initialize enemy behavior if needed
    if (enemy.actionIndex === undefined) {
      enemy.actionIndex = 0;
      enemy.active = true;
      enemy.facing = enemyData.behavior.defaultFacing || 'south';
    }

    if (!enemy.active) {
      continue;
    }

    const pattern = enemyData.behavior.pattern;
    if (!pattern || pattern.length === 0) {
      continue;
    }

    // Get current action
    let currentAction = pattern[enemy.actionIndex!];

    if (!currentAction) {
      // No more actions, deactivate
      enemy.active = false;
      continue;
    }

    // Handle REPEAT action - loop back to beginning
    if (currentAction.type === ActionType.REPEAT || currentAction.type === 'REPEAT') {
      enemy.actionIndex = -1; // Will be incremented to 0 below
    } else {
      // Create a temporary PlacedCharacter to use executeAction
      const tempChar: PlacedCharacter = {
        characterId: enemy.enemyId,
        x: enemy.x,
        y: enemy.y,
        facing: enemy.facing || 'south',
        currentHealth: enemy.currentHealth,
        actionIndex: enemy.actionIndex || 0,
        active: enemy.active || true,
        dead: enemy.dead,
      };

      // Execute the action
      const updatedChar = executeAction(tempChar, currentAction, gameState);

      // Update enemy from temp character
      enemy.x = updatedChar.x;
      enemy.y = updatedChar.y;
      enemy.facing = updatedChar.facing;
      enemy.currentHealth = updatedChar.currentHealth;
      enemy.dead = updatedChar.dead;
    }

    // Advance to next action
    enemy.actionIndex = (enemy.actionIndex || 0) + 1;
  }

  // Check win/lose conditions
  checkGameConditions(gameState);

  // Check if we've exceeded the turn limit
  const maxTurns = gameState.puzzle.maxTurns || 1000; // Default to 1000 if not specified
  if (gameState.currentTurn >= maxTurns && gameState.gameStatus === 'running') {
    gameState.gameStatus = 'defeat';
    return gameState;
  }

  // Check if all characters are inactive
  const hasActiveCharacters = gameState.placedCharacters.some((c) => c.active && !c.dead);
  if (!hasActiveCharacters && gameState.gameStatus === 'running') {
    // All characters done, check if we won
    if (checkVictoryConditions(gameState)) {
      gameState.gameStatus = 'victory';
    } else {
      gameState.gameStatus = 'defeat';
    }
  }

  return gameState;
}

/**
 * Check win/lose conditions
 */
function checkGameConditions(gameState: GameState): void {
  // Check victory conditions
  if (checkVictoryConditions(gameState)) {
    gameState.gameStatus = 'victory';
    return;
  }

  // Check defeat conditions
  const allCharactersDead = gameState.placedCharacters.every((c) => c.dead);
  if (allCharactersDead && gameState.placedCharacters.length > 0) {
    gameState.gameStatus = 'defeat';
  }
}

/**
 * Check if victory conditions are met
 */
function checkVictoryConditions(gameState: GameState): boolean {
  for (const condition of gameState.puzzle.winConditions) {
    switch (condition.type) {
      case 'defeat_all_enemies':
        const allEnemiesDead = gameState.puzzle.enemies.every((e) => e.dead);
        if (!allEnemiesDead) return false;
        break;

      case 'collect_all':
        const allCollected = gameState.puzzle.collectibles.every((c) => c.collected);
        if (!allCollected) return false;
        break;

      // Add more condition types as needed
    }
  }

  return true;
}

/**
 * Initialize game state from puzzle
 */
export function initializeGameState(puzzle: any): GameState {
  return {
    puzzle: {
      ...puzzle,
      enemies: puzzle.enemies.map((e: any) => ({
        ...e,
        dead: false, // Always reset dead status
        currentHealth: e.health || e.currentHealth // Reset to full health
      })),
      collectibles: puzzle.collectibles.map((c: any) => ({ ...c, collected: false })),
    },
    placedCharacters: [],
    currentTurn: 0,
    simulationRunning: false,
    gameStatus: 'setup',
    score: 0,
    activeProjectiles: [],
    activeParticles: [],
  };
}

/**
 * Reset game state
 */
export function resetGameState(gameState: GameState, originalPuzzle: any): GameState {
  return initializeGameState(originalPuzzle);
}
