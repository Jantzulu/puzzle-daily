// Core game type definitions

export enum Direction {
  NORTH = 'north',
  NORTHEAST = 'northeast',
  EAST = 'east',
  SOUTHEAST = 'southeast',
  SOUTH = 'south',
  SOUTHWEST = 'southwest',
  WEST = 'west',
  NORTHWEST = 'northwest',
}

export enum TileType {
  EMPTY = 'empty',
  WALL = 'wall',
  GOAL = 'goal',
  TELEPORT = 'teleport',
}

// ==========================================
// CUSTOM TILE TYPE SYSTEM
// ==========================================

export type TileBehaviorType =
  | 'damage'
  | 'teleport'
  | 'direction_change'
  | 'ice'
  | 'pressure_plate';

// ==========================================
// TILE CADENCE SYSTEM
// ==========================================

export type CadencePattern = 'alternating' | 'interval' | 'custom';

export interface CadenceConfig {
  enabled: boolean;
  pattern: CadencePattern;
  // For 'alternating': on, off, on, off...
  // For 'interval': on for X turns, off for Y turns
  onTurns?: number;           // Turns active (default 1)
  offTurns?: number;          // Turns inactive (default 1)
  customPattern?: boolean[];  // For 'custom': true=on, false=off
  startState: 'on' | 'off';   // Starting state (default 'on')
}

export interface PressurePlateEffect {
  type: 'toggle_wall' | 'spawn_enemy' | 'despawn_enemy' | 'trigger_teleport' | 'toggle_trigger_group';
  targetX?: number;
  targetY?: number;
  targetEnemyId?: string;  // For spawn/despawn
  stayPressed?: boolean;   // Require standing on plate vs. step once
  targetTriggerGroupId?: string;  // For toggle_trigger_group - which group of tiles to toggle
}

export interface TeleportSpriteConfig {
  imageData: string;           // Base64 image data
  frameCount?: number;         // For spritesheets (default: 1)
  frameRate?: number;          // Frames per second (default: 10)
  loop?: boolean;              // Loop animation (default: true)
}

export interface ActivationSpriteConfig {
  imageData: string;           // Base64 image data
  frameCount?: number;         // For spritesheets (default: 1)
  frameRate?: number;          // Frames per second (default: 10)
  loop?: boolean;              // Loop animation (default: true)
  opacity?: number;            // Opacity 0-1 (default: 1)
  durationMs?: number;         // How long to show the activation sprite (default: 800ms)
}

export interface TileBehaviorConfig {
  type: TileBehaviorType;

  // Damage behavior
  damageAmount?: number;
  damageOnce?: boolean;  // Only damage first time stepped on per puzzle run

  // Teleport behavior - tiles with same group ID are linked (bidirectional)
  teleportGroupId?: string;
  teleportSprite?: TeleportSpriteConfig;  // DEPRECATED: Use activationSprite instead
  activationSprite?: ActivationSpriteConfig;  // Sprite shown on tile when activated (e.g., teleport effect)

  // Direction change behavior
  newFacing?: Direction;

  // Ice behavior (inherits movement direction, slides until wall)
  // No extra params needed

  // Pressure plate behavior
  pressurePlateEffects?: PressurePlateEffect[];
}

export interface TileRuntimeState {
  damagedEntities?: Set<string>;  // For damageOnce tracking
  pressurePlateActive?: boolean;
  overrideState?: 'on' | 'off';   // Override cadence-based on/off state (for trigger groups)
}

export interface Tile {
  x: number;
  y: number;
  type: TileType;
  customTileTypeId?: string;  // Reference to CustomTileType
  teleportGroupId?: string;   // Which teleport group this tile belongs to
  triggerGroupId?: string;    // For pressure plate trigger groups - tiles with same ID toggle together
  content?: TileContent;
}

// Null represents a non-existent tile (for non-rectangular maps)
export type TileOrNull = Tile | null;

export interface TileContent {
  type: 'enemy' | 'collectible' | 'player_character';
  id: string;
  data?: any;
}

export enum ActionType {
  // Movement
  MOVE_FORWARD = 'move_forward',
  MOVE_BACKWARD = 'move_backward',
  MOVE_LEFT = 'move_left',
  MOVE_RIGHT = 'move_right',
  MOVE_DIAGONAL_NE = 'move_diagonal_ne',
  MOVE_DIAGONAL_NW = 'move_diagonal_nw',
  MOVE_DIAGONAL_SE = 'move_diagonal_se',
  MOVE_DIAGONAL_SW = 'move_diagonal_sw',

  // Rotation
  TURN_LEFT = 'turn_left',
  TURN_RIGHT = 'turn_right',
  TURN_AROUND = 'turn_around',

  // Combat (Legacy - deprecated)
  ATTACK_FORWARD = 'attack_forward',
  ATTACK_RANGE = 'attack_range',
  ATTACK_AOE = 'attack_aoe',
  CUSTOM_ATTACK = 'custom_attack',  // Deprecated - use SPELL instead

  // Combat (New spell system)
  SPELL = 'spell',  // Execute spell from library

  // Conditional
  IF_WALL = 'if_wall',
  IF_ENEMY = 'if_enemy',

  // Special
  WAIT = 'wait',
  TELEPORT = 'teleport',
  REPEAT = 'repeat',
}

