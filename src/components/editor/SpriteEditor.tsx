import React, { useRef, useEffect, useState } from 'react';
import { toast } from '../shared/Toast';
import type { CustomSprite, DirectionalSpriteConfig, SpriteDirection, SpriteSheetConfig } from '../../utils/assetStorage';
import { Direction } from '../../types/game';
import { getPreviewBgColor, getPreviewBgImageUrl, getPreviewBgTiled, type PreviewType } from '../../utils/themeAssets';
import { subscribeToImageLoads, loadImage } from '../../utils/imageLoader';
import { MediaBrowseButton } from './MediaBrowseButton';

// Preview type for character/enemy sprites (entities)
const ENTITY_PREVIEW_TYPE: PreviewType = 'entity';

// Tiles are 24×24 art pixels. Sprite images render at their NATIVE pixel
// dimensions × (tileSize / ART_TILE_PX), centered on the tile — never scaled
// to fit. One art pixel is therefore the same on-screen size for every sprite,
// which is what keeps pixel density consistent across all board art.
export const ART_TILE_PX = 24;

// Warn when an upload is bigger than a 2-tile span — at native rendering a
// scaled-up export would draw building-sized instead of being shrunk to fit.
function warnIfOversizedUpload(dataUrl: string, label: string, isSheet: boolean = false) {
  const img = new Image();
  img.onload = () => {
    const limit = ART_TILE_PX * 2;
    // Sheet width includes all frames, so only height is meaningful pre-config
    const tooBig = isSheet ? img.naturalHeight > limit : (img.naturalWidth > limit || img.naturalHeight > limit);
    if (tooBig) {
      toast.warning(`${label} is ${img.naturalWidth}×${img.naturalHeight}px. Sprites render at native pixel size (a tile is ${ART_TILE_PX}×${ART_TILE_PX}px), so this will span more than 2 tiles. If this is a scaled-up export, upload the original-resolution file instead.`);
    }
  };
  img.src = dataUrl;
}

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
// eslint-disable-next-line react-refresh/only-export-components
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
  // Check local sprite cache first
  let img = globalImageCache.get(src);
  if (img) {
    if (!img.complete && !loadingSpriteImages.has(src)) {
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

  // Try the shared imageLoader cache (used by preloader)
  const sharedImg = loadImage(src);
  if (sharedImg) {
    globalImageCache.set(src, sharedImg);
    if (!sharedImg.complete) {
      loadingSpriteImages.add(src);
      const origOnload = sharedImg.onload;
      sharedImg.onload = (e) => {
        loadingSpriteImages.delete(src);
        notifySpriteImageLoaded();
        if (typeof origOnload === 'function') origOnload.call(sharedImg, e);
      };
    }
    return sharedImg;
  }

  // Create new image (fallback — should rarely happen)
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
  tileSize: number,
  now: number,
  anchorX: number = 0.5,
  anchorY: number = 0.5,
  offsetX: number = 0,
  offsetY: number = 0
): void {
  // Offsets are whole art pixels — round defensively so any legacy/imported
  // fractional value can't introduce zoom-dependent sub-pixel misalignment.
  offsetX = Math.round(offsetX);
  offsetY = Math.round(offsetY);
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

  // Native-size rendering: frame dims × zoom; offsets are in art pixels
  const zoom = tileSize / ART_TILE_PX;
  const finalWidth = Math.round(frameWidth * zoom);
  const finalHeight = Math.round(frameHeight * zoom);

  const sourceX = Math.round(state.currentFrame * frameWidth);
  const sw = Math.round(frameWidth);
  const sh = Math.round(frameHeight);
  const dw = finalWidth;
  const dh = finalHeight;
  const dx = Math.round(centerX - finalWidth * anchorX + offsetX * zoom);
  const dy = Math.round(centerY - finalHeight * anchorY + offsetY * zoom);

  try {
    ctx.drawImage(img, sourceX, 0, sw, sh, dx, dy, dw, dh);
  } catch {
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
  tileSize: number,
  startTime: number,
  now: number = Date.now(),
  anchorX: number = 0.5,
  anchorY: number = 0.5,
  offsetX: number = 0,
  offsetY: number = 0
): void {
  // Offsets are whole art pixels — round defensively so any legacy/imported
  // fractional value can't introduce zoom-dependent sub-pixel misalignment.
  offsetX = Math.round(offsetX);
  offsetY = Math.round(offsetY);
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

  // Native-size rendering: frame dims × zoom; offsets are in art pixels
  const zoom = tileSize / ART_TILE_PX;
  const finalWidth = Math.round(frameWidth * zoom);
  const finalHeight = Math.round(frameHeight * zoom);

  // Draw the current frame — round all coords to prevent sub-pixel warping of pixel art
  const sourceX = Math.round(currentFrame * frameWidth);
  const sw = Math.round(frameWidth);
  const sh = Math.round(frameHeight);
  const dw = finalWidth;
  const dh = finalHeight;
  const dx = Math.round(centerX - finalWidth * anchorX + offsetX * zoom);
  const dy = Math.round(centerY - finalHeight * anchorY + offsetY * zoom);

  try {
    ctx.drawImage(img, sourceX, 0, sw, sh, dx, dy, dw, dh);
  } catch {
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

/**
 * Small canvas preview of a DirectionalSpriteConfig's idle sprite.
 * Used in the "Copy From Direction" overlay to show what each direction looks like.
 */
const DirectionPreviewCanvas: React.FC<{ dirConfig: DirectionalSpriteConfig; size: number }> = ({ dirConfig, size }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    // Draw idle sprite preview using drawSpriteConfig
    drawSpriteConfig(ctx, dirConfig, size / 2, size / 2, size, false, Date.now());
  }, [dirConfig, size]);

  // Re-render when sprite images load
  useEffect(() => {
    const unsubscribe = subscribeToSpriteImageLoads(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);
      drawSpriteConfig(ctx, dirConfig, size / 2, size / 2, size, false, Date.now());
    });
    return unsubscribe;
  }, [dirConfig, size]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded border border-stone-600 bg-stone-900"
      style={{ width: size, height: size }}
    />
  );
};

/**
 * Small inline preview showing how a sprite looks with the current anchor/offset.
 * Renders a tile boundary with the sprite positioned according to anchor settings.
 */
/** One drawable layer (active sprite or a ghosted other-direction sprite). */
interface AnchorPreviewLayer {
  imageSrc: string;
  anchorX: number;
  anchorY: number;
  offsetX: number;
  offsetY: number;
  isSpriteSheet?: boolean;
  frameCount?: number;
  /** Explicit frame dims from the sheet config — honored so the preview slices
   *  frames exactly like the board does for imported sheets. */
  frameWidth?: number;
  frameHeight?: number;
}

