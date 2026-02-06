import React, { useRef, useEffect, useState } from 'react';
import type { CustomSprite, DirectionalSpriteConfig, SpriteDirection } from '../../utils/assetStorage';
import { Direction } from '../../types/game';
import { getPreviewBgColor, getPreviewBgImageUrl, getPreviewBgTiled, type PreviewType } from '../../utils/themeAssets';
import { subscribeToImageLoads } from '../../utils/imageLoader';

// Preview type for character/enemy sprites (entities)
const ENTITY_PREVIEW_TYPE: PreviewType = 'entity';

// Global image cache for GIF animation support
const globalImageCache = new Map<string, HTMLImageElement>();

// Set of callbacks to notify when sprite images finish loading
const spriteLoadCallbacks = new Set<() => void>();

// Set of images currently loading
const loadingSpriteImages = new Set<string>();

// Flag to schedule a single notification on next frame (for batching)
let pendingSpriteNotification = false;

/**
 * Subscribe to sprite image load events. Returns unsubscribe function.
 */
export function subscribeToSpriteImageLoads(callback: () => void): () => void {
  spriteLoadCallbacks.add(callback);
  return () => spriteLoadCallbacks.delete(callback);
}

/**
 * Notify all subscribers that a sprite image has loaded.
 * Uses requestAnimationFrame to batch multiple load events.
 */
function notifySpriteImageLoaded() {
  if (!pendingSpriteNotification) {
    pendingSpriteNotification = true;
    requestAnimationFrame(() => {
      pendingSpriteNotification = false;
      spriteLoadCallbacks.forEach(cb => cb());
    });
  }
}

/**
 * Load a sprite image with caching and load notification.
 */
function loadSpriteImage(src: string): HTMLImageElement {
  let img = globalImageCache.get(src);
  if (img) {
    // Image exists in cache - check if it's still loading
    if (!img.complete && !loadingSpriteImages.has(src)) {
      // Image in cache but not complete and no handler - re-attach handler
      loadingSpriteImages.add(src);
      img.onload = () => {
        loadingSpriteImages.delete(src);
        notifySpriteImageLoaded();
      };
      img.onerror = () => {
        loadingSpriteImages.delete(src);
      };
    }
    return img;
  }

  // Create new image
  img = new Image();
  globalImageCache.set(src, img);
  loadingSpriteImages.add(src);

  img.onload = () => {
    loadingSpriteImages.delete(src);
    notifySpriteImageLoaded();
  };
  img.onerror = () => {
    loadingSpriteImages.delete(src);
  };

  img.src = src;

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
  now: number,
  anchorX: number = 0.5,
  anchorY: number = 0.5,
  offsetX: number = 0,
  offsetY: number = 0,
  scale: number = 1
): void {
  // Resolve image source from data or URL
  const imageSrc = sheet.imageData || sheet.imageUrl;
  if (!imageSrc) return;

  // Get or create cached image with load notification
  const img = loadSpriteImage(imageSrc);

  // Wait for image to load
  if (!img.complete || img.naturalWidth === 0) return;

  // Get or initialize animation state
  const stateKey = imageSrc;
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

  // Calculate display dimensions preserving aspect ratio, applying per-asset scale
  const frameAspectRatio = frameWidth / frameHeight;
  let finalWidth = displayWidth * scale;
  let finalHeight = displayHeight * scale;

  if (frameAspectRatio > 1) {
    // Frame is wider than tall
    finalHeight = displayWidth * scale / frameAspectRatio;
  } else {
    // Frame is taller than wide
    finalWidth = displayHeight * scale * frameAspectRatio;
  }

  // Draw the current frame
  const sourceX = state.currentFrame * frameWidth;
  const sourceY = 0;

  try {
    ctx.drawImage(
      img,
      sourceX, sourceY, frameWidth, frameHeight, // Source rectangle
      centerX - finalWidth * anchorX + offsetX, centerY - finalHeight * anchorY + offsetY, finalWidth, finalHeight // Destination rectangle
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
  now: number = Date.now(),
  anchorX: number = 0.5,
  anchorY: number = 0.5,
  offsetX: number = 0,
  offsetY: number = 0,
  scale: number = 1
): void {
  // Resolve image source from data or URL
  const imageSrc = sheet.imageData || sheet.imageUrl;
  if (!imageSrc) return;

  // Get or create cached image with load notification
  const img = loadSpriteImage(imageSrc);

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

  // Calculate display dimensions preserving aspect ratio, applying per-asset scale
  const frameAspectRatio = frameWidth / frameHeight;
  let finalWidth = displayWidth * scale;
  let finalHeight = displayHeight * scale;

  if (frameAspectRatio > 1) {
    finalHeight = displayWidth * scale / frameAspectRatio;
  } else {
    finalWidth = displayHeight * scale * frameAspectRatio;
  }

  // Draw the current frame
  const sourceX = currentFrame * frameWidth;
  const sourceY = 0;

  try {
    ctx.drawImage(
      img,
      sourceX, sourceY, frameWidth, frameHeight,
      centerX - finalWidth * anchorX + offsetX, centerY - finalHeight * anchorY + offsetY, finalWidth, finalHeight
    );
  } catch (e) {
    // Image not ready
  }
}

interface SpriteEditorProps {
  sprite: CustomSprite;
  onChange: (sprite: CustomSprite) => void;
  size?: number; // Preview size in pixels
  allowOversized?: boolean; // Allow size > 100% (for enemies/objects that can exceed tile bounds)
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

/**
 * Small inline preview showing how a sprite looks with the current anchor/offset.
 * Renders a tile boundary with the sprite positioned according to anchor settings.
 */
const AnchorPreview: React.FC<{
  imageSrc: string;
  anchorX: number;
  anchorY: number;
  offsetX: number;
  offsetY: number;
  spriteSize: number;
  scale?: number;
  isSpriteSheet?: boolean;
  frameCount?: number;
}> = ({ imageSrc, anchorX, anchorY, offsetX, offsetY, spriteSize, scale = 1, isSpriteSheet, frameCount }) => {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const previewSize = 80;

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Account for device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = previewSize * dpr;
    canvas.height = previewSize * dpr;
    ctx.scale(dpr, dpr);

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, previewSize, previewSize);

      // Draw tile boundary
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(1, 1, previewSize - 2, previewSize - 2);

      // Draw center crosshair
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(previewSize / 2, 0);
      ctx.lineTo(previewSize / 2, previewSize);
      ctx.moveTo(0, previewSize / 2);
      ctx.lineTo(previewSize, previewSize / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Calculate sprite dimensions
      const maxSize = spriteSize * previewSize * scale;
      // For sprite sheets, use first frame only
      const srcWidth = isSpriteSheet && frameCount ? img.naturalWidth / frameCount : img.naturalWidth;
      const srcHeight = img.naturalHeight;
      const aspectRatio = srcWidth / srcHeight;
      let drawWidth = maxSize;
      let drawHeight = maxSize;
      if (aspectRatio > 1) {
        drawHeight = maxSize / aspectRatio;
      } else {
        drawWidth = maxSize * aspectRatio;
      }

      // Scale offset proportionally to preview size
      const offsetScale = previewSize / 64; // normalize to ~64px tile
      const scaledOx = offsetX * offsetScale;
      const scaledOy = offsetY * offsetScale;

      // Draw first frame with anchor applied
      const dx = previewSize / 2 - drawWidth * anchorX + scaledOx;
      const dy = previewSize / 2 - drawHeight * anchorY + scaledOy;
      // Use pixelated rendering for crisp sprites
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, srcWidth, srcHeight, dx, dy, drawWidth, drawHeight);
    };
    img.src = imageSrc;
  }, [imageSrc, anchorX, anchorY, offsetX, offsetY, spriteSize, scale, isSpriteSheet, frameCount]);

  return (
    <canvas
      ref={previewRef}
      className="rounded border border-stone-600 bg-stone-900 flex-shrink-0"
      style={{ width: previewSize, height: previewSize }}
    />
  );
};

