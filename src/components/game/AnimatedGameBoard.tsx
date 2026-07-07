/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, no-case-declarations */
import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import type { GameState, PlacedCharacter, PlacedEnemy, Projectile, ProjectileVisualState, ParticleEffect, BorderConfig, CharacterAction, EnemyBehavior, TileSprites, ActivationSpriteConfig, StatusEffectInstance, PersistentAreaEffect, Puzzle, PuzzleSkin } from '../../types/game';
import { TileType, Direction, ActionType, StatusEffectType } from '../../types/game';
import { getCharacter } from '../../data/characters';
import { getEnemy } from '../../data/enemies';
import { drawSprite, drawDeathSprite, hasDeathAnimation, drawSpawnSprite, hasSpawnAnimation, isSpawnAnimationPlaying, subscribeToSpriteImageLoads, getSpriteDrawHeight, ART_TILE_PX } from '../editor/SpriteEditor';
import type { CustomCharacter, CustomEnemy, CustomTileType, CustomObject, CustomCollectible } from '../../utils/assetStorage';
import { loadPuzzleSkin, loadTileType, loadObject, loadStatusEffectAsset, loadCollectible, resolveImageSource } from '../../utils/assetStorage';
import { getThemeAsset } from '../../utils/themeAssets';
import type { Tile } from '../../types/game';
import { updateProjectiles, updateParticles, executeParallelActions, DESPAWN_SHRINK_MS, TARGET_LOST_LINGER_MS } from '../../engine/simulation';
import { isTileActiveOnTurn } from '../../engine/actions';
import { subscribeToImageLoads, loadImage, isImageReady } from '../../utils/imageLoader';
import { blobShadowsEnabled, drawBlobShadow, drawDeathBlobShadow, drawProjectileBlobShadow } from './blobShadows';
import { wallAOEnabled, drawWallAO, AO_VOID_OCCLUDES } from './wallAO';
import { staticBakeEnabled } from './staticBake';

// Movement action types - entities with these actions should show direction arrow
const MOVEMENT_ACTIONS = new Set([
  ActionType.MOVE_FORWARD,
  ActionType.MOVE_BACKWARD,
  ActionType.MOVE_LEFT,
  ActionType.MOVE_RIGHT,
  ActionType.MOVE_DIAGONAL_NE,
  ActionType.MOVE_DIAGONAL_NW,
  ActionType.MOVE_DIAGONAL_SE,
  ActionType.MOVE_DIAGONAL_SW,
]);

/**
 * Check if a character's behavior contains any movement actions
 */
function hasMovementActions(behavior: CharacterAction[]): boolean {
  return behavior.some(action => MOVEMENT_ACTIONS.has(action.type));
}

/**
 * Check if an enemy's behavior pattern contains any movement actions
 */
function enemyHasMovementActions(behavior: EnemyBehavior | undefined): boolean {
  if (!behavior || behavior.type !== 'active') return false;
  if (!behavior.pattern || behavior.pattern.length === 0) return false;
  return behavior.pattern.some(action => MOVEMENT_ACTIONS.has(action.type));
}

interface AnimatedGameBoardProps {
  gameState: GameState;
  onTileClick?: (x: number, y: number) => void;
  isEditor?: boolean;  // When true, shows editor-only indicators like teleport letters
  maxWidth?: number;   // Maximum width in pixels for responsive scaling
  maxHeight?: number;  // Maximum height in pixels for responsive scaling
  onProjectileKill?: () => void;  // Callback when a projectile kills an enemy (for victory check)
  skinOverride?: PuzzleSkin;  // Override skin instead of loading from localStorage
  replayFrozen?: boolean;  // When true, freeze projectile/particle animations — used during replay pause/step
}

const TILE_SIZE = 48;
const BORDER_SIZE = 48; // Border thickness for top/bottom
const SIDE_BORDER_SIZE = 16; // Thinner side borders to match pixel art style
const ANIMATION_DURATION = 400; // ms per move (faster animation, half the turn interval)
const MOVE_DURATION = 180; // Movement duration - balance between smoothness and minimizing time on wrong tile
const IDLE_DURATION = 220; // Idle time on destination tile (where entity actually is)
const SPAWN_ANIMATION_DURATION = 500; // ms for spawn animation (plays once when entity first appears)
const ICE_SLIDE_MS_PER_TILE = 120; // ms per tile when sliding on ice (slower than walking)
const TELEPORT_APPEAR_DURATION = 100; // Small delay after walking to teleport tile before appearing at destination
const DROP_PLACE_DURATION = 250; // ms for hero drop-in effect when placed during setup
const DROP_PLACE_OFFSET = 0.4; // tiles above final position (subtle)
const ITEM_SPAWN_DURATION = 400; // ms for collectible scale-up animation (thrown/placed items)
const ITEM_DESPAWN_DURATION = 400; // ms for collectible scale-down animation (duration expiry)

// Cap device pixel ratio to limit canvas backbuffer size on high-DPI mobile (e.g.
// iPhone 15 Pro DPR=3 = 9x fragment cost vs DPR=1). DPR=2 is what most retina
// desktops use anyway, and `image-rendering: pixelated` cleans up the upscale.
const MAX_DPR = 2;

const COLORS = {
  empty: '#2a2a2a',
  wall: '#4a4a4a',
  grid: '#1a1a1a',
  character: '#4caf50',
  enemy: '#f44336',
  deadEnemy: '#661111',
  collectible: '#ffd700',
};

// ==========================================
// PIXEL-PERFECT SPRITE RENDERING
// ==========================================
// On mobile, ctx.scale(puzzleScale * dpr) produces non-integer scaling.
// Even rounded logical coords → fractional physical pixels → pixel art warps.
// Fix: reset transform to identity, convert coords to physical pixel space
// (rounded to integers), draw sprite there, then restore transform.

type DrawSpriteArgs = [
  ctx: CanvasRenderingContext2D,
  sprite: import('../../utils/assetStorage').CustomSprite,
  centerX: number,
  centerY: number,
  tileSize: number,
  direction?: import('../../types/game').Direction,
  isMoving?: boolean,
  now?: number,
  isCasting?: boolean,
  castStartTime?: number,
];

function drawSpritePixelPerfect(...args: DrawSpriteArgs) {
  const [ctx, sprite, centerX, centerY, tileSize, direction, isMoving, now, isCasting, castStartTime] = args;
  const transform = ctx.getTransform();
  const scale = transform.a; // horizontal scale
  const currentAlpha = ctx.globalAlpha; // Preserve alpha across setTransform

  // Transform logical coords to physical pixel space using the full matrix
  const physPoint = transform.transformPoint(new DOMPoint(centerX, centerY));

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = currentAlpha; // Re-apply alpha after transform reset
  ctx.imageSmoothingEnabled = false;

  // Scale shadow to physical pixel space — avoid rounding for smoother edges
  if (ctx.shadowColor && ctx.shadowColor !== 'transparent' && ctx.shadowColor !== 'rgba(0, 0, 0, 0)') {
    ctx.shadowOffsetX = ctx.shadowOffsetX * scale;
    ctx.shadowOffsetY = ctx.shadowOffsetY * scale;
    ctx.shadowBlur = ctx.shadowBlur * scale;
  }

  const physCenterX = Math.round(physPoint.x);
  const physCenterY = Math.round(physPoint.y);
  const physTileSize = Math.round(tileSize * scale);

  drawSprite(ctx, sprite, physCenterX, physCenterY, physTileSize, direction, isMoving, now, isCasting, castStartTime);
  ctx.restore();
}

function drawDeathSpritePixelPerfect(
  ctx: CanvasRenderingContext2D,
  sprite: import('../../utils/assetStorage').CustomSprite,
  centerX: number,
  centerY: number,
  tileSize: number,
  direction: import('../../types/game').Direction | undefined,
  startTime: number
) {
  const transform = ctx.getTransform();
  const scale = transform.a;
  const physPoint = transform.transformPoint(new DOMPoint(centerX, centerY));

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const physCenterX = Math.round(physPoint.x);
  const physCenterY = Math.round(physPoint.y);
  const physTileSize = Math.round(tileSize * scale);

  drawDeathSprite(ctx, sprite, physCenterX, physCenterY, physTileSize, direction, startTime);
  ctx.restore();
}

function drawSpawnSpritePixelPerfect(
  ctx: CanvasRenderingContext2D,
  sprite: import('../../utils/assetStorage').CustomSprite,
  centerX: number,
  centerY: number,
  tileSize: number,
  startTime: number
) {
  const transform = ctx.getTransform();
  const scale = transform.a;
  const physPoint = transform.transformPoint(new DOMPoint(centerX, centerY));

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const physCenterX = Math.round(physPoint.x);
  const physCenterY = Math.round(physPoint.y);
  const physTileSize = Math.round(tileSize * scale);

  drawSpawnSprite(ctx, sprite, physCenterX, physCenterY, physTileSize, startTime);
  ctx.restore();
}

// ==========================================
// SPELL SPRITE SHEET RENDERING
// ==========================================

interface SpriteSheetConfig {
  imageData: string;
  frameCount: number;
  frameWidth?: number;
  frameHeight?: number;
  frameRate: number;
  loop?: boolean;
}

// Cache for sprite sheet animation state
const spellSpriteSheetStates = new Map<string, { currentFrame: number; lastFrameTime: number }>();

// Per-entity casting-animation start times (display clock), keyed by entity index.
// Set each cast turn so the casting sheet restarts from frame 0; read by
// drawCharacter/drawEnemy and threaded into drawSprite (mirrors spawn/death).
const characterCastStartTimes = new Map<number, number>();
const enemyCastStartTimes = new Map<number, number>();

// Per-enemy contact-damage reaction facing, keyed by entity index. Populated (in the
// detect-movement effect) only on the turn an enemy's contact-damage reaction fires;
// its presence tells drawEnemy to play the cast animation toward this direction. Uses
// a turn-stamped engine flag (contactReactionTurn) so it survives the enemy turn-reset.
const enemyContactReactionFacing = new Map<number, Direction>();

/**
 * Draw a spell sprite sheet with optional rotation and mirroring
 * Used for projectiles and particle effects that need directional rotation
 */
function drawSpellSpriteSheet(
  ctx: CanvasRenderingContext2D,
  spriteSheet: SpriteSheetConfig,
  px: number,
  py: number,
  size: number,
  _imageCache: Map<string, HTMLImageElement>,  // Unused, kept for backwards compatibility
  now: number,
  rotationConfig?: { rotation: number; mirror: boolean }
): boolean {
  // Use centralized image loader with load notifications
  const img = loadImage(spriteSheet.imageData);

  // Wait for image to load
  if (!img || !img.complete || img.naturalWidth === 0) return false;

  // Get or initialize animation state
  const stateKey = spriteSheet.imageData;
  let state = spellSpriteSheetStates.get(stateKey);
  if (!state) {
    state = { currentFrame: 0, lastFrameTime: now };
    spellSpriteSheetStates.set(stateKey, state);
  }

  // Calculate frame dimensions
  const frameWidth = spriteSheet.frameWidth || (img.naturalWidth / spriteSheet.frameCount);
  const frameHeight = spriteSheet.frameHeight || img.naturalHeight;

  // Update animation frame based on frame rate
  const frameDuration = 1000 / spriteSheet.frameRate;
  if (now - state.lastFrameTime >= frameDuration) {
    state.currentFrame++;
    if (state.currentFrame >= spriteSheet.frameCount) {
      state.currentFrame = spriteSheet.loop !== false ? 0 : spriteSheet.frameCount - 1;
    }
    state.lastFrameTime = now;
  }

  // Calculate display dimensions preserving aspect ratio
  const frameAspectRatio = frameWidth / frameHeight;
  let finalWidth = size;
  let finalHeight = size;
  if (frameAspectRatio > 1) {
    finalHeight = size / frameAspectRatio;
  } else {
    finalWidth = size * frameAspectRatio;
  }

  // Draw the current frame
  const sourceX = state.currentFrame * frameWidth;
  const sourceY = 0;

  try {
    ctx.save();

    if (rotationConfig) {
      // Move to center point
      ctx.translate(px, py);
      // Apply rotation (convert degrees to radians)
      ctx.rotate((rotationConfig.rotation * Math.PI) / 180);
      // Apply mirroring
      if (rotationConfig.mirror) {
        ctx.scale(-1, 1);
      }
      // Draw centered at origin (round to avoid sub-pixel warping)
      const sw = Math.round(frameWidth);
      const sh = Math.round(frameHeight);
      const dw = Math.round(finalWidth);
      const dh = Math.round(finalHeight);
      ctx.drawImage(
        img,
        Math.round(sourceX), sourceY, sw, sh,
        Math.round(-dw / 2), Math.round(-dh / 2), dw, dh
      );
    } else {
      // No rotation - draw normally centered on position
      const sw = Math.round(frameWidth);
      const sh = Math.round(frameHeight);
      const dw = Math.round(finalWidth);
      const dh = Math.round(finalHeight);
      ctx.drawImage(
        img,
        Math.round(sourceX), sourceY, sw, sh,
        Math.round(px - dw / 2), Math.round(py - dh / 2), dw, dh
      );
    }

    ctx.restore();
    return true;
  } catch (e) {
    ctx.restore();
    return false;
  }
}

/**
 * Draw a spell sprite sheet based on start time (for one-shot animations)
 * Used for particle effects that should play once and hold on final frame
 */
function drawSpellSpriteSheetFromStartTime(
  ctx: CanvasRenderingContext2D,
  spriteSheet: SpriteSheetConfig,
  px: number,
  py: number,
  size: number,
  _imageCache: Map<string, HTMLImageElement>,  // Unused, kept for backwards compatibility
  startTime: number,
  now: number,
  rotationConfig?: { rotation: number; mirror: boolean }
): boolean {
  // Use centralized image loader with load notifications
  const img = loadImage(spriteSheet.imageData);

  // Wait for image to load
  if (!img || !img.complete || img.naturalWidth === 0) return false;

  // Calculate frame dimensions
  const frameWidth = spriteSheet.frameWidth || (img.naturalWidth / spriteSheet.frameCount);
  const frameHeight = spriteSheet.frameHeight || img.naturalHeight;

  // Calculate current frame based on elapsed time since start
  const elapsed = now - startTime;
  const frameDuration = 1000 / spriteSheet.frameRate;
  let currentFrame = Math.floor(elapsed / frameDuration);

  // For non-looping animations, clamp to final frame
  if (spriteSheet.loop === false && currentFrame >= spriteSheet.frameCount) {
    currentFrame = spriteSheet.frameCount - 1;
  } else if (spriteSheet.loop !== false) {
    currentFrame = currentFrame % spriteSheet.frameCount;
  }

  // Ensure frame is within bounds
  currentFrame = Math.max(0, Math.min(currentFrame, spriteSheet.frameCount - 1));

  // Calculate display dimensions preserving aspect ratio
  const frameAspectRatio = frameWidth / frameHeight;
  let finalWidth = size;
  let finalHeight = size;
  if (frameAspectRatio > 1) {
    finalHeight = size / frameAspectRatio;
  } else {
    finalWidth = size * frameAspectRatio;
  }

  // Draw the current frame
  const sourceX = currentFrame * frameWidth;
  const sourceY = 0;

  try {
    ctx.save();

    if (rotationConfig) {
      ctx.translate(px, py);
      ctx.rotate((rotationConfig.rotation * Math.PI) / 180);
      if (rotationConfig.mirror) {
        ctx.scale(-1, 1);
      }
      // Round to avoid sub-pixel warping
      const sw = Math.round(frameWidth);
      const sh = Math.round(frameHeight);
      const dw = Math.round(finalWidth);
      const dh = Math.round(finalHeight);
      ctx.drawImage(
        img,
        Math.round(sourceX), sourceY, sw, sh,
        Math.round(-dw / 2), Math.round(-dh / 2), dw, dh
      );
    } else {
      const sw = Math.round(frameWidth);
      const sh = Math.round(frameHeight);
      const dw = Math.round(finalWidth);
      const dh = Math.round(finalHeight);
      ctx.drawImage(
        img,
        Math.round(sourceX), sourceY, sw, sh,
        Math.round(px - dw / 2), Math.round(py - dh / 2), dw, dh
      );
    }

    ctx.restore();
    return true;
  } catch (e) {
    ctx.restore();
    return false;
  }
}

// ==========================================
// ACTIVATION SPRITE RENDERING (for teleport tile effects)
// ==========================================

/**
 * Draw an activation sprite (with optional spritesheet animation) at the given tile position
 * Used to show visual effects on tiles when activated (e.g., teleport tiles)
 */
function drawActivationSprite(
  ctx: CanvasRenderingContext2D,
  activationSprite: ActivationSpriteConfig,
  tileX: number,
  tileY: number,
  tileSize: number,
  startTime: number,
  now: number
): boolean {
  // Use centralized image loader with load notifications
  const img = loadImage(activationSprite.imageData);

  // Wait for image to load
  if (!img || !img.complete || img.naturalWidth === 0) return false;

  const frameCount = activationSprite.frameCount || 1;
  const frameRate = activationSprite.frameRate || 10;
  const loop = activationSprite.loop !== false;
  const opacity = activationSprite.opacity ?? 1;

  // Calculate frame dimensions (horizontal spritesheet)
  const frameWidth = img.naturalWidth / frameCount;
  const frameHeight = img.naturalHeight;

  // Calculate current frame based on elapsed time
  const elapsed = now - startTime;
  const frameDuration = 1000 / frameRate;
  let currentFrame = Math.floor(elapsed / frameDuration);

  // Handle looping vs clamping to final frame
  if (loop) {
    currentFrame = currentFrame % frameCount;
  } else {
    currentFrame = Math.min(currentFrame, frameCount - 1);
  }

  // Calculate display dimensions - fill the tile
  const sourceX = currentFrame * frameWidth;
  const sourceY = 0;

  // Position at tile's top-left corner (not centered)
  const px = tileX * tileSize;
  const py = tileY * tileSize;

  try {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(
      img,
      Math.round(sourceX), sourceY, Math.round(frameWidth), Math.round(frameHeight),
      Math.round(px), Math.round(py), Math.round(tileSize), Math.round(tileSize)
    );
    ctx.restore();
    return true;
  } catch (e) {
    ctx.restore();
    return false;
  }
}

// ==========================================
// SMART BORDER TYPES AND DETECTION
// ==========================================

type EdgeType = 'top' | 'bottom' | 'left' | 'right';

interface BorderEdge {
  x: number;
  y: number;
  edge: EdgeType;
  isOuterEdge: boolean; // True if this edge is on the outer perimeter of the puzzle
}

// Corner types for smart border rendering
// Convex = outer corner (puzzle sticks out), Concave = inner corner (puzzle goes inward)
type CornerType = 'convex-tl' | 'convex-tr' | 'convex-bl' | 'convex-br' |
                  'concave-tl' | 'concave-tr' | 'concave-bl' | 'concave-br';

interface BorderCorner {
  x: number;
  y: number;
  type: CornerType;
  isOuterBottom: boolean; // True if this corner connects to outer perimeter bottom edge
}

interface SmartBorderData {
  edges: BorderEdge[];
  corners: BorderCorner[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/**
 * Check if a tile at (x, y) is playable (exists and is not null)
 */
function isTilePlayable(tiles: (import('../../types/game').TileOrNull)[][], x: number, y: number, width: number, height: number): boolean {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  return tiles[y]?.[x] !== null && tiles[y]?.[x] !== undefined;
}

/**
 * Get the activation sprite from a tile if it has teleport behavior with activation sprite
 */
function getActivationSpriteFromTile(tile: Tile | null | undefined): ActivationSpriteConfig | undefined {
  if (!tile?.customTileTypeId) return undefined;
  const tileType = loadTileType(tile.customTileTypeId);
  if (!tileType?.behaviors) return undefined;
  const teleportBehavior = tileType.behaviors.find(b => b.type === 'teleport');
  return teleportBehavior?.activationSprite;
}

/**
 * Compute smart border edges and corners based on actual playable tile shapes
 */
function computeSmartBorder(tiles: (import('../../types/game').TileOrNull)[][], width: number, height: number): SmartBorderData {
  const edges: BorderEdge[] = [];
  const corners: BorderCorner[] = [];
  let minX = width, maxX = -1, minY = height, maxY = -1;

  // Scan all tiles to find edges adjacent to void/null
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isPlayable = isTilePlayable(tiles, x, y, width, height);
      if (!isPlayable) continue;

      // Track bounds
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      // Check all 4 edges - if adjacent tile is void/null/out-of-bounds, we need a border
      const hasTop = !isTilePlayable(tiles, x, y - 1, width, height);
      const hasBottom = !isTilePlayable(tiles, x, y + 1, width, height);
      const hasLeft = !isTilePlayable(tiles, x - 1, y, width, height);
      const hasRight = !isTilePlayable(tiles, x + 1, y, width, height);

      // Determine if edges are on outer perimeter (adjacent to out-of-bounds) vs interior (adjacent to void tile)
      const isTopOuter = y - 1 < 0;
      const isBottomOuter = y + 1 >= height;
      const isLeftOuter = x - 1 < 0;
      const isRightOuter = x + 1 >= width;

      if (hasTop) edges.push({ x, y, edge: 'top', isOuterEdge: isTopOuter });
      if (hasBottom) edges.push({ x, y, edge: 'bottom', isOuterEdge: isBottomOuter });
      if (hasLeft) edges.push({ x, y, edge: 'left', isOuterEdge: isLeftOuter });
      if (hasRight) edges.push({ x, y, edge: 'right', isOuterEdge: isRightOuter });

      // Detect corners by checking diagonal neighbors and edge combinations
      const topLeft = !isTilePlayable(tiles, x - 1, y - 1, width, height);
      const topRight = !isTilePlayable(tiles, x + 1, y - 1, width, height);
      const bottomLeft = !isTilePlayable(tiles, x - 1, y + 1, width, height);
      const bottomRight = !isTilePlayable(tiles, x + 1, y + 1, width, height);

      // Convex corners (outer corners - where two edges meet)
      if (hasTop && hasLeft) corners.push({ x, y, type: 'convex-tl', isOuterBottom: false });
      if (hasTop && hasRight) corners.push({ x, y, type: 'convex-tr', isOuterBottom: false });
      if (hasBottom && hasLeft) corners.push({ x, y, type: 'convex-bl', isOuterBottom: isBottomOuter });
      if (hasBottom && hasRight) corners.push({ x, y, type: 'convex-br', isOuterBottom: isBottomOuter });

      // Concave corners (inner corners - where diagonal is void but adjacent are playable)
      if (!hasTop && !hasLeft && topLeft) corners.push({ x, y, type: 'concave-tl', isOuterBottom: false });
      if (!hasTop && !hasRight && topRight) corners.push({ x, y, type: 'concave-tr', isOuterBottom: false });
      if (!hasBottom && !hasLeft && bottomLeft) corners.push({ x, y, type: 'concave-bl', isOuterBottom: isBottomOuter });
      if (!hasBottom && !hasRight && bottomRight) corners.push({ x, y, type: 'concave-br', isOuterBottom: isBottomOuter });
    }
  }

  return { edges, corners, bounds: { minX, maxX, minY, maxY } };
}

/**
 * Check if puzzle has irregular shape (any null tiles within bounds)
 */
function hasIrregularShape(tiles: (import('../../types/game').TileOrNull)[][], width: number, height: number): boolean {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y]?.[x] === null) return true;
    }
  }
  return false;
}

interface CharacterPosition {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startTime: number;
  facingDuringMove: Direction; // Direction character is moving (before wall lookahead changes it)
  teleported?: boolean; // If true, this is a teleport - animate walking to source tile, then appear at destination
  iceSlideDistance?: number; // If set, slow down animation proportionally
  teleportSourceX?: number; // The teleport tile the entity stepped on
  teleportSourceY?: number;
}

// Track active tile activations (e.g., teleport effects shown on tiles)
interface TileActivation {
  x: number;
  y: number;
  startTime: number;
  activationSprite: ActivationSpriteConfig;
}

interface CharacterAttack {
  characterIndex: number;
  startTime: number;
  direction: Direction;
}

// Track death animation state
interface DeathAnimationState {
  startTime: number;
  x: number;
  y: number;
  facing: Direction;
}

