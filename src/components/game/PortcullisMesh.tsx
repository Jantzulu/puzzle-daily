import React from 'react';
import railJson from '../../assets/panels/control-rail-slices.json';
import barsJson from '../../assets/panels/portcullis-gate-slices.json';
import { Z, buildSkin, BAR_FRACS, drawFixed, drawTiled, prepCanvas, whenDecoded, type SkinPiece } from './panelSkins';

// ============================================================================
// PORTCULLIS RAIL — the control panel's iron
// ============================================================================
// The bottom rail of the dungeon's portcullis, raised just past the board:
// you've been peering into the gate the whole time. Vertical gate bars rise
// from the rail and tuck BEHIND the dungeon (the board container paints
// over them), forged spikes hang below where the old divider line sat, and
// the controls (real DOM) sit on the rail's face. Same iron as the banner
// rod, same fixed top-left light as every mesh. Deterministic.
//
// preserveAspectRatio="none": everything here is rects and triangles by
// design — circles would stretch into ellipses (rendering lesson #5), so
// the rivets are square forge plates.
//
// Vertical zones (viewBox units) — the CSS overhangs in index.css are
// derived from these ratios so the RAIL band maps exactly onto the panel:
// bars 0–20 (62.5% of panel height above), rail 20–52 (the panel itself),
// spikes 52–64 (37.5% below). Change one, change the other.

const VIEW_W = 1000;
const VIEW_H = 64;
const RAIL_TOP = 20;
const RAIL_BOT = 52;

const hash = (i: number): number => {
  const s = Math.sin((i + 13) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// Iron tones, shared with the banner rod's palette. Exported: the mobile
// menu's gate beams (shared/GateMesh.tsx) are forged from the same iron.
export const IRON = {
  dark: '#17130f',      // under-frame, shadowed metal
  body: '#2b2620',      // bar stock
  face: '#3b352d',      // rail face the controls sit on
  lit: '#4a4239',       // edges catching the top-left light
  highlight: 'rgba(255, 235, 200, 0.22)',
};

// Gate bars at the SAME width fractions as the mobile menu's beams
// (GateMesh BAR_XS /400 = 1.5/20.9/40.3/59.7/79.1/98.5%) and the same ~3%
// pixel width — on mobile the two elements share their rendered width, so
// the menu's lattice flows straight into this rail and the whole thing
// reads as ONE gate whose spiked bottom is this control rail.
//
// EDGE BARS CONTAIN THE SHAPE (user + reference photos, 2026-07-31): a real
// portcullis has verticals at its outer edges framing the lattice; ours
// started 10% in, leaving bare rail hanging past the first and last bars.
// Six bars now, outer pair FLUSH with the edges (centre = BAR_HALF from
// each end), interior spaced at the same even pitch. Change these only in
// lockstep with GateMesh's fractions.
const BAR_XS = [15, 209, 403, 597, 791, 985];
const BAR_HALF = 15;   // bar half-width (3% of viewBox, matches the menu)
const SPIKE_HALF = 22; // spike half-width at the root

// ─── Painted skin (forge-cut art) ───────────────────────────────────────────
// Two kits feed this one surface: 'control-rail' (band, plates, spikes) and
// 'portcullis-gate' (the rising bars). Empty placeholders = the procedural
// SVG below renders untouched. The skin draws into a device-resolution
// canvas occupying the SAME box the svg would (the className's CSS places
// both identically), with the art at FIXED pixel sizes instead of the
// mesh's viewport stretch: band = 22 art (fills the 44px rung box), spikes
// 8 art below, bars 6 art wide at the six shared fractions, rising through
// whatever space the box gives above the band.
const RAIL = buildSkin(railJson, 'control-rail');
const BARS = buildSkin(barsJson, 'portcullis-gate');
export const portcullisSkinActive = RAIL.has('rail-face') || BARS.has('bar-segment');

const PortcullisSkin: React.FC<{ className: string }> = ({ className }) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
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
      const ctx = prepCanvas(canvas, w, h, 0);
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      const face = RAIL.get('rail-face');
      const spike = RAIL.get('rail-spike');
      const plate = RAIL.get('forge-plate');
      const capL = RAIL.get('rail-cap-l');
      const capR = RAIL.get('rail-cap-r');
      const bar = BARS.get('bar-segment');

      // The host box = the mesh's box (200% of the rung, band zone in the
      // middle per .control-rail-mesh's ratios). The art band is a FIXED 22
      // art px (44 CSS) centered on the box's band zone: band top =
      // 31.25% of the box (the mesh's bars/rail boundary), rounded to a
      // whole pixel so every art row lands crisp.
      const bandH = (face?.h ?? 22) * Z;
      const spikeH = (spike?.h ?? 0) * Z;
      const bandTop = Math.round(h * 0.3125);

      const barXs = BAR_FRACS.map(f => Math.round(f * w));

      // Bars rise from the band's top edge to the box top (they tuck
      // behind the band: draw them first, band over).
      if (bar) {
        const bw = bar.w * Z;
        for (const bx of barXs) {
          drawTiled(ctx, bar, Math.round(bx - bw / 2), 0, bw, bandTop + 2, Math.round(bx - bw / 2), 0);
        }
        const cap = BARS.get('bar-top-cap');
        if (cap) for (const bx of barXs) drawFixed(ctx, cap, Math.round(bx - (cap.w * Z) / 2), 0);
      }

      // The band: tiled face between optional caps.
      const clW = capL ? capL.w * Z : 0;
      const crW = capR ? capR.w * Z : 0;
      drawTiled(ctx, face, clW, bandTop, w - clW - crW, bandH, clW, bandTop);
      if (capL) drawFixed(ctx, capL, 0, bandTop);
      if (capR) drawFixed(ctx, capR, w - crW, bandTop);

      // Plates where each bar meets the band (13px below its top, the
      // meshes' shared hardware position).
      if (plate) {
        const pw = plate.w * Z;
        for (const bx of barXs) drawFixed(ctx, plate, Math.round(bx - pw / 2), bandTop + 13);
      }

      // Spikes hanging below the band at each bar; the outer pair clips at
      // the canvas edge exactly as the mesh's spikes clipped at the
      // viewBox.
      if (spike && spikeH) {
        const sw = spike.w * Z;
        for (const bx of barXs) drawFixed(ctx, spike, Math.round(bx - sw / 2), bandTop + bandH);
      }
    };
    // SYNCHRONOUS draw, not rAF: hidden/background tabs freeze rAF and the
    // canvas stays blank until the tab fronts (hit live in the hidden
    // preview pane). RO callbacks batch already; the draws are tiny.
    const schedule = draw;
    whenDecoded([...RAIL.values(), ...BARS.values()] as SkinPiece[]).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    ro.observe(document.documentElement);
    return () => { cancelled = true; ro.disconnect(); };
  }, []);
  // The div takes the mesh's className so the CSS (.control-rail-mesh /
  // .nav-gate-rail-mesh) positions the skin exactly where the svg sat.
  return (
    <div className={className} aria-hidden style={{ overflow: 'visible' }} ref={hostRef}>
      <canvas ref={canvasRef} style={{ position: 'absolute' }} />
    </div>
  );
};

