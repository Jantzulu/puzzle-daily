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

export interface Tile {
  x: number;
  y: number;
  type: TileType;
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

export type TriggerEvent = 'enemy_adjacent' | 'enemy_in_range' | 'wall_ahead' | 'health_below_50';

export interface TriggerConfig {
  mode: TriggerMode;
  intervalMs?: number;        // For interval mode
  event?: TriggerEvent;       // For event mode
}

export interface CharacterAction {
  type: ActionType;
  params?: any;
  tilesPerMove?: number; // How many tiles to move per tick (default: 1)
  onWallCollision?: WallCollisionBehavior; // What to do when hitting a wall (default: 'stop')

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
}

export interface Character {
  id: string;
  name: string;
  spriteId: string;
  description: string;
  health: number;
  attackDamage: number;
  defaultFacing: Direction;
  behavior: CharacterAction[];
  blocksMovementAlive?: boolean; // If true, acts like a wall when alive
  blocksMovementDead?: boolean; // If true, acts like a wall when dead (corpse blocks)
  retaliationDamage?: number; // Damage dealt when enemy attempts to move onto this character's tile
}

export interface Enemy {
  id: string;
  name: string;
  spriteId: string;
  health: number;
  attackDamage: number;
  behavior?: EnemyBehavior;
  blocksMovementAlive?: boolean; // If true, blocks movement when alive
  blocksMovementDead?: boolean; // If true, blocks movement when dead (wall corpse)
  retaliationDamage?: number; // Damage dealt when character attempts to move onto this enemy's tile
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

export interface BorderConfig {
  style: BorderStyle;
  customBorderSprites?: {
    topWall?: string;        // Base64 image for top border (front-facing wall)
    bottomWall?: string;     // Base64 image for bottom border (back wall)
    leftWall?: string;       // Base64 image for left border (side wall)
    rightWall?: string;      // Base64 image for right border (side wall)
    topLeftCorner?: string;  // Base64 image for top-left corner
    topRightCorner?: string; // Base64 image for top-right corner
    bottomLeftCorner?: string;  // Base64 image for bottom-left corner
    bottomRightCorner?: string; // Base64 image for bottom-right corner
  };
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
  availableCharacters: string[];
  winConditions: WinCondition[];
  maxCharacters: number;
  maxTurns?: number; // Optional turn limit to prevent infinite loops
  borderConfig?: BorderConfig; // Optional border decoration
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
}

export type GameStatus = 'setup' | 'running' | 'victory' | 'defeat';

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
  STUN = 'stun',          // Skip turns
  SLOW = 'slow',          // Reduced movement
  HASTE = 'haste',        // Increased movement
}

/**
 * Status effect instance
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

  // Visuals
  projectileSprite?: SpriteReference;  // Visual for projectile
  hitEffectSprite?: SpriteReference;   // Particle on impact
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

  // Damage
  damage: number;

  // Range/Area (conditional on template)
  range?: number;               // For linear spells (max tiles)
  radius?: number;              // For AOE spells (tiles from center)

  // Projectile settings (for linear templates)
  projectileSpeed?: number;     // Tiles per second
  pierceEnemies?: boolean;      // Continue through enemies

  // Visual configuration
  sprites: {
    projectile?: SpriteReference;      // For linear spells (per direction)
    damageEffect: SpriteReference;     // On successful hit
    castEffect?: SpriteReference;      // On caster when spell fires
  };

  // Metadata
  createdAt: string;
  isCustom: boolean;            // User-created vs built-in
}

/**
 * Parallel action tracker - manages actions running on independent timers
 */
export interface ParallelActionTracker {
  actionIndex: number;          // Which action in behavior array
  lastTriggerTime: number;      // Date.now() of last execution
  active: boolean;
}
