import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../shared/Toast';
import { PortcullisMesh } from '../game/PortcullisMesh';
import { GemMesh } from '../game/GemMesh';
import { GateBeamMesh } from '../shared/GateMesh';
import { barCenters, EDGE_BAR_INSET } from '../game/panelSkins';
import { PanelForgeImport } from './PanelForgeImport';

// ============================================================================
// PANEL FORGE — nine-slice / tiling-piece spec + template exporter (Phase 1)
// ============================================================================
// Maps out exactly which pixel pieces each themeable UI surface needs, at
// what sizes, and exports paint-over templates:
//   - Template PNG (1× art pixels): transparent slots with guide markings —
//     paint on a layer above it, hide the template layer on export.
//   - Legend PNG (4×): the same layout, labeled, for reference.
//   - Manifest JSON: machine-readable slot coordinates so the Phase 2
//     importer can auto-slice a painted sheet without guessing.
//
// Core rules the templates encode:
//   - Every slot has a NOMINAL footprint (the layout size, tinted) plus an
//     OVERFLOW HALO around it. Art may exceed the nominal bounds into the
//     halo — the renderer anchors it (center / outer corner / root), same as
//     board sprites exceeding their 24px tile. Smaller art is always fine.
//   - Tiling pieces are STRICT in their tiling axis (must repeat seamlessly
//     at exactly the nominal period) and flexible in the cross axis.
//   - Kits are duplicable: variants (e.g. a Defeat window styled differently
//     from Victory) are copies of a kit painted independently.

type RepeatMode = 'fixed' | 'tile-x' | 'tile-y' | 'tile-xy';

export interface PieceSpec {
  id: string;
  label: string;
  w: number; // nominal art px (editable)
  h: number;
  repeat: RepeatMode;
  notes?: string;
}

export interface KitSpec {
  id: string;
  name: string;
  builtIn?: boolean;
  description: string;
  pieces: PieceSpec[];
}

const REPEAT_INFO: Record<RepeatMode, { symbol: string; blurb: string }> = {
  fixed: { symbol: '·', blurb: 'fixed — may overflow in any direction' },
  'tile-x': { symbol: '↔', blurb: 'tiles horizontally — width is a strict period, height may overflow' },
  'tile-y': { symbol: '↕', blurb: 'tiles vertically — height is a strict period, width may overflow' },
  'tile-xy': { symbol: '⤡', blurb: 'tiles both ways — both dimensions are strict periods' },
};

// Overflow headroom (art px) added around each slot on the non-strict axes.
const HALO = 8;

const nineSlice = (corner: number, edge: number, center: number): PieceSpec[] => [
  { id: 'corner-tl', label: 'Corner TL', w: corner, h: corner, repeat: 'fixed', notes: 'Anchors at its outer corner; ornament may overflow outward.' },
  { id: 'corner-tr', label: 'Corner TR', w: corner, h: corner, repeat: 'fixed' },
  { id: 'corner-bl', label: 'Corner BL', w: corner, h: corner, repeat: 'fixed' },
  { id: 'corner-br', label: 'Corner BR', w: corner, h: corner, repeat: 'fixed' },
  { id: 'edge-top', label: 'Edge Top', w: center, h: edge, repeat: 'tile-x', notes: 'Ends must meet the top corners seamlessly.' },
  { id: 'edge-bottom', label: 'Edge Bottom', w: center, h: edge, repeat: 'tile-x' },
  { id: 'edge-left', label: 'Edge Left', w: edge, h: center, repeat: 'tile-y' },
  { id: 'edge-right', label: 'Edge Right', w: edge, h: center, repeat: 'tile-y' },
  { id: 'center', label: 'Center Fill', w: center, h: center, repeat: 'tile-xy', notes: 'The panel background; keep it quiet so content reads.' },
  { id: 'divider', label: 'Section Divider', w: center, h: 6, repeat: 'tile-x', notes: 'Horizontal rule between panel sections.' },
];

const buttonStates = (state: string): PieceSpec[] => [
  { id: `btn-${state}-cap-l`, label: `Button ${state} · Cap L`, w: 6, h: 16, repeat: 'fixed' },
  { id: `btn-${state}-mid`, label: `Button ${state} · Middle`, w: 12, h: 16, repeat: 'tile-x', notes: 'Stretch zone between the caps.' },
  { id: `btn-${state}-cap-r`, label: `Button ${state} · Cap R`, w: 6, h: 16, repeat: 'fixed' },
];

/**
 * CAPPED EDGES — the richer frame vocabulary (2026-07-31).
 *
 * A plain nine-slice gives each edge ONE part, which can only repeat. That
 * makes a whole class of ornament impossible to express: a notch at each end
 * of the top edge either repeats every period across the whole run, or (if it
 * was painted past the first period) is discarded outright. The user hit
 * exactly this — "there are notches in the top and bottom edges in my drawing
 * that do not appear in the preview" — and the instinct behind it was right:
 * end caps SHOULD be preserved while the middle repeats. That is what corners
 * already do; the edges just had no equivalent.
 *
 * So every edge becomes three parts: a fixed cap at each end that never
 * stretches and never repeats, and a repeating middle between them. The
 * divider gets the same treatment, since a section rule wants finished ends
 * for the same reason a frame does.
 */
const nineSliceCapped = (corner: number, edge: number, cap: number, mid: number, center: number): PieceSpec[] => [
  { id: 'corner-tl', label: 'Corner TL', w: corner, h: corner, repeat: 'fixed', notes: 'Anchors at its outer corner; ornament may overflow outward.' },
  { id: 'corner-tr', label: 'Corner TR', w: corner, h: corner, repeat: 'fixed' },
  { id: 'corner-bl', label: 'Corner BL', w: corner, h: corner, repeat: 'fixed' },
  { id: 'corner-br', label: 'Corner BR', w: corner, h: corner, repeat: 'fixed' },

  { id: 'edge-top-cap-l', label: 'Top Cap L', w: cap, h: edge, repeat: 'fixed', notes: 'Fixed against the corner — draw your end notch HERE and it survives every width.' },
  { id: 'edge-top-mid', label: 'Top Middle', w: mid, h: edge, repeat: 'tile-x', notes: 'The only part that repeats. Keep it plain, or the motif recurs every period.' },
  { id: 'edge-top-cap-r', label: 'Top Cap R', w: cap, h: edge, repeat: 'fixed' },

  { id: 'edge-bottom-cap-l', label: 'Bottom Cap L', w: cap, h: edge, repeat: 'fixed' },
  { id: 'edge-bottom-mid', label: 'Bottom Middle', w: mid, h: edge, repeat: 'tile-x' },
  { id: 'edge-bottom-cap-r', label: 'Bottom Cap R', w: cap, h: edge, repeat: 'fixed' },

  { id: 'edge-left-cap-t', label: 'Left Cap Top', w: edge, h: cap, repeat: 'fixed' },
  { id: 'edge-left-mid', label: 'Left Middle', w: edge, h: mid, repeat: 'tile-y' },
  { id: 'edge-left-cap-b', label: 'Left Cap Bottom', w: edge, h: cap, repeat: 'fixed' },

  { id: 'edge-right-cap-t', label: 'Right Cap Top', w: edge, h: cap, repeat: 'fixed' },
  { id: 'edge-right-mid', label: 'Right Middle', w: edge, h: mid, repeat: 'tile-y' },
  { id: 'edge-right-cap-b', label: 'Right Cap Bottom', w: edge, h: cap, repeat: 'fixed' },

  { id: 'center', label: 'Center Fill', w: center, h: center, repeat: 'tile-xy', notes: 'The panel background; keep it quiet so content reads.' },

  { id: 'divider-cap-l', label: 'Divider Cap L', w: cap, h: 6, repeat: 'fixed', notes: 'Finished end for the section rule.' },
  { id: 'divider-mid', label: 'Divider Middle', w: mid, h: 6, repeat: 'tile-x' },
  { id: 'divider-cap-r', label: 'Divider Cap R', w: cap, h: 6, repeat: 'fixed' },
];

