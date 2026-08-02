import React from 'react';
import skinJson from '../../assets/panels/quest-box-slices.json';

// ============================================================================
// QUEST BOX SKIN — forge-cut art onto the real quest panel
// ============================================================================
// The consumer of the Panel Forge's "Quest Box" kit. The artist paints the
// assembled sample (watch loop), exports slices, and drops the JSON at
// src/assets/panels/quest-box-slices.json — Vite hot-reloads and the live
// game page wears the art. HARDCODED BY DECISION (user, 2026-08-01): this is
// core chrome succeeding BannerMesh/PortcullisMesh, which are source, not
// theme knobs — committed art is versioned, revertable, and deploys
// atomically with this renderer to both apps. The checked-in placeholder has
// an empty pieces array, which renders NOTHING here and leaves Game.tsx's
// baseline CSS box untouched — restoring the baseline is `git revert` (or
// re-emptying the file), the same story as every visual experiment.
//
// CANVAS COMPOSITOR (2026-08-02, the blur endgame): the art is drawn into
// device-resolution <canvas> surfaces — the board's own discipline — after a
// long chase of DOM-layer softness that clustered around the TEXT regions
// (the user's decisive observation). Browsers promote text-bearing elements
// to their own compositor layers (the quest line's shimmer keeps a filling
// animation forever) and re-rasterize overlapping slices at device-alignment
// boundaries; CSS background layers near those rects went soft while art
// farther away stayed crisp. A canvas's pixels are self-rasterized: no text
// layer, promotion, or slicing can resample them. DOM text still rides ON
// TOP of the art (user call — themable, translatable), it just can no longer
// disturb it. Single-surface drawing also retires two whole bug classes this
// arc met: inter-layer sub-pixel seams and tile phase mismatches.
//
// Geometry contracts pinned by the live rounds with the artist (keep them):
//   - THE CORNER SQUARE IS SACRED: corner-art transparency is the panel's
//     stepped silhouette; nothing paints inside a corner's square.
//   - Runs partition BETWEEN corner squares; the centre is a notched CROSS
//     (corner-anchored field + gutter strips out to the thin edge bands).
//   - CAPS DROP when corners+caps exceed a run's room (thin boxes).
//   - Content padding is EDGE-keyed (thinness lever); frame geometry is
//     CORNER-keyed.
//   - Everything lands on INTEGER CSS px (useCrispSnap) — bitmap art at a
//     fractional offset resamples at every zoom.
//
// INTEGER ZOOM, SMOOTHING OFF — Z=2: the forge preview approves art at ~2×,
// and the renderer's scale must match the artist's reference.

import { Z, buildSkin, nomW, nomH, useCrispSnap, whenDecoded, drawFixed, drawTiled, prepCanvas, BLEED, type SkinPiece } from './panelSkins';

// Game.tsx imports the snap hook from here — keep the path stable.
export { useCrispSnap };

const PIECES = buildSkin(skinJson, 'quest-box');
const P = (id: string) => PIECES.get(id);

/** The frame renders only when the minimum readable box exists. */
export const questSkinFrameActive = PIECES.has('corner-tl') && PIECES.has('center');
/** The plate art renders when its middle exists (caps optional). */
export const questSkinPlateActive = PIECES.has('plate-mid');
/** The divider ("the side-quests rule") renders when its middle exists. */
export const questSkinDividerActive = PIECES.has('divider-mid');

// Frame geometry (run starts, cap anchoring) keys off the CORNERS as a
// nine-slice must; the CONTENT padding keys off the EDGE BANDS instead
// (thinness lever): thin edges + proud corners = a thin box. Frame pieces
// carry no halo, so nominal == bitmap.
const tl = P('corner-tl');
const tr = P('corner-tr');
const topMid = P('edge-top-mid');
const bottomMid = P('edge-bottom-mid');
const leftMid = P('edge-left-mid');
const rightMid = P('edge-right-mid');
export const questFrameBorders = {
  t: (topMid?.h ?? tl?.h ?? 0) * Z,
  b: (bottomMid?.h ?? P('corner-bl')?.h ?? 0) * Z,
  l: (leftMid?.w ?? tl?.w ?? 0) * Z,
  r: (rightMid?.w ?? tr?.w ?? 0) * Z,
};

const plateMid = P('plate-mid');
/** How far the plate pokes above the box's top edge (the preview's 60% rule). */
export const questPlateStraddle = plateMid ? Math.round(nomH(plateMid) * Z * 0.6) : 0;

// ─── The frame ──────────────────────────────────────────────────────────────

/**
 * The nine-slice frame, absolutely filling the quest box, composited into
 * ONE canvas. Render it FIRST inside the box and wrap the box's content in
 * a `relative` div so text paints above the art.
 */