export const SpriteEditor: React.FC<SpriteEditorProps> = ({ sprite, onChange, size = PREVIEW_SIZE, allowOversized = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedDirection, setSelectedDirection] = useState<SpriteDirection>('default');
  // Always use directional mode - 'default' direction serves as universal fallback
  const spriteMode = 'directional' as const;
  // Trigger re-render when background images load
  const [renderTrigger, setRenderTrigger] = useState(0);

  // Subscribe to image load events to re-render when background images finish loading
  useEffect(() => {
    const unsubscribe = subscribeToImageLoads(() => {
      setRenderTrigger(prev => prev + 1);
    });
    return unsubscribe;
  }, []);
  // URL input states
  const [showIdleImageUrl, setShowIdleImageUrl] = useState(false);
  const [idleImageUrlInput, setIdleImageUrlInput] = useState('');
  const [showIdleSpriteSheetUrl, setShowIdleSpriteSheetUrl] = useState(false);
  const [idleSpriteSheetUrlInput, setIdleSpriteSheetUrlInput] = useState('');
  const [showMovingImageUrl, setShowMovingImageUrl] = useState(false);
  const [movingImageUrlInput, setMovingImageUrlInput] = useState('');
  const [showMovingSpriteSheetUrl, setShowMovingSpriteSheetUrl] = useState(false);
  const [movingSpriteSheetUrlInput, setMovingSpriteSheetUrlInput] = useState('');
  const [showDeathImageUrl, setShowDeathImageUrl] = useState(false);
  const [deathImageUrlInput, setDeathImageUrlInput] = useState('');
  const [showDeathSpriteSheetUrl, setShowDeathSpriteSheetUrl] = useState(false);
  const [deathSpriteSheetUrlInput, setDeathSpriteSheetUrlInput] = useState('');
  const [showCastingImageUrl, setShowCastingImageUrl] = useState(false);
  const [castingImageUrlInput, setCastingImageUrlInput] = useState('');
  const [showCastingSpriteSheetUrl, setShowCastingSpriteSheetUrl] = useState(false);
  const [castingSpriteSheetUrlInput, setCastingSpriteSheetUrlInput] = useState('');
  const [showSpawnImageUrl, setShowSpawnImageUrl] = useState(false);
  const [spawnImageUrlInput, setSpawnImageUrlInput] = useState('');
  const [showSpawnSpriteSheetUrl, setShowSpawnSpriteSheetUrl] = useState(false);
  const [spawnSpriteSheetUrlInput, setSpawnSpriteSheetUrlInput] = useState('');

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
      // Clear (background is handled by CSS on parent div)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw tile boundary guide (dashed outline)
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
      ctx.restore();

      // Draw center crosshair
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.width / 2, canvas.height);
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      ctx.restore();

      // Helper to draw an image with anchor/offset applied
      const drawImageWithAnchor = (
        img: HTMLImageElement,
        sizeScale: number,
        ax: number, ay: number, ox: number, oy: number
      ) => {
        const maxSize = sizeScale * canvas.width;
        const aspectRatio = img.width / img.height;
        let drawWidth = maxSize;
        let drawHeight = maxSize;
        if (aspectRatio > 1) {
          drawHeight = maxSize / aspectRatio;
        } else {
          drawWidth = maxSize * aspectRatio;
        }
        ctx.drawImage(img, canvas.width / 2 - drawWidth * ax + ox, canvas.height / 2 - drawHeight * ay + oy, drawWidth, drawHeight);
      };

      // Draw sprite based on mode
      if (spriteMode === 'directional' && sprite.directionalSprites) {
        const dirSprite = sprite.directionalSprites[selectedDirection] || sprite.directionalSprites['default'];
        if (dirSprite) {
          // Check for sprite sheet first
          if (dirSprite.idleSpriteSheet && (dirSprite.idleSpriteSheet.imageData || dirSprite.idleSpriteSheet.imageUrl)) {
            drawSpriteConfig(ctx, dirSprite, canvas.width / 2, canvas.height / 2, canvas.width);
          } else {
            // Check for image data OR URL
            const imageToShow = dirSprite.idleImageData || dirSprite.idleImageUrl || dirSprite.imageData || dirSprite.imageUrl;
            if (imageToShow) {
              const ax = dirSprite.idleAnchorX ?? 0.5;
              const ay = dirSprite.idleAnchorY ?? 0.5;
              const ox = dirSprite.idleOffsetX ?? 0;
              const oy = dirSprite.idleOffsetY ?? 0;
              const img = new Image();
              img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                // Redraw guides
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
                ctx.restore();
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.setLineDash([2, 4]);
                ctx.beginPath();
                ctx.moveTo(canvas.width / 2, 0);
                ctx.lineTo(canvas.width / 2, canvas.height);
                ctx.moveTo(0, canvas.height / 2);
                ctx.lineTo(canvas.width, canvas.height / 2);
                ctx.stroke();
                ctx.restore();
                drawImageWithAnchor(img, dirSprite.size || 0.6, ax, ay, ox, oy);
              };
              img.src = imageToShow;
            } else {
              drawSpriteConfig(ctx, dirSprite, canvas.width / 2, canvas.height / 2, canvas.width);
            }
          }
        }
      } else {
        // Simple mode - check for sprite sheet first
        if (sprite.idleSpriteSheet && (sprite.idleSpriteSheet.imageData || sprite.idleSpriteSheet.imageUrl)) {
          drawSprite(ctx, sprite, canvas.width / 2, canvas.height / 2, canvas.width);
        } else {
          const simpleImageToShow = sprite.idleImageData || sprite.idleImageUrl || sprite.imageData || sprite.imageUrl;
          if (simpleImageToShow) {
            const ax = sprite.idleAnchorX ?? 0.5;
            const ay = sprite.idleAnchorY ?? 0.5;
            const ox = sprite.idleOffsetX ?? 0;
            const oy = sprite.idleOffsetY ?? 0;
            const img = new Image();
            img.onload = () => {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              // Redraw guides
              ctx.save();
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
              ctx.setLineDash([4, 4]);
              ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
              ctx.restore();
              ctx.save();
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
              ctx.setLineDash([2, 4]);
              ctx.beginPath();
              ctx.moveTo(canvas.width / 2, 0);
              ctx.lineTo(canvas.width / 2, canvas.height);
              ctx.moveTo(0, canvas.height / 2);
              ctx.lineTo(canvas.width, canvas.height / 2);
              ctx.stroke();
              ctx.restore();
              drawImageWithAnchor(img, sprite.size || 0.6, ax, ay, ox, oy);
            };
            img.src = simpleImageToShow;
          } else {
            drawSprite(ctx, sprite, canvas.width / 2, canvas.height / 2, canvas.width);
          }
        }
      }
    };

    renderPreview();
  }, [sprite, selectedDirection, spriteMode, renderTrigger]);

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
        const { imageData, idleImageData, idleImageUrl, imageUrl, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { imageData, idleImageData, idleImageUrl, imageUrl, ...rest } = sprite;
      onChange({ ...rest, type: 'simple' });
    }
  };

  // URL setter for idle image
  const setIdleImageUrl = (url: string) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      onChange({
        ...sprite,
        directionalSprites: {
          ...dirSprites,
          [selectedDirection]: {
            ...(dirSprites[selectedDirection] || {}),
            idleImageUrl: url,
            imageUrl: url, // Backwards compat
            // Clear base64 data when setting URL
            idleImageData: undefined,
            imageData: undefined,
          },
        },
      });
    } else {
      onChange({
        ...sprite,
        type: 'image',
        idleImageUrl: url,
        imageUrl: url, // Backwards compat
        // Clear base64 data when setting URL
        idleImageData: undefined,
        imageData: undefined,
      });
    }
  };

  const clearMovingImage = () => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (currentConfig) {
        const { movingImageData, movingImageUrl, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { movingImageData, movingImageUrl, ...rest } = sprite;
      onChange({ ...rest });
    }
  };

  // URL setter for moving image
  const setMovingImageUrl = (url: string) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      onChange({
        ...sprite,
        directionalSprites: {
          ...dirSprites,
          [selectedDirection]: {
            ...(dirSprites[selectedDirection] || {}),
            movingImageUrl: url,
            movingImageData: undefined,
          },
        },
      });
    } else {
      onChange({
        ...sprite,
        movingImageUrl: url,
        movingImageData: undefined,
      });
    }
  };

  // URL setter for idle sprite sheet
  const setIdleSpriteSheetUrl = (url: string) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      const existingSheet = currentConfig?.idleSpriteSheet;
      onChange({
        ...sprite,
        directionalSprites: {
          ...dirSprites,
          [selectedDirection]: {
            ...(currentConfig || {}),
            idleSpriteSheet: {
              imageUrl: url,
              imageData: undefined,
              frameCount: existingSheet?.frameCount || 4,
              frameRate: existingSheet?.frameRate || 10,
              loop: existingSheet?.loop ?? true,
            },
          },
        },
      });
    } else {
      const existingSheet = sprite.idleSpriteSheet;
      onChange({
        ...sprite,
        idleSpriteSheet: {
          imageUrl: url,
          imageData: undefined,
          frameCount: existingSheet?.frameCount || 4,
          frameRate: existingSheet?.frameRate || 10,
          loop: existingSheet?.loop ?? true,
        },
      });
    }
  };

  // URL setter for moving sprite sheet
  const setMovingSpriteSheetUrl = (url: string) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      const existingSheet = currentConfig?.movingSpriteSheet;
      onChange({
        ...sprite,
        directionalSprites: {
          ...dirSprites,
          [selectedDirection]: {
            ...(currentConfig || {}),
            movingSpriteSheet: {
              imageUrl: url,
              imageData: undefined,
              frameCount: existingSheet?.frameCount || 4,
              frameRate: existingSheet?.frameRate || 10,
              loop: existingSheet?.loop ?? true,
            },
          },
        },
      });
    } else {
      const existingSheet = sprite.movingSpriteSheet;
      onChange({
        ...sprite,
        movingSpriteSheet: {
          imageUrl: url,
          imageData: undefined,
          frameCount: existingSheet?.frameCount || 4,
          frameRate: existingSheet?.frameRate || 10,
          loop: existingSheet?.loop ?? true,
        },
      });
    }
  };

  // URL setter for death image
  const setDeathImageUrl = (url: string) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      onChange({
        ...sprite,
        directionalSprites: {
          ...dirSprites,
          [selectedDirection]: {
            ...(dirSprites[selectedDirection] || {}),
            deathImageUrl: url,
            deathImageData: undefined,
          },
        },
      });
    } else {
      onChange({
        ...sprite,
        deathImageUrl: url,
        deathImageData: undefined,
      });
    }
  };

  // URL setter for death sprite sheet
  const setDeathSpriteSheetUrl = (url: string) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      const existingSheet = currentConfig?.deathSpriteSheet;
      onChange({
        ...sprite,
        directionalSprites: {
          ...dirSprites,
          [selectedDirection]: {
            ...(currentConfig || {}),
            deathSpriteSheet: {
              imageUrl: url,
              imageData: undefined,
              frameCount: existingSheet?.frameCount || 4,
              frameRate: existingSheet?.frameRate || 10,
              loop: existingSheet?.loop ?? false,
            },
          },
        },
      });
    } else {
      const existingSheet = sprite.deathSpriteSheet;
      onChange({
        ...sprite,
        deathSpriteSheet: {
          imageUrl: url,
          imageData: undefined,
          frameCount: existingSheet?.frameCount || 4,
          frameRate: existingSheet?.frameRate || 10,
          loop: existingSheet?.loop ?? false,
        },
      });
    }
  };

  // URL setter for casting image
  const setCastingImageUrl = (url: string) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      onChange({
        ...sprite,
        directionalSprites: {
          ...dirSprites,
          [selectedDirection]: {
            ...(dirSprites[selectedDirection] || {}),
            castingImageUrl: url,
            castingImageData: undefined,
          },
        },
      });
    } else {
      onChange({
        ...sprite,
        castingImageUrl: url,
        castingImageData: undefined,
      });
    }
  };

  // URL setter for casting sprite sheet
  const setCastingSpriteSheetUrl = (url: string) => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      const existingSheet = currentConfig?.castingSpriteSheet;
      onChange({
        ...sprite,
        directionalSprites: {
          ...dirSprites,
          [selectedDirection]: {
            ...(currentConfig || {}),
            castingSpriteSheet: {
              imageUrl: url,
              imageData: undefined,
              frameCount: existingSheet?.frameCount || 4,
              frameRate: existingSheet?.frameRate || 10,
              loop: existingSheet?.loop ?? false,
            },
          },
        },
      });
    } else {
      const existingSheet = sprite.castingSpriteSheet;
      onChange({
        ...sprite,
        castingSpriteSheet: {
          imageUrl: url,
          imageData: undefined,
          frameCount: existingSheet?.frameCount || 4,
          frameRate: existingSheet?.frameRate || 10,
          loop: existingSheet?.loop ?? false,
        },
      });
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

  const handleIdleSpriteSheetConfigChange = (field: string, value: any) => {
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

  const handleMovingSpriteSheetConfigChange = (field: string, value: any) => {
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
    ? (sprite.directionalSprites?.[selectedDirection]?.idleSpriteSheet?.imageData || sprite.directionalSprites?.[selectedDirection]?.idleSpriteSheet?.imageUrl)
    : (sprite.idleSpriteSheet?.imageData || sprite.idleSpriteSheet?.imageUrl);

  const hasMovingSpriteSheet = spriteMode === 'directional'
    ? (sprite.directionalSprites?.[selectedDirection]?.movingSpriteSheet?.imageData || sprite.directionalSprites?.[selectedDirection]?.movingSpriteSheet?.imageUrl)
    : (sprite.movingSpriteSheet?.imageData || sprite.movingSpriteSheet?.imageUrl);

  const hasIdleImage = spriteMode === 'directional'
    ? (sprite.directionalSprites?.[selectedDirection]?.idleImageData || sprite.directionalSprites?.[selectedDirection]?.imageData || sprite.directionalSprites?.[selectedDirection]?.idleImageUrl || sprite.directionalSprites?.[selectedDirection]?.imageUrl)
    : (sprite.idleImageData || sprite.imageData || sprite.idleImageUrl || sprite.imageUrl);

  const hasMovingImage = spriteMode === 'directional'
    ? (sprite.directionalSprites?.[selectedDirection]?.movingImageData || sprite.directionalSprites?.[selectedDirection]?.movingImageUrl)
    : (sprite.movingImageData || sprite.movingImageUrl);

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
        const { deathImageData, deathImageUrl, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { deathImageData, deathImageUrl, ...rest } = sprite;
      onChange({ ...rest });
    }
  };

  const hasDeathSpriteSheet = spriteMode === 'directional'
    ? (sprite.directionalSprites?.[selectedDirection]?.deathSpriteSheet?.imageData || sprite.directionalSprites?.[selectedDirection]?.deathSpriteSheet?.imageUrl)
    : (sprite.deathSpriteSheet?.imageData || sprite.deathSpriteSheet?.imageUrl);

  const hasDeathImage = spriteMode === 'directional'
    ? (sprite.directionalSprites?.[selectedDirection]?.deathImageData || sprite.directionalSprites?.[selectedDirection]?.deathImageUrl)
    : (sprite.deathImageData || sprite.deathImageUrl);

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
        loop: false, // Casting animation plays once by default
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
        const { castingImageData, castingImageUrl, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { castingImageData, castingImageUrl, ...rest } = sprite;
      onChange({ ...rest });
    }
  };

  const hasCastingSpriteSheet = spriteMode === 'directional'
    ? (sprite.directionalSprites?.[selectedDirection]?.castingSpriteSheet?.imageData || sprite.directionalSprites?.[selectedDirection]?.castingSpriteSheet?.imageUrl)
    : (sprite.castingSpriteSheet?.imageData || sprite.castingSpriteSheet?.imageUrl);

  const hasCastingImage = spriteMode === 'directional'
    ? (sprite.directionalSprites?.[selectedDirection]?.castingImageData || sprite.directionalSprites?.[selectedDirection]?.castingImageUrl)
    : (sprite.castingImageData || sprite.castingImageUrl);

  // Spawn animation handlers (NOT directional - same for all directions)
  const handleSpawnImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const spawnImageData = event.target?.result as string;
      onChange({
        ...sprite,
        spawnImageData,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSpawnSpriteSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        loop: false, // Spawn animation plays once
      };

      onChange({
        ...sprite,
        spawnSpriteSheet: spriteSheetConfig,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSpawnSpriteSheetConfigChange = (field: string, value: any) => {
    if (sprite.spawnSpriteSheet) {
      onChange({
        ...sprite,
        spawnSpriteSheet: {
          ...sprite.spawnSpriteSheet,
          [field]: value,
        },
      });
    }
  };

  const clearSpawnSpriteSheet = () => {
    const { spawnSpriteSheet, ...rest } = sprite;
    onChange({ ...rest });
  };

  const clearSpawnImage = () => {
    const { spawnImageData, spawnImageUrl, spawnAnchorX, spawnAnchorY, spawnOffsetX, spawnOffsetY, spawnScale, ...rest } = sprite;
    onChange({ ...rest });
  };

  // URL setter for spawn image
  const setSpawnImageUrl = (url: string) => {
    onChange({
      ...sprite,
      spawnImageUrl: url,
      spawnImageData: undefined,
    });
  };

  // URL setter for spawn sprite sheet
  const setSpawnSpriteSheetUrl = (url: string) => {
    const existingSheet = sprite.spawnSpriteSheet;
    onChange({
      ...sprite,
      spawnSpriteSheet: {
        imageUrl: url,
        imageData: undefined,
        frameCount: existingSheet?.frameCount || 4,
        frameRate: existingSheet?.frameRate || 10,
        loop: existingSheet?.loop ?? false,
      },
    });
  };

  const hasSpawnSpriteSheetConfig = sprite.spawnSpriteSheet?.imageData || sprite.spawnSpriteSheet?.imageUrl;
  const hasSpawnImageConfig = sprite.spawnImageData || sprite.spawnImageUrl;

  // Helper to render compact anchor point grid + offset sliders + scale slider with inline preview
  const renderAnchorControls = (
    anchorX: number = 0.5,
    anchorY: number = 0.5,
    offsetX: number = 0,
    offsetY: number = 0,
    onAnchorChange: (ax: number, ay: number) => void,
    onOffsetChange: (field: 'offsetX' | 'offsetY', val: number) => void,
    previewImageSrc?: string,
    previewSpriteSheet?: import('../../utils/assetStorage').SpriteSheetConfig,
    scaleValue: number = 1,
    onScaleChange?: (val: number) => void,
  ) => {
    const anchorPoints: { label: string; x: number; y: number }[] = [
      { label: 'TL', x: 0, y: 0 }, { label: 'T', x: 0.5, y: 0 }, { label: 'TR', x: 1, y: 0 },
      { label: 'L', x: 0, y: 0.5 }, { label: 'C', x: 0.5, y: 0.5 }, { label: 'R', x: 1, y: 0.5 },
      { label: 'BL', x: 0, y: 1 }, { label: 'B', x: 0.5, y: 1 }, { label: 'BR', x: 1, y: 1 },
    ];

    // Determine preview source
    const imgSrc = previewSpriteSheet
      ? (previewSpriteSheet.imageData || previewSpriteSheet.imageUrl)
      : previewImageSrc;

    return (
      <div className="mt-2 p-2 bg-stone-800 rounded border border-stone-600">
        <div className="text-[10px] text-stone-400 mb-1 font-bold">Anchor Point</div>
        <div className="flex items-start gap-3">
          <div>
            <div className="grid grid-cols-3 gap-0.5 w-fit mb-2">
              {anchorPoints.map((pt) => (
                <button
                  key={pt.label}
                  type="button"
                  onClick={() => onAnchorChange(pt.x, pt.y)}
                  className={`w-6 h-6 text-[9px] rounded border ${
                    anchorX === pt.x && anchorY === pt.y
                      ? 'bg-arcane-600 border-arcane-400 text-white font-bold'
                      : 'bg-stone-700 border-stone-600 text-stone-400 hover:bg-stone-600'
                  }`}
                >
                  {pt.label}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-stone-400 w-10">Off X</label>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={offsetX}
                  onChange={(e) => onOffsetChange('offsetX', parseInt(e.target.value))}
                  className="flex-1 h-3"
                />
                <span className="text-[10px] text-stone-300 w-6 text-right">{offsetX}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-stone-400 w-10">Off Y</label>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={offsetY}
                  onChange={(e) => onOffsetChange('offsetY', parseInt(e.target.value))}
                  className="flex-1 h-3"
                />
                <span className="text-[10px] text-stone-300 w-6 text-right">{offsetY}</span>
              </div>
              {onScaleChange && (
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-stone-400 w-10">Scale</label>
                  <input
                    type="range"
                    min="0.25"
                    max="2"
                    step="0.05"
                    value={scaleValue}
                    onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                    className="flex-1 h-3"
                  />
                  <span className="text-[10px] text-stone-300 w-6 text-right">{scaleValue.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
          {/* Inline anchor preview */}
          {imgSrc && (
            <AnchorPreview
              imageSrc={imgSrc}
              anchorX={anchorX}
              anchorY={anchorY}
              offsetX={offsetX}
              offsetY={offsetY}
              spriteSize={currentConfig.size || sprite.size || 0.6}
              scale={scaleValue}
              isSpriteSheet={!!previewSpriteSheet}
              frameCount={previewSpriteSheet?.frameCount}
            />
          )}
        </div>
      </div>
    );
  };

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
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-purple-600 file:text-parchment-100 hover:file:bg-purple-700"
                />
                {hasIdleSpriteSheet && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-purple-600 flex items-center justify-center overflow-hidden flex-shrink-0">
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
                      <label className="block text-xs text-stone-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={sprite.idleSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleIdleSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={sprite.idleSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleIdleSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-stone-400">
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
              <p className="text-xs text-stone-400">
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
                  accept="image/png,image/jpg,image/jpeg,image/gif,image/webp"
                  onChange={handleIdleImageUpload}
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-parchment-100 hover:file:bg-blue-700"
                />
                {hasIdleImage && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-stone-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={sprite.idleImageData || sprite.imageData || sprite.idleImageUrl || sprite.imageUrl}
                      alt="Static image"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* URL Input Toggle */}
              <button
                type="button"
                onClick={() => setShowIdleImageUrl(!showIdleImageUrl)}
                className="text-xs text-arcane-400 hover:text-arcane-300"
              >
                {showIdleImageUrl ? '▼ Hide URL input' : '▶ Or use image URL...'}
              </button>

              {/* URL Input */}
              {showIdleImageUrl && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={idleImageUrlInput}
                    onChange={(e) => setIdleImageUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && idleImageUrlInput.trim()) {
                        setIdleImageUrl(idleImageUrlInput.trim());
                        setIdleImageUrlInput('');
                      }
                    }}
                    placeholder="https://your-storage.com/sprite.png"
                    className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (idleImageUrlInput.trim()) {
                        setIdleImageUrl(idleImageUrlInput.trim());
                        setIdleImageUrlInput('');
                      }
                    }}
                    className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
                  >
                    Set
                  </button>
                </div>
              )}

              {hasIdleImage && (
                <button
                  onClick={clearIdleImage}
                  className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                >
                  ✕ Clear Static Image
                </button>
              )}
              <p className="text-xs text-stone-400">
                {hasIdleImage
                  ? (sprite.idleImageUrl || sprite.imageUrl) && !(sprite.idleImageData || sprite.imageData)
                    ? '✓ Using URL'
                    : '✓ Static image uploaded'
                  : 'No static image - using shapes/colors'}
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
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-red-600 file:text-parchment-100 hover:file:bg-red-700"
                />
                {hasDeathSpriteSheet && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-red-600 flex items-center justify-center overflow-hidden flex-shrink-0">
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
                      <label className="block text-xs text-stone-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={sprite.deathSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleDeathSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={sprite.deathSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleDeathSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-stone-400">
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
              <p className="text-xs text-stone-400">
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
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-parchment-100 hover:file:bg-blue-700"
                />
                {hasDeathImage && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-stone-600 flex items-center justify-center overflow-hidden flex-shrink-0">
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
              <p className="text-xs text-stone-400">
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
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-yellow-600 file:text-parchment-100 hover:file:bg-yellow-700"
                />
                {hasCastingSpriteSheet && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-yellow-600 flex items-center justify-center overflow-hidden flex-shrink-0">
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
                      <label className="block text-xs text-stone-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={sprite.castingSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleCastingSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={sprite.castingSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleCastingSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-stone-400">
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
              <p className="text-xs text-stone-400">
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
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-parchment-100 hover:file:bg-blue-700"
                />
                {hasCastingImage && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-stone-600 flex items-center justify-center overflow-hidden flex-shrink-0">
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
              <p className="text-xs text-stone-400">
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
                        : 'bg-stone-700 hover:bg-stone-600'
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
                      {!hasIdleSS && !hasIdleImg && !hasMovingSS && !hasMovingImg && !hasDeathSS && !hasDeathImg && !hasCastingSS && !hasCastingImg && <span className="text-stone-500">—</span>}
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
            <p className="text-xs text-stone-400 mb-4">
              Sprites for when the unit is idle (not moving) or actively moving
            </p>

          {/* Idle Sprite Sheet Upload - hidden when idle image is set */}
          {!hasIdleImage && (<div>
            <label className="block text-sm font-bold mb-2">
              Idle Sprite Sheet (Not Moving - Animated) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleIdleSpriteSheetUpload}
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-purple-600 file:text-parchment-100 hover:file:bg-purple-700"
                />
                {hasIdleSpriteSheet && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-purple-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.idleSpriteSheet?.imageData || currentConfig.idleSpriteSheet?.imageUrl}
                      alt="Idle sprite sheet"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* URL Input Toggle */}
              <button
                type="button"
                onClick={() => setShowIdleSpriteSheetUrl(!showIdleSpriteSheetUrl)}
                className="text-xs text-arcane-400 hover:text-arcane-300"
              >
                {showIdleSpriteSheetUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
              </button>

              {/* URL Input */}
              {showIdleSpriteSheetUrl && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={idleSpriteSheetUrlInput}
                    onChange={(e) => setIdleSpriteSheetUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && idleSpriteSheetUrlInput.trim()) {
                        setIdleSpriteSheetUrl(idleSpriteSheetUrlInput.trim());
                        setIdleSpriteSheetUrlInput('');
                      }
                    }}
                    placeholder="https://your-storage.com/spritesheet.png"
                    className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (idleSpriteSheetUrlInput.trim()) {
                        setIdleSpriteSheetUrl(idleSpriteSheetUrlInput.trim());
                        setIdleSpriteSheetUrlInput('');
                      }
                    }}
                    className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
                  >
                    Set
                  </button>
                </div>
              )}

              {hasIdleSpriteSheet && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={currentConfig.idleSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleIdleSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={currentConfig.idleSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleIdleSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-stone-400">
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
                  {renderAnchorControls(
                    currentConfig.idleSpriteSheet?.anchorX ?? 0.5,
                    currentConfig.idleSpriteSheet?.anchorY ?? 0.5,
                    currentConfig.idleSpriteSheet?.offsetX ?? 0,
                    currentConfig.idleSpriteSheet?.offsetY ?? 0,
                    (ax, ay) => { handleIdleSpriteSheetConfigChange('anchorX', ax); handleIdleSpriteSheetConfigChange('anchorY', ay); },
                    (field, val) => handleIdleSpriteSheetConfigChange(field, val),
                    undefined,
                    currentConfig.idleSpriteSheet,
                    currentConfig.idleSpriteSheet?.scale ?? 1,
                    (val) => handleIdleSpriteSheetConfigChange('scale', val === 1 ? undefined : val),
                  )}
                </>
              )}
              <p className="text-xs text-stone-400">
                {hasIdleSpriteSheet
                  ? currentConfig.idleSpriteSheet?.imageUrl && !currentConfig.idleSpriteSheet?.imageData
                    ? '✓ Using URL'
                    : '✓ Idle sprite sheet configured'
                  : 'No sprite sheet - use static image below'}
              </p>
              <p className="text-xs text-purple-400">
                💡 Sprite sheets should be horizontal strips with frames of equal width
              </p>
            </div>
          </div>)}

          {/* Idle Image Upload - hidden when idle spritesheet is set */}
          {!hasIdleSpriteSheet && (<div>
            <label className="block text-sm font-bold mb-2">
              Idle Image (Not Moving - Static) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg,image/gif,image/webp"
                  onChange={handleIdleImageUpload}
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-parchment-100 hover:file:bg-blue-700"
                />
                {hasIdleImage && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-stone-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.idleImageData || currentConfig.imageData || currentConfig.idleImageUrl || currentConfig.imageUrl}
                      alt="Idle static"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* URL Input Toggle */}
              <button
                type="button"
                onClick={() => setShowIdleImageUrl(!showIdleImageUrl)}
                className="text-xs text-arcane-400 hover:text-arcane-300"
              >
                {showIdleImageUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
              </button>

              {/* URL Input */}
              {showIdleImageUrl && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={idleImageUrlInput}
                    onChange={(e) => setIdleImageUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && idleImageUrlInput.trim()) {
                        setIdleImageUrl(idleImageUrlInput.trim());
                        setIdleImageUrlInput('');
                      }
                    }}
                    placeholder="https://your-storage.com/sprite.png"
                    className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (idleImageUrlInput.trim()) {
                        setIdleImageUrl(idleImageUrlInput.trim());
                        setIdleImageUrlInput('');
                      }
                    }}
                    className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
                  >
                    Set
                  </button>
                </div>
              )}

              {hasIdleImage && (
                <>
                <button
                  onClick={clearIdleImage}
                  className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                >
                  ✕ Clear Idle Image
                </button>
                {renderAnchorControls(
                  currentConfig.idleAnchorX ?? 0.5,
                  currentConfig.idleAnchorY ?? 0.5,
                  currentConfig.idleOffsetX ?? 0,
                  currentConfig.idleOffsetY ?? 0,
                  (ax, ay) => {
                    const dirSprites = sprite.directionalSprites || {};
                    onChange({ ...sprite, directionalSprites: { ...dirSprites, [selectedDirection]: { ...currentConfig, idleAnchorX: ax, idleAnchorY: ay } } });
                  },
                  (field, val) => {
                    const dirSprites = sprite.directionalSprites || {};
                    const key = field === 'offsetX' ? 'idleOffsetX' : 'idleOffsetY';
                    onChange({ ...sprite, directionalSprites: { ...dirSprites, [selectedDirection]: { ...currentConfig, [key]: val } } });
                  },
                  currentConfig.idleImageData || currentConfig.imageData || currentConfig.idleImageUrl || currentConfig.imageUrl,
                  undefined,
                  currentConfig.idleScale ?? 1,
                  (val) => {
                    const dirSprites = sprite.directionalSprites || {};
                    onChange({ ...sprite, directionalSprites: { ...dirSprites, [selectedDirection]: { ...currentConfig, idleScale: val === 1 ? undefined : val } } });
                  },
                )}
                </>
              )}
              <p className="text-xs text-stone-400">
                {hasIdleImage
                  ? (currentConfig.idleImageUrl || currentConfig.imageUrl) && !(currentConfig.idleImageData || currentConfig.imageData)
                    ? '✓ Using URL'
                    : '✓ Idle image uploaded'
                  : 'No idle image - using shapes/colors'}
              </p>
            </div>
          </div>)}

          {/* Moving Sprite Sheet Upload - hidden when moving image is set */}
          {!hasMovingImage && (<div>
            <label className="block text-sm font-bold mb-2">
              Moving Sprite Sheet (While Moving - Animated) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleMovingSpriteSheetUpload}
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-purple-600 file:text-parchment-100 hover:file:bg-purple-700"
                />
                {hasMovingSpriteSheet && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-purple-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.movingSpriteSheet?.imageData || currentConfig.movingSpriteSheet?.imageUrl}
                      alt="Moving sprite sheet"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* URL Input Toggle */}
              <button
                type="button"
                onClick={() => setShowMovingSpriteSheetUrl(!showMovingSpriteSheetUrl)}
                className="text-xs text-arcane-400 hover:text-arcane-300"
              >
                {showMovingSpriteSheetUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
              </button>

              {/* URL Input */}
              {showMovingSpriteSheetUrl && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={movingSpriteSheetUrlInput}
                    onChange={(e) => setMovingSpriteSheetUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && movingSpriteSheetUrlInput.trim()) {
                        setMovingSpriteSheetUrl(movingSpriteSheetUrlInput.trim());
                        setMovingSpriteSheetUrlInput('');
                      }
                    }}
                    placeholder="https://your-storage.com/spritesheet.png"
                    className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (movingSpriteSheetUrlInput.trim()) {
                        setMovingSpriteSheetUrl(movingSpriteSheetUrlInput.trim());
                        setMovingSpriteSheetUrlInput('');
                      }
                    }}
                    className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
                  >
                    Set
                  </button>
                </div>
              )}

              {hasMovingSpriteSheet && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={currentConfig.movingSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleMovingSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={currentConfig.movingSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleMovingSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-stone-400">
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
                  {renderAnchorControls(
                    currentConfig.movingSpriteSheet?.anchorX ?? 0.5,
                    currentConfig.movingSpriteSheet?.anchorY ?? 0.5,
                    currentConfig.movingSpriteSheet?.offsetX ?? 0,
                    currentConfig.movingSpriteSheet?.offsetY ?? 0,
                    (ax, ay) => { handleMovingSpriteSheetConfigChange('anchorX', ax); handleMovingSpriteSheetConfigChange('anchorY', ay); },
                    (field, val) => handleMovingSpriteSheetConfigChange(field, val),
                    undefined,
                    currentConfig.movingSpriteSheet,
                    currentConfig.movingSpriteSheet?.scale ?? 1,
                    (val) => handleMovingSpriteSheetConfigChange('scale', val === 1 ? undefined : val),
                  )}
                </>
              )}
              <p className="text-xs text-stone-400">
                {hasMovingSpriteSheet
                  ? currentConfig.movingSpriteSheet?.imageUrl && !currentConfig.movingSpriteSheet?.imageData
                    ? '✓ Using URL'
                    : '✓ Moving sprite sheet configured'
                  : 'No sprite sheet - use static image below'}
              </p>
              <p className="text-xs text-purple-400">
                💡 Sprite sheets should be horizontal strips with frames of equal width
              </p>
            </div>
          </div>)}

          {/* Moving Image Upload - hidden when moving spritesheet is set */}
          {!hasMovingSpriteSheet && (<div>
            <label className="block text-sm font-bold mb-2">
              Moving Image (While Moving - Static) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg,image/gif,image/webp"
                  onChange={handleMovingImageUpload}
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-parchment-100 hover:file:bg-blue-700"
                />
                {hasMovingImage && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-stone-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.movingImageData || currentConfig.movingImageUrl}
                      alt="Moving static"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* URL Input Toggle */}
              <button
                type="button"
                onClick={() => setShowMovingImageUrl(!showMovingImageUrl)}
                className="text-xs text-arcane-400 hover:text-arcane-300"
              >
                {showMovingImageUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
              </button>

              {/* URL Input */}
              {showMovingImageUrl && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={movingImageUrlInput}
                    onChange={(e) => setMovingImageUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && movingImageUrlInput.trim()) {
                        setMovingImageUrl(movingImageUrlInput.trim());
                        setMovingImageUrlInput('');
                      }
                    }}
                    placeholder="https://your-storage.com/sprite.png"
                    className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (movingImageUrlInput.trim()) {
                        setMovingImageUrl(movingImageUrlInput.trim());
                        setMovingImageUrlInput('');
                      }
                    }}
                    className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
                  >
                    Set
                  </button>
                </div>
              )}

              {hasMovingImage && (
                <>
                <button
                  onClick={clearMovingImage}
                  className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                >
                  ✕ Clear Moving Image
                </button>
                {renderAnchorControls(
                  currentConfig.movingAnchorX ?? 0.5,
                  currentConfig.movingAnchorY ?? 0.5,
                  currentConfig.movingOffsetX ?? 0,
                  currentConfig.movingOffsetY ?? 0,
                  (ax, ay) => {
                    const dirSprites = sprite.directionalSprites || {};
                    onChange({ ...sprite, directionalSprites: { ...dirSprites, [selectedDirection]: { ...currentConfig, movingAnchorX: ax, movingAnchorY: ay } } });
                  },
                  (field, val) => {
                    const dirSprites = sprite.directionalSprites || {};
                    const key = field === 'offsetX' ? 'movingOffsetX' : 'movingOffsetY';
                    onChange({ ...sprite, directionalSprites: { ...dirSprites, [selectedDirection]: { ...currentConfig, [key]: val } } });
                  },
                  currentConfig.movingImageData || currentConfig.movingImageUrl,
                  undefined,
                  currentConfig.movingScale ?? 1,
                  (val) => {
                    const dirSprites = sprite.directionalSprites || {};
                    onChange({ ...sprite, directionalSprites: { ...dirSprites, [selectedDirection]: { ...currentConfig, movingScale: val === 1 ? undefined : val } } });
                  },
                )}
                </>
              )}
              <p className="text-xs text-stone-400">
                {hasMovingImage
                  ? currentConfig.movingImageUrl && !currentConfig.movingImageData
                    ? '✓ Using URL'
                    : '✓ Moving image uploaded'
                  : 'No moving image - will use idle image'}
              </p>
            </div>
          </div>)}
          </div>

          {/* DEATH STATE */}
          <div className="bg-red-950 bg-opacity-30 p-4 rounded border-2 border-red-900">
            <h3 className="text-lg font-semibold mb-3 text-red-400">💀 Death State</h3>
            <p className="text-xs text-stone-400 mb-4">
              Animation that plays when the unit dies (before corpse appears)
            </p>

          {/* Death Sprite Sheet Upload - hidden when death image is set */}
          {!hasDeathImage && (<div>
            <label className="block text-sm font-bold mb-2">
              Death Sprite Sheet (On Death - Animated) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleDeathSpriteSheetUpload}
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-red-600 file:text-parchment-100 hover:file:bg-red-700"
                />
                {hasDeathSpriteSheet && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-red-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.deathSpriteSheet?.imageData || currentConfig.deathSpriteSheet?.imageUrl}
                      alt="Death sprite sheet"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* URL Input Toggle */}
              <button
                type="button"
                onClick={() => setShowDeathSpriteSheetUrl(!showDeathSpriteSheetUrl)}
                className="text-xs text-arcane-400 hover:text-arcane-300"
              >
                {showDeathSpriteSheetUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
              </button>

              {/* URL Input */}
              {showDeathSpriteSheetUrl && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={deathSpriteSheetUrlInput}
                    onChange={(e) => setDeathSpriteSheetUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && deathSpriteSheetUrlInput.trim()) {
                        setDeathSpriteSheetUrl(deathSpriteSheetUrlInput.trim());
                        setDeathSpriteSheetUrlInput('');
                      }
                    }}
                    placeholder="https://your-storage.com/spritesheet.png"
                    className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (deathSpriteSheetUrlInput.trim()) {
                        setDeathSpriteSheetUrl(deathSpriteSheetUrlInput.trim());
                        setDeathSpriteSheetUrlInput('');
                      }
                    }}
                    className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
                  >
                    Set
                  </button>
                </div>
              )}

              {hasDeathSpriteSheet && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={currentConfig.deathSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleDeathSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={currentConfig.deathSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleDeathSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-stone-400">
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
                  {renderAnchorControls(
                    currentConfig.deathSpriteSheet?.anchorX ?? 0.5,
                    currentConfig.deathSpriteSheet?.anchorY ?? 0.5,
                    currentConfig.deathSpriteSheet?.offsetX ?? 0,
                    currentConfig.deathSpriteSheet?.offsetY ?? 0,
                    (ax, ay) => { handleDeathSpriteSheetConfigChange('anchorX', ax); handleDeathSpriteSheetConfigChange('anchorY', ay); },
                    (field, val) => handleDeathSpriteSheetConfigChange(field, val),
                    undefined,
                    currentConfig.deathSpriteSheet,
                    currentConfig.deathSpriteSheet?.scale ?? 1,
                    (val) => handleDeathSpriteSheetConfigChange('scale', val === 1 ? undefined : val),
                  )}
                </>
              )}
              <p className="text-xs text-stone-400">
                {hasDeathSpriteSheet
                  ? currentConfig.deathSpriteSheet?.imageUrl && !currentConfig.deathSpriteSheet?.imageData
                    ? '✓ Using URL'
                    : '✓ Death sprite sheet configured'
                  : 'No sprite sheet - use static image below'}
              </p>
              <p className="text-xs text-red-400">
                💀 Death animation plays when character/enemy reaches 0 HP
              </p>
            </div>
          </div>)}

          {/* Death Image Upload - hidden when death spritesheet is set */}
          {!hasDeathSpriteSheet && (<div>
            <label className="block text-sm font-bold mb-2">
              Death Image (On Death - Static) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg,image/gif,image/webp"
                  onChange={handleDeathImageUpload}
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-parchment-100 hover:file:bg-blue-700"
                />
                {hasDeathImage && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-stone-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.deathImageData || currentConfig.deathImageUrl}
                      alt="Death static"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* URL Input Toggle */}
              <button
                type="button"
                onClick={() => setShowDeathImageUrl(!showDeathImageUrl)}
                className="text-xs text-arcane-400 hover:text-arcane-300"
              >
                {showDeathImageUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
              </button>

              {/* URL Input */}
              {showDeathImageUrl && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={deathImageUrlInput}
                    onChange={(e) => setDeathImageUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && deathImageUrlInput.trim()) {
                        setDeathImageUrl(deathImageUrlInput.trim());
                        setDeathImageUrlInput('');
                      }
                    }}
                    placeholder="https://your-storage.com/sprite.png"
                    className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (deathImageUrlInput.trim()) {
                        setDeathImageUrl(deathImageUrlInput.trim());
                        setDeathImageUrlInput('');
                      }
                    }}
                    className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
                  >
                    Set
                  </button>
                </div>
              )}

              {hasDeathImage && (
                <>
                <button
                  onClick={clearDeathImage}
                  className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                >
                  ✕ Clear Death Image
                </button>
                {renderAnchorControls(
                  currentConfig.deathAnchorX ?? 0.5,
                  currentConfig.deathAnchorY ?? 0.5,
                  currentConfig.deathOffsetX ?? 0,
                  currentConfig.deathOffsetY ?? 0,
                  (ax, ay) => {
                    const dirSprites = sprite.directionalSprites || {};
                    onChange({ ...sprite, directionalSprites: { ...dirSprites, [selectedDirection]: { ...currentConfig, deathAnchorX: ax, deathAnchorY: ay } } });
                  },
                  (field, val) => {
                    const dirSprites = sprite.directionalSprites || {};
                    const key = field === 'offsetX' ? 'deathOffsetX' : 'deathOffsetY';
                    onChange({ ...sprite, directionalSprites: { ...dirSprites, [selectedDirection]: { ...currentConfig, [key]: val } } });
                  },
                  currentConfig.deathImageData || currentConfig.deathImageUrl,
                  undefined,
                  currentConfig.deathScale ?? 1,
                  (val) => {
                    const dirSprites = sprite.directionalSprites || {};
                    onChange({ ...sprite, directionalSprites: { ...dirSprites, [selectedDirection]: { ...currentConfig, deathScale: val === 1 ? undefined : val } } });
                  },
                )}
                </>
              )}
              <p className="text-xs text-stone-400">
                {hasDeathImage
                  ? currentConfig.deathImageUrl && !currentConfig.deathImageData
                    ? '✓ Using URL'
                    : '✓ Death image uploaded'
                  : 'No death image - will show X overlay'}
              </p>
            </div>
          </div>)}
          </div>

          {/* CASTING STATE */}
          <div className="bg-yellow-950 bg-opacity-30 p-4 rounded border-2 border-yellow-900">
            <h3 className="text-lg font-semibold mb-3 text-yellow-400">✨ Casting State</h3>
            <p className="text-xs text-stone-400 mb-4">
              Animation when casting a spell while stationary (moving animation has priority)
            </p>

          {/* Casting Sprite Sheet Upload - hidden when casting image is set */}
          {!hasCastingImage && (<div>
            <label className="block text-sm font-bold mb-2">
              Casting Sprite Sheet (Casting Spell - Animated) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleCastingSpriteSheetUpload}
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-yellow-600 file:text-parchment-100 hover:file:bg-yellow-700"
                />
                {hasCastingSpriteSheet && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-yellow-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.castingSpriteSheet?.imageData || currentConfig.castingSpriteSheet?.imageUrl}
                      alt="Casting sprite sheet"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* URL Input Toggle */}
              <button
                type="button"
                onClick={() => setShowCastingSpriteSheetUrl(!showCastingSpriteSheetUrl)}
                className="text-xs text-arcane-400 hover:text-arcane-300"
              >
                {showCastingSpriteSheetUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
              </button>

              {/* URL Input */}
              {showCastingSpriteSheetUrl && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={castingSpriteSheetUrlInput}
                    onChange={(e) => setCastingSpriteSheetUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && castingSpriteSheetUrlInput.trim()) {
                        setCastingSpriteSheetUrl(castingSpriteSheetUrlInput.trim());
                        setCastingSpriteSheetUrlInput('');
                      }
                    }}
                    placeholder="https://your-storage.com/spritesheet.png"
                    className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (castingSpriteSheetUrlInput.trim()) {
                        setCastingSpriteSheetUrl(castingSpriteSheetUrlInput.trim());
                        setCastingSpriteSheetUrlInput('');
                      }
                    }}
                    className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
                  >
                    Set
                  </button>
                </div>
              )}

              {hasCastingSpriteSheet && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Frame Count</label>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={currentConfig.castingSpriteSheet?.frameCount || 4}
                        onChange={(e) => handleCastingSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-400 mb-1">Frame Rate (FPS)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={currentConfig.castingSpriteSheet?.frameRate || 10}
                        onChange={(e) => handleCastingSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-stone-400">
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
                  {renderAnchorControls(
                    currentConfig.castingSpriteSheet?.anchorX ?? 0.5,
                    currentConfig.castingSpriteSheet?.anchorY ?? 0.5,
                    currentConfig.castingSpriteSheet?.offsetX ?? 0,
                    currentConfig.castingSpriteSheet?.offsetY ?? 0,
                    (ax, ay) => { handleCastingSpriteSheetConfigChange('anchorX', ax); handleCastingSpriteSheetConfigChange('anchorY', ay); },
                    (field, val) => handleCastingSpriteSheetConfigChange(field, val),
                    undefined,
                    currentConfig.castingSpriteSheet,
                    currentConfig.castingSpriteSheet?.scale ?? 1,
                    (val) => handleCastingSpriteSheetConfigChange('scale', val === 1 ? undefined : val),
                  )}
                </>
              )}
              <p className="text-xs text-stone-400">
                {hasCastingSpriteSheet
                  ? currentConfig.castingSpriteSheet?.imageUrl && !currentConfig.castingSpriteSheet?.imageData
                    ? '✓ Using URL'
                    : '✓ Casting sprite sheet configured'
                  : 'No sprite sheet - use static image below'}
              </p>
              <p className="text-xs text-yellow-400">
                ✨ Casting animation plays when character/enemy casts spell while stationary
              </p>
            </div>
          </div>)}

          {/* Casting Image Upload - hidden when casting spritesheet is set */}
          {!hasCastingSpriteSheet && (<div>
            <label className="block text-sm font-bold mb-2">
              Casting Image (Casting Spell - Static) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg,image/gif,image/webp"
                  onChange={handleCastingImageUpload}
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-parchment-100 hover:file:bg-blue-700"
                />
                {hasCastingImage && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-stone-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={currentConfig.castingImageData || currentConfig.castingImageUrl}
                      alt="Casting static"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* URL Input Toggle */}
              <button
                type="button"
                onClick={() => setShowCastingImageUrl(!showCastingImageUrl)}
                className="text-xs text-arcane-400 hover:text-arcane-300"
              >
                {showCastingImageUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
              </button>

              {/* URL Input */}
              {showCastingImageUrl && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={castingImageUrlInput}
                    onChange={(e) => setCastingImageUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && castingImageUrlInput.trim()) {
                        setCastingImageUrl(castingImageUrlInput.trim());
                        setCastingImageUrlInput('');
                      }
                    }}
                    placeholder="https://your-storage.com/sprite.png"
                    className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (castingImageUrlInput.trim()) {
                        setCastingImageUrl(castingImageUrlInput.trim());
                        setCastingImageUrlInput('');
                      }
                    }}
                    className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
                  >
                    Set
                  </button>
                </div>
              )}

              {hasCastingImage && (
                <>
                <button
                  onClick={clearCastingImage}
                  className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                >
                  ✕ Clear Casting Image
                </button>
                {renderAnchorControls(
                  currentConfig.castingAnchorX ?? 0.5,
                  currentConfig.castingAnchorY ?? 0.5,
                  currentConfig.castingOffsetX ?? 0,
                  currentConfig.castingOffsetY ?? 0,
                  (ax, ay) => {
                    const dirSprites = sprite.directionalSprites || {};
                    onChange({ ...sprite, directionalSprites: { ...dirSprites, [selectedDirection]: { ...currentConfig, castingAnchorX: ax, castingAnchorY: ay } } });
                  },
                  (field, val) => {
                    const dirSprites = sprite.directionalSprites || {};
                    const key = field === 'offsetX' ? 'castingOffsetX' : 'castingOffsetY';
                    onChange({ ...sprite, directionalSprites: { ...dirSprites, [selectedDirection]: { ...currentConfig, [key]: val } } });
                  },
                  currentConfig.castingImageData || currentConfig.castingImageUrl,
                  undefined,
                  currentConfig.castingScale ?? 1,
                  (val) => {
                    const dirSprites = sprite.directionalSprites || {};
                    onChange({ ...sprite, directionalSprites: { ...dirSprites, [selectedDirection]: { ...currentConfig, castingScale: val === 1 ? undefined : val } } });
                  },
                )}
                </>
              )}
              <p className="text-xs text-stone-400">
                {hasCastingImage
                  ? currentConfig.castingImageUrl && !currentConfig.castingImageData
                    ? '✓ Using URL'
                    : '✓ Casting image uploaded'
                  : 'No casting image - will use idle sprite'}
              </p>
            </div>
          </div>)}
          </div>
        </>
      )}

      {/* Note: Corpse appearance is now handled by the final frame of the Death sprite sheet */}

      {/* Spawn Animation Section - NOT directional, same for all */}
      <div className="border-2 border-cyan-700 rounded-lg p-4 bg-stone-900/50">
        <h4 className="text-cyan-400 font-bold mb-3 flex items-center gap-2">
          <span className="text-lg">✦</span> Spawn Animation (appears when entity spawns)
        </h4>
        <p className="text-xs text-stone-400 mb-3">
          Plays once when the entity first appears. Not directional - same animation regardless of facing direction.
          If not set, idle animation will play immediately.
        </p>

        {/* Spawn Sprite Sheet Upload */}
        <div className="mb-4">
          <label className="block text-sm font-bold mb-2">
            Spawn Sprite Sheet (Animation)
          </label>
          <div className="space-y-2">
            <div className="flex gap-2 items-start">
              <input
                type="file"
                accept="image/png,image/jpg,image/jpeg,image/gif,image/webp"
                onChange={handleSpawnSpriteSheetUpload}
                className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-cyan-600 file:text-parchment-100 hover:file:bg-cyan-700"
              />
              {hasSpawnSpriteSheetConfig && (
                <div className="w-16 h-16 sprite-preview-bg rounded border border-stone-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img
                    src={sprite.spawnSpriteSheet?.imageData || sprite.spawnSpriteSheet?.imageUrl}
                    alt="Spawn spritesheet"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}
            </div>

            {/* URL Input Toggle */}
            <button
              type="button"
              onClick={() => setShowSpawnSpriteSheetUrl(!showSpawnSpriteSheetUrl)}
              className="text-xs text-arcane-400 hover:text-arcane-300"
            >
              {showSpawnSpriteSheetUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
            </button>

            {/* URL Input */}
            {showSpawnSpriteSheetUrl && (
              <div className="flex gap-2">
                <input
                  type="url"
                  value={spawnSpriteSheetUrlInput}
                  onChange={(e) => setSpawnSpriteSheetUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && spawnSpriteSheetUrlInput.trim()) {
                      setSpawnSpriteSheetUrl(spawnSpriteSheetUrlInput.trim());
                      setSpawnSpriteSheetUrlInput('');
                    }
                  }}
                  placeholder="https://your-storage.com/spawn-sheet.png"
                  className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (spawnSpriteSheetUrlInput.trim()) {
                      setSpawnSpriteSheetUrl(spawnSpriteSheetUrlInput.trim());
                      setSpawnSpriteSheetUrlInput('');
                    }
                  }}
                  className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
                >
                  Set
                </button>
              </div>
            )}

            {hasSpawnSpriteSheetConfig && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Frame Count</label>
                    <input
                      type="number"
                      min="1"
                      max="64"
                      value={sprite.spawnSpriteSheet?.frameCount || 4}
                      onChange={(e) => handleSpawnSpriteSheetConfigChange('frameCount', parseInt(e.target.value))}
                      className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Frame Rate (FPS)</label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={sprite.spawnSpriteSheet?.frameRate || 10}
                      onChange={(e) => handleSpawnSpriteSheetConfigChange('frameRate', parseInt(e.target.value))}
                      className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm"
                    />
                  </div>
                </div>
                <button
                  onClick={clearSpawnSpriteSheet}
                  className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                >
                  ✕ Clear Spawn Sprite Sheet
                </button>
                {renderAnchorControls(
                  sprite.spawnSpriteSheet?.anchorX ?? 0.5,
                  sprite.spawnSpriteSheet?.anchorY ?? 0.5,
                  sprite.spawnSpriteSheet?.offsetX ?? 0,
                  sprite.spawnSpriteSheet?.offsetY ?? 0,
                  (ax, ay) => { handleSpawnSpriteSheetConfigChange('anchorX', ax); handleSpawnSpriteSheetConfigChange('anchorY', ay); },
                  (field, val) => handleSpawnSpriteSheetConfigChange(field, val),
                  undefined,
                  sprite.spawnSpriteSheet,
                  sprite.spawnSpriteSheet?.scale ?? 1,
                  (val) => handleSpawnSpriteSheetConfigChange('scale', val === 1 ? undefined : val),
                )}
              </>
            )}
            <p className="text-xs text-stone-400">
              {hasSpawnSpriteSheetConfig
                ? sprite.spawnSpriteSheet?.imageUrl && !sprite.spawnSpriteSheet?.imageData
                  ? '✓ Using URL'
                  : '✓ Spawn sprite sheet configured'
                : 'No sprite sheet - use static image below or leave empty for idle animation'}
            </p>
          </div>
        </div>

        {/* Spawn Image Upload - hidden when spawn spritesheet is set */}
        {!hasSpawnSpriteSheetConfig && (
          <div>
            <label className="block text-sm font-bold mb-2">
              Spawn Image (Static)
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start">
                <input
                  type="file"
                  accept="image/png,image/jpg,image/jpeg,image/gif,image/webp"
                  onChange={handleSpawnImageUpload}
                  className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-cyan-600 file:text-parchment-100 hover:file:bg-cyan-700"
                />
                {hasSpawnImageConfig && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-stone-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img
                      src={sprite.spawnImageData || sprite.spawnImageUrl}
                      alt="Spawn static"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* URL Input Toggle */}
              <button
                type="button"
                onClick={() => setShowSpawnImageUrl(!showSpawnImageUrl)}
                className="text-xs text-arcane-400 hover:text-arcane-300"
              >
                {showSpawnImageUrl ? '▼ Hide URL input' : '▶ Or use URL...'}
              </button>

              {/* URL Input */}
              {showSpawnImageUrl && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={spawnImageUrlInput}
                    onChange={(e) => setSpawnImageUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && spawnImageUrlInput.trim()) {
                        setSpawnImageUrl(spawnImageUrlInput.trim());
                        setSpawnImageUrlInput('');
                      }
                    }}
                    placeholder="https://your-storage.com/spawn.png"
                    className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (spawnImageUrlInput.trim()) {
                        setSpawnImageUrl(spawnImageUrlInput.trim());
                        setSpawnImageUrlInput('');
                      }
                    }}
                    className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
                  >
                    Set
                  </button>
                </div>
              )}

              {hasSpawnImageConfig && (
                <>
                  <button
                    onClick={clearSpawnImage}
                    className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700"
                  >
                    ✕ Clear Spawn Image
                  </button>
                  {renderAnchorControls(
                    sprite.spawnAnchorX ?? 0.5,
                    sprite.spawnAnchorY ?? 0.5,
                    sprite.spawnOffsetX ?? 0,
                    sprite.spawnOffsetY ?? 0,
                    (ax, ay) => {
                      onChange({ ...sprite, spawnAnchorX: ax, spawnAnchorY: ay });
                    },
                    (field, val) => {
                      const key = field === 'offsetX' ? 'spawnOffsetX' : 'spawnOffsetY';
                      onChange({ ...sprite, [key]: val });
                    },
                    sprite.spawnImageData || sprite.spawnImageUrl,
                    undefined,
                    sprite.spawnScale ?? 1,
                    (val) => {
                      onChange({ ...sprite, spawnScale: val === 1 ? undefined : val });
                    },
                  )}
                </>
              )}
              <p className="text-xs text-stone-400">
                {hasSpawnImageConfig
                  ? sprite.spawnImageUrl && !sprite.spawnImageData
                    ? '✓ Using URL'
                    : '✓ Spawn image uploaded'
                  : 'No spawn image - will use idle sprite'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-bold mb-2">
          Preview ({DIRECTIONS.find(d => d.key === selectedDirection)?.label})
        </label>
        <div
          className="border-2 border-stone-600 rounded overflow-hidden"
          style={{
            width: size,
            height: size,
            backgroundColor: getPreviewBgColor(ENTITY_PREVIEW_TYPE),
            ...(getPreviewBgImageUrl(ENTITY_PREVIEW_TYPE) && {
              backgroundImage: `url(${getPreviewBgImageUrl(ENTITY_PREVIEW_TYPE)})`,
              backgroundSize: getPreviewBgTiled(ENTITY_PREVIEW_TYPE) ? 'auto' : 'cover',
              backgroundRepeat: getPreviewBgTiled(ENTITY_PREVIEW_TYPE) ? 'repeat' : 'no-repeat',
              backgroundPosition: 'center',
            }),
          }}
        >
          <canvas
            ref={canvasRef}
            width={size}
            height={size}
            className="block"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold mb-2">Shape</label>
        <div className="grid grid-cols-3 gap-2">
          {(['circle', 'square', 'triangle', 'star', 'diamond'] as const).map((shape) => (
            <button
              key={shape}
              onClick={() => handleShapeChange(shape)}
              className={`p-2 rounded capitalize ${
                currentConfig.shape === shape ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
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
            className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 font-mono text-sm"
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
            className="flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 font-mono text-sm"
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
          max={allowOversized ? "2.0" : "1.0"}
          step="0.05"
          value={currentConfig.size}
          onChange={(e) => handleSizeChange(parseFloat(e.target.value))}
          className="w-full"
        />
        {allowOversized && (
          <p className="text-xs text-stone-400 mt-1">
            Values &gt;100% extend beyond tile bounds
          </p>
        )}
      </div>

      {/* Anchor Point & Offset are now per-spritesheet/per-image, shown near each upload area */}
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
  now: number = Date.now(),
  isCasting: boolean = false
) {
  // Determine active state and resolve anchor from the appropriate source
  // For spritesheets: anchor lives on SpriteSheetConfig
  // For images: anchor lives as per-state fields on the config

  // Priority: moving > casting > idle
  // Check for sprite sheet first (highest priority for animation)
  let spriteSheet = isMoving ? config.movingSpriteSheet : null;
  let activeState: 'moving' | 'casting' | 'idle' = isMoving ? 'moving' : 'idle';
  if (!spriteSheet && isCasting && !isMoving) {
    spriteSheet = config.castingSpriteSheet;
    activeState = 'casting';
  }
  if (!spriteSheet) {
    spriteSheet = config.idleSpriteSheet;
    activeState = spriteSheet ? (isMoving ? 'moving' : isCasting ? 'casting' : 'idle') : activeState;
  }
  if (spriteSheet) {
    // Anchor from spritesheet itself
    const ax = spriteSheet.anchorX ?? 0.5;
    const ay = spriteSheet.anchorY ?? 0.5;
    const ox = spriteSheet.offsetX ?? 0;
    const oy = spriteSheet.offsetY ?? 0;
    const sc = spriteSheet.scale ?? 1;
    const maxSize = (config.size || 0.6) * tileSize;
    drawSpriteSheet(ctx, spriteSheet, centerX, centerY, maxSize, maxSize, now, ax, ay, ox, oy, sc);
    return;
  }

  // Check for uploaded image (PNG/GIF) or URL
  // Priority: moving > casting > idle
  let imageToUse: string | undefined;
  let imageState: 'idle' | 'moving' | 'casting' = 'idle';
  if (isMoving && (config.movingImageData || config.movingImageUrl)) {
    imageToUse = config.movingImageData || config.movingImageUrl;
    imageState = 'moving';
  } else if (isCasting && !isMoving && (config.castingImageData || config.castingImageUrl)) {
    imageToUse = config.castingImageData || config.castingImageUrl;
    imageState = 'casting';
  } else {
    imageToUse = config.idleImageData || config.imageData || config.idleImageUrl || config.imageUrl;
    imageState = 'idle';
  }

  if (imageToUse) {
    // Anchor from per-state image fields
    const ax = (imageState === 'moving' ? config.movingAnchorX : imageState === 'casting' ? config.castingAnchorX : config.idleAnchorX) ?? 0.5;
    const ay = (imageState === 'moving' ? config.movingAnchorY : imageState === 'casting' ? config.castingAnchorY : config.idleAnchorY) ?? 0.5;
    const ox = (imageState === 'moving' ? config.movingOffsetX : imageState === 'casting' ? config.castingOffsetX : config.idleOffsetX) ?? 0;
    const oy = (imageState === 'moving' ? config.movingOffsetY : imageState === 'casting' ? config.castingOffsetY : config.idleOffsetY) ?? 0;
    const imgScale = (imageState === 'moving' ? config.movingScale : imageState === 'casting' ? config.castingScale : config.idleScale) ?? 1;

    // Use cached image with load notification for GIF animation support
    const img = loadSpriteImage(imageToUse);

    // Draw the image - for GIFs, the browser handles animation automatically
    // We draw even if not fully loaded to ensure GIF animation starts properly
    try {
      const maxSize = (config.size || 0.6) * tileSize * imgScale;
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

      ctx.drawImage(img, centerX - drawWidth * ax + ox, centerY - drawHeight * ay + oy, drawWidth, drawHeight);
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
  now: number = Date.now(),
  isCasting: boolean = false
) {
  // Check if we should use directional sprites
  if (sprite.useDirectional && sprite.directionalSprites) {
    // If direction is provided, use it; otherwise use 'default'
    const dirKey = direction ? mapGameDirectionToSpriteDirection(direction) : 'default';
    const dirConfig = sprite.directionalSprites[dirKey] || sprite.directionalSprites['default'];

    if (dirConfig) {
      drawSpriteConfig(ctx, dirConfig, centerX, centerY, tileSize, isMoving, now, isCasting);
      return;
    }
  }

  // Priority: moving > casting > idle
  // Check for sprite sheet first (simple mode)
  let simpleSpriteSheet = isMoving ? sprite.movingSpriteSheet : null;
  if (!simpleSpriteSheet && isCasting && !isMoving) {
    simpleSpriteSheet = sprite.castingSpriteSheet;
  }
  if (!simpleSpriteSheet) {
    simpleSpriteSheet = sprite.idleSpriteSheet;
  }
  if (simpleSpriteSheet) {
    // Anchor from spritesheet itself
    const ax = simpleSpriteSheet.anchorX ?? 0.5;
    const ay = simpleSpriteSheet.anchorY ?? 0.5;
    const ox = simpleSpriteSheet.offsetX ?? 0;
    const oy = simpleSpriteSheet.offsetY ?? 0;
    const sc = simpleSpriteSheet.scale ?? 1;
    const maxSize = (sprite.size || 0.6) * tileSize;
    drawSpriteSheet(ctx, simpleSpriteSheet, centerX, centerY, maxSize, maxSize, now, ax, ay, ox, oy, sc);
    return;
  }

  // Check for simple image sprite (PNG/GIF)
  // Priority: moving > casting > idle
  let spriteImageToUse: string | undefined;
  let imgState: 'idle' | 'moving' | 'casting' = 'idle';
  if (isMoving && sprite.movingImageData) {
    spriteImageToUse = sprite.movingImageData;
    imgState = 'moving';
  } else if (isCasting && !isMoving && sprite.castingImageData) {
    spriteImageToUse = sprite.castingImageData;
    imgState = 'casting';
  } else {
    spriteImageToUse = sprite.idleImageData || sprite.imageData;
    imgState = 'idle';
  }

  if (spriteImageToUse) {
    // Anchor from per-state image fields
    const ax = (imgState === 'moving' ? sprite.movingAnchorX : imgState === 'casting' ? sprite.castingAnchorX : sprite.idleAnchorX) ?? 0.5;
    const ay = (imgState === 'moving' ? sprite.movingAnchorY : imgState === 'casting' ? sprite.castingAnchorY : sprite.idleAnchorY) ?? 0.5;
    const ox = (imgState === 'moving' ? sprite.movingOffsetX : imgState === 'casting' ? sprite.castingOffsetX : sprite.idleOffsetX) ?? 0;
    const oy = (imgState === 'moving' ? sprite.movingOffsetY : imgState === 'casting' ? sprite.castingOffsetY : sprite.idleOffsetY) ?? 0;
    const imgScale = (imgState === 'moving' ? sprite.movingScale : imgState === 'casting' ? sprite.castingScale : sprite.idleScale) ?? 1;

    // Use cached image with load notification for GIF animation support
    const img = loadSpriteImage(spriteImageToUse);

    // Draw the image - for GIFs, the browser handles animation automatically
    // We draw even if not fully loaded to ensure GIF animation starts properly
    try {
      const maxSize = (sprite.size || 0.6) * tileSize * imgScale;
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

      ctx.drawImage(img, centerX - drawWidth * ax + ox, centerY - drawHeight * ay + oy, drawWidth, drawHeight);
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
        const dax = dirConfig.deathSpriteSheet.anchorX ?? 0.5;
        const day = dirConfig.deathSpriteSheet.anchorY ?? 0.5;
        const dox = dirConfig.deathSpriteSheet.offsetX ?? 0;
        const doy = dirConfig.deathSpriteSheet.offsetY ?? 0;
        const dsc = dirConfig.deathSpriteSheet.scale ?? 1;
        // Force loop=false for death animations so they stop on final frame
        const deathSheet = { ...dirConfig.deathSpriteSheet, loop: false };
        drawSpriteSheetFromStartTime(ctx, deathSheet, centerX, centerY, maxSize, maxSize, startTime, now, dax, day, dox, doy, dsc);
        return true;
      }
      // Check for death image
      if (dirConfig.deathImageData) {
        const dax = dirConfig.deathAnchorX ?? 0.5;
        const day = dirConfig.deathAnchorY ?? 0.5;
        const dox = dirConfig.deathOffsetX ?? 0;
        const doy = dirConfig.deathOffsetY ?? 0;
        const dsc = dirConfig.deathScale ?? 1;
        drawImage(ctx, dirConfig.deathImageData, centerX, centerY, maxSize * dsc, dax, day, dox, doy);
        return true;
      }
    }
  }

  // Check for simple mode death sprite sheet
  if (sprite.deathSpriteSheet) {
    const ax = sprite.deathSpriteSheet.anchorX ?? 0.5;
    const ay = sprite.deathSpriteSheet.anchorY ?? 0.5;
    const ox = sprite.deathSpriteSheet.offsetX ?? 0;
    const oy = sprite.deathSpriteSheet.offsetY ?? 0;
    const sc = sprite.deathSpriteSheet.scale ?? 1;
    // Force loop=false for death animations so they stop on final frame
    const deathSheet = { ...sprite.deathSpriteSheet, loop: false };
    drawSpriteSheetFromStartTime(ctx, deathSheet, centerX, centerY, maxSize, maxSize, startTime, now, ax, ay, ox, oy, sc);
    return true;
  }

  // Check for simple mode death image
  if (sprite.deathImageData) {
    const ax = sprite.deathAnchorX ?? 0.5;
    const ay = sprite.deathAnchorY ?? 0.5;
    const ox = sprite.deathOffsetX ?? 0;
    const oy = sprite.deathOffsetY ?? 0;
    const sc = sprite.deathScale ?? 1;
    drawImage(ctx, sprite.deathImageData, centerX, centerY, maxSize * sc, ax, ay, ox, oy);
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
 * Draw spawn animation sprite for an entity
 * Returns true if a spawn sprite was drawn, false if not available
 *
 * @param startTime - When the spawn started (for proper frame calculation)
 *                    For sprite sheets, this ensures animation plays from start and stops on final frame
 */
export function drawSpawnSprite(
  ctx: CanvasRenderingContext2D,
  sprite: CustomSprite,
  centerX: number,
  centerY: number,
  tileSize: number,
  startTime: number = Date.now()
): boolean {
  const maxSize = (sprite.size || 0.6) * tileSize;
  const now = Date.now();

  // Spawn animations are NOT directional - same animation regardless of facing

  // Check for spawn sprite sheet (animation)
  if (sprite.spawnSpriteSheet) {
    const ax = sprite.spawnSpriteSheet.anchorX ?? 0.5;
    const ay = sprite.spawnSpriteSheet.anchorY ?? 0.5;
    const ox = sprite.spawnSpriteSheet.offsetX ?? 0;
    const oy = sprite.spawnSpriteSheet.offsetY ?? 0;
    const sc = sprite.spawnSpriteSheet.scale ?? 1;

    // Use drawSpriteSheetFromStartTime for proper one-shot animation timing
    // Create a modified config with loop=false for spawn animations
    const spawnSheet = { ...sprite.spawnSpriteSheet, loop: false };
    drawSpriteSheetFromStartTime(
      ctx,
      spawnSheet,
      centerX,
      centerY,
      maxSize,
      maxSize,
      startTime,
      now,
      ax,
      ay,
      ox,
      oy,
      sc
    );
    return true;
  }

  // Check for simple spawn image (static) - supports both data and URL
  const spawnImageSrc = sprite.spawnImageData || sprite.spawnImageUrl;
  if (spawnImageSrc) {
    const ax = sprite.spawnAnchorX ?? 0.5;
    const ay = sprite.spawnAnchorY ?? 0.5;
    const ox = sprite.spawnOffsetX ?? 0;
    const oy = sprite.spawnOffsetY ?? 0;
    const sc = sprite.spawnScale ?? 1;
    drawImage(ctx, spawnImageSrc, centerX, centerY, maxSize * sc, ax, ay, ox, oy);
    return true;
  }

  return false;
}

/**
 * Check if a sprite has any spawn animation configured
 */
export function hasSpawnAnimation(sprite: CustomSprite): boolean {
  // Only check simple mode - spawn animations are NOT directional
  return !!(sprite.spawnSpriteSheet || sprite.spawnImageData || sprite.spawnImageUrl);
}

/**
 * Check if spawn animation is still playing (hasn't finished)
 * Returns true if animation is still active, false if complete
 */
export function isSpawnAnimationPlaying(sprite: CustomSprite, startTime: number): boolean {
  const now = Date.now();
  const elapsed = now - startTime;

  if (sprite.spawnSpriteSheet) {
    // Calculate animation duration from sprite sheet
    const frameCount = sprite.spawnSpriteSheet.frameCount;
    const frameRate = sprite.spawnSpriteSheet.frameRate || 10;
    const animDuration = (frameCount / frameRate) * 1000;
    return elapsed < animDuration;
  }

  // For static spawn images, use a fixed duration
  return elapsed < 500; // 500ms default duration for static spawn images
}

/**
 * Helper to draw an image from cache
 */
function drawImage(
  ctx: CanvasRenderingContext2D,
  imageData: string,
  centerX: number,
  centerY: number,
  maxSize: number,
  anchorX: number = 0.5,
  anchorY: number = 0.5,
  offsetX: number = 0,
  offsetY: number = 0
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

    ctx.drawImage(img, centerX - drawWidth * anchorX + offsetX, centerY - drawHeight * anchorY + offsetY, drawWidth, drawHeight);
  } catch (e) {
    // Image not ready
  }
}
