// ============================================================================
// SPRITE DRAW — the one renderer for hero / enemy / object sprites
// ============================================================================
// The board, the picker hub, thumbnails and the editors all draw sprites
// through these functions (share-the-renderer law). Moved VERBATIM out of
// editor/SpriteEditor.tsx (2026-11) so the player app no longer imports its
// renderer from a 5,000-line editor file. No React in here.

import type { CustomSprite, DirectionalSpriteConfig, SpriteDirection } from '../../utils/assetStorage';
import { Direction } from '../../types/game';
import { loadImage } from '../../utils/imageLoader';

// Tiles are 24×24 art pixels. Sprite images render at their NATIVE pixel
// dimensions × (tileSize / ART_TILE_PX), centered on the tile — never scaled
// to fit. One art pixel is therefore the same on-screen size for every sprite,
// which is what keeps pixel density consistent across all board art.
export const ART_TILE_PX = 24;

// Global image cache for GIF animation support
const globalImageCache = new Map<string, HTMLImageElement>();

// Set of callbacks to notify when sprite images finish loading
const spriteLoadCallbacks = new Set<() => void>();

// Set of images currently loading
const loadingSpriteImages = new Set<string>();

// Flag to schedule a single notification on next frame (for batching)
let pendingSpriteNotification = false;

/**
 * Subscribe to sprite image load events. Returns unsubscribe function.
 */
export function subscribeToSpriteImageLoads(callback: () => void): () => void {
  spriteLoadCallbacks.add(callback);
  return () => spriteLoadCallbacks.delete(callback);
}

/**
 * Notify all subscribers that a sprite image has loaded.
 * Uses requestAnimationFrame to batch multiple load events.
 */
function notifySpriteImageLoaded() {
  if (!pendingSpriteNotification) {
    pendingSpriteNotification = true;
    requestAnimationFrame(() => {
      pendingSpriteNotification = false;
      spriteLoadCallbacks.forEach(cb => cb());
    });
  }
}

/**
 * Load a sprite image with caching and load notification.
 */
export function loadSpriteImage(src: string): HTMLImageElement {
  // Check local sprite cache first
  let img = globalImageCache.get(src);
  if (img) {
    if (!img.complete && !loadingSpriteImages.has(src)) {
      loadingSpriteImages.add(src);
      img.onload = () => {
        loadingSpriteImages.delete(src);
        notifySpriteImageLoaded();
      };
      img.onerror = () => {
        loadingSpriteImages.delete(src);
      };
    }
    return img;
  }

  // Try the shared imageLoader cache (used by preloader)
  const sharedImg = loadImage(src);
  if (sharedImg) {
    globalImageCache.set(src, sharedImg);
    if (!sharedImg.complete) {
      loadingSpriteImages.add(src);
      const origOnload = sharedImg.onload;
      sharedImg.onload = (e) => {
        loadingSpriteImages.delete(src);
        notifySpriteImageLoaded();
        if (typeof origOnload === 'function') origOnload.call(sharedImg, e);
      };
    }
    return sharedImg;
  }

  // Create new image (fallback — should rarely happen)
  img = new Image();
  globalImageCache.set(src, img);
  loadingSpriteImages.add(src);

  img.onload = () => {
    loadingSpriteImages.delete(src);
    notifySpriteImageLoaded();
  };
  img.onerror = () => {
    loadingSpriteImages.delete(src);
  };

  img.src = src;

  return img;
}

// Sprite sheet animation state
interface SpriteSheetState {
  currentFrame: number;
  lastFrameTime: number;
}
const spriteSheetStates = new Map<string, SpriteSheetState>();

/**
 * Snap an anchor offset to a whole art pixel (a multiple of `zoom`) so
 * odd-dimension sprites lock to the tile's art-pixel grid instead of landing on
 * a sub-art-pixel (half-pixel) position. Even-dimension sprites are unaffected.
 * Used by every entity draw path so the board and the offset preview snap
 * identically (offsets are already whole art pixels, so they stay grid-aligned).
 */
export function snapAnchorPx(drawSize: number, anchor: number, zoom: number): number {
  return Math.round((drawSize * anchor) / zoom) * zoom;
}

/**
 * Draw an animated sprite sheet
 */