export const QuestBoxFrame: React.FC = () => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    if (!questSkinFrameActive) return;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;

    const draw = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const ctx = prepCanvas(canvas, w, h, BLEED);
      if (!ctx) return;
      ctx.clearRect(-BLEED, -BLEED, w + BLEED * 2, h + BLEED * 2);

      // Corner-keyed geometry; edge-keyed content bands (see header).
      const bt = (tl?.h ?? topMid?.h ?? 0) * Z;
      const bb = (P('corner-bl')?.h ?? bottomMid?.h ?? 0) * Z;
      const bl = (tl?.w ?? leftMid?.w ?? 0) * Z;
      const br = (tr?.w ?? rightMid?.w ?? 0) * Z;
      const gt = questFrameBorders.t;
      const gb = questFrameBorders.b;
      const gl = questFrameBorders.l;
      const gr = questFrameBorders.r;

      // Caps drop when corners+caps exceed the run's room (thin boxes).
      const fitL = ((P('edge-left-cap-t')?.h ?? 0) + (P('edge-left-cap-b')?.h ?? 0)) * Z <= h - bt - bb;
      const fitR = ((P('edge-right-cap-t')?.h ?? 0) + (P('edge-right-cap-b')?.h ?? 0)) * Z <= h - bt - bb;
      const fitT = ((P('edge-top-cap-l')?.w ?? 0) + (P('edge-top-cap-r')?.w ?? 0)) * Z <= w - bl - br;
      const fitB = ((P('edge-bottom-cap-l')?.w ?? 0) + (P('edge-bottom-cap-r')?.w ?? 0)) * Z <= w - bl - br;
      const capTL = fitT ? (P('edge-top-cap-l')?.w ?? 0) * Z : 0;
      const capTR = fitT ? (P('edge-top-cap-r')?.w ?? 0) * Z : 0;
      const capBL = fitB ? (P('edge-bottom-cap-l')?.w ?? 0) * Z : 0;
      const capBR = fitB ? (P('edge-bottom-cap-r')?.w ?? 0) * Z : 0;
      const capLT = fitL ? (P('edge-left-cap-t')?.h ?? 0) * Z : 0;
      const capLB = fitL ? (P('edge-left-cap-b')?.h ?? 0) * Z : 0;
      const capRT = fitR ? (P('edge-right-cap-t')?.h ?? 0) * Z : 0;
      const capRB = fitR ? (P('edge-right-cap-b')?.h ?? 0) * Z : 0;

      const ctr = P('center');

      // Notched-cross centre, all tiles phase-anchored at (bl, bt). The
      // sacred corner squares stay unpainted.
      drawTiled(ctx, ctr, bl, bt, w - bl - br, h - bt - bb, bl, bt);
      if (bt > gt) drawTiled(ctx, ctr, bl, gt, w - bl - br, bt - gt, bl, bt);
      if (bb > gb) drawTiled(ctx, ctr, bl, h - bb, w - bl - br, bb - gb, bl, bt);
      if (bl > gl) drawTiled(ctx, ctr, gl, bt, bl - gl, h - bt - bb, bl, bt);
      if (br > gr) drawTiled(ctx, ctr, w - br, bt, br - gr, h - bt - bb, bl, bt);

      // Edge runs between the corner squares.
      drawTiled(ctx, topMid, bl + capTL, 0, w - bl - br - capTL - capTR, (topMid?.h ?? 0) * Z, bl + capTL, 0);
      drawTiled(ctx, bottomMid, bl + capBL, h - (bottomMid?.h ?? 0) * Z, w - bl - br - capBL - capBR, (bottomMid?.h ?? 0) * Z, bl + capBL, h - (bottomMid?.h ?? 0) * Z);
      drawTiled(ctx, leftMid, 0, bt + capLT, (leftMid?.w ?? 0) * Z, h - bt - bb - capLT - capLB, 0, bt + capLT);
      drawTiled(ctx, rightMid, w - (rightMid?.w ?? 0) * Z, bt + capRT, (rightMid?.w ?? 0) * Z, h - bt - bb - capRT - capRB, w - (rightMid?.w ?? 0) * Z, bt + capRT);

      // Caps (only when they fit), then corners over everything.
      if (fitT) { drawFixed(ctx, P('edge-top-cap-l'), bl, 0); drawFixed(ctx, P('edge-top-cap-r'), w - br - capTR, 0); }
      if (fitB) { drawFixed(ctx, P('edge-bottom-cap-l'), bl, h - (P('edge-bottom-cap-l')?.h ?? 0) * Z); drawFixed(ctx, P('edge-bottom-cap-r'), w - br - capBR, h - (P('edge-bottom-cap-r')?.h ?? 0) * Z); }
      if (fitL) { drawFixed(ctx, P('edge-left-cap-t'), 0, bt); drawFixed(ctx, P('edge-left-cap-b'), 0, h - bb - capLB); }
      if (fitR) { drawFixed(ctx, P('edge-right-cap-t'), w - (P('edge-right-cap-t')?.w ?? 0) * Z, bt); drawFixed(ctx, P('edge-right-cap-b'), w - (P('edge-right-cap-b')?.w ?? 0) * Z, h - bb - capRB); }
      drawFixed(ctx, tl, 0, 0);
      drawFixed(ctx, tr, w - (tr?.w ?? 0) * Z, 0);
      drawFixed(ctx, P('corner-bl'), 0, h - (P('corner-bl')?.h ?? 0) * Z);
      drawFixed(ctx, P('corner-br'), w - (P('corner-br')?.w ?? 0) * Z, h - (P('corner-br')?.h ?? 0) * Z);
      // Edge ornaments moved OUT of this canvas (QuestOrnaments below):
      // painted here they sat UNDER the QUEST plate, and the user wants the
      // medallions riding over the whole panel.
    };

    // SYNCHRONOUS draw, not rAF: hidden/background tabs freeze rAF and the
    // canvas stays blank until the tab fronts (hit live in the hidden
    // preview pane). RO callbacks batch already; the draws are tiny.
    const schedule = draw;
    whenDecoded([...PIECES.values()]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    ro.observe(document.documentElement);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, []);
  if (!questSkinFrameActive) return null;
  return (
    <div ref={hostRef} aria-hidden className="absolute inset-0">
      <canvas ref={canvasRef} style={{ position: 'absolute' }} />
    </div>
  );
};

