/* eslint-disable @typescript-eslint/no-explicit-any */
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
// ACTION STEP
// ==========================================

export interface ActionStep {
  text: string;
  subSteps?: string[];
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
  triggerMode?: 'toggle' | 'hold';  // 'toggle' = flip on step (default), 'hold' = only active while stood on
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
  newFacing?: Direction;                // For 'fixed' mode — set to this exact compass direction
  directionChangeMode?: 'fixed' | 'clockwise' | 'counter_clockwise'; // How to change direction (default: 'fixed')
  directionChangeAngle?: 45 | 90 | 135 | 180; // Degrees to rotate (for clockwise/counter_clockwise, default: 90)

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
  customType?: string;        // Legacy alias for customTileTypeId — older saved puzzles still carry this. Read fallback: customType ?? customTileTypeId.
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
  FACE_DIRECTION = 'face_direction',

  // Combat
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

export type ExecutionMode = 'sequential' | 'parallel' | 'parallel_with_previous'; // parallel_with_previous is DEPRECATED — use linkedToNext instead

export const TURN_INTERVAL_MS = 800;

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
  faceDirection?: Direction; // Target direction for FACE_DIRECTION action

  // Execution configuration (new system)
  executionMode?: ExecutionMode;  // Default: 'sequential'
  trigger?: TriggerConfig;        // For parallel actions
  linkedToNext?: boolean;         // If true, the next sequential action executes on the same turn

  // For SPELL action type
  spellId?: string;             // Reference to spell in library
  directionOverride?: Direction[]; // Override spell's default directions (absolute)
  relativeDirectionOverride?: RelativeDirection[]; // Override with relative directions
  useRelativeOverride?: boolean; // If true, use relativeDirectionOverride instead of directionOverride

  // Auto-targeting configuration
  autoTargetNearestEnemy?: boolean; // Override spell direction to aim at closest enemy
  autoTargetNearestCharacter?: boolean; // Override spell direction to aim at closest character (for enemies or healing)
  autoTargetNearestDeadAlly?: boolean; // Target nearest dead ally (for resurrect spells)
  autoTargetMode?: 'omnidirectional' | 'cardinal' | 'diagonal'; // Directional constraints for auto-targeting (default: omnidirectional)
  autoTargetRange?: number;         // Maximum range for auto-targeting (0 = unlimited). Auto-seeded from trigger.eventRange when an "in range" trigger event is selected; dev can override after. Engine falls back to trigger.eventRange when this is unset.
  maxTargets?: number;              // Maximum number of targets to attack/heal (for multi-target spells)
  homing?: boolean;                 // If true with auto-targeting, projectile tracks target and guarantees hit
  homingPathStyle?: 'grid' | 'straight' | 'pathfinding'; // Visual path: 'grid' follows tiles, 'straight' flies direct, 'pathfinding' navigates around walls (default: 'straight')
  homingIgnoreWalls?: boolean;          // If true, homing projectile passes through walls (default: true)
  homingHitAlongPath?: boolean;         // If true, grid homing hits entities along the path (not just target)

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
  defaultFacing: Direction;
  behavior: CharacterAction[];
  actionSteps?: ActionStep[]; // Numbered action steps displayed on play/playtest pages
  attributes?: string[];    // Attribute bullets displayed alongside action steps
  canOverlapEntities?: boolean; // If true, can walk through other entities and trigger overlap events (ghost mode)
  behavesLikeWall?: boolean; // If true, triggers wall collision behaviors when alive
  behavesLikeWallDead?: boolean; // If true, triggers wall collision behaviors when dead
  blocksMovement?: boolean; // If true, stops entities trying to walk through (no wall reaction, just stops them)
  blocksMovementDead?: boolean; // If true, corpse stops entities trying to walk through
  contactDamage?: number; // Damage dealt when walking into enemies (0 or undefined = no contact damage)
  immuneToPush?: boolean; // If true, cannot be moved by push abilities
  isFloating?: boolean; // If true, sprite floats/flies — centered in thumbnails instead of bottom-aligned
  // Sound configuration
  sounds?: EntitySoundSet; // Character-specific sounds (death, damage, etc.)
  // Death drop configuration
  droppedCollectibleId?: string; // CustomCollectible ID to spawn on death

  // Initial status effects — applied when the entity is placed/spawned
  initialStatusEffects?: Array<{
    statusAssetId: string;   // Reference to a StatusEffectAsset
    durationOverride?: number; // Optional: override the default duration (0 or undefined = use default, -1 = permanent/infinite)
    valueOverride?: number;    // Optional: override the default value (damage/heal per turn)
  }>;

  folderId?: string;  // Folder assignment for asset organization (Custom* subtypes carry this; declared here so *WithSprite types satisfy useFilteredAssets's constraint)
}