function drawSpriteSheet(
  ctx: CanvasRenderingContext2D,
  sheet: import('../../utils/assetStorage').SpriteSheetConfig,
  centerX: number,
  centerY: number,
  tileSize: number,
  now: number,
  anchorX: number = 0.5,
  anchorY: number = 0.5,
  offsetX: number = 0,
  offsetY: number = 0
): void {
  // Offsets are whole art pixels — round defensively so any legacy/imported
  // fractional value can't introduce zoom-dependent sub-pixel misalignment.
  offsetX = Math.round(offsetX);
  offsetY = Math.round(offsetY);
  // Resolve image source from data or URL
  const imageSrc = sheet.imageData || sheet.imageUrl;
  if (!imageSrc) return;

  // Get or create cached image with load notification
  const img = loadSpriteImage(imageSrc);

  // Wait for image to load
  if (!img.complete || img.naturalWidth === 0) return;

  // Get or initialize animation state
  const stateKey = imageSrc;
  let state = spriteSheetStates.get(stateKey);
  if (!state) {
    state = { currentFrame: 0, lastFrameTime: now };
    spriteSheetStates.set(stateKey, state);
  }

  // Calculate frame dimensions
  const frameWidth = sheet.frameWidth || (img.naturalWidth / sheet.frameCount);
  const frameHeight = sheet.frameHeight || img.naturalHeight;

  // Update animation frame based on frame rate
  const frameDuration = 1000 / sheet.frameRate; // ms per frame
  if (now - state.lastFrameTime >= frameDuration) {
    state.currentFrame++;
    if (state.currentFrame >= sheet.frameCount) {
      state.currentFrame = sheet.loop !== false ? 0 : sheet.frameCount - 1;
    }
    state.lastFrameTime = now;
  }

  // Native-size rendering: frame dims × zoom; offsets are in art pixels
  const zoom = tileSize / ART_TILE_PX;
  const finalWidth = Math.round(frameWidth * zoom);
  const finalHeight = Math.round(frameHeight * zoom);

  const sourceX = Math.round(state.currentFrame * frameWidth);
  const sw = Math.round(frameWidth);
  const sh = Math.round(frameHeight);
  const dw = finalWidth;
  const dh = finalHeight;
  const dx = Math.round(centerX - snapAnchorPx(finalWidth, anchorX, zoom) + offsetX * zoom);
  const dy = Math.round(centerY - snapAnchorPx(finalHeight, anchorY, zoom) + offsetY * zoom);

  try {
    ctx.drawImage(img, sourceX, 0, sw, sh, dx, dy, dw, dh);
  } catch {
    // Image not ready
  }
}

/**
 * Draw a sprite sheet with animation based on a specific start time
 * Used for one-shot animations like death sprites where we need to track
 * when the animation started and stop on the final frame
 */
function drawSpriteSheetFromStartTime(
  ctx: CanvasRenderingContext2D,
  sheet: import('../../utils/assetStorage').SpriteSheetConfig,
  centerX: number,
  centerY: number,
  tileSize: number,
  startTime: number,
  now: number = Date.now(),
  anchorX: number = 0.5,
  anchorY: number = 0.5,
  offsetX: number = 0,
  offsetY: number = 0
): void {
  // Offsets are whole art pixels — round defensively so any legacy/imported
  // fractional value can't introduce zoom-dependent sub-pixel misalignment.
  offsetX = Math.round(offsetX);
  offsetY = Math.round(offsetY);
  // Resolve image source from data or URL
  const imageSrc = sheet.imageData || sheet.imageUrl;
  if (!imageSrc) return;

  // Get or create cached image with load notification
  const img = loadSpriteImage(imageSrc);

  // Wait for image to load
  if (!img.complete || img.naturalWidth === 0) return;

  // Calculate frame dimensions
  const frameWidth = sheet.frameWidth || (img.naturalWidth / sheet.frameCount);
  const frameHeight = sheet.frameHeight || img.naturalHeight;

  // Calculate current frame based on elapsed time since start
  const elapsed = now - startTime;
  const frameDuration = 1000 / sheet.frameRate; // ms per frame
  let currentFrame = Math.floor(elapsed / frameDuration);

  // For non-looping animations (like death), clamp to final frame
  if (sheet.loop === false && currentFrame >= sheet.frameCount) {
    currentFrame = sheet.frameCount - 1;
  } else if (sheet.loop !== false) {
    // Looping animation
    currentFrame = currentFrame % sheet.frameCount;
  }

  // Ensure frame is within bounds
  currentFrame = Math.max(0, Math.min(currentFrame, sheet.frameCount - 1));

  // Native-size rendering: frame dims × zoom; offsets are in art pixels
  const zoom = tileSize / ART_TILE_PX;
  const finalWidth = Math.round(frameWidth * zoom);
  const finalHeight = Math.round(frameHeight * zoom);

  // Draw the current frame — round all coords to prevent sub-pixel warping of pixel art
  const sourceX = Math.round(currentFrame * frameWidth);
  const sw = Math.round(frameWidth);
  const sh = Math.round(frameHeight);
  const dw = finalWidth;
  const dh = finalHeight;
  const dx = Math.round(centerX - snapAnchorPx(finalWidth, anchorX, zoom) + offsetX * zoom);
  const dy = Math.round(centerY - snapAnchorPx(finalHeight, anchorY, zoom) + offsetY * zoom);

  try {
    ctx.drawImage(img, sourceX, 0, sw, sh, dx, dy, dw, dh);
  } catch {
    // Image not ready
  }
}

