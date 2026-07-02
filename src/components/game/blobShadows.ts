import type { CustomSprite, SpriteDirection } from '../../utils/assetStorage';
import { Direction } from '../../types/game';

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

// ─── Config resolution ──────────────────────────────────────────────────────
// Per-direction overrides beat sprite-level values beat the default. The
// direction fallback mirrors drawSprite: the facing's config, else 'default'.

export interface ResolvedShadow {
  widthArt: number;
  offsetXArt: number;
  offsetYArt: number;
}

function mapDirectionToSpriteDir(direction: Direction): SpriteDirection {
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

/** Resolve by sprite-direction key ('s', 'e', …). Pass undefined for the
 *  sprite-level base values (used by the Global Settings preview). */
export function resolveShadowConfigByKey(
  sprite: CustomSprite | undefined,
  dirKey?: SpriteDirection,
): ResolvedShadow {
  const dir = dirKey && sprite?.useDirectional && sprite.directionalSprites
    ? sprite.directionalSprites[dirKey] ?? sprite.directionalSprites['default']
    : undefined;
  return {
    widthArt: dir?.shadowWidth ?? sprite?.shadowWidth ?? KNOBS.DEFAULT_WIDTH_ART,
    offsetXArt: dir?.shadowOffsetX ?? sprite?.shadowOffsetX ?? 0,
    offsetYArt: dir?.shadowOffsetY ?? sprite?.shadowOffsetY ?? 0,
  };
}

/** Corpse shadow: the sprite's death* fields, inheriting the living base
 *  values. Death is a single global (non-directional) animation, so no
 *  per-direction resolution here. */
export function resolveDeathShadowConfig(sprite: CustomSprite | undefined): ResolvedShadow {
  return {
    widthArt: sprite?.deathShadowWidth ?? sprite?.shadowWidth ?? KNOBS.DEFAULT_WIDTH_ART,
    offsetXArt: sprite?.deathShadowOffsetX ?? sprite?.shadowOffsetX ?? 0,
    offsetYArt: sprite?.deathShadowOffsetY ?? sprite?.shadowOffsetY ?? 0,
  };
}

/** One full play of the death sheet, in ms. 0 when there's no animated death
 *  sheet (static death image or none) — treated as "already a corpse". */
function getDeathAnimDurationMs(sprite: CustomSprite | undefined): number {
  const sheet = sprite?.deathSpriteSheet;
  if (!sheet || !sheet.frameCount || sheet.frameCount <= 1) return 0;
  return (sheet.frameCount / (sheet.frameRate || 10)) * 1000;
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
 * Draw an already-resolved shadow config. Used directly by the editor
 * previews; the board path goes through drawBlobShadow below.
 */
export function drawBlobShadowResolved(
  ctx: CanvasRenderingContext2D,
  shadow: ResolvedShadow,
  tileCenterX: number,
  tileCenterY: number,
  tileSize: number,
  floating: boolean = false,
): void {
  if (shadow.widthArt <= 0) return; // per-sprite opt-out

  const zoom = tileSize / ART_TILE_PX;
  const cx = tileCenterX + shadow.offsetXArt * zoom;
  const cy = tileCenterY + tileSize * KNOBS.GROUND_LINE + shadow.offsetYArt * zoom;

  let width = shadow.widthArt * zoom;
  let alpha = KNOBS.ENTITY_ALPHA;
  if (floating) {
    width *= KNOBS.FLOATING_SCALE;
    alpha *= KNOBS.FLOATING_ALPHA_SCALE;
  }
  const rx = width / 2;
  fillSoftEllipse(ctx, cx, cy, rx, rx / KNOBS.SQUASH, alpha);
}

/**
 * Grounded shadow for an entity standing on (or floating over) a tile,
 * resolved for the direction currently being drawn (per-direction overrides
 * inherit from the sprite-level values). Call BEFORE drawing the entity's
 * sprite. Coordinates are in logical canvas units (the same space
 * drawEnemy/drawCharacter work in). Inherits the caller's globalAlpha, so
 * stealth fading applies to the shadow too.
 */
export function drawBlobShadow(
  ctx: CanvasRenderingContext2D,
  sprite: CustomSprite | undefined,
  direction: Direction | undefined,
  tileCenterX: number,
  tileCenterY: number,
  tileSize: number,
  floating: boolean = false,
): void {
  const dirKey = direction !== undefined ? mapDirectionToSpriteDir(direction) : undefined;
  const shadow = resolveShadowConfigByKey(sprite, dirKey);
  drawBlobShadowResolved(ctx, shadow, tileCenterX, tileCenterY, tileSize, floating);
}

/**
 * Shadow for a dying or dead entity. Lerps from the living shadow (resolved
 * for the facing the entity died with) to the corpse shadow across one play
 * of the death sheet, so the shadow follows the body as it falls — then holds
 * the corpse shadow. Ignores `floating`: a corpse lies on the ground.
 */
export function drawDeathBlobShadow(
  ctx: CanvasRenderingContext2D,
  sprite: CustomSprite | undefined,
  direction: Direction | undefined,
  tileCenterX: number,
  tileCenterY: number,
  tileSize: number,
  deathStartTime: number,
  now: number,
): void {
  const to = resolveDeathShadowConfig(sprite);
  const durationMs = getDeathAnimDurationMs(sprite);
  let shadow = to;
  if (durationMs > 0) {
    const t = Math.min(1, Math.max(0, (now - deathStartTime) / durationMs));
    if (t < 1) {
      const dirKey = direction !== undefined ? mapDirectionToSpriteDir(direction) : undefined;
      const from = resolveShadowConfigByKey(sprite, dirKey);
      shadow = {
        widthArt: from.widthArt + (to.widthArt - from.widthArt) * t,
        offsetXArt: from.offsetXArt + (to.offsetXArt - from.offsetXArt) * t,
        offsetYArt: from.offsetYArt + (to.offsetYArt - from.offsetYArt) * t,
      };
    }
  }
  drawBlobShadowResolved(ctx, shadow, tileCenterX, tileCenterY, tileSize, false);
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
