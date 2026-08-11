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
/** The plate art renders when a middle exists (caps optional). */
export const questSkinPlateActive = PIECES.has('plate-mid') || PIECES.has('plate-mid-l') || PIECES.has('plate-mid-r');
/** The divider ("the side-quests rule") renders when its middle exists. */
export const questSkinDividerActive = PIECES.has('divider-mid');

// Frame geometry (run starts, cap anchoring) keys off the CORNERS as a
// nine-slice must; the CONTENT padding keys off the EDGE BANDS instead
// (thinness lever): thin edges + proud corners = a thin box. Edges, caps
// and center carry no halo (nominal == bitmap); the CORNERS carry a
// vertical halo since kit v21 (overhang room above/below the silhouette),
// so all corner-keyed geometry runs on NOMINAL dims and corner draws
// anchor nominal with the bitmap overhanging into the bleed.
const tl = P('corner-tl');
const tr = P('corner-tr');
const cornerBl = P('corner-bl');
const cornerBr = P('corner-br');
const topMid = P('edge-top-mid');
const bottomMid = P('edge-bottom-mid');
const leftMid = P('edge-left-mid');
const rightMid = P('edge-right-mid');
export const questFrameBorders = {
  t: (topMid?.h ?? (tl ? nomH(tl) : 0)) * Z,
  b: (bottomMid?.h ?? (cornerBl ? nomH(cornerBl) : 0)) * Z,
  l: (leftMid?.w ?? (tl ? nomW(tl) : 0)) * Z,
  r: (rightMid?.w ?? (tr ? nomW(tr) : 0)) * Z,
};

// THE SPLIT PLATE BAND (kit v22, user ask 2026-08-10: "divide plate mid
// into two different pieces instead of repeating the left one"): the band
// is BOOKMATCHED — plate-mid-l tiles from the left cap, plate-mid-r tiles
// RIGHT-ANCHORED from the right cap, meeting at a center seam, so each
// side is its own painting and any width overflow crops at the middle
// where the eye forgives it. Legacy single-piece exports (plate-mid) fall
// back to both slots and render exactly as before — slice JSONs stay
// self-describing.
const plateMidLegacy = P('plate-mid');
const plateMidL = P('plate-mid-l') ?? plateMidLegacy ?? P('plate-mid-r');
const plateMidR = P('plate-mid-r') ?? plateMidLegacy ?? P('plate-mid-l');
/** True when the export carries the v22 split pieces (bookmatch path). */
const plateSplit = PIECES.has('plate-mid-l') || PIECES.has('plate-mid-r');
const plateMid = plateMidL;
/**
 * The whole SEAL assembly (plate + top medallions + QUEST text) sits this
 * much lower than pure geometry would put it — 1 art px, user nudge
 * 2026-08-10. Applied to the plate straddle AND the top ornament;
 * PanelNineSlice mirrors it (preview parity).
 */
export const SEAL_DROP = 1;
/**
 * How far the plate pokes above the box's top edge (the preview's 60% rule,
 * minus the seal drop). Rounded in ART pixels, then scaled — an odd CSS
 * offset (the old CSS-px rounding gave 17) put the plate's art grid half an
 * art pixel off the frame's, the user's "not pixel perfect" report
 * (2026-08-10).
 */
export const questPlateStraddle = plateMid ? (Math.round(nomH(plateMid) * 0.6) - SEAL_DROP) * Z : 0;

// ─── The frame ──────────────────────────────────────────────────────────────