// ─── The ornaments ──────────────────────────────────────────────────────────

/** Ornaments render only alongside the frame they decorate. */
export const questSkinOrnamentsActive =
  questSkinFrameActive && (PIECES.has('edge-top-ornament') || PIECES.has('edge-bottom-ornament'));

/**
 * Centered edge medallions on their OWN canvas, rendered as the TOPMOST art
 * layer (user call, 2026-08-01: "the edge ornaments should be layered on
 * top of the quest panel, not below it"). Inside the frame canvas they sat
 * under the QUEST plate — a top medallion is centered exactly where the
 * plate is, so it vanished behind it. Mount this AFTER the plate and BEFORE
 * the content wrapper: later positioned siblings paint over the plate's
 * art, while the DOM text (content wrapper; the plate label carries z-1)
 * still rides above everything. Same geometry as the old in-frame draw —
 * nominal centered on the edge band, halo overhanging into the bleed.
 */
export const QuestOrnaments: React.FC = () => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    if (!questSkinOrnamentsActive) return;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;
    const draw = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      // Deeper bleed than the frame's: an ornament's aura (top halo 13 art
      // = 26 CSS) plus its negative centering offset on a thin band can
      // reach ~38 CSS past the box — BLEED 16 was silently clipping tall
      // medallion overhang.
      const ORN_BLEED = 48;
      const ctx = prepCanvas(canvas, w, h, ORN_BLEED);
      if (!ctx) return;
      ctx.clearRect(-ORN_BLEED, -ORN_BLEED, w + ORN_BLEED * 2, h + ORN_BLEED * 2);
      const ornament = (pc: SkinPiece | undefined, isTop: boolean) => {
        if (!pc) return;
        const bandH = isTop ? questFrameBorders.t : questFrameBorders.b;
        const nw = nomW(pc) * Z;
        const nh = nomH(pc) * Z;
        const x = Math.round((w - nw) / 2) - (pc.halo?.l ?? 0) * Z;
        const edgeOffset = Math.round((bandH - nh) / 2);
        const y = (isTop ? edgeOffset : h - bandH + edgeOffset) - (pc.halo?.t ?? 0) * Z;
        drawFixed(ctx, pc, x, y);
      };
      ornament(P('edge-top-ornament'), true);
      ornament(P('edge-bottom-ornament'), false);
    };
    // SYNCHRONOUS draw, not rAF: hidden/background tabs freeze rAF and the
    // canvas stays blank until the tab fronts. RO callbacks batch already.
    const schedule = draw;
    whenDecoded([P('edge-top-ornament'), P('edge-bottom-ornament')].filter(Boolean) as SkinPiece[]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    ro.observe(document.documentElement);
    return () => { cancelled = true; ro.disconnect(); };
  }, []);
  if (!questSkinOrnamentsActive) return null;
  return (
    <div ref={hostRef} aria-hidden className="absolute inset-0 pointer-events-none">
      <canvas ref={canvasRef} style={{ position: 'absolute' }} />
    </div>
  );
};

// ─── The divider ────────────────────────────────────────────────────────────

