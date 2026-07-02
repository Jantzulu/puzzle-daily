// ============================================================================
// WALL-CONTACT AMBIENT OCCLUSION
// ============================================================================
// Darkens the edges of floor tiles that border walls or voids, so the dungeon
// reads as carved out of stone rather than assembled from flat tiles.
//
// Strictly per-tile local: each floor tile independently asks "is my N/W/E
// neighbor an occluder?" and shades only its own pixels. There is no wall-run
// tracing and no shadow polygon, so irregular maps (voids, tile islands) have
// no edge cases by construction — and the walls' own rendering is never
// touched, only floor pixels are darkened.
//
// Light-from-above weighting: north edges are strongest (a wall above casts
// down onto the floor), west/east are softer, south casts nothing. Corner
// patches fill in diagonal-only occluders. Out-of-bounds counts as wall,
// matching the 3D dungeon border that surrounds the playable area.
//
// The gradient strips are rendered once per tile size and reused; per-frame
// cost is a few drawImage calls per affected tile.
//
// Purely visual — no game state is read or written.
//
// Runtime toggle (for live comparison):
//   toggleWallAO()            — from the browser console
//   localStorage 'wall_ao'    — 'off' disables

// ─── Tuning knobs ───────────────────────────────────────────────────────────
const KNOBS = {
  DEPTH_RATIO: 0.22,   // shade depth as a fraction of tile size
  ALPHA_N: 0.32,       // north edge (wall above) — strongest
  ALPHA_SIDE: 0.18,    // west/east edges
  ALPHA_CORNER: 0.24,  // diagonal-only corner patches (NW/NE)
};

/** Whether void (null) tiles cast occlusion like walls do. Flip to false to
 *  treat voids as open pits that cast nothing. */
export const AO_VOID_OCCLUDES = true;

// ─── Toggle ─────────────────────────────────────────────────────────────────
const TOGGLE_KEY = 'wall_ao';
let toggleCache: boolean | null = null;

export function wallAOEnabled(): boolean {
  if (toggleCache === null) {
    try {
      toggleCache = localStorage.getItem(TOGGLE_KEY) !== 'off';
    } catch {
      toggleCache = true;
    }
  }
  return toggleCache;
}

export function setWallAOEnabled(on: boolean): void {
  toggleCache = on;
  try {
    localStorage.setItem(TOGGLE_KEY, on ? 'on' : 'off');
  } catch { /* session-only toggle still works */ }
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).toggleWallAO = () => {
    setWallAOEnabled(!wallAOEnabled());
    return wallAOEnabled() ? 'wall AO ON' : 'wall AO OFF';
  };
}

// ─── Pre-rendered strips ────────────────────────────────────────────────────

interface AOStrips {
  n: HTMLCanvasElement;
  w: HTMLCanvasElement;
  e: HTMLCanvasElement;
  nw: HTMLCanvasElement;
  ne: HTMLCanvasElement;
  depth: number;
}

const stripCache = new Map<number, AOStrips>();

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d')!];
}

function getStrips(tileSize: number): AOStrips {
  const cached = stripCache.get(tileSize);
  if (cached) return cached;

  const depth = Math.round(tileSize * KNOBS.DEPTH_RATIO);

  // North: full-width strip fading downward
  const [n, nctx] = makeCanvas(tileSize, depth);
  const ng = nctx.createLinearGradient(0, 0, 0, depth);
  ng.addColorStop(0, `rgba(0,0,0,${KNOBS.ALPHA_N})`);
  ng.addColorStop(1, 'rgba(0,0,0,0)');
  nctx.fillStyle = ng;
  nctx.fillRect(0, 0, tileSize, depth);

  // West: full-height strip fading rightward
  const [w, wctx] = makeCanvas(depth, tileSize);
  const wg = wctx.createLinearGradient(0, 0, depth, 0);
  wg.addColorStop(0, `rgba(0,0,0,${KNOBS.ALPHA_SIDE})`);
  wg.addColorStop(1, 'rgba(0,0,0,0)');
  wctx.fillStyle = wg;
  wctx.fillRect(0, 0, depth, tileSize);

  // East: mirror of west
  const [e, ectx] = makeCanvas(depth, tileSize);
  const eg = ectx.createLinearGradient(depth, 0, 0, 0);
  eg.addColorStop(0, `rgba(0,0,0,${KNOBS.ALPHA_SIDE})`);
  eg.addColorStop(1, 'rgba(0,0,0,0)');
  ectx.fillStyle = eg;
  ectx.fillRect(0, 0, depth, tileSize);

  // Corner patches: radial from the corner point, for diagonal-only occluders
  const corner = (originX: number): HTMLCanvasElement => {
    const [c, cctx] = makeCanvas(depth, depth);
    const g = cctx.createRadialGradient(originX, 0, 0, originX, 0, depth);
    g.addColorStop(0, `rgba(0,0,0,${KNOBS.ALPHA_CORNER})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    cctx.fillStyle = g;
    cctx.fillRect(0, 0, depth, depth);
    return c;
  };

  const strips: AOStrips = { n, w, e, nw: corner(0), ne: corner(depth), depth };
  stripCache.set(tileSize, strips);
  return strips;
}

export interface AOOccluders {
  n: boolean;
  w: boolean;
  e: boolean;
  nw: boolean;
  ne: boolean;
}

/**
 * Shade one floor tile's edges. (px, py) is the tile's top-left in the same
 * logical space the tiles are drawn in. Corner patches only fire when the
 * occluder is diagonal-only (the adjacent edges would otherwise cover it).
 */
export function drawWallAO(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tileSize: number,
  occ: AOOccluders,
): void {
  if (!occ.n && !occ.w && !occ.e && !occ.nw && !occ.ne) return;
  const strips = getStrips(tileSize);
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true; // soft gradients under the pixel-art layer
  if (occ.n) ctx.drawImage(strips.n, px, py);
  if (occ.w) ctx.drawImage(strips.w, px, py);
  if (occ.e) ctx.drawImage(strips.e, px + tileSize - strips.depth, py);
  if (occ.nw && !occ.n && !occ.w) ctx.drawImage(strips.nw, px, py);
  if (occ.ne && !occ.n && !occ.e) ctx.drawImage(strips.ne, px + tileSize - strips.depth, py);
  ctx.imageSmoothingEnabled = prevSmoothing;
}
