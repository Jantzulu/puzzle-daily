import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../shared/Toast';
import { PortcullisMesh } from '../game/PortcullisMesh';
import { GemMesh } from '../game/GemMesh';

// ============================================================================
// PANEL FORGE — nine-slice / tiling-piece spec + template exporter (Phase 1)
// ============================================================================
// Maps out exactly which pixel pieces each themeable UI surface needs, at
// what sizes, and exports paint-over templates:
//   - Template PNG (1× art pixels): transparent slots with guide markings —
//     paint on a layer above it, hide the template layer on export.
//   - Legend PNG (4×): the same layout, labeled, for reference.
//   - Manifest JSON: machine-readable slot coordinates so the Phase 2
//     importer can auto-slice a painted sheet without guessing.
//
// Core rules the templates encode:
//   - Every slot has a NOMINAL footprint (the layout size, tinted) plus an
//     OVERFLOW HALO around it. Art may exceed the nominal bounds into the
//     halo — the renderer anchors it (center / outer corner / root), same as
//     board sprites exceeding their 24px tile. Smaller art is always fine.
//   - Tiling pieces are STRICT in their tiling axis (must repeat seamlessly
//     at exactly the nominal period) and flexible in the cross axis.
//   - Kits are duplicable: variants (e.g. a Defeat window styled differently
//     from Victory) are copies of a kit painted independently.

type RepeatMode = 'fixed' | 'tile-x' | 'tile-y' | 'tile-xy';

interface PieceSpec {
  id: string;
  label: string;
  w: number; // nominal art px (editable)
  h: number;
  repeat: RepeatMode;
  notes?: string;
}

interface KitSpec {
  id: string;
  name: string;
  builtIn?: boolean;
  description: string;
  pieces: PieceSpec[];
}

const REPEAT_INFO: Record<RepeatMode, { symbol: string; blurb: string }> = {
  fixed: { symbol: '·', blurb: 'fixed — may overflow in any direction' },
  'tile-x': { symbol: '↔', blurb: 'tiles horizontally — width is a strict period, height may overflow' },
  'tile-y': { symbol: '↕', blurb: 'tiles vertically — height is a strict period, width may overflow' },
  'tile-xy': { symbol: '⤡', blurb: 'tiles both ways — both dimensions are strict periods' },
};

// Overflow headroom (art px) added around each slot on the non-strict axes.
const HALO = 8;

const nineSlice = (corner: number, edge: number, center: number): PieceSpec[] => [
  { id: 'corner-tl', label: 'Corner TL', w: corner, h: corner, repeat: 'fixed', notes: 'Anchors at its outer corner; ornament may overflow outward.' },
  { id: 'corner-tr', label: 'Corner TR', w: corner, h: corner, repeat: 'fixed' },
  { id: 'corner-bl', label: 'Corner BL', w: corner, h: corner, repeat: 'fixed' },
  { id: 'corner-br', label: 'Corner BR', w: corner, h: corner, repeat: 'fixed' },
  { id: 'edge-top', label: 'Edge Top', w: center, h: edge, repeat: 'tile-x', notes: 'Ends must meet the top corners seamlessly.' },
  { id: 'edge-bottom', label: 'Edge Bottom', w: center, h: edge, repeat: 'tile-x' },
  { id: 'edge-left', label: 'Edge Left', w: edge, h: center, repeat: 'tile-y' },
  { id: 'edge-right', label: 'Edge Right', w: edge, h: center, repeat: 'tile-y' },
  { id: 'center', label: 'Center Fill', w: center, h: center, repeat: 'tile-xy', notes: 'The panel background; keep it quiet so content reads.' },
  { id: 'divider', label: 'Section Divider', w: center, h: 6, repeat: 'tile-x', notes: 'Horizontal rule between panel sections.' },
];

const buttonStates = (state: string): PieceSpec[] => [
  { id: `btn-${state}-cap-l`, label: `Button ${state} · Cap L`, w: 6, h: 16, repeat: 'fixed' },
  { id: `btn-${state}-mid`, label: `Button ${state} · Middle`, w: 12, h: 16, repeat: 'tile-x', notes: 'Stretch zone between the caps.' },
  { id: `btn-${state}-cap-r`, label: `Button ${state} · Cap R`, w: 6, h: 16, repeat: 'fixed' },
];

