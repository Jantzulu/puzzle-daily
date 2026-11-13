// ============================================================================
// REPLAY PROJECTILES — rebuilding a run's bolts from its recorded timeline
// ============================================================================
// Replay doesn't re-simulate. Each turn's GameState snapshot is shown as-is,
// except its projectiles: those are rebuilt here from the engine's
// ProjectileEvent timeline so they animate through the turn the way the live
// run did. Moved VERBATIM out of Game.tsx (2026-11): everything here is a
// plain function of (timeline, snapshot, turn index, now), with no React.
//
// Rule (user, 2026-10-18): replay shows EXACTLY what happened. Where the
// engine recorded what a bolt did (homing_move tilePath, targetX/Y), play
// that back; re-deriving it here is only ever a fallback.

import { findPathBFS, getTilesAlongLine, isHomingDebug, isPierceDebug, maybeMarkLingerDespawn } from '../../engine/simulation';
import { AttackPattern, Direction } from '../../types/game';
import type { CustomAttack, GameState, PlacedCharacter, Projectile, ProjectileEvent } from '../../types/game';

/** One bolt's recorded life: spawn, per-turn homing moves, hits, and its end. */
export interface ProjectileLifetime {
  spawn: ProjectileEvent;
  reflect?: ProjectileEvent;
  end?: ProjectileEvent;
  pierceHits: ProjectileEvent[];
  homingMoves: ProjectileEvent[];
  spawnTurn: number;
  endTurn: number;
}

export type ProjectileLifetimes = Map<string, ProjectileLifetime>;

// Build per-turn active projectile lifetimes from timeline.
// pierceHits collects `hit` events that get shadowed by a later end
// event for the same projId — those are the pass-through hits of a
// pierce bolt (the bolt didn't stop there). The current `life.end` is
// always the bolt's true final landing (last end event).
export const buildProjectileLifetimes = (timeline: ProjectileEvent[]): ProjectileLifetimes => {
  const lifetimes: ProjectileLifetimes = new Map();
  for (const event of timeline) {
    if (event.type === 'spawn') {
      lifetimes.set(event.projId, { spawn: event, pierceHits: [], homingMoves: [], spawnTurn: event.turn, endTurn: 9999 });
    } else if (event.type === 'reflect') {
      const life = lifetimes.get(event.projId);
      if (life) life.reflect = event;
    } else if (event.type === 'hit' || event.type === 'wall_hit' || event.type === 'deactivate') {
      const life = lifetimes.get(event.projId);
      if (life) {
        // If a previous `hit` is being displaced, it was a pierce-through.
        // (wall_hit / deactivate displacing a hit also pushes it — pierce
        // bolts can pass through enemies and end at a wall or range cap.)
        if (life.end && life.end.type === 'hit') {
          life.pierceHits.push(life.end);
          if (isPierceDebug()) {
            console.log(
              `[PIERCE-DISPLACE ${event.projId.slice(-6)}] turn=${event.turn} ` +
              `displaced=hit@(${life.end.x},${life.end.y}) hitTileIdx=${life.end.hitTileIndex} ` +
              `target=${life.end.targetEntityId?.slice(-6)} damage=${life.end.damage} ` +
              `→pierceHits.length=${life.pierceHits.length}; new end=${event.type}@(${event.x},${event.y})`
            );
          }
        }
        life.end = event;
        life.endTurn = event.turn;
      }
    } else if (event.type === 'homing_move') {
      const life = lifetimes.get(event.projId);
      if (life) life.homingMoves.push(event);
    }
  }
  return lifetimes;
};

// Compute tiles along a line (Bresenham-style) for replay path generation
const computeReplayPath = (x0: number, y0: number, x1: number, y1: number): Array<{x: number, y: number}> => {
  const tiles: Array<{x: number, y: number}> = [];
  const sx = Math.floor(x0), sy = Math.floor(y0);
  const ex = Math.floor(x1), ey = Math.floor(y1);
  tiles.push({ x: sx, y: sy });
  if (sx === ex && sy === ey) return tiles;
  const dx = ex - sx, dy = ey - sy;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    tiles.push({ x: sx + Math.round(dx * t), y: sy + Math.round(dy * t) });
  }
  return tiles;
};

