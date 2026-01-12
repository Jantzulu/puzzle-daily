import type { GameState, PlacedCharacter, PlacedEnemy, ParallelActionTracker, StatusEffectInstance, SpellTemplate, SpellAsset } from '../types/game';
import { ActionType, Direction, StatusEffectType } from '../types/game';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { executeAction, executeAOEAttack, evaluateTriggers } from './actions';
import { loadStatusEffectAsset, loadSpellAsset } from '../utils/assetStorage';

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
          // Event-based triggers are evaluated via evaluateTriggers()
          shouldExecute = false;
        }

        if (shouldExecute) {
          const updatedCharacter = executeAction(character, action, gameState);
          Object.assign(character, updatedCharacter);
        }
      }
    }
  }
}

// ==========================================
// STATUS EFFECT PROCESSING
// ==========================================

/**
 * Get max health for an entity (character or enemy)
 */
function getEntityMaxHealth(entity: PlacedCharacter | PlacedEnemy): number {
  // Try character first
  const charData = getCharacter((entity as PlacedCharacter).characterId);
  if (charData) return charData.health;

  // Try enemy
  const enemyData = getEnemy((entity as PlacedEnemy).enemyId);
  if (enemyData) return enemyData.health;

  return entity.currentHealth;
}

/**
 * Process status effects for an entity at the specified timing
 * @param entity - PlacedCharacter or PlacedEnemy
 * @param timing - 'start' or 'end' of turn
 * @param currentTurn - Current turn number
 * @returns Updated entity with effects processed
 */
function processEntityStatusEffects(
  entity: PlacedCharacter | PlacedEnemy,
  timing: 'start' | 'end',
  currentTurn: number
): PlacedCharacter | PlacedEnemy {
  if (!entity.statusEffects || entity.statusEffects.length === 0) {
    return entity;
  }

  const updatedEntity = { ...entity };
  const effectsToRemove: string[] = [];

  for (const effect of updatedEntity.statusEffects || []) {
    const effectAsset = loadStatusEffectAsset(effect.statusAssetId);

    // Check if this effect should process at this timing
    const shouldProcessAtStart = effect.type === StatusEffectType.STUN ||
                                  effect.type === StatusEffectType.SLEEP ||
                                  effect.type === StatusEffectType.SLOW ||
                                  effect.type === StatusEffectType.SILENCED ||
                                  effect.type === StatusEffectType.DISARMED ||
                                  effectAsset?.processAtTurnStart;

    const processNow = timing === 'start' ? shouldProcessAtStart : !shouldProcessAtStart;

    if (!processNow) continue;

    // Apply effect based on type
    switch (effect.type) {
      case StatusEffectType.POISON:
      case StatusEffectType.BURN:
      case StatusEffectType.BLEED:
        // Damage over time
        const damage = effect.value ?? effectAsset?.defaultValue ?? 1;
        const stacks = effect.currentStacks ?? 1;
        updatedEntity.currentHealth -= damage * stacks;

        if (updatedEntity.currentHealth <= 0) {
          updatedEntity.dead = true;
        }
        break;

      case StatusEffectType.REGEN:
        // Healing over time
        const heal = effect.value ?? effectAsset?.defaultValue ?? 1;
        const maxHealth = getEntityMaxHealth(updatedEntity);
        updatedEntity.currentHealth = Math.min(
          updatedEntity.currentHealth + heal,
          maxHealth
        );
        break;

      // Action-preventing effects are checked in canEntityAct()
      // Duration handling is done at the end of processing
    }

    // Decrement duration at end of turn only
    if (timing === 'end') {
      effect.duration--;

      // Mark for removal if expired
      if (effect.duration <= 0) {
        effectsToRemove.push(effect.id);
      }
    }
  }

  // Remove expired effects
  if (effectsToRemove.length > 0) {
    updatedEntity.statusEffects = (updatedEntity.statusEffects || [])
      .filter(e => !effectsToRemove.includes(e.id));
  }

  return updatedEntity;
}

/**
 * Check if an entity can perform actions based on status effects
 */