// Exported for the assembly-invariant test (cut sources must stay valid).
export const DEFAULT_KITS: KitSpec[] = [
  {
    id: 'window-panel-capped',
    name: 'Window Panel (capped edges)',
    builtIn: true,
    description:
      'Nine-slice with FINISHED EDGE ENDS. Each edge is a fixed cap at both ends plus a repeating middle, so end notches and terminals survive any panel size — only the plain middle tiles. Use this when the frame has ornament rather than a uniform run.',
    // corner 12, edge 12, cap 12, MID 24, centre 24.
    // The mid period deliberately MATCHES the plain kit's edge period (24), so
    // a repeating motif drawn for `window-panel` transfers to this kit's
    // middle unchanged — the capped kit adds ends, it does not re-scale what
    // was already working. The cap matches the corner (12) so the two read as
    // one continuous block of hardware rather than two arbitrary sizes.
    // First cut used cap 10 / mid 16, which made the assembled sample SMALLER
    // than the plain kit (92x76 against 120x96) with a third less room for the
    // repeating motif. That was an accident of the numbers, not a decision.
    pieces: nineSliceCapped(12, 12, 12, 24, 24),
  },
  {
    id: 'window-panel',
    name: 'Window Panel (base)',
    builtIn: true,
    description: 'Nine-slice kit for popup windows (victory, defeat, concede, help…). Duplicate this kit to give any window family its own look — surfaces are mapped to kits in Phase 2.',
    pieces: nineSlice(12, 12, 24),
  },
  {
    id: 'under-board-panel',
    name: 'Under-Board Panel',
    builtIn: true,
    description: 'The cohesive panel wrapping the quest banner and everything below the puzzle. Same nine-slice anatomy as windows, sized independently.',
    pieces: nineSlice(12, 12, 24),
  },
  {
    id: 'quest-box',
    name: 'Quest Box',
    builtIn: true,
    description:
      'The quest panel under the board (the 2026-08-01 plate-box design, currently placeholder CSS in Game.tsx). Capped nine-slice — finished edge ends, so ornament survives ANY width or height — plus the QUEST title plate as its own 3-slice riding the top border. In the game the plate STRADDLES the border line (about 60% above it), so paint it as a finished object on all four sides; the sample gives it a separate band only so the cut is clean. The divider is the side-quests rule. Periods match the other kits (mid 24, cap = corner 12) so motifs transfer.',
    pieces: [
      // Top/bottom bands: 8 art (v20, user ask — headroom for the scroll
      // silhouette; the original thin 5-art bands left the painted bottom
      // line pinned on the band's top row). SAFE ahead of re-exported art
      // because band heights move no other region and neither sheet
      // dimension — the committed 5-tall JSON keeps rendering (it is
      // self-describing) and the artist's sheet re-cuts cleanly, the bands
      // just gaining rows. The 2026-08-01 shred was different: size changes
      // that SHIFT other regions do desync a painted sheet mid-paint — any
      // future resize here must re-prove the no-shift property first.
      ...nineSliceCapped(12, 12, 12, 24, 24).map(p =>
        p.id.startsWith('edge-top-') || p.id.startsWith('edge-bottom-') ? { ...p, h: 8 } : p),
      { id: 'plate-cap-l', label: 'Plate Cap L', w: 6, h: 14, repeat: 'fixed', notes: 'Finished left end of the QUEST plate — it straddles the box border in-game, so give it a complete outline.' },
      { id: 'plate-mid', label: 'Plate Middle', w: 12, h: 14, repeat: 'tile-x', notes: 'Repeats behind the plate label so the plate hugs any text length. The label itself stays DOM text.' },
      { id: 'plate-cap-r', label: 'Plate Cap R', w: 6, h: 14, repeat: 'fixed' },
      { id: 'edge-top-ornament', label: 'Top Edge Ornament', w: 24, h: 12, repeat: 'fixed', notes: 'OPTIONAL centerpiece medallion, rendered CENTERED on the top edge, layered over ALL the panel art (frame and plate — only the DOM text rides higher) — fixed like a corner: never stretched, never tiled, survives every panel width. Halo\'d, so it may be painted larger than the edge band — and the template\'s top 5 rows are EXTRA ornament aura (the slots\' upward halo reaches 13, everything else sits 5 lower). Leave unpainted to skip it.' },
      { id: 'edge-bottom-ornament', label: 'Bottom Edge Ornament', w: 24, h: 12, repeat: 'fixed', notes: 'Same as the top ornament, centered on the bottom edge — its slot shares the template\'s 5-row top aura.' },
    ],
  },
  {
    id: 'portcullis-gate',
    name: 'Portcullis Gate (bars)',
    builtIn: true,
    description: 'The gate bars rising above the control rail (the top zone of PortcullisMesh). WIRED: drop the export at src/assets/panels/portcullis-gate-slices.json. Sizes audited against the LIVE geometry at Z=2 (2 CSS px per art px), 2026-08-02: bars render 12 CSS px wide at the six shared x-fractions with the OUTER PAIR FLUSH at the screen edges (edge bars contain the shape — the renderer clamps them flush at every width). NOTE the meshes STRETCHED with the viewport (desktop bars ~21px, mobile ~11px); painted art is fixed-size — 6 art px is the mobile-true width. PAINT ORDER: once EITHER this file or the Control Rail file is painted, the canvas replaces the whole rail svg — paint this bar kit first (one piece, shared stock), or the rising bars vanish while the rail wears art.',
    pieces: [
      { id: 'bar-segment', label: 'Gate Bar Segment', w: 6, h: 24, repeat: 'tile-y', notes: 'One bar: lit left edge, shaded right. Repeats vertically behind the board and up the open menu. SAME STOCK as the Nav Gate kit\'s Vertical Bar Segment — paint them identically.' },
      { id: 'bar-top-cap', label: 'Bar Top Cap', w: 6, h: 4, repeat: 'fixed', notes: 'Optional finial where a bar ends. PAINT IT IN THE DETACHED SLOT at the sheet\'s top-left — the dashed boxes at each bar top only preview placement, and shaft paint through them is discarded (it used to leak into this piece\'s cut). Leave the slot unpainted to skip caps.' },
    ],
  },
  {
    id: 'control-rail',
    name: 'Control Rail',
    builtIn: true,
    description: 'The iron rail the game controls sit on, with its forge plates and hanging spikes. WIRED: drop the export at src/assets/panels/control-rail-slices.json. Sizes audited against the LIVE geometry at Z=2, 2026-08-02: the band fills its 44 CSS px box (22 art), spikes hang ~16 CSS (8 art), plates rendered 9 CSS in the mesh — art quantizes to 8 CSS (4 art). Plates + spikes sit at ALL SIX bar fractions, outer pair flush at the screen edges — the sample shows the outer spikes CLIPPED by the sheet edge because that is exactly how the live pair clips at the screen edge. Shares the drop-path canvas with the Portcullis Gate kit — see its PAINT ORDER note.',
    pieces: [
      { id: 'rail-face', label: 'Rail Face', w: 24, h: 22, repeat: 'tile-x', notes: 'The flat band the DOM controls sit on — fills the full 44px rung box at Z=2. Lit top edge, dark bottom lip.' },
      { id: 'rail-cap-l', label: 'Rail Cap L', w: 8, h: 22, repeat: 'fixed', notes: 'Optional screen-edge finisher — the live mesh runs edge to edge with no caps; leave unpainted to keep that. VERTICALLY CENTERED on the band: size it taller than 22 and it overhangs the rung top and bottom equally.' },
      { id: 'rail-cap-r', label: 'Rail Cap R', w: 8, h: 22, repeat: 'fixed', notes: 'Centered on the band like the left cap.' },
      { id: 'forge-plate', label: 'Forge Plate', w: 4, h: 4, repeat: 'fixed', notes: 'SAME HARDWARE as the Nav Gate kit\'s "Beam Forge Plate" — paint them identically, or the bottom rung reads as a different make of iron than the lattice above it. Renders 8 CSS px (the mesh\'s standardized plate was 9 — art must quantize to even; resize to 5 for 10px if 8 reads too fine). PAINT IT IN THE DETACHED SLOT above the band; the dashed in-band boxes only preview the live placement (each bar crossing) — paint there lands inside the band/cap cuts and ships baked into them.' },
      { id: 'rail-spike', label: 'Rail Spike', w: 8, h: 8, repeat: 'fixed', notes: 'Hangs below the rail at each bar; anchors at its root (top edge). The four interior slots are real (the first is the cut); the dashed outer pair previews how the live edge spikes clip at the screen edge. The cut carries 8 art of SIDE AURA each way — tips may curl wide of the nominal box (magenta shows the paint room); height stays exact, no vertical aura.' },
    ],
  },
  {
    id: 'nav-gate',
    name: 'Nav Gate Menu',
    builtIn: true,
    description: 'The hamburger menu\'s lattice: each page item rides a horizontal iron beam (GateBeamMesh) with the vertical bars threading the stack, and its label sits on a steel plate sign. WIRED: drop the export at src/assets/panels/nav-gate-slices.json. Sizes audited against the LIVE geometry at Z=2, 2026-08-02 — the old draft was wrong three ways: beams are the THIN 36px iron (18 art, settled decision — not 12), signs ~26px tall (13 art, not 10), bars 12px wide (6 art, not 5). Bars sit at the six shared fractions with the OUTER PAIR FLUSH at the menu edges, matching the rail below so the columns read as one gate.',
    pieces: [
      { id: 'beam-face', label: 'Beam Face', w: 24, h: 18, repeat: 'tile-x', notes: 'The horizontal rung a menu item rides — the settled THIN 36px iron (18 art at Z=2): dark under-frame, flat face, lit top edge. KEEP IT SEAMLESS: it tiles, so end outlines painted here repeat internally — finished ends belong in the Beam Cap pieces.' },
      { id: 'beam-cap-l', label: 'Beam Cap L', w: 8, h: 18, repeat: 'fixed', notes: 'FIXED finished left end of every rung — outline art here never tiles (the face repeated its outer outline internally without caps; user catch 2026-08-03). PAINT IT IN THE DETACHED SLOT above the lattice; the dashed boxes at the row ends only preview placement. Vertically centered on the beam iron, like the rail caps. Leave unpainted for edge-to-edge tiling.' },
      { id: 'beam-cap-r', label: 'Beam Cap R', w: 8, h: 18, repeat: 'fixed', notes: 'Right end — same rules as the left cap.' },
      { id: 'beam-bar-segment', label: 'Vertical Bar Segment', w: 6, h: 24, repeat: 'tile-y', notes: 'Bars threading the whole stack, behind the beams. SAME STOCK as the Portcullis Gate kit\'s bar — paint them identically. CUT FROM THE DETACHED SLOT above the lattice: in the lattice the beams paint over the bars, so the dashed columns are look-only (paint them for the picture if you like — they ship nothing).' },
      { id: 'beam-plate', label: 'Beam Forge Plate', w: 4, h: 4, repeat: 'fixed', notes: 'SAME HARDWARE as the Control Rail kit\'s "Forge Plate" — paint them identically. Bolted where a bar crosses a beam. PAINT IT IN THE DETACHED SLOT above the lattice; the dashed on-beam boxes only preview placement — paint there ships inside the beam iron and tiles across every menu item.' },
      { id: 'avatar-crest', label: 'Avatar Crest', w: 16, h: 16, repeat: 'fixed', notes: 'OPTIONAL picture-frame/crest behind the signed-in player\'s avatar on the profile plate — paint it as a finished attached object (it deliberately OVERHANGS the plate; the halo gives 4 art of paint room on every side). The avatar icon renders inside at ~12 art. Leave unpainted and the avatar sits directly on the plate.' },
      { id: 'sign-cap-l', label: 'Sign Cap L', w: 6, h: 13, repeat: 'fixed', notes: 'Steel plate signage end — the square forge bolt lives here (the CSS plate\'s bolt is 5px at 4px inset; renders 26px tall).' },
      { id: 'sign-mid', label: 'Sign Middle', w: 12, h: 13, repeat: 'tile-x', notes: 'Plate face behind the label text — the DOM label rides ON TOP, like the quest plate.' },
      { id: 'sign-cap-r', label: 'Sign Cap R', w: 6, h: 13, repeat: 'fixed' },
    ],
  },
  {
    id: 'rung-plaque',
    name: 'Rung Plaques (Lives / Max Turns)',
    builtIn: true,
    description:
      'ONE shared design worn by BOTH rail plaques: LIVES (hearts) and TURNS (the run counter — 0/X before the run, counting during it) ride the control rung at their own content-driven widths. Two registers: the MAIN plaque 3-slice (13 art, 26px, vertically centered on the rung) carrying the hearts/counter, and a smaller HEADER plate 3-slice (9 art) riding ~60% proud of its top edge with the LIVES/TURNS label as DOM text — the quest box\'s QUEST-plate relation, miniaturized. Design once, both plaques wear it. WIRED: drop the export at src/assets/panels/rung-plaque-slices.json.',
    pieces: [
      { id: 'plaque-cap-l', label: 'Plaque Cap L', w: 6, h: 13, repeat: 'fixed', notes: 'Finished left end — same 13-art register as the gate sign plates, so the rung and menu speak one plate language.' },
      { id: 'plaque-mid', label: 'Plaque Middle', w: 12, h: 13, repeat: 'tile-x', notes: 'Tiles behind the content to ANY width — Lives and Max Turns differ, one design serves both. Keep it plain or the motif recurs every period.' },
      { id: 'plaque-cap-r', label: 'Plaque Cap R', w: 6, h: 13, repeat: 'fixed' },
      { id: 'header-cap-l', label: 'Header Cap L', w: 4, h: 9, repeat: 'fixed', notes: 'The HEADER plate — a smaller register riding proud of the plaque\'s top edge (the quest box\'s QUEST-plate relation, miniaturized). Finished left end.' },
      { id: 'header-mid', label: 'Header Middle', w: 8, h: 9, repeat: 'tile-x', notes: 'Tiles behind the header label (LIVES / TURNS as DOM text) to its text-driven width. Renders ~60% proud of the plaque top, centered. Leave the header pieces unpainted and the label falls back to an inline chip inside the plaque.' },
      { id: 'header-cap-r', label: 'Header Cap R', w: 4, h: 9, repeat: 'fixed' },
    ],
  },
  {
    id: 'play-gem',
    name: 'Play Stone',
    builtIn: true,
    description:
      'The action button on the control rail, at its REAL unified size: 120×36px at Z=2 on EVERY viewport (60×18 art). Split by design: the BUTTON FACE auto-dims until a hero is placed, the FRAME never dims and stays constant through every state. No gem assumptions — transparency is silhouette, paint any shape (an opaque painting makes an opaque button). WIRED: drop the export at src/assets/panels/play-gem-slices.json. While a run is in progress the SAME stone becomes the CONCEDE button: the concede face family (base + optional hover/pressed) swaps in under the ONE shared frame; the Turn counter now lives on the TURNS rung plaque, not here.',
    pieces: [
      { id: 'play-button', label: 'Button Face', w: 60, h: 18, repeat: 'fixed', notes: 'The stone itself — AUTO-DIMMED by the game until a hero is placed, so paint the LIT state. The DOM label (Play, then the running Turn counter) rides on top. Any silhouette works.' },
      { id: 'play-button-hover', label: 'Button · Hover', w: 60, h: 18, repeat: 'fixed', notes: 'OPTIONAL — swaps in under the pointer (only while playable). Leave unpainted to keep the base face.' },
      { id: 'play-button-pressed', label: 'Button · Pressed', w: 60, h: 18, repeat: 'fixed', notes: 'OPTIONAL — swaps in while pressed. Leave unpainted to skip.' },
      { id: 'play-frame', label: 'Button Frame', w: 60, h: 18, repeat: 'fixed', notes: 'The ornate frame AROUND the stone — NEVER dimmed, constant in every state INCLUDING concede, drawn OVER the face so it can overlap its edges. 8 art of AURA on every side (the magenta box): overhang the rail, get ornate. Leave unpainted for a frameless stone.' },
      { id: 'play-button-concede', label: 'Concede Face', w: 60, h: 18, repeat: 'fixed', notes: 'The stone\'s RUN-STATE face — while a game is in progress the Play stone becomes the CONCEDE button wearing this face under the same shared frame. Never dims. The CONCEDE label rides as DOM text. Leave unpainted and the game falls back to the procedural topaz gem for the concede state.' },
      { id: 'play-button-concede-hover', label: 'Concede · Hover', w: 60, h: 18, repeat: 'fixed', notes: 'OPTIONAL — swaps in under the pointer while conceding is available. Falls back to the Concede Face, never to the Play faces.' },
      { id: 'play-button-concede-pressed', label: 'Concede · Pressed', w: 60, h: 18, repeat: 'fixed', notes: 'OPTIONAL — swaps in while pressed. Falls back to the Concede Face.' },
    ],
  },
  {
    id: 'buttons',
    name: 'Buttons',
    builtIn: true,
    description: 'The generic dungeon buttons (dungeon-btn) used in dialogs and menus — three-slice (cap / tiling middle / cap) × three states. The nav gate\'s steel plate signs are NOT these; see the Nav Gate Menu kit.',
    pieces: [...buttonStates('normal'), ...buttonStates('hover'), ...buttonStates('pressed')],
  },
];

