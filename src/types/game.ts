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

export interface PressurePlateEffect {
  type: 'toggle_wall' | 'spawn_enemy' | 'despawn_enemy' | 'trigger_teleport';
  targetX?: number;
  targetY?: number;
  targetEnemyId?: string;  // For spawn/despawn
  stayPressed?: boolean;   // Require standing on plate vs. step once
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
}

export interface Tile {
  x: number;
  y: number;
  type: TileType;
  customTileTypeId?: string;  // Reference to CustomTileType
  teleportGroupId?: string;   // Which teleport group this tile belongs to
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

export type TriggerEvent = 'enemy_adjacent' | 'enemy_in_range' | 'contact_with_enemy' | 'wall_ahead' | 'health_below_50' | 'character_adjacent' | 'character_in_range' | 'contact_with_character';

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
  autoTargetMode?: 'omnidirectional' | 'cardinal' | 'diagonal'; // Directional constraints for auto-targeting (default: omnidirectional)
  maxTargets?: number;              // Maximum number of targets to attack/heal (for multi-target spells)
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
  retaliationDamage?: number; // Damage dealt when enemy attempts to move onto this character's tile
}

export interface Enemy {
  id: string;
  name: string;
  title?: string; // Optional title displayed after name in italics (e.g., "the Terrible")
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
  retaliationDamage?: number; // Damage dealt when character attempts to move onto this enemy's tile

  // Melee priority
  hasMeleePriority?: boolean; // If true, this enemy attacks before characters in melee exchanges (default: false)
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
}

export interface PlacedObject {
  objectId: string;
  x: number;
  y: number;
}

export interface PlacedCollectible {
  type: 'coin' | 'gem';
  x: number;
  y: number;
  scoreValue: number;
  collected: boolean;
}

export interface WinCondition {
  type: 'defeat_all_enemies' | 'collect_all' | 'reach_goal' | 'survive_turns';
  params?: any;
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
  customTileSprites?: { [customTileTypeId: string]: string };

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
  maxTurns?: number; // Optional turn limit to prevent infinite loops
  borderConfig?: BorderConfig; // Optional border decoration (legacy, use skinId instead)
  skinId?: string; // Reference to PuzzleSkin for visual theming
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
  visualSprite?: SpriteReference; // Visual indicator
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
  score: number;
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
  projectileSpeed?: number;     // Tiles per second (default: 5)
  projectilePierces?: boolean;  // Continue through enemies (default: false)

  // AOE targeting (for AOE patterns)
  aoeCenteredOnCaster?: boolean; // True: AOE around self, False: AOE at target tile
  projectileBeforeAOE?: boolean; // True: Fire projectile that explodes into AOE

  // Persistent AOE effects
  persistDuration?: number;      // Turns the AOE effect persists (0 = instant)
  persistDamagePerTurn?: number; // Damage dealt each turn to units in the area
  persistVisualSprite?: SpriteReference; // Visual indicator for persistent area

  // Visuals
  projectileSprite?: SpriteReference;  // Visual for projectile
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
  speed: number;                // Tiles per second

  // State
  active: boolean;
  startTime: number;            // Date.now() when spawned

  // Metadata
  sourceCharacterId?: string;   // Who fired this
  sourceEnemyId?: string;       // If fired by enemy
  spellAssetId?: string;        // For status effect application on hit
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
  projectileSpeed?: number;     // Tiles per second
  pierceEnemies?: boolean;      // Continue through enemies

  // AOE settings
  aoeCenteredOnCaster?: boolean; // True: AOE around self, False: AOE at target tile
  projectileBeforeAOE?: boolean; // True: Fire projectile that explodes into AOE

  // Persistent AOE effects
  persistDuration?: number;      // Turns the AOE effect persists (0 = instant)
  persistDamagePerTurn?: number; // Damage dealt each turn to units in the area

  // Melee-specific settings
  skipSpriteOnCasterTile?: boolean; // For melee spells - don't show attack sprite on caster's tile

  // Visual configuration
  sprites: {
    projectile?: SpriteReference;      // For linear spells (per direction)
    meleeAttack?: SpriteReference;     // For melee spells - sprite shown on attack tiles
    damageEffect: SpriteReference;     // On successful damage hit
    healingEffect?: SpriteReference;   // On successful heal (falls back to damageEffect if not set)
    castEffect?: SpriteReference;      // On caster when spell fires
    persistentArea?: SpriteReference;  // Visual for persistent ground effects
  };

  // Status Effect Configuration (optional)
  appliesStatusEffect?: {
    statusAssetId: string;        // Reference to StatusEffectAsset
    durationOverride?: number;    // Override default duration
    valueOverride?: number;       // Override default damage/heal value
    applyChance?: number;         // 0-1, default 1 (100%)
  };

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
