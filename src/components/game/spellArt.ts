import { Direction } from '../../types/game';
import type { SpriteReference } from '../../types/game';
import { loadImage } from '../../utils/imageLoader';

/**
 * SPELL ART — the board's own drawing of a spell's sprites: bolts in flight,
 * and particles (melee strikes, cast flashes, hit bursts). Moved out of
 * AnimatedGameBoard.tsx unchanged on 2026-10-14 so the direction picker's
 * hub can preview a spell through the SAME routines the board draws with —
 * the share-the-renderer law: a preview that re-implements the look drifts
 * from it. Nothing here reads game state: sprite data and a spot in, pixels
 * out.
 */

/** A sprite reference's inline data (CustomSprite-shaped; untyped upstream). */
type SpellSpriteData = SpriteReference['spriteData'];

// The image cache these routines once took is unused (the shared loader
// caches); the composites pass this placeholder for it.
const NO_IMAGE_CACHE = new Map<string, HTMLImageElement>();

export interface SpriteSheetConfig {
  imageData: string;
  frameCount: number;
  frameWidth?: number;
  frameHeight?: number;
  frameRate: number;
  loop?: boolean;
}

// Cache for sprite sheet animation state. startTime anchors an absolute-time
// frame calc (see drawSpellSpriteSheet) — the old incremental "advance one
// frame per repaint that crossed frameDuration, then reset the baseline to
// now" drifted slow: it discarded the sub-repaint remainder every flip
// (~half a repaint interval, ~8ms/frame at 60Hz), so a 100ms frame ran ~108ms.
const spellSpriteSheetStates = new Map<string, { startTime: number }>();

/**
 * Draw a spell sprite sheet with optional rotation and mirroring
 * Used for projectiles and particle effects that need directional rotation
 */
export function drawSpellSpriteSheet(
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

  // Get or initialize animation state — anchor the absolute-time clock the
  // first time this sheet is drawn (keyed by image data, as before).
  const stateKey = spriteSheet.imageData;
  let state = spellSpriteSheetStates.get(stateKey);
  if (!state) {
    state = { startTime: now };
    spellSpriteSheetStates.set(stateKey, state);
  }

  // Calculate frame dimensions
  const frameWidth = spriteSheet.frameWidth || (img.naturalWidth / spriteSheet.frameCount);
  const frameHeight = spriteSheet.frameHeight || img.naturalHeight;

  // Frame from absolute elapsed time (drift-free, matches Aseprite and
  // drawSpellSpriteSheetFromStartTime — no per-flip remainder to lose).
  const frameDuration = 1000 / spriteSheet.frameRate;
  let currentFrame = Math.floor((now - state.startTime) / frameDuration);
  if (spriteSheet.loop !== false) {
    currentFrame = currentFrame % spriteSheet.frameCount;
  } else {
    currentFrame = Math.min(currentFrame, spriteSheet.frameCount - 1);
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
  const sourceX = currentFrame * frameWidth;
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
  } catch {
    ctx.restore();
    return false;
  }
}

/**
 * Draw a spell sprite sheet based on start time (for one-shot animations)
 * Used for particle effects that should play once and hold on final frame
 */
export function drawSpellSpriteSheetFromStartTime(
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
  } catch {
    ctx.restore();
    return false;
  }
}

/**
 * Draw a shape or image with given parameters
 */
