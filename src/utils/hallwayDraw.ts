// Hallway rendering — shared by the game board (AnimatedGameBoard's baked
// static layers) and the map editor canvas, so the editor preview and the
// live dungeon can't drift. A hallway marker opens the rendered wall on one
// side of an edge tile into a faux corridor drawn INSIDE the existing
// border band, and a darkness gradient swallows the far half. Purely
// visual — the corridor is off-grid, so entities and the solver never
// interact with it.
//
// Opening geometry (2026-07-16 rework): the mouth is rendered with the
// skin's REAL border-corner vocabulary — the same inner-corner pieces
// computeSmartBorder would emit if the corridor were actual map tiles cut
// through the wall. The marker tile, with its corridor side treated as
// playable, emits concave corners per the autotiler's own rules (neighbor
// playable + diagonal void), so openings look and behave like real inner
// corners instead of bespoke jamb slivers (user design). The skin's
// hallway slots are the corridor FLOOR/interior only; walls and corners
// come from the border sprite set.
//
// Sizing contract: corridors draw only into band/overhang pixels — the
// board's fit-scale math never includes them (the locked "excluded from
// sizing" rule). Draw calls happen in the tile-translated coordinate
// space (negative coords reach into the band).
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
 * The off-grid cells occupied by every valid marker's corridor, as "x,y"
 * keys. The mouth-corner rules treat these as playable so adjacent
 * hallways merge into one wide opening (no phantom wall between them) —
 * exactly what the autotiler would do if the corridors were real tiles.
 */
export function collectCorridorCells(
  markers: HallwayMarker[] | undefined,
  tiles: TileOrNull[][],
  width: number,
  height: number,
): Set<string> {
  const cells = new Set<string>();
  (markers ?? []).forEach(m => {
    if (!isValidHallway(m, tiles, width, height)) return;
    const off = SIDE_OFFSETS[m.side];
    cells.add(`${m.x + off.dx},${m.y + off.dy}`);
  });
  return cells;
}

/**
 * Everything drawHallwayOpening needs, built once per pass by the caller.
 * `getImage` resolves a border sprite slot to a loaded HTMLImageElement or
 * null (missing / still loading → procedural fallback piece).
 */
export interface HallwayDrawConfig {
  tileSize: number;
  borderSize: number;      // top/bottom band depth (B) — also the corner-piece height
  sideBorderSize: number;  // side wall width (S) — also the corner-piece width
  verticalDepth: number;   // corridor depth for top/bottom markers
  horizontalDepth: number; // corridor depth for left/right markers
  tiles: TileOrNull[][];
  gridWidth: number;
  gridHeight: number;
  corridorCells: Set<string>; // from collectCorridorCells
  getImage: (slot: keyof CustomBorderSprites) => HTMLImageElement | null;
  drawFloorTile: (ctx: CanvasRenderingContext2D, gridX: number, gridY: number) => void;
}

/**
 * Draw one hallway opening. `ctx` must already be translated to the tile
 * grid origin (the same space tiles draw in).
 */
