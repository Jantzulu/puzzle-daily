import type { CustomSprite, SpriteSheetConfig } from '../../utils/assetStorage';
import { resolveImageSource, resolveSpriteSheetSource } from '../../utils/assetStorage';
import { loadImage } from '../../utils/imageLoader';

// ============================================================================
// GROUNDED BLOB SHADOWS
// ============================================================================
// Replaces the offset-silhouette entity shadows (ctx.shadowColor + offset)
// with a soft ellipse anchored at the sprite's feet, so entities read as
// standing ON the board instead of stickered onto it. Projectiles get a
// smaller, fainter ellipse offset below their flight line to sell altitude.
//
// Purely visual — no game state is read or written, nothing here can affect
// the logic loop, determinism, or replays.
//
// Runtime toggle (for live old/new comparison while tuning):
//   toggleBlobShadows()            — from the browser console
//   localStorage 'blob_shadows'    — 'off' disables; anything else enables
// When disabled, callers fall back to the legacy silhouette shadow.

const ART_TILE_PX = 24; // a tile is 24×24 art pixels

// ─── Tuning knobs ───────────────────────────────────────────────────────────
const KNOBS = {
  WIDTH_RATIO: 0.7,          // shadow width as a fraction of the sprite's opaque width
  SQUASH: 3,                 // ellipse width : height
  ENTITY_ALPHA: 0.28,        // peak darkness under entities
  MIN_WIDTH_ART: 8,          // never narrower than this (art px)
  MAX_WIDTH_ART: 44,         // never wider than this (art px) — oversized riders etc.
  FEET_INSET_ART: 1,         // ellipse center sits this far above the feet line (art px)
  FLOATING_SCALE: 0.7,       // floating entities: smaller shadow…
  FLOATING_ALPHA_SCALE: 0.75, // …and fainter (light diffuses with height)
  GROUND_LINE: 0.36,         // fallback ground: tileCenterY + tileSize × this
  FALLBACK_WIDTH_ART: 14,    // when the sprite can't be measured (not loaded / CORS)
  PROJECTILE_WIDTH_ART: 13,  // base projectile shadow width at scale 1
  PROJECTILE_MIN_WIDTH_ART: 6,
  PROJECTILE_DROP_ART: 7,    // how far below the bolt's center the shadow sits
  PROJECTILE_ALPHA: 0.16,
  ALPHA_THRESHOLD: 16,       // pixel counts as opaque above this alpha (0-255)
};

// ─── Toggle ─────────────────────────────────────────────────────────────────
const TOGGLE_KEY = 'blob_shadows';
let toggleCache: boolean | null = null;

export function blobShadowsEnabled(): boolean {
  if (toggleCache === null) {
    try {
      toggleCache = localStorage.getItem(TOGGLE_KEY) !== 'off';
    } catch {
      toggleCache = true;
    }
  }
  return toggleCache;
}

export function setBlobShadowsEnabled(on: boolean): void {
  toggleCache = on;
  try {
    localStorage.setItem(TOGGLE_KEY, on ? 'on' : 'off');
  } catch { /* private-mode etc. — session-only toggle still works */ }
}

// Console affordance: flip live while the render loop is running.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).toggleBlobShadows = () => {
    setBlobShadowsEnabled(!blobShadowsEnabled());
    return blobShadowsEnabled() ? 'blob shadows ON' : 'blob shadows OFF (legacy)';
  };
}

// ─── Sprite footprint measurement ───────────────────────────────────────────
// The shadow is sized from the sprite's opaque bounding box, measured once per
// image and cached. Measured on the canonical south/default idle frame so the
// shadow stays stable when the entity turns or switches animation.

interface Footprint {
  widthArt: number;    // opaque width of frame 0 (art px)
  centerXArt: number;  // opaque-center X relative to frame center (art px)
  feetYArt: number;    // bottom of opaque pixels relative to frame center (art px)
  frameW: number;      // full frame width (art px)
  frameH: number;      // full frame height (art px)
}

interface ResolvedSlot {
  src: string;
  frameCount: number;
  ax: number; ay: number; ox: number; oy: number;
  frameWidth?: number; frameHeight?: number;
}

// key: image src + frame box → measured footprint (null = measurement failed
// permanently, e.g. CORS-tainted canvas; fall back forever rather than retry)
const footprintCache = new Map<string, Footprint | null>();

function resolveFootprintSlot(sprite: CustomSprite): ResolvedSlot | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates: Array<Record<string, any>> = [];
  if (sprite.useDirectional && sprite.directionalSprites) {
    const south = sprite.directionalSprites['s'];
    const def = sprite.directionalSprites['default'];
    if (south) candidates.push(south);
    if (def) candidates.push(def);
  }
  candidates.push(sprite);

  for (const c of candidates) {
    const sheet: SpriteSheetConfig | undefined = c.idleSpriteSheet ?? c.movingSpriteSheet;
    const sheetSrc = resolveSpriteSheetSource(sheet);
    if (sheet && sheetSrc) {
      return {
        src: sheetSrc,
        frameCount: Math.max(1, sheet.frameCount || 1),
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
        ax: sheet.anchorX ?? 0.5, ay: sheet.anchorY ?? 0.5,
        ox: sheet.offsetX ?? 0, oy: sheet.offsetY ?? 0,
      };
    }
    const imgSrc = resolveImageSource(c.idleImageData ?? c.imageData, c.idleImageUrl ?? c.imageUrl);
    if (imgSrc) {
      return {
        src: imgSrc,
        frameCount: 1,
        ax: c.idleAnchorX ?? 0.5, ay: c.idleAnchorY ?? 0.5,
        ox: c.idleOffsetX ?? 0, oy: c.idleOffsetY ?? 0,
      };
    }
  }
  return null;
}

