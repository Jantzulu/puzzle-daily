/**
 * Centralized image loading with callback support for React components.
 * When images finish loading, subscribers are notified to trigger re-renders.
 */

// Set of callbacks to notify when any image finishes loading
const loadCallbacks = new Set<() => void>();

// Unified image cache
const imageCache = new Map<string, HTMLImageElement>();

// Set of images currently loading (to avoid duplicate onload handlers)
const loadingImages = new Set<string>();

// Set of images that failed to load (for retry logic)
const failedImages = new Set<string>();

// Flag to schedule a single notification on next frame (for batching)
let pendingNotification = false;

/**
 * Subscribe to image load events. Returns unsubscribe function.
 */
export function subscribeToImageLoads(callback: () => void): () => void {
  loadCallbacks.add(callback);
  return () => loadCallbacks.delete(callback);
}

/**
 * Notify all subscribers that an image has loaded.
 * Uses requestAnimationFrame to batch multiple load events.
 */
function notifyImageLoaded() {
  if (!pendingNotification) {
    pendingNotification = true;
    requestAnimationFrame(() => {
      pendingNotification = false;
      loadCallbacks.forEach(cb => cb());
    });
  }
}

/**
 * Load an image with caching and load notification.
 * When the image finishes loading, all subscribers are notified.
 * Failed images can be retried by passing retry=true.
 */
export function loadImage(src: string, retry = false): HTMLImageElement | null {
  if (!src) return null;

  const isExternal = src.startsWith('http://') || src.startsWith('https://');

  // If retry requested and image previously failed, clear it from cache
  if (retry && failedImages.has(src)) {
    failedImages.delete(src);
    imageCache.delete(src);
  }

  let img = imageCache.get(src);
  if (img) {
    // Check if cached image needs CORS but doesn't have it set
    // This can happen if image was cached before CORS fix
    if (isExternal && img.crossOrigin !== 'anonymous') {
      // Clear from cache and reload with CORS
      imageCache.delete(src);
      img = undefined;
    } else {
      // Image exists in cache - check if it's still loading
      if (!img.complete && !loadingImages.has(src)) {
        // Image in cache but not complete and no handler - re-attach handler
        loadingImages.add(src);
        img.onload = () => {
          loadingImages.delete(src);
          failedImages.delete(src);
          notifyImageLoaded();
        };
        img.onerror = () => {
          loadingImages.delete(src);
          failedImages.add(src);
          // Also notify on error so components can show fallback
          notifyImageLoaded();
        };
      }
      return img;
    }
  }

  // Create new image
  img = new Image();
  imageCache.set(src, img);
  loadingImages.add(src);

  img.onload = () => {
    loadingImages.delete(src);
    failedImages.delete(src);
    notifyImageLoaded();
  };
  img.onerror = () => {
    loadingImages.delete(src);
    failedImages.add(src);
    // Also notify on error so components can show fallback or retry
    notifyImageLoaded();
  };

  // Set crossOrigin BEFORE setting src for external URLs
  // This allows canvas operations (drawImage, createPattern) without tainting
  let finalSrc = src;
  if (isExternal) {
    img.crossOrigin = 'anonymous';
    // Add cache-buster to force fresh CORS request
    // Browser may have cached non-CORS response from <img> tags
    const separator = src.includes('?') ? '&' : '?';
    finalSrc = `${src}${separator}_cors=1`;
  }

  img.src = finalSrc;

  return img;
}

/**
 * Check if an image previously failed to load.
 */
export function isImageFailed(src: string): boolean {
  return failedImages.has(src);
}

/**
 * Retry loading a failed image.
 */
export function retryImage(src: string): HTMLImageElement | null {
  return loadImage(src, true);
}

/**
 * Check if an image is fully loaded and ready to draw.
 */
export function isImageReady(img: HTMLImageElement | null): boolean {
  return img !== null && img.complete && img.naturalWidth > 0;
}

/**
 * Get cache size (for debugging).
 */
export function getCacheSize(): number {
  return imageCache.size;
}

/**
 * Clear the image cache (useful for memory management).
 */
export function clearImageCache(): void {
  imageCache.clear();
  loadingImages.clear();
  failedImages.clear();
}

// ==========================================
// BACKGROUND PRELOADING
// ==========================================

// Queue of URLs waiting to be preloaded
const preloadQueue: string[] = [];
let preloadingActive = false;

/**
 * Preload an image in the background with low priority.
 * This doesn't block or delay anything - just ensures the image
 * is cached for when it's needed later.
 */
export function preloadImage(src: string): void {
  if (!src) return;

  // Skip if already cached or queued
  if (imageCache.has(src) || preloadQueue.includes(src)) return;

  preloadQueue.push(src);
  processPreloadQueue();
}

/**
 * Preload multiple images in the background.
 */
export function preloadImages(urls: string[]): void {
  for (const url of urls) {
    preloadImage(url);
  }
}

/**
 * Process the preload queue using requestIdleCallback for low priority.
 * Falls back to setTimeout on browsers without requestIdleCallback.
 */
function processPreloadQueue(): void {
  if (preloadingActive || preloadQueue.length === 0) return;

  preloadingActive = true;

  const processNext = () => {
    if (preloadQueue.length === 0) {
      preloadingActive = false;
      return;
    }

    // Load one image
    const src = preloadQueue.shift()!;
    if (!imageCache.has(src)) {
      loadImage(src);
    }

    // Schedule next with low priority
    if (preloadQueue.length > 0) {
      if ('requestIdleCallback' in window) {
        (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(processNext);
      } else {
        // Fallback: use setTimeout with a small delay
        setTimeout(processNext, 10);
      }
    } else {
      preloadingActive = false;
    }
  };

  // Start processing with low priority
  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(processNext);
  } else {
    setTimeout(processNext, 10);
  }
}

/**
 * Get the number of images waiting to be preloaded.
 */
export function getPreloadQueueSize(): number {
  return preloadQueue.length;
}
