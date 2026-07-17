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
  const horizontalSide = side === 'left' || side === 'right';
  // Procedural floor base: the caller's floor tile at each off-grid
  // corridor cell. The clip keeps it adjacent to the room tile so the
  // texture continues seamlessly through the opening; deep corridors
  // repeat the tile outward until the rect is covered. Skipped only when
  // a skin piece covers the whole corridor by itself.
  if (!interiorImg || !horizontalSide) {
    const cells = Math.ceil(depth / t);
    for (let i = 1; i <= cells; i++) {
      cfg.drawFloorTile(ctx, x + off.dx * i, y + off.dy * i);
    }
  }
  if (interiorImg) {
    if (horizontalSide) {
      // Skinned corridor interior fills the corridor (48x48 nominal).
      ctx.drawImage(interiorImg, rx, ry, rw, rh);
    } else {
      // Vertical corridors run deeper than the authored piece (band depth
      // + protrusion) — the art keeps its designed size at the mouth, the
      // skin floor continues beyond it into the darkness.
      ctx.drawImage(interiorImg, rx, side === 'top' ? y * t - cfg.borderSize : (y + 1) * t, rw, cfg.borderSize);
    }
  }

  ctx.restore();

  // ── Corridor walls + mouth corners (unclipped), then ONE darkness pass
  // over everything this opening drew — pieces near the mouth stay almost
  // fully lit and fade together toward the far end, no lit-to-dark seams
  // (the old per-part darkness left the mouth pieces fully lit against an
  // already-dark corridor — a hard edge the user called out).
  const horizontal = side === 'left' || side === 'right';
  drawFlankWalls(ctx, marker, cfg, rx, ry, rw, rh);
  drawMouthCorners(ctx, marker, cfg);

  // Darkness union: the corridor rect plus each flank/shoulder region we
  // actually drew. Skipped regions (merged openings, floor around an
  // interior notch, map corners) must NOT be darkened — they're either a
  // neighbor corridor's pixels (double-darkening) or not ours at all.
  const openCell = (tx: number, ty: number): boolean =>
    isPlayable(cfg.tiles, tx, ty, cfg.gridWidth, cfg.gridHeight) || cfg.corridorCells.has(`${tx},${ty}`);
  if (horizontal) {
    let darkY = ry, darkH = rh;
    const dx = side === 'left' ? -1 : 1;
    if (!openCell(x + dx, y - 1)) { darkY -= cfg.borderSize; darkH += cfg.borderSize; }
    if (!openCell(x + dx, y + 1)) { darkH += cfg.sideBorderSize; }
    drawDarkness(ctx, side, rx, darkY, rw, darkH);
  } else {
    // Split treatment (user notes, 2026-07-16): the FLOOR compresses its
    // ramp into one band depth so the first corridor tile clearly reads
    // non-playable, but the flanking WALL pieces are wall faces catching
    // the same room light as their neighbors. Bottom flanks (thin cap +
    // strips) take the gentle full-depth ramp. Top shoulders are FULL
    // band-height corner pieces — they stay completely lit, matching the
    // wall run beside them, and only the Side Wall segment protruding
    // above fades out (its gradient runs clear at the shoulder's top to
    // black at the far end, so the darkening kicks in partway up).
    const dy = side === 'top' ? -1 : 1;
    drawDarkness(ctx, side, rx, ry, rw, rh, Math.min(1, cfg.borderSize / rh));
    const flankH = side === 'top' ? rh - cfg.borderSize : rh;
    // Top flanks, settled over rounds 7-9 (user, 2026-07-17): the SHOULDER
    // corner pieces stay fully lit — they belong to the wall run beside
    // them — while the protruding vertical STRIP above gets the sides'
    // flat 45% "walls in shade" pre-shade on top of its gradient, so the
    // segment reads dim at the shoulder line and sinks to black at the far
    // end. (Round 8 shaded the whole column and made the corners too
    // dark.) Bottom flanks keep their approved gentle ramp, untouched.
    const preShadeTopFlank = (px: number) => {
      if (side !== 'top') return;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(px, ry, cfg.sideBorderSize, flankH);
    };
    if (openCell(x - 1, y) && !openCell(x - 1, y + dy)) {
      preShadeTopFlank(rx - cfg.sideBorderSize);
      drawDarkness(ctx, side, rx - cfg.sideBorderSize, ry, cfg.sideBorderSize, flankH);
    }
    if (openCell(x + 1, y) && !openCell(x + 1, y + dy)) {
      preShadeTopFlank(rx + rw);
      drawDarkness(ctx, side, rx + rw, ry, cfg.sideBorderSize, flankH);
    }
  }
}

/**
 * A corridor's own walls — what the autotiler would put on the corridor
 * cells' exposed edges. Horizontal corridors: a front-facing wall (B tall)
 * filling the band row above and a wallTop lip (S tall) below. Vertical
 * corridors: Side Wall strips continuing the mouth shoulders outward
 * through the protrusion (the part of the corridor deeper than the band —
 * user ask, 2026-07-16: "vertical walls protruding from the corners").
 * Skipped where the neighboring cell is floor or another corridor
 * (openings merge). The darkness pass swallows their far ends.
 */
