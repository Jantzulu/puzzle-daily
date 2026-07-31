import React from 'react';
import { IRON } from '../game/PortcullisMesh';

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
// Bar x fractions (10/30/50/70/90%) and ~3% widths MATCH PortcullisMesh —
// both elements render at the same width at every viewport (mobile: the
// full width; md+: the 42rem board column, .menu-gate max-width plus the
// menu's px-4 = rail's max-w-2xl), so the columns align.

const VIEW_W = 400;
const VIEW_H = 52;
// EVERY RUNG IS THE SAME THICKNESS OF IRON (user, 2026-07-31). The nav item
// box is 52px and the play page's control rail is 44px, but what the eye
// compares is the IRON, not the box. The rail's band maps exactly onto its
// 44px box (the -62.5%/200% trick), so it draws 44px of iron; this beam drew
// y 8..44 of 52 = 36px inside a 52px item. Eight pixels thinner, which reads
// as a lighter rung without being obviously wrong.
// 4..48 of 52 is 44px of iron at the item's natural height — same iron as the
// rail, and the menu's layout is untouched because the ITEM box does not move.
const BEAM_TOP = 4;
const BEAM_BOT = 48;

// Vertical bars — same x positions on every item so segments line up into
// continuous bars down the whole menu (all items share width and viewBox)
const BAR_XS = [40, 120, 200, 280, 360];
const BAR_HALF = 6;

export const GateBeamMesh: React.FC<{ first?: boolean }> = ({ first = false }) => {
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

      {/* The beam: dark under-frame, flat face, lit top edge. Layer
          thicknesses are the rail's, in rendered pixels: 2.54 top inset,
          2.54 highlight, 4.23 bottom lip. One unit here IS one rendered pixel
          at the 52px item, so the numbers carry straight across. */}
      <rect x="0" y={BEAM_TOP} width={VIEW_W} height={BEAM_BOT - BEAM_TOP} fill={IRON.dark} />
      <rect x="0" y={BEAM_TOP + 2.54} width={VIEW_W} height={BEAM_BOT - BEAM_TOP - 6.77} fill={IRON.face} />
      <rect x="0" y={BEAM_TOP + 2.54} width={VIEW_W} height="2.54" fill={IRON.highlight} />

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
      {BAR_XS.map((x, i) => (
        <g key={`rivet${i}`}>
          <rect x={x - 2.25} y={BEAM_TOP + 17.73} width="4.5" height="7.56" fill={IRON.lit} />
          {/* Flush bottom-right, inset top-left: the fixed light every mesh
              here shares. */}
          <rect x={x - 1.485} y={BEAM_TOP + 19.015} width="3.735" height="6.275" fill={IRON.body} />
        </g>
      ))}

      {/* No spikes here — the game page's control rail is the gate's one
          spiked bottom; a second set read as two competing gate bottoms. */}
    </svg>
  );
};