export type WallCollisionBehavior = 'stop' | 'turn_left' | 'turn_right' | 'turn_around' | 'continue';

// ==========================================
// EXECUTION SYSTEM (New)
// ==========================================

export type ExecutionMode = 'sequential' | 'parallel' | 'parallel_with_previous';

export type TriggerMode = 'interval' | 'on_event';

export type TriggerEvent = 'enemy_adjacent' | 'enemy_in_range' | 'contact_with_enemy' | 'wall_ahead' | 'health_below_50' | 'character_adjacent' | 'character_in_range' | 'contact_with_character' | 'on_death';

export interface TriggerConfig {
  mode: TriggerMode;
  intervalMs?: number;        // For interval mode
  event?: TriggerEvent;       // For event mode
  eventRange?: number;        // For 'enemy_in_range' event - how far to detect (tiles)
}

export interface CharacterAction {
  type: ActionType;
  params?: any;
  tilesPerMove?: number; // How many tiles to move per tick (default: 1)
  onWallCollision?: WallCollisionBehavior; // What to do when hitting a wall (default: 'stop')
  turnDegrees?: 45 | 90 | 135; // Turn amount: 45 (one diagonal), 90 (cardinal), 135 (skip diagonal, useful for corners) (default: 90)

  // Execution configuration (new system)
  executionMode?: ExecutionMode;  // Default: 'sequential'
  trigger?: TriggerConfig;        // For parallel actions

  // For CUSTOM_ATTACK action type (deprecated)
  customAttackId?: string;      // Reference to saved CustomAttack
  customAttack?: CustomAttack;  // Inline attack definition (added below in file)

  // For SPELL action type (new system)
  spellId?: string;             // Reference to spell in library
  directionOverride?: Direction[]; // Override spell's default directions (absolute)
  relativeDirectionOverride?: RelativeDirection[]; // Override with relative directions
  useRelativeOverride?: boolean; // If true, use relativeDirectionOverride instead of directionOverride

  // Auto-targeting configuration
  autoTargetNearestEnemy?: boolean; // Override spell direction to aim at closest enemy
  autoTargetNearestCharacter?: boolean; // Override spell direction to aim at closest character (for enemies or healing)
  autoTargetNearestDeadAlly?: boolean; // Target nearest dead ally (for resurrect spells)
  autoTargetMode?: 'omnidirectional' | 'cardinal' | 'diagonal'; // Directional constraints for auto-targeting (default: omnidirectional)
  autoTargetRange?: number;         // Maximum range for auto-targeting (0 = unlimited, overrides spell range)
  maxTargets?: number;              // Maximum number of targets to attack/heal (for multi-target spells)
  homing?: boolean;                 // If true with auto-targeting, projectile tracks target and guarantees hit

  // Self-targeting configuration
  targetSelf?: boolean;             // Also target self in addition to other targets
  targetSelfOnly?: boolean;         // Only target self (ignores other targeting)
}

export interface Character {
  id: string;
  name: string;
  title?: string; // Optional title displayed after name in italics (e.g., "the Brave")
  spriteId: string;
  description: string;
  health: number;
  attackDamage: number;
  defaultFacing: Direction;
  behavior: CharacterAction[];
  tooltipSteps?: string[]; // Custom tooltip steps for display on play/playtest pages
  canOverlapEntities?: boolean; // If true, can walk through other entities and trigger overlap events (ghost mode)
  behavesLikeWall?: boolean; // If true, triggers wall collision behaviors when alive
  behavesLikeWallDead?: boolean; // If true, triggers wall collision behaviors when dead
  blocksMovement?: boolean; // If true, stops entities trying to walk through (no wall reaction, just stops them)
  blocksMovementDead?: boolean; // If true, corpse stops entities trying to walk through
  contactDamage?: number; // Damage dealt when walking into enemies (0 or undefined = no contact damage)
  // Sound configuration
  sounds?: EntitySoundSet; // Character-specific sounds (death, damage, etc.)
  // Death drop configuration
  droppedCollectibleId?: string; // CustomCollectible ID to spawn on death
}

export interface Enemy {
  id: string;
  name: string;
  title?: string; // Optional title displayed after name in italics (e.g., "the Terrible")
  description?: string; // Description of the enemy
  spriteId: string;
  health: number;
  attackDamage: number;
  behavior?: EnemyBehavior;
  tooltipSteps?: string[]; // Custom tooltip steps for display on play/playtest pages
  canOverlapEntities?: boolean; // If true, can walk through other entities and trigger overlap events (ghost mode)
  behavesLikeWall?: boolean; // If true, triggers wall collision behaviors when alive
  behavesLikeWallDead?: boolean; // If true, triggers wall collision behaviors when dead
  blocksMovement?: boolean; // If true, stops entities trying to walk through (no wall reaction, just stops them)
  blocksMovementDead?: boolean; // If true, corpse stops entities trying to walk through
  contactDamage?: number; // Damage dealt when walking into characters (0 or undefined = no contact damage)

  // Boss configuration
  isBoss?: boolean; // If true, this enemy is a boss - enables 'defeat_boss' win condition

  // Melee priority
  hasMeleePriority?: boolean; // If true, this enemy attacks before characters in melee exchanges (default: false)

