/**
 * Haptic Feedback Utility
 *
 * Reads trigger→pattern mappings from GlobalHapticConfig (team-level setting).
 * Falls back to defaults if no config is set.
 *
 * iOS: Uses hidden <input type="checkbox" switch> toggle trick (Safari 17.4+).
 * Android: Uses navigator.vibrate() with full pattern support.
 * Fails silently on unsupported devices.
 */

import { getGlobalHapticConfig } from './assetStorage';
import type { HapticPattern, GlobalHapticConfig } from '../types/game';

// ─── Platform detection ──────────────────────────────────────────

const isIOS = typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent);

const hasVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

// ─── iOS haptic via checkbox switch toggle ───────────────────────

function iosHapticTap(): void {
  try {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    input.style.top = '-100px';
    document.body.appendChild(input);
    input.click();
    requestAnimationFrame(() => {
      input.remove();
    });
  } catch {}
}

function iosHapticMulti(taps: number, delayMs: number = 80): void {
  for (let i = 0; i < taps; i++) {
    setTimeout(() => iosHapticTap(), i * delayMs);
  }
}

// ─── iOS tap count per pattern (approximation of vibration patterns) ──

const IOS_TAPS: Record<HapticPattern, number> = {
  tap:     1,
  medium:  1,
  heavy:   1,
  success: 2,
  error:   3,
  combat:  2,
  spell:   3,
  turn:    1,
};

// ─── Android vibration patterns ──────────────────────────────────

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

// ─── Shared config ───────────────────────────────────────────────

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
  return isIOS || hasVibrate;
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
  if (isIOS) {
    const taps = IOS_TAPS[pattern] || 1;
    if (taps === 1) {
      iosHapticTap();
    } else {
      iosHapticMulti(taps);
    }
  } else if (hasVibrate) {
    const p = PATTERNS[pattern];
    if (p !== undefined) {
      navigator.vibrate(p);
    }
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

  const config = getEffectiveHapticConfig();
  const pattern = config[triggerId];

  if (!pattern) return;

  try {
    firePattern(pattern);
  } catch {}
}

/**
 * Fire a raw pattern (for settings preview). Bypasses config checks.
 */
export function vibratePreview(pattern: HapticPattern): void {
  if (!isHapticsSupported()) return;
  try {
    firePattern(pattern);
  } catch {}
}

/** All available pattern names for UI dropdowns */
export const HAPTIC_PATTERN_OPTIONS: HapticPattern[] = [
  'tap', 'medium', 'heavy', 'success', 'error', 'combat', 'spell', 'turn',
];
