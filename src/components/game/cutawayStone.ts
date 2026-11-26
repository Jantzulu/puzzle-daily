// ============================================================================
// THE CUTAWAY WALL — the Play page's layout under the board
// (begun 2026-11-21 as an experiment behind `?wall=1`; THE STANDARD since
// 2026-11-25, when the user: "lets make this the new standard, deleting the
// old layout". The switch is gone. The old layout survives in one place:
// Training Grounds mounts the hero panel without `wall`, and gets its own
// pass.)
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
//   the SLAB  the stone behind a storey's title: the floor between two
//             rooms, cut through (paving, the blocks that carry it, a
//             course the arcade hangs from), with the title of the room
//             below on it; the heroes' is the top of the wall above
//             ground, dressed blocks under a string course (drawSlab). EVERY title has the same one (user
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
/**
 * The heroes' beam, left of the title: how far short of the title group
 * (its (?) mark included) the quest scroll's slot stops (CSS px), now that
 * the torch stands there: the torch's 10px from the mark and the 22 of its
 * 32px box that its flame and handle are within, and 2 to spare.
 */
export const WALL_SPOT_CLEAR = 34;
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
 * A TRIAL (user, 2026-11-24: "lets try inverting the position of the names
 * and sprites like you said, just to see"): in the wall a hero's or enemy's
 * card is turned over, the name and the stat line on top and the SPRITE
 * LAST, standing on the room's floor (the beam below, or the narrow floor
 * over an open drawer: both are 4px above the strip's foot).
 * In every cross-section looked at, a figure stands on a floor; with the
 * sprite at the top of its card it hung in the air. Tailwind classes for
 * the card and for its sprite block. index.css moves the compass's tap
 * target down with the sprite (.wall-on .hero-aim).
 */
// KEPT (user, from their phone, 2026-11-24: "I think the sprites below the
// names are better than above"), with two corrections of theirs: "the feet
// of the entities can be obscured by the plate of the panel below" and "the
// sprites can come too close to the text above them ... at least one pixel
// of space above the 'ground' and a little extra space between the max
// height and the hp are needed". So the sprite stands ONE ART PX above the
// floor (pb-1.5 = the floor's 4px + 2px: a title plate below stands 2px
// proud of its beam at most, so the feet are clear of it too), and has 4px
// of its own over its head (pt-1).
// HEIGHT (user, the same hour: "we dont want to add too much height"):
// those 6px are paid for with 4 from the name box, 38px otherwise and 34
// here (a name and an epithet take 30), so a row of cards is 2px taller
// than before the card was turned over.
// (mt-auto: a card stretched by a taller neighbour still has its sprite at its foot.)
// THE ENEMIES' COUNT stays at the TOP of its card (user: "the enemy counter
// looks best when above, would it always cut off?"): in the card's top
// right corner, but 6px ABOVE the card's top, on the shoulder of its arch
// (first 8px up and 2px in; the user: "can the counter come down and to the
// left slightly? (closer to the end of the name and slightly lower)": now
// 6px up and 6px in, which a no-epithet name still clears at any length),
// so it is over the line the names are written on (at the card's own top
// it lay over the end of any name of seven letters or more on a four-card
// strip). A long name WITH an epithet sits 6px higher in its box and can
// still reach under the count's corner on a crowded strip: the price of
// the lower seat, told to the user. `count` places it
// against the CARD, so the enemies' sprite block must not be `relative`.
export const WALL_CARD = { card: 'pb-1.5', sprite: 'order-last mt-auto pt-1', name: 'h-[34px]', count: '-top-1.5 right-1.5 z-[1]' } as const;
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

/** The stone of the Dungeon Details lintel the wall replaced (its mesh is gone; this is its palette). */
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

// ---- THE USER'S HAND: everything is outlined in black -------------------------------------
// User, 2026-11-24: "I have personally used a different artstyle (look at
// the portcullis as an example) where elements are outlined in black, can
// you study that style and try to apply it to the new art we have made for
// all of these panels?" Their painted kits (src/assets/panels: the
// portcullis bars, the nav beam, the rail and its spikes, the plaques, the
// quest box, the tap hint), read pixel by pixel, all do the same things:
//   1. ONE ART PX OF PURE BLACK round every element's silhouette, and the
//      pixel at each outer corner left out (a clipped corner). In their
//      words, on seeing a filled one: "I do not tend to outline full
//      corners, meaning I would remove the extra black pixel in the 4
//      diagonal corners". So where the line turns, its two runs meet only
//      at a DIAGONAL: no pixel of a silhouette has open space on two
//      sides that meet (cutCorners, below, for shapes worked out in code).
//   2. Inside the line, FLAT BANDS in two or three close tones, darker
//      towards the line (the beam: #101010, #171717, then its #262626 face);
//      an upright bar has its light stripe on the left. No texture.
//   3. A piece on a piece keeps its own line; a framed piece is black, one
//      line of its accent, then its fill (the tap hint, the QUEST plate).
//   4. Rivets and joints are black too.
// So in this file: every joint between stones is INK, every piece that has
// a silhouette (beams, plates, merlons, towers, columns, floors, shelves,
// tablets, frames, the footing) has the black line and cut corners, the
// plates are black, a line of their room's colour, then their face. What
// is BEHIND things is left as it was (the hero hall's far wall, the
// passages, the earth): the line is for elements, not for the dark.
const INK = '#000000';

/**
 * A silhouette with its outer corners cut, the user's way: `has` says
 * which art pixels a shape fills; the answer leaves out every pixel of it
 * that has open space on two sides that meet (above and left, above and
 * right, below and left, below and right).
 */
export function cutCorners(has: (x: number, y: number) => boolean): (x: number, y: number) => boolean {
  return (x, y) => {
    if (!has(x, y)) return false;
    const up = has(x, y - 1);
    const down = has(x, y + 1);
    const left = has(x - 1, y);
    const right = has(x + 1, y);
    return !((!up || !down) && (!left || !right) && !(up && down) && !(left && right) && ((!up && !left) || (!up && !right) || (!down && !left) || (!down && !right)));
  };
}

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

/**
 * A beam's courses, top to bottom, in art rows (each list adds up to
 * SLAB_ART with a row of mortar under every course). A beam was ONE course
 * of big bevelled blocks, which read as a row of buttons more than as
 * masonry (user, 2026-11-24: "we can maybe improve the look of the
 * horizontal beams for Heroes, and also the ones that are enemies +
 * below"). Now it is what it would be in the building:
 *   UNDER GROUND (enemies and below) a FLOOR cut through: thin paving the
 *     room above stands on, the big blocks that carry it, and a thin course
 *     the arcade hangs from. In the older stone a flag here and there has
 *     sunk.
 *   ABOVE GROUND (the heroes') the top of a castle WALL seen from outside,
 *     as its towers are: a string course under the merlons, then two
 *     courses of small dressed blocks in running bond.
 */
// (In the user's hand: a row of INK over every course and under the last,
// and one art px of it between two stones.)
const FLOOR_BEAM_ART = { paving: 2, main: 9, soffit: 3 };
const WALL_BEAM_ART = { string: 2, upper: 6, lower: 6 };
/** About how long the stones of each course are (art px). */
const BEAM_STONE_ART = { paving: 12, soffit: 21, string: 26, ashlar: 15 };

/**
 * Draw the slab into a canvas `w` CSS px wide (its height is SLAB_H).
 * `old`: the colder stone from under the lintel. `above`: the heroes'
 * beam, the top of the wall above ground.
 */
export function drawSlab(ctx: CanvasRenderingContext2D, w: number, old = false, above = false): void {
  const a = (ax: number, ay: number, aw: number, ah: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(ax * Z, ay * Z, aw * Z, ah * Z);
  };
  const widthArt = Math.ceil(w / Z);
  const s = old ? OLD : KEPT;
  a(0, 0, widthArt, SLAB_ART, INK); // every joint, and the beam's own line top and bottom

  if (above) {
    // The string course: long stones, their top the brightest line on the wall.
    for (const b of courseBlocks(widthArt, BEAM_STONE_ART.string, 300)) {
      a(b.x, 1, b.w, WALL_BEAM_ART.string, s.faces[2]);
      a(b.x, 1, b.w, 1, s.cut);
    }
    // Two courses in running bond: the same joints, the lower course half a block along.
    const half = Math.floor(BEAM_STONE_ART.ashlar / 2);
    const upperY = 1 + WALL_BEAM_ART.string + 1;
    const courses = [
      { y: upperY, h: WALL_BEAM_ART.upper, shift: 0 },
      { y: upperY + WALL_BEAM_ART.upper + 1, h: WALL_BEAM_ART.lower, shift: half },
    ];
    for (const c of courses) {
      for (const b of courseBlocks(widthArt + 2 * half, BEAM_STONE_ART.ashlar, 340)) {
        const from = Math.max(0, b.x - c.shift);
        const to = Math.min(widthArt, b.x + b.w - c.shift);
        if (to <= from) continue;
        a(from, c.y, to - from, c.h, pick(s.faces, 340 + b.x * 3 + c.y));
        a(from, c.y, to - from, 1, s.lit);
        a(from, c.y + c.h - 1, to - from, 1, s.dark);
      }
    }
    return;
  }

  // The paving the room above stands on.
  for (const b of courseBlocks(widthArt, BEAM_STONE_ART.paving, 400)) {
    const sunk = old && hash(b.x * 7 + 5) < 0.15 ? 1 : 0;
    a(b.x, 1 + sunk, b.w, FLOOR_BEAM_ART.paving - sunk, s.faces[b.tone]);
    a(b.x, 1 + sunk, b.w, 1, sunk ? s.edgeLit : s.lit);
  }
  // The blocks that carry it (the torch and the title are on these).
  const mainY = 1 + FLOOR_BEAM_ART.paving + 1;
  for (const b of slabBlocks(widthArt)) {
    a(b.x, mainY, b.w, FLOOR_BEAM_ART.main, s.faces[b.tone]);
    a(b.x, mainY, b.w, 1, s.edgeLit);
    a(b.x + b.w - 1, mainY + 1, 1, FLOOR_BEAM_ART.main - 1, s.dark);
    a(b.x, mainY + FLOOR_BEAM_ART.main - 1, b.w, 1, s.dark);
  }
  // The course the arcade hangs from.
  const soffitY = mainY + FLOOR_BEAM_ART.main + 1;
  for (const b of courseBlocks(widthArt, BEAM_STONE_ART.soffit, 500)) {
    a(b.x, soffitY, b.w, FLOOR_BEAM_ART.soffit, s.faces[(b.tone + 1) % 3]);
    a(b.x, soffitY + FLOOR_BEAM_ART.soffit - 1, b.w, 1, s.dark);
  }
}

// ---- the cellar's earth -------------------------------------------------------------------
// User, 2026-11-24: an open info box "is like looking into a cellar. Maybe
// we can add a subtle dirt texture to the back of the selection for both
// heroes and enemies". So the back of an open drawer is EARTH: the side
// walls' own soil (drawPier), a great deal quieter, because the drawer's
// text is written on it: clods in three low tones and bare ground, a small
// stone in about one clod in eight. BARELY THERE (the user, watching the
// first two strengths: "a bit harsh still, should be barely visible I
// think"): the tones are now under half of the second try's. One tile, drawn once and repeated (the
// page sets it as a CSS image: CutawayWall CutawayPiers, index.css
// .wall-cellar).

/** The earth tile's size (art px). */
export const DIRT_TILE_ART = { w: 128, h: 72 } as const;
/** A clod is one of three low tones over the ground, or the bare ground (tone 3). Rows of clods are this tall (art px). */
const DIRT_ROW_ART = 3;
const DIRT = {
  soil: ['rgba(96, 64, 34, 0.03)', 'rgba(96, 64, 34, 0.06)', 'rgba(0, 0, 0, 0.07)'],
  stone: 'rgba(196, 184, 166, 0.03)',
  under: 'rgba(0, 0, 0, 0.1)',
};

export interface Clod { x: number; y: number; w: number; tone: number; stoneAt: number | null }

/** The clods of the earth tile, row by row: every row is filled from edge to edge, so the tile repeats without a seam of its own. */
export function dirtClods(): Clod[] {
  const clods: Clod[] = [];
  for (let row = 0; row * DIRT_ROW_ART < DIRT_TILE_ART.h; row++) {
    let x = 0;
    for (let i = 0; x < DIRT_TILE_ART.w; i++) {
      const w = Math.min(DIRT_TILE_ART.w - x, 5 + Math.floor(hash(row * 41 + i * 7 + 900) * 8));
      const stone = w >= 6 && hash(row * 29 + i * 11 + 902) < 0.13;
      clods.push({
        x, y: row * DIRT_ROW_ART, w,
        tone: Math.floor(hash(row * 17 + i * 13 + 901) * 4) % 4,
        stoneAt: stone ? x + 1 + Math.floor(hash(row * 23 + i * 19 + 903) * (w - 4)) : null,
      });
      x += w;
    }
  }
  return clods;
}

/** Draw the earth tile into a canvas of DIRT_TILE_ART, ONE canvas px to the art px (the page scales it up, unsmoothed). */
export function drawDirt(ctx: CanvasRenderingContext2D): void {
  for (const c of dirtClods()) {
    if (c.tone < 3) {
      ctx.fillStyle = DIRT.soil[c.tone];
      ctx.fillRect(c.x, c.y, c.w, DIRT_ROW_ART);
    }
    if (c.stoneAt !== null) {
      ctx.fillStyle = DIRT.stone;
      ctx.fillRect(c.stoneAt, c.y, 3, 2);
      ctx.fillStyle = DIRT.under;
      ctx.fillRect(c.stoneAt, c.y + 2, 3, 1);
    }
  }
}

// ---- the title plates -------------------------------------------------------------------
// User, 2026-11-21: "a more fancy crest/plate the titles would sit on top
// of. they would break up the straight edge of the beams and could be
// customized to each asset type". So behind every title there is a PLATE
// let into the beam (the QUEST plate over the board is the model): a dark
// plate in the room's own colour, as wide as the title and a blunt point
// past it each side, that stands PROUD of the beam, an art px above its
// top and one below its foot at most, and how it does is the room's. Each
// edge is ONE calm shape the length of the title:
//   heroes, enemies, allies   HORNS: high at the two ends, low across
//            the middle. The three ENTITY rooms share the one edge and
//            differ by colour (user, 2026-11-24: "I very much prefer the
//            'Enemies' plate VS the Heroes plate ... I dont think it would
//            be a problem if the entities (heroes/enemies/allies) share
//            plate shapes (the colors will still be different)"). The
//            heroes' had been a raised tab, a flat banner with forked ends
//            ("the flat top and bottom read as boring against the beams")
//            and a crown of three arcs. NO FLAT EDGES on any plate.
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

/** How far a plate stands out past the beam at most, top and bottom (art px), and how long its pointed ends are. */
export const PLATE_RISE_ART = 1;
/**
 * The levels a plate's edge has besides its lowest: at level 0 it is one
 * art px INSIDE the beam's edge, at 1 flush with it, at 2 one proud of it.
 * (It first stood 0 to 2 proud, 44px in all; the user: "they are a bit too
 * tall". Now 40px at its tallest, and the low parts of an edge are cut into
 * the beam instead of all of it standing out.)
 */
export const PLATE_LEVELS = 2;
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
 * The level of the plate's edge at column `x` of its body (the part
 * between its two pointed ends, `bodyW` art px wide): 0 to PLATE_LEVELS,
 * the same at the top and at the foot, and the same on both sides of the
 * middle.
 */