  // Sound configuration
  sounds?: EntitySoundSet; // Enemy-specific sounds (death, damage, etc.)

  // Death drop configuration
  droppedCollectibleId?: string; // CustomCollectible ID to spawn on death
}

export interface EnemyBehavior {
  type: 'static' | 'active';
  pattern?: CharacterAction[]; // Enemy AI behavior (movement, attacks, etc.)
  defaultFacing?: Direction;
}

export interface PlacedEnemy {
  enemyId: string;
  x: number;
  y: number;
  currentHealth: number;
  facing?: Direction;
  dead: boolean;
  actionIndex?: number; // For active enemies with behavior patterns
  active?: boolean; // For active enemies
  parallelTrackers?: ParallelActionTracker[]; // For parallel spell execution
  justTeleported?: boolean; // Set when teleporting, cleared after animation
  teleportFromX?: number;   // Origin tile before teleport
  teleportFromY?: number;
  teleportSprite?: TeleportSpriteConfig; // DEPRECATED: No longer used, activation sprite is on tile instead
  iceSlideDistance?: number; // Number of tiles slid on ice (for slower animation)
  isCasting?: boolean; // True when casting a spell (for casting sprite state)
  castingEndTime?: number; // Timestamp when casting state should end
  statusEffects?: StatusEffectInstance[]; // Active status effects on this enemy
  spellCooldowns?: Record<string, number>; // Spell ID -> turns remaining on cooldown
  spellUseCounts?: Record<string, number>; // Spell ID -> number of times used this game (for maxUsesPerGame)
}

export interface PlacedObject {
  objectId: string;
  x: number;
  y: number;
}

export interface PlacedCollectible {
  // Legacy backwards compatibility
  type?: 'coin' | 'gem';
  scoreValue?: number;

  // New system: reference to CustomCollectible asset
  collectibleId?: string;

  // Position
  x: number;
  y: number;

  // Instance state
  collected: boolean;
  collectedBy?: string;          // Entity ID that collected this
  collectedByType?: 'character' | 'enemy';

  // Runtime ID for tracking
  instanceId?: string;           // Unique instance ID for this placed collectible
}

/**
 * Win condition types for puzzles
 */
export type WinConditionType =
  | 'defeat_all_enemies'    // All enemies must be defeated
  | 'defeat_boss'           // All boss enemies must be defeated (enemies with isBoss: true)
  | 'collect_all'           // All collectibles must be collected
  | 'collect_keys'          // All collectibles with win_key effect must be collected
  | 'reach_goal'            // A character must reach the goal tile
  | 'survive_turns'         // Survive for X turns
  | 'win_in_turns'          // Complete all other conditions within X turns
  | 'max_characters'        // Complete using only X or fewer characters
  | 'characters_alive';     // Keep at least X characters alive at the end

/**
 * Parameters for different win condition types
 */
export interface WinConditionParams {
  // For survive_turns and win_in_turns
  turns?: number;

  // For max_characters and characters_alive
  characterCount?: number;
}

export interface WinCondition {
  type: WinConditionType;
  params?: WinConditionParams;
}

// ============================================
// SIDE QUESTS (Bonus Objectives)
// ============================================

export type SideQuestType =
  | 'collect_all_items'      // Collect every collectible on the map
  | 'no_damage_taken'        // Win without any character taking damage
  | 'use_specific_character' // Must use a specific character
  | 'avoid_character'        // Win without using a specific character
  | 'speed_run'              // Complete in X or fewer turns
  | 'minimalist'             // Complete with X or fewer characters
  | 'no_deaths'              // No characters die during puzzle
  | 'custom';                // Custom description only (manual tracking)

export interface SideQuestParams {
  characterId?: string;      // For use_specific_character / avoid_character
  turns?: number;            // For speed_run
  characterCount?: number;   // For minimalist
}

export interface SideQuest {
  id: string;
  type: SideQuestType;
  title: string;
  description?: string;
  bonusPoints: number;       // Points awarded for completion
  params?: SideQuestParams;
}

// ============================================
// SCORING & RANKING
// ============================================

export type RankTier = 'bronze' | 'silver' | 'gold';

export interface PuzzleScore {
  rank: RankTier;
  totalPoints: number;
  breakdown: {
    basePoints: number;           // 1000 base for winning
    characterBonus: number;       // Bonus for beating char par
    turnBonus: number;            // Bonus for beating turn par
    livesBonus: number;           // Points per remaining life
    sideQuestPoints: number;      // Sum of completed quest bonuses
  };
  completedSideQuests: string[];  // IDs of completed quests
  parMet: {
    characters: boolean;
    turns: boolean;
  };
  // Actual performance stats (for display)
  stats: {
    charactersUsed: number;
    turnsUsed: number;
    livesRemaining: number;
  };
}

export type BorderStyle = 'none' | 'dungeon' | 'castle' | 'forest' | 'custom';

export interface CustomBorderSprites {
  // Wall segments (tileable horizontally/vertically)
  wallFront?: string;           // Front-facing wall (48px tall) - used for top edges
  wallTop?: string;             // Top surface of wall (24px tall) - used for interior bottom edges
  wallSide?: string;            // Side wall (24px wide) - used for left/right edges
  wallBottomOuter?: string;     // Outer perimeter bottom wall (48px tall) - optional, falls back to wallFront

