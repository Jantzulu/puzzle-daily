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
// INTEGER ZOOM, SMOOTHING OFF — panel art obeys the board's law. Z=2 (user
// call, 2026-08-01, first real art): at Z=1 the game showed the frame at
// half the scale the forge preview (~2×) had been approving art at — a
// 12px-corner frame read as a thin 12px band and the plate was a 14px
// sliver under the QUEST text. At Z=2 the frame carries the mock's chunky
// pixel-border weight. Still integer — never fractional.

const Z = 2;

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

// Frame geometry (run starts, cap anchoring) keys off the CORNERS as a
// nine-slice must; the CONTENT padding below keys off the EDGE BANDS
// instead (thinness lever, user call 2026-08-01: "as thin as possible…
// liked the baseline size"): thin edges + proud corners = a thin box.
// The corners may overhang the content zone at the four flanks — the
// quest content is centered, so nothing collides. Frame pieces carry no
// halo, so nominal == bitmap.
const tl = P('corner-tl');
const tr = P('corner-tr');
const topMid = P('edge-top-mid');
const bottomMid = P('edge-bottom-mid');
const leftMid = P('edge-left-mid');
const rightMid = P('edge-right-mid');
export const questFrameBorders = {
  t: (topMid?.h ?? tl?.h ?? 0) * Z,
  b: (bottomMid?.h ?? P('corner-bl')?.h ?? 0) * Z,
  l: (leftMid?.w ?? tl?.w ?? 0) * Z,
  r: (rightMid?.w ?? tr?.w ?? 0) * Z,
};

const plateMid = P('plate-mid');
/** How far the plate pokes above the box's top edge (the preview's 60% rule). */
export const questPlateStraddle = plateMid ? Math.round(nomH(plateMid) * Z * 0.6) : 0;

// NOTE: no inline imageRendering — the layers carry .quest-skin-px (both
// -webkit-optimize-contrast and pixelated, for older iOS WebKit that
// smooths background-image; an inline value would shadow the fallback).
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
    ...style,
  };
};

/** Positive modulo — background-position phase alignment. */
const pmod = (v: number, m: number) => ((v % m) + m) % m;

/**
 * Snap an element to whole CSS pixels (user bug, desktop+mobile: art blur
 * "at the bounds of the text boxes"): flex/mx-auto centering and
 * translateX(-50%) of text-driven widths land the box and the plate on
 * half-pixels, and bitmap art at a fractional offset is resampled at every
 * zoom — permanent blur, worst on detailed border art. The compensating
 * transform re-lands the element on integers; rounding in CSS px is
 * device-integer at any whole dpr.
 */
