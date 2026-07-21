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
  DEPART = 'depart', // Leave the board (passerby v1, 2026-07-17): NOT a death — no drops, no death triggers, no corpse; dead+despawned so win checks settle and the tile frees. Render plays a full-opacity walk-out to the nearest opening. Author the route with normal moves, end with DEPART.
  REPEAT = 'repeat',
  REPEAT_UNTIL = 'repeat_until', // repeats its SEGMENT (since the previous REPEAT_UNTIL or the list start) until untilEvent fires, then falls through
}

export type WallCollisionBehavior = 'stop' | 'turn_left' | 'turn_right' | 'turn_around' | 'continue';

// ==========================================
// EXECUTION SYSTEM (New)
// ==========================================

export type ExecutionMode = 'sequential' | 'parallel' | 'parallel_with_previous'; // parallel_with_previous is DEPRECATED — use linkedToNext instead

export const TURN_INTERVAL_MS = 800;

export type TriggerMode = 'interval' | 'on_event';

export type TriggerEvent =
  // Team-relative proximity events — resolved against the holder's BASE party
  // (charm-blind). "Opposing" = the other side, "same team" = the holder's own
  // side EXCLUDING the holder itself. The vocabulary the editor writes.
  | 'opposing_adjacent' | 'opposing_in_range' | 'contact_with_opposing'
  | 'same_team_adjacent' | 'same_team_in_range' | 'contact_with_same_team'
  // Legacy ABSOLUTE proximity events — still valid on stored assets. Never
  // migrated; the engine and editor map them to the relative vocabulary at
  // read time by authoring side (engine/actions.ts resolveTriggerEvent).
  | 'enemy_adjacent' | 'enemy_in_range' | 'contact_with_enemy'
  | 'character_adjacent' | 'character_in_range' | 'contact_with_character'
  // Non-proximity events, unchanged.
  | 'wall_ahead' | 'health_below_50' | 'on_death'
  // Hit-stamp conditions (2026-07-14) — pure predicates over the hitStamps /
  // dealtStamps turn numbers written on the SACRED damage path. Freshness
  // window rides TriggerConfig.eventWindow / CharacterAction.untilWindow.
  | 'hit_by_melee' | 'hit_by_projectile' | 'hit_by_contact' | 'hit_by_any'
  | 'landed_melee_hit' | 'landed_projectile_hit' | 'landed_contact_hit' | 'landed_any_hit'
  // Rich condition vocabulary (2026-07-14) — pure predicates of game state,
  // shared by parallel event triggers and REPEAT_UNTIL. Numeric parameter
  // rides in TriggerConfig.eventValue / CharacterAction.untilValue.
  | 'health_below_pct'           // own health below eventValue % (default 50)
  | 'same_team_health_below_pct' // any TEAMMATE (self excluded) below eventValue %
  | 'noble_in_danger'            // an opposing entity within eventRange tiles of a same-team Noble
  | 'turn_reached'               // currentTurn >= eventValue
  | 'opposing_count_at_most'     // living opposing entities <= eventValue (0 = all defeated)
  | 'same_team_count_at_most'    // living teammates (self excluded) <= eventValue
  | 'standing_on_goal'           // holder stands on a GOAL tile
  | 'repeated_times';            // REPEAT_UNTIL only: segment has run untilValue times (handled in the loop branch, false elsewhere)

// Hit-stamp bookkeeping (2026-07-14). When damage lands (past invulnerability
// and deflect; shield absorption still counts — the blow connected), the
// victim's hitStamps and the attacker's dealtStamps record the turn number
// per delivery kind. 'any' is stamped on every delivery; the named kinds only
// by their own paths (melee = MELEE/MELEE_CONE strikes, projectile = bolt
// hits incl. along-path, contact = Thorns/Trample). AOE splash, push riders,
// tile damage and DOT ticks are 'any'-only.
export type HitStampKind = 'melee' | 'projectile' | 'contact' | 'any';
export type HitStamps = Partial<Record<HitStampKind, number>>;

// Freshness windows for the hit-stamp conditions (user design 2026-07-14):
// 'previous_action' — stamp within the last turn (reactive; projectiles
// resolve after actions, so a turn-N bolt hit is reacted to on turn N+1);
// 'this_cycle' — stamp since the entity's behavior loop last wrapped
// (cycleStartTurn refreshes on every REPEAT / REPEAT_UNTIL loop-back, so the
// condition can fire once per cycle); 'ever' — once true, always true.
export type HitStampWindow = 'previous_action' | 'this_cycle' | 'ever';

export interface TriggerConfig {
  mode: TriggerMode;
  intervalMs?: number;        // For interval mode
  event?: TriggerEvent;       // For event mode
  eventRange?: number;        // For the *_in_range / noble_in_danger events - how far to detect (tiles)
  eventValue?: number;        // Numeric parameter for the value-based events (% / turn / count)
  eventWindow?: HitStampWindow; // Freshness window for the hit_by_* / landed_*_hit events (default 'previous_action')
}

