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
 * is its (?) mark (a 16px glyph ending 8px before the letters), so 30 puts
 * the torch 6px from the mark, as 6 puts it 6px from the last letter.
 */
export const WALL_TORCH_GAP = { left: 30, right: 6 };
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
 * The blocks of a slab `widthArt` wide, left to right, one art px of mortar
 * between them: about 34 art px each, no two quite the same, and together
 * exactly as wide as the slab.
 */
export function slabBlocks(widthArt: number): SlabBlock[] {
  const width = Math.max(1, Math.floor(widthArt));
  const n = Math.max(1, Math.round(width / 34));
  const raw = Array.from({ length: n }, (_, i) => 1 + (hash(i * 3) - 0.5) * 0.5);
  const total = raw.reduce((a, b) => a + b, 0);
  const stone = width - (n - 1); // what is left after the seams
  const blocks: SlabBlock[] = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    // The last block takes whatever is left, so the course ends flush.
    const w = i === n - 1 ? width - x : Math.max(4, Math.round((raw[i] / total) * stone));
    blocks.push({ x, w, tone: Math.floor(hash(i * 11 + 3) * 3) % 3 });
    x += w + 1;
  }
  return blocks;
}

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
  // The stone across the top, with the rim of the cutouts along its foot.
  a(0, 0, widthArt, ARCH_BAND_ART, stone);
  for (let i = 0; i + 1 < edges.length; i++) {
    // The cutout runs between the two columns' shafts (each 2 art px wide on its boundary).
    const left = Math.round(edges[i] / Z) + (i === 0 ? 0 : 1);
    const right = Math.round(edges[i + 1] / Z) - (i + 2 === edges.length ? 0 : 1);
    const rx = Math.min(ARCH_MAX_RX_ART, Math.floor((right - left) / 2));
    let above = rx; // the row above's reach: the rim covers the step between two rows
    for (let y = 0; y < ARCH_RISE_ART; y++) {
      const inset = archInset(y, rx);
      const row = ARCH_BAND_ART + y;
      // The two shoulders' stone.
      a(left, row, inset, 1, stone);
      a(right - inset, row, inset, 1, stone);
      // Their rims: every stone pixel that faces the opening, sideways or down.
      const step = Math.max(1, above - inset);
      a(left + inset - 1, row, 1, 1, rim);
      a(right - inset, row, 1, 1, rim);
      if (y > 0) {
        a(left + inset, row - 1, step, 1, rim);
        a(right - inset - step, row - 1, step, 1, rim);
      }
      above = inset;
    }
    // Across the flat of the arch, the band's own underside.
    a(left + rx, ARCH_BAND_ART - 1, right - left - 2 * rx, 1, rim);
  }
  // The stone over each column, between two cutouts: the full height, down to the capital.
  for (let i = 1; i + 1 < edges.length; i++) {
    const x = Math.round(edges[i] / Z);
    a(x - 1, 0, 1, ARCH_BAND_ART + ARCH_RISE_ART, s.edgeLit);
    a(x, 0, 1, ARCH_BAND_ART + ARCH_RISE_ART, s.dark);
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

  // The wall goes on down into the dark: the last stretch dims in steps.
  const FADE = [0.3, 0.55, 0.8];
  const step = 5;
  FADE.forEach((alpha, i) => {
    const y = heightArt - (FADE.length - i) * step;
    if (y < 0) return;
    ctx.fillStyle = `rgba(21, 16, 10, ${alpha})`; // the page's own ground
    ctx.fillRect(0, y * Z, PIER_W, step * Z + Z);
  });
}
