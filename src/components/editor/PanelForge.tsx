import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../shared/Toast';
import { PortcullisMesh } from '../game/PortcullisMesh';
import { GemMesh } from '../game/GemMesh';
import { GateBeamMesh } from '../shared/GateMesh';
import { PanelForgeImport } from './PanelForgeImport';
import { assembleKit, type Assembly, type KitSpec, type PieceSpec, type RepeatMode, haloFor, DEFAULT_KITS } from './panelForgeKits';

const REPEAT_INFO: Record<RepeatMode, { symbol: string; blurb: string }> = {
  fixed: { symbol: '·', blurb: 'fixed — may overflow in any direction' },
  'tile-x': { symbol: '↔', blurb: 'tiles horizontally — width is a strict period, height may overflow' },
  'tile-y': { symbol: '↕', blurb: 'tiles vertically — height is a strict period, width may overflow' },
  'tile-xy': { symbol: '⤡', blurb: 'tiles both ways — both dimensions are strict periods' },
};

// ─── Persistence ────────────────────────────────────────────────────────────
const STORAGE_KEY = 'panel_forge_kits_v1';
// Bump when DEFAULT_KITS change shape/sizes: stored BUILT-IN kits are then
// replaced with the fresh defaults (mesh-derived proportions); user variants
// are kept as-is.
// v4: capped kit resized (cap 10->12, mid 16->24) so its period matches the
// plain kit's and its sample is not the smaller canvas. Without the bump the
// stored copy of a built-in silently wins over the code, and a sizing change
// looks like it simply did not apply.
// v5: Quest Box kit added (capped nine-slice + QUEST plate 3-slice).
// v6: Quest Box gains centered edge ornaments (fixed halo'd medallions).
// v7: portcullis-gate / control-rail / nav-gate audited against LIVE
//     geometry at Z=2 (beams 18 not 12, rail band 22 not 16, signs 13 not
//     10, bars 6 wide, spikes 8) before the artist paints them.
// v8: the edge-bar reformat reaches the guides — outer bar pair FLUSH in
//     the nav sample (was x=-1 off-sheet, corrupting the bar's rep-0 cut),
//     rail sample hardware at all SIX fractions with live-style clipped
//     edge spikes (was 3 anchors at wrong fractions), kit descriptions
//     state the flush rule.
// v9: hardware cut slots DETACHED (the quest-plate pattern) after
//     adversarial review proved one flat sheet cannot ship the same pixels
//     in two pieces: plates/bars painted in place bake into the band, cap
//     and beam cuts (worst case: an unpainted cap exports "painted" and
//     punches a hole in the live band). In-place hardware and under-beam
//     bars are now dashed GUIDE regions the slicer ignores.
// v10: quest-box edge ornaments 12->17 (superseded same day by v11 — the
//      user wanted the template layout untouched, not bigger pieces).
// v11: ornaments back to 12; the quest sheet instead grows 5 rows at the
//      TOP (everything else anchored, shifted down) and those rows are the
//      ornament slots' extra upward halo — "accept this new space as aura
//      for the ornaments", verbatim.
// v12: THE RESET TRAP CLOSED. Tonight's bumps (v8–v11) wholesale-replaced
//      stored built-ins, wiping the artist's thinned quest sizes and
//      shredding their sheet's slicing (Live panel fragments). Two fixes:
//      the quest kit's DEFAULTS now mirror the SHIPPED art (5-art
//      top/bottom bands, from the committed slices file), and loadKits
//      migrations from v12 on carry stored piece w/h over for matching
//      built-in pieces — the artist's sizes are sacred. Size corrections
//      must ship as new piece ids or as re-apply notes.
// v13: rail-spike cut gains ±8 side aura; rail caps vertically centered
//      on the band (template + live renderer). Notes-only refresh — the
//      v12 migration carries the artist's sizes through untouched.
// v14: bar-top-cap cut DETACHED to clean ground (top-left slot + on-bar
//      guides — a full-length painted shaft was leaking its top rows into
//      the cap cut, the plate law's exact disease). Gate sheet grows by
//      the slot row; artist migration = canvas +6 anchored bottom.
// v15: nav-gate gains beam-cap-l/r (8×18 fixed finished rung ends — the
//      tiling face repeated its painted outer outline internally; user
//      catch). Cuts live in the EXISTING detached slot row, guides at the
//      row ends: sheet size and all existing paint positions UNCHANGED.
// v16: nav-gate gains avatar-crest (16×16 fixed, 4-art halo all around) —
//      the signed-in avatar's picture-frame on the profile plate, painted
//      as a finished object that deliberately overhangs it (user design;
//      the smooth CSS circle broke the gate's square-hardware language).
//      Detached slot in the existing row; sheet size unchanged.
// v17: play-gem kit rebuilt as "Play Stone" at the REAL unified size
//      (60×18 art = 120×36px, all viewports — user unified the 118/132
//      split): play-button face (auto-dims until a hero is placed) +
//      optional hover/pressed + play-frame (never dims, 8-art aura,
//      drawn OVER the face). Old draft gem-normal/hover/pressed (64×22)
//      replaced.
// v18: NEW rung-plaque kit — ONE shared 3-slice worn by both rail
//      plaques (Lives + Max Turns) at content-driven widths; 13-art
//      register matching the gate sign plates. Design once, both wear it
//      (user ask).
// v19: THE PLAQUE/STONE REDESIGN (user spec, 2026-08-04). rung-plaque
//      gains a HEADER plate 3-slice (header-cap-l/mid/cap-r, 4/8/4 × 9
//      art) riding ~60% proud of the plaque's top edge with LIVES/TURNS
//      as DOM text — the quest box's QUEST-plate relation, miniaturized.
//      Sheet grows a header band at the TOP; artist migration = Sprite →
//      Canvas Size, height +11, ANCHOR BOTTOM (paint stays put), then
//      re-export the template. play-gem gains the CONCEDE face family
//      (play-button-concede + optional -hover/-pressed, 60×18 each)
//      sharing the ONE never-dimming frame — the stone becomes the
//      CONCEDE button during a run (the Turn counter moved to the TURNS
//      plaque). Slots append at the sheet's RIGHT; artist migration =
//      Canvas Size, width +210, ANCHOR LEFT, then re-export the template.
//      NOTE: header ids are header-*, NOT plate-* — plate-mid would flip
//      kitFamily() to 'quest-box'.
// v20: quest-box top/bottom bands grow 5 → 8 art (user ask, 2026-08-10:
//      room to shape the scroll silhouette — the painted bottom line sat
//      pinned on the band's top row with zero headroom; +1px edits crossed
//      into the never-cut gutter ring and vanished). Band heights feed NO
//      other region and neither sheet dimension (assembleNineSliceCapped
//      W/H key off corners, top-cap widths, left-run heights), so the
//      painted sheet stays valid with NO migration — the cut simply grows
//      into rows the gutter ring was discarding. Migration adopts 8 only
//      where the stored height is still the old default 5; a deliberate
//      artist resize stays sacred per the v12 law.
// v21: quest-box CORNERS gain vertical overhang room (user ask, 2026-08-10:
//      "draw below corner BL/BR and above the top corners and have those
//      pixels attached to those elements"): 8-art halo above the top pair /
//      below the bottom pair, cut and shipped exactly like the plate's
//      halo (renderers anchor by nominal; QuestBoxFrame's 16-CSS BLEED =
//      exactly 8 art at Z=2, the hard ceiling — do not raise the halo
//      without raising BLEED). SHEET GROWS 144×157 → 144×173: 8 rows
//      inserted between the plate band and the frame top + 8 appended at
//      the bottom. Artist migration (user accepted the resize) = Canvas
//      Size height +16 ANCHOR TOP, then select the whole frame block
//      (everything from y=37 down — the first frame row, right below the
//      plate band's 2px seam) and drag it DOWN 8 px; re-export the
//      template for the new outlines + magenta paint boxes. Piece sizes
//      unchanged — no size migration, the v12 merge passes through.
// v22: quest-box plate-mid SPLIT into plate-mid-l + plate-mid-r (user
//      ask, 2026-08-10: two distinct pieces instead of one repeated).
//      The two pieces occupy EXACTLY the sample's two old mid slots —
//      the second slot was a discarded rep-1 seam preview and now
//      SHIPS — so the sheet layout, every cut position, and the caps
//      are all UNCHANGED: no migration; a sheet whose second slot
//      holds a seam-check copy renders identically to before. Band
//      renders BOOKMATCHED (left piece tiles from the left cap, right
//      piece right-anchored against its cap, overflow crops at the
//      center seam); legacy single-mid exports keep the original
//      single-span tiling (a split would phase-shift committed art).
//      NOTE: a custom-resized plate-mid width does NOT carry to the
//      new ids (the v12 merge matches by id) — re-apply manually.
// v23: NEW tap-hint kit (user ask, 2026-08-11): the three instructional
//      chips ("Tap the dungeon…" board prompt + the "Tap a hero/enemy
//      for more info" rows) share ONE 3-slice at text-driven widths —
//      hint-cap-l/mid/cap-r, 6/12/6 × 12 art, the quest plate's halo
//      scheme (8 above/below everywhere + 8 on cap outer sides) for the
//      black outline + corner flourish the user wants; translucent
//      interior = reduced-opacity fill baked INTO the art (PNG alpha
//      ships through the slicer). Drop path
//      src/assets/panels/tap-hint-slices.json; empty = the CSS chip.
//      Renderer TapHintChip (game) doubles as the Live preview
//      (share-the-renderer; PortcullisLive family 'hint').
const DEFAULTS_VERSION = 23;

