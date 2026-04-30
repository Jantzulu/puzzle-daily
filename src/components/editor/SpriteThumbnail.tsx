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
}

export const SpriteThumbnail: React.FC<SpriteThumbnailProps> = ({ sprite, size = 64, className = '', previewType, noBackground = false, spriteScale = 1, bottomAlign = false, canvasStyle, pixelScale, fillWidth = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderTrigger, setRenderTrigger] = useState(0);
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);

  // Observe container width when fillWidth is enabled. Re-renders on resize
  // so the canvas's internal resolution tracks the parent's actual width.
  useEffect(() => {
    if (!fillWidth || !containerRef.current) return;
    const element = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) setMeasuredWidth(w);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fillWidth]);

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
    const uScale = sprite.universalScale ?? 1;

    // Helper to draw sprite frame with anchor/offset/scale support
    const drawSpriteFrame = (
      img: HTMLImageElement, frameIndex: number, frameCount: number,
      frameWidth: number, frameHeight: number,
      ax: number = 0.5, ay: number = 0.5, ox: number = 0, oy: number = 0,
      sc: number = 1
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
      } else {
        // Fit-to-box legacy path (preserved for backward compatibility).
        // Uses height as the reference dimension (matches the original
        // square-canvas behavior exactly when width === height).
        const legacySize = canvasHeightCSS;
        const maxSize = (sprite.size || 0.6) * legacySize * sc * uScale * spriteScale;
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

    const renderThumbnail = () => {
      // Clear canvas (background is handled by CSS on parent div)
      ctx.clearRect(0, 0, canvasWidthCSS, canvasHeightCSS);

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
      if (spriteSheetSrc && spriteSheet) {
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
          const aspectRatio = img.width / img.height;
          let drawWidth: number, drawHeight: number;

          if (pixelScale !== undefined) {
            // Explicit pixelScale mode — see drawSpriteFrame for rationale
            drawWidth = img.width * pixelScale;
            drawHeight = img.height * pixelScale;
          } else {
            const legacySize = canvasHeightCSS;
            const maxSize = (sprite.size || 0.6) * legacySize * imgScale * uScale * spriteScale;
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
  }, [sprite, size, previewType, spriteScale, bottomAlign, renderTrigger, pixelScale, fillWidth, canvasWidthCSS, canvasHeightCSS]);

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
    <div ref={containerRef} className={`rounded ${noBackground ? 'overflow-visible' : 'overflow-hidden'} ${className}`} style={backgroundStyle}>
      <canvas
        ref={canvasRef}
        className="block"
        style={{ width: cssWidth, height: cssHeight, imageRendering: 'pixelated' as const, ...canvasStyle }}
      />
    </div>
  );
};