// Helper to draw a sprite configuration
export function drawSpriteConfig(
  ctx: CanvasRenderingContext2D,
  config: DirectionalSpriteConfig,
  centerX: number,
  centerY: number,
  tileSize: number,
  isMoving: boolean = false,
  now: number = Date.now(),
  isCasting: boolean = false,
  // When provided (board casting), the casting sheet animates from this start
  // time so it restarts each cast; without it (editor preview) it uses the
  // continuous shared-state path.
  castStartTime?: number
) {
  // Determine active state and resolve anchor from the appropriate source
  // For spritesheets: anchor lives on SpriteSheetConfig
  // For images: anchor lives as per-state fields on the config

  // Priority: casting > moving > idle. Callers gate isCasting — it only
  // arrives true WHILE MOVING when the sprite opts into castingWhileMoving,
  // so when both flags are set the attack animation is the one to show.
  // Check for sprite sheet first (highest priority for animation)
  let spriteSheet = isCasting ? config.castingSpriteSheet : null;
  let _activeState: 'moving' | 'casting' | 'idle' = spriteSheet ? 'casting' : 'idle';
  if (!spriteSheet && isMoving) {
    spriteSheet = config.movingSpriteSheet;
    if (spriteSheet) _activeState = 'moving';
  }
  if (!spriteSheet) {
    spriteSheet = config.idleSpriteSheet;
    _activeState = spriteSheet ? (isMoving ? 'moving' : isCasting ? 'casting' : 'idle') : _activeState;
  }
  if (spriteSheet) {
    // Anchor from spritesheet itself
    const ax = spriteSheet.anchorX ?? 0.5;
    const ay = spriteSheet.anchorY ?? 0.5;
    const ox = spriteSheet.offsetX ?? 0;
    const oy = spriteSheet.offsetY ?? 0;
    if (castStartTime !== undefined && spriteSheet === config.castingSpriteSheet) {
      // Casting sheet plays from the cast's start time so it restarts each cast.
      drawSpriteSheetFromStartTime(ctx, spriteSheet, centerX, centerY, tileSize, castStartTime, now, ax, ay, ox, oy);
    } else {
      drawSpriteSheet(ctx, spriteSheet, centerX, centerY, tileSize, now, ax, ay, ox, oy);
    }
    return;
  }

  // Check for uploaded image (PNG/GIF) or URL
  // Priority: casting > moving > idle (see the sheet-picker note above)
  let imageToUse: string | undefined;
  let imageState: 'idle' | 'moving' | 'casting' = 'idle';
  if (isCasting && (config.castingImageData || config.castingImageUrl)) {
    imageToUse = config.castingImageData || config.castingImageUrl;
    imageState = 'casting';
  } else if (isMoving && (config.movingImageData || config.movingImageUrl)) {
    imageToUse = config.movingImageData || config.movingImageUrl;
    imageState = 'moving';
  } else {
    imageToUse = config.idleImageData || config.imageData || config.idleImageUrl || config.imageUrl;
    imageState = 'idle';
  }

  if (imageToUse) {
    // Anchor from per-state image fields
    const ax = (imageState === 'moving' ? config.movingAnchorX : imageState === 'casting' ? config.castingAnchorX : config.idleAnchorX) ?? 0.5;
    const ay = (imageState === 'moving' ? config.movingAnchorY : imageState === 'casting' ? config.castingAnchorY : config.idleAnchorY) ?? 0.5;
    const ox = Math.round((imageState === 'moving' ? config.movingOffsetX : imageState === 'casting' ? config.castingOffsetX : config.idleOffsetX) ?? 0);
    const oy = Math.round((imageState === 'moving' ? config.movingOffsetY : imageState === 'casting' ? config.castingOffsetY : config.idleOffsetY) ?? 0);

    // Use cached image with load notification for GIF animation support
    const img = loadSpriteImage(imageToUse);

    // Draw the image - for GIFs, the browser handles animation automatically
    // We draw even if not fully loaded to ensure GIF animation starts properly
    try {
      // Native-size rendering: image dims × zoom; offsets are in art pixels
      const zoom = tileSize / ART_TILE_PX;
      let drawWidth = tileSize;
      let drawHeight = tileSize;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        drawWidth = Math.round(img.naturalWidth * zoom);
        drawHeight = Math.round(img.naturalHeight * zoom);
      }

      ctx.drawImage(img, Math.round(centerX - snapAnchorPx(drawWidth, ax, zoom) + ox * zoom), Math.round(centerY - snapAnchorPx(drawHeight, ay, zoom) + oy * zoom), drawWidth, drawHeight);
    } catch {
      // Image not ready yet, will draw on next frame
    }
    return;
  }

  const primaryColor = config.primaryColor || '#4caf50';
  const secondaryColor = config.secondaryColor || '#ffffff';
  const size = (config.size || 0.6) * tileSize;
  const radius = size / 2;

  ctx.fillStyle = primaryColor;

  switch (config.shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'square':
      ctx.fillRect(centerX - radius, centerY - radius, size, size);
      break;

    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX - radius, centerY + radius);
      ctx.lineTo(centerX + radius, centerY + radius);
      ctx.closePath();
      ctx.fill();
      break;

    case 'star':
      drawStar(ctx, centerX, centerY, 5, radius, radius / 2);
      break;

    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX + radius, centerY);
      ctx.lineTo(centerX, centerY + radius);
      ctx.lineTo(centerX - radius, centerY);
      ctx.closePath();
      ctx.fill();
      break;

    case 'hexagon':
      ctx.beginPath();
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
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
  }

  // Add secondary color detail (center dot/highlight)
  ctx.fillStyle = secondaryColor;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius / 3, 0, Math.PI * 2);
  ctx.fill();
}

