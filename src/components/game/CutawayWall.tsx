import React from 'react';
import { prepCanvas, useCrispSnap } from './panelSkins';
import { PIER_TOP, PIER_W, SLAB_H, SLAB_RISE, WALL_TORCH_GAP, WALL_TORCH_HALF, drawPier, drawSlab } from './cutawayStone';
import { LintelTorch } from './LintelTorch';

// The cutaway wall's two pieces on the page (the `?wall=1` experiment: see
// cutawayStone.ts for the idea and the drawing). Both are canvases on the art
// grid, snapped to whole pixels like every skin, laid UNDER the page's
// content. LAYERS (found the hard way, 2026-11-21: the first try isolated
// the wrapper in Game.tsx, which trapped the HEROES title's z-46 under the
// board): the wrapper must NOT become a stacking context, because the title
// and the quest scroll are ordered against the board (z-10), the rail
// (z-40) and the quest anchor (z-45) at page level. So the side walls sit
// at z auto in the page's margins, where nothing else is; a slab under the
// lintel is z -1 inside .dungeon-below (which isolates itself); and the
// HERO slab is z 11, over the board's dark bottom margin (the board's
// canvas reaches down behind the title) and under everything above it,
// with the header's own words lifted over it (CharacterSelector). The
// hero slab and the walls take no layout at all; the sections under the
// lintel give their slab 8px more room under the title than the groove had
// (WALL_HEADER_GAP), so no row of text ever sits on stone.

/**
 * The slab behind a storey's title. Mount it as the first child of the
 * header row (which must be position: relative): it reaches out over both
 * side walls and a little above and below the row.
 */
export const CutawaySlab: React.FC<{
  /** The colder stone from under the Dungeon Details lintel. */
  old?: boolean;
  /** Its layer: -1 (the default) inside an isolated box; the hero slab passes WALL_HERO_Z (cutawayStone.ts). */
  z?: number;
}> = ({ old = false, z = -1 }) => {
  const snapRef = useCrispSnap<HTMLDivElement>(true);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    const host = snapRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    // Drawn at once, never in a frame callback: a hidden tab freezes those
    // and would leave the canvas blank (the skins' shared rule).
    const draw = () => {
      const w = host.clientWidth;
      if (!w) return;
      const ctx = prepCanvas(canvas, w, SLAB_H, 0);
      if (!ctx) return;
      ctx.clearRect(0, 0, w, SLAB_H);
      drawSlab(ctx, w, old);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    return () => ro.disconnect();
  }, [snapRef, old]);
  return (
    <div aria-hidden className="absolute pointer-events-none" style={{ left: -PIER_W, right: -PIER_W, top: -SLAB_RISE, height: SLAB_H, zIndex: z }}>
      <div ref={snapRef} className="relative w-full h-full">
        <canvas ref={canvasRef} style={{ position: 'absolute' }} />
      </div>
    </div>
  );
};

/**
 * A BEAM'S TORCH (user call 2026-11-21: "a torch on each of the horizontal
 * beams, either to the left or right of the title text. Only 1 per beam").
 * Mount it inside a title's centred wrapper, after the title: it hangs off
 * the wrapper's LEFT edge, beyond the (?) button, which is the one place
 * every beam under the hero hall has room on a phone (the right of a title
 * belongs to its count: "2 POSSIBLE" starts where STATUS EFFECTS ends).
 * Placed without a transform, so the art stays on whole pixels. It is the
 * lintel's own torch: a tap puts it out, the dark entry lights it.
 */
export const BeamTorch: React.FC<{ /** Offsets its flicker from the other beams' (ms). */ phase?: number }> = ({ phase = 0 }) => (
  <span className="absolute right-full" style={{ marginRight: WALL_TORCH_GAP, top: `calc(50% - ${WALL_TORCH_HALF}px)` }}>
    <LintelTorch phase={phase} />
  </span>
);

/**
 * The two side walls. Mount it as the first child of the wrapper that holds
 * the hero panel and everything under the Dungeon Details lintel (which must
 * be position: relative, and NOT a stacking context): the walls stand in the page's margins
 * from under the hero slab to the wrapper's end, and are redrawn whenever
 * that grows or shrinks (a drawer opening).
 */
export const CutawayPiers: React.FC = () => {
  const snapRef = useCrispSnap<HTMLDivElement>(true);
  const leftRef = React.useRef<HTMLCanvasElement>(null);
  const rightRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    const host = snapRef.current;
    if (!host) return;
    const draw = () => {
      const h = host.clientHeight;
      if (!h) return;
      // The stone is older from the mouth of the dungeon down (the box that
      // holds everything from ENEMIES on).
      const below = host.parentElement?.parentElement?.querySelector('.dungeon-below');
      const oldFrom = below ? below.getBoundingClientRect().top - host.getBoundingClientRect().top : h;
      for (const [canvas, side] of [[leftRef.current, 'left'], [rightRef.current, 'right']] as const) {
        if (!canvas) continue;
        const ctx = prepCanvas(canvas, PIER_W, h, 0);
        if (!ctx) continue;
        ctx.clearRect(0, 0, PIER_W, h);
        drawPier(ctx, side, h, oldFrom);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    return () => ro.disconnect();
  }, [snapRef]);
  return (
    <div aria-hidden className="absolute pointer-events-none" style={{ left: -PIER_W, right: -PIER_W, top: PIER_TOP, bottom: 0 }}>
      <div ref={snapRef} className="relative w-full h-full">
        <div className="absolute top-0 left-0 h-full" style={{ width: PIER_W }}>
          <canvas ref={leftRef} style={{ position: 'absolute' }} />
        </div>
        <div className="absolute top-0 right-0 h-full" style={{ width: PIER_W }}>
          <canvas ref={rightRef} style={{ position: 'absolute' }} />
        </div>
      </div>
    </div>
  );
};