export interface CharacterAction {
  type: ActionType;
  params?: any;
  tilesPerMove?: number; // How many tiles to move per tick (default: 1)
  onWallCollision?: WallCollisionBehavior; // What to do when hitting a wall (default: 'stop')
  turnDegrees?: 45 | 90 | 135; // Turn amount: 45 (one diagonal), 90 (cardinal), 135 (skip diagonal, useful for corners) (default: 90)
  faceDirection?: Direction; // Target direction for FACE_DIRECTION action (used when faceTarget is unset)
  faceTarget?: 'nearest_enemy' | 'nearest_hero'; // For FACE_DIRECTION: face the nearest enemy or hero (absolute teams, resolved against the actor's own side) instead of a fixed direction. Snapped to the 8 compass dirs. Unset = use faceDirection.
  faceTargetRange?: number; // For FACE_DIRECTION faceTarget: max search range in tiles (0 or unset = unlimited).
  faceTargetOnCast?: boolean; // For auto-target SPELL actions: rotate the caster to face the nearest target when casting, snapped to the 8 compass dirs.
  revertFacingAfterCast?: boolean; // With faceTargetOnCast: restore the pre-cast facing at the start of the next turn (otherwise the new facing persists).

  // Execution configuration (new system)
  executionMode?: ExecutionMode;  // Default: 'sequential'
  trigger?: TriggerConfig;        // For parallel actions
  linkedToNext?: boolean;         // If true, the next sequential action executes on the same turn

  // For REPEAT_UNTIL — deliberately NOT the `trigger` field: this is
  // sequential control flow, and evaluateTriggers must never fire it as a
  // parallel event action. Shares checkTriggerCondition's vocabulary.
  untilEvent?: TriggerEvent;      // Condition that breaks the loop (falls through when met)
  untilEventRange?: number;       // Range for the *_in_range / noble_in_danger conditions (tiles)
  untilValue?: number;            // Numeric parameter for the value-based conditions (% / turn / count / times)
  untilWindow?: HitStampWindow;   // Freshness window for the hit_by_* / landed_*_hit conditions (default 'previous_action')

  // For SPELL action type
  spellId?: string;             // Reference to spell in library
  directionOverride?: Direction[]; // Override spell's default directions (absolute)
  relativeDirectionOverride?: RelativeDirection[]; // Override with relative directions
  useRelativeOverride?: boolean; // If true, use relativeDirectionOverride instead of directionOverride

  // Auto-targeting configuration
  autoTargetNearestEnemy?: boolean; // TEAM-RELATIVE (2026-07-11): aim at the closest OPPOSING-team member when authored on a character, SAME-team when authored on an enemy (legacy field name; enemy authors wrote "enemies" meaning their own side). Editors label these Opposing/Same Team.
  autoTargetNearestCharacter?: boolean; // TEAM-RELATIVE (2026-07-11): the mirror — SAME team on characters, OPPOSING team on enemies. See executeSpellWithTargeting's mapping in engine/actions.ts.
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
  isNoble?: boolean; // Noble marker (backlog: heroes can be Nobles too) — this hero counts for the noble win/lose conditions when placed
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

  // Contact-damage hit visual — THIS entity's strike presentation. When its
  // contact damage fires (however acquired: innate starting effect or one
  // applied mid-game by a spell), borrow the named spell's landed-hit
  // visuals. Overrides the status effect asset's own default visual.
  contactHitSpellVisualId?: string;

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
  pluralName?: string; // Plural form for grouped quest text ("Defeat the Bats (2)"); falls back to name + 's'
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
  ignoresPlacement?: boolean; // If true, doesn't glance at newly placed heroes during setup (visual flourish; default off = glances)

  // Boss configuration
  isBoss?: boolean; // If true, this enemy is a boss - enables 'defeat_boss' win condition
  escapesOnDefeat?: boolean; // Escapes-on-defeat (2026-07-17): lethal damage is still a FULL defeat (win credit, drops, death triggers all unchanged) but the entity leaves the board instead of leaving a corpse — despawned once the death settles (processEscapes), unraisable, tile freed. Render plays a ghost walk-out through the nearest opening.
  exitsThroughOpenings?: boolean; // Flee-through-openings (2026-07-21, direction-of-travel rule): a movement step that would pass THROUGH a valid hallway/door mouth (standing on the marker tile, stepping out its open side) leaves the board instead of consulting wall behavior — DEPART semantics (no drops/triggers/corpse; reads as defeated to defeat_all_enemies, curate via win checkboxes). Checked before wall behavior AND inside IF_WALL (a mouth ahead is an exit, not a wall), so facing — and the movement arrow — never adopts the phantom turn. Walking PAST a mouth never triggers; diagonals never exit; door open/closed visual state is not consulted (matches the noble-escape exit rule).

  // Noble configuration (the friendly-side Boss equivalent — meaningful on
  // ALLY assets, which share this Enemy shape via the adapter). A placed
  // hero-party entity whose asset has isNoble participates in the
  // protect_noble / noble_survives_turns / noble_reaches_goal conditions.
  isNoble?: boolean;

