import React from 'react';
import { IRON } from '../game/PortcullisMesh';
import navJson from '../../assets/panels/nav-gate-slices.json';
import { Z, buildSkin, barCenters, EDGE_BAR_INSET, nomW, nomH, drawFixed, drawTiled, prepCanvas, whenDecoded, useCrispSnap, type SkinPiece } from '../game/panelSkins';

// ============================================================================
// GATE BEAM — one horizontal portcullis beam per nav menu item (all widths)
// ============================================================================
// The hamburger's stacked menu items ARE the portcullis: each item rides a
// horizontal iron beam, vertical gate bars run through the stack, and the
// whole lattice reveals itself as the menu slides down — opening the menu
// lowers the gate. Same iron and forge details as the game's PortcullisMesh
// (the control rail under the quest banner).
//
// Continuity trick (borrowed from the old plank ropes): overflow is visible
// and preserveAspectRatio="none" scales content OUTSIDE the viewBox too, so
// each item's bars extend past its own box to bridge the gap below; the
// next item's beam paints over the incoming bar tips (later siblings render
// above earlier ones), which is exactly how a lattice reads. The FIRST
// item's bars instead reach up and slide behind the navbar (its bar is
// z-10). When the play page's control rail is mounted, the menu has NO
// bottom of its own: the rail (PortcullisMesh, spiked) rides the gate's
// leading edge as its bottom (body.menu-gate-lowered) — its rising bars
// meet the last beam's from below, so open menu + rail read as one solid
// portcullis. Otherwise the utility row swaps its beam for that same mesh
// (nav-gate-rail-mesh), so the gate bottoms out with the identical spiked
// rail everywhere.
//
// Bar x fractions (1.5/20.9/40.3/59.7/79.1/98.5%) and ~3% widths MATCH
// PortcullisMesh — both elements render at the same width at every viewport
// (mobile: the full width; md+: the 42rem board column, .menu-gate max-width
// plus the menu's px-4 = rail's max-w-2xl), so the columns align. Six bars
// with the outer pair FLUSH at the edges (see the edge-bar note in
// PortcullisMesh — a portcullis frames its own lattice); change the two
// lists only in lockstep.

const VIEW_W = 400;
const VIEW_H = 52;
// THE THIN BEAM WON (user decision, 2026-07-31). A 44px-iron variant
// (y 4..48) was built so every rung matched the control rail's iron, and the
// user compared them live: "the thinner (36px) menu rungs look a bit better
// than the new 44px internal one. I prefer that between the two." So the
// beams keep their original 36px of iron inside the 52px item, the rail keeps
// its own look (its band fills its 44px box — the ui-mobile-fit portcullis
// the user liked), and the FORGE PLATES are the one element standardized
// across both meshes. Don't re-thicken these to chase rung parity.
const BEAM_TOP = 8;
const BEAM_BOT = 44;

// Vertical bars — same x positions on every item so segments line up into
// continuous bars down the whole menu (all items share width and viewBox).
// Outer pair flush: centre = BAR_HALF from each edge; even pitch between.
const BAR_XS = [6, 83.6, 161.2, 238.8, 316.4, 394];
const BAR_HALF = 6;

// ─── Painted skin (forge-cut art, 'nav-gate' kit) ───────────────────────────
// Empty placeholder = the procedural svg below renders untouched. The skin
// canvas draws the beam at the settled THIN 36px iron centered in the item
// box, bars at the six shared fractions bridging the stack (the same
// overflow trick: the canvas bleeds past the item box; later siblings paint
// over incoming bar tips), and plates at the crossings. Sign plates render
// separately (GateSign) with the DOM label on top.
const NAV = buildSkin(navJson, 'nav-gate');
export const navGateSkinActive = NAV.has('beam-face');
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