function loadKits(): KitSpec[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_KITS;
    const parsed = JSON.parse(raw) as KitSpec[] | { v: number; kits: KitSpec[] };
    const stored = Array.isArray(parsed) ? parsed : parsed.kits;
    const version = Array.isArray(parsed) ? 1 : parsed.v;
    if (version < DEFAULTS_VERSION) {
      const customs = stored.filter(k => !k.builtIn);
      // Pre-v12 stored built-ins may carry the 2026-08-01 accidental resets
      // (four bumps in one night wiped the artist's thinned quest sizes and
      // desynced the slice map from their painted sheet) — replace them
      // wholesale one last time; v12's defaults mirror the shipped art.
      if (version < 12) return [...DEFAULT_KITS, ...customs];
      // From v12 on, THE ARTIST'S PIECE SIZES ARE SACRED: built-ins refresh
      // to the new defaults (descriptions, notes, new pieces), but stored
      // w/h win for matching pieces — the user resizes built-ins (the
      // thinness lever), and a bump must never desync their sheet again.
      // Genuine size corrections must ship as NEW piece ids or be called
      // out for manual re-apply in the kit description.
      // v20 carve-out: the quest-box band pieces adopt the new 8-art height
      // ONLY where the stored height is still the old default 5 — a
      // deliberate artist resize (≠5) stays sacred. See the v20 entry above
      // for why this size change cannot desync the painted sheet.
      const questBandsV20 = new Set([
        'edge-top-cap-l', 'edge-top-mid', 'edge-top-cap-r',
        'edge-bottom-cap-l', 'edge-bottom-mid', 'edge-bottom-cap-r',
      ]);
      const merged = DEFAULT_KITS.map(d => {
        const prev = stored.find(s => s.builtIn && s.id === d.id);
        if (!prev) return d;
        return {
          ...d,
          pieces: d.pieces.map(p => {
            const old = prev.pieces.find(q => q.id === p.id);
            if (!old) return p;
            if (d.id === 'quest-box' && questBandsV20.has(p.id) && old.h === 5) return { ...p, w: old.w };
            return { ...p, w: old.w, h: old.h };
          }),
        };
      });
      return [...merged, ...customs];
    }
    const missing = DEFAULT_KITS.filter(d => !stored.some(s => s.id === d.id));
    return [...stored, ...missing];
  } catch {
    return DEFAULT_KITS;
  }
}

