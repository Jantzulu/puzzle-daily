import React, { useRef, useEffect, useState } from 'react';
import { toast } from '../shared/Toast';
import type { CustomSprite, DirectionalSpriteConfig, SpriteDirection, SpriteSheetConfig } from '../../utils/assetStorage';
import { Direction } from '../../types/game';
import { subscribeToImageLoads, loadImage } from '../../utils/imageLoader';
import { MediaBrowseButton } from './MediaBrowseButton';
import { drawBlobShadowResolved, resolveShadowConfigByKey, resolveDeathShadowConfig, type ResolvedShadow } from '../game/blobShadows';
import { drawLightGlowResolved, resolveGlowConfig, type ResolvedGlow } from '../game/lightGlow';

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
 * Snap an anchor offset to a whole art pixel (a multiple of `zoom`) so
 * odd-dimension sprites lock to the tile's art-pixel grid instead of landing on
 * a sub-art-pixel (half-pixel) position. Even-dimension sprites are unaffected.
 * Used by every entity draw path so the board and the offset preview snap
 * identically (offsets are already whole art pixels, so they stay grid-aligned).
 */
function snapAnchorPx(drawSize: number, anchor: number, zoom: number): number {
  return Math.round((drawSize * anchor) / zoom) * zoom;
}

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
  const dx = Math.round(centerX - snapAnchorPx(finalWidth, anchorX, zoom) + offsetX * zoom);
  const dy = Math.round(centerY - snapAnchorPx(finalHeight, anchorY, zoom) + offsetY * zoom);

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
  const dx = Math.round(centerX - snapAnchorPx(finalWidth, anchorX, zoom) + offsetX * zoom);
  const dy = Math.round(centerY - snapAnchorPx(finalHeight, anchorY, zoom) + offsetY * zoom);

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
  /** Entity sprites (characters/enemies): draw the ground blob shadow in the
   *  offset previews and show the Ground Shadow settings. Leave unset for
   *  non-entity sprites (tiles, objects) which never cast shadows. */
  shadowPreview?: boolean;
  /** The owning entity's isFloating flag — previews the smaller floating shadow. */
  shadowPreviewFloating?: boolean;
}

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
  frameRate?: number;
  /** Explicit frame dims from the sheet config — honored so the preview slices
   *  frames exactly like the board does for imported sheets. */
  frameWidth?: number;
  frameHeight?: number;
}

// Inline offset preview is small (board-faithful 2× zoom); the magnifier opens
// a larger overlay that magnifies further so fine offsets are easy to see.
const ANCHOR_PREVIEW_SIZE = 80;
const ANCHOR_PREVIEW_ZOOM = 2;
const ANCHOR_OVERLAY_SIZE = 360;
const ANCHOR_OVERLAY_ZOOM = 8;

