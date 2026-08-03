import React from 'react';

// ============================================================================
// PANEL SKINS — shared plumbing for forge-cut art on real game chrome
// ============================================================================
// Extracted from QuestBoxSkin when the portcullis surfaces joined the
// pipeline (2026-08-02). One law set for every skinned surface, earned the
// hard way on the quest box:
//   - HARDCODED art: each surface's slices JSON is committed source at
//     src/assets/panels/<kit-id>-slices.json; empty pieces = the procedural
//     mesh/CSS baseline renders untouched; clearing art = reverting the file.
//   - CANVAS COMPOSITOR: art draws into device-resolution canvases
//     (integer-rounded dpr, smoothing off) — immune to compositor
//     layerization around text, inter-layer seams, and tile phase drift.
//   - INTEGER GEOMETRY: bitmap art must land on whole CSS px (useCrispSnap
//     compensates via position:relative offsets — NEVER transform, which
//     creates the fractional-layer resample path).
//   - TRANSPARENCY IS SILHOUETTE: corner/cap art transparency shapes the
//     panel; nothing may paint behind a fixed piece's cutaways.
//   - Z=2: the forge preview approves art at ~2×; the renderer matches the
//     artist's reference. Integer always.

export const Z = 2;

export interface SkinPiece {
  id: string;
  w: number;
  h: number;
  halo?: { l: number; t: number; r: number; b: number };
  png: string;
}

interface SkinJsonPiece {
  id?: unknown;
  w?: unknown;
  h?: unknown;
  empty?: unknown;
  halo?: unknown;
  png?: unknown;
}

export const nomW = (p: SkinPiece) => p.w - (p.halo ? p.halo.l + p.halo.r : 0);
export const nomH = (p: SkinPiece) => p.h - (p.halo ? p.halo.t + p.halo.b : 0);

// The slices files are OVERWRITTEN BY HAND (that is their workflow), so this
// validates like user input, not like build output: every reject falls back
// to the baseline rendering, never to NaN geometry. Review-hardened.
const MAX_PIECE_PX = 512;

export function buildSkin(skinJson: unknown, expectedKitId: string): Map<string, SkinPiece> {
  const map = new Map<string, SkinPiece>();
  // `| null`: a file containing bare `null` is valid JSON — an unguarded
  // property access would throw at module evaluation and white-screen both
  // apps.
  const payload = skinJson as { kitId?: unknown; pieces?: SkinJsonPiece[] } | null;
  const raw = payload?.pieces;
  if (!Array.isArray(raw)) return map;
  if (payload?.kitId !== expectedKitId) {
    console.warn(`${expectedKitId}-slices.json carries kitId "${String(payload?.kitId)}" — expected "${expectedKitId}"; rendering the baseline.`);
    return map;
  }
  for (const p of raw) {
    if (p.empty === true) continue;
    if (typeof p.id !== 'string' || typeof p.png !== 'string' || !p.png.startsWith('data:image/')) continue;
    if (typeof p.w !== 'number' || typeof p.h !== 'number') continue;
    if (!Number.isFinite(p.w) || !Number.isFinite(p.h) || p.w < 1 || p.h < 1 || p.w > MAX_PIECE_PX || p.h > MAX_PIECE_PX) continue;
    // Halo only in the exporter's shape: four finite non-negative insets
    // strictly inside the bitmap; anything else drops the halo.
    let halo: SkinPiece['halo'];
    const h = p.halo as { l?: unknown; t?: unknown; r?: unknown; b?: unknown } | undefined;
    if (h && typeof h === 'object') {
      const vals = [h.l, h.t, h.r, h.b];
      const ok = vals.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)
        && (h.l as number) + (h.r as number) < p.w
        && (h.t as number) + (h.b as number) < p.h;
      if (ok) halo = { l: h.l as number, t: h.t as number, r: h.r as number, b: h.b as number };
    }
    map.set(p.id, { id: p.id, w: p.w, h: p.h, halo, png: p.png });
  }
  return map;
}

/** The forge's freshly-cut slice shape (PanelForgeImport's Slice, minimally). */
export interface ForgeSlice {
  pieceId: string;
  w: number;
  h: number;
  url: string;
  empty?: boolean;
  halo?: { l: number; t: number; r: number; b: number };
}

/**
 * Build a skin map from forge slices — the live-preview path. Same
 * validation and image plumbing as the committed-JSON path, so the forge
 * preview and the game renderer literally share their draw code.
 */
export const skinFromSlices = (kitId: string, slices: ForgeSlice[]): Map<string, SkinPiece> =>
  buildSkin({
    version: 1,
    kitId,
    pieces: slices.map(s => ({ id: s.pieceId, w: s.w, h: s.h, empty: !!s.empty, halo: s.halo, png: s.url })),
  }, kitId);

/** Positive modulo — tile phase alignment. */
export const pmod = (v: number, m: number) => ((v % m) + m) % m;

/**
 * Snap an element to whole CSS pixels. Compensation uses POSITION:RELATIVE
 * left/top — never transform, which can promote the subtree to a composited
 * layer resampled at the fractional offset. Snapped elements must carry
 * position: relative. `defer` puts a child a frame behind its snapped
 * ancestor (it otherwise measures the pre-snap position).
 */
