import type { GameState, PlacedCharacter, PlacedEnemy, ParallelActionTracker, StatusEffectInstance, SpellTemplate, SpellAsset, PlacedCollectible } from '../types/game';
import { ActionType, Direction, StatusEffectType, TileType as TileTypeEnum } from '../types/game';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { executeAction, executeAOEAttack, evaluateTriggers } from './actions';
import { loadStatusEffectAsset, loadSpellAsset, loadCollectible } from '../utils/assetStorage';
import { turnLeft, turnRight, getDirectionOffset, calculateDirectionTo } from './utils';

/**
 * Floor a number with epsilon tolerance to handle floating point issues
 * Math.floor(-0.0000001) would give -1, but we want 0
 */
function safeFloor(n: number): number {
  // Handle negative zero explicitly
  if (Object.is(n, -0)) {
    return 0;
  }
  // Round to nearest integer if very close (within epsilon)
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) < 0.0001) {
    return rounded;
  }
  return Math.floor(n);
}

/**
 * Get all integer tile coordinates along a line segment
 * Uses simple tile stepping based on start/end tile coordinates
 * For a diagonal from (11,2) to (13,0), we want: (11,2) -> (12,1) -> (13,0)
 */
function getTilesAlongLine(x0: number, y0: number, x1: number, y1: number): Array<{x: number, y: number}> {
  const tiles: Array<{x: number, y: number}> = [];
  const seen = new Set<string>();

  // Helper to add a tile if not seen
  const addTile = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!seen.has(key)) {
      seen.add(key);
      tiles.push({ x, y });
    }
  };

  // Get start and end tiles
  // Use safeFloor for start position (where projectile actually is)
  // Use Math.round for end position to handle animation overshoot (e.g., -0.015 -> 0, not -1)
  const startTileX = safeFloor(x0);
  const startTileY = safeFloor(y0);
  const endTileX = Math.round(x1);
  const endTileY = Math.round(y1);

  // Always add starting tile
  addTile(startTileX, startTileY);

  // If same tile, we're done
  if (startTileX === endTileX && startTileY === endTileY) {
    return tiles;
  }

  // Calculate how many tiles we need to traverse
  const dx = endTileX - startTileX;
  const dy = endTileY - startTileY;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  // Step through each tile along the path
  // For a diagonal, this will visit exactly the diagonal tiles
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const tileX = startTileX + Math.round(dx * t);
    const tileY = startTileY + Math.round(dy * t);
    addTile(tileX, tileY);
  }

  return tiles;
}

/**
 * Compute tile path for bounced projectiles (used when projectile bounces off wall)
 * Same logic as computeTilePath in actions.ts
 */
function computeTilePathForBounce(startX: number, startY: number, targetX: number, targetY: number): Array<{ x: number; y: number }> {
  const tiles: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();

  const addTile = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!seen.has(key)) {
      seen.add(key);
      tiles.push({ x, y });
    }
  };

  const startTileX = Math.floor(startX);
  const startTileY = Math.floor(startY);
  const endTileX = Math.round(targetX);
  const endTileY = Math.round(targetY);

  addTile(startTileX, startTileY);

  if (startTileX === endTileX && startTileY === endTileY) {
    return tiles;
  }

  const dx = endTileX - startTileX;
  const dy = endTileY - startTileY;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const tileX = startTileX + Math.round(dx * t);
    const tileY = startTileY + Math.round(dy * t);
    addTile(tileX, tileY);
  }

  return tiles;
}

/**
 * Compute tile path for bounced projectiles with wall lookahead
 * Stops the path at the last valid tile BEFORE any wall
 */
function computeTilePathWithWallLookahead(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  gameState: GameState
): Array<{ x: number; y: number }> {
  const allTiles = computeTilePathForBounce(startX, startY, targetX, targetY);
  const validTiles: Array<{ x: number; y: number }> = [];

  for (const tile of allTiles) {
    const isWall = !isInBounds(tile.x, tile.y, gameState.puzzle.width, gameState.puzzle.height) ||
        gameState.puzzle.tiles[tile.y]?.[tile.x]?.type === TileTypeEnum.WALL ||
        gameState.puzzle.tiles[tile.y]?.[tile.x] === null;

    if (isWall) {
      // Stop at the tile before the wall
      break;
    }
    validTiles.push(tile);
  }

  // Always return at least the starting tile
  return validTiles.length > 0 ? validTiles : [{ x: Math.floor(startX), y: Math.floor(startY) }];
}

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
 * Check if an entity has Haste and should get a bonus movement
 * Returns true if entity should get an extra movement this turn
 * Uses a counter similar to Slow to track alternate turns
 */
