import React from 'react';
import skinJson from '../../assets/panels/rung-plaque-slices.json';
import { Z, buildSkin, useCrispSnap, prepCanvas, drawFixed, drawTiled, whenDecoded, type SkinPiece } from './panelSkins';

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

const PIECES = buildSkin(skinJson, 'rung-plaque');

export const rungPlaqueActive = PIECES.has('plaque-mid');

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
 * Content on the plaque. Baseline (no art): children untouched, no
 * wrapper. Skinned: a self-snapping span with the 3-slice canvas behind
 * and the content above (GateSign's pattern).
 */
export const RungPlaque: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
  if (!rungPlaqueActive) return <>{children}</>;
  return (
    <span ref={snapRef} className="rung-plaque-skinned">
      <canvas ref={canvasRef} aria-hidden style={{ position: 'absolute' }} />
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>{children}</span>
    </span>
  );
};
