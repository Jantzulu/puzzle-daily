/**
 * Haptic Feedback Utility
 *
 * Wraps navigator.vibrate() with predefined patterns for game events.
 * Fails silently on unsupported devices.
 */

const HAPTICS_ENABLED_KEY = 'haptics_enabled';

const PATTERNS: Record<string, number | number[]> = {
  tap:     10,               // tile selection, button press
  medium:  25,               // entity placement
  heavy:   50,               // drag-drop complete
  success: [10, 50, 10],    // victory
  error:   [50, 25, 50],    // invalid action, defeat
  combat:  [15, 30, 15],    // damage hit
  spell:   [10,20,10,20,10],// spell cast
  turn:    20,               // turn advance
};

export type HapticPattern = keyof typeof PATTERNS;

/**
 * Check if the Vibration API is supported
 */
export function isHapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

/**
 * Check if haptics are enabled by the user
 */
export function isHapticsEnabled(): boolean {
  if (!isHapticsSupported()) return false;
  try {
    const stored = localStorage.getItem(HAPTICS_ENABLED_KEY);
    // Default to enabled on supported devices
    return stored === null ? true : stored === 'true';
  } catch {
    return false;
  }
}

/**
 * Enable or disable haptic feedback
 */
export function setHapticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HAPTICS_ENABLED_KEY, String(enabled));
  } catch {}
}

/**
 * Trigger a haptic pattern. Fails silently if unsupported or disabled.
 */
export function vibrate(pattern: HapticPattern): void {
  if (!isHapticsEnabled()) return;

  try {
    const p = PATTERNS[pattern];
    if (p !== undefined) {
      navigator.vibrate(p);
    }
  } catch {}
}