export interface Enemy {
  id: string;
  name: string;
  title?: string; // Optional title displayed after name in italics (e.g., "the Terrible")
  description?: string; // Description of the enemy
  spriteId: string;
  health: number;
  behavior?: EnemyBehavior;
  tooltipSteps?: string[]; // Legacy — superseded by actionSteps
  actionSteps?: ActionStep[]; // Numbered steps describing what this enemy does
  attributes?: string[]; // Passive traits shown alongside action steps
  canOverlapEntities?: boolean; // If true, can walk through other entities and trigger overlap events (ghost mode)
  behavesLikeWall?: boolean; // If true, triggers wall collision behaviors when alive
  behavesLikeWallDead?: boolean; // If true, triggers wall collision behaviors when dead
  blocksMovement?: boolean; // If true, stops entities trying to walk through (no wall reaction, just stops them)
  blocksMovementDead?: boolean; // If true, corpse stops entities trying to walk through
  contactDamage?: number; // Damage dealt when walking into characters (0 or undefined = no contact damage)
  immuneToPush?: boolean; // If true, cannot be moved by push abilities
  isFloating?: boolean; // If true, sprite floats/flies — centered in thumbnails instead of bottom-aligned

  // Boss configuration
  isBoss?: boolean; // If true, this enemy is a boss - enables 'defeat_boss' win condition

  // Melee priority
  hasMeleePriority?: boolean; // If true, this enemy attacks before characters in melee exchanges (default: false)

  // Sound configuration
  sounds?: EntitySoundSet; // Enemy-specific sounds (death, damage, etc.)

  // Death drop configuration
  droppedCollectibleId?: string; // CustomCollectible ID to spawn on death

  // Initial status effects — applied when the entity is placed/spawned
  initialStatusEffects?: Array<{
    statusAssetId: string;   // Reference to a StatusEffectAsset
    durationOverride?: number; // Optional: override the default duration (0 or undefined = use default, -1 = permanent/infinite)
    valueOverride?: number;    // Optional: override the default value (damage/heal per turn)
  }>;

  folderId?: string;  // Folder assignment for asset organization (Custom* subtypes carry this; declared here so *WithSprite types satisfy useFilteredAssets's constraint)
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
  isCasting?: boolean; // True on the turn a spell is cast — per-turn casting animation flag (deterministic, no clock)
  statusEffects?: StatusEffectInstance[]; // Active status effects on this enemy
  spellCooldowns?: Record<string, number>; // Spell ID -> turns remaining on cooldown
  spellUseCounts?: Record<string, number>; // Spell ID -> number of times used this game (for maxUsesPerGame)
  pendingProjectileDeath?: boolean; // Deferred death: entity is logically dead but waiting for projectile visual to arrive
  pendingVisualDamage?: number; // Sum of damage from hits that have landed logically but haven't reached visually yet. Bar displays currentHealth + pendingVisualDamage, so each visual arrival drops the bar by exactly that hit's damage.
  diedOnTurn?: number; // Turn when this entity died logically (damage took HP to 0). Stamped once at first death, survives pending→dead→pending flips. Movement blockers treat `dead && currentTurn <= diedOnTurn + 1` as still-occupying so the tile stays blocked through the next turn's action phase — prevents the determinism race where the deferred pending→dead visual commit can flip tile passability between runs depending on animation frame timing.
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

  // Throw/Place spell fields
  spawnTurn?: number;                      // Game turn when spawned (for duration tracking)
  spawnTime?: number;                      // Date.now() when spawned (for scale-up animation)
  duration?: number;                       // Turns remaining before despawn (undefined = permanent)
  despawning?: boolean;                    // Despawn animation in progress
  despawnTime?: number;                    // Date.now() when despawn animation began
  placedByEntityId?: string;               // Entity that placed/threw this
  placedByEntityType?: 'character' | 'enemy';
  placerImmuneUntilTurn?: number;          // Grace period: placer can't pick up until this turn
  placerPermanentlyImmune?: boolean;       // Placer can never pick up
  overridePermissions?: CollectiblePickupPermissions; // Override base collectible permissions
  sourceSpellId?: string;                  // Spell that created this (for ItemsDisplay)
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

  // Metadata — tags and description for organization
  tags?: string[];        // User-defined tags (e.g., "tutorial", "hard", "boss")
  description?: string;   // Short description shown in library

  // Training arena flag — shown in Training Grounds page
  isTraining?: boolean;
}

