/**
 * Pure utility functions for the pixel art editor.
 * No React dependencies — easily unit-testable.
 */

// ─── Types ──────────────────────────────────────────────────────────

export type RGBA = [number, number, number, number];

export interface PixelEditorProject {
  version: 1;
  name?: string;
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

// ─── Layer Compositing ──────────────────────────────────────────────

/** Alpha-over composite of all visible layers, bottom-to-top. */
export function compositeLayers(
  layers: ImageData[],
  visibilities: boolean[],
  opacities: number[],
  width: number,
  height: number
): ImageData {
  const result = new ImageData(width, height);
  const out = result.data;
  const total = width * height;

  for (let li = 0; li < layers.length; li++) {
    if (!visibilities[li]) continue;
    const src = layers[li].data;
    const layerOpacity = opacities[li];

    for (let p = 0; p < total; p++) {
      const i = p * 4;
      let sa = src[i + 3] * layerOpacity / 255;
      if (sa === 0) continue;

      const sr = src[i], sg = src[i + 1], sb = src[i + 2];
      const da = out[i + 3];

      if (da === 0) {
        // Destination is transparent
        out[i] = sr;
        out[i + 1] = sg;
        out[i + 2] = sb;
        out[i + 3] = Math.round(sa);
      } else {
        // Alpha-over compositing
        const saF = sa / 255;
        const daF = da / 255;
        const outA = saF + daF * (1 - saF);
        if (outA > 0) {
          out[i] = Math.round((sr * saF + out[i] * daF * (1 - saF)) / outA);
          out[i + 1] = Math.round((sg * saF + out[i + 1] * daF * (1 - saF)) / outA);
          out[i + 2] = Math.round((sb * saF + out[i + 2] * daF * (1 - saF)) / outA);
          out[i + 3] = Math.round(outA * 255);
        }
      }
    }
  }
  return result;
}

export function cloneLayerStack(layers: ImageData[]): ImageData[] {
  return layers.map(cloneImageData);
}

// ─── Shape Drawing ──────────────────────────────────────────────────

export function drawRect(
  data: ImageData,
  x0: number, y0: number, x1: number, y1: number,
  color: RGBA, filled: boolean
): void {
  const minX = Math.max(0, Math.min(x0, x1));
  const maxX = Math.min(data.width - 1, Math.max(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxY = Math.min(data.height - 1, Math.max(y0, y1));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (filled || x === minX || x === maxX || y === minY || y === maxY) {
        setPixel(data, x, y, color);
      }
    }
  }
}

export function drawLine(
  data: ImageData,
  x0: number, y0: number, x1: number, y1: number,
  color: RGBA
): void {
  const points = bresenhamLine(x0, y0, x1, y1);
  for (const { x, y } of points) {
    if (x >= 0 && y >= 0 && x < data.width && y < data.height) {
      setPixel(data, x, y, color);
    }
  }
}

// ─── Brush ──────────────────────────────────────────────────────────

/** Paint a filled circle of given radius centered at (cx, cy). */
export function paintBrush(
  data: ImageData, cx: number, cy: number, radius: number, color: RGBA
): void {
  if (radius <= 1) {
    if (cx >= 0 && cy >= 0 && cx < data.width && cy < data.height) {
      setPixel(data, cx, cy, color);
    }
    return;
  }
  const r = radius - 1; // radius=2 → 3x3 area
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        const px = cx + dx, py = cy + dy;
        if (px >= 0 && py >= 0 && px < data.width && py < data.height) {
          setPixel(data, px, py, color);
        }
      }
    }
  }
}

// ─── Selection Operations ───────────────────────────────────────────

export function extractRegion(
  data: ImageData, x: number, y: number, w: number, h: number
): ImageData {
  const region = new ImageData(w, h);
  for (let ry = 0; ry < h; ry++) {
    for (let rx = 0; rx < w; rx++) {
      const sx = x + rx, sy = y + ry;
      if (sx >= 0 && sy >= 0 && sx < data.width && sy < data.height) {
        const si = (sy * data.width + sx) * 4;
        const di = (ry * w + rx) * 4;
        region.data[di] = data.data[si];
        region.data[di + 1] = data.data[si + 1];
        region.data[di + 2] = data.data[si + 2];
        region.data[di + 3] = data.data[si + 3];
      }
    }
  }
  return region;
}

export function pasteRegion(
  target: ImageData, source: ImageData, destX: number, destY: number
): void {
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const tx = destX + x, ty = destY + y;
      if (tx >= 0 && ty >= 0 && tx < target.width && ty < target.height) {
        const si = (y * source.width + x) * 4;
        if (source.data[si + 3] === 0) continue; // don't paste transparent
        const di = (ty * target.width + tx) * 4;
        target.data[di] = source.data[si];
        target.data[di + 1] = source.data[si + 1];
        target.data[di + 2] = source.data[si + 2];
        target.data[di + 3] = source.data[si + 3];
      }
    }
  }
}