// ─── Persistence ────────────────────────────────────────────────────────────
const STORAGE_KEY = 'panel_forge_kits_v1';
// Bump when DEFAULT_KITS change shape/sizes: stored BUILT-IN kits are then
// replaced with the fresh defaults (mesh-derived proportions); user variants
// are kept as-is.
// v4: capped kit resized (cap 10->12, mid 16->24) so its period matches the
// plain kit's and its sample is not the smaller canvas. Without the bump the
// stored copy of a built-in silently wins over the code, and a sizing change
// looks like it simply did not apply.
// v5: Quest Box kit added (capped nine-slice + QUEST plate 3-slice).
// v6: Quest Box gains centered edge ornaments (fixed halo'd medallions).
// v7: portcullis-gate / control-rail / nav-gate audited against LIVE
//     geometry at Z=2 (beams 18 not 12, rail band 22 not 16, signs 13 not
//     10, bars 6 wide, spikes 8) before the artist paints them.
// v8: the edge-bar reformat reaches the guides — outer bar pair FLUSH in
//     the nav sample (was x=-1 off-sheet, corrupting the bar's rep-0 cut),
//     rail sample hardware at all SIX fractions with live-style clipped
//     edge spikes (was 3 anchors at wrong fractions), kit descriptions
//     state the flush rule.
// v9: hardware cut slots DETACHED (the quest-plate pattern) after
//     adversarial review proved one flat sheet cannot ship the same pixels
//     in two pieces: plates/bars painted in place bake into the band, cap
//     and beam cuts (worst case: an unpainted cap exports "painted" and
//     punches a hole in the live band). In-place hardware and under-beam
//     bars are now dashed GUIDE regions the slicer ignores.
// v10: quest-box edge ornaments 12->17 (superseded same day by v11 — the
//      user wanted the template layout untouched, not bigger pieces).
// v11: ornaments back to 12; the quest sheet instead grows 5 rows at the
//      TOP (everything else anchored, shifted down) and those rows are the
//      ornament slots' extra upward halo — "accept this new space as aura
//      for the ornaments", verbatim.
// v12: THE RESET TRAP CLOSED. Tonight's bumps (v8–v11) wholesale-replaced
//      stored built-ins, wiping the artist's thinned quest sizes and
//      shredding their sheet's slicing (Live panel fragments). Two fixes:
//      the quest kit's DEFAULTS now mirror the SHIPPED art (5-art
//      top/bottom bands, from the committed slices file), and loadKits
//      migrations from v12 on carry stored piece w/h over for matching
//      built-in pieces — the artist's sizes are sacred. Size corrections
//      must ship as new piece ids or as re-apply notes.
// v13: rail-spike cut gains ±8 side aura; rail caps vertically centered
//      on the band (template + live renderer). Notes-only refresh — the
//      v12 migration carries the artist's sizes through untouched.
// v14: bar-top-cap cut DETACHED to clean ground (top-left slot + on-bar
//      guides — a full-length painted shaft was leaking its top rows into
//      the cap cut, the plate law's exact disease). Gate sheet grows by
//      the slot row; artist migration = canvas +6 anchored bottom.
// v15: nav-gate gains beam-cap-l/r (8×18 fixed finished rung ends — the
//      tiling face repeated its painted outer outline internally; user
//      catch). Cuts live in the EXISTING detached slot row, guides at the
//      row ends: sheet size and all existing paint positions UNCHANGED.
// v16: nav-gate gains avatar-crest (16×16 fixed, 4-art halo all around) —
//      the signed-in avatar's picture-frame on the profile plate, painted
//      as a finished object that deliberately overhangs it (user design;
//      the smooth CSS circle broke the gate's square-hardware language).
//      Detached slot in the existing row; sheet size unchanged.
// v17: play-gem kit rebuilt as "Play Stone" at the REAL unified size
//      (60×18 art = 120×36px, all viewports — user unified the 118/132
//      split): play-button face (auto-dims until a hero is placed) +
//      optional hover/pressed + play-frame (never dims, 8-art aura,
//      drawn OVER the face). Old draft gem-normal/hover/pressed (64×22)
//      replaced.
// v18: NEW rung-plaque kit — ONE shared 3-slice worn by both rail
//      plaques (Lives + Max Turns) at content-driven widths; 13-art
//      register matching the gate sign plates. Design once, both wear it
//      (user ask).
// v19: THE PLAQUE/STONE REDESIGN (user spec, 2026-08-04). rung-plaque
//      gains a HEADER plate 3-slice (header-cap-l/mid/cap-r, 4/8/4 × 9
//      art) riding ~60% proud of the plaque's top edge with LIVES/TURNS
//      as DOM text — the quest box's QUEST-plate relation, miniaturized.
//      Sheet grows a header band at the TOP; artist migration = Sprite →
//      Canvas Size, height +11, ANCHOR BOTTOM (paint stays put), then
//      re-export the template. play-gem gains the CONCEDE face family
//      (play-button-concede + optional -hover/-pressed, 60×18 each)
//      sharing the ONE never-dimming frame — the stone becomes the
//      CONCEDE button during a run (the Turn counter moved to the TURNS
//      plaque). Slots append at the sheet's RIGHT; artist migration =
//      Canvas Size, width +210, ANCHOR LEFT, then re-export the template.
//      NOTE: header ids are header-*, NOT plate-* — plate-mid would flip
//      kitFamily() to 'quest-box'.
// v20: quest-box top/bottom bands grow 5 → 8 art (user ask, 2026-08-10:
//      room to shape the scroll silhouette — the painted bottom line sat
//      pinned on the band's top row with zero headroom; +1px edits crossed
//      into the never-cut gutter ring and vanished). Band heights feed NO
//      other region and neither sheet dimension (assembleNineSliceCapped
//      W/H key off corners, top-cap widths, left-run heights), so the
//      painted sheet stays valid with NO migration — the cut simply grows
//      into rows the gutter ring was discarding. Migration adopts 8 only
//      where the stored height is still the old default 5; a deliberate
//      artist resize stays sacred per the v12 law.
const DEFAULTS_VERSION = 20;

function loadKits(): KitSpec[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_KITS;
    const parsed = JSON.parse(raw) as KitSpec[] | { v: number; kits: KitSpec[] };
    const stored = Array.isArray(parsed) ? parsed : parsed.kits;
    const version = Array.isArray(parsed) ? 1 : parsed.v;
    if (version < DEFAULTS_VERSION) {
      const customs = stored.filter(k => !k.builtIn);
      // Pre-v12 stored built-ins may carry the 2026-08-01 accidental resets
      // (four bumps in one night wiped the artist's thinned quest sizes and
      // desynced the slice map from their painted sheet) — replace them
      // wholesale one last time; v12's defaults mirror the shipped art.
      if (version < 12) return [...DEFAULT_KITS, ...customs];
      // From v12 on, THE ARTIST'S PIECE SIZES ARE SACRED: built-ins refresh
      // to the new defaults (descriptions, notes, new pieces), but stored
      // w/h win for matching pieces — the user resizes built-ins (the
      // thinness lever), and a bump must never desync their sheet again.
      // Genuine size corrections must ship as NEW piece ids or be called
      // out for manual re-apply in the kit description.
      // v20 carve-out: the quest-box band pieces adopt the new 8-art height
      // ONLY where the stored height is still the old default 5 — a
      // deliberate artist resize (≠5) stays sacred. See the v20 entry above
      // for why this size change cannot desync the painted sheet.
      const questBandsV20 = new Set([
        'edge-top-cap-l', 'edge-top-mid', 'edge-top-cap-r',
        'edge-bottom-cap-l', 'edge-bottom-mid', 'edge-bottom-cap-r',
      ]);
      const merged = DEFAULT_KITS.map(d => {
        const prev = stored.find(s => s.builtIn && s.id === d.id);
        if (!prev) return d;
        return {
          ...d,
          pieces: d.pieces.map(p => {
            const old = prev.pieces.find(q => q.id === p.id);
            if (!old) return p;
            if (d.id === 'quest-box' && questBandsV20.has(p.id) && old.h === 5) return { ...p, w: old.w };
            return { ...p, w: old.w, h: old.h };
          }),
        };
      });
      return [...merged, ...customs];
    }
    const missing = DEFAULT_KITS.filter(d => !stored.some(s => s.id === d.id));
    return [...stored, ...missing];
  } catch {
    return DEFAULT_KITS;
  }
}

function saveKits(kits: KitSpec[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: DEFAULTS_VERSION, kits }));
  } catch { /* quota — edits stay in memory for the session */ }
}

// ─── Current-game reference (the mesh under the texture map) ────────────────
// The live SVG meshes are rasterized and mapped under the assembled view so
// the artist draws on top of what the game currently renders. Crops are in
// each mesh's viewBox units.

interface RefCrop { src: 'portcullis' | 'gem' | 'gatebeam'; x: number; y: number; w: number; h: number }

// PortcullisMesh viewBox 1000×64: bars zone y 0–20, rail 20–52, spikes 52–64;
// SIX bars centered at x=15/209/403/597/791/985 (half-width 15, outer pair
// flush with the edges — the 2026-07-31 edge-bar reformat), spikes half-width
// 22, plates 13.39×6.5 at y=29.45. Crops sample an INTERIOR bar (209) — the
// edge bars carry the viewBox clip and would give the artist a truncated
// reference. GemMesh viewBox 200×70.
const REF_CROPS: Record<string, RefCrop> = {
  'bar-segment': { src: 'portcullis', x: 194, y: 0, w: 30, h: 20 },
  'bar-top-cap': { src: 'portcullis', x: 194, y: 0, w: 30, h: 6 },
  'rail-face': { src: 'portcullis', x: 290, y: 20, w: 80, h: 32 },
  'rail-cap-l': { src: 'portcullis', x: 0, y: 20, w: 40, h: 32 },
  'rail-cap-r': { src: 'portcullis', x: 960, y: 20, w: 40, h: 32 },
  'forge-plate': { src: 'portcullis', x: 196, y: 29, w: 26, h: 9 },
  'rail-spike': { src: 'portcullis', x: 78, y: 52, w: 44, h: 12 },
  'play-button': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  'play-button-hover': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  'play-button-pressed': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  'play-button-concede': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  'play-button-concede-hover': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  'play-button-concede-pressed': { src: 'gem', x: 0, y: 0, w: 200, h: 70 },
  // GateBeamMesh viewBox 400×52: beam band y 8–44, bars at x 40..360
  // (half-width 6), forge plates 9×9 at y=21. The sign pieces are DOM CSS
  // (.nav-pill) — no mesh crop; the upload path covers them.
  'beam-face': { src: 'gatebeam', x: 216, y: 8, w: 48, h: 36 },
  'beam-bar-segment': { src: 'gatebeam', x: 34, y: 0, w: 12, h: 52 },
  'beam-plate': { src: 'gatebeam', x: 35, y: 20, w: 10, h: 10 },
};

