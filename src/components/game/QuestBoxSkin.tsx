import React from 'react';
import skinJson from '../../assets/panels/quest-box-slices.json';

// ============================================================================
// QUEST BOX SKIN — forge-cut art onto the real quest panel
// ============================================================================
// The consumer of the Panel Forge's "Quest Box" kit. The artist paints the
// assembled sample (watch loop), exports slices, and drops the JSON at
// src/assets/panels/quest-box-slices.json — Vite hot-reloads and the live
// game page wears the art. HARDCODED BY DECISION (user, 2026-08-01): this is
// core chrome succeeding BannerMesh/PortcullisMesh, which are source, not
// theme knobs — committed art is versioned, revertable, and deploys
// atomically with this renderer to both apps. The checked-in placeholder has
// an empty pieces array, which renders NOTHING here and leaves Game.tsx's
// baseline CSS box untouched — restoring the baseline is `git revert` (or
// re-emptying the file), the same story as every visual experiment.
//
// Compositing mirrors PanelNineSlice (the forge's live preview) so what the
// artist approved there is what ships: center fill, then edge middles, caps,
// corners; the plate is a 3-slice whose DOM label rides ON TOP of the art
// (user call — the themable text survives). Halo'd plate bitmaps are bigger
// than their pieces; all geometry runs on NOMINAL sizes and the bitmaps
// overhang, so overflow ornament draws where it was painted.
//
// INTEGER ZOOM, SMOOTHING OFF — panel art obeys the board's law. Z=1: art
// pixels are CSS pixels (a 12px-corner frame reads ~12px thick, near the
// menu's iron weight). One knob if the painted look wants to be chunkier.

const Z = 1;

