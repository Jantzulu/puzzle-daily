/**
 * Haptic Feedback Utility
 *
 * Reads trigger→pattern mappings from GlobalHapticConfig (team-level setting).
 * Falls back to defaults if no config is set.
 * Fails silently on unsupported devices.
 */

import { getGlobalHapticConfig } from './assetStorage';
import type { HapticPattern, GlobalHapticConfig } from '../types/game';

// ─── Vibration patterns ──────────────────────────────────────────

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap:     10,
  medium:  25,
  heavy:   50,
  success: [10, 50, 10],
  error:   [50, 25, 50],
  combat:  [15, 30, 15],
  spell:   [10, 20, 10, 20, 10],
  turn:    20,
};

/** Default config — used when team hasn't configured haptics yet */
export const HAPTIC_DEFAULTS: GlobalHapticConfig = {
  turnAdvance: 'turn',
  victory: 'success',
  defeat: 'error',
  characterPlace: 'tap',
  lifeLost: null,
  tilePaint: null,
};

export type HapticTriggerId = keyof GlobalHapticConfig;

export function isHapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

/**
 * Get the effective haptic config — stored config merged over defaults.
 * This ensures defaults are used for any trigger not explicitly configured.
 */
export function getEffectiveHapticConfig(): GlobalHapticConfig {
  const config = getGlobalHapticConfig();
  // If config is empty (never configured), return defaults
  if (Object.keys(config).length === 0) return { ...HAPTIC_DEFAULTS };
  return config;
}

/**
 * Trigger a haptic event by trigger ID.
 * Reads the team-configured pattern from GlobalHapticConfig.
 * If the trigger is null/undefined in config, it doesn't fire.
 */
export function vibrate(triggerId: HapticTriggerId): void {
  if (!isHapticsSupported()) return;

  const config = getEffectiveHapticConfig();
  const pattern = config[triggerId];

  if (!pattern) return;

  try {
    const p = PATTERNS[pattern];
    if (p !== undefined) {
      navigator.vibrate(p);
    }
  } catch {}
}

/**
 * Fire a raw pattern (for settings preview). Bypasses config checks.
 */
export function vibratePreview(pattern: HapticPattern): void {
  if (!isHapticsSupported()) return;
  try {
    const p = PATTERNS[pattern];
    if (p !== undefined) navigator.vibrate(p);
  } catch {}
}

/** All available pattern names for UI dropdowns */
export const HAPTIC_PATTERN_OPTIONS: HapticPattern[] = [
  'tap', 'medium', 'heavy', 'success', 'error', 'combat', 'spell', 'turn',
];