// Shared sprite drawing function (can be used by game renderer too)
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: CustomSprite,
  centerX: number,
  centerY: number,
  tileSize: number,
  direction?: Direction,
  isMoving: boolean = false,
  now: number = Date.now(),
  isCasting: boolean = false,
  // When provided (board casting), the casting sheet restarts from this start
  // time each cast; omitted by the editor preview (continuous path).
  castStartTime?: number
) {
  // Check if we should use directional sprites
  if (sprite.useDirectional && sprite.directionalSprites) {
    // If direction is provided, use it; otherwise use 'default'
    const dirKey = direction ? mapGameDirectionToSpriteDirection(direction) : 'default';
    const dirConfig = sprite.directionalSprites[dirKey] || sprite.directionalSprites['default'];

    if (dirConfig) {
      drawSpriteConfig(ctx, dirConfig, centerX, centerY, tileSize, isMoving, now, isCasting, castStartTime);
      return;
    }
  }

  // Priority: casting > moving > idle. Callers gate isCasting — it only
  // arrives true WHILE MOVING when the sprite opts into castingWhileMoving,
  // so when both flags are set the attack animation is the one to show.
  // Check for sprite sheet first (simple mode)
  let simpleSpriteSheet = isCasting ? sprite.castingSpriteSheet : null;
  if (!simpleSpriteSheet && isMoving) {
    simpleSpriteSheet = sprite.movingSpriteSheet;
  }
  if (!simpleSpriteSheet) {
    simpleSpriteSheet = sprite.idleSpriteSheet;
  }
  if (simpleSpriteSheet) {
    // Anchor from spritesheet itself
    const ax = simpleSpriteSheet.anchorX ?? 0.5;
    const ay = simpleSpriteSheet.anchorY ?? 0.5;
    const ox = simpleSpriteSheet.offsetX ?? 0;
    const oy = simpleSpriteSheet.offsetY ?? 0;
    if (castStartTime !== undefined && simpleSpriteSheet === sprite.castingSpriteSheet) {
      // Casting sheet plays from the cast's start time so it restarts each cast.
      drawSpriteSheetFromStartTime(ctx, simpleSpriteSheet, centerX, centerY, tileSize, castStartTime, now, ax, ay, ox, oy);
    } else {
      drawSpriteSheet(ctx, simpleSpriteSheet, centerX, centerY, tileSize, now, ax, ay, ox, oy);
    }
    return;
  }

  // Check for simple image sprite (PNG/GIF)
  // Priority: casting > moving > idle (see the sheet-picker note above)
  let spriteImageToUse: string | undefined;
  let imgState: 'idle' | 'moving' | 'casting' = 'idle';
  if (isCasting && sprite.castingImageData) {
    spriteImageToUse = sprite.castingImageData;
    imgState = 'casting';
  } else if (isMoving && sprite.movingImageData) {
    spriteImageToUse = sprite.movingImageData;
    imgState = 'moving';
  } else {
    spriteImageToUse = sprite.idleImageData || sprite.imageData;
    imgState = 'idle';
  }

  if (spriteImageToUse) {
    // Anchor from per-state image fields
    const ax = (imgState === 'moving' ? sprite.movingAnchorX : imgState === 'casting' ? sprite.castingAnchorX : sprite.idleAnchorX) ?? 0.5;
    const ay = (imgState === 'moving' ? sprite.movingAnchorY : imgState === 'casting' ? sprite.castingAnchorY : sprite.idleAnchorY) ?? 0.5;
    const ox = Math.round((imgState === 'moving' ? sprite.movingOffsetX : imgState === 'casting' ? sprite.castingOffsetX : sprite.idleOffsetX) ?? 0);
    const oy = Math.round((imgState === 'moving' ? sprite.movingOffsetY : imgState === 'casting' ? sprite.castingOffsetY : sprite.idleOffsetY) ?? 0);

    // Use cached image with load notification for GIF animation support
    const img = loadSpriteImage(spriteImageToUse);

    // Draw the image - for GIFs, the browser handles animation automatically
    // We draw even if not fully loaded to ensure GIF animation starts properly
    try {
      // Native-size rendering: image dims × zoom; offsets are in art pixels
      const zoom = tileSize / ART_TILE_PX;
      let drawWidth = tileSize;
      let drawHeight = tileSize;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        drawWidth = Math.round(img.naturalWidth * zoom);
        drawHeight = Math.round(img.naturalHeight * zoom);
      }

      ctx.drawImage(img, Math.round(centerX - snapAnchorPx(drawWidth, ax, zoom) + ox * zoom), Math.round(centerY - snapAnchorPx(drawHeight, ay, zoom) + oy * zoom), drawWidth, drawHeight);
    } catch {
      // Image not ready yet, will draw on next frame
    }
    return;
  }

  // Fallback to simple sprite rendering with shapes
  const primaryColor = sprite.primaryColor || '#4caf50';
  const secondaryColor = sprite.secondaryColor || '#ffffff';
  const size = (sprite.size || 0.6) * tileSize;
  const radius = size / 2;

  ctx.fillStyle = primaryColor;

  switch (sprite.shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'square':
      ctx.fillRect(centerX - radius, centerY - radius, size, size);
      break;

    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX - radius, centerY + radius);
      ctx.lineTo(centerX + radius, centerY + radius);
      ctx.closePath();
      ctx.fill();
      break;

    case 'star':
      drawStar(ctx, centerX, centerY, 5, radius, radius / 2);
      break;

    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX + radius, centerY);
      ctx.lineTo(centerX, centerY + radius);
      ctx.lineTo(centerX - radius, centerY);
      ctx.closePath();
      ctx.fill();
      break;

    case 'hexagon':
      ctx.beginPath();
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
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
  }

  // Add secondary color detail (center dot/highlight)
  ctx.fillStyle = secondaryColor;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius / 3, 0, Math.PI * 2);
  ctx.fill();
}