const AnchorPreview: React.FC<AnchorPreviewLayer & {
  /** Other directions' same-slot sprites, drawn faded behind the active one. */
  ghosts?: AnchorPreviewLayer[];
  /** Opacity of the active (edited) sprite in the preview only — lets you see
   *  the ghosts behind it. Never affects board rendering. */
  activeAlpha?: number;
  /** When set (entity sprites), the board's ground blob shadow is drawn under
   *  the sprite exactly as it will render in game — so shadow width/offsets
   *  can be tuned by eye. Pass the RESOLVED config for the direction being
   *  edited (per-direction overrides inherit sprite-level values). */
  shadow?: ResolvedShadow;
  /** The owning entity's isFloating flag (smaller, fainter shadow). */
  shadowFloating?: boolean;
  /** When set, the emitted-light halo is drawn behind the sprite exactly as
   *  on the board (see lightGlow.ts) — for tuning color/radius by eye. */
  glow?: ResolvedGlow | null;
}> = ({ imageSrc, anchorX, anchorY, offsetX, offsetY, isSpriteSheet, frameCount, frameRate, frameWidth, frameHeight, ghosts, activeAlpha = 1, shadow, shadowFloating = false, glow }) => {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef<HTMLCanvasElement>(null);
  const [loadTick, setLoadTick] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  // Playback: play the spritesheet animation in the preview. Plays once by
  // default (resets to frame 0 when done); 🔁 toggles looping. Active layer +
  // ghosts share one clock so you can line up last-frame/first-frame seams.
  const [playing, setPlaying] = useState(false);
  const [playLoop, setPlayLoop] = useState(false);
  const [playTick, setPlayTick] = useState(0);
  const playStartRef = useRef(0);
  // Draggable position for the zoom overlay (defaults to top-center, not a corner).
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number }>(() => ({
    x: typeof window !== 'undefined' ? Math.max(8, (window.innerWidth - ANCHOR_OVERLAY_SIZE - 32) / 2) : 360,
    y: 72,
  }));
  const startOverlayDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const grabX = e.clientX - overlayPos.x;
    const grabY = e.clientY - overlayPos.y;
    const onMove = (ev: MouseEvent) => setOverlayPos({ x: ev.clientX - grabX, y: ev.clientY - grabY });
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Redraw when any sprite image finishes loading (covers active + ghosts,
  // including imported sheets that resolve their dimensions only once cached).
  useEffect(() => {
    const unsub = subscribeToSpriteImageLoads(() => setLoadTick((t) => t + 1));
    return unsub;
  }, []);

  // Playback loop: while playing, tick every frame to advance the animation.
  // For a non-looping play, stop (→ frame 0) once the active sheet has run once.
  useEffect(() => {
    if (!playing) return;
    playStartRef.current = Date.now();
    const fc = frameCount && frameCount > 1 ? frameCount : 1;
    const oneRunMs = fc * (1000 / (frameRate || 10));
    let raf = 0;
    const loop = () => {
      if (!playLoop && Date.now() - playStartRef.current >= oneRunMs) {
        setPlaying(false); // non-loop finished → render resets to frame 0
        return;
      }
      setPlayTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, playLoop, frameCount, frameRate]);

  useEffect(() => {
    // Render the same scene (grid + tile + crosshair + ghosts + active layer)
    // to a canvas at a given display size and zoom. Used for both the small
    // inline preview and the larger zoom overlay.
    const render = (canvas: HTMLCanvasElement | null, displaySize: number, zoom: number) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = displaySize * dpr;
      canvas.height = displaySize * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, displaySize, displaySize);

      const tileRect = ART_TILE_PX * zoom;
      const tileOrigin = (displaySize - tileRect) / 2;

      // Shadow preview needs a floor to darken — a 28%-black ellipse is
      // invisible on the near-black canvas. Mid-tone fill, tile area only.
      if (shadow) {
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(tileOrigin, tileOrigin, tileRect, tileRect);
      }

      // Art-pixel grid inside the tile — one cell per art pixel.
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
      ctx.moveTo(displaySize / 2, 0);
      ctx.lineTo(displaySize / 2, displaySize);
      ctx.moveTo(0, displaySize / 2);
      ctx.lineTo(displaySize, displaySize / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ground shadow under the sprite, board-faithful (entity sprites only)
      if (shadow) {
        drawBlobShadowResolved(ctx, shadow, displaySize / 2, displaySize / 2, tileRect, shadowFloating);
      }

      // Emitted-light halo behind the sprite, board-faithful. Animates
      // (flicker) while ▶ playback runs; otherwise a static snapshot.
      if (glow) {
        drawLightGlowResolved(ctx, glow, displaySize / 2, displaySize / 2, tileRect, Date.now());
      }

      // Draw one sprite layer at frame 0, faithful to the board's native-size
      // math: explicit frame dims when present, else naturalWidth / frameCount.
      const drawLayer = (layer: AnchorPreviewLayer, alpha: number) => {
        const img = loadSpriteImage(layer.imageSrc);
        if (!img.complete || img.naturalWidth === 0) return;
        const srcWidth = layer.frameWidth
          ?? (layer.isSpriteSheet && layer.frameCount ? img.naturalWidth / layer.frameCount : img.naturalWidth);
        const srcHeight = layer.frameHeight ?? img.naturalHeight;
        // Frame 0 unless playing; then advance by this layer's own frame rate off
        // the shared play clock (loop wraps, otherwise clamp to the last frame).
        let frame = 0;
        const fc = layer.frameCount && layer.frameCount > 1 ? layer.frameCount : 1;
        if (playing && fc > 1) {
          const raw = Math.floor((Date.now() - playStartRef.current) / (1000 / (layer.frameRate || 10)));
          frame = playLoop ? raw % fc : Math.min(raw, fc - 1);
        }
        const drawWidth = Math.round(srcWidth * zoom);
        const drawHeight = Math.round(srcHeight * zoom);
        const dx = Math.round(displaySize / 2 - snapAnchorPx(drawWidth, layer.anchorX, zoom) + Math.round(layer.offsetX) * zoom);
        const dy = Math.round(displaySize / 2 - snapAnchorPx(drawHeight, layer.anchorY, zoom) + Math.round(layer.offsetY) * zoom);
        ctx.globalAlpha = alpha;
        ctx.drawImage(img, Math.round(frame * srcWidth), 0, Math.round(srcWidth), Math.round(srcHeight), dx, dy, drawWidth, drawHeight);
        ctx.globalAlpha = 1;
      };

      // Ghosts behind (faded), then the active layer on top (at the requested
      // editor-only opacity so the ghosts stay visible behind it).
      if (ghosts) for (const g of ghosts) drawLayer(g, 0.28);
      drawLayer({ imageSrc, anchorX, anchorY, offsetX, offsetY, isSpriteSheet, frameCount, frameRate, frameWidth, frameHeight }, activeAlpha);
    };

    render(previewRef.current, ANCHOR_PREVIEW_SIZE, ANCHOR_PREVIEW_ZOOM);
    if (zoomed) render(zoomRef.current, ANCHOR_OVERLAY_SIZE, ANCHOR_OVERLAY_ZOOM);
  }, [imageSrc, anchorX, anchorY, offsetX, offsetY, isSpriteSheet, frameCount, frameRate, frameWidth, frameHeight, ghosts, activeAlpha, loadTick, zoomed, playing, playLoop, playTick, shadow?.widthArt, shadow?.offsetXArt, shadow?.offsetYArt, shadowFloating]);

  return (
    <div className="relative flex-shrink-0" style={{ width: ANCHOR_PREVIEW_SIZE, height: ANCHOR_PREVIEW_SIZE }}>
      <canvas
        ref={previewRef}
        className="rounded border border-stone-600 bg-stone-900"
        style={{ width: ANCHOR_PREVIEW_SIZE, height: ANCHOR_PREVIEW_SIZE }}
      />
      <button
        type="button"
        onClick={() => setZoomed(true)}
        title="Zoom preview"
        className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded bg-stone-800/80 border border-stone-600 hover:bg-stone-700 text-[11px] leading-none"
      >
        🔍
      </button>
      {isSpriteSheet && (frameCount ?? 0) > 1 && (
        <>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            title={playing ? 'Stop' : 'Play animation'}
            className="absolute bottom-0.5 left-0.5 w-5 h-5 flex items-center justify-center rounded bg-stone-800/80 border border-stone-600 hover:bg-stone-700 text-[10px] leading-none"
          >
            {playing ? '⏹' : '▶'}
          </button>
          <button
            type="button"
            onClick={() => setPlayLoop((l) => !l)}
            title={playLoop ? 'Loop: on (resets to frame 0 when off)' : 'Loop: off'}
            className={`absolute bottom-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded border text-[10px] leading-none ${playLoop ? 'bg-arcane-600 border-arcane-400' : 'bg-stone-800/80 border-stone-600 hover:bg-stone-700'}`}
          >
            🔁
          </button>
        </>
      )}
      {zoomed && (
        // Non-blocking, draggable floating panel (no full-screen backdrop) so the
        // offset sliders and onion controls stay usable — the overlay updates
        // live as you adjust them. Drag the header to move it; ✕ to close.
        <div
          className="fixed z-50 bg-stone-900 rounded-lg border border-stone-600 shadow-2xl p-3"
          style={{ left: overlayPos.x, top: overlayPos.y }}
        >
          <div
            onMouseDown={startOverlayDrag}
            title="Drag to move"
            className="text-[10px] text-stone-400 mb-1 font-semibold cursor-move select-none"
          >
            ⠿ Zoomed preview (live) — drag to move
          </div>
          <button
            type="button"
            onClick={() => setZoomed(false)}
            title="Close"
            className="absolute -top-2.5 -right-2.5 w-7 h-7 flex items-center justify-center rounded-full bg-stone-700 border border-stone-500 text-stone-200 hover:bg-stone-600 text-sm leading-none"
          >
            ✕
          </button>
          <canvas
            ref={zoomRef}
            className="rounded bg-stone-900"
            style={{ width: ANCHOR_OVERLAY_SIZE, height: ANCHOR_OVERLAY_SIZE, imageRendering: 'pixelated' }}
          />
        </div>
      )}
    </div>
  );
};