// className is swappable: the nav's gate menu renders this same mesh as
// its bottom rung on pages without the control rail (nav-gate-rail-mesh)
// — the gate must bottom out with the identical spiked rail everywhere.
export const PortcullisMesh: React.FC<{ className?: string }> = ({ className = 'control-rail-mesh' }) => portcullisSkinActive ? <PortcullisSkin className={className} /> : (
  <svg
    className={className}
    viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    {/* Gate bars rising toward the navbar. Left edge lit, right in shade.
        (Strip width 7u ≈ the menu beams' 3u at their wider unit scale.) */}
    {BAR_XS.map((x, i) => (
      <g key={`bar${i}`}>
        <rect x={x - BAR_HALF} y="0" width={BAR_HALF * 2} height={RAIL_TOP + 4} fill={IRON.body} />
        <rect x={x - BAR_HALF} y="0" width="7" height={RAIL_TOP + 4} fill={IRON.lit} />
        <rect x={x + BAR_HALF - 7} y="0" width="7" height={RAIL_TOP + 4} fill={IRON.dark} />
      </g>
    ))}

    {/* The rail: dark under-frame, flat face, lit top edge. The face band
        is where the DOM controls live. Layer proportions mirror the menu
        beams' (GateMesh) at rendered-pixel scale: ~2.5px top inset, ~2.5px
        highlight, ~4.2px bottom lip — the bottom rung must not read as a
        different make of iron than the rungs above it. */}
    {/* Original layer proportions, RESTORED (user decision, 2026-07-31): a
        pass that thinned these to match the menu beams' rendered lips was
        compared live and the user preferred the portcullis as it looked on
        the ui-mobile-fit build — this rail's band filling its 44px box with
        its own heavier lips, the menu keeping its thinner 36px beams. The
        rungs are deliberately NOT the same iron; only the forge plates are
        standardized across the two meshes. */}
    <rect x="0" y={RAIL_TOP} width={VIEW_W} height={RAIL_BOT - RAIL_TOP} fill={IRON.dark} />
    <rect x="0" y={RAIL_TOP + 2.5} width={VIEW_W} height={RAIL_BOT - RAIL_TOP - 6.7} fill={IRON.face} />
    <rect x="0" y={RAIL_TOP + 2.5} width={VIEW_W} height="2.5" fill={IRON.highlight} />

    {/* Forge plates bolting each bar to the rail — THE SAME HARDWARE as the
        menu beams' plates (GateMesh), derived from them rather than eyeballed.
        The user spotted that the bottom rung's plates "don't line up with the
        others in style or position", and all three differences were real.
        Both meshes use preserveAspectRatio="none", so the comparison has to be
        made in RENDERED pixels, not viewBox units:

          this mesh renders at height 200% offset -62.5%, so a viewBox y maps
          to (y/64)*2 - 0.625 of the rung's height;
          the beam mesh renders at 100%, so its y maps to y/52.

        Beam plate: y 21..30 of 52  ->  top 40.4%, height 17.3% of the rung.
        Rail plate WAS y 31..38 of 64 -> top 34.4%, height 21.9% — sitting
        2.6px high and rendering 26% taller on a 44px rung.

        Matched values: top 32.9u ((0.404+0.625)/2*64), height 5.5u
        (0.173/2*64), width 22.5u (2.25% — the beam's 9/400).

        BEVEL ALSO MATCHED. The beam's inner rect is flush to the plate's
        bottom-right and inset 1.5u top-left, leaving a lit top-left edge —
        the same fixed light every mesh here uses. This one was centred, which
        read as a different make of iron. Inset converted: 0.92u vertical,
        3.75u horizontal. */}
    {/* Forge plates — copies of the beam's reference plate (GateMesh):
        9px square at the shared 672px width, top 13px below the iron's top,
        inner rect inset 1.5px top-left and flush bottom-right. Converted to
        this mesh's units (200% render on a 44px box → 1.375 px/u vertical;
        672/1000 = 0.672 px/u horizontal at desktop): top 20 + 13/1.375 =
        29.45u, height 9/1.375 = 6.545u, width 9/0.672 = 13.39u. That width
        is 2.5× the beam plate's 5.36u — exactly the 1000:400 viewBox ratio —
        so the two plates render identically at EVERY viewport, square at the
        width they're tuned for.
        (A nested <svg preserveAspectRatio> was tried first and does NOT
        work: it only controls mapping inside the nested viewport; the
        parent's preserveAspectRatio="none" stretch still applies on top.) */}
    {BAR_XS.map((x, i) => (
      <g key={`rivet${i}`}>
        <rect x={x - 6.7} y="29.45" width="13.39" height="6.545" fill={IRON.lit} />
        <rect x={x - 4.47} y="30.54" width="11.16" height="5.45" fill={IRON.body} />
      </g>
    ))}

    {/* Forged spikes hanging under each bar — two facets, left lit, right
        shadowed, tips wavering a hair (hand-forged, not machined).
        The EDGE bars' spikes (half-width 22 on a bar centred 15 from the
        edge) lose their outer 7u to the viewBox clip — ~4.7px at desktop.
        Deliberate: the cut lands on the gate's outer edge, where a spike
        sliced by the frame reads as the frame, and pulling the bars inward
        to fit whole spikes would reopen the bare-rail gap being fixed. */}
    {BAR_XS.map((x, i) => {
      const tip = 61.5 + hash(i) * 2.5;
      return (
        <g key={`spike${i}`}>
          <polygon points={`${x - SPIKE_HALF},${RAIL_BOT} ${x},${RAIL_BOT} ${x},${tip.toFixed(1)}`} fill={IRON.face} />
          <polygon points={`${x},${RAIL_BOT} ${x + SPIKE_HALF},${RAIL_BOT} ${x},${tip.toFixed(1)}`} fill={IRON.dark} />
        </g>
      );
    })}
  </svg>
);