  // Melee priority
  hasMeleePriority?: boolean; // If true, this enemy attacks before characters in melee exchanges (default: false)

  // Sound configuration
  sounds?: EntitySoundSet; // Enemy-specific sounds (death, damage, etc.)

  // Death drop configuration
  droppedCollectibleId?: string; // CustomCollectible ID to spawn on death

  // Contact-damage hit visual — THIS entity's strike presentation. When its
  // contact damage fires (however acquired: innate starting effect or one
  // applied mid-game by a spell), borrow the named spell's landed-hit
  // visuals. Overrides the status effect asset's own default visual.
  contactHitSpellVisualId?: string;

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

/**
 * Which team an entity fights for. Historically team membership was purely
 * STRUCTURAL (placedCharacters = hero team, puzzle.enemies = enemy team);
 * the explicit `party` field decouples them so future features can cross
 * the line: summons inherit their summoner's party, Allies are creator-
 * placed enemy-array entities on the hero side, Necromancy flips a raised
 * unit's party. Absent field = the structural default, so all existing
 * content is unchanged. Charm is NOT stored here — it stays a temporary
 * inversion applied on top (see engine/party.ts effectiveParty).
 */
export type EntityParty = 'hero' | 'enemy';

export interface PlacedEnemy {
  enemyId: string;
  x: number;
  y: number;
  currentHealth: number;
  facing?: Direction;
  dead: boolean;
  party?: EntityParty; // Explicit team override — see EntityParty. Absent = 'enemy'.
  excludeFromWinConditions?: boolean; // Summoned/spawned combatants: never counted by defeat_all_enemies / defeat_boss (locked design: a summon must not become a kill requirement). Carried through enemy→character wrappers like `party`.
  spawnedOnTurn?: number; // Set by mid-game spawning (engine/spawning.ts). While === currentTurn, executeTurn keeps the entity idle (no actions, no own triggers) — it's otherwise fully live (blocks tiles, can be hit, contact damage applies). NOT carried through wrappers: a spawn-turn entity never executes actions, so no wrapper is ever built for it while the field matters.
  entersFrom?: EntranceRef; // Walk-in entrance assignment (render-only theater, phase 4). Only honored when the entity's sprite opts in (spawnFromDoor/spawnFromHallway) and the referenced marker is still valid; otherwise normal entrance. Set in the map editor's inspect popover.
  despawnOnTurn?: number; // Duration-limited summons: at the END of this turn the entity despawns (locked design: NOT a death — no drops, no death triggers, exit transition only). Killed summons die fully via the normal path instead.
  despawned?: boolean; // Set by expiry despawn alongside dead=true. Render draws NOTHING for a despawned entity (no corpse, no death anim — the exit overlay particle covers the vanish); diedOnTurn stays unset so the tile frees immediately.
  sourceSpellId?: string; // Spell that summoned this entity — despawn loads it for the exit overlay sprite; future per-spell overrides read it too.
  transformedOnTurn?: number; // Vessels: turn this vessel's transform fired (processVesselTransforms). Set once on success — prevents re-transform; unset while the emergence is blocked (retries each turn end).
  escapedOnTurn?: number; // Escapes-on-defeat: turn the escape despawn stamped (processEscapes). Render hook — the board starts the ghost walk-out when this equals the current turn.
  departedOnTurn?: number; // DEPART action: turn the entity left the board on its own terms (not a death — no drops/triggers). Render hook — full-opacity walk-out when this equals the current turn.
  ejectedOnTurn?: number; // Shove-out ejection: turn a push threw this entity through an open-ledge mouth (dead+despawned, summon-expiry semantics — no drops/triggers/corpse). Render hook — fast tumble-out.
  recurrence?: { firstTurn: number; repeatEvery?: number }; // Scheduled visitor (passerby v2, 2026-07-17): the placement is an inert TEMPLATE (despawned + win-exempt at init, never acts); win-exempt copies spawn at firstTurn and every repeatEvery turns after (0/unset = one visit), arriving via the placement's entersFrom walk-in mid-game. A visit whose arrival tile is occupied is skipped, not queued.
  actionIndex?: number; // For active enemies with behavior patterns
  active?: boolean; // For active enemies
  parallelTrackers?: ParallelActionTracker[]; // For parallel spell execution
  justTeleported?: boolean; // Set when teleporting, cleared after animation
  teleportFromX?: number;   // Origin tile before teleport
  teleportFromY?: number;
  teleportSprite?: TeleportSpriteConfig; // DEPRECATED: No longer used, activation sprite is on tile instead
  iceSlideDistance?: number; // Number of tiles slid on ice (for slower animation)
  isCasting?: boolean; // True on the turn a spell is cast — per-turn casting animation flag (deterministic, no clock)
  preCastFacing?: Direction; // Set when a face-on-cast with revert changes facing; restored at the next turn start (deterministic)
  contactReactionTurn?: number; // Turn on which this entity's contact-damage reaction fired — visual only (board plays a cast animation while this === currentTurn)
  contactReactionFacing?: Direction; // Facing to render the contact-damage reaction animation toward — visual only
  contactHaltTurn?: number; // Thorns/Trample haltMovementOnContact: movement suppressed while currentTurn === this (stamped when the holder's contact damage fires)
  contactHaltForever?: boolean; // Thorns/Trample haltMovementMode 'forever': movement suppressed permanently
  instanceKey?: string; // Deterministic per-INSTANCE identity ('enemy#<index>'), stamped by executeTurn each turn (arrays are append-only, so the index is stable). Needed where ids don't cut it: same-asset entities share enemyId (damage-once tile dedupe, audit sweep 9)
  repeatUntilCounts?: Record<number, number>; // Completed segment passes per REPEAT_UNTIL block (keyed by action index). Only maintained for the 'repeated_times' condition; reset on fall-through. Plain JSON — survives replay snapshots.
  hitStamps?: HitStamps; // Turn number this entity was last HIT, per delivery kind (see HitStamps). Written new-object (never mutated in place — replay snapshots share references); carried through all enemy→character wrappers BOTH directions.
  dealtStamps?: HitStamps; // Turn number this entity last LANDED a hit, per delivery kind. Same rules as hitStamps.
  cycleStartTurn?: number; // Turn the behavior loop last wrapped to its segment start (REPEAT / REPEAT_UNTIL loop-back). Unset = never wrapped, treated as 0. Basis of the 'this_cycle' freshness window.
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
  // Pixel-perfect placement (2026-07-17): per-PLACEMENT nudge in whole ART
  // pixels (24/tile, native-size rule), added on top of the asset's own
  // offsetX/offsetY. Written by the map editor's pixel-fine drag (Object
  // tool active). Render-only — objects are pure decoration; the anchor
  // tile (x, y) still owns z-sorting and the one-object-per-tile rule.
  offsetX?: number;
  offsetY?: number;
  // Object spawn levers (2026-07-21): optional per-placement schedule so
  // decoration can appear/vanish mid-game (eyes in a corridor's dark, rats,
  // drips). Render-only — objects stay pure decoration; visibility derives
  // from the current turn via isPlacedObjectVisible (utils/objectSchedule).
  // All undefined = present from load, forever (existing placements are
  // byte-identical). Setup is turn 0; turns dawn like scheduled visitors.
  spawnTurn?: number;    // appears at the dawn of this turn
  despawnTurn?: number;  // gone at the dawn of this turn (exclusive)
  repeatEvery?: number;  // repeats the [spawn, despawn) window on this cadence
}

/**
 * Delivery schedule for a placed collectible (2026-07-21): the item is
 * tossed onto its tile from an opening on a known turn instead of being
 * present from setup. Same dawn semantics as the object spawn levers:
 * executeTurn increments at dawn, so arriveTurn 3 lands the moment turn 3
 * begins, before anything acts. deadlineTurn is EXCLUSIVE — an uncollected
 * delivery is gone at that dawn (the timed-pickup pressure); one-shot
 * deliveries that miss are missed FOREVER, and if a win condition requires
 * the item (collect_all, or collect_keys on a key) that is an immediate
 * defeat. repeatEvery re-runs the window on a cadence until collected; it
 * needs a bounded window and is ignored without a valid deadlineTurn.
 * arriveTurn < 1 = invalid config, treated as no delivery (fail visible).
 */
export interface DeliveryConfig {
  arriveTurn: number;
  deadlineTurn?: number;
  repeatEvery?: number;
  // Render-only toss origin. Unset or stale = nearest valid opening.
  entersFrom?: EntranceRef;
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

