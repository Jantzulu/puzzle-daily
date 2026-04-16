# Codebase Audit Summary

**Date:** 2026-04-16
**Scope:** Full codebase review of the puzzle-game project — dead code, architecture, tech debt, determinism, and infrastructure.
**Status:** Living document — update as items ship.

---

## How to read this doc

Every finding below has one of:
- ✅ **Done** — already shipped
- 🎯 **Actionable** — should be worked on; includes priority
- 📝 **Noted** — acknowledged, not on the active list
- ❌ **Non-finding** — an earlier audit claim that turned out to be wrong

The audit verified claims against current code; where the initial sub-agent analysis was stale or incorrect, the ❌ entry explains why.

---

## 1. Determinism (project axiom)

Full-game determinism is a non-negotiable requirement (see [`memory/project_determinism_requirement.md`](../../../../.claude/projects/C--Users-jantz-Desktop-Claude/memory/project_determinism_requirement.md)). Two identical runs must produce identical results; the validator must reflect live game behavior; replays cannot show impossible outcomes.

### ✅ Done — Status effect `applyChance` removed

Fixed in `7590223`. Removed the `Math.random() > applyChance` gate from `actions.ts` and `simulation.ts`, dropped the `applyChance?: number` field from the `appliesStatusEffect` type in [`game.ts`](../src/types/game.ts), and removed the associated editor UI + handler from [`SpellAssetBuilder.tsx`](../src/components/editor/SpellAssetBuilder.tsx). Status effects now always apply on hit.

**Future:** if a chance-based game mode is ever introduced, reintroduce probability via a seeded PRNG (keyed on `puzzleId + turn + effectInstance`) so outcomes remain reproducible across runs and replays — do not reintroduce raw `Math.random()`.

### 🎯 MEDIUM — `Math.random()` in `puzzleGenerator.ts`

Callers (verified): only [`src/components/editor/GeneratorDialog.tsx`](../src/components/editor/GeneratorDialog.tsx). The generator is invoked interactively from the editor and its output is persisted to a puzzle file. No runtime path — solver, live play, replay — calls it.

**Verdict:** not a live determinism bug today. Generator variety is a design-time feature, and the persisted puzzle is then played deterministically.

**But:** if any future feature invokes the generator at runtime (procedural content, daily-puzzle auto-gen, etc.), replace `Math.random()` with a seeded PRNG first. Flag this as a precondition for any such feature.

### 📝 ID generation uses `Date.now()` + `Math.random()`

Affected: projectile IDs ([`actions.ts:1833`](../src/engine/actions.ts)), status effect instance IDs ([`actions.ts:2538`](../src/engine/actions.ts), [`simulation.ts:1125`](../src/engine/simulation.ts)), persistent area effect IDs ([`actions.ts:2290`](../src/engine/actions.ts)), initial enemy status effect IDs ([`simulation.ts:1943`](../src/engine/simulation.ts)).

These IDs are **not read by game logic** — they're for tracking/reference only. Two runs of the same puzzle will generate different IDs, but no turn outcome depends on any ID value. GameState comparison in replays would diverge at these fields, but logical outcomes match.

**Action:** leave alone unless replay verification starts comparing full state objects. If that happens, switch to deterministic counter-based IDs (`${entityId}_${turn}_${localIndex}`).

### ✅ Projectile visual timing uses `Date.now()` — already designed to be safe

21 `Date.now()` calls in [`simulation.ts`](../src/engine/simulation.ts) — all inside `updateProjectiles()` (the per-frame visual loop) or visual interpolation helpers. `resolveProjectiles()` (the logical turn-boundary function) does not use wall-clock time.

**Caveat:** the visual loop currently writes `proj.x/y/currentTileIndex` onto `GameState` objects, which are deep-copied each turn. This means wall-clock timing can still leak into the GameState snapshot. See [projectile-refactor-plan.md](projectile-refactor-plan.md) Phase C for the fix.

---

## 2. Dead Code & Cleanup

### ✅ Done — CloudSyncPanel removed

184-line unused component deleted. Superseded by `CloudSyncButton`. Committed in `1931c41`.

### ✅ Done — ~13 unused CSS classes removed

`dungeon-btn-arcane`, `dungeon-card*`, `dungeon-nav-link*`, `dungeon-badge-{copper,blood,arcane,moss}`, `dungeon-header*`, `animate-info-slide-up/down`, `border-embossed`, `gradient-vignette`, `no-select`, `.text-copper-500`. Removed in `1931c41`.

### 📝 Deprecated-but-still-read type fields (keep)

These are referenced by backward-compat code paths for saved puzzle/asset data. Removing them requires a data migration:

