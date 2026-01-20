import React, { useEffect, useRef } from 'react';
import type { CustomSprite } from '../../utils/assetStorage';
import { resolveImageSource, resolveSpriteSheetSource } from '../../utils/assetStorage';
import { drawSprite } from './SpriteEditor';
import { drawPreviewBackground, type PreviewType } from '../../utils/themeAssets';

interface SpriteThumbnailProps {
  sprite?: CustomSprite;
  size?: number;
  className?: string;
  /** Type of preview background: 'entity' for heroes/enemies, 'asset' for tiles/items/enchantments */
  previewType?: PreviewType;
}

export const SpriteThumbnail: React.FC<SpriteThumbnailProps> = ({ sprite, size = 64, className = '', previewType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const renderThumbnail = async () => {
      // Clear canvas first
      ctx.clearRect(0, 0, size, size);

      // Determine what to render based on sprite mode
      let spriteSheet = null;
      let imageSrc: string | undefined = undefined;

      if (sprite.useDirectional && sprite.directionalSprites?.default) {
        // Directional mode - use default direction
        const defaultConfig = sprite.directionalSprites.default;
        spriteSheet = defaultConfig.idleSpriteSheet;
        imageSrc = resolveImageSource(
          defaultConfig.idleImageData || defaultConfig.imageData,
          defaultConfig.idleImageUrl || defaultConfig.imageUrl
        );
      } else {
        // Simple mode
        spriteSheet = sprite.idleSpriteSheet;
        imageSrc = resolveImageSource(
          sprite.idleImageData || sprite.imageData,
          sprite.idleImageUrl || sprite.imageUrl
        );
      }

      // Resolve sprite sheet source (supports both data and URL)
      const spriteSheetSrc = resolveSpriteSheetSource(spriteSheet);

      // Draw preview background (color and/or image)
      drawPreviewBackground(ctx, size, size, () => {
        // Priority: sprite sheet > static image > shapes
        if (spriteSheetSrc) {
          // Render animated sprite sheet
          const img = new Image();
          // Enable CORS for external URLs (required for canvas drawing)
          if (spriteSheetSrc.startsWith('http')) {
            img.crossOrigin = 'anonymous';
          }
          img.onload = () => {
            let frameIndex = 0;
            const frameCount = spriteSheet.frameCount || 4;
            const frameRate = spriteSheet.frameRate || 10;
            const frameDuration = 1000 / frameRate;
            let lastFrameTime = Date.now();

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

              // Redraw background then sprite frame
              drawPreviewBackground(ctx, size, size, () => {
                // Calculate frame dimensions
                const frameWidth = spriteSheet.frameWidth || img.width / frameCount;
                const frameHeight = spriteSheet.frameHeight || img.height;

                // Calculate display size preserving aspect ratio
                const maxSize = (sprite.size || 0.6) * size;
                const frameAspectRatio = frameWidth / frameHeight;
                let drawWidth = maxSize;
                let drawHeight = maxSize;

                if (frameAspectRatio > 1) {
                  drawHeight = maxSize / frameAspectRatio;
                } else {
                  drawWidth = maxSize * frameAspectRatio;
                }

                // Draw current frame
                const sourceX = frameIndex * frameWidth;
                ctx.drawImage(
                  img,
                  sourceX, 0, frameWidth, frameHeight,
                  size/2 - drawWidth/2, size/2 - drawHeight/2, drawWidth, drawHeight
                );
              }, previewType);

              animationFrameId = requestAnimationFrame(animate);
            };

            animate();
          };
          img.onerror = () => {};
          img.src = spriteSheetSrc;
        } else if (imageSrc) {
          // Render static image
          const img = new Image();
          // Enable CORS for external URLs (required for canvas drawing)
          if (imageSrc.startsWith('http')) {
            img.crossOrigin = 'anonymous';
          }
          img.onload = () => {
            // Redraw background then sprite
            drawPreviewBackground(ctx, size, size, () => {
              const maxSize = (sprite.size || 0.6) * size;
              const aspectRatio = img.width / img.height;
              let drawWidth = maxSize;
              let drawHeight = maxSize;

              if (aspectRatio > 1) {
                drawHeight = maxSize / aspectRatio;
              } else {
                drawWidth = maxSize * aspectRatio;
              }

              ctx.drawImage(img, size/2 - drawWidth/2, size/2 - drawHeight/2, drawWidth, drawHeight);
            }, previewType);
          };
          img.onerror = () => {};
          img.src = imageSrc;
        } else {
          // Draw sprite using shapes
          drawSprite(ctx, sprite, size / 2, size / 2, size);
        }
      }, previewType);
    };

    renderThumbnail();

    // Cleanup animation on unmount
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [sprite, size, previewType]);

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

  return (
    <canvas
      ref={canvasRef}
      className={`rounded ${className}`}
      style={{ width: size, height: size }}
    />
  );
};
