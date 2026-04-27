# Offscreen Sprite Cache — Deferred Plan

**Status:** deferred (not started). Captured 2026-04-26 during a perf cleanup session.

## Why this exists

The `AnimatedGameBoard` per-frame draw path runs a `save → setTransform → shadowBlur → drawImage → restore` stack for every entity, every frame. Pre-rasterizing sprites into offscreen canvases keyed by `(spriteId, scale, frameIndex, …)` would collapse that stack to a single `drawImage` per entity. This is the largest single canvas-perf lever still available — bigger than anything in the Tier-1 perf cleanup that shipped in commit `9c93371`.

## Why it's deferred

The change requires bit-identical visual output across every sprite variant the game produces. Variants include:

- Direction (north/east/south/west — different frames)
- Animation frame index
- Final size from `pixelScale` × per-entity `scale` (can produce fractional pixel sizes)
- Death/dimmed state
- Critical/backstab variant
- Scale (DPR-driven; capped at 2 by `MAX_DPR`)

Validation requires playing through enough scenarios to exercise every variant. The team's manually-tested puzzle library is currently too thin to give confidence that "no visual regressions appear" actually means "no visual regressions exist." Shipping without comprehensive validation risks a wrong-sprite bug that's easy to ship and easy to miss.

The right path forward is to build validation infrastructure FIRST (see "Validation strategy" below), THEN do the cache work against it.

## Sketch of the implementation

Module-level cache (probably as a `useRef<Map>` inside `AnimatedGameBoard`, mirroring the `projectileVisualStateRef` pattern from Phase C-1):

```ts
type CacheKey = string; // serialized (spriteId, direction, frame, scale, state, version)
type CacheEntry = { canvas: OffscreenCanvas | HTMLCanvasElement; lastUsed: number };
const spriteCache = new Map<CacheKey, CacheEntry>();
```

Single source of truth for keys:

```ts
function getSpriteCacheKey(ctx: SpriteDrawContext): CacheKey {
  // Include EVERY visually-significant input. Conservatively over-key.
  return [
    ctx.spriteId,
    ctx.direction,
    ctx.frameIndex,
    ctx.finalWidth,   // already-quantized pixel size
    ctx.finalHeight,
    ctx.state,        // alive/dead/dimmed/etc.
    ctx.crit ? 'crit' : 'normal',
    ctx.spriteVersion ?? '0', // customSprite.updatedAt — auto-busts on edits
  ].join('|');
}
```

Drawing path:

```ts
function drawSpriteCached(ctx, drawContext, destX, destY) {
  const key = getSpriteCacheKey(drawContext);
  let entry = spriteCache.get(key);
  if (!entry) {
    entry = rasterizeSprite(drawContext); // current draw path, but to offscreen
    spriteCache.set(key, entry);
  }
  entry.lastUsed = performance.now();
  ctx.drawImage(entry.canvas, Math.round(destX), Math.round(destY));
  evictLRUIfOverCapacity();
}
```

LRU cap at ~500 entries. At ~9KB per 48×48 RGBA entry, that's ~4.5MB worst-case. Bounded.

## The five risks (and why each is manageable)

### 1. Cache key correctness (highest risk)
A wrong key ships the wrong sprite. Mitigations: single source of truth function for key derivation; conservatively over-key; phased rollout one entity type at a time; built-in dual-render diff harness (see below).

### 2. Memory pressure
Bounded by LRU. Realistic worst case is single-digit MB — rounding error vs. the rest of the tab's footprint. Not a real concern.

### 3. First-frame stutter on cold cache
First time a sprite renders, we rasterize it. 10 entities on level-load = visible stall. Mitigation: pre-warm the cache by walking the puzzle's used sprites on level load before play begins.

### 4. Pixel-perfect fidelity with fractional scales
The current renderer accepts fractional final sizes (e.g., `48 × 0.96 = 46.08px`); the canvas internally nearest-neighbor samples to integer pixels. The cache must use the SAME rounding convention as `drawSpritePixelPerfect` so output is bit-identical. Mitigation: derive cache canvas dimensions from the same math the live code uses, and verify with side-by-side visual diff.

### 5. Stale cache after sprite edits
Editing a custom sprite in the editor would leave stale entries. For the player flow this is a non-issue (single-session cache lifetime). For the editor flow, it's solved by including `customSprite.updatedAt` in the key — the key automatically changes when the sprite is edited, old entries fall out via LRU. Trivial.

## Validation strategy (do this BEFORE the cache)

Build a developer-only **dual-render diff harness** before implementing the cache. The harness:

1. Renders each frame **twice** — once with cache OFF, once with cache ON — to two offscreen canvases.
2. Pixel-compares the two canvases. Discrepancies log `(spriteId, direction, frame, scale, state)` so you can see exactly which variant misbehaves.
3. Activated by a query string flag (e.g. `?cachediff=1`) so it never ships to players.

This converts your normal playtesting into automatic correctness validation — you don't need a comprehensive puzzle library to validate the cache, you just need to play enough sessions for the variants you care about to be exercised.

Estimated cost: ~1 day for the harness, then 2-3 days for the cache implementation against it. Total ~3-4 days of focused work for a high-confidence rollout.

## Phased rollout (after validation infra is in place)

1. **Cache infrastructure** + dual-render diff harness. Verify diff mode runs clean with cache enabled but populated only by the original draw path (i.e., cache itself is a no-op pass-through). Sanity check.
2. **Cache enemies only.** Playtest with diff mode active. No mismatches → ship.
3. **Cache characters.** Same protocol.
4. **Cache projectiles.** Same. Projectiles have the most variants (homing/non-homing/reflected/bouncing × tints × override sprites), so this is the most demanding tier.

If any phase logs a diff, fix the keying before proceeding.

## When to revisit

This is worth picking up when:
- Mobile perf becomes a bottleneck that bothers gameplay (currently it doesn't — Tier 1 + the asset cache got the iPhone experience to "looks good")
- The team has built up a richer playtest library that natural diff-mode coverage gives high confidence
- A separate visual-regression infrastructure investment makes sense as standalone work

Until then, the existing per-entity draw path is fine.

## References

- Tier 1 perf cleanup that shipped: commit `9c93371`
- Asset storage cache: commit `5d8d7cd`
- DPR clamp: commit `8f9a9c5`
- Phase C side-table pattern (precedent for module-level visual state outside React): `projectileVisualStateRef` in `AnimatedGameBoard.tsx`
- Audit that flagged this as the highest-leverage remaining win: see the perf-investigation summary in the session that produced commits `9c93371` and `5d8d7cd`
