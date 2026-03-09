/**
 * Pure utility functions for the pixel art editor.
 * No React dependencies — easily unit-testable.
 */

// ─── Types ──────────────────────────────────────────────────────────

export type RGBA = [number, number, number, number];

export interface PixelEditorProject {
  version: 1;
  width: number;
  height: number;
  layers: PixelEditorLayer[];
  palette?: string[];
}

export interface PixelEditorLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number; // 0-1
  data: string;    // base64 PNG of this layer's pixels
}

// ─── Pixel Access ───────────────────────────────────────────────────

export function getPixel(data: ImageData, x: number, y: number): RGBA {
  const i = (y * data.width + x) * 4;
  return [data.data[i], data.data[i + 1], data.data[i + 2], data.data[i + 3]];
}

export function setPixel(data: ImageData, x: number, y: number, color: RGBA): void {
  const i = (y * data.width + x) * 4;
  data.data[i] = color[0];
  data.data[i + 1] = color[1];
  data.data[i + 2] = color[2];
  data.data[i + 3] = color[3];
}

// ─── Color Conversion ──────────────────────────────────────────────

export function hexToRGBA(hex: string, alpha: number = 255): RGBA {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, alpha];
}

export function rgbaToHex(rgba: RGBA): string {
  return '#' + rgba.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
}

export function colorsMatch(a: RGBA, b: RGBA): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

// ─── ImageData Helpers ──────────────────────────────────────────────

export function cloneImageData(data: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
}

export function createBlankImageData(width: number, height: number): ImageData {
  return new ImageData(width, height);
}

// ─── Flood Fill (scanline-based) ────────────────────────────────────

export function floodFill(
  data: ImageData,
  startX: number,
  startY: number,
  fillColor: RGBA
): void {
  const { width, height } = data;
  const targetColor = getPixel(data, startX, startY);

  if (colorsMatch(targetColor, fillColor)) return;

  const stack: [number, number][] = [[startX, startY]];
  const visited = new Uint8Array(width * height);

  while (stack.length > 0) {
    let [x, y] = stack.pop()!;

    if (visited[y * width + x]) continue;

    // Scan left
    while (x > 0 && colorsMatch(getPixel(data, x - 1, y), targetColor) && !visited[y * width + x - 1]) {
      x--;
    }

    // Scan right, filling as we go
    let spanAbove = false;
    let spanBelow = false;

    while (x < width && colorsMatch(getPixel(data, x, y), targetColor) && !visited[y * width + x]) {
      setPixel(data, x, y, fillColor);
      visited[y * width + x] = 1;

      if (y > 0) {
        const aboveMatches = colorsMatch(getPixel(data, x, y - 1), targetColor) && !visited[(y - 1) * width + x];
        if (aboveMatches && !spanAbove) {
          stack.push([x, y - 1]);
          spanAbove = true;
        } else if (!aboveMatches) {
          spanAbove = false;
        }
      }

      if (y < height - 1) {
        const belowMatches = colorsMatch(getPixel(data, x, y + 1), targetColor) && !visited[(y + 1) * width + x];
        if (belowMatches && !spanBelow) {
          stack.push([x, y + 1]);
          spanBelow = true;
        } else if (!belowMatches) {
          spanBelow = false;
        }
      }

      x++;
    }
  }
}

// ─── Bresenham Line ─────────────────────────────────────────────────