// Track spawn animation state
interface SpawnAnimationState {
  startTime: number;
  x: number;
  y: number;
}

interface LiftOffAnimation {
  startTime: number;
  x: number;
  y: number;
  characterId: string;
}

export const AnimatedGameBoard: React.FC<AnimatedGameBoardProps> = ({ gameState, onTileClick, isEditor = false, maxWidth, maxHeight, onProjectileKill, skinOverride, replayFrozen = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const [characterPositions, setCharacterPositions] = useState<Map<number, CharacterPosition>>(new Map());
  const [enemyPositions, setEnemyPositions] = useState<Map<number, CharacterPosition>>(new Map());
  // Refs for synchronous access during rendering (prevents flash at new position)
  const characterPositionsRef = useRef<Map<number, CharacterPosition>>(new Map());
  const enemyPositionsRef = useRef<Map<number, CharacterPosition>>(new Map());
  const prevCharactersRef = useRef<PlacedCharacter[]>([]);
  const prevEnemiesRef = useRef<PlacedEnemy[]>([]);
  const animationRef = useRef<number | undefined>(undefined);

  // Track death animations - keyed by entity ID (characterId or index)
  const [characterDeathAnimations, setCharacterDeathAnimations] = useState<Map<string, DeathAnimationState>>(new Map());
  const [enemyDeathAnimations, setEnemyDeathAnimations] = useState<Map<number, DeathAnimationState>>(new Map());
  // Synchronous mirrors of the above, read by the rAF draw loop so a freshly
  // detected death is visible immediately (the state copy lags a frame, which
  // made the death sprite stall on frame 0 — same fix as the spawn ref).
  const characterDeathAnimationsRef = useRef<Map<string, DeathAnimationState>>(new Map());
  const enemyDeathAnimationsRef = useRef<Map<number, DeathAnimationState>>(new Map());
  const prevCharacterDeadStateRef = useRef<Map<string, boolean>>(new Map());
  const prevEnemyDeadStateRef = useRef<Map<number, boolean>>(new Map());

  // Track spawn animations - keyed by entity ID (characterId + position or enemy index)
  const [characterSpawnAnimations, setCharacterSpawnAnimations] = useState<Map<string, SpawnAnimationState>>(new Map());
  const characterSpawnAnimationsRef = useRef<Map<string, SpawnAnimationState>>(new Map());
  const [enemySpawnAnimations, setEnemySpawnAnimations] = useState<Map<number, SpawnAnimationState>>(new Map());
  // Track lift-off animations for unplaced characters
  const [liftOffAnimations, setLiftOffAnimations] = useState<LiftOffAnimation[]>([]);
  const prevGameStatusRef = useRef(gameState.gameStatus);
  // Phase C side-table: keeps purely-visual projectile state (e.g.
  // `visualPastReflectPoint`) out of Projectile / GameState so deep copies
  // can't capture it. One board instance = one map; React unmount clears it,
  // so there's no cross-game bleed. See docs/projectile-refactor-plan.md §4.
  const projectileVisualStateRef = useRef<Map<string, ProjectileVisualState>>(new Map());
  // Track the last turn we rendered so replay step/seek can invalidate stale
  // vs entries. When turn changes and we're frozen (updateProjectiles won't
  // refresh vs), drawProjectile must fall back to projectile.logicalX/Y —
  // deleting stale entries here makes `!vs` true on the next draw and the
  // fallback kicks in reliably without depending on vs.lastUpdateTurn book-
  // keeping alone (which can race with step handlers).
  const prevRenderedTurnRef = useRef<number>(gameState.currentTurn);
  // Track entities that have completed spawn animation (don't re-trigger on re-render)
  const spawnedCharactersRef = useRef<Set<string>>(new Set());
  const spawnedEnemiesRef = useRef<Set<number>>(new Set());
  // Whether each entity changed tiles on the current turn (keyed by index).
  // Drives the walk animation for the WHOLE turn (not just the brief slide),
  // refreshed every turn so consecutive moves read as one continuous walk.
  const characterMovedThisTurnRef = useRef<Map<number, boolean>>(new Map());
  const enemyMovedThisTurnRef = useRef<Map<number, boolean>>(new Map());

  // Track tile activations (e.g., teleport tile effects)
  // Tile activation effects (e.g. teleport sparkle) — kept in a ref instead of
  // React state because (1) only the rAF draw loop reads them, no other render
  // path; and (2) the previous `setTileActivations` call from inside rAF caused
  // mid-frame React reconciliation, which then re-ran the animate useEffect
  // (it was in the deps array). With a ref, the loop reads the latest value
  // each frame without involving React's render cycle.
  const tileActivationsRef = useRef<TileActivation[]>([]);

  // Fade-in animation when puzzle changes
  const [fadeKey, setFadeKey] = useState(0);
  const prevPuzzleIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentPuzzleId = gameState.puzzle.id;
    if (prevPuzzleIdRef.current !== null && prevPuzzleIdRef.current !== currentPuzzleId) {
      // Puzzle changed - trigger fade-in by incrementing key
      setFadeKey(k => k + 1);
      // Reset spawn animation tracking for new puzzle
      spawnedCharactersRef.current.clear();
      spawnedEnemiesRef.current.clear();
      setCharacterSpawnAnimations(new Map());
      characterSpawnAnimationsRef.current = new Map();
      setEnemySpawnAnimations(new Map());
      setLiftOffAnimations([]);
      // Reset death + casting animation tracking (death anims now persist as
      // corpses, so they must be cleared explicitly on a new puzzle).
      setCharacterDeathAnimations(new Map());
      setEnemyDeathAnimations(new Map());
      characterDeathAnimationsRef.current = new Map();
      enemyDeathAnimationsRef.current = new Map();
      prevCharacterDeadStateRef.current.clear();
      prevEnemyDeadStateRef.current.clear();
      characterCastStartTimes.clear();
      enemyCastStartTimes.clear();
    }
    prevPuzzleIdRef.current = currentPuzzleId;
  }, [gameState.puzzle.id]);

  // Initialize spawn animations for enemies when puzzle loads (and they haven't spawned yet)
  useEffect(() => {
    const now = Date.now();
    const newEnemySpawns = new Map<number, SpawnAnimationState>();

    gameState.puzzle.enemies.forEach((enemy, index) => {
      // Only start spawn animation if enemy hasn't already spawned and isn't dead
      if (!spawnedEnemiesRef.current.has(index) && !enemy.dead) {
        newEnemySpawns.set(index, { startTime: now, x: enemy.x, y: enemy.y });
        spawnedEnemiesRef.current.add(index);
      }
    });

    if (newEnemySpawns.size > 0) {
      setEnemySpawnAnimations(prev => {
        const updated = new Map(prev);
        newEnemySpawns.forEach((state, index) => updated.set(index, state));
        return updated;
      });
    }
  }, [gameState.puzzle.id, gameState.puzzle.enemies.length]);

  // Force re-render when images finish loading. Also bumps the static-bake
  // image version: the bake must resign once tile/border sprites become
  // .complete (drawTile silently skips images still loading).
  const [, forceUpdate] = useState(0);
  const imageVersionRef = useRef(0);
  useEffect(() => {
    const onLoad = () => {
      imageVersionRef.current++;
      forceUpdate(n => n + 1);
    };
    const unsubscribe1 = subscribeToImageLoads(onLoad);
    const unsubscribe2 = subscribeToSpriteImageLoads(onLoad);
    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, []);

  // Offscreen static-layer bake (border + tiles + wall AO) — rebuilt when
  // the signature in the animate loop changes. See staticBake.ts (toggle).
  const staticBakeRef = useRef<{
    canvas: HTMLCanvasElement;
    sig: string;
    tiles: unknown;
    borderConfig: unknown;
    skinOverride: unknown;
  } | null>(null);

  // Force re-render after puzzle loads to ensure images are displayed
  // This handles the case where images finish loading before the component subscribes
  useEffect(() => {
    // Schedule multiple re-renders to catch late-loading images
    const timer1 = setTimeout(() => forceUpdate(n => n + 1), 50);
    const timer2 = setTimeout(() => forceUpdate(n => n + 1), 150);
    const timer3 = setTimeout(() => forceUpdate(n => n + 1), 300);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [gameState.puzzle.id]);


  // Detect character movement
  useEffect(() => {
    const newPositions = new Map<number, CharacterPosition>();
    const newMoved = new Map<number, boolean>();
    const newActivations: TileActivation[] = [];
    const now = Date.now();

    gameState.placedCharacters.forEach((char, idx) => {
      const prevChar = prevCharactersRef.current[idx];
      const existing = characterPositionsRef.current.get(idx);
      newMoved.set(idx, false); // default: not walking unless an actual move below
      // Stamp a fresh casting start (display clock) on each cast turn so the
      // casting sheet restarts from frame 0; stale values are ignored when not casting.
      if (char.isCasting) characterCastStartTimes.set(idx, now);

      if (prevChar && (prevChar.x !== char.x || prevChar.y !== char.y)) {
        // Character moved!
        // Check if facing also changed (wall lookahead: turn + move in same turn)
        const facingChanged = prevChar.facing !== char.facing;

        // Check if this was a teleport
        if (char.justTeleported && char.teleportFromX !== undefined && char.teleportFromY !== undefined) {
          // Teleport animation: animate from previous position TO the teleport tile,
          // then appear at destination
          const teleportSourceX = char.teleportFromX;
          const teleportSourceY = char.teleportFromY;

          newPositions.set(idx, {
            fromX: prevChar.x,
            fromY: prevChar.y,
            toX: char.x,  // Final destination
            toY: char.y,
            startTime: now,
            facingDuringMove: facingChanged ? char.facing : prevChar.facing,
            teleported: true,
            teleportSourceX,
            teleportSourceY,
          });

          // Trigger activation sprites on both source and destination teleport tiles
          const sourceTile = gameState.puzzle.tiles[teleportSourceY]?.[teleportSourceX];
          const destTile = gameState.puzzle.tiles[char.y]?.[char.x];

          const sourceActivationSprite = getActivationSpriteFromTile(sourceTile);
          const destActivationSprite = getActivationSpriteFromTile(destTile);

          if (sourceActivationSprite) {
            newActivations.push({
              x: teleportSourceX,
              y: teleportSourceY,
              startTime: now,
              activationSprite: sourceActivationSprite,
            });
          }
          if (destActivationSprite) {
            newActivations.push({
              x: char.x,
              y: char.y,
              startTime: now,
              activationSprite: destActivationSprite,
            });
          }
        } else {
          // Normal movement animation
          newPositions.set(idx, {
            fromX: prevChar.x,
            fromY: prevChar.y,
            toX: char.x,
            toY: char.y,
            startTime: now,
            facingDuringMove: facingChanged ? char.facing : prevChar.facing,
            iceSlideDistance: char.iceSlideDistance,
          });
          // Actual tile change → walk for the whole turn (not just the slide).
          newMoved.set(idx, true);
        }
      } else if (prevChar && prevChar.facing !== char.facing) {
        // Character turned but didn't move (wall lookahead)
        // Create a short "turning" animation to update the arrow immediately
        newPositions.set(idx, {
          fromX: char.x,
          fromY: char.y,
          toX: char.x,
          toY: char.y,
          startTime: now,
          facingDuringMove: char.facing, // Show new facing immediately
        });
      } else if (existing && now - existing.startTime < ANIMATION_DURATION) {
        // Keep existing animation
        newPositions.set(idx, existing);
      }
    });

    // Update ref synchronously (prevents flash at new position during render)
    characterPositionsRef.current = newPositions;
    characterMovedThisTurnRef.current = newMoved;
    setCharacterPositions(newPositions);
    if (newActivations.length > 0) {
      tileActivationsRef.current = [...tileActivationsRef.current, ...newActivations];
    }

    // Clean up spawn keys for characters that were removed (unplaced)
    // and trigger lift-off animations
    // Spawn is tracked per characterId (stable across movement) so a hero's
    // spawn animation fires once on placement, not again every time it moves.
    const currentSpawnKeys = new Set(
      gameState.placedCharacters.map((char) => char.characterId)
    );
    const newLiftOffs: LiftOffAnimation[] = [];
    spawnedCharactersRef.current.forEach((charId) => {
      if (!currentSpawnKeys.has(charId)) {
        // Character was removed — trigger lift-off only if user manually unplaced
        // (both current and previous status must be 'setup' to avoid reset transitions).
        // Last-known position comes from the previous snapshot (the key no longer
        // carries it now that spawn is keyed by characterId alone).
        if (gameState.gameStatus === 'setup' && prevGameStatusRef.current === 'setup') {
          const prevChar = prevCharactersRef.current.find((c) => c.characterId === charId);
          if (prevChar) {
            newLiftOffs.push({ startTime: now, x: prevChar.x, y: prevChar.y, characterId: charId });
          }
        }
        spawnedCharactersRef.current.delete(charId);
      }
    });
    if (newLiftOffs.length > 0) {
      setLiftOffAnimations(prev => [...prev, ...newLiftOffs]);
    }

    // Detect newly placed characters and trigger spawn animations
    const newCharSpawns = new Map<string, SpawnAnimationState>();
    gameState.placedCharacters.forEach((char) => {
      // Keyed by characterId only — stable across movement (see lift-off above).
      const spawnKey = char.characterId;
      if (!spawnedCharactersRef.current.has(spawnKey) && !char.dead) {
        newCharSpawns.set(spawnKey, { startTime: now, x: char.x, y: char.y });
        spawnedCharactersRef.current.add(spawnKey);
      }
    });

    if (newCharSpawns.size > 0) {
      // Update ref synchronously to prevent first-frame flash
      newCharSpawns.forEach((state, key) => characterSpawnAnimationsRef.current.set(key, state));
      setCharacterSpawnAnimations(prev => {
        const updated = new Map(prev);
        newCharSpawns.forEach((state, key) => updated.set(key, state));
        return updated;
      });
    }

    prevCharactersRef.current = [...gameState.placedCharacters];
    prevGameStatusRef.current = gameState.gameStatus;
  }, [gameState.placedCharacters, gameState.gameStatus]);

  // Detect enemy movement
  useEffect(() => {
    const newPositions = new Map<number, CharacterPosition>();
    const newMoved = new Map<number, boolean>();
    const newActivations: TileActivation[] = [];
    const now = Date.now();

    gameState.puzzle.enemies.forEach((enemy, idx) => {
      const prevEnemy = prevEnemiesRef.current[idx];
      const existing = enemyPositionsRef.current.get(idx);
      newMoved.set(idx, false); // default: not walking unless an actual move below
      // Contact-damage reaction: fires on the turn stamped by the engine. Populate the
      // reaction-facing map so drawEnemy plays the cast animation toward the attacker.
      const contactReacting = enemy.contactReactionTurn === gameState.currentTurn;
      if (contactReacting) {
        enemyContactReactionFacing.set(idx, enemy.contactReactionFacing ?? enemy.facing ?? Direction.SOUTH);
      } else {
        enemyContactReactionFacing.delete(idx);
      }
      // Stamp a fresh casting start (display clock) on each cast turn so the
      // casting sheet restarts from frame 0; stale values are ignored when not casting.
      if (enemy.isCasting || contactReacting) enemyCastStartTimes.set(idx, now);

      if (prevEnemy && (prevEnemy.x !== enemy.x || prevEnemy.y !== enemy.y)) {
        // Enemy moved!
        // Check if facing also changed (wall lookahead: turn + move in same turn)
        const facingChanged = prevEnemy.facing !== enemy.facing;

        // Check if this was a teleport
        if (enemy.justTeleported && enemy.teleportFromX !== undefined && enemy.teleportFromY !== undefined) {
          // Teleport animation
          const teleportSourceX = enemy.teleportFromX;
          const teleportSourceY = enemy.teleportFromY;

          newPositions.set(idx, {
            fromX: prevEnemy.x,
            fromY: prevEnemy.y,
            toX: enemy.x,
            toY: enemy.y,
            startTime: now,
            facingDuringMove: (facingChanged ? enemy.facing : prevEnemy.facing) || Direction.SOUTH,
            teleported: true,
            teleportSourceX,
            teleportSourceY,
          });

          // Trigger activation sprites on both source and destination teleport tiles
          const sourceTile = gameState.puzzle.tiles[teleportSourceY]?.[teleportSourceX];
          const destTile = gameState.puzzle.tiles[enemy.y]?.[enemy.x];

          const sourceActivationSprite = getActivationSpriteFromTile(sourceTile);
          const destActivationSprite = getActivationSpriteFromTile(destTile);

          if (sourceActivationSprite) {
            newActivations.push({
              x: teleportSourceX,
              y: teleportSourceY,
              startTime: now,
              activationSprite: sourceActivationSprite,
            });
          }
          if (destActivationSprite) {
            newActivations.push({
              x: enemy.x,
              y: enemy.y,
              startTime: now,
              activationSprite: destActivationSprite,
            });
          }
        } else {
          // Normal movement animation
          newPositions.set(idx, {
            fromX: prevEnemy.x,
            fromY: prevEnemy.y,
            toX: enemy.x,
            toY: enemy.y,
            startTime: now,
            facingDuringMove: (facingChanged ? enemy.facing : prevEnemy.facing) || Direction.SOUTH,
            iceSlideDistance: enemy.iceSlideDistance,
          });
          // Actual tile change → walk for the whole turn (not just the slide).
          newMoved.set(idx, true);
        }
      } else if (prevEnemy && prevEnemy.facing !== enemy.facing) {
        // Enemy turned but didn't move (wall lookahead)
        // Create a short "turning" animation to update the arrow immediately
        newPositions.set(idx, {
          fromX: enemy.x,
          fromY: enemy.y,
          toX: enemy.x,
          toY: enemy.y,
          startTime: now,
          facingDuringMove: enemy.facing || Direction.SOUTH, // Show new facing immediately
        });
      } else if (existing && now - existing.startTime < ANIMATION_DURATION) {
        // Keep existing animation
        newPositions.set(idx, existing);
      }
    });

    // Update ref synchronously (prevents flash at new position during render)
    enemyPositionsRef.current = newPositions;
    enemyMovedThisTurnRef.current = newMoved;
    setEnemyPositions(newPositions);
    if (newActivations.length > 0) {
      tileActivationsRef.current = [...tileActivationsRef.current, ...newActivations];
    }
    prevEnemiesRef.current = [...gameState.puzzle.enemies];
  }, [gameState.puzzle.enemies]);

  // Detect character deaths and trigger death animations
  useEffect(() => {
    const now = Date.now();
    const newDeathAnimations = new Map(characterDeathAnimationsRef.current);
    let hasChanges = false;

    gameState.placedCharacters.forEach((char) => {
      const wasDeadBefore = prevCharacterDeadStateRef.current.get(char.characterId) || false;
      const isDeadNow = char.dead || false;

      // Entity just died - start death animation (unless the draw loop already
      // stamped a start time this frame — don't overwrite it).
      if (!wasDeadBefore && isDeadNow && !newDeathAnimations.has(char.characterId)) {
        newDeathAnimations.set(char.characterId, {
          startTime: now,
          x: char.x,
          y: char.y,
          facing: char.facing,
        });
        hasChanges = true;
      } else if (wasDeadBefore && !isDeadNow) {
        // Revived / puzzle retry — drop the stale death anim so a later death
        // starts fresh from frame 0 (no mid-animation flash on the next attempt).
        if (newDeathAnimations.delete(char.characterId)) hasChanges = true;
      }

      prevCharacterDeadStateRef.current.set(char.characterId, isDeadNow);
    });

    // No cleanup: the death anim persists while the entity is a corpse, so its
    // fixed startTime lets the sheet play through and hold its final frame.
    // Cleared on puzzle change. (Re-death overwrites the entry above.)
    characterDeathAnimationsRef.current = newDeathAnimations; // sync mirror for the draw loop
    if (hasChanges) {
      setCharacterDeathAnimations(newDeathAnimations);
    }
  }, [gameState.placedCharacters]);

  // Detect enemy deaths and trigger death animations
  useEffect(() => {
    const now = Date.now();
    const newDeathAnimations = new Map(enemyDeathAnimationsRef.current);
    let hasChanges = false;

    gameState.puzzle.enemies.forEach((enemy, idx) => {
      const wasDeadBefore = prevEnemyDeadStateRef.current.get(idx) || false;
      const isDeadNow = enemy.dead || false;

      // Entity just died - start death animation (unless the draw loop already
      // stamped a start time this frame — don't overwrite it).
      if (!wasDeadBefore && isDeadNow && !newDeathAnimations.has(idx)) {
        newDeathAnimations.set(idx, {
          startTime: now,
          x: enemy.x,
          y: enemy.y,
          facing: enemy.facing || Direction.SOUTH,
        });
        hasChanges = true;
      } else if (wasDeadBefore && !isDeadNow) {
        // Revived / puzzle retry — drop the stale death anim so a later death
        // starts fresh from frame 0 (no mid-animation flash on the next attempt).
        if (newDeathAnimations.delete(idx)) hasChanges = true;
      }

      prevEnemyDeadStateRef.current.set(idx, isDeadNow);
    });

    // No cleanup: the death anim persists while the entity is a corpse, so its
    // fixed startTime lets the sheet play through and hold its final frame.
    enemyDeathAnimationsRef.current = newDeathAnimations; // sync mirror for the draw loop
    if (hasChanges) {
      setEnemyDeathAnimations(newDeathAnimations);
    }
  }, [gameState.puzzle.enemies]);

  // Memoize placedObjects layered into below_entities / above_entities arrays.
  // The animate loop runs at 60fps and was running both filter+sort+forEach
  // chains plus a loadObject() lookup per object every frame. placedObjects
  // changes rarely (load time + editor edits), so we cache the split until
  // the array reference changes. Single per-turn rebuild beats per-frame.
  const placedObjects = gameState.puzzle.placedObjects;
  const placedObjectsBelow = useMemo(() => {
    if (!placedObjects) return [];
    return placedObjects
      .filter(obj => {
        const objData = loadObject(obj.objectId);
        return !objData?.renderLayer || objData.renderLayer === 'below_entities';
      })
      .sort((a, b) => a.y - b.y);
  }, [placedObjects]);
  const placedObjectsAbove = useMemo(() => {
    if (!placedObjects) return [];
    return placedObjects
      .filter(obj => {
        const objData = loadObject(obj.objectId);
        return objData?.renderLayer === 'above_entities';
      })
      .sort((a, b) => a.y - b.y);
  }, [placedObjects]);

  // Memoize the entity render queue. Entity definitions only change at turn
  // boundaries (when setGameState deep-clones), so per-frame rebuild +
  // getEnemy/getCharacter lookups + sort are wasted work — collapse to one
  // build per turn (when placedCharacters / enemies array references swap).
  interface RenderableEntity {
    type: 'enemy' | 'character';
    index: number;
    isGhost: boolean;
    entity: PlacedEnemy | PlacedCharacter;
  }
  const renderQueue = useMemo(() => {
    const queue: RenderableEntity[] = [];
    gameState.puzzle.enemies.forEach((enemy, idx) => {
      const enemyData = getEnemy(enemy.enemyId);
      queue.push({
        type: 'enemy',
        index: idx,
        isGhost: enemyData?.canOverlapEntities || false,
        entity: enemy,
      });
    });
    gameState.placedCharacters.forEach((character, idx) => {
      const charData = getCharacter(character.characterId);
      queue.push({
        type: 'character',
        index: idx,
        isGhost: charData?.canOverlapEntities || false,
        entity: character,
      });
    });
    queue.sort((a, b) => {
      if (a.isGhost === b.isGhost) return 0;
      return a.isGhost ? 1 : -1;
    });
    return queue;
  }, [gameState.puzzle.enemies, gameState.placedCharacters]);

  // Animation loop
  useEffect(() => {
    const animate = (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Get device pixel ratio for high-DPI rendering (capped — see MAX_DPR)
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

      // Calculate the puzzle scale factor (must match the scale calculation in render)
      const borderStyleForScale = gameState.puzzle.borderConfig?.style || 'none';
      const hasBorderForScale = borderStyleForScale !== 'none';
      const gridWidthForScale = gameState.puzzle.width * TILE_SIZE;
      const gridHeightForScale = gameState.puzzle.height * TILE_SIZE;
      const canvasWidthForScale = hasBorderForScale ? gridWidthForScale + (SIDE_BORDER_SIZE * 2) : gridWidthForScale;
      const canvasHeightForScale = hasBorderForScale ? gridHeightForScale + (BORDER_SIZE * 2) : gridHeightForScale;

      let puzzleScale = 1;
      if (maxWidth || maxHeight) {
        const scaleX = maxWidth ? maxWidth / canvasWidthForScale : Infinity;
        const scaleY = maxHeight ? maxHeight / canvasHeightForScale : Infinity;
        puzzleScale = Math.min(scaleX, scaleY);
        if (puzzleScale < 0.1) puzzleScale = 0.1;
      }

      // Quantize so each ART pixel lands on an integer count of physical pixels. The art
      // grid is ART_TILE_PX per tile, so the zoom (physical px per art px) must be a whole
      // number — otherwise sub-tile pixels fall on fractional boundaries (the residual
      // "half pixel" artifact). We floor the zoom so the board never exceeds its responsive
      // footprint (snaps down to fit, never up). See native-resolution-rendering-plan.md §8.
      const rawEffectiveScale = puzzleScale * dpr;
      const integerZoom = Math.max(1, Math.floor((TILE_SIZE * rawEffectiveScale) / ART_TILE_PX));
      const physicalTileSize = integerZoom * ART_TILE_PX;
      const quantizedScale = physicalTileSize / TILE_SIZE;

      // Disable image smoothing for crisp pixel art
      ctx.imageSmoothingEnabled = false;

      // Clear entire canvas (at full resolution)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Scale context — quantized so tiles land on exact physical pixel boundaries
      ctx.save();
      ctx.scale(quantizedScale, quantizedScale);

      // Load skin for tile sprites (use override if provided, e.g. for SkinEditor live preview)
      const skin = skinOverride ?? (gameState.puzzle.skinId ? loadPuzzleSkin(gameState.puzzle.skinId) : null);
      const tileSprites = skin?.tileSprites;
      const customTileSprites = skin?.customTileSprites;

      // Calculate grid offset (for borders)
      const borderStyle = gameState.puzzle.borderConfig?.style || 'none';
      const hasBorder = borderStyle !== 'none';
      const offsetX = hasBorder ? SIDE_BORDER_SIZE : 0;
      const offsetY = hasBorder ? BORDER_SIZE : 0;

      // Save context and translate for grid rendering
      ctx.save();
      ctx.translate(offsetX, offsetY);

      // Execute parallel actions (time-based, runs independently of turns)
      // Skip during replay freeze to prevent melee/spell VFX spam
      if (gameState.gameStatus === 'running' && !replayFrozen) {
        executeParallelActions(gameState);
      }

      // Update projectiles and particles (time-based, needs to run every frame)
      // Skip during replay freeze — projectiles and particles should be static
      const deadCountBefore = gameState.puzzle.enemies.filter(e => e.dead).length;
      if (!replayFrozen) {
        updateProjectiles(gameState, projectileVisualStateRef.current);
        updateParticles(gameState);
      }
      const deadCountAfter = gameState.puzzle.enemies.filter(e => e.dead).length;

      // If any enemies were killed, notify parent to check victory conditions
      if (deadCountAfter > deadCountBefore && onProjectileKill) {
        onProjectileKill();
      }

      // Static layers (border + tiles + wall AO) change per turn, not per
      // frame — bake to an offscreen canvas once and blit. The signature
      // holds everything that shapes the raster. tileStates is CONTENT-
      // signed, not identity-compared: trigger processing mutates the Map
      // in place mid-turn (getTileState in actions.ts), so identity alone
      // would go stale. imageVersion covers tile/border sprites finishing
      // async loads (drawTile skips images that aren't .complete yet).
      if (staticBakeEnabled()) {
        const overrideSig = gameState.tileStates
          ? [...gameState.tileStates.entries()].map(([k, v]) => `${k}:${v.overrideState ?? ''}`).join()
          : '';
        const sig = [
          canvas.width, canvas.height, quantizedScale, gameState.currentTurn,
          borderStyle, isEditor, wallAOEnabled(), imageVersionRef.current,
          gameState.puzzle.skinId ?? '', overrideSig,
        ].join('|');
        const prev = staticBakeRef.current;
        if (
          !prev || prev.sig !== sig ||
          prev.tiles !== gameState.puzzle.tiles ||
          prev.borderConfig !== gameState.puzzle.borderConfig ||
          prev.skinOverride !== skinOverride
        ) {
          const bake = prev?.canvas ?? document.createElement('canvas');
          if (bake.width !== canvas.width) bake.width = canvas.width;
          if (bake.height !== canvas.height) bake.height = canvas.height;
          const bctx = bake.getContext('2d');
          if (bctx) {
            bctx.clearRect(0, 0, bake.width, bake.height);
            bctx.imageSmoothingEnabled = false;
            bctx.save();
            bctx.scale(quantizedScale, quantizedScale);
            drawStaticLayers(bctx, gameState.puzzle, gameState.currentTurn, gameState.tileStates, tileSprites, customTileSprites, isEditor, hasBorder, borderStyle, offsetX, offsetY);
            bctx.restore();
          }
          staticBakeRef.current = {
            canvas: bake,
            sig,
            tiles: gameState.puzzle.tiles,
            borderConfig: gameState.puzzle.borderConfig,
            skinOverride,
          };
        }
        // Blit in raw physical pixels — the bake was rendered at full res,
        // so this is an exact 1:1 copy with no resampling.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(staticBakeRef.current!.canvas, 0, 0);
        ctx.restore();
      } else {
        // Live A/B path (toggleStaticBake() off): identical drawing straight
        // onto the board. The main ctx is already translated for the grid;
        // the helper manages its own translate, so step back out first.
        ctx.save();
        ctx.translate(-offsetX, -offsetY);
        drawStaticLayers(ctx, gameState.puzzle, gameState.currentTurn, gameState.tileStates, tileSprites, customTileSprites, isEditor, hasBorder, borderStyle, offsetX, offsetY);
        ctx.restore();
      }

      // Draw objects below entities (sorted by y for proper layering)
      placedObjectsBelow.forEach(obj => {
        drawPlacedObject(ctx, obj.objectId, obj.x, obj.y);
      });

      // Use Date.now() for everything - particles, projectiles, collectibles, and entity
      // rendering all use Date.now() for their startTime values
      // The entity movement animations in useEffect hooks also use performance.now(), but
      // they track their own separate timing and don't rely on this 'now' variable
      const now = Date.now();

      // Draw collectibles
      gameState.puzzle.collectibles.forEach((collectible) => {
        if (!collectible.collected) {
          drawCollectible(ctx, collectible, imageCache.current, now);
        }
      });

      // Draw projectiles (Phase 2 - between tiles and entities).
      // Replay seek/step invalidation: when the turn has changed since the
      // previous draw AND we're frozen (updateProjectiles won't refresh vs),
      // wipe vs entries whose lastUpdateTurn doesn't match. This forces
      // drawProjectile to fall back to projectile.logicalX/Y (fractional,
      // set by buildReplayProjectiles) for the new turn's snapshot. Without
      // this, step-back from turn N to N-1 would keep showing turn-N's
      // mid-flight position until an animation frame ran — and animation
      // doesn't run while frozen, so the snap never resolved.
      if (gameState.activeProjectiles && gameState.activeProjectiles.length > 0) {
        if (replayFrozen && prevRenderedTurnRef.current !== gameState.currentTurn) {
          const curTurn = gameState.currentTurn;
          projectileVisualStateRef.current.forEach((vs, id) => {
            if (vs.lastUpdateTurn !== curTurn) {
              projectileVisualStateRef.current.delete(id);
            }
          });
        }
        prevRenderedTurnRef.current = gameState.currentTurn;
        gameState.activeProjectiles.forEach(projectile => {
          drawProjectile(ctx, projectile, imageCache.current, now, projectileVisualStateRef.current, replayFrozen, gameState.currentTurn);
        });
      }

      // Draw particles (Phase 2 - effects layer)
      if (gameState.activeParticles && gameState.activeParticles.length > 0) {
        gameState.activeParticles.forEach(particle => {
          drawParticle(ctx, particle, now, imageCache.current);
        });
      }

      // Draw persistent area effects (Phase 2 - ground effects layer)
      if (gameState.persistentAreaEffects && gameState.persistentAreaEffects.length > 0) {
        gameState.persistentAreaEffects.forEach(effect => {
          drawPersistentAreaEffect(ctx, effect, now, imageCache.current, gameState.puzzle);
        });
      }

      // Determine if game has started (for sprite selection)
      const gameStarted = gameState.gameStatus === 'running' || gameState.gameStatus === 'victory' || gameState.gameStatus === 'defeat';

      // Render all entities in z-order. renderQueue is memoized at component
      // scope (rebuilt only when entity arrays' references change at turn
      // boundaries) — see useMemo above.
      renderQueue.forEach(({ type, index, entity }) => {
        if (type === 'enemy') {
          const enemy = entity as PlacedEnemy;
          // Use ref for synchronous access (prevents flash at new position)
          const anim = enemyPositionsRef.current.get(index);
          let deathAnim = enemyDeathAnimationsRef.current.get(index) || enemyDeathAnimations.get(index);
          if (!deathAnim && enemy.dead) {
            // First frame drawn dead — stamp the start now (see character path).
            deathAnim = { startTime: now, x: enemy.x, y: enemy.y, facing: enemy.facing || Direction.SOUTH };
            enemyDeathAnimationsRef.current.set(index, deathAnim);
          }
          const spawnAnim = enemySpawnAnimations.get(index);
          const enemyGlow = getHomingTargetGlow(gameState, enemy.enemyId, true, projectileVisualStateRef.current, index);
          // Walk for the whole turn if this enemy changed tiles this turn
          // (gated to active play so it never loops in place at victory/defeat/setup).
          const movedThisTurn = (enemyMovedThisTurnRef.current.get(index) ?? false) && gameState.gameStatus === 'running';
          // A cast turn (casting but NOT moving) takes over immediately, overriding
          // any leftover walk animation still finishing from the previous turn. If
          // the entity also moves this turn, movedThisTurn wins and no cast plays.
          const castingThisTurn = !!enemy.isCasting && !movedThisTurn && gameState.gameStatus === 'running';

          // Calculate effective animation duration based on animation type
          let effectiveAnimDuration = ANIMATION_DURATION;
          if (anim?.teleported) {
            // Teleport needs extra time for rematerialization at destination
            effectiveAnimDuration = MOVE_DURATION + TELEPORT_APPEAR_DURATION;
          } else if (anim?.iceSlideDistance) {
            effectiveAnimDuration = anim.iceSlideDistance * ICE_SLIDE_MS_PER_TILE + IDLE_DURATION;
          }

          if (anim && now - anim.startTime < effectiveAnimDuration && gameStarted && !castingThisTurn) {
            const elapsed = now - anim.startTime;

            if (anim.teleported) {
              // Teleport animation: walk to teleport tile, then appear at destination
              // The activation sprite is rendered on the tiles separately
              const teleportTileX = anim.teleportSourceX ?? anim.fromX;
              const teleportTileY = anim.teleportSourceY ?? anim.fromY;

              if (elapsed < MOVE_DURATION) {
                // Phase 1: Animate walking TO the teleport tile
                const moveProgress = Math.min(1, elapsed / MOVE_DURATION);
                const eased = moveProgress;
                const renderX = anim.fromX + (teleportTileX - anim.fromX) * eased;
                const renderY = anim.fromY + (teleportTileY - anim.fromY) * eased;
                drawEnemy(ctx, enemy, renderX, renderY, true, anim.facingDuringMove, gameStarted, deathAnim, now, spawnAnim, enemyGlow, index);
              } else {
                // Phase 2: Appear at destination with normal sprite
                drawEnemy(ctx, enemy, anim.toX, anim.toY, false, undefined, gameStarted, deathAnim, now, spawnAnim, enemyGlow, index);
              }
            } else {
              // Normal movement animation (or ice slide)
              // Calculate effective duration for ice slides
              const effectiveMoveDuration = anim.iceSlideDistance
                ? anim.iceSlideDistance * ICE_SLIDE_MS_PER_TILE
                : MOVE_DURATION;

              // A zero-distance anim is a pure TURN (facing changed, no
              // movement) — it must not play the walk cycle. Entities with
              // no move actions used to briefly "walk in place" whenever
              // their facing changed (first-action defaultFacing init,
              // face-on-cast, redirect).
              const animMoves = anim.fromX !== anim.toX || anim.fromY !== anim.toY;

              if (elapsed < effectiveMoveDuration) {
                const moveProgress = Math.min(1, elapsed / effectiveMoveDuration);
                const eased = moveProgress;
                const renderX = anim.fromX + (anim.toX - anim.fromX) * eased;
                const renderY = anim.fromY + (anim.toY - anim.fromY) * eased;
                drawEnemy(ctx, enemy, renderX, renderY, animMoves, anim.facingDuringMove, gameStarted, deathAnim, now, spawnAnim, enemyGlow, index);
              } else {
                // Arrived at the destination but still "moving this turn" — keep walking.
                drawEnemy(ctx, enemy, anim.toX, anim.toY, movedThisTurn, undefined, gameStarted, deathAnim, now, spawnAnim, enemyGlow, index);
              }
            }
          } else {
            drawEnemy(ctx, enemy, enemy.x, enemy.y, movedThisTurn, undefined, gameStarted, deathAnim, now, spawnAnim, enemyGlow, index);
          }
        } else {
          const character = entity as PlacedCharacter;
          // Use ref for synchronous access (prevents flash at new position)
          const anim = characterPositionsRef.current.get(index);
          let deathAnim = characterDeathAnimationsRef.current.get(character.characterId) || characterDeathAnimations.get(character.characterId);
          if (!deathAnim && character.dead) {
            // First frame this entity is drawn dead — stamp the start now so the
            // death animation begins immediately, rather than stalling on frame 0
            // until the detection effect lands (a variable, often long, delay).
            deathAnim = { startTime: now, x: character.x, y: character.y, facing: character.facing };
            characterDeathAnimationsRef.current.set(character.characterId, deathAnim);
          }
          // Get spawn animation - keyed by characterId (stable across movement)
          const spawnKey = character.characterId;
          const spawnAnim = characterSpawnAnimations.get(spawnKey);
          const charGlow = getHomingTargetGlow(gameState, character.characterId, false, projectileVisualStateRef.current);
          // Walk for the whole turn if this character changed tiles this turn
          // (gated to active play so it never loops in place at victory/defeat/setup).
          const movedThisTurn = (characterMovedThisTurnRef.current.get(index) ?? false) && gameState.gameStatus === 'running';
          // A cast turn (casting but NOT moving) takes over immediately, overriding
          // any leftover walk animation still finishing from the previous turn. If
          // the entity also moves this turn, movedThisTurn wins and no cast plays.
          const castingThisTurn = !!character.isCasting && !movedThisTurn && gameState.gameStatus === 'running';

          // Calculate effective animation duration based on animation type
          let effectiveAnimDuration = ANIMATION_DURATION;
          if (anim?.teleported) {
            // Teleport needs extra time for rematerialization at destination
            effectiveAnimDuration = MOVE_DURATION + TELEPORT_APPEAR_DURATION;
          } else if (anim?.iceSlideDistance) {
            effectiveAnimDuration = anim.iceSlideDistance * ICE_SLIDE_MS_PER_TILE + IDLE_DURATION;
          }

          if (anim && now - anim.startTime < effectiveAnimDuration && gameStarted && !castingThisTurn) {
            const elapsed = now - anim.startTime;

            if (anim.teleported) {
              // Teleport animation: walk to teleport tile, then appear at destination
              // The activation sprite is rendered on the tiles separately
              const teleportTileX = anim.teleportSourceX ?? anim.fromX;
              const teleportTileY = anim.teleportSourceY ?? anim.fromY;

              if (elapsed < MOVE_DURATION) {
                // Phase 1: Animate walking TO the teleport tile
                const moveProgress = Math.min(1, elapsed / MOVE_DURATION);
                const eased = moveProgress;
                const renderX = anim.fromX + (teleportTileX - anim.fromX) * eased;
                const renderY = anim.fromY + (teleportTileY - anim.fromY) * eased;
                drawCharacter(ctx, character, renderX, renderY, true, anim.facingDuringMove, gameStarted, deathAnim, now, spawnAnim, charGlow, index);
              } else {
                // Phase 2: Appear at destination with normal sprite
                drawCharacter(ctx, character, anim.toX, anim.toY, false, undefined, gameStarted, deathAnim, now, spawnAnim, charGlow, index);
              }
            } else {
              // Normal movement animation (or ice slide)
              // Calculate effective duration for ice slides
              const effectiveMoveDuration = anim.iceSlideDistance
                ? anim.iceSlideDistance * ICE_SLIDE_MS_PER_TILE
                : MOVE_DURATION;

              // A zero-distance anim is a pure TURN (facing changed, no
              // movement) — it must not play the walk cycle (see the enemy
              // path above).
              const animMoves = anim.fromX !== anim.toX || anim.fromY !== anim.toY;

              if (elapsed < effectiveMoveDuration) {
                const moveProgress = Math.min(1, elapsed / effectiveMoveDuration);
                const eased = moveProgress;
                const renderX = anim.fromX + (anim.toX - anim.fromX) * eased;
                const renderY = anim.fromY + (anim.toY - anim.fromY) * eased;
                drawCharacter(ctx, character, renderX, renderY, animMoves, anim.facingDuringMove, gameStarted, deathAnim, now, spawnAnim, charGlow, index);
              } else {
                // Arrived at the destination but still "moving this turn" — keep walking.
                drawCharacter(ctx, character, anim.toX, anim.toY, movedThisTurn, undefined, gameStarted, deathAnim, now, spawnAnim, charGlow, index);
              }
            }
          } else {
            // Apply drop-in offset for newly placed characters during setup
            // Use ref for synchronous access to prevent first-frame flash
            const spawnAnimSync = characterSpawnAnimationsRef.current.get(spawnKey) || spawnAnim;
            let dropOffsetY = 0;
            if (spawnAnimSync && !gameStarted) {
              const dropElapsed = now - spawnAnimSync.startTime;
              if (dropElapsed < DROP_PLACE_DURATION) {
                const dropProgress = dropElapsed / DROP_PLACE_DURATION;
                // Ease out: start offset, settle to 0
                const eased = 1 - Math.pow(1 - dropProgress, 3);
                dropOffsetY = -DROP_PLACE_OFFSET * (1 - eased);
              }
            }
            drawCharacter(ctx, character, character.x, character.y + dropOffsetY, movedThisTurn, undefined, gameStarted, deathAnim, now, spawnAnim, charGlow, index);
          }
        }
      });

      // Draw lift-off animations for unplaced characters
      const activeLiftOffs: LiftOffAnimation[] = [];
      liftOffAnimations.forEach(anim => {
        const elapsed = now - anim.startTime;
        if (elapsed < DROP_PLACE_DURATION) {
          activeLiftOffs.push(anim);
          const progress = elapsed / DROP_PLACE_DURATION;
          const eased = Math.pow(progress, 2); // ease in — accelerate upward
          const offsetY = -DROP_PLACE_OFFSET * eased;
          // Fade starts immediately and aggressively — ease-out curve
          // so most of the fade happens in the first half
          const opacity = Math.max(0, 1 - Math.pow(progress, 0.5));

          const charData = getCharacter(anim.characterId) as CustomCharacter | undefined;
          if (charData && 'customSprite' in charData && charData.customSprite) {
            const px = anim.x * TILE_SIZE;
            const py = (anim.y + offsetY) * TILE_SIZE;
            // Draw sprite to offscreen canvas then composite with alpha
            // (iOS Safari doesn't reliably apply globalAlpha through transform resets)
            const transform = ctx.getTransform();
            const scale = transform.a;
            const physTile = Math.round(TILE_SIZE * scale) + 8; // padding for shadow
            const offscreen = new OffscreenCanvas(physTile, physTile);
            const offCtx = offscreen.getContext('2d')!;
            offCtx.imageSmoothingEnabled = false;
            offCtx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            offCtx.shadowBlur = 2;
            offCtx.shadowOffsetX = 1;
            offCtx.shadowOffsetY = 1;
            // OffscreenCanvas's 2D context is structurally compatible with the
            // methods drawSprite uses, but TS sees the two ctx types as
            // distinct — cast through unknown for the call.
            drawSprite(offCtx as unknown as CanvasRenderingContext2D, charData.customSprite, physTile / 2, physTile / 2, physTile - 8, undefined, false, now, false);
            // Draw offscreen result with opacity onto main canvas
            const physPoint = transform.transformPoint(new DOMPoint(px + TILE_SIZE / 2, py + TILE_SIZE / 2));
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = opacity;
            ctx.drawImage(offscreen, Math.round(physPoint.x - physTile / 2), Math.round(physPoint.y - physTile / 2));
            ctx.restore();
          }
        }
      });
      if (activeLiftOffs.length !== liftOffAnimations.length) {
        setLiftOffAnimations(activeLiftOffs);
      }

      // Draw tile activation effects (e.g., teleport activation sprites) ABOVE entities.
      // Filter out expired activations as we draw — no setTimeout dance needed
      // since this is a ref, not React state.
      const tileActivations = tileActivationsRef.current;
      const activeActivations: TileActivation[] = [];
      for (const activation of tileActivations) {
        const durationMs = activation.activationSprite.durationMs || 800;
        const elapsed = now - activation.startTime;
        if (elapsed < durationMs) {
          activeActivations.push(activation);
          drawActivationSprite(
            ctx,
            activation.activationSprite,
            activation.x,
            activation.y,
            TILE_SIZE,
            activation.startTime,
            now
          );
        }
      }
      // Replace the ref with the live list once any activation has expired.
      // Cheap O(n) scan that only allocates when something actually changed.
      if (activeActivations.length !== tileActivations.length) {
        tileActivationsRef.current = activeActivations;
      }

      // Draw objects above entities (sorted by y for proper layering)
      placedObjectsAbove.forEach(obj => {
        drawPlacedObject(ctx, obj.objectId, obj.x, obj.y);
      });

      // Restore context (undo translate offset)
      ctx.restore();

      // Draw vignette effect on puzzle edges (after all rendering, follows puzzle shape)
      if (hasBorder) {
        drawPuzzleVignette(ctx, gameState.puzzle.tiles, gameState.puzzle.width, gameState.puzzle.height, offsetX, offsetY, timestamp);
      }

      // Restore context (undo dpr scaling)
      ctx.restore();

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameState, characterPositions, enemyPositions, characterDeathAnimations, enemyDeathAnimations, maxWidth, maxHeight, replayFrozen]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onTileClick) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const borderStyle = gameState.puzzle.borderConfig?.style || 'none';
    const hasBorder = borderStyle !== 'none';
    const offsetX = hasBorder ? SIDE_BORDER_SIZE : 0;
    const offsetY = hasBorder ? BORDER_SIZE : 0;

    // Calculate current scale factor
    const gridWidthPx = gameState.puzzle.width * TILE_SIZE;
    const gridHeightPx = gameState.puzzle.height * TILE_SIZE;
    const canvasWidthPx = hasBorder ? gridWidthPx + (SIDE_BORDER_SIZE * 2) : gridWidthPx;
    const canvasHeightPx = hasBorder ? gridHeightPx + (BORDER_SIZE * 2) : gridHeightPx;

    const rect = canvas.getBoundingClientRect();
    // Derive actual CSS scale from the rendered element size
    const currentScale = rect.width / canvasWidthPx;

    // Account for scale when converting click coordinates
    const clickX = (e.clientX - rect.left) / currentScale - offsetX;
    const clickY = (e.clientY - rect.top) / currentScale - offsetY;

    const x = Math.floor(clickX / TILE_SIZE);
    const y = Math.floor(clickY / TILE_SIZE);

    if (x >= 0 && x < gameState.puzzle.width && y >= 0 && y < gameState.puzzle.height) {
      onTileClick(x, y);
    }
  };

  const borderStyle = gameState.puzzle.borderConfig?.style || 'none';
  const hasBorder = borderStyle !== 'none';

  const gridWidth = gameState.puzzle.width * TILE_SIZE;
  const gridHeight = gameState.puzzle.height * TILE_SIZE;

  const canvasWidth = hasBorder ? gridWidth + (SIDE_BORDER_SIZE * 2) : gridWidth;
  const canvasHeight = hasBorder ? gridHeight + (BORDER_SIZE * 2) : gridHeight;

  // Calculate scale factor for responsive sizing
  // Use exact scale to maximize use of available space while never exceeding container
  let scale = 1;
  if (maxWidth || maxHeight) {
    const scaleX = maxWidth ? maxWidth / canvasWidth : Infinity;
    const scaleY = maxHeight ? maxHeight / canvasHeight : Infinity;
    scale = Math.min(scaleX, scaleY);
    // Ensure minimum scale of 0.1
    if (scale < 0.1) scale = 0.1;
  }

  // Get device pixel ratio for crisp rendering on high-DPI displays (e.g., Retina, mobile)
  // Capped at MAX_DPR to limit fragment cost on phones with DPR=3 (iPhone Pro etc.)
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, MAX_DPR) : 1;

  // Quantize so each ART pixel lands on an integer count of physical pixels. The art grid
  // is ART_TILE_PX per tile, so the zoom (physical px per art px) must be a whole number —
  // otherwise sub-tile pixels fall on fractional boundaries (the residual "half pixel"
  // artifact). We floor the zoom so the board never exceeds its responsive footprint (snaps
  // down to fit, never up). Must match the animation-loop quantization above.
  const rawEffectiveScale = scale * dpr;
  const integerZoom = Math.max(1, Math.floor((TILE_SIZE * rawEffectiveScale) / ART_TILE_PX));
  const physicalTileSize = integerZoom * ART_TILE_PX;
  const quantizedScale = physicalTileSize / TILE_SIZE;

  // Canvas resolution from quantized scale — tiles land on exact pixel boundaries
  const canvasResWidth = Math.round(canvasWidth * quantizedScale);
  const canvasResHeight = Math.round(canvasHeight * quantizedScale);

  // CSS display size must exactly match canvas resolution / dpr
  // to prevent the browser from stretching the canvas bitmap
  const cssWidth = canvasResWidth / dpr;
  const cssHeight = canvasResHeight / dpr;

  return (
    <div
      key={fadeKey}
      className="animate-fade-in-board"
      style={{
        width: cssWidth,
        height: cssHeight,
        overflow: 'hidden'
      }}
    >
      <canvas
        ref={canvasRef}
        width={canvasResWidth}
        height={canvasResHeight}
        onClick={handleCanvasClick}
        className="cursor-pointer"
        style={{
          width: cssWidth,
          height: cssHeight,
          imageRendering: 'pixelated'
        }}
      />
    </div>
  );
};

