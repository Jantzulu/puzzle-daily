import React, { useEffect, useRef, useState } from 'react';
import type { CustomSprite } from '../../utils/assetStorage';
import { resolveImageSource, resolveSpriteSheetSource } from '../../utils/assetStorage';
import { drawSprite } from './SpriteEditor';
import { getPreviewBgColor, getPreviewBgImageUrl, getPreviewBgTiled, type PreviewType } from '../../utils/themeAssets';
import { loadImage, isImageReady, subscribeToImageLoads } from '../../utils/imageLoader';

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
}

/**
 * Native pixel resolution of the thumbnail canvas. The canvas's internal
 * buffer is sized to this number (NOT multiplied by devicePixelRatio), and
 * CSS + `image-rendering: pixelated` handles upscaling to the display size.
 *
 * This is Phase 1 of the native-resolution rendering refactor (see
 * docs/native-resolution-rendering-plan.md). By rendering at a fixed small
 * buffer and scaling uniformly, we get:
 *  - Consistent output across 1× / 2× / 3× DPR displays (browser handles final scale)
 *  - No DPR-dependent double-scaling chain
 *  - Whatever rounding happens inside the canvas happens ONCE, at native scale
 *
 * Chosen to match TILE_SIZE conceptually so sprite.size fractions produce
 * the same visual proportions as the game board.
 */
const NATIVE_THUMBNAIL_SIZE = 48;