function saveKits(kits: KitSpec[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: DEFAULTS_VERSION, kits }));
  } catch { /* quota — edits stay in memory for the session */ }
}

// ─── Current-game reference (the mesh under the texture map) ────────────────
// The live SVG meshes are rasterized and mapped under the assembled view so
// the artist draws on top of what the game currently renders. Crops are in
// each mesh's viewBox units.

interface RefCrop { src: 'portcullis' | 'gem' | 'gatebeam'; x: number; y: number; w: number; h: number }

// PortcullisMesh viewBox 1000×64: bars zone y 0–20, rail 20–52, spikes 52–64;
// SIX bars centered at x=15/209/403/597/791/985 (half-width 15, outer pair
// flush with the edges — the 2026-07-31 edge-bar reformat), spikes half-width
// 22, plates 13.39×6.5 at y=29.45. Crops sample an INTERIOR bar (209) — the
// edge bars carry the viewBox clip and would give the artist a truncated
// reference. GemMesh viewBox 200×70.
const REF_CROPS: Record<string, RefCrop> = {
  'bar-segment': { src: 'portcullis', x: 194, y: 0, w: 30, h: 20 },
  'bar-top-cap': { src: 'portcullis', x: 194, y: 0, w: 30, h: 6 },
  'rail-face': { src: 'portcullis', x: 290, y: 20, w: 80, h: 32 },
  'rail-cap-l': { src: 'portcullis', x: 0, y: 20, w: 40, h: 32 },
  'rail-cap-r': { src: 'portcullis', x: 960, y: 20, w: 40, h: 32 },
  'forge-plate': { src: 'portcullis', x: 196, y: 29, w: 26, h: 9 },
  'rail-spike': { src: 'portcullis', x: 78, y: 52, w: 44, h: 12 },
  'play-button': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  'play-button-hover': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  'play-button-pressed': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  'play-button-concede': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  'play-button-concede-hover': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  'play-button-concede-pressed': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  // GateBeamMesh viewBox 400×52: beam band y 8–44, bars at x 40..360
  // (half-width 6), forge plates 9×9 at y=21. The sign pieces are DOM CSS
  // (.nav-pill) — no mesh crop; the upload path covers them.
  'beam-face': { src: 'gatebeam', x: 216, y: 8, w: 48, h: 36 },
  'beam-bar-segment': { src: 'gatebeam', x: 34, y: 0, w: 12, h: 52 },
  'beam-plate': { src: 'gatebeam', x: 35, y: 20, w: 10, h: 10 },
};

const REF_VIEWBOX: Record<RefCrop['src'], { w: number; h: number }> = {
  portcullis: { w: 1000, h: 64 },
  gem: { w: 200, h: 70 },
  gatebeam: { w: 400, h: 52 },
};

type RefSources = Partial<Record<RefCrop['src'], HTMLCanvasElement>>;

type Underlay =
  | { mode: 'crops'; sources: RefSources }
  | { mode: 'stretch'; image: HTMLImageElement };

async function rasterizeSvg(svg: SVGSVGElement, w: number, h: number): Promise<HTMLCanvasElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg rasterize failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draw the current-game reference under the assembly regions. */
function drawUnderlay(
  ctx: CanvasRenderingContext2D,
  assembly: Assembly,
  underlay: Underlay,
  zoom: number,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true; // reference is a guide, not pixel art
  if (underlay.mode === 'stretch') {
    ctx.drawImage(underlay.image, 0, 0, assembly.width * zoom, assembly.height * zoom);
  } else {
    for (const r of assembly.regions) {
      const crop = REF_CROPS[r.pieceId];
      const source = crop && underlay.sources[crop.src];
      if (!crop || !source) continue;
      const s = source.width / REF_VIEWBOX[crop.src].w;
      const sv = source.height / REF_VIEWBOX[crop.src].h;
      ctx.drawImage(
        source,
        crop.x * s, crop.y * sv, crop.w * s, crop.h * sv,
        r.x * zoom, r.y * zoom, r.w * zoom, r.h * zoom,
      );
    }
  }
  ctx.restore();
}