// Easing function
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ==========================================
// BORDER RENDERING
// ==========================================

// ============================================================================
// STATIC LAYERS (border + tiles + wall AO)
// ============================================================================
// Everything here changes per TURN (cadence, trigger overrides, turn clones)
// or on asset/skin changes — never per animation frame. The animate loop
// bakes this to an offscreen canvas and blits it each frame; with the bake
// toggled off (toggleStaticBake()) it draws live through this same function,
// so the two paths cannot drift. Expects a ctx already scaled to the board's
// quantized scale but NOT translated for the border inset.
function drawStaticLayers(
  ctx: CanvasRenderingContext2D,
  puzzle: GameState['puzzle'],
  currentTurn: number,
  tileStates: Map<string, import('../../types/game').TileRuntimeState> | undefined,
  tileSprites: TileSprites | undefined,
  customTileSprites: { [customTileTypeId: string]: string | { onSprite?: string; offSprite?: string } } | undefined,
  isEditor: boolean,
  hasBorder: boolean,
  borderStyle: string,
  offsetX: number,
  offsetY: number,
) {
  if (hasBorder) {
    drawBorder(ctx, puzzle.width, puzzle.height, borderStyle, puzzle.borderConfig, puzzle.tiles);
  }
  ctx.save();
  ctx.translate(offsetX, offsetY);

  for (let y = 0; y < puzzle.height; y++) {
    for (let x = 0; x < puzzle.width; x++) {
      const tile = puzzle.tiles[y][x];
      if (tile) {
        drawTile(ctx, x, y, tile.type, tileSprites, tile, customTileSprites, isEditor, currentTurn, tileStates);
      } else {
        // Draw void/null tile
        drawVoidTile(ctx, x, y);
      }
    }
  }

  // Wall-contact ambient occlusion: darken floor edges bordering walls or
  // voids so the dungeon reads as carved rather than tiled. Per-tile local
  // neighbor checks only — no wall tracing, floor pixels only, the walls'
  // own rendering is untouched. See wallAO.ts (toggleWallAO() to compare).
  if (wallAOEnabled()) {
    const tilesGrid = puzzle.tiles;
    const isOccluder = (tx: number, ty: number): boolean => {
      // Beyond the map counts as wall — matches the 3D dungeon border
      if (tx < 0 || ty < 0 || ty >= puzzle.height || tx >= puzzle.width) return true;
      const t = tilesGrid[ty][tx];
      if (!t) return AO_VOID_OCCLUDES;
      return t.type === TileType.WALL;
    };
    for (let y = 0; y < puzzle.height; y++) {
      for (let x = 0; x < puzzle.width; x++) {
        const t = tilesGrid[y][x];
        if (!t || t.type === TileType.WALL) continue; // AO lands on floor only
        drawWallAO(ctx, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, {
          n: isOccluder(x, y - 1),
          w: isOccluder(x - 1, y),
          e: isOccluder(x + 1, y),
          nw: isOccluder(x - 1, y - 1),
          ne: isOccluder(x + 1, y - 1),
        });
      }
    }
  }

  ctx.restore();
}

