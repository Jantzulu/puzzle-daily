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
// z-10). The LAST item is the gate's bottom rail: bars stop at the beam and
// forged spikes hang beneath it.

const VIEW_W = 400;
const VIEW_H = 52;
const BEAM_TOP = 8;
const BEAM_BOT = 44;

const hash = (i: number): number => {
  const s = Math.sin((i + 47) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// Vertical bars — same x positions on every item so segments line up into
// continuous bars down the whole menu (all items share width and viewBox)
const BAR_XS = [40, 120, 200, 280, 360];
const BAR_HALF = 6;
const SPIKE_HALF = 9;

export const GateBeamMesh: React.FC<{ first?: boolean; last?: boolean }> = ({ first = false, last = false }) => {
  // First: reach up through the menu's top padding to the navbar.
  // Last: the gate ends here — bars stop at the beam, spikes take over.
  const barTop = first ? -26 : 0;
  const barBot = last ? BEAM_BOT : VIEW_H + 12;
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

      {/* Bottom rail only: forged spikes hang beneath the gate's last beam */}
      {last && BAR_XS.map((x, i) => {
        const tip = 57 + hash(i) * 3;
        return (
          <g key={`spike${i}`}>
            <polygon points={`${x - SPIKE_HALF},${BEAM_BOT} ${x},${BEAM_BOT} ${x},${tip.toFixed(1)}`} fill={IRON.face} />
            <polygon points={`${x},${BEAM_BOT} ${x + SPIKE_HALF},${BEAM_BOT} ${x},${tip.toFixed(1)}`} fill={IRON.dark} />
          </g>
        );
      })}
    </svg>
  );
};
