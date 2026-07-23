/**
 * Loading-rune animation sheet — ART DROP-IN POINT (plumbing shipped
 * 2026-07-21, awaiting-art list item 1).
 *
 * When the user draws the sheet:
 *   1. Put the PNG next to this file (e.g. `loading-rune.png`) — a single
 *      horizontal strip of frames, drawn at art scale (any frame size; the
 *      component renders native × integer zoom, pixelated — never
 *      fit-to-box).
 *   2. Replace `null` below with the filled-in config:
 *        import sheetUrl from './loading-rune.png';
 *        export const LOADING_RUNE_SHEET: LoadingRuneSheet | null = {
 *          url: sheetUrl, frameWidth: 24, frameHeight: 24, frames: 8, fps: 8,
 *        };
 *   No other code changes — every loading spot (sprite-preload gate, Slab
 *   demo tap, training arena select, route fallbacks) picks it up via
 *   <LoadingRune/>, which falls back to the pre-existing pulsing text while
 *   this is null.
 *
 * REPO-BUNDLED by design (2026-07-09 decision: UI chrome ships with the
 * deploy, never via Supabase) — doubly so here, since the thing shown WHILE
 * assets load cannot itself need loading from the cloud.
 */
export interface LoadingRuneSheet {
  /** Bundled image URL (Vite import of the PNG). */
  url: string;
  /** Art-pixel frame dimensions within the horizontal strip. */
  frameWidth: number;
  frameHeight: number;
  /** Frame count in the strip. */
  frames: number;
  /** Playback rate (sprite-sheet convention: 4–12 fps reads well). */
  fps: number;
}

export const LOADING_RUNE_SHEET: LoadingRuneSheet | null = null;