const REF_VIEWBOX: Record<RefCrop['src'], { w: number; h: number }> = {
  portcullis: { w: 1000, h: 64 },
  gem: { w: 200, h: 70 },
  gatebeam: { w: 400, h: 52 },
};

type RefSources = Partial<Record<RefCrop['src'], HTMLCanvasElement>>;

type Underlay =
  | { mode: 'crops'; sources: RefSources }
  | { mode: 'stretch'; image: HTMLImageElement };

async function rasterizeSvg(svg: SVGSVGElement, w: number, h: number): Promise<HTMLCanvasElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg rasterize failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draw the current-game reference under the assembly regions. */
function drawUnderlay(
  ctx: CanvasRenderingContext2D,
  assembly: Assembly,
  underlay: Underlay,
  zoom: number,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true; // reference is a guide, not pixel art
  if (underlay.mode === 'stretch') {
    ctx.drawImage(underlay.image, 0, 0, assembly.width * zoom, assembly.height * zoom);
  } else {
    for (const r of assembly.regions) {
      const crop = REF_CROPS[r.pieceId];
      const source = crop && underlay.sources[crop.src];
      if (!crop || !source) continue;
      const s = source.width / REF_VIEWBOX[crop.src].w;
      const sv = source.height / REF_VIEWBOX[crop.src].h;
      ctx.drawImage(
        source,
        crop.x * s, crop.y * sv, crop.w * s, crop.h * sv,
        r.x * zoom, r.y * zoom, r.w * zoom, r.h * zoom,
      );
    }
  }
  ctx.restore();
}

// ─── Layout ─────────────────────────────────────────────────────────────────
// Pack slots into rows. Each slot's paint box = nominal + halo on the
// non-strict axes; strict (tiling) axes get no halo so the period is exact.

interface SlotLayout {
  piece: PieceSpec;
  paint: { x: number; y: number; w: number; h: number };
  nominal: { x: number; y: number; w: number; h: number };
}

interface KitLayout {
  slots: SlotLayout[];
  width: number;
  height: number;
}

const GUTTER = 6;
const MARGIN = 8;
const MAX_ROW_W = 300; // art px before wrapping

function haloFor(repeat: RepeatMode): { x: number; y: number } {
  switch (repeat) {
    case 'fixed': return { x: HALO, y: HALO };
    case 'tile-x': return { x: 0, y: HALO };
    case 'tile-y': return { x: HALO, y: 0 };
    case 'tile-xy': return { x: 0, y: 0 };
  }
}

function layoutKit(kit: KitSpec): KitLayout {
  const slots: SlotLayout[] = [];
  let x = MARGIN;
  let y = MARGIN;
  let rowH = 0;

  for (const piece of kit.pieces) {
    const halo = haloFor(piece.repeat);
    const paintW = piece.w + halo.x * 2;
    const paintH = piece.h + halo.y * 2;

    if (x > MARGIN && x + paintW > MAX_ROW_W) {
      x = MARGIN;
      y += rowH + GUTTER;
      rowH = 0;
    }

    slots.push({
      piece,
      paint: { x, y, w: paintW, h: paintH },
      nominal: { x: x + halo.x, y: y + halo.y, w: piece.w, h: piece.h },
    });

    x += paintW + GUTTER;
    rowH = Math.max(rowH, paintH);
  }

  return { slots, width: MAX_ROW_W + MARGIN, height: y + rowH + MARGIN };
}

// ─── Rendering ──────────────────────────────────────────────────────────────

/** 1× paint-over template: transparent slots, magenta paint-box outlines in
 *  the gutters, tinted nominal footprints. Paint on a layer ABOVE this. */
function renderTemplate(ctx: CanvasRenderingContext2D, layout: KitLayout): void {
  ctx.clearRect(0, 0, layout.width, layout.height);
  for (const slot of layout.slots) {
    const { paint, nominal } = slot;
    // Paint-box boundary — sits in the gutter, outside paintable pixels.
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(paint.x - 0.5, paint.y - 0.5, paint.w + 1, paint.h + 1);
    // Nominal footprint tint (inside the slot; you paint over it).
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.fillRect(nominal.x, nominal.y, nominal.w, nominal.h);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.45)';
    ctx.strokeRect(nominal.x + 0.5, nominal.y + 0.5, nominal.w - 1, nominal.h - 1);
  }
}

/** Zoomed legend with labels — reference only, not for painting. */
function renderLegend(ctx: CanvasRenderingContext2D, layout: KitLayout, kit: KitSpec, zoom: number): void {
  const w = layout.width * zoom;
  const h = layout.height * zoom + 20;
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(0, 0, w, h);

  for (const slot of layout.slots) {
    const { paint, nominal, piece } = slot;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(paint.x * zoom, paint.y * zoom, paint.w * zoom, paint.h * zoom);
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1;
    ctx.strokeRect(paint.x * zoom + 0.5, paint.y * zoom + 0.5, paint.w * zoom - 1, paint.h * zoom - 1);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.12)';
    ctx.fillRect(nominal.x * zoom, nominal.y * zoom, nominal.w * zoom, nominal.h * zoom);
    ctx.strokeStyle = '#22d3ee';
    ctx.strokeRect(nominal.x * zoom + 0.5, nominal.y * zoom + 0.5, nominal.w * zoom - 1, nominal.h * zoom - 1);

    ctx.fillStyle = '#e7e5e4';
    ctx.font = `${Math.max(9, zoom * 2.5)}px monospace`;
    ctx.textBaseline = 'top';
    const label = `${piece.id} ${piece.w}×${piece.h} ${REPEAT_INFO[piece.repeat].symbol}`;
    ctx.fillText(label, paint.x * zoom + 2, paint.y * zoom + 2, paint.w * zoom - 4);
  }

  ctx.fillStyle = '#a8a29e';
  ctx.font = `${Math.max(10, zoom * 3)}px monospace`;
  ctx.fillText(`${kit.name} — nominal sizes in art px; · fixed  ↔ tiles-x  ↕ tiles-y  ⤡ tiles-both`, 4, layout.height * zoom + 4);
}

// ─── Assembled view ─────────────────────────────────────────────────────────
// The "rendered mesh" next to the "texture map": each kit drawn as the thing
// it becomes, with every region color-coded to its template piece and
// alternating shades marking each tile repeat. Geometry uses the CURRENT
// nominal sizes, so resizing a piece reshapes the assembly live.

export interface AssemblyRegion {
  pieceId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rep: number; // repeat index — alternates shading to show the tile period
  /**
   * Paintable overflow reserved AROUND this region in the assembled sample
   * (art px per side) — the per-piece template's magenta paint box, brought
   * into the assembled workflow. Only for pieces that are PHYSICALLY
   * DETACHED from their neighbours (the quest plate): a frame piece's halo
   * would overlap the piece butted against it. The slicer cuts region+halo
   * and records the insets, so overflow art SURVIVES (unlike the per-piece
   * template's halos, which the assembled slicer historically dropped).
   * Set on rep-0 regions only — later repeats aren't cut, so inviting
   * paint around them would be the exact loss this exists to prevent.
   */
  halo?: { l: number; t: number; r: number; b: number };
  /**
   * PLACEMENT PREVIEW ONLY: shown in the sample and the reference underlay
   * (dashed in the guides), but invisible to the slicer — never cut, never
   * repeat-compared, never counted. For hardware whose live position sits ON
   * another piece's paint (plates on the iron, bars under the beams): the
   * sheet is FLAT, so paint inside such a box would land inside whatever cut
   * region is underneath it and ship baked into that piece. Guide-flagged
   * pieces get a real cut slot on clean ground instead (the quest-plate
   * detachment pattern).
   */
  guide?: boolean;
}

export interface Assembly {
  regions: AssemblyRegion[];
  width: number;
  height: number;
}

type KitFamily = 'nine-slice' | 'nine-slice-capped' | 'quest-box' | 'gate' | 'rail' | 'nav-gate' | 'gem' | 'plaque' | 'buttons';

function kitFamily(kit: KitSpec): KitFamily | null {
  const ids = new Set(kit.pieces.map(p => p.id));
  // Quest box before capped (it contains the capped anatomy plus a plate);
  // capped before plain nine-slice (it also has corners).
  if (ids.has('plate-mid')) return 'quest-box';
  if (ids.has('edge-top-cap-l')) return 'nine-slice-capped';
  if (ids.has('corner-tl')) return 'nine-slice';
  if (ids.has('bar-segment')) return 'gate';
  if (ids.has('rail-face')) return 'rail';
  if (ids.has('beam-face')) return 'nav-gate';
  if (ids.has('play-button')) return 'gem';
  if (ids.has('plaque-mid')) return 'plaque';
  if (ids.has('btn-normal-mid')) return 'buttons';
  return null;
}

/** Golden-angle hues so adjacent pieces never share a color. */
function pieceColor(index: number, alpha: number): string {
  return `hsla(${Math.round((index * 137.5) % 360)}, 65%, 55%, ${alpha})`;
}

function assembleNineSlice(kit: KitSpec): Assembly | null {
  const P = (id: string) => kit.pieces.find(p => p.id === id);
  const c = P('corner-tl');
  const et = P('edge-top');
  const eb = P('edge-bottom') ?? et;
  const el = P('edge-left');
  const er = P('edge-right') ?? el;
  const ct = P('center');
  const dv = P('divider');
  if (!c || !et || !eb || !el || !er || !ct) return null;

  const RX = 4; // top-edge repeats in the sample panel
  const RY = 3; // side-edge repeats
  const W = c.w * 2 + RX * et.w;
  const H = c.h * 2 + RY * el.h;
  const regions: AssemblyRegion[] = [];

  // Center fill first so edges/corners/divider draw over it.
  for (let y = c.h, j = 0; y < H - c.h; y += ct.h, j++) {
    for (let x = c.w, i = 0; x < W - c.w; x += ct.w, i++) {
      regions.push({ pieceId: 'center', x, y, w: Math.min(ct.w, W - c.w - x), h: Math.min(ct.h, H - c.h - y), rep: i + j });
    }
  }
  for (let i = 0; i < RX; i++) {
    regions.push({ pieceId: 'edge-top', x: c.w + i * et.w, y: 0, w: et.w, h: et.h, rep: i });
    regions.push({ pieceId: 'edge-bottom', x: c.w + i * eb.w, y: H - eb.h, w: eb.w, h: eb.h, rep: i });
  }
  for (let j = 0; j < RY; j++) {
    regions.push({ pieceId: 'edge-left', x: 0, y: c.h + j * el.h, w: el.w, h: el.h, rep: j });
    regions.push({ pieceId: 'edge-right', x: W - er.w, y: c.h + j * er.h, w: er.w, h: er.h, rep: j });
  }
  regions.push({ pieceId: 'corner-tl', x: 0, y: 0, w: c.w, h: c.h, rep: 0 });
  regions.push({ pieceId: 'corner-tr', x: W - c.w, y: 0, w: c.w, h: c.h, rep: 0 });
  regions.push({ pieceId: 'corner-bl', x: 0, y: H - c.h, w: c.w, h: c.h, rep: 0 });
  regions.push({ pieceId: 'corner-br', x: W - c.w, y: H - c.h, w: c.w, h: c.h, rep: 0 });
  if (dv) {
    const dy = c.h + Math.floor((H - c.h * 2) * 0.45);
    for (let x = c.w, i = 0; x < W - c.w; x += dv.w, i++) {
      regions.push({ pieceId: 'divider', x, y: dy, w: Math.min(dv.w, W - c.w - x), h: dv.h, rep: i });
    }
  }
  return { regions, width: W, height: H };
}

/**
 * The capped sample. Each edge reads cap · mid × N · cap between its corners,
 * so the artist sees exactly what is fixed and what repeats — the caps sit
 * hard against the corners where their notches belong, and only the middle
 * shows a repeat count.
 */