export function plateRise(kind: PlateKind, x: number, bodyW: number): number {
  const c = Math.floor(Math.abs(x - (bodyW - 1) / 2)); // columns from the middle
  const fromEnd = Math.min(x, bodyW - 1 - x);
  switch (kind) {
    case 'heroes':
    case 'allies':
    case 'enemies':
      return c < bodyW / 6 ? 0 : c < bodyW / 3 ? 1 : 2; // horns: low across the middle third, stepping up to the ends
    case 'items':
      return fromEnd < 4 ? 0 : c < bodyW / 6 ? 2 : 1; // three steps up to the middle
    case 'status':
      return Math.round(PLATE_LEVELS * Math.sin((Math.PI * (x + 0.5)) / bodyW)); // a low arch
    case 'tiles':
      return c === 0 ? 0 : Math.min(PLATE_LEVELS, fromEnd + 1); // two slabs: one joint, on the middle
  }
}

/**
 * THE ENTITY ROOMS' PLATES STAY INSIDE THEIR BEAM (heroes, enemies, allies):
 * a strip of cards hangs right under such a beam and another stands right
 * on it, so a plate standing proud lay over what is at the cards' edges:
 * the enemies' counts at the top of their cards, the feet of the heroes
 * above (user, 2026-11-24: "can we reduce the height of entity plates so
 * they dont overlap these elements?"). Their edge is the same shape, one
 * art px further in: its highest level is flush with the beam's edge. The
 * list rooms' plates, with nothing against their beams, still stand one
 * proud.
 */
