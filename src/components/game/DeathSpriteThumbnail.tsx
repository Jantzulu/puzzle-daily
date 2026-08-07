import React from 'react';
import type { CustomSprite } from '../../utils/assetStorage';
import { drawDeathSprite, hasDeathAnimation } from '../editor/SpriteEditor';

// ============================================================================
// DEATH SPRITE THUMBNAIL — a hero's fall, replayed off-board
// ============================================================================
// The defeat window's skull becomes the actual death animation of a hero
// who fell that round (the user's girlfriend's idea, 2026-08-06): played
// exactly as in-game via the board's own EXPORTED primitive
// (drawDeathSprite forces loop:false and clamps to the final frame — the
// corpse IS the last frame by design, so "play once and stop" comes
// free), then the soul rises off the body — a direct port of the board's
// drawSoul (the corpse's own silhouette, faint, easing upward with a
// sway). Death animations are deliberately NON-directional, so no facing
// input is needed.
//
// Built as a standalone component so the game-over screen (or anywhere
// else) can adopt it later with one import — the user is holding that
// surface for a separate design.
//
// Image readiness: by the time a defeat overlay shows, the board just
// played this exact sheet on the dungeon, so the module image cache is
// warm; if a frame isn't ready yet the draw silently no-ops for a tick
// (board behavior) rather than blocking.

/** The board's art tile in art px (SpriteEditor's ART_TILE_PX, unexported). */
const ART_TILE_PX = 24;
// The board's soul constants (AnimatedGameBoard drawSoul, ported).
const SOUL_RISE_MS = 1800;
const SOUL_RISE_TILES = 0.9;
const SOUL_PEAK_ALPHA = 0.32;

/** Gate for callers: only swap the skull when the fallen hero has death art. */
export const deathVignetteUsable = (sprite?: CustomSprite | null): sprite is CustomSprite =>
  !!sprite && hasDeathAnimation(sprite);

export const DeathSpriteThumbnail: React.FC<{
  sprite: CustomSprite;
  /** Native art px × this — integer, pixel-perfect (the sprite law). 2 = the card scale. */
  pixelScale?: number;
  /** The soul rising off the corpse after the fall (the board's bonus). */
  withSoul?: boolean;
  className?: string;
}> = ({ sprite, pixelScale = 2, withSoul = true, className }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tile = ART_TILE_PX * pixelScale;
    // Two tiles wide (halo room for wide sprites); the corpse sits in the
    // bottom tile, with headroom above for the soul's rise.
    const w = tile * 2;
    const h = Math.round(tile * (withSoul ? 2 : 1.3));
    const baseCy = h - tile / 2;
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sheet = sprite.deathSpriteSheet;
    const durationMs = sheet?.frameCount ? (sheet.frameCount / (sheet.frameRate || 10)) * 1000 : 0;
    const start = Date.now();
    let raf = 0;
    let disposed = false;

    const drawFrame = () => {
      if (disposed) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      const elapsed = Date.now() - start;
      // The fall (and, once clamped, the held corpse frame).
      drawDeathSprite(ctx, sprite, Math.round(w / 2), Math.round(baseCy), tile, undefined, start);
      let settled = elapsed > durationMs;
      if (withSoul && elapsed > durationMs) {
        const t = Math.min(1, (elapsed - durationMs) / SOUL_RISE_MS);
        const eased = 1 - (1 - t) * (1 - t);
        ctx.save();
        ctx.globalAlpha = SOUL_PEAK_ALPHA * (1 - t);
        // startTime 0 = "ancient" — the held corpse frame as the soul's
        // silhouette (the board's exact trick).
        drawDeathSprite(
          ctx, sprite,
          Math.round(w / 2 + Math.sin(t * Math.PI * 3) * 1.5),
          Math.round(baseCy - eased * SOUL_RISE_TILES * tile),
          tile, undefined, 0,
        );
        ctx.restore();
        settled = t >= 1;
      }
      // rAF only while something still changes — the corpse frame is
      // static once the fall (and soul) have finished. The overlay is
      // front-and-center while this runs, so the hidden-tab rAF freeze
      // law doesn't bite; on unmount the loop is cancelled.
      if (!settled) raf = requestAnimationFrame(drawFrame);
    };
    drawFrame();
    return () => { disposed = true; cancelAnimationFrame(raf); };
  }, [sprite, pixelScale, withSoul]);
  return <canvas ref={canvasRef} className={className} style={{ imageRendering: 'pixelated' }} aria-hidden />;
};
