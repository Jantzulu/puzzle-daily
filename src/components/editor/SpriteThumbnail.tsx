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
}

export const SpriteThumbnail: React.FC<SpriteThumbnailProps> = ({ sprite, size = 64, className = '', previewType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderTrigger, setRenderTrigger] = useState(0);

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
    const scaledSize = size * dpr;

    // Set canvas internal size to scaled size
    canvas.width = scaledSize;
    canvas.height = scaledSize;

    // Scale context to match
    ctx.scale(dpr, dpr);

    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    let animationFrameId: number | null = null;

    // Helper to draw sprite frame with anchor/offset/scale support
    const drawSpriteFrame = (
      img: HTMLImageElement, frameIndex: number, frameCount: number,
      frameWidth: number, frameHeight: number,
      ax: number = 0.5, ay: number = 0.5, ox: number = 0, oy: number = 0,
      sc: number = 1
    ) => {
      ctx.clearRect(0, 0, size, size);
      const maxSize = (sprite.size || 0.6) * size * sc;
      const frameAspectRatio = frameWidth / frameHeight;
      let drawWidth = maxSize;
      let drawHeight = maxSize;

      if (frameAspectRatio > 1) {
        drawHeight = maxSize / frameAspectRatio;
      } else {
        drawWidth = maxSize * frameAspectRatio;
      }

      const sourceX = frameIndex * frameWidth;
      ctx.drawImage(
        img,
        sourceX, 0, frameWidth, frameHeight,
        size/2 - drawWidth * ax + ox, size/2 - drawHeight * ay + oy, drawWidth, drawHeight
      );
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
          const maxSize = (sprite.size || 0.6) * size * imgScale;
          const aspectRatio = img.width / img.height;
          let drawWidth = maxSize;
          let drawHeight = maxSize;

          if (aspectRatio > 1) {
            drawHeight = maxSize / aspectRatio;
          } else {
            drawWidth = maxSize * aspectRatio;
          }

          ctx.drawImage(img, size/2 - drawWidth * imgAx + imgOx, size/2 - drawHeight * imgAy + imgOy, drawWidth, drawHeight);
        }
        // If image not ready yet, the subscription will trigger re-render when it loads
      } else {
        // Draw sprite using shapes
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
  }, [sprite, size, previewType, renderTrigger]);

  if (!sprite) {
    return (
      <div
        className={`bg-stone-700 rounded flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
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
    width: size,
    height: size,
    backgroundColor: bgColor,
    ...(bgImageUrl && {
      backgroundImage: `url(${bgImageUrl})`,
      backgroundSize: bgTiled ? 'auto' : 'cover',
      backgroundRepeat: bgTiled ? 'repeat' : 'no-repeat',
      backgroundPosition: 'center',
    }),
  };

  return (
    <div className={`rounded overflow-hidden ${className}`} style={backgroundStyle}>
      <canvas
        ref={canvasRef}
        className="block"
        style={{ width: size, height: size }}
      />
    </div>
  );
};
