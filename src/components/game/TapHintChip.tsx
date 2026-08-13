import React from 'react';
import skinJson from '../../assets/panels/tap-hint-slices.json';
import { Z, buildSkin, nomW, nomH, useCrispSnap, prepCanvas, drawFixed, drawTiled, whenDecoded, BLEED, type SkinPiece } from './panelSkins';

// ============================================================================
// TAP HINT CHIP — the instructional chips, forge-cut
// ============================================================================
// "Tap the dungeon to place your hero" (board prompt) and the "Tap a
// hero / Tap an enemy for more info" rows share one CSS grammar; this is
// their painted successor (user ask 2026-08-11): ONE 3-slice worn by all
// three at text-driven widths — the PlaqueHeader pattern (halo-aware
// fixed caps, strict-x tiling middle, DOM label riding above the canvas).
// The artist bakes the translucent interior INTO the art (PNG alpha ships
// through the slicer) and paints the black outline/aura in the halo rows.
// Drop path: src/assets/panels/tap-hint-slices.json; the committed empty
// placeholder = the original CSS chip, unchanged.

const PIECES = buildSkin(skinJson, 'tap-hint');

export const tapHintSkinActive = PIECES.has('hint-mid');

/**
 * The chip's draw, parameterized on the skin map — the forge's Live panel
 * composes THIS routine via the component below (share-the-renderer law).
 * Caps anchor by NOMINAL with halo overhang; the band spans exactly
 * between their nominal edges (cap-art transparency is silhouette).
 */
export const drawTapHint = (ctx: CanvasRenderingContext2D, w: number, pieces: Map<string, SkinPiece>) => {
  const m = pieces.get('hint-mid');
  if (!m) return;
  const l = pieces.get('hint-cap-l');
  const r = pieces.get('hint-cap-r');
  const lw = l ? nomW(l) * Z : 0;
  const rw = r ? nomW(r) * Z : 0;
  const my = -(m.halo?.t ?? 0) * Z;
  drawTiled(ctx, m, lw, my, w - lw - rw, m.h * Z, lw, my);
  if (l) drawFixed(ctx, l, -(l.halo?.l ?? 0) * Z, -(l.halo?.t ?? 0) * Z);
  if (r) drawFixed(ctx, r, w - rw - (r.halo?.l ?? 0) * Z, -(r.halo?.t ?? 0) * Z);
};

const SkinnedTapHint: React.FC<{ pieces: Map<string, SkinPiece>; children: React.ReactNode }> = ({ pieces, children }) => {
  const snapRef = useCrispSnap<HTMLSpanElement>(true, true);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const m = pieces.get('hint-mid')!;
  const h = nomH(m) * Z;
  React.useLayoutEffect(() => {
    const host = snapRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;
    const draw = () => {
      const w = host.clientWidth;
      if (!w) return;
      const ctx = prepCanvas(canvas, w, h, BLEED);
      if (!ctx) return;
      ctx.clearRect(-BLEED, -BLEED, w + BLEED * 2, h + BLEED * 2);
      drawTapHint(ctx, w, pieces);
    };
    // Synchronous after decode — the shared no-rAF rule (hidden tabs
    // freeze rAF and leave blank canvases).
    const schedule = draw;
    const deps = [m, pieces.get('hint-cap-l'), pieces.get('hint-cap-r')].filter(Boolean) as SkinPiece[];
    whenDecoded(deps).then(() => { if (!cancelled) schedule(); });
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); };
  }, [m, h, pieces, snapRef]);
  const l = pieces.get('hint-cap-l');
  const r = pieces.get('hint-cap-r');
  return (
    <span ref={snapRef} className="inline-flex relative" style={{ height: h }}>
      <canvas ref={canvasRef} aria-hidden style={{ position: 'absolute' }} />
      {l && <span style={{ width: nomW(l) * Z, height: h, flexShrink: 0 }} />}
      <span style={{ position: 'relative', minWidth: nomW(m) * Z, height: h, display: 'inline-flex', justifyContent: 'center' }}>
        {/* PlaqueHeader's deterministic centering: kill the inherited
            line strut, then place the hud-label's 13px line box at an
            integer offset. 6 ≈ the tracked caps' ink center — THE knob
            if the label reads high or low on the painted band. */}
        <span className="relative px-2" style={{ fontSize: 0, lineHeight: 0, alignSelf: 'flex-start', marginTop: Math.round(h / 2) - 6 }}>
          <span className="hud-label text-copper-300 whitespace-nowrap">{children}</span>
        </span>
      </span>
      {r && <span style={{ width: nomW(r) * Z, height: h, flexShrink: 0 }} />}
    </span>
  );
};

/**
 * The chip: skinned when the kit is painted (or when the forge preview
 * passes fresh pieces), the original CSS chip otherwise — call sites just
 * wrap their label text.
 */
export const TapHintChip: React.FC<{ children: React.ReactNode; pieces?: Map<string, SkinPiece> }> = ({ children, pieces }) => {
  const skin = pieces ?? PIECES;
  if (!skin.has('hint-mid')) {
    return (
      <span className="inline-block px-3 py-1 rounded-pixel bg-stone-900/85 border border-copper-700 hud-label text-copper-300 whitespace-nowrap">
        {children}
      </span>
    );
  }
  return <SkinnedTapHint pieces={skin}>{children}</SkinnedTapHint>;
};