export interface PlacedCharacter {
  characterId: string;
  x: number;
  y: number;
  facing: Direction;
  currentHealth: number;
  maxHealth?: number;  // Stamped at placement from the source Character.health, so the no_damage_taken quest can compare against the original max regardless of mid-puzzle Character asset edits.
  actionIndex: number;
  active: boolean;
  dead: boolean;
  parallelTrackers?: ParallelActionTracker[]; // For parallel spell execution
  justTeleported?: boolean; // Set when teleporting, cleared after animation
  teleportFromX?: number;   // Origin tile before teleport
  teleportFromY?: number;
  teleportSprite?: TeleportSpriteConfig; // DEPRECATED: No longer used, activation sprite is on tile instead
  iceSlideDistance?: number; // Number of tiles slid on ice (for slower animation)
  isCasting?: boolean; // True on the turn a spell is cast — per-turn casting animation flag (deterministic, no clock)
  statusEffects?: StatusEffectInstance[]; // Active status effects on this character
  spellCooldowns?: Record<string, number>; // Spell ID -> turns remaining on cooldown
  spellUseCounts?: Record<string, number>; // Spell ID -> number of times used this game (for maxUsesPerGame)
  spellDirectionOverrides?: Record<string, Direction>; // User-chosen directions for redirect spells (set during setup)
  pendingProjectileDeath?: boolean; // Deferred death: entity is logically dead but waiting for projectile visual to arrive
  pendingVisualDamage?: number; // Sum of damage from hits that have landed logically but haven't reached visually yet. Bar displays currentHealth + pendingVisualDamage, so each visual arrival drops the bar by exactly that hit's damage.
  diedOnTurn?: number; // See PlacedEnemy.diedOnTurn — deterministic death-turn stamp used by movement blockers to keep tile occupied through the next turn.
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

  // Tiles being vacated this turn (for train-like movement)
  // If an entity tries to move into a tile that's being vacated by an ally, allow it
  tilesBeingVacated?: Set<string>;  // Set of "x,y" strings

  // Projectile event timeline — recorded during replay generation
  projectileTimeline?: ProjectileTimeline;
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
  STEADFAST = 'steadfast', // Immune to direction changes (redirect spells, items, tiles)
  REFLECT = 'reflect',     // Reflects projectiles back at caster's team
  // Entity trait types (replace property flags)
  CONTACT_DAMAGE = 'contact_damage', // Deals damage when another entity enters same tile
  GHOST = 'ghost',                   // Can overlap / pass through other entities
  WALL_ALIVE = 'wall_alive',         // Triggers wall-collision reactions when alive
  WALL_DEAD = 'wall_dead',           // Triggers wall-collision reactions when dead (corpse)
  WALL_BOTH = 'wall_both',           // Triggers wall-collision reactions alive and dead
  HALT_ALIVE = 'halt_alive',         // Stops movement without triggering wall reactions when alive
  HALT_DEAD = 'halt_dead',           // Stops movement without triggering wall reactions when dead
  HALT_BOTH = 'halt_both',           // Stops movement without triggering wall reactions alive and dead
  PRIORITY = 'priority',             // Acts before non-priority entities in melee ordering
  STURDY = 'sturdy',                 // Immune to push effects
  CHARM = 'charm',                   // Inverts team allegiance for duration; entity auto-executes its normal behavior against its own original team
  DISPEL = 'dispel',                 // Instantly removes positive status effects from the target
  CLEANSE = 'cleanse',               // Instantly removes negative status effects from the target
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
  damage?: number;              // Damage dealt (mutually exclusive with healing)
  healing?: number;             // HP to restore

  // Range/Area
  range?: number;               // Max tiles away (default: 1)
  aoeRadius?: number;           // For AOE attacks (tiles from center)

  // Projectile behavior (for PROJECTILE pattern)
  projectileSpeed?: number;     // Tiles per turn (default: 4)
  projectilePierces?: boolean;  // Continue through enemies (default: false)
  homingPathStyle?: 'grid' | 'straight' | 'pathfinding'; // Visual path: 'grid' follows tiles, 'straight' flies direct, 'pathfinding' navigates around walls (default: straight)
  homingIgnoreWalls?: boolean;          // If true, homing passes through walls (default: true)
  homingHitAlongPath?: boolean;         // If true, grid homing hits entities along path

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
  bounceEffectSprite?: SpriteReference; // Effect at wall contact on bounce
  criticalHitEffectSprite?: SpriteReference; // Effect on backstab/critical hit
  backstabEnabled?: boolean;          // Whether this attack does double damage from behind

  // Redirect (for REDIRECT spell template)
  isRedirect?: boolean;               // If true, projectile changes target's direction instead of dealing damage
  redirectMode?: 'clockwise' | 'counter_clockwise' | 'face_projectile' | 'face_away' | 'fixed'; // How to change direction
  redirectAngle?: 45 | 90 | 135 | 180; // Degrees to rotate (for clockwise/counter_clockwise)
  redirectFixedDirection?: Direction;  // For 'fixed' mode — set target to this exact compass direction