const GateBeamSkin: React.FC<{ first?: boolean }> = ({ first = false }) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const barsHostRef = React.useRef<HTMLDivElement>(null);
  const barsCanvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const barsHost = barsHostRef.current;
    const barsCanvas = barsCanvasRef.current;
    if (!host || !canvas || !barsHost || !barsCanvas) return;
    let cancelled = false;
    const draw = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      // Two layers, one geometry: bars on the UNFILTERED canvas (their
      // shadow stamped the rail's bars — see drawGateBars), iron + its
      // drop-shadow on this one.
      const bctx = prepCanvas(barsCanvas, w, h, 32);
      if (bctx) {
        bctx.clearRect(-32, -32, w + 64, h + 64);
        drawGateBars(bctx, w, h, NAV, first);
      }
      const ctx = prepCanvas(canvas, w, h, 32);
      if (!ctx) return;
      ctx.clearRect(-32, -32, w + 64, h + 64);
      drawGateBeamSkin(ctx, w, h, NAV);
    };
    // SYNCHRONOUS draw, not rAF: hidden/background tabs freeze rAF and the
    // canvas stays blank until the tab fronts (hit live in the hidden
    // preview pane). RO callbacks batch already; the draws are tiny.
    const schedule = draw;
    whenDecoded([...NAV.values()] as SkinPiece[]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    ro.observe(document.documentElement);
    return () => { cancelled = true; ro.disconnect(); };
  }, [first]);
  return (
    <>
      <div ref={barsHostRef} className="nav-gate-bars-skin" aria-hidden style={{ overflow: 'visible' }}>
        <canvas ref={barsCanvasRef} style={{ position: 'absolute' }} />
      </div>
      <div ref={hostRef} className="nav-gate-beam-skin" aria-hidden style={{ overflow: 'visible' }}>
        <canvas ref={canvasRef} style={{ position: 'absolute' }} />
      </div>
    </>
  );
};

/**
 * A menu item's label on its steel plate sign. Baseline: the plain span the
 * CSS plates (.nav-gate-item > span). Skinned: the CSS stock switches off
 * (span.nav-gate-sign-skinned) and a 3-slice canvas paints the plate behind
 * the DOM text — the quest plate's pattern. Self-snaps to whole pixels.
 */
export const GateSign: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const snapRef = useCrispSnap<HTMLSpanElement>(navSignSkinActive, true);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    if (!navSignSkinActive) return;
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
      drawGateSignSkin(ctx, w, h, NAV);
    };
    // SYNCHRONOUS draw, not rAF: hidden/background tabs freeze rAF and the
    // canvas stays blank until the tab fronts (hit live in the hidden
    // preview pane). RO callbacks batch already; the draws are tiny.
    const schedule = draw;
    whenDecoded([NAV.get('sign-mid'), NAV.get('sign-cap-l'), NAV.get('sign-cap-r')].filter(Boolean) as SkinPiece[]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); };
  }, [snapRef]);
  if (!navSignSkinActive) return <span>{children}</span>;
  return (
    <span ref={snapRef} className="nav-gate-sign-skinned" style={{ position: 'relative' }}>
      {/* No negative z anywhere in the gate (pinned WebKit rule): the
          canvas paints first, the positioned text sibling above it.
          zIndex 1 (positive, allowed) lifts the label over the active
          plate's ::after bloom layer, which is generated as the span's
          LAST child and would otherwise paint over the text. */}
      <canvas ref={canvasRef} aria-hidden style={{ position: 'absolute' }} />
      <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
    </span>
  );
};

/**
 * Utility-pill contents on the sign plate (user ask, 2026-08-03: the
 * sound and Sign In buttons wear the same plates as the menu labels, at
 * the same height). Wrap the pill's CONTENT in this and add
 * `nav-pill-skinned` to the button when navSignSkinActive — the pill's
 * CSS stock switches off and the 3-slice canvas paints behind. Baseline
 * (no sign art): renders the children untouched, no extra wrapper.
 */
export const NavPillSign: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  navSignSkinActive ? <GateSign>{children}</GateSign> : <>{children}</>;

/**
 * The signed-in avatar's CREST — a forge-cut picture frame attached to
 * the profile plate, painted as a finished object that deliberately
 * OVERHANGS it (user design, 2026-08-03: the smooth CSS circle broke the
 * gate's square-hardware language; overhang is fine when the artist
 * designs it into the slices). Renders the 'avatar-crest' piece nominal-
 * centered BEHIND its children (the avatar chip), halo overhang held by
 * the bleed. No piece painted = children untouched.
 */
