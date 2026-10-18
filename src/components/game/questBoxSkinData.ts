import { buildSkin, nomH, Z, nomW } from './panelSkins';
import skinJson from '../../assets/panels/quest-box-slices.json';

// Skin data and draws moved out of QuestBoxSkin.tsx (2026-10-18 delint: a
// component file that also exports plain values breaks React Fast
// Refresh). The forge preview draws through these too (share-the-renderer).

// Game.tsx imports the snap hook from here — keep the path stable.

export const PIECES = buildSkin(skinJson, 'quest-box');
export const P = (id: string) => PIECES.get(id);

/** The frame renders only when the minimum readable box exists. */
export const questSkinFrameActive = PIECES.has('corner-tl') && PIECES.has('center');
/** The plate art renders when a middle exists (caps optional). */
export const questSkinPlateActive = PIECES.has('plate-mid') || PIECES.has('plate-mid-l') || PIECES.has('plate-mid-r');
/** The divider ("the side-quests rule") renders when its middle exists. */
export const questSkinDividerActive = PIECES.has('divider-mid');

// Frame geometry (run starts, cap anchoring) keys off the CORNERS as a
// nine-slice must; the CONTENT padding keys off the EDGE BANDS instead
// (thinness lever): thin edges + proud corners = a thin box. Edges, caps
// and center carry no halo (nominal == bitmap); the CORNERS carry a
// vertical halo since kit v21 (overhang room above/below the silhouette),
// so all corner-keyed geometry runs on NOMINAL dims and corner draws
// anchor nominal with the bitmap overhanging into the bleed.
export const tl = P('corner-tl');
export const tr = P('corner-tr');
export const cornerBl = P('corner-bl');
export const topMid = P('edge-top-mid');
export const bottomMid = P('edge-bottom-mid');
export const leftMid = P('edge-left-mid');
export const rightMid = P('edge-right-mid');
export const questFrameBorders = {
  t: (topMid?.h ?? (tl ? nomH(tl) : 0)) * Z,
  b: (bottomMid?.h ?? (cornerBl ? nomH(cornerBl) : 0)) * Z,
  l: (leftMid?.w ?? (tl ? nomW(tl) : 0)) * Z,
  r: (rightMid?.w ?? (tr ? nomW(tr) : 0)) * Z,
};

// THE SPLIT PLATE BAND (kit v22, user ask 2026-08-10: "divide plate mid
// into two different pieces instead of repeating the left one"): the band
// is BOOKMATCHED — plate-mid-l tiles from the left cap, plate-mid-r tiles
// RIGHT-ANCHORED from the right cap, meeting at a center seam, so each
// side is its own painting and any width overflow crops at the middle
// where the eye forgives it. Legacy single-piece exports (plate-mid) fall
// back to both slots and render exactly as before — slice JSONs stay
// self-describing.
export const plateMidLegacy = P('plate-mid');
export const plateMidL = P('plate-mid-l') ?? plateMidLegacy ?? P('plate-mid-r');
const plateMid = plateMidL;
/**
 * The whole SEAL assembly (plate + top medallions + QUEST text) sits this
 * much lower than pure geometry would put it — 1 art px, user nudge
 * 2026-08-10. Applied to the plate straddle AND the top ornament;
 * PanelNineSlice mirrors it (preview parity).
 */
export const SEAL_DROP = 1;
/**
 * How far the plate pokes above the box's top edge (the preview's 60% rule,
 * minus the seal drop). Rounded in ART pixels, then scaled — an odd CSS
 * offset (the old CSS-px rounding gave 17) put the plate's art grid half an
 * art pixel off the frame's, the user's "not pixel perfect" report
 * (2026-08-10).
 */
export const questPlateStraddle = plateMid ? (Math.round(nomH(plateMid) * 0.6) - SEAL_DROP) * Z : 0;

// ─── The ornaments ──────────────────────────────────────────────────────────

/** Ornaments render only alongside the frame they decorate. */
export const questSkinOrnamentsActive =
  questSkinFrameActive && (PIECES.has('edge-top-ornament') || PIECES.has('edge-bottom-ornament'));
