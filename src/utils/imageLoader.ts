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

/**
 * Subscribe to image load events. Returns unsubscribe function.
 */
export function subscribeToImageLoads(callback: () => void): () => void {
  loadCallbacks.add(callback);
  return () => loadCallbacks.delete(callback);
}

/**
 * Notify all subscribers that an image has loaded.
 */
function notifyImageLoaded() {
  loadCallbacks.forEach(cb => cb());
}

/**
 * Load an image with caching and load notification.
 * When the image finishes loading, all subscribers are notified.
 */
export function loadImage(src: string): HTMLImageElement | null {
  if (!src) return null;

  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    imageCache.set(src, img);

    // Only add onload handler if we haven't already
    if (!loadingImages.has(src)) {
      loadingImages.add(src);
      img.onload = () => {
        loadingImages.delete(src);
        notifyImageLoaded();
      };
      img.onerror = () => {
        loadingImages.delete(src);
      };
    }

    img.src = src;
  }

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