export function hasHasteBonus(entity: PlacedCharacter | PlacedEnemy): boolean {
  if (!entity.statusEffects) return false;

  for (const effect of entity.statusEffects) {
    if (effect.type === StatusEffectType.HASTE) {
      // Haste effect: grants bonus movement on even-numbered checks (0, 2, 4...)
      const counter = effect.movementSkipCounter ?? 0;
      effect.movementSkipCounter = counter + 1;

      // Grant bonus on even counts (every other movement gets doubled)
      if (counter % 2 === 0) {
        return true;
      }
    }
  }

  return false;
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

// ==========================================
// DEATH DROP SYSTEM
// ==========================================

/**
 * Find a valid position to drop a collectible
 * First tries the death location, then adjacent tiles (cardinal, then diagonal)
 */
function findDropPosition(
  x: number,
  y: number,
  gameState: GameState
): { x: number; y: number } | null {
  const { width, height, tiles, collectibles } = gameState.puzzle;

  // Helper to check if a position is valid for dropping
  const isValidDropPosition = (checkX: number, checkY: number): boolean => {
    // Must be in bounds
    if (checkX < 0 || checkX >= width || checkY < 0 || checkY >= height) {
      return false;
    }

    // Must have a valid tile (not null, not wall)
    const tile = tiles[checkY]?.[checkX];
    if (!tile || tile.type === TileTypeEnum.WALL) {
      return false;
    }

    // Check if tile prevents placement
    if (tile.preventPlacement) {
      return false;
    }

    // Check if there's already an uncollected collectible at this position
    const existingCollectible = collectibles.find(
      c => !c.collected && c.x === checkX && c.y === checkY
    );
    if (existingCollectible) {
      return false;
    }

    return true;
  };

  // Try death location first
  if (isValidDropPosition(x, y)) {
    return { x, y };
  }

  // Try cardinal directions (N, E, S, W)
  const cardinalOffsets = [
    { dx: 0, dy: -1 }, // North
    { dx: 1, dy: 0 },  // East
    { dx: 0, dy: 1 },  // South
    { dx: -1, dy: 0 }, // West
  ];

  for (const offset of cardinalOffsets) {
    const checkX = x + offset.dx;
    const checkY = y + offset.dy;
    if (isValidDropPosition(checkX, checkY)) {
      return { x: checkX, y: checkY };
    }
  }

  // Try diagonal directions (NE, SE, SW, NW)
  const diagonalOffsets = [
    { dx: 1, dy: -1 },  // Northeast
    { dx: 1, dy: 1 },   // Southeast
    { dx: -1, dy: 1 },  // Southwest
    { dx: -1, dy: -1 }, // Northwest
  ];

  for (const offset of diagonalOffsets) {
    const checkX = x + offset.dx;
    const checkY = y + offset.dy;
    if (isValidDropPosition(checkX, checkY)) {
      return { x: checkX, y: checkY };
    }
  }

  // No valid position found
  return null;
}

/**
 * Handle death drop for an entity
 * Spawns a collectible if the entity has droppedCollectibleId configured
 */
export function handleEntityDeathDrop(
  entity: PlacedCharacter | PlacedEnemy,
  isEnemy: boolean,
  gameState: GameState
): void {
  // Get the entity's data to check for droppedCollectibleId
  let droppedCollectibleId: string | undefined;

  if (isEnemy) {
    const enemyData = getEnemy((entity as PlacedEnemy).enemyId);
    droppedCollectibleId = enemyData?.droppedCollectibleId;
  } else {
    const charData = getCharacter((entity as PlacedCharacter).characterId);
    droppedCollectibleId = charData?.droppedCollectibleId;
  }

  // No collectible to drop
  if (!droppedCollectibleId) {
    return;
  }

  // Load the collectible data to make sure it exists
  const collectibleData = loadCollectible(droppedCollectibleId);
  if (!collectibleData) {
    console.warn(`Death drop collectible not found: ${droppedCollectibleId}`);
    return;
  }

  // Find a valid drop position
  const dropPos = findDropPosition(entity.x, entity.y, gameState);
  if (!dropPos) {
    console.warn(`No valid drop position found for collectible near (${entity.x}, ${entity.y})`);
    return;
  }

  // Create the new collectible instance
  const newCollectible: PlacedCollectible = {
    collectibleId: droppedCollectibleId,
    x: dropPos.x,
    y: dropPos.y,
    collected: false,
    instanceId: `drop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  };

  // Add to puzzle collectibles
  gameState.puzzle.collectibles.push(newCollectible);
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
    const wasAlive = !gameState.placedCharacters[i].dead;
    if (wasAlive) {
      gameState.placedCharacters[i] = processEntityStatusEffects(
        gameState.placedCharacters[i],
        'start',
        gameState.currentTurn
      ) as PlacedCharacter;

      // Check if entity died from DOT and handle death drop
      if (gameState.placedCharacters[i].dead) {
        handleEntityDeathDrop(gameState.placedCharacters[i], false, gameState);
      }
    }
  }

  // Process enemies
  for (let i = 0; i < gameState.puzzle.enemies.length; i++) {
    const wasAlive = !gameState.puzzle.enemies[i].dead;
    if (wasAlive) {
      gameState.puzzle.enemies[i] = processEntityStatusEffects(
        gameState.puzzle.enemies[i],
        'start',
        gameState.currentTurn
      ) as PlacedEnemy;

      // Check if entity died from DOT and handle death drop
      if (gameState.puzzle.enemies[i].dead) {
        handleEntityDeathDrop(gameState.puzzle.enemies[i], true, gameState);
      }
    }
  }
}

/**
 * Process status effects for all entities at turn end
 */
function processAllStatusEffectsTurnEnd(gameState: GameState): void {
  // Process characters
  for (let i = 0; i < gameState.placedCharacters.length; i++) {
    const wasAlive = !gameState.placedCharacters[i].dead;
    if (wasAlive) {
      gameState.placedCharacters[i] = processEntityStatusEffects(
        gameState.placedCharacters[i],
        'end',
        gameState.currentTurn
      ) as PlacedCharacter;

      // Check if entity died from DOT and handle death drop
      if (gameState.placedCharacters[i].dead) {
        handleEntityDeathDrop(gameState.placedCharacters[i], false, gameState);
      }
    }
  }

  // Process enemies
  for (let i = 0; i < gameState.puzzle.enemies.length; i++) {
    const wasAlive = !gameState.puzzle.enemies[i].dead;
    if (wasAlive) {
      gameState.puzzle.enemies[i] = processEntityStatusEffects(
        gameState.puzzle.enemies[i],
        'end',
        gameState.currentTurn
      ) as PlacedEnemy;

      // Check if entity died from DOT and handle death drop
      if (gameState.puzzle.enemies[i].dead) {
        handleEntityDeathDrop(gameState.puzzle.enemies[i], true, gameState);
      }
    }
  }
}

/**
 * Decrement spell cooldowns for all entities at turn end
 */
function decrementSpellCooldowns(gameState: GameState): void {
  // Decrement character cooldowns
  for (const character of gameState.placedCharacters) {
    if (character.spellCooldowns) {
      for (const spellId of Object.keys(character.spellCooldowns)) {
        if (character.spellCooldowns[spellId] > 0) {
          character.spellCooldowns[spellId]--;
        }
      }
    }
  }

  // Decrement enemy cooldowns
  for (const enemy of gameState.puzzle.enemies) {
    if (enemy.spellCooldowns) {
      for (const spellId of Object.keys(enemy.spellCooldowns)) {
        if (enemy.spellCooldowns[spellId] > 0) {
          enemy.spellCooldowns[spellId]--;
        }
      }
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

  // Snapshot enemy positions BEFORE they move for projectile collision detection
  // This ensures projectiles hit enemies that are leaving a tile on the same turn
  // the projectile arrives (projectile wins ties)
  const enemyPositionsBeforeMove = gameState.puzzle.enemies.map(e => ({
    enemyId: e.enemyId,
    x: e.x,
    y: e.y,
    dead: e.dead,
  }));
  gameState.enemyPositionsBeforeMove = enemyPositionsBeforeMove;

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
            spellCooldowns: newEnemy.spellCooldowns,
          };

          const updatedChar = executeAction(tempChar, firstAction, gameState);

          newEnemy.x = updatedChar.x;
          newEnemy.y = updatedChar.y;
          newEnemy.facing = updatedChar.facing;
          newEnemy.currentHealth = updatedChar.currentHealth;
          newEnemy.dead = updatedChar.dead;
          newEnemy.spellCooldowns = updatedChar.spellCooldowns;
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
        spellCooldowns: newEnemy.spellCooldowns,
      };

      // Execute the current action
      const updatedChar = executeAction(tempChar, currentAction, gameState);

      // Update enemy from temp character
      newEnemy.x = updatedChar.x;
      newEnemy.y = updatedChar.y;
      newEnemy.facing = updatedChar.facing;
      newEnemy.currentHealth = updatedChar.currentHealth;
      newEnemy.dead = updatedChar.dead;
      newEnemy.spellCooldowns = updatedChar.spellCooldowns;
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
            spellCooldowns: newEnemy.spellCooldowns,
          };

          const parallelResult = executeAction(parallelTempChar, nextAction, gameState);

          newEnemy.x = parallelResult.x;
          newEnemy.y = parallelResult.y;
          newEnemy.facing = parallelResult.facing;
          newEnemy.currentHealth = parallelResult.currentHealth;
          newEnemy.dead = parallelResult.dead;
          newEnemy.spellCooldowns = parallelResult.spellCooldowns;
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
        spellCooldowns: enemy.spellCooldowns,
      };
      evaluateTriggers(tempCharForTrigger, gameState);

      // Copy back any changes from trigger execution
      enemy.x = tempCharForTrigger.x;
      enemy.y = tempCharForTrigger.y;
      enemy.facing = tempCharForTrigger.facing;
      enemy.currentHealth = tempCharForTrigger.currentHealth;
      enemy.dead = tempCharForTrigger.dead;
      enemy.spellCooldowns = tempCharForTrigger.spellCooldowns;
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
        spellCooldowns: enemy.spellCooldowns,
      };
      evaluateTriggers(tempCharForTrigger, gameState);

      // Copy back any changes from trigger execution
      enemy.x = tempCharForTrigger.x;
      enemy.y = tempCharForTrigger.y;
      enemy.facing = tempCharForTrigger.facing;
      enemy.currentHealth = tempCharForTrigger.currentHealth;
      enemy.dead = tempCharForTrigger.dead;
      enemy.spellCooldowns = tempCharForTrigger.spellCooldowns;
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

  // Decrement spell cooldowns at end of turn
  // This happens AFTER actions, so cooldown of N means "skip N turns"
  decrementSpellCooldowns(gameState);

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

  // Check defeat conditions (early failure detection)
  if (checkDefeatConditions(gameState)) {
    gameState.gameStatus = 'defeat';
    return;
  }

  // Check if all characters are dead
  const allCharactersDead = gameState.placedCharacters.every((c) => c.dead);
  if (allCharactersDead && gameState.placedCharacters.length > 0) {
    gameState.gameStatus = 'defeat';
  }
}

/**
 * Check if victory conditions are met
 * Exported so it can be called from animation loop when projectiles kill enemies
 */
export function checkVictoryConditions(gameState: GameState): boolean {
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

      case 'reach_goal':
        // Check if any character is on a goal tile
        const hasReachedGoal = gameState.placedCharacters.some((char) => {
          if (char.dead) return false;
          const tile = gameState.puzzle.tiles[char.y]?.[char.x];
          return tile?.type === TileType.GOAL;
        });
        if (!hasReachedGoal) return false;
        break;

      case 'survive_turns':
        // Must survive for at least X turns - check at turn end
        const surviveTurns = condition.params?.turns ?? 10;
        if (gameState.currentTurn < surviveTurns) return false;
        // Also need at least one character alive
        const hasAliveCharacter = gameState.placedCharacters.some((c) => !c.dead);
        if (!hasAliveCharacter) return false;
        break;

      case 'win_in_turns':
        // Must complete within X turns (checked elsewhere as a constraint)
        // This condition passes if we're still within the turn limit
        const maxTurns = condition.params?.turns ?? 10;
        if (gameState.currentTurn > maxTurns) return false;
        break;

      case 'max_characters':
        // Must use at most X characters (already enforced by placement, but verify)
        const maxChars = condition.params?.characterCount ?? 1;
        const usedChars = gameState.placedCharacters.length;
        if (usedChars > maxChars) return false;
        break;

      case 'characters_alive':
        // Must have at least X characters alive at the end
        const minAlive = condition.params?.characterCount ?? 1;
        const aliveCount = gameState.placedCharacters.filter((c) => !c.dead).length;
        if (aliveCount < minAlive) return false;
        break;

      case 'collect_keys':
        // Must collect all collectibles that have win_key effects
        // Load collectible data to check which ones are keys
        const keyCollectibles = gameState.puzzle.collectibles.filter(c => {
          if (!c.collectibleId) return false;
          const collectibleData = loadCollectible(c.collectibleId);
          if (!collectibleData) return false;
          return collectibleData.effects.some(e => e.type === 'win_key');
        });
        // All key collectibles must be collected
        const allKeysCollected = keyCollectibles.every(c => c.collected);
        if (!allKeysCollected) return false;
        break;
    }
  }

  return true;
}

/**
 * Check if the player has violated any win conditions (early defeat detection)
 * Returns true if any condition is impossible to satisfy
 */
function checkDefeatConditions(gameState: GameState): boolean {
  for (const condition of gameState.puzzle.winConditions) {
    switch (condition.type) {
      case 'win_in_turns':
        // Exceeded turn limit
        const maxTurns = condition.params?.turns ?? 10;
        if (gameState.currentTurn > maxTurns) return true;
        break;

      case 'characters_alive':
        // Can't possibly have enough characters alive anymore
        const minAlive = condition.params?.characterCount ?? 1;
        const aliveCount = gameState.placedCharacters.filter((c) => !c.dead).length;
        if (aliveCount < minAlive) return true;
        break;
    }
  }

  return false;
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
 * In headless mode, projectiles resolve instantly to their targets
 */
export function updateProjectiles(gameState: GameState): void {
  if (!gameState.activeProjectiles || gameState.activeProjectiles.length === 0) {
    return;
  }

  // In headless mode (solver/validator), resolve projectiles instantly
  if (gameState.headlessMode) {
    updateProjectilesHeadless(gameState);
    return;
  }

  const now = Date.now();
  const projectilesToRemove: string[] = [];

  for (const proj of gameState.activeProjectiles) {
    if (!proj.active) {
      projectilesToRemove.push(proj.id);
      continue;
    }

    // Handle homing projectiles - update target to track moving entity
    if (proj.isHoming && proj.targetEntityId) {
      let targetEntity: { x: number; y: number; dead?: boolean } | undefined;

      if (proj.targetIsEnemy) {
        // Find enemy by ID
        targetEntity = gameState.puzzle.enemies.find(e => e.enemyId === proj.targetEntityId);
      } else {
        // Find character by ID
        targetEntity = gameState.placedCharacters.find(c => c.characterId === proj.targetEntityId);
      }

      if (targetEntity && !targetEntity.dead) {
        // Update target position to track the entity
        // Just update the target coordinates - don't reset start position or time
        proj.targetX = targetEntity.x;
        proj.targetY = targetEntity.y;
      } else {
        // Target died or not found - disable homing, continue on current trajectory
        proj.isHoming = false;
      }
    }

    // Calculate position based on whether this is a homing projectile or not
    let newX: number;
    let newY: number;
    let reachedTarget = false;

    if (proj.isHoming) {
      // Homing projectiles: move towards current target from current position
      // Calculate direction to target from CURRENT position
      const dx = proj.targetX - proj.x;
      const dy = proj.targetY - proj.y;
      const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

      // Move a fixed amount based on speed and frame time (assume ~16ms per frame)
      // Convert tiles/turn to tiles/second for animation (1 turn = 0.8 seconds)
      const frameTime = 0.016; // 16ms in seconds
      const speedTilesPerSecond = (proj.speed || 4) / 0.8;
      const moveDistance = speedTilesPerSecond * frameTime;

      if (distanceToTarget <= moveDistance || distanceToTarget < 0.1) {
        // Close enough to target - snap to target
        newX = proj.targetX;
        newY = proj.targetY;
        reachedTarget = true;
      } else {
        // Move towards target
        const normalizedDx = dx / distanceToTarget;
        const normalizedDy = dy / distanceToTarget;
        newX = proj.x + normalizedDx * moveDistance;
        newY = proj.y + normalizedDy * moveDistance;
      }

      // Update direction for sprite rotation
      if (dx !== 0 || dy !== 0) {
        proj.direction = calculateDirectionTo(proj.x, proj.y, proj.targetX, proj.targetY);
      }
    } else if (proj.tilePath && proj.tilePath.length > 0) {
      // TILE-BASED MOVEMENT: Use pre-computed tile path for deterministic collision
      // This ensures diagonal projectiles always hit the correct tiles

      const tileEntryTime = proj.tileEntryTime ?? proj.startTime;
      const timeSinceTileEntry = (now - tileEntryTime) / 1000; // seconds
      // Convert tiles/turn to tiles/second for animation (1 turn = 0.8 seconds)
      const speedTilesPerSecond = (proj.speed || 4) / 0.8;
      const tileTransitTime = 1 / speedTilesPerSecond; // Time to cross one tile (seconds)

      // Calculate how many tiles we should advance this frame
      const tilesAdvanced = Math.floor(timeSinceTileEntry / tileTransitTime);
      const newTileIndex = Math.min(
        (proj.currentTileIndex ?? 0) + tilesAdvanced,
        proj.tilePath.length - 1
      );

      // Check if we've reached the end of the path
      if (newTileIndex >= proj.tilePath.length - 1) {
        reachedTarget = true;
        const finalTile = proj.tilePath[proj.tilePath.length - 1];
        newX = finalTile.x;
        newY = finalTile.y;
      } else {
        // Interpolate visual position between current tile and next tile
        const currentTile = proj.tilePath[newTileIndex];
        const nextTile = proj.tilePath[Math.min(newTileIndex + 1, proj.tilePath.length - 1)];

        // Check if next tile is a wall - if so, limit interpolation to not enter it
        const nextTileIsWall = !isInBounds(nextTile.x, nextTile.y, gameState.puzzle.width, gameState.puzzle.height) ||
            gameState.puzzle.tiles[nextTile.y]?.[nextTile.x]?.type === TileType.WALL ||
            gameState.puzzle.tiles[nextTile.y]?.[nextTile.x] === null;

        // Progress within current tile (0-1)
        const tileProgress = (timeSinceTileEntry % tileTransitTime) / tileTransitTime;

        if (nextTileIsWall) {
          // Interpolate only up to the edge of the current tile (50% toward wall)
          // This prevents visual clipping while still showing movement toward the wall
          const clampedProgress = Math.min(tileProgress, 0.4);
          newX = currentTile.x + (nextTile.x - currentTile.x) * clampedProgress;
          newY = currentTile.y + (nextTile.y - currentTile.y) * clampedProgress;
        } else {
          newX = currentTile.x + (nextTile.x - currentTile.x) * tileProgress;
          newY = currentTile.y + (nextTile.y - currentTile.y) * tileProgress;
        }
      }

      // Update tile index and entry time if we moved to a new tile
      if (newTileIndex > (proj.currentTileIndex ?? 0)) {
        proj.currentTileIndex = newTileIndex;
        proj.tileEntryTime = now - ((timeSinceTileEntry % tileTransitTime) * 1000);
      }

      // Update direction for sprite rotation
      const dx = proj.targetX - proj.startX;
      const dy = proj.targetY - proj.startY;
      if (dx !== 0 || dy !== 0) {
        proj.direction = calculateDirectionTo(proj.startX, proj.startY, proj.targetX, proj.targetY);
      }
    } else {
      // LEGACY: Non-homing projectiles without tilePath (shouldn't happen for new projectiles)
      const elapsed = (now - proj.startTime) / 1000; // seconds
      // Convert tiles/turn to tiles/second for animation (1 turn = 0.8 seconds)
      const speedTilesPerSecond = (proj.speed || 4) / 0.8;
      const distanceTraveled = speedTilesPerSecond * elapsed;

      const dx = proj.targetX - proj.startX;
      const dy = proj.targetY - proj.startY;
      const totalDistance = Math.sqrt(dx * dx + dy * dy);

      if (distanceTraveled >= totalDistance) {
        reachedTarget = true;
        newX = proj.targetX;
        newY = proj.targetY;
      } else {
        const progress = distanceTraveled / totalDistance;
        newX = proj.startX + dx * progress;
        newY = proj.startY + dy * progress;
      }

      // Update direction for sprite rotation
      if (dx !== 0 || dy !== 0) {
        proj.direction = calculateDirectionTo(proj.startX, proj.startY, proj.targetX, proj.targetY);
      }
    }

    // For non-homing projectiles that reached max range, deactivate
    // (Homing projectiles should continue to collision check even when "at target")
    if (reachedTarget && !proj.isHoming) {
      // Projectile reached target/max range
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

    // Save previous tile index for detecting new tiles entered
    const prevTileIndex = proj.currentTileIndex ?? 0;

    // Update position before collision check
    proj.x = newX;
    proj.y = newY;

    // Determine tiles to check for collision
    // For tile-based projectiles, use the pre-computed path
    // For homing/legacy projectiles, calculate dynamically
    let tilesAlongPath: Array<{ x: number; y: number }>;
    let newTiles: Array<{ x: number; y: number }>;

    if (proj.tilePath && proj.tilePath.length > 0) {
      // TILE-BASED: Use pre-computed path up to current tile index
      tilesAlongPath = proj.tilePath.slice(0, (proj.currentTileIndex ?? 0) + 1);

      // New tiles are those from prevTileIndex to currentTileIndex (exclusive of tiles already checked)
      newTiles = proj.tilePath.slice(prevTileIndex, (proj.currentTileIndex ?? 0) + 1);
    } else {
      // LEGACY/HOMING: Calculate tiles dynamically
      tilesAlongPath = getTilesAlongLine(proj.startX, proj.startY, newX, newY);

      // Use checkedTiles record for legacy tracking
      if (!proj.tilePath) {
        // Initialize checked tiles for legacy projectiles
        const checkedTiles: Record<string, boolean> = {};
        newTiles = tilesAlongPath.filter(t => {
          const key = `${t.x},${t.y}`;
          if (checkedTiles[key]) {
            return false;
          }
          checkedTiles[key] = true;
          return true;
        });
      } else {
        newTiles = tilesAlongPath;
      }
    }

    // Check collision with walls - check all tiles along path
    let hitWallTile: { x: number; y: number } | null = null;
    for (const tile of tilesAlongPath) {
      const tileX = tile.x;
      const tileY = tile.y;
      const isWall = !isInBounds(tileX, tileY, gameState.puzzle.width, gameState.puzzle.height) ||
          gameState.puzzle.tiles[tileY]?.[tileX]?.type === TileType.WALL ||
          gameState.puzzle.tiles[tileY]?.[tileX] === null;
      if (isWall) {
        hitWallTile = tile;
        break;
      }
    }

    // Fall back to final tile check if no tiles along path (same tile)
    const finalTileX = Math.floor(newX);
    const finalTileY = Math.floor(newY);
    if (!hitWallTile && tilesAlongPath.length === 0) {
      const isWall = !isInBounds(finalTileX, finalTileY, gameState.puzzle.width, gameState.puzzle.height) ||
          gameState.puzzle.tiles[finalTileY]?.[finalTileX]?.type === TileType.WALL ||
          gameState.puzzle.tiles[finalTileY]?.[finalTileX] === null;
      if (isWall) {
        hitWallTile = { x: finalTileX, y: finalTileY };
      }
    }

    if (hitWallTile) {
      // Find the last valid tile before the wall (for bounce positioning)
      let lastValidTile: { x: number; y: number } | null = null;
      for (const tile of tilesAlongPath) {
        if (tile.x === hitWallTile.x && tile.y === hitWallTile.y) {
          break;
        }
        // Check if this tile is valid (not a wall)
        const tileIsWall = !isInBounds(tile.x, tile.y, gameState.puzzle.width, gameState.puzzle.height) ||
            gameState.puzzle.tiles[tile.y]?.[tile.x]?.type === TileType.WALL ||
            gameState.puzzle.tiles[tile.y]?.[tile.x] === null;
        if (!tileIsWall) {
          lastValidTile = tile;
        }
      }

      // Homing projectiles don't bounce - they just deactivate if they hit a wall
      if (proj.isHoming) {
        proj.active = false;
        projectilesToRemove.push(proj.id);
        continue;
      }

      // Check if projectile should bounce off walls
      const canBounce = proj.bounceOffWalls &&
                        (proj.bounceCount ?? 0) < (proj.maxBounces ?? 3);

      if (canBounce) {
        // Perform bounce based on configured behavior
        proj.bounceCount = (proj.bounceCount ?? 0) + 1;

        // Calculate current direction vector
        const dirX = proj.targetX - proj.startX;
        const dirY = proj.targetY - proj.startY;
        const dirLength = Math.sqrt(dirX * dirX + dirY * dirY);
        const normalizedDirX = dirX / dirLength;
        const normalizedDirY = dirY / dirLength;

        let newDirX = normalizedDirX;
        let newDirY = normalizedDirY;

        const bounceBehavior = proj.bounceBehavior || 'reflect';

        switch (bounceBehavior) {
          case 'reflect': {
            // Determine which axis to reflect based on wall position
            const prevTileX = Math.floor(proj.x);
            const prevTileY = Math.floor(proj.y);
            const testTileX = Math.floor(proj.x + normalizedDirX * 0.5);
            const testTileY = Math.floor(proj.y + normalizedDirY * 0.5);

            const hitHorizontalWall = testTileY !== prevTileY &&
              (!isInBounds(testTileX, testTileY, gameState.puzzle.width, gameState.puzzle.height) ||
               gameState.puzzle.tiles[testTileY]?.[prevTileX]?.type === TileType.WALL ||
               gameState.puzzle.tiles[testTileY]?.[prevTileX] === null);

            const hitVerticalWall = testTileX !== prevTileX &&
              (!isInBounds(testTileX, testTileY, gameState.puzzle.width, gameState.puzzle.height) ||
               gameState.puzzle.tiles[prevTileY]?.[testTileX]?.type === TileType.WALL ||
               gameState.puzzle.tiles[prevTileY]?.[testTileX] === null);

            if (hitHorizontalWall) newDirY = -newDirY;
            if (hitVerticalWall) newDirX = -newDirX;
            break;
          }

          case 'turn_around': {
            // 180 degree turn - go back the way it came
            newDirX = -normalizedDirX;
            newDirY = -normalizedDirY;
            break;
          }

          case 'turn_right': {
            // Turn clockwise by configured degrees (45, 90, or 135)
            const currentDirRight = getDirectionFromVector(normalizedDirX, normalizedDirY);
            const turnDegreesRight = proj.bounceTurnDegrees ?? 90;
            const newDirRight = turnRight(currentDirRight, turnDegreesRight);
            const offsetRight = getDirectionOffset(newDirRight);
            newDirX = offsetRight.dx;
            newDirY = offsetRight.dy;
            break;
          }

          case 'turn_left': {
            // Turn counter-clockwise by configured degrees (45, 90, or 135)
            const currentDirLeft = getDirectionFromVector(normalizedDirX, normalizedDirY);
            const turnDegreesLeft = proj.bounceTurnDegrees ?? 90;
            const newDirLeft = turnLeft(currentDirLeft, turnDegreesLeft);
            const offsetLeft = getDirectionOffset(newDirLeft);
            newDirX = offsetLeft.dx;
            newDirY = offsetLeft.dy;
            break;
          }

          case 'random': {
            // Pick a random direction (one of 8 cardinal/diagonal)
            const directions = [
              { dx: 0, dy: -1 },  // N
              { dx: 1, dy: -1 },  // NE
              { dx: 1, dy: 0 },   // E
              { dx: 1, dy: 1 },   // SE
              { dx: 0, dy: 1 },   // S
              { dx: -1, dy: 1 },  // SW
              { dx: -1, dy: 0 },  // W
              { dx: -1, dy: -1 }, // NW
            ];
            // Filter out the direction we came from
            const validDirs = directions.filter(d =>
              !(Math.abs(d.dx - normalizedDirX) < 0.5 && Math.abs(d.dy - normalizedDirY) < 0.5)
            );
            const randomDir = validDirs[Math.floor(Math.random() * validDirs.length)];
            newDirX = randomDir.dx;
            newDirY = randomDir.dy;
            break;
          }
        }

        // Update projectile for new bounced path
        // Position the projectile at the last valid tile before the wall
        const bounceX = lastValidTile ? lastValidTile.x : proj.x;
        const bounceY = lastValidTile ? lastValidTile.y : proj.y;

        // Check if the new direction immediately hits a wall (adjacent tile is wall)
        const nextTileX = Math.round(bounceX + newDirX);
        const nextTileY = Math.round(bounceY + newDirY);
        const nextTileIsWall = !isInBounds(nextTileX, nextTileY, gameState.puzzle.width, gameState.puzzle.height) ||
            gameState.puzzle.tiles[nextTileY]?.[nextTileX]?.type === TileType.WALL ||
            gameState.puzzle.tiles[nextTileY]?.[nextTileX] === null;

        if (nextTileIsWall) {
          // New direction also hits a wall - deactivate projectile
          proj.active = false;
          projectilesToRemove.push(proj.id);
          continue;
        }

        const remainingRange = proj.attackData.range ?? 5;
        proj.x = bounceX;
        proj.y = bounceY;
        proj.startX = bounceX;
        proj.startY = bounceY;
        proj.targetX = bounceX + newDirX * remainingRange;
        proj.targetY = bounceY + newDirY * remainingRange;
        proj.startTime = now; // Reset timing for smooth continuation

        // Recompute tile path for the new bounced trajectory with wall lookahead
        // This ensures the path stops BEFORE any wall, preventing visual clipping
        proj.tilePath = computeTilePathWithWallLookahead(bounceX, bounceY, proj.targetX, proj.targetY, gameState);
        proj.currentTileIndex = 0;
        proj.tileEntryTime = now;

        // Update direction for sprite rendering
        proj.direction = getDirectionFromVector(newDirX, newDirY);
      } else {
        // Hit wall - deactivate projectile (no bounce or max bounces reached)
        proj.active = false;
        projectilesToRemove.push(proj.id);
        continue;
      }
    }

    // Check collision based on who fired the projectile
    // Healing projectiles hit allies, damage projectiles hit enemies
    const isHealingProjectile = (proj.attackData.healing ?? 0) > 0;

    // Use newTiles for entity collision checks (only tiles we haven't checked yet)
    // This prevents hitting the same entity multiple times per frame
    const tilesToCheck = [...newTiles];
    if (tilesToCheck.length === 0 ||
        (tilesToCheck[tilesToCheck.length - 1].x !== finalTileX ||
         tilesToCheck[tilesToCheck.length - 1].y !== finalTileY)) {
      // Add final tile if not already included
      const finalKey = `${finalTileX},${finalTileY}`;
      if (!proj.checkedTiles?.[finalKey]) {
        tilesToCheck.push({ x: finalTileX, y: finalTileY });
      }
    }

    // If fired by a character
    let entityHitAndStopped = false;
    if (proj.sourceCharacterId && !entityHitAndStopped) {
      if (isHealingProjectile) {
        // Healing projectile - check for ally character hits along entire path
        for (const checkTile of tilesToCheck) {
          const tileX = checkTile.x;
          const tileY = checkTile.y;

          const hitAlly = gameState.placedCharacters.find(
            c => !c.dead &&
                 Math.floor(c.x) === tileX &&
                 Math.floor(c.y) === tileY &&
                 c.characterId !== proj.sourceCharacterId && // Don't heal self
                 !(proj.hitEntityIds?.includes(c.characterId)) // Skip already hit entities (for piercing)
          );

          if (hitAlly) {
            // Track that we hit this entity (for piercing projectiles)
            if (!proj.hitEntityIds) proj.hitEntityIds = [];
            proj.hitEntityIds.push(hitAlly.characterId);

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
              entityHitAndStopped = true;
              break;
            }
          }
        }
      } else {
        // Damage projectile - check for enemy hits along entire path
        // Use pre-move positions first (projectile wins ties), then current positions
        for (const checkTile of tilesToCheck) {
          const tileX = checkTile.x;
          const tileY = checkTile.y;

          // First check pre-move positions (enemies that WERE at this tile)
          let hitEnemyId: string | undefined;
          if (gameState.enemyPositionsBeforeMove) {
            const preMoveEnemy = gameState.enemyPositionsBeforeMove.find(
              e => !e.dead &&
                   Math.floor(e.x) === tileX &&
                   Math.floor(e.y) === tileY &&
                   !(proj.hitEntityIds?.includes(e.enemyId))
            );
            if (preMoveEnemy) {
              hitEnemyId = preMoveEnemy.enemyId;
            }
          }

          // If no pre-move hit, check current positions
          if (!hitEnemyId) {
            const currentEnemy = gameState.puzzle.enemies.find(
              e => !e.dead &&
                   Math.floor(e.x) === tileX &&
                   Math.floor(e.y) === tileY &&
                   !(proj.hitEntityIds?.includes(e.enemyId))
            );
            if (currentEnemy) {
              hitEnemyId = currentEnemy.enemyId;
            }
          }

          // Apply damage if we found a hit
          if (hitEnemyId) {
            const hitEnemy = gameState.puzzle.enemies.find(e => e.enemyId === hitEnemyId);
            if (hitEnemy && !hitEnemy.dead) {
              // Track that we hit this entity (for piercing projectiles)
              if (!proj.hitEntityIds) proj.hitEntityIds = [];
              proj.hitEntityIds.push(hitEnemy.enemyId);

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
                  // Handle death drop
                  handleEntityDeathDrop(hitEnemy, true, gameState);
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
                entityHitAndStopped = true;
                break;
              }
            }
          }
        }
      }
    }

    if (entityHitAndStopped) continue;

    // If fired by an enemy
    if (proj.sourceEnemyId && !entityHitAndStopped) {
      if (isHealingProjectile) {
        // Healing projectile - check for ally enemy hits along entire path
        for (const checkTile of tilesToCheck) {
          const tileX = checkTile.x;
          const tileY = checkTile.y;

          const hitAllyEnemy = gameState.puzzle.enemies.find(
            e => !e.dead &&
                 Math.floor(e.x) === tileX &&
                 Math.floor(e.y) === tileY &&
                 e.enemyId !== proj.sourceEnemyId && // Don't heal self
                 !(proj.hitEntityIds?.includes(e.enemyId)) // Skip already hit entities (for piercing)
          );

          if (hitAllyEnemy) {
            // Track that we hit this entity (for piercing projectiles)
            if (!proj.hitEntityIds) proj.hitEntityIds = [];
            proj.hitEntityIds.push(hitAllyEnemy.enemyId);

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
              entityHitAndStopped = true;
              break;
            }
          }
        }
      } else {
        // Damage projectile - check for character hits along entire path
        for (const checkTile of tilesToCheck) {
          const tileX = checkTile.x;
          const tileY = checkTile.y;

          const hitCharacter = gameState.placedCharacters.find(
            c => !c.dead &&
                 Math.floor(c.x) === tileX &&
                 Math.floor(c.y) === tileY &&
                 !(proj.hitEntityIds?.includes(c.characterId)) // Skip already hit entities (for piercing)
          );

          if (hitCharacter) {
            // Track that we hit this entity (for piercing projectiles)
            if (!proj.hitEntityIds) proj.hitEntityIds = [];
            proj.hitEntityIds.push(hitCharacter.characterId);

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
                // Handle death drop
                handleEntityDeathDrop(hitCharacter, false, gameState);
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
              entityHitAndStopped = true;
              break;
            }
          }
        }
      }
    }

    // For homing projectiles that reached target but didn't hit anything, deactivate
    if (reachedTarget && proj.isHoming) {
      proj.active = false;
      projectilesToRemove.push(proj.id);
    }
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
 * Update projectiles in headless mode (turn-based movement for solver/validator)
 * Projectiles move a fixed number of tiles per turn based on their speed
 * Speed is stored directly as tiles per turn (no conversion needed)
 */
function updateProjectilesHeadless(gameState: GameState): void {
  if (!gameState.activeProjectiles) return;

  const projectilesToRemove: string[] = [];

  for (const proj of gameState.activeProjectiles) {
    if (!proj.active) {
      projectilesToRemove.push(proj.id);
      continue;
    }

    const isHealingProjectile = (proj.attackData.healing ?? 0) > 0;
    const range = proj.attackData.range || 10;
    const tilesPerTurn = proj.speed || 4; // Speed is now directly tiles per turn

    let hitSomething = false;
    let shouldRemove = false;

    // For homing projectiles, move toward target
    if (proj.isHoming && proj.targetEntityId) {
      let targetEntity: { x: number; y: number; dead?: boolean } | undefined;
      if (proj.targetIsEnemy) {
        targetEntity = gameState.puzzle.enemies.find(e => e.enemyId === proj.targetEntityId && !e.dead);
      } else {
        targetEntity = gameState.placedCharacters.find(c => c.characterId === proj.targetEntityId && !c.dead);
      }

      if (targetEntity) {
        // Calculate distance to target
        const dx = targetEntity.x - proj.x;
        const dy = targetEntity.y - proj.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if we reach the target this turn
        if (distance <= tilesPerTurn) {
          // Hit the target
          if (proj.sourceCharacterId && proj.targetIsEnemy) {
            // Character's homing projectile hitting enemy
            const enemy = targetEntity as PlacedEnemy;
            if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
              triggerAOEExplosion(enemy.x, enemy.y, proj.attackData,
                proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
            } else {
              const damage = proj.attackData.damage ?? 0;
              enemy.currentHealth -= damage;
              wakeFromSleep(enemy);
              if (enemy.currentHealth <= 0) {
                enemy.dead = true;
                handleEntityDeathDrop(enemy, true, gameState);
              }
              if (proj.spellAssetId && !enemy.dead) {
                applyStatusEffectFromProjectile(enemy, proj.spellAssetId,
                  proj.sourceCharacterId || 'unknown', false, gameState.currentTurn);
              }
            }
          } else if (proj.sourceEnemyId && !proj.targetIsEnemy) {
            // Enemy's homing projectile hitting character
            const char = targetEntity as PlacedCharacter;
            if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
              triggerAOEExplosion(char.x, char.y, proj.attackData,
                proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
            } else {
              const damage = proj.attackData.damage ?? 0;
              char.currentHealth -= damage;
              wakeFromSleep(char);
              if (char.currentHealth <= 0) {
                char.dead = true;
                handleEntityDeathDrop(char, false, gameState);
              }
              if (proj.spellAssetId && !char.dead) {
                applyStatusEffectFromProjectile(char, proj.spellAssetId,
                  proj.sourceEnemyId || 'unknown', true, gameState.currentTurn);
              }
            }
          }
          shouldRemove = true;
        } else {
          // Move toward target but don't reach it yet
          const moveRatio = tilesPerTurn / distance;
          proj.x += dx * moveRatio;
          proj.y += dy * moveRatio;
          // Update target position for next turn (target may have moved)
          proj.targetX = targetEntity.x;
          proj.targetY = targetEntity.y;
        }
      } else {
        // Target died or not found - remove projectile
        shouldRemove = true;
      }
    } else {
      // Non-homing projectile: move along direction, check for hits
      const { dx, dy } = getDirectionOffset(proj.direction);
      const canPierce = proj.attackData.projectilePierces === true;

      // Initialize hit tracking if not present
      if (!proj.hitEntityIds) proj.hitEntityIds = [];
      const hitEntityIds = proj.hitEntityIds;

      // Calculate how far projectile has traveled from start
      const currentDist = Math.sqrt(
        Math.pow(proj.x - proj.startX, 2) + Math.pow(proj.y - proj.startY, 2)
      );
      const startTile = Math.floor(currentDist) + 1; // Next tile to check (1-indexed from start)
      const endTile = Math.min(startTile + tilesPerTurn - 1, range);
      let reachedEnd = false;
      let hitWall = false;

      // Debug logging
      if (gameState.headlessMode) {
        const enemyInfo = gameState.puzzle.enemies.filter(e => !e.dead).map(e => `${e.enemyId}@(${e.x},${e.y})`).join(', ');
        const preMoveInfo = gameState.enemyPositionsBeforeMove?.filter(e => !e.dead).map(e => `${e.enemyId}@(${e.x},${e.y})`).join(', ') || 'none';
        console.log(`[DEBUG] Turn ${gameState.currentTurn}: Projectile from (${proj.startX},${proj.startY}) dir=${proj.direction} dx=${dx} dy=${dy} | checking tiles ${startTile}-${endTile} | speed=${tilesPerTurn} range=${range}`);
        console.log(`[DEBUG]   Enemies current: ${enemyInfo}`);
        console.log(`[DEBUG]   Enemies pre-move: ${preMoveInfo}`);
      }

      for (let dist = startTile; dist <= endTile; dist++) {
        // Stop if we hit something and can't pierce
        if (hitSomething && !canPierce) {
          shouldRemove = true;
          break;
        }

        const checkX = Math.floor(proj.startX + dx * dist);
        const checkY = Math.floor(proj.startY + dy * dist);

        if (gameState.headlessMode) {
          console.log(`[DEBUG]   Checking tile dist=${dist}: (${checkX},${checkY})`);
        }

        // Check bounds
        if (!isInBounds(checkX, checkY, gameState.puzzle.width, gameState.puzzle.height)) {
          if (gameState.headlessMode) console.log(`[DEBUG]   -> Out of bounds, removing`);
          shouldRemove = true;
          break;
        }

        // Check wall
        const tile = gameState.puzzle.tiles[checkY]?.[checkX];
        if (!tile || tile.type === TileType.WALL) {
          if (gameState.headlessMode) console.log(`[DEBUG]   -> Hit wall at (${checkX},${checkY}), removing`);
          // Hit wall - trigger AOE if configured, then stop
          if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
            triggerAOEExplosion(checkX, checkY, proj.attackData,
              proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
          }
          hitWall = true;
          shouldRemove = true;
          break;
        }

        // Check for entity hits at this tile
        if (proj.sourceCharacterId) {
          // Character fired
          if (isHealingProjectile) {
            const hitAlly = gameState.placedCharacters.find(
              c => !c.dead && Math.floor(c.x) === checkX && Math.floor(c.y) === checkY &&
                   c.characterId !== proj.sourceCharacterId &&
                   !hitEntityIds.includes(c.characterId)
            );
            if (hitAlly) {
              hitEntityIds.push(hitAlly.characterId);
              if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
                triggerAOEExplosion(hitAlly.x, hitAlly.y, proj.attackData,
                  proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
              } else {
                const healing = proj.attackData.healing ?? 0;
                const charData = getCharacter(hitAlly.characterId);
                const maxHealth = charData?.health ?? hitAlly.currentHealth;
                hitAlly.currentHealth = Math.min(hitAlly.currentHealth + healing, maxHealth);
              }
              hitSomething = true;
              if (!canPierce) shouldRemove = true;
            }
          } else {
            // Check for enemy hits using pre-move positions first (projectile wins ties)
            // This ensures that if an enemy is leaving a tile on the same turn the
            // projectile arrives, the projectile still hits them
            let hitEnemyId: string | undefined;

            // First check pre-move positions (enemies that WERE at this tile)
            if (gameState.enemyPositionsBeforeMove) {
              const preMoveEnemy = gameState.enemyPositionsBeforeMove.find(
                e => !e.dead && Math.floor(e.x) === checkX && Math.floor(e.y) === checkY &&
                     !hitEntityIds.includes(e.enemyId)
              );
              if (preMoveEnemy) {
                hitEnemyId = preMoveEnemy.enemyId;
                if (gameState.headlessMode) console.log(`[DEBUG]   -> Found enemy ${preMoveEnemy.enemyId} at pre-move position`);
              }
            }

            // If no pre-move hit, check current positions (enemies that moved INTO this tile)
            if (!hitEnemyId) {
              const currentEnemy = gameState.puzzle.enemies.find(
                e => !e.dead && Math.floor(e.x) === checkX && Math.floor(e.y) === checkY &&
                     !hitEntityIds.includes(e.enemyId)
              );
              if (currentEnemy) {
                hitEnemyId = currentEnemy.enemyId;
                if (gameState.headlessMode) console.log(`[DEBUG]   -> Found enemy ${currentEnemy.enemyId} at current position`);
              }
            }

            if (gameState.headlessMode && !hitEnemyId) {
              console.log(`[DEBUG]   -> No enemy found at (${checkX},${checkY})`);
            }

            // Apply damage if we found a hit
            if (hitEnemyId) {
              const hitEnemy = gameState.puzzle.enemies.find(e => e.enemyId === hitEnemyId);
              if (gameState.headlessMode) {
                console.log(`[DEBUG]   -> Applying damage to ${hitEnemyId}, enemy found=${!!hitEnemy}, dead=${hitEnemy?.dead}`);
              }
              if (hitEnemy && !hitEnemy.dead) {
                hitEntityIds.push(hitEnemy.enemyId);
                if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
                  triggerAOEExplosion(hitEnemy.x, hitEnemy.y, proj.attackData,
                    proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
                } else {
                  const damage = proj.attackData.damage ?? 0;
                  hitEnemy.currentHealth -= damage;
                  wakeFromSleep(hitEnemy);
                  if (hitEnemy.currentHealth <= 0) {
                    hitEnemy.dead = true;
                    handleEntityDeathDrop(hitEnemy, true, gameState);
                  }
                  if (proj.spellAssetId && !hitEnemy.dead) {
                    applyStatusEffectFromProjectile(hitEnemy, proj.spellAssetId,
                      proj.sourceCharacterId || 'unknown', false, gameState.currentTurn);
                  }
                }
                hitSomething = true;
                if (!canPierce) shouldRemove = true;
              }
            }
          }
        } else if (proj.sourceEnemyId) {
          // Enemy fired
          if (isHealingProjectile) {
            const hitAllyEnemy = gameState.puzzle.enemies.find(
              e => !e.dead && Math.floor(e.x) === checkX && Math.floor(e.y) === checkY &&
                   e.enemyId !== proj.sourceEnemyId &&
                   !hitEntityIds.includes(e.enemyId)
            );
            if (hitAllyEnemy) {
              hitEntityIds.push(hitAllyEnemy.enemyId);
              const healing = proj.attackData.healing ?? 0;
              const enemyData = getEnemy(hitAllyEnemy.enemyId);
              const maxHealth = enemyData?.health ?? hitAllyEnemy.currentHealth;
              hitAllyEnemy.currentHealth = Math.min(hitAllyEnemy.currentHealth + healing, maxHealth);
              hitSomething = true;
              if (!canPierce) shouldRemove = true;
            }
          } else {
            const hitChar = gameState.placedCharacters.find(
              c => !c.dead && Math.floor(c.x) === checkX && Math.floor(c.y) === checkY &&
                   !hitEntityIds.includes(c.characterId)
            );
            if (hitChar) {
              hitEntityIds.push(hitChar.characterId);
              if (proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
                triggerAOEExplosion(hitChar.x, hitChar.y, proj.attackData,
                  proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
              } else {
                const damage = proj.attackData.damage ?? 0;
                hitChar.currentHealth -= damage;
                wakeFromSleep(hitChar);
                if (hitChar.currentHealth <= 0) {
                  hitChar.dead = true;
                  handleEntityDeathDrop(hitChar, false, gameState);
                }
                if (proj.spellAssetId && !hitChar.dead) {
                  applyStatusEffectFromProjectile(hitChar, proj.spellAssetId,
                    proj.sourceEnemyId || 'unknown', true, gameState.currentTurn);
                }
              }
              hitSomething = true;
              if (!canPierce) shouldRemove = true;
            }
          }
        }

        // Track how far we've traveled this turn
        if (dist === endTile) {
          reachedEnd = true;
        }
      }

      // Update projectile position if it's still active
      if (!shouldRemove && !hitWall) {
        // Move projectile to end of this turn's travel
        const newDist = Math.min(endTile, range);
        proj.x = proj.startX + dx * newDist;
        proj.y = proj.startY + dy * newDist;

        // Check if reached max range
        if (newDist >= range) {
          // If reached max range with no hit, check for AOE at final position
          if (!hitSomething && proj.attackData.projectileBeforeAOE && proj.attackData.aoeRadius) {
            const finalX = Math.floor(proj.startX + dx * range);
            const finalY = Math.floor(proj.startY + dy * range);
            if (isInBounds(finalX, finalY, gameState.puzzle.width, gameState.puzzle.height)) {
              triggerAOEExplosion(finalX, finalY, proj.attackData,
                proj.sourceCharacterId, proj.sourceEnemyId, gameState, proj.spellAssetId);
            }
          }
          shouldRemove = true;
        }
      }
    }

    if (shouldRemove) {
      proj.active = false;
      projectilesToRemove.push(proj.id);
    }
  }

  // Remove processed projectiles
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

/**
 * Convert a direction vector to a Direction enum
 */
function getDirectionFromVector(dx: number, dy: number): Direction {
  // Normalize to determine primary direction
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Check for diagonal movement
  if (absDx > 0.1 && absDy > 0.1) {
    // Diagonal
    if (dx > 0 && dy < 0) return Direction.NORTHEAST;
    if (dx > 0 && dy > 0) return Direction.SOUTHEAST;
    if (dx < 0 && dy > 0) return Direction.SOUTHWEST;
    if (dx < 0 && dy < 0) return Direction.NORTHWEST;
  }

  // Cardinal directions
  if (absDx > absDy) {
    return dx > 0 ? Direction.EAST : Direction.WEST;
  } else {
    return dy > 0 ? Direction.SOUTH : Direction.NORTH;
  }
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
          handleEntityDeathDrop(enemy, true, gameState);
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
