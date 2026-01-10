import React, { useRef, useEffect, useState } from 'react';
import type { CustomSprite, DirectionalSpriteConfig, SpriteDirection } from '../../utils/assetStorage';
import { Direction } from '../../types/game';

// Global image cache for GIF animation support
const globalImageCache = new Map<string, HTMLImageElement>();

// Set of callbacks to notify when sprite images finish loading
const spriteLoadCallbacks = new Set<() => void>();

// Set of images currently loading
const loadingSpriteImages = new Set<string>();

/**
 * Subscribe to sprite image load events. Returns unsubscribe function.
 */
export function subscribeToSpriteImageLoads(callback: () => void): () => void {
  spriteLoadCallbacks.add(callback);
  return () => spriteLoadCallbacks.delete(callback);
}

/**
 * Notify all subscribers that a sprite image has loaded.
 */
function notifySpriteImageLoaded() {
  spriteLoadCallbacks.forEach(cb => cb());
}

/**
 * Load a sprite image with caching and load notification.
 */
function loadSpriteImage(src: string): HTMLImageElement {
  let img = globalImageCache.get(src);
  if (!img) {
    img = new Image();
    globalImageCache.set(src, img);

    if (!loadingSpriteImages.has(src)) {
      loadingSpriteImages.add(src);
      img.onload = () => {
        loadingSpriteImages.delete(src);
        notifySpriteImageLoaded();
      };
      img.onerror = () => {
        loadingSpriteImages.delete(src);
      };
    }

    img.src = src;
  }
  return img;
}

// Sprite sheet animation state
interface SpriteSheetState {
  currentFrame: number;
  lastFrameTime: number;
}
const spriteSheetStates = new Map<string, SpriteSheetState>();

/**
 * Draw an animated sprite sheet
 */
function drawSpriteSheet(
  ctx: CanvasRenderingContext2D,
  sheet: import('../../utils/assetStorage').SpriteSheetConfig,
  centerX: number,
  centerY: number,
  displayWidth: number,
  displayHeight: number,
  now: number
): void {
  // Get or create cached image with load notification
  const img = loadSpriteImage(sheet.imageData);

  // Wait for image to load
  if (!img.complete || img.naturalWidth === 0) return;

  // Get or initialize animation state
  const stateKey = sheet.imageData;
  let state = spriteSheetStates.get(stateKey);
  if (!state) {
    state = { currentFrame: 0, lastFrameTime: now };
    spriteSheetStates.set(stateKey, state);
  }

  // Calculate frame dimensions
  const frameWidth = sheet.frameWidth || (img.naturalWidth / sheet.frameCount);
  const frameHeight = sheet.frameHeight || img.naturalHeight;

  // Update animation frame based on frame rate
  const frameDuration = 1000 / sheet.frameRate; // ms per frame
  if (now - state.lastFrameTime >= frameDuration) {
    state.currentFrame++;
    if (state.currentFrame >= sheet.frameCount) {
      state.currentFrame = sheet.loop !== false ? 0 : sheet.frameCount - 1;
    }
    state.lastFrameTime = now;
  }

  // Calculate display dimensions preserving aspect ratio
  const frameAspectRatio = frameWidth / frameHeight;
  let finalWidth = displayWidth;
  let finalHeight = displayHeight;

  if (frameAspectRatio > 1) {
    // Frame is wider than tall
    finalHeight = displayWidth / frameAspectRatio;
  } else {
    // Frame is taller than wide
    finalWidth = displayHeight * frameAspectRatio;
  }

  // Draw the current frame
  const sourceX = state.currentFrame * frameWidth;
  const sourceY = 0;

  try {
    ctx.drawImage(
      img,
      sourceX, sourceY, frameWidth, frameHeight, // Source rectangle
      centerX - finalWidth / 2, centerY - finalHeight / 2, finalWidth, finalHeight // Destination rectangle
    );
  } catch (e) {
    // Image not ready
  }
}

/**
 * Draw a sprite sheet with animation based on a specific start time
 * Used for one-shot animations like death sprites where we need to track
 * when the animation started and stop on the final frame
 */
