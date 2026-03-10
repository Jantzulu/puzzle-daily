/**
 * Global clipboard singleton for cross-tab copy/paste in the pixel editor.
 *
 * Module-level state persists across tab switches since it's not
 * component-scoped. Copy in tab A, switch to tab B, paste — it works.
 */

import { cloneImageData } from '../components/editor/pixelEditorUtils';

let globalClipboard: ImageData | null = null;

export function setGlobalClipboard(data: ImageData | null): void {
  globalClipboard = data ? cloneImageData(data) : null;
}

export function getGlobalClipboard(): ImageData | null {
  return globalClipboard ? cloneImageData(globalClipboard) : null;
}

export function hasGlobalClipboard(): boolean {
  return globalClipboard !== null;
}
