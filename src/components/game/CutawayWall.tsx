import React from 'react';
import { Z, prepCanvas, useCrispSnap, whenDecoded } from './panelSkins';
import { RUNG_PLAQUE_PIECES, drawRungPlaque } from './rungPlaqueSkin';
import {
  ARCH_H, ARCH_LIFT, DIRT_TILE_ART, drawDirt, FOUND_H, FOUND_STEP, PIER_STOP, PIER_TOP, PIER_W, PLATE_END_ART, PLATE_H, SLAB_H, WALL_TORCH_GAP, WALL_TORCH_HALF, drawArcade, drawFoundation,
  COUNT_SHIELD_H, RAMPART_H, countShieldWidthArt, drawCountShield, drawNamePlate, namePlateH, RAMPART_RISE_ART, WALL_HERO_Z, WALL_PLATE_Z, drawNiches, drawPier, drawPlate, drawPlateDark, drawRampart, drawRampartDark, drawSetting, drawSlab, settingBox,
} from './cutawayStone';
import type { PlateKind, SettingKind } from './cutawayStone';
import { slotBoundaries } from '../../hooks/useElementWidth';
import { LintelTorch } from './LintelTorch';
import { pokeSign } from '../shared/signWobble';

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
  /** The heroes' beam: the top of the wall above ground, not a floor cut through (cutawayStone.ts drawSlab). */
  above?: boolean;
}> = ({ old = false, z = -1, above = false }) => {
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
      drawSlab(ctx, w, old, above);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    return () => ro.disconnect();
  }, [snapRef, old, above]);
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
 * THE RAMPART over the hero hall (cutawayStone.ts drawRampart): the hero
 * hall is the part of the castle above ground, so its beam is the top of a
 * castle wall: merlons along it, and at each end a tower standing higher,
 * run on down the page's sides by the side walls. Mount it straight after
 * the hero header's CutawaySlab. It stands over the board's dark foot, as
 * the hero slab does, and has its own dark for what is above the beam (as
 * a title plate has: the hero hall's dark begins at the beam).
 */
export const CutawayRampart: React.FC = () => {
  const snapRef = useCrispSnap<HTMLDivElement>(true);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const darkRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    const host = snapRef.current;
    const canvas = canvasRef.current;
    const dark = darkRef.current;
    if (!host || !canvas || !dark) return;
    const draw = () => {
      const w = host.clientWidth;
      if (!w) return;
      const ctx = prepCanvas(canvas, w, RAMPART_H, 0);
      const dctx = prepCanvas(dark, w, RAMPART_H, 0);
      if (!ctx || !dctx) return;
      ctx.clearRect(0, 0, w, RAMPART_H);
      drawRampart(ctx, w);
      dctx.clearRect(0, 0, w, RAMPART_H);
      drawRampartDark(dctx, w);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    return () => ro.disconnect();
  }, [snapRef]);
  return (
    <div aria-hidden className="absolute pointer-events-none" style={{ left: -PIER_W, right: -PIER_W, top: `calc(50% - ${SLAB_H / 2 + RAMPART_RISE_ART * Z}px)`, height: RAMPART_H, zIndex: WALL_HERO_Z }}>
      <div ref={snapRef} className="relative w-full h-full">
        <canvas ref={canvasRef} style={{ position: 'absolute' }} />
        <canvas ref={darkRef} className="wall-plate-dark" style={{ position: 'absolute' }} />
      </div>
    </div>
  );
};

/**
 * Where a title's LETTERS begin and end on the screen (CSS px), not its
 * text box: the box runs on past the last letter by the letter-spacing, and
 * the first and last letters stand in from its edges by their own side
 * bearings, more on one side than the other. A plate centred on the box
 * looked off centre (user, 2026-11-21: "the plates are not really centered
 * to the text (extra space on the right of the text)").
 */