function assembleNineSliceCapped(kit: KitSpec): Assembly | null {
  const P = (id: string) => kit.pieces.find(p => p.id === id);
  const c = P('corner-tl');
  const tcl = P('edge-top-cap-l');
  const tm = P('edge-top-mid');
  const lct = P('edge-left-cap-t');
  const lm = P('edge-left-mid');
  const ct = P('center');
  if (!c || !tcl || !tm || !lct || !lm || !ct) return null;

  // Same repeat counts as the plain kit, so the two samples are directly
  // comparable and the capped one is never the smaller canvas.
  const RX = 4; // repeats of the horizontal middle
  const RY = 3; // repeats of the vertical middle
  const W = c.w * 2 + tcl.w * 2 + RX * tm.w;
  const H = c.h * 2 + lct.h * 2 + RY * lm.h;
  const regions: AssemblyRegion[] = [];

  // Centre fill first — everything else draws over it. The main grid stays
  // ANCHORED AT THE CORNER SQUARE so the rep-0 tile (the slicer's cut
  // source) is never contaminated by corner art drawn over it.
  for (let y = c.h, j = 0; y < H - c.h; y += ct.h, j++) {
    for (let x = c.w, i = 0; x < W - c.w; x += ct.w, i++) {
      regions.push({ pieceId: 'center', x, y, w: Math.min(ct.w, W - c.w - x), h: Math.min(ct.h, H - c.h - y), rep: i + j });
    }
  }

  // THIN-EDGE GUTTER RING (2026-08-01, user bug): when an edge band is
  // thinner than the corner square, the strip between band and the
  // corner-anchored field belongs to NOTHING — the artist painted it and
  // the paint was silently discarded while the game rendered a hollow.
  // The renderers now tile the centre out to the bands; these rep>=1
  // regions make the SAMPLE show that same fill (never cut — rep 0 stays
  // the clean anchored tile). Tiling phase in the ring approximates the
  // renderers' continuous fill; the Live preview is the honest reference.
  const eT = tcl.h;
  const eB = P('edge-bottom-cap-l')?.h ?? tcl.h;
  const eL = lct.w;
  const eR = P('edge-right-cap-t')?.w ?? lct.w;
  const ring = (x1: number, y1: number, x2: number, y2: number) => {
    for (let y = y1, j = 0; y < y2; y += ct.h, j++) {
      for (let x = x1, i = 0; x < x2; x += ct.w, i++) {
        regions.push({ pieceId: 'center', x, y, w: Math.min(ct.w, x2 - x), h: Math.min(ct.h, y2 - y), rep: 1 + i + j });
      }
    }
  };
  if (eT < c.h) ring(c.w, eT, W - c.w, c.h);
  if (eB < c.h) ring(c.w, H - c.h, W - c.w, H - eB);
  if (eL < c.w) ring(eL, c.h, c.w, H - c.h);
  if (eR < c.w) ring(W - c.w, c.h, W - eR, H - c.h);

  // Horizontal runs: cap, middles, cap — top and bottom.
  const hRun = (capL: string, midId: string, capR: string, y: number, h: number) => {
    const cl = P(capL); const m = P(midId); const cr = P(capR);
    if (!cl || !m || !cr) return;
    regions.push({ pieceId: capL, x: c.w, y, w: cl.w, h, rep: 0 });
    for (let i = 0; i < RX; i++) {
      regions.push({ pieceId: midId, x: c.w + cl.w + i * m.w, y, w: m.w, h, rep: i });
    }
    regions.push({ pieceId: capR, x: W - c.w - cr.w, y, w: cr.w, h, rep: 0 });
  };
  hRun('edge-top-cap-l', 'edge-top-mid', 'edge-top-cap-r', 0, tcl.h);
  const bcl = P('edge-bottom-cap-l');
  if (bcl) hRun('edge-bottom-cap-l', 'edge-bottom-mid', 'edge-bottom-cap-r', H - bcl.h, bcl.h);

  // Vertical runs: cap, middles, cap — left and right.
  const vRun = (capT: string, midId: string, capB: string, x: number, w: number) => {
    const ct2 = P(capT); const m = P(midId); const cb = P(capB);
    if (!ct2 || !m || !cb) return;
    regions.push({ pieceId: capT, x, y: c.h, w, h: ct2.h, rep: 0 });
    for (let j = 0; j < RY; j++) {
      regions.push({ pieceId: midId, x, y: c.h + ct2.h + j * m.h, w, h: m.h, rep: j });
    }
    regions.push({ pieceId: capB, x, y: H - c.h - cb.h, w, h: cb.h, rep: 0 });
  };
  vRun('edge-left-cap-t', 'edge-left-mid', 'edge-left-cap-b', 0, lct.w);
  const rct = P('edge-right-cap-t');
  if (rct) vRun('edge-right-cap-t', 'edge-right-mid', 'edge-right-cap-b', W - rct.w, rct.w);

  // Corners last so they cover the ends of both runs.
  regions.push({ pieceId: 'corner-tl', x: 0, y: 0, w: c.w, h: c.h, rep: 0 });
  regions.push({ pieceId: 'corner-tr', x: W - c.w, y: 0, w: c.w, h: c.h, rep: 0 });
  regions.push({ pieceId: 'corner-bl', x: 0, y: H - c.h, w: c.w, h: c.h, rep: 0 });
  regions.push({ pieceId: 'corner-br', x: W - c.w, y: H - c.h, w: c.w, h: c.h, rep: 0 });

  // The section rule, capped the same way, laid across the field.
  const dcl = P('divider-cap-l'); const dm = P('divider-mid'); const dcr = P('divider-cap-r');
  if (dcl && dm && dcr) {
    const dy = c.h + Math.floor((H - c.h * 2) * 0.45);
    regions.push({ pieceId: 'divider-cap-l', x: c.w, y: dy, w: dcl.w, h: dcl.h, rep: 0 });
    for (let i = 0; i < RX; i++) {
      regions.push({ pieceId: 'divider-mid', x: c.w + dcl.w + i * dm.w, y: dy, w: dm.w, h: dm.h, rep: i });
    }
    regions.push({ pieceId: 'divider-cap-r', x: W - c.w - dcr.w, y: dy, w: dcr.w, h: dcr.h, rep: 0 });
  }

  return { regions, width: W, height: H };
}

/**
 * The quest box: the capped nine-slice sample with a PLATE BAND above it.
 * In the game the QUEST plate straddles the box's top border; in the sample
 * the plate gets its own band with a 2px seam so the artist paints it as a
 * separate object and the slicer cuts it cleanly — overlap is a RENDER
 * concern (PanelNineSlice composites the straddle), not a painting one.
 */
function assembleQuestBox(kit: KitSpec): Assembly | null {
  const base = assembleNineSliceCapped(kit);
  if (!base) return null;
  const P = (id: string) => kit.pieces.find(p => p.id === id);
  const pl = P('plate-cap-l');
  const pm = P('plate-mid');
  const pr = P('plate-cap-r');
  if (!pl || !pm || !pr) return base;

  // The plate is DETACHED from the frame, so it gets real overflow room —
  // HALO around the whole object (user call 2026-08-01: "space around the
  // separate QUEST box to be drawn on"). The band reserves it; the halos on
  // the rep-0 regions make the slicer CUT it, so the overflow ships.
  //
  // ORNAMENT AURA (user ask 2026-08-01, their words): "expand the template
  // by 5 pixels on the top of it — anchored on bottom, only expand up —
  // and accept this new space as aura for the ornaments." The sheet's top
  // AURA rows belong to the ornament slots alone (their upward halo is
  // HALO + AURA); everything else keeps its old layout, shifted down.
  const AURA = 5;
  const plateH = Math.max(pl.h, pm.h, pr.h);
  const bandH = AURA + HALO + plateH + HALO + 2;
  const regions = base.regions.map(r => ({ ...r, y: r.y + bandH }));

  const MIDS = 2; // sample shows one seam; only the first period is cut
  const plateW = pl.w + pm.w * MIDS + pr.w;
  let x = Math.round((base.width - plateW) / 2);
  const py = AURA + HALO; // the plate sits below the ornament aura rows
  regions.push({ pieceId: 'plate-cap-l', x, y: py, w: pl.w, h: pl.h, rep: 0, halo: { l: HALO, t: HALO, r: 0, b: HALO } });
  x += pl.w;
  for (let i = 0; i < MIDS; i++) {
    // Strict axis rule: the mid tiles in x, so no x halo — its period stays
    // exact; overflow rides the caps and the top/bottom.
    regions.push(i === 0
      ? { pieceId: 'plate-mid', x, y: py, w: pm.w, h: pm.h, rep: 0, halo: { l: 0, t: HALO, r: 0, b: HALO } }
      : { pieceId: 'plate-mid', x, y: py, w: pm.w, h: pm.h, rep: i });
    x += pm.w;
  }
  regions.push({ pieceId: 'plate-cap-r', x, y: py, w: pr.w, h: pr.h, rep: 0, halo: { l: 0, t: HALO, r: HALO, b: HALO } });

  // Centered edge ornaments (optional medallions) — cut from the plate
  // band's spare flanks so nothing overlaps: left slot = top ornament,
  // right slot = bottom ornament. They RENDER centered on their edges;
  // the labels say so, the band is just where the paint lives. Their
  // upward halo is HALO + AURA: the sheet's new top rows are theirs.
  const ot = P('edge-top-ornament');
  const ob = P('edge-bottom-ornament');
  const ornHalo = { l: HALO, t: HALO + AURA, r: HALO, b: HALO };
  if (ot) {
    const oy = py + Math.round((plateH - ot.h) / 2);
    regions.push({ pieceId: 'edge-top-ornament', x: HALO + 2, y: oy, w: ot.w, h: ot.h, rep: 0, halo: ornHalo });
  }
  if (ob) {
    const oy = py + Math.round((plateH - ob.h) / 2);
    regions.push({ pieceId: 'edge-bottom-ornament', x: base.width - HALO - 2 - ob.w, y: oy, w: ob.w, h: ob.h, rep: 0, halo: ornHalo });
  }

  return { regions, width: base.width, height: base.height + bandH };
}

function assembleGate(kit: KitSpec): Assembly | null {
  const P = (id: string) => kit.pieces.find(p => p.id === id);
  const bs = P('bar-segment');
  const cap = P('bar-top-cap');
  const cs = P('cross-slat');
  const sp = P('gate-spike');
  if (!bs) return null;

  const BARS = 3;
  const REPS = 3;
  const spacing = bs.w * 4;
  const W = spacing * (BARS - 1) + bs.w * 3;
  const capH = cap?.h ?? 0;
  // DETACHED CAP SLOT (the plate law: hardware that lives ON another
  // piece's paint gets a detached cut + guide regions, ALWAYS). The cap's
  // cut used to be the top rows of the first bar column, so a naturally
  // painted full-length shaft leaked its top rows into the cap piece —
  // the user's "top cap has extra pixels", 2026-08-02. The cut now lives
  // on clean ground at the sheet's top-left; the on-bar boxes are dashed
  // placement guides the shaft may paint straight through.
  const slotH = cap ? capH + 2 : 0;
  const H = slotH + capH + REPS * bs.h + (sp?.h ?? 0);
  const regions: AssemblyRegion[] = [];

  if (cap) regions.push({ pieceId: 'bar-top-cap', x: 2, y: 0, w: cap.w, h: cap.h, rep: 0 });

  for (let b = 0; b < BARS; b++) {
    const x = bs.w + b * spacing;
    if (cap) regions.push({ pieceId: 'bar-top-cap', x: x + (bs.w - cap.w) / 2, y: slotH, w: cap.w, h: cap.h, rep: b + 1, guide: true });
    for (let r = 0; r < REPS; r++) {
      regions.push({ pieceId: 'bar-segment', x, y: slotH + capH + r * bs.h, w: bs.w, h: bs.h, rep: r });
    }
    if (sp) regions.push({ pieceId: 'gate-spike', x: x + (bs.w - sp.w) / 2, y: slotH + capH + REPS * bs.h, w: sp.w, h: sp.h, rep: b });
  }
  if (cs) {
    const cy = slotH + capH + bs.h;
    for (let x = 0, i = 0; x < W; x += cs.w, i++) {
      regions.push({ pieceId: 'cross-slat', x, y: cy, w: Math.min(cs.w, W - x), h: cs.h, rep: i });
    }
  }
  return { regions, width: W, height: H };
}