  // Animation timing
  effectDuration?: number;      // MS to show effects (default: 300)

  // Projectile scale
  projectileScale?: number;     // Visual size multiplier for projectile sprites (default: 1.0)

  // Special Effects
  statusEffect?: StatusEffect;  // Apply status on hit
}

/**
 * Per-frame visual state for an active projectile.
 *
 * This type groups every field that is written by the per-frame visual loop
 * (`updateProjectiles` in simulation.ts) and/or used purely for visual
 * interpolation. It exists as the target shape for Phase C of the projectile
 * refactor (see docs/projectile-refactor-plan.md): moving these fields off
 * `GameState` into a visual-only side-table keyed by projectile id, so that
 * `JSON.parse(JSON.stringify(gameState))` (the deep-copy turn snapshot) can
 * never capture wall-clock-timing noise.
 *
 * Status (Phase C-3 complete): `x`, `y`, `currentTileIndex`, and
 * `visualPastReflectPoint` are the live per-frame visual state and are
 * authoritative here (not on Projectile). `startTime`, `tileEntryTime`, and
 * `homingVisualStart*` were reclassified BRIDGE — they are only written at
 * turn boundaries (spawn + reflect), so they remain on Projectile where
 * logic can set them and the visual loop can read them; deep copies of
 * GameState capture the correct turn-boundary value.
 */
export interface ProjectileVisualState {
  /** Current visual X position (can be fractional, updated per-frame). */
  x: number;
  /** Current visual Y position (can be fractional, updated per-frame). */
  y: number;
  /** Wall-clock spawn time — anchor for interpolation. Seeded from Projectile.startTime. */
  startTime: number;
  /** Visual progress through tilePath. Authoritative — not on Projectile (Phase C-3). */
  currentTileIndex?: number;
  /** Set once when visual crosses reflect point. Stable — never toggles back. */
  visualPastReflectPoint?: boolean;
  /**
   * Turn number at which this entry was last written by updateProjectiles.
   * Lets drawProjectile distinguish "fresh mid-flight position" (safe to
   * render during replay pause) from "stale position left over from a
   * previous turn" (must fall back to logical after replay seek/step).
   */
  lastUpdateTurn?: number;
}

/**
 * Active projectile in the game world.
 *
 * Fields are grouped by role. Categories matter for the projectile refactor
 * plan (docs/projectile-refactor-plan.md):
 *
 * - LOGICAL: authoritative game state. Read/written by resolveProjectiles at
 *   turn boundaries. Determines gameplay outcomes.
 * - VISUAL: per-frame interpolation state. Written by updateProjectiles,
 *   never read by logic. Will move to ProjectileVisualState in Phase C.
 * - BRIDGE: set by logical resolution, consumed by the visual loop when the
 *   visual catches up (e.g. `hitResult` — logic decides a hit at turn N, the
 *   visual applies damage/VFX when the projectile sprite reaches the target).
 */
export interface Projectile {
  // -------- Identity (LOGICAL) --------
  id: string;                   // Unique instance ID
  attackData: CustomAttack;     // Attack definition

  // -------- Position (all LOGICAL; visual interpolation lives in ProjectileVisualState) --------
  startX: number;               // Original spawn X (LOGICAL)
  startY: number;               // Original spawn Y (LOGICAL)
  /**
   * LOGICAL — cumulative Euclidean path length the projectile has traveled,
   * accumulated from per-turn movement segments. Homing bolts chasing moving
   * targets take curved paths, so Euclidean displacement from spawn can
   * *decrease* as the bolt curves — which made the old `sqrt((logical-start)^2)`
   * range budget effectively reset, letting bolts travel far beyond their
   * nominal range. Tracking cumulative path length is monotonic: each turn
   * adds the segment length to this counter, range is consumed consistently.
   * Reset on reflect (new range budget from the reflector's position).
   */
  pathTraveled?: number;
  /**
   * LOGICAL — current authoritative tile position, written at turn boundaries
   * by resolveProjectiles / updateProjectilesHeadless / reflectProjectile.
   * This is the value engine code reads when it wants "where is the projectile
   * now?" Phase C-2 migrated the previous visual `x`/`y` fields off this type
   * into the `Map<string, ProjectileVisualState>` owned by AnimatedGameBoard,
   * so deep copies of GameState can no longer capture mid-flight visual state.
   */
  logicalX: number;
  /** LOGICAL — see logicalX. */
  logicalY: number;
  targetX: number;              // Destination X (LOGICAL)
  targetY: number;              // Destination Y (LOGICAL)

  // -------- Movement (LOGICAL) --------
  direction: Direction;         // Facing direction for sprite rotation
  speed: number;                // Tiles per turn

