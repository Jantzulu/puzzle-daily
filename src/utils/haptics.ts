/**
 * Haptic Feedback Utility
 *
 * Reads trigger→pattern mappings from GlobalHapticConfig (team-level setting).
 * Falls back to defaults if no config is set.
 *
 * Uses web-haptics library for cross-platform support (iOS + Android).
 * Fails silently on unsupported devices.
 */

import { WebHaptics } from 'web-haptics';
import { getGlobalHapticConfig } from './assetStorage';
import type { HapticPattern, GlobalHapticConfig } from '../types/game';

// ─── Platform detection ─────────────────────────────────────────

// WebHaptics.isSupported only checks navigator.vibrate (missing on iOS).
// The library internally falls back to the checkbox switch trick on iOS,
// so we also consider touch devices as supported.
const isTouchDevice = typeof window !== 'undefined' &&
  window.matchMedia('(pointer: coarse)').matches;

// ─── Singleton instance ─────────────────────────────────────────

let haptics: WebHaptics | null = null;

function getHaptics(): WebHaptics {
  if (!haptics) {
    haptics = new WebHaptics();
  }
  return haptics;
}

// ─── Pattern mapping → web-haptics trigger input ────────────────

const PATTERN_MAP: Record<HapticPattern, Parameters<WebHaptics['trigger']>[0]> = {
  tap:     'light',
  medium:  'medium',
  heavy:   'heavy',
  success: 'success',
  error:   'error',
  combat:  [{ duration: 15, intensity: 0.7 }, { delay: 30, duration: 15, intensity: 0.7 }],
  spell:   [{ duration: 10, intensity: 0.5 }, { delay: 20, duration: 10, intensity: 0.6 }, { delay: 20, duration: 10, intensity: 0.7 }],
  turn:    'selection',
};

// ─── Shared config ───────────────────────────────────────────────

/** Default config — used when team hasn't configured haptics yet */
export const HAPTIC_DEFAULTS: GlobalHapticConfig = {
  turnAdvance: 'turn',
  victory: 'success',
  defeat: 'error',
  characterPlace: 'tap',
  heroSelect: 'tap',
  heroRemove: null,
  heroTrash: null,
  playButton: 'medium',
  testButton: 'tap',
  lifeLost: null,
  tilePaint: null,
};

export type HapticTriggerId = keyof GlobalHapticConfig;

export function isHapticsSupported(): boolean {
  return WebHaptics.isSupported || isTouchDevice;
}

// ─── Player preference ───────────────────────────────────────────
// Team config decides WHICH triggers fire; this is the player's own
// master switch on top of it. Defaults to on.

const PLAYER_PREF_KEY = 'puzzle-game-haptics-enabled';

export function isHapticsEnabledByPlayer(): boolean {
  try {
    return localStorage.getItem(PLAYER_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setHapticsEnabledByPlayer(enabled: boolean): void {
  try {
    localStorage.setItem(PLAYER_PREF_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage unavailable — preference just won't persist.
  }
}

/**
 * Get the effective haptic config — stored config merged over defaults.
 */
export function getEffectiveHapticConfig(): GlobalHapticConfig {
  const config = getGlobalHapticConfig();
  if (Object.keys(config).length === 0) return { ...HAPTIC_DEFAULTS };
  return config;
}

// ─── Core fire function ──────────────────────────────────────────

function firePattern(pattern: HapticPattern): void {
  const input = PATTERN_MAP[pattern];
  if (input !== undefined) {
    getHaptics().trigger(input);
  }
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Trigger a haptic event by trigger ID.
 * Reads the team-configured pattern from GlobalHapticConfig.
 * If the trigger is null/undefined in config, it doesn't fire.
 */
export function vibrate(triggerId: HapticTriggerId): void {
  if (!isHapticsSupported()) return;
  if (!isHapticsEnabledByPlayer()) return;

  const config = getEffectiveHapticConfig();
  const pattern = config[triggerId];

  if (!pattern) return;

  try {
    firePattern(pattern);
  } catch { /* ignore */ }
}

/**
 * Fire a raw pattern (for settings preview). Bypasses config checks.
 */
export function vibratePreview(pattern: HapticPattern): void {
  if (!isHapticsSupported()) return;
  try {
    firePattern(pattern);
  } catch { /* ignore */ }
}

/** All available pattern names for UI dropdowns */
export const HAPTIC_PATTERN_OPTIONS: HapticPattern[] = [
  'tap', 'medium', 'heavy', 'success', 'error', 'combat', 'spell', 'turn',
];