function drawFlankWalls(
  ctx: CanvasRenderingContext2D,
  marker: HallwayMarker,
  cfg: HallwayDrawConfig,
  rx: number, ry: number, rw: number, rh: number,
): void {
  const { x, y, side } = marker;
  const t = cfg.tileSize;
  const S = cfg.sideBorderSize;
  const B = cfg.borderSize;
  const open = (tx: number, ty: number): boolean =>
    isPlayable(cfg.tiles, tx, ty, cfg.gridWidth, cfg.gridHeight) || cfg.corridorCells.has(`${tx},${ty}`);

  if (side === 'left' || side === 'right') {
    const dx = side === 'left' ? -1 : 1;
    // Walls in shade (user pick, 2026-07-16): a flat pre-darkening on the
    // flank pieces so the corridor reads as ONE dark tunnel silhouette
    // with a lit floor tongue — without it, wall face, floor, and lip all
    // fade with the same gradient and the shadow looks stamped three
    // times in parallel.
    const shade = (px: number, py: number, w: number, h: number) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(px, py, w, h);
    };
    if (!open(x + dx, y - 1)) {
      const img = cfg.getImage('wallFront');
      if (img) {
        ctx.drawImage(img, rx, ry - B, rw, B);
      } else {
        drawProceduralWall(ctx, rx, ry - B, rw, B, 'bottom');
      }
      shade(rx, ry - B, rw, B);
    }
    if (!open(x + dx, y + 1)) {
      const img = cfg.getImage('wallTop');
      if (img) {
        ctx.drawImage(img, rx, ry + rh, rw, S);
      } else {
        drawProceduralWall(ctx, rx, ry + rh, rw, S, 'top');
      }
      shade(rx, ry + rh, rw, S);
    }
    return;
  }

  // Top/bottom: Side Wall strips continuing the flank out of the mouth
  // pieces (same emission conditions). TILED at the art's natural one-tile
  // height — never stretched — and anchored at the mouth end so the art
  // runs seamlessly out of the shoulder/cap, like the vertical wall of a
  // real void-tile notch (user reference, 2026-07-16).
  // Top: the full-height shoulder covers the band, so the strip is just
  // the protrusion above it. Bottom: the mouth piece is a THIN cap, so
  // the strip runs from the cap all the way to the corridor's end.
  const dy = side === 'top' ? -1 : 1;
  const stripY = side === 'top' ? ry : ry + S;
  const stripH = side === 'top' ? rh - B : rh - S;
  if (stripH <= 0) return;
  const drawStrip = (sx: number, mirrored: boolean) => {
    const img = cfg.getImage('wallSide');
    if (!img) {
      drawProceduralCorner(ctx, sx, stripY, S, stripH, mirrored ? 'left' : 'right');
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, stripY, S, stripH);
    ctx.clip();
    const runs = Math.ceil(stripH / t);
    for (let i = 0; i < runs; i++) {
      // Anchor at the mouth end: top corridors grow upward from the
      // shoulder, bottom corridors grow downward from the cap.
      const ay = side === 'top' ? stripY + stripH - (i + 1) * t : stripY + i * t;
      if (mirrored) {
        ctx.save();
        ctx.translate(sx + S, ay);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, S, t);
        ctx.restore();
      } else {
        ctx.drawImage(img, sx, ay, S, t);
      }
    }
    ctx.restore();
  };
  if (isPlayable(cfg.tiles, x - 1, y, cfg.gridWidth, cfg.gridHeight) && !open(x - 1, y + dy)) {
    drawStrip(x * t - S, false);
  }
  if (isPlayable(cfg.tiles, x + 1, y, cfg.gridWidth, cfg.gridHeight) && !open(x + 1, y + dy)) {
    drawStrip(x * t + t, true);
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
      // THIN caps at the junction — the flank continues below as tiled
      // Side Wall (drawFlankWalls), matching the vertical wall a real
      // void-tile notch produces (user reference, 2026-07-16; the earlier
      // full-height inner corners read as a stretched asset).
      if (playable(x - 1, y) && !playable(x - 1, y + 1)) {
        piece('innerCornerBottomLeftThin', x * t - S, (y + 1) * t, S, S, 'right', 'innerCornerBottomLeft');
      }
      if (playable(x + 1, y) && !playable(x + 1, y + 1)) {
        piece('innerCornerBottomRightThin', x * t + t, (y + 1) * t, S, S, 'left', 'innerCornerBottomRight');
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
  // Fraction of the depth the ramp completes within (1 = full depth).
  // Deep corridors compress the ramp so the darkness starts as close to
  // the room as it does on shallow ones, then hold full black.
  rampFraction = 1,
): void {
  let grad: CanvasGradient;
  switch (side) {
    case 'top':    grad = ctx.createLinearGradient(0, ry + rh, 0, ry); break;
    case 'bottom': grad = ctx.createLinearGradient(0, ry, 0, ry + rh); break;
    case 'left':   grad = ctx.createLinearGradient(rx + rw, 0, rx, 0); break;
    case 'right':  grad = ctx.createLinearGradient(rx, 0, rx + rw, 0); break;
  }
  // Smoothstep-shaped ramp: nearly clear through the mouth third, then an
  // even roll into full black at the far end — the old three-stop ramp hit
  // 50% by midway and read as a hard shadow edge (user note, 2026-07-16).
  const f = Math.max(0.01, Math.min(1, rampFraction));
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.04)');
  grad.addColorStop(0.3 * f, 'rgba(0, 0, 0, 0.2)');
  grad.addColorStop(0.55 * f, 'rgba(0, 0, 0, 0.48)');
  grad.addColorStop(0.75 * f, 'rgba(0, 0, 0, 0.78)');
  grad.addColorStop(0.9 * f, 'rgba(0, 0, 0, 0.96)');
  grad.addColorStop(f, 'rgba(0, 0, 0, 1)');
  if (f < 1) grad.addColorStop(1, 'rgba(0, 0, 0, 1)');
  ctx.fillStyle = grad;
  ctx.fillRect(rx, ry, rw, rh);
}