  // -------- State --------
  active: boolean;              // LOGICAL
  /**
   * VISUAL — set when a clean-deactivate `hitResult` fires on a frame where
   * the approach-shrink had no travel window to run (e.g. a homing bolt
   * whose target just died mid-flight). The draw loop renders a
   * shorter-than-standard lingering shrink from this moment, and the
   * update loop keeps the bolt active until `TARGET_LOST_LINGER_MS`
   * elapses, then removes. For cases where approach-shrink did run
   * (wall hit mid-flight, range exhausted on prior turn), `despawning`
   * stays false and the bolt removes immediately at consume — no
   * extra lingering.
   */
  despawning?: boolean;
  /** VISUAL — wall-clock time when lingering shrink started. */
  despawnStartTime?: number;
  /**
   * BRIDGE — wall-clock spawn time. Written by logic at spawn and rewritten
   * by `reflectProjectile` on reflect. Read by the visual loop as the anchor
   * for interpolation. Only mutated at turn boundaries (never per-frame), so
   * deep copies of GameState capture the correct value. Phase C-3: kept on
   * Projectile rather than moving to the side-table — reclassified BRIDGE
   * after confirming no per-frame writes exist.
   */
  startTime: number;

  // -------- Bounce behavior (LOGICAL) --------
  bounceOffWalls?: boolean;     // Enable wall bouncing
  maxBounces?: number;          // Maximum allowed bounces
  bounceCount?: number;         // Current bounce count
  bounceBehavior?: BounceBehavior; // How projectile bounces
  bounceTurnDegrees?: 45 | 90 | 135; // Turn amount for turn_left/turn_right

  // -------- Metadata (LOGICAL) --------
  sourceCharacterId?: string;   // Who fired this
  sourceEnemyId?: string;       // If fired by enemy
  sourceEnemyIndex?: number;    // Array index of source enemy (for duplicate ID handling in reflect)
  spellAssetId?: string;        // For status effect application on hit

  // -------- Homing (mixed: config + target are LOGICAL, visual anchors are BRIDGE) --------
  isHoming?: boolean;           // LOGICAL — If true, projectile chases target entity
  homingPathStyle?: 'grid' | 'straight' | 'pathfinding'; // LOGICAL — Visual: 'grid' follows tiles, 'straight' flies direct, 'pathfinding' navigates around walls
  homingIgnoreWalls?: boolean;  // LOGICAL — If true, passes through walls (default: true)
  homingHitAlongPath?: boolean; // LOGICAL — If true, grid homing hits entities along path
  /** BRIDGE — straight-line homing anchor X. Written by logic at spawn and
   *  re-anchored by resolveProjectiles each turn so slow projectiles
   *  interpolate from their current logical position. Only mutated at turn
   *  boundaries; deep copies capture the correct value. Phase C-3: kept on
   *  Projectile, reclassified BRIDGE. */
  homingVisualStartX?: number;
  /** BRIDGE — straight-line homing anchor Y. See homingVisualStartX. */
  homingVisualStartY?: number;
  /** BRIDGE — straight-line homing anchor timestamp. See homingVisualStartX. */
  homingVisualStartTime?: number;
  targetEntityId?: string;      // LOGICAL — ID of entity being tracked
  targetIsEnemy?: boolean;      // LOGICAL — true = target is enemy, false = target is character
  /**
   * LOGICAL — array index of target enemy when targetIsEnemy is true. Required
   * to disambiguate homing targets when multiple enemies share the same
   * enemyId (duplicate placements). Without this, resolveProjectiles' lookup
   * by enemyId returns the first match in placement order regardless of which
   * instance findNearestEnemies actually selected. Same pattern as
   * sourceEnemyIndex / hitEnemyIndices.
   */
  targetEnemyIndex?: number;

  // -------- Piercing tracking (LOGICAL) --------
  hitEntityIds?: string[];      // IDs of entities already hit by this projectile
  hitEnemyIndices?: number[];   // Array indices of enemies hit (for duplicate ID handling)

  // -------- Tile-based movement (LOGICAL path + BRIDGE progress) --------
  /** LOGICAL — pre-computed at spawn, deterministic. */
  tilePath?: Array<{ x: number; y: number }>;
  /**
   * LOGICAL — tile progress as of the last turn boundary. Reset to 0 by
   * logical paths (resolveProjectiles / updateProjectilesHeadless /
   * reflectProjectile) when a new tilePath is installed. Phase C-3: the
   * per-frame visual write is gone — visual progress now lives in
   * `ProjectileVisualState.currentTileIndex` owned by AnimatedGameBoard.
   * The visual loop mirrors its computed per-frame index into the side-table
   * and reads it back for hitResult-timing checks.
   */
  currentTileIndex?: number;
  /**
   * BRIDGE — wall-clock time when the visual should treat the current tile
   * as having started. Written by logic (spawn + resolveProjectiles each
   * turn) to anchor tile-to-tile interpolation to turn boundaries. Only
   * mutated at turn boundaries; deep copies capture the correct value.
   */
  tileEntryTime?: number;