export const AvatarCrest: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const crest = NAV.get('avatar-crest');
  const hostRef = React.useRef<HTMLSpanElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    if (!crest) return;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;
    const draw = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const B = 16; // holds the crest's 4-art halo overhang (8px) with room
      const ctx = prepCanvas(canvas, w, h, B);
      if (!ctx) return;
      ctx.clearRect(-B, -B, w + B * 2, h + B * 2);
      const nw = nomW(crest) * Z;
      const nh = nomH(crest) * Z;
      drawFixed(ctx, crest, Math.round((w - nw) / 2) - (crest.halo?.l ?? 0) * Z, Math.round((h - nh) / 2) - (crest.halo?.t ?? 0) * Z);
    };
    // Synchronous after decode — the shared no-rAF rule.
    const schedule = draw;
    whenDecoded([crest]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); };
  }, [crest]);
  if (!crest) return <>{children}</>;
  return (
    <span ref={hostRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <canvas ref={canvasRef} aria-hidden style={{ position: 'absolute' }} />
      <span style={{ position: 'relative', display: 'inline-flex' }}>{children}</span>
    </span>
  );
};

export const GateBeamMesh: React.FC<{ first?: boolean }> = (props) => navGateSkinActive ? <GateBeamSkin {...props} /> : <GateBeamMeshSvg {...props} />;

const GateBeamMeshSvg: React.FC<{ first?: boolean }> = ({ first = false }) => {
  // First: reach up through the menu's top padding to the navbar. Every
  // beam (including the last) extends the same +12 below — the control
  // rail's own rising bars bridge the remaining gap from underneath, and
  // because the rail's wrapper is z-40 vs the nav's z-50, those rising
  // tips tuck BEHIND this beam, never over it.
  const barTop = first ? -26 : 0;
  const barBot = VIEW_H + 12;
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      {/* Vertical gate bars. Left edge lit, right in shade. */}
      {BAR_XS.map((x, i) => (
        <g key={`bar${i}`}>
          <rect x={x - BAR_HALF} y={barTop} width={BAR_HALF * 2} height={barBot - barTop} fill={IRON.body} />
          <rect x={x - BAR_HALF} y={barTop} width="3" height={barBot - barTop} fill={IRON.lit} />
          <rect x={x + BAR_HALF - 3} y={barTop} width="3" height={barBot - barTop} fill={IRON.dark} />
        </g>
      ))}

      {/* The beam: dark under-frame, flat face, lit top edge — original
          proportions (see the thin-beam decision above). */}
      <rect x="0" y={BEAM_TOP} width={VIEW_W} height={BEAM_BOT - BEAM_TOP} fill={IRON.dark} />
      <rect x="0" y={BEAM_TOP + 3} width={VIEW_W} height={BEAM_BOT - BEAM_TOP - 8} fill={IRON.face} />
      <rect x="0" y={BEAM_TOP + 3} width={VIEW_W} height="3" fill={IRON.highlight} />

      {/* Forge plates bolting each bar to the beam.
          NESTED SVG, and that is the whole trick. The outer mesh uses
          preserveAspectRatio="none", so a "square" written in viewBox units
          only renders square at ONE element width — measured 15.1x9 at 672px,
          i.e. visibly squished, and it squashed differently on the rail than
          here. A nested svg with xMidYMid meet keeps its CONTENT's aspect no
          matter how the parent is stretched: the box below is deliberately
          wider than tall, so the plate is sized by the height and lands
          square at every viewport. Painted plate art will inherit the same
          protection instead of being stretched with the rest of the mesh. */}
      {/* Forge plates — THE reference hardware both meshes copy. Original
          size and position (9px square, top 13px below the iron's top), with
          one correction kept from the standardization pass: the WIDTH is
          written so the plate renders square at 672px, the width both meshes
          share at desktop (5.36u × the 672/400 x-stretch = 9px). The rail's
          plates use 2.5× these unit widths — exactly the 1000:400 viewBox
          ratio — so the two render identically at every viewport. Inner rect
          insets 1.5px top-left, flush bottom-right: the fixed light. */}
      {BAR_XS.map((x, i) => (
        <g key={`rivet${i}`}>
          <rect x={x - 2.68} y="21" width="5.36" height="9" fill={IRON.lit} />
          <rect x={x - 1.79} y="22.5" width="4.47" height="7.5" fill={IRON.body} />
        </g>
      ))}

      {/* No spikes here — the game page's control rail is the gate's one
          spiked bottom; a second set read as two competing gate bottoms. */}
    </svg>
  );
};
