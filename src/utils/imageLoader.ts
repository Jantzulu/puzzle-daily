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
 */
export function loadImage(src: string): HTMLImageElement | null {
  if (!src) return null;

  let img = imageCache.get(src);
  if (img) {
    // Image exists in cache - check if it's still loading
    if (!img.complete && !loadingImages.has(src)) {
      // Image in cache but not complete and no handler - re-attach handler
      loadingImages.add(src);
      img.onload = () => {
        loadingImages.delete(src);
        notifyImageLoaded();
      };
      img.onerror = () => {
        loadingImages.delete(src);
      };
    }
    return img;
  }

  // Create new image
  img = new Image();
  // Enable CORS for external URLs (required for canvas drawing)
  if (src.startsWith('http')) {
    img.crossOrigin = 'anonymous';
  }
  imageCache.set(src, img);
  loadingImages.add(src);

  img.onload = () => {
    loadingImages.delete(src);
    notifyImageLoaded();
  };
  img.onerror = () => {
    loadingImages.delete(src);
  };

  img.src = src;

  return img;
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
}
