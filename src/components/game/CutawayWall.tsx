import React from 'react';
import { prepCanvas, useCrispSnap } from './panelSkins';
import {
  ARCH_H, FOUND_H, FOUND_STEP, PIER_STOP, PIER_TOP, PIER_W, SLAB_H, WALL_TORCH_GAP, WALL_TORCH_HALF, drawArcade, drawFoundation, drawPier, drawSlab,
} from './cutawayStone';
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
 * THE ARCADE BETWEEN CARDS: stone in place of the iron posts
 * (StripDividers) when the wall is on, for the hero strip and the enemy and
 * ally strips alike, on the same slot boundaries. Under the beam hangs a
 * band of stone with an ARCH cut out for each card ("inside arched cutouts
 * (like a cloister)": user, 2026-11-21; cutawayStone.ts drawArcade), and a
 * column stands under the stone between two cutouts, its capital where the
 * arches spring (18px under the beam). Where a column ENDS depends on what
 * is under the cards (`below`), the user's rule of the same day:
 *
 *   'floor'  an info drawer is open under the cards. The columns stand on
 *            a narrow stone FLOOR along the strip's foot, left out under
 *            the drawer's own card (`openIndex`: "the segment for the
 *            currently selected hero should not be present"), where the
 *            card opens into its drawer. (The floor first stood under the
 *            tap hint too; the user: "ideally, the narrow floor would only
 *            be present when somebody is selected". The hint is now a line
 *            under the title: BeamTapHint.)
 *   'open'   nothing is under the cards: no floor from here. The columns
 *            stay as they are and the NEXT PANEL'S BEAM COMES UP to their
 *            feet, where the floor would be (user, from their phone: "I
 *            don't want the columns to EXTEND, I'd like the lower ... beam
 *            to come up to them, essentially replacing the 'floor'"; a
 *            first version ran the columns down to the beam instead). The
 *            beam is moved by the page (index.css, [data-wall-below]); this
 *            only looks whether one is there (the beams mark themselves
 *            data-wall-beam). With none (the last panel on the page) the
 *            room is closed with the floor after all.
 *
 * History, so it is not tried again: a first floor ran under the heroes'
 * FEET, half way up the cards, with the columns stopping on it; the user did
 * not like it ("i do not like the floor, but like the columns"). This floor
 * is at the foot of the cards. And a column NEVER steps aside for the
 * selected card, as the posts did: "can the new border overlap OVER the
 * columns instead of replacing them?" So render this BEFORE the selection
 * strip: the selection's outline and wash paint over it, the cards over both.
 *
 * Placeholder stone (the columns and floor in CSS, index.css .wall-columns;
 * the arcade a canvas), inside a box snapped to whole pixels. The arcade
 * meets the beam only because the header row above keeps one height in the
 * wall (WALL_ROW).
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

  // With nothing under the cards: has a beam come up to the columns' feet?
  // Kept as an attribute on the box (no render needed when it changes), and
  // looked for again whenever the strip or the page under it changes size.
  React.useLayoutEffect(() => {
    const host = snapRef.current;
    if (!host || below !== 'open') return;
    const measure = () => {
      const bottom = host.getBoundingClientRect().bottom;
      let found = false;
      for (const beam of document.querySelectorAll('[data-wall-beam]')) {
        // (Its top sits where the floor's would: 4px above the strip's foot.)
        if (Math.abs(beam.getBoundingClientRect().top - (bottom - 4)) <= 6) { found = true; break; }
      }
      host.toggleAttribute('data-no-beam', !found);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    const page = document.querySelector('[data-wall-piers]');
    if (page) ro.observe(page);
    return () => ro.disconnect();
  }, [snapRef, below]);

  // The arcade over the cards: a band of stone with an arch cut out for
  // each card (cutawayStone.ts drawArcade), hung from the beam. Drawn at
  // once, never in a frame callback (the skins' shared rule).
  const arcadeRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    const canvas = arcadeRef.current;
    if (!canvas || width <= 0) return;
    const ctx = prepCanvas(canvas, width, ARCH_H, 0);
    if (!ctx) return;
    ctx.clearRect(0, 0, width, ARCH_H);
    drawArcade(ctx, width, slotBoundaries(width, slotCount), old);
  }, [width, slotCount, old]);

  // (The snapped box is rendered even before the strip is measured: the
  // snap is taken when it mounts and again when it gets its size.)
  const b = width > 0 ? slotBoundaries(width, slotCount) : [];
  const open = below === 'floor' && openIndex >= 0 && openIndex < slotCount ? openIndex : -1;
  return (
    <div aria-hidden className="absolute inset-y-0 left-0 pointer-events-none" style={{ width }}>
      <div ref={snapRef} className={`wall-columns wall-columns--${below} ${old ? 'wall-columns--old' : ''}`}>
        <div className="wall-arcade"><canvas ref={arcadeRef} style={{ position: 'absolute' }} /></div>
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
 * A ROOM'S DARK: until its beam's torch is lit a room is in the dark, and it
 * comes up as the torch catches (user, 2026-11-21: "especially if the panels
 * appear darker and become more visible with the torch lighting"). A veil
 * over the whole room, beam and side walls included ("the darkness of the
 * unlit panels should apply to the heading beam and walls too, not just the
 * contents"), from its beam's top to the next beam's; index.css .wall-dark
 * fades it by whether the room's torch is out (the torch's own --out class,
 * read with :has). So a torch the player puts out darkens its room again.
 * Opacity only. Mount it last in a panel's root, which must carry
 * data-wall-room ("hero" for the hero panel, whose beam is at its top).
 */
export const WallDark: React.FC = () => <div aria-hidden className="wall-dark" />;

/**
 * THE TAP HINT, IN THE WALL: a small line under the title, on the beam, in
 * place of the "Tap a hero for more info" chip and the row it stood in.
 * User, 2026-11-21: "the space below and the floor being present without a
 * selection only exist to house this hint ... Maybe just replace it with
 * 'TAP FOR MORE INFO' in small text below the title if the user does not
 * click on something? Like it would fade in and bob, disappearing when a
 * selection is made?" So it costs no room: with nothing selected the next
 * beam sits at the columns' feet whether the hint shows or not.
 *
 * Mount it inside a title's centred wrapper while the old hint's own
 * condition holds (it has not been tapped away). It waits two seconds,
 * fades in, and bobs (index.css .wall-tap-hint: opacity and transform
 * only); it is gone the moment a card is tapped. The quest scroll's "Tap to
 * minimize" is the same small gold line.
 */
export const BeamTapHint: React.FC = () => (
  <span className="wall-tap-hint"><span>Tap for more info</span></span>
);

/**
 * A BEAM'S TORCH (user call 2026-11-21: "a torch on each of the horizontal
 * beams, either to the left or right of the title text. Only 1 per beam").
 * Mount it inside a title's centred wrapper, after the title: it hangs off
 * the wrapper's left edge (beyond the (?) button) or its right, the same
 * distance from the title to the eye either way (WALL_TORCH_GAP), and dead
 * centre on the beam, which is a torch and two art px tall. Placed without
 * a transform, so the art stays on whole pixels. It is the lintel's own
 * torch, and a tap puts it out; but it LIGHTS WHEN SEEN (LintelTorch
 * lightOn="seen"): each catches when the player has scrolled it two thirds
 * of the way up the screen. The heroes' is lit by the page's first tap.
 */
export const BeamTorch: React.FC<{
  side: 'left' | 'right';
  /** Offsets its flicker from the other beams' (ms). */
  phase?: number;
  /**
   * When it lights: when it has been brought up the screen (the default), or
   * with the page's first tap wherever it stands. The heroes' torch takes
   * the second: theirs is the first room, and on a short phone its beam is
   * low on the screen when the page opens.
   */
  lightOn?: 'seen' | 'entry';
}> = ({ side, phase = 0, lightOn = 'seen' }) => (
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
    <LintelTorch phase={phase} lightOn={lightOn} />
  </span>
);

/**
 * The two side walls, the ground behind the rooms, and the foundation the
 * wall stands on. Mount it as the first child of the wrapper that holds
 * the hero panel and everything under the Dungeon Details lintel (which must
 * be position: relative, and NOT a stacking context): the walls stand in the page's margins
 * from under the hero slab to the wrapper's end, and are redrawn whenever
 * that grows or shrinks (a drawer opening).
 */
export const CutawayPiers: React.FC = () => {
  const snapRef = useCrispSnap<HTMLDivElement>(true);
  const leftRef = React.useRef<HTMLCanvasElement>(null);
  const rightRef = React.useRef<HTMLCanvasElement>(null);
  const footRef = React.useRef<HTMLCanvasElement>(null);
  // The page knows the wall is up (index.css .wall-on): the wall brings its
  // own ground (.wall-ground), so .dungeon-below's is switched off.
  React.useLayoutEffect(() => {
    document.documentElement.classList.add('wall-on');
    return () => document.documentElement.classList.remove('wall-on');
  }, []);
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
        // (They stop inside the footing: PIER_STOP.)
        const pierH = Math.max(1, h - PIER_STOP);
        const ctx = prepCanvas(canvas, PIER_W, pierH, 0);
        if (!ctx) continue;
        ctx.clearRect(0, 0, PIER_W, pierH);
        drawPier(ctx, side, pierH, oldFrom);
      }
      // The foundation, across the wall's foot and a step past it each side.
      const foot = footRef.current;
      const footW = host.clientWidth + 2 * FOUND_STEP;
      const fctx = foot ? prepCanvas(foot, footW, FOUND_H, 0) : null;
      if (fctx) {
        fctx.clearRect(0, 0, footW, FOUND_H);
        drawFoundation(fctx, footW);
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
        {/* The ground: the colder dark of the panels under the hero hall, as
            one layer from behind the heroes' beam to the wall's foot (it
            takes the place of .dungeon-below's own, which began under the
            enemies' beam). First here, so everything else paints over it. */}
        <div className="wall-ground" style={{ left: PIER_W, right: PIER_W }} />
        <div className="absolute top-0 left-0 h-full" style={{ width: PIER_W }}>
          <canvas ref={leftRef} style={{ position: 'absolute' }} />
        </div>
        <div className="absolute top-0 right-0 h-full" style={{ width: PIER_W }}>
          <canvas ref={rightRef} style={{ position: 'absolute' }} />
        </div>
        {/* The foundation: over the foot of both side walls (it comes after
            them here), in the room index.css leaves under the last panel. */}
        <div className="absolute bottom-0" style={{ left: -FOUND_STEP, right: -FOUND_STEP, height: FOUND_H }}>
          <canvas ref={footRef} style={{ position: 'absolute' }} />
        </div>
      </div>
    </div>
  );
};