function titleInk(title: Element): { left: number; right: number } {
  const box = title.getBoundingClientRect();
  const cs = getComputedStyle(title);
  let text = (title.textContent ?? '').trim();
  if (cs.textTransform === 'uppercase') text = text.toUpperCase();
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx || !text) return { left: box.left, right: box.right };
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const first = ctx.measureText(text[0]);
  const last = ctx.measureText(text[text.length - 1]);
  const spacing = parseFloat(cs.letterSpacing) || 0;
  return {
    left: box.left - first.actualBoundingBoxLeft,
    right: box.right - spacing - (last.width - last.actualBoundingBoxRight),
  };
}

/**
 * A TITLE'S PLATE (cutawayStone.ts drawPlate): let into the beam behind the
 * title, standing a little proud of it top and bottom, in the room's own
 * colour and with the room's own edge. Mount it straight after the header
 * row's CutawaySlab: it finds the row's title (its h3) and sizes and places
 * itself by it, and again whenever the title or the row changes size (a
 * font arriving, the window turning). The title's own box must come later
 * in the row and carry WALL_OVER_PLATE.
 *
 * ITS LAYER (`z`: WALL_PLATE_Z, or the hero slab's): over the room above,
 * whose columns and whose dark would otherwise fall on the part of it that
 * stands above the beam, and under its own room's dark. That part is out
 * of its own room's dark's reach, so it has its own (the second canvas,
 * .wall-plate-dark: index.css fades it with the room's torch).
 */
export const CutawayPlate: React.FC<{ kind: PlateKind; z?: number }> = ({ kind, z = WALL_PLATE_Z }) => {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const snapRef = useCrispSnap<HTMLDivElement>(true);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const darkRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const dark = darkRef.current;
    const row = box?.parentElement;
    const title = row?.querySelector('h3');
    if (!box || !canvas || !dark || !row || !title) return;
    const draw = () => {
      if (!title.getBoundingClientRect().width) return;
      // By the letters themselves, so the plate is as far past the first as past the last.
      const ink = titleInk(title);
      const widthArt = Math.ceil((ink.right - ink.left) / Z) + 2 * PLATE_END_ART;
      const w = widthArt * Z;
      box.style.left = `${Math.round((ink.left + ink.right) / 2 - row.getBoundingClientRect().left - w / 2)}px`;
      box.style.width = `${w}px`;
      const ctx = prepCanvas(canvas, w, PLATE_H, 0);
      if (!ctx) return;
      ctx.clearRect(0, 0, w, PLATE_H);
      drawPlate(ctx, widthArt, kind);
      const dctx = prepCanvas(dark, w, PLATE_H, 0);
      if (!dctx) return;
      dctx.clearRect(0, 0, w, PLATE_H);
      drawPlateDark(dctx, widthArt, kind);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(title);
    ro.observe(row);
    return () => ro.disconnect();
  }, [kind]);
  return (
    <div ref={boxRef} aria-hidden className="absolute pointer-events-none" style={{ top: `calc(50% - ${PLATE_H / 2}px)`, height: PLATE_H, zIndex: z }}>
      <div ref={snapRef} className="relative w-full h-full">
        <canvas ref={canvasRef} style={{ position: 'absolute' }} />
        <canvas ref={darkRef} className="wall-plate-dark" style={{ position: 'absolute' }} />
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
 *            a narrow stone FLOOR along the strip's foot, UNDER THE
 *            DRAWER'S OWN CARD TOO (user, 2026-11-24: "we should maintain
 *            the false 'floor' even for selected entities": the open info
 *            is a cellar looked into, and the one whose cellar it is still
 *            stands on the floor over it. It was left out under that card
 *            at first, on their word of 2026-11-21: "the segment for the
 *            currently selected hero should not be present"). (The floor
 *            first stood under the tap hint too; the user: "ideally, the
 *            narrow floor would only be present when somebody is
 *            selected". The hint is now a line under the title:
 *            BeamTapHint.)
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
  /** The colder stone from under the hero hall. */
  old?: boolean;
  /** The hero hall: behind the arches is the room's back wall with a loop cut in it (cutawayStone.ts), not passages. */
  hall?: boolean;
}> = ({ slotCount, width, below, old = false, hall = false }) => {
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

  // DEPTH: the back wall of the walk behind the arcade, seen through every
  // arch, with the arch's shadow across its top and left (cutawayStone.ts
  // drawNiches). From the arcade's top to the floor's (4px above the
  // strip's foot, where the next beam's top is when there is no floor).
  const nichesRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    const host = snapRef.current;
    const canvas = nichesRef.current;
    if (!host || !canvas || width <= 0) return;
    const draw = () => {
      const h = host.clientHeight + ARCH_LIFT - 4;
      if (h <= 0) return;
      const ctx = prepCanvas(canvas, width, h, 0);
      if (!ctx) return;
      ctx.clearRect(0, 0, width, h);
      drawNiches(ctx, width, h, slotBoundaries(width, slotCount), old, hall);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    return () => ro.disconnect();
  }, [snapRef, width, slotCount, old, hall]);

  // (The snapped box is rendered even before the strip is measured: the
  // snap is taken when it mounts and again when it gets its size.)
  const b = width > 0 ? slotBoundaries(width, slotCount) : [];
  return (
    <div aria-hidden className="absolute inset-y-0 left-0 pointer-events-none" style={{ width }}>
      <div ref={snapRef} className={`wall-columns wall-columns--${below} ${old ? 'wall-columns--old' : ''}`}>
        <div className="wall-arcade"><canvas ref={nichesRef} style={{ position: 'absolute' }} /></div>
        <div className="wall-arcade"><canvas ref={arcadeRef} style={{ position: 'absolute' }} /></div>
        {below === 'floor' && width > 0 && <span className="wall-floor" style={{ left: 0, width }} />}
        {b.slice(1, -1).map((x, k) => (
          <span key={k} className="wall-column" style={{ left: x - 2 }} />
        ))}
      </div>
    </div>
  );
};

