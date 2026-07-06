import React from 'react';

// ============================================================================
// THRESHOLD LINTEL — the Dungeon Details doorframe
// ============================================================================
// The divider between the heroes' panel and the dungeon's is a course of
// hewn stone blocks — the lintel over the doorway the heroes are about to
// descend through. Same low-poly recipe as the rest of the mesh family
// (PortcullisMesh, BannerMesh, the compendium slab): rects and triangles
// only (preserveAspectRatio="none" stretches circles into ellipses), a
// fixed top-left light, per-block tone and edge jitter from the
// deterministic hash so the course reads hand-quarried, not tiled. The
// engraved text renders above in the DOM.

const VIEW_W = 400;
const VIEW_H = 38;

const hash = (i: number): number => {
  const s = Math.sin((i + 7) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// Compendium-slab stone, hewn into a door lintel
const STONE = {
  mortar: '#120e0b',                        // seams and shadowed gaps
  faces: ['#262120', '#221e1c', '#2a2420'], // per-block tone variation
  lit: 'rgba(255, 235, 200, 0.10)',         // top edges catching the light
  edgeLit: '#312a25',                       // left edges, lit less than the top
  dark: '#19140f',                          // bottom lips falling into shade
};

// Block layout: 6 blocks, widths jittered around an even course, 3u seams.
// Top and bottom edges waver ~±1.2u per block — quarried, not extruded.
type Block = { x: number; w: number; top: number; bot: number; tone: string };
const BLOCKS: Block[] = (() => {
  const n = 6;
  const seam = 3;
  const raw = Array.from({ length: n }, (_, i) => 1 + (hash(i * 3) - 0.5) * 0.45);
  const total = raw.reduce((a, b) => a + b, 0);
  const blocks: Block[] = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const w = (raw[i] / total) * (VIEW_W - seam * (n - 1));
    blocks.push({
      x,
      w,
      top: 2 + (hash(i * 5 + 1) - 0.5) * 2.4,
      bot: VIEW_H - 2 + (hash(i * 7 + 2) - 0.5) * 2.4,
      tone: STONE.faces[Math.floor(hash(i * 11 + 3) * STONE.faces.length) % STONE.faces.length],
    });
    x += w + seam;
  }
  return blocks;
})();

export const LintelMesh: React.FC = () => (
  <svg
    className="dungeon-lintel-mesh"
    viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    {/* Mortar bed behind the course */}
    <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={STONE.mortar} />

    {BLOCKS.map((b, i) => {
      const h = b.bot - b.top;
      return (
        <g key={i}>
          {/* Block face */}
          <rect x={b.x} y={b.top} width={b.w} height={h} fill={b.tone} />
          {/* Top edge catching the light */}
          <rect x={b.x} y={b.top} width={b.w} height="2.5" fill={STONE.lit} />
          {/* Left edge lit, right edge in shade (fixed top-left light) */}
          <rect x={b.x} y={b.top} width="2" height={h} fill={STONE.edgeLit} />
          <rect x={b.x + b.w - 2} y={b.top} width="2" height={h} fill={STONE.dark} />
          {/* Bottom lip falling into shade */}
          <rect x={b.x} y={b.bot - 3} width={b.w} height="3" fill={STONE.dark} />
          {/* Chipped corner on some blocks — a bite of mortar-dark */}
          {hash(i * 13 + 4) > 0.55 && (
            <polygon
              points={
                hash(i * 17 + 5) > 0.5
                  ? `${(b.x + b.w).toFixed(1)},${b.top.toFixed(1)} ${(b.x + b.w - 7).toFixed(1)},${b.top.toFixed(1)} ${(b.x + b.w).toFixed(1)},${(b.top + 5).toFixed(1)}`
                  : `${b.x.toFixed(1)},${b.bot.toFixed(1)} ${(b.x + 7).toFixed(1)},${b.bot.toFixed(1)} ${b.x.toFixed(1)},${(b.bot - 5).toFixed(1)}`
              }
              fill={STONE.mortar}
            />
          )}
        </g>
      );
    })}
  </svg>
);
