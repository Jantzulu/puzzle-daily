// ============================================================================
// STATIC-LAYER BAKE TOGGLE
// ============================================================================
// The board's animation loop repaints every layer 60×/sec. The static layers
// (dungeon border, tiles, wall AO) only actually change per TURN — baking
// them to an offscreen canvas and blitting turns most of the per-frame work
// into one drawImage. Biggest win on mobile GPUs. The bake itself lives in
// AnimatedGameBoard's animate loop; this module is just the runtime toggle
// so live/baked can be compared on a real device.
//
// Runtime toggle (for live comparison):
//   toggleStaticBake()           — from the browser console
//   localStorage 'static_bake'   — 'off' disables

const TOGGLE_KEY = 'static_bake';
let toggleCache: boolean | null = null;

export function staticBakeEnabled(): boolean {
  if (toggleCache === null) {
    try {
      toggleCache = localStorage.getItem(TOGGLE_KEY) !== 'off';
    } catch {
      toggleCache = true;
    }
  }
  return toggleCache;
}

export function setStaticBakeEnabled(on: boolean): void {
  toggleCache = on;
  try {
    localStorage.setItem(TOGGLE_KEY, on ? 'on' : 'off');
  } catch { /* session-only toggle still works */ }
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).toggleStaticBake = () => {
    setStaticBakeEnabled(!staticBakeEnabled());
    return staticBakeEnabled() ? 'static bake ON' : 'static bake OFF';
  };
}