/**
 * A LIST ENTRY'S SETTING (the rooms of lists: ITEMS, STATUS EFFECTS,
 * DUNGEON TILES): wrap the entry's icon in this and the icon gets a small
 * piece of the building to be on or in: a shelf, a hanging tablet, a
 * frame (cutawayStone.ts drawSetting). The piece is drawn out to the side
 * wall when the icon stands beside it (within 12px of the room's left
 * edge: every entry on a phone), and alone otherwise. With "on" false the
 * icon is rendered bare (the wall is off). It takes no layout:
 * the row and the icon are given room by WALL_ENTRY's classes.
 */
export const WallSetting: React.FC<{ on: boolean; kind: SettingKind; children: React.ReactNode }> = ({ on, children, ...rest }) =>
  (on ? <WallSettingOn {...rest}>{children}</WallSettingOn> : <>{children}</>);

const WallSettingOn: React.FC<{ kind: SettingKind; children: React.ReactNode }> = ({ kind, children }) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const snapRef = useCrispSnap<HTMLDivElement>(true);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    const host = hostRef.current;
    const boxEl = boxRef.current;
    const canvas = canvasRef.current;
    if (!host || !boxEl || !canvas) return;
    const room = host.closest('[data-wall-room]');
    const draw = () => {
      const iw = Math.round(host.offsetWidth / Z);
      const ih = Math.round(host.offsetHeight / Z);
      if (!iw || !ih) return;
      const away = room ? host.getBoundingClientRect().left - room.getBoundingClientRect().left : -1;
      const gap = away >= 0 && away <= 12 ? Math.round(away / Z) : null;
      const box = settingBox(kind, iw, ih, gap);
      boxEl.style.left = `${box.x * Z}px`;
      boxEl.style.top = `${box.y * Z}px`;
      boxEl.style.width = `${box.w * Z}px`;
      boxEl.style.height = `${box.h * Z}px`;
      const ctx = prepCanvas(canvas, box.w * Z, box.h * Z, 0);
      if (!ctx) return;
      ctx.clearRect(0, 0, box.w * Z, box.h * Z);
      drawSetting(ctx, kind, iw, ih, gap);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    if (room) ro.observe(room);
    return () => ro.disconnect();
  }, [kind, snapRef]);
  return (
    <div ref={hostRef} className="relative">
      <div ref={boxRef} aria-hidden className="absolute pointer-events-none">
        <div ref={snapRef} className="relative w-full h-full">
          <canvas ref={canvasRef} style={{ position: 'absolute' }} />
        </div>
      </div>
      <div className="relative">{children}</div>
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
 * A NAME PLATE: a title's own plate with a few rows taken out of its
 * middle (cutawayStone.ts drawNamePlate), behind a name in the list rooms,
 * "Dropped by: [Giant Bat]". A hero's name on the HEROES plate, an enemy's
 * on ENEMIES, an item's on ITEMS. It is as wide as what it holds and 28px
 * tall (an item's: 32); the art is redrawn when that changes size.
 */
export const NamePlate: React.FC<{ kind: PlateKind; className?: string; title?: string; children: React.ReactNode }> = ({ kind, className = '', title, children }) => {
  const hostRef = React.useRef<HTMLSpanElement>(null);
  const boxRef = React.useRef<HTMLSpanElement>(null);
  const snapRef = useCrispSnap<HTMLSpanElement>(true);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const h = namePlateH(kind);
  React.useLayoutEffect(() => {
    const host = hostRef.current;
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!host || !box || !canvas) return;
    const draw = () => {
      // A whole number of art px wide, so both pointed ends land on the grid.
      const widthArt = Math.ceil(host.offsetWidth / Z);
      if (!widthArt) return;
      const w = widthArt * Z;
      box.style.width = `${w}px`;
      const ctx = prepCanvas(canvas, w, h, 0);
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      drawNamePlate(ctx, widthArt, kind);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    return () => ro.disconnect();
  }, [kind, h]);
  return (
    <span ref={hostRef} title={title} className={`relative inline-flex items-center gap-1.5 px-3.5 ${className}`} style={{ height: h }}>
      <span ref={boxRef} aria-hidden className="absolute left-0 top-0 pointer-events-none" style={{ height: h }}>
        <span ref={snapRef} className="relative block w-full h-full">
          <canvas ref={canvasRef} style={{ position: 'absolute' }} />
        </span>
      </span>
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </span>
  );
};

/**
 * THE ENEMIES' COUNT, on a small SHIELD (cutawayStone.ts drawCountShield):
 * how many of an enemy type there are, at the top corner of its card. The
 * shield is as wide as the number's digits need and 22px tall, its point
 * hanging under the number. `className` places it (WALL_CARD.count).
 */
export const CountShield: React.FC<{ count: number; className?: string }> = ({ count, className = '' }) => {
  const snapRef = useCrispSnap<HTMLSpanElement>(true);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const widthArt = countShieldWidthArt(String(count).length);
  React.useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = prepCanvas(canvas, widthArt * Z, COUNT_SHIELD_H, 0);
    if (!ctx) return;
    ctx.clearRect(0, 0, widthArt * Z, COUNT_SHIELD_H);
    drawCountShield(ctx, widthArt);
  }, [widthArt]);
  return (
    <span className={className} style={{ width: widthArt * Z, height: COUNT_SHIELD_H }}>
      <span ref={snapRef} aria-hidden className="absolute inset-0 pointer-events-none">
        <canvas ref={canvasRef} style={{ position: 'absolute' }} />
      </span>
      {/* (The number sits on the shield's face: 4px of line and colour above it, the point below.) */}
      <span className="relative block text-center text-xs text-blood-300" style={{ lineHeight: '10px', paddingTop: 5 }}>{count}</span>
    </span>
  );
};

