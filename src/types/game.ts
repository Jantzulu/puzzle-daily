// Core game type definitions

export enum Direction {
  NORTH = 'north',
  EAST = 'east',
  SOUTH = 'south',
  WEST = 'west',
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

  // Combat
  ATTACK_FORWARD = 'attack_forward',
  ATTACK_RANGE = 'attack_range',
  ATTACK_AOE = 'attack_aoe',

  // Conditional
  IF_WALL = 'if_wall',
  IF_ENEMY = 'if_enemy',

  // Special
  WAIT = 'wait',
  TELEPORT = 'teleport',
  REPEAT = 'repeat',
}

export type WallCollisionBehavior = 'stop' | 'turn_left' | 'turn_right' | 'turn_around' | 'continue';

export interface CharacterAction {
  type: ActionType;
  params?: any;
  tilesPerMove?: number; // How many tiles to move per tick (default: 1)
  onWallCollision?: WallCollisionBehavior; // What to do when hitting a wall (default: 'stop')
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
}

export type GameStatus = 'setup' | 'running' | 'victory' | 'defeat';

export interface GameState {
  puzzle: Puzzle;
  placedCharacters: PlacedCharacter[];
  currentTurn: number;
  simulationRunning: boolean;
  gameStatus: GameStatus;
  score: number;
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
