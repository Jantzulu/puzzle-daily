import { type SkinPiece, Z, barCenters, EDGE_BAR_INSET, drawTiled, nomW, nomH, drawFixed } from './panelSkins';

// Skin data and draws moved out of PortcullisMesh.tsx (2026-10-18 delint: a
// component file that also exports plain values breaks React Fast
// Refresh). The forge preview draws through these too (share-the-renderer).

// Iron tones, shared with the banner rod's palette. Exported: the mobile
// menu's gate beams (shared/GateMesh.tsx) are forged from the same iron.
export const IRON = {
  dark: '#17130f',      // under-frame, shadowed metal
  body: '#2b2620',      // bar stock
  face: '#3b352d',      // rail face the controls sit on
  lit: '#4a4239',       // edges catching the top-left light
  highlight: 'rgba(255, 235, 200, 0.22)',
};

/**
 * The rail surface's draw, parameterized on the two skin maps so the
 * forge's live preview (PortcullisLive) renders with THIS routine fed its
 * fresh slices — preview divergence is structurally impossible. Callers
 * prep/clear the canvas.
 */
export const drawRailSkin = (
  ctx: CanvasRenderingContext2D, w: number, h: number,
  rail: Map<string, SkinPiece>, bars: Map<string, SkinPiece>,
) => {
  const face = rail.get('rail-face');
  const spike = rail.get('rail-spike');
  const plate = rail.get('forge-plate');
  const capL = rail.get('rail-cap-l');
  const capR = rail.get('rail-cap-r');
  const bar = bars.get('bar-segment');

  // The host box = the mesh's box (200% of the rung, band zone in the
  // middle per .control-rail-mesh's ratios). The art band is a FIXED 22
  // art px (44 CSS) centered on the box's band zone: band top =
  // 31.25% of the box (the mesh's bars/rail boundary), rounded to a
  // whole pixel so every art row lands crisp.
  const bandH = (face?.h ?? 22) * Z;
  const spikeH = (spike?.h ?? 0) * Z;
  const bandTop = Math.round(h * 0.3125);

  // Outer pair 2 art in from flush (user call, 2026-08-02), interior
  // evenly spaced; the plates and spikes ride the same centers.
  const barXs = barCenters(w, (bar?.w ?? 6) * Z, EDGE_BAR_INSET * Z);

  // Bars rise from the band's top edge to the box top (they tuck
  // behind the band: draw them first, band over). NO bar-top-cap here:
  // these bars never terminate visibly — they continue behind the board
  // (gate closed) or up into the menu's beams (gate lowered) — and the
  // cap's finial shading drawn at the box top read as "darker first
  // pixels with a stark line" on every bar (user hunt, 2026-08-03; the
  // scrims were exonerated pixel by pixel). The cap piece stays in the
  // kit for surfaces where a bar genuinely ends.
  if (bar) {
    const bw = bar.w * Z;
    for (const bx of barXs) {
      drawTiled(ctx, bar, Math.round(bx - bw / 2), 0, bw, bandTop + 2, Math.round(bx - bw / 2), 0);
    }
  }

  // The band: tiled face between optional caps. All hardware anchors by
  // NOMINAL size (bitmap minus halo) so aura'd pieces keep their
  // geometry and the overflow just paints further.
  const clW = capL ? nomW(capL) * Z : 0;
  const crW = capR ? nomW(capR) * Z : 0;
  drawTiled(ctx, face, clW, bandTop, w - clW - crW, bandH, clW, bandTop);
  // Caps VERTICALLY CENTERED on the band (user call, 2026-08-02): a cap
  // taller than the 22-art band overhangs the rung's top and bottom
  // EQUALLY instead of hanging off its foot.
  const capY = (pc: SkinPiece) => bandTop + Math.round((bandH - nomH(pc) * Z) / 2) - (pc.halo?.t ?? 0) * Z;
  if (capL) drawFixed(ctx, capL, -(capL.halo?.l ?? 0) * Z, capY(capL));
  if (capR) drawFixed(ctx, capR, w - crW - (capR.halo?.l ?? 0) * Z, capY(capR));

  // Plates where each bar meets the band, VERTICALLY CENTERED on it (user
  // call, 2026-08-02): the earlier +14 line was the svg's bar-crossing
  // height — 2 art above the 22-art band's centre, and the user saw it.
  // The centred offset stays even for even piece sizes, so the plate's
  // art pixels keep the band's 2px grid. Same RULE as GateBeamSkin's
  // plate line (there centre and crossing height coincide).
  if (plate) {
    const pw = nomW(plate) * Z;
    const py = bandTop + Math.round((bandH - nomH(plate) * Z) / 2) - (plate.halo?.t ?? 0) * Z;
    for (const bx of barXs) drawFixed(ctx, plate, Math.round(bx - pw / 2) - (plate.halo?.l ?? 0) * Z, py);
  }

  // Spikes hanging below the band at each bar; the outer pair clips at
  // the canvas edge exactly as the mesh's spikes clipped at the
  // viewBox. Spikes carry ±8 art of SIDE AURA (user ask, 2026-08-02) —
  // nominal stays on the bar center, tips may curl wide of it.
  if (spike && spikeH) {
    const sw = nomW(spike) * Z;
    for (const bx of barXs) drawFixed(ctx, spike, Math.round(bx - sw / 2) - (spike.halo?.l ?? 0) * Z, bandTop + bandH - (spike.halo?.t ?? 0) * Z);
  }
};