// ─── Layout ─────────────────────────────────────────────────────────────────
// Pack slots into rows. Each slot's paint box = nominal + halo on the
// non-strict axes; strict (tiling) axes get no halo so the period is exact.

interface SlotLayout {
  piece: PieceSpec;
  paint: { x: number; y: number; w: number; h: number };
  nominal: { x: number; y: number; w: number; h: number };
}

interface KitLayout {
  slots: SlotLayout[];
  width: number;
  height: number;
}

const GUTTER = 6;
const MARGIN = 8;
const MAX_ROW_W = 300; // art px before wrapping

function layoutKit(kit: KitSpec): KitLayout {
  const slots: SlotLayout[] = [];
  let x = MARGIN;
  let y = MARGIN;
  let rowH = 0;

  for (const piece of kit.pieces) {
    const halo = haloFor(piece.repeat);
    const paintW = piece.w + halo.x * 2;
    const paintH = piece.h + halo.y * 2;

    if (x > MARGIN && x + paintW > MAX_ROW_W) {
      x = MARGIN;
      y += rowH + GUTTER;
      rowH = 0;
    }

    slots.push({
      piece,
      paint: { x, y, w: paintW, h: paintH },
      nominal: { x: x + halo.x, y: y + halo.y, w: piece.w, h: piece.h },
    });

    x += paintW + GUTTER;
    rowH = Math.max(rowH, paintH);
  }

  return { slots, width: MAX_ROW_W + MARGIN, height: y + rowH + MARGIN };
}

// ─── Rendering ──────────────────────────────────────────────────────────────

/** 1× paint-over template: transparent slots, magenta paint-box outlines in
 *  the gutters, tinted nominal footprints. Paint on a layer ABOVE this. */
function renderTemplate(ctx: CanvasRenderingContext2D, layout: KitLayout): void {
  ctx.clearRect(0, 0, layout.width, layout.height);
  for (const slot of layout.slots) {
    const { paint, nominal } = slot;
    // Paint-box boundary — sits in the gutter, outside paintable pixels.
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(paint.x - 0.5, paint.y - 0.5, paint.w + 1, paint.h + 1);
    // Nominal footprint tint (inside the slot; you paint over it).
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.fillRect(nominal.x, nominal.y, nominal.w, nominal.h);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.45)';
    ctx.strokeRect(nominal.x + 0.5, nominal.y + 0.5, nominal.w - 1, nominal.h - 1);
  }
}

/** Zoomed legend with labels — reference only, not for painting. */
function renderLegend(ctx: CanvasRenderingContext2D, layout: KitLayout, kit: KitSpec, zoom: number): void {
  const w = layout.width * zoom;
  const h = layout.height * zoom + 20;
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(0, 0, w, h);

  for (const slot of layout.slots) {
    const { paint, nominal, piece } = slot;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(paint.x * zoom, paint.y * zoom, paint.w * zoom, paint.h * zoom);
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1;
    ctx.strokeRect(paint.x * zoom + 0.5, paint.y * zoom + 0.5, paint.w * zoom - 1, paint.h * zoom - 1);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.12)';
    ctx.fillRect(nominal.x * zoom, nominal.y * zoom, nominal.w * zoom, nominal.h * zoom);
    ctx.strokeStyle = '#22d3ee';
    ctx.strokeRect(nominal.x * zoom + 0.5, nominal.y * zoom + 0.5, nominal.w * zoom - 1, nominal.h * zoom - 1);

    ctx.fillStyle = '#e7e5e4';
    ctx.font = `${Math.max(9, zoom * 2.5)}px monospace`;
    ctx.textBaseline = 'top';
    const label = `${piece.id} ${piece.w}×${piece.h} ${REPEAT_INFO[piece.repeat].symbol}`;
    ctx.fillText(label, paint.x * zoom + 2, paint.y * zoom + 2, paint.w * zoom - 4);
  }

  ctx.fillStyle = '#a8a29e';
  ctx.font = `${Math.max(10, zoom * 3)}px monospace`;
  ctx.fillText(`${kit.name} — nominal sizes in art px; · fixed  ↔ tiles-x  ↕ tiles-y  ⤡ tiles-both`, 4, layout.height * zoom + 4);
}

/** Golden-angle hues so adjacent pieces never share a color. */
function pieceColor(index: number, alpha: number): string {
  return `hsla(${Math.round((index * 137.5) % 360)}, 65%, 55%, ${alpha})`;
}