  // -------- Reflect status (LOGICAL) --------
  reflected?: boolean;        // True if this projectile has been reflected
  teamSwapped?: boolean;      // True = targeting is flipped (hero proj hits heroes, enemy proj hits enemies)
  reflectTintColor?: string;            // Tint color applied to reflected projectile
  reflectOverrideSprite?: SpriteReference; // Replacement sprite for reflected projectile

  // -------- Deterministic turn resolution (LOGICAL + BRIDGE fields) --------
  spawnTurn?: number;           // LOGICAL — gameState.currentTurn when spawned
  logicalTileIndex?: number;    // LOGICAL — Deterministic total tiles traversed (incremented by speed each turn)
  reflectAtTileIndex?: number;  // BRIDGE — logic sets the reflect tile; visual applies tint after this
  /**
   * BRIDGE — logic decides the outcome of this projectile's flight; visual
   * consumes when the sprite reaches `hitTileIndex` (or earlier for
   * straight-line homing). Used for three cases, distinguished by which
   * optional fields are populated:
   *   1. Entity hit: `vfxSprite`/`vfxX`/`vfxY` + optional `deferredDeath*`.
   *   2. Throw/place landing: `placeCollectibleConfig`.
   *   3. Pure deactivation (wall / range exhaustion): only `hitTileIndex`
   *      + `deactivate: true`. Replaces the separate pendingDeactivation
   *      flag that existed pre-Phase-D.
   */
  hitResult?: ProjectileHitResult;
  /**
   * BRIDGE — pierce pass-through decrements. Each entry fires independently
   * when the bolt's visual crosses its `hitTileIndex`, matching how other
   * spells decrement bars on visual contact. `deferredDeath*` on hitResult
   * still carries the pierce-STOP entity (the bolt's final landing tile).
   * Pass-through entries accumulate across turns until their hitTileIndex
   * is reached; a batch-consume at hitResult time is a safety net for any
   * entry not already consumed.
   */
  pendingVisualDecrements?: ProjectileVisualDecrement[];
  pendingReflectVfx?: { sprite: SpriteReference; x: number; y: number; duration: number; scale: number }; // BRIDGE — deferred reflect VFX
  // Phase C: visualPastReflectPoint moved out of Projectile into the side-table
  // owned by AnimatedGameBoard (see projectileVisualStateRef). It lives on
  // ProjectileVisualState now so deep copies of GameState can't capture it.

  // -------- Throw/Place (LOGICAL) — carries item placement data through projectile flight --------
  throwPlaceConfig?: ThrowPlaceConfig;

  // -------- Internal (not serialized) --------
  _recorded?: boolean;          // Timeline recording flag for replay
  _turnStartTileIndex?: number; // Replay-only: tile index at start of turn so step-back/forward animations begin where the previous turn ended
}

// ==========================================
// PROJECTILE EVENT TIMELINE (Replay System)
// ==========================================

/**
 * A single projectile event recorded during replay generation.
 * These events are used to recreate projectile visuals during replay playback.
 */
export interface ProjectileEvent {
  turn: number;           // Which turn this event occurs
  projId: string;         // Unique projectile ID
  type: 'spawn' | 'hit' | 'reflect' | 'deactivate' | 'wall_hit' | 'homing_move';

  // Position
  x: number;
  y: number;

  // Spawn-specific
  tilePath?: Array<{ x: number; y: number }>;  // Full visual path
  direction?: Direction;
  speed?: number;
  sourceEntityId?: string;
  sourceIsEnemy?: boolean;
  isHoming?: boolean;
  homingPathStyle?: 'grid' | 'straight' | 'pathfinding';

  // Spell appearance
  spellAssetId?: string;       // For loading the projectile sprite
  attackData?: CustomAttack;   // Contains sprite info
  projectileScale?: number;

  // Reflect-specific
  reflected?: boolean;
  reflectTintColor?: string;
  reflectOverrideSprite?: SpriteReference;
  reflectAtTileIndex?: number;
  combinedPath?: Array<{ x: number; y: number }>;  // approach + reflected tiles

  // Hit-specific
  targetEntityId?: string;
  targetIsEnemy?: boolean;
  damage?: number;
  hitTileIndex?: number;
  hitVfxSprite?: SpriteReference;
  // Deferred-death fields — mirror ProjectileHitResult so replay can
  // reconstruct the full hitResult on the replay projectile. Without these,
  // buildReplayProjectiles builds a hitResult that deactivates the bolt but
  // never decrements pendingVisualDamage / commits pendingDeath → dead, so
  // the final turn's kill shows as a still-alive enemy with an elevated bar.
  deferredDeathEntityId?: string;
  deferredDeathIsEnemy?: boolean;
  deferredDeathIndex?: number;

