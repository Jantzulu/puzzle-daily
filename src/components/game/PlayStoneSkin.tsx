import React from 'react';
import skinJson from '../../assets/panels/play-gem-slices.json';
import { Z, buildSkin, nomW, nomH, prepCanvas, drawFixed, whenDecoded, type SkinPiece } from './panelSkins';

// ============================================================================
// PLAY STONE SKIN — forge-cut art on the rail's action button
// ============================================================================
// Consumer of the 'play-gem' kit ("Play Stone"), the same hardcoded drop
// path as every skinned surface: paint → export → overwrite
// src/assets/panels/play-gem-slices.json → HMR → the button wears it.
// Empty placeholder = the procedural emerald GemMesh baseline.
//
// The user's design split (2026-08-03):
//   - BUTTON FACE dims until a hero is placed (the dim lives HERE, on the
//     face canvas only — the button's old whole-element opacity-50 would
//     dim the frame too).
//   - FRAME never dims, drawn OVER the face (it may overlap the face's
//     edges), 8-art aura held by the bleed — constant through every state.
//   - Optional hover/pressed faces swap via CSS opacity under
//     .gem-btn:hover/:active (canvas stack, no JS state) — and only while
//     playable (a dimmed stone shouldn't glint).
// The DOM label (Play / the running Turn counter) rides on top, as
// everywhere. One unified size: the button is 120×36px on every viewport.

const PIECES = buildSkin(skinJson, 'play-gem');
const P = (id: string) => PIECES.get(id);

export const playStoneSkinActive = PIECES.has('play-button') || PIECES.has('play-frame');

/** Face dim while no hero is placed — tuned to read as "waiting", not broken. */
export const PLAY_STONE_DIM = 0.45;

/**
 * One stone piece, nominal-centered in the button box (halo overhang
 * outside it). THE renderer's draw — the forge's live preview
 * (PortcullisLive) composes the same routine on its filterless canvas,
 * so preview divergence stays structurally impossible.
 */
export const drawStonePiece = (ctx: CanvasRenderingContext2D, w: number, h: number, piece: SkinPiece) => {
  const nw = nomW(piece) * Z;
  const nh = nomH(piece) * Z;
  drawFixed(ctx, piece, Math.round((w - nw) / 2) - (piece.halo?.l ?? 0) * Z, Math.round((h - nh) / 2) - (piece.halo?.t ?? 0) * Z);
};

/**
 * Darken the face IN ITS OWN PIXELS — 'source-atop' clips the black wash
 * to the painted silhouette, so the stone stays fully OPAQUE and its
 * transparent surround stays transparent. The first dim implementation
 * used CSS opacity, which made the whole face translucent and the rung's
 * plates showed THROUGH the stone (user catch, 2026-08-04).
 */
export const dimStoneFace = (ctx: CanvasRenderingContext2D, w: number, h: number, bleed: number) => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(0, 0, 0, ${1 - PLAY_STONE_DIM})`;
  ctx.fillRect(-bleed, -bleed, w + bleed * 2, h + bleed * 2);
  ctx.restore();
};

const StoneCanvas: React.FC<{
  piece: SkinPiece;
  bleed: number;
  /** Bake the opaque dim into the pixels (see dimStoneFace). */
  darkened?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ piece, bleed, darkened = false, className, style }) => {
  const hostRef = React.useRef<HTMLSpanElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;
    const draw = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const ctx = prepCanvas(canvas, w, h, bleed);
      if (!ctx) return;
      ctx.clearRect(-bleed, -bleed, w + bleed * 2, h + bleed * 2);
      drawStonePiece(ctx, w, h, piece);
      if (darkened) dimStoneFace(ctx, w, h, bleed);
    };
    // Synchronous after decode — the shared no-rAF rule.
    const schedule = draw;
    whenDecoded([piece]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); };
  }, [piece, bleed, darkened]);
  return (
    <span ref={hostRef} aria-hidden className={className} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...style }}>
      <canvas ref={canvasRef} style={{ position: 'absolute' }} />
    </span>
  );
};

/**
 * The full stone: face (dimmable, with optional hover/pressed swaps) under
 * the constant frame. Mount inside the button/plate (which must be
 * position: relative); the DOM label renders after it, above everything.
 */
export const PlayStoneSkin: React.FC<{ dimmed?: boolean }> = ({ dimmed = false }) => {
  const face = P('play-button');
  const hover = P('play-button-hover');
  const pressed = P('play-button-pressed');
  const frame = P('play-frame');
  return (
    <>
      {face && (
        <>
          <StoneCanvas piece={face} bleed={0} />
          {/* The waiting dim CROSSFADES between two fully-OPAQUE layers:
              the bright face and a pixel-darkened twin. The first
              implementation faded the single canvas's CSS opacity, which
              made the face TRANSLUCENT — the rung's plates showed through
              the stone (user catch, 2026-08-04). */}
          <StoneCanvas
            piece={face}
            bleed={0}
            darkened
            style={{ opacity: dimmed ? 1 : 0, transition: 'opacity 0.25s ease' }}
          />
        </>
      )}
      {!dimmed && hover && <StoneCanvas piece={hover} bleed={0} className="play-stone-hover" />}
      {!dimmed && pressed && <StoneCanvas piece={pressed} bleed={0} className="play-stone-pressed" />}
      {/* The frame LAST: never dimmed, over the face so painted overlap
          reads as the frame holding the stone. Bleed holds its 8-art aura. */}
      {frame && <StoneCanvas piece={frame} bleed={20} />}
    </>
  );
};