  // Convex corners - Full size (outer corners on puzzle perimeter, 24x48px)
  cornerTopLeft?: string;       // Top-left outer corner (24x48px)
  cornerTopRight?: string;      // Top-right outer corner (24x48px)
  cornerBottomLeft?: string;    // Bottom-left outer corner (24x48px)
  cornerBottomRight?: string;   // Bottom-right outer corner (24x48px)

  // Convex corners - Thin size (for interior void edges, 24x24px)
  cornerBottomLeftThin?: string;    // Bottom-left thin corner (24x24px)
  cornerBottomRightThin?: string;   // Bottom-right thin corner (24x24px)

  // Concave corners - Full size (inner corners, 24x48px)
  innerCornerTopLeft?: string;      // Inner top-left corner (24x48px)
  innerCornerTopRight?: string;     // Inner top-right corner (24x48px)
  innerCornerBottomLeft?: string;   // Inner bottom-left corner (24x48px)
  innerCornerBottomRight?: string;  // Inner bottom-right corner (24x48px)

  // Concave corners - Thin size (for interior void edges, 24x24px)
  innerCornerBottomLeftThin?: string;   // Inner bottom-left thin corner (24x24px)
  innerCornerBottomRightThin?: string;  // Inner bottom-right thin corner (24x24px)
}

export interface BorderConfig {
  style: BorderStyle;
  customBorderSprites?: CustomBorderSprites;
}

// ==========================================
// PUZZLE SKIN SYSTEM
// ==========================================

export interface TileSprites {
  empty?: string;           // Floor tile sprite (tileable)
  wall?: string;            // Wall tile sprite (tileable)
  void?: string;            // Void/transparent area appearance (optional)
  goal?: string;            // Goal tile sprite
}

export interface PuzzleSkin {
  id: string;
  name: string;
  description?: string;
  thumbnailPreview?: string;  // Auto-generated or user-uploaded preview image

  // Border sprites (walls around the puzzle)
  borderSprites: CustomBorderSprites;

  // Tile sprites (the actual floor/wall tiles)
  tileSprites?: TileSprites;

  // Custom tile type sprites (keyed by customTileTypeId)
  // Allows each skin to have different sprites for custom tile types
  // Supports both legacy string format and new on/off object format
  customTileSprites?: {
    [customTileTypeId: string]: string | {
      onSprite?: string;   // Base64 sprite for on state
      offSprite?: string;  // Base64 sprite for off state
    };
  };

  // Metadata
  createdAt: string;
  isBuiltIn?: boolean;       // True for default/built-in skins
  folderId?: string;         // Optional folder assignment
}

export interface Puzzle {
  id: string;
  date: string;
  name: string;
  width: number;
  height: number;
  tiles: TileOrNull[][]; // Can contain null for non-rectangular maps
  enemies: PlacedEnemy[];
  collectibles: PlacedCollectible[];
  placedObjects?: PlacedObject[]; // Objects placed on the map
  availableCharacters: string[];
  winConditions: WinCondition[];
  maxCharacters: number;
  maxPlaceableCharacters?: number; // Max heroes player can place (if different from maxCharacters)
  maxTurns?: number; // Optional turn limit to prevent infinite loops
  lives?: number; // Number of attempts allowed (default: 3, 0 = unlimited)
  borderConfig?: BorderConfig; // Optional border decoration (legacy, use skinId instead)
  skinId?: string; // Reference to PuzzleSkin for visual theming
  backgroundMusicId?: string; // Reference to sound asset for puzzle-specific background music (falls back to global config)

  // Scoring - Par values (set by creator, suggested by validator)
  parCharacters?: number;    // Target character count for gold trophy
  parTurns?: number;         // Target turn count for gold trophy

  // Side quests (optional bonus objectives)
  sideQuests?: SideQuest[];
}

export interface PlacedCharacter {
  characterId: string;
  x: number;
  y: number;
  facing: Direction;
  currentHealth: number;
  actionIndex: number;
  active: boolean;
  dead: boolean;
  parallelTrackers?: ParallelActionTracker[]; // For parallel spell execution
  justTeleported?: boolean; // Set when teleporting, cleared after animation
  teleportFromX?: number;   // Origin tile before teleport
  teleportFromY?: number;
  teleportSprite?: TeleportSpriteConfig; // DEPRECATED: No longer used, activation sprite is on tile instead
  iceSlideDistance?: number; // Number of tiles slid on ice (for slower animation)
  isCasting?: boolean; // True when casting a spell (for casting sprite state)
  castingEndTime?: number; // Timestamp when casting state should end
  statusEffects?: StatusEffectInstance[]; // Active status effects on this character
  spellCooldowns?: Record<string, number>; // Spell ID -> turns remaining on cooldown
  spellUseCounts?: Record<string, number>; // Spell ID -> number of times used this game (for maxUsesPerGame)
}

export type GameStatus = 'setup' | 'running' | 'victory' | 'defeat';

/**
 * Persistent area effect (like fire on the ground)
 */
