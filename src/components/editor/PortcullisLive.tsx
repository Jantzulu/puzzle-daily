import React from 'react';
import { skinFromSlices, prepCanvas, whenDecoded, type ForgeSlice } from '../game/panelSkins';
import { drawRailSkin } from '../game/PortcullisMesh';
import { drawGateBeamSkin, drawGateSignSkin } from '../shared/GateMesh';

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
  family: 'rail' | 'gate' | 'nav-gate';
  slices: ForgeSlice[];
  /** Surface width in CSS px — the W slider (mobile ~393, desktop rail 672). */
  width: number;
}

const RAIL_BOX_H = 88;
const ITEM_H = 52;
const ITEM_GAP = 8;
const BEAM_BLEED = 32;

export const PortcullisLive: React.FC<Props> = ({ kitId, family, slices, width }) => {
  const skin = React.useMemo(() => skinFromSlices(kitId, slices), [kitId, slices]);
  const railRef = React.useRef<HTMLCanvasElement>(null);
  const beamRefA = React.useRef<HTMLCanvasElement>(null);
  const beamRefB = React.useRef<HTMLCanvasElement>(null);
  const signRef = React.useRef<HTMLCanvasElement>(null);
  const signBoxRef = React.useRef<HTMLSpanElement>(null);

  React.useLayoutEffect(() => {
    let cancelled = false;
    const draw = () => {
      if (cancelled) return;
      if (family === 'rail' || family === 'gate') {
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
          drawGateBeamSkin(ctx, width, ITEM_H, skin, i === 0);
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
          {/* The 44px rung box the DOM controls sit on — orientation guide. */}
          <div
            aria-hidden
            style={{ position: 'absolute', left: 0, right: 0, top: RAIL_BOX_H * 0.3125, height: 44, border: '1px dashed rgba(120,113,108,0.35)' }}
          />
          <canvas ref={railRef} style={{ position: 'absolute' }} />
        </div>
        <p className="mt-2 text-[11px] text-stone-500">
          The live rail box (controls ride the dashed rung).{' '}
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
