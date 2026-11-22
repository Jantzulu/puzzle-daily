// ============================================================================
// THE CUTAWAY WALL — an experiment behind `?wall=1` (2026-11-21)
// ============================================================================
// Someone shown the app said the hero panel "and everything else below it
// essentially not having a background made it look unfinished" next to the
// portcullis and the dungeon. The user wants the lower page to feel like ONE
// STRUCTURE, "carved out of stone", not floating panels, and is wary of
// "big swaths of boring color/texture". The reference that landed: a castle
// CROSS-SECTION (Biesty's Cross-Sections Castle: "kind of what I had in
// mind!"): one building cut open, every storey a different room.
//
// So the page below the board becomes a cutaway: the panels are ROOMS, and
// what is drawn is the cut stone between them. The rooms themselves stay the
// page's dark, so text sits on what it sits on today and no texture is ever
// behind it.
//
// THIS FILE IS PLACEHOLDER STONE, drawn by code so the PROPORTIONS can be
// judged on a phone before anything is painted (the rail redesign went the
// same way: live on placeholders, then the user painted). It is drawn on the
// Z=2 art grid in the Dungeon Details lintel's own palette, so it sits in the
// family. When the shape is right it becomes a Panel Forge kit and these
// routines are replaced by the user's pieces.
//
// And the FOUNDATION at the wall's foot (drawFoundation below): a stepped
// footing of rough stone on bedrock that thins into the page.
//
// And the GROUND: the colder dark the panels under the hero hall have
// always had (.dungeon-below) runs up behind the heroes too, as one layer
// for the whole wall (user: "Every panel has a background color except the
// heroes, can we expand that color up for them?").
//
// What is drawn so far:
//   the SLAB  a course of hewn blocks behind a storey's title: the floor
//             between two rooms, cut through, with the title of the room
//             below carved in it. EVERY title has the same one (user
//             thought 2026-11-21: drop the words DUNGEON DETAILS and
//             standardize the beams): HEROES and ENEMIES in the kept stone,
//             ITEMS, STATUS EFFECTS, DUNGEON TILES and ALLIES in the older
//             stone, where a thin groove (.dungeon-seam) used to part
//             them. With the switch on, the Dungeon Details lintel and its
//             words are not drawn.
//   an ARCADE over every strip of cards (heroes, enemies, allies): a band
//             of stone under the beam with an arch cut out for each card,
//             as in a cloister, on COLUMNS that take the place of the iron
//             posts (CutawayWall WallColumns; drawArcade below). With an
//             open drawer under the cards they stand on a FLOOR
//             along the strip's foot (left open under the drawer's own
//             card); with nothing under the cards the next panel's BEAM
//             comes up to their feet in the floor's place. The selection's
//             outline is drawn over them; an open drawer's outline rests on
//             the beam below.
//   the HINT  "Tap for more info", a small line under the title on the
//             beam, in place of the chip and its row (BeamTapHint).
//   a TORCH   one on each beam (user call 2026-11-21: "Only 1 per beam"),
//             beside the title, the sides taking turns down the page:
//             HEROES right, ENEMIES left, ITEMS right, STATUS EFFECTS left
//             (its count starts where its title ends: no room on the
//             right), DUNGEON TILES right; ALLIES left.
//   the PIERS the two side walls, cut through, running down both edges of
//             the page from the slab to the last panel: what makes the
//             storeys one building. Below the lintel the stone is older:
//             colder, with facing blocks fallen out.
//
// Pure arithmetic and canvas calls: no React, no DOM, nothing random (the
// same wall every time), so the layout of the blocks can be tested.

import { Z } from './panelSkins';

/** The switch: `?wall=1`, read once at load (the `?cardscale=` pattern). */
function readWallSwitch(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('wall') === '1';
  } catch {
    return false; // no window (tests) or a malformed URL
  }
}
export const WALL_ON = readWallSwitch();

// ---- sizes, in ART px (multiply by Z for CSS px) ------------------------------------

/** How thick a side wall is. On a phone this is the page's own margin, so the wall runs off the edge of the screen. */
export const PIER_ART = 10;
/**
 * How tall the slab behind a storey's title is. 18 = a torch (16 art px)
 * with one art px of stone above and below it (user report 2026-11-21, on a
 * phone: "the torches are not vertically centered to the beams that they
 * are on". The beam was 15: a 16-px torch overhung it by HALF an art pixel
 * top and bottom, off the beam's own pixel grid, and its handle hung below
 * the stone's shaded bottom lip). On 18 the torch covers exactly the
 * block's face, row for row.
 */
export const SLAB_ART = 18;
/** The header row a slab sits behind is this tall (CSS px): the count's line box, on every panel. */
const HEADER_ROW_H = 14;

export const PIER_W = PIER_ART * Z;
export const SLAB_H = SLAB_ART * Z;
/**
 * How far the slab rises above the top of an ordinary header row (CSS px).
 * The slab itself is placed by the row's CENTRE (CutawayWall.tsx), as the
 * title and the torch are; this is only for what must clear it: where the
 * side walls begin, and the room left above and below a title.
 */
export const SLAB_RISE = (SLAB_H - HEADER_ROW_H) / 2;
/** Where the piers begin, under the slab (CSS px below the top of the header row). */
export const PIER_TOP = SLAB_H - SLAB_RISE;

// ---- how the pieces sit among the page's own (used by the components) ---------------

/** The hero slab's layer: just over the board (z-10), under the rail (40), the quest (45) and the title (46). */
export const WALL_HERO_Z = 11;
/** What lifts a header's own in-flow words over the hero slab (Tailwind classes). */
export const WALL_OVER_SLAB = 'relative z-[12]';
/**
 * A title's plate, in the rooms under the hero hall: over the strip of the
 * room above (1) and that room's dark (2, earlier on the page), under its
 * own room's dark (2, later). And what keeps a title over its plate (a
 * Tailwind class for the title's own box, which comes after the plate).
 * The heroes' plate is with its slab (WALL_HERO_Z), its title at 46.
 */