function mapGameDirectionToSpriteDirection(direction: Direction): SpriteDirection {
  switch (direction) {
    case Direction.NORTH: return 'n';
    case Direction.NORTHEAST: return 'ne';
    case Direction.EAST: return 'e';
    case Direction.SOUTHEAST: return 'se';
    case Direction.SOUTH: return 's';
    case Direction.SOUTHWEST: return 'sw';
    case Direction.WEST: return 'w';
    case Direction.NORTHWEST: return 'nw';
    default: return 'default';
  }
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number
) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw death animation sprite for an entity
 * Returns true if a death sprite was drawn, false if not available
 *
 * @param startTime - When the death occurred (for proper frame calculation)
 *                    For sprite sheets, this ensures animation plays from start and stops on final frame
 */
export function drawDeathSprite(
  ctx: CanvasRenderingContext2D,
  sprite: CustomSprite,
  centerX: number,
  centerY: number,
  tileSize: number,
  _direction?: Direction,
  startTime: number = Date.now()
): boolean {
  const now = Date.now();

  // Death is a single global (non-directional) animation — same sprite plays
  // regardless of facing direction. Authored in the editor's Global Settings.
  if (sprite.deathSpriteSheet) {
    const ax = sprite.deathSpriteSheet.anchorX ?? 0.5;
    const ay = sprite.deathSpriteSheet.anchorY ?? 0.5;
    const ox = sprite.deathSpriteSheet.offsetX ?? 0;
    const oy = sprite.deathSpriteSheet.offsetY ?? 0;
    // Force loop=false for death animations so they stop on final frame
    const deathSheet = { ...sprite.deathSpriteSheet, loop: false };
    drawSpriteSheetFromStartTime(ctx, deathSheet, centerX, centerY, tileSize, startTime, now, ax, ay, ox, oy);
    return true;
  }

  // Check for simple mode death image
  if (sprite.deathImageData) {
    const ax = sprite.deathAnchorX ?? 0.5;
    const ay = sprite.deathAnchorY ?? 0.5;
    const ox = sprite.deathOffsetX ?? 0;
    const oy = sprite.deathOffsetY ?? 0;
    drawImage(ctx, sprite.deathImageData, centerX, centerY, tileSize, ax, ay, ox, oy);
    return true;
  }

  return false;
}

