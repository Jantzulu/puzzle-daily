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

const Z = 2;

interface SkinPiece {
  id: string;
  w: number;
  h: number;
  halo?: { l: number; t: number; r: number; b: number };
  png: string;
}

interface SkinJsonPiece {
  id?: unknown;
  w?: unknown;
  h?: unknown;
  empty?: unknown;
  halo?: unknown;
  png?: unknown;
}

const nomW = (p: SkinPiece) => p.w - (p.halo ? p.halo.l + p.halo.r : 0);
const nomH = (p: SkinPiece) => p.h - (p.halo ? p.halo.t + p.halo.b : 0);

// The slices file is OVERWRITTEN BY HAND (that is its workflow), so this
// validates like user input, not like build output: every reject falls back
// to the baseline CSS box or to a smaller safe rendering, never to NaN
// geometry. Review-hardened 2026-08-01 (adversarial pass found the holes).
const MAX_PIECE_PX = 512;

function buildSkin(): Map<string, SkinPiece> {
  const map = new Map<string, SkinPiece>();
  // `| null`: a file containing bare `null` is valid JSON — without the
  // optional chain it would throw at module evaluation and white-screen
  // BOTH apps (Game.tsx is imported by App and PlayerApp).
  const payload = skinJson as { kitId?: unknown; pieces?: SkinJsonPiece[] } | null;
  const raw = payload?.pieces;
  if (!Array.isArray(raw)) return map;
  // Wrong kit's export (four other kits share these piece ids, and plain
  // nine-slice kits would render naked edge runs): baseline, loudly.
  if (payload?.kitId !== 'quest-box') {
    console.warn(`quest-box-slices.json carries kitId "${String(payload?.kitId)}" — expected "quest-box"; rendering the baseline box.`);
    return map;
  }
  for (const p of raw) {
    // Unpainted slots ship in the export flagged empty — they must not
    // produce blank layers that cover the art beneath them. Strict ===:
    // a hand-edited string "false" is truthy and silently dropped art.
    if (p.empty === true) continue;
    if (typeof p.id !== 'string' || typeof p.png !== 'string' || !p.png.startsWith('data:image/')) continue;
    if (typeof p.w !== 'number' || typeof p.h !== 'number') continue;
    if (!Number.isFinite(p.w) || !Number.isFinite(p.h) || p.w < 1 || p.h < 1 || p.w > MAX_PIECE_PX || p.h > MAX_PIECE_PX) continue;
    // Halo only in the exporter's shape: four finite non-negative insets
    // strictly inside the bitmap. Anything else drops the halo (the piece
    // still renders at bitmap size) — a partial/garbage halo otherwise
    // cascades NaN into nominal sizes, the straddle, and the box padding.
    let halo: SkinPiece['halo'];
    const h = p.halo as { l?: unknown; t?: unknown; r?: unknown; b?: unknown } | undefined;
    if (h && typeof h === 'object') {
      const vals = [h.l, h.t, h.r, h.b];
      const ok = vals.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)
        && (h.l as number) + (h.r as number) < p.w
        && (h.t as number) + (h.b as number) < p.h;
      if (ok) halo = { l: h.l as number, t: h.t as number, r: h.r as number, b: h.b as number };
    }
    map.set(p.id, { id: p.id, w: p.w, h: p.h, halo, png: p.png });
  }
  return map;
}

const PIECES = buildSkin();
const P = (id: string) => PIECES.get(id);

/** The frame renders only when the minimum readable box exists. */
export const questSkinFrameActive = PIECES.has('corner-tl') && PIECES.has('center');
/** The plate art renders when its middle exists (caps optional). */
export const questSkinPlateActive = PIECES.has('plate-mid');
/**
 * The divider ("the side-quests rule", per the kit) renders when its middle
 * exists — it replaces the side-quests row's CSS border-t.
 */
export const questSkinDividerActive = PIECES.has('divider-mid');

// Frame geometry (run starts, cap anchoring) keys off the CORNERS as a
// nine-slice must; the CONTENT padding below keys off the EDGE BANDS
// instead (thinness lever): thin edges + proud corners = a thin box. The
// corners may overhang the content zone at the four flanks — the quest
// content is centered, so nothing collides. Frame pieces carry no halo, so
// nominal == bitmap.
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

/** Positive modulo — tile phase alignment. */
const pmod = (v: number, m: number) => ((v % m) + m) % m;

/**
 * Snap an element to whole CSS pixels: flex/mx-auto centering and
 * text-driven widths land elements on half-pixels, and bitmap art at a
 * fractional offset is resampled at every zoom. Compensation uses
 * POSITION:RELATIVE left/top — never transform, which can promote the
 * subtree to a composited layer resampled at the fractional offset (the
 * "discolored perfect rectangle around QUEST"). Both snapped elements
 * already carry position: relative.
 */