export const WALL_PLATE_Z = 2;
export const WALL_OVER_PLATE = 'z-[2]';
/** The space under a title that sits on a slab (a Tailwind margin class): the slab reaches 11px below the header row. */
export const WALL_HEADER_GAP = 'mb-4';
/**
 * The room a beam under the hero hall needs above its title (classes for a
 * spacer, which must be the panel's first child). With the pinned 20px row
 * (WALL_ROW) the beam's top is 12px under the spacer's top. index.css pulls
 * this spacer up (.wall-above-beam) by what the panel above has under its
 * cards.
 */
export const WALL_ABOVE_BEAM = 'h-5 wall-above-beam';
/**
 * How far a beam's torch stands from its title (CSS px from the title's
 * edge to the torch's). The user's rule (2026-11-21): torches need not line
 * up down the page, "as long as they are the same distance away from the
 * ends of the title text". The same to the EYE: on the left the title's end
 * is its (?) mark (a 16px glyph ending 8px before the letters), so 34 puts
 * the torch 10px from the mark, as 10 puts it 10px from the last letter
 * (it was 30 and 6; the title's PLATE now reaches 6px past the letters, and
 * the torch stands 4px clear of its tip).
 */
export const WALL_TORCH_GAP = { left: 34, right: 10 };
/** Half a torch's height (CSS px), to centre it on the title's row. */
export const WALL_TORCH_HALF = 16;
/**
 * The height of a header row over a strip of cards, in the wall (a Tailwind
 * class): heroes, enemies, allies. The columns' capitals reach 8px above
 * the strip to meet the beam, and the beam is centred on this row, so the
 * row must not change height. Unpinned, the hero row is 14px until a hero
 * is placed and 20px after (the clear button), and the enemy row is 14px:
 * the beam would end 5px above one strip and 8px above another. 20 = the
 * taller state, so placing the first hero no longer shifts the page either.
 */
export const WALL_ROW = 'min-h-[20px]';
/**
 * A list's two columns on a wide screen, in the wall (Tailwind classes): a
 * GRID, not the CSS columns the lists use otherwise. In CSS columns an
 * entry's setting (an absolutely placed canvas) was drawn where the entry
 * would have stood in ONE column, at the wall under the first entry, while
 * the entry itself was in the second (user report with a screenshot,
 * 2026-11-21: "the wide view (desktop) breaks the list room flavor").
 */
export const WALL_LIST = 'md:grid md:grid-cols-2 md:gap-x-5 md:items-start';
/**
 * A list entry's row and its icon, in the wall (Tailwind classes), by the
 * setting its icon has (WallSetting): room for the setting round the icon,
 * and a row tall enough to hold it when the entry is one line of text.
 */
export const WALL_ENTRY = {
  shelf: { row: 'min-h-[50px]', icon: 'ml-1.5 mr-0.5 mt-0.5' },
  tablet: { row: 'min-h-[38px]', icon: 'ml-2 mr-1 mt-0.5' },
  frame: { row: 'min-h-[44px]', icon: 'ml-2 mr-1 mt-1' },
} as const;
/**
 * What sits directly above the next panel's beam, for a panel with a strip
 * of cards: nothing ('open') or the info drawer. Written on the panel's
 * root as data-wall-below; index.css places the NEXT panel's beam to suit
 * (at the columns' feet; under the drawer's outline).
 */
export type WallBelow = 'open' | 'drawer';

// ---- stone ----------------------------------------------------------------------------

/** The Dungeon Details lintel's stone (LintelMesh.tsx), so the wall is of a piece with it. */
const KEPT = {
  mortar: '#120e0b',
  faces: ['#262120', '#221e1c', '#2a2420'],
  lit: '#34302b', // a block's top row, catching the light
  edgeLit: '#312a25',
  dark: '#19140f',
  core: ['#1a1613', '#1d1916', '#171310'], // the rubble a thick wall is filled with
  cut: '#3b3226', // the line where the stone was cut through
};

/** The same stone further down: colder, darker. */
const OLD = {
  mortar: '#0e0c0c',
  faces: ['#1f1d1e', '#1c1a1b', '#222021'],
  lit: '#2b292a',
  edgeLit: '#272526',
  dark: '#151314',
  core: ['#161415', '#191718', '#131112'],
  cut: '#2e2b29',
};

