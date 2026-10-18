import { type SkinPiece, nomW, Z, nomH, drawFixed, buildSkin } from './panelSkins';
import skinJson from '../../assets/panels/play-gem-slices.json';

// Skin data and draws moved out of PlayStoneSkin.tsx (2026-10-18 delint: a
// component file that also exports plain values breaks React Fast
// Refresh). The forge preview draws through these too (share-the-renderer).

// ============================================================================
// PLAY STONE SKIN — forge-cut art on the rail's action button
// ============================================================================
// Consumer of the 'play-gem' kit ("Play Stone"), the same hardcoded drop
// path as every skinned surface: paint → export → overwrite
// src/assets/panels/play-gem-slices.json → HMR → the button wears it.
// Empty placeholder = the procedural emerald GemMesh baseline.
//
// The user's design split (2026-08-03):
//   - BUTTON FACE dims until a hero is placed (the dim lives HERE, on the
//     face canvas only — the button's old whole-element opacity-50 would
//     dim the frame too).
//   - FRAME never dims, drawn OVER the face (it may overlap the face's
//     edges), 8-art aura held by the bleed — constant through every state.
//   - Optional hover/pressed faces swap via CSS opacity under
//     .gem-btn:hover/:active (canvas stack, no JS state) — and only while
//     playable (a dimmed stone shouldn't glint).
// The DOM label rides on top, as everywhere. One unified size: the button
// is 120×36px on every viewport.
//
// 2026-08-04 redesign (user spec): while a run is in progress the same
// stone becomes the CONCEDE button — an alternate face family
// (play-button-concede + optional -hover/-pressed) SHARING the one
// never-dimming frame. The Turn counter moved off the stone onto the
// TURNS rung plaque.

export const PIECES = buildSkin(skinJson, 'play-gem');
export const playStoneSkinActive = PIECES.has('play-button') || PIECES.has('play-frame');
export const concedeStoneActive = PIECES.has('play-button-concede');

/** Face dim while no hero is placed — tuned to read as "waiting", not broken. */
export const PLAY_STONE_DIM = 0.45;

/**
 * One stone piece, nominal-centered in the button box (halo overhang
 * outside it). THE renderer's draw — the forge's live preview
 * (PortcullisLive) composes the same routine on its filterless canvas,
 * so preview divergence stays structurally impossible.
 */
export const drawStonePiece = (ctx: CanvasRenderingContext2D, w: number, h: number, piece: SkinPiece) => {
  const nw = nomW(piece) * Z;
  const nh = nomH(piece) * Z;
  drawFixed(ctx, piece, Math.round((w - nw) / 2) - (piece.halo?.l ?? 0) * Z, Math.round((h - nh) / 2) - (piece.halo?.t ?? 0) * Z);
};

/**
 * Darken the face IN ITS OWN PIXELS — 'source-atop' clips the black wash
 * to the painted silhouette, so the stone stays fully OPAQUE and its
 * transparent surround stays transparent. The first dim implementation
 * used CSS opacity, which made the whole face translucent and the rung's
 * plates showed THROUGH the stone (user catch, 2026-08-04).
 */
export const dimStoneFace = (ctx: CanvasRenderingContext2D, w: number, h: number, bleed: number) => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(0, 0, 0, ${1 - PLAY_STONE_DIM})`;
  ctx.fillRect(-bleed, -bleed, w + bleed * 2, h + bleed * 2);
  ctx.restore();
};
