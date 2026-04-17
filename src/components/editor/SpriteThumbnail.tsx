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

export const SpriteThumbnail: React.FC<SpriteThumbnailProps> = ({ sprite, size = 64, className = '', previewType, noBackground = false, spriteScale = 1, bottomAlign = false, canvasStyle }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderTrigger, setRenderTrigger] = useState(0);

  // CSS display size AND canvas internal size are the same `size` value.
  // We intentionally DON'T multiply by devicePixelRatio — CSS scaling at
  // 1:1 means `image-rendering: pixelated` only has to handle the final
  // DPR-aware device rasterization, which browsers do cleanly with
  // nearest-neighbor at integer scales (1× → 1×, 2× → 2×, 3× → 3×).
  //
  // The key constraint: canvas internal == CSS size means browser scale
  // is 1.0 at the CSS step, which is trivially integer. Sprites drawn
  // inside the canvas use integer multiples of their source pixel size,
  // so there's no fractional scale at any step of the pipeline. This
  // eliminates the "half pixel" deformation where some source pixels
  // occupy 1 display pixel and others occupy 2.
  //
  // See docs/native-resolution-rendering-plan.md.
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

    // Canvas internal size matches CSS size (1:1). No DPR multiplication —
    // browsers handle DPR via the CSS → device rasterization with
    // `image-rendering: pixelated` enabling nearest-neighbor at integer
    // scales (which is what device DPR always provides).
    canvas.width = size;
    canvas.height = size;

    // Disable image smoothing for crisp pixel art rendering
    ctx.imageSmoothingEnabled = false;

    let animationFrameId: number | null = null;
    const uScale = sprite.universalScale ?? 1;

    // Helper to draw sprite frame with anchor/offset/scale support.
    //
    // Pixel-perfect rule: the sprite always draws at an INTEGER multiple
    // of its source pixel size. This guarantees every source pixel is the
    // same number of canvas pixels wide — no "half-pixel" deformation.
    //
    // The `sprite.size` / `spriteScale` / `uScale` / `sc` multipliers are
    // used to pick the target draw size, but we then snap to the nearest
    // integer source-scale multiple that fits. The sprite may end up
    // slightly smaller than a fractional scale would allow, but the pixels
    // are uniform.
    const drawSpriteFrame = (
      img: HTMLImageElement, frameIndex: number, frameCount: number,
      frameWidth: number, frameHeight: number,
      ax: number = 0.5, ay: number = 0.5, ox: number = 0, oy: number = 0,
      sc: number = 1
    ) => {
      ctx.clearRect(0, 0, size, size);
      const maxSize = (sprite.size || 0.6) * size * sc * uScale * spriteScale;
      const frameAspectRatio = frameWidth / frameHeight;

      // Target size from sprite configuration (may be fractional)
      let targetWidth = maxSize;
      let targetHeight = maxSize;
      if (frameAspectRatio > 1) {
        targetHeight = maxSize / frameAspectRatio;
      } else {
        targetWidth = maxSize * frameAspectRatio;
      }

      // Clamp to canvas bounds (spriteScale can push beyond canvas)
      if (targetWidth > size) {
        targetHeight *= size / targetWidth;
        targetWidth = size;
      }
      if (targetHeight > size) {
        targetWidth *= size / targetHeight;
        targetHeight = size;
      }

      // Snap to integer source-pixel-scale. Pick the NEAREST integer scale
      // to the target (Math.round, not Math.floor) so sprites render close
      // to the intended sprite.size fraction rather than snapping strictly
      // smaller. Clamped to whatever fits the canvas bounds — this prevents
      // overshoot from clipping off the edge.
      // Math.max(1, ...) ensures at least 1× for tiny sprites.
      const idealPixelScale = Math.max(1, Math.round(targetHeight / frameHeight));
      const maxScaleByCanvas = Math.max(1, Math.floor(size / Math.max(frameWidth, frameHeight)));
      const pixelScale = Math.min(idealPixelScale, maxScaleByCanvas);

      const drawWidth = frameWidth * pixelScale;
      const drawHeight = frameHeight * pixelScale;

      // Use Math.floor for sourceX so per-frame drift is one-directional when
      // frameWidth is fractional (imported sheets with non-divisible width).
      // This eliminates the oscillating sample-shift that causes animation wobble.
      const sourceX = Math.floor(frameIndex * frameWidth);
      const sw = Math.floor(frameWidth);
      const sh = Math.floor(frameHeight);
      const xPos = bottomAlign
        ? Math.round(size / 2 - drawWidth * 0.5)
        : Math.round(size / 2 - drawWidth * ax + ox);
      const yPos = bottomAlign
        ? Math.round(size - drawHeight)
        : Math.round(size / 2 - drawHeight * ay + oy);
      ctx.drawImage(img, sourceX, 0, sw, sh, xPos, yPos, drawWidth, drawHeight);
    };

    const renderThumbnail = () => {
      // Clear canvas (background is handled by CSS on parent div)
      ctx.clearRect(0, 0, size, size);

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
          const maxSize = (sprite.size || 0.6) * size * imgScale * uScale * spriteScale;
          const aspectRatio = img.width / img.height;

          // Target size from config (may be fractional)
          let targetWidth = maxSize;
          let targetHeight = maxSize;
          if (aspectRatio > 1) {
            targetHeight = maxSize / aspectRatio;
          } else {
            targetWidth = maxSize * aspectRatio;
          }

          // Clamp to canvas bounds
          if (targetWidth > size) {
            targetHeight *= size / targetWidth;
            targetWidth = size;
          }
          if (targetHeight > size) {
            targetWidth *= size / targetHeight;
            targetHeight = size;
          }

          // Integer-scale snap for pixel-perfect rendering. Use Math.round
          // for nearest integer to target (matches the bottomAlign path);
          // clamp to canvas-fit.
          const idealPixelScale = Math.max(1, Math.round(targetHeight / img.height));
          const maxScaleByCanvas = Math.max(1, Math.floor(size / Math.max(img.width, img.height)));
          const pixelScale = Math.min(idealPixelScale, maxScaleByCanvas);

          const drawWidth = img.width * pixelScale;
          const drawHeight = img.height * pixelScale;

          const xPos = bottomAlign
            ? Math.round(size / 2 - drawWidth * 0.5)
            : Math.round(size / 2 - drawWidth * imgAx + imgOx);
          const yPos = bottomAlign
            ? Math.round(size - drawHeight)
            : Math.round(size / 2 - drawHeight * imgAy + imgOy);
          ctx.drawImage(img, xPos, yPos, drawWidth, drawHeight);
        }
        // If image not ready yet, the subscription will trigger re-render when it loads
      } else {
        // Draw sprite using shapes (canvas-resolution coords)
        drawSprite(ctx, sprite, size / 2, size / 2, size);
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
        width={size}
        height={size}
        className="block"
        style={{ width: cssSize, height: cssSize, imageRendering: 'pixelated' as const, ...canvasStyle }}
      />
    </div>
  );
};