  // Homing trajectory target (where the engine was aiming this turn).
  // Populated on `homing_move` / `hit` / `deactivate` (for range-exhausted
  // freeze). Lets replay interpolate toward the same point the live game
  // aimed at, rather than reconstructing from tilePath endpoints (which
  // only captures whole tiles and loses the fractional target).
  targetX?: number;
  targetY?: number;
}

/** Timeline stored alongside turn history */
export type ProjectileTimeline = ProjectileEvent[];

/**
 * Configuration for Throw/Place spell item placement.
 * Carried on the projectile during flight, consumed on arrival.
 */
export interface ThrowPlaceConfig {
  collectibleId: string;                            // CustomCollectible asset to place
  duration?: number;                                // Turns before despawn (undefined = permanent)
  overridePermissions?: CollectiblePickupPermissions; // Override base collectible permissions
  placerEntityId: string;                           // Entity that cast the spell
  placerEntityType: 'character' | 'enemy';
  gracePeriodTurns: number;                         // Turns of caster immunity (default 1)
  placerPermanentlyImmune: boolean;                 // Caster can never pick up (default false)
  sourceSpellId: string;                            // Reference to the spell for ItemsDisplay
}

/**
 * A single visual-damage decrement owed to an entity that was hit by this
 * projectile but is NOT the bolt's final landing point (i.e. a pierce
 * pass-through). Consumed when the bolt's visual reaches `hitTileIndex` —
 * same timing semantics as other spells: the bar drops the moment the
 * projectile visually makes contact with the target. Commits
 * pendingProjectileDeath → dead at the same moment if the hit killed the
 * entity.
 */
export interface ProjectileVisualDecrement {
  targetEntityId: string;
  targetIsEnemy: boolean;
  targetIndex?: number;
  damage: number;
  /** Index in proj.tilePath where the visual should fire this decrement. */
  hitTileIndex: number;
}

/**
 * Pre-computed projectile hit result from deterministic turn resolution.
 * Stored on the projectile so the visual system knows when/where to show VFX and deactivate.
 */
export interface ProjectileHitResult {
  hitTileIndex: number;           // Index in tilePath where hit occurs
  deactivate: boolean;            // Remove projectile after visual reaches this tile
  vfxSprite?: SpriteReference;    // Hit VFX to spawn
  vfxX?: number;                  // World X for VFX
  vfxY?: number;                  // World Y for VFX
  deferredDeathEntityId?: string; // Entity whose death animation should wait for projectile arrival
  deferredDeathIsEnemy?: boolean; // Whether the deferred entity is an enemy
  deferredDeathIndex?: number;    // Array index for duplicate enemies
  placeCollectibleConfig?: ThrowPlaceConfig; // Throw/Place: place item when visual arrives
  damage?: number;                // Damage applied logically at hit time; consumed by visual arrival to decrement pendingVisualDamage on the target.
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
  rotation?: Direction;         // Direction enum value used for rendering rotation lookup (see getRotationForDirection in AnimatedGameBoard)
}

/**
 * Extended CharacterAction to support custom attacks
 * Backwards compatible - existing actions still work
 */
export interface CharacterActionExtended extends CharacterAction {
  // Reserved for future per-action extensions; the legacy customAttack /
  // customAttackId fields lived here previously and have been removed.
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
  MELEE_CONE = 'melee_cone',    // Cone/arc attack in facing direction
  LINEAR = 'magic_linear',      // Projectile in straight line (kept 'magic_linear' value for backward compat)
  AOE = 'aoe',                   // Area of effect
  RESURRECT = 'resurrect',       // Bring dead ally back to life
  PUSH = 'push',                 // Push target entity in a direction
  REDIRECT = 'redirect',         // Projectile that changes target's facing direction
  THROW_PLACE = 'throw_place',   // Place or throw a collectible item onto a tile
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
  | 'turn_right';      // Turn 90° clockwise

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

  // Cone/Arc settings (for MELEE_CONE template)
  coneAngle?: 90 | 180 | 270;     // Cone spread angle in degrees (default: 90)

  // Visual configuration
  sprites: {
    projectile?: SpriteReference;      // For linear spells (per direction)
    meleeAttack?: SpriteReference;     // For melee spells - sprite shown on attack tiles
    aoeEffect?: SpriteReference;       // For AOE spells - sprite shown on each affected tile when cast
    damageEffect: SpriteReference;     // On successful damage hit
    healingEffect?: SpriteReference;   // On successful heal (falls back to damageEffect if not set)
    castEffect?: SpriteReference;      // On caster when spell fires
    persistentArea?: SpriteReference;  // Visual for persistent ground effects (looping animation)
    bounceEffect?: SpriteReference;   // At wall contact point when projectile bounces
    criticalHitEffect?: SpriteReference; // On backstab/critical hit (falls back to damageEffect if not set)
  };

