import type { PlacedCollectible, DeliveryConfig } from '../types/game';

// Pure schedule math for collectible deliveries (2026-07-21), shared by the
// engine dawn pass, the board renderer, and the editor so they can never
// disagree. Mirrors objectSchedule.ts's stance: dawn semantics, exclusive
// deadline, repeat needs a bounded window, invalid config fails visible.

/** Valid authored delivery config (arriveTurn < 1 = treated as no delivery). */
export function hasDeliverySchedule(c: PlacedCollectible): boolean {
  return c.delivery !== undefined && c.delivery.arriveTurn >= 1;
}

/** Window length in turns, or undefined for a deadline-less delivery. */
export function deliveryWindowLength(d: DeliveryConfig): number | undefined {
  if (d.deadlineTurn === undefined || d.deadlineTurn <= d.arriveTurn) return undefined;
  return d.deadlineTurn - d.arriveTurn;
}

/** Effective repeat cadence — repeatEvery only means something with a bounded window. */
export function deliveryRepeat(d: DeliveryConfig): number | undefined {
  if (d.repeatEvery === undefined || d.repeatEvery < 1) return undefined;
  if (deliveryWindowLength(d) === undefined) return undefined;
  return d.repeatEvery;
}

/** True when `turn` is a cycle's arrival dawn. */
export function isDeliveryArrivalDawn(d: DeliveryConfig, turn: number): boolean {
  if (turn < d.arriveTurn) return false;
  if (turn === d.arriveTurn) return true;
  const repeat = deliveryRepeat(d);
  return repeat !== undefined && (turn - d.arriveTurn) % repeat === 0;
}

/**
 * The next arrival dawn at or after `turn`, for the pre-arrival ghost badge.
 * Returns undefined when no future arrival exists (one-shot already past its
 * dawn, or permanently missed — callers gate on deliveryMissedOnTurn).
 */
export function nextDeliveryTurn(d: DeliveryConfig, turn: number): number | undefined {
  if (turn <= d.arriveTurn) return d.arriveTurn;
  const repeat = deliveryRepeat(d);
  if (repeat === undefined) return undefined;
  const cyclesPast = Math.ceil((turn - d.arriveTurn) / repeat);
  return d.arriveTurn + cyclesPast * repeat;
}

/**
 * On-board test for a collectible, delivery-aware: a scheduled delivery only
 * exists between landing and pickup/deadline. Non-deliveries keep the plain
 * !collected rule. Every position-based collectible query in the engine and
 * the board's draw gate must go through this, or pending deliveries act as
 * invisible blockers.
 */
export function isCollectiblePresent(c: PlacedCollectible): boolean {
  if (c.collected) return false;
  if (!hasDeliverySchedule(c)) return true;
  return c.delivered === true;
}
