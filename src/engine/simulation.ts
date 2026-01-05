import type { GameState, PlacedCharacter, PlacedEnemy, ParallelActionTracker } from '../types/game';
import { ActionType } from '../types/game';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { executeAction } from './actions';

/**
 * Initialize parallel action trackers for a character
 */
function initializeParallelTrackers(character: PlacedCharacter, charData: any): void {
  if (!character.parallelTrackers) {
    character.parallelTrackers = [];
  }

  // Find all parallel actions in behavior
  charData.behavior.forEach((action: any, index: number) => {
    if (action.executionMode === 'parallel') {
      // Check if tracker already exists for this index
      const existingTracker = character.parallelTrackers!.find(t => t.actionIndex === index);
      if (!existingTracker) {
        character.parallelTrackers!.push({
          actionIndex: index,
          lastTriggerTime: Date.now(),
          active: true,
        });
      }
    }
  });
}

/**
 * Execute parallel actions for all characters (called from animation loop)
 * This runs independently of the turn-based sequential actions
 */
export function executeParallelActions(gameState: GameState): void {
  const now = Date.now();

  // Process characters
  for (const character of gameState.placedCharacters) {
    if (!character.active || character.dead) {
      continue;
    }

    const charData = getCharacter(character.characterId);
    if (!charData) continue;

    // Initialize trackers if needed
    initializeParallelTrackers(character, charData);

    // Check each parallel tracker
    if (character.parallelTrackers) {
      for (const tracker of character.parallelTrackers) {
        if (!tracker.active) continue;

        const action = charData.behavior[tracker.actionIndex];
        if (!action || action.executionMode !== 'parallel') continue;

        let shouldExecute = false;

        // Check trigger condition
        if (action.trigger?.mode === 'interval') {
          const intervalMs = action.trigger.intervalMs || 600;
          const timeSinceLastTrigger = now - tracker.lastTriggerTime;
          if (timeSinceLastTrigger >= intervalMs) {
            shouldExecute = true;
            tracker.lastTriggerTime = now;
          }
        } else if (action.trigger?.mode === 'on_event') {
          // TODO: Implement event-based triggers
          // For now, skip event-based parallel actions
          shouldExecute = false;
        }

        if (shouldExecute) {
          // Execute the parallel action
          console.log('[executeParallelActions] Executing parallel action:', action.type, 'for character at', character.x, character.y);
          const updatedCharacter = executeAction(character, action, gameState);
          Object.assign(character, updatedCharacter);
        }
      }
    }
  }

  // TODO: Process parallel actions for enemies if needed
}

/**
 * Execute one turn of the simulation
 * Modifies gameState in place and returns it
 */
