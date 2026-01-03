import React, { useEffect, useRef } from 'react';
import type { CustomSprite } from '../../utils/assetStorage';
import { drawSprite } from './SpriteEditor';

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

    const renderThumbnail = async () => {
      // Clear and draw background
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(0, 0, size, size);

      // Check for image data
      const imageData = sprite.idleImageData || sprite.imageData;
      if (imageData) {
        // Load image asynchronously
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => {
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
            resolve();
          };
          img.onerror = () => resolve(); // Handle error gracefully
          img.src = imageData;
        });
      } else {
        // Draw sprite using shapes
        drawSprite(ctx, sprite, size / 2, size / 2, size);
      }
    };

    renderThumbnail();
  }, [sprite, size]);

  if (!sprite) {
    return (
      <div
        className={`bg-gray-700 rounded flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="text-gray-500 text-xs">No Sprite</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`rounded ${className}`}
    />
  );
};