export interface PersistentAreaEffect {
  id: string;                   // Unique instance ID
  x: number;                    // Grid position X
  y: number;                    // Grid position Y
  radius: number;               // Radius of effect
  damagePerTurn: number;        // Damage dealt each turn
  turnsRemaining: number;       // How many more turns it lasts
  visualSprite?: SpriteReference; // Visual indicator for each tile in the area
  loopAnimation?: boolean;      // Whether to loop the sprite animation (default: true)
  excludeCenter?: boolean;      // Don't show effect on center tile
  sourceCharacterId?: string;   // Who created this (for friendly fire rules)
  sourceEnemyId?: string;       // If created by enemy
}

export interface GameState {
  puzzle: Puzzle;
  placedCharacters: PlacedCharacter[];
  currentTurn: number;
  simulationRunning: boolean;
  gameStatus: GameStatus;
  score: number;

  // Attack system (Phase 2)
  activeProjectiles?: Projectile[];
  activeParticles?: ParticleEffect[];
  persistentAreaEffects?: PersistentAreaEffect[];

  // Custom tile behavior runtime state
  tileStates?: Map<string, TileRuntimeState>;  // Key: "x,y"

  // Test mode - when true, skip win/lose condition checks
  testMode?: boolean;

  // Headless mode - when true, projectiles resolve instantly (for solver/validator)
  headlessMode?: boolean;

  // Snapshot of entity positions at start of turn (for same-turn projectile hit detection)
  // Projectiles spawned this turn can hit entities at their pre-move positions
  enemyPositionsAtTurnStart?: Array<{ enemyId: string; x: number; y: number; dead: boolean }>;
  characterPositionsAtTurnStart?: Array<{ characterId: string; x: number; y: number; dead: boolean }>;

  // Tiles being vacated this turn (for train-like movement)
  // If an entity tries to move into a tile that's being vacated by an ally, allow it
  tilesBeingVacated?: Set<string>;  // Set of "x,y" strings
}

export interface PlayerProgress {
  userId?: string;
  unlockedCharacters: string[];
  completedPuzzles: CompletedPuzzle[];
  currentStreak: number;
}

export interface CompletedPuzzle {
  puzzleId: string;
  date: string;
  charactersUsed: number;
  characterIds: string[];
  turnsUsed: number;
  livesRemaining: number;
  score: number;
  rank: RankTier;
  completedSideQuests: string[];
  timestamp: string;
}

// ==========================================
// ATTACK SYSTEM (New - Phase 1)
// ==========================================

/**
 * Attack pattern types for custom attacks
 */
export enum AttackPattern {
  MELEE = 'melee',              // Single adjacent tile
  PROJECTILE = 'projectile',    // Straight line projectile
  AOE_CIRCLE = 'aoe_circle',    // Radius around target point
  AOE_LINE = 'aoe_line',        // Cone/line pattern
  BUFF_SELF = 'buff_self',      // Apply status to self
  BUFF_ALLY = 'buff_ally',      // Apply status to adjacent ally
  HEAL = 'heal',                // Restore HP
  RESURRECT = 'resurrect',      // Revive dead unit
}

/**
 * Status effect types
 */
export enum StatusEffectType {
  POISON = 'poison',      // Damage over time
  REGEN = 'regen',        // Heal over time
  SHIELD = 'shield',      // Absorb damage
  STUN = 'stun',          // Skip turns (not broken by damage)
  SLOW = 'slow',          // Skips every other movement action
  HASTE = 'haste',        // Increased movement
  SLEEP = 'sleep',        // Can't act (broken by damage)
  SILENCED = 'silenced',  // Can't cast ranged/AOE spells
  DISARMED = 'disarmed',  // Can't cast melee spells
  BURN = 'burn',          // Damage over time (fire variant)
  BLEED = 'bleed',        // Damage over time (physical variant)
  POLYMORPH = 'polymorph', // Replaces entity sprite temporarily
  STEALTH = 'stealth',    // Reduced opacity, can't be auto-targeted by opposing team
  DEFLECT = 'deflect',    // Reflects spell damage back to caster
  INVULNERABLE = 'invulnerable', // Immune to all damage from enemies
}

/**
 * Status effect instance - active effect on an entity
 */
export interface StatusEffectInstance {
  id: string;                     // Unique instance ID
  type: StatusEffectType;         // Effect type
  statusAssetId: string;          // Reference to StatusEffectAsset
  duration: number;               // Turns remaining
  value?: number;                 // Damage/heal amount per turn
  currentStacks?: number;         // Current stack count (for stackable effects)
  appliedOnTurn: number;          // Turn when effect was applied
  sourceEntityId?: string;        // Who applied this effect
  sourceIsEnemy?: boolean;        // Was source an enemy or character?
  movementSkipCounter?: number;   // For Slow - tracks movement actions
}

/**
 * @deprecated Use StatusEffectInstance instead
 */
export interface StatusEffect {
  type: StatusEffectType;
  duration: number;       // Turns remaining
  value: number;          // Damage/heal per turn, or shield amount
  sourceId?: string;      // Who applied this effect
}

/**
 * Custom sprite reference (for projectiles and effects)
 */
export interface SpriteReference {
  type: 'stored' | 'inline';
  spriteId?: string;           // ID from asset storage
  spriteData?: any;            // Inline sprite data (CustomSprite)
}