export const SpriteThumbnail: React.FC<SpriteThumbnailProps> = ({ sprite, size = 64, className = '', previewType, noBackground = false, spriteScale = 1, bottomAlign = false, canvasStyle }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderTrigger, setRenderTrigger] = useState(0);

  // CSS display size for the thumbnail container. The canvas's internal
  // buffer is fixed at NATIVE_THUMBNAIL_SIZE × NATIVE_THUMBNAIL_SIZE; CSS
  // scales it to `size`. Integer CSS multiples (48, 96, 144) give the
  // crispest result, but `image-rendering: pixelated` handles any scale.
  const cssSize = size;

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

    // Set canvas internal size to native resolution. No DPR multiplication —
    // CSS handles the display scale uniformly. This eliminates per-DPR
    // rounding differences and lets `image-rendering: pixelated` produce
    // consistent output on 1×, 2×, 3× screens.
    canvas.width = NATIVE_THUMBNAIL_SIZE;
    canvas.height = NATIVE_THUMBNAIL_SIZE;

    // Disable image smoothing for crisp pixel art rendering
    ctx.imageSmoothingEnabled = false;

    let animationFrameId: number | null = null;
    const uScale = sprite.universalScale ?? 1;

    // Helper to draw sprite frame with anchor/offset/scale support.
    // All draw math operates in NATIVE pixel coords (the canvas buffer).
    // CSS scales the whole canvas uniformly to display size.
    const drawSpriteFrame = (
      img: HTMLImageElement, frameIndex: number, frameCount: number,
      frameWidth: number, frameHeight: number,
      ax: number = 0.5, ay: number = 0.5, ox: number = 0, oy: number = 0,
      sc: number = 1
    ) => {
      ctx.clearRect(0, 0, NATIVE_THUMBNAIL_SIZE, NATIVE_THUMBNAIL_SIZE);
      const maxSize = (sprite.size || 0.6) * NATIVE_THUMBNAIL_SIZE * sc * uScale * spriteScale;
      const frameAspectRatio = frameWidth / frameHeight;
      let drawWidth: number, drawHeight: number;

      if (bottomAlign) {
        // Same bounding-box sizing as game board for proportional consistency
        drawWidth = maxSize;
        drawHeight = maxSize;
        if (frameAspectRatio > 1) {
          drawHeight = maxSize / frameAspectRatio;
        } else {
          drawWidth = maxSize * frameAspectRatio;
        }
        // Clamp to canvas bounds (spriteScale can push beyond canvas)
        if (drawWidth > NATIVE_THUMBNAIL_SIZE) {
          drawHeight *= NATIVE_THUMBNAIL_SIZE / drawWidth;
          drawWidth = NATIVE_THUMBNAIL_SIZE;
        }
        if (drawHeight > NATIVE_THUMBNAIL_SIZE) {
          drawWidth *= NATIVE_THUMBNAIL_SIZE / drawHeight;
          drawHeight = NATIVE_THUMBNAIL_SIZE;
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
        // Snap to integer multiples of source pixel size for crisp pixel art
        const idealPixelScale = Math.max(1, Math.round(drawWidth / frameWidth));
        const maxFitScale = Math.max(1, Math.floor(NATIVE_THUMBNAIL_SIZE / Math.max(frameWidth, frameHeight)));
        const pixelScale = Math.min(idealPixelScale, maxFitScale);
        drawWidth = frameWidth * pixelScale;
        drawHeight = frameHeight * pixelScale;
      }

      // Use Math.floor for sourceX so per-frame drift is one-directional when
      // frameWidth is fractional (imported sheets with non-divisible width).
      // This eliminates the oscillating sample-shift that causes animation wobble.
      const sourceX = Math.floor(frameIndex * frameWidth);
      const sw = Math.floor(frameWidth);
      const sh = Math.floor(frameHeight);
      const xPos = bottomAlign
        ? Math.round(NATIVE_THUMBNAIL_SIZE / 2 - drawWidth * 0.5)
        : Math.round(NATIVE_THUMBNAIL_SIZE / 2 - drawWidth * ax + ox);
      const yPos = bottomAlign
        ? Math.round(NATIVE_THUMBNAIL_SIZE - drawHeight)
        : Math.round(NATIVE_THUMBNAIL_SIZE / 2 - drawHeight * ay + oy);
      ctx.drawImage(img, sourceX, 0, sw, sh, xPos, yPos, drawWidth, drawHeight);
    };

    const renderThumbnail = () => {
      // Clear canvas (background is handled by CSS on parent div)
      ctx.clearRect(0, 0, NATIVE_THUMBNAIL_SIZE, NATIVE_THUMBNAIL_SIZE);

      // Determine what to render based on sprite mode
      let spriteSheet = null;
      let imageSrc: string | undefined = undefined;
      // Anchor/offset/scale for idle image (spritesheets have anchor+scale built-in)
      let imgAx = 0.5, imgAy = 0.5, imgOx = 0, imgOy = 0, imgScale = 1;

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
        imgScale = defaultConfig.idleScale ?? 1;
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
        imgScale = sprite.idleScale ?? 1;
      }

      // Resolve sprite sheet source (supports both data and URL)
      const spriteSheetSrc = resolveSpriteSheetSource(spriteSheet);

      // Priority: sprite sheet > static image > shapes
      if (spriteSheetSrc) {
        // Anchor/scale from spritesheet
        const sheetAx = spriteSheet.anchorX ?? 0.5;
        const sheetAy = spriteSheet.anchorY ?? 0.5;
        const sheetOx = spriteSheet.offsetX ?? 0;
        const sheetOy = spriteSheet.offsetY ?? 0;
        const sheetScale = spriteSheet.scale ?? 1;

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

            drawSpriteFrame(img, frameIndex, frameCount, frameWidth, frameHeight, sheetAx, sheetAy, sheetOx, sheetOy, sheetScale);
            animationFrameId = requestAnimationFrame(animate);
          };

          animate();
        }
        // If image not ready yet, the subscription will trigger re-render when it loads
      } else if (imageSrc) {
        // Use centralized image loader with caching
        const img = loadImage(imageSrc);
        if (img && isImageReady(img)) {
          const maxSize = (sprite.size || 0.6) * NATIVE_THUMBNAIL_SIZE * imgScale * uScale * spriteScale;
          const aspectRatio = img.width / img.height;
          let drawWidth: number, drawHeight: number;

          if (bottomAlign) {
            // Same bounding-box sizing as game board for proportional consistency
            drawWidth = maxSize;
            drawHeight = maxSize;
            if (aspectRatio > 1) {
              drawHeight = maxSize / aspectRatio;
            } else {
              drawWidth = maxSize * aspectRatio;
            }
            // Clamp to canvas bounds (spriteScale can push beyond canvas)
            if (drawWidth > NATIVE_THUMBNAIL_SIZE) {
              drawHeight *= NATIVE_THUMBNAIL_SIZE / drawWidth;
              drawWidth = NATIVE_THUMBNAIL_SIZE;
            }
            if (drawHeight > NATIVE_THUMBNAIL_SIZE) {
              drawWidth *= NATIVE_THUMBNAIL_SIZE / drawHeight;
              drawHeight = NATIVE_THUMBNAIL_SIZE;
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
            const maxFitScale = Math.max(1, Math.floor(NATIVE_THUMBNAIL_SIZE / Math.max(img.width, img.height)));
            const pixelScale = Math.min(idealPixelScale, maxFitScale);
            drawWidth = img.width * pixelScale;
            drawHeight = img.height * pixelScale;
          }

          const xPos = bottomAlign
            ? Math.round(NATIVE_THUMBNAIL_SIZE / 2 - drawWidth * 0.5)
            : Math.round(NATIVE_THUMBNAIL_SIZE / 2 - drawWidth * imgAx + imgOx);
          const yPos = bottomAlign
            ? Math.round(NATIVE_THUMBNAIL_SIZE - drawHeight)
            : Math.round(NATIVE_THUMBNAIL_SIZE / 2 - drawHeight * imgAy + imgOy);
          ctx.drawImage(img, xPos, yPos, drawWidth, drawHeight);
        }
        // If image not ready yet, the subscription will trigger re-render when it loads
      } else {
        // Draw sprite using shapes (native-resolution coords)
        drawSprite(ctx, sprite, NATIVE_THUMBNAIL_SIZE / 2, NATIVE_THUMBNAIL_SIZE / 2, NATIVE_THUMBNAIL_SIZE);
      }
    };

    renderThumbnail();

    // Cleanup animation on unmount
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [sprite, size, previewType, spriteScale, bottomAlign, renderTrigger]);

  if (!sprite) {
    return (
      <div
        className={`bg-stone-700 rounded flex items-center justify-center ${className}`}
        style={{ width: cssSize, height: cssSize }}
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
    width: cssSize,
    height: cssSize,
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
    <div className={`rounded ${noBackground ? 'overflow-visible' : 'overflow-hidden'} ${className}`} style={backgroundStyle}>
      <canvas
        ref={canvasRef}
        width={NATIVE_THUMBNAIL_SIZE}
        height={NATIVE_THUMBNAIL_SIZE}
        className="block"
        style={{ width: cssSize, height: cssSize, imageRendering: 'pixelated' as const, ...canvasStyle }}
      />
    </div>
  );
};
