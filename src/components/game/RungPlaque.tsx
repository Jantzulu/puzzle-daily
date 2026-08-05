import React from 'react';
import skinJson from '../../assets/panels/rung-plaque-slices.json';
import { Z, buildSkin, nomW, nomH, useCrispSnap, prepCanvas, drawFixed, drawTiled, whenDecoded, type SkinPiece } from './panelSkins';

// ============================================================================
// RUNG PLAQUE — one shared 3-slice worn by BOTH rail plaques
// ============================================================================
// Lives (left) and Max Turns (right) used to sit directly on the rung; the
// user wanted them on their own customizable panel — ONE design serving
// both (their call, 2026-08-04: "they should share the same type of panel,
// so I would only ever design one"). The sign-plate pattern: fixed painted
// ends, tiling middle, content-driven width, DOM text/hearts riding on
// top. Drop path: src/assets/panels/rung-plaque-slices.json; empty
// placeholder = the plain on-rung look, unchanged.
//
// 2026-08-04 redesign (user spec): each plaque also wears a small HEADER
// plate riding proud of its top edge — the quest box's QUEST-plate
// relation, miniaturized. The header 3-slice (header-cap-l/mid/cap-r, a
// smaller register than the main plaque) carries a DOM label (LIVES /
// TURNS); its width is text-driven like the quest plate. Unpainted header
// pieces = the label renders as an inline prefix chip inside the plaque.

const PIECES = buildSkin(skinJson, 'rung-plaque');

export const rungPlaqueActive = PIECES.has('plaque-mid');
export const plaqueHeaderActive = PIECES.has('header-mid');

/**
 * The plaque's draw, parameterized on the skin map — the forge's live
 * preview composes THIS routine with its fresh slices (share-the-renderer
 * law). Caps at the ends, middle tiled between their nominal edges,
 * vertically centered in the host.
 */
export const drawRungPlaque = (ctx: CanvasRenderingContext2D, w: number, h: number, pieces: Map<string, SkinPiece>) => {
  const mid = pieces.get('plaque-mid');
  const cl = pieces.get('plaque-cap-l');
  const cr = pieces.get('plaque-cap-r');
  const plaqueH = (mid?.h ?? 13) * Z;
  const y = Math.round((h - plaqueH) / 2);
  const clW = cl ? cl.w * Z : 0;
  const crW = cr ? cr.w * Z : 0;
  drawTiled(ctx, mid, clW, y, w - clW - crW, plaqueH, clW, y);
  if (cl) drawFixed(ctx, cl, 0, y);
  if (cr) drawFixed(ctx, cr, w - crW, y);
};

/**
 * The header plate's draw — the quest plate's halo-aware 3-slice, exact
 * abut between nominal cap edges (cap-art transparency is silhouette;
 * never tuck a band under the caps). Shared with the forge preview.
 */
export const drawPlaqueHeader = (ctx: CanvasRenderingContext2D, w: number, pieces: Map<string, SkinPiece>) => {
  const m = pieces.get('header-mid');
  if (!m) return;
  const l = pieces.get('header-cap-l');
  const r = pieces.get('header-cap-r');
  const lw = l ? nomW(l) * Z : 0;
  const rw = r ? nomW(r) * Z : 0;
  const my = -(m.halo?.t ?? 0) * Z;
  drawTiled(ctx, m, lw, my, w - lw - rw, m.h * Z, lw, my);
  if (l) drawFixed(ctx, l, -(l.halo?.l ?? 0) * Z, -(l.halo?.t ?? 0) * Z);
  if (r) drawFixed(ctx, r, w - rw - (r.halo?.l ?? 0) * Z, -(r.halo?.t ?? 0) * Z);
};

/** Header plate height in CSS px for a given skin map (0 when unpainted). */
export const plaqueHeaderHeight = (pieces: Map<string, SkinPiece>): number => {
  const m = pieces.get('header-mid');
  return m ? nomH(m) * Z : 0;
};

/**
 * How far the header pokes above the plaque's top edge — the quest
 * plate's 60% rule at the smaller register.
 */
export const plaqueHeaderStraddle = (pieces: Map<string, SkinPiece>): number =>
  Math.round(plaqueHeaderHeight(pieces) * 0.6);

/** Room the header's bleed canvas needs for future halo'd cap art. */
const HEADER_BLEED = 8;