  // Status Effect Configuration (optional)
  appliesStatusEffect?: {
    statusAssetId: string;        // Reference to StatusEffectAsset
    durationOverride?: number;    // Override default duration
    valueOverride?: number;       // Override default damage/heal value
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

  // Redirect-specific settings (for REDIRECT template)
  redirectMode?: 'clockwise' | 'counter_clockwise' | 'face_projectile' | 'face_away' | 'fixed'; // How to change the target's direction
  redirectAngle?: 45 | 90 | 135 | 180; // Degrees to rotate (for clockwise/counter_clockwise modes, default: 90)
  redirectFixedDirection?: Direction;  // For 'fixed' mode — set target to this exact compass direction
  redirectAcceptsUserInput?: boolean;  // If true, player picks the redirect direction during setup

  // Throw/Place-specific settings (for THROW_PLACE template)
  spawnCollectibleId?: string;                        // CustomCollectible asset ID to place/throw
  throwPlaceDuration?: number;                        // Override item duration in turns (0 = permanent)
  throwPlaceOverridePermissions?: CollectiblePickupPermissions; // Override who can pick up
  throwPlaceGracePeriod?: number;                     // Turns of caster immunity (default 1)
  throwPlacePermanentImmunity?: boolean;              // Caster can never pick up (default false)

  // Backstab (critical strike from behind)
  backstabEnabled?: boolean;      // If true, deals double damage when attacking from behind the target

  // Projectile scale
  projectileScale?: number;       // Visual size multiplier for projectile sprites (default: 1.0)

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

  // Reflect configuration — visual treatment for reflected projectiles
  reflectTintColor?: string;             // Color to tint reflected projectiles (e.g. '#ff0000')
  reflectOverrideSprite?: SpriteReference; // Optional sprite to replace reflected projectile appearance
  reflectImpactSprite?: SpriteReference;  // Optional sprite for the bounce VFX at the reflect point
  reflectDirections?: ('front' | 'back' | 'left' | 'right')[]; // Which directions to reflect from (default: all)

  // Charm configuration — controls the canvas-drawn tint and heart icon
  charmTintEnabled?: boolean;   // Default true; set false to disable the colour tint overlay
  charmTintColor?: string;      // Hex colour for tint; default '#e879f9' (fuchsia)
  charmTintOpacity?: number;    // Opacity 0-1 for tint; default 0.35
  charmShowHeart?: boolean;     // Default true; set false to hide the ♥ heart icon

  // Dispel/Cleanse configuration
  targetingIntent?: 'hostile' | 'friendly'; // Determines auto-targeting for pure status spells (hostile=enemies, friendly=allies)
  targetEffectTypes?: StatusEffectType[] | 'all'; // Which effect types to remove (default 'all')
  immuneToDispel?: boolean;     // If true, this effect cannot be removed by Dispel
  immuneToCleanse?: boolean;    // If true, this effect cannot be removed by Cleanse
  hideFromStatusBar?: boolean;  // If true, this effect's icon is hidden from the health bar

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
// HAPTIC FEEDBACK CONFIG
// ==========================================

export type HapticPattern = 'tap' | 'medium' | 'heavy' | 'success' | 'error' | 'combat' | 'spell' | 'turn';

export interface GlobalHapticConfig {
  // Gameplay
  turnAdvance?: HapticPattern | null;
  victory?: HapticPattern | null;
  defeat?: HapticPattern | null;
  characterPlace?: HapticPattern | null;
  heroSelect?: HapticPattern | null;
  heroRemove?: HapticPattern | null;
  heroTrash?: HapticPattern | null;
  playButton?: HapticPattern | null;
  testButton?: HapticPattern | null;
  lifeLost?: HapticPattern | null;
  // Editor
  tilePaint?: HapticPattern | null;
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
  | 'damage'          // Harm the collector (trap collectibles)
  | 'redirect';       // Change the collector's facing direction

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

  // For 'redirect' type
  redirectMode?: 'clockwise' | 'counter_clockwise' | 'fixed'; // How to change direction
  redirectAngle?: 45 | 90 | 135 | 180; // Degrees to rotate (for clockwise/counter_clockwise)
  redirectFixedDirection?: Direction;  // For 'fixed' mode — set to this exact compass direction
}

/**
 * Who can pick up this collectible
 */
export interface CollectiblePickupPermissions {
  characters: boolean;           // Player characters can collect
  enemies: boolean;              // Enemies can collect
}
