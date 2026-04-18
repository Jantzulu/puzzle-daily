# Native-Resolution Rendering — Plan

**Status:** Execution in progress (2026-04-16 session)
**Goal:** Eliminate sprite deformation (static non-uniform pixel sizes, and frame-to-frame "wobble" during sprite-sheet animation) by rendering the game and its thumbnails at a small native pixel resolution, then CSS-scaling the canvas uniformly to display size.
**Scope:** `AnimatedGameBoard.tsx`, `MapEditor.tsx` board rendering, `SpriteThumbnail.tsx`, `PixelEditorAnimationPreview.tsx`, and related helpers in `SpriteEditor.tsx` (`drawSprite`, `drawSpriteSheet`).

**Known-working baseline before Phase 2:** commit `2e9aeb5` ("Docs: mark Phase 1 done in rendering plan; refresh handoff with pending refactors"). If Phase 2 breaks something that can't be fixed forward, revert to this commit.

---

## 1. Problem statement

Today the canvas's internal pixel buffer is sized roughly to display resolution (`cssWidth × devicePixelRatio`). Sprites are drawn at a fit-to-box computed size:

```js
const maxSize = (sprite.size || 0.6) * tileSize * scale;  // e.g. 28.8
let finalWidth  = Math.round(maxSize * aspectRatio);      // e.g. 23
let finalHeight = Math.round(maxSize);                     // e.g. 29
ctx.drawImage(img, ..., dx, dy, finalWidth, finalHeight);
```

This produces two distinct artifacts:

- **Static deformation:** `finalWidth / nativeWidth` is almost never an integer. Some native pixels render as 1 canvas pixel, some as 2. The sprite looks visibly non-uniform even when stationary.
- **Animation wobble:** when the sheet's `imageWidth % frameCount !== 0`, `frameWidth` is fractional, and `Math.round(frameIndex * frameWidth)` drifts. Different frames sample source regions shifted by ±1 column, so looping animation appears to "breathe" or shift.

See the conversation in commit history (session 2026-04-16) for the full diagnostic trace.

## 2. Design

### Core pattern

- **Canvas internal buffer size:** the native pixel resolution (e.g. 16 canvas pixels per tile, 48-pixel-tall sprite sheet canvas).
- **Drawing code:** operates in native coordinates. A sprite draws at its actual source pixel count. No DPR compensation inside drawing code.
- **CSS size:** the display size (e.g. 576 × 384 for the board). An integer multiple of the canvas internal size where possible.
- **`image-rendering: pixelated`:** the CSS rule on the `<canvas>` element handles the final upscale as nearest-neighbor. This already exists in `index.css` for pixel-art elements; we confirm it applies to game/thumbnail canvases.

### What happens to `sprite.size`

`sprite.size = 0.6` is a creator-facing "how much of the tile does this sprite occupy" slider. Under the new design:

- `maxSize = sprite.size * NATIVE_TILE_SIZE` (a small number)
- The sprite draws at this size in the canvas buffer. If it rounds to a fractional result (e.g. 9.6 → 10), that rounding happens once, at canvas level, and is stable across frames of the same sheet — no wobble.
- Final display size comes from CSS scaling the whole canvas uniformly. Every sprite in the board scales by the same factor.

### What about the creator's `scale` feature (per-sprite scale override)

Preserved as-is. Still a multiplier on the target box size. Just operates at native canvas resolution now.

### DPR handling

Removed from drawing code. The browser handles DPR during final CSS rasterization. `image-rendering: pixelated` + integer CSS scale keeps output crisp on high-DPI displays (including mobile).

### Coordinate mapping (clicks, touches)

Currently: clientX/Y → canvas rect → divide by canvas CSS size × canvas buffer size → drawing coords.

New: clientX/Y → canvas rect → divide by canvas CSS size × **native buffer size** → native coords → divide by `NATIVE_TILE_SIZE` → tile coords.

The ratio is the same (`clientX / cssWidth × bufferWidth`), but `bufferWidth` is now the small native number, so the resulting coords are in native pixels. Divide by the native tile size to get tile coords.

## 3. Constants

Proposed native tile size: **16 pixels**. Rationale:

- Small enough that a `sprite.size = 0.6` sprite (9.6 → 10 pixels) still has meaningful pixel count
- Large enough that sub-sprite variation (eyes, swords, jewelry) has space to render
- Gives a clean `TILE_SIZE = 48` → native 16 → 3× CSS scale by default, which is the most common multiple

Introduced as `NATIVE_TILE_SIZE = 16` alongside existing `TILE_SIZE = 48`. `TILE_SIZE` becomes the **CSS display size** of a tile. `NATIVE_TILE_SIZE` is what drawing code uses.

## 4. Phases

Each phase is an independent commit. Any single phase can be reverted without rolling back subsequent phases.

### ✅ Phase 1 — Cards / thumbnails (done 2026-04-17, with revisions)