const DEFAULT_KITS: KitSpec[] = [
  {
    id: 'window-panel',
    name: 'Window Panel (base)',
    builtIn: true,
    description: 'Nine-slice kit for popup windows (victory, defeat, concede, help…). Duplicate this kit to give any window family its own look — surfaces are mapped to kits in Phase 2.',
    pieces: nineSlice(12, 12, 24),
  },
  {
    id: 'under-board-panel',
    name: 'Under-Board Panel',
    builtIn: true,
    description: 'The cohesive panel wrapping the quest banner and everything below the puzzle. Same nine-slice anatomy as windows, sized independently.',
    pieces: nineSlice(12, 12, 24),
  },
  {
    id: 'portcullis-gate',
    name: 'Portcullis Gate (bars)',
    builtIn: true,
    description: 'The gate bars rising above the control rail (currently the top zone of PortcullisMesh). Proportions derived from the live mesh: bars are narrow — about 5 art px on a 144 art px rail.',
    pieces: [
      { id: 'bar-segment', label: 'Gate Bar Segment', w: 5, h: 16, repeat: 'tile-y', notes: 'One bar: lit left edge, shaded right. Repeats upward behind the board.' },
      { id: 'bar-top-cap', label: 'Bar Top Cap', w: 5, h: 4, repeat: 'fixed', notes: 'Optional finial where a bar ends.' },
    ],
  },
  {
    id: 'control-rail',
    name: 'Control Rail',
    builtIn: true,
    description: 'The iron rail the game controls sit on, with its forge plates and hanging spikes — independent from the gate bars so it can be forged differently. Proportions derived from the live mesh.',
    pieces: [
      { id: 'rail-face', label: 'Rail Face', w: 24, h: 16, repeat: 'tile-x', notes: 'The flat band the DOM controls sit on. Lit top edge, dark bottom lip.' },
      { id: 'rail-cap-l', label: 'Rail Cap L', w: 8, h: 16, repeat: 'fixed' },
      { id: 'rail-cap-r', label: 'Rail Cap R', w: 8, h: 16, repeat: 'fixed' },
      { id: 'forge-plate', label: 'Forge Plate', w: 4, h: 4, repeat: 'fixed', notes: 'Square bolt plate where a gate bar meets the rail, just below its lit top edge.' },
      { id: 'rail-spike', label: 'Rail Spike', w: 7, h: 7, repeat: 'fixed', notes: 'Hangs below the rail; anchors at its root (top edge).' },
    ],
  },
  {
    id: 'play-gem',
    name: 'Play Gem',
    builtIn: true,
    description: 'The action-button gem — a WIDE table-cut stone (the live mesh is 200×70, ≈2.9:1), not a square. One slot per interaction state; anchors CENTER, so painting larger keeps it centered.',
    pieces: [
      { id: 'gem-normal', label: 'Gem · Normal', w: 64, h: 22, repeat: 'fixed' },
      { id: 'gem-hover', label: 'Gem · Hover', w: 64, h: 22, repeat: 'fixed' },
      { id: 'gem-pressed', label: 'Gem · Pressed', w: 64, h: 22, repeat: 'fixed' },
    ],
  },
  {
    id: 'buttons',
    name: 'Buttons',
    builtIn: true,
    description: 'Three-slice buttons (cap / tiling middle / cap) × three states. Middles must tile seamlessly against both caps.',
    pieces: [...buttonStates('normal'), ...buttonStates('hover'), ...buttonStates('pressed')],
  },
];

// ─── Persistence ────────────────────────────────────────────────────────────
const STORAGE_KEY = 'panel_forge_kits_v1';
// Bump when DEFAULT_KITS change shape/sizes: stored BUILT-IN kits are then
// replaced with the fresh defaults (mesh-derived proportions); user variants
// are kept as-is.
const DEFAULTS_VERSION = 2;

