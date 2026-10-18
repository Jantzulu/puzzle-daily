import { barCenters, EDGE_BAR_INSET } from '../game/panelSkins';

// The forge's kit specs and assembler, moved out of PanelForge.tsx
// (2026-10-18 delint: a component file that also exports plain values
// breaks React Fast Refresh). Pinned by panelForgeAssembly.test.ts.

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

export type RepeatMode = 'fixed' | 'tile-x' | 'tile-y' | 'tile-xy';

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
  /**
   * Kit-specific stale-sheet recipe, shown by the slicer's size-mismatch
   * HARD STOP in place of its generic "anchor bottom" hint. REQUIRED
   * whenever a version bump grows a sheet anywhere but its very top —
   * the generic hint assumes top-growth and would mis-migrate the
   * artist's paint (v21 lesson: rows inserted mid-sheet, and the size
   * gate can't tell a correctly-migrated sheet from an anchor-bottomed
   * one — it would slice garbage silently).
   */
  migrationHint?: string;
}

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
      'The quest panel under the board (the 2026-08-01 plate-box design, currently placeholder CSS in Game.tsx). Capped nine-slice — finished edge ends, so ornament survives ANY width or height — plus the QUEST title plate as its own 3-slice riding the top border. In the game the plate STRADDLES the border line (about 60% above it), so paint it as a finished object on all four sides; the sample gives it a separate band only so the cut is clean. The divider is the side-quests rule. Periods match the other kits (mid 24, cap = corner 12) so motifs transfer. The four corners carry 8 art of VERTICAL overhang room (above the top pair, below the bottom pair) — tails past the box silhouette paint in the magenta halo rows and ship with the corners.',
    migrationHint: 'v21 grew this sheet in the MIDDLE and at the bottom (corner overhang rows), so the usual anchor-bottom move is WRONG here. Migrate a 144×157 sheet: Canvas Size, height +16, ANCHOR TOP — then select the whole frame block (everything from y=37 down, the first row below the plate band’s seam) and drag it DOWN 8 px. Re-export the template to see the new outlines.',
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
      // v22 (user ask): the plate middle is TWO distinct pieces occupying
      // exactly the sample's two old mid slots — the second slot used to be
      // a discarded seam-check repeat; now it ships. The band renders
      // BOOKMATCHED: left piece tiles from the left cap, right piece tiles
      // right-anchored from the right cap, meeting at a center seam.
      { id: 'plate-mid-l', label: 'Plate Mid L', w: 12, h: 14, repeat: 'tile-x', notes: 'LEFT half of the band behind the QUEST label — its own painting, tiling out from the left cap. Width overflow crops at the CENTER seam, so keep the inner (right) 2–3 art forgiving. The label stays DOM text.' },
      { id: 'plate-mid-r', label: 'Plate Mid R', w: 12, h: 14, repeat: 'tile-x', notes: 'RIGHT half of the band — tiles right-anchored, flush against the right cap; overflow crops at the center seam (keep the inner/left edge forgiving). Paint it identical to Mid L for the old repeating look.' },
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
    id: 'tap-hint',
    name: 'Tap Hint Chip',
    builtIn: true,
    description:
      'The instructional chips — the board\'s "Tap the dungeon to place your hero" prompt and the "Tap a hero / Tap an enemy for more info" rows — ONE 3-slice worn by all three at text-driven widths (fixed caps, tiling middle, DOM label on top). WIRED: drop the export at src/assets/panels/tap-hint-slices.json; the empty placeholder = the current CSS chip. Every piece carries 8 art of halo above/below and the caps 8 on their outer sides (the quest plate\'s scheme) — paint the black outline and any corner flourish in the magenta rows. For the translucent interior, bake reduced-opacity fill INTO the art: PNG alpha ships through the slicer and the page shows through in-game.',
    pieces: [
      { id: 'hint-cap-l', label: 'Hint Cap L', w: 6, h: 12, repeat: 'fixed', notes: 'Finished left end — corner decoration lives here (and in the outer halo). 12 art tall = 24 CSS, a hair over the old CSS chip\'s 23.' },
      { id: 'hint-mid', label: 'Hint Middle', w: 12, h: 12, repeat: 'tile-x', notes: 'Tiles behind the label to any text length — keep it seamless or the motif recurs every period. Reduced-opacity fill here = the see-through interior.' },
      { id: 'hint-cap-r', label: 'Hint Cap R', w: 6, h: 12, repeat: 'fixed' },
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

export function haloFor(repeat: RepeatMode): { x: number; y: number } {
  switch (repeat) {
    case 'fixed': return { x: HALO, y: HALO };
    case 'tile-x': return { x: 0, y: HALO };
    case 'tile-y': return { x: HALO, y: 0 };
    case 'tile-xy': return { x: 0, y: 0 };
  }
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

type KitFamily = 'nine-slice' | 'nine-slice-capped' | 'quest-box' | 'gate' | 'rail' | 'nav-gate' | 'gem' | 'plaque' | 'buttons' | 'tap-hint';

function kitFamily(kit: KitSpec): KitFamily | null {
  const ids = new Set(kit.pieces.map(p => p.id));
  // Quest box before capped (it contains the capped anatomy plus a plate);
  // capped before plain nine-slice (it also has corners). plate-mid is the
  // pre-v22 single-mid id — legacy/custom kits still classify.
  if (ids.has('plate-mid') || ids.has('plate-mid-l')) return 'quest-box';
  if (ids.has('edge-top-cap-l')) return 'nine-slice-capped';
  if (ids.has('corner-tl')) return 'nine-slice';
  if (ids.has('bar-segment')) return 'gate';
  if (ids.has('rail-face')) return 'rail';
  if (ids.has('beam-face')) return 'nav-gate';
  if (ids.has('play-button')) return 'gem';
  if (ids.has('plaque-mid')) return 'plaque';
  if (ids.has('hint-mid')) return 'tap-hint';
  if (ids.has('btn-normal-mid')) return 'buttons';
  return null;
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
  // v22: two distinct mid pieces in the sample's two old slots (the second
  // was a discarded seam-check repeat; now it ships). Legacy kits with a
  // single plate-mid fill both slots exactly as the old MIDS loop did.
  const pmLegacy = P('plate-mid');
  const ml = P('plate-mid-l') ?? pmLegacy;
  const mr = P('plate-mid-r') ?? pmLegacy;
  const pr = P('plate-cap-r');
  if (!pl || !ml || !mr || !pr) return base;

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
  const plateH = Math.max(pl.h, ml.h, mr.h, pr.h);
  const bandH = AURA + HALO + plateH + HALO + 2;

  // CORNER OVERHANG (v21, user ask 2026-08-10): paint room ABOVE the top
  // corners and BELOW the bottom pair, shipped WITH the corner pieces — the
  // scroll's rod ends get tails past the box silhouette. Same halo machinery
  // as the plate; VERTICAL only, so corner widths (and every run/field
  // position keyed to them) are untouched. 8 art = the game renderer's
  // ceiling (QuestBoxFrame BLEED = 8 art × Z). The sheet grows: CORNER_HALO
  // rows inserted between the plate band and the frame top + CORNER_HALO
  // appended at the bottom — each corner's paint room must be physically
  // adjacent to its chunk (the slicer cuts region ± halo contiguously).
  const CORNER_HALO = 8;
  const cornerHalo = (id: string) =>
    id === 'corner-tl' || id === 'corner-tr' ? { l: 0, t: CORNER_HALO, r: 0, b: 0 }
      : id === 'corner-bl' || id === 'corner-br' ? { l: 0, t: 0, r: 0, b: CORNER_HALO }
        : undefined;
  const regions = base.regions.map(r => {
    const halo = cornerHalo(r.pieceId);
    return { ...r, y: r.y + bandH + CORNER_HALO, ...(halo ? { halo } : {}) };
  });

  const plateW = pl.w + ml.w + mr.w + pr.w;
  let x = Math.round((base.width - plateW) / 2);
  const py = AURA + HALO; // the plate sits below the ornament aura rows
  regions.push({ pieceId: 'plate-cap-l', x, y: py, w: pl.w, h: pl.h, rep: 0, halo: { l: HALO, t: HALO, r: 0, b: HALO } });
  x += pl.w;
  // Strict axis rule: the mids tile in x, so no x halo — their period stays
  // exact; overflow rides the caps and the top/bottom. In the legacy
  // single-mid case the second slot is a rep-1 seam preview (never cut),
  // exactly the old MIDS loop.
  regions.push({ pieceId: ml.id, x, y: py, w: ml.w, h: ml.h, rep: 0, halo: { l: 0, t: HALO, r: 0, b: HALO } });
  x += ml.w;
  regions.push(mr.id === ml.id
    ? { pieceId: mr.id, x, y: py, w: mr.w, h: mr.h, rep: 1 }
    : { pieceId: mr.id, x, y: py, w: mr.w, h: mr.h, rep: 0, halo: { l: 0, t: HALO, r: 0, b: HALO } });
  x += mr.w;
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

  return { regions, width: base.width, height: base.height + bandH + CORNER_HALO * 2 };
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

/**
 * The tap-hint chip: cap · mid · mid · cap with the QUEST PLATE's halo
 * scheme — 8 art above/below every cut and on the caps' outer sides, so
 * the artist can outline the whole silhouette in black and flourish the
 * corners. The sheet carries HALO margins all around; the second mid is
 * the seam-check preview (never cut).
 */
function assembleTapHint(kit: KitSpec): Assembly | null {
  const P = (id: string) => kit.pieces.find(p => p.id === id);
  const cl = P('hint-cap-l');
  const m = P('hint-mid');
  const cr = P('hint-cap-r');
  if (!cl || !m || !cr) return null;
  const h = Math.max(cl.h, m.h, cr.h);
  const MIDS = 2;
  const regions: AssemblyRegion[] = [];
  const y = HALO;
  let x = HALO;
  regions.push({ pieceId: 'hint-cap-l', x, y, w: cl.w, h, rep: 0, halo: { l: HALO, t: HALO, r: 0, b: HALO } });
  x += cl.w;
  for (let i = 0; i < MIDS; i++) {
    // Strict axis rule: the mid tiles in x, so no x halo — its period
    // stays exact; overflow rides the caps and the top/bottom.
    regions.push(i === 0
      ? { pieceId: 'hint-mid', x, y, w: m.w, h, rep: 0, halo: { l: 0, t: HALO, r: 0, b: HALO } }
      : { pieceId: 'hint-mid', x, y, w: m.w, h, rep: i });
    x += m.w;
  }
  regions.push({ pieceId: 'hint-cap-r', x, y, w: cr.w, h, rep: 0, halo: { l: 0, t: HALO, r: HALO, b: HALO } });
  x += cr.w;
  return { regions, width: x + HALO, height: HALO + h + HALO };
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
    case 'tap-hint': return assembleTapHint(kit);
    case 'buttons': return assembleButtons(kit);
    default: return null;
  }
}