export function canEntityAct(entity: PlacedCharacter | PlacedEnemy): { allowed: boolean; reason?: string } {
  if (!entity.statusEffects) return { allowed: true };

  for (const effect of entity.statusEffects) {
    const effectAsset = loadStatusEffectAsset(effect.statusAssetId);

    // Check for action-preventing effects
    if (effectAsset?.preventsAllActions ||
        effect.type === StatusEffectType.STUN ||
        effect.type === StatusEffectType.SLEEP) {
      return { allowed: false, reason: effect.type === StatusEffectType.SLEEP ? 'Asleep' : 'Stunned' };
    }
  }

  return { allowed: true };
}

/**
 * Check if an entity can perform a specific spell type based on status effects
 */
export function canEntityCastSpell(
  entity: PlacedCharacter | PlacedEnemy,
  spellTemplate?: SpellTemplate
): { allowed: boolean; reason?: string } {
  if (!entity.statusEffects) return { allowed: true };

  // First check if entity can act at all
  const actCheck = canEntityAct(entity);
  if (!actCheck.allowed) return actCheck;

  for (const effect of entity.statusEffects) {
    const effectAsset = loadStatusEffectAsset(effect.statusAssetId);

    // Check melee prevention (Disarmed)
    if (spellTemplate === 'melee' && (effectAsset?.preventsMelee || effect.type === StatusEffectType.DISARMED)) {
      return { allowed: false, reason: 'Disarmed' };
    }

    // Check ranged/AOE prevention (Silenced)
    if ((spellTemplate === 'range_linear' || spellTemplate === 'magic_linear' || spellTemplate === 'aoe') &&
        (effectAsset?.preventsRanged || effect.type === StatusEffectType.SILENCED)) {
      return { allowed: false, reason: 'Silenced' };
    }
  }

  return { allowed: true };
}

/**
 * Check if an entity can move based on status effects (for Slow effect)
 * Returns true if entity can move, false if this movement should be skipped
 */