function renderAssembly(
  ctx: CanvasRenderingContext2D,
  assembly: Assembly,
  kit: KitSpec,
  zoom: number,
  hoveredId: string | null,
  underlay?: Underlay,
): void {
  const colorIndex = new Map(kit.pieces.map((p, i) => [p.id, i]));
  ctx.fillStyle = '#0c0a09';
  ctx.fillRect(0, 0, assembly.width * zoom, assembly.height * zoom);

  if (underlay) drawUnderlay(ctx, assembly, underlay, zoom);

  // Honored paint halos first, under everything: the per-piece template's
  // magenta paint box, in the assembled sample. Anything painted inside is
  // CUT with the piece (unlike the frame regions, where out-of-region paint
  // is discarded).
  for (const r of assembly.regions) {
    if (!r.halo) continue;
    const hx = (r.x - r.halo.l) * zoom;
    const hy = (r.y - r.halo.t) * zoom;
    const hw = (r.w + r.halo.l + r.halo.r) * zoom;
    const hh = (r.h + r.halo.t + r.halo.b) * zoom;
    ctx.fillStyle = 'rgba(255, 0, 255, 0.07)';
    ctx.fillRect(hx, hy, hw, hh);
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(hx + 0.5, hy + 0.5, hw - 1, hh - 1);
  }

  for (const r of assembly.regions) {
    const idx = colorIndex.get(r.pieceId) ?? 0;
    const highlighted = hoveredId === r.pieceId;
    const dimmed = hoveredId !== null && !highlighted;
    // Over a reference the regions become mostly-transparent overlays so the
    // current-game render stays readable; solo they carry the whole picture.
    // Alternating repeat shades make each tile period visible either way.
    const baseAlpha = underlay
      ? (r.rep % 2 === 0 ? 0.16 : 0.08)
      : (r.rep % 2 === 0 ? 0.72 : 0.45);
    const alpha = highlighted ? (underlay ? 0.45 : 0.95) : dimmed ? baseAlpha * 0.25 : baseAlpha;
    // Guide regions read as ghosts: dashed outline, faint fill — they show
    // where the live renderer puts the piece, not where to paint it.
    ctx.fillStyle = pieceColor(idx, r.guide ? alpha * 0.35 : alpha);
    ctx.fillRect(r.x * zoom, r.y * zoom, r.w * zoom, r.h * zoom);
    ctx.strokeStyle = highlighted ? '#ffffff' : underlay ? pieceColor(idx, 0.8) : 'rgba(0,0,0,0.55)';
    ctx.lineWidth = highlighted ? 2 : 1;
    ctx.setLineDash(r.guide ? [3, 3] : []);
    ctx.strokeRect(r.x * zoom + 0.5, r.y * zoom + 0.5, r.w * zoom - 1, r.h * zoom - 1);
    ctx.setLineDash([]);
  }

  // Name the hovered piece next to its first region.
  if (hoveredId) {
    const first = assembly.regions.find(r => r.pieceId === hoveredId);
    if (first) {
      ctx.font = '11px monospace';
      const label = hoveredId;
      const tw = ctx.measureText(label).width;
      const lx = Math.min(first.x * zoom, assembly.width * zoom - tw - 6);
      const ly = Math.max(0, first.y * zoom - 14);
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(lx, ly, tw + 6, 13);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'top';
      ctx.fillText(label, lx + 3, ly + 1);
    }
  }
}