/**
 * Check if a sprite has any death animation configured
 */
export function hasDeathAnimation(sprite: CustomSprite): boolean {
  // Death is a single global animation (see drawDeathSprite).
  return !!(sprite.deathSpriteSheet || sprite.deathImageData);
}

/**
 * Draw spawn animation sprite for an entity
 * Returns true if a spawn sprite was drawn, false if not available
 *
 * @param startTime - When the spawn started (for proper frame calculation)
 *                    For sprite sheets, this ensures animation plays from start and stops on final frame
 */
export function drawSpawnSprite(
  ctx: CanvasRenderingContext2D,
  sprite: CustomSprite,
  centerX: number,
  centerY: number,
  tileSize: number,
  startTime: number = Date.now()
): boolean {
  const now = Date.now();

  // Spawn animations are NOT directional - same animation regardless of facing

  // Check for spawn sprite sheet (animation)
  if (sprite.spawnSpriteSheet) {
    const ax = sprite.spawnSpriteSheet.anchorX ?? 0.5;
    const ay = sprite.spawnSpriteSheet.anchorY ?? 0.5;
    const ox = sprite.spawnSpriteSheet.offsetX ?? 0;
    const oy = sprite.spawnSpriteSheet.offsetY ?? 0;

    // Use drawSpriteSheetFromStartTime for proper one-shot animation timing
    // Create a modified config with loop=false for spawn animations
    const spawnSheet = { ...sprite.spawnSpriteSheet, loop: false };
    drawSpriteSheetFromStartTime(
      ctx,
      spawnSheet,
      centerX,
      centerY,
      tileSize,
      startTime,
      now,
      ax,
      ay,
      ox,
      oy
    );
    return true;
  }

  // Check for simple spawn image (static) - supports both data and URL
  const spawnImageSrc = sprite.spawnImageData || sprite.spawnImageUrl;
  if (spawnImageSrc) {
    const ax = sprite.spawnAnchorX ?? 0.5;
    const ay = sprite.spawnAnchorY ?? 0.5;
    const ox = sprite.spawnOffsetX ?? 0;
    const oy = sprite.spawnOffsetY ?? 0;
    drawImage(ctx, spawnImageSrc, centerX, centerY, tileSize, ax, ay, ox, oy);
    return true;
  }

  return false;
}