function assembleRail(kit: KitSpec): Assembly | null {
  const P = (id: string) => kit.pieces.find(p => p.id === id);
  const rf = P('rail-face');
  const cl = P('rail-cap-l');
  const cr = P('rail-cap-r');
  const fp = P('forge-plate');
  const rs = P('rail-spike');
  if (!rf) return null;

  const REPS = 6;
  const clW = cl?.w ?? 0;
  const crW = cr?.w ?? 0;
  const W = clW + REPS * rf.w + crW;
  // The plate is CUT from a detached slot above the band (the quest-plate
  // pattern): live it sits ON the painted iron, and one flat sheet cannot
  // ship the same pixels in two pieces — a plate painted in-band would bake
  // into the face/cap cuts (and an unpainted cap would export "painted",
  // carrying only a floating plate, then punch a transparent hole in the
  // live band). Caught by adversarial review, 2026-08-02.
  const slotH = fp ? fp.h + 2 : 0;
  // Caps are VERTICALLY CENTERED on the band (matching the live renderer):
  // a cap taller than the face overhangs the band top and bottom equally,
  // so the face row drops by the overhang and the sheet grows both ways.
  const maxCap = Math.max(cl?.h ?? 0, cr?.h ?? 0, rf.h);
  const capOver = Math.max(0, Math.ceil((maxCap - rf.h) / 2));
  const faceY = slotH + capOver;
  const H = slotH + rf.h + capOver * 2 + (rs?.h ?? 0);
  const regions: AssemblyRegion[] = [];

  if (fp) regions.push({ pieceId: 'forge-plate', x: 2, y: 0, w: fp.w, h: fp.h, rep: 0 });

  for (let i = 0; i < REPS; i++) {
    regions.push({ pieceId: 'rail-face', x: clW + i * rf.w, y: faceY, w: rf.w, h: rf.h, rep: i });
  }
  if (cl) regions.push({ pieceId: 'rail-cap-l', x: 0, y: faceY + Math.round((rf.h - cl.h) / 2), w: cl.w, h: cl.h, rep: 0 });
  if (cr) regions.push({ pieceId: 'rail-cap-r', x: W - cr.w, y: faceY + Math.round((rf.h - cr.h) / 2), w: cr.w, h: cr.h, rep: 0 });

  // Hardware where each gate bar meets the rail: the SIX shared fractions,
  // outer pair flush (the gate kit's bar stock is 6 art wide — plates and
  // spikes center where those bars land). The in-band plates are dashed
  // GUIDES (live placement preview — leave them unpainted; the cut is the
  // detached slot). Spikes sit on clean ground below the band: the four
  // interior ones are real regions (rep 0 = the cut), the outer pair render
  // CLIPPED at the sheet edge exactly as the live pair clips at the screen
  // edge — guides too.
  const anchors = barCenters(W, 6, EDGE_BAR_INSET);
  const last = anchors.length - 1;
  const spikeY = faceY + rf.h + capOver;
  // Plate guides VERTICALLY CENTERED on the band (user call, 2026-08-02 —
  // the old art-y-7 line was the svg's bar-crossing height, 2 art above
  // the 22-art band's centre; the nav kit's guides were already centered).
  if (fp) anchors.forEach((ax, i) => regions.push({ pieceId: 'forge-plate', x: ax - fp.w / 2, y: faceY + Math.round((rf.h - fp.h) / 2), w: fp.w, h: fp.h, rep: i + 1, guide: true }));
  if (rs) {
    // SIDE AURA (user ask, 2026-08-02): the spike's cut carries ±HALO art
    // of horizontal overflow — tips may curl wide of the nominal box. No
    // vertical aura (height stays exact by the user's call), so the rows
    // above and below stay untouched. The cut is the FIRST interior spike
    // (rep 0); its aura clears the neighbours (anchor pitch ~31 art vs a
    // 24-art paint box).
    anchors.forEach((ax, i) => {
      if (i === 0 || i === last) return;
      regions.push({
        pieceId: 'rail-spike', x: ax - rs.w / 2, y: spikeY, w: rs.w, h: rs.h, rep: i - 1,
        ...(i === 1 ? { halo: { l: HALO, t: 0, r: HALO, b: 0 } } : {}),
      });
    });
    [anchors[0], anchors[last]].forEach((ax, k) => {
      const x = Math.max(0, ax - rs.w / 2);
      const wClip = Math.min(ax + rs.w / 2, W) - x;
      regions.push({ pieceId: 'rail-spike', x, y: spikeY, w: wClip, h: rs.h, rep: 4 + k, guide: true });
    });
  }
  return { regions, width: W, height: H };
}

function assembleNavGate(kit: KitSpec): Assembly | null {
  const P = (id: string) => kit.pieces.find(p => p.id === id);
  const beam = P('beam-face');
  const bar = P('beam-bar-segment');
  const plate = P('beam-plate');
  const capL = P('sign-cap-l');
  const mid = P('sign-mid');
  const capR = P('sign-cap-r');
  if (!beam) return null;

  const BEAM_REPS = 6;
  const ROWS = 2; // two stacked menu items read as "the lattice"
  const rowPitch = beam.h + 6;
  const W = BEAM_REPS * beam.w;
  // Detached cut slots above the lattice (the quest-plate pattern): in the
  // sample the bars thread BEHIND the beams — 18 of the bar's 24 rows sit
  // under beam paint, and there is no clean bar span anywhere in the stack
  // (rowPitch 24 = 18 beam + 6 gap) — and the plate sits ON the beam iron.
  // Neither can be cut from the lattice without shipping the wrong paint
  // (caught by adversarial review, 2026-08-02). The lattice shows both as
  // dashed guides instead.
  const bcl = P('beam-cap-l');
  const bcr = P('beam-cap-r');
  const crest = P('avatar-crest');
  const slotPieces = [bar, plate, bcl, bcr].filter(Boolean) as PieceSpec[];
  // The crest cuts with a 4-art halo on every side (it overhangs the
  // profile plate by design), so its slot needs nominal + 8 of height.
  const slotHeights = slotPieces.map(p => p.h).concat(crest ? [crest.h + 8] : []);
  const slotH = slotHeights.length ? Math.max(...slotHeights) + 2 : 0;
  const H = slotH + ROWS * rowPitch;
  const regions: AssemblyRegion[] = [];

  // Detached slot row: bar, plate, then the BEAM END CAPS (fixed finished
  // ends — the tiling face repeated its outer outline internally without
  // them; user catch 2026-08-03). All on clean ground, laid left to right.
  let slotX = 2;
  const slot = (pieceId: string, p: PieceSpec | undefined) => {
    if (!p) return;
    regions.push({ pieceId, x: slotX, y: 0, w: p.w, h: p.h, rep: 0 });
    slotX += p.w + 4;
  };
  slot('beam-bar-segment', bar);
  slot('beam-plate', bar ? plate : undefined);
  slot('beam-cap-l', bcl);
  slot('beam-cap-r', bcr);
  if (crest) {
    // Halo'd like the quest plate: the cut ships nominal + 4 art of paint
    // room per side, so the crest can be painted as a finished object
    // that overhangs the profile plate it attaches to.
    regions.push({ pieceId: 'avatar-crest', x: slotX + 4, y: 4, w: crest.w, h: crest.h, rep: 0, halo: { l: 4, t: 4, r: 4, b: 4 } });
    slotX += crest.w + 8 + 4;
  }

  // Bar centers at the six shared fractions, OUTER PAIR FLUSH at the sheet
  // edges — the same rule the live renderers use (edge bars contain the
  // shape; a plain round(frac·W) put the left bar at x=-1, off the sheet).
  // Plates ride the same centers.
  const centers = bar ? barCenters(W, bar.w, EDGE_BAR_INSET) : [];

  // Bars first — they thread the whole stack BEHIND the beams. Guides:
  // paint bar art here freely for the look of the lattice, but the shipped
  // bar is the detached slot's.
  if (bar) {
    for (const c of centers) {
      const bx = c - Math.round(bar.w / 2);
      for (let y = slotH, r = 1; y < H; y += bar.h, r++) {
        regions.push({ pieceId: 'beam-bar-segment', x: bx, y, w: bar.w, h: Math.min(bar.h, H - y), rep: r, guide: true });
      }
    }
  }

  let plateRep = 1;
  for (let row = 0; row < ROWS; row++) {
    const by = slotH + row * rowPitch;
    for (let i = 0; i < BEAM_REPS; i++) {
      regions.push({ pieceId: 'beam-face', x: i * beam.w, y: by, w: beam.w, h: beam.h, rep: i });
    }
    // Beam end-cap placement guides (dashed, over the row's ends — the
    // left one sits on the face's own rep-0 cut period, so paint belongs
    // in the detached slots only). Vertically centered on the iron, the
    // renderer's rule.
    if (bcl) regions.push({ pieceId: 'beam-cap-l', x: 0, y: by + Math.round((beam.h - bcl.h) / 2), w: bcl.w, h: bcl.h, rep: row + 1, guide: true });
    if (bcr) regions.push({ pieceId: 'beam-cap-r', x: W - bcr.w, y: by + Math.round((beam.h - bcr.h) / 2), w: bcr.w, h: bcr.h, rep: row + 1, guide: true });
    if (plate && bar) {
      // Dashed guides ON the beams — leave unpainted (the leftmost sits
      // inside the beam's own cut period; paint there ships inside the
      // beam and tiles across every menu item).
      for (const c of centers) {
        regions.push({
          pieceId: 'beam-plate',
          x: c - Math.round(plate.w / 2),
          y: by + Math.round((beam.h - plate.h) / 2),
          w: plate.w,
          h: plate.h,
          rep: plateRep++,
          guide: true,
        });
      }
    }
    // Steel plate sign centered on the beam, above the ironwork. Painted
    // for real HERE (opaque plate over iron, exactly the live layering) —
    // it sits on beam REPEATS, never on the beam's rep-0 cut period.
    if (capL && mid && capR) {
      const signW = capL.w + mid.w * 2 + capR.w;
      let sx = Math.round((W - signW) / 2);
      const sy = by + Math.round((beam.h - mid.h) / 2);
      regions.push({ pieceId: 'sign-cap-l', x: sx, y: sy, w: capL.w, h: capL.h, rep: row });
      sx += capL.w;
      for (let i = 0; i < 2; i++) {
        regions.push({ pieceId: 'sign-mid', x: sx, y: sy, w: mid.w, h: mid.h, rep: row * 2 + i });
        sx += mid.w;
      }
      regions.push({ pieceId: 'sign-cap-r', x: sx, y: sy, w: capR.w, h: capR.h, rep: row });
    }
  }
  return { regions, width: W, height: H };
}

function assembleGem(kit: KitSpec): Assembly | null {
  const states = kit.pieces.filter(p => p.repeat === 'fixed');
  if (states.length === 0) return null;
  const gap = 10;
  // Halo-aware slots: the frame ships with 8 art of aura on every side
  // (paint an ornate overhang; the slicer cuts region + halo), the face
  // states cut exact. Slots reserve nominal + halo so auras never
  // collide.
  const haloFor = (id: string) => (id === 'play-frame' ? 8 : 0);
  let x = 0;
  const regions: AssemblyRegion[] = [];
  let maxH = 0;
  for (const s of states) {
    const halo = haloFor(s.id);
    regions.push({
      pieceId: s.id, x: x + halo, y: halo, w: s.w, h: s.h, rep: 0,
      ...(halo ? { halo: { l: halo, t: halo, r: halo, b: halo } } : {}),
    });
    x += s.w + halo * 2 + gap;
    maxH = Math.max(maxH, s.h + halo * 2);
  }
  return { regions, width: x - gap, height: maxH };
}