export const hash = (i: number): number => {
  const s = Math.sin((i + 7) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

const pick = <T,>(list: readonly T[], seed: number): T => list[Math.floor(hash(seed) * list.length) % list.length];

// ---- the slab ---------------------------------------------------------------------------

export interface SlabBlock { x: number; w: number; tone: number }

/**
 * The blocks of one course of stone `widthArt` wide, left to right, one art
 * px of mortar between them: about `about` art px each, no two quite the
 * same, and together exactly as wide as the course. `salt` makes another
 * course lay its joints elsewhere.
 */
export function courseBlocks(widthArt: number, about: number, salt = 0): SlabBlock[] {
  const width = Math.max(1, Math.floor(widthArt));
  const n = Math.max(1, Math.round(width / about));
  const raw = Array.from({ length: n }, (_, i) => 1 + (hash(salt + i * 3) - 0.5) * 0.5);
  const total = raw.reduce((a, b) => a + b, 0);
  const stone = width - (n - 1); // what is left after the seams
  const blocks: SlabBlock[] = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    // The last block takes whatever is left, so the course ends flush.
    const w = i === n - 1 ? width - x : Math.max(4, Math.round((raw[i] / total) * stone));
    blocks.push({ x, w, tone: Math.floor(hash(salt + i * 11 + 3) * 3) % 3 });
    x += w + 1;
  }
  return blocks;
}

/** The blocks of a slab (a beam): about 34 art px each. */
export const slabBlocks = (widthArt: number): SlabBlock[] => courseBlocks(widthArt, 34);

/** Draw the slab into a canvas `w` CSS px wide (its height is SLAB_H). `old`: the colder stone from under the lintel. */
export function drawSlab(ctx: CanvasRenderingContext2D, w: number, old = false): void {
  const a = (ax: number, ay: number, aw: number, ah: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(ax * Z, ay * Z, aw * Z, ah * Z);
  };
  const widthArt = Math.ceil(w / Z);
  const s = old ? OLD : KEPT;
  a(0, 0, widthArt, SLAB_ART, s.mortar);
  for (const b of slabBlocks(widthArt)) {
    const top = 1; // (the torch's 16 rows are these 16: SLAB_ART)
    const h = SLAB_ART - 2;
    a(b.x, top, b.w, h, s.faces[b.tone]);
    a(b.x, top, b.w, 1, s.lit); // the top catches the light
    a(b.x, top + 1, 1, h - 1, s.edgeLit); // so does the left edge, less
    a(b.x + b.w - 1, top + 1, 1, h - 1, s.dark); // the right edge is in shade
    a(b.x, top + h - 2, b.w, 2, s.dark); // and the bottom lip
  }
}

// ---- the title plates -------------------------------------------------------------------
// User, 2026-11-21: "a more fancy crest/plate the titles would sit on top
// of. they would break up the straight edge of the beams and could be
// customized to each asset type". So behind every title there is a PLATE
// let into the beam (the QUEST plate over the board is the model): a dark
// plate in the room's own colour, as wide as the title and a blunt point
// past it each side, that stands PROUD of the beam, two art px above its
// top and two below its foot, and how it stands proud is the room's. Each
// edge is ONE calm shape the length of the title:
//   heroes   a raised tab, flat across, its corners taken off (allies too)
//   enemies  horns: high at the two ends, low across the middle
//   items    a stepped pediment, as a chest's lid
//   status   a low arch, as a rune stone's head
//   tiles    two slabs, one joint between them on the middle
// (The first set had battlements for the heroes, teeth for the enemies and
// a row of six-px slabs for the tiles. The user: "I am lukewarm on the
// plates, but prefer the style of 'items' and 'status effects'": the two
// that were one shape, not a row of small notches. No perforated edges.)
// The title, its torch, its (?) mark and the tap hint are untouched: the
// plate is drawn under them.
//
// A PLATE BELONGS TO ITS OWN ROOM, though its top two art px stand in the
// room above (the user, of the first build: "the plates can be overlapped
// by the above columns and the parts of a plate that dip into a different
// panel get lit differently"). So it is laid OVER the room above (its
// columns, its selection outline, its dark: index.css raises .dungeon-below
// and the plate's layer), and the part above the beam, which its own
// room's dark does not reach, has a dark of its own (drawPlateDark; the
// component fades it with the room's torch exactly as the room's is).

export type PlateKind = 'heroes' | 'enemies' | 'allies' | 'items' | 'status' | 'tiles';

/** How far a plate stands out past the beam, top and bottom (art px), and how long its pointed ends are. */
export const PLATE_RISE_ART = 2;
export const PLATE_END_ART = 3;
/** A plate's height (CSS px): the beam's and the rise, twice. */
export const PLATE_H = SLAB_H + 2 * PLATE_RISE_ART * Z;
/** How far each row of a pointed end is cut back from the beam's edge, from the tip inwards (art px). */
const PLATE_TAPER = [7, 4, 2];

/** Each room's plate: its face (dark: the title is read on it) and the light and dark of its rim. */
const PLATE_COLORS: Record<PlateKind, { face: string; lit: string; dark: string }> = {
  heroes: { face: '#1c1626', lit: '#4b3b68', dark: '#0f0b15' },
  enemies: { face: '#241415', lit: '#683a3b', dark: '#140a0b' },
  allies: { face: '#221d13', lit: '#675b38', dark: '#13100a' },
  items: { face: '#221d13', lit: '#675b38', dark: '#13100a' },
  status: { face: '#122120', lit: '#366761', dark: '#0a1312' },
  tiles: { face: '#24180f', lit: '#684b37', dark: '#140d08' },
};

/**
 * How far the plate stands out past the beam at column `x` of its body
 * (the part between its two pointed ends, `bodyW` art px wide): 0 to
 * PLATE_RISE_ART, the same at the top and at the foot, and the same on
 * both sides of the middle.
 */
export function plateRise(kind: PlateKind, x: number, bodyW: number): number {
  const c = Math.floor(Math.abs(x - (bodyW - 1) / 2)); // columns from the middle
  const fromEnd = Math.min(x, bodyW - 1 - x);
  switch (kind) {
    case 'heroes':
    case 'allies':
      return Math.min(PLATE_RISE_ART, fromEnd); // a raised tab: flat, its corners taken off
    case 'enemies':
      return c < bodyW / 6 ? 0 : c < bodyW / 3 ? 1 : 2; // horns: low across the middle third, stepping up to the ends
    case 'items':
      return fromEnd < 4 ? 0 : c < bodyW / 6 ? 2 : 1; // three steps up to the middle
    case 'status':
      return Math.round(PLATE_RISE_ART * Math.sin((Math.PI * (x + 0.5)) / bodyW)); // a low arch
    case 'tiles':
      return c === 0 ? 0 : Math.min(PLATE_RISE_ART, fromEnd + 1); // two slabs: one joint, on the middle
  }
}

/** The first and last art row of the plate at column `x` (0 = its top row, PLATE_RISE_ART above the beam's). */
export function plateColumn(kind: PlateKind, x: number, widthArt: number): { top: number; bottom: number } {
  const last = SLAB_ART + 2 * PLATE_RISE_ART - 1;
  const fromEnd = Math.min(x, widthArt - 1 - x);
  const back = fromEnd < PLATE_END_ART
    ? PLATE_RISE_ART + PLATE_TAPER[fromEnd]
    : PLATE_RISE_ART - plateRise(kind, x - PLATE_END_ART, widthArt - 2 * PLATE_END_ART);
  return { top: back, bottom: last - back };
}

/** Draw a title's plate into a canvas `widthArt` art px wide and PLATE_H tall. Lit from the top left. */
export function drawPlate(ctx: CanvasRenderingContext2D, widthArt: number, kind: PlateKind): void {
  const s = PLATE_COLORS[kind];
  const a = (ax: number, ay: number, aw: number, ah: number, color: string) => {
    if (aw <= 0 || ah <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(ax * Z, ay * Z, aw * Z, ah * Z);
  };
  const none = { top: 1, bottom: 0 }; // (past either end: nothing)
  for (let x = 0; x < widthArt; x++) {
    const col = plateColumn(kind, x, widthArt);
    const before = x > 0 ? plateColumn(kind, x - 1, widthArt) : none;
    const after = x + 1 < widthArt ? plateColumn(kind, x + 1, widthArt) : none;
    a(x, col.top, 1, col.bottom - col.top + 1, s.face);
    // The rim: lit where the plate's edge faces left or up, dark where it faces right or down.
    for (let y = col.top; y <= col.bottom; y++) {
      if (y < before.top || y > before.bottom) a(x, y, 1, 1, s.lit);
      else if (y < after.top || y > after.bottom) a(x, y, 1, 1, s.dark);
    }
    a(x, col.top, 1, 1, s.lit);
    a(x, col.bottom, 1, 1, s.dark);
  }
  // A rivet in each pointed end.
  const mid = PLATE_RISE_ART + SLAB_ART / 2 - 1;
  a(1, mid, 1, 2, s.lit);
  a(widthArt - 2, mid, 1, 2, s.lit);
}

/**
 * The dark over the part of a plate that stands above its beam (the top
 * PLATE_RISE_ART rows), in the room's own dark (index.css .wall-dark's
 * colour), into a canvas the plate's size. The rest of the plate is inside
 * its own room and is darkened with it.
 */
export function drawPlateDark(ctx: CanvasRenderingContext2D, widthArt: number, kind: PlateKind): void {
  ctx.fillStyle = 'rgba(6, 5, 4, 0.68)';
  for (let x = 0; x < widthArt; x++) {
    const { top } = plateColumn(kind, x, widthArt);
    if (top < PLATE_RISE_ART) ctx.fillRect(x * Z, top * Z, Z, (PLATE_RISE_ART - top) * Z);
  }
}

// ---- the arcade ---------------------------------------------------------------------------
// User, 2026-11-21: "can we change the columns to architecture that make
// each hero/enemy/ally look like they are inside arched cutouts (like a
// cloister)". So over every strip of cards there is a band of stone under
// the beam with an ARCH cut out of it for each card, and the columns carry
// the arches: each stands under the stone left between two cutouts.
//
// The arch is LOW, because the room it has is low: a card's art begins 2px
// under the strip's top, so the curve gets 8 art px of height, 4 of them in
// the gap under the beam. A true half-round on a card 56 art px wide would
// need 28. So the cutout is flat across the middle with a quarter of an
// ellipse at each shoulder (a "basket-handle" arch), the shoulders no wider
// than ARCH_MAX_RX_ART so that one card and five get the same curve.

/** The rows of the curve, and the stone left across the top above the cutouts (art px). */
export const ARCH_RISE_ART = 8;
export const ARCH_BAND_ART = 1;
/** The arcade's height (CSS px): it hangs from the beam, 8px above the strip. */
export const ARCH_H = (ARCH_RISE_ART + ARCH_BAND_ART) * Z;
/** The widest a shoulder's curve runs in from its column (art px). */
export const ARCH_MAX_RX_ART = 24;

/**
 * How far the stone reaches in from the side of a cutout on row `y` of the
 * curve (0 = its top row), for a shoulder `rx` wide: widest at the top,
 * nothing at the springing. A quarter of an ellipse, read at the row's middle.
 */
export function archInset(y: number, rx: number, rise = ARCH_RISE_ART): number {
  const t = (rise - y - 0.5) / rise;
  return Math.max(0, Math.round(rx * (1 - Math.sqrt(Math.max(0, 1 - t * t)))));
}

/** The arcade hangs this far above the strip it is over (CSS px): from the beam. Mirrors index.css .wall-arcade. */
export const ARCH_LIFT = 4 * Z;

/** A run of the arch's edge: `w` art px on row `y` (0 = the band's row), from `x` (art px from the card's left edge). */
export interface ArchRun { x: number; y: number; w: number }

/**
 * One card's cutout: it runs from `left` to `right` (art px from the
 * card's left edge), and on row `y` of the curve the stone reaches
 * `reach[y]` in from each side (nothing from the springing down).
 */
export function archOpening(widthArt: number, first: boolean, last: boolean): { left: number; right: number; reach: number[] } {
  const left = first ? 0 : 1; // past the half of the column that is on this card
  const right = widthArt - (last ? 0 : 1);
  const rx = Math.min(ARCH_MAX_RX_ART, Math.floor((right - left) / 2));
  const reach = Array.from({ length: ARCH_RISE_ART + 1 }, (_, y) => (y < ARCH_RISE_ART ? archInset(y, rx) : 0));
  return { left, right, reach };
}

/**
 * THE EDGE OF ONE CARD'S CUTOUT, as runs of art pixels: the stone pixels
 * that face the opening, sideways or down. Across the band's underside,
 * round both shoulders, to the springing, where it lands on the column's
 * own pixel (x = 0 and x = widthArt - 1).
 *
 * The arcade draws its rim with these, and the selection draws its outline
 * with these (SelectionShape.tsx: user, 2026-11-21, "Could the top of the
 * selection border follow the curvature of the new arch?"), so the outline
 * sits on the arch pixel for pixel.
 *
 * `first` / `last`: the card is at a side wall, where the cutout runs to
 * the card's very edge (no column there to stop short of).
 */
export function archOutline(widthArt: number, first: boolean, last: boolean): ArchRun[] {
  const { left, right, reach } = archOpening(widthArt, first, last);
  const runs: ArchRun[] = [];
  // The band's underside: everything over the opening's top row.
  runs.push({ x: left + reach[0], y: 0, w: right - left - 2 * reach[0] });
  for (let y = 0; y < ARCH_RISE_ART; y++) {
    const row = ARCH_BAND_ART + y;
    // Left shoulder: from over the row below's opening to this row's own last stone pixel.
    let from = left + reach[y + 1];
    let to = left + reach[y] - 1;
    if (to < from) from = to;
    from = Math.max(0, from);
    to = Math.max(0, to);
    runs.push({ x: from, y: row, w: to - from + 1 });
    // Right shoulder, its mirror.
    let rFrom = right - reach[y];
    let rTo = right - reach[y + 1] - 1;
    if (rTo < rFrom) rTo = rFrom;
    rFrom = Math.min(widthArt - 1, rFrom);
    rTo = Math.min(widthArt - 1, rTo);
    runs.push({ x: rFrom, y: row, w: rTo - rFrom + 1 });
  }
  return runs;
}

/**
 * Draw the arcade into a canvas `w` CSS px wide and ARCH_H tall. `edges` are
 * the strip's slot boundaries (CSS px, from 0 to w): a column stands on each
 * inner one. Lit from the top left: the rim of each cutout is picked out.
 */
export function drawArcade(ctx: CanvasRenderingContext2D, w: number, edges: readonly number[], old = false): void {
  const s = old ? OLD : KEPT;
  // The lightest face and the cut's own line: the arches must read on a phone, against a room that is nearly black.
  const stone = s.faces[2];
  const rim = s.cut;
  const a = (ax: number, ay: number, aw: number, ah: number, color: string) => {
    if (aw <= 0 || ah <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(ax * Z, ay * Z, aw * Z, ah * Z);
  };
  const widthArt = Math.ceil(w / Z);
  const rows = ARCH_BAND_ART + ARCH_RISE_ART;
  // The stone across the top.
  a(0, 0, widthArt, ARCH_BAND_ART, stone);
  for (let i = 0; i + 1 < edges.length; i++) {
    // (Floors, as the selection's own edges are: an odd last pixel is left over, not rounded up.)
    const x0 = Math.floor(edges[i] / Z);
    const cardArt = Math.floor(edges[i + 1] / Z) - x0;
    const runs = archOutline(cardArt, i === 0, i + 2 === edges.length);
    // The shoulders' stone: on each row, from the card's edge in to the rim, both sides.
    for (let row = ARCH_BAND_ART; row < rows; row++) {
      const [l, r] = runs.filter(run => run.y === row);
      a(x0, row, l.x + l.w, 1, stone);
      a(x0 + r.x, row, cardArt - r.x, 1, stone);
    }
    for (const run of runs) a(x0 + run.x, run.y, run.w, 1, rim);
  }
  // The stone over each column, between two cutouts: the full height, down to the capital.
  for (let i = 1; i + 1 < edges.length; i++) {
    const x = Math.floor(edges[i] / Z);
    a(x - 1, 0, 1, rows, s.edgeLit);
    a(x, 0, 1, rows, s.dark);
  }
}

// ---- depth: a vaulted passage behind every arch ------------------------------------------
// User, 2026-11-21: "maybe there is a way to make the darkness in each of
// the cloisters more interesting. Maybe depth? I'm unsure". FIRST TRY, NOT
// TO BE REPEATED: a back wall of courses seen through the arches. The user,
// on seeing it: "the bricks make it look like the entities are floating" (a
// surface right behind them, and nothing under their feet).
//
// So the depth is at the EDGES and the middle stays the room's plain dark:
// each arch is the mouth of a vaulted passage running back from it. Just
// inside the mouth the passage's wall and vault still catch a little light;
// then a RIB (an arch across the passage, a line of stone), dimmer wall, a
// second rib smaller and fainter, and past that nothing. The light is from
// the top left as everywhere, so the passage's right-hand wall is a little
// brighter than its left and its vault.

/** Where the ribs stand: how far in from the mouth's edge (art px). Closer together going back, as things far off are. */
export const PASSAGE_RIBS_ART = [3, 5] as const;
/** How much of the stone's colour shows over the room's dark: the wall before each rib, and each rib. */
const PASSAGE_WALL = [0.26, 0.11];
const PASSAGE_RIB = [0.6, 0.3];
/** The room's dark (index.css .wall-ground). */
const GROUND = '#0d0a09';

/**
 * The opening on art row `y` of a cutout (0 = the arcade's top row, the
 * band of stone): from the first open pixel to one past the last, or null
 * above the opening.
 */
export function nicheSpan(open: { left: number; right: number; reach: number[] }, y: number): [number, number] | null {
  if (y < ARCH_BAND_ART) return null;
  const k = y - ARCH_BAND_ART;
  const r = k < ARCH_RISE_ART ? open.reach[k] : 0;
  return open.right - r > open.left + r ? [open.left + r, open.right - r] : null;
}

/**
 * How far inside the mouth a pixel is (art px, 0 = on its edge, up to
 * `cap`), counted from the stone to its left, to its right and above it;
 * and whether the nearest stone is the one to its RIGHT (the lit wall).
 * -1 = not in the opening.
 */
export function passageDepth(open: { left: number; right: number; reach: number[] }, x: number, y: number, cap: number): { depth: number; lit: boolean } {
  const inside = (px: number, py: number) => { const s = nicheSpan(open, py); return !!s && px >= s[0] && px < s[1]; };
  if (!inside(x, y)) return { depth: -1, lit: false };
  const run = (dx: number, dy: number) => { let n = 0; while (n < cap && inside(x + dx * (n + 1), y + dy * (n + 1))) n++; return n; };
  const l = run(-1, 0);
  const r = run(1, 0);
  const u = run(0, -1);
  return { depth: Math.min(l, r, u), lit: r < l && r < u };
}

/** A colour part of the way from `a` to `b` (#rrggbb). */
function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * Math.min(1, t)).toString(16).padStart(2, '0')).join('');
}