function drawSpriteSheetFromStartTime(
  ctx: CanvasRenderingContext2D,
  sheet: import('../../utils/assetStorage').SpriteSheetConfig,
  centerX: number,
  centerY: number,
  displayWidth: number,
  displayHeight: number,
  startTime: number,
  now: number = Date.now()
): void {
  // Get or create cached image with load notification
  const img = loadSpriteImage(sheet.imageData);

  // Wait for image to load
  if (!img.complete || img.naturalWidth === 0) return;

  // Calculate frame dimensions
  const frameWidth = sheet.frameWidth || (img.naturalWidth / sheet.frameCount);
  const frameHeight = sheet.frameHeight || img.naturalHeight;

  // Calculate current frame based on elapsed time since start
  const elapsed = now - startTime;
  const frameDuration = 1000 / sheet.frameRate; // ms per frame
  let currentFrame = Math.floor(elapsed / frameDuration);

  // For non-looping animations (like death), clamp to final frame
  if (sheet.loop === false && currentFrame >= sheet.frameCount) {
    currentFrame = sheet.frameCount - 1;
  } else if (sheet.loop !== false) {
    // Looping animation
    currentFrame = currentFrame % sheet.frameCount;
  }

  // Ensure frame is within bounds
  currentFrame = Math.max(0, Math.min(currentFrame, sheet.frameCount - 1));

  // Calculate display dimensions preserving aspect ratio
  const frameAspectRatio = frameWidth / frameHeight;
  let finalWidth = displayWidth;
  let finalHeight = displayHeight;

  if (frameAspectRatio > 1) {
    finalHeight = displayWidth / frameAspectRatio;
  } else {
    finalWidth = displayHeight * frameAspectRatio;
  }

  // Draw the current frame
  const sourceX = currentFrame * frameWidth;
  const sourceY = 0;

  try {
    ctx.drawImage(
      img,
      sourceX, sourceY, frameWidth, frameHeight,
      centerX - finalWidth / 2, centerY - finalHeight / 2, finalWidth, finalHeight
    );
  } catch (e) {
    // Image not ready
  }
}

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
  // Always use directional mode - 'default' direction serves as universal fallback
  const spriteMode = 'directional' as const;

  // Auto-migrate simple mode sprites to directional mode on first render
  useEffect(() => {
    if (sprite.type === 'simple' || !sprite.useDirectional) {
      // Migrate simple mode data to directional 'default' config
      const defaultConfig: DirectionalSpriteConfig = {
        shape: sprite.shape || 'circle',
        primaryColor: sprite.primaryColor || '#4caf50',
        secondaryColor: sprite.secondaryColor || '#ffffff',
        size: sprite.size || 0.6,
        idleImageData: sprite.idleImageData || sprite.imageData,
        movingImageData: sprite.movingImageData,
        idleSpriteSheet: sprite.idleSpriteSheet,
        movingSpriteSheet: sprite.movingSpriteSheet,
        deathImageData: sprite.deathImageData,
        deathSpriteSheet: sprite.deathSpriteSheet,
        castingImageData: sprite.castingImageData,
        castingSpriteSheet: sprite.castingSpriteSheet,
      };

      onChange({
        id: sprite.id,
        name: sprite.name,
        type: 'directional',
        useDirectional: true,
        createdAt: sprite.createdAt,
        directionalSprites: {
          ...sprite.directionalSprites,
          default: defaultConfig,
        },
      });
    }
  }, []);

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

  // Mode change function removed - always using directional mode now

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

  const handleIdleSpriteSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;

      const spriteSheetConfig = {
        imageData,
        frameCount: 4,
        frameRate: 10,
        loop: true,
      };

      if (spriteMode === 'directional') {
        const dirSprites = sprite.directionalSprites || {};
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: {
              ...(dirSprites[selectedDirection] || {}),
              idleSpriteSheet: spriteSheetConfig,
            },
          },
        });
      } else {
        onChange({
          ...sprite,
          idleSpriteSheet: spriteSheetConfig,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleMovingSpriteSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;

      const spriteSheetConfig = {
        imageData,
        frameCount: 4,
        frameRate: 10,
        loop: true,
      };

      if (spriteMode === 'directional') {
        const dirSprites = sprite.directionalSprites || {};
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: {
              ...(dirSprites[selectedDirection] || {}),
              movingSpriteSheet: spriteSheetConfig,
            },
          },
        });
      } else {
        onChange({
          ...sprite,
          movingSpriteSheet: spriteSheetConfig,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleIdleSpriteSheetConfigChange = (field: 'frameCount' | 'frameRate' | 'loop', value: number | boolean) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (!currentConfig?.idleSpriteSheet) return;

      onChange({
        ...sprite,
        directionalSprites: {
          ...dirSprites,
          [selectedDirection]: {
            ...currentConfig,
            idleSpriteSheet: {
              ...currentConfig.idleSpriteSheet,
              [field]: value,
            },
          },
        },
      });
    } else {
      if (!sprite.idleSpriteSheet) return;
      onChange({
        ...sprite,
        idleSpriteSheet: {
          ...sprite.idleSpriteSheet,
          [field]: value,
        },
      });
    }
  };

  const handleMovingSpriteSheetConfigChange = (field: 'frameCount' | 'frameRate' | 'loop', value: number | boolean) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (!currentConfig?.movingSpriteSheet) return;

      onChange({
        ...sprite,
        directionalSprites: {
          ...dirSprites,
          [selectedDirection]: {
            ...currentConfig,
            movingSpriteSheet: {
              ...currentConfig.movingSpriteSheet,
              [field]: value,
            },
          },
        },
      });
    } else {
      if (!sprite.movingSpriteSheet) return;
      onChange({
        ...sprite,
        movingSpriteSheet: {
          ...sprite.movingSpriteSheet,
          [field]: value,
        },
      });
    }
  };

  const clearIdleSpriteSheet = () => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (currentConfig) {
        const { idleSpriteSheet, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { idleSpriteSheet, ...rest } = sprite;
      onChange({ ...rest });
    }
  };

  const clearMovingSpriteSheet = () => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (currentConfig) {
        const { movingSpriteSheet, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { movingSpriteSheet, ...rest } = sprite;
      onChange({ ...rest });
    }
  };

  const hasIdleSpriteSheet = spriteMode === 'directional'
    ? sprite.directionalSprites?.[selectedDirection]?.idleSpriteSheet
    : sprite.idleSpriteSheet;

  const hasMovingSpriteSheet = spriteMode === 'directional'
    ? sprite.directionalSprites?.[selectedDirection]?.movingSpriteSheet
    : sprite.movingSpriteSheet;

  const hasIdleImage = spriteMode === 'directional'
    ? (sprite.directionalSprites?.[selectedDirection]?.idleImageData || sprite.directionalSprites?.[selectedDirection]?.imageData)
    : (sprite.idleImageData || sprite.imageData);

  const hasMovingImage = spriteMode === 'directional'
    ? sprite.directionalSprites?.[selectedDirection]?.movingImageData
    : sprite.movingImageData;

  // Death sprite handlers
  const handleDeathImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const deathImageData = event.target?.result as string;

      if (spriteMode === 'directional') {
        const dirSprites = sprite.directionalSprites || {};
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: {
              ...(dirSprites[selectedDirection] || {}),
              deathImageData,
            },
          },
        });
      } else {
        onChange({
          ...sprite,
          deathImageData,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeathSpriteSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;

      const spriteSheetConfig = {
        imageData,
        frameCount: 4,
        frameRate: 10,
        loop: false, // Death animation typically doesn't loop
      };

      if (spriteMode === 'directional') {
        const dirSprites = sprite.directionalSprites || {};
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: {
              ...(dirSprites[selectedDirection] || {}),
              deathSpriteSheet: spriteSheetConfig,
            },
          },
        });
      } else {
        onChange({
          ...sprite,
          deathSpriteSheet: spriteSheetConfig,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeathSpriteSheetConfigChange = (field: string, value: any) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentSheet = dirSprites[selectedDirection]?.deathSpriteSheet;
      if (currentSheet) {
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: {
              ...(dirSprites[selectedDirection] || {}),
              deathSpriteSheet: {
                ...currentSheet,
                [field]: value,
              },
            },
          },
        });
      }
    } else {
      if (sprite.deathSpriteSheet) {
        onChange({
          ...sprite,
          deathSpriteSheet: {
            ...sprite.deathSpriteSheet,
            [field]: value,
          },
        });
      }
    }
  };

  const clearDeathSpriteSheet = () => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (currentConfig) {
        const { deathSpriteSheet, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { deathSpriteSheet, ...rest } = sprite;
      onChange({ ...rest });
    }
  };

  const clearDeathImage = () => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (currentConfig) {
        const { deathImageData, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { deathImageData, ...rest } = sprite;
      onChange({ ...rest });
    }
  };

  const hasDeathSpriteSheet = spriteMode === 'directional'
    ? sprite.directionalSprites?.[selectedDirection]?.deathSpriteSheet
    : sprite.deathSpriteSheet;

  const hasDeathImage = spriteMode === 'directional'
    ? sprite.directionalSprites?.[selectedDirection]?.deathImageData
    : sprite.deathImageData;

  // Casting sprite handlers
  const handleCastingImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const castingImageData = event.target?.result as string;

      if (spriteMode === 'directional') {
        const dirSprites = sprite.directionalSprites || {};
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: {
              ...(dirSprites[selectedDirection] || {}),
              castingImageData,
            },
          },
        });
      } else {
        onChange({
          ...sprite,
          castingImageData,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCastingSpriteSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;

      const spriteSheetConfig = {
        imageData,
        frameCount: 4,
        frameRate: 10,
        loop: true, // Casting animation can loop
      };

      if (spriteMode === 'directional') {
        const dirSprites = sprite.directionalSprites || {};
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: {
              ...(dirSprites[selectedDirection] || {}),
              castingSpriteSheet: spriteSheetConfig,
            },
          },
        });
      } else {
        onChange({
          ...sprite,
          castingSpriteSheet: spriteSheetConfig,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCastingSpriteSheetConfigChange = (field: string, value: any) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentSheet = dirSprites[selectedDirection]?.castingSpriteSheet;
      if (currentSheet) {
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: {
              ...(dirSprites[selectedDirection] || {}),
              castingSpriteSheet: {
                ...currentSheet,
                [field]: value,
              },
            },
          },
        });
      }
    } else {
      if (sprite.castingSpriteSheet) {
        onChange({
          ...sprite,
          castingSpriteSheet: {
            ...sprite.castingSpriteSheet,
            [field]: value,
          },
        });
      }
    }
  };

  const clearCastingSpriteSheet = () => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (currentConfig) {
        const { castingSpriteSheet, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { castingSpriteSheet, ...rest } = sprite;
      onChange({ ...rest });
    }
  };

  const clearCastingImage = () => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (currentConfig) {
        const { castingImageData, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { castingImageData, ...rest } = sprite;
      onChange({ ...rest });
    }
  };

  const hasCastingSpriteSheet = spriteMode === 'directional'
    ? sprite.directionalSprites?.[selectedDirection]?.castingSpriteSheet
    : sprite.castingSpriteSheet;

  const hasCastingImage = spriteMode === 'directional'
    ? sprite.directionalSprites?.[selectedDirection]?.castingImageData
    : sprite.castingImageData;

  return (
    <div className="space-y-4">
      {/* Note: Always using directional mode now. The 'Default/Static' direction serves as the universal fallback. */}

      {/* LEGACY SIMPLE MODE - condition will never be true, kept for reference during migration */}
      {false && (
        <>
          {/* Simple Sprite Sheet Upload */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Sprite Sheet (Animated)
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleIdleSpriteSheetUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                />
                {hasIdleSpriteSheet && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-purple-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={sprite.idleSpriteSheet?.imageData}
                      alt="Sprite sheet"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasIdleSpriteSheet && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={sprite.idleSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleIdleSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={sprite.idleSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleIdleSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={sprite.idleSpriteSheet?.loop !== false}
                      onChange={(e) => handleIdleSpriteSheetConfigChange('loop', e.target.checked)}
                      className="w-4 h-4"
                    />
                    Loop animation
                  </label>
                  <button
                    onClick={clearIdleSpriteSheet}
                    className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                  >
                    ✕ Clear Sprite Sheet
                  </button>
                </>
              )}
              <p className="text-xs text-gray-400">
                {hasIdleSpriteSheet ? '✓ Sprite sheet configured' : 'No sprite sheet - use static image below'}
              </p>
              <p className="text-xs text-purple-400">
                💡 Sprite sheets should be horizontal strips with frames of equal width
              </p>
            </div>
          </div>

          {/* Simple Static Image Upload */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Static Image (Fallback)
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleIdleImageUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
                {hasIdleImage && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={sprite.idleImageData || sprite.imageData}
                      alt="Static image"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasIdleImage && (
                <button
                  onClick={clearIdleImage}
                  className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                >
                  ✕ Clear Static Image
                </button>
              )}
              <p className="text-xs text-gray-400">
                {hasIdleImage ? '✓ Static image uploaded' : 'No static image - using shapes/colors'}
              </p>
            </div>
          </div>

          {/* Death Sprite Sheet Upload - Simple Mode */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Death Sprite Sheet (On Death - Animated)
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleDeathSpriteSheetUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-red-600 file:text-white hover:file:bg-red-700"
                />
                {hasDeathSpriteSheet && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-red-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={sprite.deathSpriteSheet?.imageData}
                      alt="Death sprite sheet"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasDeathSpriteSheet && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={sprite.deathSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleDeathSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={sprite.deathSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleDeathSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={sprite.deathSpriteSheet?.loop !== false}
                      onChange={(e) => handleDeathSpriteSheetConfigChange('loop', e.target.checked)}
                      className="w-4 h-4"
                    />
                    Loop animation
                  </label>
                  <button
                    onClick={clearDeathSpriteSheet}
                    className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                  >
                    ✕ Clear Death Sprite Sheet
                  </button>
                </>
              )}
              <p className="text-xs text-gray-400">
                {hasDeathSpriteSheet ? '✓ Death sprite sheet configured' : 'No sprite sheet - use static image below'}
              </p>
              <p className="text-xs text-red-400">
                💀 Death animation plays when character/enemy reaches 0 HP
              </p>
            </div>
          </div>

          {/* Death Image Upload - Simple Mode */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Death Image (On Death - Static)
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleDeathImageUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
                {hasDeathImage && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={sprite.deathImageData}
                      alt="Death static"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasDeathImage && (
                <button
                  onClick={clearDeathImage}
                  className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                >
                  ✕ Clear Death Image
                </button>
              )}
              <p className="text-xs text-gray-400">
                {hasDeathImage ? '✓ Death image uploaded' : 'No death image - will show X overlay'}
              </p>
            </div>
          </div>

          {/* Casting Sprite Sheet Upload - Simple Mode */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Casting Sprite Sheet (Casting Spell - Animated)
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleCastingSpriteSheetUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-yellow-600 file:text-white hover:file:bg-yellow-700"
                />
                {hasCastingSpriteSheet && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-yellow-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={sprite.castingSpriteSheet?.imageData}
                      alt="Casting sprite sheet"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasCastingSpriteSheet && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={sprite.castingSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleCastingSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={sprite.castingSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleCastingSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={sprite.castingSpriteSheet?.loop !== false}
                      onChange={(e) => handleCastingSpriteSheetConfigChange('loop', e.target.checked)}
                      className="w-4 h-4"
                    />
                    Loop animation
                  </label>
                  <button
                    onClick={clearCastingSpriteSheet}
                    className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                  >
                    ✕ Clear Casting Sprite Sheet
                  </button>
                </>
              )}
              <p className="text-xs text-gray-400">
                {hasCastingSpriteSheet ? '✓ Casting sprite sheet configured' : 'No sprite sheet - use static image below'}
              </p>
              <p className="text-xs text-yellow-400">
                ✨ Casting animation plays when character/enemy casts spell while stationary
              </p>
            </div>
          </div>

          {/* Casting Image Upload - Simple Mode */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Casting Image (Casting Spell - Static)
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleCastingImageUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
                {hasCastingImage && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={sprite.castingImageData}
                      alt="Casting static"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasCastingImage && (
                <button
                  onClick={clearCastingImage}
                  className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                >
                  ✕ Clear Casting Image
                </button>
              )}
              <p className="text-xs text-gray-400">
                {hasCastingImage ? '✓ Casting image uploaded' : 'No casting image - will use idle sprite'}
              </p>
            </div>
          </div>
        </>
      )}

      {/* DIRECTIONAL MODE UPLOADS - Always shown now */}
      {(
        <>
          {/* Direction Selector */}
          <div>
            <label className="block text-sm font-bold mb-2">Direction</label>
            <div className="grid grid-cols-3 gap-1">
              {DIRECTIONS.map((dir) => {
                const dirConfig = sprite.directionalSprites?.[dir.key];
                const hasIdleSS = !!dirConfig?.idleSpriteSheet;
                const hasMovingSS = !!dirConfig?.movingSpriteSheet;
                const hasDeathSS = !!dirConfig?.deathSpriteSheet;
                const hasCastingSS = !!dirConfig?.castingSpriteSheet;
                const hasIdleImg = dirConfig?.idleImageData || dirConfig?.imageData;
                const hasMovingImg = dirConfig?.movingImageData;
                const hasDeathImg = dirConfig?.deathImageData;
                const hasCastingImg = dirConfig?.castingImageData;

                return (
                  <button
                    key={dir.key}
                    onClick={() => setSelectedDirection(dir.key)}
                    className={`p-2 rounded text-xs flex flex-col items-center gap-1 ${
                      selectedDirection === dir.key
                        ? 'bg-purple-600'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <div className="text-sm">{dir.arrow} {dir.label}</div>
                    <div className="flex gap-1 text-[9px]">
                      {hasIdleSS && <span className="text-purple-400" title="Has idle sprite sheet">🎞️</span>}
                      {!hasIdleSS && hasIdleImg && <span className="text-green-400" title="Has idle image">💤</span>}
                      {hasMovingSS && <span className="text-purple-400" title="Has moving sprite sheet">🎬</span>}
                      {!hasMovingSS && hasMovingImg && <span className="text-blue-400" title="Has moving image">🏃</span>}
                      {hasDeathSS && <span className="text-red-400" title="Has death sprite sheet">💀</span>}
                      {!hasDeathSS && hasDeathImg && <span className="text-orange-400" title="Has death image">🪦</span>}
                      {hasCastingSS && <span className="text-yellow-400" title="Has casting sprite sheet">✨</span>}
                      {!hasCastingSS && hasCastingImg && <span className="text-amber-400" title="Has casting image">🔮</span>}
                      {!hasIdleSS && !hasIdleImg && !hasMovingSS && !hasMovingImg && !hasDeathSS && !hasDeathImg && !hasCastingSS && !hasCastingImg && <span className="text-gray-500">—</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={copyToAllDirections}
              className="w-full mt-2 px-3 py-1 text-xs bg-green-600 rounded hover:bg-green-700"
            >
              📋 Copy "{DIRECTIONS.find(d => d.key === selectedDirection)?.label}" to All Directions
            </button>
          </div>

          {/* IDLE & MOVING STATES */}
          <div className="bg-green-950 bg-opacity-30 p-4 rounded border-2 border-green-900">
            <h3 className="text-lg font-semibold mb-3 text-green-400">💤 Idle & Moving States</h3>
            <p className="text-xs text-gray-400 mb-4">
              Sprites for when the unit is idle (not moving) or actively moving
            </p>

          {/* Idle Sprite Sheet Upload */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Idle Sprite Sheet (Not Moving - Animated) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleIdleSpriteSheetUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                />
                {hasIdleSpriteSheet && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-purple-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.idleSpriteSheet?.imageData}
                      alt="Idle sprite sheet"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasIdleSpriteSheet && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={currentConfig.idleSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleIdleSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={currentConfig.idleSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleIdleSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={currentConfig.idleSpriteSheet?.loop !== false}
                      onChange={(e) => handleIdleSpriteSheetConfigChange('loop', e.target.checked)}
                      className="w-4 h-4"
                    />
                    Loop animation
                  </label>
                  <button
                    onClick={clearIdleSpriteSheet}
                    className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                  >
                    ✕ Clear Idle Sprite Sheet
                  </button>
                </>
              )}
              <p className="text-xs text-gray-400">
                {hasIdleSpriteSheet ? '✓ Idle sprite sheet configured' : 'No sprite sheet - use static image below'}
              </p>
              <p className="text-xs text-purple-400">
                💡 Sprite sheets should be horizontal strips with frames of equal width
              </p>
            </div>
          </div>

          {/* Idle Image Upload */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Idle Image (Not Moving - Static) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleIdleImageUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
                {hasIdleImage && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.idleImageData || currentConfig.imageData}
                      alt="Idle static"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
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

          {/* Moving Sprite Sheet Upload */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Moving Sprite Sheet (While Moving - Animated) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleMovingSpriteSheetUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                />
                {hasMovingSpriteSheet && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-purple-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.movingSpriteSheet?.imageData}
                      alt="Moving sprite sheet"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasMovingSpriteSheet && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={currentConfig.movingSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleMovingSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={currentConfig.movingSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleMovingSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={currentConfig.movingSpriteSheet?.loop !== false}
                      onChange={(e) => handleMovingSpriteSheetConfigChange('loop', e.target.checked)}
                      className="w-4 h-4"
                    />
                    Loop animation
                  </label>
                  <button
                    onClick={clearMovingSpriteSheet}
                    className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                  >
                    ✕ Clear Moving Sprite Sheet
                  </button>
                </>
              )}
              <p className="text-xs text-gray-400">
                {hasMovingSpriteSheet ? '✓ Moving sprite sheet configured' : 'No sprite sheet - use static image below'}
              </p>
              <p className="text-xs text-purple-400">
                💡 Sprite sheets should be horizontal strips with frames of equal width
              </p>
            </div>
          </div>

          {/* Moving Image Upload */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Moving Image (While Moving - Static) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleMovingImageUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
                {hasMovingImage && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.movingImageData}
                      alt="Moving static"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
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
            </div>
          </div>
          </div>

          {/* DEATH STATE */}
          <div className="bg-red-950 bg-opacity-30 p-4 rounded border-2 border-red-900">
            <h3 className="text-lg font-semibold mb-3 text-red-400">💀 Death State</h3>
            <p className="text-xs text-gray-400 mb-4">
              Animation that plays when the unit dies (before corpse appears)
            </p>

          {/* Death Sprite Sheet Upload */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Death Sprite Sheet (On Death - Animated) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleDeathSpriteSheetUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-red-600 file:text-white hover:file:bg-red-700"
                />
                {hasDeathSpriteSheet && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-red-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.deathSpriteSheet?.imageData}
                      alt="Death sprite sheet"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasDeathSpriteSheet && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={currentConfig.deathSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleDeathSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={currentConfig.deathSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleDeathSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={currentConfig.deathSpriteSheet?.loop !== false}
                      onChange={(e) => handleDeathSpriteSheetConfigChange('loop', e.target.checked)}
                      className="w-4 h-4"
                    />
                    Loop animation
                  </label>
                  <button
                    onClick={clearDeathSpriteSheet}
                    className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                  >
                    ✕ Clear Death Sprite Sheet
                  </button>
                </>
              )}
              <p className="text-xs text-gray-400">
                {hasDeathSpriteSheet ? '✓ Death sprite sheet configured' : 'No sprite sheet - use static image below'}
              </p>
              <p className="text-xs text-red-400">
                💀 Death animation plays when character/enemy reaches 0 HP
              </p>
            </div>
          </div>

          {/* Death Image Upload */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Death Image (On Death - Static) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleDeathImageUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
                {hasDeathImage && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.deathImageData}
                      alt="Death static"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasDeathImage && (
                <button
                  onClick={clearDeathImage}
                  className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                >
                  ✕ Clear Death Image
                </button>
              )}
              <p className="text-xs text-gray-400">
                {hasDeathImage ? '✓ Death image uploaded' : 'No death image - will show X overlay'}
              </p>
            </div>
          </div>
          </div>

          {/* CASTING STATE */}
          <div className="bg-yellow-950 bg-opacity-30 p-4 rounded border-2 border-yellow-900">
            <h3 className="text-lg font-semibold mb-3 text-yellow-400">✨ Casting State</h3>
            <p className="text-xs text-gray-400 mb-4">
              Animation when casting a spell while stationary (moving animation has priority)
            </p>

          {/* Casting Sprite Sheet Upload - Directional */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Casting Sprite Sheet (Casting Spell - Animated) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleCastingSpriteSheetUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-yellow-600 file:text-white hover:file:bg-yellow-700"
                />
                {hasCastingSpriteSheet && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-yellow-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.castingSpriteSheet?.imageData}
                      alt="Casting sprite sheet"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasCastingSpriteSheet && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={currentConfig.castingSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleCastingSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={currentConfig.castingSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleCastingSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-gray-700 rounded text-white text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={currentConfig.castingSpriteSheet?.loop !== false}
                      onChange={(e) => handleCastingSpriteSheetConfigChange('loop', e.target.checked)}
                      className="w-4 h-4"
                    />
                    Loop animation
                  </label>
                  <button
                    onClick={clearCastingSpriteSheet}
                    className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                  >
                    ✕ Clear Casting Sprite Sheet
                  </button>
                </>
              )}
              <p className="text-xs text-gray-400">
                {hasCastingSpriteSheet ? '✓ Casting sprite sheet configured' : 'No sprite sheet - use static image below'}
              </p>
              <p className="text-xs text-yellow-400">
                ✨ Casting animation plays when character/enemy casts spell while stationary
              </p>
            </div>
          </div>

          {/* Casting Image Upload - Directional */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Casting Image (Casting Spell - Static) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleCastingImageUpload}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
                {hasCastingImage && (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.castingImageData}
                      alt="Casting static"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasCastingImage && (
                <button
                  onClick={clearCastingImage}
                  className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                >
                  ✕ Clear Casting Image
                </button>
              )}
              <p className="text-xs text-gray-400">
                {hasCastingImage ? '✓ Casting image uploaded' : 'No casting image - will use idle sprite'}
              </p>
            </div>
          </div>
          </div>
        </>
      )}

      {/* Note: Corpse appearance is now handled by the final frame of the Death sprite sheet */}

      <div>
        <label className="block text-sm font-bold mb-2">
          Preview ({DIRECTIONS.find(d => d.key === selectedDirection)?.label})
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
  isMoving: boolean = false,
  now: number = Date.now()
) {
  // Check for sprite sheet first (highest priority for animation)
  const spriteSheet = isMoving ? config.movingSpriteSheet : config.idleSpriteSheet;
  if (spriteSheet) {
    const maxSize = (config.size || 0.6) * tileSize;
    drawSpriteSheet(ctx, spriteSheet, centerX, centerY, maxSize, maxSize, now);
    return;
  }

  // Check for uploaded image (PNG/GIF)
  // Use moving sprite if moving and available, otherwise fall back to idle
  const imageToUse = isMoving && config.movingImageData
    ? config.movingImageData
    : (config.idleImageData || config.imageData);

  if (imageToUse) {
    // Use cached image with load notification for GIF animation support
    const img = loadSpriteImage(imageToUse);

    // Draw the image - for GIFs, the browser handles animation automatically
    // We draw even if not fully loaded to ensure GIF animation starts properly
    try {
      const maxSize = (config.size || 0.6) * tileSize;
      let drawWidth = maxSize;
      let drawHeight = maxSize;

      // If image has loaded, preserve aspect ratio
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        if (aspectRatio > 1) {
          drawHeight = maxSize / aspectRatio;
        } else {
          drawWidth = maxSize * aspectRatio;
        }
      }

      ctx.drawImage(img, centerX - drawWidth/2, centerY - drawHeight/2, drawWidth, drawHeight);
    } catch (e) {
      // Image not ready yet, will draw on next frame
    }
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
  isMoving: boolean = false,
  now: number = Date.now()
) {
  // Check if we should use directional sprites
  if (sprite.useDirectional && sprite.directionalSprites) {
    // If direction is provided, use it; otherwise use 'default'
    const dirKey = direction ? mapGameDirectionToSpriteDirection(direction) : 'default';
    const dirConfig = sprite.directionalSprites[dirKey] || sprite.directionalSprites['default'];

    if (dirConfig) {
      drawSpriteConfig(ctx, dirConfig, centerX, centerY, tileSize, isMoving, now);
      return;
    }
  }

  // Check for sprite sheet first (simple mode)
  const simpleSpriteSheet = isMoving ? sprite.movingSpriteSheet : sprite.idleSpriteSheet;
  if (simpleSpriteSheet) {
    const maxSize = (sprite.size || 0.6) * tileSize;
    drawSpriteSheet(ctx, simpleSpriteSheet, centerX, centerY, maxSize, maxSize, now);
    return;
  }

  // Check for simple image sprite (PNG/GIF)
  // Use moving sprite if moving and available, otherwise fall back to idle
  const spriteImageToUse = isMoving && sprite.movingImageData
    ? sprite.movingImageData
    : (sprite.idleImageData || sprite.imageData);

  if (spriteImageToUse) {
    // Use cached image with load notification for GIF animation support
    const img = loadSpriteImage(spriteImageToUse);

    // Draw the image - for GIFs, the browser handles animation automatically
    // We draw even if not fully loaded to ensure GIF animation starts properly
    try {
      const maxSize = (sprite.size || 0.6) * tileSize;
      let drawWidth = maxSize;
      let drawHeight = maxSize;

      // If image has loaded, preserve aspect ratio
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        if (aspectRatio > 1) {
          drawHeight = maxSize / aspectRatio;
        } else {
          drawWidth = maxSize * aspectRatio;
        }
      }

      ctx.drawImage(img, centerX - drawWidth/2, centerY - drawHeight/2, drawWidth, drawHeight);
    } catch (e) {
      // Image not ready yet, will draw on next frame
    }
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
    case Direction.NORTHEAST: return 'ne';
    case Direction.EAST: return 'e';
    case Direction.SOUTHEAST: return 'se';
    case Direction.SOUTH: return 's';
    case Direction.SOUTHWEST: return 'sw';
    case Direction.WEST: return 'w';
    case Direction.NORTHWEST: return 'nw';
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

/**
 * Draw death animation sprite for an entity
 * Returns true if a death sprite was drawn, false if not available
 *
 * @param startTime - When the death occurred (for proper frame calculation)
 *                    For sprite sheets, this ensures animation plays from start and stops on final frame
 */
export function drawDeathSprite(
  ctx: CanvasRenderingContext2D,
  sprite: CustomSprite,
  centerX: number,
  centerY: number,
  tileSize: number,
  direction?: Direction,
  startTime: number = Date.now()
): boolean {
  const maxSize = (sprite.size || 0.6) * tileSize;
  const now = Date.now();

  // Check for directional death sprite first
  if (sprite.useDirectional && sprite.directionalSprites && direction) {
    const dirKey = mapGameDirectionToSpriteDirection(direction);
    const dirConfig = sprite.directionalSprites[dirKey] || sprite.directionalSprites['default'];

    if (dirConfig) {
      // Check for death sprite sheet
      if (dirConfig.deathSpriteSheet) {
        // Force loop=false for death animations so they stop on final frame
        const deathSheet = { ...dirConfig.deathSpriteSheet, loop: false };
        drawSpriteSheetFromStartTime(ctx, deathSheet, centerX, centerY, maxSize, maxSize, startTime, now);
        return true;
      }
      // Check for death image
      if (dirConfig.deathImageData) {
        drawImage(ctx, dirConfig.deathImageData, centerX, centerY, maxSize);
        return true;
      }
    }
  }

  // Check for simple mode death sprite sheet
  if (sprite.deathSpriteSheet) {
    // Force loop=false for death animations so they stop on final frame
    const deathSheet = { ...sprite.deathSpriteSheet, loop: false };
    drawSpriteSheetFromStartTime(ctx, deathSheet, centerX, centerY, maxSize, maxSize, startTime, now);
    return true;
  }

  // Check for simple mode death image
  if (sprite.deathImageData) {
    drawImage(ctx, sprite.deathImageData, centerX, centerY, maxSize);
    return true;
  }

  return false;
}

/**
 * Check if a sprite has any death animation configured
 */
export function hasDeathAnimation(sprite: CustomSprite): boolean {
  // Check simple mode
  if (sprite.deathSpriteSheet || sprite.deathImageData) {
    return true;
  }

  // Check directional sprites
  if (sprite.useDirectional && sprite.directionalSprites) {
    for (const dir of Object.values(sprite.directionalSprites)) {
      if (dir?.deathSpriteSheet || dir?.deathImageData) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Helper to draw an image from cache
 */
function drawImage(
  ctx: CanvasRenderingContext2D,
  imageData: string,
  centerX: number,
  centerY: number,
  maxSize: number
): void {
  const img = loadSpriteImage(imageData);

  try {
    let drawWidth = maxSize;
    let drawHeight = maxSize;

    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const aspectRatio = img.naturalWidth / img.naturalHeight;
      if (aspectRatio > 1) {
        drawHeight = maxSize / aspectRatio;
      } else {
        drawWidth = maxSize * aspectRatio;
      }
    }

    ctx.drawImage(img, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);
  } catch (e) {
    // Image not ready
  }
}
