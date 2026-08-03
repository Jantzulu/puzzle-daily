import { describe, expect, it } from 'vitest';
import { DEFAULT_KITS, assembleKit, type Assembly, type AssemblyRegion, type KitSpec } from '../PanelForge';
import { BAR_FRACS, barCenters } from '../../game/panelSkins';

// ============================================================================
// ASSEMBLY INVARIANTS — the guide must stay cuttable and live-true
// ============================================================================
// The slicer cuts every piece from its FIRST non-guide rep-0 region (falling
// back to the first non-guide region), so a kit edit that nudges that region
// off the sheet, shrinks it, or lets another piece paint over it silently
// corrupts every export of the kit — the artist paints a whole piece and
// ships the wrong pixels. Both failure modes are real, caught 2026-08-02:
// the nav-gate left bar cut at x=-1 (off-sheet), and the rail's flush edge
// plates baked into the cap/face cuts (one flat sheet cannot ship the same
// pixels in two pieces). Guide regions are dashed placement previews the
// slicer ignores entirely.

/** The slicer's cut-region choice, mirrored from PanelForgeImport. */
const cutRegionOf = (assembly: Assembly, pieceId: string): AssemblyRegion | undefined => {
  const all = assembly.regions.filter(r => r.pieceId === pieceId && !r.guide);
  return all.find(r => r.rep === 0) ?? all[0];
};

const intersects = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A region's full paintable rect — nominal plus its honored halo. */
const paintRect = (r: AssemblyRegion) => ({
  x: r.x - (r.halo?.l ?? 0),
  y: r.y - (r.halo?.t ?? 0),
  w: r.w + (r.halo?.l ?? 0) + (r.halo?.r ?? 0),
  h: r.h + (r.halo?.t ?? 0) + (r.halo?.b ?? 0),
});

describe('panel forge assemblies', () => {
  const assemblies: { kit: KitSpec; assembly: Assembly | null }[] =
    DEFAULT_KITS.map(kit => ({ kit, assembly: assembleKit(kit) }));

  it('every piece cuts from a full-size, on-sheet region in every built-in kit', () => {
    for (const { kit, assembly } of assemblies) {
      if (!assembly) continue;
      for (const piece of kit.pieces) {
        const cut = cutRegionOf(assembly, piece.id);
        if (!cut) continue; // optional pieces may not assemble
        const label = `${kit.id}/${piece.id}`;
        expect(cut.w, `${label} cut width`).toBe(piece.w);
        expect(cut.h, `${label} cut height`).toBe(piece.h);
        const rect = paintRect(cut);
        expect(rect.x, `${label} cut left edge`).toBeGreaterThanOrEqual(0);
        expect(rect.y, `${label} cut top edge`).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w, `${label} cut right edge`).toBeLessThanOrEqual(assembly.width);
        expect(rect.y + rect.h, `${label} cut bottom edge`).toBeLessThanOrEqual(assembly.height);
      }
    }
  });

  it('nothing paints over any cut region (one flat sheet cannot ship the same pixels twice)', () => {
    // Regions render in array order, so anything pushed AFTER a cut region
    // that overlaps it puts its paint INSIDE that piece's export. Painting
    // UNDER a cut (earlier index) is fine — the cut piece's own opaque
    // paint covers it, exactly the live layering. Guide regions are exempt:
    // they are dashed do-not-paint previews.
    for (const { kit, assembly } of assemblies) {
      if (!assembly) continue;
      for (const piece of kit.pieces) {
        const cut = cutRegionOf(assembly, piece.id);
        if (!cut) continue;
        const cutIdx = assembly.regions.indexOf(cut);
        const cutRect = paintRect(cut);
        assembly.regions.forEach((r, idx) => {
          if (idx <= cutIdx || r.guide || r.pieceId === piece.id) return;
          expect(
            intersects(cutRect, paintRect(r)),
            `${kit.id}: ${r.pieceId} region #${idx} paints over ${piece.id}'s cut`,
          ).toBe(false);
        });
      }
    }
  });

  it('barCenters: outer pair edgeInset in from flush, interior evenly spaced', () => {
    for (const w of [393, 487, 672]) {
      const cs = barCenters(w, 12, 4); // renderer units: 2 art inset × Z
      expect(cs[0]).toBe(6 + 4);
      expect(cs[5]).toBe(w - 6 - 4);
      const pitch = (cs[5] - cs[0]) / 5;
      for (let i = 1; i < 5; i++) expect(Math.abs(cs[i] - (cs[0] + i * pitch))).toBeLessThanOrEqual(0.5);
      expect(cs.length).toBe(6);
    }
  });

  it('the nav-gate lattice shows its gate bars 2 art in from the sheet edges, as guides', () => {
    const { kit, assembly } = assemblies.find(a => a.kit.id === 'nav-gate')!;
    const bar = kit.pieces.find(p => p.id === 'beam-bar-segment')!;
    const lattice = assembly!.regions.filter(r => r.pieceId === 'beam-bar-segment' && r.guide);
    const xs = [...new Set(lattice.map(r => r.x))].sort((a, b) => a - b);
    expect(xs.length).toBe(BAR_FRACS.length);
    expect(xs[0]).toBe(2); // EDGE_BAR_INSET in from flush (user call, 2026-08-02)
    expect(xs[xs.length - 1]).toBe(assembly!.width - bar.w - 2);
    // The shipped bar comes from the detached slot on clean ground.
    const cut = cutRegionOf(assembly!, 'beam-bar-segment')!;
    expect(cut.guide).toBeUndefined();
    expect(cut.y + cut.h, 'bar cut slot sits above the lattice').toBeLessThan(Math.min(...lattice.map(r => r.y)));
  });

  it('the control-rail sample previews hardware at all six fractions, edge spikes clipped', () => {
    const { kit, assembly } = assemblies.find(a => a.kit.id === 'control-rail')!;
    const spike = kit.pieces.find(p => p.id === 'rail-spike')!;
    const plateGuides = assembly!.regions.filter(r => r.pieceId === 'forge-plate' && r.guide);
    const spikes = assembly!.regions.filter(r => r.pieceId === 'rail-spike');
    expect(plateGuides.length).toBe(BAR_FRACS.length);
    expect(spikes.length).toBe(BAR_FRACS.length);
    // With the 2-art edge inset the default 8-art spikes FIT (anchor sits
    // 5 from the edge, half-width 4) — the clip machinery stays for wider
    // pieces, and the outer pair remains guide-only either way.
    const clipped = spikes.filter(s => s.w < spike.w);
    expect(clipped.length).toBe(0);
    const outerGuides = spikes.filter(s => s.guide);
    expect(outerGuides.length).toBe(2);
    // The plate cut is the detached slot, not an in-band guide.
    const plateCut = cutRegionOf(assembly!, 'forge-plate')!;
    expect(plateCut.guide).toBeUndefined();
    expect(plateGuides.every(g => g.y > plateCut.y + plateCut.h)).toBe(true);
  });
});