export const SpriteEditor: React.FC<SpriteEditorProps> = ({ sprite, onChange, shadowPreview = false, shadowPreviewFloating = false }) => {
  const [selectedDirection, setSelectedDirection] = useState<SpriteDirection>('default');
  // Onion-skin controls for the offset previews (editor-only, never affects the board).
  const [onionEnabled, setOnionEnabled] = useState(true);
  const [onionDir, setOnionDir] = useState<SpriteDirection | 'all'>('all');
  // Which animation slot to ghost from the chosen direction(s). 'same' = the
  // slot currently being edited; otherwise ghost that specific animation.
  const [onionSlot, setOnionSlot] = useState<'same' | 'idle' | 'moving' | 'casting'>('same');
  const [activePreviewOpacity, setActivePreviewOpacity] = useState(1);
  // Always use directional mode - 'default' direction serves as universal fallback
  const spriteMode = 'directional' as const;
  // Tab for separating directional vs global settings
  const [editorTab, setEditorTab] = useState<'directional' | 'global'>('directional');
  // Copy-from-direction overlay
  const [showCopyFromOverlay, setShowCopyFromOverlay] = useState(false);
  // Trigger re-render when background images load
  const [, setRenderTrigger] = useState(0);

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
    // 'same' ghosts the slot being edited; otherwise ghost a specific animation.
    const effectiveSlot = onionSlot === 'same' ? slotKey : (`${onionSlot}SpriteSheet` as typeof slotKey);
    const layers: AnchorPreviewLayer[] = [];
    for (const dir of DIRECTIONS) {
      if (onionDir !== 'all' && dir.key !== onionDir) continue;
      // Skip only the exact layer being edited (same direction AND same slot);
      // a different slot of the current direction is a useful comparison.
      if (dir.key === selectedDirection && effectiveSlot === slotKey) continue;
      const sheet = sprite.directionalSprites[dir.key]?.[effectiveSlot];
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
          frameRate: sheet.frameRate,
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
        });
      }
    }
    return layers;
  };

  // Non-directional (Global Settings) slots have no sibling directions to ghost,
  // so the onion-skin reference is a directional pose — by default the idle, but
  // the user can pick any animation (idle/moving/casting) from any direction so
  // death / spawn / select can be aligned to where the entity rests / moves.
  const buildIdleGhost = (): AnchorPreviewLayer[] => {
    if (!onionEnabled) return [];
    // 'same' has no meaning for a non-directional slot — default to idle.
    const slot = onionSlot === 'same' ? 'idle' : onionSlot;
    const slotKey = `${slot}SpriteSheet` as 'idleSpriteSheet' | 'movingSpriteSheet' | 'castingSpriteSheet';
    const layers: AnchorPreviewLayer[] = [];
    const pushSheet = (sheet?: SpriteSheetConfig) => {
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
          frameRate: sheet.frameRate,
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
        });
      }
    };

    if (sprite.useDirectional && sprite.directionalSprites) {
      for (const d of DIRECTIONS) {
        if (onionDir !== 'all' && d.key !== onionDir) continue;
        pushSheet(sprite.directionalSprites[d.key]?.[slotKey]);
      }
    } else {
      pushSheet(sprite[slotKey]);
    }

    // Fall back to the idle static image when no sheet resolved.
    if (layers.length === 0) {
      const dir = sprite.useDirectional ? sprite.directionalSprites?.default : undefined;
      const imgSrc = dir
        ? (dir.idleImageData || dir.imageData || dir.idleImageUrl || dir.imageUrl)
        : (sprite.idleImageData || sprite.imageData || sprite.idleImageUrl || sprite.imageUrl);
      if (imgSrc) {
        layers.push({
          imageSrc: imgSrc,
          anchorX: (dir ? dir.idleAnchorX : sprite.idleAnchorX) ?? 0.5,
          anchorY: (dir ? dir.idleAnchorY : sprite.idleAnchorY) ?? 0.5,
          offsetX: (dir ? dir.idleOffsetX : sprite.idleOffsetX) ?? 0,
          offsetY: (dir ? dir.idleOffsetY : sprite.idleOffsetY) ?? 0,
          isSpriteSheet: false,
        });
      }
    }
    return layers;
  };

  // Onion-skin controls for the offset previews. `forGlobal` hides the
  // direction picker (Global Settings slots ghost the idle pose instead of
  // sibling directions). Shared state, so toggling in either tab applies to both.
  const renderOnionControls = (forGlobal: boolean) => (
    <div className="mb-3 p-2 bg-stone-800/70 rounded border border-stone-600 text-xs">
      <label className="flex items-center gap-2 text-stone-200 font-semibold cursor-pointer">
        <input type="checkbox" checked={onionEnabled} onChange={(e) => setOnionEnabled(e.target.checked)} />
        👻 Onion-skin ({forGlobal ? 'ghost a directional pose' : 'ghost other directions'} in the offset preview)
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
              <option value="all">{forGlobal ? 'All directions' : 'All other directions'}</option>
              {DIRECTIONS.filter((d) => forGlobal || d.key !== selectedDirection).map((d) => (
                <option key={d.key} value={d.key}>{d.arrow} {d.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-stone-400 w-20 shrink-0">Animation</span>
            <select
              value={forGlobal && onionSlot === 'same' ? 'idle' : onionSlot}
              onChange={(e) => setOnionSlot(e.target.value as 'same' | 'idle' | 'moving' | 'casting')}
              className="flex-1 px-2 py-1 bg-stone-700 rounded text-parchment-100"
            >
              {!forGlobal && <option value="same">Same as editing</option>}
              <option value="idle">Idle</option>
              <option value="moving">Moving</option>
              <option value="casting">Casting</option>
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
  );

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
    forGlobal: boolean = false,
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
              frameRate={previewSpriteSheet?.frameRate}
              frameWidth={previewSpriteSheet?.frameWidth}
              frameHeight={previewSpriteSheet?.frameHeight}
              ghosts={ghosts}
              activeAlpha={ghosts && ghosts.length > 0 ? activePreviewOpacity : 1}
              shadow={shadowPreview ? resolveShadowConfigByKey(sprite, spriteMode === 'directional' ? selectedDirection : undefined) : undefined}
              shadowFloating={shadowPreviewFloating}
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
        {/* Onion-skin controls, co-located right under the offset sliders */}
        <div className="mt-2">{renderOnionControls(forGlobal)}</div>
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
                  <img src={sheet?.imageData || sheet?.imageUrl} alt={`${title} spritesheet`} className="max-w-full max-h-full object-contain" loading="lazy" decoding="async" />
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
                  buildIdleGhost(),
                  true,
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
                    <img src={imageData || imageUrl} alt={`${title} static`} className="max-w-full max-h-full object-contain" loading="lazy" decoding="async" />
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
                    undefined,
                    buildIdleGhost(),
                    true,
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
                      loading="lazy" decoding="async"
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
                      loading="lazy" decoding="async"
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
                      loading="lazy" decoding="async"
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
                      loading="lazy" decoding="async"
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
                      loading="lazy" decoding="async"
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
                      loading="lazy" decoding="async"
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

            {/* Per-direction ground-shadow override. Blank = inherit the
                sprite-level values from Global Settings; the offset previews
                below draw the resolved shadow so changes are visible live. */}
            {shadowPreview && (() => {
              const dirCfg = sprite.directionalSprites?.[selectedDirection];
              const setShadowField = (field: 'shadowWidth' | 'shadowOffsetX' | 'shadowOffsetY', raw: string) => {
                const value = raw === '' ? undefined
                  : field === 'shadowWidth' ? Math.max(0, Number(raw)) : Number(raw);
                onChange({
                  ...sprite,
                  directionalSprites: {
                    ...(sprite.directionalSprites || {}),
                    [selectedDirection]: {
                      ...(sprite.directionalSprites?.[selectedDirection] || {}),
                      [field]: value,
                    },
                  },
                });
              };
              return (
                <div className="mt-3 p-3 rounded border border-stone-600 bg-stone-900/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-stone-300">
                      ⬮ Ground Shadow override — {DIRECTIONS.find(d => d.key === selectedDirection)?.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-stone-400 mb-2">
                    Blank inherits Global Settings. Use when this direction's sheet seats the body differently. Art px.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold mb-0.5">Width</label>
                      <input
                        type="number"
                        min={0}
                        value={dirCfg?.shadowWidth ?? ''}
                        placeholder={String(sprite.shadowWidth ?? 14)}
                        onChange={(e) => setShadowField('shadowWidth', e.target.value)}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold mb-0.5">Offset X</label>
                      <input
                        type="number"
                        value={dirCfg?.shadowOffsetX ?? ''}
                        placeholder={String(sprite.shadowOffsetX ?? 0)}
                        onChange={(e) => setShadowField('shadowOffsetX', e.target.value)}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold mb-0.5">Offset Y</label>
                      <input
                        type="number"
                        value={dirCfg?.shadowOffsetY ?? ''}
                        placeholder={String(sprite.shadowOffsetY ?? 0)}
                        onChange={(e) => setShadowField('shadowOffsetY', e.target.value)}
                        className="w-full px-2 py-1 bg-stone-700 rounded text-parchment-100 text-xs"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}
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
                      loading="lazy" decoding="async"
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
                      loading="lazy" decoding="async"
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
                      loading="lazy" decoding="async"
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
                      loading="lazy" decoding="async"
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
                      loading="lazy" decoding="async"
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
                      loading="lazy" decoding="async"
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

        <label className="flex items-center gap-2 text-sm font-bold cursor-pointer mb-1">
          <input
            type="checkbox"
            checked={!!sprite.spawnFlyIn}
            onChange={(e) => onChange({ ...sprite, spawnFlyIn: e.target.checked || undefined })}
          />
          🦇 Fly-in entrance
        </label>
        <p className="text-[10px] text-stone-500 mb-3">
          The entity flies onto its tile from a random off-screen point, using its moving
          animation in the travel direction. Same cadence as the spawn animation: once per page
          load. Enemies fly in when the board loads; heroes fly in when placed (replacing the
          drop-in). The spawn animation above plays on landing — or idle if none is set.
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
                    loading="lazy" decoding="async"
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
                  buildIdleGhost(),
                  true,
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
                      loading="lazy" decoding="async"
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
                    undefined,
                    buildIdleGhost(),
                    true,
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
      {shadowPreview && (
      <div className="border-2 border-stone-600 rounded-lg p-4 bg-stone-900/50">
        <h4 className="text-stone-300 font-bold mb-3 flex items-center gap-2">
          <span className="text-lg">⬮</span> Ground Shadow
        </h4>
        <p className="text-xs text-stone-400 mb-3">
          The soft shadow under this entity on the board. These are the base values for all
          directions — individual directions can override them in the Directional Sprites tab
          when a sheet seats the body differently. All values are in art pixels (a tile is 24).
          Width 0 hides the shadow.
        </p>
        <div className="flex gap-4 items-start">
          <div className="grid grid-cols-3 gap-3 flex-1">
            <div>
              <label className="block text-xs font-bold mb-1">Width</label>
              <input
                type="number"
                min={0}
                value={sprite.shadowWidth ?? ''}
                placeholder="14"
                onChange={(e) => onChange({ ...sprite, shadowWidth: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
                className="w-full px-2 py-1.5 bg-stone-700 rounded text-parchment-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Offset X</label>
              <input
                type="number"
                value={sprite.shadowOffsetX ?? ''}
                placeholder="0"
                onChange={(e) => onChange({ ...sprite, shadowOffsetX: e.target.value === '' ? undefined : Number(e.target.value) })}
                className="w-full px-2 py-1.5 bg-stone-700 rounded text-parchment-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Offset Y</label>
              <input
                type="number"
                value={sprite.shadowOffsetY ?? ''}
                placeholder="0"
                onChange={(e) => onChange({ ...sprite, shadowOffsetY: e.target.value === '' ? undefined : Number(e.target.value) })}
                className="w-full px-2 py-1.5 bg-stone-700 rounded text-parchment-100 text-sm"
              />
            </div>
          </div>
          {(() => {
            // Live preview with the sprite's idle for context (south → default →
            // simple), sharing the same board-faithful AnchorPreview as the
            // offset controls. Updates as the shadow fields change.
            const dir = sprite.useDirectional
              ? (sprite.directionalSprites?.s ?? sprite.directionalSprites?.default)
              : undefined;
            const sheet = dir?.idleSpriteSheet ?? sprite.idleSpriteSheet;
            const imgSrc = sheet?.imageData ?? sheet?.imageUrl
              ?? dir?.idleImageData ?? dir?.imageData ?? dir?.idleImageUrl ?? dir?.imageUrl
              ?? sprite.idleImageData ?? sprite.imageData ?? sprite.idleImageUrl ?? sprite.imageUrl;
            if (!imgSrc) return null;
            return (
              <AnchorPreview
                imageSrc={imgSrc}
                anchorX={(sheet ? sheet.anchorX : (dir?.idleAnchorX ?? sprite.idleAnchorX)) ?? 0.5}
                anchorY={(sheet ? sheet.anchorY : (dir?.idleAnchorY ?? sprite.idleAnchorY)) ?? 0.5}
                offsetX={(sheet ? sheet.offsetX : (dir?.idleOffsetX ?? sprite.idleOffsetX)) ?? 0}
                offsetY={(sheet ? sheet.offsetY : (dir?.idleOffsetY ?? sprite.idleOffsetY)) ?? 0}
                isSpriteSheet={!!sheet}
                frameCount={sheet?.frameCount}
                frameRate={sheet?.frameRate}
                frameWidth={sheet?.frameWidth}
                frameHeight={sheet?.frameHeight}
                shadow={resolveShadowConfigByKey(sprite, undefined)}
                shadowFloating={shadowPreviewFloating}
              />
            );
          })()}
        </div>

        {/* Corpse shadow — used while the death animation plays and for the
            held corpse frame. The board lerps living → corpse across the
            death sheet, so a body falling flat can widen its shadow. */}
        <div className="mt-4 pt-3 border-t border-stone-700">
          <div className="text-xs font-bold text-stone-300 mb-1">💀 Corpse Shadow (death animation)</div>
          <p className="text-[10px] text-stone-400 mb-2">
            Blank inherits the living values above. Widen it for bodies that fall flat.
            The shadow blends from living to corpse over the death animation. Use ▶ on the
            preview to watch the fall with the corpse shadow.
          </p>
          <div className="flex gap-4 items-start">
            <div className="grid grid-cols-3 gap-3 flex-1">
              <div>
                <label className="block text-xs font-bold mb-1">Width</label>
                <input
                  type="number"
                  min={0}
                  value={sprite.deathShadowWidth ?? ''}
                  placeholder={String(sprite.shadowWidth ?? 14)}
                  onChange={(e) => onChange({ ...sprite, deathShadowWidth: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
                  className="w-full px-2 py-1.5 bg-stone-700 rounded text-parchment-100 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Offset X</label>
                <input
                  type="number"
                  value={sprite.deathShadowOffsetX ?? ''}
                  placeholder={String(sprite.shadowOffsetX ?? 0)}
                  onChange={(e) => onChange({ ...sprite, deathShadowOffsetX: e.target.value === '' ? undefined : Number(e.target.value) })}
                  className="w-full px-2 py-1.5 bg-stone-700 rounded text-parchment-100 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Offset Y</label>
                <input
                  type="number"
                  value={sprite.deathShadowOffsetY ?? ''}
                  placeholder={String(sprite.shadowOffsetY ?? 0)}
                  onChange={(e) => onChange({ ...sprite, deathShadowOffsetY: e.target.value === '' ? undefined : Number(e.target.value) })}
                  className="w-full px-2 py-1.5 bg-stone-700 rounded text-parchment-100 text-sm"
                />
              </div>
            </div>
            {(() => {
              const sheet = sprite.deathSpriteSheet;
              const imgSrc = sheet?.imageData ?? sheet?.imageUrl ?? sprite.deathImageData ?? sprite.deathImageUrl;
              if (!imgSrc) return null;
              return (
                <AnchorPreview
                  imageSrc={imgSrc}
                  anchorX={(sheet ? sheet.anchorX : sprite.deathAnchorX) ?? 0.5}
                  anchorY={(sheet ? sheet.anchorY : sprite.deathAnchorY) ?? 0.5}
                  offsetX={(sheet ? sheet.offsetX : sprite.deathOffsetX) ?? 0}
                  offsetY={(sheet ? sheet.offsetY : sprite.deathOffsetY) ?? 0}
                  isSpriteSheet={!!sheet}
                  frameCount={sheet?.frameCount}
                  frameRate={sheet?.frameRate}
                  frameWidth={sheet?.frameWidth}
                  frameHeight={sheet?.frameHeight}
                  shadow={resolveDeathShadowConfig(sprite)}
                />
              );
            })()}
          </div>
        </div>
      </div>
      )}
      {shadowPreview && (
      <div className="border-2 border-stone-600 rounded-lg p-4 bg-stone-900/50">
        <h4 className="text-stone-300 font-bold mb-3 flex items-center gap-2">
          <span className="text-lg">✨</span> Emitted Light
        </h4>
        <p className="text-xs text-stone-400 mb-3">
          An additive halo behind the sprite for things that emit light — torches, fireballs,
          wisps. Off unless a color is set. Radius and offsets are in art pixels (a tile is 24);
          the halo is centered on the sprite, not the ground. Applies everywhere this sprite
          renders. Use ▶ on the preview to watch the flicker.
        </p>
        <div className="flex gap-4 items-start">
          <div className="grid grid-cols-3 gap-3 flex-1">
            <div>
              <label className="block text-xs font-bold mb-1">Color</label>
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={sprite.glowColor ?? '#ff9a3d'}
                  onChange={(e) => onChange({ ...sprite, glowColor: e.target.value })}
                  className="w-9 h-8 bg-stone-700 rounded cursor-pointer"
                />
                {sprite.glowColor ? (
                  <button
                    onClick={() => onChange({ ...sprite, glowColor: undefined })}
                    className="px-1.5 py-1 text-xs bg-stone-700 hover:bg-stone-600 rounded"
                    title="Remove glow"
                  >
                    ✕
                  </button>
                ) : (
                  <span className="text-[10px] text-stone-500">off</span>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Radius</label>
              <input
                type="number"
                min={0}
                value={sprite.glowRadius ?? ''}
                placeholder="16"
                onChange={(e) => onChange({ ...sprite, glowRadius: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
                className="w-full px-2 py-1.5 bg-stone-700 rounded text-parchment-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Intensity</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={sprite.glowIntensity ?? ''}
                placeholder="0.35"
                onChange={(e) => onChange({ ...sprite, glowIntensity: e.target.value === '' ? undefined : Math.min(1, Math.max(0, Number(e.target.value))) })}
                className="w-full px-2 py-1.5 bg-stone-700 rounded text-parchment-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Offset X</label>
              <input
                type="number"
                value={sprite.glowOffsetX ?? ''}
                placeholder="0"
                onChange={(e) => onChange({ ...sprite, glowOffsetX: e.target.value === '' ? undefined : Number(e.target.value) })}
                className="w-full px-2 py-1.5 bg-stone-700 rounded text-parchment-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Offset Y</label>
              <input
                type="number"
                value={sprite.glowOffsetY ?? ''}
                placeholder="0"
                onChange={(e) => onChange({ ...sprite, glowOffsetY: e.target.value === '' ? undefined : Number(e.target.value) })}
                className="w-full px-2 py-1.5 bg-stone-700 rounded text-parchment-100 text-sm"
              />
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!sprite.glowFlicker}
                  onChange={(e) => onChange({ ...sprite, glowFlicker: e.target.checked || undefined })}
                />
                Flicker
              </label>
            </div>
          </div>
          {(() => {
            // Same idle-context preview as the Ground Shadow section, with the
            // halo drawn board-faithfully behind the sprite.
            const dir = sprite.useDirectional
              ? (sprite.directionalSprites?.s ?? sprite.directionalSprites?.default)
              : undefined;
            const sheet = dir?.idleSpriteSheet ?? sprite.idleSpriteSheet;
            const imgSrc = sheet?.imageData ?? sheet?.imageUrl
              ?? dir?.idleImageData ?? dir?.imageData ?? dir?.idleImageUrl ?? dir?.imageUrl
              ?? sprite.idleImageData ?? sprite.imageData ?? sprite.idleImageUrl ?? sprite.imageUrl;
            if (!imgSrc || !sprite.glowColor) return null;
            return (
              <AnchorPreview
                imageSrc={imgSrc}
                anchorX={(sheet ? sheet.anchorX : (dir?.idleAnchorX ?? sprite.idleAnchorX)) ?? 0.5}
                anchorY={(sheet ? sheet.anchorY : (dir?.idleAnchorY ?? sprite.idleAnchorY)) ?? 0.5}
                offsetX={(sheet ? sheet.offsetX : (dir?.idleOffsetX ?? sprite.idleOffsetX)) ?? 0}
                offsetY={(sheet ? sheet.offsetY : (dir?.idleOffsetY ?? sprite.idleOffsetY)) ?? 0}
                isSpriteSheet={!!sheet}
                frameCount={sheet?.frameCount}
                frameRate={sheet?.frameRate}
                frameWidth={sheet?.frameWidth}
                frameHeight={sheet?.frameHeight}
                shadow={resolveShadowConfigByKey(sprite, undefined)}
                shadowFloating={shadowPreviewFloating}
                glow={resolveGlowConfig(sprite)}
              />
            );
          })()}
        </div>
      </div>
      )}
      </>
      )}

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
  isCasting: boolean = false,
  // When provided (board casting), the casting sheet animates from this start
  // time so it restarts each cast; without it (editor preview) it uses the
  // continuous shared-state path.
  castStartTime?: number
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
    if (castStartTime !== undefined && spriteSheet === config.castingSpriteSheet) {
      // Casting sheet plays from the cast's start time so it restarts each cast.
      drawSpriteSheetFromStartTime(ctx, spriteSheet, centerX, centerY, tileSize, castStartTime, now, ax, ay, ox, oy);
    } else {
      drawSpriteSheet(ctx, spriteSheet, centerX, centerY, tileSize, now, ax, ay, ox, oy);
    }
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

      ctx.drawImage(img, Math.round(centerX - snapAnchorPx(drawWidth, ax, zoom) + ox * zoom), Math.round(centerY - snapAnchorPx(drawHeight, ay, zoom) + oy * zoom), drawWidth, drawHeight);
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
  isCasting: boolean = false,
  // When provided (board casting), the casting sheet restarts from this start
  // time each cast; omitted by the editor preview (continuous path).
  castStartTime?: number
) {
  // Check if we should use directional sprites
  if (sprite.useDirectional && sprite.directionalSprites) {
    // If direction is provided, use it; otherwise use 'default'
    const dirKey = direction ? mapGameDirectionToSpriteDirection(direction) : 'default';
    const dirConfig = sprite.directionalSprites[dirKey] || sprite.directionalSprites['default'];

    if (dirConfig) {
      drawSpriteConfig(ctx, dirConfig, centerX, centerY, tileSize, isMoving, now, isCasting, castStartTime);
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
    if (castStartTime !== undefined && simpleSpriteSheet === sprite.castingSpriteSheet) {
      // Casting sheet plays from the cast's start time so it restarts each cast.
      drawSpriteSheetFromStartTime(ctx, simpleSpriteSheet, centerX, centerY, tileSize, castStartTime, now, ax, ay, ox, oy);
    } else {
      drawSpriteSheet(ctx, simpleSpriteSheet, centerX, centerY, tileSize, now, ax, ay, ox, oy);
    }
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

      ctx.drawImage(img, Math.round(centerX - snapAnchorPx(drawWidth, ax, zoom) + ox * zoom), Math.round(centerY - snapAnchorPx(drawHeight, ay, zoom) + oy * zoom), drawWidth, drawHeight);
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

    ctx.drawImage(img, Math.round(centerX - snapAnchorPx(drawWidth, anchorX, zoom) + offsetX * zoom), Math.round(centerY - snapAnchorPx(drawHeight, anchorY, zoom) + offsetY * zoom), drawWidth, drawHeight);
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