export const plateProud = (kind: PlateKind): number => (kind === 'items' || kind === 'status' || kind === 'tiles' ? PLATE_RISE_ART : 0);

/** The first and last art row of the plate at column `x` (0 = its top row, PLATE_RISE_ART above the beam's). */
export function plateColumn(kind: PlateKind, x: number, widthArt: number): { top: number; bottom: number } {
  const last = SLAB_ART + 2 * PLATE_RISE_ART - 1;
  const fromEnd = Math.min(x, widthArt - 1 - x);
  const back = fromEnd < PLATE_END_ART
    ? PLATE_RISE_ART + PLATE_TAPER[fromEnd]
    : PLATE_RISE_ART - plateProud(kind) + PLATE_LEVELS - plateRise(kind, x - PLATE_END_ART, widthArt - 2 * PLATE_END_ART);
  return { top: back, bottom: last - back };
}

/** The plate's silhouette, outer corners cut: is this art pixel (x from its left end, y from its top row) part of it? */
export function plateMask(kind: PlateKind, widthArt: number): (x: number, y: number) => boolean {
  const cols = Array.from({ length: widthArt }, (_, x) => plateColumn(kind, x, widthArt));
  return cutCorners((x, y) => {
    const c = cols[x];
    return !!c && y >= c.top && y <= c.bottom;
  });
}

/**
 * Paint a plate of any size from its silhouette, in the user's hand (their
 * tap hint, their QUEST plate): the black line round it, one line of its
 * colour inside that, then the face. (The title plates first had a rim lit
 * on the top and left and dark on the others.)
 */