// Build replay projectiles from the timeline for a given turn index.
// `snapshot` is the replayed run's own state for that turn — the map the
// pathfinding BFS routes against. Never a component's render-scope
// gameState: replay handlers are stable callbacks, so theirs is a
// first-render closure (on a first-of-day daily, a different puzzle).
export const buildReplayProjectiles = (
  turnIndex: number,
  snapshot: GameState,
  lifetimes: ProjectileLifetimes,
  now: number,
): Projectile[] => {
  if (lifetimes.size === 0) return [];

  const replayProjectiles: Projectile[] = [];

  for (const [, life] of lifetimes) {
    // A projectile is alive from its spawn turn through its end turn
    if (turnIndex < life.spawnTurn || turnIndex > life.endTurn) continue;

    const spawn = life.spawn;
    const speed = spawn.speed || 4;
    const isHomingBolt = !!spawn.isHoming;

    let tilePath: Array<{ x: number; y: number }> | undefined;
    let turnTileIndex: number;
    let turnStartTileIndex: number;
    let posAtTurn: { x: number; y: number };
    // Hoisted out of the homing branch so the post-branch projectile
    // construction can reference them (for straight-line visual anchors).
    // Non-homing path leaves these at the spawn position.
    let prevPos: { x: number; y: number } = { x: spawn.x, y: spawn.y };
    let thisPos: { x: number; y: number } = { x: spawn.x, y: spawn.y };

    if (isHomingBolt) {
      // Homing replay: build a per-turn segment tilePath using the recorded
      // homing_move events (one per turn). Live gameplay rebuilds tilePath
      // each turn; replay mirrors that so speed, pathfinding-vs-grid-vs-
      // straight, and per-turn step animation all match the real flight.
      const turnsSinceSpawn = turnIndex - life.spawnTurn; // 0 = spawn turn

      // Position at end of (turnIndex - 1): previous turn's homing_move, or
      // spawn pos if this IS the spawn turn.
      prevPos = turnsSinceSpawn === 0
        ? { x: spawn.x, y: spawn.y }
        : (life.homingMoves[turnsSinceSpawn - 1]
            ? { x: life.homingMoves[turnsSinceSpawn - 1].x, y: life.homingMoves[turnsSinceSpawn - 1].y }
            : { x: spawn.x, y: spawn.y });

      // Position at end of turnIndex: on endTurn use end event's position
      // (so tilePath ends exactly at hit/deactivate location); otherwise use
      // this turn's homing_move.
      thisPos = turnIndex === life.endTurn && life.end
        ? { x: life.end.x, y: life.end.y }
        : (life.homingMoves[turnsSinceSpawn]
            ? { x: life.homingMoves[turnsSinceSpawn].x, y: life.homingMoves[turnsSinceSpawn].y }
            : prevPos);

      // Build segment tilePath using the style the engine used.
      const style = spawn.homingPathStyle || 'straight';
      // If prev ≈ this, the bolt didn't move this turn (e.g. OUT OF RANGE
      // froze it). Use a single-tile path at the frozen position — avoids
      // `getTilesAlongLine`'s floor/round asymmetry (start=floor, end=round)
      // producing a 2-tile path spanning different integer tiles for the
      // SAME fractional position, which would teleport the bolt to one of
      // those tiles (often the enemy's cell → spurious "hit" in replay).
      const noMove = Math.abs(prevPos.x - thisPos.x) < 0.01 && Math.abs(prevPos.y - thisPos.y) < 0.01;
      if (noMove) {
        tilePath = [{ x: Math.round(thisPos.x), y: Math.round(thisPos.y) }];
      } else if (style === 'pathfinding') {
        // Play back the tiles the engine actually flew this turn (recorded
        // on mid-flight homing_moves). Re-running the BFS from prev to this
        // can pick a different, equally short route than the live search
        // toward the target did, so it's only the fallback (reach turns,
        // where it IS the live search, and any move whose endpoints don't
        // line up with this turn's).
        const flown = life.homingMoves[turnsSinceSpawn]?.tilePath;
        const first = flown?.[0];
        const last = flown?.[flown.length - 1];
        const flownFits = !!first && !!last
          && first.x === Math.round(prevPos.x) && first.y === Math.round(prevPos.y)
          && last.x === Math.round(thisPos.x) && last.y === Math.round(thisPos.y);
        tilePath = flownFits
          ? flown!.map(t => ({ x: t.x, y: t.y }))
          : findPathBFS(Math.round(prevPos.x), Math.round(prevPos.y),
                        Math.round(thisPos.x), Math.round(thisPos.y), snapshot);
      } else {
        // 'grid' and 'straight' both use tile-along-line for replay; the
        // difference in live gameplay is in visual interpolation, not path.
        // Round inputs to match resolveProjectiles, which rebuilds tilePath
        // each turn from Math.round(logical) (simulation.ts:3451, 3560).
        // Passing fractional coords would use getTilesAlongLine's
        // floor(start)/round(end) asymmetry → extra leading tile vs. real
        // play (e.g. real (5,6)→(5,7) becomes replay (4,5)→(5,6)→(5,7))
        // which also skews tileTransit pacing via 0.8/(len-1).
        tilePath = getTilesAlongLine(
          Math.round(prevPos.x), Math.round(prevPos.y),
          Math.round(thisPos.x), Math.round(thisPos.y)
        );
      }
      if (!tilePath || tilePath.length === 0) {
        tilePath = [{ x: Math.round(prevPos.x), y: Math.round(prevPos.y) }];
      }

      turnStartTileIndex = 0;
      turnTileIndex = tilePath.length - 1;
      posAtTurn = tilePath[turnTileIndex];

      // REPLAY-DIFF log — mirrors the [RDIFF REAL] one-liners from
      // simulation.ts so real vs replay can be diffed directly. If a bolt's
      // reconstructed segment diverges from what the engine emitted, the
      // pos/tilePath/style values here won't match the REAL event stream.
      // Gated on the same HOMING_DEBUG flag as the RDIFF REAL emitter.
      if (isHomingDebug()) {
        const pathStr = tilePath.map(t => `(${t.x},${t.y})`).join('→');
        console.log(
          `[RDIFF REPLAY] turn=${turnIndex} proj=${spawn.projId.slice(-6)} ` +
          `style=${spawn.homingPathStyle} speed=${speed} ` +
          `prev=(${prevPos.x.toFixed(2)},${prevPos.y.toFixed(2)}) ` +
          `this=(${thisPos.x.toFixed(2)},${thisPos.y.toFixed(2)}) ` +
          `tilePath=${pathStr} logical=(${posAtTurn.x},${posAtTurn.y})`
        );
      }
    } else {
      // Non-homing: existing stitched-path behavior (full flight in spawn's tilePath).
      tilePath = spawn.tilePath ? [...spawn.tilePath] : undefined;
      if (!tilePath || tilePath.length === 0) {
        const endEvent = life.end;
        if (endEvent) {
          tilePath = computeReplayPath(spawn.x, spawn.y, endEvent.x, endEvent.y);
        }
      }

      const turnsOfTravel = turnIndex - life.spawnTurn + 1;
      const tilesAtEndOfTurn = turnsOfTravel * speed;
      const tilesAtStartOfTurn = (turnsOfTravel - 1) * speed;
      const maxTileIdx = tilePath ? tilePath.length - 1 : 0;
      turnTileIndex = Math.min(tilesAtEndOfTurn, maxTileIdx);
      turnStartTileIndex = Math.min(tilesAtStartOfTurn, maxTileIdx);

      if (life.end && turnIndex === life.endTurn) {
        if (life.end.type === 'hit' && life.end.hitTileIndex !== undefined) {
          turnTileIndex = Math.min(life.end.hitTileIndex, maxTileIdx);
        } else {
          turnTileIndex = maxTileIdx;
        }
      }

      posAtTurn = tilePath?.[turnTileIndex] ?? { x: spawn.x, y: spawn.y };
    }

    // For straight-line homing, live gameplay interpolates the bolt in
    // fractional (Euclidean) space between prevPos and thisPos via
    // `homingVisualStartX/Y` + `updateStraightLineHomingVisual`. The
    // tilePath reconstructed above is only accurate at tile granularity —
    // a move like (2.55, 1.11) → (1.74, 0.53) collapses to a single-tile
    // path at (2, 1) and the replay bolt sits frozen on that tile for the
    // whole turn instead of flowing diagonally.
    //
    // Setting the straight-line visual anchors on the replay projectile
    // switches updateProjectiles to the same Euclidean path the live game
    // uses, so replay motion matches what the player saw. tilePath still
    // drives hit-consume timing via currentTileIndex >= hitTileIndex.
    const isStraightHoming = isHomingBolt && (spawn.homingPathStyle === 'straight' || !spawn.homingPathStyle);

    // Pick this turn's engine-recorded target (from homing_move / hit /
    // deactivate). Using the recorded target preserves the fractional
    // aim point the live game interpolated toward — e.g., turn 1 live has
    // target=(5,5) (the enemy, 2 tiles away) while totalTime=1.6s; if we
    // used tilePath endpoint (4,5) with totalTime=0.8s the bolt reaches
    // its "target" mid-flight and re-anchors abruptly on turn 2.
    // Matching the engine's target + distance makes replay speed/feel
    // identical to the real run.
    const turnsSinceSpawnForEvent = turnIndex - life.spawnTurn;
    const endEventForTurn = turnIndex === life.endTurn ? life.end : undefined;
    const homingMoveForTurn = life.homingMoves[turnsSinceSpawnForEvent];
    const engineTargetX = endEventForTurn?.targetX ?? homingMoveForTurn?.targetX;
    const engineTargetY = endEventForTurn?.targetY ?? homingMoveForTurn?.targetY;

    // Straight-line homing: logical position should be the fractional
    // turn-end position (what updateStraightLineHomingVisual interpolates
    // to), not the tile-rounded posAtTurn. Without this, once the visual
    // reaches target it falls back to logical = tile center and snaps
    // (e.g., real freezes at (5.88, 6.97) but logical was rounded to (6, 7)).
    const logicalX = isStraightHoming ? thisPos.x : posAtTurn.x;
    const logicalY = isStraightHoming ? thisPos.y : posAtTurn.y;

    // Reconstruct cumulative `pathTraveled` up to this turn by summing
    // segment Euclidean distances from the homing_move events. Needed
    // so the drawProjectile predictive shrink (`range - pathTraveled <
    // threshold` for OUT OF RANGE) can fire in replay — without it,
    // pathTraveled stays undefined on the replay projectile and the
    // predictive branch is skipped.
    //
    // Count = moves EMITTED through end of turn K's resolveProjectiles
    // (inclusive of turn K's own MOVE TOWARD, since real-play engine
    // runs that before animation begins). For spawnTurn = S, turnIndex
    // = K: that's (K - S + 1) moves. Clamp to homingMoves.length for
    // the fizzle turn (which has no MOVE TOWARD event of its own).
    let pathTraveled: number | undefined;
    if (isHomingBolt) {
      pathTraveled = 0;
      let prevSeg = { x: spawn.x, y: spawn.y };
      const movesSoFar = turnIndex - life.spawnTurn + 1;
      const segCount = Math.min(movesSoFar, life.homingMoves.length);
      for (let i = 0; i < segCount; i++) {
        const move = life.homingMoves[i];
        const dx = move.x - prevSeg.x;
        const dy = move.y - prevSeg.y;
        pathTraveled += Math.sqrt(dx * dx + dy * dy);
        prevSeg = { x: move.x, y: move.y };
      }
    }

    const proj: Projectile = {
      id: spawn.projId,
      active: true,
      logicalX,
      logicalY,
      startX: spawn.x,
      startY: spawn.y,
      targetX: isStraightHoming
        ? (engineTargetX ?? (turnIndex === life.endTurn && life.end ? life.end.x : thisPos.x))
        : (tilePath?.[tilePath.length - 1]?.x ?? spawn.x),
      targetY: isStraightHoming
        ? (engineTargetY ?? (turnIndex === life.endTurn && life.end ? life.end.y : thisPos.y))
        : (tilePath?.[tilePath.length - 1]?.y ?? spawn.y),
      direction: spawn.direction || Direction.SOUTH,
      speed,
      tilePath,
      currentTileIndex: turnTileIndex,
      // Offset tileEntryTime so visual picks up at the correct tile, not restart from 0
      tileEntryTime: now - (turnTileIndex * (800 / speed)),
      startTime: now - (turnTileIndex * (800 / speed)),
      // Store start-of-turn tile index for step animation (so it starts from previous turn's end)
      _turnStartTileIndex: turnStartTileIndex,
      attackData: spawn.attackData || ({ id: 'replay-stub', name: 'replay-stub', damage: 0, pattern: AttackPattern.PROJECTILE } as CustomAttack),
      sourceCharacterId: spawn.sourceIsEnemy ? undefined : spawn.sourceEntityId,
      sourceEnemyId: spawn.sourceIsEnemy ? spawn.sourceEntityId : undefined,
      isHoming: spawn.isHoming,
      homingPathStyle: spawn.homingPathStyle,
      spellAssetId: spawn.spellAssetId,
      bounceOffWalls: false,
      teamSwapped: false,
      pathTraveled,
      // Straight-line homing: route through Euclidean visual interp.
      // Anchor at prevPos (fractional, turn-start) — target is the
      // engine-recorded target (set above). updateStraightLineHomingVisual
      // will animate from anchor → target over (dist/speed) seconds, at
      // the same rate the live game used.
      homingVisualStartX: isStraightHoming ? prevPos.x : undefined,
      homingVisualStartY: isStraightHoming ? prevPos.y : undefined,
      homingVisualStartTime: isStraightHoming ? now : undefined,
    };

    // Apply reflect visuals if the reflect happened on or before this turn
    if (life.reflect && turnIndex >= life.reflect.turn) {
      proj.reflected = true;
      proj.reflectTintColor = life.reflect.reflectTintColor;
      proj.reflectOverrideSprite = life.reflect.reflectOverrideSprite;
      proj.reflectAtTileIndex = life.reflect.reflectAtTileIndex;
      if (life.reflect.combinedPath) {
        proj.tilePath = [...life.reflect.combinedPath];
      }
    }

    // If this is the end turn, set hitResult so the visual system knows when to stop
    if (life.end && turnIndex === life.endTurn) {
      // hitTileIndex: use recorded value, or compute from tilePath (last tile before or at hit position)
      let hitIdx = life.end.hitTileIndex;
      if (hitIdx === undefined && proj.tilePath && proj.tilePath.length > 0) {
        const hitX = Math.floor(life.end.x);
        const hitY = Math.floor(life.end.y);
        hitIdx = proj.tilePath.findIndex(t => t.x === hitX && t.y === hitY);
        if (hitIdx === -1) hitIdx = proj.tilePath.length - 1;
      }
      const resolvedHitIdx = hitIdx ?? (proj.tilePath ? proj.tilePath.length - 1 : 0);
      if (life.end.type === 'hit') {
        // Forward deferredDeath* and damage from the event so replay's
        // visual consume path decrements pendingVisualDamage and commits
        // pendingDeath → dead, matching real play. Without these, the
        // final turn's kill leaves the enemy pendingDeath forever in
        // replay with a full healthbar.
        proj.hitResult = {
          hitTileIndex: resolvedHitIdx,
          deactivate: true,
          vfxSprite: life.end.hitVfxSprite,
          vfxX: life.end.x,
          vfxY: life.end.y,
          deferredDeathEntityId: life.end.deferredDeathEntityId,
          deferredDeathIsEnemy: life.end.deferredDeathIsEnemy,
          deferredDeathIndex: life.end.deferredDeathIndex,
          damage: life.end.damage,
        };
      } else {
        // wall_hit or deactivate (no VFX / no deferred death — just
        // deactivate at end of tilePath). Unified with the hit path above
        // so the visual loop only has one "logic done" signal to consume.
        proj.hitResult = {
          hitTileIndex: resolvedHitIdx,
          deactivate: true,
        };
        // Mirror the real-play path: if the approach-shrink would have
        // had no travel window (target-lost mid-flight), switch on the
        // lingering despawn so replay shows the 125ms shrink. For cases
        // predictive already covered (OOR, non-homing endpoint), the
        // helper internally skips the linger to avoid a scale-1 pop.
        maybeMarkLingerDespawn(proj, resolvedHitIdx, now);
      }
    }

    // (Previously an overwrite here pinned logicalX/Y to
    // `tilePath[currentTileIndex]` so the frozen fallback in drawProjectile
    // would show a tile-aligned position. That clobbered the fractional
    // logicalX/Y we just set for straight-line homing — causing step-back
    // to snap bolts to tile centers even when the live game had them at
    // (4.93, 6.68) etc. The logical position we set above is already the
    // correct turn-end location for every style: fractional for straight
    // homing (thisPos from the engine event), tile-aligned for grid /
    // pathfinding / non-homing (posAtTurn from the tile path).)

    // Pierce pass-through decrements — populate from ALL pierceHits in this
    // bolt's lifetime, not just this turn's. The replay projectile is
    // REBUILT each turn (vs live where it persists), so prior turns'
    // unconsumed decrements would otherwise be lost. Including all
    // decrements is safe: commitDeferredVisualDamage decrements with
    // Math.max(0, prior - damage), so re-firing on an entity whose
    // pendingVisualDamage is already 0 (because live decremented it
    // during the prior turn's animation) is a harmless no-op. For
    // entities still elevated in the snapshot (live animation lagged or
    // this is the most recent turn's hit), the decrement fires correctly
    // when the visual crosses its tile.
    //
    // hitTileIndex on the event was recorded against the live engine's
    // tilePath; replay's tilePath matches (same construction for non-
    // homing; per-turn for homing — see filter below).
    if (life.pierceHits.length > 0) {
      const allHits = life.pierceHits.filter(e =>
        e.deferredDeathEntityId !== undefined &&
        (e.damage ?? 0) > 0 &&
        e.hitTileIndex !== undefined
      );
      // For HOMING bolts, tilePath is replaced each turn (per-turn segment),
      // so hitTileIndex from prior turns no longer maps to current tilePath.
      // Restrict to this turn's hits for homing. Non-homing tilePath is
      // stable across the bolt's life (set at spawn), so all-turn inclusion
      // works.
      const turnHits = isHomingBolt
        ? allHits.filter(e => e.turn === turnIndex)
        : allHits;
      if (turnHits.length > 0) {
        proj.pendingVisualDecrements = turnHits.map(e => ({
          targetEntityId: e.deferredDeathEntityId!,
          targetIsEnemy: e.deferredDeathIsEnemy ?? false,
          targetIndex: e.deferredDeathIndex,
          damage: e.damage!,
          hitTileIndex: e.hitTileIndex!,
        }));
        if (isPierceDebug()) {
          console.log(
            `[PIERCE-POPULATE ${proj.id.slice(-6)}] turnIndex=${turnIndex} ` +
            `entries=${proj.pendingVisualDecrements.length} ` +
            `(homing=${isHomingBolt} ${isHomingBolt ? 'this-turn-only' : 'all-turns'}) ` +
            `tilePathLen=${proj.tilePath?.length ?? 'none'} ` +
            `currentTileIndex=${proj.currentTileIndex} ` +
            `tileEntryTime=${proj.tileEntryTime} now=${now} ` +
            `decrements=${proj.pendingVisualDecrements.map(d => `${d.targetEntityId.slice(-6)}@hitTileIdx=${d.hitTileIndex}/dmg=${d.damage}`).join(', ')}`
          );
        }
      }
    }

    replayProjectiles.push(proj);
  }

  return replayProjectiles;
};