/**
 * The section rule above the side quests: fixed cap, tiling middle, fixed
 * cap, in one canvas. Dividers carry no halo, so nominal == bitmap.
 */
export const QuestDivider: React.FC = () => {
  const hostRef = React.useRef<HTMLSpanElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const m = P('divider-mid');
  const h = (m?.h ?? 0) * Z;
  React.useLayoutEffect(() => {
    if (!m) return;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;
    const draw = () => {
      const w = host.clientWidth;
      if (!w) return;
      const ctx = prepCanvas(canvas, w, h, 0);
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const l = P('divider-cap-l');
      const r = P('divider-cap-r');
      const lw = (l?.w ?? 0) * Z;
      const rw = (r?.w ?? 0) * Z;
      drawTiled(ctx, m, lw, 0, w - lw - rw, h, lw, 0);
      drawFixed(ctx, l, 0, 0);
      drawFixed(ctx, r, w - rw, 0);
    };
    // SYNCHRONOUS draw, not rAF: hidden/background tabs freeze rAF and the
    // canvas stays blank until the tab fronts (hit live in the hidden
    // preview pane). RO callbacks batch already; the draws are tiny.
    const schedule = draw;
    whenDecoded([m, P('divider-cap-l'), P('divider-cap-r')].filter(Boolean) as SkinPiece[]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); };
  }, [m, h]);
  if (!m) return null;
  return (
    <span ref={hostRef} aria-hidden className="block relative" style={{ height: h }}>
      <canvas ref={canvasRef} style={{ position: 'absolute' }} />
    </span>
  );
};

// ─── The plate ──────────────────────────────────────────────────────────────

/**
 * The QUEST plate: band + caps composited into one canvas (halo overhang in
 * the bleed), with the DOM label riding ON TOP (user call — the themable
 * text survives). The plate's width is text-driven, so the canvas redraws
 * on resize and the root self-snaps to whole pixels.
 */
export const QuestPlate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const snapRef = useCrispSnap<HTMLSpanElement>(true, true);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const m = P('plate-mid');
  const h = m ? nomH(m) * Z : 0;
  React.useLayoutEffect(() => {
    if (!m) return;
    const host = snapRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;
    const draw = () => {
      const w = host.clientWidth;
      if (!w) return;
      const ctx = prepCanvas(canvas, w, h, BLEED);
      if (!ctx) return;
      ctx.clearRect(-BLEED, -BLEED, w + BLEED * 2, h + BLEED * 2);
      const l = P('plate-cap-l');
      const r = P('plate-cap-r');
      const lw = l ? nomW(l) * Z : 0;
      const rw = r ? nomW(r) * Z : 0;
      // The band spans EXACTLY between the caps' nominal edges — on a
      // single surface, seams are impossible, so the DOM version's
      // tuck-under-the-caps overlap is not carried over: it painted band
      // pixels behind the caps' transparent rounded-end cutaways, which
      // surfaced as stray grey corner pixels (user regression report).
      // Cap-art transparency is silhouette, same law as the corners.
      const my = -(m.halo?.t ?? 0) * Z;
      drawTiled(ctx, m, lw, my, w - lw - rw, m.h * Z, lw, my);
      if (l) drawFixed(ctx, l, -(l.halo?.l ?? 0) * Z, -(l.halo?.t ?? 0) * Z);
      if (r) drawFixed(ctx, r, w - rw - (r.halo?.l ?? 0) * Z, -(r.halo?.t ?? 0) * Z);
    };
    // SYNCHRONOUS draw, not rAF: hidden/background tabs freeze rAF and the
    // canvas stays blank until the tab fronts (hit live in the hidden
    // preview pane). RO callbacks batch already; the draws are tiny.
    const schedule = draw;
    whenDecoded([m, P('plate-cap-l'), P('plate-cap-r')].filter(Boolean) as SkinPiece[]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); };
  }, [m, h, snapRef]);
  if (!m) return null;
  const l = P('plate-cap-l');
  const r = P('plate-cap-r');
  return (
    <span ref={snapRef} className="inline-flex relative" style={{ height: h }}>
      <canvas ref={canvasRef} aria-hidden style={{ position: 'absolute' }} />
      {l && <span style={{ width: nomW(l) * Z, height: h, flexShrink: 0 }} />}
      <span style={{ position: 'relative', minWidth: nomW(m) * Z, height: h, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* z-1 lifts the label above the QuestOrnaments canvas (a LATER
            sibling of the plate anchor, so it paints over z-auto content
            here) — DOM text always rides above art, ornaments included. */}
        <span className="relative z-[1] px-1.5">{children}</span>
      </span>
      {r && <span style={{ width: nomW(r) * Z, height: h, flexShrink: 0 }} />}
    </span>
  );
};