/**
 * Custom attack definition
 */
export interface CustomAttack {
  id: string;
  name: string;
  pattern: AttackPattern;

  // Damage/Healing
  damage?: number;              // Override character's attackDamage
  healing?: number;             // HP to restore

  // Range/Area
  range?: number;               // Max tiles away (default: 1)
  aoeRadius?: number;           // For AOE attacks (tiles from center)

  // Projectile behavior (for PROJECTILE pattern)
  projectileSpeed?: number;     // Tiles per turn (default: 4)
  projectilePierces?: boolean;  // Continue through enemies (default: false)

  // AOE targeting (for AOE patterns)
  aoeCenteredOnCaster?: boolean; // True: AOE around self, False: AOE at target tile
  projectileBeforeAOE?: boolean; // True: Fire projectile that explodes into AOE
  aoeExcludeCenter?: boolean;    // True: Don't show/apply AOE effect on center tile

  // Persistent AOE effects
  persistDuration?: number;      // Turns the AOE effect persists (0 = instant)
  persistDamagePerTurn?: number; // Damage dealt each turn to units in the area
  persistVisualSprite?: SpriteReference; // Visual indicator for persistent area

  // Visuals
  projectileSprite?: SpriteReference;  // Visual for projectile
  aoeEffectSprite?: SpriteReference;   // Visual for AOE tiles when spell cast
  hitEffectSprite?: SpriteReference;   // Particle on damage impact
  healingEffectSprite?: SpriteReference; // Particle on healing
  castEffectSprite?: SpriteReference;  // Effect on caster

  // Animation timing
  effectDuration?: number;      // MS to show effects (default: 300)

  // Special Effects
  statusEffect?: StatusEffect;  // Apply status on hit
}

/**
 * Active projectile in the game world
 */
export interface Projectile {
  id: string;                   // Unique instance ID
  attackData: CustomAttack;     // Attack definition

  // Position
  x: number;                    // Current X (can be fractional)
  y: number;                    // Current Y (can be fractional)
  startX: number;               // Original spawn X
  startY: number;               // Original spawn Y
  targetX: number;              // Destination X
  targetY: number;              // Destination Y

  // Movement
  direction: Direction;         // Facing direction for sprite rotation
  speed: number;                // Tiles per turn

  // State
  active: boolean;
  startTime: number;            // Date.now() when spawned
  spawnTurn?: number;           // Turn number when projectile was created (for same-turn hit detection)

  // Bounce behavior
  bounceOffWalls?: boolean;     // Enable wall bouncing
  maxBounces?: number;          // Maximum allowed bounces
  bounceCount?: number;         // Current bounce count
  bounceBehavior?: BounceBehavior; // How projectile bounces
  bounceTurnDegrees?: 45 | 90 | 135; // Turn amount for turn_left/turn_right

  // Metadata
  sourceCharacterId?: string;   // Who fired this
  sourceEnemyId?: string;       // If fired by enemy
  spellAssetId?: string;        // For status effect application on hit

  // Homing behavior - projectile tracks a moving target
  isHoming?: boolean;           // If true, projectile chases target entity
  targetEntityId?: string;      // ID of entity being tracked
  targetIsEnemy?: boolean;      // true = target is enemy, false = target is character

  // Piercing tracking - prevents hitting same entity multiple times
  hitEntityIds?: string[];      // IDs of entities already hit by this projectile
  hitEnemyIndices?: number[];   // Array indices of enemies hit (for duplicate ID handling)

  // Tile-based movement - deterministic collision detection
  // Pre-computed path of tiles the projectile will traverse
  tilePath?: Array<{ x: number; y: number }>;
  // Current index in tilePath (which tile we're at or moving toward)
  currentTileIndex?: number;
  // Time when we entered the current tile (for smooth animation)
  tileEntryTime?: number;
}

/**
 * Particle effect instance
 */
export interface ParticleEffect {
  id: string;                   // Unique instance ID
  sprite: SpriteReference;

  // Position
  x: number;
  y: number;

  // Animation
  startTime: number;            // Date.now() when spawned
  duration: number;             // MS to display

  // Visual modifiers
  scale?: number;               // Size multiplier (can animate)
  alpha?: number;               // Opacity (for fade out)
  rotation?: number;            // Rotation in radians
}

/**
 * Extended CharacterAction to support custom attacks
 * Backwards compatible - existing actions still work
 */
export interface CharacterActionExtended extends CharacterAction {
  // For custom attack actions
  customAttackId?: string;      // Reference to saved CustomAttack
  customAttack?: CustomAttack;  // Inline attack definition
}

/**
 * Extended GameState to track projectiles and particles
 */
export interface GameStateExtended extends GameState {
  activeProjectiles?: Projectile[];
  activeParticles?: ParticleEffect[];
}

// ==========================================
// SPELL ASSET SYSTEM (New)
// ==========================================

/**
 * Spell template types - base patterns for spell builder
 */
export enum SpellTemplate {
  MELEE = 'melee',              // Adjacent tile attack
  RANGE_LINEAR = 'range_linear', // Projectile in straight line
  MAGIC_LINEAR = 'magic_linear', // Magic projectile (different visuals)
  AOE = 'aoe',                   // Area of effect
  RESURRECT = 'resurrect',       // Bring dead ally back to life
  PUSH = 'push',                 // Push target entity in a direction
}

