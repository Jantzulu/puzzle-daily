import React, { useRef, useEffect, useState } from 'react';
import type { CustomSprite, DirectionalSpriteConfig, SpriteDirection } from '../../utils/assetStorage';
import { Direction } from '../../types/game';

interface SpriteEditorProps {
  sprite: CustomSprite;
  onChange: (sprite: CustomSprite) => void;
  size?: number; // Preview size in pixels
}

const PREVIEW_SIZE = 96;

const DIRECTIONS: { key: SpriteDirection; label: string; arrow: string }[] = [
  { key: 'n', label: 'North', arrow: '↑' },
  { key: 'ne', label: 'North-East', arrow: '↗' },
  { key: 'e', label: 'East', arrow: '→' },
  { key: 'se', label: 'South-East', arrow: '↘' },
  { key: 's', label: 'South', arrow: '↓' },
  { key: 'sw', label: 'South-West', arrow: '↙' },
  { key: 'w', label: 'West', arrow: '←' },
  { key: 'nw', label: 'North-West', arrow: '↖' },
  { key: 'default', label: 'Default/Static', arrow: '⊙' },
];

export const SpriteEditor: React.FC<SpriteEditorProps> = ({ sprite, onChange, size = PREVIEW_SIZE }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedDirection, setSelectedDirection] = useState<SpriteDirection>('default');
  const [spriteMode, setSpriteMode] = useState<'simple' | 'directional'>(sprite.type || 'simple');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderPreview = () => {
      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw preview background
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw sprite based on mode
      if (spriteMode === 'directional' && sprite.directionalSprites) {
        const dirSprite = sprite.directionalSprites[selectedDirection] || sprite.directionalSprites['default'];
        if (dirSprite) {
          const imageToShow = dirSprite.idleImageData || dirSprite.imageData;
          if (imageToShow) {
            // Load and draw image
            const img = new Image();
            img.onload = () => {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = '#2a2a2a';
              ctx.fillRect(0, 0, canvas.width, canvas.height);

              // Preserve aspect ratio
              const maxSize = (dirSprite.size || 0.6) * canvas.width;
              const aspectRatio = img.width / img.height;
              let drawWidth = maxSize;
              let drawHeight = maxSize;

              if (aspectRatio > 1) {
                // Wider than tall
                drawHeight = maxSize / aspectRatio;
              } else {
                // Taller than wide
                drawWidth = maxSize * aspectRatio;
              }

              ctx.drawImage(img, canvas.width/2 - drawWidth/2, canvas.height/2 - drawHeight/2, drawWidth, drawHeight);
            };
            img.src = imageToShow;
          } else {
            drawSpriteConfig(ctx, dirSprite, canvas.width / 2, canvas.height / 2, canvas.width);
          }
        }
      } else {
        // Simple mode
        const simpleImageToShow = sprite.idleImageData || sprite.imageData;
        if (simpleImageToShow) {
          const img = new Image();
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Preserve aspect ratio
            const maxSize = (sprite.size || 0.6) * canvas.width;
            const aspectRatio = img.width / img.height;
            let drawWidth = maxSize;
            let drawHeight = maxSize;

            if (aspectRatio > 1) {
              // Wider than tall
              drawHeight = maxSize / aspectRatio;
            } else {
              // Taller than wide
              drawWidth = maxSize * aspectRatio;
            }

            ctx.drawImage(img, canvas.width/2 - drawWidth/2, canvas.height/2 - drawHeight/2, drawWidth, drawHeight);
          };
          img.src = simpleImageToShow;
        } else {
          drawSprite(ctx, sprite, canvas.width / 2, canvas.height / 2, canvas.width);
        }
      }
    };

    renderPreview();
  }, [sprite, selectedDirection, spriteMode]);

  const handleModeChange = (mode: 'simple' | 'directional') => {
    setSpriteMode(mode);

    if (mode === 'directional') {
      // Initialize directional sprites if switching to directional mode
      if (!sprite.directionalSprites) {
        const defaultConfig: DirectionalSpriteConfig = {
          shape: sprite.shape || 'circle',
          primaryColor: sprite.primaryColor || '#4caf50',
          secondaryColor: sprite.secondaryColor || '#ffffff',
          size: sprite.size || 0.6,
        };

        onChange({
          ...sprite,
          type: 'directional',
          useDirectional: true,
          directionalSprites: {
            default: defaultConfig,
          },
        });
      } else {
        onChange({ ...sprite, type: 'directional', useDirectional: true });
      }
    } else {
      onChange({ ...sprite, type: 'simple', useDirectional: false });
    }
  };

  const handleShapeChange = (shape: DirectionalSpriteConfig['shape']) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection] || {
        shape: 'circle',
        primaryColor: '#4caf50',
        secondaryColor: '#ffffff',
        size: 0.6,
      };

      onChange({
        ...sprite,
        directionalSprites: {
          ...dirSprites,
          [selectedDirection]: { ...currentConfig, shape },
        },
      });
    } else {
      onChange({ ...sprite, shape });
    }
  };

  const handleColorChange = (colorType: 'primary' | 'secondary', color: string) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection] || {
        shape: 'circle',
        primaryColor: '#4caf50',
        secondaryColor: '#ffffff',
        size: 0.6,
      };

      const updatedConfig = colorType === 'primary'
        ? { ...currentConfig, primaryColor: color }
        : { ...currentConfig, secondaryColor: color };

      onChange({
        ...sprite,
        directionalSprites: {
          ...dirSprites,
          [selectedDirection]: updatedConfig,
        },
      });
    } else {
      if (colorType === 'primary') {
        onChange({ ...sprite, primaryColor: color });
      } else {
        onChange({ ...sprite, secondaryColor: color });
      }
    }
  };

  const handleSizeChange = (newSize: number) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection] || {
        shape: 'circle',
        primaryColor: '#4caf50',
        secondaryColor: '#ffffff',
        size: 0.6,
      };

      onChange({
        ...sprite,
        directionalSprites: {
          ...dirSprites,
          [selectedDirection]: { ...currentConfig, size: newSize },
        },
      });
    } else {
      onChange({ ...sprite, size: newSize });
    }
  };

  const copyToAllDirections = () => {
    if (spriteMode !== 'directional') return;

    const dirSprites = sprite.directionalSprites || {};
    const sourceConfig = dirSprites[selectedDirection];

    if (!sourceConfig) {
      alert('Configure this direction first before copying!');
      return;
    }

    const newDirectionalSprites: Partial<Record<SpriteDirection, DirectionalSpriteConfig>> = {};
    DIRECTIONS.forEach(dir => {
      newDirectionalSprites[dir.key] = { ...sourceConfig };
    });

    onChange({
      ...sprite,
      directionalSprites: newDirectionalSprites,
    });

    alert('Copied to all directions!');
  };

  // Get current values based on mode
  const getCurrentConfig = (): DirectionalSpriteConfig => {
    if (spriteMode === 'directional' && sprite.directionalSprites) {
      return sprite.directionalSprites[selectedDirection] || {
        shape: 'circle',
        primaryColor: '#4caf50',
        secondaryColor: '#ffffff',
        size: 0.6,
      };
    }
    return {
      shape: sprite.shape || 'circle',
      primaryColor: sprite.primaryColor || '#4caf50',
      secondaryColor: sprite.secondaryColor || '#ffffff',
      size: sprite.size || 0.6,
    };
  };

  const currentConfig = getCurrentConfig();

  const handleIdleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const idleImageData = event.target?.result as string;

      if (spriteMode === 'directional') {
        const dirSprites = sprite.directionalSprites || {};
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: {
              ...(dirSprites[selectedDirection] || {}),
              idleImageData,
              imageData: idleImageData, // Backwards compat
            },
          },
        });
      } else {
        onChange({
          ...sprite,
          type: 'image',
          idleImageData,
          imageData: idleImageData, // Backwards compat
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleMovingImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const movingImageData = event.target?.result as string;

      if (spriteMode === 'directional') {
        const dirSprites = sprite.directionalSprites || {};
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: {
              ...(dirSprites[selectedDirection] || {}),
              movingImageData,
            },
          },
        });
      } else {
        onChange({
          ...sprite,
          movingImageData,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const clearIdleImage = () => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (currentConfig) {
        const { imageData, idleImageData, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { imageData, idleImageData, ...rest } = sprite;
      onChange({ ...rest, type: 'simple' });
    }
  };

  const clearMovingImage = () => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (currentConfig) {
        const { movingImageData, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { movingImageData, ...rest } = sprite;
      onChange({ ...rest });
    }
  };

  const hasIdleImage = spriteMode === 'directional'
    ? (sprite.directionalSprites?.[selectedDirection]?.idleImageData || sprite.directionalSprites?.[selectedDirection]?.imageData)
    : (sprite.idleImageData || sprite.imageData);

  const hasMovingImage = spriteMode === 'directional'
    ? sprite.directionalSprites?.[selectedDirection]?.movingImageData
    : sprite.movingImageData;

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div>
        <label className="block text-sm font-bold mb-2">Sprite Mode</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleModeChange('simple')}
            className={`p-2 rounded ${
              spriteMode === 'simple' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            Simple (Same all directions)
          </button>
          <button
            onClick={() => handleModeChange('directional')}
            className={`p-2 rounded ${
              spriteMode === 'directional' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            Directional (8-way)
          </button>
        </div>
      </div>

      {/* Idle Image Upload */}
      <div>
        <label className="block text-sm font-bold mb-2">
          Idle Image (Not Moving) {spriteMode === 'directional' ? `- ${DIRECTIONS.find(d => d.key === selectedDirection)?.label}` : ''}
        </label>
        <div className="space-y-2">
          <input
            type="file"
            accept="image/png,image/jpg,image/jpeg,image/gif"
            onChange={handleIdleImageUpload}
            className="w-full px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700"
          />
          {hasIdleImage && (
            <button
              onClick={clearIdleImage}
              className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
            >
              ✕ Clear Idle Image
            </button>
          )}
          <p className="text-xs text-gray-400">
            {hasIdleImage ? '✓ Idle image uploaded' : 'No idle image - using shapes/colors'}
          </p>
        </div>
      </div>

      {/* Moving Image Upload */}
      <div>
        <label className="block text-sm font-bold mb-2">
          Moving Image (While Moving) {spriteMode === 'directional' ? `- ${DIRECTIONS.find(d => d.key === selectedDirection)?.label}` : ''}
        </label>
        <div className="space-y-2">
          <input
            type="file"
            accept="image/png,image/jpg,image/jpeg,image/gif"
            onChange={handleMovingImageUpload}
            className="w-full px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700"
          />
          {hasMovingImage && (
            <button
              onClick={clearMovingImage}
              className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
            >
              ✕ Clear Moving Image
            </button>
          )}
          <p className="text-xs text-gray-400">
            {hasMovingImage ? '✓ Moving image uploaded' : 'No moving image - will use idle image'}
          </p>
          <p className="text-xs text-yellow-400">
            💡 Tip: Use GIF files for smooth movement animation!
          </p>
        </div>
      </div>

      {/* Direction Selector (only for directional mode) */}
      {spriteMode === 'directional' && (
        <div>
          <label className="block text-sm font-bold mb-2">Direction</label>
          <div className="grid grid-cols-3 gap-1">
            {DIRECTIONS.map((dir) => (
              <button
                key={dir.key}
                onClick={() => setSelectedDirection(dir.key)}
                className={`p-2 rounded text-xs ${
                  selectedDirection === dir.key
                    ? 'bg-purple-600'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {dir.arrow} {dir.label}
              </button>
            ))}
          </div>

          <button
            onClick={copyToAllDirections}
            className="w-full mt-2 px-3 py-1 text-xs bg-green-600 rounded hover:bg-green-700"
          >
            📋 Copy "{DIRECTIONS.find(d => d.key === selectedDirection)?.label}" to All Directions
          </button>
        </div>
      )}

      <div>
        <label className="block text-sm font-bold mb-2">
          Preview {spriteMode === 'directional' ? `(${DIRECTIONS.find(d => d.key === selectedDirection)?.label})` : ''}
        </label>
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="border-2 border-gray-600 rounded bg-gray-800"
        />
      </div>

      <div>
        <label className="block text-sm font-bold mb-2">Shape</label>
        <div className="grid grid-cols-3 gap-2">
          {(['circle', 'square', 'triangle', 'star', 'diamond'] as const).map((shape) => (
            <button
              key={shape}
              onClick={() => handleShapeChange(shape)}
              className={`p-2 rounded capitalize ${
                currentConfig.shape === shape ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {shape}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold mb-2">Primary Color</label>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={currentConfig.primaryColor}
            onChange={(e) => handleColorChange('primary', e.target.value)}
            className="w-16 h-10 rounded cursor-pointer"
          />
          <input
            type="text"
            value={currentConfig.primaryColor}
            onChange={(e) => handleColorChange('primary', e.target.value)}
            className="flex-1 px-3 py-2 bg-gray-700 rounded text-white font-mono text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold mb-2">Secondary Color</label>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={currentConfig.secondaryColor}
            onChange={(e) => handleColorChange('secondary', e.target.value)}
            className="w-16 h-10 rounded cursor-pointer"
          />
          <input
            type="text"
            value={currentConfig.secondaryColor}
            onChange={(e) => handleColorChange('secondary', e.target.value)}
            className="flex-1 px-3 py-2 bg-gray-700 rounded text-white font-mono text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold mb-2">
          Size: {(currentConfig.size * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min="0.2"
          max="1.0"
          step="0.05"
          value={currentConfig.size}
          onChange={(e) => handleSizeChange(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
    </div>
  );
};

// Helper to draw a sprite configuration
function drawSpriteConfig(
  ctx: CanvasRenderingContext2D,
  config: DirectionalSpriteConfig,
  centerX: number,
  centerY: number,
  tileSize: number,
  isMoving: boolean = false
) {
  // Check for uploaded image first (PNG/GIF)
  // Use moving sprite if moving and available, otherwise fall back to idle
  const imageToUse = isMoving && config.movingImageData
    ? config.movingImageData
    : (config.idleImageData || config.imageData);

  if (imageToUse) {
    const img = new Image();
    img.src = imageToUse;
    const maxSize = (config.size || 0.6) * tileSize;

    // Preserve aspect ratio
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    let drawWidth = maxSize;
    let drawHeight = maxSize;

    if (aspectRatio > 1) {
      drawHeight = maxSize / aspectRatio;
    } else {
      drawWidth = maxSize * aspectRatio;
    }

    ctx.drawImage(img, centerX - drawWidth/2, centerY - drawHeight/2, drawWidth, drawHeight);
    return;
  }

  const primaryColor = config.primaryColor || '#4caf50';
  const secondaryColor = config.secondaryColor || '#ffffff';
  const size = (config.size || 0.6) * tileSize;
  const radius = size / 2;

  ctx.fillStyle = primaryColor;

  switch (config.shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'square':
      ctx.fillRect(centerX - radius, centerY - radius, size, size);
      break;

    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX - radius, centerY + radius);
      ctx.lineTo(centerX + radius, centerY + radius);
      ctx.closePath();
      ctx.fill();
      break;

    case 'star':
      drawStar(ctx, centerX, centerY, 5, radius, radius / 2);
      break;

    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX + radius, centerY);
      ctx.lineTo(centerX, centerY + radius);
      ctx.lineTo(centerX - radius, centerY);
      ctx.closePath();
      ctx.fill();
      break;

    default:
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
  }

  // Add secondary color detail (center dot/highlight)
  ctx.fillStyle = secondaryColor;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius / 3, 0, Math.PI * 2);
  ctx.fill();
}

// Shared sprite drawing function (can be used by game renderer too)
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: CustomSprite,
  centerX: number,
  centerY: number,
  tileSize: number,
  direction?: Direction,
  isMoving: boolean = false
) {
  // Check if we should use directional sprites
  if (sprite.useDirectional && sprite.directionalSprites && direction) {
    const dirKey = mapGameDirectionToSpriteDirection(direction);
    const dirConfig = sprite.directionalSprites[dirKey] || sprite.directionalSprites['default'];

    if (dirConfig) {
      drawSpriteConfig(ctx, dirConfig, centerX, centerY, tileSize, isMoving);
      return;
    }
  }

  // Check for simple image sprite (PNG/GIF)
  // Use moving sprite if moving and available, otherwise fall back to idle
  const spriteImageToUse = isMoving && sprite.movingImageData
    ? sprite.movingImageData
    : (sprite.idleImageData || sprite.imageData);

  if (spriteImageToUse) {
    const img = new Image();
    img.src = spriteImageToUse;
    const maxSize = (sprite.size || 0.6) * tileSize;

    // Preserve aspect ratio
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    let drawWidth = maxSize;
    let drawHeight = maxSize;

    if (aspectRatio > 1) {
      drawHeight = maxSize / aspectRatio;
    } else {
      drawWidth = maxSize * aspectRatio;
    }

    ctx.drawImage(img, centerX - drawWidth/2, centerY - drawHeight/2, drawWidth, drawHeight);
    return;
  }

  // Fallback to simple sprite rendering with shapes
  const primaryColor = sprite.primaryColor || '#4caf50';
  const secondaryColor = sprite.secondaryColor || '#ffffff';
  const size = (sprite.size || 0.6) * tileSize;
  const radius = size / 2;

  ctx.fillStyle = primaryColor;

  switch (sprite.shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'square':
      ctx.fillRect(centerX - radius, centerY - radius, size, size);
      break;

    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX - radius, centerY + radius);
      ctx.lineTo(centerX + radius, centerY + radius);
      ctx.closePath();
      ctx.fill();
      break;

    case 'star':
      drawStar(ctx, centerX, centerY, 5, radius, radius / 2);
      break;

    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX + radius, centerY);
      ctx.lineTo(centerX, centerY + radius);
      ctx.lineTo(centerX - radius, centerY);
      ctx.closePath();
      ctx.fill();
      break;

    default:
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
  }

  // Add secondary color detail (center dot/highlight)
  ctx.fillStyle = secondaryColor;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius / 3, 0, Math.PI * 2);
  ctx.fill();
}

function mapGameDirectionToSpriteDirection(direction: Direction): SpriteDirection {
  switch (direction) {
    case Direction.NORTH: return 'n';
    case Direction.EAST: return 'e';
    case Direction.SOUTH: return 's';
    case Direction.WEST: return 'w';
    default: return 'default';
  }
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number
) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
}