/**
 * The header plate: text-driven width (quest-plate spacer plumbing), DOM
 * label above the canvas. Parameterized on the skin map so the forge's
 * live preview mounts THIS component with its fresh slices. The host
 * anchoring (absolute span at -straddle) belongs to the caller.
 */
export const PlaqueHeader: React.FC<{ pieces: Map<string, SkinPiece>; children: React.ReactNode }> = ({ pieces, children }) => {
  // Inside RungPlaque the ancestor chain is itself a DEFERRED snap —
  // wait one frame beyond it (the deep-defer case useCrispSnap documents).
  const snapRef = useCrispSnap<HTMLSpanElement>(true, 3);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const m = pieces.get('header-mid');
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
      const ctx = prepCanvas(canvas, w, h, HEADER_BLEED);
      if (!ctx) return;
      ctx.clearRect(-HEADER_BLEED, -HEADER_BLEED, w + HEADER_BLEED * 2, h + HEADER_BLEED * 2);
      drawPlaqueHeader(ctx, w, pieces);
    };
    // Synchronous after decode — the shared no-rAF rule.
    const schedule = draw;
    const deps = [m, pieces.get('header-cap-l'), pieces.get('header-cap-r')].filter(Boolean) as SkinPiece[];
    whenDecoded(deps).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); };
  }, [m, h, pieces, snapRef]);
  if (!m) return null;
  const l = pieces.get('header-cap-l');
  const r = pieces.get('header-cap-r');
  return (
    <span ref={snapRef} className="inline-flex relative" style={{ height: h }}>
      <canvas ref={canvasRef} aria-hidden style={{ position: 'absolute' }} />
      {l && <span style={{ width: nomW(l) * Z, height: h, flexShrink: 0 }} />}
      <span style={{ position: 'relative', minWidth: nomW(m) * Z, height: h, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="relative px-1">{children}</span>
      </span>
      {r && <span style={{ width: nomW(r) * Z, height: h, flexShrink: 0 }} />}
    </span>
  );
};

/** The header label's one register — the QUEST plate's recipe. */
const HeaderLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="hud-label text-copper-300 whitespace-nowrap">{children}</span>
);

/**
 * Content on the plaque. Baseline (no art): children untouched aside from
 * an inline header chip, no wrapper. Skinned: a self-snapping span with
 * the 3-slice canvas behind, the header plate riding proud of the top
 * edge, and the content above (GateSign's pattern).
 */
export const RungPlaque: React.FC<{ header?: string; children: React.ReactNode }> = ({ header, children }) => {
  const snapRef = useCrispSnap<HTMLSpanElement>(rungPlaqueActive, true);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    if (!rungPlaqueActive) return;
    const host = snapRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;
    const draw = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const ctx = prepCanvas(canvas, w, h, 0);
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      drawRungPlaque(ctx, w, h, PIECES);
    };
    // Synchronous after decode — the shared no-rAF rule.
    const schedule = draw;
    whenDecoded([...PIECES.values()]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); };
  }, [snapRef]);
  const showPlate = rungPlaqueActive && plaqueHeaderActive && header;
  // Meaning survives every art state: unpainted header pieces (or an
  // unpainted kit entirely) put the label inline before the content.
  const inlineHeader = header && !showPlate ? <HeaderLabel>{header}</HeaderLabel> : null;
  if (!rungPlaqueActive) {
    return inlineHeader
      ? <span className="inline-flex items-center gap-1">{inlineHeader}{children}</span>
      : <>{children}</>;
  }
  return (
    <span ref={snapRef} className="rung-plaque-skinned">
      <canvas ref={canvasRef} aria-hidden style={{ position: 'absolute' }} />
      {showPlate && (
        /* Flex centering, NOT translateX(-50%) — the header's width is
           text-driven and a fractional transform would land the art on
           half-pixels (the quest plate's pinned law). The plaque host is
           min-height 26 = the art's height, so its top edge IS the
           plaque art's top edge. */
        <span
          style={{
            position: 'absolute', left: 0, right: 0,
            top: -plaqueHeaderStraddle(PIECES),
            display: 'flex', justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <PlaqueHeader pieces={PIECES}><HeaderLabel>{header}</HeaderLabel></PlaqueHeader>
        </span>
      )}
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {inlineHeader}
        {children}
      </span>
    </span>
  );
};