**Landed approach differs from the original sketch.** The "native-resolution canvas + uniform CSS upscale" approach was tried first but produced *either* undersized sprites (integer-scale snap too restrictive for narrow 52px cards) or no real improvement (fractional CSS scale at the browser step reintroduced half-pixels). After multiple iterations the team settled on a per-sprite integer `pixelScale` multiplier, which works for cards because they don't need the directional-sheet scale/offset fractional tuning that the main board does.

**Final shipped design:**
- `SpriteThumbnail` got a new `pixelScale?: number` prop. When set, sprites render at exactly `frameWidth × pixelScale` × `frameHeight × pixelScale` (integer, pixel-perfect). No fit-to-box, no `sprite.size`, no `spriteScale` math. Bypasses all the old legacy sizing code.
- `SpriteThumbnail` also got a `fillWidth?: boolean` prop. With ResizeObserver, the canvas width tracks its container; the `size` prop becomes canvas *height only*. Lets sprites use the full card width without overflowing into other cards.
- New `cardConstants.ts` holds the shared `CARD_PIXEL_SCALE = 3` and `computeCardSpriteAreaHeight()` helper. The helper picks the tallest native sprite in a row × `CARD_PIXEL_SCALE` so all cards in the row have a uniform sprite-area height (no head clipping even if a character is taller than most).
- `CharacterSelector` and `EnemyDisplay` measure their name-block rendered heights on mount/resize and apply the max as `minHeight` to each card's name block. This aligns the HP row, More Info row, and carets vertically across cards regardless of name length / wrapping.
- `getSpriteNativeHeight()` falls back to `img.naturalHeight` from the image loader's cache when a sheet's config doesn't carry an explicit `frameHeight` (common for sprites imported from Aseprite before the in-game Pixel Editor existed).
- Commits: `2674078` (initial pixelScale prop), `a31cd98` (bump to 3), `b919ef5` (fillWidth + adaptive height + rearranged layout), `75ab2b3` (image-dimension fallback), `921f2b8`/`d0945e9`/`4101e34` (line-height/title-gap polish), `0f0a25e` (name-row alignment).

**`PixelEditorAnimationPreview` was reverted** to its pre-session state — the integer-scale snap that helped thumbnails didn't apply cleanly to a preview with a fixed-size 128×128 canvas and variable-aspect source art.

**Why the original plan didn't work for cards (preserved for Phase 2 context):**
The plan assumed a single `NATIVE_TILE_SIZE` × tile-count canvas whose CSS upscale was a clean integer. Thumbnails have no shared tile grid — each one is a standalone canvas with arbitrary display size (52, 64, 80, 128…). Making canvas-internal match CSS-display at 1:1 eliminated one source of fractional scaling but the sprite-inside-the-canvas math still had fractional destinations. This was still visible as half-pixels. The integer-multiple `pixelScale` approach is the clean fix for that specific geometry.

**Phase 2 is materially different.** The game board has a shared `TILE_SIZE` across all sprites AND needs fractional per-sheet scale/offset for directional-sprite normalization. The original "native-resolution canvas + uniform CSS upscale" plan IS the right approach for the board (Phase 2) because the shared tile grid gives a clean integer CSS-upscale factor, and the fractional scaling that would otherwise cause wobble happens *inside* the canvas where a uniform CSS upscale makes it invisible at display level.

### Phase 2 — Main game board (landed 2026-04-17)

**Chosen parameters:**
- `NATIVE_TILE_SIZE = 24` (Option B — preserves the 3:1 top-to-side border ratio exactly; native side = 8, native top = 24).
- `DEFAULT_CSS_SCALE = 2` so a default 8×8 board renders at the same CSS pixel dimensions as pre-Phase-2 (416×480).
- CSS display size quantized to an integer multiple of the native buffer when under `maxWidth`/`maxHeight` constraints (≥1) and allowed to fall below 1× only when container would otherwise overflow.
- Canvas text (fire/wind, teleport letter, direction arrow, charm heart) shrunk to match native scale now rather than deferred to Phase 4.

**Landed changes in `src/components/game/AnimatedGameBoard.tsx`:**
- Deleted `drawSpritePixelPerfect`, `drawDeathSpritePixelPerfect`, `drawSpawnSpritePixelPerfect` wrappers. 13+ call sites now call the underlying `drawSprite`/`drawDeathSprite`/`drawSpawnSprite` imports from SpriteEditor directly.
- Renamed `TILE_SIZE`/`BORDER_SIZE`/`SIDE_BORDER_SIZE` → `NATIVE_*` throughout (188+94+69 sites). Drawing code now operates in native pixels.
- Canvas buffer is set to the native size; CSS display size is `nativeBuffer × displayScale`. No `ctx.scale(quantizedScale)`, no `devicePixelRatio` arithmetic in drawing code. The browser handles CSS→device-pixel scaling via `image-rendering: pixelated`.
- Click handler rewritten: `clientX → nativeX = (clientX - rect.left) × (canvas.width / rect.width)`; divides by `NATIVE_TILE_SIZE` directly.
- Hardcoded pixel offsets in procedural border rendering (`drawTopWallSegment`, `drawDungeonBorder`, smart-border corners, etc.), health bar dimensions, status effect icons, and projectile/particle sizes all halved to match the 24/48 native/CSS ratio. Further visual tuning deferred to post-commit review.