function paintPlate(
  a: (ax: number, ay: number, aw: number, ah: number, color: string) => void,
  has: (x: number, y: number) => boolean,
  widthArt: number,
  heightArt: number,
  s: { face: string; lit: string },
): void {
  const onRim = (x: number, y: number): boolean => has(x, y) && (!has(x - 1, y) || !has(x + 1, y) || !has(x, y - 1) || !has(x, y + 1));
  for (let x = 0; x < widthArt; x++) {
    for (let y = 0; y < heightArt; y++) {
      if (!has(x, y)) continue;
      const trim = onRim(x - 1, y) || onRim(x + 1, y) || onRim(x, y - 1) || onRim(x, y + 1);
      a(x, y, 1, 1, onRim(x, y) ? INK : trim ? s.lit : s.face);
    }
  }
}

// ---- name plates: the title's plate itself, less tall --------------------------------------
// User, 2026-11-25, of the small named boxes in the list rooms ("Dropped
// by: [Giant Bat]", "Applied by: [Shielder]"): "the boxes for 'Dropped by:'
// are outdated, any chance we could reuse the plates used for the titles
// for the respective entities?" FIRST TRY, NOT TO BE REPEATED: a small
// plate with a shape of its own, worked out for the box's size (a shallower
// edge, shorter points). The user: "those plates dont really look right
// ... would we be able to just force the new box to look more like the
// actual resulting plate shape? Instead of mapping a shape to the new text
// and contents". So a name is on THE TITLE'S OWN PLATE, the very drawing
// (drawPlate). A hero's name on the HEROES plate, an enemy's on
// ENEMIES, an item's on ITEMS.

// (It was drawn at half size first, one CSS px to the art px, to keep the
// rows short. The user: "The plates that we added for entities in the status
// effect and item boxes are 1x, are we able to get the same shape at 2x?"
// So it is the plate at the wall's own scale now.)

// LESS TALL, THE SAME SILHOUETTE (the user, of the 40px plate: "could the
// plate shape be modified slightly to make it less tall? Like removing some
// pixels that contribute to the height without deforming the curves or
// overall silhouette too much?"). The title plate is tall because its beam
// is. A name plate has NAME_PLATE_SQUEEZE_ART rows taken out of its MIDDLE,
// where every column of the plate is plain face, so its edge, the steps of
// it and where they fall along the length are untouched; only its pointed
// tip, four rows tall, is left as it is rather than losing all four. And
// the empty row an entity's plate leaves above and below itself on its
// beam is not carried over. So a hero's or an enemy's name plate is 28px
// tall and an item's 32 (the full plate: 40).

/** How many rows are taken out of the middle of a title's plate to make a name plate (art px). */
export const NAME_PLATE_SQUEEZE_ART = 4;
/**
 * The fewest rows a column of a name plate keeps: its tip, ALL FOUR of the
 * title's. (It kept two at first. Cutting the corners then took both, the
 * tip was gone, and the rivet stood where the line of colour runs behind
 * the tip: the user, at once: "there seem to be a gap in the red color in
 * these new shrunk plates". With four, two are left after the corners are
 * cut, and the end reads black, colour, rivet, as the title's does.)
 */
const NAME_PLATE_TIP_ART = 4;

/** The rows a name plate of this kind has (art px), and its height (CSS px). */
export const namePlateRows = (kind: PlateKind): number => SLAB_ART + 2 * plateProud(kind) - NAME_PLATE_SQUEEZE_ART;
export const namePlateH = (kind: PlateKind): number => namePlateRows(kind) * Z;

/** The first and last art row of a name plate at column `x` (0 = its own top row). */
export function namePlateColumn(kind: PlateKind, x: number, widthArt: number): { top: number; bottom: number } {
  const full = plateColumn(kind, x, widthArt);
  const rows = namePlateRows(kind);
  // The column's own height, less the rows taken from the middle; it stays centred, as it was.
  const n = Math.max(Math.min(NAME_PLATE_TIP_ART, full.bottom - full.top + 1), full.bottom - full.top + 1 - NAME_PLATE_SQUEEZE_ART);
  const top = (rows - n) / 2;
  return { top, bottom: top + n - 1 };
}

/** Draw a name plate into a canvas `widthArt` art px wide and namePlateH(kind) tall. */
export function drawNamePlate(ctx: CanvasRenderingContext2D, widthArt: number, kind: PlateKind): void {
  const a = (ax: number, ay: number, aw: number, ah: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(ax * Z, ay * Z, aw * Z, ah * Z);
  };
  const cols = Array.from({ length: widthArt }, (_, x) => namePlateColumn(kind, x, widthArt));
  const has = cutCorners((x, y) => {
    const c = cols[x];
    return !!c && y >= c.top && y <= c.bottom;
  });
  const rows = namePlateRows(kind);
  paintPlate(a, has, widthArt, rows, PLATE_COLORS[kind]);
  // A rivet in each pointed end, as the title's has.
  a(2, rows / 2 - 1, 1, 2, INK);
  a(widthArt - 3, rows / 2 - 1, 1, 2, INK);
}