export function clearRegion(
  data: ImageData, x: number, y: number, w: number, h: number
): void {
  for (let ry = 0; ry < h; ry++) {
    for (let rx = 0; rx < w; rx++) {
      const px = x + rx, py = y + ry;
      if (px >= 0 && py >= 0 && px < data.width && py < data.height) {
        const i = (py * data.width + px) * 4;
        data.data[i] = data.data[i + 1] = data.data[i + 2] = data.data[i + 3] = 0;
      }
    }
  }
}

// ─── Mirror / Flip ──────────────────────────────────────────────────

export function flipHorizontal(data: ImageData): ImageData {
  const result = new ImageData(data.width, data.height);
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      const si = (y * data.width + x) * 4;
      const di = (y * data.width + (data.width - 1 - x)) * 4;
      result.data[di] = data.data[si];
      result.data[di + 1] = data.data[si + 1];
      result.data[di + 2] = data.data[si + 2];
      result.data[di + 3] = data.data[si + 3];
    }
  }
  return result;
}

export function flipVertical(data: ImageData): ImageData {
  const result = new ImageData(data.width, data.height);
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      const si = (y * data.width + x) * 4;
      const di = ((data.height - 1 - y) * data.width + x) * 4;
      result.data[di] = data.data[si];
      result.data[di + 1] = data.data[si + 1];
      result.data[di + 2] = data.data[si + 2];
      result.data[di + 3] = data.data[si + 3];
    }
  }
  return result;
}

// ─── Rendering Overlays ─────────────────────────────────────────────

/** Render brush outline showing size/shape at cursor position. */
export function renderBrushOutline(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  brushSize: number,
  zoom: number, panX: number, panY: number,
  canvasWidth: number, canvasHeight: number
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;

  if (brushSize <= 1) {
    // Single pixel — outline one cell
    const sx = panX + cx * zoom;
    const sy = panY + cy * zoom;
    ctx.strokeRect(sx + 0.5, sy + 0.5, zoom - 1, zoom - 1);
  } else {
    // Circle brush — outline each pixel that would be painted
    const r = brushSize - 1;
    ctx.beginPath();
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const px = cx + dx, py = cy + dy;
          if (px >= 0 && py >= 0 && px < canvasWidth && py < canvasHeight) {
            const sx = panX + px * zoom;
            const sy = panY + py * zoom;
            ctx.rect(sx + 0.5, sy + 0.5, zoom - 1, zoom - 1);
          }
        }
      }
    }
    ctx.stroke();
  }

  ctx.restore();
}

/** Render floating selection pixels as a semi-transparent overlay. */
export function renderFloatingPixels(
  ctx: CanvasRenderingContext2D,
  floatingData: ImageData,
  selX: number, selY: number,
  zoom: number, panX: number, panY: number
): void {
  // Create a temporary canvas from the floating ImageData
  const tmp = document.createElement('canvas');
  tmp.width = floatingData.width;
  tmp.height = floatingData.height;
  const tmpCtx = tmp.getContext('2d')!;
  tmpCtx.putImageData(floatingData, 0, 0);

  const screenX = panX + selX * zoom;
  const screenY = panY + selY * zoom;
  const screenW = floatingData.width * zoom;
  const screenH = floatingData.height * zoom;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, screenX, screenY, screenW, screenH);
  ctx.restore();
}

export function renderSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  sel: { x: number; y: number; w: number; h: number },
  zoom: number, panX: number, panY: number,
  animOffset: number
): void {
  const sx = panX + sel.x * zoom;
  const sy = panY + sel.y * zoom;
  const sw = sel.w * zoom;
  const sh = sel.h * zoom;

  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -animOffset;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, sy + 0.5, sw, sh);
  ctx.lineDashOffset = -animOffset + 4;
  ctx.strokeStyle = 'black';
  ctx.strokeRect(sx + 0.5, sy + 0.5, sw, sh);
  ctx.restore();
}

export function renderShapePreview(
  ctx: CanvasRenderingContext2D,
  tool: 'rect' | 'line',
  start: { x: number; y: number },
  end: { x: number; y: number },
  zoom: number, panX: number, panY: number,
  color: string, filled: boolean
): void {
  ctx.save();
  ctx.globalAlpha = 0.5;

  if (tool === 'rect') {
    const x = panX + Math.min(start.x, end.x) * zoom;
    const y = panY + Math.min(start.y, end.y) * zoom;
    const w = (Math.abs(end.x - start.x) + 1) * zoom;
    const h = (Math.abs(end.y - start.y) + 1) * zoom;
    if (filled) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = zoom;
      ctx.strokeRect(x + zoom / 2, y + zoom / 2, w - zoom, h - zoom);
    }
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = zoom;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(panX + start.x * zoom + zoom / 2, panY + start.y * zoom + zoom / 2);
    ctx.lineTo(panX + end.x * zoom + zoom / 2, panY + end.y * zoom + zoom / 2);
    ctx.stroke();
  }

  ctx.restore();
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
