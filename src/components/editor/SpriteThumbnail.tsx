import React, { useEffect, useRef, useState } from 'react';
import type { CustomSprite, SpriteSheetConfig, SpriteDirection } from '../../utils/assetStorage';
import { resolveImageSource, resolveSpriteSheetSource } from '../../utils/assetStorage';
import { drawSprite } from './SpriteEditor';
import { getPreviewBgColor, getPreviewBgImageUrl, getPreviewBgTiled, type PreviewType } from '../../utils/themeAssets';
import { loadImage, isImageReady, subscribeToImageLoads } from '../../utils/imageLoader';
import { satellitesPaused } from '../game/frameProfiler';

// ─── Game-card animation helpers ───────────────────────────────────────────
// Drives the hero/enemy SELECTOR CARD sprites (opt-in via the `cardRole` prop).
// Default look is the SOUTH movement loop; selecting an unplaced hero plays a
// one-shot selectIntro then loops selectLoop; a placed hero shows the SOUTH idle
// loop. All other SpriteThumbnail callers (editors, compendium) are unaffected.

/** One resolved animation step for the card renderer. */
interface CardPhase {
  spriteSheet?: SpriteSheetConfig;
  imageSrc?: string;
  isSheet: boolean;
  anchorX: number; anchorY: number; offsetX: number; offsetY: number;
  loop: boolean;
}

/**
 * Resolve a single animation slot to a drawable phase. For the directional
 * slots (idle/moving) this honors the agreed south→default→simple fallback so a
 * sprite that only has a `default` variant still renders. The flat slots
 * (selectIntro/selectLoop) read the non-directional top-level fields. Returns
 * null when the slot has no sprite sheet or image configured.
 */
function resolveCardSlot(
  sprite: CustomSprite,
  slot: 'idle' | 'moving' | 'selectIntro' | 'selectLoop',
  loop: boolean,
): CardPhase | null {
  const directional = slot === 'idle' || slot === 'moving';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates: Array<Record<string, any>> = [];
  if (directional && sprite.useDirectional && sprite.directionalSprites) {
    const south = sprite.directionalSprites['s' as SpriteDirection];
    const def = sprite.directionalSprites['default' as SpriteDirection];
    if (south) candidates.push(south);
    if (def) candidates.push(def);
  }
  candidates.push(sprite); // simple/top-level fields (and where the flat slots live)

  for (const src of candidates) {
    const sheet: SpriteSheetConfig | undefined = src[`${slot}SpriteSheet`];
    const sheetSrc = resolveSpriteSheetSource(sheet);
    if (sheet && sheetSrc) {
      return {
        spriteSheet: sheet, imageSrc: sheetSrc, isSheet: true,
        anchorX: sheet.anchorX ?? 0.5, anchorY: sheet.anchorY ?? 0.5,
        offsetX: sheet.offsetX ?? 0, offsetY: sheet.offsetY ?? 0, loop,
      };
    }
    // Only the idle slot may fall back to the legacy imageData/imageUrl fields.
    const legacyData = slot === 'idle' ? src.imageData : undefined;
    const legacyUrl = slot === 'idle' ? src.imageUrl : undefined;
    const imgSrc = resolveImageSource(src[`${slot}ImageData`] ?? legacyData, src[`${slot}ImageUrl`] ?? legacyUrl);
    if (imgSrc) {
      return {
        imageSrc: imgSrc, isSheet: false,
        anchorX: src[`${slot}AnchorX`] ?? 0.5, anchorY: src[`${slot}AnchorY`] ?? 0.5,
        offsetX: src[`${slot}OffsetX`] ?? 0, offsetY: src[`${slot}OffsetY`] ?? 0, loop,
      };
    }
  }
  return null;
}

/**
 * Build the ordered phase queue for a card given its state. Enemies and the
 * default/placed states are a single looping phase; a selected unplaced hero is
 * a one-shot selectIntro followed by a looping selectLoop (each skipped if
 * absent, with sensible fallbacks).
 */