/**
 * Draw the passages behind an arcade into a canvas `w` CSS px wide and
 * `h` tall, whose top is the arcade's top. `edges` as for drawArcade.
 * Only the pixels near a mouth's edge are painted: the middle is left clear.
 */
export function drawNiches(ctx: CanvasRenderingContext2D, w: number, h: number, edges: readonly number[], old = false): void {
  const stone = (old ? OLD : KEPT).faces[2];
  const rows = Math.floor(h / Z);
  const last = PASSAGE_RIBS_ART[PASSAGE_RIBS_ART.length - 1];
  const px = (ax: number, ay: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(ax * Z, ay * Z, Z, Z);
  };
  for (let i = 0; i + 1 < edges.length; i++) {
    const x0 = Math.floor(edges[i] / Z);
    const cardArt = Math.floor(edges[i + 1] / Z) - x0;
    const open = archOpening(cardArt, i === 0, i + 2 === edges.length);
    for (let y = ARCH_BAND_ART; y < rows; y++) {
      const span = nicheSpan(open, y);
      if (!span) continue;
      for (let x = span[0]; x < span[1]; x++) {
        // (Below the curve only the pixels near the two sides can be near the edge: skip the middle.)
        if (y > ARCH_BAND_ART + ARCH_RISE_ART + last && x > span[0] + last && x < span[1] - last - 1) { x = span[1] - last - 2; continue; }
        const { depth, lit } = passageDepth(open, x, y, last + 1);
        if (depth < 0 || depth > last) continue;
        const k = PASSAGE_RIBS_ART.findIndex(rib => depth <= rib);
        const amount = (depth === PASSAGE_RIBS_ART[k] ? PASSAGE_RIB[k] : PASSAGE_WALL[k]) * (lit ? 1.3 : 0.85);
        px(x0 + x, y, mix(GROUND, stone, amount));
      }
    }
  }
}