- `TileBehaviorConfig.teleportSprite`, `PlacedEnemy.teleportSprite`, `PlacedCharacter.teleportSprite` ([`types/game.ts`](../src/types/game.ts)) — superseded by `activationSprite`, but read with fallback in [`EnemyDisplay.tsx:96`](../src/components/game/EnemyDisplay.tsx) and [`compendium/EntryDetails.tsx:129`](../src/components/compendium/EntryDetails.tsx).
- `Enemy.tooltipSteps` — superseded by `actionSteps`.
- `ExecutionMode.parallel_with_previous` — migration path only.
- `ActionType.ATTACK_FORWARD | ATTACK_RANGE | ATTACK_AOE | CUSTOM_ATTACK` — old puzzle data uses these.

**Action:** leave in place. Revisit only if a data migration pass is scheduled.

---

## 3. Architecture & Tech Debt

### 🎯 HIGH — Projectile system refactor

Tracked in [projectile-refactor-plan.md](projectile-refactor-plan.md) as a phased plan. Summary:

- Phase A: introduce `ProjectileVisualState` type (additive, zero behavior change) — LOW RISK
- Phase B: extract movement-mode branches out of `updateProjectiles` — LOW RISK
- Phase C: move visual fields off `GameState` so deep-copy can't capture them — MEDIUM RISK
- Phase D: unify 6 overlapping deferred-state flags into one struct — MEDIUM RISK
- Phase E: de-duplicate `updateProjectilesHeadless` vs `resolveProjectiles` — HIGH VALUE (prevents solver/game drift, the exact determinism risk), needs golden-test corpus first

### ✅ Done — Sync race condition in `syncTracker.ts`

`markPushCompleted()` now takes a required `pushStartTime` parameter and only clears `localChanges[id]` when the local-change timestamp is ≤ `pushStartTime`. `pushAllToCloud` captures the start time immediately after acquiring the sync lock, before gathering any ids. Edits made during an in-flight push keep their dirty flag, so the next push picks them up and the next pull can't overwrite them.

Regression test in [`src/utils/__tests__/syncTracker.test.ts`](../src/utils/__tests__/syncTracker.test.ts) (`"markPushCompleted preserves dirty flag for assets edited during the push"`) locks the behavior in place using fake timers.

### 🎯 MEDIUM — MapEditor / PixelEditor / AnimatedGameBoard monoliths

- [`MapEditor.tsx`](../src/components/editor/MapEditor.tsx): 5,596 lines, 63 `useState` hooks
- [`PixelEditor.tsx`](../src/components/editor/PixelEditor.tsx): 3,619 lines, 51 `useState` hooks
- [`AnimatedGameBoard.tsx`](../src/components/game/AnimatedGameBoard.tsx): 4,487 lines, 14 `useState` hooks

These are the files that consume hours whenever touched. They also all carry file-level `/* eslint-disable */` per [`memory/project_lint_cleanup.md`](../../../../.claude/projects/C--Users-jantz-Desktop-Claude/memory/project_lint_cleanup.md) — they're the known-fragile files.

**Approach:** incremental sub-component extraction. Do not attempt a big-bang refactor; memory notes a prior lint cleanup had to be fully reverted because it broke the game. Pick one layer at a time, verify game still plays correctly between each extraction.

### 🎯 MEDIUM — Undo/redo is imported but not wired for puzzle edits

[`src/utils/historyManager.ts`](../src/utils/historyManager.ts) exists and `MapEditor` imports `createHistoryManager`, but puzzle-edit operations don't flow through it. Only the pixel editor animation timeline uses history.

**Action:** either finish the integration (puzzle edits dispatch through history manager, undo/redo keybinding wired up) or remove the unused import and rename the module to `pixelEditorHistory` so its scope is clear.

### 📝 Component and service tests — partial coverage

- Engine: 192 tests across 5 files (solid coverage).
- Services: 6 tests on `syncTracker` added in this audit. `cloudSync.ts` (865 LOC) still has no direct tests.
- Components: no tests.

**Recommendation:** prioritize `cloudSync.ts` orchestration tests (push happy path, pull with conflict, race condition) when the tracker race is fixed. Component tests are lower priority given the monolith refactor is the bigger issue.

### 📝 Type safety — 244 type escapes

`any`, `as unknown as`, `@ts-ignore` spread across the codebase. Not alarming for the size. The one worth fixing: [`normalizeActionType` in `actions.ts:100-120`](../src/engine/actions.ts) — its return type lies about what it returns.

**Action:** opportunistic cleanup when touching affected files. No dedicated effort needed.

### 📝 Route-based code splitting — already in place