function drawBorder(
  ctx: CanvasRenderingContext2D,
  gridWidth: number,
  gridHeight: number,
  style: string,
  config?: any,
  tiles?: (import('../../types/game').TileOrNull)[][]
) {
  const totalWidth = gridWidth * TILE_SIZE + (SIDE_BORDER_SIZE * 2);
  const totalHeight = gridHeight * TILE_SIZE + (BORDER_SIZE * 2);

  // Check if we need smart borders (irregular shape with null tiles)
  const useSmartBorder = tiles && hasIrregularShape(tiles, gridWidth, gridHeight);

  if (style === 'dungeon') {
    if (useSmartBorder && tiles) {
      drawSmartDungeonBorder(ctx, tiles, gridWidth, gridHeight);
    } else {
      drawDungeonBorder(ctx, gridWidth, gridHeight, totalWidth, totalHeight);
    }
  } else if (style === 'custom' && config?.customBorderSprites) {
    if (useSmartBorder && tiles) {
      drawSmartCustomBorder(ctx, tiles, gridWidth, gridHeight, config.customBorderSprites);
    } else {
      drawCustomBorder(ctx, gridWidth, gridHeight, totalWidth, totalHeight, config.customBorderSprites);
    }
  }
}

/**
 * Draw smart dungeon border that conforms to irregular puzzle shapes
 */
function drawSmartDungeonBorder(
  ctx: CanvasRenderingContext2D,
  tiles: (import('../../types/game').TileOrNull)[][],
  gridWidth: number,
  gridHeight: number
) {
  const borderData = computeSmartBorder(tiles, gridWidth, gridHeight);
  const offsetX = SIDE_BORDER_SIZE;
  const offsetY = BORDER_SIZE;

  ctx.save();

  // Draw edge borders for each exposed tile edge
  borderData.edges.forEach(({ x, y, edge, isOuterEdge }) => {
    const px = offsetX + x * TILE_SIZE;
    const py = offsetY + y * TILE_SIZE;

    switch (edge) {
      case 'top':
        drawTopWallSegment(ctx, px, py);
        break;
      case 'bottom':
        drawBottomWallSegment(ctx, px, py, isOuterEdge);
        break;
      case 'left':
        drawLeftWallSegment(ctx, px, py);
        break;
      case 'right':
        drawRightWallSegment(ctx, px, py);
        break;
    }
  });

  // Draw corners on top of edges
  borderData.corners.forEach(({ x, y, type, isOuterBottom }) => {
    const px = offsetX + x * TILE_SIZE;
    const py = offsetY + y * TILE_SIZE;
    drawCornerSegment(ctx, px, py, type, isOuterBottom);
  });

  ctx.restore();
}

/**
 * Draw a top wall segment for a single tile edge
 */
function drawTopWallSegment(ctx: CanvasRenderingContext2D, px: number, py: number) {
  // Main wall body (extends upward from tile)
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(px, py - BORDER_SIZE, TILE_SIZE, BORDER_SIZE);

  // Shadow at bottom of wall
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(px, py - 12, TILE_SIZE, 12);

  // Highlight at top
  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(px, py - BORDER_SIZE, TILE_SIZE, 8);
}

/**
 * Draw a bottom wall segment for a single tile edge
 * Interior voids: thin wall-top (looking down at top surface)
 * Outer perimeter: full thickness wall
 */
function drawBottomWallSegment(ctx: CanvasRenderingContext2D, px: number, py: number, isOuterEdge: boolean = false) {
  if (isOuterEdge) {
    // Full thickness for outer perimeter bottom wall
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(px, py + TILE_SIZE, TILE_SIZE, BORDER_SIZE);

    // Top edge highlight
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(px, py + TILE_SIZE, TILE_SIZE, 8);
  } else {
    // Thin wall top for interior voids
    ctx.fillStyle = '#323242';
    ctx.fillRect(px, py + TILE_SIZE, TILE_SIZE, SIDE_BORDER_SIZE);

    // Inner edge (top of the wall top, darker)
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(px, py + TILE_SIZE, TILE_SIZE, 6);
  }
}

/**
 * Draw a left wall segment for a single tile edge
 */
function drawLeftWallSegment(ctx: CanvasRenderingContext2D, px: number, py: number) {
  // Main wall body (extends leftward from tile)
  ctx.fillStyle = '#323242';
  ctx.fillRect(px - SIDE_BORDER_SIZE, py, SIDE_BORDER_SIZE, TILE_SIZE);

  // Inner edge (right side of left wall, darker)
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(px - 6, py, 6, TILE_SIZE);
}

/**
 * Draw a right wall segment for a single tile edge
 */
function drawRightWallSegment(ctx: CanvasRenderingContext2D, px: number, py: number) {
  // Main wall body (extends rightward from tile)
  ctx.fillStyle = '#323242';
  ctx.fillRect(px + TILE_SIZE, py, SIDE_BORDER_SIZE, TILE_SIZE);

  // Inner edge (left side of right wall, lighter)
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(px + TILE_SIZE, py, 6, TILE_SIZE);
}

/**
 * Draw corner pieces for smart borders
 * Top corners connect tall front-facing walls (BORDER_SIZE height)
 * Bottom corners: outer perimeter = full thickness, interior = thin wall-top
 */
function drawCornerSegment(ctx: CanvasRenderingContext2D, px: number, py: number, type: CornerType, isOuterBottom: boolean = false) {
  ctx.fillStyle = '#1a1a2a'; // Dark corner color

  // Determine bottom corner height based on whether it's outer perimeter
  const bottomHeight = isOuterBottom ? BORDER_SIZE : SIDE_BORDER_SIZE;

  switch (type) {
    // Convex corners (outer corners - puzzle sticks out)
    case 'convex-tl':
      // Top-left corner - connects to tall front-facing wall
      ctx.fillRect(px - SIDE_BORDER_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
      break;
    case 'convex-tr':
      // Top-right corner - connects to tall front-facing wall
      ctx.fillRect(px + TILE_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
      break;
    case 'convex-bl':
      // Bottom-left corner
      ctx.fillRect(px - SIDE_BORDER_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, bottomHeight);
      break;
    case 'convex-br':
      // Bottom-right corner
      ctx.fillRect(px + TILE_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, bottomHeight);
      break;

    // Concave corners (inner corners - puzzle goes inward)
    case 'concave-tl':
      // Inner top-left - connects to tall front-facing wall
      ctx.fillStyle = '#323242';
      ctx.fillRect(px - SIDE_BORDER_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
      break;
    case 'concave-tr':
      // Inner top-right - connects to tall front-facing wall
      ctx.fillStyle = '#323242';
      ctx.fillRect(px + TILE_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
      break;
    case 'concave-bl':
      // Inner bottom-left
      ctx.fillStyle = '#323242';
      ctx.fillRect(px - SIDE_BORDER_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, bottomHeight);
      break;
    case 'concave-br':
      // Inner bottom-right
      ctx.fillStyle = '#323242';
      ctx.fillRect(px + TILE_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, bottomHeight);
      break;
  }
}

function drawDungeonBorder(ctx: CanvasRenderingContext2D, gridWidth: number, gridHeight: number, totalWidth: number, totalHeight: number) {
  const gridPixelWidth = gridWidth * TILE_SIZE;
  const gridPixelHeight = gridHeight * TILE_SIZE;

  ctx.save();

  // NOTE: We do NOT fill the background here - void tiles should be transparent
  // to allow the page background to show through

  // Top wall (front-facing with depth)
  ctx.fillStyle = '#3a3a4a'; // Stone color
  ctx.fillRect(0, 0, totalWidth, BORDER_SIZE);

  // Add stone texture/depth to top wall
  ctx.fillStyle = '#2a2a3a'; // Shadow
  for (let x = 0; x < totalWidth; x += TILE_SIZE) {
    ctx.fillRect(x, BORDER_SIZE - 12, TILE_SIZE - 2, 12);
  }

  // Top wall highlight
  ctx.fillStyle = '#4a4a5a';
  for (let x = 0; x < totalWidth; x += TILE_SIZE) {
    ctx.fillRect(x, 0, TILE_SIZE - 2, 8);
  }

  // Bottom wall - full thickness for outer perimeter (special case)
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, totalWidth, BORDER_SIZE);

  // Bottom wall top edge highlight
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, totalWidth, 8);

  // Left wall (side view - THINNER)
  ctx.fillStyle = '#323242';
  ctx.fillRect(0, BORDER_SIZE, SIDE_BORDER_SIZE, gridPixelHeight);

  // Left wall inner edge
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(SIDE_BORDER_SIZE - 6, BORDER_SIZE, 6, gridPixelHeight);

  // Right wall (side view - THINNER)
  ctx.fillStyle = '#323242';
  ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE, SIDE_BORDER_SIZE, gridPixelHeight);

  // Right wall inner edge
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE, 6, gridPixelHeight);

  // Corners (darker, showing depth)
  ctx.fillStyle = '#1a1a2a';
  // Top-left - connects to tall front-facing wall
  ctx.fillRect(0, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  // Top-right - connects to tall front-facing wall
  ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  // Bottom-left - connects to full thickness bottom wall
  ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  // Bottom-right - connects to full thickness bottom wall
  ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);

  ctx.restore();
}

// Use centralized image loader for border and tile sprites
function loadBorderImage(src: string): HTMLImageElement | null {
  return loadImage(src);
}

function loadTileImage(src: string): HTMLImageElement | null {
  return loadImage(src);
}

