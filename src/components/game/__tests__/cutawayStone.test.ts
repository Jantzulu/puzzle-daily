import { describe, expect, it } from 'vitest';
import {
  ARCH_BAND_ART, ARCH_H, ARCH_MAX_RX_ART, ARCH_RISE_ART, PIER_ART, PIER_TOP, SLAB_ART, SLAB_H, SLAB_RISE, WALL_ON, WALL_TORCH_GAP, WALL_TORCH_HALF,
  BEDROCK_ART, FOOTING_LOWER_ART, FOOTING_UPPER_ART, FOUND_H, archInset, archOutline, bedrock, courseBlocks, facingBlocks, slabBlocks,
  PASSAGE_RIBS_ART, archOpening, nicheSpan, passageDepth,
  WALL_ENTRY, settingBox,
  PLATE_H, PLATE_RISE_ART, plateColumn, plateRise,
} from '../cutawayStone';
import type { PlateKind } from '../cutawayStone';

// The cutaway wall's placeholder stone (the `?wall=1` experiment). What can
// be pinned without a canvas: the blocks are laid out the same every time,
// fill their course exactly, and the switch is off unless asked for.

describe('the cutaway wall', () => {
  it('is off unless the page is opened with ?wall=1', () => {
    expect(WALL_ON).toBe(false); // (no window here: the same answer as a page without the switch)
  });

  it('keeps its sizes on the art grid', () => {
    expect(SLAB_H).toBe(SLAB_ART * 2);
    expect(PIER_TOP).toBe(SLAB_H - SLAB_RISE); // the side walls begin where the slab ends
    expect(PIER_ART).toBeGreaterThanOrEqual(8);
    expect(Number.isInteger(SLAB_RISE)).toBe(true); // whole px: the row it centres on is 14 tall
  });

  it('seats a torch dead centre on a beam, on the beam own pixel grid', () => {
    const torch = WALL_TORCH_HALF * 2; // 32 CSS px = 16 art px
    expect(SLAB_H).toBeGreaterThan(torch); // the beam is the taller: nothing overhangs it
    const margin = (SLAB_H - torch) / 2; // stone above the torch = stone below it
    expect(margin % 2).toBe(0); // a whole number of art px (Z = 2): torch rows line up with stone rows
    expect(margin).toBe(2); // one art px: the torch covers the block face, row for row
    // To the eye the two sides stand equally far from the title: 10px from the (?) mark, 10px from the last letter.
    const MARK_ENDS = 24; // the (?) glyph's far edge, px before the title's first letter
    expect(WALL_TORCH_GAP.left - MARK_ENDS).toBe(WALL_TORCH_GAP.right);
  });

  it('cuts a low arch over each card: stone widest at the top of a shoulder, none where it springs', () => {
    expect(ARCH_H).toBe((ARCH_RISE_ART + ARCH_BAND_ART) * 2);
    const rows = Array.from({ length: ARCH_RISE_ART }, (_, y) => archInset(y, ARCH_MAX_RX_ART));
    // Narrowing all the way down, never widening.
    for (let y = 1; y < rows.length; y++) expect(rows[y]).toBeLessThanOrEqual(rows[y - 1]);
    expect(rows[0]).toBeGreaterThan(ARCH_MAX_RX_ART / 2); // a real shoulder at the top...
    expect(rows[0]).toBeLessThan(ARCH_MAX_RX_ART); // ...that still leaves the middle open
    expect(rows[rows.length - 1]).toBe(0); // clear of the column where the arch springs
    // Below the fourth row of the curve (where a tall hero's art begins) the stone is a sliver by the column.
    expect(rows[4]).toBeLessThanOrEqual(3);
    // A narrow card (five heroes on a phone: a shoulder of 15) gets the same curve, scaled.
    const narrow = Array.from({ length: ARCH_RISE_ART }, (_, y) => archInset(y, 15));
    expect(narrow[0]).toBeLessThan(15);
    expect(narrow[narrow.length - 1]).toBe(0);
  });

  it('traces the edge of a cutout as one unbroken line from column to column', () => {
    const rows = ARCH_BAND_ART + ARCH_RISE_ART;
    for (const [width, first, last] of [[56, false, false], [56, true, false], [55, false, true], [33, false, false], [167, true, true]] as const) {
      const runs = archOutline(width, first, last);
      for (const run of runs) {
        expect(run.w).toBeGreaterThan(0);
        expect(run.x).toBeGreaterThanOrEqual(0);
        expect(run.x + run.w).toBeLessThanOrEqual(width); // never outside the card
        expect(run.y).toBeGreaterThanOrEqual(0);
        expect(run.y).toBeLessThan(rows);
      }
      // One run across the band, then a left and a right run on every row of the curve.
      expect(runs.filter(run => run.y === 0)).toHaveLength(1);
      for (let y = 1; y < rows; y++) expect(runs.filter(run => run.y === y)).toHaveLength(2);
      // It lands on the columns' own pixels, where the selection's straight sides take over.
      const [l, r] = runs.filter(run => run.y === rows - 1);
      expect(l.x).toBe(0);
      expect(r.x + r.w).toBe(width);
      // Unbroken: each row's run touches the one above it (side by side or corner to corner).
      let above = runs.find(run => run.y === 0)!;
      for (let y = 1; y < rows; y++) {
        const left = runs.filter(run => run.y === y)[0];
        expect(left.x + left.w).toBeGreaterThanOrEqual(above.x); // reaches up to the row above's start
        expect(left.x).toBeLessThanOrEqual(above.x);
        above = left;
      }
    }
    // A mirror image, for a card with a column on both sides.
    const mid = archOutline(56, false, false);
    for (let y = 1; y < rows; y++) {
      const [l, r] = mid.filter(run => run.y === y);
      expect(r.x).toBe(56 - (l.x + l.w));
      expect(r.w).toBe(l.w);
    }
  });

  it('lays a slab of blocks that fill it exactly, one art px of mortar apart', () => {
    for (const width of [40, 167, 187, 188, 352, 600]) {
      const blocks = slabBlocks(width);
      expect(blocks[0].x).toBe(0);
      for (let i = 1; i < blocks.length; i++) expect(blocks[i].x).toBe(blocks[i - 1].x + blocks[i - 1].w + 1);
      const last = blocks[blocks.length - 1];
      expect(last.x + last.w).toBe(width); // flush with the end
      for (const b of blocks) expect(b.w).toBeGreaterThanOrEqual(4);
    }
    // A phone (187 art px) gets about five blocks, no two the same width.
    const phone = slabBlocks(187);
    expect(phone.length).toBeGreaterThanOrEqual(4);
    expect(new Set(phone.map(b => b.w)).size).toBeGreaterThan(1);
  });

  it('stands on a footing of two courses, laid with different joints, on bedrock that thins out', () => {
    expect(FOUND_H).toBe((FOOTING_UPPER_ART + FOOTING_LOWER_ART + BEDROCK_ART) * 2);
    // Each course fills its width exactly, like a beam's.
    for (const [width, about, salt] of [[171, 44, 300], [203, 30, 600], [40, 44, 300]] as const) {
      const blocks = courseBlocks(width, about, salt);
      expect(blocks[0].x).toBe(0);
      for (let i = 1; i < blocks.length; i++) expect(blocks[i].x).toBe(blocks[i - 1].x + blocks[i - 1].w + 1);
      const last = blocks[blocks.length - 1];
      expect(last.x + last.w).toBe(width);
    }
    // The two courses do not line their joints up.
    expect(courseBlocks(200, 30, 600).map(b => b.x)).not.toEqual(courseBlocks(200, 30, 300).map(b => b.x));
    // A beam is still the course it always was.
    expect(slabBlocks(187)).toEqual(courseBlocks(187, 34, 0));

    const rocks = bedrock(203);
    expect(bedrock(203)).toEqual(rocks); // the same bed every time
    for (const r of rocks) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(203);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.h).toBeLessThanOrEqual(BEDROCK_ART);
    }
    // Fewer stones the deeper the band.
    const perBand = [0, 1, 2, 3].map(band => rocks.filter(r => r.band === band).length);
    expect(perBand[0]).toBeGreaterThan(perBand[3]);
    expect(perBand[3]).toBeGreaterThan(0);
  });

  it('is the same wall every time', () => {
    expect(slabBlocks(187)).toEqual(slabBlocks(187));
    expect(facingBlocks(400, 120, 'left')).toEqual(facingBlocks(400, 120, 'left'));
    // The two sides are not mirror copies of each other.
    expect(facingBlocks(400, 120, 'left')).not.toEqual(facingBlocks(400, 120, 'right'));
  });

  it('faces a side wall from top to bottom, and loses blocks only in the older stone', () => {
    const blocks = facingBlocks(600, 200, 'left');
    expect(blocks[0].y).toBe(0);
    for (let i = 1; i < blocks.length; i++) expect(blocks[i].y).toBe(blocks[i - 1].y + blocks[i - 1].h + 1);
    const last = blocks[blocks.length - 1];
    expect(last.y + last.h).toBeGreaterThanOrEqual(599); // reaches the bottom (where the foundation takes over)
    for (const b of blocks) {
      expect(b.h).toBeGreaterThanOrEqual(5);
      expect(b.h).toBeLessThanOrEqual(8);
      if (b.y < 200) expect(b.fallen).toBe(false); // the kept stone above the lintel is whole
    }
    const old = blocks.filter(b => b.y >= 200);
    const fallen = old.filter(b => b.fallen).length;
    expect(fallen).toBeGreaterThan(0);
    expect(fallen).toBeLessThan(old.length / 2); // some, not most
  });

  it('steps the dark back from the mouth of an arch, and leaves the middle alone', () => {
    const open = archOpening(58, false, false);
    const last = PASSAGE_RIBS_ART[PASSAGE_RIBS_ART.length - 1];
    // Above the opening, and in the stone of a shoulder: not in the passage.
    expect(nicheSpan(open, 0)).toBeNull();
    expect(passageDepth(open, open.left, ARCH_BAND_ART, last + 1).depth).toBe(-1);
    // Below the curve the depth counts in from each side; the right-hand wall is the lit one.
    const y = ARCH_BAND_ART + ARCH_RISE_ART + 20;
    expect(passageDepth(open, open.left, y, last + 1)).toEqual({ depth: 0, lit: false });
    expect(passageDepth(open, open.left + 3, y, last + 1).depth).toBe(3);
    expect(passageDepth(open, open.right - 1, y, last + 1)).toEqual({ depth: 0, lit: true });
    // The middle is past the last rib: nothing is drawn behind the card's own things.
    expect(passageDepth(open, 29, y, last + 1).depth).toBeGreaterThan(last);
    // Under the crown it counts down from the band of stone.
    expect(passageDepth(open, 29, ARCH_BAND_ART + 2, last + 1).depth).toBe(2);
  });

  it('draws a list entry\'s setting out to the side wall when its icon is beside it, and alone otherwise', () => {
    // A shelf starts at the wall's face: the gap, the icon, and its overhang.
    expect(settingBox('shelf', 10, 10, 3)).toEqual({ x: -3, y: 10, w: 16, h: 8 });
    expect(settingBox('shelf', 10, 10, 6).x).toBe(-6); // a wider gap: still from the wall
    expect(settingBox('shelf', 10, 10, null).x).toBe(-3); // alone: its own overhang
    // A tablet hangs from a bar above it; a frame goes round its tile, and reaches the wall when beside it.
    const tablet = settingBox('tablet', 10, 10, 4);
    expect(tablet.x).toBe(-4);
    expect(tablet.y).toBeLessThan(-2);
    expect(settingBox('frame', 13, 13, 4)).toEqual({ x: -4, y: -2, w: 19, h: 17 });
    expect(settingBox('frame', 13, 13, null)).toEqual({ x: -2, y: -2, w: 17, h: 17 });
    // Every kind of entry has a row tall enough for its setting.
    for (const kind of ['shelf', 'tablet', 'frame'] as const) expect(WALL_ENTRY[kind].row).toMatch(/^min-h-/);
  });

  it('lets a plate into the beam behind a title, proud of it top and bottom, each room in its own way', () => {
    expect(PLATE_H).toBe(SLAB_H + 4 * PLATE_RISE_ART); // the rise, top and bottom, at two CSS px an art px
    const last = SLAB_ART + 2 * PLATE_RISE_ART - 1;
    const w = 60;
    const all: PlateKind[] = ['heroes', 'enemies', 'allies', 'items', 'status', 'tiles'];
    for (const kind of all) {
      const cols = Array.from({ length: w }, (_, x) => plateColumn(kind, x, w));
      cols.forEach((c, x) => {
        expect(c).toEqual(cols[w - 1 - x]); // the same both sides of the middle
        expect(c.top + c.bottom).toBe(last); // and the same above and below
        expect(c.top).toBeGreaterThanOrEqual(0);
      });
      expect(cols[0].top).toBeGreaterThan(PLATE_RISE_ART); // a blunt point inside the beam at each end
      // No flat edges: every plate's top has more than one level.
      expect(new Set(cols.slice(3, w - 3).map(c => c.top)).size).toBeGreaterThan(1);
      expect(Math.min(...cols.map(c => c.top))).toBe(0); // and somewhere it stands the whole rise proud
    }
    // No two rooms have the same edge; the allies share the heroes'.
    const edge = (kind: PlateKind) => Array.from({ length: 54 }, (_, x) => plateRise(kind, x, 54)).join('');
    const rooms: PlateKind[] = ['heroes', 'enemies', 'items', 'status', 'tiles'];
    expect(new Set(rooms.map(edge)).size).toBe(rooms.length);
    expect(edge('allies')).toBe(edge('heroes'));
  });
});