export function bresenhamLine(
  x0: number, y0: number, x1: number, y1: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0, cy = y0;

  while (true) {
    points.push({ x: cx, y: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
  return points;
}

// ─── Coordinate Mapping ─────────────────────────────────────────────

export function displayToPixel(
  displayX: number,
  displayY: number,
  zoom: number,
  panX: number,
  panY: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } | null {
  const px = Math.floor((displayX - panX) / zoom);
  const py = Math.floor((displayY - panY) / zoom);
  if (px < 0 || py < 0 || px >= canvasWidth || py >= canvasHeight) return null;
  return { x: px, y: py };
}

// ─── Zoom Rendering ─────────────────────────────────────────────────

const CHECKER_LIGHT = '#3a3a3a';
const CHECKER_DARK = '#2a2a2a';

export function renderPixelCanvas(
  ctx: CanvasRenderingContext2D,
  pixelData: ImageData,
  zoom: number,
  panX: number,
  panY: number,
  showGrid: boolean,
  displayWidth: number,
  displayHeight: number
): void {
  ctx.clearRect(0, 0, displayWidth, displayHeight);

  const { width, height } = pixelData;

  // Calculate visible pixel range
  const startPx = Math.max(0, Math.floor(-panX / zoom));
  const startPy = Math.max(0, Math.floor(-panY / zoom));
  const endPx = Math.min(width, Math.ceil((displayWidth - panX) / zoom));
  const endPy = Math.min(height, Math.ceil((displayHeight - panY) / zoom));

  // Draw checkerboard background for transparent areas
  const checkSize = Math.max(2, Math.floor(zoom / 2));
  for (let py = startPy; py < endPy; py++) {
    for (let px = startPx; px < endPx; px++) {
      const screenX = panX + px * zoom;
      const screenY = panY + py * zoom;
      // Checkerboard pattern
      const isLight = (px + py) % 2 === 0;
      ctx.fillStyle = isLight ? CHECKER_LIGHT : CHECKER_DARK;
      ctx.fillRect(screenX, screenY, zoom, zoom);
    }
  }

  // Draw pixels
  for (let py = startPy; py < endPy; py++) {
    for (let px = startPx; px < endPx; px++) {
      const i = (py * width + px) * 4;
      const a = pixelData.data[i + 3];
      if (a === 0) continue; // transparent — checkerboard shows through

      const r = pixelData.data[i];
      const g = pixelData.data[i + 1];
      const b = pixelData.data[i + 2];

      if (a === 255) {
        ctx.fillStyle = `rgb(${r},${g},${b})`;
      } else {
        ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
      }
      ctx.fillRect(panX + px * zoom, panY + py * zoom, zoom, zoom);
    }
  }

  // Draw grid overlay
  if (showGrid && zoom >= 4) {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let px = startPx; px <= endPx; px++) {
      const x = Math.round(panX + px * zoom) + 0.5;
      ctx.moveTo(x, panY + startPy * zoom);
      ctx.lineTo(x, panY + endPy * zoom);
    }
    for (let py = startPy; py <= endPy; py++) {
      const y = Math.round(panY + py * zoom) + 0.5;
      ctx.moveTo(panX + startPx * zoom, y);
      ctx.lineTo(panX + endPx * zoom, y);
    }
    ctx.stroke();
  }

  // Draw canvas border
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    Math.round(panX) + 0.5,
    Math.round(panY) + 0.5,
    width * zoom,
    height * zoom
  );
}

// ─── Image ↔ Pixel Data Conversion ──────────────────────────────────

export function imageToPixelData(
  imageSrc: string,
  maxWidth?: number,
  maxHeight?: number
): Promise<{ data: ImageData; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = maxWidth ?? img.naturalWidth;
      const h = maxHeight ?? img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ data: ctx.getImageData(0, 0, w, h), width: w, height: h });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageSrc;
  });
}

export function pixelDataToBase64(data: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

// ─── Project Serialization ──────────────────────────────────────────

export function createProject(width: number, height: number, pixelData: ImageData): PixelEditorProject {
  return {
    version: 1,
    width,
    height,
    layers: [{
      id: 'layer-1',
      name: 'Background',
      visible: true,
      opacity: 1,
      data: pixelDataToBase64(pixelData),
    }],
  };
}

export function serializeProject(project: PixelEditorProject): string {
  return JSON.stringify(project);
}

export function deserializeProject(json: string): PixelEditorProject | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.version === 1 && Array.isArray(parsed.layers)) {
      return parsed as PixelEditorProject;
    }
    return null;
  } catch {
    return null;
  }
}

/** Resize pixel data by cropping or expanding (no scaling). Existing pixels placed at (0,0). */
export function resizePixelData(
  data: ImageData,
  newWidth: number,
  newHeight: number
): ImageData {
  const newData = new ImageData(newWidth, newHeight);
  const copyW = Math.min(data.width, newWidth);
  const copyH = Math.min(data.height, newHeight);
  for (let y = 0; y < copyH; y++) {
    for (let x = 0; x < copyW; x++) {
      const srcI = (y * data.width + x) * 4;
      const dstI = (y * newWidth + x) * 4;
      newData.data[dstI] = data.data[srcI];
      newData.data[dstI + 1] = data.data[srcI + 1];
      newData.data[dstI + 2] = data.data[srcI + 2];
      newData.data[dstI + 3] = data.data[srcI + 3];
    }
  }
  return newData;
}