// THE SCROLL SPLIT (user ask, 2026-08-10: "animate the scroll opening"):
// the frame renders as THREE canvases so the entrance can part the rolls —
// PAPER (center field + top/bottom runs and caps) under two ROLL columns
// (each side's corners + vertical edge run, the painted rods). The split is
// PERMANENT — no swap at animation end, so there is nothing to pop. The
// entrance (index.css .quest-paper/.quest-roll-*) starts the rolls butted
// at the box center (the closed scroll) and slides them outward — pure
// transform — while the paper reveals via a one-shot clip-path whose
// boundary tracks each roll's inner edge EXACTLY: clip inset interpolates
// 50% → roll width over the same easing as the roll's travel (both linear
// in progress p), so the cut edge is always flush with the roll and the
// paper texture is REVEALED in place, never stretched. The box's layout
// size never animates — the page below holds still. Travel distances are
// content-dependent, so draw() stamps them as CSS vars on the host.
const ROLL_W_L = (tl ? nomW(tl) : leftMid?.w ?? 0) * Z;
const ROLL_W_R = (tr ? nomW(tr) : rightMid?.w ?? 0) * Z;

/**
 * The nine-slice frame, absolutely filling the quest box: one paper canvas
 * plus two roll-column canvases (see THE SCROLL SPLIT above). Render it
 * FIRST inside the box and wrap the box's content in a `relative` div so
 * text paints above the art.
 */