Verified [`App.tsx`](../src/App.tsx), [`PlayerApp.tsx`](../src/PlayerApp.tsx), [`EditorsPage.tsx`](../src/components/editor/EditorsPage.tsx), and [`PuzzleResourcesPage.tsx`](../src/components/editor/PuzzleResourcesPage.tsx) all use `React.lazy()`. Vendor chunks (`vendor-react`, `vendor-supabase`) configured in both Vite configs.

**No action needed.** The earlier audit flagged this as missing — that was wrong.

---

## 4. Infrastructure

### ✅ Done — Netlify configuration reproducible

Both dev and player sites now have correct build settings configured in their Netlify dashboards:
- Dev: `npm ci && npm run build` → `dist`
- Player: `npm ci && npm run build:player` → `dist-player`

Root `netlify.toml` removed in `bb432e4` to prevent unintentional overrides.

### 📝 Supabase on free tier — upgrade timing clear

Current: ~50 MB DB, ~100 MB storage, small egress — all well under free tier limits.

**Inflection points** (from audit):
- ~50 DAU → egress exceeds 2 GB/mo → Supabase Pro ($25/mo)
- ~400 DAU → Netlify bandwidth exceeds 100 GB/mo → Netlify Pro (~$40/mo)
- ~5K DAU → DB approaches 1 GB → Supabase Team ($75/mo)

**No action until launch.** Current stack (Netlify + Supabase) is correct for the team size and scope; alternatives (Cloudflare, Vercel+Neon, self-hosted) would be worse fits.

### ❌ RLS policies are NOT wide-open — earlier finding corrected

Original audit sub-agent claimed all Supabase RLS policies used `USING (true)`. That was based on reading `schema.sql` in isolation. Migration `005_security_hardening.sql` replaced all permissive policies with auth-gated ones. Current migrations: 001 through 009.

**No action needed.**

### ❌ ErrorBoundary IS wired — earlier finding corrected

Wrapping confirmed in both [`App.tsx:560`](../src/App.tsx) (with inner boundary at 564) and [`PlayerApp.tsx:409`](../src/PlayerApp.tsx) (with `autoReloadOnChunkError` variant at 413). Sentry configured at [`src/lib/sentry.ts:6`](../src/lib/sentry.ts).

**No action needed.**

---

## 5. Forward-Looking Priorities

Ordered by impact × risk × effort. Items shift between tiers as context changes.

### Tier 1 — Determinism & correctness (✅ complete)

1. ✅ **Remove `applyChance` randomness** — done; live-game is now fully deterministic with respect to status effect application.
2. ✅ **Fix sync push/edit race** — done; `markPushCompleted` now uses a push-start cutoff to preserve flags for concurrent edits.

### Tier 2 — Foundation for future work

3. **Projectile Phase A + B** (Section 3, projectile plan) — safe additive + pure refactor phases, unblocks Phase C/D/E.
4. **Projectile Phase E** (solver/game de-duplication) — prevents future determinism drift between validator and live game. Build golden-test corpus first.

### Tier 3 — Quality of life

5. **Finish or remove history manager integration** (Section 3, MEDIUM).
6. **Incremental MapEditor extraction** — start with one clear sub-component (property panel, layer control, etc.).
7. **`cloudSync.ts` orchestration tests** — once the race is fixed.

### Tier 4 — Feature roadmap items (see `feature-roadmap.md`)

Once the above lands, the incomplete roadmap items are the natural next thing:
- Hint System (currently deferred pending scoring stability)
- Compendium Enhancements (animated previews, spell demos)
- Achievement & Milestone System
- Payment Integration
- PWA Support

---

## 6. What the audit explicitly did NOT find

To save future audits the cycles:

- **No use of `pixi.js`.** The original audit sub-agent hallucinated this. Canvas rendering is implemented directly in `AnimatedGameBoard`.
- **No prompt injection / malware risk.** Codebase is clean.
- **No credentials in source.** `.env.example` used; real `.env` not in repo. Hardcoded Supabase fallback was removed in `3c1fe1c`.
- **No major dependency out-of-date.** React 19, Vite 7, Vitest 4, Supabase 2.90.1, TypeScript 5.9 — all current.
- **No blocking security issue.** RLS is tightened; rate limits are in place; sanitization is in place.

---

## 7. How to update this doc

When a Tier-1 or Tier-2 item ships:
1. Move its entry from 🎯 to ✅ with a commit reference.
2. Promote the next item up a tier if appropriate.
3. If the change invalidates another finding, annotate it.

When a new concern is discovered:
1. Add it to the relevant section with its own 🎯/📝 tag.
2. If it's a determinism concern, always add to Section 1 regardless of severity.