export function useCrispSnap<T extends HTMLElement>(active: boolean, defer = false) {
  const ref = React.useRef<T>(null);
  React.useLayoutEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const snap = () => {
      el.style.transform = 'none';
      const r = el.getBoundingClientRect();
      const dx = Math.round(r.left) - r.left;
      const dy = Math.round(r.top) - r.top;
      el.style.transform = dx || dy ? `translate(${dx.toFixed(3)}px, ${dy.toFixed(3)}px)` : 'none';
    };
    // `defer`: elements INSIDE another snapped element must measure AFTER
    // their ancestor's compensation lands (child effects and same-frame
    // rAFs otherwise measure the pre-snap position and go stale by the
    // ancestor's dx — seen live: the plate stuck at +0.5 after the box
    // snapped). A double rAF puts the child a frame behind.
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

/**
 * The nine-slice frame, absolutely filling the quest box. Render it FIRST
 * inside the box and wrap the box's content in a `relative` div — absolute
 * layers otherwise paint over static text.
 */
export const QuestBoxFrame: React.FC = () => {
  // Measured own size — the caps-drop rule below needs it. Hooks before
  // the active-flag early return (rules of hooks).
  const ref = React.useRef<HTMLDivElement>(null);
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!questSkinFrameActive) return null;
  // GEOMETRY is corner-keyed (a nine-slice's runs start where its corners
  // end) — deliberately NOT questFrameBorders, which is edge-keyed for the
  // content padding's thinness lever.
  const bt = (tl?.h ?? topMid?.h ?? 0) * Z;
  const bb = (P('corner-bl')?.h ?? bottomMid?.h ?? 0) * Z;
  const bl = (tl?.w ?? leftMid?.w ?? 0) * Z;
  const br = (tr?.w ?? rightMid?.w ?? 0) * Z;
  // CAPS DROP WHEN THEY DON'T FIT (user bug, thin-box round): a run's two
  // fixed caps need corner-to-corner room; the thin box (~54px) can't hold
  // 24px side caps under 24px corners, so they slid into each other and
  // poked band-end art through the silhouette. Unfit caps vanish and the
  // middle runs corner to corner — same rule as the forge preview.
  const sideRoom = (dims?.h ?? Number.MAX_SAFE_INTEGER) - bt - bb;
  const topRoom = (dims?.w ?? Number.MAX_SAFE_INTEGER) - bl - br;
  const fitL = ((P('edge-left-cap-t')?.h ?? 0) + (P('edge-left-cap-b')?.h ?? 0)) * Z <= sideRoom;
  const fitR = ((P('edge-right-cap-t')?.h ?? 0) + (P('edge-right-cap-b')?.h ?? 0)) * Z <= sideRoom;
  const fitT = ((P('edge-top-cap-l')?.w ?? 0) + (P('edge-top-cap-r')?.w ?? 0)) * Z <= topRoom;
  const fitB = ((P('edge-bottom-cap-l')?.w ?? 0) + (P('edge-bottom-cap-r')?.w ?? 0)) * Z <= topRoom;
  const capTL = fitT ? (P('edge-top-cap-l')?.w ?? 0) * Z : 0;
  const capTR = fitT ? (P('edge-top-cap-r')?.w ?? 0) * Z : 0;
  const capBL = fitB ? (P('edge-bottom-cap-l')?.w ?? 0) * Z : 0;
  const capBR = fitB ? (P('edge-bottom-cap-r')?.w ?? 0) * Z : 0;
  const capLT = fitL ? (P('edge-left-cap-t')?.h ?? 0) * Z : 0;
  const capLB = fitL ? (P('edge-left-cap-b')?.h ?? 0) * Z : 0;
  const capRT = fitR ? (P('edge-right-cap-t')?.h ?? 0) * Z : 0;
  const capRB = fitR ? (P('edge-right-cap-b')?.h ?? 0) * Z : 0;

  // THE CORNER SQUARE IS SACRED (user, thin-edge round, after two wrong
  // fixes): the corner art's transparency is the box's stepped SILHOUETTE
  // — nothing may paint inside its square, or the step reads as a filled
  // rectangle. So: edge runs span BETWEEN the corner squares (classic
  // nine-slice partition), and the centre is a notched CROSS — the
  // corner-anchored main field plus four gutter strips that reach the thin
  // bands along the runs but stop dead at the corner squares.
  const gt = questFrameBorders.t;
  const gb = questFrameBorders.b;
  const gl = questFrameBorders.l;
  const gr = questFrameBorders.r;
  // Gutter strips are PHASE-LOCKED to the main field's tile anchor
  // (bl, bt) and overlap 2px into it (user bug, mobile: hairline seam
  // lines + a "shadow" band — each strip restarted the center art's
  // pattern at its own origin, so shaded art visibly banded at the seam).
  // With matched phase the overlap draws identical pixels; strips that
  // need the box size to compute their phase wait for the measure (one
  // unpainted frame at mount).
  const ctr = P('center');
  const Tw = (ctr?.w ?? 1) * Z;
  const Th = (ctr?.h ?? 1) * Z;
  const OVR = 2;
  const phased = (stripLeft: number | null, stripTop: number | null, style: React.CSSProperties): React.CSSProperties | null => {
    if (!ctr) return null;
    return bg(ctr, 'repeat', {
      ...style,
      backgroundPosition: `${pmod(bl - (stripLeft ?? bl), Tw)}px ${pmod(bt - (stripTop ?? bt), Th)}px`,
    });
  };
  const layers: Array<React.CSSProperties | null> = [
    bg(ctr, 'repeat', { left: bl, right: br, top: bt, bottom: bb }),
    bt > gt ? phased(null, gt, { left: bl, right: br, top: gt, height: bt - gt + OVR }) : null,
    bb > gb && dims ? phased(null, dims.h - bb - OVR, { left: bl, right: br, top: dims.h - bb - OVR, height: bb - gb + OVR }) : null,
    bl > gl ? phased(gl, null, { top: bt, bottom: bb, left: gl, width: bl - gl + OVR }) : null,
    br > gr && dims ? phased(dims.w - br - OVR, null, { top: bt, bottom: bb, left: dims.w - br - OVR, width: br - gr + OVR }) : null,
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

  // Centered edge ornaments — FIXED like corners (never stretched, never
  // tiled), nominal box centered on the edge band, halo'd bitmap
  // overhanging. Widths are fixed art sizes, so the centering margin is
  // always an integer — no sub-pixel seams here by construction.
  const ornament = (pc: SkinPiece | undefined, isTop: boolean): React.ReactNode => {
    if (!pc) return null;
    // Centered on the EDGE band (the thin part), not the corner height.
    const bandH = isTop ? questFrameBorders.t : questFrameBorders.b;
    const nw = nomW(pc) * Z;
    const nh = nomH(pc) * Z;
    const edgeOffset = Math.round((bandH - nh) / 2);
    return (
      <div
        key={isTop ? 'orn-t' : 'orn-b'}
        style={{ position: 'absolute', left: '50%', marginLeft: -nw / 2, width: nw, height: nh, ...(isTop ? { top: edgeOffset } : { bottom: edgeOffset }) }}
      >
        <div aria-hidden className="quest-skin-px" style={bg(pc, 'no-repeat', { left: -(pc.halo?.l ?? 0) * Z, top: -(pc.halo?.t ?? 0) * Z, width: pc.w * Z, height: pc.h * Z }) ?? undefined} />
      </div>
    );
  };

  return (
    <div ref={ref} aria-hidden className="absolute inset-0">
      {layers.map((s, i) => (s ? <div key={i} className="quest-skin-px" style={s} /> : null))}
      {ornament(P('edge-top-ornament'), true)}
      {ornament(P('edge-bottom-ornament'), false)}
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
      {l && <span className="quest-skin-px" style={bg(l, 'no-repeat', { position: 'relative', width: l.w * Z, height: h, flexShrink: 0 }) ?? undefined} />}
      <span style={{ ...bg(m, 'repeat-x', { position: 'relative', height: h }), flex: '1 1 auto' }} />
      {r && <span className="quest-skin-px" style={bg(r, 'no-repeat', { position: 'relative', width: r.w * Z, height: h, flexShrink: 0 }) ?? undefined} />}
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
  // Self-snaps to whole pixels — its width is text-driven, so any centering
  // scheme lands it fractionally; the compensating transform re-lands it.
  // Deferred: it lives inside the box, which snaps itself first.
  const snapRef = useCrispSnap<HTMLSpanElement>(true, true);
  const l = P('plate-cap-l');
  const m = P('plate-mid');
  const r = P('plate-cap-r');
  if (!m) return null;
  const h = nomH(m) * Z;
  // Seam-proofing (user bug, 2026-08-01: "two vertical dark lines either
  // side of QUEST"): the label's width is fractional (font metrics), so
  // the cap|mid boundaries land on sub-pixels and three separately
  // rasterized backgrounds opened ~1px of dark page at both seams. The
  // middle is now ONE continuous band drawn across the whole plate and
  // tucked OVER-px under each cap — a sub-pixel seam can only expose
  // plate art, never the page. Caps paint over the band's ends.
  const OVER = Z;
  return (
    <span ref={snapRef} className="inline-flex relative" style={{ height: h }}>
      <span
        aria-hidden
        style={bg(m, 'repeat-x', {
          left: l ? nomW(l) * Z - OVER : 0,
          right: r ? nomW(r) * Z - OVER : 0,
          top: -(m.halo?.t ?? 0) * Z,
          height: m.h * Z,
        }) ?? undefined}
      />
      {l && (
        <span style={{ position: 'relative', width: nomW(l) * Z, height: h }}>
          <span aria-hidden className="quest-skin-px" style={bg(l, 'no-repeat', { left: -(l.halo?.l ?? 0) * Z, top: -(l.halo?.t ?? 0) * Z, width: l.w * Z, height: l.h * Z }) ?? undefined} />
        </span>
      )}
      <span style={{ position: 'relative', minWidth: nomW(m) * Z, height: h, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="relative px-1.5">{children}</span>
      </span>
      {r && (
        <span style={{ position: 'relative', width: nomW(r) * Z, height: h }}>
          <span aria-hidden className="quest-skin-px" style={bg(r, 'no-repeat', { right: -(r.halo?.r ?? 0) * Z, top: -(r.halo?.t ?? 0) * Z, width: r.w * Z, height: r.h * Z }) ?? undefined} />
        </span>
      )}
    </span>
  );
};