function assemblePlaque(kit: KitSpec): Assembly | null {
  const cl = kit.pieces.find(p => p.id === 'plaque-cap-l');
  const m = kit.pieces.find(p => p.id === 'plaque-mid');
  const cr = kit.pieces.find(p => p.id === 'plaque-cap-r');
  if (!cl || !m || !cr) return null;
  const P = (id: string) => kit.pieces.find(p => p.id === id);
  const hl = P('header-cap-l');
  const hm = P('header-mid');
  const hr = P('header-cap-r');
  // The HEADER band above the main strip (the quest-box band pattern,
  // minus aura/ornaments): in the game the header straddles the plaque's
  // top edge, but that overlap is a RENDER concern — the sample gives the
  // header its own clean ground with a 2px seam so the cut is
  // uncontaminated. Header row centered over the strip.
  const header = hl && hm && hr;
  const headerH = header ? Math.max(hl.h, hm.h, hr.h) : 0;
  const bandH = header ? headerH + 2 : 0;
  // Cap · mid · mid · cap — the second mid exists so the artist can check
  // the seam; only the first period is the cut (the slicing rule).
  const regions: AssemblyRegion[] = [];
  let x = 0;
  regions.push({ pieceId: cl.id, x, y: bandH, w: cl.w, h: cl.h, rep: 0 });
  x += cl.w;
  for (let i = 0; i < 2; i++) {
    regions.push({ pieceId: m.id, x, y: bandH, w: m.w, h: m.h, rep: i });
    x += m.w;
  }
  regions.push({ pieceId: cr.id, x, y: bandH, w: cr.w, h: cr.h, rep: 0 });
  x += cr.w;
  if (header) {
    const headerW = hl.w + hm.w * 2 + hr.w;
    let hx = Math.round((x - headerW) / 2);
    regions.push({ pieceId: hl.id, x: hx, y: 0, w: hl.w, h: hl.h, rep: 0 });
    hx += hl.w;
    for (let i = 0; i < 2; i++) {
      regions.push({ pieceId: hm.id, x: hx, y: 0, w: hm.w, h: hm.h, rep: i });
      hx += hm.w;
    }
    regions.push({ pieceId: hr.id, x: hx, y: 0, w: hr.w, h: hr.h, rep: 0 });
  }
  return { regions, width: x, height: bandH + Math.max(cl.h, m.h, cr.h) };
}

function assembleButtons(kit: KitSpec): Assembly | null {
  const states = ['normal', 'hover', 'pressed'];
  const regions: AssemblyRegion[] = [];
  let y = 0;
  let W = 0;
  for (const state of states) {
    const cl = kit.pieces.find(p => p.id === `btn-${state}-cap-l`);
    const mid = kit.pieces.find(p => p.id === `btn-${state}-mid`);
    const cr = kit.pieces.find(p => p.id === `btn-${state}-cap-r`);
    if (!cl || !mid || !cr) continue;
    let x = 0;
    regions.push({ pieceId: cl.id, x, y, w: cl.w, h: cl.h, rep: 0 });
    x += cl.w;
    for (let i = 0; i < 3; i++) {
      regions.push({ pieceId: mid.id, x, y, w: mid.w, h: mid.h, rep: i });
      x += mid.w;
    }
    regions.push({ pieceId: cr.id, x, y, w: cr.w, h: cr.h, rep: 0 });
    x += cr.w;
    W = Math.max(W, x);
    y += Math.max(cl.h, mid.h, cr.h) + 6;
  }
  return regions.length ? { regions, width: W, height: y - 6 } : null;
}

export function assembleKit(kit: KitSpec): Assembly | null {
  switch (kitFamily(kit)) {
    case 'nine-slice': return assembleNineSlice(kit);
    case 'nine-slice-capped': return assembleNineSliceCapped(kit);
    case 'quest-box': return assembleQuestBox(kit);
    case 'gate': return assembleGate(kit);
    case 'rail': return assembleRail(kit);
    case 'nav-gate': return assembleNavGate(kit);
    case 'gem': return assembleGem(kit);
    case 'plaque': return assemblePlaque(kit);
    case 'buttons': return assembleButtons(kit);
    default: return null;
  }
}

function renderAssembly(
  ctx: CanvasRenderingContext2D,
  assembly: Assembly,
  kit: KitSpec,
  zoom: number,
  hoveredId: string | null,
  underlay?: Underlay,
): void {
  const colorIndex = new Map(kit.pieces.map((p, i) => [p.id, i]));
  ctx.fillStyle = '#0c0a09';
  ctx.fillRect(0, 0, assembly.width * zoom, assembly.height * zoom);

  if (underlay) drawUnderlay(ctx, assembly, underlay, zoom);

  // Honored paint halos first, under everything: the per-piece template's
  // magenta paint box, in the assembled sample. Anything painted inside is
  // CUT with the piece (unlike the frame regions, where out-of-region paint
  // is discarded).
  for (const r of assembly.regions) {
    if (!r.halo) continue;
    const hx = (r.x - r.halo.l) * zoom;
    const hy = (r.y - r.halo.t) * zoom;
    const hw = (r.w + r.halo.l + r.halo.r) * zoom;
    const hh = (r.h + r.halo.t + r.halo.b) * zoom;
    ctx.fillStyle = 'rgba(255, 0, 255, 0.07)';
    ctx.fillRect(hx, hy, hw, hh);
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(hx + 0.5, hy + 0.5, hw - 1, hh - 1);
  }

  for (const r of assembly.regions) {
    const idx = colorIndex.get(r.pieceId) ?? 0;
    const highlighted = hoveredId === r.pieceId;
    const dimmed = hoveredId !== null && !highlighted;
    // Over a reference the regions become mostly-transparent overlays so the
    // current-game render stays readable; solo they carry the whole picture.
    // Alternating repeat shades make each tile period visible either way.
    const baseAlpha = underlay
      ? (r.rep % 2 === 0 ? 0.16 : 0.08)
      : (r.rep % 2 === 0 ? 0.72 : 0.45);
    const alpha = highlighted ? (underlay ? 0.45 : 0.95) : dimmed ? baseAlpha * 0.25 : baseAlpha;
    // Guide regions read as ghosts: dashed outline, faint fill — they show
    // where the live renderer puts the piece, not where to paint it.
    ctx.fillStyle = pieceColor(idx, r.guide ? alpha * 0.35 : alpha);
    ctx.fillRect(r.x * zoom, r.y * zoom, r.w * zoom, r.h * zoom);
    ctx.strokeStyle = highlighted ? '#ffffff' : underlay ? pieceColor(idx, 0.8) : 'rgba(0,0,0,0.55)';
    ctx.lineWidth = highlighted ? 2 : 1;
    ctx.setLineDash(r.guide ? [3, 3] : []);
    ctx.strokeRect(r.x * zoom + 0.5, r.y * zoom + 0.5, r.w * zoom - 1, r.h * zoom - 1);
    ctx.setLineDash([]);
  }

  // Name the hovered piece next to its first region.
  if (hoveredId) {
    const first = assembly.regions.find(r => r.pieceId === hoveredId);
    if (first) {
      ctx.font = '11px monospace';
      const label = hoveredId;
      const tw = ctx.measureText(label).width;
      const lx = Math.min(first.x * zoom, assembly.width * zoom - tw - 6);
      const ly = Math.max(0, first.y * zoom - 14);
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(lx, ly, tw + 6, 13);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'top';
      ctx.fillText(label, lx + 3, ly + 1);
    }
  }
}

