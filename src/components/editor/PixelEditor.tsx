import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { usePixelEditorHistory } from '../../hooks/usePixelEditorHistory';
import {
  type RGBA,
  hexToRGBA,
  rgbaToHex,
  getPixel,
  setPixel,
  floodFill,
  bresenhamLine,
  displayToPixel,
  renderPixelCanvas,
  cloneImageData,
  createBlankImageData,
  imageToPixelData,
  pixelDataToBase64,
  resizePixelData,
  createProject,
  serializeProject,
  deserializeProject,
  type PixelEditorProject,
} from './pixelEditorUtils';
import { uploadMediaDataUrl } from '../../utils/mediaStorage';
import { toast } from '../shared/Toast';

// ─── Types ──────────────────────────────────────────────────────────

type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper';

interface PixelEditorProps {
  initialImage?: string;
  projectUrl?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  onApply: (base64: string, projectUrl?: string) => void;
  onClose: () => void;
  /** 'modal' = full-screen overlay (default), 'page' = fills parent container */
  mode?: 'modal' | 'page';
  /** Called when user clicks "New" in page mode to reset the editor */
  onNew?: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────

const CANVAS_SIZE_PRESETS = [8, 16, 24, 32, 48, 64];
const MAX_CANVAS_SIZE = 100;
const DEFAULT_ZOOM = 10;
const MIN_ZOOM = 1;
const MAX_ZOOM = 100;

const PALETTE: string[] = [
  // Row 1: darks & grays
  '#000000', '#222034', '#45283c', '#663931',
  '#8f563b', '#df7126', '#d9a066', '#eec39a',
  // Row 2: lights & warm
  '#fbf236', '#99e550', '#6abe30', '#37946e',
  '#4b692f', '#524b24', '#323c39', '#3f3f74',
  // Row 3: blues & purples
  '#306082', '#5b6ee1', '#639bff', '#5fcde4',
  '#cbdbfc', '#ffffff', '#9badb7', '#847e87',
  // Row 4: reds & pinks
  '#696a6a', '#595652', '#76428a', '#ac3232',
  '#d95763', '#d77bba', '#8f974a', '#8a6f30',
];

// ─── Component ──────────────────────────────────────────────────────

export const PixelEditor: React.FC<PixelEditorProps> = ({
  initialImage,
  projectUrl,
  defaultWidth = 32,
  defaultHeight = 32,
  onApply,
  onClose,
  mode = 'modal',
  onNew,
}) => {
  const isPage = mode === 'page';
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixelDataRef = useRef<ImageData>(createBlankImageData(defaultWidth, defaultHeight));
  const lastPixelRef = useRef<{ x: number; y: number } | null>(null);
  const isDrawingRef = useRef(false);
  const activePointersRef = useRef<Set<number>>(new Set());
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const [canvasWidth, setCanvasWidth] = useState(defaultWidth);
  const [canvasHeight, setCanvasHeight] = useState(defaultHeight);
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState('#000000');
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [renderKey, setRenderKey] = useState(0);

  // Resize inputs (separate from actual canvas size until confirmed)
  const [resizeW, setResizeW] = useState(defaultWidth);
  const [resizeH, setResizeH] = useState(defaultHeight);
  const [showResizePanel, setShowResizePanel] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const history = usePixelEditorHistory();

  // ─── Initialize ─────────────────────────────────────────────────

  useEffect(() => {
    if (loaded) return;

    const loadContent = async () => {
      // Try loading project file first
      if (projectUrl) {
        try {
          const resp = await fetch(projectUrl);
          const json = await resp.text();
          const project = deserializeProject(json);
          if (project) {
            const layer = project.layers[0];
            if (layer) {
              const result = await imageToPixelData(layer.data, project.width, project.height);
              pixelDataRef.current = result.data;
              setCanvasWidth(project.width);
              setCanvasHeight(project.height);
              setResizeW(project.width);
              setResizeH(project.height);
              setLoaded(true);
              centerCanvas(project.width, project.height);
              triggerRender();
              return;
            }
          }
        } catch (err) {
          console.warn('Failed to load pixel editor project:', err);
        }
      }

      // Fall back to loading initial image
      if (initialImage) {
        try {
          const result = await imageToPixelData(initialImage, undefined, undefined);
          // Clamp to max size
          const w = Math.min(result.width, MAX_CANVAS_SIZE);
          const h = Math.min(result.height, MAX_CANVAS_SIZE);
          if (w !== result.width || h !== result.height) {
            pixelDataRef.current = resizePixelData(result.data, w, h);
          } else {
            pixelDataRef.current = result.data;
          }
          setCanvasWidth(w);
          setCanvasHeight(h);
          setResizeW(w);
          setResizeH(h);
          centerCanvas(w, h);
        } catch (err) {
          console.warn('Failed to load initial image:', err);
          pixelDataRef.current = createBlankImageData(defaultWidth, defaultHeight);
          centerCanvas(defaultWidth, defaultHeight);
        }
      } else {
        centerCanvas(defaultWidth, defaultHeight);
      }

      setLoaded(true);
      triggerRender();
    };

    loadContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Rendering ──────────────────────────────────────────────────

  const triggerRender = useCallback(() => {
    setRenderKey(k => k + 1);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    renderPixelCanvas(ctx, pixelDataRef.current, zoom, panX, panY, showGrid, rect.width, rect.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey, zoom, panX, panY, showGrid, canvasWidth, canvasHeight]);

  const centerCanvas = useCallback((w: number, h: number) => {
    // Will be called after mount — defer to get canvas size
    requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const fitZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(Math.min(rect.width * 0.8 / w, rect.height * 0.8 / h))));
      setZoom(fitZoom);
      setPanX(Math.round(rect.width / 2 - (w * fitZoom) / 2));
      setPanY(Math.round(rect.height / 2 - (h * fitZoom) / 2));
      triggerRender();
    });
  }, [triggerRender]);