function measureFootprint(slot: ResolvedSlot): Footprint | null {
  const img = loadImage(slot.src);
  if (!img.complete || img.naturalWidth === 0) return null; // not loaded yet — retry next frame

  const fw = Math.max(1, Math.round(slot.frameWidth ?? img.naturalWidth / slot.frameCount));
  const fh = Math.max(1, Math.round(slot.frameHeight ?? img.naturalHeight));
  const cacheKey = `${slot.src.length}:${slot.src.slice(0, 64)}:${slot.src.slice(-32)}:${fw}x${fh}`;

  const cached = footprintCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result: Footprint | null = null;
  try {
    const off = document.createElement('canvas');
    off.width = fw;
    off.height = fh;
    const octx = off.getContext('2d', { willReadFrequently: true });
    if (octx) {
      octx.drawImage(img, 0, 0, fw, fh, 0, 0, fw, fh); // frame 0
      const data = octx.getImageData(0, 0, fw, fh).data;
      let minX = fw, maxX = -1, maxY = -1;
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          if (data[(y * fw + x) * 4 + 3] > KNOBS.ALPHA_THRESHOLD) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= 0) {
        result = {
          widthArt: maxX - minX + 1,
          centerXArt: (minX + maxX + 1) / 2 - fw / 2,
          feetYArt: (maxY + 1) - fh / 2,
          frameW: fw,
          frameH: fh,
        };
      }
    }
  } catch {
    // Tainted canvas (remote image without CORS) or similar — fall back for good.
    result = null;
  }
  footprintCache.set(cacheKey, result);
  return result;
}

// ─── Drawing ────────────────────────────────────────────────────────────────

function fillSoftEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, ry: number, alpha: number,
): void {
  if (rx <= 0 || ry <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.35, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(0.7, `rgba(0,0,0,${alpha * 0.85})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Grounded shadow for an entity standing on (or floating over) a tile.
 * Call BEFORE drawing the entity's sprite. Coordinates are in logical canvas
 * units (the same space drawEnemy/drawCharacter work in). Inherits the
 * caller's globalAlpha, so stealth fading applies to the shadow too.
 */
export function drawBlobShadow(
  ctx: CanvasRenderingContext2D,
  sprite: CustomSprite | undefined,
  tileCenterX: number,
  tileCenterY: number,
  tileSize: number,
  floating: boolean = false,
): void {
  const zoom = tileSize / ART_TILE_PX;

  let widthArt = sprite?.size ? sprite.size * ART_TILE_PX : KNOBS.FALLBACK_WIDTH_ART;
  let cx = tileCenterX;
  let groundY = tileCenterY + tileSize * KNOBS.GROUND_LINE;

  if (sprite) {
    const slot = resolveFootprintSlot(sprite);
    const fp = slot ? measureFootprint(slot) : null;
    if (fp && slot) {
      widthArt = fp.widthArt;
      // Reconstruct where the frame lands, matching drawSprite's anchor math
      // (approximate — the soft ellipse doesn't need pixel snapping):
      //   frameCenter = tileCenter + frameSize×(0.5 − anchor) + offset
      // then shift by the opaque bbox's position within the frame.
      const frameCenterX = tileCenterX + fp.frameW * zoom * (0.5 - slot.ax) + slot.ox * zoom;
      cx = frameCenterX + fp.centerXArt * zoom;
      if (!floating) {
        const frameCenterY = tileCenterY + fp.frameH * zoom * (0.5 - slot.ay) + slot.oy * zoom;
        groundY = frameCenterY + fp.feetYArt * zoom - KNOBS.FEET_INSET_ART * zoom;
      }
    }
  }

  let width = Math.min(Math.max(widthArt * KNOBS.WIDTH_RATIO, KNOBS.MIN_WIDTH_ART), KNOBS.MAX_WIDTH_ART) * zoom;
  let alpha = KNOBS.ENTITY_ALPHA;
  if (floating) {
    width *= KNOBS.FLOATING_SCALE;
    alpha *= KNOBS.FLOATING_ALPHA_SCALE;
  }
  const rx = width / 2;
  fillSoftEllipse(ctx, cx, groundY, rx, rx / KNOBS.SQUASH, alpha);
}

/**
 * Small, faint ground shadow under a projectile in flight. `scale` is the
 * projectile's final visual scale (including despawn shrink) so the shadow
 * shrinks and vanishes with the bolt.
 */
export function drawProjectileBlobShadow(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tileSize: number,
  scale: number,
): void {
  const zoom = tileSize / ART_TILE_PX;
  const widthArt = Math.max(KNOBS.PROJECTILE_MIN_WIDTH_ART, KNOBS.PROJECTILE_WIDTH_ART * scale);
  const rx = (widthArt * zoom) / 2;
  fillSoftEllipse(ctx, px, py + KNOBS.PROJECTILE_DROP_ART * zoom, rx, rx / KNOBS.SQUASH, KNOBS.PROJECTILE_ALPHA);
}