/**
 * Direction configuration for spells
 */
export type DirectionMode = 'current_facing' | 'fixed' | 'all_directions' | 'relative';

/**
 * Relative directions (relative to caster's facing)
 */
export type RelativeDirection = 'forward' | 'backward' | 'left' | 'right' | 'forward_left' | 'forward_right' | 'backward_left' | 'backward_right';

/**
 * Bounce behavior for projectiles hitting walls
 * Uses similar language to WallCollisionBehavior for consistency
 */
export type BounceBehavior =
  | 'reflect'          // Physically realistic reflection (mirror angle)
  | 'turn_around'      // Go back the direction it came from (180°)
  | 'turn_left'        // Turn 90° counter-clockwise
  | 'turn_right'       // Turn 90° clockwise
  | 'random';          // Pick a random valid direction

/**
 * Spell asset definition - reusable attack configuration
 */
export interface SpellAsset {
  id: string;
  name: string;
  description: string;
  thumbnailIcon: string;        // Icon URL or data URL for uploaded image

  // Base template
  templateType: SpellTemplate;

  // Direction configuration
  directionMode: DirectionMode;
  defaultDirections?: Direction[]; // For 'fixed' mode
  relativeDirections?: RelativeDirection[]; // For 'relative' mode

  // Damage/Healing
  damage?: number;              // Damage dealt (mutually exclusive with healing)
  healing?: number;             // HP restored (mutually exclusive with damage)

  // Range/Area (conditional on template)
  range?: number;               // For linear spells (max tiles)
  radius?: number;              // For AOE spells (tiles from center)
  meleeRange?: number;          // For melee spells - how many tiles in attack direction (default: 1)

  // Projectile settings (for linear templates)
  projectileSpeed?: number;     // Tiles per turn (default: 4)
  pierceEnemies?: boolean;      // Continue through enemies
  bounceOffWalls?: boolean;     // Bounce/reflect off walls instead of stopping
  maxBounces?: number;          // Maximum bounces (default: 3 if bounceOffWalls enabled)
  bounceBehavior?: BounceBehavior; // How projectile bounces (default: reflect)
  bounceTurnDegrees?: 45 | 90 | 135; // Turn amount for turn_left/turn_right (default: 90)

  // AOE settings
  aoeCenteredOnCaster?: boolean; // True: AOE around self, False: AOE at target tile
  projectileBeforeAOE?: boolean; // True: Fire projectile that explodes into AOE
  aoeExcludeCenter?: boolean;    // True: Don't show AOE effect on center tile (usually caster)

  // Persistent AOE effects
  persistDuration?: number;      // Turns the AOE effect persists (0 = instant)
  persistDamagePerTurn?: number; // Damage dealt each turn to units in the area

  // Melee-specific settings
  skipSpriteOnCasterTile?: boolean; // For melee spells - don't show attack sprite on caster's tile

  // Visual configuration
  sprites: {
    projectile?: SpriteReference;      // For linear spells (per direction)
    meleeAttack?: SpriteReference;     // For melee spells - sprite shown on attack tiles
    aoeEffect?: SpriteReference;       // For AOE spells - sprite shown on each affected tile when cast
    damageEffect: SpriteReference;     // On successful damage hit
    healingEffect?: SpriteReference;   // On successful heal (falls back to damageEffect if not set)
    castEffect?: SpriteReference;      // On caster when spell fires
    persistentArea?: SpriteReference;  // Visual for persistent ground effects (looping animation)
  };

  // Status Effect Configuration (optional)
  appliesStatusEffect?: {
    statusAssetId: string;        // Reference to StatusEffectAsset
    durationOverride?: number;    // Override default duration
    valueOverride?: number;       // Override default damage/heal value
    applyChance?: number;         // 0-1, default 1 (100%)
  };

  // Cooldown
  cooldown?: number;              // Turns before spell can be used again (0 = no cooldown)

  // Max uses per game (for powerful spells like resurrect)
  maxUsesPerGame?: number;        // Maximum times this spell can be cast in a single game (0 = unlimited)

  // Resurrect-specific settings (for RESURRECT template)
  resurrectHealthPercent?: number; // Percent of max health to restore (0-100, default 100)

  // Push-specific settings (for PUSH template)
  pushDistance?: number;          // How many tiles to push target (default: 1)
  pushDirection?: 'away' | 'toward' | 'spell_direction'; // Direction to push: away from caster, toward caster, or same as spell direction (default: away)

  // Sound configuration
  castSound?: string;             // Sound asset ID to play when spell is cast
  hitSound?: string;              // Sound asset ID to play on hit/impact

  // Metadata
  createdAt: string;
  isCustom: boolean;            // User-created vs built-in
  folderId?: string;            // Optional folder assignment
}

// ==========================================
// STATUS EFFECT ASSET SYSTEM
// ==========================================

/**
 * Status Effect Asset - Global definition for status effects
 * Universal icons and behaviors (not affected by skins)
 */
export interface StatusEffectAsset {
  id: string;
  name: string;
  description: string;
  type: StatusEffectType;

  // Visual (universal, not skin-dependent)
  iconSprite: SpriteReference;    // 16x16 or 24x24 icon for display above entities