// ---- the list rooms: a setting for every entry ---------------------------------------------
// ITEMS, STATUS EFFECTS and DUNGEON TILES were plain lists on the dark (the
// user liked: "items on a stone shelf, status effects on a tablet, tiles as
// slabs set into the wall"). Each entry's ICON gets a small piece of the
// building to be on, and the piece GROWS OUT OF THE SIDE WALL beside it, so
// nothing hangs in the air (the lesson of the brick back wall, above):
//   shelf   a stone ledge under the item, on a corbel, out of the wall;
//   tablet  a stone tablet behind the rune, hung by two links from an iron
//           bar that is let into the wall;
//   frame   the tile is in a wooden frame with iron corners, held off the
//           wall on two iron pins: a PICTURE of the tile, which holds for
//           any tile (the user: "special tiles could be a portal or lava,
//           so maybe a frame makes the most sense").
//   TRIED AND REJECTED for the tile, not to be repeated: a ring of bricks
//   round it ("the brick around the tile doesnt really make sense"); a
//   ledge of floor out of the wall with the tile laid in it ("thinking of
//   a part of the floor floating is not normal, but at least the 'sign' we
//   used for the status effects is a believable abstraction"); and the
//   tile hoisted in a chain sling from a crane arm (built beside the frame
//   to compare: it only makes sense for a slab of stone). THE USER'S TEST
//   FOR A SETTING: a believable abstraction, a way such a thing is really
//   shown or held; not a fragment of the building hanging in the air.
// Where an entry is not beside the wall (the second column on a wide
// screen) the piece stands alone: `gap` is null.