  // Delivery fields (2026-07-21). `delivery` is authored config; the rest is
  // runtime state stripped by initializeGameState. `collected` stays strictly
  // pickup-domain for deliveries — a missed delivery is NOT flagged collected
  // (unlike duration expiry), so it can never satisfy collect_all.
  delivery?: DeliveryConfig;
  delivered?: boolean;             // currently on the board
  deliveredOnTurn?: number;        // dawn the current instance landed (cycle anchor + render)
  deliveryMissedOnTurn?: number;   // permanently missed (one-shot deadline/blocked-tile)
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
  | 'characters_alive'      // Keep at least X characters alive at the end
  // Noble conditions (user design 2026-07-13). A "Noble" is any placed
  // hero-party entity whose asset carries isNoble (Noble-marked allies and
  // heroes). UNIFORM IMPLIED-PROTECT RULE: authoring ANY noble condition
  // makes a Noble's death an immediate defeat (checkDefeatConditions) — a
  // dead King can't be protected, survive, or reach anything.
  | 'protect_noble'         // Win requires all Nobles alive (pairs with other conditions: "kill everything without losing the King")
  | 'noble_survives_turns'  // Nobles alive at end of turn X (params.turns) = victory
  | 'noble_reaches_goal'    // A Noble standing on a GOAL tile = victory (reuses the goal-tile placement)
  | 'noble_escapes'         // Every Noble exits the board through an opening (hallway/door floor tile; params.escapeOpening narrows to one) — the exit stamps despawned WITHOUT dead, the game's one alive-despawned state
  // Escort (2026-07-21): noble_escapes generalized to ARBITRARY designated
  // entities — get specific enemies, heroes, or allies through a specific-
  // or-any opening. params.escortEntityIds designates by ASSET id; every
  // designated asset must have >=1 placed entity and ALL its placed
  // entities must escape. params.escapeRule picks detection: 'standing'
  // (default — end-of-turn census on the opening tile, the Noble rule) or
  // 'walk_through' (the entity must physically step out through the mouth,
  // flee-trait style). Escapes use the alive-despawned success state, so
  // escaped designated ENEMIES are excused from defeat_all (isEntityFunctional
  // excludes despawned) rather than counted as kills. IMPLIED-PROTECT: a
  // designated entity DYING (not escaping) = instant defeat — the quest
  // became unwinnable, same philosophy as the noble rule.
  | 'entity_escapes';

/**
 * Parameters for different win condition types
 */
export interface WinConditionParams {
  // For survive_turns and win_in_turns
  turns?: number;

