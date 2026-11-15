import artUrl from './dead-end.png';

/**
 * Dead-end scene — ART DROP-IN POINT (placeholder shipped 2026-11-14; the
 * user paints the real one).
 *
 * The 404 page (components/shared/DeadEndScene.tsx) shows ONE still image, a
 * caved-in corridor, drawn at native art px × an integer zoom, pixelated.
 * The eyes in the dark and the falling dust are NOT in the image: the page
 * draws them over it, at the art-pixel positions listed here.
 *
 * To swap in painted art: overwrite dead-end.png and update the numbers
 * below (any size; move the eye spots and dust columns into the new art's
 * dark). No other code changes.
 *
 * REPO-BUNDLED by design (the UI-chrome rule, 2026-07-09): chrome ships with
 * the deploy, never through Supabase.
 */
export interface DeadEndArt {
  /** Bundled image URL (Vite import of the PNG). */
  url: string;
  /** Art-pixel size of the image. */
  width: number;
  height: number;
  /**
   * Where a pair of eyes may appear: the pair's top-left corner, in art px
   * from the image's top-left. Keep them inside the dark. More spots than
   * pairs, so a startled pair can come back somewhere else.
   */
  eyeSpots: ReadonlyArray<readonly [number, number]>;
  /** Dust trickles: the column (art px) and the rows it falls between. */
  dust: ReadonlyArray<{ x: number; from: number; to: number }>;
}

export const DEAD_END_ART: DeadEndArt = {
  url: artUrl,
  width: 96,
  height: 64,
  eyeSpots: [
    [37, 12],
    [54, 10],
    [45, 20],
    [59, 22],
    [32, 19],
    [50, 29],
  ],
  dust: [
    { x: 41, from: 6, to: 36 },
    { x: 57, from: 7, to: 33 },
    { x: 66, from: 14, to: 40 },
  ],
};
