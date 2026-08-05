import React from 'react';
import { skinFromSlices, prepCanvas, whenDecoded, type ForgeSlice } from '../game/panelSkins';
import { drawRailSkin } from '../game/PortcullisMesh';
import { drawGateBars, drawGateBeamSkin, drawGateSignSkin } from '../shared/GateMesh';
import { drawStonePiece, dimStoneFace } from '../game/PlayStoneSkin';
import { drawRungPlaque, PlaqueHeader, PlaqueHeaderLabel, plaqueHeaderStraddle } from '../game/RungPlaque';

// ============================================================================
// PORTCULLIS LIVE — the Live panel for the non-nine-slice kits
// ============================================================================
// PanelNineSlice knows nine-slice anatomy only, so slicing a portcullis kit
// left the Live panel showing "nothing painted" (user bug, 2026-08-02).
// This renders those kits with the GAME'S OWN draw routines (drawRailSkin /
// drawGateBeamSkin / drawGateSignSkin) fed the fresh slices — the same
// share-the-renderer law the quest preview earned the hard way: a parallel
// implementation WILL drift.
//
// Geometry mirrors the live surfaces: the rail box is 88px tall (200% of
// the 44px rung, band zone in the middle), menu items are 52px with an 8px
// gap the bars bridge through canvas bleed, and the sign is a 3-slice
// behind DOM text.

interface Props {
  kitId: string;
  family: 'rail' | 'gate' | 'nav-gate' | 'stone' | 'plaque';
  slices: ForgeSlice[];
  /** Surface width in CSS px — the W slider (mobile ~393, desktop rail 672). Ignored by 'stone' and 'plaque' (content-sized). */
  width: number;
}

/**
 * One plaque sample: the shared 3-slice behind REAL content, sized by the
 * content like the live rail — drawn with the game's own drawRungPlaque,
 * the header plate mounted with the game's own PlaqueHeader component
 * (share-the-renderer law).
 */
const PlaqueSample: React.FC<{ skin: Map<string, import('../game/panelSkins').SkinPiece>; header?: string; children: React.ReactNode }> = ({ skin, header, children }) => {
  const hostRef = React.useRef<HTMLSpanElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useLayoutEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;
    const draw = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      const ctx = prepCanvas(canvas, w, h, 0);
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      drawRungPlaque(ctx, w, h, skin);
    };
    whenDecoded([...skin.values()]).then(() => { if (!cancelled) draw(); });
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    return () => { cancelled = true; ro.disconnect(); };
  }, [skin]);
  const showHeader = !!header && skin.has('header-mid');
  return (
    <span ref={hostRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 26, padding: '0 14px' }}>
      <canvas ref={canvasRef} aria-hidden style={{ position: 'absolute' }} />
      {showHeader && (
        <span style={{ position: 'absolute', left: 0, right: 0, top: -plaqueHeaderStraddle(skin), display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <PlaqueHeader pieces={skin}>
            <PlaqueHeaderLabel>{header}</PlaqueHeaderLabel>
          </PlaqueHeader>
        </span>
      )}
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{children}</span>
    </span>
  );
};

/** The Play Stone's fixed live footprint — 60×18 art, every viewport. */
const STONE_W = 120;
const STONE_H = 36;

const RAIL_BOX_H = 88;
const ITEM_H = 52;
const ITEM_GAP = 8;
const BEAM_BLEED = 32;

