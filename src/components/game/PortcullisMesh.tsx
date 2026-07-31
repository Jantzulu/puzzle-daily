import React from 'react';

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

// className is swappable: the nav's gate menu renders this same mesh as
// its bottom rung on pages without the control rail (nav-gate-rail-mesh)
// — the gate must bottom out with the identical spiked rail everywhere.
export const PortcullisMesh: React.FC<{ className?: string }> = ({ className = 'control-rail-mesh' }) => (
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
