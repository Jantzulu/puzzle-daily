import React from 'react';
import { IRON } from '../game/PortcullisMesh';

// ============================================================================
// GATE BEAM — one horizontal portcullis beam per mobile nav item
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
// z-10). On the play page the menu has NO bottom of its own: the control
// rail (PortcullisMesh, spiked) IS the gate's bottom — its rising bars meet
// the last beam's from below, so open menu + rail read as one solid
// portcullis. On every other page the utility row swaps its beam for that
// same mesh (nav-gate-rail-mesh), so the gate bottoms out with the
// identical spiked rail everywhere.
//
// Bar x fractions (10/30/50/70/90%) and ~3% widths MATCH PortcullisMesh —
// on mobile both elements render at the same width, so the columns align.

const VIEW_W = 400;
const VIEW_H = 52;
const BEAM_TOP = 8;
const BEAM_BOT = 44;

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

      {/* The beam: dark under-frame, flat face, lit top edge */}
      <rect x="0" y={BEAM_TOP} width={VIEW_W} height={BEAM_BOT - BEAM_TOP} fill={IRON.dark} />
      <rect x="0" y={BEAM_TOP + 3} width={VIEW_W} height={BEAM_BOT - BEAM_TOP - 8} fill={IRON.face} />
      <rect x="0" y={BEAM_TOP + 3} width={VIEW_W} height="3" fill={IRON.highlight} />

      {/* Square forge plates bolting each bar to the beam */}
      {BAR_XS.map((x, i) => (
        <g key={`rivet${i}`}>
          <rect x={x - 4.5} y="21" width="9" height="9" fill={IRON.lit} />
          <rect x={x - 3} y="22.5" width="7.5" height="7.5" fill={IRON.body} />
        </g>
      ))}

      {/* No spikes here — the game page's control rail is the gate's one
          spiked bottom; a second set read as two competing gate bottoms. */}
    </svg>
  );
};
