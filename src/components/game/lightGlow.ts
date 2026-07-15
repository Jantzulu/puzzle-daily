import type { CustomSprite } from '../../utils/assetStorage';

// ============================================================================
// EMITTED-LIGHT GLOW
// ============================================================================
// The additive counterpart of blobShadows.ts: entities and projectiles that
// emit light (torches, fireballs, wisps) get a soft radial halo drawn behind
// the sprite, centered on the body rather than the ground point.
//
// Opt-in per sprite: setting CustomSprite.glowColor enables it; radius,
// intensity, offsets, and flicker tune it (art px, edited alongside the
// Ground Shadow settings). Unset color = no glow, no cost.
//
// Purely visual — no game state is read or written, nothing here can affect
// the logic loop, determinism, or replays. Flicker is a pure function of the
// render clock, so two clients on the same frame time draw the same halo.
//
// Runtime toggle (for live comparison while tuning):
//   toggleLightGlow()            — from the browser console
//   localStorage 'light_glow'    — 'off' disables; anything else enables

const ART_TILE_PX = 24; // a tile is 24×24 art pixels

// ─── Tuning knobs ───────────────────────────────────────────────────────────
const KNOBS = {
  DEFAULT_RADIUS_ART: 16,   // halo radius when the sprite doesn't override it
  DEFAULT_INTENSITY: 0.35,  // peak alpha at the halo's center
  MID_STOP: 0.45,           // gradient mid-stop position…
  MID_ALPHA: 0.4,           // …and its alpha share of the peak
  FLICKER_DEPTH: 0.12,      // alpha swing of the flicker (fraction of peak)
  FLICKER_RADIUS_DEPTH: 0.04, // radius swing of the flicker
};

// ─── Toggle ─────────────────────────────────────────────────────────────────
const TOGGLE_KEY = 'light_glow';
let toggleCache: boolean | null = null;

export function lightGlowEnabled(): boolean {
  if (toggleCache === null) {
    try {
      toggleCache = localStorage.getItem(TOGGLE_KEY) !== 'off';
    } catch {
      toggleCache = true;
    }
  }
  return toggleCache;
}

export function setLightGlowEnabled(on: boolean): void {
  toggleCache = on;
  try {
    localStorage.setItem(TOGGLE_KEY, on ? 'on' : 'off');
  } catch { /* private-mode etc. — session-only toggle still works */ }
}

// Console affordance: flip live while the render loop is running.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).toggleLightGlow = () => {
    setLightGlowEnabled(!lightGlowEnabled());
    return lightGlowEnabled() ? 'light glow ON' : 'light glow OFF';
  };
}

// ─── Config resolution ──────────────────────────────────────────────────────
// Sprite-level only: light is omnidirectional, so unlike shadows there are no
// per-direction overrides.

export interface ResolvedGlow {
  color: string;      // hex (#rgb or #rrggbb)
  radiusArt: number;  // halo radius in art px
  intensity: number;  // 0..1 peak alpha at the center
  offsetXArt: number; // shift from sprite center (positive = right)
  offsetYArt: number; // (positive = down)
  flicker: boolean;   // subtle torch-like shimmer
}

/** null = this sprite emits no light (the common case). */
export function resolveGlowConfig(sprite: CustomSprite | undefined): ResolvedGlow | null {
  if (!sprite?.glowColor) return null;
  const radiusArt = sprite.glowRadius ?? KNOBS.DEFAULT_RADIUS_ART;
  if (radiusArt <= 0) return null;
  return {
    color: sprite.glowColor,
    radiusArt,
    intensity: Math.min(1, Math.max(0, sprite.glowIntensity ?? KNOBS.DEFAULT_INTENSITY)),
    offsetXArt: sprite.glowOffsetX ?? 0,
    offsetYArt: sprite.glowOffsetY ?? 0,
    flicker: !!sprite.glowFlicker,
  };
}

// ─── Drawing ────────────────────────────────────────────────────────────────

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (m3) {
    return { r: parseInt(m3[1] + m3[1], 16), g: parseInt(m3[2] + m3[2], 16), b: parseInt(m3[3] + m3[3], 16) };
  }
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m6) {
    return { r: parseInt(m6[1], 16), g: parseInt(m6[2], 16), b: parseInt(m6[3], 16) };
  }
  return null;
}