export type SettingKind = 'shelf' | 'tablet' | 'frame';

/** The frame's wood: dim, as everything is down here (the torches' handles are this wood in the light). */
const WOOD = { lit: '#5c4027', mid: '#47311d', dark: '#2e1f12' };

/** The top of a shelf: the one stone here that light falls straight onto. */
const SHELF_TOP = '#3a3738';
/** The setting's own iron (the tablet's bar and links). */
const IRON = { lit: '#3f3c3e', dark: '#262425' };

/**
 * The box a setting is drawn in, in art px from the icon's top left corner.
 * `iw` x `ih`: the icon; `gap`: how far to its left the side wall's face
 * is (art px), or null when it is not beside the wall.
 */
export function settingBox(kind: SettingKind, iw: number, ih: number, gap: number | null): { x: number; y: number; w: number; h: number } {
  const left = (out: number) => (gap === null ? out : Math.max(out, gap));
  if (kind === 'shelf') { const l = left(3); return { x: -l, y: ih, w: l + iw + 3, h: 8 }; }
  if (kind === 'tablet') { const l = left(2); return { x: -l, y: -5, w: l + iw + 2, h: ih + 7 }; }
  const l = left(2);
  return { x: -l, y: -2, w: l + iw + 2, h: ih + 4 };
}

/**
 * Draw an entry's setting into a canvas the size of its box (settingBox),
 * for an icon `iw` x `ih` art px.
 */