  // For max_characters and characters_alive
  characterCount?: number;

  // For defeat_all_enemies — enemy ASSET ids the designer opted out of the
  // kill requirement (map editor per-type checkboxes). Living entities of
  // these types neither block victory nor appear in the quest label.
  excludedEnemyIds?: string[];

  // For noble_escapes AND entity_escapes — the designated opening (a hallway
  // or door marker's {x, y, side}). Unset = any valid opening on the map.
  escapeOpening?: { x: number; y: number; side: string };

  // For entity_escapes — ASSET ids (enemy/ally enemyIds and hero
  // characterIds) of the entities to guide out. Every designated asset must
  // have at least one placed entity, and all its placed entities must escape.
  escortEntityIds?: string[];

  // For entity_escapes — how the exit is detected. 'standing' (default):
  // end-of-turn census on the opening tile (the Noble rule). 'walk_through':
  // the entity must step out through the mouth (direction-of-travel, same
  // geometry as the flee trait, resolved in moveCharacter).
  escapeRule?: 'standing' | 'walk_through';
}

export interface WinCondition {
  type: WinConditionType;
  params?: WinConditionParams;
  // Quest text override (2026-07-21): authored text shown VERBATIM in the
  // quest banner instead of the auto-phrased label. For objectives the
  // auto-phrasing can't express well.
  customLabel?: string;
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

  // Hallway openings (2026-07-16): the full corridor interior (floor +
  // jamb walls) drawn where a hallway marker opens the wall, replacing the
  // procedural fallback. The renderer still applies the darkness fade on
  // top, so art should be drawn fully lit. Draw sizes match the border
  // band: top/bottom 48x48, left/right 16x48 (canvas px; 24 art px/tile).
  hallwayTop?: string;
  hallwayBottom?: string;
  hallwayLeft?: string;
  hallwayRight?: string;

  // Door pieces (2026-07-16, phase 2). All 48x48 per frame, drawn over a
  // top/bottom wall segment. doorOpening is a HORIZONTAL STRIP of square
  // frames (closed → open); closing plays it reversed. doorOpen should
  // leave the doorway transparent so a hallway behind it shows through.
  doorClosed?: string;
  doorOpening?: string;
  doorOpen?: string;
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

  // Per-puzzle quest description (2026-07-21): a designer-authored sentence
  // or two shown in the quest (?) help panel as its own puzzle-specific
  // section, above the generic what-is-a-quest content.
  questDescription?: string;

  // Metadata — tags and description for organization
  tags?: string[];        // User-defined tags (e.g., "tutorial", "hard", "boss")
  description?: string;   // Short description shown in library

  // Training arena flag — shown in Training Grounds page
  isTraining?: boolean;

  // Hallways — PURELY VISUAL dungeon dressing (2026-07-16 arc, phase 1).
  // Each marker opens the rendered wall on one side of an edge tile into a
  // faux corridor drawn inside the border band (floor + flanking walls,
  // far half swallowed by darkness). Never walkable — the corridor is
  // off-grid, so the engine/solver can't even see it. Invalid markers
  // (tile no longer a floor, or the side no longer borders void/out-of-
  // bounds) are simply skipped at render time.
  hallways?: HallwayMarker[];