/** Torch shimmer in [1-depth, 1]: two incommensurate sines off the render
 *  clock — organic-looking, but a pure function of `now` (deterministic). */
function flickerFactor(now: number, depth: number): number {
  const t = now / 1000;
  const wave = Math.sin(t * 9.3) * 0.6 + Math.sin(t * 23.7 + 1.3) * 0.4; // -1..1
  return 1 - depth * (0.5 + wave * 0.5);
}

// ─── Cached halo sprites ────────────────────────────────────────────────────
// One pre-rendered halo per glow COLOR: the gradient stops are LINEAR in
// alpha (α, α·MID_ALPHA, 0), so globalAlpha + scaled drawImage reproduce
// every intensity/flicker state exactly — without a createRadialGradient
// allocation per glowing entity per frame (user-felt mobile jank 2026-07-15).
// Authored glowColor values are a handful of hexes, so the map stays tiny.
const GLOW_SPRITE_R = 128;
const glowSprites = new Map<string, HTMLCanvasElement>();

function getGlowSprite(rgbStr: string): HTMLCanvasElement | null {
  const cached = glowSprites.get(rgbStr);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = GLOW_SPRITE_R * 2;
  const cctx = c.getContext('2d');
  if (!cctx) return null;
  const R = GLOW_SPRITE_R;
  const g = cctx.createRadialGradient(R, R, 0, R, R, R);
  g.addColorStop(0, `rgba(${rgbStr},1)`);
  g.addColorStop(KNOBS.MID_STOP, `rgba(${rgbStr},${KNOBS.MID_ALPHA})`);
  g.addColorStop(1, `rgba(${rgbStr},0)`);
  cctx.fillStyle = g;
  cctx.beginPath();
  cctx.arc(R, R, R, 0, Math.PI * 2);
  cctx.fill();
  glowSprites.set(rgbStr, c);
  return c;
}

/**
 * Draw an already-resolved glow. Used directly by the editor previews; the
 * board paths go through drawLightGlow below. `centerX/centerY` is the sprite
 * center in logical canvas units; `scale` shrinks the halo with the sprite
 * (projectile despawn). Inherits the caller's globalAlpha, so stealth fading
 * dims the light too.
 */
export function drawLightGlowResolved(
  ctx: CanvasRenderingContext2D,
  glow: ResolvedGlow,
  centerX: number,
  centerY: number,
  tileSize: number,
  now: number,
  scale: number = 1,
): void {
  const rgb = parseHexColor(glow.color);
  if (!rgb || scale <= 0) return;

  const zoom = tileSize / ART_TILE_PX;
  let alpha = glow.intensity;
  let radius = glow.radiusArt * zoom * scale;
  if (glow.flicker) {
    alpha *= flickerFactor(now, KNOBS.FLICKER_DEPTH);
    radius *= flickerFactor(now * 1.31 + 400, KNOBS.FLICKER_RADIUS_DEPTH);
  }
  if (radius <= 0 || alpha <= 0) return;

  const cx = centerX + glow.offsetXArt * zoom;
  const cy = centerY + glow.offsetYArt * zoom;
  const rgbStr = `${rgb.r},${rgb.g},${rgb.b}`;

  const sprite = getGlowSprite(rgbStr);
  if (!sprite) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Callers on the legacy-shadow path have ctx.shadow* armed for the sprite
  // draw — without this the halo would cast its own offset silhouette.
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.globalAlpha = ctx.globalAlpha * alpha; // stops are alpha-linear — exact
  ctx.imageSmoothingEnabled = true; // the scaled halo must stay soft on pixelated boards
  ctx.drawImage(sprite, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
}

/**
 * Halo behind a living entity or a projectile in flight. Call AFTER the blob
 * shadow and BEFORE the sprite so the light reads as coming from behind the
 * body. No-op unless the sprite opts in via glowColor.
 */
export function drawLightGlow(
  ctx: CanvasRenderingContext2D,
  sprite: CustomSprite | undefined,
  centerX: number,
  centerY: number,
  tileSize: number,
  now: number,
  scale: number = 1,
): void {
  if (!lightGlowEnabled()) return;
  const glow = resolveGlowConfig(sprite);
  if (!glow) return;
  drawLightGlowResolved(ctx, glow, centerX, centerY, tileSize, now, scale);
}
