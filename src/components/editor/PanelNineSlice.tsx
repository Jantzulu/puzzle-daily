import React, { useMemo } from 'react';

// ============================================================================
// LIVE NINE-SLICE RENDER — the right-hand side of the painting loop
// ============================================================================
// Takes the pieces cut from a painted sheet and assembles them into a REAL
// panel at a size you choose, so you can see the thing you are actually
// making rather than the sheet you are painting. The sheet is the UV layout;
// this is the mesh it wraps onto.
//
// WHY DOM AND NOT CANVAS. The whole question this preview has to answer is
// "can I still read the text on it". A canvas render would be a picture of a
// panel; this is a panel — real text flows inside it, at the real type ramp,
// wrapping the way it will wrap in the game. Readability is the constraint
// that kills painted UI, so it has to be visible while painting, not after.
//
// WHY THE SIZE IS ADJUSTABLE. A nine-slice only lies to you at the sample's
// own size, where every edge happens to tile a whole number of times. Drag it
// to an awkward size and you find out whether your seams actually work and
// whether the last tile before a corner cuts off somewhere ugly. That is the
// bug this preview exists to surface.
//
// INTEGER ZOOM ONLY, SMOOTHING OFF. Panel art obeys the same law the board
// obeys — native resolution x an integer. A fractional preview would look
// softer or sharper than the shipped result and would be worth nothing.

export interface NineSlicePiece {
  pieceId: string;
  w: number;
  h: number;
  url: string;
  empty: boolean;
  /** Bitmap = nominal+halo when set; insets locate the nominal rect. */
  halo?: { l: number; t: number; r: number; b: number };
}

interface Props {
  pieces: NineSlicePiece[];
  /** Integer display pixels per art pixel. */
  zoom: number;
  /** Panel box size in DISPLAY pixels. */
  width: number;
  height: number;
  /** Render sample content inside, to judge readability. */
  showContent: boolean;
  /** Page ground behind the panel — the real one is near-black. */
  ground: string;
  /**
   * Where to lay `divider` runs, in display px from the panel's top edge.
   * The divider is the one kit piece with no fixed home — corners and edges
   * are positional by definition, but a section rule goes wherever the panel
   * happens to change subject. Without this it was cut and then never drawn,
   * so a sheet painted WITH dividers rendered without them and looked like
   * the slicer had eaten them.
   */
  dividerYs?: number[];
  /**
   * Draw where the tile periods actually fall, and hatch the part that gets
   * cut off. Without this the panel answers "does it look right at THIS size"
   * but never "what happens when it is resized" — which is the question that
   * decides whether a flourish can live on a repeating piece at all. A notch
   * painted into an edge tile repeats every period; a notch painted into the
   * middle of a RUN is simply discarded, and both failures look identical in
   * a static preview.
   */
  showSeams?: boolean;
}

// Ground padding around the panel — also the headroom the quest plate's
// straddle pokes into (it must stay >= plateH * 0.6 at the largest zoom).
const GROUND_PAD = 16;

const byId = (pieces: NineSlicePiece[]) => {
  const map: Record<string, NineSlicePiece> = {};
  for (const p of pieces) if (!p.empty) map[p.pieceId] = p;
  return map;
};

/** A tiled or fixed art layer. All sizes are pre-multiplied by zoom. */
const layer = (
  piece: NineSlicePiece | undefined,
  zoom: number,
  repeat: 'no-repeat' | 'repeat-x' | 'repeat-y' | 'repeat',
  style: React.CSSProperties,
): React.CSSProperties | null => {
  if (!piece) return null;
  return {
    position: 'absolute',
    backgroundImage: `url(${piece.url})`,
    backgroundRepeat: repeat,
    // Integer multiples: the tile period is the art's own size x zoom, so a
    // repeat lands on whole art pixels every time.
    backgroundSize: `${piece.w * zoom}px ${piece.h * zoom}px`,
    imageRendering: 'pixelated',
    ...style,
  };
};