  // Default behavior (can be overridden per-spell)
  defaultDuration: number;        // Turns the effect lasts
  defaultValue?: number;          // Damage/heal per turn (for Poison, Regen, etc.)

  // Processing
  processAtTurnStart: boolean;    // When to apply effect (start or end of turn)

  // Special behaviors
  removedOnDamage?: boolean;      // For Sleep - wake up when damaged
  preventsMelee?: boolean;        // For Disarmed
  preventsRanged?: boolean;       // For Silenced
  preventsMovement?: boolean;     // For effects that root/freeze
  preventsAllActions?: boolean;   // For Stun/Sleep

  // Stacking rules
  stackingBehavior: 'refresh' | 'stack' | 'replace' | 'highest';
  maxStacks?: number;             // Maximum stack count (for 'stack' behavior)

  // Visual overrides (for Shield type)
  healthBarColor?: string;        // Color to use for health bar when this effect is active

  // Polymorph configuration
  polymorphSprite?: SpriteReference;  // Sprite to replace entity with during polymorph

  // Stealth configuration
  stealthOpacity?: number;        // Opacity when stealthed (0-1, default 0.5)

  // Overlay sprite - renders on top of entity at reduced opacity (for shields, deflect, etc.)
  overlaySprite?: SpriteReference;  // Sprite to overlay on entity (supports spritesheets)
  overlayOpacity?: number;          // Opacity of overlay (0-1, default 0.5)

  // Metadata
  createdAt: string;
  isBuiltIn?: boolean;            // Built-in vs custom
  folderId?: string;              // Optional folder assignment
}

/**
 * Parallel action tracker - manages actions running on independent timers
 */
export interface ParallelActionTracker {
  actionIndex: number;          // Which action in behavior array
  lastTriggerTime: number;      // Date.now() of last execution
  active: boolean;
}

// ==========================================
// SOUND SYSTEM
// ==========================================

/**
 * Sound triggers - events that can play sounds
 */
export type SoundTrigger =
  // Character/Enemy actions
  | 'death'
  | 'damage_taken'
  // Tile interactions
  | 'teleport'
  | 'ice_slide'
  | 'tile_damage'
  | 'pressure_plate'
  // Game state
  | 'victory'
  | 'defeat'
  | 'life_lost'
  // UI sounds
  | 'button_click'
  | 'character_placed'
  | 'character_removed'
  | 'simulation_start'
  | 'simulation_stop'
  | 'error';

/**
 * Sound settings for volume control
 */
export interface SoundSettings {
  masterVolume: number;    // 0-1
  musicVolume: number;     // 0-1
  sfxVolume: number;       // 0-1
  enabled: boolean;        // Global on/off toggle
}

/**
 * Sound asset - stored audio data
 */
export interface SoundAsset {
  id: string;
  name: string;
  description?: string;
  audioData?: string;      // Base64 encoded audio data (optional if audioUrl is provided)
  audioUrl?: string;       // URL to audio file (e.g., Supabase storage URL)
  duration?: number;       // Duration in seconds (for display)
  createdAt: string;
  isBuiltIn?: boolean;     // True for default sounds
  folderId?: string;       // Optional folder assignment
}

/**
 * Sound configuration for an entity (character/enemy)
 */
export interface EntitySoundSet {
  death?: string;          // Sound asset ID
  damageTaken?: string;    // Sound asset ID
  // Additional entity-specific sounds can be added here
}

/**
 * Global sound configuration for the game
 */
export interface GlobalSoundConfig {
  // Tile interactions
  teleport?: string;       // Sound asset ID
  iceSlide?: string;
  tileDamage?: string;
  pressurePlate?: string;

  // Game state
  victory?: string;
  defeat?: string;
  lifeLost?: string;

  // UI sounds
  buttonClick?: string;
  characterPlaced?: string;
  characterRemoved?: string;
  simulationStart?: string;
  simulationStop?: string;
  error?: string;

  // Background music
  backgroundMusic?: string;
  victoryMusic?: string;
  defeatMusic?: string;
}

// ==========================================
// COLLECTIBLE SYSTEM
// ==========================================

/**
 * Collectible effect types - what happens when collected
 */
export type CollectibleEffectType =
  | 'score'           // Add points to game score
  | 'status_effect'   // Apply a status effect to collector (powerups!)
  | 'win_key'         // Required for 'collect_keys' win condition
  | 'heal'            // Restore health to collector
  | 'damage';         // Harm the collector (trap collectibles)

/**
 * Configuration for a single collectible effect
 */
export interface CollectibleEffectConfig {
  type: CollectibleEffectType;

  // For 'score' type
  scoreValue?: number;

  // For 'status_effect' type
  statusAssetId?: string;        // Reference to StatusEffectAsset
  statusDuration?: number;       // Override default duration
  statusValue?: number;          // Override default value

  // For 'win_key' type
  keyId?: string;                // Unique key identifier for win condition matching

  // For 'heal' and 'damage' types
  amount?: number;               // HP to heal or damage to deal
}

/**
 * Who can pick up this collectible
 */
export interface CollectiblePickupPermissions {
  characters: boolean;           // Player characters can collect
  enemies: boolean;              // Enemies can collect
}
