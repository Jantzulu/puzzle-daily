import { describe, expect, it } from 'vitest';
import {
  ARCH_BAND_ART, ARCH_H, ARCH_MAX_RX_ART, ARCH_RISE_ART, PIER_ART, PIER_TOP, SLAB_ART, SLAB_H, SLAB_RISE, WALL_ON, WALL_TORCH_GAP, WALL_TORCH_HALF,
  archInset, facingBlocks, slabBlocks,
} from '../cutawayStone';

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
    // To the eye the two sides stand equally far from the title: 6px from the (?) mark, 6px from the last letter.
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
    expect(last.y + last.h).toBeGreaterThanOrEqual(599); // reaches the bottom
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
});