export const PanelNineSlice: React.FC<Props> = ({ pieces, zoom, width, height, showContent, ground, dividerYs = [], showSeams = false }) => {
  const p = useMemo(() => byId(pieces), [pieces]);

  const tl = p['corner-tl'];
  const tr = p['corner-tr'];
  const bl = p['corner-bl'];
  const br = p['corner-br'];
  // Capped kits split each edge into cap · middle · cap; plain kits have one
  // repeating part. Detected per-piece rather than configured, so both render
  // from the same component and a half-converted kit still previews.
  const top = p['edge-top'] ?? p['edge-top-mid'];
  const bottom = p['edge-bottom'] ?? p['edge-bottom-mid'];
  const left = p['edge-left'] ?? p['edge-left-mid'];
  const right = p['edge-right'] ?? p['edge-right-mid'];
  const center = p['center'];

  // Border thicknesses come from the ART, not from a guess: the corners define
  // them, with the edges as a fallback when a corner is unpainted.
  const bt = (tl?.h ?? top?.h ?? 0) * zoom;
  const bb = (bl?.h ?? bottom?.h ?? 0) * zoom;
  const bLeft = (tl?.w ?? left?.w ?? 0) * zoom;
  const bRight = (tr?.w ?? right?.w ?? 0) * zoom;

  // CONTENT insets are EDGE-keyed (corner fallback) — mirroring the game
  // renderer's thinness lever: thin edges pull the content in close while
  // the corners stand proud. The sample text must sit where real content
  // will.
  const cbt = (top?.h ?? tl?.h ?? 0) * zoom;
  const cbb = (bottom?.h ?? bl?.h ?? 0) * zoom;
  const cbl = (left?.w ?? tl?.w ?? 0) * zoom;
  const cbr = (right?.w ?? tr?.w ?? 0) * zoom;

  // Cap footprints in display px. The middles start after them, which is the
  // whole point: a cap never stretches and never repeats, so ornament painted
  // into it survives at every panel size.
  // CAPS DROP WHEN THEY DON'T FIT (user bug, thin-box round: "corners look
  // normal when the panel is tall, have stuff poking out when shorter"): a
  // run's two fixed caps need corner-to-corner room; on a panel shorter
  // than corners+caps they slid into each other and the corner rows,
  // poking band-end art through the silhouette. Unfit caps vanish and the
  // middle runs corner to corner instead.
  const sideRoom = height - bt - bb;
  const topRoom = width - bLeft - bRight;
  const fitL = ((p['edge-left-cap-t']?.h ?? 0) + (p['edge-left-cap-b']?.h ?? 0)) * zoom <= sideRoom;
  const fitR = ((p['edge-right-cap-t']?.h ?? 0) + (p['edge-right-cap-b']?.h ?? 0)) * zoom <= sideRoom;
  const fitT = ((p['edge-top-cap-l']?.w ?? 0) + (p['edge-top-cap-r']?.w ?? 0)) * zoom <= topRoom;
  const fitB = ((p['edge-bottom-cap-l']?.w ?? 0) + (p['edge-bottom-cap-r']?.w ?? 0)) * zoom <= topRoom;
  const capTL = fitT ? (p['edge-top-cap-l']?.w ?? 0) * zoom : 0;
  const capTR = fitT ? (p['edge-top-cap-r']?.w ?? 0) * zoom : 0;
  const capBL = fitB ? (p['edge-bottom-cap-l']?.w ?? 0) * zoom : 0;
  const capBR = fitB ? (p['edge-bottom-cap-r']?.w ?? 0) * zoom : 0;
  const capLT = fitL ? (p['edge-left-cap-t']?.h ?? 0) * zoom : 0;
  const capLB = fitL ? (p['edge-left-cap-b']?.h ?? 0) * zoom : 0;
  const capRT = fitR ? (p['edge-right-cap-t']?.h ?? 0) * zoom : 0;
  const capRB = fitR ? (p['edge-right-cap-b']?.h ?? 0) * zoom : 0;

  const layers: Array<React.CSSProperties | null> = [
    // Centre first, then edge middles, then caps, then corners — each covers
    // the ends of the run beneath it, which is how the partial tile hides.
    // THE CORNER SQUARE IS SACRED: corner-art transparency is the panel's
    // silhouette, so the centre is a notched CROSS (corner-anchored field
    // + gutter strips reaching the thin bands, stopping at the corner
    // squares) and edge runs span BETWEEN the corners. Parity with the
    // game renderer (QuestBoxSkin).
    // Gutter strips phase-locked to the main field's anchor (bLeft, bt) and
    // overlapped 2px into it — unmatched phase banded shaded center art at
    // the seam and hairlined on mobile (parity with QuestBoxSkin).
    layer(center, zoom, 'repeat', { left: bLeft, right: bRight, top: bt, bottom: bb }),
    bt > cbt ? layer(center, zoom, 'repeat', { left: bLeft, right: bRight, top: cbt, height: bt - cbt + 2, backgroundPosition: `0px ${(((bt - cbt) % ((center?.h ?? 1) * zoom)) + ((center?.h ?? 1) * zoom)) % ((center?.h ?? 1) * zoom)}px` }) : null,
    bb > cbb ? layer(center, zoom, 'repeat', { left: bLeft, right: bRight, top: height - bb - 2, height: bb - cbb + 2, backgroundPosition: `0px ${(((bt - (height - bb - 2)) % ((center?.h ?? 1) * zoom)) + ((center?.h ?? 1) * zoom)) % ((center?.h ?? 1) * zoom)}px` }) : null,
    bLeft > cbl ? layer(center, zoom, 'repeat', { top: bt, bottom: bb, left: cbl, width: bLeft - cbl + 2, backgroundPosition: `${(((bLeft - cbl) % ((center?.w ?? 1) * zoom)) + ((center?.w ?? 1) * zoom)) % ((center?.w ?? 1) * zoom)}px 0px` }) : null,
    bRight > cbr ? layer(center, zoom, 'repeat', { top: bt, bottom: bb, left: width - bRight - 2, width: bRight - cbr + 2, backgroundPosition: `${(((bLeft - (width - bRight - 2)) % ((center?.w ?? 1) * zoom)) + ((center?.w ?? 1) * zoom)) % ((center?.w ?? 1) * zoom)}px 0px` }) : null,
    layer(top, zoom, 'repeat-x', { left: bLeft + capTL, right: bRight + capTR, top: 0, height: (top?.h ?? 0) * zoom }),
    layer(bottom, zoom, 'repeat-x', { left: bLeft + capBL, right: bRight + capBR, bottom: 0, height: (bottom?.h ?? 0) * zoom }),
    layer(left, zoom, 'repeat-y', { top: bt + capLT, bottom: bb + capLB, left: 0, width: (left?.w ?? 0) * zoom }),
    layer(right, zoom, 'repeat-y', { top: bt + capRT, bottom: bb + capRB, right: 0, width: (right?.w ?? 0) * zoom }),

    // The caps themselves, pinned against the corners.
    layer(p['edge-top-cap-l'], zoom, 'no-repeat', { left: bLeft, top: 0, width: capTL, height: (p['edge-top-cap-l']?.h ?? 0) * zoom }),
    layer(p['edge-top-cap-r'], zoom, 'no-repeat', { right: bRight, top: 0, width: capTR, height: (p['edge-top-cap-r']?.h ?? 0) * zoom }),
    layer(p['edge-bottom-cap-l'], zoom, 'no-repeat', { left: bLeft, bottom: 0, width: capBL, height: (p['edge-bottom-cap-l']?.h ?? 0) * zoom }),
    layer(p['edge-bottom-cap-r'], zoom, 'no-repeat', { right: bRight, bottom: 0, width: capBR, height: (p['edge-bottom-cap-r']?.h ?? 0) * zoom }),
    layer(p['edge-left-cap-t'], zoom, 'no-repeat', { left: 0, top: bt, width: (p['edge-left-cap-t']?.w ?? 0) * zoom, height: capLT }),
    layer(p['edge-left-cap-b'], zoom, 'no-repeat', { left: 0, bottom: bb, width: (p['edge-left-cap-b']?.w ?? 0) * zoom, height: capLB }),
    layer(p['edge-right-cap-t'], zoom, 'no-repeat', { right: 0, top: bt, width: (p['edge-right-cap-t']?.w ?? 0) * zoom, height: capRT }),
    layer(p['edge-right-cap-b'], zoom, 'no-repeat', { right: 0, bottom: bb, width: (p['edge-right-cap-b']?.w ?? 0) * zoom, height: capRB }),
    layer(tl, zoom, 'no-repeat', { left: 0, top: 0, width: (tl?.w ?? 0) * zoom, height: (tl?.h ?? 0) * zoom }),
    layer(tr, zoom, 'no-repeat', { right: 0, top: 0, width: (tr?.w ?? 0) * zoom, height: (tr?.h ?? 0) * zoom }),
    layer(bl, zoom, 'no-repeat', { left: 0, bottom: 0, width: (bl?.w ?? 0) * zoom, height: (bl?.h ?? 0) * zoom }),
    layer(br, zoom, 'no-repeat', { right: 0, bottom: 0, width: (br?.w ?? 0) * zoom, height: (br?.h ?? 0) * zoom }),
    // Edge ornaments render OUTSIDE this box, on the ground wrapper after
    // the plate (user call: on top of the panel, not below it) — in here
    // the box's overflow:hidden clipped their halo overhang at the panel
    // bounds and the plate covered their centers. See below.
    // Section rules last: they run across the field, between the side edges,
    // and should sit over the centre fill.
    ...dividerYs.flatMap(y => {
      const dm = p['divider'] ?? p['divider-mid'];
      const dl = p['divider-cap-l'];
      const dr = p['divider-cap-r'];
      const dlW = (dl?.w ?? 0) * zoom;
      const drW = (dr?.w ?? 0) * zoom;
      const h = (dm?.h ?? dl?.h ?? 0) * zoom;
      return [
        layer(dm, zoom, 'repeat-x', { left: bLeft + dlW, right: bRight + drW, top: y, height: h }),
        layer(dl, zoom, 'no-repeat', { left: bLeft, top: y, width: dlW, height: (dl?.h ?? 0) * zoom }),
        layer(dr, zoom, 'no-repeat', { right: bRight, top: y, width: drW, height: (dr?.h ?? 0) * zoom }),
      ];
    }),
  ];

  const anyArt = layers.some(Boolean);

  // ---- the quest box's title plate ----------------------------------------
  // Rides the top border, centered, straddling it ~60% above (the live CSS
  // rough shape's geometry). Drawn OUTSIDE the overflow-clipped panel box —
  // the straddle pokes above the top edge by design — so it lives on the
  // ground wrapper instead. Detected per-piece like the caps: any kit
  // without plate pieces renders exactly as before.
  const plateL = p['plate-cap-l'];
  const plateM = p['plate-mid'];
  const plateR = p['plate-cap-r'];
  const hasPlate = !!plateM;
  // Halo'd bitmaps are bigger than the piece; all GEOMETRY runs on nominal
  // sizes and the bitmaps hang out past them.
  const nomW = (pc?: NineSlicePiece) => (pc ? pc.w - (pc.halo ? pc.halo.l + pc.halo.r : 0) : 0);
  const nomH = (pc?: NineSlicePiece) => (pc ? pc.h - (pc.halo ? pc.halo.t + pc.halo.b : 0) : 0);
  const plateH = (nomH(plateM) || nomH(plateL)) * zoom;
  const PLATE_MIDS = 2;
  const plateW = (nomW(plateL) + nomW(plateM) * PLATE_MIDS + nomW(plateR)) * zoom;
  const plateHaloT = (plateM?.halo?.t ?? plateL?.halo?.t ?? 0) * zoom;
  // The straddle (and any halo overflow above the plate) can exceed the base
  // padding at high zoom — the ground's top padding grows to hold both.
  const straddle = Math.round(plateH * 0.6);
  const groundPadTop = hasPlate ? Math.max(GROUND_PAD, straddle + plateHaloT + 2) : GROUND_PAD;
  const plateLeft = GROUND_PAD + Math.round((width - plateW) / 2);
  const plateTop = groundPadTop - straddle;

  // ---- where the periods actually land -----------------------------------
  // A tiling run is only honest about itself at sizes where it happens to fit
  // a whole number of periods. Everywhere else the last tile is chopped, and
  // that chop is where painted flourishes get eaten.
  // The tiling RUN excludes the caps — they are fixed, so they are not part
  // of what repeats and must not be counted when working out the clip.
  const innerW = Math.max(0, width - bLeft - bRight - capTL - capTR);
  const innerH = Math.max(0, height - bt - bb - capLT - capLB);
  const topPeriod = (top?.w ?? 0) * zoom;
  const sidePeriod = (left?.h ?? 0) * zoom;

  const run = (span: number, period: number) => {
    if (!period) return null;
    const full = Math.floor(span / period);
    const remainder = span - full * period;
    return { full, remainder, pct: period ? Math.round((remainder / period) * 100) : 0 };
  };
  const topRun = run(innerW, topPeriod);
  const sideRun = run(innerH, sidePeriod);

  const seamLine = (style: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    background: 'rgba(56,189,248,0.55)',
    pointerEvents: 'none',
    ...style,
  });
  // Diagonal hatch marking the clipped remainder — "this much of the last
  // tile never renders".
  const hatch: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'none',
    backgroundImage:
      'repeating-linear-gradient(45deg, rgba(248,113,113,0.45) 0 3px, rgba(0,0,0,0) 3px 6px)',
    outline: '1px solid rgba(248,113,113,0.7)',
  };

  return (
    <div style={{ background: ground, padding: GROUND_PAD, paddingTop: groundPadTop, borderRadius: 2, position: 'relative' }}>
      <div style={{ position: 'relative', width, height, overflow: 'hidden' }}>
        {layers.map((s, i) => (s ? <div key={i} aria-hidden style={s} /> : null))}

        {!anyArt && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-stone-500 border border-dashed border-stone-700">
            Nothing painted yet — slice a sheet above.
          </div>
        )}

        {showSeams && (
          <>
            {/* period boundaries along the top/bottom runs */}
            {topRun && topPeriod > 0 && Array.from({ length: topRun.full + 1 }, (_, i) => i).map(i => (
              <div key={`vx${i}`} aria-hidden style={seamLine({ left: bLeft + capTL + i * topPeriod, top: 0, width: 1, height })} />
            ))}
            {/* period boundaries along the side runs */}
            {sideRun && sidePeriod > 0 && Array.from({ length: sideRun.full + 1 }, (_, i) => i).map(i => (
              <div key={`hz${i}`} aria-hidden style={seamLine({ top: bt + capLT + i * sidePeriod, left: 0, height: 1, width })} />
            ))}
            {/* the clipped remainder of each run */}
            {topRun && topRun.remainder > 0 && (
              <div aria-hidden style={{ ...hatch, left: bLeft + capTL + topRun.full * topPeriod, width: topRun.remainder, top: 0, height: bt }} />
            )}
            {topRun && topRun.remainder > 0 && (
              <div aria-hidden style={{ ...hatch, left: bLeft + capBL + topRun.full * topPeriod, width: topRun.remainder, bottom: 0, height: bb }} />
            )}
            {sideRun && sideRun.remainder > 0 && (
              <div aria-hidden style={{ ...hatch, top: bt + capLT + sideRun.full * sidePeriod, height: sideRun.remainder, left: 0, width: bLeft }} />
            )}
            {sideRun && sideRun.remainder > 0 && (
              <div aria-hidden style={{ ...hatch, top: bt + capRT + sideRun.full * sidePeriod, height: sideRun.remainder, right: 0, width: bRight }} />
            )}
          </>
        )}

        {/* (plate renders outside this clipped box — see below) */}
        {showContent && (
          // Sample content at the game's own scale. Deliberately the WORST
          // case the hero drawer produces: a numbered list and a bullet list
          // side by side, which is where narrow columns start wrapping.
          <div
            style={{
              position: 'relative',
              // z-1: the sample text must ride above the ground-level
              // ornament layers, matching the game's text-above-art rule.
              zIndex: 1,
              paddingTop: cbt + 6,
              paddingBottom: cbb + 6,
              paddingLeft: cbl + 8,
              paddingRight: cbr + 8,
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <div className="flex gap-3 h-full text-[11px] leading-tight">
              <div className="flex-1 min-w-0">
                <p className="uppercase tracking-wide text-stone-400 mb-1 text-center">Actions</p>
                <ol className="text-stone-300 space-y-1">
                  <li>1. Charges two tiles forward each turn.</li>
                  <li>2. Cleaves every adjacent enemy on arrival.</li>
                </ol>
              </div>
              <div className="flex-1 min-w-0">
                <p className="uppercase tracking-wide text-stone-400 mb-1 text-center">Attributes</p>
                <ul className="text-stone-300 space-y-1">
                  <li>• Heavy armour</li>
                  <li>• Cannot be pushed</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* THE QUEST PLATE — composited over the top border, centered, poking
          into the ground padding. Drawn after (over) the panel box. The
          wrapper is NOMINAL-sized (centering math); halo'd bitmaps overhang
          it via negative offsets, so overflow art draws where it was
          painted relative to the plate. */}
      {hasPlate && (
        <div aria-hidden style={{ position: 'absolute', left: plateLeft, top: plateTop, width: plateW, height: plateH }}>
          {[
            layer(plateM, zoom, 'repeat-x', {
              left: nomW(plateL) * zoom,
              right: nomW(plateR) * zoom,
              top: -(plateM?.halo?.t ?? 0) * zoom,
              height: (plateM?.h ?? 0) * zoom,
            }),
            layer(plateL, zoom, 'no-repeat', {
              left: -(plateL?.halo?.l ?? 0) * zoom,
              top: -(plateL?.halo?.t ?? 0) * zoom,
              width: (plateL?.w ?? 0) * zoom,
              height: (plateL?.h ?? 0) * zoom,
            }),
            layer(plateR, zoom, 'no-repeat', {
              right: -(plateR?.halo?.r ?? 0) * zoom,
              top: -(plateR?.halo?.t ?? 0) * zoom,
              width: (plateR?.w ?? 0) * zoom,
              height: (plateR?.h ?? 0) * zoom,
            }),
          ].map((s, i) => (s ? <div key={`plate${i}`} style={s} /> : null))}
        </div>
      )}

      {/* EDGE ORNAMENTS — the TOPMOST art layer (user call, 2026-08-01:
          "layered on top of the quest panel, not below it"). On the ground
          wrapper, after the plate, so they ride over the frame AND the
          plate with their halo overhang unclipped; the sample text lifts
          above them via z-1. Mirrors the game's QuestOrnaments exactly. */}
      {[['edge-top-ornament', true] as const, ['edge-bottom-ornament', false] as const].map(([id, isTop]) => {
        const pc = p[id];
        if (!pc) return null;
        const haloL = (pc.halo?.l ?? 0) * zoom;
        const haloT = (pc.halo?.t ?? 0) * zoom;
        const onw = (pc.w - (pc.halo ? pc.halo.l + pc.halo.r : 0)) * zoom;
        const onh = (pc.h - (pc.halo ? pc.halo.t + pc.halo.b : 0)) * zoom;
        const bandH = isTop ? cbt : cbb;
        const edgeOffset = Math.round((bandH - onh) / 2);
        const nominalTop = isTop ? edgeOffset : height - bandH + edgeOffset;
        const s = layer(pc, zoom, 'no-repeat', {
          left: GROUND_PAD + Math.round((width - onw) / 2) - haloL,
          top: groundPadTop + nominalTop - haloT,
          width: pc.w * zoom,
          height: pc.h * zoom,
        });
        return s ? <div key={id} aria-hidden style={s} /> : null;
      })}

      {showSeams && (
        <div className="mt-2 text-[11px] text-stone-300 space-y-0.5 font-mono">
          {topRun && topPeriod > 0 && (
            <div>
              top/bottom run: {innerW}px ÷ {topPeriod}px period = <strong>{topRun.full} whole tiles</strong>
              {topRun.remainder > 0
                ? <> + <span className="text-red-300">{topRun.remainder}px clipped ({topRun.pct}% of a tile)</span></>
                : <span className="text-green-300"> — exact fit</span>}
            </div>
          )}
          {sideRun && sidePeriod > 0 && (
            <div>
              left/right run: {innerH}px ÷ {sidePeriod}px period = <strong>{sideRun.full} whole tiles</strong>
              {sideRun.remainder > 0
                ? <> + <span className="text-red-300">{sideRun.remainder}px clipped ({sideRun.pct}% of a tile)</span></>
                : <span className="text-green-300"> — exact fit</span>}
            </div>
          )}
          <div className="text-stone-500">
            anything painted inside one period repeats every period; the hatched strip never renders.
          </div>
        </div>
      )}
    </div>
  );
};

export default PanelNineSlice;