/** Draw a title's plate into a canvas `widthArt` art px wide and PLATE_H tall. Lit from the top left. */
export function drawPlate(ctx: CanvasRenderingContext2D, widthArt: number, kind: PlateKind): void {
  const s = PLATE_COLORS[kind];
  const a = (ax: number, ay: number, aw: number, ah: number, color: string) => {
    if (aw <= 0 || ah <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(ax * Z, ay * Z, aw * Z, ah * Z);
  };
  paintPlate(a, plateMask(kind, widthArt), widthArt, SLAB_ART + 2 * PLATE_RISE_ART, s);
  // A rivet in each pointed end.
  const mid = PLATE_RISE_ART + SLAB_ART / 2 - 1;
  a(2, mid, 1, 2, INK);
  a(widthArt - 3, mid, 1, 2, INK);
}

/**
 * The dark over the part of a plate that stands above its beam (the top
 * PLATE_RISE_ART rows), in the room's own dark (index.css .wall-dark's
 * colour), into a canvas the plate's size. The rest of the plate is inside
 * its own room and is darkened with it.
 */
export function drawPlateDark(ctx: CanvasRenderingContext2D, widthArt: number, kind: PlateKind): void {
  ctx.fillStyle = 'rgba(6, 5, 4, 0.68)';
  const has = plateMask(kind, widthArt);
  for (let x = 0; x < widthArt; x++) {
    for (let y = 0; y < PLATE_RISE_ART; y++) if (has(x, y)) ctx.fillRect(x * Z, y * Z, Z, Z);
  }
}

// ---- the enemies' count: a small shield -----------------------------------------------------
// User, 2026-11-25: "Can we make the enemy counter boxes a little bit more
// interesting in shape?" The count of an enemy type sat in a small box with
// cut corners. It is a SHIELD now, in the ENEMIES plate's own colours and
// painted the same way (the black line, a line of colour, the face): flat
// across the top, its two top corners cut, straight sides, and a point at
// the foot that comes in by even steps, so its line turns only by diagonals.

/** The shield's height, and how many of its last rows come in to the point (art px). */
export const COUNT_SHIELD_ART = { h: 11, point: 4 } as const;
export const COUNT_SHIELD_H = COUNT_SHIELD_ART.h * Z;

/** The shield's width for a count of so many digits (art px; odd, so the point is one pixel). */
export const countShieldWidthArt = (digits: number): number => 5 + 4 * Math.max(1, digits);

/** Is this art pixel part of a shield `widthArt` wide? */
export function inCountShield(x: number, y: number, widthArt: number): boolean {
  if (x < 0 || y < 0 || x >= widthArt || y >= COUNT_SHIELD_ART.h) return false;
  if (y === 0 && (x === 0 || x === widthArt - 1)) return false; // the top corners, cut
  const k = y - (COUNT_SHIELD_ART.h - 1 - COUNT_SHIELD_ART.point); // 1 .. point down the taper
  if (k <= 0) return true;
  const inset = Math.round((k * (widthArt - 1)) / 2 / COUNT_SHIELD_ART.point);
  return x >= inset && x <= widthArt - 1 - inset;
}

/** Draw the shield into a canvas `widthArt` art px wide and COUNT_SHIELD_H tall. */
export function drawCountShield(ctx: CanvasRenderingContext2D, widthArt: number): void {
  const a = (ax: number, ay: number, aw: number, ah: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(ax * Z, ay * Z, aw * Z, ah * Z);
  };
  paintPlate(a, (x, y) => inCountShield(x, y, widthArt), widthArt, COUNT_SHIELD_ART.h, PLATE_COLORS.enemies);
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
/** How wide a niche's reveal is in the hero hall (art px): the arcade's own thickness. */
const NICHE_REVEAL_ART = 2;

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
 * Draw what is behind an arcade into a canvas `w` CSS px wide and `h`
 * tall, whose top is the arcade's top. `edges` as for drawArcade. Under
 * ground: the passages (only the pixels near a mouth's edge are painted,
 * the middle is left clear). With `hall` (the hero hall, above ground): the
 * room's back wall, with a loop cut in it behind each hero.
 */
export function drawNiches(ctx: CanvasRenderingContext2D, w: number, h: number, edges: readonly number[], old = false, hall = false): void {
  const s = old ? OLD : KEPT;
  const stone = s.faces[2];
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
      if (hall) {
        for (let x = span[0]; x < span[1]; x++) {
          const { depth, lit } = passageDepth(open, x, y, NICHE_REVEAL_ART);
          // The niche's reveal (the arcade's own thickness, its right-hand face lit); then
          // the room's back wall, and the loop cut in it.
          // (Its first pixel is the black line of the stone it is cut in: the arch's, a column's, the side wall's.)
          px(x0 + x, y, depth === 0 ? INK : depth < NICHE_REVEAL_ART
            ? (lit ? s.edgeLit : s.core[0])
            : inLoop(HERO_LOOP, open, x, y) ? LOOP_DARK
              : inLoop(HERO_LOOP, open, x - 1, y) || inLoop(HERO_LOOP, open, x, y - 1) ? LOOP_EDGE
                : backWallColor(x0 + x, y));
        }
        continue;
      }
      for (let x = span[0]; x < span[1]; x++) {
        // (Below the curve only the pixels near the two sides can be near the edge: skip the middle.)
        if (y > ARCH_BAND_ART + ARCH_RISE_ART + last && x > span[0] + last && x < span[1] - last - 1) { x = span[1] - last - 2; continue; }
        const { depth, lit } = passageDepth(open, x, y, last + 1);
        if (depth < 0 || depth > last) continue;
        // The black line of the stone the mouth is cut in.
        if (depth === 0) { px(x0 + x, y, INK); continue; }
        const k = PASSAGE_RIBS_ART.findIndex(rib => depth <= rib);
        const amount = (depth === PASSAGE_RIBS_ART[k] ? PASSAGE_RIB[k] : PASSAGE_WALL[k]) * (lit ? 1.3 : 0.85);
        px(x0 + x, y, mix(GROUND, stone, amount));
      }
    }
  }
}

// ---- the hero hall: a back wall, and a loop cut in it ----------------------------------
// The hero hall is above ground (the rampart, below), and a ROOM: behind
// each hero is its back wall of stone courses (the brick wall of (96) made
// the sprites float when they hung at the top of their cards; they stand
// on the floor now, and the user: "They can once again appear to be in a
// building, maybe even with brick now that they wont be floating").
// What is cut in that wall has been tried three ways, the first two NOT TO
// BE REPEATED: the whole arch open to a dusk sky ("as beautiful as that
// is, it doesnt really make that much sense"); a round-headed, cross-barred
// window with the sky seen through it ("the window is a bit distracting.
// Maybe having just the black window cutouts (like the cross shape on the
// castle tower) is better"). So: BLACK CUTOUTS, arrow loops as the towers
// have. A PAIR per hero, one each side, beside the name and the stat line:
// a single loop in the middle (the first try) was simply hidden behind the
// name, and the middle of a card is taken from top to foot (name, stat
// line, sprite). The wall is nearly as dark as the cutout, so each loop
// has a thin lit edge down its right side and along its foot, where the
// light from the top left catches the stone it is cut through. The shapes
// to choose from are LOOPS; HERO_LOOP is the one in use.

/** The hero hall's back wall: far back, so dim. (Darkened twice at the user's word: "the bricks could be a little darker".) */
const BACK_WALL = { mortar: '#080605', faces: ['#110e0b', '#130f0c', '#0f0c0a'], lit: '#161210' };
const BACK_COURSE_ART = 7;
const BACK_BLOCK_ART = 15;
/** The black of a cutout, and the edge of the stone it is cut through where the light catches it. */
const LOOP_DARK = '#020202';
const LOOP_EDGE = '#2a231d';

