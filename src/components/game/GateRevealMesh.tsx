import React from 'react';
import { IRON } from './PortcullisMesh';

// ============================================================================
// BOARD GATE — the loading screen IS a lowered portcullis
// ============================================================================
// Covers the board area while sprites preload; Game.tsx winches it up when
// everything is ready, so the daily reveal reads as the dungeon opening.
// Geometry echoes the other ironwork exactly: bars at the 10/30/50/70/90%
// columns (PortcullisMesh / GateBeamMesh), beams with the same dark-frame /
// flat-face / lit-top build, square forge plates at the crossings, and a
// spiked rail as the gate's leading bottom edge. preserveAspectRatio="none"
// — rects and triangles only, same as the rest of the iron (rendering
// lesson #5: circles would stretch).

const W = 400;
const H = 300;
const BAR_XS = [40, 120, 200, 280, 360];
const BAR_HALF = 6;
const BEAM_YS = [36, 126, 216]; // beam top edges
const BEAM_H = 26;
const RAIL_TOP = 266;
const RAIL_BOT = 290;
const SPIKE_HALF = 9;

// Same hand-forged waver as PortcullisMesh's spikes.
const hash = (i: number): number => {
  const s = Math.sin((i + 13) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

export const GateRevealMesh: React.FC = () => (
  <svg
    className="w-full h-full"
    viewBox={`0 0 ${W} ${H}`}
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    {/* Gatehouse shadow — dims whatever waits behind the lattice */}
    <rect x="0" y="0" width={W} height={H} fill="rgba(8, 6, 4, 0.7)" />

    {/* Vertical bars, lit left / shaded right, running into the rail */}
    {BAR_XS.map((x, i) => (
      <g key={`bar${i}`}>
        <rect x={x - BAR_HALF} y="0" width={BAR_HALF * 2} height={RAIL_TOP + 4} fill={IRON.body} />
        <rect x={x - BAR_HALF} y="0" width="3" height={RAIL_TOP + 4} fill={IRON.lit} />
        <rect x={x + BAR_HALF - 3} y="0" width="3" height={RAIL_TOP + 4} fill={IRON.dark} />
      </g>
    ))}

    {/* Cross beams — dark under-frame, flat face, lit top edge */}
    {BEAM_YS.map((y, i) => (
      <g key={`beam${i}`}>
        <rect x="0" y={y} width={W} height={BEAM_H} fill={IRON.dark} />
        <rect x="0" y={y + 2.5} width={W} height={BEAM_H - 6} fill={IRON.face} />
        <rect x="0" y={y + 2.5} width={W} height="2.5" fill={IRON.highlight} />
        {/* Forge plates bolting each bar to this beam */}
        {BAR_XS.map((x, j) => (
          <g key={`plate${i}-${j}`}>
            <rect x={x - 4.5} y={y + BEAM_H / 2 - 4.5} width="9" height="9" fill={IRON.lit} />
            <rect x={x - 3} y={y + BEAM_H / 2 - 3} width="6" height="6" fill={IRON.body} />
          </g>
        ))}
      </g>
    ))}

    {/* Leading rail — the gate's bottom edge, same build as the beams */}
    <rect x="0" y={RAIL_TOP} width={W} height={RAIL_BOT - RAIL_TOP} fill={IRON.dark} />
    <rect x="0" y={RAIL_TOP + 2.5} width={W} height={RAIL_BOT - RAIL_TOP - 6} fill={IRON.face} />
    <rect x="0" y={RAIL_TOP + 2.5} width={W} height="2.5" fill={IRON.highlight} />

    {/* Forged spikes hanging under the rail — two facets, tips wavering */}
    {BAR_XS.map((x, i) => {
      const tip = H - 2 - hash(i) * 4;
      return (
        <g key={`spike${i}`}>
          <polygon points={`${x - SPIKE_HALF},${RAIL_BOT} ${x},${RAIL_BOT} ${x},${tip.toFixed(1)}`} fill={IRON.face} />
          <polygon points={`${x},${RAIL_BOT} ${x + SPIKE_HALF},${RAIL_BOT} ${x},${tip.toFixed(1)}`} fill={IRON.dark} />
        </g>
      );
    })}
  </svg>
);
