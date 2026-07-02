import type { CustomSprite } from '../../utils/assetStorage';

// ============================================================================
// GROUNDED BLOB SHADOWS
// ============================================================================
// Replaces the offset-silhouette entity shadows (ctx.shadowColor + offset)
// with a soft ellipse at the tile's ground point, so entities read as
// standing ON the board instead of stickered onto it. Projectiles get a
// smaller, fainter ellipse offset below their flight line to sell altitude.
//
// Sizing/placement is deliberately manual: every sprite gets a true
// tile-centered shadow at a standard width by default, and exceptions are
// tailored per sprite via CustomSprite.shadowWidth / shadowOffsetX /
// shadowOffsetY (art px, edited in the Sprite Editor). shadowWidth = 0
// hides the shadow for that sprite.
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
  DEFAULT_WIDTH_ART: 14,      // shadow width when the sprite doesn't override it
  SQUASH: 3,                  // ellipse width : height
  ENTITY_ALPHA: 0.28,         // peak darkness under entities
  GROUND_LINE: 0.36,          // ground point: tileCenterY + tileSize × this
  FLOATING_SCALE: 0.7,        // floating entities: smaller shadow…
  FLOATING_ALPHA_SCALE: 0.75, // …and fainter (light diffuses with height)
  PROJECTILE_WIDTH_ART: 13,   // base projectile shadow width at scale 1
  PROJECTILE_MIN_WIDTH_ART: 6,
  PROJECTILE_DROP_ART: 7,     // how far below the bolt's center the shadow sits
  PROJECTILE_ALPHA: 0.16,
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
  const widthArt = sprite?.shadowWidth ?? KNOBS.DEFAULT_WIDTH_ART;
  if (widthArt <= 0) return; // per-sprite opt-out

  const zoom = tileSize / ART_TILE_PX;
  const cx = tileCenterX + (sprite?.shadowOffsetX ?? 0) * zoom;
  const cy = tileCenterY + tileSize * KNOBS.GROUND_LINE + (sprite?.shadowOffsetY ?? 0) * zoom;

  let width = widthArt * zoom;
  let alpha = KNOBS.ENTITY_ALPHA;
  if (floating) {
    width *= KNOBS.FLOATING_SCALE;
    alpha *= KNOBS.FLOATING_ALPHA_SCALE;
  }
  const rx = width / 2;
  fillSoftEllipse(ctx, cx, cy, rx, rx / KNOBS.SQUASH, alpha);
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