/** The back wall's colour at an art pixel (x along the whole strip: one wall behind the arcade). */
export function backWallColor(x: number, y: number): string {
  const course = Math.floor(y / BACK_COURSE_ART);
  const inCourse = y - course * BACK_COURSE_ART;
  if (inCourse === BACK_COURSE_ART - 1) return BACK_WALL.mortar; // the bed joint
  const along = x + (course % 2 ? Math.floor(BACK_BLOCK_ART / 2) : 0); // running bond
  if (along % BACK_BLOCK_ART === BACK_BLOCK_ART - 1) return BACK_WALL.mortar; // the upright joint
  if (inCourse === 0) return BACK_WALL.lit;
  return BACK_WALL.faces[Math.floor(hash(Math.floor(along / BACK_BLOCK_ART) * 13 + course * 7) * 3) % 3];
}

/**
 * MEDIEVAL CUTOUTS, as rows of art pixels (X = cut through): the openings a
 * castle wall really has, small enough for a card.
 *   slit      the plain arrow loop
 *   cross     the cross loop (crosslet): the towers' own
 *   oillets   a cross loop whose arms end in round holes
 *   keyhole   a slit with a round hole at its foot (for a gun)
 *   lancet    a narrow window with a pointed head
 *   twin      two lancets under a small diamond light
 *   quatrefoil  a four-lobed light
 */