  // Doors — PURELY VISUAL (phase 2). Each replaces a rendered top/bottom
  // wall segment with the skin's door piece; open/close plays once at
  // puzzle start per the marker's startState. Combine with a hallway on
  // the same segment to see the corridor through an open door.
  doors?: DoorMarker[];
}

/** Which wall of the tile a hallway opens through — matches the smart-border edge vocabulary. */
export type HallwaySide = 'top' | 'bottom' | 'left' | 'right';

export interface HallwayMarker {
  x: number;
  y: number;
  side: HallwaySide;
  openLedge?: boolean; // Shove-out ejection (2026-07-17): a push driving an entity through this mouth throws it off the board (default barred — pushes stop at the edge as always)
}

/**
 * Door starting behavior (phase 2, 2026-07-16). The open/close animation
 * only ever plays at PUZZLE START: 'opening' shows closed then plays the
 * skin's opening sheet once when the board reveals; 'closing' plays it
 * reversed from open. Purely visual in this phase.
 */
export type DoorStartState = 'closed' | 'open' | 'opening' | 'closing';

export interface DoorMarker {
  x: number;
  y: number;
  side: 'top' | 'bottom'; // doors only read on front-facing walls
  startState: DoorStartState;
}

/**
 * Reference from a placed entity to the door/hallway it walks in from at
 * board reveal (phase 4, render-only entrance theater). References by
 * position + side, not array index, so it follows the same stale-marker
 * rule as the markers themselves: if no matching valid marker exists at
 * render time, the entity silently falls back to its normal entrance.
 */
export interface EntranceRef {
  kind: 'door' | 'hallway';
  x: number;
  y: number;
  side: HallwaySide;
}

export interface PlacedCharacter {
  characterId: string;
  x: number;
  y: number;
  facing: Direction;
  currentHealth: number;
  party?: EntityParty; // Explicit team override — see EntityParty. Absent = structural lookup ('enemy' if this id lives in puzzle.enemies — enemy casters are wrapped as characters — else 'hero').
  excludeFromWinConditions?: boolean; // See PlacedEnemy.excludeFromWinConditions — symmetric so a party-flipped combatant keeps its exemption in either list.
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
  preCastFacing?: Direction; // Set when a face-on-cast with revert changes facing; restored at the next turn start (deterministic)
  contactReactionTurn?: number; // Turn on which this entity's contact-damage reaction fired — visual only (board plays a cast animation while this === currentTurn)
  contactReactionFacing?: Direction; // Facing to render the contact-damage reaction animation toward — visual only
  contactHaltTurn?: number; // Thorns/Trample haltMovementOnContact: movement suppressed while currentTurn === this (stamped when the holder's contact damage fires)
  contactHaltForever?: boolean; // Thorns/Trample haltMovementMode 'forever': movement suppressed permanently
  instanceKey?: string; // Deterministic per-INSTANCE identity ('char#<index>'), stamped by executeTurn each turn — see the PlacedEnemy field
  repeatUntilCounts?: Record<number, number>; // See the PlacedEnemy field — 'repeated_times' bookkeeping
  hitStamps?: HitStamps; // See the PlacedEnemy field — last-hit turn per delivery kind
  dealtStamps?: HitStamps; // See the PlacedEnemy field — last-landed-hit turn per delivery kind
  cycleStartTurn?: number; // See the PlacedEnemy field — 'this_cycle' window basis
  statusEffects?: StatusEffectInstance[]; // Active status effects on this character
  spellCooldowns?: Record<string, number>; // Spell ID -> turns remaining on cooldown
  spellUseCounts?: Record<string, number>; // Spell ID -> number of times used this game (for maxUsesPerGame)
  spellDirectionOverrides?: Record<string, Direction>; // User-chosen directions set during setup — redirect direction for redirect spells, fired direction for directionAcceptsUserInput spells
  pendingProjectileDeath?: boolean; // Deferred death: entity is logically dead but waiting for projectile visual to arrive
  pendingVisualDamage?: number; // Sum of damage from hits that have landed logically but haven't reached visually yet. Bar displays currentHealth + pendingVisualDamage, so each visual arrival drops the bar by exactly that hit's damage.
  diedOnTurn?: number; // See PlacedEnemy.diedOnTurn — deterministic death-turn stamp used by movement blockers to keep tile occupied through the next turn.
  despawned?: boolean; // See PlacedEnemy.despawned — left the board (no corpse). Transports DEPART results through the enemy wrappers (heroes shouldn't author DEPART); corpse-finders filter the union on it. Was declared twice by the 2026-07-17 noble-escape and DEPART sessions — keep it single.
  departedOnTurn?: number; // See PlacedEnemy.departedOnTurn — DEPART action stamp (wrapper transport).
  ejectedOnTurn?: number; // See PlacedEnemy.ejectedOnTurn — heroes can be shoved off open ledges too (a real death for them).
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
  sourceParty?: EntityParty;    // Creator's EFFECTIVE party when cast (engine/party.ts) — the zone keeps fighting for that side. Absent on legacy effects = 'hero' (the only side that ever created them before this field).
  destroysProjectiles?: 'hostile' | 'all'; // Wind wall: projectiles entering any tile of the zone are destroyed there ('hostile' = only bolts fighting against sourceParty). Enforced inside the shared projectile walkers — real and headless agree by construction.
}

/**
 * Projectile linger: a spent non-homing bolt lying on the tile where its
 * flight ended, waiting as a single-trigger hazard. The first OPPOSING
 * entity to step onto the tile takes the bolt's hit (damage + on-hit
 * status, drops on kill) exactly as if struck in flight, consuming the
 * hazard. Own-side entities walk over it safely. Created and consumed in
 * shared engine code (both real and headless modes), so solver parity
 * holds by construction. Ids are deterministic (turn + index).
 */
export interface LingeringProjectileHazard {
  id: string;
  x: number;
  y: number;
  turnsRemaining: number;       // Decremented at end of each turn AFTER the spawn turn
  spawnTurn: number;            // Turn the bolt landed — skipped by the first decrement
  damage: number;               // The bolt's hit damage
  spellAssetId?: string;        // For on-hit status application on trigger
  sourceCharacterId?: string;
  sourceEnemyId?: string;
  sourceParty?: EntityParty;    // The bolt's effective side when it landed — hazard bites the OPPOSING side
  consumed?: boolean;           // Trigger fired; swept at end of turn
  visualSprite?: SpriteReference;   // The bolt's projectile sprite, drawn resting on the tile
  hitEffectSprite?: SpriteReference; // Impact VFX spawned when the trigger fires
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
  lingeringHazards?: LingeringProjectileHazard[];

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
  CONTACT_DAMAGE = 'contact_damage', // "Thorns" (display name; storage value kept for saved assets) — REACTIVE: bites any hostile that tries to walk onto the holder's tile, every attempt
  TRAMPLE = 'trample',               // OFFENSIVE walk-in: the holder damages hostile entities IT walks into, plowing through on a kill. Hero-side strikes first in a Thorns/Trample trade unless the enemy side has PRIORITY (user design 2026-07-12)
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
  aoeSingleSprite?: boolean;     // True: spawn aoeEffectSprite ONCE at the area center instead of per tile — the art aspect-fits the whole area box (draw at 24 art px per tile: 72×72 for a 3×3 blast)