function loadKits(): KitSpec[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_KITS;
    const parsed = JSON.parse(raw) as KitSpec[] | { v: number; kits: KitSpec[] };
    const stored = Array.isArray(parsed) ? parsed : parsed.kits;
    const version = Array.isArray(parsed) ? 1 : parsed.v;
    if (version < DEFAULTS_VERSION) {
      const customs = stored.filter(k => !k.builtIn);
      return [...DEFAULT_KITS, ...customs];
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

interface RefCrop { src: 'portcullis' | 'gem'; x: number; y: number; w: number; h: number }

// PortcullisMesh viewBox 1000×64: bars zone y 0–20, rail 20–52, spikes 52–64;
// bars centered at x=100..900 (half-width 15), spikes half-width 22, plates
// 22×7 at y=31. GemMesh viewBox 200×70.
const REF_CROPS: Record<string, RefCrop> = {
  'bar-segment': { src: 'portcullis', x: 85, y: 0, w: 30, h: 20 },
  'bar-top-cap': { src: 'portcullis', x: 85, y: 0, w: 30, h: 6 },
  'rail-face': { src: 'portcullis', x: 360, y: 20, w: 80, h: 32 },
  'rail-cap-l': { src: 'portcullis', x: 0, y: 20, w: 40, h: 32 },
  'rail-cap-r': { src: 'portcullis', x: 960, y: 20, w: 40, h: 32 },
  'forge-plate': { src: 'portcullis', x: 87, y: 30, w: 26, h: 9 },
  'rail-spike': { src: 'portcullis', x: 78, y: 52, w: 44, h: 12 },
  'gem-normal': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  'gem-hover': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  'gem-pressed': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
};

const REF_VIEWBOX: Record<RefCrop['src'], { w: number; h: number }> = {
  portcullis: { w: 1000, h: 64 },
  gem: { w: 200, h: 70 },
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

function haloFor(repeat: RepeatMode): { x: number; y: number } {
  switch (repeat) {
    case 'fixed': return { x: HALO, y: HALO };
    case 'tile-x': return { x: 0, y: HALO };
    case 'tile-y': return { x: HALO, y: 0 };
    case 'tile-xy': return { x: 0, y: 0 };
  }
}

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

// ─── Assembled view ─────────────────────────────────────────────────────────
// The "rendered mesh" next to the "texture map": each kit drawn as the thing
// it becomes, with every region color-coded to its template piece and
// alternating shades marking each tile repeat. Geometry uses the CURRENT
// nominal sizes, so resizing a piece reshapes the assembly live.

interface AssemblyRegion {
  pieceId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rep: number; // repeat index — alternates shading to show the tile period
}

interface Assembly {
  regions: AssemblyRegion[];
  width: number;
  height: number;
}

type KitFamily = 'nine-slice' | 'gate' | 'rail' | 'gem' | 'buttons';

function kitFamily(kit: KitSpec): KitFamily | null {
  const ids = new Set(kit.pieces.map(p => p.id));
  if (ids.has('corner-tl')) return 'nine-slice';
  if (ids.has('bar-segment')) return 'gate';
  if (ids.has('rail-face')) return 'rail';
  if (ids.has('gem-normal')) return 'gem';
  if (ids.has('btn-normal-mid')) return 'buttons';
  return null;
}

/** Golden-angle hues so adjacent pieces never share a color. */
function pieceColor(index: number, alpha: number): string {
  return `hsla(${Math.round((index * 137.5) % 360)}, 65%, 55%, ${alpha})`;
}

function assembleNineSlice(kit: KitSpec): Assembly | null {
  const P = (id: string) => kit.pieces.find(p => p.id === id);
  const c = P('corner-tl');
  const et = P('edge-top');
  const eb = P('edge-bottom') ?? et;
  const el = P('edge-left');
  const er = P('edge-right') ?? el;
  const ct = P('center');
  const dv = P('divider');
  if (!c || !et || !eb || !el || !er || !ct) return null;

  const RX = 4; // top-edge repeats in the sample panel
  const RY = 3; // side-edge repeats
  const W = c.w * 2 + RX * et.w;
  const H = c.h * 2 + RY * el.h;
  const regions: AssemblyRegion[] = [];

  // Center fill first so edges/corners/divider draw over it.
  for (let y = c.h, j = 0; y < H - c.h; y += ct.h, j++) {
    for (let x = c.w, i = 0; x < W - c.w; x += ct.w, i++) {
      regions.push({ pieceId: 'center', x, y, w: Math.min(ct.w, W - c.w - x), h: Math.min(ct.h, H - c.h - y), rep: i + j });
    }
  }
  for (let i = 0; i < RX; i++) {
    regions.push({ pieceId: 'edge-top', x: c.w + i * et.w, y: 0, w: et.w, h: et.h, rep: i });
    regions.push({ pieceId: 'edge-bottom', x: c.w + i * eb.w, y: H - eb.h, w: eb.w, h: eb.h, rep: i });
  }
  for (let j = 0; j < RY; j++) {
    regions.push({ pieceId: 'edge-left', x: 0, y: c.h + j * el.h, w: el.w, h: el.h, rep: j });
    regions.push({ pieceId: 'edge-right', x: W - er.w, y: c.h + j * er.h, w: er.w, h: er.h, rep: j });
  }
  regions.push({ pieceId: 'corner-tl', x: 0, y: 0, w: c.w, h: c.h, rep: 0 });
  regions.push({ pieceId: 'corner-tr', x: W - c.w, y: 0, w: c.w, h: c.h, rep: 0 });
  regions.push({ pieceId: 'corner-bl', x: 0, y: H - c.h, w: c.w, h: c.h, rep: 0 });
  regions.push({ pieceId: 'corner-br', x: W - c.w, y: H - c.h, w: c.w, h: c.h, rep: 0 });
  if (dv) {
    const dy = c.h + Math.floor((H - c.h * 2) * 0.45);
    for (let x = c.w, i = 0; x < W - c.w; x += dv.w, i++) {
      regions.push({ pieceId: 'divider', x, y: dy, w: Math.min(dv.w, W - c.w - x), h: dv.h, rep: i });
    }
  }
  return { regions, width: W, height: H };
}

function assembleGate(kit: KitSpec): Assembly | null {
  const P = (id: string) => kit.pieces.find(p => p.id === id);
  const bs = P('bar-segment');
  const cap = P('bar-top-cap');
  const cs = P('cross-slat');
  const sp = P('gate-spike');
  if (!bs) return null;

  const BARS = 3;
  const REPS = 3;
  const spacing = bs.w * 4;
  const W = spacing * (BARS - 1) + bs.w * 3;
  const capH = cap?.h ?? 0;
  const H = capH + REPS * bs.h + (sp?.h ?? 0);
  const regions: AssemblyRegion[] = [];

  for (let b = 0; b < BARS; b++) {
    const x = bs.w + b * spacing;
    if (cap) regions.push({ pieceId: 'bar-top-cap', x: x + (bs.w - cap.w) / 2, y: 0, w: cap.w, h: cap.h, rep: b });
    for (let r = 0; r < REPS; r++) {
      regions.push({ pieceId: 'bar-segment', x, y: capH + r * bs.h, w: bs.w, h: bs.h, rep: r });
    }
    if (sp) regions.push({ pieceId: 'gate-spike', x: x + (bs.w - sp.w) / 2, y: capH + REPS * bs.h, w: sp.w, h: sp.h, rep: b });
  }
  if (cs) {
    const cy = capH + bs.h;
    for (let x = 0, i = 0; x < W; x += cs.w, i++) {
      regions.push({ pieceId: 'cross-slat', x, y: cy, w: Math.min(cs.w, W - x), h: cs.h, rep: i });
    }
  }
  return { regions, width: W, height: H };
}

function assembleRail(kit: KitSpec): Assembly | null {
  const P = (id: string) => kit.pieces.find(p => p.id === id);
  const rf = P('rail-face');
  const cl = P('rail-cap-l');
  const cr = P('rail-cap-r');
  const fp = P('forge-plate');
  const rs = P('rail-spike');
  if (!rf) return null;

  const REPS = 6;
  const clW = cl?.w ?? 0;
  const crW = cr?.w ?? 0;
  const W = clW + REPS * rf.w + crW;
  const H = rf.h + (rs?.h ?? 0);
  const regions: AssemblyRegion[] = [];

  for (let i = 0; i < REPS; i++) {
    regions.push({ pieceId: 'rail-face', x: clW + i * rf.w, y: 0, w: rf.w, h: rf.h, rep: i });
  }
  if (cl) regions.push({ pieceId: 'rail-cap-l', x: 0, y: 0, w: cl.w, h: cl.h, rep: 0 });
  if (cr) regions.push({ pieceId: 'rail-cap-r', x: W - cr.w, y: 0, w: cr.w, h: cr.h, rep: 0 });
  const anchors = [0.2, 0.5, 0.8].map(f => clW + (W - clW - crW) * f);
  if (fp) anchors.forEach((ax, i) => regions.push({ pieceId: 'forge-plate', x: ax - fp.w / 2, y: 2, w: fp.w, h: fp.h, rep: i }));
  if (rs) anchors.forEach((ax, i) => regions.push({ pieceId: 'rail-spike', x: ax - rs.w / 2, y: rf.h, w: rs.w, h: rs.h, rep: i }));
  return { regions, width: W, height: H };
}

function assembleGem(kit: KitSpec): Assembly | null {
  const states = kit.pieces.filter(p => p.repeat === 'fixed');
  if (states.length === 0) return null;
  const gap = 10;
  let x = 0;
  const regions: AssemblyRegion[] = [];
  let maxH = 0;
  for (const s of states) {
    regions.push({ pieceId: s.id, x, y: 0, w: s.w, h: s.h, rep: 0 });
    x += s.w + gap;
    maxH = Math.max(maxH, s.h);
  }
  return { regions, width: x - gap, height: maxH };
}

function assembleButtons(kit: KitSpec): Assembly | null {
  const states = ['normal', 'hover', 'pressed'];
  const regions: AssemblyRegion[] = [];
  let y = 0;
  let W = 0;
  for (const state of states) {
    const cl = kit.pieces.find(p => p.id === `btn-${state}-cap-l`);
    const mid = kit.pieces.find(p => p.id === `btn-${state}-mid`);
    const cr = kit.pieces.find(p => p.id === `btn-${state}-cap-r`);
    if (!cl || !mid || !cr) continue;
    let x = 0;
    regions.push({ pieceId: cl.id, x, y, w: cl.w, h: cl.h, rep: 0 });
    x += cl.w;
    for (let i = 0; i < 3; i++) {
      regions.push({ pieceId: mid.id, x, y, w: mid.w, h: mid.h, rep: i });
      x += mid.w;
    }
    regions.push({ pieceId: cr.id, x, y, w: cr.w, h: cr.h, rep: 0 });
    x += cr.w;
    W = Math.max(W, x);
    y += Math.max(cl.h, mid.h, cr.h) + 6;
  }
  return regions.length ? { regions, width: W, height: y - 6 } : null;
}

function assembleKit(kit: KitSpec): Assembly | null {
  switch (kitFamily(kit)) {
    case 'nine-slice': return assembleNineSlice(kit);
    case 'gate': return assembleGate(kit);
    case 'rail': return assembleRail(kit);
    case 'gem': return assembleGem(kit);
    case 'buttons': return assembleButtons(kit);
    default: return null;
  }
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
    ctx.fillStyle = pieceColor(idx, alpha);
    ctx.fillRect(r.x * zoom, r.y * zoom, r.w * zoom, r.h * zoom);
    ctx.strokeStyle = highlighted ? '#ffffff' : underlay ? pieceColor(idx, 0.8) : 'rgba(0,0,0,0.55)';
    ctx.lineWidth = highlighted ? 2 : 1;
    ctx.strokeRect(r.x * zoom + 0.5, r.y * zoom + 0.5, r.w * zoom - 1, r.h * zoom - 1);
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
        const sources: RefSources = {};
        if (portSvg) sources.portcullis = await rasterizeSvg(portSvg, 2000, 128);
        if (gemSvg) sources.gem = await rasterizeSvg(gemSvg, 400, 140);
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
    if (kitHasMeshRef && (refSources.portcullis || refSources.gem)) {
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
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.55)';
      for (const r of assembly.regions) {
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }
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
      </div>

      {/* Kit list */}
      <div className="w-64 flex-shrink-0 border-r border-stone-700 p-3 space-y-2 overflow-y-auto">
        <h2 className="text-lg font-bold font-medieval text-copper-400">Panel Forge</h2>
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