export function useCrispSnap<T extends HTMLElement>(active: boolean, defer = false) {
  const ref = React.useRef<T>(null);
  React.useLayoutEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const snap = () => {
      el.style.left = '0px';
      el.style.top = '0px';
      const r = el.getBoundingClientRect();
      const dx = Math.round(r.left) - r.left;
      const dy = Math.round(r.top) - r.top;
      el.style.left = `${dx.toFixed(3)}px`;
      el.style.top = `${dy.toFixed(3)}px`;
    };
    // `defer`: elements INSIDE another snapped element must measure AFTER
    // their ancestor's compensation lands (child effects and same-frame
    // rAFs otherwise measure the pre-snap position and go stale by the
    // ancestor's dx). A double rAF puts the child a frame behind.
    const run = () => {
      cancelAnimationFrame(raf);
      raf = defer
        ? requestAnimationFrame(() => { raf = requestAnimationFrame(snap); })
        : requestAnimationFrame(snap);
    };
    if (defer) run(); else snap();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    ro.observe(document.documentElement);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [active, defer]);
  return ref;
}

// ─── Canvas plumbing ────────────────────────────────────────────────────────

const IMG_CACHE = new Map<string, HTMLImageElement>();
const imgFor = (p: SkinPiece): HTMLImageElement => {
  let img = IMG_CACHE.get(p.id);
  if (!img) {
    img = new Image();
    img.src = p.png;
    IMG_CACHE.set(p.id, img);
  }
  return img;
};
const whenDecoded = (pieces: SkinPiece[]): Promise<unknown> =>
  Promise.all(pieces.map(p => {
    const img = imgFor(p);
    return img.complete ? Promise.resolve() : img.decode().catch(() => { /* draw skips broken images */ });
  }));

/** Draw a fixed piece at (x, y) in CSS-px canvas coordinates. */
const drawFixed = (ctx: CanvasRenderingContext2D, p: SkinPiece | undefined, x: number, y: number) => {
  if (!p) return;
  const img = imgFor(p);
  if (!img.complete || !img.naturalWidth) return;
  ctx.drawImage(img, 0, 0, p.w, p.h, x, y, p.w * Z, p.h * Z);
};

/** Tile a piece across a rect, phase-anchored at (ax, ay). */
const drawTiled = (
  ctx: CanvasRenderingContext2D,
  p: SkinPiece | undefined,
  dx: number, dy: number, dw: number, dh: number,
  ax: number, ay: number,
) => {
  if (!p || dw <= 0 || dh <= 0) return;
  const img = imgFor(p);
  if (!img.complete || !img.naturalWidth) return;
  const tw = p.w * Z;
  const th = p.h * Z;
  const startX = dx - pmod(dx - ax, tw);
  const startY = dy - pmod(dy - ay, th);
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  for (let y = startY; y < dy + dh; y += th) {
    for (let x = startX; x < dx + dw; x += tw) {
      ctx.drawImage(img, 0, 0, p.w, p.h, x, y, tw, th);
    }
  }
  ctx.restore();
};

/**
 * Prepare a canvas at device resolution for a CSS-px box, with BLEED margins
 * for halo overhang. Returns the 2D context pre-scaled so all drawing uses
 * CSS-px coordinates with (0,0) at the box's top-left.
 */
const prepCanvas = (canvas: HTMLCanvasElement, w: number, h: number, bleed: number): CanvasRenderingContext2D | null => {
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  canvas.width = (w + bleed * 2) * dpr;
  canvas.height = (h + bleed * 2) * dpr;
  canvas.style.width = `${w + bleed * 2}px`;
  canvas.style.height = `${h + bleed * 2}px`;
  canvas.style.left = `${-bleed}px`;
  canvas.style.top = `${-bleed}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, bleed * dpr, bleed * dpr);
  ctx.imageSmoothingEnabled = false;
  return ctx;
};

// Max halo overhang in CSS px (8 art px each side).
const BLEED = 8 * Z;

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
    let raf = 0;

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

      // Centered edge ornaments — fixed medallions, nominal centered on the
      // edge band, halo overhanging (the bleed margin holds it).
      const ornament = (pc: SkinPiece | undefined, isTop: boolean) => {
        if (!pc) return;
        const bandH = isTop ? gt : gb;
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

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    whenDecoded([...PIECES.values()]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    ro.observe(document.documentElement);
    return () => {
      cancelled = true;
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  if (!questSkinFrameActive) return null;
  return (
    <div ref={hostRef} aria-hidden className="absolute inset-0">
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
    let raf = 0;
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
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    whenDecoded([m, P('divider-cap-l'), P('divider-cap-r')].filter(Boolean) as SkinPiece[]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); cancelAnimationFrame(raf); };
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
    let raf = 0;
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
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    whenDecoded([m, P('plate-cap-l'), P('plate-cap-r')].filter(Boolean) as SkinPiece[]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); cancelAnimationFrame(raf); };
  }, [m, h, snapRef]);
  if (!m) return null;
  const l = P('plate-cap-l');
  const r = P('plate-cap-r');
  return (
    <span ref={snapRef} className="inline-flex relative" style={{ height: h }}>
      <canvas ref={canvasRef} aria-hidden style={{ position: 'absolute' }} />
      {l && <span style={{ width: nomW(l) * Z, height: h, flexShrink: 0 }} />}
      <span style={{ position: 'relative', minWidth: nomW(m) * Z, height: h, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="relative px-1.5">{children}</span>
      </span>
      {r && <span style={{ width: nomW(r) * Z, height: h, flexShrink: 0 }} />}
    </span>
  );
};