/**
 * A BEAM'S SIGN: the count on a beam (0/3 PLACED, 5 REMAINING, 1 TYPE,
 * 2 TYPES) on a sign of the user's own painting, the plaque LIVES and
 * TURNS hang on at the portcullis (user, 2026-11-25: "there are several
 * instances of text on each of the horizontal beams ... I think these text
 * lines should be inside signs like we used on the portcullis. Would we be
 * able to reuse that art for them?"). It is that art, drawn by the same
 * routine (rungPlaqueSkin.ts): painted ends, the middle tiled between.
 *
 * IT HANGS BESIDE ITS TITLE'S PLATE, on the right, SIGN_GAP from the
 * plate's tip (the first build kept the counts at the beam's right end and
 * pushed them out over the side wall to clear the torches; the user, from
 * their phone: "I think the signs are too far to the right on mobile ...
 * I dont think the right side of the signs need to line up, they should
 * naturally sit next to the title plate with some space"). So mount it
 * inside a title's centred wrapper, after the title.
 *
 * IT PLACES THE BEAM'S TORCH TOO (`torch`), because the two share the
 * title's right: a torch that would LIKE the right stands between the
 * title and the sign when the screen has the room for all three, and goes
 * to the title's left when it has not. (I first put every torch on the
 * left, on "If that means we need to move the hero torch to the left, so
 * be it"; the user, watching: "I do not necessarily want all the torches
 * on the left ... if there IS space to the right for the torch to be
 * reasonably placed between the title and the sign, then it could be on
 * the right. Having variance is more interesting".) The sides they would
 * like take turns down the page, as before the signs: HEROES right,
 * ENEMIES left, ITEMS right, STATUS EFFECTS left, DUNGEON TILES right. On
 * a phone only ITEMS has the room; on a wide screen all three do.
 *
 * The sign reaches SIGN_PAD past the words each side: the black line and
 * the rivets' three columns of a painted end, so the words begin where the
 * rivets end. Its 13 art rows cannot be centred on the beam's 18, so it
 * sits on the beam's art grid one row low of centre (SIGN_DROP). With the
 * plaque unpainted the words stand there bare.
 */