function downloadCanvas(draw: (ctx: CanvasRenderingContext2D) => void, w: number, h: number, filename: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  draw(ctx);
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ──────────────────────────────────────────────────────────────

export const PanelForge: React.FC = () => {
  const [kits, setKits] = useState<KitSpec[]>(loadKits);
  const [selectedId, setSelectedId] = useState<string>(kits[0]?.id ?? 'window-panel');
  const [hoveredPieceId, setHoveredPieceId] = useState<string | null>(null);
  const [refSources, setRefSources] = useState<RefSources>({});
  const [uploadedRefs, setUploadedRefs] = useState<Map<string, HTMLImageElement>>(new Map());
  const [showRef, setShowRef] = useState(true);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const assemblyRef = useRef<HTMLCanvasElement>(null);
  const meshCaptureRef = useRef<HTMLDivElement>(null);

  const kit = kits.find(k => k.id === selectedId) ?? kits[0];
  const layout = useMemo(() => (kit ? layoutKit(kit) : null), [kit]);
  const assembly = useMemo(() => (kit ? assembleKit(kit) : null), [kit]);

  useEffect(() => saveKits(kits), [kits]);

  // Rasterize the live game meshes once on mount — these become the
  // draw-under reference ("the rendered mesh next to the texture map").
  useEffect(() => {
    const root = meshCaptureRef.current;
    if (!root) return;
    let cancelled = false;
    (async () => {
      try {
        const portSvg = root.querySelector<SVGSVGElement>('[data-capture="portcullis"] svg');
        const gemSvg = root.querySelector<SVGSVGElement>('[data-capture="gem"] svg');
        const beamSvg = root.querySelector<SVGSVGElement>('[data-capture="gatebeam"] svg');
        const sources: RefSources = {};
        if (portSvg) sources.portcullis = await rasterizeSvg(portSvg, 2000, 128);
        if (gemSvg) sources.gem = await rasterizeSvg(gemSvg, 400, 140);
        if (beamSvg) sources.gatebeam = await rasterizeSvg(beamSvg, 1600, 208);
        if (!cancelled) setRefSources(sources);
      } catch {
        // Reference is a nicety — the colored assembly still works without it.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Which reference applies to this kit: mesh crops where the game has a
  // real SVG (gate/rail/gem), otherwise a user-uploaded screenshot.
  const kitHasMeshRef = !!kit && kit.pieces.some(p => REF_CROPS[p.id]);
  const underlay: Underlay | undefined = useMemo(() => {
    if (!kit || !showRef) return undefined;
    if (kitHasMeshRef && (refSources.portcullis || refSources.gem || refSources.gatebeam)) {
      return { mode: 'crops', sources: refSources };
    }
    const uploaded = uploadedRefs.get(kit.id);
    return uploaded ? { mode: 'stretch', image: uploaded } : undefined;
  }, [kit, showRef, kitHasMeshRef, refSources, uploadedRefs]);

  // Assembled view — the pieces in their real positions, color-coded.
  useEffect(() => {
    const canvas = assemblyRef.current;
    if (!canvas || !kit || !assembly) return;
    const zoom = Math.min(4, Math.max(2, Math.floor(380 / assembly.width)));
    canvas.width = assembly.width * zoom;
    canvas.height = assembly.height * zoom;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    renderAssembly(ctx, assembly, kit, zoom, hoveredPieceId, underlay);
  }, [kit, assembly, hoveredPieceId, underlay]);

  const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !kit) return;
    const img = new Image();
    img.onload = () => setUploadedRefs(prev => new Map(prev).set(kit.id, img));
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  };

  // On-screen preview = the legend at 3×.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !kit || !layout) return;
    const zoom = 3;
    canvas.width = layout.width * zoom;
    canvas.height = layout.height * zoom + 20;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    renderLegend(ctx, layout, kit, zoom);
  }, [kit, layout]);

  if (!kit || !layout) return null;

  const updateKit = (updated: KitSpec) => {
    setKits(prev => prev.map(k => (k.id === updated.id ? updated : k)));
  };

  const updatePiece = (pieceId: string, field: 'w' | 'h', value: number) => {
    updateKit({
      ...kit,
      pieces: kit.pieces.map(p => (p.id === pieceId ? { ...p, [field]: Math.max(1, Math.round(value)) } : p)),
    });
  };

  const duplicateKit = () => {
    const copy: KitSpec = {
      ...kit,
      id: `${kit.id}-copy-${Date.now().toString(36)}`,
      name: `${kit.name} (variant)`,
      builtIn: false,
      pieces: kit.pieces.map(p => ({ ...p })),
    };
    setKits(prev => [...prev, copy]);
    setSelectedId(copy.id);
    toast.success('Kit duplicated — rename it and size it independently.');
  };

  const deleteKit = () => {
    if (kit.builtIn) return;
    if (!confirm(`Delete kit "${kit.name}"?`)) return;
    setKits(prev => prev.filter(k => k.id !== kit.id));
    setSelectedId(kits[0].id);
  };

  const resetKit = () => {
    const def = DEFAULT_KITS.find(d => d.id === kit.id);
    if (!def) return;
    updateKit({ ...def });
    toast.success('Kit reset to default sizes.');
  };

  const exportTemplate = () => {
    downloadCanvas(ctx => renderTemplate(ctx, layout), layout.width, layout.height, `panel-forge-${kit.id}-template.png`);
  };

  const exportLegend = () => {
    const zoom = 4;
    downloadCanvas(ctx => renderLegend(ctx, layout, kit, zoom), layout.width * zoom, layout.height * zoom + 20, `panel-forge-${kit.id}-legend.png`);
  };

  const exportManifest = () => {
    downloadJson(
      {
        version: 2,
        kitId: kit.id,
        name: kit.name,
        slots: layout.slots.map(s => ({
          id: s.piece.id,
          label: s.piece.label,
          repeat: s.piece.repeat,
          paint: s.paint,
          nominal: s.nominal,
          notes: s.piece.notes,
        })),
        // Slice map for the assembled workflow: paint the whole assembled
        // sample, the Phase 2 slicer extracts each piece from its first
        // region (tiled pieces: first period; later periods verify seams).
        assembled: assembly
          ? { width: assembly.width, height: assembly.height, regions: assembly.regions }
          : null,
      },
      `panel-forge-${kit.id}-manifest.json`,
    );
  };

  // Assembled workflow exports: paint the whole element in place. The
  // template carries the slice guides; the reference carries the current
  // game render — stack reference (bottom), your paint layer (middle),
  // template guides (top, hidden on export).
  const exportAssembledTemplate = () => {
    if (!assembly) return;
    downloadCanvas(ctx => {
      ctx.clearRect(0, 0, assembly.width, assembly.height);
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, assembly.width - 1, assembly.height - 1);
      // HALO PAINT BOXES first (magenta, under the nominal outlines): the
      // extra paint room around halo'd cuts — plate caps, ornaments, the
      // v21 corner overhang rows. Without these the downloaded template
      // showed only nominal outlines and the halo rows were visually
      // identical to the sheet's dead areas — the on-screen assembled view
      // marked them but the PNG the artist actually paints against did not.
      for (const r of assembly.regions) {
        if (r.guide || !r.halo) continue;
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)';
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(
          r.x - r.halo.l + 0.5, r.y - r.halo.t + 0.5,
          r.w + r.halo.l + r.halo.r - 1, r.h + r.halo.t + r.halo.b - 1,
        );
      }
      for (const r of assembly.regions) {
        // Guides dashed + dimmer: placement previews, not paint slots.
        ctx.strokeStyle = r.guide ? 'rgba(0, 255, 255, 0.28)' : 'rgba(0, 255, 255, 0.55)';
        ctx.setLineDash(r.guide ? [2, 2] : []);
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }
      ctx.setLineDash([]);
    }, assembly.width, assembly.height, `panel-forge-${kit.id}-assembled-template.png`);
  };

  const exportReference = () => {
    if (!assembly || !underlay) return;
    downloadCanvas(ctx => {
      drawUnderlay(ctx, assembly, underlay, 1);
    }, assembly.width, assembly.height, `panel-forge-${kit.id}-reference.png`);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Off-screen mount of the LIVE game meshes, rasterized on load into
          the reference underlay. Sized only so the SVGs exist to serialize. */}
      <div
        ref={meshCaptureRef}
        aria-hidden="true"
        style={{ position: 'absolute', left: -10000, top: 0, width: 500, height: 100, visibility: 'hidden' }}
      >
        <div data-capture="portcullis"><PortcullisMesh /></div>
        <div data-capture="gem"><GemMesh tone="emerald" /></div>
        <div data-capture="gatebeam"><GateBeamMesh /></div>
      </div>

      {/* Kit list */}
      <div className="w-64 flex-shrink-0 border-r border-stone-700 p-3 space-y-2 overflow-y-auto">
        <h2 className="text-lg font-bold font-medieval text-copper-400">
          Panel Forge{' '}
          {/* The defaults version doubles as a STALE-TAB detector: an open
              tab keeps its loaded bundle, and a stale slicer cuts from old
              coordinates while sheet + template are current (cost the user
              a baffling wrong-cap round, 2026-08-02). If this number is
              behind the repo's DEFAULTS_VERSION, hard-refresh. */}
          <span className="text-[10px] font-mono font-normal text-stone-500 align-middle" title="Kit defaults version — if a session note says the kits changed and this number hasn't, hard-refresh the tab.">v{DEFAULTS_VERSION}</span>
        </h2>
        <p className="text-xs text-stone-400">
          Piece specs + paint-over templates for the pixel-art UI surfaces. Sizes are art pixels
          (a board tile is 24).
        </p>
        {kits.map(k => (
          <button
            key={k.id}
            onClick={() => setSelectedId(k.id)}
            className={`w-full text-left p-2 rounded text-sm ${
              k.id === kit.id ? 'bg-arcane-700 text-parchment-100' : 'dungeon-panel hover:bg-stone-700'
            }`}
          >
            {k.name}
            {!k.builtIn && <span className="ml-1 text-[10px] text-copper-300">(variant)</span>}
          </button>
        ))}
        <div className="pt-2 space-y-1">
          <button onClick={duplicateKit} className="w-full dungeon-btn text-xs py-1.5">⎘ Duplicate kit</button>
          {kit.builtIn ? (
            <button onClick={resetKit} className="w-full px-2 py-1.5 text-xs bg-stone-700 hover:bg-stone-600 rounded">Reset sizes</button>
          ) : (
            <button onClick={deleteKit} className="w-full px-2 py-1.5 text-xs bg-blood-700 hover:bg-blood-600 rounded">Delete kit</button>
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0 p-4 space-y-4 overflow-y-auto">
        <div>
          {kit.builtIn ? (
            <h3 className="text-xl font-bold font-medieval text-copper-400">{kit.name}</h3>
          ) : (
            <input
              value={kit.name}
              onChange={e => updateKit({ ...kit, name: e.target.value })}
              className="text-xl font-bold font-medieval text-copper-400 bg-transparent border-b border-stone-600 focus:border-copper-400 outline-none"
            />
          )}
          <p className="text-sm text-stone-400 mt-1 max-w-2xl">{kit.description}</p>
        </div>

        {/* Exports */}
        <div className="flex flex-wrap gap-2">
          <button onClick={exportAssembledTemplate} className="dungeon-btn-success text-sm px-4 py-2" disabled={!assembly}>⬇ Assembled template (1×)</button>
          <button onClick={exportReference} className="dungeon-btn text-sm px-4 py-2" disabled={!assembly || !underlay} title={!underlay ? 'No reference available — upload a screenshot or enable Show reference' : undefined}>⬇ Reference PNG (1×)</button>
          <button onClick={exportTemplate} className="dungeon-btn text-sm px-4 py-2">⬇ Per-piece template (1×)</button>
          <button onClick={exportLegend} className="dungeon-btn text-sm px-4 py-2">⬇ Legend PNG (4×)</button>
          <button onClick={exportManifest} className="dungeon-btn text-sm px-4 py-2">⬇ Manifest JSON</button>
        </div>

        {/* PHASE 2 — the return trip. Phase 1 could only send you out to your
            art tool; this brings the painted sheet back, cuts it here, and
            (where the browser allows) re-reads it whenever you save, so the
            loop is paint → ctrl+S → look, with nobody in the middle. */}
        <div className="max-w-2xl">
          <PanelForgeImport kit={kit} assembly={assembly} />
        </div>

        {/* How to paint */}
        <div className="dungeon-panel rounded p-3 text-xs text-stone-300 space-y-1 max-w-2xl">
          <p className="font-bold text-parchment-200">How to paint — assembled workflow (recommended)</p>
          <p>1. Stack three layers in your pixel tool: <strong>Reference PNG</strong> at the bottom (the current game render, your draw-under), your <strong>paint layer</strong> in the middle, and the <strong>Assembled template</strong> guides on top at low opacity.</p>
          <p>2. Paint the whole element in place, over the reference. Export with only your paint layer visible — the slicer cuts it into pieces using the manifest&apos;s slice map.</p>
          <p>3. <span className="text-cyan-300">Cyan lines</span> are the slice boundaries. For tiling pieces, keep each repeat identical — the slicer takes the first period and uses the later ones to verify the seams.</p>
          <p className="font-bold text-parchment-200 pt-1">Per-piece workflow (alternative)</p>
          <p>The per-piece template lays every slot out separately with overflow halos: nominal footprint (cyan tint) plus halo out to the magenta line. Art in the halo anchors like board sprites (center / outer corner / root). Smaller than nominal is always fine — transparent pixels don&apos;t render.</p>
        </div>

        {/* Assembled view — the mesh next to the texture map */}
        {assembly && (
          <div className="dungeon-panel rounded p-3 space-y-2 max-w-2xl">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-bold text-parchment-200">Assembled view</p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-stone-300 cursor-pointer">
                  <input type="checkbox" checked={showRef} onChange={e => setShowRef(e.target.checked)} />
                  Show current-game reference
                </label>
                {!kitHasMeshRef && (
                  <label className="text-xs text-arcane-300 hover:text-arcane-200 cursor-pointer underline">
                    Upload screenshot reference…
                    <input type="file" accept="image/*" onChange={handleRefUpload} className="hidden" />
                  </label>
                )}
              </div>
            </div>
            <p className="text-xs text-stone-400">
              Where each piece lives once built, using your current sizes.
              {kitHasMeshRef
                ? ' The underlay is the LIVE game mesh, so proportions are the real thing — draw against it.'
                : ' This kit has no SVG mesh in the game (it’s DOM-rendered); upload a cropped screenshot of the element to draw against.'}
              {' '}Alternating shades mark one tile repeat; hover a piece (chips below, or table rows) to highlight it.
            </p>
            <canvas
              ref={assemblyRef}
              className="border border-stone-700 rounded max-w-full"
              style={{ imageRendering: 'pixelated' }}
              onMouseLeave={() => setHoveredPieceId(null)}
            />
            <div className="flex flex-wrap gap-1.5">
              {kit.pieces.map((p, i) => (
                <span
                  key={p.id}
                  onMouseEnter={() => setHoveredPieceId(p.id)}
                  onMouseLeave={() => setHoveredPieceId(null)}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono cursor-default ${
                    hoveredPieceId === p.id ? 'bg-stone-600 text-parchment-100' : 'bg-stone-800 text-stone-300'
                  }`}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: pieceColor(i, 1) }} />
                  {p.id}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Spec table */}
        <div className="dungeon-panel rounded p-3 overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="text-stone-400 text-left">
                <th className="pr-4 pb-2">Piece</th>
                <th className="pr-4 pb-2">Nominal W</th>
                <th className="pr-4 pb-2">Nominal H</th>
                <th className="pr-4 pb-2">Behavior</th>
                <th className="pb-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {kit.pieces.map(p => (
                <tr
                  key={p.id}
                  onMouseEnter={() => setHoveredPieceId(p.id)}
                  onMouseLeave={() => setHoveredPieceId(null)}
                  className={`border-t border-stone-700/60 ${hoveredPieceId === p.id ? 'bg-stone-700/40' : ''}`}
                >
                  <td className="pr-4 py-1.5 font-mono text-parchment-200">{p.id}</td>
                  <td className="pr-4 py-1.5">
                    <input
                      type="number"
                      min={1}
                      value={p.w}
                      onChange={e => updatePiece(p.id, 'w', Number(e.target.value))}
                      className="w-16 px-1.5 py-0.5 bg-stone-700 rounded"
                    />
                  </td>
                  <td className="pr-4 py-1.5">
                    <input
                      type="number"
                      min={1}
                      value={p.h}
                      onChange={e => updatePiece(p.id, 'h', Number(e.target.value))}
                      className="w-16 px-1.5 py-0.5 bg-stone-700 rounded"
                    />
                  </td>
                  <td className="pr-4 py-1.5 whitespace-nowrap">{REPEAT_INFO[p.repeat].symbol} {p.repeat}</td>
                  <td className="py-1.5 text-stone-400">{p.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Layout preview */}
        <div>
          <p className="text-xs text-stone-400 mb-2">
            Template layout (legend view). <span className="text-fuchsia-400">Magenta</span> = paint box,{' '}
            <span className="text-cyan-300">cyan</span> = nominal footprint.
          </p>
          <canvas ref={previewRef} className="border border-stone-700 rounded max-w-full" style={{ imageRendering: 'pixelated' }} />
        </div>
      </div>
    </div>
  );
};
