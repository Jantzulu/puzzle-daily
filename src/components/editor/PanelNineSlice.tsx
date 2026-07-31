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
}

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

export const PanelNineSlice: React.FC<Props> = ({ pieces, zoom, width, height, showContent, ground }) => {
  const p = useMemo(() => byId(pieces), [pieces]);

  const tl = p['corner-tl'];
  const tr = p['corner-tr'];
  const bl = p['corner-bl'];
  const br = p['corner-br'];
  const top = p['edge-top'];
  const bottom = p['edge-bottom'];
  const left = p['edge-left'];
  const right = p['edge-right'];
  const center = p['center'];

  // Border thicknesses come from the ART, not from a guess: the corners define
  // them, with the edges as a fallback when a corner is unpainted.
  const bt = (tl?.h ?? top?.h ?? 0) * zoom;
  const bb = (bl?.h ?? bottom?.h ?? 0) * zoom;
  const bLeft = (tl?.w ?? left?.w ?? 0) * zoom;
  const bRight = (tr?.w ?? right?.w ?? 0) * zoom;

  const layers: Array<React.CSSProperties | null> = [
    // Centre first, then edges, then corners — corners must cover the ends of
    // the edge runs, which is how a nine-slice hides its partial tiles.
    layer(center, zoom, 'repeat', { left: bLeft, right: bRight, top: bt, bottom: bb }),
    layer(top, zoom, 'repeat-x', { left: bLeft, right: bRight, top: 0, height: (top?.h ?? 0) * zoom }),
    layer(bottom, zoom, 'repeat-x', { left: bLeft, right: bRight, bottom: 0, height: (bottom?.h ?? 0) * zoom }),
    layer(left, zoom, 'repeat-y', { top: bt, bottom: bb, left: 0, width: (left?.w ?? 0) * zoom }),
    layer(right, zoom, 'repeat-y', { top: bt, bottom: bb, right: 0, width: (right?.w ?? 0) * zoom }),
    layer(tl, zoom, 'no-repeat', { left: 0, top: 0, width: (tl?.w ?? 0) * zoom, height: (tl?.h ?? 0) * zoom }),
    layer(tr, zoom, 'no-repeat', { right: 0, top: 0, width: (tr?.w ?? 0) * zoom, height: (tr?.h ?? 0) * zoom }),
    layer(bl, zoom, 'no-repeat', { left: 0, bottom: 0, width: (bl?.w ?? 0) * zoom, height: (bl?.h ?? 0) * zoom }),
    layer(br, zoom, 'no-repeat', { right: 0, bottom: 0, width: (br?.w ?? 0) * zoom, height: (br?.h ?? 0) * zoom }),
  ];

  const anyArt = layers.some(Boolean);

  return (
    <div style={{ background: ground, padding: 16, borderRadius: 2 }}>
      <div style={{ position: 'relative', width, height, overflow: 'hidden' }}>
        {layers.map((s, i) => (s ? <div key={i} aria-hidden style={s} /> : null))}

        {!anyArt && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-stone-500 border border-dashed border-stone-700">
            Nothing painted yet — slice a sheet above.
          </div>
        )}

        {showContent && (
          // Sample content at the game's own scale. Deliberately the WORST
          // case the hero drawer produces: a numbered list and a bullet list
          // side by side, which is where narrow columns start wrapping.
          <div
            style={{
              position: 'relative',
              paddingTop: bt + 6,
              paddingBottom: bb + 6,
              paddingLeft: bLeft + 8,
              paddingRight: bRight + 8,
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
    </div>
  );
};

export default PanelNineSlice;