const AnchorPreview: React.FC<AnchorPreviewLayer & {
  /** Other directions' same-slot sprites, drawn faded behind the active one. */
  ghosts?: AnchorPreviewLayer[];
  /** Opacity of the active (edited) sprite in the preview only — lets you see
   *  the ghosts behind it. Never affects board rendering. */
  activeAlpha?: number;
}> = ({ imageSrc, anchorX, anchorY, offsetX, offsetY, isSpriteSheet, frameCount, frameWidth, frameHeight, ghosts, activeAlpha = 1 }) => {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [loadTick, setLoadTick] = useState(0);
  const previewSize = 80;
  // Same zoom the board uses at default size (48px tiles / 24 art px = 2×),
  // i.e. tileSize / ART_TILE_PX. Sprite and tile scale together, so sprite-to-
  // tile proportions match the board; overflow shows true on-board size.
  const zoom = 2;
  const tileRect = ART_TILE_PX * zoom;

  // Redraw when any sprite image finishes loading (covers active + ghosts,
  // including imported sheets that resolve their dimensions only once cached).
  useEffect(() => {
    const unsub = subscribeToSpriteImageLoads(() => setLoadTick((t) => t + 1));
    return unsub;
  }, []);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Account for device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = previewSize * dpr;
    canvas.height = previewSize * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, previewSize, previewSize);

    const tileOrigin = (previewSize - tileRect) / 2;

    // Art-pixel grid inside the tile — one cell per art pixel. Makes whole-pixel
    // offset alignment visible and gives a fixed reference for centering.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < ART_TILE_PX; i++) {
      const g = Math.round(tileOrigin + i * zoom) + 0.5;
      ctx.moveTo(g, tileOrigin);
      ctx.lineTo(g, tileOrigin + tileRect);
      ctx.moveTo(tileOrigin, g);
      ctx.lineTo(tileOrigin + tileRect, g);
    }
    ctx.stroke();

    // Tile boundary (one tile, centered)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(tileOrigin + 0.5, tileOrigin + 0.5, tileRect - 1, tileRect - 1);
    ctx.setLineDash([]);

    // Center crosshair
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(previewSize / 2, 0);
    ctx.lineTo(previewSize / 2, previewSize);
    ctx.moveTo(0, previewSize / 2);
    ctx.lineTo(previewSize, previewSize / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw one sprite layer at frame 0, faithful to the board's native-size
    // math: explicit frame dims when present, else naturalWidth / frameCount.
    const drawLayer = (layer: AnchorPreviewLayer, alpha: number) => {
      const img = loadSpriteImage(layer.imageSrc);
      if (!img.complete || img.naturalWidth === 0) return;
      const srcWidth = layer.frameWidth
        ?? (layer.isSpriteSheet && layer.frameCount ? img.naturalWidth / layer.frameCount : img.naturalWidth);
      const srcHeight = layer.frameHeight ?? img.naturalHeight;
      const drawWidth = Math.round(srcWidth * zoom);
      const drawHeight = Math.round(srcHeight * zoom);
      const dx = Math.round(previewSize / 2 - drawWidth * layer.anchorX + Math.round(layer.offsetX) * zoom);
      const dy = Math.round(previewSize / 2 - drawHeight * layer.anchorY + Math.round(layer.offsetY) * zoom);
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, 0, 0, Math.round(srcWidth), Math.round(srcHeight), dx, dy, drawWidth, drawHeight);
      ctx.globalAlpha = 1;
    };

    // Ghosts behind (faded), then the active layer on top (at the requested
    // editor-only opacity so the ghosts stay visible behind it).
    if (ghosts) for (const g of ghosts) drawLayer(g, 0.28);
    drawLayer({ imageSrc, anchorX, anchorY, offsetX, offsetY, isSpriteSheet, frameCount, frameWidth, frameHeight }, activeAlpha);
  }, [imageSrc, anchorX, anchorY, offsetX, offsetY, isSpriteSheet, frameCount, frameWidth, frameHeight, ghosts, activeAlpha, tileRect, loadTick]);

  return (
    <canvas
      ref={previewRef}
      className="rounded border border-stone-600 bg-stone-900 flex-shrink-0"
      style={{ width: previewSize, height: previewSize }}
    />
  );
};