  // Persistent AOE effects
  persistDuration?: number;      // Turns the AOE effect persists (0 = instant)
  persistDamagePerTurn?: number; // Damage dealt each turn to units in the area
  persistVisualSprite?: SpriteReference; // Visual indicator for persistent area
  persistDestroysProjectiles?: 'hostile' | 'all'; // Wind wall: the zone eats projectiles entering it — 'hostile' = only bolts fighting against the zone's side; 'all' = every bolt. THROW_PLACE tosses always pass (items, not attacks — same carve-out as reflect).

  // Projectile linger: a non-homing bolt that ends its flight WITHOUT
  // hitting anything (range exhausted or wall stop) stays on its final
  // tile for N turns as a single-trigger hazard — the first opposing
  // entity to step on it takes the bolt's hit (damage + on-hit status),
  // exactly as if struck in flight, and the hazard is consumed.
  lingerDuration?: number;

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
  sourceParty?: EntityParty;    // Firer's BASE party at spawn (engine/party.ts). Absent on legacy/copied projectiles — team resolution falls back to which source id field is set (identical for all party-field-free content). Charm rides teamSwapped, not this.
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
  delayMs?: number;             // Invisible hold before the particle appears; its visible life (and sheet animation) starts at startTime + delayMs
  fromX?: number;               // Travel start (tile coords): the particle lerps fromX/fromY → x/y across its visible duration (borrowed contact-damage projectiles)
  fromY?: number;
  sizeTiles?: number;           // Render box spans this many tiles instead of the default 32px (single-sprite AOE blasts). Art aspect-fits the box — draw at 24 art px per tile for uniform scaling
  aboveEntities?: boolean;      // Draw in the pass ABOVE the entity layer instead of the default below-entities effects pass (summon materialize overlays)
}

/**
 * Extended CharacterAction to support custom attacks
 * Backwards compatible - existing actions still work
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- kept as an interface (not a type alias) so future per-action extensions don't ripple through implementers
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
  SUMMON = 'summon',             // Spawn an entity on an adjacent tile (engine/spawning.ts)
  NECROMANCY = 'necromancy',     // Raise an opposing-party corpse as a new combatant on the caster's side (rides the summon framework; the original death still counts for win conditions)
}

/**
 * Direction configuration for spells
 */
export type DirectionMode = 'current_facing' | 'fixed' | 'all_directions' | 'relative';

/**
 * Facing override for summoned entities (SUMMON template). Relative modes
 * resolve against the summoner at cast time: 'away_from_summoner' faces
 * along the spawn axis (the cast direction), 'toward_summoner' faces back
 * at the caster, 'match_summoner' copies the caster's current facing.
 */
export type SummonFacingMode = 'away_from_summoner' | 'toward_summoner' | 'match_summoner' | 'fixed';

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
  // Player picks the fired direction during setup (compass on the hero card,
  // generalized from the redirect input); the direction config above becomes
  // the enemy/AI fallback. Redirect spells use redirectAcceptsUserInput
  // instead — that input aims the target's NEW facing, not the cast
  // direction, and the two share the spellDirectionOverrides storage slot.
  directionAcceptsUserInput?: boolean;

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
  aoeSingleSprite?: boolean;     // True: one large aoeEffect sprite centered on the area instead of per-tile repeats — art aspect-fits the area box (draw at 24 art px per tile: 72×72 for a 3×3 blast)