/**
 * Check if a sprite has any spawn animation configured
 */
export function hasSpawnAnimation(sprite: CustomSprite): boolean {
  // Only check simple mode - spawn animations are NOT directional
  return !!(sprite.spawnSpriteSheet || sprite.spawnImageData || sprite.spawnImageUrl);
}

/**
 * Check if spawn animation is still playing (hasn't finished)
 * Returns true if animation is still active, false if complete
 */
export function isSpawnAnimationPlaying(sprite: CustomSprite, startTime: number): boolean {
  const now = Date.now();
  const elapsed = now - startTime;

  if (sprite.spawnSpriteSheet) {
    // Calculate animation duration from sprite sheet
    const frameCount = sprite.spawnSpriteSheet.frameCount;
    const frameRate = sprite.spawnSpriteSheet.frameRate || 10;
    const animDuration = (frameCount / frameRate) * 1000;
    return elapsed < animDuration;
  }

  // For static spawn images, use a fixed duration
  return elapsed < 500; // 500ms default duration for static spawn images
}

/**
 * Helper to draw an image from cache
 */
function drawImage(
  ctx: CanvasRenderingContext2D,
  imageData: string,
  centerX: number,
  centerY: number,
  tileSize: number,
  anchorX: number = 0.5,
  anchorY: number = 0.5,
  offsetX: number = 0,
  offsetY: number = 0
): void {
  const img = loadSpriteImage(imageData);
  // Offsets are whole art pixels — round defensively (see drawSpriteSheet).
  offsetX = Math.round(offsetX);
  offsetY = Math.round(offsetY);

  try {
    // Native-size rendering: image dims × zoom; offsets are in art pixels
    const zoom = tileSize / ART_TILE_PX;
    let drawWidth = tileSize;
    let drawHeight = tileSize;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      drawWidth = Math.round(img.naturalWidth * zoom);
      drawHeight = Math.round(img.naturalHeight * zoom);
    }

    ctx.drawImage(img, Math.round(centerX - snapAnchorPx(drawWidth, anchorX, zoom) + offsetX * zoom), Math.round(centerY - snapAnchorPx(drawHeight, anchorY, zoom) + offsetY * zoom), drawWidth, drawHeight);
  } catch {
    // Image not ready
  }
}

/**
 * On-screen height of a sprite's idle frame under native-size rendering.
 * Used for layout that depends on sprite height (health bar placement,
 * bottom_center anchoring). Falls back to one tile when the image hasn't
 * loaded yet or the sprite is a shape.
 */
export function getSpriteDrawHeight(sprite: CustomSprite, tileSize: number): number {
  const zoom = tileSize / ART_TILE_PX;
  const dirConfig = sprite.useDirectional ? sprite.directionalSprites?.default : undefined;

  const sheet = dirConfig?.idleSpriteSheet || sprite.idleSpriteSheet;
  const sheetSrc = sheet ? (sheet.imageData || sheet.imageUrl) : undefined;
  if (sheet && sheetSrc) {
    if (sheet.frameHeight) return Math.round(sheet.frameHeight * zoom);
    const img = loadSpriteImage(sheetSrc);
    if (img.naturalHeight > 0) return Math.round(img.naturalHeight * zoom);
    return tileSize;
  }

  const imgSrc = dirConfig
    ? (dirConfig.idleImageData || dirConfig.imageData || dirConfig.idleImageUrl || dirConfig.imageUrl)
    : (sprite.idleImageData || sprite.imageData || sprite.idleImageUrl || sprite.imageUrl);
  if (imgSrc) {
    const img = loadSpriteImage(imgSrc);
    if (img.naturalHeight > 0) return Math.round(img.naturalHeight * zoom);
    return tileSize;
  }

  // Shape fallback — shapes still size by the legacy `size` fraction
  return (sprite.size || 0.6) * tileSize;
}