export const LOOPS = {
  slit: ['XX', 'XX', 'XX', 'XX', 'XX', 'XX', 'XX', 'XX', 'XX', 'XX', 'XX', 'XX'],
  cross: ['..XX..', '..XX..', '..XX..', '..XX..', 'XXXXXX', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..', '..XX..'],
  oillets: ['..XXXX..', '..XXXX..', '...XX...', '...XX...', 'XX.XX.XX', 'XXXXXXXX', 'XX.XX.XX', '...XX...', '...XX...', '...XX...', '..XXXX..', '..XXXX..'],
  keyhole: ['.XX.', '.XX.', '.XX.', '.XX.', '.XX.', '.XX.', '.XX.', '.XX.', 'XXXX', 'XXXX', 'XXXX', '.XX.'],
  lancet: ['.XX.', 'XXXX', 'XXXX', 'XXXX', 'XXXX', 'XXXX', 'XXXX', 'XXXX', 'XXXX', 'XXXX', 'XXXX', 'XXXX'],
  twin: ['....X....', '...XXX...', '....X....', '.........', '.X.....X.', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX', 'XXX...XXX'],
  quatrefoil: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', '.XX.XX.'],
} as const;
export type LoopKind = keyof typeof LOOPS;
/** The cutout behind each hero. */
export const HERO_LOOP: LoopKind = 'cross';
/** How far under the arcade's top a cutout begins (art px): under where the arch springs, beside the hero's name. */
const LOOP_TOP_ART = ARCH_BAND_ART + ARCH_RISE_ART + 2;
/** How far in from each side of the niche a cutout stands (art px). */
const LOOP_SIDE_ART = 4;

/** Is this art pixel of a card (x from its left edge, y from the arcade's top) cut through? One loop each side of the niche. */
export function inLoop(kind: LoopKind, open: { left: number; right: number }, x: number, y: number): boolean {
  const shape = LOOPS[kind];
  const row = shape[y - LOOP_TOP_ART];
  if (!row) return false;
  return row[x - (open.left + LOOP_SIDE_ART)] === 'X' || row[x - (open.right - LOOP_SIDE_ART - row.length)] === 'X';
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
  /** A corner pixel left out, as the user's pieces have. */
  const cut = (ax: number, ay: number) => ctx.clearRect((ax - box.x) * Z, (ay - box.y) * Z, Z, Z);

  if (kind === 'shelf') {
    // The ledge, three art px thick: a top that catches the light (it is
    // the brightest stone in the room: it must read under a small icon),
    // its face, and the black line under it and round its free end.
    a(x0, ih, box.w, 1, SHELF_TOP);
    a(x0, ih + 1, box.w, 1, s.faces[2]);
    a(x0, ih + 2, box.w, 1, INK);
    a(x1 - 1, ih, 1, 3, INK);
    cut(x1 - 1, ih);
    cut(x1 - 1, ih + 2);
    if (!atWall) { a(x0, ih, 1, 3, INK); cut(x0, ih); cut(x0, ih + 2); }
    // The corbel under it: courses stepping back, against the wall or under
    // the middle; black wherever a stone ends or has nothing under it.
    const steps = [7, 7, 5, 3, 2];
    const leftOf = (w: number) => (atWall ? x0 : Math.round(iw / 2 - w / 2));
    steps.forEach((w, k) => {
      const next = steps[k + 1] ?? 0;
      for (let i = 0; i < w; i++) {
        const x = leftOf(w) + i;
        const edge = i === w - 1 || (!atWall && i === 0) || x < leftOf(next) || x >= leftOf(next) + next;
        a(x, ih + 3 + k, 1, 1, edge ? INK : s.faces[k % 3]);
      }
    });
    return;
  }

  if (kind === 'tablet') {
    // The tablet: two art px round the rune, the black line and one of
    // stone, lit along the top and shaded along the foot; corners cut.
    const tx = -2;
    const ty = -2;
    const tw = iw + 4;
    const th = ih + 4;
    a(tx, ty, tw, th, INK);
    a(tx + 1, ty + 1, tw - 2, th - 2, s.faces[2]);
    a(tx + 1, ty + 1, tw - 2, 1, s.lit);
    a(tx + 1, ty + th - 2, tw - 2, 1, s.dark);
    for (const [cx, cy] of [[tx, ty], [tx + tw - 1, ty], [tx, ty + th - 1], [tx + tw - 1, ty + th - 1]]) cut(cx, cy);
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

  // The frame: two art px round the tile, the black line and one of wood,
  // an iron stud at each of the wood's corners, the outer corners cut;
  // held off the wall on two iron pins (alone: just the frame).
  a(-2, -2, iw + 4, ih + 4, INK);
  a(-1, -1, iw + 2, ih + 2, WOOD.mid);
  a(-1, -1, iw + 2, 1, WOOD.lit);
  a(-1, 0, 1, ih + 1, WOOD.lit);
  a(iw, 0, 1, ih + 1, WOOD.dark);
  a(-1, ih, iw + 2, 1, WOOD.dark);
  for (const [px, py] of [[-1, -1], [iw, -1], [-1, ih], [iw, ih]]) a(px, py, 1, 1, IRON.lit);
  for (const [px, py] of [[-2, -2], [iw + 1, -2], [-2, ih + 1], [iw + 1, ih + 1]]) cut(px, py);
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
 * (CSS px from the pier's top) is where the GROUND is: above it a tower
 * seen from outside, below it earth behind a lining of the older stone.
 * THE GROUND IS THE HERO HALL'S FLOOR (user, 2026-11-24: "get rid of the
 * dirt in the bottom corners of the castle towers when nothing is selected,
 * but have the sides match the dungeon parts (brick with dirt on the
 * outside). Basically, the 'selection' is like looking into a cellar"). It
 * was the top of the box that holds the rooms under the hero hall, which
 * begins a few px ABOVE the enemies' beam: earth showed in the towers'
 * feet. Now the tower runs to the floor exactly; with nothing selected the
 * enemies' beam is there, and with a hero's info open the sides of that
 * box are earth and lining, as every room's under it.
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
  const CORE_W = PIER_ART - 5; // earth, then 1 mortar + 3 facing + 1 cut line
  const ground = Math.max(0, Math.min(heightArt, oldFrom)); // the row the ground is at

  // BELOW GROUND the rooms are dug into the earth: soil with a stone here
  // and there, behind the lining of dressed blocks that faces the room.
  for (let row = Math.floor(ground / 3), y = row * 3; y < heightArt; row++, y += 3) {
    a(0, y, CORE_W + 1, 3, EARTH.soil[row % EARTH.soil.length]);
    let x = 1 - Math.floor(hash(salt + row * 3) * 3);
    for (let i = 0; x < CORE_W; i++) {
      const w = 2 + Math.floor(hash(salt + row * 31 + i * 7) * 3);
      const from = Math.max(1, x);
      const to = Math.min(CORE_W, x + w);
      // (About two stones in five of the wall's old rubble: the rest is soil.)
      if (to > from && hash(salt + row * 13 + i * 5) < 0.4) a(from, y, to - from, 2, pick(EARTH.stone, salt + row * 17 + i));
      x += w + 1;
    }
  }

  // The lining, and the line of the cut beside the room.
  for (const b of facingBlocks(heightArt, oldFrom, side)) {
    if (b.y + b.h <= ground) continue; // above ground: the tower, below
    const s = stoneAt(b.y);
    const x = CORE_W + 1;
    a(CORE_W, b.y, 4, b.h + 1, INK); // the black line behind the lining and between its blocks
    if (b.fallen) {
      // Fallen out: the rubble behind shows, and the cut line breaks.
      a(x, b.y, 2, Math.max(1, b.h - 1), pick(s.core, salt + b.y));
      a(PIER_ART - 1, b.y, 1, b.h + 1, INK);
      continue;
    }
    a(x, b.y, 3, b.h, s.faces[b.tone]);
    a(x, b.y, 3, 1, s.lit);
    a(x, b.y + b.h - 1, 3, 1, s.dark);
    a(PIER_ART - 1, b.y, 1, b.h, side === 'right' ? s.cut : s.edgeLit);
  }

  // ABOVE GROUND the side wall is a TOWER seen from outside (the hero hall
  // is the part of the castle that stands above ground: cutawayStone's
  // rampart, below).
  const raw = (ax: number, ay: number, aw: number, ah: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(ax * Z, ay * Z, aw * Z, ah * Z);
  };
  if (ground > 0) {
    // (No black line down its side towards the hall: the first niche's own line is there.)
    towerShaft(raw, 0, 0, PIER_ART, ground, salt + 40, side === 'left' ? 'left' : 'right');
    // An arrow slit, a FIXED way down from the tower's top (it was at a
    // share of the tower's height, and went down the tower when a hero's
    // info opened: "expanding the hero panel moves the cross shaped window
    // down the castle towers which doesn't really make much sense").
    if (ground >= TOWER_SLIT_ART + 12) {
      raw(PIER_ART / 2 - 1, TOWER_SLIT_ART, 2, 8, EARTH.slit);
      raw(PIER_ART / 2 - 2, TOWER_SLIT_ART + 3, 4, 1, EARTH.slit);
    }
    // (No turf at its foot: tried, two rows of green in the earth's top;
    // the user: "I am not sure if I like the grass block on the hero panel".)
  }

  // (No fade at the foot: the wall stands on the foundation, drawn over its last stretch.)
}

// ---- above ground: the towers and the rampart ---------------------------------------------
// User, 2026-11-24: "an edit to the heroes panel, to make it appear as
// though it is the portion of a castle that is above ground, while where
// the dungeon details start (enemies and below) are clearly underground.
// This would play into the castle crossection idea ... making the sides
// look like castle towers, and the top look like the top of a castle wall".
// (In the cross-sections looked at for this, the part above ground has
// round towers drawn from OUTSIDE at each side, flared and crenellated at
// the top, with a battlemented wall between them; what is below ground is
// rooms hollowed out of a solid mass.) So, from the heroes' beam up: a
// TOWER at each end of it, standing higher than the wall, its head flared
// out on corbels and crenellated; MERLONS along the top of the beam between
// them. The towers run on down the page's sides to the ground (drawPier),
// which is at the enemies' beam; from there down the sides are earth.

/** Earth, and the dark of an arrow slit. */
const EARTH = {
  soil: ['#1b140d', '#1f1710', '#17110b'],
  stone: ['#2a2622', '#24201c', '#2e2a25'],
  slit: '#070605',
};
/** How far below the top of a side wall its tower's arrow slit is (art px): about the height of the heroes' names. */
const TOWER_SLIT_ART = 22;

/** How far the towers stand above the top of the heroes' beam (art px), and the rampart's height (CSS px). */
export const RAMPART_RISE_ART = 7;
export const RAMPART_H = RAMPART_RISE_ART * Z + SLAB_H;
/** A tower's head is this much wider than its shaft, towards the wall (art px): it stands out on corbels. */
const TOWER_FLARE_ART = 2;
/** The wall's merlons: this tall, this wide (their black line included), this far apart (art px). */
const MERLON_ART = { h: 3, w: 6, gap: 2 };
/**
 * A tower's head in the user's hand, row by row from its top, from the
 * page's edge inwards (K the black line, M a merlon, P the parapet, C a
 * corbel, . open): two merlons with their corners cut on a parapet that
 * stands out past the shaft on a row of corbels.
 */
const TOWER_HEAD = [
  '..KK....KK..',
  '.KMMK..KMMK.',
  'KKMMKKKKMMKK',
  'KPPPPPPPPPPK',
  'KCKCKCKCKCKK',
] as const;

type Fill = (ax: number, ay: number, aw: number, ah: number, color: string) => void;

/**
 * A tower's shaft seen from outside: courses of dressed stone, lit down its
 * left side and in shade down its right (it is round), with the black line
 * between its stones and down its sides (`lines`: both, or only one).
 */
function towerShaft(fill: Fill, x0: number, y0: number, w: number, rows: number, salt: number, lines: 'both' | 'left' | 'right' = 'both'): void {
  const s = KEPT;
  fill(x0, y0, w, rows, INK);
  for (let c = 0, y = 0; y < rows; c++, y += 6) {
    const h = Math.min(5, rows - y);
    const shift = c % 2 ? 3 : 0; // running bond
    for (const b of courseBlocks(w + 6, 6, salt + c * 29)) {
      const from = Math.max(0, b.x - shift);
      const to = Math.min(w, b.x + b.w - shift);
      if (to <= from) continue;
      fill(x0 + from, y0 + y, to - from, h, s.faces[b.tone]);
      fill(x0 + from, y0 + y, to - from, 1, s.lit);
    }
  }
  fill(x0, y0, 2, rows, 'rgba(255, 236, 205, 0.07)');
  fill(x0 + w - 3, y0, 3, rows, 'rgba(0, 0, 0, 0.3)');
  fill(x0 + w - 1, y0, 1, rows, 'rgba(0, 0, 0, 0.25)');
  if (lines !== 'right') fill(x0, y0, 1, rows, INK);
  if (lines !== 'left') fill(x0 + w - 1, y0, 1, rows, INK);
}

/** Where a column of the wall is in its merlon (0 to MERLON_ART.w - 1), or -1 in a gap. A merlon stands on the middle. */
function merlonColumn(x: number, widthArt: number): number {
  const c = Math.floor(Math.abs(x - (widthArt - 1) / 2));
  const k = (c + MERLON_ART.w / 2) % (MERLON_ART.w + MERLON_ART.gap);
  return k < MERLON_ART.w ? k : -1;
}
/** Is that column one of a merlon's two sides (where its black line runs down, and its corner is cut)? */
const merlonSide = (k: number): boolean => k === 0 || k === MERLON_ART.w - 1;

/**
 * The first row of stone in each column of the rampart, ABOVE the beam
 * (row 0 = the towers' tops; RAMPART_RISE_ART = the beam's own top row,
 * meaning no stone above the beam in that column). `widthArt`: the beam's
 * width, side walls included.
 */
export function rampartTops(widthArt: number): number[] {
  const head = PIER_ART + TOWER_FLARE_ART;
  return Array.from({ length: widthArt }, (_, x) => {
    const fromEnd = Math.min(x, widthArt - 1 - x);
    if (fromEnd < head) return TOWER_HEAD.findIndex(row => row[fromEnd] !== '.');
    const k = merlonColumn(x, widthArt);
    // (A merlon's two sides begin a row lower: its corners are cut.)
    return k < 0 ? RAMPART_RISE_ART : RAMPART_RISE_ART - MERLON_ART.h + (merlonSide(k) ? 1 : 0);
  });
}

/** Draw the rampart into a canvas `w` CSS px wide (the beam's width) and RAMPART_H tall; its foot is the beam's foot. */
export function drawRampart(ctx: CanvasRenderingContext2D, w: number): void {
  const s = KEPT;
  const fill: Fill = (ax, ay, aw, ah, color) => {
    if (aw <= 0 || ah <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(ax * Z, ay * Z, aw * Z, ah * Z);
  };
  const widthArt = Math.ceil(w / Z);
  const tops = rampartTops(widthArt);
  const head = PIER_ART + TOWER_FLARE_ART;
  const rows = RAMPART_RISE_ART + SLAB_ART;
  // The towers' shafts, down through the beam's ends.
  towerShaft(fill, 0, 5, PIER_ART, rows - 5, 77);
  towerShaft(fill, widthArt - PIER_ART, 5, PIER_ART, rows - 5, 191);
  for (let x = 0; x < widthArt; x++) {
    const fromEnd = Math.min(x, widthArt - 1 - x);
    if (fromEnd < head) {
      // A tower's head, pixel for pixel.
      TOWER_HEAD.forEach((row, y) => {
        const c = row[fromEnd];
        if (c === 'K') fill(x, y, 1, 1, INK);
        else if (c === 'M') fill(x, y, 1, 1, y === 1 ? s.lit : s.faces[1]);
        else if (c === 'P') fill(x, y, 1, 1, s.faces[2]);
        else if (c === 'C') fill(x, y, 1, 1, s.faces[0]);
      });
    } else if (tops[x] < RAMPART_RISE_ART) {
      // A merlon of the wall: the black line over it and down its sides, lit under the line.
      const top = RAMPART_RISE_ART - MERLON_ART.h;
      fill(x, tops[x], 1, RAMPART_RISE_ART - tops[x], INK);
      if (!merlonSide(merlonColumn(x, widthArt))) {
        fill(x, top + 1, 1, MERLON_ART.h - 1, s.faces[0]);
        fill(x, top + 1, 1, 1, s.lit);
      }
    }
  }
}

/** The room's dark over what of the rampart stands above the beam (as drawPlateDark, for the same reason). */
export function drawRampartDark(ctx: CanvasRenderingContext2D, w: number): void {
  ctx.fillStyle = 'rgba(6, 5, 4, 0.68)';
  rampartTops(Math.ceil(w / Z)).forEach((top, x) => {
    if (top < RAMPART_RISE_ART) ctx.fillRect(x * Z, top * Z, Z, (RAMPART_RISE_ART - top) * Z);
  });
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
    a(x0, y0, width, height, INK);
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
        a(right ? x + b.w - 2 : x, top, 2, 1, INK);
        a(right ? x + b.w - 1 : x, top + 1, 1, 1, INK);
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