export function drawHallwayOpening(
  ctx: CanvasRenderingContext2D,
  marker: HallwayMarker,
  cfg: HallwayDrawConfig,
): void {
  const { x, y, side } = marker;
  const t = cfg.tileSize;
  const depth = side === 'top' || side === 'bottom' ? cfg.verticalDepth : cfg.horizontalDepth;
  const off = SIDE_OFFSETS[side];

  // Corridor rect in translated grid pixels.
  let rx: number, ry: number, rw: number, rh: number;
  switch (side) {
    case 'top':    rx = x * t; ry = y * t - depth; rw = t; rh = depth; break;
    case 'bottom': rx = x * t; ry = (y + 1) * t;   rw = t; rh = depth; break;
    case 'left':   rx = x * t - depth; ry = y * t; rw = depth; rh = t; break;
    case 'right':  rx = (x + 1) * t;   ry = y * t; rw = depth; rh = t; break;
  }

  // ── Corridor interior (clipped to the corridor rect) ──
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();

  const interiorImg = cfg.getImage(hallwaySpriteSlot(side));
  if (interiorImg) {
    // Skinned corridor interior — authored floor art fills the corridor.
    ctx.drawImage(interiorImg, rx, ry, rw, rh);
  } else {
    // Procedural floor: the caller's floor tile at each off-grid corridor
    // cell. The clip keeps it adjacent to the room tile so the texture
    // continues seamlessly through the opening; deep corridors repeat the
    // tile outward until the rect is covered.
    const cells = Math.ceil(depth / t);
    for (let i = 1; i <= cells; i++) {
      cfg.drawFloorTile(ctx, x + off.dx * i, y + off.dy * i);
    }
  }

  const horizontal = side === 'left' || side === 'right';
  if (!horizontal) {
    // Top/bottom: the mouth corners span the full corridor depth, so the
    // corridor needs no walls of its own — darken and done.
    drawDarkness(ctx, side, rx, ry, rw, rh);
    ctx.restore();
  } else {
    // Left/right: the corridor runs sideways, so it carries its own walls
    // in the rows above/below it (drawn unclipped, then one darkness pass
    // fades corridor and walls together toward the far end).
    ctx.restore();
    drawFlankWalls(ctx, marker, cfg, rx, ry, rw, rh);
    drawDarkness(ctx, side, rx, ry - cfg.borderSize, rw, cfg.borderSize + rh + cfg.sideBorderSize);
  }

  // ── Mouth corners (last — they sit at the mouth and stay lit) ──
  drawMouthCorners(ctx, marker, cfg);
}

/**
 * A horizontal corridor's own walls — what the autotiler would put on the
 * corridor cell's exposed edges: a front-facing wall (B tall) filling the
 * band row above it, and a wallTop lip (S tall) below. Skipped where the
 * neighboring cell is floor or another corridor (openings merge). The
 * darkness pass swallows their far ends along with the floor.
 */
function drawFlankWalls(
  ctx: CanvasRenderingContext2D,
  marker: HallwayMarker,
  cfg: HallwayDrawConfig,
  rx: number, ry: number, rw: number, rh: number,
): void {
  const { x, y, side } = marker;
  const dx = side === 'left' ? -1 : 1;
  const open = (tx: number, ty: number): boolean =>
    isPlayable(cfg.tiles, tx, ty, cfg.gridWidth, cfg.gridHeight) || cfg.corridorCells.has(`${tx},${ty}`);

  if (!open(x + dx, y - 1)) {
    const img = cfg.getImage('wallFront');
    if (img) {
      ctx.drawImage(img, rx, ry - cfg.borderSize, rw, cfg.borderSize);
    } else {
      drawProceduralWall(ctx, rx, ry - cfg.borderSize, rw, cfg.borderSize, 'bottom');
    }
  }
  if (!open(x + dx, y + 1)) {
    const img = cfg.getImage('wallTop');
    if (img) {
      ctx.drawImage(img, rx, ry + rh, rw, cfg.sideBorderSize);
    } else {
      drawProceduralWall(ctx, rx, ry + rh, rw, cfg.sideBorderSize, 'top');
    }
  }
}

/** Procedural stand-in for a missing wall sprite along a corridor flank. */
function drawProceduralWall(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, w: number, h: number,
  litEdge: 'top' | 'bottom',
): void {
  const lip = Math.max(1, Math.round(h / 8));
  ctx.fillStyle = '#323242';
  ctx.fillRect(px, py, w, h);
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(px, litEdge === 'top' ? py : py + h - lip, w, lip);
}

/**
 * Mouth corners: the inner-corner pieces the marker tile would emit from
 * computeSmartBorder if its corridor were playable tiles. Conditions
 * mirror the autotiler exactly — concave corner = both adjacent neighbors
 * playable (corridor counts) + the diagonal between them void. Corridor
 * cells of OTHER valid hallways count as playable too, so adjacent
 * openings merge without phantom shoulders.
 */
