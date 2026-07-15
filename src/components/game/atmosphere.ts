// ============================================================================
// ATMOSPHERE (FOG + DUST) TOGGLE
// ============================================================================
// The drifting mist wisps and twinkling dust specks drawn over the board
// (drawAtmosphericEffects in AnimatedGameBoard). Purely visual; this module
// is the runtime toggle so the pass can be disabled by taste or bisected for
// frame cost on a real device. Mirrors staticBake.ts / blobShadows.ts.
//
// Runtime toggle:
//   toggleAtmosphere()          — from the browser console
//   localStorage 'atmosphere'   — 'off' disables; anything else enables

const TOGGLE_KEY = 'atmosphere';
let toggleCache: boolean | null = null;

export function atmosphereEnabled(): boolean {
  if (toggleCache === null) {
    try {
      toggleCache = localStorage.getItem(TOGGLE_KEY) !== 'off';
    } catch {
      toggleCache = true;
    }
  }
  return toggleCache;
}

export function setAtmosphereEnabled(on: boolean): void {
  toggleCache = on;
  try {
    localStorage.setItem(TOGGLE_KEY, on ? 'on' : 'off');
  } catch { /* private-mode etc. — session-only toggle still works */ }
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).toggleAtmosphere = () => {
    setAtmosphereEnabled(!atmosphereEnabled());
    return atmosphereEnabled() ? 'atmosphere ON' : 'atmosphere OFF';
  };
}
