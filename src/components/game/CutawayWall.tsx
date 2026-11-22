import React from 'react';
import { prepCanvas, useCrispSnap } from './panelSkins';
import { PIER_TOP, PIER_W, SLAB_H, WALL_COLUMN_RISE, WALL_FLOOR_H, WALL_TORCH_GAP, WALL_TORCH_HALF, drawPier, drawSlab } from './cutawayStone';
import { slotBoundaries } from '../../hooks/useElementWidth';
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
// walls take no layout at all; a beam is given room above and below its
// title (WALL_ABOVE_BEAM, WALL_HEADER_GAP: a few px more than the groove
// and the old margins had), so no row of text ever sits on stone.

/**
 * The slab behind a storey's title. Mount it as the first child of the
 * header row (which must be position: relative): it reaches out over both
 * side walls and above and below the row, centred on it.
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
    // CENTRED ON THE ROW, whatever its height (not hung a fixed distance
    // above its top): the title and the torch are centred on the row, and
    // the hero row is 14px tall until a hero is placed and 20px after (the
    // clear button), which left the beam 3px high of both.
    <div aria-hidden className="absolute pointer-events-none" style={{ left: -PIER_W, right: -PIER_W, top: `calc(50% - ${SLAB_H / 2}px)`, height: SLAB_H, zIndex: z }}>
      <div ref={snapRef} className="relative w-full h-full">
        <canvas ref={canvasRef} style={{ position: 'absolute' }} />
      </div>
    </div>
  );
};

/**
 * THE HERO HALL'S ARCADE (user ask 2026-11-21: "you had mentioned a 'floor'
 * for the hero panel and also changes to the vertical segments separating
 * them"). It takes the place of the iron posts between the hero cards
 * (StripDividers) when the wall is on, on the same slot boundaries:
 *
 *   the FLOOR    a stone ledge right under the heroes' feet (`floorY`: the
 *                bottom of the sprite band; sprites are bottom-aligned, so
 *                they stand on it). Names and stats sit under it, like the
 *                plaques on the front of a plinth.
 *   COLUMNS      from the beam down to the floor, one on each boundary
 *                between two heroes: a capital under the beam, a shaft, a
 *                base on the ledge. So each hero stands in a bay.
 *   JOINTS       a thin line on down from each column between the plaques,
 *                where the post used to part the names.
 *
 * The column and joint either side of the SELECTED card step aside (fade),
 * as the posts did: the selection's own outline parts it from its
 * neighbours. Placeholder stone, in CSS (index.css .wall-*), inside a box
 * snapped to whole pixels; rendered BEFORE the card row, so cards, badges
 * and the selection shape paint over it.
 *
 * The capital reaches 8px above the strip to meet the beam, which is why the
 * hero header keeps one height in the wall (WALL_HERO_ROW): unpinned, it is
 * 14px until a hero is placed and 20px after, and the gap under the beam
 * would change with it.
 */
export const HeroArcade: React.FC<{
  slotCount: number;
  /** Index of the selected slot, or -1. */
  selectedIndex: number;
  /** The strip's measured width (CSS px; 0 = not measured: nothing renders). */
  width: number;
  /** Where the heroes' feet are: CSS px from the strip's top. */
  floorY: number;
}> = ({ slotCount, selectedIndex, width, floorY }) => {
  const snapRef = useCrispSnap<HTMLDivElement>(true);
  // (The snapped box is rendered even before the strip is measured: the
  // snap is taken when it mounts and again when it gets its size.)
  const inner = width > 0 ? slotBoundaries(width, slotCount).slice(1, -1) : [];
  return (
    <div aria-hidden className="absolute inset-y-0 left-0 pointer-events-none" style={{ width }}>
      <div ref={snapRef} className="relative w-full h-full">
        {width > 0 && <span className="wall-floor" style={{ top: floorY }} />}
        {inner.map((x, k) => {
          const boundary = k + 1;
          const beside = selectedIndex >= 0 && (boundary === selectedIndex || boundary === selectedIndex + 1);
          return (
            <React.Fragment key={boundary}>
              <span className={`wall-column ${beside ? 'wall-yield' : ''}`} style={{ left: x - 2, height: floorY + WALL_COLUMN_RISE }} />
              <span className={`wall-joint ${beside ? 'wall-yield' : ''}`} style={{ left: x - 1, top: floorY + WALL_FLOOR_H }} />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

/**
 * A BEAM'S TORCH (user call 2026-11-21: "a torch on each of the horizontal
 * beams, either to the left or right of the title text. Only 1 per beam").
 * Mount it inside a title's centred wrapper, after the title: it hangs off
 * the wrapper's left edge (beyond the (?) button) or its right, the same
 * distance from the title to the eye either way (WALL_TORCH_GAP), and dead
 * centre on the beam, which is a torch and two art px tall. Placed without
 * a transform, so the art stays on whole pixels. It is the lintel's own
 * torch: a tap puts it out, the dark entry lights it.
 */
export const BeamTorch: React.FC<{
  side: 'left' | 'right';
  /** Offsets its flicker from the other beams' (ms). */
  phase?: number;
}> = ({ side, phase = 0 }) => (
  // `flex`: the torch is a <button>, an inline-block, and in a plain box it
  // sits on a line of TEXT (measured: the box came out 41px tall around a
  // 32px torch). Where an empty button's baseline is differs by browser:
  // Chrome puts it at the button's foot, so the torch sat at the top of the
  // box, centred on the beam; Safari on the iPhone puts it higher, so the
  // torch hung low, its flame at the beam's centre (user report 2026-11-21:
  // the light "is centered to the center of the beams, as opposed to the
  // center of the whole torch sprite"). A flex box has no text line: the
  // torch is the box, in every browser. (On the old lintel the torches were
  // flex items already, which is why this never showed there.)
  <span
    className={`absolute flex ${side === 'left' ? 'right-full' : 'left-full'}`}
    style={{ [side === 'left' ? 'marginRight' : 'marginLeft']: WALL_TORCH_GAP[side], top: `calc(50% - ${WALL_TORCH_HALF}px)`, height: WALL_TORCH_HALF * 2 }}
  >
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
