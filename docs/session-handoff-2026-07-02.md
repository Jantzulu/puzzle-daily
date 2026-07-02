# Session Handoff — 2026-07-02 (Visual Reskin Marathon)

**State: everything committed and pushed to `main` (through `7b95fe0`). Both Netlify sites deploy from main. Working tree clean. No pending work in flight.**

## What this session was

A full visual identity was designed and shipped for the app, iterated live with
the user reviewing on their phone via Netlify after every push. The crystallized
aesthetic: **early-fantasy-client low-poly 3D** (RuneScape-era with modern
polish), implemented as **deterministic SVG meshes + CSS material** — never a 3D
engine, never HTML-to-texture. Real DOM stays on top of every mesh: crisp,
interactive, accessible.

## The material system (all shipped)

Every element takes its diegetic material, all lit from one top-left light:

| Element | Material | Component |
|---|---|---|
| Compendium | Dark stone slab: faceted border ring, flat plate, chapter-colored breathing aura, content MANIFESTS (blur+glow) — no page turning | `components/compendium/SlabMesh.tsx` |
| Quest HUD | Crimson cloth war banner on an iron rod: drape folds, ragged swallowtail, wind (animated turbulence displacement) + SMIL hem ripple, drop-reveal entrance | `components/game/BannerMesh.tsx` |
| Play / Test Heroes / Test Enemies / Concede | Cut gems: emerald / amethyst / ruby / topaz, pristine straight sides, scroll-driven shine (per-gem phase so they never gleam in unison); testing plates = larger same-stone `gem-plate` | `components/game/GemMesh.tsx` |
| Navbar (MOBILE both apps) | Castle wall: slab-recipe stones (flat face + narrow bevel ring, inward-only insets = no overlap) | `components/shared/WallMesh.tsx` |
| Hamburger menu (both apps) | Rope-strung plank sign: one weathered plank per item, centered capsule-pill labels, utility row on its own plank, short rope stubs + knots (no triangle) | `components/shared/PlankMesh.tsx` |
| Nav labels / utility buttons / Sign In | Frosted capsule pills, Knightly copper `#d4a574` (same language as compendium tab bar) | `.nav-pill`, `.nav-plank-item > span` in `index.css` |

**Desktop/mobile split (user decision):** the wall is MOBILE-ONLY. Desktop on
BOTH apps is the clean flat bar (`md:bg-stone-600`, plain text links, copper
active state, no gold border, no emojis anywhere). Banner finials are CSS
pseudo-element dots on `.quest-banner` (SVG circles stretch under
`preserveAspectRatio="none"`). Board tucks under the banner hem (`-mb-3`,
banner wrapper z-60).

## Also shipped this session (pre-reskin)

- **Blob shadows**: per-sprite manual config (`shadowWidth/OffsetX/OffsetY` +
  per-direction overrides + `deathShadow*` corpse variants with living→corpse
  lerp during the death sheet), Sprite Editor UI with live previews. Toggle:
  `toggleBlobShadows()`. Projectile ground shadows too. `game/blobShadows.ts`.
- **Wall AO** on floor tiles (per-tile local, toggle `toggleWallAO()`) — `game/wallAO.ts`.
- **Noise fog** replacing gradient-circle fog (deterministic, cheaper).
- **Compendium arcane slab** rebuild (see above; search lives OFF the slab in a
  pill under the floating capsule nav; headings chapter-colored + centered).
- **Fuse shine** on quest text: per-glyph gradient sweep via background-clip:text,
  hands fill back to `currentColor` at 100% (theme-safe).
- Fixes: SpriteThumbnail fillWidth observer race; `.maybeSingle()` for daily
  puzzle fetch (console spam); sprite-gate 8s timeout; mobile menu bg matching
  page; board dim on Play REMOVED (rejected: read as lag).

## Rendering lessons (hard-won, don't relearn)

1. `perspective` must be baked into keyframe transforms — ancestor perspective
   only reaches direct children.
2. CSS `filter` on a container **rasterizes its subtree** → text goes hazy on
   mobile. Put filters on the mesh layer, never on containers with text.
3. CSS `drop-shadow` on an svg that has an INTERNAL filter uses the filter's
   rectangular REGION as alpha → ghost rectangle. Use in-chain `feDropShadow`.
4. Any background/gradient on a content container paints a RECTANGLE that
   ghosts against irregular mesh silhouettes — keep content layers
   `background: none`; put grain INSIDE the SVG clipped to the silhouette.
5. Circles in `preserveAspectRatio="none"` SVGs become ellipses — fixed-size
   round things must be CSS pseudo-elements.
6. Random jitter hidden inside color mixers double-noises facet shading — keep
   tone mixers pure; lighting should dominate.
7. Percentage clip-paths/meshes morph when element height changes — fix the
   element height (slab 76vh) or use px-based cuts.
8. JSX comments between `&& (` and the element are a babel syntax error that
   tsc silently misparses (blank app; the FOLDS Sentry alert).
9. iOS force-zooms inputs with font-size < 16px.
10. Browsers keep page zoom PER ORIGIN — "localhost renders different sizes
    than prod" = check Ctrl+0 first (cost a full debugging round).
11. PowerShell here-strings: embedded double quotes break `git commit -m` args.
12. This codebase mixes literal `\uXXXX` escapes and raw emoji in JSX — Edit
    whole blocks fails; edit line-by-line.

## Remaining queue (approved, not started)

1. **Per-hit impact feedback** (projectile hit sound + flash) — needs sound
   assets + user feel-tuning.
2. **Static-layer render bake** (tiles/grid/border to offscreen canvas) — perf
   only; needs careful invalidation (tile cadence states); do WITH user present.
3. **Daily-lock UI unification** (banner vs overlay) — user's UX pick needed.
4. **Playtest tools**: replay scrubber during playtest; solver "solve check".
5. Share card: PARKED until win/score metric decided (not rejected).

## Working practices that made this session work

- Push to GitHub after EVERY commit — user reviews on phone via Netlify
  (~2 min builds). One concern per commit, revert-friendly.
- User's phone screenshots are the review mechanism; they catch real rendering
  bugs (5 root-caused this session). Take their observations literally.
- Design philosophy: hand-tuned editor knobs with good defaults > auto-magic
  (the sprite-shadow bbox lesson). Material realism: pinned things don't flap,
  mounted rods don't move, wind only touches what hangs.
- `npx tsc --noEmit` before every commit; verify in the preview browser
  (dev server on :5173, user login persists).
- Memory file `project_visual_polish_decisions.md` holds the durable decisions;
  this doc is the session-state snapshot.