function buildCardPhases(
  sprite: CustomSprite,
  role: 'hero' | 'enemy',
  selected: boolean,
  placed: boolean,
): CardPhase[] {
  const southMoveOrIdle = () => resolveCardSlot(sprite, 'moving', true) || resolveCardSlot(sprite, 'idle', true);

  if (role === 'enemy') {
    const p = southMoveOrIdle();
    return p ? [p] : [];
  }
  // hero
  if (placed) {
    const idle = resolveCardSlot(sprite, 'idle', true) || resolveCardSlot(sprite, 'moving', true);
    return idle ? [idle] : [];
  }
  if (selected) {
    const intro = resolveCardSlot(sprite, 'selectIntro', false);
    const loopP = resolveCardSlot(sprite, 'selectLoop', true);
    if (intro && loopP) return [intro, loopP];
    if (loopP) return [loopP];
    if (intro) return [{ ...intro, loop: true }]; // only an intro set → loop it rather than freeze
    const base = southMoveOrIdle(); // no select anims → just keep the default look
    return base ? [base] : [];
  }
  const base = southMoveOrIdle();
  return base ? [base] : [];
}

interface SpriteThumbnailProps {
  sprite?: CustomSprite;
  size?: number;
  className?: string;
  /** Type of preview background: 'entity' for heroes/enemies, 'asset' for tiles/items/enchantments */
  previewType?: PreviewType;
  /** If true, renders with transparent background (no bgColor/bgImage) */
  noBackground?: boolean;
  /** Multiplier for sprite draw size within the canvas (default 1). Use >1 to fill more of the canvas. */
  spriteScale?: number;
  /** If true, sizes sprites by height and bottom-aligns them (consistent entity heights, feet line up) */
  bottomAlign?: boolean;
  /** Extra styles applied directly to the canvas element (e.g. filter/glow effects) */
  canvasStyle?: React.CSSProperties;
  /**
   * If set, renders the sprite at `nativeDimensions × pixelScale` — integer,
   * pixel-perfect. Bypasses all fit-to-box / sprite.size / spriteScale math;
   * the sprite's native pixel dimensions are the only thing that matters for
   * size, and each native pixel becomes exactly `pixelScale` display pixels.
   *
   * Use this for contexts (like hero/enemy selector cards) where you want
   * "all sprites magnified by the same factor, taller native sprites appear
   * taller in the UI." When unset, the sprite is sized by the existing
   * fit-to-box rules — preserved for backward compatibility with callers
   * that want target-size-based rendering.
   */
  pixelScale?: number;
  /**
   * If true, the sprite is scaled to fill its icon box: the native frame is
   * contain-fit to the canvas (largest scale that fits, with a small margin),
   * independent of `sprite.size`/`spriteScale` and the legacy 0.6 factor.
   *
   * Use this for asset-editor list thumbnails where the goal is a readable,
   * well-filled icon for every sprite regardless of native resolution — NOT
   * board-faithful sizing (that's `pixelScale`). Ignored when `pixelScale` is
   * set. Unlike the legacy fit-to-box path, this never depends on the removed
   * `sprite.size` knob, so entities can't render tiny.
   */
  fillBox?: boolean;
  /**
   * If true, the canvas stretches horizontally to fill its container's width
   * (measured via ResizeObserver). The `size` prop controls the CANVAS HEIGHT
   * only in this mode — the canvas is rectangular, width = parent width,
   * height = `size`.
   *
   * Use this for card-style layouts where you want sprites to have room to
   * render at their full native width (up to the card width) without
   * horizontal clipping, and the card row shares a uniform sprite-area
   * height based on the tallest entity.
   */
  fillWidth?: boolean;
  /**
   * Opt-in to game-card animation behavior (see the card-animation helpers at
   * the top of this file). When set, the sprite renders its SOUTH movement loop
   * by default instead of the static idle/default look. 'hero' cards also react
   * to `cardSelected` (selectIntro → selectLoop) and `cardPlaced` (south idle
   * loop). Leave unset for editor/compendium previews to keep their idle look.
   */
  cardRole?: 'hero' | 'enemy';
  /** Hero card is currently selected for placement (ignored once placed). */
  cardSelected?: boolean;
  /** Hero card has been placed on the board (shows the south idle loop). */
  cardPlaced?: boolean;
}