export const SpriteEditor: React.FC<SpriteEditorProps> = ({ sprite, onChange, size = PREVIEW_SIZE }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedDirection, setSelectedDirection] = useState<SpriteDirection>('default');
  // Onion-skin controls for the offset previews (editor-only, never affects the board).
  const [onionEnabled, setOnionEnabled] = useState(true);
  const [onionDir, setOnionDir] = useState<SpriteDirection | 'all'>('all');
  const [activePreviewOpacity, setActivePreviewOpacity] = useState(1);
  // Always use directional mode - 'default' direction serves as universal fallback
  const spriteMode = 'directional' as const;
  // Tab for separating directional vs global settings
  const [editorTab, setEditorTab] = useState<'directional' | 'global'>('directional');
  // Copy-from-direction overlay
  const [showCopyFromOverlay, setShowCopyFromOverlay] = useState(false);
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
  // (Death URL inputs removed — death is now a single global animation set in Global Settings.)
  const [showCastingImageUrl, setShowCastingImageUrl] = useState(false);
  const [castingImageUrlInput, setCastingImageUrlInput] = useState('');
  const [showCastingSpriteSheetUrl, setShowCastingSpriteSheetUrl] = useState(false);
  const [castingSpriteSheetUrlInput, setCastingSpriteSheetUrlInput] = useState('');
  const [showSpawnImageUrl, setShowSpawnImageUrl] = useState(false);
  const [spawnImageUrlInput, setSpawnImageUrlInput] = useState('');
  const [showSpawnSpriteSheetUrl, setShowSpawnSpriteSheetUrl] = useState(false);
  const [spawnSpriteSheetUrlInput, setSpawnSpriteSheetUrlInput] = useState('');

  // Generic URL-input UI state for the non-directional animation sections (selectIntro,
  // selectLoop). Keyed by `${prefix}:sheet` / `${prefix}:image` so one record serves both
  // sections without a fixed useState per field. Spawn keeps its own dedicated state above.
  const [animUrlInputs, setAnimUrlInputs] = useState<Record<string, string>>({});
  const [showAnimUrl, setShowAnimUrl] = useState<Record<string, boolean>>({});

  // Sprite type choice per state — 'sheet' or 'image', used when neither is uploaded yet
  const [spriteTypeChoice, setSpriteTypeChoice] = useState<Record<string, 'sheet' | 'image'>>({});

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // The preview shows one tile (dashed rect) centered in the canvas with a
    // half-tile margin on each side so oversized sprites show their true
    // on-board overflow. previewTileSize is the tileSize passed to the shared
    // draw functions — zoom = previewTileSize / ART_TILE_PX.
    const previewTileSize = canvas.width / 2;

    const renderPreview = () => {
      // Clear (background is handled by CSS on parent div)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw tile boundary guide (dashed outline, one tile centered)
      const tileOrigin = (canvas.width - previewTileSize) / 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(tileOrigin + 1, tileOrigin + 1, previewTileSize - 2, previewTileSize - 2);
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

      // Helper to draw an image with anchor/offset applied (native size × zoom)
      const drawImageWithAnchor = (
        img: HTMLImageElement,
        ax: number, ay: number, ox: number, oy: number
      ) => {
        const zoom = previewTileSize / ART_TILE_PX;
        const drawWidth = Math.round(img.width * zoom);
        const drawHeight = Math.round(img.height * zoom);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, Math.round(canvas.width / 2 - drawWidth * ax + ox * zoom), Math.round(canvas.height / 2 - drawHeight * ay + oy * zoom), drawWidth, drawHeight);
      };

      // Draw sprite based on mode
      if (spriteMode === 'directional' && sprite.directionalSprites) {
        const dirSprite = sprite.directionalSprites[selectedDirection] || sprite.directionalSprites['default'];
        if (dirSprite) {
          // Check for sprite sheet first
          if (dirSprite.idleSpriteSheet && (dirSprite.idleSpriteSheet.imageData || dirSprite.idleSpriteSheet.imageUrl)) {
            drawSpriteConfig(ctx, dirSprite, canvas.width / 2, canvas.height / 2, previewTileSize);
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
                const tileOrigin = (canvas.width - previewTileSize) / 2;
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(tileOrigin + 1, tileOrigin + 1, previewTileSize - 2, previewTileSize - 2);
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
                drawImageWithAnchor(img, ax, ay, ox, oy);
              };
              img.src = imageToShow;
            } else {
              drawSpriteConfig(ctx, dirSprite, canvas.width / 2, canvas.height / 2, previewTileSize);
            }
          }
        }
      } else {
        // Simple mode - check for sprite sheet first
        if (sprite.idleSpriteSheet && (sprite.idleSpriteSheet.imageData || sprite.idleSpriteSheet.imageUrl)) {
          drawSprite(ctx, sprite, canvas.width / 2, canvas.height / 2, previewTileSize);
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
              const tileOrigin = (canvas.width - previewTileSize) / 2;
              ctx.save();
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
              ctx.setLineDash([4, 4]);
              ctx.strokeRect(tileOrigin + 1, tileOrigin + 1, previewTileSize - 2, previewTileSize - 2);
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
              drawImageWithAnchor(img, ax, ay, ox, oy);
            };
            img.src = simpleImageToShow;
          } else {
            drawSprite(ctx, sprite, canvas.width / 2, canvas.height / 2, previewTileSize);
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
      toast.warning('Configure this direction first before copying!');
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

    toast.success('Copied to all directions!');
  };

  const copyFromDirection = (sourceDir: SpriteDirection) => {
    if (sourceDir === selectedDirection) return;

    const dirSprites = sprite.directionalSprites || {};
    const sourceConfig = dirSprites[sourceDir];

    if (!sourceConfig) return;

    onChange({
      ...sprite,
      directionalSprites: {
        ...dirSprites,
        [selectedDirection]: { ...sourceConfig },
      },
    });

    setShowCopyFromOverlay(false);
  };

  // Per-state field groups for targeted copying
  const stateFields: Record<string, (keyof DirectionalSpriteConfig)[]> = {
    idle: ['idleImageData', 'idleImageUrl', 'idleSpriteSheet', 'idleAnchorX', 'idleAnchorY', 'idleOffsetX', 'idleOffsetY', 'imageData', 'imageUrl'],
    moving: ['movingImageData', 'movingImageUrl', 'movingSpriteSheet', 'movingAnchorX', 'movingAnchorY', 'movingOffsetX', 'movingOffsetY'],
    death: ['deathImageData', 'deathImageUrl', 'deathSpriteSheet', 'deathAnchorX', 'deathAnchorY', 'deathOffsetX', 'deathOffsetY'],
    casting: ['castingImageData', 'castingImageUrl', 'castingSpriteSheet', 'castingAnchorX', 'castingAnchorY', 'castingOffsetX', 'castingOffsetY'],
  };

  const copyStateToAllDirections = (stateName: string) => {
    const dirSprites = sprite.directionalSprites || {};
    const sourceConfig = dirSprites[selectedDirection];
    if (!sourceConfig) {
      toast.warning('Configure this direction first before copying!');
      return;
    }

    const fields = stateFields[stateName];
    if (!fields) return;

    const newDirectionalSprites: Partial<Record<SpriteDirection, DirectionalSpriteConfig>> = { ...dirSprites };
    DIRECTIONS.forEach(dir => {
      if (dir.key === selectedDirection) return;
      const existing = newDirectionalSprites[dir.key] || {};
      const updated = { ...existing };
      for (const field of fields) {
        const val = (sourceConfig as Record<string, unknown>)[field];
        if (val !== undefined) {
          (updated as Record<string, unknown>)[field] = val;
        } else {
          delete (updated as Record<string, unknown>)[field];
        }
      }
      newDirectionalSprites[dir.key] = updated as DirectionalSpriteConfig;
    });

    onChange({ ...sprite, directionalSprites: newDirectionalSprites });
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
      toast.warning('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const idleImageData = event.target?.result as string;
      warnIfOversizedUpload(idleImageData, 'Idle image');

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
      toast.warning('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const movingImageData = event.target?.result as string;
      warnIfOversizedUpload(movingImageData, 'Moving image');

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
        const { imageData: _imageData, idleImageData: _idleImageData, idleImageUrl: _idleImageUrl, imageUrl: _imageUrl, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { imageData: _imageData, idleImageData: _idleImageData, idleImageUrl: _idleImageUrl, imageUrl: _imageUrl, ...rest } = sprite;
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
        const { movingImageData: _movingImageData, movingImageUrl: _movingImageUrl, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { movingImageData: _movingImageData, movingImageUrl: _movingImageUrl, ...rest } = sprite;
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

  // (Death URL setters removed — death is now a single global animation,
  // authored via renderNonDirectionalAnim('death') in Global Settings.)

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
      toast.warning('Please upload an image file (PNG, JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      warnIfOversizedUpload(imageData, 'Sprite sheet', true);

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
      toast.warning('Please upload an image file (PNG, JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      warnIfOversizedUpload(imageData, 'Sprite sheet', true);

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        const { idleSpriteSheet: _idleSpriteSheet, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { idleSpriteSheet: _idleSpriteSheet, ...rest } = sprite;
      onChange({ ...rest });
    }
  };

  const clearMovingSpriteSheet = () => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (currentConfig) {
        const { movingSpriteSheet: _movingSpriteSheet, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { movingSpriteSheet: _movingSpriteSheet, ...rest } = sprite;
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
      toast.warning('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const deathImageData = event.target?.result as string;
      warnIfOversizedUpload(deathImageData, 'Death image');

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
      toast.warning('Please upload an image file (PNG, JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      warnIfOversizedUpload(imageData, 'Sprite sheet', true);

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        const { deathSpriteSheet: _deathSpriteSheet, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { deathSpriteSheet: _deathSpriteSheet, ...rest } = sprite;
      onChange({ ...rest });
    }
  };

  const clearDeathImage = () => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (currentConfig) {
        const { deathImageData: _deathImageData, deathImageUrl: _deathImageUrl, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { deathImageData: _deathImageData, deathImageUrl: _deathImageUrl, ...rest } = sprite;
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
      toast.warning('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const castingImageData = event.target?.result as string;
      warnIfOversizedUpload(castingImageData, 'Casting image');

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
      toast.warning('Please upload an image file (PNG, JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      warnIfOversizedUpload(imageData, 'Sprite sheet', true);

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        const { castingSpriteSheet: _castingSpriteSheet, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { castingSpriteSheet: _castingSpriteSheet, ...rest } = sprite;
      onChange({ ...rest });
    }
  };

  const clearCastingImage = () => {
    if (spriteMode === 'directional') {
      const dirSprites = sprite.directionalSprites || {};
      const currentConfig = dirSprites[selectedDirection];
      if (currentConfig) {
        const { castingImageData: _castingImageData, castingImageUrl: _castingImageUrl, ...rest } = currentConfig;
        onChange({
          ...sprite,
          directionalSprites: {
            ...dirSprites,
            [selectedDirection]: rest,
          },
        });
      }
    } else {
      const { castingImageData: _castingImageData, castingImageUrl: _castingImageUrl, ...rest } = sprite;
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
      toast.warning('Please upload an image file (PNG, JPG, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const spawnImageData = event.target?.result as string;
      warnIfOversizedUpload(spawnImageData, 'Spawn image');
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
      toast.warning('Please upload an image file (PNG, JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      warnIfOversizedUpload(imageData, 'Sprite sheet', true);

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const { spawnSpriteSheet: _spawnSpriteSheet, ...rest } = sprite;
    onChange({ ...rest });
  };

  const clearSpawnImage = () => {
    const { spawnImageData: _spawnImageData, spawnImageUrl: _spawnImageUrl, spawnAnchorX: _spawnAnchorX, spawnAnchorY: _spawnAnchorY, spawnOffsetX: _spawnOffsetX, spawnOffsetY: _spawnOffsetY, ...rest } = sprite;
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

  // Build faded "ghost" layers from the OTHER directions' same-slot sheets, so
  // the offset preview shows how the direction being edited lines up with its
  // siblings — no need to launch a game to check alignment. Directional mode only.
  const buildDirectionGhosts = (
    slotKey: 'idleSpriteSheet' | 'movingSpriteSheet' | 'deathSpriteSheet' | 'castingSpriteSheet',
  ): AnchorPreviewLayer[] => {
    if (!onionEnabled || spriteMode !== 'directional' || !sprite.directionalSprites) return [];
    const layers: AnchorPreviewLayer[] = [];
    for (const dir of DIRECTIONS) {
      if (dir.key === selectedDirection) continue;
      if (onionDir !== 'all' && dir.key !== onionDir) continue;
      const sheet = sprite.directionalSprites[dir.key]?.[slotKey];
      const src = sheet ? (sheet.imageData || sheet.imageUrl) : undefined;
      if (sheet && src) {
        layers.push({
          imageSrc: src,
          anchorX: sheet.anchorX ?? 0.5,
          anchorY: sheet.anchorY ?? 0.5,
          offsetX: sheet.offsetX ?? 0,
          offsetY: sheet.offsetY ?? 0,
          isSpriteSheet: true,
          frameCount: sheet.frameCount,
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
        });
      }
    }
    return layers;
  };

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
    ghosts?: AnchorPreviewLayer[],
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
      <div className="mt-2 p-2 bg-stone-800 rounded border border-stone-600 overflow-hidden">
        <div className="text-[10px] text-stone-400 mb-1 font-bold">Anchor Point</div>
        {/* Top row: anchor grid + preview side by side */}
        <div className="flex items-start gap-3 mb-2">
          <div className="grid grid-cols-3 gap-0.5 w-fit">
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
          {/* Inline anchor preview */}
          {imgSrc && (
            <AnchorPreview
              imageSrc={imgSrc}
              anchorX={anchorX}
              anchorY={anchorY}
              offsetX={offsetX}
              offsetY={offsetY}
              isSpriteSheet={!!previewSpriteSheet}
              frameCount={previewSpriteSheet?.frameCount}
              frameWidth={previewSpriteSheet?.frameWidth}
              frameHeight={previewSpriteSheet?.frameHeight}
              ghosts={ghosts}
              activeAlpha={ghosts && ghosts.length > 0 ? activePreviewOpacity : 1}
            />
          )}
        </div>
        {/* Sliders below */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-stone-400 w-10">Off X</label>
            <input
              type="range"
              min="-50"
              max="50"
              step="1"
              value={offsetX}
              onChange={(e) => onOffsetChange('offsetX', Math.round(parseFloat(e.target.value)) || 0)}
              className="flex-1 h-3"
            />
            <input
              type="number"
              min="-50"
              max="50"
              step="1"
              value={offsetX}
              onChange={(e) => onOffsetChange('offsetX', Math.round(parseFloat(e.target.value)) || 0)}
              className="w-10 text-[10px] text-stone-300 bg-stone-700 rounded px-1 py-0.5 text-right"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-stone-400 w-10">Off Y</label>
            <input
              type="range"
              min="-50"
              max="50"
              step="1"
              value={offsetY}
              onChange={(e) => onOffsetChange('offsetY', Math.round(parseFloat(e.target.value)) || 0)}
              className="flex-1 h-3"
            />
            <input
              type="number"
              min="-50"
              max="50"
              step="1"
              value={offsetY}
              onChange={(e) => onOffsetChange('offsetY', Math.round(parseFloat(e.target.value)) || 0)}
              className="w-10 text-[10px] text-stone-300 bg-stone-700 rounded px-1 py-0.5 text-right"
            />
          </div>
        </div>
      </div>
    );
  };

  // Generic editor section for one non-directional animation slot (selectIntro / selectLoop).
  // Mirrors the Spawn section (spritesheet OR static image, with anchor/offset controls) but is
  // parameterized by field prefix so we don't triplicate ~230 lines of JSX. `defaultLoop` is
  // baked into newly-uploaded spritesheets: selectIntro plays once (false), selectLoop loops (true).
  const renderNonDirectionalAnim = (
    prefix: 'selectIntro' | 'selectLoop' | 'death',
    opts: { title: string; description: string; defaultLoop: boolean },
  ) => {
    const { title, description, defaultLoop } = opts;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = sprite as any;
    const sheet: SpriteSheetConfig | undefined = s[`${prefix}SpriteSheet`];
    const imageData: string | undefined = s[`${prefix}ImageData`];
    const imageUrl: string | undefined = s[`${prefix}ImageUrl`];
    const hasSheet = !!(sheet?.imageData || sheet?.imageUrl);
    const hasImage = !!(imageData || imageUrl);
    const sheetKey = `${prefix}:sheet`;
    const imageKey = `${prefix}:image`;
    const fileAccept = 'image/png,image/jpg,image/jpeg,image/gif,image/webp';
    const fileInputClass = 'flex-1 px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-purple-600 file:text-parchment-100 hover:file:bg-purple-700';

    const handleSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast.warning('Please upload an image file (PNG, JPG)'); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as string;
        warnIfOversizedUpload(data, 'Sprite sheet', true);
        onChange({ ...sprite, [`${prefix}SpriteSheet`]: { imageData: data, frameCount: 4, frameRate: 10, loop: defaultLoop } });
      };
      reader.readAsDataURL(file);
    };
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast.warning('Please upload an image file (PNG, JPG, GIF)'); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as string;
        warnIfOversizedUpload(data, `${title} image`);
        onChange({ ...sprite, [`${prefix}ImageData`]: data });
      };
      reader.readAsDataURL(file);
    };
    const sheetConfigChange = (field: string, value: unknown) => {
      if (!sheet) return;
      onChange({ ...sprite, [`${prefix}SpriteSheet`]: { ...sheet, [field]: value } });
    };
    const clearSheet = () => {
      const rest = { ...sprite } as Record<string, unknown>;
      delete rest[`${prefix}SpriteSheet`];
      onChange(rest as unknown as CustomSprite);
    };
    const clearImage = () => {
      const rest = { ...sprite } as Record<string, unknown>;
      for (const f of ['ImageData', 'ImageUrl', 'AnchorX', 'AnchorY', 'OffsetX', 'OffsetY']) delete rest[`${prefix}${f}`];
      onChange(rest as unknown as CustomSprite);
    };
    const setSheetUrl = (url: string) => {
      onChange({ ...sprite, [`${prefix}SpriteSheet`]: { imageUrl: url, imageData: undefined, frameCount: sheet?.frameCount || 4, frameRate: sheet?.frameRate || 10, loop: sheet?.loop ?? defaultLoop } });
    };
    const setImageUrl = (url: string) => {
      onChange({ ...sprite, [`${prefix}ImageUrl`]: url, [`${prefix}ImageData`]: undefined });
    };
    const toggleUrl = (key: string) => setShowAnimUrl(p => ({ ...p, [key]: !p[key] }));
    const setUrlInput = (key: string, val: string) => setAnimUrlInputs(p => ({ ...p, [key]: val }));

    return (
      <div className="border-2 border-purple-700 rounded-lg p-4 bg-stone-900/50 mt-4">
        <h4 className="text-purple-400 font-bold mb-3 flex items-center gap-2">
          <span className="text-lg">✦</span> {title}
        </h4>
        <p className="text-xs text-stone-400 mb-3">{description}</p>

        {/* Sprite Sheet Upload */}
        <div className="mb-4">
          <label className="block text-sm font-bold mb-2">{title} Sprite Sheet (Animation)</label>
          <div className="space-y-2">
            <div className="flex gap-2 items-start min-w-0">
              <input type="file" accept={fileAccept} onChange={handleSheetUpload} className={fileInputClass} />
              {hasSheet && (
                <div className="w-16 h-16 sprite-preview-bg rounded border border-stone-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img src={sheet?.imageData || sheet?.imageUrl} alt={`${title} spritesheet`} className="max-w-full max-h-full object-contain" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <MediaBrowseButton onSelect={(url) => setSheetUrl(url)} label="☁️ Browse Media" className="px-2 py-1 text-xs" />
              <button type="button" onClick={() => toggleUrl(sheetKey)} className="text-xs text-arcane-400 hover:text-arcane-300">
                {showAnimUrl[sheetKey] ? '▼ Hide URL input' : '▶ Or paste URL...'}
              </button>
            </div>
            {showAnimUrl[sheetKey] && (
              <div className="flex gap-2">
                <input
                  type="url"
                  value={animUrlInputs[sheetKey] || ''}
                  onChange={(e) => setUrlInput(sheetKey, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (animUrlInputs[sheetKey] || '').trim()) { setSheetUrl(animUrlInputs[sheetKey].trim()); setUrlInput(sheetKey, ''); } }}
                  placeholder="https://your-storage.com/sheet.png"
                  className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
                />
                <button type="button" onClick={() => { if ((animUrlInputs[sheetKey] || '').trim()) { setSheetUrl(animUrlInputs[sheetKey].trim()); setUrlInput(sheetKey, ''); } }} className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm">Set</button>
              </div>
            )}
            {hasSheet && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Frame Count</label>
                    <input type="number" min="1" max="64" value={sheet?.frameCount || 4} onChange={(e) => sheetConfigChange('frameCount', parseInt(e.target.value))} className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Frame Rate (FPS)</label>
                    <input type="number" min="1" max="60" value={sheet?.frameRate || 10} onChange={(e) => sheetConfigChange('frameRate', parseInt(e.target.value))} className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-sm" />
                  </div>
                </div>
                <button onClick={clearSheet} className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700">✕ Clear {title} Sprite Sheet</button>
                {renderAnchorControls(
                  sheet?.anchorX ?? 0.5,
                  sheet?.anchorY ?? 0.5,
                  sheet?.offsetX ?? 0,
                  sheet?.offsetY ?? 0,
                  (ax, ay) => { sheetConfigChange('anchorX', ax); sheetConfigChange('anchorY', ay); },
                  (field, val) => sheetConfigChange(field, val),
                  undefined,
                  sheet,
                )}
              </>
            )}
            <p className="text-xs text-stone-400">
              {hasSheet ? (sheet?.imageUrl && !sheet?.imageData ? '✓ Using URL' : '✓ Sprite sheet configured') : 'No sprite sheet uploaded'}
            </p>
          </div>
        </div>

        {/* Static Image Upload - hidden when spritesheet is set */}
        {!hasSheet && (
          <div>
            <label className="block text-sm font-bold mb-2">{title} Image (Static)</label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start min-w-0">
                <input type="file" accept={fileAccept} onChange={handleImageUpload} className={fileInputClass} />
                {hasImage && (
                  <div className="w-16 h-16 sprite-preview-bg rounded border border-stone-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <img src={imageData || imageUrl} alt={`${title} static`} className="max-w-full max-h-full object-contain" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <MediaBrowseButton onSelect={(url) => setImageUrl(url)} label="☁️ Browse Media" className="px-2 py-1 text-xs" />
                <button type="button" onClick={() => toggleUrl(imageKey)} className="text-xs text-arcane-400 hover:text-arcane-300">
                  {showAnimUrl[imageKey] ? '▼ Hide URL input' : '▶ Or paste URL...'}
                </button>
              </div>
              {showAnimUrl[imageKey] && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={animUrlInputs[imageKey] || ''}
                    onChange={(e) => setUrlInput(imageKey, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (animUrlInputs[imageKey] || '').trim()) { setImageUrl(animUrlInputs[imageKey].trim()); setUrlInput(imageKey, ''); } }}
                    placeholder="https://your-storage.com/image.png"
                    className="flex-1 px-2 py-1 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500"
                  />
                  <button type="button" onClick={() => { if ((animUrlInputs[imageKey] || '').trim()) { setImageUrl(animUrlInputs[imageKey].trim()); setUrlInput(imageKey, ''); } }} className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm">Set</button>
                </div>
              )}
              {hasImage && (
                <>
                  <button onClick={clearImage} className="w-full px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-700">✕ Clear {title} Image</button>
                  {renderAnchorControls(
                    s[`${prefix}AnchorX`] ?? 0.5,
                    s[`${prefix}AnchorY`] ?? 0.5,
                    s[`${prefix}OffsetX`] ?? 0,
                    s[`${prefix}OffsetY`] ?? 0,
                    (ax, ay) => { onChange({ ...sprite, [`${prefix}AnchorX`]: ax, [`${prefix}AnchorY`]: ay }); },
                    (field, val) => { const key = field === 'offsetX' ? `${prefix}OffsetX` : `${prefix}OffsetY`; onChange({ ...sprite, [key]: val }); },
                    imageData || imageUrl,
                  )}
                </>
              )}
              <p className="text-xs text-stone-400">
                {hasImage ? (imageUrl && !imageData ? '✓ Using URL' : `✓ ${title} image uploaded`) : `No ${title.toLowerCase()} image set`}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Note: Always using directional mode now. The 'Default/Static' direction serves as the universal fallback. */}

      {/* LEGACY SIMPLE MODE - condition will never be true, kept for reference during migration */}
      {/* eslint-disable-next-line no-constant-binary-expression */}
      {false && (
        <>
          {/* Simple Sprite Sheet Upload */}
          <div>
            <label className="block text-sm font-bold mb-2">
              Sprite Sheet (Animated)
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start min-w-0">
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
                {hasIdleSpriteSheet ? '✓ Sprite sheet configured' : 'No sprite sheet uploaded'}
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
              <div className="flex gap-2 items-start min-w-0">
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

              {/* Cloud Media + URL Input Toggle */}
              <div className="flex items-center gap-2">
                <MediaBrowseButton onSelect={(url) => setIdleImageUrl(url)} label="☁️ Browse Media" className="px-2 py-1 text-xs" />
                <button
                  type="button"
                  onClick={() => setShowIdleImageUrl(!showIdleImageUrl)}
                  className="text-xs text-arcane-400 hover:text-arcane-300"
                >
                  {showIdleImageUrl ? '▼ Hide URL input' : '▶ Or paste URL...'}
                </button>
              </div>

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
              <div className="flex gap-2 items-start min-w-0">
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
                {hasDeathSpriteSheet ? '✓ Death sprite sheet configured' : 'No sprite sheet uploaded'}
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
              <div className="flex gap-2 items-start min-w-0">
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
              <div className="flex gap-2 items-start min-w-0">
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
                {hasCastingSpriteSheet ? '✓ Casting sprite sheet configured' : 'No sprite sheet uploaded'}
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
              <div className="flex gap-2 items-start min-w-0">
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

      {/* Editor Section Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setEditorTab('directional')}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
            editorTab === 'directional'
              ? 'bg-purple-700 text-parchment-100'
              : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
          }`}
        >
          Directional Sprites
        </button>
        <button
          onClick={() => setEditorTab('global')}
          className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
            editorTab === 'global'
              ? 'bg-cyan-700 text-parchment-100'
              : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
          }`}
        >
          Global Settings
        </button>
      </div>

      {/* DIRECTIONAL MODE UPLOADS */}
      {editorTab === 'directional' && (
        <>
          {/* Direction Selector */}
          <div>
            <label className="block text-sm font-bold mb-2">Direction</label>
            <div className="grid grid-cols-3 gap-1">
              {DIRECTIONS.map((dir) => {
                const dirConfig = sprite.directionalSprites?.[dir.key];
                const hasIdleSS = !!dirConfig?.idleSpriteSheet;
                const hasMovingSS = !!dirConfig?.movingSpriteSheet;
                const hasCastingSS = !!dirConfig?.castingSpriteSheet;
                const hasIdleImg = dirConfig?.idleImageData || dirConfig?.imageData;
                const hasMovingImg = dirConfig?.movingImageData;
                const hasCastingImg = dirConfig?.castingImageData;

                const hasIdle = !!(hasIdleSS || hasIdleImg);
                const hasMoving = !!(hasMovingSS || hasMovingImg);
                const hasCasting = !!(hasCastingSS || hasCastingImg);

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
                    <div className="grid grid-cols-3 gap-x-1 text-[9px]">
                      {[
                        { icon: '💤', done: hasIdle, label: 'Idle' },
                        { icon: '🏃', done: hasMoving, label: 'Move' },
                        { icon: '✨', done: hasCasting, label: 'Cast' },
                      ].map((s) => (
                        <div key={s.label} className="flex flex-col items-center" title={`${s.label}: ${s.done ? 'Set' : 'Not set'}`}>
                          <span>{s.icon}</span>
                          <span className={s.done ? 'text-green-400' : 'text-stone-600'}>{s.done ? '☑' : '☐'}</span>
                        </div>
                      ))}
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
            <button
              onClick={() => setShowCopyFromOverlay(true)}
              className="w-full mt-1 px-3 py-1 text-xs bg-blue-600 rounded hover:bg-blue-700"
            >
              📥 Copy From Another Direction
            </button>
          </div>

          {/* IDLE & MOVING STATES */}
          <div className="bg-green-950 bg-opacity-30 p-4 rounded border-2 border-green-900">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-green-400">💤 Idle & Moving States</h3>
              <div className="flex gap-1">
                <button
                  onClick={() => copyStateToAllDirections('idle')}
                  className="px-2 py-0.5 text-[10px] bg-green-700 rounded hover:bg-green-600 text-parchment-100"
                  title="Copy idle sprite to all directions"
                >
                  Idle → All
                </button>
                <button
                  onClick={() => copyStateToAllDirections('moving')}
                  className="px-2 py-0.5 text-[10px] bg-green-700 rounded hover:bg-green-600 text-parchment-100"
                  title="Copy moving sprite to all directions"
                >
                  Moving → All
                </button>
              </div>
            </div>
            <p className="text-xs text-stone-400 mb-4">
              Sprites for when the unit is idle (not moving) or actively moving
            </p>

          {/* Sprite type toggle — shown when neither sheet nor image is set */}
          {!hasIdleSpriteSheet && !hasIdleImage && (
            <div className="flex gap-1 mb-3">
              <button
                onClick={() => setSpriteTypeChoice(prev => ({ ...prev, idle: 'sheet' }))}
                className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${(spriteTypeChoice.idle || 'sheet') === 'sheet' ? 'bg-purple-700 text-parchment-100' : 'bg-stone-700 text-stone-400 hover:bg-stone-600'}`}
              >
                🎞️ Sprite Sheet
              </button>
              <button
                onClick={() => setSpriteTypeChoice(prev => ({ ...prev, idle: 'image' }))}
                className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${spriteTypeChoice.idle === 'image' ? 'bg-blue-700 text-parchment-100' : 'bg-stone-700 text-stone-400 hover:bg-stone-600'}`}
              >
                🖼️ Still Image
              </button>
            </div>
          )}

          {/* Onion-skin preview controls — affects the small offset previews only, never the board */}
          <div className="mb-3 p-2 bg-stone-800/70 rounded border border-stone-600 text-xs">
            <label className="flex items-center gap-2 text-stone-200 font-semibold cursor-pointer">
              <input type="checkbox" checked={onionEnabled} onChange={(e) => setOnionEnabled(e.target.checked)} />
              👻 Onion-skin (ghost other directions in the offset preview)
            </label>
            {onionEnabled && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-stone-400 w-20 shrink-0">Compare to</span>
                  <select
                    value={onionDir}
                    onChange={(e) => setOnionDir(e.target.value as SpriteDirection | 'all')}
                    className="flex-1 px-2 py-1 bg-stone-700 rounded text-parchment-100"
                  >
                    <option value="all">All other directions</option>
                    {DIRECTIONS.filter((d) => d.key !== selectedDirection).map((d) => (
                      <option key={d.key} value={d.key}>{d.arrow} {d.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-stone-400 w-20 shrink-0">Active opacity</span>
                  <input
                    type="range" min="0.15" max="1" step="0.05"
                    value={activePreviewOpacity}
                    onChange={(e) => setActivePreviewOpacity(parseFloat(e.target.value))}
                    className="flex-1 h-3"
                  />
                  <span className="w-9 text-right text-stone-300">{Math.round(activePreviewOpacity * 100)}%</span>
                </div>
                <p className="text-[10px] text-stone-500">Preview only — never affects how sprites render in-game.</p>
              </div>
            )}
          </div>

          {/* Idle Sprite Sheet Upload */}
          {(hasIdleSpriteSheet || (!hasIdleImage && (spriteTypeChoice.idle || 'sheet') === 'sheet')) && (<div>
            <label className="block text-sm font-bold mb-2">
              Idle Sprite Sheet (Not Moving - Animated) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start min-w-0">
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

              {/* Cloud Media + URL Input Toggle */}
              <div className="flex items-center gap-2">
                <MediaBrowseButton onSelect={(url) => setIdleSpriteSheetUrl(url)} label="☁️ Browse Media" className="px-2 py-1 text-xs" />
                <button
                  type="button"
                  onClick={() => setShowIdleSpriteSheetUrl(!showIdleSpriteSheetUrl)}
                  className="text-xs text-arcane-400 hover:text-arcane-300"
                >
                  {showIdleSpriteSheetUrl ? '▼ Hide URL input' : '▶ Or paste URL...'}
                </button>
              </div>

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
                    buildDirectionGhosts('idleSpriteSheet'),
                  )}
                </>
              )}
              <p className="text-xs text-stone-400">
                {hasIdleSpriteSheet
                  ? currentConfig.idleSpriteSheet?.imageUrl && !currentConfig.idleSpriteSheet?.imageData
                    ? '✓ Using URL'
                    : '✓ Idle sprite sheet configured'
                  : 'No sprite sheet uploaded'}
              </p>
              <p className="text-xs text-purple-400">
                💡 Sprite sheets should be horizontal strips with frames of equal width
              </p>
            </div>
          </div>)}

          {/* Idle Image Upload */}
          {(hasIdleImage || (!hasIdleSpriteSheet && spriteTypeChoice.idle === 'image')) && (<div>
            <label className="block text-sm font-bold mb-2">
              Idle Image (Not Moving - Static) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start min-w-0">
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

              {/* Cloud Media + URL Input Toggle */}
              <div className="flex items-center gap-2">
                <MediaBrowseButton onSelect={(url) => setIdleImageUrl(url)} label="☁️ Browse Media" className="px-2 py-1 text-xs" />
                <button
                  type="button"
                  onClick={() => setShowIdleImageUrl(!showIdleImageUrl)}
                  className="text-xs text-arcane-400 hover:text-arcane-300"
                >
                  {showIdleImageUrl ? '▼ Hide URL input' : '▶ Or paste URL...'}
                </button>
              </div>

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

          {/* Sprite type toggle — shown when neither sheet nor image is set */}
          {!hasMovingSpriteSheet && !hasMovingImage && (
            <div className="flex gap-1 mb-3">
              <button
                onClick={() => setSpriteTypeChoice(prev => ({ ...prev, moving: 'sheet' }))}
                className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${(spriteTypeChoice.moving || 'sheet') === 'sheet' ? 'bg-purple-700 text-parchment-100' : 'bg-stone-700 text-stone-400 hover:bg-stone-600'}`}
              >
                🎞️ Sprite Sheet
              </button>
              <button
                onClick={() => setSpriteTypeChoice(prev => ({ ...prev, moving: 'image' }))}
                className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${spriteTypeChoice.moving === 'image' ? 'bg-blue-700 text-parchment-100' : 'bg-stone-700 text-stone-400 hover:bg-stone-600'}`}
              >
                🖼️ Still Image
              </button>
            </div>
          )}

          {/* Moving Sprite Sheet Upload */}
          {(hasMovingSpriteSheet || (!hasMovingImage && (spriteTypeChoice.moving || 'sheet') === 'sheet')) && (<div>
            <label className="block text-sm font-bold mb-2">
              Moving Sprite Sheet (While Moving - Animated) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start min-w-0">
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

              {/* Cloud Media + URL Input Toggle */}
              <div className="flex items-center gap-2">
                <MediaBrowseButton onSelect={(url) => setMovingSpriteSheetUrl(url)} label="☁️ Browse Media" className="px-2 py-1 text-xs" />
                <button
                  type="button"
                  onClick={() => setShowMovingSpriteSheetUrl(!showMovingSpriteSheetUrl)}
                  className="text-xs text-arcane-400 hover:text-arcane-300"
                >
                  {showMovingSpriteSheetUrl ? '▼ Hide URL input' : '▶ Or paste URL...'}
                </button>
              </div>

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
                    buildDirectionGhosts('movingSpriteSheet'),
                  )}
                </>
              )}
              <p className="text-xs text-stone-400">
                {hasMovingSpriteSheet
                  ? currentConfig.movingSpriteSheet?.imageUrl && !currentConfig.movingSpriteSheet?.imageData
                    ? '✓ Using URL'
                    : '✓ Moving sprite sheet configured'
                  : 'No sprite sheet uploaded'}
              </p>
              <p className="text-xs text-purple-400">
                💡 Sprite sheets should be horizontal strips with frames of equal width
              </p>
            </div>
          </div>)}

          {/* Moving Image Upload */}
          {(hasMovingImage || (!hasMovingSpriteSheet && spriteTypeChoice.moving === 'image')) && (<div>
            <label className="block text-sm font-bold mb-2">
              Moving Image (While Moving - Static) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start min-w-0">
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

              {/* Cloud Media + URL Input Toggle */}
              <div className="flex items-center gap-2">
                <MediaBrowseButton onSelect={(url) => setMovingImageUrl(url)} label="☁️ Browse Media" className="px-2 py-1 text-xs" />
                <button
                  type="button"
                  onClick={() => setShowMovingImageUrl(!showMovingImageUrl)}
                  className="text-xs text-arcane-400 hover:text-arcane-300"
                >
                  {showMovingImageUrl ? '▼ Hide URL input' : '▶ Or paste URL...'}
                </button>
              </div>

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

          {/* CASTING STATE */}
          <div className="bg-yellow-950 bg-opacity-30 p-4 rounded border-2 border-yellow-900">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-yellow-400">✨ Casting State</h3>
              <button
                onClick={() => copyStateToAllDirections('casting')}
                className="px-2 py-0.5 text-[10px] bg-yellow-700 rounded hover:bg-yellow-600 text-parchment-100"
                title="Copy casting sprite to all directions"
              >
                Casting → All
              </button>
            </div>
            <p className="text-xs text-stone-400 mb-4">
              Animation when casting a spell while stationary (moving animation has priority)
            </p>

          {/* Sprite type toggle — shown when neither sheet nor image is set */}
          {!hasCastingSpriteSheet && !hasCastingImage && (
            <div className="flex gap-1 mb-3">
              <button
                onClick={() => setSpriteTypeChoice(prev => ({ ...prev, casting: 'sheet' }))}
                className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${(spriteTypeChoice.casting || 'sheet') === 'sheet' ? 'bg-purple-700 text-parchment-100' : 'bg-stone-700 text-stone-400 hover:bg-stone-600'}`}
              >
                🎞️ Sprite Sheet
              </button>
              <button
                onClick={() => setSpriteTypeChoice(prev => ({ ...prev, casting: 'image' }))}
                className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${spriteTypeChoice.casting === 'image' ? 'bg-blue-700 text-parchment-100' : 'bg-stone-700 text-stone-400 hover:bg-stone-600'}`}
              >
                🖼️ Still Image
              </button>
            </div>
          )}

          {/* Casting Sprite Sheet Upload */}
          {(hasCastingSpriteSheet || (!hasCastingImage && (spriteTypeChoice.casting || 'sheet') === 'sheet')) && (<div>
            <label className="block text-sm font-bold mb-2">
              Casting Sprite Sheet (Casting Spell - Animated) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start min-w-0">
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

              {/* Cloud Media + URL Input Toggle */}
              <div className="flex items-center gap-2">
                <MediaBrowseButton onSelect={(url) => setCastingSpriteSheetUrl(url)} label="☁️ Browse Media" className="px-2 py-1 text-xs" />
                <button
                  type="button"
                  onClick={() => setShowCastingSpriteSheetUrl(!showCastingSpriteSheetUrl)}
                  className="text-xs text-arcane-400 hover:text-arcane-300"
                >
                  {showCastingSpriteSheetUrl ? '▼ Hide URL input' : '▶ Or paste URL...'}
                </button>
              </div>

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
                    buildDirectionGhosts('castingSpriteSheet'),
                  )}
                </>
              )}
              <p className="text-xs text-stone-400">
                {hasCastingSpriteSheet
                  ? currentConfig.castingSpriteSheet?.imageUrl && !currentConfig.castingSpriteSheet?.imageData
                    ? '✓ Using URL'
                    : '✓ Casting sprite sheet configured'
                  : 'No sprite sheet uploaded'}
              </p>
              <p className="text-xs text-yellow-400">
                ✨ Casting animation plays when character/enemy casts spell while stationary
              </p>
            </div>
          </div>)}

          {/* Casting Image Upload */}
          {(hasCastingImage || (!hasCastingSpriteSheet && spriteTypeChoice.casting === 'image')) && (<div>
            <label className="block text-sm font-bold mb-2">
              Casting Image (Casting Spell - Static) - {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
            </label>
            <div className="space-y-2">
              <div className="flex gap-2 items-start min-w-0">
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

              {/* Cloud Media + URL Input Toggle */}
              <div className="flex items-center gap-2">
                <MediaBrowseButton onSelect={(url) => setCastingImageUrl(url)} label="☁️ Browse Media" className="px-2 py-1 text-xs" />
                <button
                  type="button"
                  onClick={() => setShowCastingImageUrl(!showCastingImageUrl)}
                  className="text-xs text-arcane-400 hover:text-arcane-300"
                >
                  {showCastingImageUrl ? '▼ Hide URL input' : '▶ Or paste URL...'}
                </button>
              </div>

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

          {/* COPY FROM DIRECTION OVERLAY */}
          {showCopyFromOverlay && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowCopyFromOverlay(false)}>
              <div className="bg-stone-800 border-2 border-blue-600 rounded-lg p-5 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-parchment-100 mb-1">Copy sprites to {DIRECTIONS.find(d => d.key === selectedDirection)?.label}</h3>
                <p className="text-xs text-stone-400 mb-4">Select a direction to copy its sprites from</p>
                <div className="grid grid-cols-3 gap-2">
                  {DIRECTIONS.map((dir) => {
                    const dirConfig = sprite.directionalSprites?.[dir.key];
                    const isCurrent = dir.key === selectedDirection;
                    const hasAnySprite = dirConfig && (
                      dirConfig.idleImageData || dirConfig.imageData || dirConfig.idleImageUrl || dirConfig.imageUrl ||
                      dirConfig.idleSpriteSheet || dirConfig.movingImageData || dirConfig.movingImageUrl || dirConfig.movingSpriteSheet ||
                      dirConfig.deathImageData || dirConfig.deathImageUrl || dirConfig.deathSpriteSheet ||
                      dirConfig.castingImageData || dirConfig.castingImageUrl || dirConfig.castingSpriteSheet
                    );
                    const isDisabled = isCurrent || !hasAnySprite;

                    return (
                      <button
                        key={dir.key}
                        disabled={isDisabled}
                        onClick={() => copyFromDirection(dir.key)}
                        className={`p-2 rounded flex flex-col items-center gap-1 text-xs transition-colors ${
                          isDisabled
                            ? 'bg-stone-700/50 text-stone-500 cursor-not-allowed'
                            : 'bg-stone-700 hover:bg-blue-600 text-parchment-100 cursor-pointer'
                        }`}
                      >
                        <div className="text-sm font-medium">{dir.arrow} {dir.label}</div>
                        {dirConfig && hasAnySprite ? (
                          <DirectionPreviewCanvas dirConfig={dirConfig} size={48} />
                        ) : (
                          <div className="w-12 h-12 rounded bg-stone-900 border border-stone-600 flex items-center justify-center">
                            <span className="text-[9px] text-stone-500">{isCurrent ? 'Current' : 'Empty'}</span>
                          </div>
                        )}
                        {isCurrent && <span className="text-[9px] text-blue-400">(Current)</span>}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setShowCopyFromOverlay(false)}
                  className="w-full mt-4 px-3 py-2 text-sm bg-stone-600 rounded hover:bg-stone-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Note: Corpse appearance is now handled by the final frame of the Death sprite sheet */}

      {/* GLOBAL SETTINGS TAB */}
      {editorTab === 'global' && (
      <>
      {renderNonDirectionalAnim('death', {
        title: '💀 Death',
        description: 'Plays once when the entity reaches 0 HP, then holds on the final frame (the corpse). Not directional — the same animation plays regardless of facing direction.',
        defaultLoop: false,
      })}
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
            <div className="flex gap-2 items-start min-w-0">
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

            {/* Cloud Media + URL Input Toggle */}
            <div className="flex items-center gap-2">
              <MediaBrowseButton onSelect={(url) => setSpawnSpriteSheetUrl(url)} label="☁️ Browse Media" className="px-2 py-1 text-xs" />
              <button
                type="button"
                onClick={() => setShowSpawnSpriteSheetUrl(!showSpawnSpriteSheetUrl)}
                className="text-xs text-arcane-400 hover:text-arcane-300"
              >
                {showSpawnSpriteSheetUrl ? '▼ Hide URL input' : '▶ Or paste URL...'}
              </button>
            </div>

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
                )}
              </>
            )}
            <p className="text-xs text-stone-400">
              {hasSpawnSpriteSheetConfig
                ? sprite.spawnSpriteSheet?.imageUrl && !sprite.spawnSpriteSheet?.imageData
                  ? '✓ Using URL'
                  : '✓ Spawn sprite sheet configured'
                : 'No sprite sheet uploaded'}
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
              <div className="flex gap-2 items-start min-w-0">
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

              {/* Cloud Media + URL Input Toggle */}
              <div className="flex items-center gap-2">
                <MediaBrowseButton onSelect={(url) => setSpawnImageUrl(url)} label="☁️ Browse Media" className="px-2 py-1 text-xs" />
                <button
                  type="button"
                  onClick={() => setShowSpawnImageUrl(!showSpawnImageUrl)}
                  className="text-xs text-arcane-400 hover:text-arcane-300"
                >
                  {showSpawnImageUrl ? '▼ Hide URL input' : '▶ Or paste URL...'}
                </button>
              </div>

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
      {renderNonDirectionalAnim('selectIntro', {
        title: 'Select Intro',
        description: 'Hero-card only. Plays once when a hero is selected for placement, then transitions into the Select Loop. Not directional — one direction is all that\'s needed.',
        defaultLoop: false,
      })}
      {renderNonDirectionalAnim('selectLoop', {
        title: 'Select Loop',
        description: 'Hero-card only. Loops for as long as the hero stays selected, after the Select Intro finishes. Not directional.',
        defaultLoop: true,
      })}
      </>
      )}

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
          Shape Size: {((currentConfig.size ?? 0.6) * 100).toFixed(0)}%
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
        <p className="text-xs text-stone-400 mt-1">
          Only affects the shape fallback. Images render at native pixel size (a tile is {ART_TILE_PX}×{ART_TILE_PX}px).
        </p>
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
  let _activeState: 'moving' | 'casting' | 'idle' = isMoving ? 'moving' : 'idle';
  if (!spriteSheet && isCasting && !isMoving) {
    spriteSheet = config.castingSpriteSheet;
    _activeState = 'casting';
  }
  if (!spriteSheet) {
    spriteSheet = config.idleSpriteSheet;
    _activeState = spriteSheet ? (isMoving ? 'moving' : isCasting ? 'casting' : 'idle') : _activeState;
  }
  if (spriteSheet) {
    // Anchor from spritesheet itself
    const ax = spriteSheet.anchorX ?? 0.5;
    const ay = spriteSheet.anchorY ?? 0.5;
    const ox = spriteSheet.offsetX ?? 0;
    const oy = spriteSheet.offsetY ?? 0;
    drawSpriteSheet(ctx, spriteSheet, centerX, centerY, tileSize, now, ax, ay, ox, oy);
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
    const ox = Math.round((imageState === 'moving' ? config.movingOffsetX : imageState === 'casting' ? config.castingOffsetX : config.idleOffsetX) ?? 0);
    const oy = Math.round((imageState === 'moving' ? config.movingOffsetY : imageState === 'casting' ? config.castingOffsetY : config.idleOffsetY) ?? 0);

    // Use cached image with load notification for GIF animation support
    const img = loadSpriteImage(imageToUse);

    // Draw the image - for GIFs, the browser handles animation automatically
    // We draw even if not fully loaded to ensure GIF animation starts properly
    try {
      // Native-size rendering: image dims × zoom; offsets are in art pixels
      const zoom = tileSize / ART_TILE_PX;
      let drawWidth = tileSize;
      let drawHeight = tileSize;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        drawWidth = Math.round(img.naturalWidth * zoom);
        drawHeight = Math.round(img.naturalHeight * zoom);
      }

      ctx.drawImage(img, Math.round(centerX - drawWidth * ax + ox * zoom), Math.round(centerY - drawHeight * ay + oy * zoom), drawWidth, drawHeight);
    } catch {
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

    case 'hexagon':
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * i) / 3 - Math.PI / 6;
        const hx = centerX + Math.cos(angle) * radius;
        const hy = centerY + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
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
// eslint-disable-next-line react-refresh/only-export-components
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
    drawSpriteSheet(ctx, simpleSpriteSheet, centerX, centerY, tileSize, now, ax, ay, ox, oy);
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
    const ox = Math.round((imgState === 'moving' ? sprite.movingOffsetX : imgState === 'casting' ? sprite.castingOffsetX : sprite.idleOffsetX) ?? 0);
    const oy = Math.round((imgState === 'moving' ? sprite.movingOffsetY : imgState === 'casting' ? sprite.castingOffsetY : sprite.idleOffsetY) ?? 0);

    // Use cached image with load notification for GIF animation support
    const img = loadSpriteImage(spriteImageToUse);

    // Draw the image - for GIFs, the browser handles animation automatically
    // We draw even if not fully loaded to ensure GIF animation starts properly
    try {
      // Native-size rendering: image dims × zoom; offsets are in art pixels
      const zoom = tileSize / ART_TILE_PX;
      let drawWidth = tileSize;
      let drawHeight = tileSize;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        drawWidth = Math.round(img.naturalWidth * zoom);
        drawHeight = Math.round(img.naturalHeight * zoom);
      }

      ctx.drawImage(img, Math.round(centerX - drawWidth * ax + ox * zoom), Math.round(centerY - drawHeight * ay + oy * zoom), drawWidth, drawHeight);
    } catch {
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

    case 'hexagon':
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * i) / 3 - Math.PI / 6;
        const hx = centerX + Math.cos(angle) * radius;
        const hy = centerY + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
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
// eslint-disable-next-line react-refresh/only-export-components
export function drawDeathSprite(
  ctx: CanvasRenderingContext2D,
  sprite: CustomSprite,
  centerX: number,
  centerY: number,
  tileSize: number,
  _direction?: Direction,
  startTime: number = Date.now()
): boolean {
  const now = Date.now();

  // Death is a single global (non-directional) animation — same sprite plays
  // regardless of facing direction. Authored in the editor's Global Settings.
  if (sprite.deathSpriteSheet) {
    const ax = sprite.deathSpriteSheet.anchorX ?? 0.5;
    const ay = sprite.deathSpriteSheet.anchorY ?? 0.5;
    const ox = sprite.deathSpriteSheet.offsetX ?? 0;
    const oy = sprite.deathSpriteSheet.offsetY ?? 0;
    // Force loop=false for death animations so they stop on final frame
    const deathSheet = { ...sprite.deathSpriteSheet, loop: false };
    drawSpriteSheetFromStartTime(ctx, deathSheet, centerX, centerY, tileSize, startTime, now, ax, ay, ox, oy);
    return true;
  }

  // Check for simple mode death image
  if (sprite.deathImageData) {
    const ax = sprite.deathAnchorX ?? 0.5;
    const ay = sprite.deathAnchorY ?? 0.5;
    const ox = sprite.deathOffsetX ?? 0;
    const oy = sprite.deathOffsetY ?? 0;
    drawImage(ctx, sprite.deathImageData, centerX, centerY, tileSize, ax, ay, ox, oy);
    return true;
  }

  return false;
}

/**
 * Check if a sprite has any death animation configured
 */
// eslint-disable-next-line react-refresh/only-export-components
export function hasDeathAnimation(sprite: CustomSprite): boolean {
  // Death is a single global animation (see drawDeathSprite).
  return !!(sprite.deathSpriteSheet || sprite.deathImageData);
}

/**
 * Draw spawn animation sprite for an entity
 * Returns true if a spawn sprite was drawn, false if not available
 *
 * @param startTime - When the spawn started (for proper frame calculation)
 *                    For sprite sheets, this ensures animation plays from start and stops on final frame
 */
// eslint-disable-next-line react-refresh/only-export-components
export function drawSpawnSprite(
  ctx: CanvasRenderingContext2D,
  sprite: CustomSprite,
  centerX: number,
  centerY: number,
  tileSize: number,
  startTime: number = Date.now()
): boolean {
  const now = Date.now();

  // Spawn animations are NOT directional - same animation regardless of facing

  // Check for spawn sprite sheet (animation)
  if (sprite.spawnSpriteSheet) {
    const ax = sprite.spawnSpriteSheet.anchorX ?? 0.5;
    const ay = sprite.spawnSpriteSheet.anchorY ?? 0.5;
    const ox = sprite.spawnSpriteSheet.offsetX ?? 0;
    const oy = sprite.spawnSpriteSheet.offsetY ?? 0;

    // Use drawSpriteSheetFromStartTime for proper one-shot animation timing
    // Create a modified config with loop=false for spawn animations
    const spawnSheet = { ...sprite.spawnSpriteSheet, loop: false };
    drawSpriteSheetFromStartTime(
      ctx,
      spawnSheet,
      centerX,
      centerY,
      tileSize,
      startTime,
      now,
      ax,
      ay,
      ox,
      oy
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
    drawImage(ctx, spawnImageSrc, centerX, centerY, tileSize, ax, ay, ox, oy);
    return true;
  }

  return false;
}

/**
 * Check if a sprite has any spawn animation configured
 */
// eslint-disable-next-line react-refresh/only-export-components
export function hasSpawnAnimation(sprite: CustomSprite): boolean {
  // Only check simple mode - spawn animations are NOT directional
  return !!(sprite.spawnSpriteSheet || sprite.spawnImageData || sprite.spawnImageUrl);
}

/**
 * Check if spawn animation is still playing (hasn't finished)
 * Returns true if animation is still active, false if complete
 */
// eslint-disable-next-line react-refresh/only-export-components
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
  tileSize: number,
  anchorX: number = 0.5,
  anchorY: number = 0.5,
  offsetX: number = 0,
  offsetY: number = 0
): void {
  const img = loadSpriteImage(imageData);
  // Offsets are whole art pixels — round defensively (see drawSpriteSheet).
  offsetX = Math.round(offsetX);
  offsetY = Math.round(offsetY);

  try {
    // Native-size rendering: image dims × zoom; offsets are in art pixels
    const zoom = tileSize / ART_TILE_PX;
    let drawWidth = tileSize;
    let drawHeight = tileSize;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      drawWidth = Math.round(img.naturalWidth * zoom);
      drawHeight = Math.round(img.naturalHeight * zoom);
    }

    ctx.drawImage(img, Math.round(centerX - drawWidth * anchorX + offsetX * zoom), Math.round(centerY - drawHeight * anchorY + offsetY * zoom), drawWidth, drawHeight);
  } catch {
    // Image not ready
  }
}

/**
 * On-screen height of a sprite's idle frame under native-size rendering.
 * Used for layout that depends on sprite height (health bar placement,
 * bottom_center anchoring). Falls back to one tile when the image hasn't
 * loaded yet or the sprite is a shape.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getSpriteDrawHeight(sprite: CustomSprite, tileSize: number): number {
  const zoom = tileSize / ART_TILE_PX;
  const dirConfig = sprite.useDirectional ? sprite.directionalSprites?.default : undefined;

  const sheet = dirConfig?.idleSpriteSheet || sprite.idleSpriteSheet;
  const sheetSrc = sheet ? (sheet.imageData || sheet.imageUrl) : undefined;
  if (sheet && sheetSrc) {
    if (sheet.frameHeight) return Math.round(sheet.frameHeight * zoom);
    const img = loadSpriteImage(sheetSrc);
    if (img.naturalHeight > 0) return Math.round(img.naturalHeight * zoom);
    return tileSize;
  }

  const imgSrc = dirConfig
    ? (dirConfig.idleImageData || dirConfig.imageData || dirConfig.idleImageUrl || dirConfig.imageUrl)
    : (sprite.idleImageData || sprite.imageData || sprite.idleImageUrl || sprite.imageUrl);
  if (imgSrc) {
    const img = loadSpriteImage(imgSrc);
    if (img.naturalHeight > 0) return Math.round(img.naturalHeight * zoom);
    return tileSize;
  }

  // Shape fallback — shapes still size by the legacy `size` fraction
  return (sprite.size || 0.6) * tileSize;
}