function drawCustomBorder(
  ctx: CanvasRenderingContext2D,
  gridWidth: number,
  gridHeight: number,
  totalWidth: number,
  totalHeight: number,
  sprites: import('../../types/game').CustomBorderSprites
) {
  const gridPixelWidth = gridWidth * TILE_SIZE;
  const gridPixelHeight = gridHeight * TILE_SIZE;

  ctx.save();

  // NOTE: We do NOT fill the background here - void tiles should be transparent
  // to allow the page background to show through

  // Load all sprite images
  const wallFrontImg = loadBorderImage(sprites.wallFront || '');
  const wallTopImg = loadBorderImage(sprites.wallTop || '');
  const wallSideImg = loadBorderImage(sprites.wallSide || '');
  const wallBottomOuterImg = loadBorderImage(sprites.wallBottomOuter || sprites.wallFront || '');
  const cornerTLImg = loadBorderImage(sprites.cornerTopLeft || '');
  const cornerTRImg = loadBorderImage(sprites.cornerTopRight || '');
  const cornerBLImg = loadBorderImage(sprites.cornerBottomLeft || '');
  const cornerBRImg = loadBorderImage(sprites.cornerBottomRight || '');

  // Draw top wall - fixed size (48x48), tiled horizontally
  if (wallFrontImg && wallFrontImg.complete) {
    for (let x = SIDE_BORDER_SIZE; x < SIDE_BORDER_SIZE + gridPixelWidth; x += TILE_SIZE) {
      ctx.drawImage(wallFrontImg, x, 0, TILE_SIZE, BORDER_SIZE);
    }
  } else {
    // Fallback to dungeon style
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(SIDE_BORDER_SIZE, 0, gridPixelWidth, BORDER_SIZE);
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(SIDE_BORDER_SIZE, BORDER_SIZE - 12, gridPixelWidth, 12);
  }

  // Draw bottom wall - fixed size (48x48), tiled horizontally
  if (wallBottomOuterImg && wallBottomOuterImg.complete) {
    for (let x = SIDE_BORDER_SIZE; x < SIDE_BORDER_SIZE + gridPixelWidth; x += TILE_SIZE) {
      ctx.drawImage(wallBottomOuterImg, x, BORDER_SIZE + gridPixelHeight, TILE_SIZE, BORDER_SIZE);
    }
  } else {
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(SIDE_BORDER_SIZE, BORDER_SIZE + gridPixelHeight, gridPixelWidth, BORDER_SIZE);
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(SIDE_BORDER_SIZE, BORDER_SIZE + gridPixelHeight, gridPixelWidth, 8);
  }

  // Draw left wall - fixed size tiled vertically
  if (wallSideImg && wallSideImg.complete) {
    for (let y = BORDER_SIZE; y < BORDER_SIZE + gridPixelHeight; y += TILE_SIZE) {
      ctx.drawImage(wallSideImg, 0, y, SIDE_BORDER_SIZE, TILE_SIZE);
    }
  } else {
    ctx.fillStyle = '#323242';
    ctx.fillRect(0, BORDER_SIZE, SIDE_BORDER_SIZE, gridPixelHeight);
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(SIDE_BORDER_SIZE - 6, BORDER_SIZE, 6, gridPixelHeight);
  }

  // Draw right wall (mirrored) - fixed size tiled vertically
  if (wallSideImg && wallSideImg.complete) {
    for (let y = BORDER_SIZE; y < BORDER_SIZE + gridPixelHeight; y += TILE_SIZE) {
      ctx.save();
      ctx.translate(SIDE_BORDER_SIZE + gridPixelWidth + SIDE_BORDER_SIZE, y);
      ctx.scale(-1, 1);
      ctx.drawImage(wallSideImg, 0, 0, SIDE_BORDER_SIZE, TILE_SIZE);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = '#323242';
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE, SIDE_BORDER_SIZE, gridPixelHeight);
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE, 6, gridPixelHeight);
  }

  // Draw corners - fixed sizes
  // Top-left corner
  if (cornerTLImg && cornerTLImg.complete) {
    ctx.drawImage(cornerTLImg, 0, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  } else {
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(0, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  }

  // Top-right corner
  if (cornerTRImg && cornerTRImg.complete) {
    ctx.drawImage(cornerTRImg, SIDE_BORDER_SIZE + gridPixelWidth, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  } else {
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
  }

  // Bottom-left corner
  if (cornerBLImg && cornerBLImg.complete) {
    ctx.drawImage(cornerBLImg, 0, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  } else {
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  }

  // Bottom-right corner
  if (cornerBRImg && cornerBRImg.complete) {
    ctx.drawImage(cornerBRImg, SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  } else {
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  }

  ctx.restore();
}

/**
 * Draw smart custom border that conforms to irregular puzzle shapes using custom sprites
 */
function drawSmartCustomBorder(
  ctx: CanvasRenderingContext2D,
  tiles: (import('../../types/game').TileOrNull)[][],
  gridWidth: number,
  gridHeight: number,
  sprites: import('../../types/game').CustomBorderSprites
) {
  const borderData = computeSmartBorder(tiles, gridWidth, gridHeight);
  const offsetX = SIDE_BORDER_SIZE;
  const offsetY = BORDER_SIZE;

  // Load all sprite images
  const wallFrontImg = loadBorderImage(sprites.wallFront || '');
  const wallTopImg = loadBorderImage(sprites.wallTop || '');
  const wallSideImg = loadBorderImage(sprites.wallSide || '');
  const wallBottomOuterImg = loadBorderImage(sprites.wallBottomOuter || sprites.wallFront || '');
  // Full-size corners (24x48)
  const cornerTLImg = loadBorderImage(sprites.cornerTopLeft || '');
  const cornerTRImg = loadBorderImage(sprites.cornerTopRight || '');
  const cornerBLImg = loadBorderImage(sprites.cornerBottomLeft || '');
  const cornerBRImg = loadBorderImage(sprites.cornerBottomRight || '');
  // Thin corners (24x24) - fall back to full-size if not provided
  const cornerBLThinImg = loadBorderImage(sprites.cornerBottomLeftThin || sprites.cornerBottomLeft || '');
  const cornerBRThinImg = loadBorderImage(sprites.cornerBottomRightThin || sprites.cornerBottomRight || '');
  // Full-size inner corners (24x48)
  const innerCornerTLImg = loadBorderImage(sprites.innerCornerTopLeft || '');
  const innerCornerTRImg = loadBorderImage(sprites.innerCornerTopRight || '');
  const innerCornerBLImg = loadBorderImage(sprites.innerCornerBottomLeft || '');
  const innerCornerBRImg = loadBorderImage(sprites.innerCornerBottomRight || '');
  // Thin inner corners (24x24) - fall back to full-size if not provided
  const innerCornerBLThinImg = loadBorderImage(sprites.innerCornerBottomLeftThin || sprites.innerCornerBottomLeft || '');
  const innerCornerBRThinImg = loadBorderImage(sprites.innerCornerBottomRightThin || sprites.innerCornerBottomRight || '');

  ctx.save();

  // Draw edge borders for each exposed tile edge
  borderData.edges.forEach(({ x, y, edge, isOuterEdge }) => {
    const px = offsetX + x * TILE_SIZE;
    const py = offsetY + y * TILE_SIZE;

    switch (edge) {
      case 'top':
        // Top edge - front-facing wall (fixed 48x48 size)
        if (wallFrontImg && wallFrontImg.complete) {
          ctx.drawImage(wallFrontImg, px, py - BORDER_SIZE, TILE_SIZE, BORDER_SIZE);
        } else {
          drawTopWallSegment(ctx, px, py);
        }
        break;
      case 'bottom':
        // Bottom edge - thin wall-top for interior, full for outer
        if (isOuterEdge) {
          if (wallBottomOuterImg && wallBottomOuterImg.complete) {
            ctx.drawImage(wallBottomOuterImg, px, py + TILE_SIZE, TILE_SIZE, BORDER_SIZE);
          } else {
            drawBottomWallSegment(ctx, px, py, true);
          }
        } else {
          if (wallTopImg && wallTopImg.complete) {
            ctx.drawImage(wallTopImg, px, py + TILE_SIZE, TILE_SIZE, SIDE_BORDER_SIZE);
          } else {
            drawBottomWallSegment(ctx, px, py, false);
          }
        }
        break;
      case 'left':
        // Left edge - side wall (fixed size)
        if (wallSideImg && wallSideImg.complete) {
          ctx.drawImage(wallSideImg, px - SIDE_BORDER_SIZE, py, SIDE_BORDER_SIZE, TILE_SIZE);
        } else {
          drawLeftWallSegment(ctx, px, py);
        }
        break;
      case 'right':
        // Right edge - side wall (mirrored, fixed size)
        if (wallSideImg && wallSideImg.complete) {
          ctx.save();
          ctx.translate(px + TILE_SIZE + SIDE_BORDER_SIZE, py);
          ctx.scale(-1, 1);
          ctx.drawImage(wallSideImg, 0, 0, SIDE_BORDER_SIZE, TILE_SIZE);
          ctx.restore();
        } else {
          drawRightWallSegment(ctx, px, py);
        }
        break;
    }
  });

  // Draw corners on top of edges (fixed sizes)
  borderData.corners.forEach(({ x, y, type, isOuterBottom }) => {
    const px = offsetX + x * TILE_SIZE;
    const py = offsetY + y * TILE_SIZE;

    // Determine corner height based on outer/inner positioning
    const cornerHeight = isOuterBottom ? BORDER_SIZE : SIDE_BORDER_SIZE;

    switch (type) {
      case 'convex-tl':
        if (cornerTLImg && cornerTLImg.complete) {
          ctx.drawImage(cornerTLImg, px - SIDE_BORDER_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
        } else {
          drawCornerSegment(ctx, px, py, type, isOuterBottom);
        }
        break;
      case 'convex-tr':
        if (cornerTRImg && cornerTRImg.complete) {
          ctx.drawImage(cornerTRImg, px + TILE_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
        } else {
          drawCornerSegment(ctx, px, py, type, isOuterBottom);
        }
        break;
      case 'convex-bl':
        // Use thin variant for interior voids, full for outer perimeter
        if (isOuterBottom) {
          if (cornerBLImg && cornerBLImg.complete) {
            ctx.drawImage(cornerBLImg, px - SIDE_BORDER_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        } else {
          if (cornerBLThinImg && cornerBLThinImg.complete) {
            ctx.drawImage(cornerBLThinImg, px - SIDE_BORDER_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, SIDE_BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        }
        break;
      case 'convex-br':
        // Use thin variant for interior voids, full for outer perimeter
        if (isOuterBottom) {
          if (cornerBRImg && cornerBRImg.complete) {
            ctx.drawImage(cornerBRImg, px + TILE_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        } else {
          if (cornerBRThinImg && cornerBRThinImg.complete) {
            ctx.drawImage(cornerBRThinImg, px + TILE_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, SIDE_BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        }
        break;
      case 'concave-tl':
        if (innerCornerTLImg && innerCornerTLImg.complete) {
          ctx.drawImage(innerCornerTLImg, px - SIDE_BORDER_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
        } else {
          drawCornerSegment(ctx, px, py, type, isOuterBottom);
        }
        break;
      case 'concave-tr':
        if (innerCornerTRImg && innerCornerTRImg.complete) {
          ctx.drawImage(innerCornerTRImg, px + TILE_SIZE, py - BORDER_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
        } else {
          drawCornerSegment(ctx, px, py, type, isOuterBottom);
        }
        break;
      case 'concave-bl':
        // Use thin variant for interior voids, full for outer perimeter
        if (isOuterBottom) {
          if (innerCornerBLImg && innerCornerBLImg.complete) {
            ctx.drawImage(innerCornerBLImg, px - SIDE_BORDER_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        } else {
          if (innerCornerBLThinImg && innerCornerBLThinImg.complete) {
            ctx.drawImage(innerCornerBLThinImg, px - SIDE_BORDER_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, SIDE_BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        }
        break;
      case 'concave-br':
        // Use thin variant for interior voids, full for outer perimeter
        if (isOuterBottom) {
          if (innerCornerBRImg && innerCornerBRImg.complete) {
            ctx.drawImage(innerCornerBRImg, px + TILE_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        } else {
          if (innerCornerBRThinImg && innerCornerBRThinImg.complete) {
            ctx.drawImage(innerCornerBRThinImg, px + TILE_SIZE, py + TILE_SIZE, SIDE_BORDER_SIZE, SIDE_BORDER_SIZE);
          } else {
            drawCornerSegment(ctx, px, py, type, isOuterBottom);
          }
        }
        break;
    }
  });

  ctx.restore();
}

function drawVoidTile(_ctx: CanvasRenderingContext2D, _x: number, _y: number) {
  // Void tiles are truly transparent - we don't draw anything here.
  // The border will be drawn around the edges of playable tiles instead.
  // This allows the page background or parent element to show through.
}

function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, type: TileType, tileSprites?: TileSprites, tile?: Tile | null, customTileSprites?: { [customTileTypeId: string]: string | { onSprite?: string; offSprite?: string } }, isEditor: boolean = false, currentTurn: number = 0, tileStates?: Map<string, import('../../types/game').TileRuntimeState>) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  // Check for custom tile type
  let customTileType: CustomTileType | null = null;
  if (tile?.customTileTypeId) {
    customTileType = loadTileType(tile.customTileTypeId);
  }

  // Determine if tile is in on or off state (considering both cadence and trigger group overrides)
  let isOnState = true;
  // First check for override state from pressure plate trigger groups
  const tileState = tileStates?.get(`${x},${y}`);
  if (tileState?.overrideState) {
    isOnState = tileState.overrideState === 'on';
  } else if (customTileType?.cadence?.enabled) {
    // No override - fall back to cadence
    isOnState = isTileActiveOnTurn(customTileType.cadence, currentTurn);
  }

  // Determine base tile color for transparency support
  const isWall = type === TileType.WALL;
  const isGoal = type === TileType.GOAL;
  const baseColor = isWall ? COLORS.wall : COLORS.empty;

  // Priority 1: Check for skin-specific custom tile sprite
  if (tile?.customTileTypeId && customTileSprites?.[tile.customTileTypeId]) {
    const skinSpriteEntry = customTileSprites[tile.customTileTypeId];
    // Handle both legacy string format and new on/off object format
    let spriteData: string | undefined;
    if (typeof skinSpriteEntry === 'string') {
      // Legacy format - single sprite
      spriteData = skinSpriteEntry;
    } else {
      // New format with on/off sprites
      spriteData = isOnState
        ? (skinSpriteEntry.onSprite || skinSpriteEntry.offSprite)
        : (skinSpriteEntry.offSprite || skinSpriteEntry.onSprite);
    }

    if (spriteData) {
      const customImg = loadTileImage(spriteData);
      if (customImg?.complete) {
        // Draw base color first for transparency support
        ctx.fillStyle = baseColor;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Apply dimming effect if tile is off and using fallback sprite
        if (!isOnState && typeof skinSpriteEntry !== 'string' && !skinSpriteEntry.offSprite) {
          ctx.globalAlpha = 0.4;
        }
        ctx.drawImage(customImg, px, py, TILE_SIZE, TILE_SIZE);
        ctx.globalAlpha = 1;
        // Draw grid lines
        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        // Draw behavior indicators on top
        if (customTileType) {
          drawTileBehaviorIndicators(ctx, px, py, customTileType, tile, isEditor, isOnState);
        }
        return;
      }
    }
  }

  // Priority 2: Draw tile type's default custom sprite if available (supports both data URLs and HTTP URLs)
  // Use off state sprite if available and tile is off, otherwise use main sprite
  const mainSpriteSource = resolveImageSource(customTileType?.customSprite?.idleImageData, customTileType?.customSprite?.idleImageUrl);
  const offSpriteSource = resolveImageSource(customTileType?.offStateSprite?.idleImageData, customTileType?.offStateSprite?.idleImageUrl);
  const spriteToUse = isOnState
    ? mainSpriteSource
    : (offSpriteSource || mainSpriteSource);

  if (spriteToUse) {
    const customImg = loadTileImage(spriteToUse);
    if (customImg?.complete) {
      // Draw base color first for transparency support
      ctx.fillStyle = baseColor;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      // Apply dimming if tile is off and no dedicated off sprite
      if (!isOnState && !offSpriteSource) {
        ctx.globalAlpha = 0.4;
      }
      ctx.drawImage(customImg, px, py, TILE_SIZE, TILE_SIZE);
      ctx.globalAlpha = 1;
      // Draw grid lines
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      // Draw behavior indicators on top
      if (customTileType) {
        drawTileBehaviorIndicators(ctx, px, py, customTileType, tile, isEditor, isOnState);
      }
      return;
    }
  }

  // Priority 3: Use skin tile sprites if available
  const spriteKey = isGoal ? 'goal' : (isWall ? 'wall' : 'empty');
  const spriteUrl = tileSprites?.[spriteKey];

  if (spriteUrl) {
    const tileImg = loadTileImage(spriteUrl);
    if (tileImg?.complete) {
      // Draw base color first for transparency support
      ctx.fillStyle = baseColor;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.drawImage(tileImg, px, py, TILE_SIZE, TILE_SIZE);
      // Still draw grid lines on top
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      // Draw behavior indicators if this is a custom tile
      if (customTileType) {
        drawTileBehaviorIndicators(ctx, px, py, customTileType, tile, isEditor, isOnState);
      }
      return;
    }
  }

  // Priority 4: Fallback to default colors
  ctx.fillStyle = type === TileType.WALL ? COLORS.wall : COLORS.empty;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

  // Draw behavior indicators if this is a custom tile without custom sprite
  if (customTileType) {
    drawTileBehaviorIndicators(ctx, px, py, customTileType, tile, isEditor, isOnState);
  }
}

/**
 * Draw visual indicators for tile behaviors
 */
function drawTileBehaviorIndicators(ctx: CanvasRenderingContext2D, px: number, py: number, tileType: CustomTileType, tile?: Tile | null, isEditor: boolean = false, isOnState: boolean = true) {
  // If tile type has hideBehaviorIndicators enabled, skip all indicators
  if (tileType.hideBehaviorIndicators) {
    return;
  }

  const centerX = px + TILE_SIZE / 2;
  const centerY = py + TILE_SIZE / 2;

  // Dim indicators when tile is in "off" state
  if (!isOnState) {
    ctx.globalAlpha = 0.3;
  }

  for (const behavior of tileType.behaviors) {
    switch (behavior.type) {
      case 'damage':
        // Red tint overlay (dimmer when off)
        ctx.fillStyle = isOnState ? 'rgba(255, 0, 0, 0.2)' : 'rgba(100, 100, 100, 0.2)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Fire icon
        ctx.font = '16px Arial';
        ctx.fillStyle = isOnState ? 'rgba(255, 100, 0, 0.8)' : 'rgba(100, 100, 100, 0.6)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isOnState ? '🔥' : '💨', centerX, centerY);
        break;

      case 'teleport':
        // Purple glow (dimmer when off)
        ctx.fillStyle = isOnState ? 'rgba(128, 0, 255, 0.2)' : 'rgba(80, 80, 80, 0.2)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Show teleport group letter only in editor mode
        if (isEditor) {
          const groupId = tile?.teleportGroupId || behavior.teleportGroupId || 'A';
          ctx.font = 'bold 20px Arial';
          ctx.fillStyle = isOnState ? 'rgba(200, 100, 255, 0.9)' : 'rgba(100, 100, 100, 0.6)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(groupId, centerX, centerY);
        }
        break;

      case 'direction_change':
        // Arrow showing forced direction (dimmer when off)
        ctx.fillStyle = isOnState ? 'rgba(0, 200, 255, 0.3)' : 'rgba(80, 80, 80, 0.2)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        const arrow = getDirectionArrow(behavior.newFacing);
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = isOnState ? 'rgba(0, 200, 255, 0.9)' : 'rgba(100, 100, 100, 0.5)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(arrow, centerX, centerY);
        break;

      case 'ice':
        // Blue tint with diagonal lines (dimmer when off)
        ctx.fillStyle = isOnState ? 'rgba(100, 200, 255, 0.3)' : 'rgba(80, 80, 80, 0.2)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Draw diagonal lines pattern with clipping
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.clip();
        ctx.strokeStyle = isOnState ? 'rgba(150, 220, 255, 0.6)' : 'rgba(100, 100, 100, 0.3)';
        ctx.lineWidth = 1;
        for (let i = -TILE_SIZE; i < TILE_SIZE * 2; i += 8) {
          ctx.beginPath();
          ctx.moveTo(px + i, py);
          ctx.lineTo(px + i + TILE_SIZE, py + TILE_SIZE);
          ctx.stroke();
        }
        ctx.restore();
        break;

      case 'pressure_plate':
        // Button-like appearance (dimmer when off)
        ctx.fillStyle = isOnState ? 'rgba(100, 100, 100, 0.3)' : 'rgba(60, 60, 60, 0.2)';
        ctx.fillRect(px + 8, py + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        ctx.strokeStyle = isOnState ? 'rgba(80, 80, 80, 0.8)' : 'rgba(60, 60, 60, 0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 8, py + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        break;
    }
  }

  // Reset globalAlpha
  ctx.globalAlpha = 1.0;
}

/**
 * Get arrow character for direction
 */
function getDirectionArrow(direction?: string): string {
  switch (direction) {
    case 'north': return '↑';
    case 'northeast': return '↗';
    case 'east': return '→';
    case 'southeast': return '↘';
    case 'south': return '↓';
    case 'southwest': return '↙';
    case 'west': return '←';
    case 'northwest': return '↖';
    default: return '→';
  }
}

/**
 * Get stealth opacity for an entity (1.0 if not stealthed)
 */
function getStealthOpacity(entity: PlacedCharacter | PlacedEnemy): number {
  if (!entity.statusEffects) return 1.0;

  for (const effect of entity.statusEffects) {
    if (effect.type === StatusEffectType.STEALTH) {
      const effectAsset = loadStatusEffectAsset(effect.statusAssetId);
      if (effectAsset?.stealthOpacity !== undefined) {
        return effectAsset.stealthOpacity;
      }
      return 0.5; // Default stealth opacity
    }
  }
  return 1.0;
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: PlacedEnemy,
  renderX?: number,
  renderY?: number,
  isMoving: boolean = false,
  facingOverride?: Direction,
  gameStarted: boolean = true,
  deathAnimState?: DeathAnimationState,
  now: number = Date.now(),
  spawnAnimState?: SpawnAnimationState,
  homingGlowColor?: string,
  entityIndex?: number
) {
  const x = renderX !== undefined ? renderX : enemy.x;
  const y = renderY !== undefined ? renderY : enemy.y;
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const facing = facingOverride !== undefined ? facingOverride : enemy.facing;

  // Contact-damage reaction: when active for this enemy this turn, play the cast
  // animation toward the recorded reaction facing (which faces the attacker when the
  // effect opts in). Read from the module map so drawEnemy needs no gameState.
  const reactionFacing = entityIndex !== undefined ? enemyContactReactionFacing.get(entityIndex) : undefined;
  const contactReacting = !isMoving && reactionFacing !== undefined;

  // Honor the entity's facing direction even during setup, so the post-spawn idle
  // points the way the entity will move once the game starts. Falls back to the
  // 'default' directional sprite when that specific direction isn't configured
  // (see directionalSprites[dirKey] || ['default'] in drawSpritePixelPerfect).
  const directionToUse = contactReacting ? reactionFacing! : facing;

  // Determine if enemy is casting (only if not moving, since moving takes priority).
  // isCasting is a deterministic per-turn flag — true for the whole turn a spell is cast.
  // The contact-damage reaction reuses the same cast animation.
  const isCasting = !isMoving && (!!enemy.isCasting || contactReacting);

  // Check if this enemy has a custom sprite
  const enemyData = getEnemy(enemy.enemyId) as CustomEnemy | undefined;
  const hasCustomSprite = enemyData && 'customSprite' in enemyData && enemyData.customSprite;

  // Check if spawn animation is still playing
  const isSpawning = spawnAnimState && hasCustomSprite && enemyData.customSprite &&
    hasSpawnAnimation(enemyData.customSprite) &&
    isSpawnAnimationPlaying(enemyData.customSprite, spawnAnimState.startTime);

  // Apply stealth opacity for living enemies
  const stealthOpacity = !enemy.dead ? getStealthOpacity(enemy) : 1.0;
  const originalAlpha = ctx.globalAlpha;
  if (stealthOpacity < 1.0) {
    ctx.globalAlpha = stealthOpacity;
  }

  if (hasCustomSprite && enemyData.customSprite) {
    if (!enemy.dead) {
      // Living enemy — grounded blob shadow, or the legacy offset silhouette
      // when the blob toggle is off (see blobShadows.ts)
      const blob = blobShadowsEnabled();
      if (blob) {
        drawBlobShadow(ctx, enemyData.customSprite, directionToUse, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, !!enemyData.isFloating);
      } else {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
      }

      if (isSpawning && spawnAnimState) {
        // Spawn animation is playing - draw spawn sprite instead of normal sprite
        drawSpawnSpritePixelPerfect(ctx, enemyData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, spawnAnimState.startTime);
      } else {
        // Normal sprite (idle/moving/casting)
        drawSpritePixelPerfect(ctx, enemyData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, directionToUse, isMoving, now, isCasting, entityIndex !== undefined ? enemyCastStartTimes.get(entityIndex) : undefined);
      }

      if (!blob) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    } else {
      // Dead enemy - use death sprite (animates then stays on final frame as corpse)
      const hasDeathSprite = hasDeathAnimation(enemyData.customSprite);

      if (hasDeathSprite) {
        // Death sprite sheet will animate and stop on final frame (corpse state)
        // Use the death animation start time for proper frame calculation
        // The death anim now persists while the entity is dead, so its fixed
        // startTime plays the sheet through and holds the final (corpse) frame.
        // `now` only applies for the 1-frame window before the anim registers,
        // where it correctly starts at frame 0 (no last-frame flash).
        const deathStartTime = deathAnimState?.startTime || now;
        if (blobShadowsEnabled()) {
          drawDeathBlobShadow(ctx, enemyData.customSprite, deathAnimState?.facing || facing, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, deathStartTime, now);
        }
        drawDeathSpritePixelPerfect(
          ctx,
          enemyData.customSprite,
          px + TILE_SIZE / 2,
          py + TILE_SIZE / 2,
          TILE_SIZE,
          deathAnimState?.facing || facing,
          deathStartTime
        );
      } else {
        // No death sprite - draw dimmed version with X
        if (blobShadowsEnabled()) {
          drawDeathBlobShadow(ctx, enemyData.customSprite, directionToUse, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, now, now);
        }
        ctx.globalAlpha = 0.3;
        drawSpritePixelPerfect(ctx, enemyData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, directionToUse, false, now);
        ctx.globalAlpha = 1.0;
        drawDeadX(ctx, px, py);
      }
    }
  } else {
    // Default rendering (no custom sprite)
    if (!enemy.dead) {
      // Legacy default enemies had no shadow at all — blob mode grounds them too
      if (blobShadowsEnabled()) {
        drawBlobShadow(ctx, enemyData?.customSprite, directionToUse, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, !!enemyData?.isFloating);
      }
      ctx.fillStyle = COLORS.enemy;
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE / 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Dead default sprite
      if (blobShadowsEnabled()) {
        drawDeathBlobShadow(ctx, enemyData?.customSprite, directionToUse, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, now, now);
      }
      ctx.fillStyle = COLORS.deadEnemy;
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE / 3, 0, Math.PI * 2);
      ctx.fill();
      drawDeadX(ctx, px, py);
    }
  }

  // Reset globalAlpha after drawing sprite (before health bar, which should always be visible)
  ctx.globalAlpha = originalAlpha;

  // Charm tint: configurable colour overlay + optional heart icon
  if (!enemy.dead) {
    const charmEffect = enemy.statusEffects?.find(e => e.type === StatusEffectType.CHARM);
    if (charmEffect) {
      const charmAsset = loadStatusEffectAsset(charmEffect.statusAssetId);
      const tintEnabled = charmAsset?.charmTintEnabled !== false;
      const tintColor = charmAsset?.charmTintColor ?? '#e879f9';
      const tintOpacity = charmAsset?.charmTintOpacity ?? 0.35;
      const showHeart = charmAsset?.charmShowHeart !== false;
      if (tintEnabled) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = tintOpacity;
        ctx.fillStyle = tintColor;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.restore();
      }
      if (showHeart) drawCharmHeartIcon(ctx, px, py);
    }
  }

  // Draw status effect overlays (e.g., shield bubble) on top of the entity
  const enemyKey = entityIndex !== undefined ? `e_${entityIndex}` : `e_${enemy.x}_${enemy.y}`;
  if (!enemy.dead) {
    drawStatusEffectOverlays(ctx, px, py, enemy.statusEffects, now);
    trackStatusIconAnimations(enemyKey, enemy.statusEffects, now, gameStarted);
  } else {
    // Show dead-variant trait icons above corpses
    drawStatusEffectIcons(ctx, px, py, enemy.statusEffects, true, enemyKey, now);
  }

  if (!enemy.dead) {
    // Draw health bar above the enemy
    const maxHealth = enemyData?.health || enemy.currentHealth;
    const isBoss = enemyData?.isBoss === true;
    const enemySpriteTop = hasCustomSprite ? getSpriteTopY(enemyData?.customSprite, py) : undefined;
    const barTopY = getHealthBarTopY(py, enemySpriteTop);
    drawHealthBar(ctx, px, py, enemy.currentHealth + (enemy.pendingVisualDamage ?? 0), maxHealth, entityIndex ?? -1, 'enemy', enemy.statusEffects, now, isBoss, enemySpriteTop, homingGlowColor);

    // Draw direction indicator next to health bar — green if moving, grey for facing only
    if (enemyData) {
      const enemyHasMovement = enemyHasMovementActions(enemyData.behavior);
      drawDirectionIndicator(ctx, px, barTopY, facing || Direction.SOUTH, isBoss, enemyHasMovement);
    }

    // Draw status effect icons above health bar
    drawStatusEffectIcons(ctx, px, py, enemy.statusEffects, false, enemyKey, now, barTopY);
  }
}

// Helper to draw X over dead entities
function drawDeadX(ctx: CanvasRenderingContext2D, px: number, py: number) {
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + TILE_SIZE / 3, py + TILE_SIZE / 3);
  ctx.lineTo(px + (2 * TILE_SIZE) / 3, py + (2 * TILE_SIZE) / 3);
  ctx.moveTo(px + (2 * TILE_SIZE) / 3, py + TILE_SIZE / 3);
  ctx.lineTo(px + TILE_SIZE / 3, py + (2 * TILE_SIZE) / 3);
  ctx.stroke();
}

// Health bar animation state tracking (module-level for persistence across renders)
const healthBarState = new Map<string, {
  lastHealth: number;
  changeTime: number;
  changeType: 'damage' | 'heal' | null;
  displayHealth: number; // For smooth color transitions
}>();

// Status effect icon animation state — tracks apply pop and remove fade per entity+effect
interface StatusIconAnim {
  startTime: number;
  type: 'apply' | 'remove';
  effect?: StatusEffectInstance; // stored for 'remove' ghost rendering
}
const prevEntityStatusEffects = new Map<string, StatusEffectInstance[]>();
const statusIconAnims = new Map<string, StatusIconAnim>(); // entityKey_assetId → anim state
const STATUS_ICON_ANIM_DURATION = 380;
const STATUS_ICON_REMOVE_DURATION = 200;

function trackStatusIconAnimations(
  entityKey: string,
  currentEffects: StatusEffectInstance[] | undefined,
  now: number,
  gameStarted: boolean
) {
  const current = currentEffects ?? [];
  const currentIds = new Set(current.map(e => e.statusAssetId));
  const prevEffects = prevEntityStatusEffects.get(entityKey);
  if (gameStarted && prevEffects !== undefined) {
    const prevIds = new Set(prevEffects.map(e => e.statusAssetId));
    for (const id of currentIds) {
      if (!prevIds.has(id)) {
        statusIconAnims.set(`${entityKey}_${id}`, { startTime: now, type: 'apply' });
      }
    }
    for (const prevEffect of prevEffects) {
      if (!currentIds.has(prevEffect.statusAssetId)) {
        statusIconAnims.set(`${entityKey}_${prevEffect.statusAssetId}`, {
          startTime: now,
          type: 'remove',
          effect: prevEffect,
        });
      }
    }
  }
  prevEntityStatusEffects.set(entityKey, [...current]);
}

function getStatusIconScale(entityKey: string, statusAssetId: string, now: number): number {
  const anim = statusIconAnims.get(`${entityKey}_${statusAssetId}`);
  if (anim === undefined) return 1;
  if (anim.type === 'apply') {
    const t = Math.min((now - anim.startTime) / STATUS_ICON_ANIM_DURATION, 1);
    if (t >= 1) { statusIconAnims.delete(`${entityKey}_${statusAssetId}`); return 1; }
    return 1 + 0.3 * Math.sin(Math.PI * t);
  } else {
    const t = Math.min((now - anim.startTime) / STATUS_ICON_REMOVE_DURATION, 1);
    if (t >= 1) { statusIconAnims.delete(`${entityKey}_${statusAssetId}`); return 0; }
    return 1 - t;
  }
}

function getGhostStatusEffects(
  entityKey: string,
  now: number,
  currentEffects: StatusEffectInstance[]
): StatusEffectInstance[] {
  const currentIds = new Set(currentEffects.map(e => e.statusAssetId));
  const ghosts: StatusEffectInstance[] = [];
  for (const [key, anim] of statusIconAnims) {
    if (anim.type === 'remove' && key.startsWith(`${entityKey}_`) && anim.effect) {
      if (!currentIds.has(anim.effect.statusAssetId)) {
        ghosts.push(anim.effect);
      }
    }
  }
  return ghosts;
}

// Helper to get unique key for entity health tracking.
// Keyed by entity type + array index — stable across position changes (so a moving
// entity's animation state carries with it) and unique across same-id duplicates
// (since each instance has a distinct index in placedCharacters / puzzle.enemies).
// Position-based keys would let the lerp pick up stale displayHealth from a prior
// occupant whenever an entity stepped onto a previously-used tile.
function getHealthBarKey(entityType: 'enemy' | 'character', instanceIndex: number): string {
  return `${entityType}:${instanceIndex}`;
}

// Cache for boss icon image
let bossIconImage: HTMLImageElement | null = null;
let bossIconLoading = false;
let lastBossIconUrl: string | null = null;
let defaultBossIconGenerated: string | null = null;

// Generate a default skull icon using canvas (8x8 pixel art skull)
function generateDefaultBossIcon(): string {
  if (defaultBossIconGenerated) return defaultBossIconGenerated;

  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Draw a simple 8x8 skull pixel art
  ctx.fillStyle = '#ffffff';
  // Row 0: top of skull
  ctx.fillRect(2, 0, 4, 1);
  // Row 1: wider skull
  ctx.fillRect(1, 1, 6, 1);
  // Row 2: full width with eyes
  ctx.fillRect(0, 2, 8, 1);
  ctx.fillStyle = '#000000';
  ctx.fillRect(1, 2, 2, 1); // left eye
  ctx.fillRect(5, 2, 2, 1); // right eye
  // Row 3: skull with nose
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 3, 8, 1);
  ctx.fillStyle = '#000000';
  ctx.fillRect(3, 3, 2, 1); // nose
  // Row 4: upper jaw
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(1, 4, 6, 1);
  // Row 5: teeth row
  ctx.fillRect(1, 5, 6, 1);
  ctx.fillStyle = '#000000';
  ctx.fillRect(2, 5, 1, 1); // tooth gap
  ctx.fillRect(5, 5, 1, 1); // tooth gap
  // Row 6: lower teeth
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(2, 6, 4, 1);
  ctx.fillStyle = '#000000';
  ctx.fillRect(3, 6, 2, 1); // gap
  // Row 7: jaw bottom
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(3, 7, 2, 1);

  defaultBossIconGenerated = canvas.toDataURL('image/png');
  return defaultBossIconGenerated;
}

// Helper to load boss icon
function loadBossIcon(): HTMLImageElement | null {
  const customIconUrl = getThemeAsset('iconBossHealthBar');
  const iconUrl = customIconUrl || generateDefaultBossIcon();

  // Check if we need to reload (URL changed)
  if (iconUrl !== lastBossIconUrl) {
    bossIconImage = null;
    bossIconLoading = false;
    lastBossIconUrl = iconUrl;
  }

  if (bossIconImage) return bossIconImage;
  if (bossIconLoading) return null;

  bossIconLoading = true;
  const img = new Image();
  img.onload = () => {
    bossIconImage = img;
    bossIconLoading = false;
  };
  img.onerror = () => {
    bossIconLoading = false;
  };
  img.src = iconUrl;
  return null;
}

// Helper to calculate the top Y of a rendered sprite (for healthbar positioning)
function getSpriteTopY(sprite: import('../../utils/assetStorage').CustomSprite | undefined, py: number): number {
  if (!sprite) return py;
  // Native-size rendering: idle frame height × zoom (see getSpriteDrawHeight)
  const drawHeight = getSpriteDrawHeight(sprite, TILE_SIZE);
  // Assume center anchor (0.5) which is the default
  const centerY = py + TILE_SIZE / 2;
  return centerY - drawHeight / 2;
}

// Helper to draw health bar above entity
/** Check if an entity is targeted by an active straight-line homing projectile. Returns glow color or undefined. */
function getHomingTargetGlow(
  gameState: GameState, entityId: string, isEnemy: boolean,
  visualState: Map<string, ProjectileVisualState>,
  enemyIndex?: number,
): string | undefined {
  if (!gameState.activeProjectiles) return undefined;
  for (const proj of gameState.activeProjectiles) {
    // Glow applies to all homing styles (straight / grid / pathfinding) AND
    // to bolts that were intended-homing but got downgraded to non-homing at
    // spawn (target was out of range). targetEntityId is only populated when
    // homingTarget was passed to spawnProjectile — i.e. the cast was
    // originally a homing cast — so using it as the glow trigger covers both
    // homing and downgraded-homing cases without lighting up plain linear
    // spells that never had a target.
    if (!proj.active) continue;
    if (!proj.targetEntityId) continue;
    // Current target match (non-reflected, or reflected post-pivot).
    // For enemies, match by array index when available to disambiguate
    // duplicates sharing the same enemyId. Without this, all enemies of the
    // same id would glow together even when only one is actually targeted.
    const idMatches = proj.targetEntityId === entityId && proj.targetIsEnemy === isEnemy;
    if (idMatches) {
      if (isEnemy && proj.targetEnemyIndex !== undefined && enemyIndex !== undefined) {
        if (proj.targetEnemyIndex !== enemyIndex) continue;
      }
      return proj.attackData.healing !== undefined ? '#4ade80' : '#ef4444';
    }
    // For reflected projectiles still in approach phase, glow the original target (the reflector)
    const pastReflectPoint = !!visualState.get(proj.id)?.visualPastReflectPoint;
    if (proj.reflected && !pastReflectPoint) {
      // The reflector is the opposite team's entity stored in hitEntityIds[0]
      const reflectorId = proj.hitEntityIds?.[0];
      if (reflectorId === entityId && !isEnemy !== !proj.targetIsEnemy) {
        // The reflector is the entity being checked — glow it during approach
        return proj.attackData.healing !== undefined ? '#4ade80' : '#ef4444';
      }
    }
  }
  return undefined;
}

// Top Y of the health bar: near the tile top by default, raised above the
// sprite when it's taller than the tile. The direction arrow and status-effect
// icons anchor to this same Y so the whole cluster moves together.
const HEALTH_BAR_HEIGHT = 5; // Total height including 1px border on each side (3px inner + 2px border)
function getHealthBarTopY(py: number, spriteTopY?: number): number {
  const defaultY = py + 2;
  return spriteTopY !== undefined ? Math.min(defaultY, spriteTopY - HEALTH_BAR_HEIGHT - 1) : defaultY;
}

function drawHealthBar(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  currentHealth: number,
  maxHealth: number,
  instanceIndex: number,
  entityType: 'enemy' | 'character',
  statusEffects?: StatusEffectInstance[],
  now: number = Date.now(),
  isBoss: boolean = false,
  spriteTopY?: number,
  homingGlowColor?: string
) {
  const barWidth = 30; // Fixed total width of the health bar (including border)
  const barHeight = HEALTH_BAR_HEIGHT;
  const innerHeight = 3; // Height of the colored bar inside the border

  // Boss icon dimensions
  const bossIconSize = 7; // Small icon size
  const bossIconGap = 2; // Gap between icon and health bar

  // Position: centered above the sprite
  // If boss, shift the bar right to make room for the icon
  const totalWidth = isBoss ? barWidth + bossIconSize + bossIconGap : barWidth;
  const startX = px + (TILE_SIZE - totalWidth) / 2 + (isBoss ? bossIconSize + bossIconGap : 0);
  // Place healthbar above the sprite's top edge, or near tile top if sprite fits in tile
  const startY = getHealthBarTopY(py, spriteTopY);

  // Draw boss icon if this is a boss
  if (isBoss) {
    const icon = loadBossIcon();
    if (icon) {
      const iconX = startX - bossIconSize - bossIconGap;
      const iconY = startY + (barHeight - bossIconSize) / 2; // Center vertically with health bar
      ctx.drawImage(icon, iconX, iconY, bossIconSize, bossIconSize);
    }
  }

  // Draw homing target glow (pulsing outline around health bar)
  if (homingGlowColor) {
    const glowPulse = 0.4 + 0.6 * Math.abs(Math.sin(now / 300));
    ctx.save();
    ctx.shadowColor = homingGlowColor;
    ctx.shadowBlur = 4 * glowPulse;
    ctx.strokeStyle = homingGlowColor;
    ctx.globalAlpha = glowPulse;
    ctx.lineWidth = 1;
    ctx.strokeRect(startX - 1, startY - 1, barWidth + 2, barHeight + 2);
    ctx.restore();
  }

  // Draw 1px border around the bar
  ctx.fillStyle = '#141414';
  ctx.fillRect(startX, startY, barWidth, barHeight);

  // Track health changes for flash effects - keyed by stable instance index so the
  // animation state moves with the entity instead of being looked up by tile.
  const key = getHealthBarKey(entityType, instanceIndex);
  let state = healthBarState.get(key);

  if (!state) {
    state = { lastHealth: currentHealth, changeTime: 0, changeType: null, displayHealth: currentHealth };
    healthBarState.set(key, state);
  }

  // Detect health changes
  if (state.lastHealth !== currentHealth) {
    state.changeType = currentHealth < state.lastHealth ? 'damage' : 'heal';
    state.changeTime = now;
    state.lastHealth = currentHealth;
  }

  // Smooth color transition for displayHealth (lerp towards actual health)
  const transitionSpeed = 0.15;
  state.displayHealth += (currentHealth - state.displayHealth) * transitionSpeed;
  if (Math.abs(state.displayHealth - currentHealth) < 0.01) {
    state.displayHealth = currentHealth;
  }

  // Check if entity has a shield effect and get custom color
  const shieldEffect = statusEffects?.find(e => e.type === StatusEffectType.SHIELD);
  const hasShield = !!shieldEffect;

  // Get custom shield color from the status effect asset, or use default cyan
  let shieldColor = '#22d3ee'; // Default cyan
  if (shieldEffect?.statusAssetId) {
    const effectAsset = loadStatusEffectAsset(shieldEffect.statusAssetId);
    if (effectAsset?.healthBarColor) {
      shieldColor = effectAsset.healthBarColor;
    }
  }

  // Calculate flash effect intensity (fades over 300ms)
  const flashDuration = 300;
  const timeSinceChange = now - state.changeTime;
  const flashIntensity = state.changeType && timeSinceChange < flashDuration
    ? 1 - (timeSinceChange / flashDuration)
    : 0;

  // Calculate segment width based on max health (accounting for 1px border on each side)
  const innerWidth = barWidth - 2;
  const segmentWidth = innerWidth / maxHealth;

  // Draw health segments inside the border
  for (let i = 0; i < maxHealth; i++) {
    const segX = startX + 1 + i * segmentWidth;
    const segW = segmentWidth;

    // Determine segment color based on display health for smooth transitions
    const isFilled = i < Math.ceil(state.displayHealth);
    const fillAmount = isFilled ? Math.min(1, state.displayHealth - i) : 0;

    if (fillAmount > 0) {
      // Filled health - green or shield color
      ctx.fillStyle = hasShield ? shieldColor : '#4ade80';
      ctx.fillRect(segX, startY + 1, segW, innerHeight);
    } else {
      // Empty segment (lost health) - dark red
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(segX, startY + 1, segW, innerHeight);
    }
  }

  // Draw segment dividers (only if more than 1 HP)
  if (maxHealth > 1) {
    ctx.fillStyle = '#111';
    for (let i = 1; i < maxHealth; i++) {
      const dividerX = startX + 1 + i * segmentWidth;
      ctx.fillRect(dividerX - 0.5, startY + 1, 1, innerHeight);
    }
  }

  // Damage/heal flash overlay
  if (flashIntensity > 0 && state.changeType) {
    ctx.save();
    ctx.globalAlpha = flashIntensity * 0.6;

    if (state.changeType === 'damage') {
      // Red flash for damage
      ctx.fillStyle = '#ff0000';
    } else {
      // Green/white flash for heal
      ctx.fillStyle = '#90ff90';
    }

    ctx.fillRect(startX + 1, startY + 1, innerWidth, innerHeight);
    ctx.restore();
  }

  // Clear flash state after it's done
  if (flashIntensity === 0 && state.changeType) {
    state.changeType = null;
  }
}

const DEAD_VARIANT_TYPES = new Set<StatusEffectType>([
  StatusEffectType.WALL_DEAD,
  StatusEffectType.WALL_BOTH,
  StatusEffectType.HALT_DEAD,
  StatusEffectType.HALT_BOTH,
]);

// Helper to draw status effect icons above health bar
function drawStatusEffectIcons(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  statusEffects: StatusEffectInstance[] | undefined,
  isCorpse?: boolean,
  entityKey?: string,
  now?: number,
  barTopY?: number // Health bar top Y — icons sit directly above it (defaults to the bar's tile-top position)
) {
  if (!statusEffects || statusEffects.length === 0) {
    // Still need to render ghost effects even if no current effects
    if (!entityKey || now === undefined) return;
    const ghosts = getGhostStatusEffects(entityKey, now, []);
    if (ghosts.length === 0) return;
    statusEffects = ghosts;
  }

  const filtered = isCorpse
    ? statusEffects.filter(e => DEAD_VARIANT_TYPES.has(e.type as StatusEffectType))
    : statusEffects.filter(e => {
        const asset = loadStatusEffectAsset(e.statusAssetId);
        return !asset?.hideFromStatusBar;
      });

  // Combine with ghost effects (animating-out removed effects)
  const ghosts = (entityKey && now !== undefined && !isCorpse)
    ? getGhostStatusEffects(entityKey, now, filtered)
    : [];
  const combined = [...filtered, ...ghosts];

  if (combined.length === 0) return;

  const iconSize = 8;
  const iconSpacing = 1;
  const maxIconsVisible = 4;

  // Position: left-aligned, immediately above the health bar (8px icon
  // height, touching the bar) — tracks the bar when it's raised above a
  // taller-than-tile sprite
  const startX = px + (TILE_SIZE - 32) / 2; // Same as health bar start
  const startY = (barTopY ?? getHealthBarTopY(py)) - iconSize;

  const visibleEffects = combined.slice(0, maxIconsVisible);
  const hasOverflow = combined.length > maxIconsVisible;

  visibleEffects.forEach((effect, index) => {
    const iconX = startX + index * (iconSize + iconSpacing);
    const iconY = startY;

    // Scale pop animation when effect is newly applied
    const scale = (entityKey && now !== undefined)
      ? getStatusIconScale(entityKey, effect.statusAssetId, now)
      : 1;

    // Load the status effect asset to get the icon
    const effectAsset = loadStatusEffectAsset(effect.statusAssetId);

    // Try to draw the icon sprite if available
    if (effectAsset?.iconSprite?.spriteData) {
      const spriteData = effectAsset.iconSprite.spriteData;
      const centerX = iconX + iconSize / 2;
      const centerY = iconY + iconSize / 2;

      // Check for URL-based image first (drawSprite only checks imageData, not imageUrl)
      const imgSrc = resolveImageSource(
        spriteData.idleImageData || spriteData.imageData,
        spriteData.idleImageUrl || spriteData.imageUrl
      );
      if (imgSrc) {
        const img = loadImage(imgSrc);
        if (isImageReady(img)) {
          const drawSize = iconSize * (spriteData.size || 0.8);
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 1;
          ctx.translate(centerX, centerY);
          ctx.scale(scale, scale);
          ctx.translate(-centerX, -centerY);
          ctx.drawImage(img, Math.round(centerX - drawSize / 2), Math.round(centerY - drawSize / 2), Math.round(drawSize), Math.round(drawSize));
          ctx.restore();
        }
      } else {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;
        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);
        ctx.translate(-centerX, -centerY);
        drawSprite(ctx, spriteData, centerX, centerY, iconSize);
        ctx.restore();
      }
    } else {
      // Fallback: draw a colored shape based on effect type
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
      ctx.translate(iconX + iconSize / 2, iconY + iconSize / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(iconX + iconSize / 2), -(iconY + iconSize / 2));
      ctx.fillStyle = getDefaultEffectColor(effect.type);
      drawEffectShape(ctx, iconX, iconY, iconSize, 'circle');
      ctx.restore();
    }
  });
}

// Draw a small pink heart above a charmed entity's tile
function drawCharmHeartIcon(ctx: CanvasRenderingContext2D, px: number, py: number) {
  ctx.save();
  ctx.fillStyle = '#f472b6'; // pink-400
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 3;
  ctx.fillText('♥', px + TILE_SIZE / 2, py - 10);
  ctx.restore();
}

// Get default color for status effect type
function getDefaultEffectColor(type: StatusEffectType): string {
  switch (type) {
    case StatusEffectType.POISON:
      return '#22c55e'; // green
    case StatusEffectType.BURN:
      return '#f97316'; // orange
    case StatusEffectType.BLEED:
      return '#dc2626'; // red
    case StatusEffectType.REGEN:
      return '#10b981'; // emerald
    case StatusEffectType.STUN:
      return '#eab308'; // yellow
    case StatusEffectType.SLEEP:
      return '#6366f1'; // indigo
    case StatusEffectType.SLOW:
      return '#3b82f6'; // blue
    case StatusEffectType.SILENCED:
      return '#8b5cf6'; // purple
    case StatusEffectType.DISARMED:
      return '#9ca3af'; // gray
    case StatusEffectType.POLYMORPH:
      return '#ff69b4'; // pink
    case StatusEffectType.STEALTH:
      return '#4a5568'; // gray
    case StatusEffectType.SHIELD:
      return '#22d3ee'; // cyan
    case StatusEffectType.HASTE:
      return '#fbbf24'; // amber
    case StatusEffectType.CHARM:
      return '#e879f9'; // fuchsia
    case StatusEffectType.DISPEL:
      return '#f59e0b'; // amber
    case StatusEffectType.CLEANSE:
      return '#34d399'; // emerald
    default:
      return '#ffffff'; // white
  }
}

// Draw a simple shape for status effect icon
function drawEffectShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  shape: string
) {
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const radius = size / 2 - 1;

  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'square':
      ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
      break;
    case 'diamond':
      ctx.moveTo(centerX, y + 1);
      ctx.lineTo(x + size - 1, centerY);
      ctx.lineTo(centerX, y + size - 1);
      ctx.lineTo(x + 1, centerY);
      ctx.closePath();
      ctx.fill();
      break;
    case 'triangle':
      ctx.moveTo(centerX, y + 1);
      ctx.lineTo(x + size - 1, y + size - 1);
      ctx.lineTo(x + 1, y + size - 1);
      ctx.closePath();
      ctx.fill();
      break;
    case 'star':
      // Simple 4-point star
      ctx.moveTo(centerX, y);
      ctx.lineTo(centerX + 2, centerY - 2);
      ctx.lineTo(x + size, centerY);
      ctx.lineTo(centerX + 2, centerY + 2);
      ctx.lineTo(centerX, y + size);
      ctx.lineTo(centerX - 2, centerY + 2);
      ctx.lineTo(x, centerY);
      ctx.lineTo(centerX - 2, centerY - 2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * i) / 3 - Math.PI / 6;
        const hx = centerX + Math.cos(angle) * radius;
        const hy = centerY + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fill();
      break;
    default:
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
  }
}

// Draw status effect overlay sprites on an entity (e.g., shield bubble for deflect)
function drawStatusEffectOverlays(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  statusEffects: StatusEffectInstance[] | undefined,
  now: number = Date.now()
) {
  if (!statusEffects || statusEffects.length === 0) return;

  // Draw overlays for each status effect that has one
  for (const effect of statusEffects) {
    const effectAsset = loadStatusEffectAsset(effect.statusAssetId);
    if (!effectAsset?.overlaySprite?.spriteData) continue;

    const spriteData = effectAsset.overlaySprite.spriteData;
    const opacity = effectAsset.overlayOpacity ?? 0.5;

    // Save context state
    ctx.save();
    ctx.globalAlpha = opacity;

    // Draw centered on the tile
    const centerX = px + TILE_SIZE / 2;
    const centerY = py + TILE_SIZE / 2;

    // Check if it's a spritesheet with animation
    if (spriteData.idleSpriteSheet || spriteData.spriteSheet) {
      // Use pixel-perfect rendering for animated spritesheets
      drawSpritePixelPerfect(ctx, spriteData, centerX, centerY, TILE_SIZE, undefined, false, now, false);
    } else if (spriteData.imageData || spriteData.idleImageData) {
      // Static image - draw directly
      const imgData = spriteData.imageData || spriteData.idleImageData;
      const img = loadImage(imgData);
      if (isImageReady(img)) {
        ctx.drawImage(
          img,
          px,
          py,
          TILE_SIZE,
          TILE_SIZE
        );
      }
    } else if (spriteData.shape) {
      // Simple shape sprite - draw scaled to tile
      ctx.fillStyle = spriteData.primaryColor || '#ffffff';
      const size = TILE_SIZE * 0.9;
      const offset = (TILE_SIZE - size) / 2;
      drawEffectShape(ctx, px + offset, py + offset, size, spriteData.shape);
    }

    ctx.restore();
  }
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  character: PlacedCharacter,
  x: number,
  y: number,
  isMoving: boolean = false,
  facingOverride?: Direction,
  gameStarted: boolean = true,
  deathAnimState?: DeathAnimationState,
  now: number = Date.now(),
  spawnAnimState?: SpawnAnimationState,
  homingGlowColor?: string,
  entityIndex?: number
) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const facing = facingOverride !== undefined ? facingOverride : character.facing;

  // Honor the entity's facing direction even during setup, so the post-spawn idle
  // points the way the entity will move once the game starts. Falls back to the
  // 'default' directional sprite when that specific direction isn't configured
  // (see directionalSprites[dirKey] || ['default'] in drawSpritePixelPerfect).
  const directionToUse = facing;

  // Determine if character is casting (only if not moving, since moving takes priority).
  // isCasting is a deterministic per-turn flag — true for the whole turn a spell is cast.
  const isCasting = !isMoving && !!character.isCasting;

  // Check if this character has a custom sprite
  const charData = getCharacter(character.characterId) as CustomCharacter | undefined;
  const hasCustomSprite = charData && 'customSprite' in charData && charData.customSprite;

  // Check if spawn animation is still playing
  const isSpawning = spawnAnimState && hasCustomSprite && charData.customSprite &&
    hasSpawnAnimation(charData.customSprite) &&
    isSpawnAnimationPlaying(charData.customSprite, spawnAnimState.startTime);

  // Apply stealth opacity for living characters
  const stealthOpacity = !character.dead ? getStealthOpacity(character) : 1.0;
  const originalAlpha = ctx.globalAlpha;
  if (stealthOpacity < 1.0) {
    ctx.globalAlpha = stealthOpacity;
  }

  if (hasCustomSprite && charData.customSprite) {
    if (!character.dead) {
      // Living character — grounded blob shadow, or the legacy offset
      // silhouette when the blob toggle is off (see blobShadows.ts)
      const blob = blobShadowsEnabled();
      if (blob) {
        drawBlobShadow(ctx, charData.customSprite, directionToUse, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, !!charData.isFloating);
      } else {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
      }

      if (isSpawning && spawnAnimState) {
        // Spawn animation is playing - draw spawn sprite instead of normal sprite
        drawSpawnSpritePixelPerfect(ctx, charData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, spawnAnimState.startTime);
      } else {
        // Normal sprite (idle/moving/casting)
        drawSpritePixelPerfect(ctx, charData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, directionToUse, isMoving, now, isCasting, entityIndex !== undefined ? characterCastStartTimes.get(entityIndex) : undefined);
      }

      if (!blob) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    } else {
      // Dead character - use death sprite (animates then stays on final frame as corpse)
      const hasDeathSprite = hasDeathAnimation(charData.customSprite);

      if (hasDeathSprite) {
        // Death sprite sheet will animate and stop on final frame (corpse state)
        // The death anim now persists while the entity is dead, so its fixed
        // startTime plays the sheet through and holds the final (corpse) frame.
        // `now` only applies for the 1-frame window before the anim registers,
        // where it correctly starts at frame 0 (no last-frame flash).
        const deathStartTime = deathAnimState?.startTime || now;
        if (blobShadowsEnabled()) {
          drawDeathBlobShadow(ctx, charData.customSprite, deathAnimState?.facing || facing, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, deathStartTime, now);
        }
        drawDeathSpritePixelPerfect(
          ctx,
          charData.customSprite,
          px + TILE_SIZE / 2,
          py + TILE_SIZE / 2,
          TILE_SIZE,
          deathAnimState?.facing || facing,
          deathStartTime
        );
      } else {
        // No death sprite - draw dimmed version with X
        if (blobShadowsEnabled()) {
          drawDeathBlobShadow(ctx, charData.customSprite, directionToUse, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, now, now);
        }
        ctx.globalAlpha = 0.3;
        drawSpritePixelPerfect(ctx, charData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, directionToUse, false, now);
        ctx.globalAlpha = 1.0;
        drawDeadX(ctx, px, py);
      }
    }
  } else {
    // Default rendering (no custom sprite)
    if (!character.dead) {
      const blob = blobShadowsEnabled();
      if (blob) {
        drawBlobShadow(ctx, charData?.customSprite, directionToUse, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, !!charData?.isFloating);
      } else {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
      }

      ctx.fillStyle = COLORS.character;
      const size = TILE_SIZE * 0.6;
      const offset = (TILE_SIZE - size) / 2;
      ctx.fillRect(px + offset, py + offset, size, size);

      if (!blob) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    } else {
      // Dead default character - draw dimmed version with X
      if (blobShadowsEnabled()) {
        drawDeathBlobShadow(ctx, charData?.customSprite, directionToUse, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE, now, now);
      }
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = COLORS.character;
      const size = TILE_SIZE * 0.6;
      const offset = (TILE_SIZE - size) / 2;
      ctx.fillRect(px + offset, py + offset, size, size);
      ctx.globalAlpha = 1.0;
      drawDeadX(ctx, px, py);
    }
  }

  // Reset globalAlpha after drawing sprite (before health bar, which should always be visible)
  ctx.globalAlpha = originalAlpha;

  // Charm tint: configurable colour overlay + optional heart icon
  if (!character.dead) {
    const charmEffect = character.statusEffects?.find(e => e.type === StatusEffectType.CHARM);
    if (charmEffect) {
      const charmAsset = loadStatusEffectAsset(charmEffect.statusAssetId);
      const tintEnabled = charmAsset?.charmTintEnabled !== false;
      const tintColor = charmAsset?.charmTintColor ?? '#e879f9';
      const tintOpacity = charmAsset?.charmTintOpacity ?? 0.35;
      const showHeart = charmAsset?.charmShowHeart !== false;
      if (tintEnabled) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = tintOpacity;
        ctx.fillStyle = tintColor;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.restore();
      }
      if (showHeart) drawCharmHeartIcon(ctx, px, py);
    }
  }

  // Draw status effect overlays (e.g., shield bubble) on top of the entity
  const charKey = entityIndex !== undefined ? `c_${entityIndex}` : `c_${character.x}_${character.y}`;
  if (!character.dead) {
    drawStatusEffectOverlays(ctx, px, py, character.statusEffects, now);
    trackStatusIconAnimations(charKey, character.statusEffects, now, gameStarted);
  } else {
    // Show dead-variant trait icons above corpses
    drawStatusEffectIcons(ctx, px, py, character.statusEffects, true, charKey, now);
  }

  if (!character.dead) {
    // Draw health bar above the character
    const maxHealth = charData?.health || character.currentHealth;
    const charSpriteTop = hasCustomSprite ? getSpriteTopY(charData?.customSprite, py) : undefined;
    const barTopY = getHealthBarTopY(py, charSpriteTop);
    drawHealthBar(ctx, px, py, character.currentHealth + (character.pendingVisualDamage ?? 0), maxHealth, entityIndex ?? -1, 'character', character.statusEffects, now, false, charSpriteTop, homingGlowColor);

    // Draw direction indicator next to health bar — green if moving, grey for facing only
    if (charData) {
      const charHasMovement = hasMovementActions(charData.behavior || []);
      drawDirectionIndicator(ctx, px, barTopY, facing, false, charHasMovement);
    }

    // Draw status effect icons above health bar
    drawStatusEffectIcons(ctx, px, py, character.statusEffects, false, charKey, now, barTopY);
  }
}

// Draw direction indicator next to health bar (small arrow showing movement/facing direction)
function drawDirectionIndicator(
  ctx: CanvasRenderingContext2D,
  px: number,
  barTopY: number,
  direction: Direction,
  isBoss: boolean = false,
  isMoving: boolean = true
) {
  const arrowSize = 3; // Small arrow
  const barWidth = 30;
  const bossIconSize = 7;
  const bossIconGap = 2;

  // Calculate position to the right of the health bar
  const totalBarWidth = isBoss ? barWidth + bossIconSize + bossIconGap : barWidth;
  const barStartX = px + (TILE_SIZE - totalBarWidth) / 2 + (isBoss ? bossIconSize + bossIconGap : 0);
  const barEndX = barStartX + barWidth;

  // Position arrow to the right of health bar, vertically centered with it
  const indicatorX = barEndX + 3; // 3px gap from health bar
  const indicatorY = barTopY + HEALTH_BAR_HEIGHT / 2; // Centered with health bar

  // Draw arrow rotated based on direction
  ctx.save();
  ctx.translate(indicatorX, indicatorY);

  // Rotate based on direction (0 = East/right, rotating clockwise)
  const rotationAngles: Record<Direction, number> = {
    [Direction.EAST]: 0,
    [Direction.SOUTHEAST]: Math.PI / 4,
    [Direction.SOUTH]: Math.PI / 2,
    [Direction.SOUTHWEST]: (3 * Math.PI) / 4,
    [Direction.WEST]: Math.PI,
    [Direction.NORTHWEST]: (-3 * Math.PI) / 4,
    [Direction.NORTH]: -Math.PI / 2,
    [Direction.NORTHEAST]: -Math.PI / 4,
  };

  ctx.rotate(rotationAngles[direction] || 0);

  // Draw a simple arrow pointing right (will be rotated)
  // Green for moving entities, grey for facing-only entities
  ctx.fillStyle = isMoving ? 'rgba(255, 200, 50, 0.95)' : 'rgba(180, 180, 180, 0.7)';
  ctx.beginPath();
  // Arrow shape: triangle pointing right
  const baseHalfWidth = arrowSize / 2 + 0.5; // Make base 1px wider
  ctx.moveTo(arrowSize, 0); // Tip
  ctx.lineTo(-arrowSize / 2, -baseHalfWidth); // Top left
  ctx.lineTo(-arrowSize / 2, baseHalfWidth); // Bottom left
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawCollectible(
  ctx: CanvasRenderingContext2D,
  collectible: { x: number; y: number; collectibleId?: string; type?: 'coin' | 'gem'; spawnTime?: number; despawning?: boolean; despawnTime?: number },
  imageCache: Map<string, HTMLImageElement>,
  now: number
) {
  const { x, y, collectibleId, type } = collectible;
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  // Calculate scale for spawn/despawn animations
  let animScale = 1;

  // Scale-up animation (item just spawned from throw/place spell)
  if (collectible.spawnTime !== undefined) {
    const elapsed = now - collectible.spawnTime;
    if (elapsed < ITEM_SPAWN_DURATION) {
      const t = elapsed / ITEM_SPAWN_DURATION;
      // easeOutBack: overshoot slightly then settle
      const c1 = 1.70158;
      const c3 = c1 + 1;
      animScale = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
  }

  // Scale-down animation (item despawning due to duration expiry)
  if (collectible.despawning && collectible.despawnTime !== undefined) {
    const elapsed = now - collectible.despawnTime;
    if (elapsed >= ITEM_DESPAWN_DURATION) {
      return; // Animation complete, don't draw
    }
    const t = elapsed / ITEM_DESPAWN_DURATION;
    // easeInBack: accelerate into disappearance
    const c1 = 1.70158;
    const c3 = c1 + 1;
    animScale = 1 - (c3 * t * t * t - c1 * t * t);
    if (animScale <= 0) return;
  }

  // Calculate bobbing offset - gentle up/down animation like items dropped on the ground
  // All items bob in sync (no position-based phase offset)
  const bobSpeed = 1; // Cycles per second
  const bobAmount = TILE_SIZE * 0.06; // 6% of tile size
  const bobOffset = Math.sin((now / 1000) * bobSpeed * Math.PI * 2) * bobAmount;

  // Apply scale transform if animating
  const needsScale = animScale !== 1;
  if (needsScale) {
    const centerX = px + TILE_SIZE / 2;
    const centerY = py + TILE_SIZE / 2;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(animScale, animScale);
    ctx.translate(-centerX, -centerY);
  }

  // Try to load custom collectible data
  const collectibleData = collectibleId ? loadCollectible(collectibleId) : null;

  // If we have custom collectible data with a sprite, draw it
  if (collectibleData?.customSprite) {
    // Calculate center position based on anchor point, with bobbing
    const centerX = px + TILE_SIZE / 2;
    let centerY = py + TILE_SIZE / 2 + bobOffset;

    if (collectibleData.anchorPoint === 'bottom_center') {
      const spriteHeight = getSpriteDrawHeight(collectibleData.customSprite, TILE_SIZE);
      centerY = py + TILE_SIZE / 2 - spriteHeight / 2 + bobOffset;
    }

    // Draw the sprite (pixel-perfect in physical pixel space) with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    drawSpritePixelPerfect(ctx, collectibleData.customSprite, centerX, centerY, TILE_SIZE);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    if (needsScale) ctx.restore();
    return;
  }

  // Legacy fallback: draw based on type (with bobbing)
  if (type === 'gem') {
    // Draw a diamond shape for gems
    ctx.fillStyle = '#9333ea'; // Purple
    ctx.beginPath();
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2 + bobOffset;
    const size = TILE_SIZE / 3;
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size, cy);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size, cy);
    ctx.closePath();
    ctx.fill();
    if (needsScale) ctx.restore();
    return;
  }

  // Default: draw a star shape (original behavior for coins and unknown types, with bobbing)
  ctx.fillStyle = COLORS.collectible;
  ctx.beginPath();
  const cx = px + TILE_SIZE / 2;
  const cy = py + TILE_SIZE / 2 + bobOffset;
  const spikes = 5;
  const outerRadius = TILE_SIZE / 4;
  const innerRadius = TILE_SIZE / 8;

  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const starX = cx + Math.cos(angle) * radius;
    const starY = cy + Math.sin(angle) * radius;

    if (i === 0) {
      ctx.moveTo(starX, starY);
    } else {
      ctx.lineTo(starX, starY);
    }
  }

  ctx.closePath();
  ctx.fill();
  if (needsScale) ctx.restore();
}

function drawPlacedObject(ctx: CanvasRenderingContext2D, objectId: string, x: number, y: number) {
  const objectData = loadObject(objectId);
  if (!objectData) return;

  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  const scale = objectData.scale ?? 1;
  const offsetX = (objectData.offsetX ?? 0) * TILE_SIZE;
  const offsetY = (objectData.offsetY ?? 0) * TILE_SIZE;
  const renderTileSize = TILE_SIZE * scale;

  // Calculate center position based on anchor point, then apply offsets.
  let centerX = px + TILE_SIZE / 2;
  let centerY = py + TILE_SIZE / 2;

  if (objectData.anchorPoint === 'bottom_center' && objectData.customSprite) {
    // For bottom_center: sprite's bottom edge aligns with tile's center
    // So sprite center is offset upward by half the sprite height
    const spriteHeight = getSpriteDrawHeight(objectData.customSprite, renderTileSize);
    centerY = py + TILE_SIZE / 2 - spriteHeight / 2;
  }

  centerX += offsetX;
  centerY += offsetY;

  // Draw custom sprite if available
  if (objectData.customSprite) {
    drawSpritePixelPerfect(ctx, objectData.customSprite, centerX, centerY, renderTileSize);
  } else {
    // Fallback: draw a simple brown square (scaled, centered, with offsets applied)
    const fallback = (TILE_SIZE / 2) * scale;
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(centerX - fallback / 2, centerY - fallback / 2, fallback, fallback);
  }
}

// ==========================================
// PROJECTILE & PARTICLE RENDERING (Phase 2c)
// ==========================================

/**
 * Draw a shape or image with given parameters
 */
function drawShape(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  shape: string,
  color: string,
  size: number,
  imageData?: string,
  _imageCache?: Map<string, HTMLImageElement>,  // Unused, kept for backwards compatibility
  rotationConfig?: { rotation: number; mirror: boolean }
) {
  ctx.save();

  // If there's an image, draw it instead of a shape
  if (imageData) {
    // Use centralized image loader with load notifications
    const img = loadImage(imageData);

    // Draw the image (browser handles GIF animation automatically)
    // Use try-catch to handle cases where image isn't loaded yet
    try {
      if (img && img.complete && img.naturalWidth > 0) {
        const imgSize = size * 3; // Make image larger

        // Apply rotation and mirroring if specified
        if (rotationConfig) {
          // Move to center point
          ctx.translate(px, py);

          // Apply rotation (convert degrees to radians)
          ctx.rotate((rotationConfig.rotation * Math.PI) / 180);

          // Apply mirroring
          if (rotationConfig.mirror) {
            ctx.scale(-1, 1);
          }

          // Draw centered at origin
          const s = Math.round(imgSize);
          ctx.drawImage(img, Math.round(-s / 2), Math.round(-s / 2), s, s);
        } else {
          // No rotation - draw normally
          const s = Math.round(imgSize);
          ctx.drawImage(img, Math.round(px - s / 2), Math.round(py - s / 2), s, s);
        }
      }
    } catch (e) {
      // Image not ready yet, will draw on next frame
    }
    ctx.restore();
    return;
  }

  // Otherwise draw the shape (existing code)
  // Outer glow
  ctx.fillStyle = color + '40'; // Add transparency for glow
  ctx.beginPath();

  switch (shape) {
    case 'circle':
      ctx.arc(px, py, size * 1.5, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(px - size * 1.5, py - size * 1.5, size * 3, size * 3);
      break;
    case 'triangle':
      ctx.moveTo(px, py - size * 1.5);
      ctx.lineTo(px - size * 1.3, py + size * 1.5);
      ctx.lineTo(px + size * 1.3, py + size * 1.5);
      ctx.closePath();
      break;
    case 'star':
      drawStar(ctx, px, py, 5, size * 1.5, size * 0.7);
      break;
    case 'diamond':
      ctx.moveTo(px, py - size * 1.5);
      ctx.lineTo(px + size * 1.5, py);
      ctx.lineTo(px, py + size * 1.5);
      ctx.lineTo(px - size * 1.5, py);
      ctx.closePath();
      break;
    case 'hexagon': {
      const hexR = size * 1.5;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * i) / 3 - Math.PI / 6;
        const hx = px + Math.cos(angle) * hexR;
        const hy = py + Math.sin(angle) * hexR;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      break;
    }
  }

  ctx.fill();

  // Inner core
  ctx.fillStyle = color;
  ctx.beginPath();

  switch (shape) {
    case 'circle':
      ctx.arc(px, py, size * 0.7, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(px - size * 0.7, py - size * 0.7, size * 1.4, size * 1.4);
      break;
    case 'triangle':
      ctx.moveTo(px, py - size * 0.7);
      ctx.lineTo(px - size * 0.6, py + size * 0.7);
      ctx.lineTo(px + size * 0.6, py + size * 0.7);
      ctx.closePath();
      break;
    case 'star':
      drawStar(ctx, px, py, 5, size * 0.7, size * 0.35);
      break;
    case 'diamond':
      ctx.moveTo(px, py - size * 0.7);
      ctx.lineTo(px + size * 0.7, py);
      ctx.lineTo(px, py + size * 0.7);
      ctx.lineTo(px - size * 0.7, py);
      ctx.closePath();
      break;
    case 'hexagon': {
      const hexR = size * 0.7;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * i) / 3 - Math.PI / 6;
        const hx = px + Math.cos(angle) * hexR;
        const hy = py + Math.sin(angle) * hexR;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      break;
    }
  }

  ctx.fill();
  ctx.restore();
}

/**
 * Draw a star shape
 */
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.moveTo(cx, cy - outerRadius);

  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }

  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
}

/**
 * Draw a projectile - uses fractional coordinates for smooth movement
 * Supports: basic shapes, static images/GIFs, and animated sprite sheets
 */
function drawProjectile(
  ctx: CanvasRenderingContext2D,
  projectile: Projectile,
  imageCache: Map<string, HTMLImageElement>,
  now: number,
  visualState: Map<string, ProjectileVisualState>,
  replayFrozen: boolean = false,
  currentTurn: number = 0,
) {
  if (!projectile.active) return;

  // Phase C-2: visual position lives in the side-table. Fall back to logical
  // in two cases:
  //   1. vs hasn't been seeded yet (first draw before updateProjectiles runs).
  //   2. vs is stale — its lastUpdateTurn doesn't match the current turn.
  //      This happens after a replay seek / step where the turn changed but
  //      updateProjectiles hasn't run yet to refresh vs for the new turn.
  //
  // When paused mid-flight (replayFrozen=true but turn unchanged), vs IS
  // fresh — it holds the last animated frame's fractional position. Prefer
  // it so paused replay shows the bolt at its true mid-flight location
  // instead of snapping to the turn-end logical position.
  const vs = visualState.get(projectile.id);
  const vsFresh = !!vs && (vs.lastUpdateTurn === undefined || vs.lastUpdateTurn === currentTurn);
  const useLogical = !vs || (replayFrozen && !vsFresh);
  const visualX = useLogical ? projectile.logicalX : vs!.x;
  const visualY = useLogical ? projectile.logicalY : vs!.y;

  // Convert tile coordinates to pixel coordinates (fractional for smooth movement)
  const px = visualX * TILE_SIZE + TILE_SIZE / 2;
  const py = visualY * TILE_SIZE + TILE_SIZE / 2;

  // Calculate rotation and mirroring based on direction
  const rotationConfig = getRotationForDirection(projectile.direction);

  // Get projectile scale factor
  let scale = projectile.attackData.projectileScale ?? 1;

  // Shrink-to-nothing animation for projectiles that will fizzle without
  // landing on a target. Front-loaded into the final DESPAWN_SHRINK_MS of
  // travel so the sprite is already at scale 0 when the consume fires —
  // no extra wall-clock lingering past normal flight duration. Two paths
  // feed into the same shrink math via a shared `consumeAtMs`:
  //   1. Engine-signalled: `hitResult.deactivate` with no hit VFX / no
  //      deferred death / no item placement. Covers non-homing bolts that
  //      hit a wall, run out of range, or exit bounds.
  //   2. Predicted: homing bolt whose cumulative `pathTraveled` has used
  //      up its `range` budget — next turn's `resolveProjectiles` will
  //      decide OUT OF RANGE and consume instantly (no travel window on
  //      that turn to shrink into). So we shrink during THIS turn's
  //      final approach instead. Thresholds match the engine's fizzle
  //      check (`remaining < 0.5`, or `< 1` for pathfinding which can't
  //      advance fractionally).
  let consumeAtMs: number | null = null;
  // Match updateTileBasedVisual's per-tile pacing: homing paces the whole
  // tilePath over 800ms (one turn); non-homing uses per-tile speed.
  const tileTransitMs = projectile.isHoming && projectile.tilePath && projectile.tilePath.length > 1
    ? 800 / (projectile.tilePath.length - 1)
    : 800 / (projectile.speed || 4);
  const anchorMs = projectile.tileEntryTime ?? projectile.startTime ?? now;

  // Target-lost lingering takes priority when set. Approach-shrink never
  // ran for these (bolt had no travel window between hitResult-set and
  // consume), so we simulate the same shrink curve starting at
  // despawnStartTime. Shorter duration (TARGET_LOST_LINGER_MS) to
  // minimize the wall-clock extension for this already-exceptional case.
  if (projectile.despawning && projectile.despawnStartTime !== undefined) {
    const elapsed = now - projectile.despawnStartTime;
    const progress = Math.min(1, Math.max(0, elapsed / TARGET_LOST_LINGER_MS));
    const shrinkFactor = 1 - (progress * progress * progress);
    if (shrinkFactor <= 0.01) return;
    scale *= shrinkFactor;
  } else if (
    projectile.hitResult?.deactivate &&
    !projectile.hitResult.vfxSprite &&
    !projectile.hitResult.deferredDeathEntityId &&
    !projectile.hitResult.placeCollectibleConfig
  ) {
    // Engine-signalled clean deactivate (wall hit mid-flight, etc.).
    consumeAtMs = anchorMs + projectile.hitResult.hitTileIndex * tileTransitMs;
  } else if (!projectile.hitResult && projectile.tilePath && projectile.tilePath.length > 0) {
    // Predictive: bolt is approaching its tilePath endpoint with no hit
    // signal from the engine yet. Two sub-cases gated differently:
    //   - Homing: the engine rebuilds tilePath each turn, so the endpoint
    //     only represents "this turn's target tile," not the fizzle point.
    //     Gate on the actual range threshold the engine uses
    //     (`remaining < 0.5`, or `< 1` for pathfinding) so we only
    //     shrink when the NEXT turn's `resolveProjectiles` will decide
    //     OUT OF RANGE and consume instantly (no travel window on that
    //     turn to shrink into).
    //   - Non-homing: tilePath is the full spawn-clamped flight — it
    //     already ends at the last in-bounds, pre-wall, within-range
    //     tile. Reaching the endpoint always precedes a fizzle; if a
    //     target were there, this turn's walker would have set
    //     hitResult with vfxSprite already. So fire unconditionally.
    let willFizzle = false;
    if (projectile.isHoming) {
      if (
        projectile.attackData.range !== undefined &&
        projectile.pathTraveled !== undefined
      ) {
        const remaining = projectile.attackData.range - projectile.pathTraveled;
        willFizzle =
          remaining < 0.5 ||
          (projectile.homingPathStyle === 'pathfinding' && remaining < 1);
      }
    } else {
      willFizzle = true;
    }
    if (willFizzle) {
      const endpointTileIdx = projectile.tilePath.length - 1;
      consumeAtMs = anchorMs + endpointTileIdx * tileTransitMs;
    }
  }

  if (consumeAtMs !== null) {
    const timeUntilConsume = consumeAtMs - now;
    if (timeUntilConsume <= DESPAWN_SHRINK_MS) {
      const progress = Math.min(1, Math.max(0, 1 - timeUntilConsume / DESPAWN_SHRINK_MS));
      // Ease-in cubic — stays near full size briefly, then accelerates down.
      const shrinkFactor = 1 - (progress * progress * progress);
      if (shrinkFactor <= 0.01) return;
      scale *= shrinkFactor;
    }
  }

  // Ground shadow under the bolt (uses final scale so it shrinks with the
  // despawn animation) — drawn first so every sprite branch renders above it
  if (blobShadowsEnabled()) {
    drawProjectileBlobShadow(ctx, px, py, TILE_SIZE, scale);
  }

  // Check if the visual has passed the reflect point (tint only applies after reflect)
  const pastReflectPoint = projectile.reflected && !!visualState.get(projectile.id)?.visualPastReflectPoint;

  // If reflected with an override sprite, use that instead of the original
  if (pastReflectPoint && projectile.reflectOverrideSprite?.spriteData) {
    const overrideData = projectile.reflectOverrideSprite.spriteData;
    if (overrideData.spriteSheet) {
      drawSpellSpriteSheet(ctx, overrideData.spriteSheet, px, py, Math.round(24 * scale), imageCache, now, rotationConfig);
    } else {
      const shape = overrideData.shape || 'circle';
      const color = overrideData.primaryColor || '#ff6600';
      drawShape(ctx, px, py, shape, color, Math.round(8 * scale), overrideData.idleImageData, imageCache, rotationConfig);
    }
    return;
  }

  // Check if projectile has custom sprite
  if (projectile.attackData.projectileSprite?.spriteData) {
    const spriteData = projectile.attackData.projectileSprite.spriteData;

    // Check for sprite sheet first (highest priority)
    if (spriteData.spriteSheet) {
      const spriteSize = Math.round(24 * scale); // Size for projectile sprite sheets
      drawSpellSpriteSheet(
        ctx,
        spriteData.spriteSheet,
        px,
        py,
        spriteSize,
        imageCache,
        now,
        rotationConfig
      );
      // Apply tint overlay for reflected projectiles (over sprite sheet)
      if (pastReflectPoint && projectile.reflectTintColor) {
        const tintHalf = Math.round(12 * scale);
        const tintSize = Math.round(24 * scale);
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = projectile.reflectTintColor;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(px - tintHalf, py - tintHalf, tintSize, tintSize);
        ctx.restore();
      }
      return;
    }

    // Fall back to static image or shape
    const shape = spriteData.shape || 'circle';
    const color = pastReflectPoint && projectile.reflectTintColor
      ? projectile.reflectTintColor  // Use tint color as primary color for reflected projectiles
      : spriteData.primaryColor || '#ff6600';
    const imageData = spriteData.idleImageData;

    drawShape(ctx, px, py, shape, color, Math.round(8 * scale), imageData, imageCache, rotationConfig);

    // Apply tint overlay for reflected projectiles with images
    if (pastReflectPoint && projectile.reflectTintColor && imageData) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = projectile.reflectTintColor;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(px, py, Math.round(8 * scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else {
    // Default projectile rendering — use tint color if reflected
    if (pastReflectPoint && projectile.reflectTintColor) {
      ctx.save();
      // Outer glow with tint
      ctx.fillStyle = projectile.reflectTintColor + '4D'; // 30% opacity
      ctx.beginPath();
      ctx.arc(px, py, Math.round(8 * scale), 0, Math.PI * 2);
      ctx.fill();
      // Inner core with tint
      ctx.fillStyle = projectile.reflectTintColor;
      ctx.beginPath();
      ctx.arc(px, py, Math.round(4 * scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      drawDefaultProjectile(ctx, px, py, scale);
    }
  }
}

/**
 * Get rotation/mirror config for a direction
 * Base image points East (left-to-right →)
 */
function getRotationForDirection(direction: Direction): { rotation: number; mirror: boolean } {
  switch (direction) {
    case Direction.EAST:
      return { rotation: 0, mirror: false };
    case Direction.NORTHEAST:
      return { rotation: 45, mirror: false };
    case Direction.NORTH:
      return { rotation: 90, mirror: false };
    case Direction.NORTHWEST:
      return { rotation: 45, mirror: true };
    case Direction.WEST:
      return { rotation: 0, mirror: true };
    case Direction.SOUTHWEST:
      return { rotation: -45, mirror: true };
    case Direction.SOUTH:
      return { rotation: -90, mirror: false };
    case Direction.SOUTHEAST:
      return { rotation: -45, mirror: false };
    default:
      return { rotation: 0, mirror: false };
  }
}

/**
 * Draw default projectile (simple colored circle/arrow)
 */
function drawDefaultProjectile(ctx: CanvasRenderingContext2D, px: number, py: number, scale: number = 1) {
  // Draw glowing projectile
  ctx.save();

  // Outer glow
  ctx.fillStyle = 'rgba(255, 200, 100, 0.3)';
  ctx.beginPath();
  ctx.arc(px, py, 8 * scale, 0, Math.PI * 2);
  ctx.fill();

  // Inner core
  ctx.fillStyle = '#ffaa00';
  ctx.beginPath();
  ctx.arc(px, py, 4 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a particle effect with fade-out
 * Supports: basic shapes, static images/GIFs, and animated sprite sheets
 * For melee attacks and directional effects, applies rotation based on particle.rotation
 *
 * Spritesheet behavior:
 * - Non-looping spritesheets play once and hold on final frame until duration expires
 * - No fade-out is applied to spritesheets (they just disappear when done)
 */
function drawParticle(ctx: CanvasRenderingContext2D, particle: ParticleEffect, now: number, imageCache: Map<string, HTMLImageElement>) {
  const elapsed = now - particle.startTime;
  if (elapsed >= particle.duration) return;

  const px = particle.x * TILE_SIZE + TILE_SIZE / 2;
  const py = particle.y * TILE_SIZE + TILE_SIZE / 2;

  // Check if particle has custom sprite
  if (particle.sprite?.spriteData) {
    const spriteData = particle.sprite.spriteData;

    // Get rotation config if particle has a direction (for melee attack sprites)
    // The rotation field stores the Direction enum value
    let rotationConfig: { rotation: number; mirror: boolean } | undefined;
    if (particle.rotation !== undefined) {
      rotationConfig = getRotationForDirection(particle.rotation);
    }

    // Check for sprite sheet first (highest priority)
    if (spriteData.spriteSheet) {
      const spriteSheet = spriteData.spriteSheet;

      // For non-looping spritesheets, check if animation is complete
      // If so, don't draw anything (particle will be cleaned up by duration)
      if (spriteSheet.loop === false) {
        const animationDuration = (spriteSheet.frameCount / spriteSheet.frameRate) * 1000;
        if (elapsed >= animationDuration) {
          // Animation complete - don't draw, let particle expire
          return;
        }
      }

      ctx.save();
      // No fade-out for spritesheets - they just play and disappear
      ctx.globalAlpha = 1.0;

      const spriteSize = 32; // Size for particle sprite sheets
      drawSpellSpriteSheetFromStartTime(
        ctx,
        spriteSheet,
        px,
        py,
        spriteSize,
        imageCache,
        particle.startTime,
        now,
        rotationConfig
      );
      ctx.restore();
      return;
    }

    // Calculate fade-out alpha for non-spritesheet sprites
    const progress = elapsed / particle.duration;
    const alpha = particle.alpha || (1 - progress); // Fade out over time

    ctx.save();
    ctx.globalAlpha = alpha;

    // Fall back to static image or shape
    const shape = spriteData.shape || 'circle';
    const color = spriteData.primaryColor || '#ffff00';
    const imageData = spriteData.idleImageData;

    // Draw expanding effect for shapes, static size for images
    const radius = imageData ? 12 : (4 + progress * 20);
    drawShape(ctx, px, py, shape, color, radius, imageData, imageCache, rotationConfig);

    // Inner flash (only for non-image sprites)
    if (!imageData && progress < 0.3) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 8 * (1 - progress / 0.3), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  } else {
    // Default particle with fade-out
    const progress = elapsed / particle.duration;
    const alpha = particle.alpha || (1 - progress);

    ctx.save();
    ctx.globalAlpha = alpha;
    drawDefaultParticle(ctx, px, py, progress);
    ctx.restore();
  }
}

/**
 * Draw default particle effect (expanding ring)
 */
function drawDefaultParticle(ctx: CanvasRenderingContext2D, px: number, py: number, progress: number) {
  // Expanding ring effect
  const radius = 4 + progress * 20; // Expands from 4 to 24 pixels

  ctx.strokeStyle = '#ffff00';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner flash
  if (progress < 0.3) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 8 * (1 - progress / 0.3), 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw a persistent area effect (ground effect that lasts multiple turns)
 * The effect is drawn on each tile within the radius
 * Supports looping animated sprite sheets
 */
function drawPersistentAreaEffect(
  ctx: CanvasRenderingContext2D,
  effect: PersistentAreaEffect,
  now: number,
  imageCache: Map<string, HTMLImageElement>,
  puzzle: Puzzle
) {
  // If no visual sprite, draw a simple ground overlay
  if (!effect.visualSprite?.spriteData) {
    // Draw a subtle ground effect on each tile
    for (let dx = -effect.radius; dx <= effect.radius; dx++) {
      for (let dy = -effect.radius; dy <= effect.radius; dy++) {
        // Check circular distance
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > effect.radius) continue;

        // Skip center if excludeCenter is true
        if (effect.excludeCenter && dx === 0 && dy === 0) continue;

        const tileX = effect.x + dx;
        const tileY = effect.y + dy;

        // Check bounds
        if (tileY < 0 || tileY >= puzzle.tiles.length) continue;
        if (tileX < 0 || tileX >= puzzle.tiles[tileY].length) continue;

        // Check if tile exists (non-null) and is walkable
        const tile = puzzle.tiles[tileY][tileX];
        if (!tile || tile.type === TileType.WALL) continue;

        // Draw default pulsing ground effect
        const px = tileX * TILE_SIZE + TILE_SIZE / 2;
        const py = tileY * TILE_SIZE + TILE_SIZE / 2;

        ctx.save();
        // Pulsing alpha effect
        const pulsePhase = (now % 1500) / 1500;
        const alpha = 0.2 + 0.15 * Math.sin(pulsePhase * Math.PI * 2);
        ctx.globalAlpha = alpha;

        // Draw colored circle indicating damage zone
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(px, py, TILE_SIZE * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }
    return;
  }

  // Draw custom visual sprite on each tile
  const spriteData = effect.visualSprite.spriteData;
  const shouldLoop = effect.loopAnimation !== false; // Default true

  for (let dx = -effect.radius; dx <= effect.radius; dx++) {
    for (let dy = -effect.radius; dy <= effect.radius; dy++) {
      // Check circular distance
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > effect.radius) continue;

      // Skip center if excludeCenter is true
      if (effect.excludeCenter && dx === 0 && dy === 0) continue;

      const tileX = effect.x + dx;
      const tileY = effect.y + dy;

      // Check bounds
      if (tileY < 0 || tileY >= puzzle.tiles.length) continue;
      if (tileX < 0 || tileX >= puzzle.tiles[tileY].length) continue;

      // Check if tile exists (non-null) and is walkable
      const tile = puzzle.tiles[tileY][tileX];
      if (!tile || tile.type === TileType.WALL) continue;

      // Calculate pixel position (center of tile)
      const px = tileX * TILE_SIZE + TILE_SIZE / 2;
      const py = tileY * TILE_SIZE + TILE_SIZE / 2;

      ctx.save();

      // Check for sprite sheet
      if (spriteData.spriteSheet) {
        const spriteSheet = spriteData.spriteSheet;

        // Create a modified spritesheet config with loop override
        const effectiveSpriteSheet = shouldLoop
          ? { ...spriteSheet, loop: true }
          : spriteSheet;

        // Use a consistent start time based on effect creation
        // We use now as start time since we don't track creation time
        // This means all tiles animate in sync
        const spriteSize = TILE_SIZE * 0.9;
        drawSpellSpriteSheetFromStartTime(
          ctx,
          effectiveSpriteSheet,
          px,
          py,
          spriteSize,
          imageCache,
          0, // Start from time 0 for consistent looping
          now,
          undefined
        );
      } else {
        // Fall back to static image or shape
        const shape = spriteData.shape || 'circle';
        const color = spriteData.primaryColor || '#ff4444';
        const imageData = spriteData.idleImageData || spriteData.imageData;
        const size = TILE_SIZE * 0.4;

        drawShape(ctx, px, py, shape, color, size, imageData, imageCache);
      }

      ctx.restore();
    }
  }
}

// ==========================================
// VIGNETTE EFFECT
// ==========================================

/**
 * Draw a vignette effect on the border walls and playable tiles.
 * This darkens the border walls where they meet the dark background,
 * creating a smooth blend that makes the puzzle appear to emerge from darkness.
 *
 * For puzzles with void tiles:
 * - Edge vignettes are only applied to wall segments that exist (using smart border data)
 * - Inner vignette is clipped to only affect playable tiles
 * - Void areas remain completely transparent (showing page background)
 *
 * Uses 'source-atop' composite mode to only affect existing pixels,
 * preventing darkening of transparent areas in wall sprites.
 */
// Seeded value-noise mist texture for the fog effect — generated once,
// reused every frame. Two octaves of soft blobs; alpha-only black so drawing
// it darkens the board irregularly (no circular silhouettes). Seeding uses
// the same sin-hash as the dust particles: deterministic, no Math.random.
let fogNoiseTexture: HTMLCanvasElement | null = null;
const FOG_NOISE_SIZE = 256;
function getFogNoiseTexture(): HTMLCanvasElement {
  if (fogNoiseTexture) return fogNoiseTexture;
  const tex = document.createElement('canvas');
  tex.width = FOG_NOISE_SIZE;
  tex.height = FOG_NOISE_SIZE;
  const tctx = tex.getContext('2d')!;
  tctx.imageSmoothingEnabled = true;
  const drawOctave = (cells: number, seedBase: number, alpha: number) => {
    const c = document.createElement('canvas');
    c.width = cells;
    c.height = cells;
    const cctx = c.getContext('2d')!;
    const img = cctx.createImageData(cells, cells);
    for (let i = 0; i < cells * cells; i++) {
      const s = Math.sin((i + seedBase) * 12.9898) * 43758.5453;
      const v = s - Math.floor(s);
      // v² biases toward clear air so dark wisps stay sparse
      img.data[i * 4 + 3] = Math.round(v * v * 255);
    }
    cctx.putImageData(img, 0, 0);
    tctx.globalAlpha = alpha;
    // Upscaling the coarse grid with smoothing turns cells into soft blobs
    tctx.drawImage(c, 0, 0, cells, cells, 0, 0, FOG_NOISE_SIZE, FOG_NOISE_SIZE);
  };
  drawOctave(6, 7, 0.75);   // large wisps
  drawOctave(13, 131, 0.45); // finer variation on top
  tctx.globalAlpha = 1;
  fogNoiseTexture = tex;
  return tex;
}

function drawPuzzleVignette(
  ctx: CanvasRenderingContext2D,
  tiles: (import('../../types/game').TileOrNull)[][],
  gridWidth: number,
  gridHeight: number,
  offsetX: number,
  offsetY: number,
  timestamp: number = 0
) {
  // Edge shadow depths proportional to border thickness for consistent appearance
  const shadowOpacity = 0.6; // Maximum darkness at outer edges
  const verticalShadowDepth = BORDER_SIZE * 0.6; // For top/bottom walls (48 * 0.6 = ~29px)
  const horizontalShadowDepth = SIDE_BORDER_SIZE * 1.2; // For left/right walls (16 * 1.2 = ~19px)

  ctx.save();

  // Use 'source-atop' composite mode - this only draws on existing non-transparent pixels
  // This prevents darkening of transparent areas in wall sprites
  ctx.globalCompositeOperation = 'source-atop';

  // Calculate the total canvas area including borders
  const totalWidth = gridWidth * TILE_SIZE + (SIDE_BORDER_SIZE * 2);
  const totalHeight = gridHeight * TILE_SIZE + (BORDER_SIZE * 2);

  // SIMPLE APPROACH: Apply the same bounding-box edge shadows for ALL puzzles.
  // The source-atop composite mode ensures shadows only affect non-transparent pixels,
  // so void areas naturally stay unaffected. Interior walls touching void get darkened
  // from the bounding box edges, which creates the right visual effect.
  //
  // This is much simpler than trying to compute per-edge shadows and handles all shapes.
  {
    // Regular rectangular puzzle - apply edge shadows to full borders

    // Top edge shadow
    const topGradient = ctx.createLinearGradient(0, 0, 0, verticalShadowDepth);
    topGradient.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
    topGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, 0, totalWidth, verticalShadowDepth);

    // Bottom edge shadow
    const bottomGradient = ctx.createLinearGradient(0, totalHeight, 0, totalHeight - verticalShadowDepth);
    bottomGradient.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
    bottomGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(0, totalHeight - verticalShadowDepth, totalWidth, verticalShadowDepth);

    // Left edge shadow
    const leftGradient = ctx.createLinearGradient(0, 0, horizontalShadowDepth, 0);
    leftGradient.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
    leftGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = leftGradient;
    ctx.fillRect(0, 0, horizontalShadowDepth, totalHeight);

    // Right edge shadow
    const rightGradient = ctx.createLinearGradient(totalWidth, 0, totalWidth - horizontalShadowDepth, 0);
    rightGradient.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
    rightGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = rightGradient;
    ctx.fillRect(totalWidth - horizontalShadowDepth, 0, horizontalShadowDepth, totalHeight);
  }

  // ==========================================
  // INNER TILE VIGNETTE (subtle radial darkening on game area)
  // Only applies to playable tiles, not void tiles
  // ==========================================
  const innerVignetteOpacity = 0.4; // Moderate effect on tiles

  // Calculate the game area bounds (inside the border)
  const gameAreaX = offsetX;
  const gameAreaY = offsetY;
  const gameAreaWidth = gridWidth * TILE_SIZE;
  const gameAreaHeight = gridHeight * TILE_SIZE;

  // Create a radial gradient centered on the game area
  const centerX = gameAreaX + gameAreaWidth / 2;
  const centerY = gameAreaY + gameAreaHeight / 2;
  const maxRadius = Math.sqrt(gameAreaWidth * gameAreaWidth + gameAreaHeight * gameAreaHeight) / 2;

  const innerGradient = ctx.createRadialGradient(
    centerX, centerY, maxRadius * 0.4, // Inner radius (transparent zone)
    centerX, centerY, maxRadius         // Outer radius (dark edges)
  );
  innerGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  innerGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
  innerGradient.addColorStop(1, `rgba(0, 0, 0, ${innerVignetteOpacity})`);

  // Check if we have void tiles for inner vignette clipping
  const hasVoidTiles = hasIrregularShape(tiles, gridWidth, gridHeight);

  if (hasVoidTiles) {
    // For irregular shapes, clip the inner vignette to only playable tiles
    ctx.save();
    ctx.beginPath();
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        if (tiles[y]?.[x] !== null) {
          const px = gameAreaX + x * TILE_SIZE;
          const py = gameAreaY + y * TILE_SIZE;
          ctx.rect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }
    ctx.clip();

    ctx.fillStyle = innerGradient;
    ctx.fillRect(gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
    ctx.restore();
  } else {
    // No void tiles - apply vignette to entire game area
    ctx.fillStyle = innerGradient;
    ctx.fillRect(gameAreaX, gameAreaY, gameAreaWidth, gameAreaHeight);
  }

  // ==========================================
  // ATMOSPHERIC EFFECTS (fog and dust particles)
  // ==========================================

  // Helper to clip effects to playable tiles only
  const clipToPlayableTiles = (callback: () => void) => {
    ctx.save();
    if (hasVoidTiles) {
      ctx.beginPath();
      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          if (tiles[y]?.[x] !== null) {
            const px = gameAreaX + x * TILE_SIZE;
            const py = gameAreaY + y * TILE_SIZE;
            ctx.rect(px, py, TILE_SIZE, TILE_SIZE);
          }
        }
      }
      ctx.clip();
    }
    callback();
    ctx.restore();
  };

  // --- FOG/MIST EFFECT ---
  // Subtle animated fog that drifts slowly across the board
  const fogOpacity = 0.2; // Subtle fog effect
  // Scale fog speed based on puzzle size - slower for smaller puzzles, faster for larger
  // Reference: 8x8 = 64 tiles is "medium", scale from there
  const puzzleArea = gridWidth * gridHeight;
  const fogSpeedScale = Math.max(0.4, Math.min(1.5, puzzleArea / 64)); // Clamp between 0.4x and 1.5x
  const fogSpeed = 0.0003 * fogSpeedScale;

  clipToPlayableTiles(() => {
    // Layered seeded-noise mist instead of drifting radial-gradient circles:
    // irregular wisps that wander slowly and "breathe" in intensity, reading
    // as torchlight fluctuation rather than moving discs. The texture is
    // generated once; per-frame cost is two drawImage calls (cheaper than
    // the three per-frame gradients this replaced).
    const tex = getFogNoiseTexture();
    ctx.imageSmoothingEnabled = true; // soft mist — restored by the clip's ctx.restore()
    const centerX = gameAreaX + gameAreaWidth / 2;
    const centerY = gameAreaY + gameAreaHeight / 2;
    const cover = Math.max(gameAreaWidth, gameAreaHeight);

    for (let layer = 0; layer < 2; layer++) {
      const phase = layer * 2.1;
      const dir = layer === 0 ? 1 : -1;
      const speed = fogSpeed * (0.8 + layer * 0.5);
      // Bounded wander — the oversized layer never exposes an edge
      const driftX = Math.sin(timestamp * speed + phase) * gameAreaWidth * 0.10 * dir;
      const driftY = Math.cos(timestamp * speed * 0.63 + phase) * gameAreaHeight * 0.10;
      // Slow intensity breathing — the "lighting fluctuation" component
      const breathe = 0.75 + 0.25 * Math.sin(timestamp * speed * 1.7 + phase * 3);
      // ≥1.7× the larger dimension keeps a rotated layer covering the whole
      // area (inradius > half-diagonal + drift) for any board aspect ratio
      const size = cover * (1.7 + layer * 0.9);

      ctx.globalAlpha = fogOpacity * (layer === 0 ? 0.9 : 0.6) * breathe;
      ctx.save();
      ctx.translate(centerX + driftX, centerY + driftY);
      ctx.rotate(layer === 0 ? 0.35 : -0.85);
      ctx.drawImage(tex, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  });

  // --- DUST PARTICLES ---
  // Small floating specks that drift slowly across the board
  const dustCount = Math.floor((gridWidth * gridHeight) / 2); // Scale with board size
  const dustOpacity = 0.4;
  const dustSpeed = 0.00005; // Very slow drift

  clipToPlayableTiles(() => {
    ctx.fillStyle = `rgba(255, 250, 240, ${dustOpacity})`;

    // Use seeded random based on position for consistent particle placement
    for (let i = 0; i < dustCount; i++) {
      // Deterministic "random" positions based on index
      const seed1 = Math.sin(i * 12.9898) * 43758.5453;
      const seed2 = Math.sin(i * 78.233) * 43758.5453;
      const seed3 = Math.sin(i * 45.164) * 43758.5453;

      const baseX = (seed1 - Math.floor(seed1));
      const baseY = (seed2 - Math.floor(seed2));
      const particleSpeed = 0.5 + (seed3 - Math.floor(seed3)) * 1.5;

      // Particles drift slowly, wrapping around
      const time = timestamp * dustSpeed * particleSpeed;
      const driftX = (time * 0.3) % 1;
      const driftY = (time * 0.2 + Math.sin(time * 2 + i) * 0.02) % 1;

      const x = gameAreaX + ((baseX + driftX) % 1) * gameAreaWidth;
      const y = gameAreaY + ((baseY + driftY) % 1) * gameAreaHeight;

      // Vary particle size slightly (small squares)
      const size = 1 + (seed3 - Math.floor(seed3)) * 1; // 1 to 2px

      // Slight twinkle effect
      const twinkle = 0.5 + Math.sin(timestamp * 0.002 + i * 0.5) * 0.5;

      ctx.globalAlpha = dustOpacity * twinkle;
      ctx.fillRect(x, y, size, size); // Square particles
    }
    ctx.globalAlpha = 1;
  });

  ctx.restore();
}

// ==========================================
// RESPONSIVE WRAPPER COMPONENT
// ==========================================

interface ResponsiveGameBoardProps {
  gameState: GameState;
  onTileClick?: (x: number, y: number) => void;
  isEditor?: boolean;
  onProjectileKill?: () => void;  // Callback when a projectile kills an enemy (for victory check)
  skinOverride?: PuzzleSkin;  // Override skin instead of loading from localStorage
  replayFrozen?: boolean;  // Freeze animations during replay pause
}

// Maximum dimensions for the puzzle board on desktop
const MAX_PUZZLE_WIDTH = 900;
const MAX_PUZZLE_HEIGHT = 525;

/**
 * A wrapper component that automatically measures the container and scales the puzzle
 * to fit within the available space. Applies responsive sizing on all screen sizes,
 * capped at maximum width and height to prevent overly large puzzles.
 */
export const ResponsiveGameBoard: React.FC<ResponsiveGameBoardProps> = (props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxWidth, setMaxWidth] = useState<number | undefined>(undefined);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        // Get the container width
        const containerWidth = containerRef.current.offsetWidth;
        // Only proceed if we got a valid width (> 0)
        if (containerWidth > 0) {
          // Cap width and height to prevent overly large puzzles
          const cappedWidth = Math.min(containerWidth, MAX_PUZZLE_WIDTH);
          setMaxWidth(cappedWidth);
          setMaxHeight(MAX_PUZZLE_HEIGHT);
          setMeasured(true);
        }
      }
    };

    // Initial measurement - use requestAnimationFrame to ensure layout is computed
    requestAnimationFrame(() => {
      updateSize();
    });

    // Update on window resize
    window.addEventListener('resize', updateSize);

    // Also use ResizeObserver for container-specific changes
    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateSize);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full flex justify-center overflow-hidden">
      {measured && <AnimatedGameBoard {...props} maxWidth={maxWidth} maxHeight={maxHeight} replayFrozen={props.replayFrozen} />}
    </div>
  );
};