export const SpriteThumbnail: React.FC<SpriteThumbnailProps> = ({ sprite, size = 64, className = '', previewType, noBackground = false, spriteScale = 1, bottomAlign = false, canvasStyle, pixelScale, fillBox = false, fillWidth = false, cardRole, cardSelected = false, cardPlaced = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [renderTrigger, setRenderTrigger] = useState(0);
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);

  // Observe container width when fillWidth is enabled. Re-renders on resize
  // so the canvas's internal resolution tracks the parent's actual width.
  // Keyed on the element (callback ref), not mount: when the sprite loads
  // async the first render is the no-sprite placeholder with no container,
  // and a mount-only effect would never attach the observer.
  useEffect(() => {
    if (!fillWidth || !containerEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) setMeasuredWidth(w);
      }
    });
    observer.observe(containerEl);
    return () => observer.disconnect();
  }, [fillWidth, containerEl]);

  // Effective canvas dimensions (CSS pixels).
  // fillWidth: width tracks parent; height is `size`. Non-fillWidth: both equal `size`.
  const canvasWidthCSS = fillWidth ? (measuredWidth ?? size) : size;
  const canvasHeightCSS = size;

  // Snap CSS display size to match canvas resolution / dpr exactly (prevents sub-pixel stretching on mobile)
  const dprForCss = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const cssWidth = fillWidth ? '100%' : Math.round(canvasWidthCSS * dprForCss) / dprForCss;
  const cssHeight = Math.round(canvasHeightCSS * dprForCss) / dprForCss;

  useEffect(() => {
    // Subscribe to image load events to re-render when images finish loading
    const unsubscribe = subscribeToImageLoads(() => {
      setRenderTrigger(prev => prev + 1);
    });

    // Schedule a re-render shortly after mount to catch images that loaded
    // synchronously or from browser cache before the subscription was active.
    // Without this, thumbnails can appear blank on first navigation to the page.
    const timerId = setTimeout(() => {
      setRenderTrigger(prev => prev + 1);
    }, 100);

    return () => {
      unsubscribe();
      clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprite) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Account for device pixel ratio for sharp rendering on high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const canvasResW = Math.round(canvasWidthCSS * dpr);
    const canvasResH = Math.round(canvasHeightCSS * dpr);

    // Set canvas internal size to rounded resolution (prevents sub-pixel mismatch with CSS)
    canvas.width = canvasResW;
    canvas.height = canvasResH;

    // Scale context to match
    ctx.scale(dpr, dpr);

    // Disable image smoothing for crisp pixel art rendering
    ctx.imageSmoothingEnabled = false;

    let animationFrameId: number | null = null;

    // Helper to draw sprite frame with anchor/offset support
    const drawSpriteFrame = (
      img: HTMLImageElement, frameIndex: number, frameCount: number,
      frameWidth: number, frameHeight: number,
      ax: number = 0.5, ay: number = 0.5, ox: number = 0, oy: number = 0
    ) => {
      ctx.clearRect(0, 0, canvasWidthCSS, canvasHeightCSS);
      const frameAspectRatio = frameWidth / frameHeight;
      let drawWidth: number, drawHeight: number;

      if (pixelScale !== undefined) {
        // Explicit pixelScale mode — render at exact integer multiples of
        // the sprite's native frame dimensions. Pixel-perfect; sprite.size,
        // spriteScale, uScale, sc are all IGNORED. The sprite fills exactly
        // frameWidth*pixelScale × frameHeight*pixelScale canvas pixels, may
        // extend beyond canvas bounds (canvas will clip naturally).
        drawWidth = frameWidth * pixelScale;
        drawHeight = frameHeight * pixelScale;
      } else if (fillBox) {
        // Fill-the-icon: contain-fit the native frame to the canvas with a
        // small margin. Independent of sprite.size, so entities never render
        // tiny; fractional scale is fine here (smoothing is off).
        const FILL_PAD = 0.9;
        const fit = Math.min(canvasWidthCSS / frameWidth, canvasHeightCSS / frameHeight) * FILL_PAD;
        drawWidth = Math.round(frameWidth * fit);
        drawHeight = Math.round(frameHeight * fit);
      } else {
        // Fit-to-box legacy path (preserved for backward compatibility).
        // Uses height as the reference dimension (matches the original
        // square-canvas behavior exactly when width === height).
        const legacySize = canvasHeightCSS;
        const maxSize = (sprite.size || 0.6) * legacySize * spriteScale;
        if (bottomAlign) {
          drawWidth = maxSize;
          drawHeight = maxSize;
          if (frameAspectRatio > 1) {
            drawHeight = maxSize / frameAspectRatio;
          } else {
            drawWidth = maxSize * frameAspectRatio;
          }
          // Clamp to canvas bounds (spriteScale can push beyond canvas)
          if (drawWidth > canvasWidthCSS) {
            drawHeight *= canvasWidthCSS / drawWidth;
            drawWidth = canvasWidthCSS;
          }
          if (drawHeight > canvasHeightCSS) {
            drawWidth *= canvasHeightCSS / drawHeight;
            drawHeight = canvasHeightCSS;
          }
          drawWidth = Math.round(drawWidth);
          drawHeight = Math.round(drawHeight);
        } else {
          drawWidth = maxSize;
          drawHeight = maxSize;
          if (frameAspectRatio > 1) {
            drawHeight = maxSize / frameAspectRatio;
          } else {
            drawWidth = maxSize * frameAspectRatio;
          }
          // Integer-multiple scaling for crisp pixel art
          const idealPixelScale = Math.max(1, Math.round(drawWidth / frameWidth));
          const maxFitScale = Math.max(1, Math.floor(Math.min(canvasWidthCSS, canvasHeightCSS) / Math.max(frameWidth, frameHeight)));
          const fittedPixelScale = Math.min(idealPixelScale, maxFitScale);
          drawWidth = frameWidth * fittedPixelScale;
          drawHeight = frameHeight * fittedPixelScale;
        }
      }

      const sourceX = Math.round(frameIndex * frameWidth);
      const sw = Math.round(frameWidth);
      const sh = Math.round(frameHeight);
      const xPos = bottomAlign
        ? Math.round(canvasWidthCSS / 2 - drawWidth * 0.5)
        : Math.round(canvasWidthCSS / 2 - drawWidth * ax + ox);
      const yPos = bottomAlign
        ? Math.round(canvasHeightCSS - drawHeight)
        : Math.round(canvasHeightCSS / 2 - drawHeight * ay + oy);
      ctx.drawImage(img, sourceX, 0, sw, sh, xPos, yPos, drawWidth, drawHeight);
    };

    // Game-card animation path (opt-in via `cardRole`). Runs a phase queue:
    // each non-looping phase plays once then advances; the final phase loops.
    if (cardRole) {
      const phases = buildCardPhases(sprite, cardRole, cardSelected, cardPlaced);
      if (phases.length === 0) {
        // No usable animation — fall back to the shape rendering.
        ctx.clearRect(0, 0, canvasWidthCSS, canvasHeightCSS);
        drawSprite(ctx, sprite, canvasWidthCSS / 2, canvasHeightCSS / 2, canvasHeightCSS);
        return;
      }
      const STATIC_PHASE_MS = 600; // how long a static (non-sheet) one-shot phase shows before advancing
      let phaseIndex = 0;
      let phaseStart = Date.now();
      // Only touch the canvas when (phase, frame) actually changes — card
      // sprites animate at ~4-12fps, so repainting every rAF kept this
      // layer dirty at 60Hz for the compositor (multiplied across every
      // visible card, a real mobile frame-budget cost). Pixel-identical.
      let lastDrawnPhase = -1;
      let lastDrawnFrame = -1;
      const animateCard = () => {
        const now = Date.now();
        const phase = phases[phaseIndex];
        const img = phase.imageSrc ? loadImage(phase.imageSrc) : null;
        if (!img || !isImageReady(img)) {
          // Image still loading — wait; the imageLoads subscription re-runs this effect.
          animationFrameId = requestAnimationFrame(animateCard);
          return;
        }
        const isSheet = !!(phase.isSheet && phase.spriteSheet);
        const frameCount = isSheet ? (phase.spriteSheet!.frameCount || 4) : 1;
        const frameRate = isSheet ? (phase.spriteSheet!.frameRate || 10) : 1;
        const frameWidth = isSheet ? (phase.spriteSheet!.frameWidth || img.width / frameCount) : img.width;
        const frameHeight = isSheet ? (phase.spriteSheet!.frameHeight || img.height) : img.height;
        const frameDuration = 1000 / frameRate;
        const elapsed = now - phaseStart;
        const phaseDuration = isSheet ? frameCount * frameDuration : STATIC_PHASE_MS;

        // Advance to the next phase once a non-looping phase has played through.
        if (!phase.loop && phaseIndex < phases.length - 1 && elapsed >= phaseDuration) {
          phaseIndex++;
          phaseStart = now;
          animationFrameId = requestAnimationFrame(animateCard);
          return;
        }

        let frameIndex = 0;
        if (isSheet) {
          frameIndex = Math.floor(elapsed / frameDuration);
          if (frameIndex >= frameCount) frameIndex = phase.loop ? frameIndex % frameCount : frameCount - 1;
        }
        if ((phaseIndex !== lastDrawnPhase || frameIndex !== lastDrawnFrame) && !satellitesPaused()) {
          lastDrawnPhase = phaseIndex;
          lastDrawnFrame = frameIndex;
          drawSpriteFrame(img, frameIndex, frameCount, frameWidth, frameHeight, phase.anchorX, phase.anchorY, phase.offsetX, phase.offsetY);
        }
        animationFrameId = requestAnimationFrame(animateCard);
      };
      animateCard();
      return () => {
        if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      };
    }

    const renderThumbnail = () => {
      // Clear canvas (background is handled by CSS on parent div)
      ctx.clearRect(0, 0, canvasWidthCSS, canvasHeightCSS);

      // Determine what to render based on sprite mode
      let spriteSheet = null;
      let imageSrc: string | undefined = undefined;
      // Anchor/offset for idle image (spritesheets have anchor+offset built-in)
      let imgAx = 0.5, imgAy = 0.5, imgOx = 0, imgOy = 0;

      if (sprite.useDirectional && sprite.directionalSprites?.default) {
        // Directional mode - use default direction
        const defaultConfig = sprite.directionalSprites.default;
        spriteSheet = defaultConfig.idleSpriteSheet;
        imageSrc = resolveImageSource(
          defaultConfig.idleImageData || defaultConfig.imageData,
          defaultConfig.idleImageUrl || defaultConfig.imageUrl
        );
        imgAx = defaultConfig.idleAnchorX ?? 0.5;
        imgAy = defaultConfig.idleAnchorY ?? 0.5;
        imgOx = defaultConfig.idleOffsetX ?? 0;
        imgOy = defaultConfig.idleOffsetY ?? 0;
      } else {
        // Simple mode
        spriteSheet = sprite.idleSpriteSheet;
        imageSrc = resolveImageSource(
          sprite.idleImageData || sprite.imageData,
          sprite.idleImageUrl || sprite.imageUrl
        );
        imgAx = sprite.idleAnchorX ?? 0.5;
        imgAy = sprite.idleAnchorY ?? 0.5;
        imgOx = sprite.idleOffsetX ?? 0;
        imgOy = sprite.idleOffsetY ?? 0;
      }

      // Resolve sprite sheet source (supports both data and URL)
      const spriteSheetSrc = resolveSpriteSheetSource(spriteSheet);

      // Priority: sprite sheet > static image > shapes
      if (spriteSheetSrc && spriteSheet) {
        // Anchor/scale from spritesheet
        const sheetAx = spriteSheet.anchorX ?? 0.5;
        const sheetAy = spriteSheet.anchorY ?? 0.5;
        const sheetOx = spriteSheet.offsetX ?? 0;
        const sheetOy = spriteSheet.offsetY ?? 0;

        // Use centralized image loader with caching
        const img = loadImage(spriteSheetSrc);
        if (img && isImageReady(img)) {
          let frameIndex = 0;
          const frameCount = spriteSheet.frameCount || 4;
          const frameRate = spriteSheet.frameRate || 10;
          const frameDuration = 1000 / frameRate;
          let lastFrameTime = Date.now();
          const frameWidth = spriteSheet.frameWidth || img.width / frameCount;
          const frameHeight = spriteSheet.frameHeight || img.height;

          // Only touch the canvas when the frame index actually changes —
          // see the card path above; identical repaints kept every animated
          // thumbnail dirty at 60Hz for the compositor.
          let lastDrawnFrame = -1;
          const animate = () => {
            const now = Date.now();

            // Update frame if enough time has passed
            if (now - lastFrameTime >= frameDuration) {
              frameIndex++;
              if (frameIndex >= frameCount) {
                frameIndex = spriteSheet.loop !== false ? 0 : frameCount - 1;
              }
              lastFrameTime = now;
            }

            if (frameIndex !== lastDrawnFrame && !satellitesPaused()) {
              lastDrawnFrame = frameIndex;
              drawSpriteFrame(img, frameIndex, frameCount, frameWidth, frameHeight, sheetAx, sheetAy, sheetOx, sheetOy);
            }
            animationFrameId = requestAnimationFrame(animate);
          };

          animate();
        }
        // If image not ready yet, the subscription will trigger re-render when it loads
      } else if (imageSrc) {
        // Use centralized image loader with caching
        const img = loadImage(imageSrc);
        if (img && isImageReady(img)) {
          const aspectRatio = img.width / img.height;
          let drawWidth: number, drawHeight: number;

          if (pixelScale !== undefined) {
            // Explicit pixelScale mode — see drawSpriteFrame for rationale
            drawWidth = img.width * pixelScale;
            drawHeight = img.height * pixelScale;
          } else if (fillBox) {
            // Fill-the-icon: contain-fit to the canvas (see drawSpriteFrame).
            const FILL_PAD = 0.9;
            const fit = Math.min(canvasWidthCSS / img.width, canvasHeightCSS / img.height) * FILL_PAD;
            drawWidth = Math.round(img.width * fit);
            drawHeight = Math.round(img.height * fit);
          } else {
            const legacySize = canvasHeightCSS;
            const maxSize = (sprite.size || 0.6) * legacySize * spriteScale;
            if (bottomAlign) {
              drawWidth = maxSize;
              drawHeight = maxSize;
              if (aspectRatio > 1) {
                drawHeight = maxSize / aspectRatio;
              } else {
                drawWidth = maxSize * aspectRatio;
              }
              // Clamp to canvas bounds (spriteScale can push beyond canvas)
              if (drawWidth > canvasWidthCSS) {
                drawHeight *= canvasWidthCSS / drawWidth;
                drawWidth = canvasWidthCSS;
              }
              if (drawHeight > canvasHeightCSS) {
                drawWidth *= canvasHeightCSS / drawHeight;
                drawHeight = canvasHeightCSS;
              }
              drawWidth = Math.round(drawWidth);
              drawHeight = Math.round(drawHeight);
            } else {
              drawWidth = maxSize;
              drawHeight = maxSize;
              if (aspectRatio > 1) {
                drawHeight = maxSize / aspectRatio;
              } else {
                drawWidth = maxSize * aspectRatio;
              }
              const idealPixelScale = Math.max(1, Math.round(drawWidth / img.width));
              const maxFitScale = Math.max(1, Math.floor(Math.min(canvasWidthCSS, canvasHeightCSS) / Math.max(img.width, img.height)));
              const fittedPixelScale = Math.min(idealPixelScale, maxFitScale);
              drawWidth = img.width * fittedPixelScale;
              drawHeight = img.height * fittedPixelScale;
            }
          }

          const xPos = bottomAlign
            ? Math.round(canvasWidthCSS / 2 - drawWidth * 0.5)
            : Math.round(canvasWidthCSS / 2 - drawWidth * imgAx + imgOx);
          const yPos = bottomAlign
            ? Math.round(canvasHeightCSS - drawHeight)
            : Math.round(canvasHeightCSS / 2 - drawHeight * imgAy + imgOy);
          ctx.drawImage(img, xPos, yPos, drawWidth, drawHeight);
        }
        // If image not ready yet, the subscription will trigger re-render when it loads
      } else {
        // Draw sprite using shapes (uses height as reference dimension)
        drawSprite(ctx, sprite, canvasWidthCSS / 2, canvasHeightCSS / 2, canvasHeightCSS);
      }
    };

    renderThumbnail();

    // Cleanup animation on unmount
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [sprite, size, previewType, spriteScale, bottomAlign, renderTrigger, pixelScale, fillBox, fillWidth, canvasWidthCSS, canvasHeightCSS, cardRole, cardSelected, cardPlaced]);

  if (!sprite) {
    return (
      <div
        className={`bg-stone-700 rounded flex items-center justify-center ${className}`}
        style={{ width: cssWidth, height: cssHeight }}
      >
        <span className="text-stone-500 text-xs">No Sprite</span>
      </div>
    );
  }

  // Use CSS background instead of canvas drawing to avoid CORS issues on mobile
  const bgColor = getPreviewBgColor(previewType);
  const bgImageUrl = getPreviewBgImageUrl(previewType);
  const bgTiled = getPreviewBgTiled(previewType);

  const backgroundStyle: React.CSSProperties = {
    width: cssWidth,
    height: cssHeight,
    ...(noBackground ? {} : {
      backgroundColor: bgColor,
      ...(bgImageUrl && {
        backgroundImage: `url(${bgImageUrl})`,
        backgroundSize: bgTiled ? 'auto' : 'cover',
        backgroundRepeat: bgTiled ? 'repeat' : 'no-repeat',
        backgroundPosition: 'center',
      }),
    }),
  };

  return (
    <div ref={setContainerEl} className={`rounded ${noBackground ? 'overflow-visible' : 'overflow-hidden'} ${className}`} style={backgroundStyle}>
      <canvas
        ref={canvasRef}
        className="block"
        style={{ width: cssWidth, height: cssHeight, imageRendering: 'pixelated' as const, ...canvasStyle }}
      />
    </div>
  );
};
