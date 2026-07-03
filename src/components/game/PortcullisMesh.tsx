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
// (GateMesh BAR_XS [40,120,200,280,360]/400 = 10/30/50/70/90%) and the
// same ~3% pixel width — on mobile the two elements share their rendered
// width, so the menu's lattice flows straight into this rail and the whole
// thing reads as ONE gate whose spiked bottom is this control rail.
const BAR_XS = [100, 300, 500, 700, 900];
const BAR_HALF = 15;   // bar half-width (3% of viewBox, matches the menu)
const SPIKE_HALF = 22; // spike half-width at the root

export const PortcullisMesh: React.FC = () => (
  <svg
    className="control-rail-mesh"
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
    <rect x="0" y={RAIL_TOP} width={VIEW_W} height={RAIL_BOT - RAIL_TOP} fill={IRON.dark} />
    <rect x="0" y={RAIL_TOP + 2.5} width={VIEW_W} height={RAIL_BOT - RAIL_TOP - 6.7} fill={IRON.face} />
    <rect x="0" y={RAIL_TOP + 2.5} width={VIEW_W} height="2.5" fill={IRON.highlight} />

    {/* Square forge plates bolting each bar to the rail. Non-square units
        here (viewBox squashes): ~22u wide × 7u tall renders square. Same
        11px offset from the beam top as the menu beams' plates. */}
    {BAR_XS.map((x, i) => (
      <g key={`rivet${i}`}>
        <rect x={x - 11} y="31" width="22" height="7" fill={IRON.lit} />
        <rect x={x - 7} y="32.2" width="14" height="4.6" fill={IRON.body} />
      </g>
    ))}

    {/* Forged spikes hanging under each bar — two facets, left lit, right
        shadowed, tips wavering a hair (hand-forged, not machined) */}
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