const SIGN_PAD = 4 * Z;
const SIGN_H = 13 * Z;
const SIGN_DROP = 1;
/** From the tip of the title's plate to the sign's painted end (CSS px). */
const SIGN_GAP = 6;
/** How far past its letters a title's plate reaches (CSS px). */
const PLATE_TIP = PLATE_END_ART * Z;
/**
 * With the torch between them: from the title's letters to the sign's
 * painted end (CSS px). The torch's box begins WALL_TORCH_GAP.right from
 * the letters and is 32 wide, its flame and handle in the middle 12 of it:
 * 14px of beam between the plate's tip and the flame, 8 between the flame
 * and the sign.
 */
const SIGN_PAST_TORCH = 40;
/** A sign with a torch before it may end this far out over the side wall (CSS px) and still count as fitting. */
const SIGN_OVER = 8;

/**
 * THE LOOSE SIGN, here too (user, 2026-11-25: "would we be able to add the
 * same ability to shake the signs to the new ones like the ones that are
 * on the portcullis?"). A press on a beam's sign rocks it on its bolt, the
 * pressed half dipping first, and it creaks: the rail plaques' own routine
 * (shared/signWobble.ts pokeSign). Not when the press is on a live button
 * on the sign (the heroes' clear button has its own job; while it is dim
 * and idle the press falls through to the sign).
 */
const pokeBeamSign = (e: React.PointerEvent<HTMLElement>) => {
  if (e.button !== 0) return;
  if ((e.target as Element).closest('button:not(:disabled)')) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  pokeSign(el, e.clientX < r.left + r.width / 2 ? -1 : 1);
};

/**
 * The plaque, drawn into a box of its own height that is as wide as its
 * parent says (a whole number of art px). `solid`: it takes presses (they
 * rise to a sign that rocks as a whole); `onPoke`: it rocks by itself.
 */