**Unchanged / intentionally left alone:**
- `SpriteEditor.tsx` `drawSprite`/`drawSpriteSheet` — already took `tileSize` as a parameter, so passing `NATIVE_TILE_SIZE` instead of `TILE_SIZE` is sufficient.
- `MapEditor.tsx` — Phase 3.
- Engine / simulation / scoring — purely visual refactor, no logic changes.

**Original Phase 2 plan (for reference):**
Convert `AnimatedGameBoard.tsx` to native-resolution rendering.

**Files:**
- `src/components/game/AnimatedGameBoard.tsx` (critical file — file-level `eslint-disable`)
- `src/components/editor/SpriteEditor.tsx` (`drawSprite`, `drawSpriteSheet` helpers — called by the board)

**Specific changes:**
- Add `NATIVE_TILE_SIZE` constant (16).
- `canvas.width/height` set to `boardTilesWide × NATIVE_TILE_SIZE` (internal buffer).
- `canvas.style.width/height` set to `boardTilesWide × TILE_SIZE` (CSS display) — or responsive via parent container with integer scale enforcement.
- Remove the `drawSpritePixelPerfect` wrapper's DPR compensation; it's no longer needed (the rounding happens once at canvas level).
- `drawSprite` / `drawSpriteSheet`: operate in native pixel coords. Drop `physTileSize = tileSize × scale` arithmetic.
- Projectile x/y positions: still fractional (smooth motion). Draw coords are native — smaller numbers but same semantics.
- Update click/touch handlers to map clientX/Y → native pixel coords.

**Expected visible outcome:**
- Board sprites stop wobbling.
- Projectiles remain smooth — positions are fractional, but visual effect is consistent across frames.
- Sprite sizing relative to tile looks same as before (if `NATIVE_TILE_SIZE = 16` and `sprite.size = 0.6`, sprite still occupies ~60% of tile).

### Phase 3 — Map editor board
Apply the same pattern to `MapEditor.tsx`'s board rendering (it has its own `TILE_SIZE = 48` constant).

**Files:**
- `src/components/editor/MapEditor.tsx` (critical file)

**Expected visible outcome:** MapEditor board matches game board appearance.

### Phase 4 — Text rendering audit
Native-resolution text (e.g. damage numbers, status labels rendered directly on canvas) will look small/blurry when scaled. Identify and either:
- Move to HTML overlay (floating divs positioned via coordinate mapping), or
- Render at a higher resolution to a separate layer, or
- Accept pixel-art aesthetic for numbers

**Decision deferred until visual pass after Phase 2.** The extent of this work depends on how text actually looks post-conversion.

## 5. Revert strategy

Every phase is a separate commit. To revert:

```bash
git revert <commit-hash>          # undo one phase
git revert <hash1>..<hash2>       # undo a range
git reset --hard <before-phase-1> # nuclear — back out everything
```

If a phase lands and visuals look wrong, the user verifies, reports what's wrong, and we either fix forward or revert that phase. No dependency between phases other than Phase 1 proving out the pattern for Phases 2–3.

## 6. Verification workflow

Per `project_preproduction_state.md`: the Claude Code preview tool doesn't work with this app. Visual verification is done by the user running the game themselves after each commit.

**What the user should check after each phase:**

- **Phase 1:** open any asset editor page (CharacterEditor, EnemyEditor, etc.). Look at thumbnails. No wobble during idle animation. Sprites proportional to each other.
- **Phase 2:** open a playable puzzle. Board sprites look crisp and stable during idle and movement. Projectiles fly smoothly. Click detection works on tiles.
- **Phase 3:** open MapEditor. Tiles render. Hover/click on tiles works. Dropping an enemy places it on the right tile.

If anything looks wrong: report specifically what, and we fix forward or revert that phase.

## 7. What NOT to touch in this refactor

- `resolveProjectiles` and other logic code — this is a **visual-only** refactor. Logical tile coordinates, damage, collision detection, turn resolution: unchanged.
- The `Projectile` type's logical fields — no changes, we're not moving fields around (that's the parked Phase C of the projectile refactor).
- Entity positions in `GameState` — still in tile coords, still fractional for smooth motion.
- Sprite asset data format — no schema changes. Creators' existing sheets work unchanged.

## 8. Open questions / risks

- **Integer CSS scale vs fractional CSS scale.** If the container forces a responsive size that's not an integer multiple of the native buffer (e.g. 500px CSS over 192px native = 2.604× scale), nearest-neighbor scaling by the browser produces non-uniform pixel widths. Solution: enforce integer scale in the layout — parent container uses `width: calc(192px * 3)` style math, or CSS `object-fit: contain` with explicit aspect-ratio math. **Decision deferred to Phase 2 implementation** — see if the existing layout needs adjustment.
- **Mobile viewport zooming and pinch.** May interact with `image-rendering: pixelated`. Test on real device after Phase 2.
- **Printing/copying the canvas.** Some code path may grab canvas data (screenshots, exports). The internal buffer is now smaller; exports will look smaller unless code is updated to use `canvas.style` dimensions.