interface SkinPiece {
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

const nomW = (p: SkinPiece) => p.w - (p.halo ? p.halo.l + p.halo.r : 0);
const nomH = (p: SkinPiece) => p.h - (p.halo ? p.halo.t + p.halo.b : 0);

// The slices file is OVERWRITTEN BY HAND (that is its workflow), so this
// validates like user input, not like build output: every reject falls back
// to the baseline CSS box or to a smaller safe rendering, never to NaN
// geometry. Review-hardened 2026-08-01 (adversarial pass found the holes).
const MAX_PIECE_PX = 512;

function buildSkin(): Map<string, SkinPiece> {
  const map = new Map<string, SkinPiece>();
  // `| null`: a file containing bare `null` is valid JSON — without the
  // optional chain it would throw at module evaluation and white-screen
  // BOTH apps (Game.tsx is imported by App and PlayerApp).
  const payload = skinJson as { kitId?: unknown; pieces?: SkinJsonPiece[] } | null;
  const raw = payload?.pieces;
  if (!Array.isArray(raw)) return map;
  // Wrong kit's export (four other kits share these piece ids, and plain
  // nine-slice kits would render naked edge runs): baseline, loudly.
  if (payload?.kitId !== 'quest-box') {
    console.warn(`quest-box-slices.json carries kitId "${String(payload?.kitId)}" — expected "quest-box"; rendering the baseline box.`);
    return map;
  }
  for (const p of raw) {
    // Unpainted slots ship in the export flagged empty — they must not
    // produce blank layers that cover the art beneath them. Strict ===:
    // a hand-edited string "false" is truthy and silently dropped art.
    if (p.empty === true) continue;
    if (typeof p.id !== 'string' || typeof p.png !== 'string' || !p.png.startsWith('data:image/')) continue;
    if (typeof p.w !== 'number' || typeof p.h !== 'number') continue;
    if (!Number.isFinite(p.w) || !Number.isFinite(p.h) || p.w < 1 || p.h < 1 || p.w > MAX_PIECE_PX || p.h > MAX_PIECE_PX) continue;
    // Halo only in the exporter's shape: four finite non-negative insets
    // strictly inside the bitmap. Anything else drops the halo (the piece
    // still renders at bitmap size) — a partial/garbage halo otherwise
    // cascades NaN into nominal sizes, the straddle, and the box padding.
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

const PIECES = buildSkin();
const P = (id: string) => PIECES.get(id);

/** The frame renders only when the minimum readable box exists. */
export const questSkinFrameActive = PIECES.has('corner-tl') && PIECES.has('center');
/** The plate art renders when its middle exists (caps optional). */
export const questSkinPlateActive = PIECES.has('plate-mid');
/**
 * The divider ("the side-quests rule", per the kit) renders when its middle
 * exists — it replaces the side-quests row's CSS border-t. Without this the
 * painted divider was cut, previewed, exported… and silently discarded,
 * the exact loss class the forge's repeat checker exists to prevent.
 */
export const questSkinDividerActive = PIECES.has('divider-mid');

// Border thicknesses come from the ART (corners define them, edges fall
// back) — frame pieces carry no halo, so nominal == bitmap.
const tl = P('corner-tl');
const tr = P('corner-tr');
const topMid = P('edge-top-mid');
const bottomMid = P('edge-bottom-mid');
const leftMid = P('edge-left-mid');
const rightMid = P('edge-right-mid');
export const questFrameBorders = {
  t: (tl?.h ?? topMid?.h ?? 0) * Z,
  b: (P('corner-bl')?.h ?? bottomMid?.h ?? 0) * Z,
  l: (tl?.w ?? leftMid?.w ?? 0) * Z,
  r: (tr?.w ?? rightMid?.w ?? 0) * Z,
};

const plateMid = P('plate-mid');
/** How far the plate pokes above the box's top edge (the preview's 60% rule). */
export const questPlateStraddle = plateMid ? Math.round(nomH(plateMid) * Z * 0.6) : 0;

const bg = (
  piece: SkinPiece | undefined,
  repeat: 'no-repeat' | 'repeat-x' | 'repeat-y' | 'repeat',
  style: React.CSSProperties,
): React.CSSProperties | null => {
  if (!piece) return null;
  return {
    position: 'absolute',
    backgroundImage: `url(${piece.png})`,
    backgroundRepeat: repeat,
    backgroundSize: `${piece.w * Z}px ${piece.h * Z}px`,
    imageRendering: 'pixelated',
    ...style,
  };
};

/**
 * The nine-slice frame, absolutely filling the quest box. Render it FIRST
 * inside the box and wrap the box's content in a `relative` div — absolute
 * layers otherwise paint over static text.
 */
export const QuestBoxFrame: React.FC = () => {
  if (!questSkinFrameActive) return null;
  const { t: bt, b: bb, l: bl, r: br } = questFrameBorders;
  const capTL = (P('edge-top-cap-l')?.w ?? 0) * Z;
  const capTR = (P('edge-top-cap-r')?.w ?? 0) * Z;
  const capBL = (P('edge-bottom-cap-l')?.w ?? 0) * Z;
  const capBR = (P('edge-bottom-cap-r')?.w ?? 0) * Z;
  const capLT = (P('edge-left-cap-t')?.h ?? 0) * Z;
  const capLB = (P('edge-left-cap-b')?.h ?? 0) * Z;
  const capRT = (P('edge-right-cap-t')?.h ?? 0) * Z;
  const capRB = (P('edge-right-cap-b')?.h ?? 0) * Z;

  const layers: Array<React.CSSProperties | null> = [
    // Same order as the forge preview: each run covers the clipped tail of
    // the one beneath it.
    bg(P('center'), 'repeat', { left: bl, right: br, top: bt, bottom: bb }),
    bg(topMid, 'repeat-x', { left: bl + capTL, right: br + capTR, top: 0, height: (topMid?.h ?? 0) * Z }),
    bg(bottomMid, 'repeat-x', { left: bl + capBL, right: br + capBR, bottom: 0, height: (bottomMid?.h ?? 0) * Z }),
    bg(leftMid, 'repeat-y', { top: bt + capLT, bottom: bb + capLB, left: 0, width: (leftMid?.w ?? 0) * Z }),
    bg(rightMid, 'repeat-y', { top: bt + capRT, bottom: bb + capRB, right: 0, width: (rightMid?.w ?? 0) * Z }),
    bg(P('edge-top-cap-l'), 'no-repeat', { left: bl, top: 0, width: capTL, height: (P('edge-top-cap-l')?.h ?? 0) * Z }),
    bg(P('edge-top-cap-r'), 'no-repeat', { right: br, top: 0, width: capTR, height: (P('edge-top-cap-r')?.h ?? 0) * Z }),
    bg(P('edge-bottom-cap-l'), 'no-repeat', { left: bl, bottom: 0, width: capBL, height: (P('edge-bottom-cap-l')?.h ?? 0) * Z }),
    bg(P('edge-bottom-cap-r'), 'no-repeat', { right: br, bottom: 0, width: capBR, height: (P('edge-bottom-cap-r')?.h ?? 0) * Z }),
    bg(P('edge-left-cap-t'), 'no-repeat', { left: 0, top: bt, width: (P('edge-left-cap-t')?.w ?? 0) * Z, height: capLT }),
    bg(P('edge-left-cap-b'), 'no-repeat', { left: 0, bottom: bb, width: (P('edge-left-cap-b')?.w ?? 0) * Z, height: capLB }),
    bg(P('edge-right-cap-t'), 'no-repeat', { right: 0, top: bt, width: (P('edge-right-cap-t')?.w ?? 0) * Z, height: capRT }),
    bg(P('edge-right-cap-b'), 'no-repeat', { right: 0, bottom: bb, width: (P('edge-right-cap-b')?.w ?? 0) * Z, height: capRB }),
    bg(tl, 'no-repeat', { left: 0, top: 0, width: (tl?.w ?? 0) * Z, height: (tl?.h ?? 0) * Z }),
    bg(tr, 'no-repeat', { right: 0, top: 0, width: (tr?.w ?? 0) * Z, height: (tr?.h ?? 0) * Z }),
    bg(P('corner-bl'), 'no-repeat', { left: 0, bottom: 0, width: (P('corner-bl')?.w ?? 0) * Z, height: (P('corner-bl')?.h ?? 0) * Z }),
    bg(P('corner-br'), 'no-repeat', { right: 0, bottom: 0, width: (P('corner-br')?.w ?? 0) * Z, height: (P('corner-br')?.h ?? 0) * Z }),
  ];

  return (
    <div aria-hidden className="absolute inset-0">
      {layers.map((s, i) => (s ? <div key={i} style={s} /> : null))}
    </div>
  );
};

/**
 * The section rule above the side quests, as painted art: fixed cap,
 * tiling middle, fixed cap — dividers carry no halo, so nominal == bitmap.
 */
export const QuestDivider: React.FC = () => {
  const l = P('divider-cap-l');
  const m = P('divider-mid');
  const r = P('divider-cap-r');
  if (!m) return null;
  const h = m.h * Z;
  return (
    <span aria-hidden className="flex" style={{ height: h }}>
      {l && <span style={bg(l, 'no-repeat', { position: 'relative', width: l.w * Z, height: h, flexShrink: 0 }) ?? undefined} />}
      <span style={{ ...bg(m, 'repeat-x', { position: 'relative', height: h }), flex: '1 1 auto' }} />
      {r && <span style={bg(r, 'no-repeat', { position: 'relative', width: r.w * Z, height: h, flexShrink: 0 }) ?? undefined} />}
    </span>
  );
};

/**
 * The QUEST plate as painted art, with the DOM label riding on top (the
 * label stays text: themable, translatable, hugged by the tiling middle).
 * Halo'd bitmaps overhang the nominal plate — chains and brackets land
 * where they were painted.
 */
export const QuestPlate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const l = P('plate-cap-l');
  const m = P('plate-mid');
  const r = P('plate-cap-r');
  if (!m) return null;
  const h = nomH(m) * Z;
  return (
    <span className="inline-flex" style={{ height: h }}>
      {l && (
        <span style={{ position: 'relative', width: nomW(l) * Z, height: h }}>
          <span aria-hidden style={bg(l, 'no-repeat', { left: -(l.halo?.l ?? 0) * Z, top: -(l.halo?.t ?? 0) * Z, width: l.w * Z, height: l.h * Z }) ?? undefined} />
        </span>
      )}
      <span style={{ position: 'relative', minWidth: nomW(m) * Z, height: h, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <span aria-hidden style={bg(m, 'repeat-x', { left: 0, right: 0, top: -(m.halo?.t ?? 0) * Z, height: m.h * Z }) ?? undefined} />
        <span className="relative px-1.5">{children}</span>
      </span>
      {r && (
        <span style={{ position: 'relative', width: nomW(r) * Z, height: h }}>
          <span aria-hidden style={bg(r, 'no-repeat', { right: -(r.halo?.r ?? 0) * Z, top: -(r.halo?.t ?? 0) * Z, width: r.w * Z, height: r.h * Z }) ?? undefined} />
        </span>
      )}
    </span>
  );
};
