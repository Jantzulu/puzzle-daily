import React from 'react';
import { prepCanvas, useCrispSnap } from './panelSkins';
import { PIER_TOP, PIER_W, SLAB_H, WALL_MAX_REACH, WALL_TORCH_GAP, WALL_TORCH_HALF, drawPier, drawSlab } from './cutawayStone';
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
      <div ref={snapRef} data-wall-beam className="relative w-full h-full">
        <canvas ref={canvasRef} style={{ position: 'absolute' }} />
      </div>
    </div>
  );
};

/**
 * THE COLUMNS BETWEEN CARDS: stone in place of the iron posts
 * (StripDividers) when the wall is on, for the hero strip and the enemy and
 * ally strips alike, on the same slot boundaries. A column's capital meets
 * the beam above (8px over the strip); where it ENDS depends on what is
 * under the cards (`below`), the user's rule of 2026-11-21:
 *
 *   'floor'  something sits under the cards: the "Tap a hero for more info"
 *            hint, or an open drawer. The columns stand on a stone FLOOR
 *            along the strip's foot ("there should be a 'floor' under the
 *            columns when 'tap a hero for more info' is present"). Under an
 *            open drawer's own card (`openIndex`) the floor is left out
 *            ("the segment for the currently selected hero should not be
 *            present"): that is where the card opens into its drawer.
 *   'open'   nothing is under the cards: no floor, and the columns run on
 *            down to the top of the next beam ("the column should touch the
 *            top of the lower horizontal beam"). How far that is, is
 *            measured (the beams mark themselves data-wall-beam). With no
 *            beam close below (the last panel on the page) the room is
 *            closed with the floor instead.
 *
 * History, so it is not tried again: a first floor ran under the heroes'
 * FEET, half way up the cards, with the columns stopping on it; the user did
 * not like it ("i do not like the floor, but like the columns"). This floor
 * is at the foot of the cards. And a column NEVER steps aside for the
 * selected card, as the posts did: "can the new border overlap OVER the
 * columns instead of replacing them?" So render this BEFORE the selection
 * strip: the selection's outline and wash paint over it, the cards over both.
 *
 * Placeholder stone, in CSS (index.css .wall-columns), inside a box snapped
 * to whole pixels. The capital meets the beam only because the header row
 * above keeps one height in the wall (WALL_ROW).
 */
export const WallColumns: React.FC<{
  slotCount: number;
  /** The strip's measured width (CSS px; 0 = not measured: nothing renders). */
  width: number;
  /** What is under the cards: see above. */
  below: 'floor' | 'open';
  /** With a drawer open, the slot of the card it belongs to (-1 = none): no floor under it. */
  openIndex?: number;
  /** The colder stone from under the hero hall. */
  old?: boolean;
}> = ({ slotCount, width, below, openIndex = -1, old = false }) => {
  const snapRef = useCrispSnap<HTMLDivElement>(true);

  // How far below the strip the next beam begins, kept in a CSS variable on
  // the box (no render needed when it changes). Measured again whenever the
  // strip or the page under it changes size: a drawer, a hint going.
  React.useLayoutEffect(() => {
    const host = snapRef.current;
    if (!host || below !== 'open') return;
    const measure = () => {
      const bottom = host.getBoundingClientRect().bottom;
      let reach: number | null = null;
      for (const beam of document.querySelectorAll('[data-wall-beam]')) {
        const gap = Math.round(beam.getBoundingClientRect().top - bottom);
        if (gap >= 0 && gap <= WALL_MAX_REACH && (reach === null || gap < reach)) reach = gap;
      }
      host.style.setProperty('--wall-reach', `${reach ?? 0}px`);
      host.toggleAttribute('data-no-beam', reach === null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    const page = document.querySelector('[data-wall-piers]');
    if (page) ro.observe(page);
    return () => ro.disconnect();
  }, [snapRef, below]);

  // (The snapped box is rendered even before the strip is measured: the
  // snap is taken when it mounts and again when it gets its size.)
  const b = width > 0 ? slotBoundaries(width, slotCount) : [];
  const open = below === 'floor' && openIndex >= 0 && openIndex < slotCount ? openIndex : -1;
  return (
    <div aria-hidden className="absolute inset-y-0 left-0 pointer-events-none" style={{ width }}>
      <div ref={snapRef} className={`wall-columns wall-columns--${below} ${old ? 'wall-columns--old' : ''}`}>
        {below === 'floor' && width > 0 && (open < 0
          ? <span className="wall-floor" style={{ left: 0, width }} />
          : (
            <>
              {b[open] > 0 && <span className="wall-floor" style={{ left: 0, width: b[open] }} />}
              {b[open + 1] < width && <span className="wall-floor" style={{ left: b[open + 1], width: width - b[open + 1] }} />}
            </>
          ))}
        {b.slice(1, -1).map((x, k) => (
          <span key={k} className="wall-column" style={{ left: x - 2 }} />
        ))}
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
      <div ref={snapRef} data-wall-piers className="relative w-full h-full">
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