export function drawShape(
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
    } catch {
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
 * Get rotation/mirror config for a direction
 * Base image points East (left-to-right →)
 *
 * Canvas (and CSS) rotation is CLOCKWISE on screen — y points down — so
 * north is -90. Until 2026-10-14 north, north-east, south-east and south
 * had their signs flipped: east-pointing art flying north pointed south
 * (caught when the picker hub's cast preview flew an arrow up the rose).
 * The mirrored west half was always right. The spell editor's directional
 * previews read this table too.
 */
export function getRotationForDirection(direction: Direction): { rotation: number; mirror: boolean } {
  switch (direction) {
    case Direction.EAST:
      return { rotation: 0, mirror: false };
    case Direction.NORTHEAST:
      return { rotation: -45, mirror: false };
    case Direction.NORTH:
      return { rotation: -90, mirror: false };
    case Direction.NORTHWEST:
      return { rotation: 45, mirror: true };
    case Direction.WEST:
      return { rotation: 0, mirror: true };
    case Direction.SOUTHWEST:
      return { rotation: -45, mirror: true };
    case Direction.SOUTH:
      return { rotation: 90, mirror: false };
    case Direction.SOUTHEAST:
      return { rotation: 45, mirror: false };
    default:
      return { rotation: 0, mirror: false };
  }
}

/**
 * Draw default projectile (simple colored circle/arrow)
 */
export function drawDefaultProjectile(ctx: CanvasRenderingContext2D, px: number, py: number, scale: number = 1) {
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
 * A BOLT IN FLIGHT at (px, py): the spell's sprite sheet in a 24px box,
 * else its image or shape (drawShape at 8px), each × `scale` and turned by
 * `rotationConfig`; no sprite = the stock orb. `shapeColor` overrides a
 * shape's colour (the board's reflected-bolt tint). The board's
 * drawProjectile and the picker hub both draw through this.
 */
export function drawProjectileArt(
  ctx: CanvasRenderingContext2D,
  spriteData: SpellSpriteData,
  px: number,
  py: number,
  now: number,
  scale: number,
  rotationConfig?: { rotation: number; mirror: boolean },
  shapeColor?: string
): void {
  if (!spriteData) {
    drawDefaultProjectile(ctx, px, py, scale);
    return;
  }

  // Check for sprite sheet first (highest priority)
  if (spriteData.spriteSheet) {
    const spriteSize = Math.round(24 * scale); // Size for projectile sprite sheets
    drawSpellSpriteSheet(ctx, spriteData.spriteSheet, px, py, spriteSize, NO_IMAGE_CACHE, now, rotationConfig);
    return;
  }

  // Fall back to static image or shape
  const shape = spriteData.shape || 'circle';
  const color = shapeColor || spriteData.primaryColor || '#ff6600';
  drawShape(ctx, px, py, shape, color, Math.round(8 * scale), spriteData.idleImageData, NO_IMAGE_CACHE, rotationConfig);
}

/**
 * A PARTICLE at (px, py), `now - visibleStart` ms into its visible life of
 * `duration` ms (the caller skips it outside that window).
 *
 * Spritesheet behavior:
 * - Non-looping spritesheets play once and vanish when done
 * - No fade-out is applied to spritesheets (they just disappear when done)
 * Images and shapes draw at `alpha` (else fading out); shapes also expand,
 * with an inner flash. No sprite = the stock expanding ring. The board's
 * drawParticle and the picker hub both draw through this.
 */
export function drawParticleArt(
  ctx: CanvasRenderingContext2D,
  spriteData: SpellSpriteData,
  px: number,
  py: number,
  visibleStart: number,
  now: number,
  duration: number,
  alpha: number | undefined,
  tileSize: number,
  sizeTiles?: number,
  rotationConfig?: { rotation: number; mirror: boolean }
): void {
  const elapsed = now - visibleStart;

  // Check if particle has custom sprite
  if (spriteData) {
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

      // Default 32px box; single-sprite AOE blasts span their whole area.
      const spriteSize = sizeTiles ? sizeTiles * tileSize : 32;
      drawSpellSpriteSheetFromStartTime(
        ctx,
        spriteSheet,
        px,
        py,
        spriteSize,
        NO_IMAGE_CACHE,
        visibleStart, // delayed particles animate from their visible start
        now,
        rotationConfig
      );
      ctx.restore();
      return;
    }

    // Calculate fade-out alpha for non-spritesheet sprites
    const progress = elapsed / duration;
    const drawAlpha = alpha || (1 - progress); // Fade out over time

    ctx.save();
    ctx.globalAlpha = drawAlpha;

    // Fall back to static image or shape
    const shape = spriteData.shape || 'circle';
    const color = spriteData.primaryColor || '#ffff00';
    const imageData = spriteData.idleImageData;

    // Draw expanding effect for shapes, static size for images. drawShape
    // renders images at size×3, so an area-spanning particle passes a third.
    const radius = imageData
      ? (sizeTiles ? (sizeTiles * tileSize) / 3 : 12)
      : (4 + progress * 20);
    drawShape(ctx, px, py, shape, color, radius, imageData, NO_IMAGE_CACHE, rotationConfig);

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
    const progress = elapsed / duration;
    const drawAlpha = alpha || (1 - progress);

    ctx.save();
    ctx.globalAlpha = drawAlpha;
    drawDefaultParticle(ctx, px, py, progress);
    ctx.restore();
  }
}
