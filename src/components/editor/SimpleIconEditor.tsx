import React, { useRef, useEffect } from 'react';
import type { SpriteReference } from '../../types/game';
import type { CustomSprite } from '../../utils/assetStorage';

interface SimpleIconEditorProps {
  sprite: SpriteReference;
  onChange: (sprite: SpriteReference) => void;
  size?: number;
}

// Shape options for simple icons
const SHAPE_OPTIONS = ['circle', 'square', 'triangle', 'diamond', 'star', 'hexagon'] as const;
type ShapeOption = typeof SHAPE_OPTIONS[number];

// Preset colors for quick selection
const PRESET_COLORS = [
  '#dc2626', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#10b981', // emerald
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ffffff', // white
  '#9ca3af', // gray
  '#000000', // black
];

// Draw a shape on canvas
function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeOption,
  centerX: number,
  centerY: number,
  radius: number,
  primaryColor: string,
  secondaryColor?: string
) {
  ctx.fillStyle = primaryColor;
  ctx.strokeStyle = secondaryColor || '#000000';
  ctx.lineWidth = 1;

  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(centerX - radius, centerY - radius, radius * 2, radius * 2);
      break;
    case 'triangle':
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX + radius, centerY + radius);
      ctx.lineTo(centerX - radius, centerY + radius);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX + radius, centerY);
      ctx.lineTo(centerX, centerY + radius);
      ctx.lineTo(centerX - radius, centerY);
      ctx.closePath();
      break;
    case 'star':
      const outerRadius = radius;
      const innerRadius = radius * 0.5;
      const points = 5;
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (Math.PI * i) / points - Math.PI / 2;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * i) / 3 - Math.PI / 6;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
  }
  ctx.fill();
  ctx.stroke();
}

export const SimpleIconEditor: React.FC<SimpleIconEditorProps> = ({
  sprite,
  onChange,
  size = 64,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract current values from sprite
  const spriteData = sprite.spriteData as CustomSprite | undefined;
  const currentShape = (spriteData?.shape || 'circle') as ShapeOption;
  const currentColor = spriteData?.primaryColor || '#ffffff';
  const currentSecondaryColor = spriteData?.secondaryColor || '#000000';
  const currentImageData = spriteData?.imageData || spriteData?.idleImageData;
  const currentScale = spriteData?.size || 0.8;

  // Draw preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width * 0.35;

    if (currentImageData) {
      // Draw uploaded image
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Use scale for image size
        const imgSize = Math.min(canvas.width, canvas.height) * currentScale;
        ctx.drawImage(
          img,
          centerX - imgSize / 2,
          centerY - imgSize / 2,
          imgSize,
          imgSize
        );
      };
      img.src = currentImageData;
    } else {
      // Draw shape
      drawShape(ctx, currentShape, centerX, centerY, radius, currentColor, currentSecondaryColor);
    }
  }, [currentShape, currentColor, currentSecondaryColor, currentImageData, currentScale]);

  // Update sprite data helper
  const updateSpriteData = (updates: Partial<CustomSprite>) => {
    const newSpriteData: CustomSprite = {
      // Start with existing sprite data
      ...spriteData,
      // Ensure required fields have defaults
      id: spriteData?.id || `icon_${Date.now()}`,
      name: spriteData?.name || 'Status Icon',
      type: 'simple',
      createdAt: spriteData?.createdAt || new Date().toISOString(),
      // Apply the updates last so they take effect
      ...updates,
    };

    onChange({
      type: 'inline',
      spriteData: newSpriteData,
    });
  };

  const handleScaleChange = (newScale: number) => {
    updateSpriteData({ size: newScale });
  };

  const handleShapeChange = (newShape: ShapeOption) => {
    updateSpriteData({
      shape: newShape,
      imageData: undefined,
      idleImageData: undefined,
    });
  };

  const handleColorChange = (newColor: string) => {
    updateSpriteData({ primaryColor: newColor });
  };

  const handleSecondaryColorChange = (newColor: string) => {
    updateSpriteData({ secondaryColor: newColor });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    // Load image and resize to max 64x64 for status effect icons
    const img = new Image();
    img.onload = () => {
      // Max size for status effect icons (they display at 8-16px anyway)
      const maxSize = 64;
      let width = img.width;
      let height = img.height;

      // Scale down if larger than maxSize
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height / width) * maxSize);
          width = maxSize;
        } else {
          width = Math.round((width / height) * maxSize);
          height = maxSize;
        }
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        // Convert to PNG data URL (compressed)
        const imageData = canvas.toDataURL('image/png', 0.8);
        updateSpriteData({
          type: 'image',
          imageData,
          idleImageData: imageData,
        });
      }
    };

    // Read the file and set as image source
    const reader = new FileReader();
    reader.onload = (event) => {
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    updateSpriteData({
      type: 'simple',
      imageData: undefined,
      idleImageData: undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          width={size * 2}
          height={size * 2}
          className="border border-stone-600 rounded"
          style={{ width: size, height: size }}
        />
      </div>

      {/* Image upload */}
      <div>
        <label className="block text-sm font-medium mb-2">Custom Image</label>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-700"
          >
            Upload Image
          </button>
          {currentImageData && (
            <button
              onClick={clearImage}
              className="px-3 py-1 bg-red-600 rounded text-sm hover:bg-red-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Scale slider (only shown when image is uploaded) */}
      {currentImageData && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Scale: {Math.round(currentScale * 100)}%
          </label>
          <input
            type="range"
            min="0.2"
            max="1"
            step="0.05"
            value={currentScale}
            onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-stone-400 mt-1">
            <span>20%</span>
            <span>100%</span>
          </div>
        </div>
      )}

      {/* Shape selector (only shown if no image) */}
      {!currentImageData && (
        <>
          <div>
            <label className="block text-sm font-medium mb-2">Shape</label>
            <div className="flex flex-wrap gap-2">
              {SHAPE_OPTIONS.map((shape) => (
                <button
                  key={shape}
                  onClick={() => handleShapeChange(shape)}
                  className={`w-10 h-10 rounded border-2 flex items-center justify-center ${
                    currentShape === shape
                      ? 'border-blue-500 bg-blue-600/20'
                      : 'border-stone-600 hover:border-stone-500'
                  }`}
                  title={shape}
                >
                  <ShapePreview shape={shape} size={24} color={currentColor} />
                </button>
              ))}
            </div>
          </div>

          {/* Primary color */}
          <div>
            <label className="block text-sm font-medium mb-2">Fill Color</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className={`w-8 h-8 rounded border-2 ${
                    currentColor === color ? 'border-white' : 'border-stone-600'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <input
              type="color"
              value={currentColor}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-full h-8 rounded cursor-pointer"
            />
          </div>

          {/* Secondary color (outline) */}
          <div>
            <label className="block text-sm font-medium mb-2">Outline Color</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleSecondaryColorChange(color)}
                  className={`w-8 h-8 rounded border-2 ${
                    currentSecondaryColor === color ? 'border-white' : 'border-stone-600'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <input
              type="color"
              value={currentSecondaryColor}
              onChange={(e) => handleSecondaryColorChange(e.target.value)}
              className="w-full h-8 rounded cursor-pointer"
            />
          </div>
        </>
      )}
    </div>
  );
};

// Small shape preview component for buttons
const ShapePreview: React.FC<{ shape: ShapeOption; size: number; color: string }> = ({
  shape,
  size,
  color,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawShape(ctx, shape, size / 2, size / 2, size * 0.35, color, '#ffffff');
  }, [shape, size, color]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  );
};
