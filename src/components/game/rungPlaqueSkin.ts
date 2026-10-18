import { type SkinPiece, nomH, Z, drawTiled, drawFixed } from './panelSkins';

// The rung plaque's skin data and draws, moved out of RungPlaque.tsx
// (2026-10-18 delint: a component file that also exports plain values
// breaks React Fast Refresh). The forge preview (PortcullisLive) draws
// through these too: the share-the-renderer law.

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

/** Header plate height in CSS px for a given skin map (0 when unpainted). */
const plaqueHeaderHeight = (pieces: Map<string, SkinPiece>): number => {
  const m = pieces.get('header-mid');
  return m ? nomH(m) * Z : 0;
};

/**
 * How far the header pokes above the plaque's top edge — the quest
 * plate's 60% rule at the smaller register.
 */
export const plaqueHeaderStraddle = (pieces: Map<string, SkinPiece>): number =>
  Math.round(plaqueHeaderHeight(pieces) * 0.6);
