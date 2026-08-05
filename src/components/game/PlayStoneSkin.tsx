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
// The DOM label rides on top, as everywhere. One unified size: the button
// is 120×36px on every viewport.
//
// 2026-08-04 redesign (user spec): while a run is in progress the same
// stone becomes the CONCEDE button — an alternate face family
// (play-button-concede + optional -hover/-pressed) SHARING the one
// never-dimming frame. The Turn counter moved off the stone onto the
// TURNS rung plaque.

const PIECES = buildSkin(skinJson, 'play-gem');
const P = (id: string) => PIECES.get(id);

export const playStoneSkinActive = PIECES.has('play-button') || PIECES.has('play-frame');
export const concedeStoneActive = PIECES.has('play-button-concede');

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

/**
 * The dim's sibling in reverse — a warm wash clipped to the silhouette,
 * for the BREATH twin (the "ready to play" glow). Same opaque-layers
 * rule: the twin sits over the fully-opaque base, so animating the
 * twin's opacity never makes the stack translucent.
 */
export const brightStoneFace = (ctx: CanvasRenderingContext2D, w: number, h: number, bleed: number) => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  // 0.10: the first cut (0.22) read too intense on the user's eyes.
  ctx.fillStyle = 'rgba(255, 244, 214, 0.10)';
  ctx.fillRect(-bleed, -bleed, w + bleed * 2, h + bleed * 2);
  ctx.restore();
};

const StoneCanvas: React.FC<{
  piece: SkinPiece;
  bleed: number;
  /** Bake the opaque dim into the pixels (see dimStoneFace). */
  darkened?: boolean;
  /** Bake the opaque warm glow instead (see brightStoneFace). */
  brightened?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ piece, bleed, darkened = false, brightened = false, className, style }) => {
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
      if (brightened) brightStoneFace(ctx, w, h, bleed);
    };
    // Synchronous after decode — the shared no-rAF rule.
    const schedule = draw;
    whenDecoded([piece]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); };
  }, [piece, bleed, darkened, brightened]);
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
 *
 * face='concede' swaps in the concede face family (base + optional
 * hover/pressed) under the SAME frame; the concede stone never dims (the
 * game is already running). Unpainted concede faces fall back per-state to
 * the concede base — never to the play faces (a green PLAY stone reading
 * as the destructive button would mislead).
 */
export const PlayStoneSkin: React.FC<{ dimmed?: boolean; face?: 'play' | 'concede' }> = ({ dimmed = false, face = 'play' }) => {
  const concede = face === 'concede';
  const base = concede ? P('play-button-concede') : P('play-button');
  const hover = concede ? P('play-button-concede-hover') : P('play-button-hover');
  const pressed = concede ? P('play-button-concede-pressed') : P('play-button-pressed');
  const frame = P('play-frame');
  const dims = !concede && dimmed;
  return (
    <>
      {base && (
        <>
          <StoneCanvas piece={base} bleed={0} />
          {/* The waiting dim CROSSFADES between two fully-OPAQUE layers:
              the bright face and a pixel-darkened twin. The first
              implementation faded the single canvas's CSS opacity, which
              made the face TRANSLUCENT — the rung's plates showed through
              the stone (user catch, 2026-08-04). Concede skips the twin:
              that state never dims. */}
          {!concede && (
            <StoneCanvas
              piece={base}
              bleed={0}
              darkened
              style={{ opacity: dims ? 1 : 0, transition: 'opacity 0.25s ease' }}
            />
          )}
        </>
      )}
      {/* BREATH (user pick, 2026-08-05: effects 1+3): a pixel-brightened
          opaque twin whose CSS opacity breathes — the "ready to play"
          heartbeat. Play face only, never while dimmed (a dimmed stone
          doesn't glint — pinned), and it sits UNDER the hover/pressed
          faces so pointer states read clean. Opacity-only animation per
          the perf law. */}
      {!concede && !dims && base && (
        <StoneCanvas piece={base} bleed={0} brightened className="play-stone-breathe" />
      )}
      {!dims && hover && <StoneCanvas piece={hover} bleed={0} className="play-stone-hover" />}
      {!dims && pressed && <StoneCanvas piece={pressed} bleed={0} className="play-stone-pressed" />}
      {/* SHINE SWEEP: the GemMesh scroll-driven shine band, inherited by
          the painted stone — the band rides .gem-scroll-shine's exact
          --scroll-percent transform (transform-only; the mask is STATIC:
          the face png itself clips the band to the painted silhouette).
          Above the state faces (the gem glints under the pointer too),
          under the frame. */}
      {!concede && !dims && base && (
        <span
          aria-hidden
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden',
            WebkitMaskImage: `url(${base.png})`, maskImage: `url(${base.png})`,
            WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
          }}
        >
          <span className="gem-scroll-shine play-stone-shine" />
        </span>
      )}
      {/* The frame LAST: never dimmed, SHARED by the play and concede
          families, over the face so painted overlap reads as the frame
          holding the stone. Bleed holds its 8-art aura. */}
      {frame && <StoneCanvas piece={frame} bleed={20} />}
    </>
  );
};