// Deep copy a replay snapshot for safe playback. `index` is the snapshot's
// place in the turn history; `now` stamps the visuals (a parameter so tests
// can pin it).
export const copySnapshotForPlayback = (
  snapshot: GameState,
  index: number,
  lifetimes: ProjectileLifetimes,
  now: number = Date.now(),
) => {
  const copy = JSON.parse(JSON.stringify(snapshot));
  copy.tileStates = new Map();
  if (snapshot.tileStates) {
    snapshot.tileStates.forEach((value, key) => {
      copy.tileStates.set(key, {
        ...value,
        damagedEntities: value.damagedEntities ? new Set(value.damagedEntities) : undefined
      });
    });
  }
  // Melee/hit/heal VFX are particles spawned during the turn's execution
  // and captured in the snapshot with the ORIGINAL run's wall-clock
  // startTimes — long expired by replay time. They used to be cleared
  // here, which made melee attacks invisible in replay. Re-stamp them to
  // now instead, so each replay turn plays its VFX like the live turn did.
  const particleNow = now;
  copy.activeParticles = (copy.activeParticles || []).map((p: { startTime: number }) => ({
    ...p,
    startTime: particleNow,
  }));

  // Replace snapshot projectiles with replay-generated ones (correct positions and timing)
  const replayProjectiles = buildReplayProjectiles(index, snapshot, lifetimes, now);
  copy.activeProjectiles = replayProjectiles; // Replace entirely — snapshot projectiles are stale

  // Apply past deferred-death commits to the snapshot. Snapshots are
  // captured at end-of-executeTurn in real play, BEFORE the animation loop
  // fires deferred-death visual commits for that turn's hits. So a
  // snapshot for turn N has entities that were killed on turn M < N still
  // as pendingDeath (because the real-play commit happened during turn M's
  // animation window, after the snapshot for turn M+1 was already locked).
  //
  // Without this, advancing replay to turn N "revives" entities: replay
  // committed them to dead during turn M's visual playback, then turn N's
  // snapshot loads them as pendingDeath → alive sprite — then the bolt's
  // visual commit re-fires in the new frame → dead sprite again. That's
  // the dead → alive → dead stutter the user saw.
  //
  // Rule: for any `hit` event with deferredDeath* on a turn STRICTLY
  // BEFORE this snapshot's turn, the commit has visually fired by now.
  // Force the target dead in the copy. Turn-of-hit events are left alone
  // so the current turn's visual commit still runs and fires the death
  // animation at the right moment.
  //
  // Applies to BOTH the bolt's final landing (life.end) and any pierce
  // pass-through hits (life.pierceHits) — pierce-through can kill the
  // enemy too, and that death's commit needs the same past-turn fix-up.
  //
  // CRITICAL: only force dead if the snapshot has `pendingProjectileDeath`
  // set. `deferredDeathEntityId` on the event is misleadingly named — it's
  // set on every damaging hit, not just kills. A 1-damage hit on a 50-HP
  // enemy would trigger this path with deferredDeathEntityId populated,
  // but pendingProjectileDeath would be false (entity didn't die). The
  // pendingProjectileDeath check filters genuine deferred kills from
  // pass-through damage.
  const applyPastDeathCommit = (event: ProjectileEvent) => {
    if (event.type !== 'hit') return;
    if (event.turn >= index) return;
    if (!event.deferredDeathEntityId) return;
    if (event.deferredDeathIsEnemy) {
      const idx = event.deferredDeathIndex;
      if (idx === undefined) return;
      const e = copy.puzzle?.enemies?.[idx];
      // Only the KILLING bolt's event shows the death (an earlier hit that
      // merely damaged it must not reveal it, or its drop, early).
      if (e && e.enemyId === event.deferredDeathEntityId && !e.dead && e.pendingProjectileDeath
          && (!e.projectileKilledBy || e.projectileKilledBy === event.projId)) {
        e.dead = true;
        e.pendingProjectileDeath = false;
        e.pendingVisualDamage = 0;
        e.currentHealth = 0;
      }
    } else {
      const c = copy.placedCharacters?.find(
        (pc: PlacedCharacter) => pc.characterId === event.deferredDeathEntityId
      );
      if (c && !c.dead && c.pendingProjectileDeath
          && (!c.projectileKilledBy || c.projectileKilledBy === event.projId)) {
        c.dead = true;
        c.pendingProjectileDeath = false;
        c.pendingVisualDamage = 0;
        c.currentHealth = 0;
      }
    }
  };

  for (const [, life] of lifetimes) {
    if (life.end) applyPastDeathCommit(life.end);
    for (const ph of life.pierceHits) applyPastDeathCommit(ph);
  }

  return copy;
};