export const PortcullisLive: React.FC<Props> = ({ kitId, family, slices, width }) => {
  const skin = React.useMemo(() => skinFromSlices(kitId, slices), [kitId, slices]);
  // The rung guide is an OVERLAY and it shows through transparent art —
  // its corner dashes read as stray pixels wherever cap art has cutaways.
  // It fooled the user TWICE (2026-08-02, both "corner pixel" reports —
  // pixel probes proved the renderer clean at every cutaway), so it
  // defaults OFF; tick it only when placing the band.
  const [showGuide, setShowGuide] = React.useState(false);
  // Play Stone preview state: which face family (play vs the run-state
  // concede), which state within it, and the no-hero dim (play only —
  // concede never dims, the game is already running).
  const [stoneState, setStoneState] = React.useState<'base' | 'hover' | 'pressed'>('base');
  const [stoneFace, setStoneFace] = React.useState<'play' | 'concede'>('play');
  const [stoneDimmed, setStoneDimmed] = React.useState(false);
  const stoneRef = React.useRef<HTMLCanvasElement>(null);
  const railRef = React.useRef<HTMLCanvasElement>(null);
  const beamRefA = React.useRef<HTMLCanvasElement>(null);
  const beamRefB = React.useRef<HTMLCanvasElement>(null);
  const signRef = React.useRef<HTMLCanvasElement>(null);
  const signBoxRef = React.useRef<HTMLSpanElement>(null);

  React.useLayoutEffect(() => {
    let cancelled = false;
    const draw = () => {
      if (cancelled) return;
      if (family === 'stone') {
        const canvas = stoneRef.current;
        if (!canvas) return;
        const B = 20; // holds the frame's 8-art aura, like the game's canvas
        const ctx = prepCanvas(canvas, STONE_W, STONE_H, B);
        if (!ctx) return;
        ctx.clearRect(-B, -B, STONE_W + B * 2, STONE_H + B * 2);
        // Same composition as the game: chosen face family (concede falls
        // back to its OWN base, never the play faces), pixel-baked dim on
        // the play face only, then the ONE shared never-dimmed frame.
        const concede = stoneFace === 'concede';
        const base = concede ? skin.get('play-button-concede') : skin.get('play-button');
        const dimming = !concede && stoneDimmed;
        const face = dimming
          ? base
          : (stoneState === 'hover' ? skin.get(concede ? 'play-button-concede-hover' : 'play-button-hover') ?? base
            : stoneState === 'pressed' ? skin.get(concede ? 'play-button-concede-pressed' : 'play-button-pressed') ?? base
            : base);
        if (face) {
          drawStonePiece(ctx, STONE_W, STONE_H, face);
          // OPAQUE dim, pixel-baked — never translucency (the game's rule).
          if (dimming) dimStoneFace(ctx, STONE_W, STONE_H, B);
        }
        const frame = skin.get('play-frame');
        if (frame) drawStonePiece(ctx, STONE_W, STONE_H, frame);
      } else if (family === 'rail' || family === 'gate') {
        const canvas = railRef.current;
        if (!canvas) return;
        const ctx = prepCanvas(canvas, width, RAIL_BOX_H, 0);
        if (!ctx) return;
        ctx.clearRect(0, 0, width, RAIL_BOX_H);
        // Both maps get this kit's pieces: the control-rail kit finds its
        // band/hardware, the gate kit finds its bars — in the game the two
        // kits share this one surface.
        drawRailSkin(ctx, width, RAIL_BOX_H, skin, skin);
      } else {
        [beamRefA, beamRefB].forEach((ref, i) => {
          const canvas = ref.current;
          if (!canvas) return;
          const ctx = prepCanvas(canvas, width, ITEM_H, BEAM_BLEED);
          if (!ctx) return;
          ctx.clearRect(-BEAM_BLEED, -BEAM_BLEED, width + BEAM_BLEED * 2, ITEM_H + BEAM_BLEED * 2);
          // Live splits bars (unfiltered) from iron (drop-shadowed); the
          // preview has no filter, so composing both here matches it.
          drawGateBars(ctx, width, ITEM_H, skin, i === 0);
          drawGateBeamSkin(ctx, width, ITEM_H, skin);
        });
        const sign = signRef.current;
        const box = signBoxRef.current;
        if (sign && box) {
          const sw = box.clientWidth;
          const sh = box.clientHeight;
          if (sw && sh) {
            const ctx = prepCanvas(sign, sw, sh, 0);
            if (ctx) {
              ctx.clearRect(0, 0, sw, sh);
              drawGateSignSkin(ctx, sw, sh, skin);
            }
          }
        }
      }
    };
    // Synchronous after decode — same no-rAF rule as the game renderers.
    whenDecoded([...skin.values()]).then(draw);
    return () => { cancelled = true; };
  });

  if (family === 'plaque' && skin.size > 0) {
    // The header rides proud of the plaque top — reserve its reach above
    // the samples row (straddle + the header's own height slack).
    const headerPad = skin.has('header-mid') ? plaqueHeaderStraddle(skin) + 8 : 0;
    return (
      <div className="rounded" style={{ background: '#040403', padding: 24, paddingTop: 24 + headerPad }}>
        <div className="flex items-center justify-center gap-8 flex-wrap">
          <PlaqueSample skin={skin} header="Lives">
            <span className="text-xs">❤️❤️❤️</span>
          </PlaqueSample>
          <PlaqueSample skin={skin} header="Turns">
            <span className="text-sm text-parchment-100 font-bold tabular-nums">0<span className="text-xs opacity-70">/100</span></span>
          </PlaqueSample>
        </div>
        <p className="mt-3 text-[11px] text-stone-500 text-center">
          Both rail plaques wear this ONE design at their own content widths —
          caps fixed, middle tiling between them, hearts and the run counter on
          top. The header plate straddles the top edge with the LIVES/TURNS
          label as DOM text; unpainted header pieces fall back to an inline
          label inside the plaque.
        </p>
      </div>
    );
  }

  if (family === 'stone' && skin.size > 0) {
    return (
      <div className="rounded" style={{ background: '#040403', padding: 24 }}>
        <div className="flex items-center justify-center gap-4 mb-2 text-xs text-stone-300">
          {(['play', 'concede'] as const).map(f => (
            <label key={f} className="inline-flex items-center gap-1">
              <input type="radio" name="stone-face" checked={stoneFace === f} onChange={() => setStoneFace(f)} className="w-3 h-3" />
              {f === 'play' ? 'Play (setup)' : 'Concede (mid-run)'}
            </label>
          ))}
        </div>
        <div className="flex items-center justify-center gap-4 mb-3 text-xs text-stone-300">
          <label className={`inline-flex items-center gap-1.5 ${stoneFace === 'concede' ? 'opacity-40' : ''}`}>
            <input type="checkbox" checked={stoneDimmed} disabled={stoneFace === 'concede'} onChange={e => setStoneDimmed(e.target.checked)} className="w-3.5 h-3.5" />
            No hero placed (face dims, frame never)
          </label>
          {(['base', 'hover', 'pressed'] as const).map(s => (
            <label key={s} className={`inline-flex items-center gap-1 ${stoneFace === 'play' && stoneDimmed ? 'opacity-40' : ''}`}>
              <input type="radio" name="stone-state" checked={stoneState === s} disabled={stoneFace === 'play' && stoneDimmed} onChange={() => setStoneState(s)} className="w-3 h-3" />
              {s}
            </label>
          ))}
        </div>
        <div style={{ position: 'relative', width: STONE_W, height: STONE_H, margin: '0 auto', overflow: 'visible' }}>
          <canvas ref={stoneRef} style={{ position: 'absolute' }} />
          <span className="absolute inset-0 flex items-center justify-center font-bold text-sm text-parchment-100 uppercase tracking-[0.05em] pointer-events-none">
            {stoneFace === 'concede' ? 'Concede' : 'Play'}
          </span>
        </div>
        <p className="mt-3 text-[11px] text-stone-500 text-center">
          The stone at its real 120×36 — face under, the ONE shared frame over,
          sample label on top. Hover/pressed fall back to their family's base
          face when unpainted; the concede family never borrows the play faces.
        </p>
      </div>
    );
  }

  if (skin.size === 0) {
    return (
      <div className="text-xs text-stone-500 border border-dashed border-stone-700 rounded p-3">
        Nothing painted yet — slice a sheet above.
      </div>
    );
  }

  if (family === 'rail' || family === 'gate') {
    return (
      <div className="rounded" style={{ background: '#040403', padding: 16, overflow: 'hidden' }}>
        <div style={{ position: 'relative', width, height: RAIL_BOX_H, margin: '0 auto' }}>
          {/* The 44px rung box the DOM controls sit on — orientation
              OVERLAY (integer position; it shows through transparent art,
              so it is toggleable). */}
          {showGuide && (
            <div
              aria-hidden
              style={{ position: 'absolute', left: 0, right: 0, top: Math.round(RAIL_BOX_H * 0.3125), height: 44, border: '1px dashed rgba(120,113,108,0.35)' }}
            />
          )}
          <canvas ref={railRef} style={{ position: 'absolute' }} />
        </div>
        <p className="mt-2 text-[11px] text-stone-500">
          <label className="inline-flex items-center gap-1.5 mr-2 text-stone-400">
            <input type="checkbox" checked={showGuide} onChange={e => setShowGuide(e.target.checked)} className="w-3 h-3" />
            Rung guide
          </label>
          The dashed rung is an overlay, not art — it peeks through transparent pixels (untoggle to judge edges).{' '}
          {family === 'rail'
            ? 'Rising bars come from the Portcullis Gate kit — paint that kit to see them here.'
            : 'The band, plates and spikes come from the Control Rail kit — this kit supplies the rising bars.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded" style={{ background: '#040403', padding: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: ITEM_GAP, width, margin: '0 auto' }}>
        <div style={{ position: 'relative', height: ITEM_H, overflow: 'visible' }}>
          <canvas ref={beamRefA} style={{ position: 'absolute' }} />
          {/* Flex centering, NOT translateX(-50%): a fractional transform
              would land the sign canvas on a half-pixel (the pinned
              integer-geometry law). */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span
              ref={signBoxRef}
              className="hud-label text-parchment-200"
              style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 84, height: 28, padding: '0 12px' }}
            >
              <canvas ref={signRef} aria-hidden style={{ position: 'absolute', left: 0, top: 0 }} />
              <span style={{ position: 'relative' }}>Quests</span>
            </span>
          </div>
        </div>
        <div style={{ position: 'relative', height: ITEM_H, overflow: 'visible' }}>
          <canvas ref={beamRefB} style={{ position: 'absolute' }} />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-stone-500">
        Two stacked menu items — the first reaches up to the navbar, its bars bridge the gap below;
        the sign plate carries the DOM label.
      </p>
    </div>
  );
};