function drawMouthCorners(
  ctx: CanvasRenderingContext2D,
  marker: HallwayMarker,
  cfg: HallwayDrawConfig,
): void {
  const { x, y, side } = marker;
  const t = cfg.tileSize;
  const S = cfg.sideBorderSize;
  const B = cfg.borderSize;

  const playable = (tx: number, ty: number): boolean =>
    isPlayable(cfg.tiles, tx, ty, cfg.gridWidth, cfg.gridHeight) || cfg.corridorCells.has(`${tx},${ty}`);

  // piece(slot, thinSlot?) draws with the smart border's fallback chain:
  // thin variants fall back to full, missing art falls back to procedural.
  const piece = (
    slot: keyof CustomBorderSprites,
    px: number, py: number, w: number, h: number,
    litEdge: 'left' | 'right',
    fallbackSlot?: keyof CustomBorderSprites,
  ) => {
    const img = cfg.getImage(slot) ?? (fallbackSlot ? cfg.getImage(fallbackSlot) : null);
    if (img) {
      ctx.drawImage(img, px, py, w, h);
    } else {
      drawProceduralCorner(ctx, px, py, w, h, litEdge);
    }
  };

  switch (side) {
    case 'top': {
      // Marker tile's concave-tl / concave-tr with the corridor above it.
      if (playable(x - 1, y) && !playable(x - 1, y - 1)) {
        piece('innerCornerTopLeft', x * t - S, y * t - B, S, B, 'right');
      }
      if (playable(x + 1, y) && !playable(x + 1, y - 1)) {
        piece('innerCornerTopRight', x * t + t, y * t - B, S, B, 'left');
      }
      break;
    }
    case 'bottom': {
      // Outer-perimeter bottom corners are full height, like the band.
      if (playable(x - 1, y) && !playable(x - 1, y + 1)) {
        piece('innerCornerBottomLeft', x * t - S, (y + 1) * t, S, B, 'right');
      }
      if (playable(x + 1, y) && !playable(x + 1, y + 1)) {
        piece('innerCornerBottomRight', x * t + t, (y + 1) * t, S, B, 'left');
      }
      break;
    }
    case 'left': {
      // Wall above the mouth turns into the corridor: full-height inner
      // corner. Below the mouth the corridor lip meets the side wall: thin.
      if (playable(x, y - 1) && !playable(x - 1, y - 1)) {
        piece('innerCornerTopLeft', x * t - S, y * t - B, S, B, 'right');
      }
      if (playable(x, y + 1) && !playable(x - 1, y + 1)) {
        piece('innerCornerBottomLeftThin', x * t - S, (y + 1) * t, S, S, 'right', 'innerCornerBottomLeft');
      }
      break;
    }
    case 'right': {
      if (playable(x, y - 1) && !playable(x + 1, y - 1)) {
        piece('innerCornerTopRight', x * t + t, y * t - B, S, B, 'left');
      }
      if (playable(x, y + 1) && !playable(x + 1, y + 1)) {
        piece('innerCornerBottomRightThin', x * t + t, (y + 1) * t, S, S, 'left', 'innerCornerBottomRight');
      }
      break;
    }
  }
}

/**
 * Procedural stand-in for a missing inner-corner sprite: a stone block in
 * the dungeon border's tones with a lit lip on the corridor-facing edge —
 * same palette the old jambs used, now positioned as a real corner piece.
 */
function drawProceduralCorner(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, w: number, h: number,
  litEdge: 'left' | 'right',
): void {
  const lip = Math.max(1, Math.round(w / 5));
  ctx.fillStyle = '#323242';
  ctx.fillRect(px, py, w, h);
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(litEdge === 'left' ? px : px + w - lip, py, lip, h);
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