  // Persistent AOE effects
  persistDuration?: number;      // Turns the AOE effect persists (0 = instant)
  persistDamagePerTurn?: number; // Damage dealt each turn to units in the area
  persistDestroysProjectiles?: 'hostile' | 'all'; // Wind wall — see CustomAttack.persistDestroysProjectiles

  // Projectile linger — see CustomAttack.lingerDuration
  lingerDuration?: number;

  // Melee-specific settings
  skipSpriteOnCasterTile?: boolean; // For melee spells - don't show attack sprite on caster's tile

  // Cone/Arc settings (for MELEE_CONE template)
  coneAngle?: 90 | 180 | 270;     // Cone spread angle in degrees (default: 90)

  // Visual configuration
  sprites: {
    projectile?: SpriteReference;      // For linear spells (per direction)
    meleeAttack?: SpriteReference;     // For melee spells - sprite shown on attack tiles (the MIDDLE part when stitching)
    // Multi-tile stitching (docs/feature-backlog.md): compose one long weapon
    // across a range≥2 melee — begin on the first tile, end on the last,
    // meleeAttack repeated between. Range 1 keeps the single-sprite path.
    meleeAttackBegin?: SpriteReference; // First tile of a range≥2 melee (sword base)
    meleeAttackEnd?: SpriteReference;   // Last tile of a range≥2 melee (sword tip)
    aoeEffect?: SpriteReference;       // For AOE spells - sprite shown on each affected tile when cast
    damageEffect: SpriteReference;     // On successful damage hit
    healingEffect?: SpriteReference;   // On successful heal (falls back to damageEffect if not set)
    castEffect?: SpriteReference;      // On caster when spell fires
    persistentArea?: SpriteReference;  // Visual for persistent ground effects (looping animation)
    bounceEffect?: SpriteReference;   // At wall contact point when projectile bounces
    summonEffect?: SpriteReference;   // For SUMMON spells — materialize overlay played on the summoned unit's tile (renders over the entity, portal-tile style)
    summonExitEffect?: SpriteReference; // For SUMMON spells — overlay played when a duration-limited summon expires (falls back to summonEffect if unset)
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

  // Summon-specific settings (for SUMMON template; the summon* fields below
  // except summonEnemyId are SHARED with NECROMANCY — the raised unit is a
  // summon that happens to reuse the corpse's asset and tile)
  // Placement rides the standard direction config (locked design: "like melee
  // direction config") — ONE spawn attempt per cast direction, on the adjacent
  // tile in that direction; blocked/occupied tiles skip silently. The summoned
  // unit inherits the caster's EFFECTIVE party at cast time (charm included,
  // permanent) and is always excludeFromWinConditions.
  summonEnemyId?: string;         // Enemy asset to spawn (SUMMON only — necromancy raises the corpse as itself)
  summonDuration?: number;        // Turns the summon remains after appearing (each = one action); 0/unset = permanent. Expiry despawns (exit overlay, no drops/triggers) — see PlacedEnemy.despawnOnTurn
  summonFacing?: SummonFacingMode; // Facing override for the summoned unit; unset = the entity asset's defaultFacing
  summonFacingFixed?: Direction;  // For summonFacing 'fixed' — exact compass direction
  summonStartingStatus?: {        // Status effect applied to the summoned unit at spawn, ON TOP of the asset's initial effects. Covers the spec's "contact damage override" too (contact damage IS a CONTACT_DAMAGE status; value = damage)
    statusAssetId: string;
    durationOverride?: number;    // -1 = permanent (99999), unset = asset default
    valueOverride?: number;
  };

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

  // Contact-damage reaction configuration (CONTACT_DAMAGE type)
  contactDamageAnimate?: boolean;      // Play the holder's cast animation when its contact damage fires
  contactDamageFaceAttacker?: boolean; // Turn the holder to face the incoming entity for the reaction (else use current facing)
  contactDamageKeepFacing?: boolean;   // With faceAttacker: persist the new facing logically (else revert — the turn is visual-only)
  contactDamageSpellVisualId?: string; // Borrow this spell's LANDED-HIT visuals when the contact fires: melee-attack sprite oriented toward the attacker + damage effect on their tile. Visuals only — damage/mechanics are NOT inherited, and no projectile flight (contact damage always lands)

  // Thorns/Trample movement consequence (CONTACT_DAMAGE + TRAMPLE types,
  // user design 2026-07-12): when the holder's contact damage fires, its own
  // movement can halt — the goring beast stops to gore.
  haltMovementOnContact?: boolean;         // Skip the holder's movement for the turn the damage is dealt (a trampler will NOT take the vacated tile that turn)
  haltMovementMode?: 'resume' | 'forever'; // After the halt turn: resume the behavior pattern next turn (default) or never execute movement again

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