export const QuestBoxFrame: React.FC = () => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const paperRef = React.useRef<HTMLCanvasElement>(null);
  const rollLRef = React.useRef<HTMLCanvasElement>(null);
  const rollRRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    if (!questSkinFrameActive) return;
    const host = hostRef.current;
    const paper = paperRef.current;
    const rollL = rollLRef.current;
    const rollR = rollRRef.current;
    if (!host || !paper || !rollL || !rollR) return;
    let cancelled = false;

    // The rolls' travel = from butted-at-center to their resting columns.
    // Stamped SYNCHRONOUSLY (layout is ready in a layout effect) so the
    // entrance keyframes see real values on the very first paint — the
    // full draw below waits on image decode and may land after it.
    // Vars live on the ANCHOR: the content wrapper unfurls with the same
    // wipe (quest-scroll-content) and it is a sibling of the frame's
    // wrapper, so only a shared ancestor's vars reach both.
    const varTarget = (host.closest('.quest-box-anchor') as HTMLElement | null) ?? host;
    const stamp = () => {
      const w = host.clientWidth;
      if (!w) return;
      // The seal's entrance ride-down: it stamps vertically centered on
      // the closed scroll (half the box height below its natural spot),
      // art-grid rounded. Read before the width guard would be fine too —
      // kept together with the other var stamps.
      const hh = host.clientHeight;
      if (hh) varTarget.style.setProperty('--qseal-start', `${Math.round(hh / 2 / Z) * Z}px`);
      varTarget.style.setProperty('--qtravel-l', `${Math.max(0, Math.round(w / 2 - ROLL_W_L))}px`);
      varTarget.style.setProperty('--qtravel-r', `${Math.max(0, Math.round(w / 2 - ROLL_W_R))}px`);
      // The clip's CLOSED insets, in px: the keyframes must interpolate
      // px → px. A 50% from-value interpolating to a px to-value is
      // mixed-unit calc territory, which some engines animate DISCRETELY
      // — the paper snapped to full width mid-open while the rods were
      // still traveling (user report, 2026-08-10). NOTE the content
      // wrapper is narrower than the box (side padding), so w/2 over-
      // clips it when closed — harmless, fully hidden is fully hidden.
      varTarget.style.setProperty('--qclose', `${w / 2}px`);
      varTarget.style.setProperty('--qedge-l', `${ROLL_W_L}px`);
      varTarget.style.setProperty('--qedge-r', `${ROLL_W_R}px`);
    };
    stamp();

    const draw = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      stamp();

      // Corner-keyed geometry (NOMINAL — corner bitmaps may carry a v21
      // vertical halo); edge-keyed content bands (see header).
      const bt = (tl ? nomH(tl) : topMid?.h ?? 0) * Z;
      const bb = (cornerBl ? nomH(cornerBl) : bottomMid?.h ?? 0) * Z;
      const bl = ROLL_W_L;
      const br = ROLL_W_R;
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

      // ── PAPER: the notched-cross centre + top/bottom runs, everything
      // the rolls reveal. Tiles phase-anchored at (bl, bt); the sacred
      // corner squares stay unpainted.
      const pctx = prepCanvas(paper, w, h, BLEED);
      if (pctx) {
        pctx.clearRect(-BLEED, -BLEED, w + BLEED * 2, h + BLEED * 2);
        drawTiled(pctx, ctr, bl, bt, w - bl - br, h - bt - bb, bl, bt);
        if (bt > gt) drawTiled(pctx, ctr, bl, gt, w - bl - br, bt - gt, bl, bt);
        if (bb > gb) drawTiled(pctx, ctr, bl, h - bb, w - bl - br, bb - gb, bl, bt);
        drawTiled(pctx, topMid, bl + capTL, 0, w - bl - br - capTL - capTR, (topMid?.h ?? 0) * Z, bl + capTL, 0);
        drawTiled(pctx, bottomMid, bl + capBL, h - (bottomMid?.h ?? 0) * Z, w - bl - br - capBL - capBR, (bottomMid?.h ?? 0) * Z, bl + capBL, h - (bottomMid?.h ?? 0) * Z);
        if (fitT) { drawFixed(pctx, P('edge-top-cap-l'), bl, 0); drawFixed(pctx, P('edge-top-cap-r'), w - br - capTR, 0); }
        if (fitB) { drawFixed(pctx, P('edge-bottom-cap-l'), bl, h - (P('edge-bottom-cap-l')?.h ?? 0) * Z); drawFixed(pctx, P('edge-bottom-cap-r'), w - br - capBR, h - (P('edge-bottom-cap-r')?.h ?? 0) * Z); }
      }

      // ── LEFT ROLL (column-local coords equal box coords on this side):
      // side gutter strip (paper wrapped around the roll — it rides the
      // roll so the exact-tracking clip never has to reveal art under the
      // column), the vertical run, its caps, then the corners on top with
      // their v21 tails overhanging into the bleed.
      const lctx = prepCanvas(rollL, bl, h, BLEED);
      if (lctx) {
        lctx.clearRect(-BLEED, -BLEED, bl + BLEED * 2, h + BLEED * 2);
        if (bl > gl) drawTiled(lctx, ctr, gl, bt, bl - gl, h - bt - bb, bl, bt);
        drawTiled(lctx, leftMid, 0, bt + capLT, gl, h - bt - bb - capLT - capLB, 0, bt + capLT);
        if (fitL) { drawFixed(lctx, P('edge-left-cap-t'), 0, bt); drawFixed(lctx, P('edge-left-cap-b'), 0, h - bb - capLB); }
        if (tl) drawFixed(lctx, tl, -(tl.halo?.l ?? 0) * Z, -(tl.halo?.t ?? 0) * Z);
        if (cornerBl) drawFixed(lctx, cornerBl, -(cornerBl.halo?.l ?? 0) * Z, h - nomH(cornerBl) * Z - (cornerBl.halo?.t ?? 0) * Z);
      }

      // ── RIGHT ROLL (column-local: box x minus (w - br)).
      const rctx = prepCanvas(rollR, br, h, BLEED);
      if (rctx) {
        rctx.clearRect(-BLEED, -BLEED, br + BLEED * 2, h + BLEED * 2);
        const dx0 = w - br;
        if (br > gr) drawTiled(rctx, ctr, 0, bt, br - gr, h - bt - bb, bl - dx0, bt);
        drawTiled(rctx, rightMid, br - gr, bt + capRT, gr, h - bt - bb - capRT - capRB, br - gr, bt + capRT);
        if (fitR) { drawFixed(rctx, P('edge-right-cap-t'), br - (P('edge-right-cap-t')?.w ?? 0) * Z, bt); drawFixed(rctx, P('edge-right-cap-b'), br - (P('edge-right-cap-b')?.w ?? 0) * Z, h - bb - capRB); }
        if (tr) drawFixed(rctx, tr, br - nomW(tr) * Z - (tr.halo?.l ?? 0) * Z, -(tr.halo?.t ?? 0) * Z);
        if (cornerBr) drawFixed(rctx, cornerBr, br - nomW(cornerBr) * Z - (cornerBr.halo?.l ?? 0) * Z, h - nomH(cornerBr) * Z - (cornerBr.halo?.t ?? 0) * Z);
      }
      // Edge ornaments stay OUT of these canvases (QuestOrnaments below):
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
    // quest-scroll-stamp: the CLOSED scroll takes the entrance's first
    // beat (user re-order round 2) — the whole layer presses in with the
    // stamp keyframes. Only the butted rods read (the paper is hidden by
    // its own closed clip), and the stamp's scale composes fine with the
    // rolls' travel transforms since they sit at the scaled center.
    <div ref={hostRef} aria-hidden className="quest-scroll-stamp absolute inset-0">
      {/* The paper's resting clip insets (--qedge-*, stamped on the
          anchor) must equal the roll widths — the exact-tracking
          contract with the entrance keyframes. */}
      <div className="quest-paper absolute inset-0">
        <canvas ref={paperRef} style={{ position: 'absolute' }} />
      </div>
      <div className="quest-roll-l absolute inset-y-0 left-0" style={{ width: ROLL_W_L }}>
        <canvas ref={rollLRef} style={{ position: 'absolute' }} />
      </div>
      <div className="quest-roll-r absolute inset-y-0 right-0" style={{ width: ROLL_W_R }}>
        <canvas ref={rollRRef} style={{ position: 'absolute' }} />
      </div>
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
        // Centering SNAPS TO THE ART GRID (multiples of Z): plain CSS-px
        // rounding could land the ornament on an odd CSS offset — half an
        // art pixel off the frame's grid, visibly "not pixel perfect"
        // (user report 2026-08-10). One CSS px off-center is invisible;
        // half an art px off-grid is not.
        const x = Math.round((w - nw) / (2 * Z)) * Z - (pc.halo?.l ?? 0) * Z;
        const edgeOffset = Math.round((bandH - nh) / (2 * Z)) * Z;
        // Top medallions ride the seal assembly's 1-art drop (user nudge).
        const y = (isTop ? edgeOffset + SEAL_DROP * Z : h - bandH + edgeOffset) - (pc.halo?.t ?? 0) * Z;
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
  // Bookmatched band (kit v22): left/right halves are distinct pieces;
  // legacy single-mid exports fall back to both slots (module consts).
  const m = plateMidL;
  const mr = plateMidR;
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
      // BOOKMATCH (v22): the left piece tiles from the left cap, the
      // right piece tiles RIGHT-ANCHORED (lattice at w−rw, so its art
      // sits flush against its cap), meeting at an art-grid center seam
      // — overflow crops in the middle, never at the finished ends.
      // LEGACY single-mid exports keep the ORIGINAL single-span draw:
      // splitting them would re-anchor the right half's lattice and
      // phase-shift the committed art (the span is not generally a
      // tile multiple).
      const my = -(m.halo?.t ?? 0) * Z;
      const span = w - lw - rw;
      if (!plateSplit || !mr) {
        drawTiled(ctx, m, lw, my, span, m.h * Z, lw, my);
      } else {
        const half = Math.round(span / (2 * Z)) * Z;
        drawTiled(ctx, m, lw, my, half, m.h * Z, lw, my);
        drawTiled(ctx, mr, lw + half, my, span - half, mr.h * Z, w - rw, my);
      }
      if (l) drawFixed(ctx, l, -(l.halo?.l ?? 0) * Z, -(l.halo?.t ?? 0) * Z);
      if (r) drawFixed(ctx, r, w - rw - (r.halo?.l ?? 0) * Z, -(r.halo?.t ?? 0) * Z);
    };
    // SYNCHRONOUS draw, not rAF: hidden/background tabs freeze rAF and the
    // canvas stays blank until the tab fronts (hit live in the hidden
    // preview pane). RO callbacks batch already; the draws are tiny.
    const schedule = draw;
    whenDecoded([m, mr, P('plate-cap-l'), P('plate-cap-r')].filter(Boolean) as SkinPiece[]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); };
  }, [m, mr, h, snapRef]);
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
