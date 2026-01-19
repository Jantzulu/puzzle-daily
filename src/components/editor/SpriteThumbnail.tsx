import React, { useEffect, useRef } from 'react';
import type { CustomSprite } from '../../utils/assetStorage';
import { drawSprite } from './SpriteEditor';
import { drawPreviewBackground } from '../../utils/themeAssets';

interface SpriteThumbnailProps {
  sprite?: CustomSprite;
  size?: number;
  className?: string;
}

export const SpriteThumbnail: React.FC<SpriteThumbnailProps> = ({ sprite, size = 64, className = '' }) => {
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
      let imageData = null;

      if (sprite.useDirectional && sprite.directionalSprites?.default) {
        // Directional mode - use default direction
        const defaultConfig = sprite.directionalSprites.default;
        spriteSheet = defaultConfig.idleSpriteSheet;
        imageData = defaultConfig.idleImageData || defaultConfig.imageData;
      } else {
        // Simple mode
        spriteSheet = sprite.idleSpriteSheet;
        imageData = sprite.idleImageData || sprite.imageData;
      }

      // Draw preview background (color and/or image)
      drawPreviewBackground(ctx, size, size, () => {
        // Priority: sprite sheet > static image > shapes
        if (spriteSheet?.imageData) {
          // Render animated sprite sheet
          const img = new Image();
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
              });

              animationFrameId = requestAnimationFrame(animate);
            };

            animate();
          };
          img.onerror = () => {};
          img.src = spriteSheet.imageData;
        } else if (imageData) {
          // Render static image
          const img = new Image();
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
            });
          };
          img.onerror = () => {};
          img.src = imageData;
        } else {
          // Draw sprite using shapes
          drawSprite(ctx, sprite, size / 2, size / 2, size);
        }
      });
    };

    renderThumbnail();

    // Cleanup animation on unmount
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [sprite, size]);

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
