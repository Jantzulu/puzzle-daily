import { type SkinPiece, Z, drawTiled, drawFixed, barCenters, EDGE_BAR_INSET, nomW, nomH, buildSkin } from '../game/panelSkins';
import navJson from '../../assets/panels/nav-gate-slices.json';

// Skin data and draws moved out of GateMesh.tsx (2026-10-18 delint: a
// component file that also exports plain values breaks React Fast
// Refresh). The forge preview draws through these too (share-the-renderer).

// ─── Painted skin (forge-cut art, 'nav-gate' kit) ───────────────────────────
// Empty placeholder = the procedural svg below renders untouched. The skin
// canvas draws the beam at the settled THIN 36px iron centered in the item
// box, bars at the six shared fractions bridging the stack (the same
// overflow trick: the canvas bleeds past the item box; later siblings paint
// over incoming bar tips), and plates at the crossings. Sign plates render
// separately (GateSign) with the DOM label on top.
export const NAV = buildSkin(navJson, 'nav-gate');
export const navSignSkinActive = NAV.has('sign-mid');

/**
 * The threading BARS, alone — drawn on their own UNFILTERED canvas. The
 * beam layer's CSS drop-shadow applies per-pixel, so bars drawn on it
 * stamped their descending tips' shadows onto whatever continued the
 * column below — the control rail's rising bars wore a stark dark band
 * just above the rung (2026-08-03 hunt; the svg had the identical flaw
 * for the same reason). Iron casts a shadow; the lattice must not.
 * Callers prep/clear (bleed 32 covers the overhangs: first item 26 up,
 * every item 12 down).
 */
export const drawGateBars = (ctx: CanvasRenderingContext2D, w: number, h: number, nav: Map<string, SkinPiece>, first: boolean) => {
  const bar = nav.get('beam-bar-segment');
  if (!bar) return;
  // Outer pair 2 art in from flush, interior evenly spaced — same rule
  // as PortcullisSkin: the menu and the rail share their width, so the
  // columns stay one gate.
  const barXs = barCenters(w, bar.w * Z, EDGE_BAR_INSET * Z);
  const bw = bar.w * Z;
  const yTop = first ? -26 : 0;
  for (const bx of barXs) {
    drawTiled(ctx, bar, Math.round(bx - bw / 2), yTop, bw, h + 12 - yTop, Math.round(bx - bw / 2), 0);
  }
};

/**
 * The beam IRON (face, end caps, plates) — the drop-shadowed layer. The
 * forge's live preview (PortcullisLive) composes drawGateBars + this on
 * one canvas, so preview divergence stays structurally impossible.
 */
export const drawGateBeamSkin = (ctx: CanvasRenderingContext2D, w: number, h: number, nav: Map<string, SkinPiece>) => {
  const beam = nav.get('beam-face');
  const bar = nav.get('beam-bar-segment');
  const plate = nav.get('beam-plate');
  const capL = nav.get('beam-cap-l');
  const capR = nav.get('beam-cap-r');
  const beamH = (beam?.h ?? 18) * Z;
  const beamTop = Math.round((h - beamH) / 2);
  const barXs = barCenters(w, (bar?.w ?? 6) * Z, EDGE_BAR_INSET * Z);

  // The beam: tiled face between optional FIXED end caps (user catch,
  // 2026-08-03: the tiling face repeated its painted outer outline
  // internally — finished ends must be fixed pieces, the rail's rule).
  // Caps center vertically on the iron and anchor by nominal.
  const clW = capL ? nomW(capL) * Z : 0;
  const crW = capR ? nomW(capR) * Z : 0;
  drawTiled(ctx, beam, clW, beamTop, w - clW - crW, beamH, clW, beamTop);
  const capY = (pc: SkinPiece) => beamTop + Math.round((beamH - nomH(pc) * Z) / 2) - (pc.halo?.t ?? 0) * Z;
  if (capL) drawFixed(ctx, capL, -(capL.halo?.l ?? 0) * Z, capY(capL));
  if (capR) drawFixed(ctx, capR, w - crW - (capR.halo?.l ?? 0) * Z, capY(capR));

  // Plates where each bar crosses the beam, VERTICALLY CENTERED on the
  // iron — for the default 18-art beam this equals the old +14 crossing
  // line, but the RULE is centred (lockstep with drawRailSkin, where the
  // user caught the two heights disagreeing on the taller band).
  if (plate) {
    const pw = nomW(plate) * Z;
    const py = beamTop + Math.round((beamH - nomH(plate) * Z) / 2) - (plate.halo?.t ?? 0) * Z;
    for (const bx of barXs) drawFixed(ctx, plate, Math.round(bx - pw / 2) - (plate.halo?.l ?? 0) * Z, py);
  }
};

/** The sign plate's 3-slice draw — shared with the forge preview like the beam's. */
export const drawGateSignSkin = (ctx: CanvasRenderingContext2D, w: number, h: number, nav: Map<string, SkinPiece>) => {
  const mid = nav.get('sign-mid');
  const cl = nav.get('sign-cap-l');
  const cr = nav.get('sign-cap-r');
  const signH = (mid?.h ?? 13) * Z;
  const y = Math.round((h - signH) / 2);
  const clW = cl ? cl.w * Z : 0;
  const crW = cr ? cr.w * Z : 0;
  drawTiled(ctx, mid, clW, y, w - clW - crW, signH, clW, y);
  if (cl) drawFixed(ctx, cl, 0, y);
  if (cr) drawFixed(ctx, cr, w - crW, y);
};