export function useCrispSnap<T extends HTMLElement>(active: boolean, defer = false) {
  const ref = React.useRef<T>(null);
  React.useLayoutEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const snap = () => {
      el.style.left = '0px';
      el.style.top = '0px';
      const r = el.getBoundingClientRect();
      const dx = Math.round(r.left) - r.left;
      const dy = Math.round(r.top) - r.top;
      el.style.left = `${dx.toFixed(3)}px`;
      el.style.top = `${dy.toFixed(3)}px`;
    };
    const run = () => {
      cancelAnimationFrame(raf);
      raf = defer
        ? requestAnimationFrame(() => { raf = requestAnimationFrame(snap); })
        : requestAnimationFrame(snap);
    };
    if (defer) run(); else snap();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    ro.observe(document.documentElement);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [active, defer]);
  return ref;
}

// ─── Canvas plumbing ────────────────────────────────────────────────────────

const IMG_CACHE = new Map<string, HTMLImageElement>();
export const imgFor = (p: SkinPiece): HTMLImageElement => {
  // Keyed by png (not id): two kits may share a piece id with different art.
  let img = IMG_CACHE.get(p.png);
  if (!img) {
    img = new Image();
    img.src = p.png;
    IMG_CACHE.set(p.png, img);
  }
  return img;
};

export const whenDecoded = (pieces: SkinPiece[]): Promise<unknown> =>
  Promise.all(pieces.map(p => {
    const img = imgFor(p);
    return img.complete ? Promise.resolve() : img.decode().catch(() => { /* draw skips broken images */ });
  }));

/** Draw a fixed piece at (x, y) in CSS-px canvas coordinates. */
export const drawFixed = (ctx: CanvasRenderingContext2D, p: SkinPiece | undefined, x: number, y: number) => {
  if (!p) return;
  const img = imgFor(p);
  if (!img.complete || !img.naturalWidth) return;
  ctx.drawImage(img, 0, 0, p.w, p.h, x, y, p.w * Z, p.h * Z);
};

/** Tile a piece across a rect, phase-anchored at (ax, ay). */
export const drawTiled = (
  ctx: CanvasRenderingContext2D,
  p: SkinPiece | undefined,
  dx: number, dy: number, dw: number, dh: number,
  ax: number, ay: number,
) => {
  if (!p || dw <= 0 || dh <= 0) return;
  const img = imgFor(p);
  if (!img.complete || !img.naturalWidth) return;
  const tw = p.w * Z;
  const th = p.h * Z;
  const startX = dx - pmod(dx - ax, tw);
  const startY = dy - pmod(dy - ay, th);
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  for (let y = startY; y < dy + dh; y += th) {
    for (let x = startX; x < dx + dw; x += tw) {
      ctx.drawImage(img, 0, 0, p.w, p.h, x, y, tw, th);
    }
  }
  ctx.restore();
};

/**
 * Prepare a canvas at device resolution for a CSS-px box, with bleed
 * margins for art overhang. Returns a 2D context pre-scaled so all drawing
 * uses CSS-px coordinates with (0,0) at the box's top-left.
 */
export const prepCanvas = (canvas: HTMLCanvasElement, w: number, h: number, bleed: number): CanvasRenderingContext2D | null => {
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  canvas.width = (w + bleed * 2) * dpr;
  canvas.height = (h + bleed * 2) * dpr;
  canvas.style.width = `${w + bleed * 2}px`;
  canvas.style.height = `${h + bleed * 2}px`;
  canvas.style.left = `${-bleed}px`;
  canvas.style.top = `${-bleed}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, bleed * dpr, bleed * dpr);
  ctx.imageSmoothingEnabled = false;
  return ctx;
};

/** Max halo overhang in CSS px (8 art px each side). */
export const BLEED = 8 * Z;

/**
 * The six bar x-fractions of the SVG MESHES (PortcullisMesh's BAR_XS/1000
 * = GateMesh's BAR_XS/400) — kept as the reference for the procedural
 * baselines. The skins no longer place bars by fraction: see barCenters.
 */
export const BAR_FRACS = [0.015, 0.209, 0.403, 0.597, 0.791, 0.985];

/**
 * Outer-bar inset from flush, in ART px (user call, 2026-08-02: "move the
 * true position of the end spikes inwards 2 pixels" — and with plates and
 * bars anchored on the same centers, the whole lattice column moves).
 * Renderers pass EDGE_BAR_INSET * Z; assemblers work in art px and pass
 * it raw.
 */
export const EDGE_BAR_INSET = 2;

/**
 * Bar CENTER positions across a surface `w` wide: the outer pair sits
 * `edgeInset` in from flush (edge bars contain the shape — the 2026-07-31
 * edge-bar reformat — pulled 2 art inward by the 2026-08-02 user call),
 * and the interior four are EVENLY SPACED between them (the old
 * fraction-based interior drifted off-pitch once the outer pair was
 * clamped). Plates and spikes center on these same values so the hardware
 * rides its bar, and BOTH renderers and BOTH assemblers use this one
 * helper — the menu's and the rail's columns stay one gate. Works in CSS
 * px (renderers) and art px (assemblers) alike: pass `barW` and
 * `edgeInset` in the same unit as `w`.
 */
export const barCenters = (w: number, barW: number, edgeInset = 0): number[] => {
  const first = Math.round(barW / 2) + edgeInset;
  const last = w - Math.round(barW / 2) - edgeInset;
  return Array.from({ length: 6 }, (_, i) => Math.round(first + (i * (last - first)) / 5));
};
