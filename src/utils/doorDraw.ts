// Door rendering — shared by the game board and the map editor canvas.
// A door marker replaces the rendered TOP or BOTTOM wall segment of an
// edge tile with a door piece from the skin (closed sprite, opening
// spritesheet, open sprite). The open/close animation only ever plays at
// PUZZLE START (render-side theater, gated on the board's reveal clock so
// it can't burn behind the loading screen); after that the door holds its
// final state for the whole game. Purely visual in this phase — nothing
// passes through a door, and the engine/solver never see them.
//
// Combined with a hallway on the same segment (phase 3): hallways draw in
// the baked static layer, doors draw per-frame ON TOP — an open-door
// sprite with a transparent doorway shows the corridor behind it.
import type { DoorMarker, TileOrNull } from '../types/game';
import { isValidHallway } from './hallwayDraw';

/** Seconds-scale knobs for the start-of-puzzle door theater. */
export const DOOR_ANIM_DELAY_MS = 450;  // beat after reveal before the door moves
export const DOOR_ANIM_FPS = 10;        // opening-sheet playback rate

/**
 * Doors are valid on TOP or BOTTOM wall segments only (the pseudo-3D art
 * has no readable door face on side walls) — otherwise the same rule as
 * hallways: the tile is a real floor and the side borders void/outside.
 */
export function isValidDoor(
  marker: DoorMarker,
  tiles: TileOrNull[][],
  width: number,
  height: number,
): boolean {
  if (marker.side !== 'top' && marker.side !== 'bottom') return false;
  return isValidHallway(marker, tiles, width, height);
}

export interface DoorImages {
  closed?: HTMLImageElement | null;       // static closed door
  open?: HTMLImageElement | null;         // static open door (transparent doorway shows a hallway behind)
  openingSheet?: HTMLImageElement | null; // horizontal strip of square frames, closed → open
}

type DoorLook =
  | { kind: 'closed' }
  | { kind: 'open' }
  | { kind: 'frame'; index: number; count: number };

/**
 * What the door shows `elapsed` ms after the board revealed (null = not
 * revealed yet → the start-state's resting look). Pure function of time,
 * so replays and re-renders can't drift.
 */
function doorLook(marker: DoorMarker, elapsed: number | null, sheetFrames: number): DoorLook {
  const start = marker.startState;
  if (start === 'closed') return { kind: 'closed' };
  if (start === 'open') return { kind: 'open' };

  const animMs = sheetFrames > 0 ? (sheetFrames * 1000) / DOOR_ANIM_FPS : 0;
  const resting: DoorLook = start === 'opening' ? { kind: 'closed' } : { kind: 'open' };
  if (elapsed === null || elapsed < DOOR_ANIM_DELAY_MS) return resting;

  const t = elapsed - DOOR_ANIM_DELAY_MS;
  if (t >= animMs) return start === 'opening' ? { kind: 'open' } : { kind: 'closed' };

  // Mid-animation: opening plays the sheet forward, closing plays it
  // backward (the user's "closing = opening inverted").
  const raw = Math.min(sheetFrames - 1, Math.floor((t / animMs) * sheetFrames));
  const index = start === 'opening' ? raw : sheetFrames - 1 - raw;
  return { kind: 'frame', index, count: sheetFrames };
}

/** Frame count of a horizontal strip of square frames (1 for a single image). */
function sheetFrameCount(img: HTMLImageElement | null | undefined): number {
  if (!img || !img.complete || img.naturalHeight === 0) return 0;
  return Math.max(1, Math.floor(img.naturalWidth / img.naturalHeight));
}

/**
 * Draw one door. `ctx` must be translated to the tile grid origin (the
 * same space tiles and hallways draw in). `elapsed` = ms since the board
 * revealed, or null before reveal. Falls back to a procedural plank door
 * when the skin has no door sprites, so an authored door is never
 * invisible.
 */
export function drawDoor(
  ctx: CanvasRenderingContext2D,
  marker: DoorMarker,
  elapsed: number | null,
  images: DoorImages,
  tileSize: number,
  borderSize: number,
): void {
  const t = tileSize;
  const rx = marker.x * t;
  const ry = marker.side === 'top' ? marker.y * t - borderSize : (marker.y + 1) * t;
  const rw = t;
  const rh = borderSize;

  const frames = sheetFrameCount(images.openingSheet);
  const look = doorLook(marker, elapsed, frames);

  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();

  if (look.kind === 'frame' && images.openingSheet) {
    const img = images.openingSheet;
    const fw = img.naturalWidth / look.count;
    ctx.drawImage(img, look.index * fw, 0, fw, img.naturalHeight, rx, ry, rw, rh);
  } else if (look.kind === 'open') {
    const img = images.open && images.open.complete ? images.open : null;
    if (img) {
      ctx.drawImage(img, rx, ry, rw, rh);
    } else {
      // Procedural open doorway: dark opening with lit jambs — reads as a
      // hole in the wall (a hallway behind it shows through in phase 3
      // because this fallback only dims, it doesn't paint the middle).
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(rx + 6, ry, rw - 12, rh);
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(rx + 4, ry, 3, rh);
      ctx.fillRect(rx + rw - 7, ry, 3, rh);
    }
  } else {
    const img = images.closed && images.closed.complete ? images.closed : null;
    if (img) {
      ctx.drawImage(img, rx, ry, rw, rh);
    } else {
      // Procedural closed door: dark wood planks in an iron frame.
      ctx.fillStyle = '#4a3626';
      ctx.fillRect(rx + 4, ry + 2, rw - 8, rh - 4);
      ctx.fillStyle = '#3a2a1e';
      for (let px = rx + 10; px < rx + rw - 6; px += 8) {
        ctx.fillRect(px, ry + 2, 2, rh - 4);
      }
      ctx.strokeStyle = '#2a2a3a';
      ctx.lineWidth = 3;
      ctx.strokeRect(rx + 4.5, ry + 2.5, rw - 9, rh - 5);
      // Handle
      ctx.fillStyle = '#8a7a5a';
      ctx.fillRect(rx + rw - 14, ry + Math.round(rh / 2) - 2, 4, 4);
    }
  }

  ctx.restore();
}