const SignArt: React.FC<{
  boxRef: React.RefObject<HTMLSpanElement | null>;
  style: React.CSSProperties;
  solid?: boolean;
  onPoke?: (e: React.PointerEvent<HTMLElement>) => void;
}> = ({ boxRef, style, solid = false, onPoke }) => {
  const snapRef = useCrispSnap<HTMLSpanElement>(true);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas || !RUNG_PLAQUE_PIECES.has('plaque-mid')) return;
    let cancelled = false;
    const draw = () => {
      const w = box.offsetWidth;
      if (!w) return;
      const ctx = prepCanvas(canvas, w, SIGN_H, 0);
      if (!ctx) return;
      ctx.clearRect(0, 0, w, SIGN_H);
      drawRungPlaque(ctx, w, SIGN_H, RUNG_PLAQUE_PIECES);
    };
    // Synchronous once the art is decoded: the skins' shared no-rAF rule.
    whenDecoded([...RUNG_PLAQUE_PIECES.values()]).then(() => { if (!cancelled) draw(); });
    const ro = new ResizeObserver(draw);
    ro.observe(box);
    return () => { cancelled = true; ro.disconnect(); };
  }, [boxRef]);
  return (
    <span ref={boxRef} aria-hidden className={`absolute ${solid || onPoke ? 'pointer-events-auto select-none' : 'pointer-events-none'}`} style={{ ...style, height: SIGN_H }} data-wall-sign={onPoke ? '' : undefined} onPointerDown={onPoke}>
      <span ref={snapRef} className="relative block w-full h-full">
        <canvas ref={canvasRef} style={{ position: 'absolute' }} />
      </span>
    </span>
  );
};

/**
 * A NUMBER ON A SIGN THAT DOES NOT MOVE THE SIGN (user, 2026-11-26: "the
 * signs on the panels should not change size when the text inside them does
 * they should be at their largest size and the text change inside of it if
 * necessary (a metal/wooden sign would not be warping so much)").
 *
 * A sign is as wide as its words, and the words that change are numbers:
 * heroes placed, enemies remaining. Two things moved it. Digits are not all
 * one width in these faces, whatever `tabular-nums` asks (measured: a 1 is
 * narrower than a 0), so "1/3" and "2/3" were different signs; and a count
 * that drops from 10 to 9 loses a whole digit.
 *
 * So the number stands in a cell that is as wide as the WIDEST digit, times
 * the digits of `most` (the largest value it will show), and sits centred in
 * it. The cell is sized by the page itself: all ten digits, repeated to that
 * length, are laid unseen in the same grid cell, and a grid cell is as wide
 * as its widest item. No measuring, no font knowledge. The cell only ever
 * grows (a summoned ally can raise a count past where it started), so the
 * sign is at its largest the first time it is drawn and stays there.
 */
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export const SignNumber: React.FC<{ value: number; most?: number }> = ({ value, most = value }) => {
  const need = Math.max(String(value).length, String(most).length);
  const [held, setHeld] = React.useState(need);
  if (need > held) setHeld(need);
  const len = Math.max(need, held);
  return (
    <span className="inline-grid justify-items-center">
      {DIGITS.map(d => <span key={d} aria-hidden className="invisible [grid-area:1/1]">{d.repeat(len)}</span>)}
      <span className="[grid-area:1/1]">{value}</span>
    </span>
  );
};