function downloadCanvas(draw: (ctx: CanvasRenderingContext2D) => void, w: number, h: number, filename: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  draw(ctx);
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ──────────────────────────────────────────────────────────────

export const PanelForge: React.FC = () => {
  const [kits, setKits] = useState<KitSpec[]>(loadKits);
  const [selectedId, setSelectedId] = useState<string>(kits[0]?.id ?? 'window-panel');
  const [hoveredPieceId, setHoveredPieceId] = useState<string | null>(null);
  const [refSources, setRefSources] = useState<RefSources>({});
  const [uploadedRefs, setUploadedRefs] = useState<Map<string, HTMLImageElement>>(new Map());
  const [showRef, setShowRef] = useState(true);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const assemblyRef = useRef<HTMLCanvasElement>(null);
  const meshCaptureRef = useRef<HTMLDivElement>(null);

  const kit = kits.find(k => k.id === selectedId) ?? kits[0];
  const layout = useMemo(() => (kit ? layoutKit(kit) : null), [kit]);
  const assembly = useMemo(() => (kit ? assembleKit(kit) : null), [kit]);

  useEffect(() => saveKits(kits), [kits]);

  // Rasterize the live game meshes once on mount — these become the
  // draw-under reference ("the rendered mesh next to the texture map").
  useEffect(() => {
    const root = meshCaptureRef.current;
    if (!root) return;
    let cancelled = false;
    (async () => {
      try {
        const portSvg = root.querySelector<SVGSVGElement>('[data-capture="portcullis"] svg');
        const gemSvg = root.querySelector<SVGSVGElement>('[data-capture="gem"] svg');
        const beamSvg = root.querySelector<SVGSVGElement>('[data-capture="gatebeam"] svg');
        const sources: RefSources = {};
        if (portSvg) sources.portcullis = await rasterizeSvg(portSvg, 2000, 128);
        if (gemSvg) sources.gem = await rasterizeSvg(gemSvg, 400, 140);
        if (beamSvg) sources.gatebeam = await rasterizeSvg(beamSvg, 1600, 208);
        if (!cancelled) setRefSources(sources);
      } catch {
        // Reference is a nicety — the colored assembly still works without it.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Which reference applies to this kit: mesh crops where the game has a
  // real SVG (gate/rail/gem), otherwise a user-uploaded screenshot.
  const kitHasMeshRef = !!kit && kit.pieces.some(p => REF_CROPS[p.id]);
  const underlay: Underlay | undefined = useMemo(() => {
    if (!kit || !showRef) return undefined;
    if (kitHasMeshRef && (refSources.portcullis || refSources.gem || refSources.gatebeam)) {
      return { mode: 'crops', sources: refSources };
    }
    const uploaded = uploadedRefs.get(kit.id);
    return uploaded ? { mode: 'stretch', image: uploaded } : undefined;
  }, [kit, showRef, kitHasMeshRef, refSources, uploadedRefs]);

  // Assembled view — the pieces in their real positions, color-coded.
  useEffect(() => {
    const canvas = assemblyRef.current;
    if (!canvas || !kit || !assembly) return;
    const zoom = Math.min(4, Math.max(2, Math.floor(380 / assembly.width)));
    canvas.width = assembly.width * zoom;
    canvas.height = assembly.height * zoom;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    renderAssembly(ctx, assembly, kit, zoom, hoveredPieceId, underlay);
  }, [kit, assembly, hoveredPieceId, underlay]);

  const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !kit) return;
    const img = new Image();
    img.onload = () => setUploadedRefs(prev => new Map(prev).set(kit.id, img));
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  };

  // On-screen preview = the legend at 3×.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !kit || !layout) return;
    const zoom = 3;
    canvas.width = layout.width * zoom;
    canvas.height = layout.height * zoom + 20;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    renderLegend(ctx, layout, kit, zoom);
  }, [kit, layout]);

  if (!kit || !layout) return null;

  const updateKit = (updated: KitSpec) => {
    setKits(prev => prev.map(k => (k.id === updated.id ? updated : k)));
  };

  const updatePiece = (pieceId: string, field: 'w' | 'h', value: number) => {
    updateKit({
      ...kit,
      pieces: kit.pieces.map(p => (p.id === pieceId ? { ...p, [field]: Math.max(1, Math.round(value)) } : p)),
    });
  };

  const duplicateKit = () => {
    const copy: KitSpec = {
      ...kit,
      id: `${kit.id}-copy-${Date.now().toString(36)}`,
      name: `${kit.name} (variant)`,
      builtIn: false,
      pieces: kit.pieces.map(p => ({ ...p })),
    };
    setKits(prev => [...prev, copy]);
    setSelectedId(copy.id);
    toast.success('Kit duplicated — rename it and size it independently.');
  };

  const deleteKit = () => {
    if (kit.builtIn) return;
    if (!confirm(`Delete kit "${kit.name}"?`)) return;
    setKits(prev => prev.filter(k => k.id !== kit.id));
    setSelectedId(kits[0].id);
  };

  const resetKit = () => {
    const def = DEFAULT_KITS.find(d => d.id === kit.id);
    if (!def) return;
    updateKit({ ...def });
    toast.success('Kit reset to default sizes.');
  };

  const exportTemplate = () => {
    downloadCanvas(ctx => renderTemplate(ctx, layout), layout.width, layout.height, `panel-forge-${kit.id}-template.png`);
  };

  const exportLegend = () => {
    const zoom = 4;
    downloadCanvas(ctx => renderLegend(ctx, layout, kit, zoom), layout.width * zoom, layout.height * zoom + 20, `panel-forge-${kit.id}-legend.png`);
  };

  const exportManifest = () => {
    downloadJson(
      {
        version: 2,
        kitId: kit.id,
        name: kit.name,
        slots: layout.slots.map(s => ({
          id: s.piece.id,
          label: s.piece.label,
          repeat: s.piece.repeat,
          paint: s.paint,
          nominal: s.nominal,
          notes: s.piece.notes,
        })),
        // Slice map for the assembled workflow: paint the whole assembled
        // sample, the Phase 2 slicer extracts each piece from its first
        // region (tiled pieces: first period; later periods verify seams).
        assembled: assembly
          ? { width: assembly.width, height: assembly.height, regions: assembly.regions }
          : null,
      },
      `panel-forge-${kit.id}-manifest.json`,
    );
  };

  // Assembled workflow exports: paint the whole element in place. The
  // template carries the slice guides; the reference carries the current
  // game render — stack reference (bottom), your paint layer (middle),
  // template guides (top, hidden on export).
  const exportAssembledTemplate = () => {
    if (!assembly) return;
    downloadCanvas(ctx => {
      ctx.clearRect(0, 0, assembly.width, assembly.height);
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, assembly.width - 1, assembly.height - 1);
      for (const r of assembly.regions) {
        // Guides dashed + dimmer: placement previews, not paint slots.
        ctx.strokeStyle = r.guide ? 'rgba(0, 255, 255, 0.28)' : 'rgba(0, 255, 255, 0.55)';
        ctx.setLineDash(r.guide ? [2, 2] : []);
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }
      ctx.setLineDash([]);
    }, assembly.width, assembly.height, `panel-forge-${kit.id}-assembled-template.png`);
  };

  const exportReference = () => {
    if (!assembly || !underlay) return;
    downloadCanvas(ctx => {
      drawUnderlay(ctx, assembly, underlay, 1);
    }, assembly.width, assembly.height, `panel-forge-${kit.id}-reference.png`);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Off-screen mount of the LIVE game meshes, rasterized on load into
          the reference underlay. Sized only so the SVGs exist to serialize. */}
      <div
        ref={meshCaptureRef}
        aria-hidden="true"
        style={{ position: 'absolute', left: -10000, top: 0, width: 500, height: 100, visibility: 'hidden' }}
      >
        <div data-capture="portcullis"><PortcullisMesh /></div>
        <div data-capture="gem"><GemMesh tone="emerald" /></div>
        <div data-capture="gatebeam"><GateBeamMesh /></div>
      </div>

      {/* Kit list */}
      <div className="w-64 flex-shrink-0 border-r border-stone-700 p-3 space-y-2 overflow-y-auto">
        <h2 className="text-lg font-bold font-medieval text-copper-400">
          Panel Forge{' '}
          {/* The defaults version doubles as a STALE-TAB detector: an open
              tab keeps its loaded bundle, and a stale slicer cuts from old
              coordinates while sheet + template are current (cost the user
              a baffling wrong-cap round, 2026-08-02). If this number is
              behind the repo's DEFAULTS_VERSION, hard-refresh. */}
          <span className="text-[10px] font-mono font-normal text-stone-500 align-middle" title="Kit defaults version — if a session note says the kits changed and this number hasn't, hard-refresh the tab.">v{DEFAULTS_VERSION}</span>
        </h2>
        <p className="text-xs text-stone-400">
          Piece specs + paint-over templates for the pixel-art UI surfaces. Sizes are art pixels
          (a board tile is 24).
        </p>
        {kits.map(k => (
          <button
            key={k.id}
            onClick={() => setSelectedId(k.id)}
            className={`w-full text-left p-2 rounded text-sm ${
              k.id === kit.id ? 'bg-arcane-700 text-parchment-100' : 'dungeon-panel hover:bg-stone-700'
            }`}
          >
            {k.name}
            {!k.builtIn && <span className="ml-1 text-[10px] text-copper-300">(variant)</span>}
          </button>
        ))}
        <div className="pt-2 space-y-1">
          <button onClick={duplicateKit} className="w-full dungeon-btn text-xs py-1.5">⎘ Duplicate kit</button>
          {kit.builtIn ? (
            <button onClick={resetKit} className="w-full px-2 py-1.5 text-xs bg-stone-700 hover:bg-stone-600 rounded">Reset sizes</button>
          ) : (
            <button onClick={deleteKit} className="w-full px-2 py-1.5 text-xs bg-blood-700 hover:bg-blood-600 rounded">Delete kit</button>
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0 p-4 space-y-4 overflow-y-auto">
        <div>
          {kit.builtIn ? (
            <h3 className="text-xl font-bold font-medieval text-copper-400">{kit.name}</h3>
          ) : (
            <input
              value={kit.name}
              onChange={e => updateKit({ ...kit, name: e.target.value })}
              className="text-xl font-bold font-medieval text-copper-400 bg-transparent border-b border-stone-600 focus:border-copper-400 outline-none"
            />
          )}
          <p className="text-sm text-stone-400 mt-1 max-w-2xl">{kit.description}</p>
        </div>

        {/* Exports */}
        <div className="flex flex-wrap gap-2">
          <button onClick={exportAssembledTemplate} className="dungeon-btn-success text-sm px-4 py-2" disabled={!assembly}>⬇ Assembled template (1×)</button>
          <button onClick={exportReference} className="dungeon-btn text-sm px-4 py-2" disabled={!assembly || !underlay} title={!underlay ? 'No reference available — upload a screenshot or enable Show reference' : undefined}>⬇ Reference PNG (1×)</button>
          <button onClick={exportTemplate} className="dungeon-btn text-sm px-4 py-2">⬇ Per-piece template (1×)</button>
          <button onClick={exportLegend} className="dungeon-btn text-sm px-4 py-2">⬇ Legend PNG (4×)</button>
          <button onClick={exportManifest} className="dungeon-btn text-sm px-4 py-2">⬇ Manifest JSON</button>
        </div>

        {/* PHASE 2 — the return trip. Phase 1 could only send you out to your
            art tool; this brings the painted sheet back, cuts it here, and
            (where the browser allows) re-reads it whenever you save, so the
            loop is paint → ctrl+S → look, with nobody in the middle. */}
        <div className="max-w-2xl">
          <PanelForgeImport kit={kit} assembly={assembly} />
        </div>

        {/* How to paint */}
        <div className="dungeon-panel rounded p-3 text-xs text-stone-300 space-y-1 max-w-2xl">
          <p className="font-bold text-parchment-200">How to paint — assembled workflow (recommended)</p>
          <p>1. Stack three layers in your pixel tool: <strong>Reference PNG</strong> at the bottom (the current game render, your draw-under), your <strong>paint layer</strong> in the middle, and the <strong>Assembled template</strong> guides on top at low opacity.</p>
          <p>2. Paint the whole element in place, over the reference. Export with only your paint layer visible — the slicer cuts it into pieces using the manifest&apos;s slice map.</p>
          <p>3. <span className="text-cyan-300">Cyan lines</span> are the slice boundaries. For tiling pieces, keep each repeat identical — the slicer takes the first period and uses the later ones to verify the seams.</p>
          <p className="font-bold text-parchment-200 pt-1">Per-piece workflow (alternative)</p>
          <p>The per-piece template lays every slot out separately with overflow halos: nominal footprint (cyan tint) plus halo out to the magenta line. Art in the halo anchors like board sprites (center / outer corner / root). Smaller than nominal is always fine — transparent pixels don&apos;t render.</p>
        </div>

        {/* Assembled view — the mesh next to the texture map */}
        {assembly && (
          <div className="dungeon-panel rounded p-3 space-y-2 max-w-2xl">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-bold text-parchment-200">Assembled view</p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-stone-300 cursor-pointer">
                  <input type="checkbox" checked={showRef} onChange={e => setShowRef(e.target.checked)} />
                  Show current-game reference
                </label>
                {!kitHasMeshRef && (
                  <label className="text-xs text-arcane-300 hover:text-arcane-200 cursor-pointer underline">
                    Upload screenshot reference…
                    <input type="file" accept="image/*" onChange={handleRefUpload} className="hidden" />
                  </label>
                )}
              </div>
            </div>
            <p className="text-xs text-stone-400">
              Where each piece lives once built, using your current sizes.
              {kitHasMeshRef
                ? ' The underlay is the LIVE game mesh, so proportions are the real thing — draw against it.'
                : ' This kit has no SVG mesh in the game (it’s DOM-rendered); upload a cropped screenshot of the element to draw against.'}
              {' '}Alternating shades mark one tile repeat; hover a piece (chips below, or table rows) to highlight it.
            </p>
            <canvas
              ref={assemblyRef}
              className="border border-stone-700 rounded max-w-full"
              style={{ imageRendering: 'pixelated' }}
              onMouseLeave={() => setHoveredPieceId(null)}
            />
            <div className="flex flex-wrap gap-1.5">
              {kit.pieces.map((p, i) => (
                <span
                  key={p.id}
                  onMouseEnter={() => setHoveredPieceId(p.id)}
                  onMouseLeave={() => setHoveredPieceId(null)}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono cursor-default ${
                    hoveredPieceId === p.id ? 'bg-stone-600 text-parchment-100' : 'bg-stone-800 text-stone-300'
                  }`}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: pieceColor(i, 1) }} />
                  {p.id}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Spec table */}
        <div className="dungeon-panel rounded p-3 overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="text-stone-400 text-left">
                <th className="pr-4 pb-2">Piece</th>
                <th className="pr-4 pb-2">Nominal W</th>
                <th className="pr-4 pb-2">Nominal H</th>
                <th className="pr-4 pb-2">Behavior</th>
                <th className="pb-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {kit.pieces.map(p => (
                <tr
                  key={p.id}
                  onMouseEnter={() => setHoveredPieceId(p.id)}
                  onMouseLeave={() => setHoveredPieceId(null)}
                  className={`border-t border-stone-700/60 ${hoveredPieceId === p.id ? 'bg-stone-700/40' : ''}`}
                >
                  <td className="pr-4 py-1.5 font-mono text-parchment-200">{p.id}</td>
                  <td className="pr-4 py-1.5">
                    <input
                      type="number"
                      min={1}
                      value={p.w}
                      onChange={e => updatePiece(p.id, 'w', Number(e.target.value))}
                      className="w-16 px-1.5 py-0.5 bg-stone-700 rounded"
                    />
                  </td>
                  <td className="pr-4 py-1.5">
                    <input
                      type="number"
                      min={1}
                      value={p.h}
                      onChange={e => updatePiece(p.id, 'h', Number(e.target.value))}
                      className="w-16 px-1.5 py-0.5 bg-stone-700 rounded"
                    />
                  </td>
                  <td className="pr-4 py-1.5 whitespace-nowrap">{REPEAT_INFO[p.repeat].symbol} {p.repeat}</td>
                  <td className="py-1.5 text-stone-400">{p.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Layout preview */}
        <div>
          <p className="text-xs text-stone-400 mb-2">
            Template layout (legend view). <span className="text-fuchsia-400">Magenta</span> = paint box,{' '}
            <span className="text-cyan-300">cyan</span> = nominal footprint.
          </p>
          <canvas ref={previewRef} className="border border-stone-700 rounded max-w-full" style={{ imageRendering: 'pixelated' }} />
        </div>
      </div>
    </div>
  );
};
