// Hallway rendering — shared by the game board (AnimatedGameBoard's baked
// static layers) and the map editor canvas, so the editor preview and the
// live dungeon can't drift. A hallway marker opens the rendered wall on one
// side of an edge tile into a faux corridor drawn INSIDE the existing
// border band: the corridor floor paints over the wall segment, thin flank
// strips suggest the corridor's own walls, and a darkness gradient
// swallows the far half. Purely visual — the corridor is off-grid, so
// entities and the solver never interact with it.
//
// Geometry: corridors fill the band exactly (top/bottom = BORDER_SIZE deep,
// left/right = SIDE_BORDER_SIZE deep), so the canvas never grows and the
// board's fit-scale math is untouched — the locked "excluded from sizing"
// rule. Draw calls happen in the tile-translated coordinate space (negative
// coords reach into the band).
import type { CustomBorderSprites, HallwayMarker, HallwaySide, TileOrNull } from '../types/game';
import { TileType } from '../types/game';

/** Skin sprite slot for a hallway side (phase 1.5 skinnable pieces). */
export function hallwaySpriteSlot(side: HallwaySide): keyof CustomBorderSprites {
  return side === 'top' ? 'hallwayTop'
    : side === 'bottom' ? 'hallwayBottom'
    : side === 'left' ? 'hallwayLeft'
    : 'hallwayRight';
}

/** Offset from a tile to its neighbor through the given side. */
export const SIDE_OFFSETS: Record<HallwaySide, { dx: number; dy: number }> = {
  top: { dx: 0, dy: -1 },
  bottom: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

function isPlayable(tiles: TileOrNull[][], x: number, y: number, width: number, height: number): boolean {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  return tiles[y]?.[x] !== null && tiles[y]?.[x] !== undefined;
}

/**
 * A marker is drawable only while its tile is a real floor and the marked
 * side still borders void/out-of-bounds (i.e. a rendered wall exists
 * there — the same neighbor rule computeSmartBorder uses). Stale markers
 * (tile voided, edge walled in, grid resized) are skipped, not errors.
 */
export function isValidHallway(
  marker: HallwayMarker,
  tiles: TileOrNull[][],
  width: number,
  height: number,
): boolean {
  const tile = isPlayable(tiles, marker.x, marker.y, width, height)
    ? tiles[marker.y][marker.x]
    : null;
  if (!tile || tile.type === TileType.WALL) return false;
  const off = SIDE_OFFSETS[marker.side];
  return !isPlayable(tiles, marker.x + off.dx, marker.y + off.dy, width, height);
}

/**
 * Draw one hallway opening. `ctx` must already be translated to the tile
 * grid origin (the same space tiles draw in). `drawFloorTile` is the
 * caller's own floor painter — invoked at the corridor's off-grid neighbor
 * coordinate inside a clip, so the corridor floor is the caller's skin
 * floor and stays seamless with the room.
 */
export function drawHallwayOpening(
  ctx: CanvasRenderingContext2D,
  marker: HallwayMarker,
  tileSize: number,
  verticalDepth: number,   // corridor depth for top/bottom sides (= BORDER_SIZE)
  horizontalDepth: number, // corridor depth for left/right sides (= SIDE_BORDER_SIZE)
  drawFloorTile: (ctx: CanvasRenderingContext2D, gridX: number, gridY: number) => void,
  // Skin piece (phase 1.5): a loaded, .complete image for this side's
  // hallway slot. When provided it replaces the procedural corridor
  // interior (floor + jambs); the darkness fade still applies on top.
  spriteImg?: HTMLImageElement | null,
): void {
  const { x, y, side } = marker;
  const t = tileSize;
  const depth = side === 'top' || side === 'bottom' ? verticalDepth : horizontalDepth;
  const off = SIDE_OFFSETS[side];

  // Corridor rect in translated grid pixels.
  let rx: number, ry: number, rw: number, rh: number;
  switch (side) {
    case 'top':    rx = x * t; ry = y * t - depth; rw = t; rh = depth; break;
    case 'bottom': rx = x * t; ry = (y + 1) * t;   rw = t; rh = depth; break;
    case 'left':   rx = x * t - depth; ry = y * t; rw = depth; rh = t; break;
    case 'right':  rx = (x + 1) * t;   ry = y * t; rw = depth; rh = t; break;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();

  if (spriteImg) {
    // Skinned corridor interior — one authored piece fills the band.
    ctx.drawImage(spriteImg, rx, ry, rw, rh);
    drawDarkness(ctx, marker.side, rx, ry, rw, rh);
    ctx.restore();
    return;
  }

  // 1. Corridor floor: the caller's floor tile drawn at the off-grid
  //    neighbor cell, clipped to the corridor. Because the clip keeps the
  //    sliver ADJACENT to the room tile, the floor texture continues
  //    seamlessly through the opening.
  drawFloorTile(ctx, x + off.dx, y + off.dy);

  // 2. Jamb walls — the corridor's own side walls, in the dungeon
  //    border's stone tones (body + a lit edge facing the corridor), so
  //    the opening reads as the wall TURNING into the corridor and the
  //    band's cut ends get faces, instead of the wall simply stopping
  //    (user note, 2026-07-16). The darkness pass below swallows their
  //    far halves along with the floor.
  const flank = Math.max(4, Math.round(t / 8));
  const lip = Math.max(1, Math.round(flank / 3));
  ctx.fillStyle = '#323242';
  if (side === 'top' || side === 'bottom') {
    ctx.fillRect(rx, ry, flank, rh);
    ctx.fillRect(rx + rw - flank, ry, flank, rh);
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(rx + flank - lip, ry, lip, rh);
    ctx.fillRect(rx + rw - flank, ry, lip, rh);
  } else {
    ctx.fillRect(rx, ry, rw, flank);
    ctx.fillRect(rx, ry + rh - flank, rw, flank);
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(rx, ry + flank - lip, rw, lip);
    ctx.fillRect(rx, ry + rh - flank, rw, lip);
  }

  // 3. Darkness fade over everything.
  drawDarkness(ctx, side, rx, ry, rw, rh);

  ctx.restore();
}

/**
 * Darkness: from a light dimming at the opening to FULLY opaque black at
 * the far end — the half furthest from the puzzle drowns. There is
 * deliberately NO back wall: full black dissolves into the void around
 * the board, so the corridor reads as continuing an unknown distance
 * (user design, 2026-07-16). Applied over both the procedural corridor
 * and skinned pieces, so artists draw their hallway art fully lit.
 */
function drawDarkness(
  ctx: CanvasRenderingContext2D,
  side: HallwaySide,
  rx: number, ry: number, rw: number, rh: number,
): void {
  let grad: CanvasGradient;
  switch (side) {
    case 'top':    grad = ctx.createLinearGradient(0, ry + rh, 0, ry); break;
    case 'bottom': grad = ctx.createLinearGradient(0, ry, 0, ry + rh); break;
    case 'left':   grad = ctx.createLinearGradient(rx + rw, 0, rx, 0); break;
    case 'right':  grad = ctx.createLinearGradient(rx, 0, rx + rw, 0); break;
  }
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.12)');
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.5)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 1)');
  ctx.fillStyle = grad;
  ctx.fillRect(rx, ry, rw, rh);
}