export const BeamSign: React.FC<{
  children: React.ReactNode;
  /** The beam's torch: the side it would like, and what BeamTorch takes. */
  torch?: { prefer: 'left' | 'right'; phase?: number; lightOn?: 'seen' | 'entry' };
}> = ({ children, torch }) => {
  const hostRef = React.useRef<HTMLSpanElement>(null);
  const boxRef = React.useRef<HTMLSpanElement>(null);
  const wantsRight = torch?.prefer === 'right';
  const [torchRight, setTorchRight] = React.useState(false);
  React.useLayoutEffect(() => {
    const host = hostRef.current;
    const box = boxRef.current;
    const title = host?.parentElement;
    const row = title?.parentElement;
    if (!host || !box || !title || !row) return;
    const measure = () => {
      const words = host.offsetWidth;
      // The sign is as wide as the words and its two pads, rounded up to a
      // whole number of art px so both painted ends land on the grid.
      box.style.width = `${Math.ceil((words + 2 * SIGN_PAD) / Z) * Z}px`;
      // Is there room for the torch between the title and the sign? (None
      // of this depends on where the sign now is, so it cannot flip-flop.)
      if (wantsRight) setTorchRight(title.getBoundingClientRect().right + SIGN_PAST_TORCH + words + 2 * SIGN_PAD <= row.getBoundingClientRect().right + SIGN_OVER);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    ro.observe(row);
    return () => ro.disconnect();
  }, [wantsRight]);
  const between = wantsRight && torchRight;
  return (
    <>
      {torch && <BeamTorch side={between ? 'right' : 'left'} phase={torch.phase} lightOn={torch.lightOn} />}
      <span
        ref={hostRef}
        className="absolute left-full flex items-center whitespace-nowrap select-none"
        style={{ marginLeft: (between ? SIGN_PAST_TORCH : PLATE_TIP + SIGN_GAP) + SIGN_PAD, top: `calc(50% - ${SIGN_H / 2 - SIGN_DROP}px)`, height: SIGN_H }}
        data-wall-sign
        onPointerDown={pokeBeamSign}
      >
        <SignArt boxRef={boxRef} solid style={{ left: -SIGN_PAD, top: 0 }} />
        <span className="relative flex items-center">{children}</span>
      </span>
    </>
  );
};

/**
 * THE SCROLL'S SPOT: an empty sign on the heroes' beam, the same painted
 * plaque, where the rolled-up quest scroll rests when it is minimized
 * (user, 2026-11-25: "it would be nice to add a spot--empty sign, plate,
 * or otherwise--that the rolled up scroll would sit on when its
 * minimized"). The scroll is about 39px wide and 31 tall at rest, so on a
 * 26px sign its rollers stand a little proud top and bottom, as a scroll
 * hung on a board would. Mount it inside the hero header's quest slot
 * (CharacterSelector: [data-quest-slot], whose centre is where the float
 * parks the scroll); it centres itself there.
 */
export const BEAM_SPOT_W = 26 * Z;

export const BeamSpot: React.FC = () => {
  const boxRef = React.useRef<HTMLSpanElement>(null);
  // (It rocks when pressed, as every sign does. With the scroll parked on
  // it the scroll is over it and takes the press: that opens the scroll.)
  return <SignArt boxRef={boxRef} onPoke={pokeBeamSign} style={{ left: `calc(50% - ${BEAM_SPOT_W / 2}px)`, top: `calc(50% - ${SIGN_H / 2 - SIGN_DROP}px)`, width: BEAM_SPOT_W }} />;
};

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
    const root = document.documentElement;
    root.classList.add('wall-on');
    // The cellar's earth, behind an open info box (cutawayStone.ts drawDirt;
    // index.css .wall-cellar): one small tile, drawn once, handed to the
    // page as an image.
    const tile = document.createElement('canvas');
    tile.width = DIRT_TILE_ART.w;
    tile.height = DIRT_TILE_ART.h;
    const tctx = tile.getContext('2d');
    if (tctx) {
      drawDirt(tctx);
      root.style.setProperty('--wall-dirt', `url(${tile.toDataURL()})`);
    }
    return () => {
      root.classList.remove('wall-on');
      root.style.removeProperty('--wall-dirt');
    };
  }, []);
  React.useLayoutEffect(() => {
    const host = snapRef.current;
    if (!host) return;
    const draw = () => {
      const h = host.clientHeight;
      if (!h) return;
      // THE GROUND is the hero hall's floor: 4px above the foot of its strip
      // of cards, where the enemies' beam's top is with nothing selected and
      // the narrow floor's is over an open info box (drawPier has why).
      // Above it the sides are towers; from it down, earth and older stone.
      // (With no hero strip on the page: the top of the box that holds
      // everything from ENEMIES on.)
      const wrapper = host.parentElement?.parentElement;
      const hall = wrapper?.querySelector("[data-wall-room='hero'] .wall-columns");
      const below = wrapper?.querySelector('.dungeon-below');
      const top = host.getBoundingClientRect().top;
      const oldFrom = hall ? hall.getBoundingClientRect().bottom - 4 - top : below ? below.getBoundingClientRect().top - top : h;
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