export function canEntityMove(entity: PlacedCharacter | PlacedEnemy): boolean {
  if (!entity.statusEffects) return true;

  for (const effect of entity.statusEffects) {
    if (effect.type === StatusEffectType.SLOW) {
      // Slow effect: skip every other movement action
      const counter = effect.movementSkipCounter ?? 0;
      effect.movementSkipCounter = counter + 1;

      // Skip odd-numbered movement actions (1, 3, 5, ...)
      if (counter % 2 === 1) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Remove sleep effects from an entity (called when entity takes damage)
 */
export function wakeFromSleep(entity: PlacedCharacter | PlacedEnemy): void {
  if (!entity.statusEffects) return;

  const sleepEffects = entity.statusEffects.filter(e => e.type === StatusEffectType.SLEEP);

  if (sleepEffects.length > 0) {
    entity.statusEffects = entity.statusEffects.filter(e => {
      if (e.type === StatusEffectType.SLEEP) {
        return false;
      }
      const effectAsset = loadStatusEffectAsset(e.statusAssetId);
      if (effectAsset?.removedOnDamage) {
        return false;
      }
      return true;
    });
  }
}

/**
 * Apply status effect from a projectile hit
 */
function applyStatusEffectFromProjectile(
  target: PlacedCharacter | PlacedEnemy,
  spellAssetId: string,
  sourceId: string,
  sourceIsEnemy: boolean,
  currentTurn: number
): void {
  const spell = loadSpellAsset(spellAssetId);
  if (!spell?.appliesStatusEffect) return;

  const effectConfig = spell.appliesStatusEffect;
  if (!effectConfig.statusAssetId) return;

  const effectAsset = loadStatusEffectAsset(effectConfig.statusAssetId);
  if (!effectAsset) {
    console.warn(`Status effect asset not found: ${effectConfig.statusAssetId}`);
    return;
  }

  // Check apply chance
  const applyChance = effectConfig.applyChance ?? 1;
  if (Math.random() > applyChance) {
    return;
  }

  // Initialize status effects array if needed
  if (!target.statusEffects) {
    target.statusEffects = [];
  }

  // Check for existing effect of same type for stacking
  const existingEffect = target.statusEffects.find(
    e => e.type === effectAsset.type || e.statusAssetId === effectConfig.statusAssetId
  );

  const duration = effectConfig.durationOverride ?? effectAsset.defaultDuration ?? 3;
  const value = effectConfig.valueOverride ?? effectAsset.defaultValue;

  if (existingEffect) {
    switch (effectAsset.stackingBehavior) {
      case 'refresh':
        existingEffect.duration = duration;
        return;

      case 'stack':
        const maxStacks = effectAsset.maxStacks ?? 5;
        existingEffect.currentStacks = Math.min(
          (existingEffect.currentStacks ?? 1) + 1,
          maxStacks
        );
        existingEffect.duration = duration;
        return;

      case 'highest':
        if (value !== undefined && value > (existingEffect.value ?? 0)) {
          existingEffect.value = value;
          existingEffect.duration = duration;
        }
        return;

      case 'replace':
        target.statusEffects = target.statusEffects.filter(e => e !== existingEffect);
        break;
    }
  }

  // Create new status effect instance
  const newEffect: StatusEffectInstance = {
    id: `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: effectAsset.type,
    statusAssetId: effectConfig.statusAssetId,
    duration,
    value,
    currentStacks: 1,
    appliedOnTurn: currentTurn,
    sourceEntityId: sourceId,
    sourceIsEnemy,
    movementSkipCounter: 0,
  };

  target.statusEffects.push(newEffect);
}

/**
 * Process status effects for all entities at turn start
 */
function processAllStatusEffectsTurnStart(gameState: GameState): void {
  // Process characters
  for (let i = 0; i < gameState.placedCharacters.length; i++) {
    if (!gameState.placedCharacters[i].dead) {
      gameState.placedCharacters[i] = processEntityStatusEffects(
        gameState.placedCharacters[i],
        'start',
        gameState.currentTurn
      ) as PlacedCharacter;
    }
  }

  // Process enemies
  for (let i = 0; i < gameState.puzzle.enemies.length; i++) {
    if (!gameState.puzzle.enemies[i].dead) {
      gameState.puzzle.enemies[i] = processEntityStatusEffects(
        gameState.puzzle.enemies[i],
        'start',
        gameState.currentTurn
      ) as PlacedEnemy;
    }
  }
}

/**
 * Process status effects for all entities at turn end
 */
function processAllStatusEffectsTurnEnd(gameState: GameState): void {
  // Process characters
  for (let i = 0; i < gameState.placedCharacters.length; i++) {
    if (!gameState.placedCharacters[i].dead) {
      gameState.placedCharacters[i] = processEntityStatusEffects(
        gameState.placedCharacters[i],
        'end',
        gameState.currentTurn
      ) as PlacedCharacter;
    }
  }

  // Process enemies
  for (let i = 0; i < gameState.puzzle.enemies.length; i++) {
    if (!gameState.puzzle.enemies[i].dead) {
      gameState.puzzle.enemies[i] = processEntityStatusEffects(
        gameState.puzzle.enemies[i],
        'end',
        gameState.currentTurn
      ) as PlacedEnemy;
    }
  }
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

  // Process turn-start status effects for all entities
  processAllStatusEffectsTurnStart(gameState);

  // Create new array with new character objects to trigger React re-render
  // Process sequentially to ensure collision detection works correctly
  const newCharacters: PlacedCharacter[] = [];
  for (let i = 0; i < gameState.placedCharacters.length; i++) {
    const character = gameState.placedCharacters[i];
    // Create a new character object (shallow copy)
    const newCharacter = { ...character };

    // Clear animation flags from previous turn (animation has completed)
    newCharacter.justTeleported = false;
    newCharacter.teleportFromX = undefined;
    newCharacter.teleportFromY = undefined;
    newCharacter.iceSlideDistance = undefined;

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
      // Reset to beginning
      newCharacter.actionIndex = 0;

      // Find the first SEQUENTIAL action (skip parallel actions)
      let firstSequentialIndex = 0;
      while (firstSequentialIndex < charData.behavior.length) {
        const action = charData.behavior[firstSequentialIndex];
        if (action.executionMode !== 'parallel' && action.executionMode !== 'parallel_with_previous') {
          break;
        }
        firstSequentialIndex++;
      }

      // Execute the first sequential action
      if (firstSequentialIndex < charData.behavior.length) {
        const firstAction = charData.behavior[firstSequentialIndex];
        if (firstAction.type !== ActionType.REPEAT && firstAction.type !== 'REPEAT') {
          newCharacter.actionIndex = firstSequentialIndex;
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

  // Collect all pending character triggers (defer evaluation for melee priority)
  const pendingCharacterTriggers: PlacedCharacter[] = [];
  for (const character of gameState.placedCharacters) {
    if (!character.dead && character.active) {
      pendingCharacterTriggers.push(character);
    }
  }

  // Create new enemy array with new enemy objects to trigger React re-render
  // Process sequentially to ensure collision detection works correctly
  const newEnemies: PlacedEnemy[] = [];
  for (let i = 0; i < gameState.puzzle.enemies.length; i++) {
    const enemy = gameState.puzzle.enemies[i];
    // Create a new enemy object (shallow copy)
    const newEnemy = { ...enemy };

    // Clear animation flags from previous turn (animation has completed)
    newEnemy.justTeleported = false;
    newEnemy.teleportFromX = undefined;
    newEnemy.teleportFromY = undefined;
    newEnemy.iceSlideDistance = undefined;

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
      newEnemy.facing = enemyData.behavior.defaultFacing || Direction.SOUTH;
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
      // Reset to beginning
      newEnemy.actionIndex = 0;

      // Find the first SEQUENTIAL action (skip parallel actions)
      let firstSequentialIndex = 0;
      while (firstSequentialIndex < pattern.length) {
        const action = pattern[firstSequentialIndex];
        if (action.executionMode !== 'parallel' && action.executionMode !== 'parallel_with_previous') {
          break;
        }
        firstSequentialIndex++;
      }

      // Execute the first sequential action
      if (firstSequentialIndex < pattern.length) {
        const firstAction = pattern[firstSequentialIndex];
        if (firstAction.type !== ActionType.REPEAT && firstAction.type !== 'REPEAT') {
          newEnemy.actionIndex = firstSequentialIndex;

          const tempChar: PlacedCharacter = {
            characterId: newEnemy.enemyId,
            x: newEnemy.x,
            y: newEnemy.y,
            facing: newEnemy.facing || Direction.SOUTH,
            currentHealth: newEnemy.currentHealth,
            actionIndex: firstSequentialIndex,
            active: newEnemy.active || true,
            dead: newEnemy.dead,
          };

          const updatedChar = executeAction(tempChar, firstAction, gameState);

          newEnemy.x = updatedChar.x;
          newEnemy.y = updatedChar.y;
          newEnemy.facing = updatedChar.facing;
          newEnemy.currentHealth = updatedChar.currentHealth;
          newEnemy.dead = updatedChar.dead;
          // Copy teleport animation state
          newEnemy.justTeleported = updatedChar.justTeleported;
          newEnemy.teleportFromX = updatedChar.teleportFromX;
          newEnemy.teleportFromY = updatedChar.teleportFromY;
          newEnemy.iceSlideDistance = updatedChar.iceSlideDistance;
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
      // Copy teleport animation state
      newEnemy.justTeleported = updatedChar.justTeleported;
      newEnemy.teleportFromX = updatedChar.teleportFromX;
      newEnemy.teleportFromY = updatedChar.teleportFromY;
      newEnemy.iceSlideDistance = updatedChar.iceSlideDistance;

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
            facing: newEnemy.facing || Direction.SOUTH,
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
          // Copy teleport animation state
          newEnemy.justTeleported = parallelResult.justTeleported;
          newEnemy.teleportFromX = parallelResult.teleportFromX;
          newEnemy.teleportFromY = parallelResult.teleportFromY;
          newEnemy.iceSlideDistance = parallelResult.iceSlideDistance;

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

  // Collect all pending enemy triggers
  // Note: Include enemies that are not dead, regardless of 'active' status
  // Static enemies (behavior.type !== 'active') don't have active=true but can still have triggers
  const pendingEnemyTriggers: PlacedEnemy[] = [];
  for (const enemy of gameState.puzzle.enemies) {
    if (!enemy.dead) {
      pendingEnemyTriggers.push(enemy);
    }
  }

  // Execute triggers in priority order:
  // 1. Enemies with hasMeleePriority
  // 2. Characters (normal priority)
  // 3. Enemies without hasMeleePriority

  // Execute priority enemies first
  for (const enemy of pendingEnemyTriggers) {
    const enemyData = getEnemy(enemy.enemyId);
    if (enemyData?.hasMeleePriority) {
      const tempCharForTrigger: PlacedCharacter = {
        characterId: enemy.enemyId,
        x: enemy.x,
        y: enemy.y,
        facing: enemy.facing || Direction.SOUTH,
        currentHealth: enemy.currentHealth,
        actionIndex: enemy.actionIndex || 0,
        active: enemy.active || true,
        dead: enemy.dead,
      };
      evaluateTriggers(tempCharForTrigger, gameState);

      // Copy back any changes from trigger execution
      enemy.x = tempCharForTrigger.x;
      enemy.y = tempCharForTrigger.y;
      enemy.facing = tempCharForTrigger.facing;
      enemy.currentHealth = tempCharForTrigger.currentHealth;
      enemy.dead = tempCharForTrigger.dead;
    }
  }

  // Execute character triggers (normal priority)
  for (const character of pendingCharacterTriggers) {
    if (!character.dead) {
      evaluateTriggers(character, gameState);
    }
  }

  // Execute non-priority enemy triggers
  for (const enemy of pendingEnemyTriggers) {
    const enemyData = getEnemy(enemy.enemyId);
    if (!enemyData?.hasMeleePriority && !enemy.dead) {
      const tempCharForTrigger: PlacedCharacter = {
        characterId: enemy.enemyId,
        x: enemy.x,
        y: enemy.y,
        facing: enemy.facing || Direction.SOUTH,
        currentHealth: enemy.currentHealth,
        actionIndex: enemy.actionIndex || 0,
        active: enemy.active || true,
        dead: enemy.dead,
      };
      evaluateTriggers(tempCharForTrigger, gameState);

      // Copy back any changes from trigger execution
      enemy.x = tempCharForTrigger.x;
      enemy.y = tempCharForTrigger.y;
      enemy.facing = tempCharForTrigger.facing;
      enemy.currentHealth = tempCharForTrigger.currentHealth;
      enemy.dead = tempCharForTrigger.dead;
    }
  }

  // Update projectiles (Phase 2)
  updateProjectiles(gameState);

  // Update particles (Phase 2)
  updateParticles(gameState);

  // Process persistent area effects
  processPersistentAreaEffects(gameState);

  // Process turn-end status effects for all entities
  processAllStatusEffectsTurnEnd(gameState);

  // Check win/lose conditions (skip in test mode)
  if (!gameState.testMode) {
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
      enemies: puzzle.enemies.map((e: any) => {
        // Look up the enemy definition to get the current max health
        const enemyData = getEnemy(e.enemyId);
        const maxHealth = enemyData?.health || e.health || e.currentHealth || 1;
        return {
          ...e,
          dead: false, // Always reset dead status
          currentHealth: maxHealth // Reset to full health from enemy definition
        };
      }),
      collectibles: puzzle.collectibles.map((c: any) => ({ ...c, collected: false })),
    },
    placedCharacters: [],
    currentTurn: 0,
    simulationRunning: false,
    gameStatus: 'setup',
    score: 0,
    activeProjectiles: [],
    activeParticles: [],
    persistentAreaEffects: [],
    tileStates: new Map(), // Initialize empty tile runtime states
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
      // Check if this should explode into AOE
      if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
        triggerAOEExplosion(
          proj.x,
          proj.y,
          proj.attackData,
          proj.sourceCharacterId,
          proj.sourceEnemyId,
          gameState,
          proj.spellAssetId
        );
      }

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
    // Healing projectiles hit allies, damage projectiles hit enemies
    const isHealingProjectile = (proj.attackData.healing ?? 0) > 0;

    // If fired by a character
    if (proj.sourceCharacterId) {
      if (isHealingProjectile) {
        // Healing projectile - check for ally character hits
        const hitAlly = gameState.placedCharacters.find(
          c => !c.dead &&
               Math.floor(c.x) === tileX &&
               Math.floor(c.y) === tileY &&
               c.characterId !== proj.sourceCharacterId // Don't heal self
        );

        if (hitAlly) {
          // Check if this should explode into AOE healing on impact
          if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
            triggerAOEExplosion(
              hitAlly.x,
              hitAlly.y,
              proj.attackData,
              proj.sourceCharacterId,
              proj.sourceEnemyId,
              gameState,
              proj.spellAssetId
            );
          } else {
            // Apply single-target healing
            const healing = proj.attackData.healing ?? 0;
            const charData = getCharacter(hitAlly.characterId);
            const maxHealth = charData?.health ?? hitAlly.currentHealth;
            hitAlly.currentHealth = Math.min(hitAlly.currentHealth + healing, maxHealth);

            // Spawn healing effect (prefer healing sprite, fallback to hit effect)
            const healSprite = proj.attackData.healingEffectSprite || proj.attackData.hitEffectSprite;
            if (healSprite) {
              spawnParticleEffect(
                hitAlly.x,
                hitAlly.y,
                healSprite,
                proj.attackData.effectDuration || 300,
                gameState
              );
            }
          }

          // Check if projectile should pierce
          if (!proj.attackData.projectilePierces) {
            proj.active = false;
            projectilesToRemove.push(proj.id);
            continue;
          }
        }
      } else {
        // Damage projectile - check for enemy hits
        const hitEnemy = gameState.puzzle.enemies.find(
          e => !e.dead &&
               Math.floor(e.x) === tileX &&
               Math.floor(e.y) === tileY
        );

        if (hitEnemy) {
          // Check if this should explode into AOE on impact
          if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
            triggerAOEExplosion(
              hitEnemy.x,
              hitEnemy.y,
              proj.attackData,
              proj.sourceCharacterId,
              proj.sourceEnemyId,
              gameState,
              proj.spellAssetId
            );
          } else {
            // Apply single-target damage
            const damage = proj.attackData.damage ?? 1;
            hitEnemy.currentHealth -= damage;

            // Wake from sleep if sleeping
            wakeFromSleep(hitEnemy);

            if (hitEnemy.currentHealth <= 0) {
              hitEnemy.dead = true;
            }

            // Apply status effect if projectile has a spell with one configured
            if (proj.spellAssetId && !hitEnemy.dead) {
              applyStatusEffectFromProjectile(
                hitEnemy,
                proj.spellAssetId,
                proj.sourceCharacterId || 'unknown',
                false,
                gameState.currentTurn
              );
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
          }

          // Check if projectile should pierce
          if (!proj.attackData.projectilePierces) {
            proj.active = false;
            projectilesToRemove.push(proj.id);
            continue;
          }
        }
      }
    }

    // If fired by an enemy
    if (proj.sourceEnemyId) {
      if (isHealingProjectile) {
        // Healing projectile - check for ally enemy hits
        const hitAllyEnemy = gameState.puzzle.enemies.find(
          e => !e.dead &&
               Math.floor(e.x) === tileX &&
               Math.floor(e.y) === tileY &&
               e.enemyId !== proj.sourceEnemyId // Don't heal self
        );

        if (hitAllyEnemy) {
          // Check if this should explode into AOE healing on impact
          if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
            triggerAOEExplosion(
              hitAllyEnemy.x,
              hitAllyEnemy.y,
              proj.attackData,
              proj.sourceCharacterId,
              proj.sourceEnemyId,
              gameState,
              proj.spellAssetId
            );
          } else {
            // Apply single-target healing
            const healing = proj.attackData.healing ?? 0;
            const enemyData = getEnemy(hitAllyEnemy.enemyId);
            const maxHealth = enemyData?.health ?? hitAllyEnemy.currentHealth;
            hitAllyEnemy.currentHealth = Math.min(hitAllyEnemy.currentHealth + healing, maxHealth);

            // Spawn healing effect (prefer healing sprite, fallback to hit effect)
            const healSprite = proj.attackData.healingEffectSprite || proj.attackData.hitEffectSprite;
            if (healSprite) {
              spawnParticleEffect(
                hitAllyEnemy.x,
                hitAllyEnemy.y,
                healSprite,
                proj.attackData.effectDuration || 300,
                gameState
              );
            }
          }

          // Check if projectile should pierce
          if (!proj.attackData.projectilePierces) {
            proj.active = false;
            projectilesToRemove.push(proj.id);
            continue;
          }
        }
      } else {
        // Damage projectile - check for character hits
        const hitCharacter = gameState.placedCharacters.find(
          c => !c.dead &&
               Math.floor(c.x) === tileX &&
               Math.floor(c.y) === tileY
        );

        if (hitCharacter) {
          // Check if this should explode into AOE on impact
          if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
            triggerAOEExplosion(
              hitCharacter.x,
              hitCharacter.y,
              proj.attackData,
              proj.sourceCharacterId,
              proj.sourceEnemyId,
              gameState,
              proj.spellAssetId
            );
          } else {
            // Apply single-target damage
            const damage = proj.attackData.damage ?? 1;
            hitCharacter.currentHealth -= damage;

            // Wake from sleep if sleeping
            wakeFromSleep(hitCharacter);

            if (hitCharacter.currentHealth <= 0) {
              hitCharacter.dead = true;
            }

            // Apply status effect if projectile has a spell with one configured
            if (proj.spellAssetId && !hitCharacter.dead) {
              applyStatusEffectFromProjectile(
                hitCharacter,
                proj.spellAssetId,
                proj.sourceEnemyId || 'unknown',
                true,
                gameState.currentTurn
              );
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
          }

          // Check if projectile should pierce
          if (!proj.attackData.projectilePierces) {
            proj.active = false;
            projectilesToRemove.push(proj.id);
            continue;
          }
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
 * Trigger an AOE explosion at a specific position
 */
function triggerAOEExplosion(
  x: number,
  y: number,
  attackData: any,
  sourceCharacterId: string | undefined,
  sourceEnemyId: string | undefined,
  gameState: GameState,
  spellAssetId?: string
): void {
  // Create a temporary character at the explosion point
  const tempChar: PlacedCharacter = {
    characterId: sourceCharacterId || sourceEnemyId || 'explosion_source',
    x,
    y,
    facing: Direction.SOUTH,
    currentHealth: 1,
    actionIndex: 0,
    active: true,
    dead: false,
  };

  // Set the center to be at the explosion point (caster-centered mode)
  const modifiedAttackData = {
    ...attackData,
    aoeCenteredOnCaster: true, // Force AOE to center on explosion point
  };

  // Load spell for status effect application
  const spell = spellAssetId ? loadSpellAsset(spellAssetId) : undefined;

  executeAOEAttack(tempChar, modifiedAttackData, Direction.SOUTH, gameState, spell || undefined);
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

/**
 * Process persistent area effects (like fire on the ground)
 * Damages enemies in the area each turn and decrements duration
 */
function processPersistentAreaEffects(gameState: GameState): void {
  if (!gameState.persistentAreaEffects || gameState.persistentAreaEffects.length === 0) {
    return;
  }

  // Process each persistent effect
  gameState.persistentAreaEffects.forEach(effect => {
    // Damage all enemies in radius
    gameState.puzzle.enemies.forEach(enemy => {
      if (enemy.dead) return;

      const distance = Math.sqrt(
        Math.pow(enemy.x - effect.x, 2) + Math.pow(enemy.y - effect.y, 2)
      );

      if (distance <= effect.radius) {
        enemy.currentHealth -= effect.damagePerTurn;
        if (enemy.currentHealth <= 0) {
          enemy.dead = true;
        }
      }
    });

    // Decrement duration
    effect.turnsRemaining--;
  });

  // Remove expired effects
  gameState.persistentAreaEffects = gameState.persistentAreaEffects.filter(
    effect => effect.turnsRemaining > 0
  );
}
