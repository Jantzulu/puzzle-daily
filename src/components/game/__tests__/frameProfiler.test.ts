// Pins the frame profiler's accumulation logic: phase attribution, the
// disabled no-op path, and window reset on disable. The HUD's DOM half is
// guarded out in the node test environment (typeof document check) and is
// verified by eye on a device — its failure mode (no overlay) is obvious.
import { describe, it, expect, afterEach } from 'vitest';
import {
  profFrameStart,
  profPhase,
  profFrameEnd,
  profSnapshot,
  setPerfHudEnabled,
  perfHudEnabled,
} from '../frameProfiler';

function busyWait(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) { /* spin */ }
}

function runFrame(logicMs: number, entitiesMs: number): void {
  profFrameStart();
  profPhase('logic');
  busyWait(logicMs);
  profPhase('entities');
  busyWait(entitiesMs);
  profFrameEnd(0, 0, 0, 0);
}

afterEach(() => {
  setPerfHudEnabled(false); // also resets the sample window
});

describe('frameProfiler', () => {
  it('accumulates nothing while disabled', () => {
    setPerfHudEnabled(false);
    runFrame(1, 1);
    expect(profSnapshot()).toBeNull();
  });

  it('attributes time between phase marks to the phase that was running', () => {
    setPerfHudEnabled(true);
    expect(perfHudEnabled()).toBe(true);
    for (let i = 0; i < 3; i++) runFrame(2, 6);

    const snap = profSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.frames).toBe(3);
    // entities got ~3x the busy time of logic; allow generous slop for
    // timer resolution but require the ordering and rough magnitudes.
    expect(snap!.phases.entities.avg).toBeGreaterThan(snap!.phases.logic.avg);
    expect(snap!.phases.logic.avg).toBeGreaterThan(0.5);
    expect(snap!.phases.entities.avg).toBeGreaterThan(4);
    // Unmarked phases stay ~zero.
    expect(snap!.phases.vignette.avg).toBeLessThan(0.5);
    // Total work covers the marked phases.
    expect(snap!.avgWorkMs).toBeGreaterThanOrEqual(
      snap!.phases.logic.avg + snap!.phases.entities.avg - 0.01
    );
  });

  it('resets the sample window when disabled', () => {
    setPerfHudEnabled(true);
    runFrame(1, 1);
    expect(profSnapshot()!.frames).toBe(1);
    setPerfHudEnabled(false);
    expect(profSnapshot()).toBeNull();
    // Re-enabling starts a fresh window rather than resuming the old one.
    setPerfHudEnabled(true);
    runFrame(1, 1);
    expect(profSnapshot()!.frames).toBe(1);
  });
});
