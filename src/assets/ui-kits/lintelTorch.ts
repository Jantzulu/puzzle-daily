import sheetUrl from './lintel-torch.png';

/**
 * Lintel torch sheet — ART DROP-IN POINT (placeholder shipped 2026-10-15;
 * the user paints the real one).
 *
 * The two torches flanking DUNGEON DETAILS (components/game/LintelTorch.tsx)
 * draw from ONE horizontal strip of equal frames, rendered at native art px
 * × 2, pixelated — never fit-to-box.
 *
 * To swap in painted art: overwrite lintel-torch.png and update the numbers
 * below to match (any frame size, any frame counts). No other code changes.
 * Frame order in the strip:
 *   0 … litFrames-1           the burning loop, played at `fps`
 *   outFrame                  the torch put out (it rests on this frame)
 *   outFrame+1 … +smokeFrames the smoke puff, played once as it goes out
 *                             (smokeFrames 0 = no puff)
 * flameX / flameY: the flame's centre in a frame, in art px from the frame's
 * top-left. The torch's pool of light centres there.
 *
 * REPO-BUNDLED by design (the UI-chrome rule, 2026-07-09): chrome ships with
 * the deploy, never through Supabase.
 */
export interface TorchSheet {
  /** Bundled image URL (Vite import of the PNG). */
  url: string;
  /** Art-pixel frame size within the strip. */
  frameWidth: number;
  frameHeight: number;
  litFrames: number;
  /** Playback rate of the burning loop and the smoke puff. */
  fps: number;
  outFrame: number;
  smokeFrames: number;
  flameX: number;
  flameY: number;
}

export const LINTEL_TORCH_SHEET: TorchSheet = {
  url: sheetUrl,
  frameWidth: 8,
  frameHeight: 16,
  litFrames: 4,
  fps: 8,
  outFrame: 4,
  smokeFrames: 3,
  flameX: 4,
  flameY: 4.5,
};