export function drawSetting(ctx: CanvasRenderingContext2D, kind: SettingKind, iw: number, ih: number, gap: number | null): void {
  const s = OLD;
  const box = settingBox(kind, iw, ih, gap);
  // Art px in the ICON's own coordinates (0,0 = its top left corner).
  const a = (ax: number, ay: number, aw: number, ah: number, color: string) => {
    if (aw <= 0 || ah <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect((ax - box.x) * Z, (ay - box.y) * Z, aw * Z, ah * Z);
  };
  const atWall = gap !== null;
  const x0 = box.x;
  const x1 = box.x + box.w;

  if (kind === 'shelf') {
    // The ledge, three art px thick: a top that catches the light (it is
    // the brightest stone in the room: it must read under a small icon),
    // its face, and a shaded lip; its free end is cut square and lit.
    a(x0, ih, box.w, 1, SHELF_TOP);
    a(x0, ih + 1, box.w, 1, s.faces[2]);
    a(x0, ih + 2, box.w, 1, s.dark);
    a(x1 - 1, ih, 1, 2, s.lit);
    // The corbel under it: courses stepping back, against the wall or under the middle.
    const steps = [7, 7, 5, 3, 2];
    steps.forEach((w, k) => {
      const cx = atWall ? x0 : Math.round(iw / 2 - w / 2);
      const y = ih + 3 + k;
      a(cx, y, w, 1, k === 0 ? s.faces[1] : s.faces[k % 3]);
      a(cx + w - 1, y, 1, 1, s.dark);
      if (!atWall) a(cx, y, 1, 1, s.dark);
    });
    return;
  }

  if (kind === 'tablet') {
    // The tablet: two art px of stone round the rune, its top corners knocked off.
    const tx = -2;
    const ty = -2;
    const tw = iw + 4;
    const th = ih + 4;
    a(tx, ty, tw, th, s.faces[1]);
    a(tx, ty, tw, 1, s.lit);
    a(tx, ty + 1, 1, th - 1, s.edgeLit);
    a(tx + tw - 1, ty + 1, 1, th - 1, s.dark);
    a(tx, ty + th - 1, tw, 1, s.dark);
    a(tx + 1, ty + 1, tw - 2, th - 2, s.faces[0]); // the sunk field the rune sits in
    a(tx + 1, ty + 1, tw - 2, 1, s.dark);
    a(tx + 1, ty + 2, 1, th - 3, s.dark);
    // The iron: a bar out of the wall (or a nail, standing alone), and two links down to the tablet.
    if (atWall) {
      a(x0, -5, box.w - 1, 1, IRON.lit);
      a(x0, -4, 1, 1, IRON.dark); // the plate it is let in at
    } else {
      a(tx + 1, -5, tw - 2, 1, IRON.lit);
    }
    a(tx + 2, -4, 1, 2, IRON.dark);
    a(tx + tw - 3, -4, 1, 2, IRON.dark);
    return;
  }

  // The frame: two art px of wood round the tile, iron at its corners,
  // held off the wall on two iron pins (alone: just the frame).
  a(-2, -2, iw + 4, ih + 4, WOOD.mid);
  a(-2, -2, iw + 4, 1, WOOD.lit);
  a(-2, -1, 1, ih + 3, WOOD.lit);
  a(iw + 1, -1, 1, ih + 3, WOOD.dark);
  a(-2, ih + 1, iw + 4, 1, WOOD.dark);
  a(-1, -1, iw + 2, ih + 2, s.mortar); // the rebate the tile sits in
  for (const [px, py] of [[-2, -2], [iw, -2], [-2, ih], [iw, ih]]) {
    a(px, py, 2, 2, IRON.dark);
    a(px, py, 1, 1, IRON.lit);
  }
  if (atWall) {
    for (const py of [1, ih - 2]) {
      a(x0, py, -2 - x0, 1, IRON.lit);
      a(x0, py - 1, 1, 3, IRON.dark);
    }
  }
}

// ---- the piers --------------------------------------------------------------------------

export interface FacingBlock { y: number; h: number; tone: number; fallen: boolean }

/**
 * The dressed blocks that face a pier towards the room, top to bottom, one
 * art px of mortar between them: 5 to 8 art px tall. From `oldFrom` down
 * (art px; the mouth of the dungeon) about one in six has fallen out.
 */
export function facingBlocks(heightArt: number, oldFrom: number, side: 'left' | 'right'): FacingBlock[] {
  const salt = side === 'left' ? 0 : 1000;
  const blocks: FacingBlock[] = [];
  let y = 0;
  for (let i = 0; y < heightArt; i++) {
    const h = 5 + Math.floor(hash(salt + i * 5 + 1) * 4);
    blocks.push({ y, h, tone: Math.floor(hash(salt + i * 7 + 2) * 3) % 3, fallen: y >= oldFrom && hash(salt + i * 13 + 4) < 0.17 });
    y += h + 1;
  }
  return blocks;
}

/**
 * Draw one pier into a canvas PIER_W wide and `h` CSS px tall. `oldFromY`
 * (CSS px from the pier's top) is where the older stone begins.
 *
 * A thick wall cut through: a face of dressed blocks towards the room, a
 * fill of rubble behind it, and a line where the cut meets the room. The
 * light is from the top left, as everywhere: the right pier's face is lit,
 * the left pier's is in shade.
 */
export function drawPier(ctx: CanvasRenderingContext2D, side: 'left' | 'right', h: number, oldFromY: number): void {
  const heightArt = Math.ceil(h / Z);
  const oldFrom = Math.floor(oldFromY / Z);
  // Art x counted from the OUTER edge inwards, so both piers share one routine.
  const a = (fromOuter: number, ay: number, aw: number, ah: number, color: string) => {
    const ax = side === 'left' ? fromOuter : PIER_ART - fromOuter - aw;
    ctx.fillStyle = color;
    ctx.fillRect(ax * Z, ay * Z, aw * Z, ah * Z);
  };
  const stoneAt = (y: number) => (y >= oldFrom ? OLD : KEPT);
  const salt = side === 'left' ? 0 : 500;
  const CORE_W = PIER_ART - 5; // outer line, rubble, then 1 mortar + 3 facing + 1 cut line

  // The rubble fill: rows three art px tall of small stones.
  for (let row = 0, y = 0; y < heightArt; row++, y += 3) {
    const s = stoneAt(y);
    a(0, y, CORE_W + 1, 3, s.mortar);
    let x = 1 - Math.floor(hash(salt + row * 3) * 3);
    for (let i = 0; x < CORE_W; i++) {
      const w = 2 + Math.floor(hash(salt + row * 31 + i * 7) * 3);
      const from = Math.max(1, x);
      const to = Math.min(CORE_W, x + w);
      if (to > from) a(from, y, to - from, 2, pick(s.core, salt + row * 17 + i));
      x += w + 1;
    }
    a(0, y, 1, 3, s.dark); // the outer edge of the cut (off-screen on a phone)
  }

  // The facing blocks, and the line of the cut beside the room.
  for (const b of facingBlocks(heightArt, oldFrom, side)) {
    const s = stoneAt(b.y);
    const x = CORE_W + 1;
    a(CORE_W, b.y, 4, b.h + 1, s.mortar);
    if (b.fallen) {
      // Fallen out: the rubble behind shows, and the cut line breaks.
      a(x, b.y, 2, Math.max(1, b.h - 1), pick(s.core, salt + b.y));
      a(PIER_ART - 1, b.y, 1, b.h + 1, s.mortar);
      continue;
    }
    a(x, b.y, 3, b.h, s.faces[b.tone]);
    a(x, b.y, 3, 1, s.lit);
    a(x, b.y + b.h - 1, 3, 1, s.dark);
    a(PIER_ART - 1, b.y, 1, b.h, side === 'right' ? s.cut : s.edgeLit);
  }

  // (No fade at the foot: the wall stands on the foundation, drawn over its last stretch.)
}

// ---- the foundation ---------------------------------------------------------------------
// User, 2026-11-21: "Im also interested in the foundation", then "Lets do
// the foundation first". The page used to just stop; now the building does
// what a cutaway building does at the bottom: it stands on a FOOTING, two
// courses of big rough stone, the lower one wider than the wall above it
// (that step is what says "footing"; on a phone it runs off the screen),
// set in BEDROCK, loose stones that thin out and darken into the page.

/** The footing steps out this far past the side walls, each side (art px). */
export const FOUND_STEP_ART = 8;
/** Its two courses, and the bedrock under them (art px tall). */
export const FOOTING_UPPER_ART = 10;
export const FOOTING_LOWER_ART = 8;
export const BEDROCK_ART = 14;
export const FOUND_STEP = FOUND_STEP_ART * Z;
/** The foundation's height (CSS px). */
export const FOUND_H = (FOOTING_UPPER_ART + FOOTING_LOWER_ART + BEDROCK_ART) * Z;
/**
 * How far above the wall's foot the side walls stop (CSS px): at the foot of
 * the footing's upper course, behind its stone. Below that the bedrock is
 * loose stones with the page showing between them, and a side wall running
 * on behind them showed through (seen in the first film).
 */
export const PIER_STOP = (FOOTING_LOWER_ART + BEDROCK_ART) * Z;

export interface Rock { x: number; y: number; w: number; h: number; tone: number; band: number }

/**
 * The loose stones under the footing, for a bed `widthArt` wide: four bands
 * going down, each with fewer and smaller stones than the one above (band 0
 * is the highest). The same bed every time.
 */
export function bedrock(widthArt: number): Rock[] {
  const rocks: Rock[] = [];
  const bands = 4;
  for (let band = 0; band < bands; band++) {
    const y = Math.floor((band * BEDROCK_ART) / bands);
    let x = Math.floor(hash(900 + band * 41) * 5);
    for (let i = 0; x < widthArt; i++) {
      const seed = 1000 + band * 97 + i * 13;
      const w = 3 + Math.floor(hash(seed) * (6 - band));
      const h = band < 2 ? 2 + Math.floor(hash(seed + 1) * 2) : 2;
      if (x + w <= widthArt) rocks.push({ x, y: y + Math.floor(hash(seed + 2) * 2), w, h, tone: Math.floor(hash(seed + 3) * 3) % 3, band });
      // Further apart the deeper they lie.
      x += w + 2 + Math.floor(hash(seed + 4) * (4 + band * 5));
    }
  }
  return rocks;
}

/**
 * Draw the foundation into a canvas `w` CSS px wide and FOUND_H tall. The
 * upper course stands under the wall (FOUND_STEP in from each end); the
 * lower one and the bedrock take the whole width.
 */
export function drawFoundation(ctx: CanvasRenderingContext2D, w: number): void {
  const s = OLD;
  const a = (ax: number, ay: number, aw: number, ah: number, color: string) => {
    if (aw <= 0 || ah <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(ax * Z, ay * Z, aw * Z, ah * Z);
  };
  const widthArt = Math.ceil(w / Z);
  const course = (x0: number, y0: number, width: number, height: number, about: number, salt: number) => {
    a(x0, y0, width, height, s.mortar);
    for (const b of courseBlocks(width, about, salt)) {
      const x = x0 + b.x;
      const top = y0 + 1;
      const h = height - 2;
      a(x, top, b.w, h, s.faces[b.tone]);
      a(x, top, b.w, 1, s.lit);
      a(x, top + 1, 1, h - 1, s.edgeLit);
      a(x + b.w - 1, top + 1, 1, h - 1, s.dark);
      a(x, top + h - 2, b.w, 2, s.dark);
      // Rough stone: a corner knocked off about every other block.
      const chip = hash(salt + b.x * 7 + 5);
      if (chip > 0.5 && b.w > 8) {
        const right = chip > 0.75;
        a(right ? x + b.w - 2 : x, top, 2, 1, s.mortar);
        a(right ? x + b.w - 1 : x, top + 1, 1, 1, s.mortar);
      }
    }
  };
  course(FOUND_STEP_ART, 0, widthArt - 2 * FOUND_STEP_ART, FOOTING_UPPER_ART, 44, 300);
  course(0, FOOTING_UPPER_ART, widthArt, FOOTING_LOWER_ART, 30, 600);
  // The bedrock: loose stones, fainter band by band.
  const y0 = FOOTING_UPPER_ART + FOOTING_LOWER_ART;
  const ALPHA = [0.85, 0.6, 0.38, 0.2];
  for (const r of bedrock(widthArt)) {
    ctx.globalAlpha = ALPHA[r.band];
    a(r.x, y0 + r.y, r.w, r.h, s.core[r.tone]);
    a(r.x, y0 + r.y, r.w, 1, s.faces[r.tone]);
  }
  ctx.globalAlpha = 1;
}