  // ─── Coordinate Helpers ─────────────────────────────────────────

  const getPixelCoord = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return displayToPixel(x, y, zoom, panX, panY, canvasWidth, canvasHeight);
  }, [zoom, panX, panY, canvasWidth, canvasHeight]);

  // ─── Tool Actions ───────────────────────────────────────────────

  const applyTool = useCallback((px: number, py: number) => {
    const data = pixelDataRef.current;
    if (px < 0 || py < 0 || px >= canvasWidth || py >= canvasHeight) return;

    switch (tool) {
      case 'pencil':
        setPixel(data, px, py, hexToRGBA(color));
        break;
      case 'eraser':
        setPixel(data, px, py, [0, 0, 0, 0]);
        break;
      case 'fill':
        floodFill(data, px, py, hexToRGBA(color));
        break;
      case 'eyedropper': {
        const sampled = getPixel(data, px, py);
        if (sampled[3] > 0) {
          setColor(rgbaToHex(sampled));
        }
        break;
      }
    }
    triggerRender();
  }, [tool, color, canvasWidth, canvasHeight, triggerRender]);

  const applyToolWithLine = useCallback((px: number, py: number) => {
    const last = lastPixelRef.current;
    if (last && (tool === 'pencil' || tool === 'eraser')) {
      const points = bresenhamLine(last.x, last.y, px, py);
      // Skip first point (already drawn on previous move)
      for (let i = 1; i < points.length; i++) {
        applyTool(points[i].x, points[i].y);
      }
    } else {
      applyTool(px, py);
    }
    lastPixelRef.current = { x: px, y: py };
  }, [tool, applyTool]);

  // ─── Pointer Events ────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    activePointersRef.current.add(e.pointerId);

    // Middle click or two fingers = pan
    if (e.button === 1 || activePointersRef.current.size > 1) {
      panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      return;
    }

    const coord = getPixelCoord(e);
    if (!coord) return;

    // Save undo snapshot before stroke
    history.push(pixelDataRef.current);
    isDrawingRef.current = true;
    lastPixelRef.current = null;
    applyToolWithLine(coord.x, coord.y);
  }, [panX, panY, getPixelCoord, history, applyToolWithLine]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Panning
    if (panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPanX(panStartRef.current.panX + dx);
      setPanY(panStartRef.current.panY + dy);
      triggerRender();
      return;
    }

    const coord = getPixelCoord(e);
    setCursorPos(coord);

    if (!isDrawingRef.current || !coord) return;
    applyToolWithLine(coord.x, coord.y);
  }, [getPixelCoord, applyToolWithLine, triggerRender]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    panStartRef.current = null;
    isDrawingRef.current = false;
    lastPixelRef.current = null;
  }, []);

  // ─── Zoom ───────────────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    setZoom(z => {
      const newZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta));
      // Zoom toward cursor
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const scale = newZ / z;
        setPanX(px => Math.round(cx - (cx - px) * scale));
        setPanY(py => Math.round(cy - (cy - py) * scale));
      }
      return newZ;
    });
    triggerRender();
  }, [triggerRender]);

  const zoomIn = useCallback(() => {
    setZoom(z => Math.min(MAX_ZOOM, z + 2));
    triggerRender();
  }, [triggerRender]);

  const zoomOut = useCallback(() => {
    setZoom(z => Math.max(MIN_ZOOM, z - 2));
    triggerRender();
  }, [triggerRender]);

  // ─── Undo / Redo ───────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    const prev = history.undo(pixelDataRef.current);
    if (prev) {
      pixelDataRef.current = prev;
      triggerRender();
    }
  }, [history, triggerRender]);

  const handleRedo = useCallback(() => {
    const next = history.redo(pixelDataRef.current);
    if (next) {
      pixelDataRef.current = next;
      triggerRender();
    }
  }, [history, triggerRender]);

  // ─── Canvas Resize ─────────────────────────────────────────────

  const handleResize = useCallback(() => {
    const w = Math.max(1, Math.min(MAX_CANVAS_SIZE, resizeW));
    const h = Math.max(1, Math.min(MAX_CANVAS_SIZE, resizeH));
    if (w === canvasWidth && h === canvasHeight) return;

    const willLose = w < canvasWidth || h < canvasHeight;
    if (willLose && !window.confirm('Shrinking the canvas will crop pixels. Continue?')) {
      return;
    }

    history.push(pixelDataRef.current);
    pixelDataRef.current = resizePixelData(pixelDataRef.current, w, h);
    setCanvasWidth(w);
    setCanvasHeight(h);
    setShowResizePanel(false);
    centerCanvas(w, h);
    history.reset();
  }, [resizeW, resizeH, canvasWidth, canvasHeight, history, centerCanvas]);

  // ─── Apply / Save ──────────────────────────────────────────────

  const handleApply = useCallback(() => {
    const base64 = pixelDataToBase64(pixelDataRef.current);
    onApply(base64);
  }, [onApply]);

  const handleSaveToCloud = useCallback(async () => {
    setSaving(true);
    try {
      const base64 = pixelDataToBase64(pixelDataRef.current);
      const name = `pixel-${canvasWidth}x${canvasHeight}-${Date.now()}`;

      // Upload PNG
      const pngResult = await uploadMediaDataUrl(base64, name, 'pixel-art');
      if (!pngResult) {
        toast.error('Failed to upload image');
        return;
      }

      // Upload project file
      const project = createProject(canvasWidth, canvasHeight, pixelDataRef.current);
      const projectJson = serializeProject(project);
      const projectBase64 = 'data:application/json;base64,' + btoa(projectJson);
      const projectResult = await uploadMediaDataUrl(projectBase64, name + '.project', 'pixel-art');

      onApply(pngResult.url, projectResult?.url);
      toast.success('Saved to cloud!');
    } catch (err) {
      console.error('Cloud save failed:', err);
      toast.error('Cloud save failed');
    } finally {
      setSaving(false);
    }
  }, [canvasWidth, canvasHeight, onApply]);

  // ─── Keyboard Shortcuts ─────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (ctrl && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (!ctrl) {
        switch (e.key.toLowerCase()) {
          case 'b': setTool('pencil'); break;
          case 'e': setTool('eraser'); break;
          case 'g': setTool('fill'); break;
          case 'i': setTool('eyedropper'); break;
          case '=': case '+': zoomIn(); break;
          case '-': zoomOut(); break;
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleUndo, handleRedo, zoomIn, zoomOut]);

  // ─── Tool Config ────────────────────────────────────────────────

  const tools: { id: Tool; label: string; icon: string; key: string }[] = [
    { id: 'pencil', label: 'Pencil', icon: '✏️', key: 'B' },
    { id: 'eraser', label: 'Eraser', icon: '◻', key: 'E' },
    { id: 'fill', label: 'Fill', icon: '🪣', key: 'G' },
    { id: 'eyedropper', label: 'Eyedropper', icon: '💧', key: 'I' },
  ];

  // ─── Render ─────────────────────────────────────────────────────

  const toolbarButtons = (
    <>
      {tools.map(t => (
        <button
          key={t.id}
          onClick={() => setTool(t.id)}
          title={`${t.label} (${t.key})`}
          className={`px-2 py-1.5 rounded text-sm transition-colors ${
            tool === t.id
              ? 'bg-arcane-600 text-parchment-100'
              : 'bg-stone-700 hover:bg-stone-600 text-stone-300'
          }`}
        >
          {t.icon}
        </button>
      ))}
      <div className="w-px bg-stone-600 mx-1" />
      <button
        onClick={handleUndo}
        disabled={!history.canUndo}
        title="Undo (Ctrl+Z)"
        className="px-2 py-1.5 rounded text-sm bg-stone-700 hover:bg-stone-600 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ↩
      </button>
      <button
        onClick={handleRedo}
        disabled={!history.canRedo}
        title="Redo (Ctrl+Y)"
        className="px-2 py-1.5 rounded text-sm bg-stone-700 hover:bg-stone-600 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ↪
      </button>
      <div className="w-px bg-stone-600 mx-1" />
      <button
        onClick={() => setShowGrid(g => !g)}
        title="Toggle Grid"
        className={`px-2 py-1.5 rounded text-sm transition-colors ${
          showGrid ? 'bg-arcane-600 text-parchment-100' : 'bg-stone-700 text-stone-300'
        }`}
      >
        #
      </button>
      <button onClick={zoomOut} title="Zoom Out (-)" className="px-2 py-1.5 rounded text-sm bg-stone-700 hover:bg-stone-600">
        -
      </button>
      <span className="text-xs text-stone-400 self-center min-w-[2.5rem] text-center">{zoom}x</span>
      <button onClick={zoomIn} title="Zoom In (+)" className="px-2 py-1.5 rounded text-sm bg-stone-700 hover:bg-stone-600">
        +
      </button>
    </>
  );

  const colorPalette = (
    <div>
      {/* Current color */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded border-2 border-white"
          style={{ backgroundColor: color }}
        />
        <input
          type="color"
          value={color}
          onChange={e => setColor(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer bg-transparent"
        />
        <span className="text-xs text-stone-400 font-mono">{color}</span>
      </div>
      {/* Preset swatches */}
      <div className="grid grid-cols-8 gap-0.5">
        {PALETTE.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-sm border ${
              color === c ? 'border-white border-2' : 'border-stone-600'
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>
    </div>
  );

  const canvasSizeControls = (
    <div>
      <button
        onClick={() => { setShowResizePanel(p => !p); setResizeW(canvasWidth); setResizeH(canvasHeight); }}
        className="text-xs text-stone-400 hover:text-stone-300"
      >
        Canvas: {canvasWidth}x{canvasHeight} {showResizePanel ? '▼' : '▶'}
      </button>
      {showResizePanel && (
        <div className="flex items-center gap-2 mt-1">
          <input
            type="number"
            min="1"
            max={MAX_CANVAS_SIZE}
            value={resizeW}
            onChange={e => setResizeW(parseInt(e.target.value) || 1)}
            className="w-14 px-1 py-0.5 bg-stone-700 rounded text-xs text-parchment-100 text-center"
          />
          <span className="text-xs text-stone-500">x</span>
          <input
            type="number"
            min="1"
            max={MAX_CANVAS_SIZE}
            value={resizeH}
            onChange={e => setResizeH(parseInt(e.target.value) || 1)}
            className="w-14 px-1 py-0.5 bg-stone-700 rounded text-xs text-parchment-100 text-center"
          />
          <button
            onClick={handleResize}
            className="px-2 py-0.5 bg-arcane-700 hover:bg-arcane-600 rounded text-xs"
          >
            Apply
          </button>
          {/* Presets */}
          <div className="flex gap-1 ml-1">
            {CANVAS_SIZE_PRESETS.map(s => (
              <button
                key={s}
                onClick={() => { setResizeW(s); setResizeH(s); }}
                className={`px-1.5 py-0.5 rounded text-xs ${
                  resizeW === s && resizeH === s ? 'bg-arcane-600' : 'bg-stone-700 hover:bg-stone-600'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Desktop Layout ─────────────────────────────────────────────

  if (!isMobile) {
    return (
      <div className={isPage ? 'flex flex-col h-[calc(100vh-60px)] bg-stone-950' : 'fixed inset-0 bg-black/80 flex flex-col z-50'}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-stone-900 border-b border-stone-700">
          {isPage ? (
            <button onClick={onNew} className="px-3 py-1 bg-purple-700 hover:bg-purple-600 rounded text-sm">
              + New
            </button>
          ) : (
            <button onClick={onClose} className="px-3 py-1 bg-stone-700 hover:bg-stone-600 rounded text-sm">
              ✕ Close
            </button>
          )}
          <span className="text-sm text-parchment-100 font-bold">
            Pixel Editor — {canvasWidth}x{canvasHeight}
          </span>
          <div className="flex gap-2">
            {!isPage && (
              <button
                onClick={handleApply}
                className="px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-sm"
              >
                Apply
              </button>
            )}
            <button
              onClick={handleSaveToCloud}
              disabled={saving}
              className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : '☁ Save to Cloud'}
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-1.5 bg-stone-800 border-b border-stone-700">
          {toolbarButtons}
        </div>

        {/* Main content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-56 bg-stone-900 border-r border-stone-700 p-3 flex flex-col gap-3 overflow-y-auto">
            {colorPalette}
            <div className="border-t border-stone-700 pt-2">
              {canvasSizeControls}
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 relative bg-stone-950 overflow-hidden">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ touchAction: 'none', cursor: tool === 'eyedropper' ? 'crosshair' : 'default' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
            />
            {/* Status bar */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-1 bg-stone-900/80 text-xs text-stone-400">
              <span>Zoom: {zoom}x</span>
              <span>
                {cursorPos ? `Pos: (${cursorPos.x}, ${cursorPos.y})` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Mobile Layout ──────────────────────────────────────────────

  return (
    <div className={isPage ? 'flex flex-col h-[calc(100vh-60px)] bg-stone-950' : 'fixed inset-0 bg-black flex flex-col z-50'}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-stone-900 border-b border-stone-700">
        {isPage ? (
          <button onClick={onNew} className="px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded text-xs">
            + New
          </button>
        ) : (
          <button onClick={onClose} className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs">
            ✕
          </button>
        )}
        <span className="text-xs text-parchment-100 font-bold">
          {canvasWidth}x{canvasHeight}
        </span>
        {!isPage ? (
          <button
            onClick={handleApply}
            className="px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-xs"
          >
            Apply
          </button>
        ) : (
          <button
            onClick={handleSaveToCloud}
            disabled={saving}
            className="px-2 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-xs disabled:opacity-50"
          >
            {saving ? '...' : '☁ Save'}
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-stone-800 border-b border-stone-700 flex-wrap">
        {toolbarButtons}
      </div>

      {/* Canvas */}
      <div className="flex-1 relative bg-stone-950 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none', cursor: 'default' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        />
      </div>

      {/* Bottom bar: palette + controls */}
      <div className="bg-stone-900 border-t border-stone-700 p-2 space-y-2">
        {colorPalette}
        <div className="flex items-center justify-between">
          {canvasSizeControls}
          {!isPage && (
            <button
              onClick={handleSaveToCloud}
              disabled={saving}
              className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-xs disabled:opacity-50"
            >
              {saving ? '...' : '☁ Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