export function executeTurn(gameState: GameState): GameState {
  if (gameState.gameStatus !== 'running') {
    return gameState;
  }

  gameState.currentTurn++;

  // Create new array with new character objects to trigger React re-render
  // Process sequentially to ensure collision detection works correctly
  const newCharacters: PlacedCharacter[] = [];
  for (let i = 0; i < gameState.placedCharacters.length; i++) {
    const character = gameState.placedCharacters[i];
    // Create a new character object (shallow copy)
    const newCharacter = { ...character };

    if (!newCharacter.active || newCharacter.dead) {
      newCharacters.push(newCharacter);
      continue;
    }

    const charData = getCharacter(newCharacter.characterId);
    if (!charData) {
      console.error(`Character ${newCharacter.characterId} not found`);
      newCharacters.push(newCharacter);
      continue;
    }

    // Initialize parallel trackers if needed
    initializeParallelTrackers(newCharacter, charData);

    // Find the next sequential action (skip forward-looking parallel actions)
    let currentAction = charData.behavior[newCharacter.actionIndex];
    let skippedAnyActions = false;

    // Skip forward-looking parallel actions until we find a sequential one
    while (currentAction && currentAction.executionMode === 'parallel') {
      newCharacter.actionIndex++;
      currentAction = charData.behavior[newCharacter.actionIndex];
      skippedAnyActions = true;
    }

    // Also skip parallel_with_previous actions (they execute with the PREVIOUS action)
    while (currentAction && currentAction.executionMode === 'parallel_with_previous') {
      newCharacter.actionIndex++;
      currentAction = charData.behavior[newCharacter.actionIndex];
      skippedAnyActions = true;
    }

    if (!currentAction) {
      // No more actions, deactivate
      newCharacter.active = false;
      newCharacters.push(newCharacter);
      continue;
    }

    // Handle REPEAT action - loop back to beginning AND execute first action
    // Check for both enum value and string key
    if (currentAction.type === ActionType.REPEAT || currentAction.type === 'REPEAT') {
      // If we skipped actions to get here, just reset index without executing
      // This prevents double-execution when parallel actions are skipped
      if (skippedAnyActions) {
        newCharacter.actionIndex = -1; // Will be incremented to 0 at the end
      } else {
        // Normal case: reset and execute first action
        newCharacter.actionIndex = 0;
        const firstAction = charData.behavior[0];
        if (firstAction && firstAction.type !== ActionType.REPEAT && firstAction.type !== 'REPEAT') {
          const updatedCharacter = executeAction(newCharacter, firstAction, gameState);
          Object.assign(newCharacter, updatedCharacter);
        }
      }
    } else {
      // Execute the current sequential action
      const updatedCharacter = executeAction(newCharacter, currentAction, gameState);
      Object.assign(newCharacter, updatedCharacter);

      // Also execute any parallel_with_previous actions that follow
      let checkIndex = newCharacter.actionIndex + 1;
      while (checkIndex < charData.behavior.length) {
        const nextAction = charData.behavior[checkIndex];
        if (nextAction.executionMode === 'parallel_with_previous') {
          // Execute this action alongside the current one
          const parallelResult = executeAction(newCharacter, nextAction, gameState);
          Object.assign(newCharacter, parallelResult);
          checkIndex++;
        } else {
          // Stop when we hit a non-parallel_with_previous action
          break;
        }
      }
    }

    // Advance to next action
    newCharacter.actionIndex++;

    newCharacters.push(newCharacter);

    // Update gameState immediately so collision detection sees the new position
    gameState.placedCharacters = newCharacters.concat(gameState.placedCharacters.slice(i + 1));
  }

  gameState.placedCharacters = newCharacters;

  // Create new enemy array with new enemy objects to trigger React re-render
  // Process sequentially to ensure collision detection works correctly
  const newEnemies: PlacedEnemy[] = [];
  for (let i = 0; i < gameState.puzzle.enemies.length; i++) {
    const enemy = gameState.puzzle.enemies[i];
    // Create a new enemy object (shallow copy)
    const newEnemy = { ...enemy };

    if (newEnemy.dead) {
      newEnemies.push(newEnemy);
      continue;
    }

    const enemyData = getEnemy(newEnemy.enemyId);
    if (!enemyData || !enemyData.behavior || enemyData.behavior.type !== 'active') {
      newEnemies.push(newEnemy); // Skip static enemies
      continue;
    }

    // Initialize enemy behavior if needed
    if (newEnemy.actionIndex === undefined) {
      newEnemy.actionIndex = 0;
      newEnemy.active = true;
      newEnemy.facing = enemyData.behavior.defaultFacing || 'south';
    }

    if (!newEnemy.active) {
      newEnemies.push(newEnemy);
      continue;
    }

    const pattern = enemyData.behavior.pattern;
    if (!pattern || pattern.length === 0) {
      newEnemies.push(newEnemy);
      continue;
    }

    // Get current action (skip forward-looking parallel and backward-looking parallel_with_previous)
    let currentAction = pattern[newEnemy.actionIndex!];
    let skippedAnyActions = false;

    // Skip forward-looking parallel actions
    while (currentAction && currentAction.executionMode === 'parallel') {
      newEnemy.actionIndex = (newEnemy.actionIndex || 0) + 1;
      currentAction = pattern[newEnemy.actionIndex!];
      skippedAnyActions = true;
    }

    // Skip backward-looking parallel_with_previous actions
    while (currentAction && currentAction.executionMode === 'parallel_with_previous') {
      newEnemy.actionIndex = (newEnemy.actionIndex || 0) + 1;
      currentAction = pattern[newEnemy.actionIndex!];
      skippedAnyActions = true;
    }

    if (!currentAction) {
      // No more actions, deactivate
      newEnemy.active = false;
      newEnemies.push(newEnemy);
      continue;
    }

    // Handle REPEAT action - loop back to beginning AND execute first action
    if (currentAction.type === ActionType.REPEAT || currentAction.type === 'REPEAT') {
      // If we skipped actions to get here, just reset index without executing
      // This prevents double-execution when parallel actions are skipped
      if (skippedAnyActions) {
        newEnemy.actionIndex = -1; // Will be incremented to 0 at the end
      } else {
        // Normal case: reset and execute first action
        newEnemy.actionIndex = 0;
        const firstAction = pattern[0];
        if (firstAction && firstAction.type !== ActionType.REPEAT && firstAction.type !== 'REPEAT') {
          const tempChar: PlacedCharacter = {
            characterId: newEnemy.enemyId,
            x: newEnemy.x,
            y: newEnemy.y,
            facing: newEnemy.facing || 'south',
            currentHealth: newEnemy.currentHealth,
            actionIndex: 0,
            active: newEnemy.active || true,
            dead: newEnemy.dead,
          };

          const updatedChar = executeAction(tempChar, firstAction, gameState);

          newEnemy.x = updatedChar.x;
          newEnemy.y = updatedChar.y;
          newEnemy.facing = updatedChar.facing;
          newEnemy.currentHealth = updatedChar.currentHealth;
          newEnemy.dead = updatedChar.dead;
        }
      }
    } else {
      // Create a temporary PlacedCharacter to use executeAction
      const tempChar: PlacedCharacter = {
        characterId: newEnemy.enemyId,
        x: newEnemy.x,
        y: newEnemy.y,
        facing: newEnemy.facing || 'south',
        currentHealth: newEnemy.currentHealth,
        actionIndex: newEnemy.actionIndex || 0,
        active: newEnemy.active || true,
        dead: newEnemy.dead,
      };

      // Execute the current action
      const updatedChar = executeAction(tempChar, currentAction, gameState);

      // Update enemy from temp character
      newEnemy.x = updatedChar.x;
      newEnemy.y = updatedChar.y;
      newEnemy.facing = updatedChar.facing;
      newEnemy.currentHealth = updatedChar.currentHealth;
      newEnemy.dead = updatedChar.dead;

      // Also execute any parallel_with_previous actions that follow
      let checkIndex = (newEnemy.actionIndex || 0) + 1;
      while (checkIndex < pattern.length) {
        const nextAction = pattern[checkIndex];
        if (nextAction.executionMode === 'parallel_with_previous') {
          // Execute this action alongside the current one
          const parallelTempChar: PlacedCharacter = {
            characterId: newEnemy.enemyId,
            x: newEnemy.x,
            y: newEnemy.y,
            facing: newEnemy.facing || 'south',
            currentHealth: newEnemy.currentHealth,
            actionIndex: checkIndex,
            active: newEnemy.active || true,
            dead: newEnemy.dead,
          };

          const parallelResult = executeAction(parallelTempChar, nextAction, gameState);

          newEnemy.x = parallelResult.x;
          newEnemy.y = parallelResult.y;
          newEnemy.facing = parallelResult.facing;
          newEnemy.currentHealth = parallelResult.currentHealth;
          newEnemy.dead = parallelResult.dead;

          checkIndex++;
        } else {
          // Stop when we hit a non-parallel_with_previous action
          break;
        }
      }
    }

    // Advance to next action
    newEnemy.actionIndex = (newEnemy.actionIndex || 0) + 1;

    newEnemies.push(newEnemy);

    // Update gameState immediately so collision detection sees the new position
    gameState.puzzle.enemies = newEnemies.concat(gameState.puzzle.enemies.slice(i + 1));
  }

  gameState.puzzle.enemies = newEnemies;

  // Update projectiles (Phase 2)
  updateProjectiles(gameState);

  // Update particles (Phase 2)
  updateParticles(gameState);

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

// ==========================================
// PROJECTILE & PARTICLE UPDATES (Phase 2)
// ==========================================

import type { Projectile, ParticleEffect } from '../types/game';
import { TileType } from '../types/game';

/**
 * Update all active projectiles (time-based movement, should be called from animation loop)
 */
export function updateProjectiles(gameState: GameState): void {
  if (!gameState.activeProjectiles || gameState.activeProjectiles.length === 0) {
    return;
  }

  const now = Date.now();
  const projectilesToRemove: string[] = [];

  for (const proj of gameState.activeProjectiles) {
    if (!proj.active) {
      projectilesToRemove.push(proj.id);
      continue;
    }

    // Calculate how far projectile should have moved (time-based, not turn-based)
    const elapsed = (now - proj.startTime) / 1000; // seconds
    const distanceTraveled = proj.speed * elapsed;

    // Calculate direction vector from START to TARGET (not from current position!)
    const dx = proj.targetX - proj.startX;
    const dy = proj.targetY - proj.startY;
    const totalDistance = Math.sqrt(dx * dx + dy * dy);

    if (distanceTraveled >= totalDistance) {
      // Projectile reached max range
      proj.active = false;
      projectilesToRemove.push(proj.id);
      continue;
    }

    // Update position from STARTING point
    const progress = distanceTraveled / totalDistance;
    const newX = proj.startX + dx * progress;
    const newY = proj.startY + dy * progress;

    // Check collision with walls
    const tileX = Math.floor(newX);
    const tileY = Math.floor(newY);

    if (!isInBounds(tileX, tileY, gameState.puzzle.width, gameState.puzzle.height) ||
        gameState.puzzle.tiles[tileY]?.[tileX]?.type === TileType.WALL ||
        gameState.puzzle.tiles[tileY]?.[tileX] === null) {
      // Hit wall - deactivate projectile
      proj.active = false;
      projectilesToRemove.push(proj.id);
      continue;
    }

    // Check collision based on who fired the projectile
    // Characters hit enemies, enemies hit characters (no friendly fire)

    // If fired by a character, check for enemy hits
    if (proj.sourceCharacterId) {
      const hitEnemy = gameState.puzzle.enemies.find(
        e => !e.dead &&
             Math.floor(e.x) === tileX &&
             Math.floor(e.y) === tileY
      );

      if (hitEnemy) {
        // Apply damage
        const damage = proj.attackData.damage ?? 1;
        hitEnemy.currentHealth -= damage;

        if (hitEnemy.currentHealth <= 0) {
          hitEnemy.dead = true;
        }

        // Spawn hit effect
        if (proj.attackData.hitEffectSprite) {
          spawnParticleEffect(
            hitEnemy.x,
            hitEnemy.y,
            proj.attackData.hitEffectSprite,
            proj.attackData.effectDuration || 300,
            gameState
          );
        }

        // Check if projectile should pierce
        if (!proj.attackData.projectilePierces) {
          proj.active = false;
          projectilesToRemove.push(proj.id);
          continue;
        }
      }
    }

    // If fired by an enemy, check for character hits
    if (proj.sourceEnemyId) {
      const hitCharacter = gameState.placedCharacters.find(
        c => !c.dead &&
             Math.floor(c.x) === tileX &&
             Math.floor(c.y) === tileY
      );

      if (hitCharacter) {
        // Apply damage
        const damage = proj.attackData.damage ?? 1;
        hitCharacter.currentHealth -= damage;

        if (hitCharacter.currentHealth <= 0) {
          hitCharacter.dead = true;
        }

        // Spawn hit effect
        if (proj.attackData.hitEffectSprite) {
          spawnParticleEffect(
            hitCharacter.x,
            hitCharacter.y,
            proj.attackData.hitEffectSprite,
            proj.attackData.effectDuration || 300,
            gameState
          );
        }

        // Check if projectile should pierce
        if (!proj.attackData.projectilePierces) {
          proj.active = false;
          projectilesToRemove.push(proj.id);
          continue;
        }
      }
    }

    // Update projectile position
    proj.x = newX;
    proj.y = newY;
  }

  // Remove inactive projectiles
  gameState.activeProjectiles = gameState.activeProjectiles.filter(
    p => !projectilesToRemove.includes(p.id)
  );
}

/**
 * Update all active particles (remove expired ones, should be called from animation loop)
 */
export function updateParticles(gameState: GameState): void {
  if (!gameState.activeParticles || gameState.activeParticles.length === 0) {
    return;
  }

  const now = Date.now();

  // Remove expired particles
  gameState.activeParticles = gameState.activeParticles.filter(p => {
    const elapsed = now - p.startTime;
    return elapsed < p.duration;
  });
}

/**
 * Helper to spawn particle effects
 */
function spawnParticleEffect(
  x: number,
  y: number,
  sprite: any,
  duration: number,
  gameState: GameState
): void {
  if (!gameState.activeParticles) {
    gameState.activeParticles = [];
  }

  const particle: ParticleEffect = {
    id: `particle_${Date.now()}_${Math.random()}`,
    sprite,
    x,
    y,
    startTime: Date.now(),
    duration,
    alpha: 1.0,
  };

  gameState.activeParticles.push(particle);
}

function isInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}
