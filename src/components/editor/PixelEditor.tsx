import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { usePixelEditorHistory, type PixelEditorHistorySnapshot } from '../../hooks/usePixelEditorHistory';
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
  serializeProject,
  deserializeProject,
  compositeLayers,
  cloneLayerStack,
  drawRect,
  drawLine,
  paintBrush,
  extractRegion,
  pasteRegion,
  clearRegion,
  flipHorizontal,
  flipVertical,
  renderBrushOutline,
  renderSelectionOverlay,
  renderShapePreview,
  compositeFramesToSpriteSheet,
  generateFrameThumbnail,
  type PixelEditorProject,
  type PixelEditorLayer,
} from './pixelEditorUtils';
import { PixelEditorTimeline } from './PixelEditorTimeline';
import { PixelEditorAnimationPreview } from './PixelEditorAnimationPreview';
import { uploadMediaDataUrl, uploadMediaDataUrlToPath } from '../../utils/mediaStorage';
import { PixelEditorOpenModal } from './PixelEditorOpenModal';
import { toast } from '../shared/Toast';
import { writePixelAutoSave, readPixelAutoSave, clearPixelAutoSave, AUTOSAVE_INTERVAL_MS, type PixelAutoSaveData } from '../../utils/pixelEditorAutoSave';
import { cachePixelEditorState, getCachedPixelEditorState } from '../../utils/pixelEditorState';
import { setGlobalClipboard, getGlobalClipboard, hasGlobalClipboard } from '../../utils/pixelEditorClipboard';
import { loadThemeAssets, subscribeToThemeAssets, type ThemeAssets } from '../../utils/themeAssets';

// ─── Types ──────────────────────────────────────────────────────────

type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'select' | 'move' | 'rect' | 'line';

interface LayerState {
  id: string;
  name: string;
  visible: boolean;
  opacity: number; // 0-1
  data: ImageData;
}

interface Selection {
  x: number; y: number; w: number; h: number;
  floatingData?: ImageData;
}

interface PixelEditorProps {
  initialImage?: string;
  projectUrl?: string;
  /** Pre-serialized project JSON to restore (used by tab system to bypass global cache). */
  initialProjectJson?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  onApply: (base64: string, projectUrl?: string) => void;
  onClose: () => void;
  mode?: 'modal' | 'page';
  onNew?: () => void;
  onProjectUrlChange?: (url: string) => void;
  /** Called whenever the project name or dirty state changes (for tab display). */
  onMetadataChange?: (meta: { projectName: string; dirty: boolean }) => void;
}

/** Imperative handle exposed to PixelEditorPage for tab serialization. */
export interface PixelEditorHandle {
  /** Serialize the current editor state for tab persistence. */
  serializeState: () => {
    projectJson: string;
    projectName: string;
    dirty: boolean;
    currentPngPath: string | null;
    currentProjectPath: string | null;
    currentProjectUrl: string | null;
    zoom: number;
    panX: number;
    panY: number;
    showGrid: boolean;
    activeFrameIndex: number;
    activeLayerIndex: number;
    customColors: string[];
  };
}

// ─── Constants ──────────────────────────────────────────────────────

const CANVAS_SIZE_PRESETS = [8, 16, 24, 32, 48, 64];
const MAX_CANVAS_SIZE = 100;
const DEFAULT_ZOOM = 10;
const MIN_ZOOM = 1;
const MAX_ZOOM = 100;

const PALETTE: string[] = [
  '#000000', '#222034', '#45283c', '#663931',
  '#8f563b', '#df7126', '#d9a066', '#eec39a',
  '#fbf236', '#99e550', '#6abe30', '#37946e',
  '#4b692f', '#524b24', '#323c39', '#3f3f74',
  '#306082', '#5b6ee1', '#639bff', '#5fcde4',
  '#cbdbfc', '#ffffff', '#9badb7', '#847e87',
  '#696a6a', '#595652', '#76428a', '#ac3232',
  '#d95763', '#d77bba', '#8f974a', '#8a6f30',
];

let nextLayerId = 1;
function genLayerId() {
  return `layer-${nextLayerId++}`;
}

let nextFrameId = 1;
function genFrameId() {
  return `frame-${nextFrameId++}`;
}

// ─── Component ──────────────────────────────────────────────────────

export const PixelEditor = forwardRef<PixelEditorHandle, PixelEditorProps>(({
  initialImage,
  projectUrl,
  initialProjectJson,
  defaultWidth = 32,
  defaultHeight = 32,
  onApply,
  onClose,
  mode = 'modal',
  onNew,
  onProjectUrlChange,
  onMetadataChange,
}, ref) => {
  const isPage = mode === 'page';
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ─── Layer State ────────────────────────────────────────────────
  const layersRef = useRef<LayerState[]>([{
    id: genLayerId(),
    name: 'Background',
    visible: true,
    opacity: 1,
    data: createBlankImageData(defaultWidth, defaultHeight),
  }]);
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const [layerRevision, setLayerRevision] = useState(0); // forces re-render on layer changes

  // ─── Frame State (Animation) ──────────────────────────────────
  // framesRef stores all frames. layersRef always points to the active frame's layers.
  // Frame 0's layers are initialized from layersRef's initial value.
  interface FrameData { id: string; layers: LayerState[]; duration?: number }
  const framesRef = useRef<FrameData[]>([{
    id: 'frame-1',
    layers: layersRef.current,
  }]);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [frameRevision, setFrameRevision] = useState(0); // forces timeline re-render
  const [animFrameRate, setAnimFrameRate] = useState(10);
  const [animLoop, setAnimLoop] = useState(true);
  const [isAnimPlaying, setIsAnimPlaying] = useState(false);
  const [onionSkinning, setOnionSkinning] = useState({
    enabled: false, before: 1, after: 0, opacity: 0.25,
  });
  const [showTimeline, setShowTimeline] = useState(false);

  const lastPixelRef = useRef<{ x: number; y: number } | null>(null);
  const isDrawingRef = useRef(false);
  const pointerButtonRef = useRef(0);
  const activePointersRef = useRef<Set<number>>(new Set());
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pointerPositionsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(DEFAULT_ZOOM);

  // Tool hold (spring-loaded): hold Alt→eyedropper. Release snaps back.
  const heldToolRef = useRef<Tool | null>(null);
  const preHoldToolRef = useRef<Tool>('pencil');
  // Space hold → pan mode (like middle-click drag)
  const spaceHeldRef = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false); // for cursor rendering

  const [canvasWidth, setCanvasWidth] = useState(defaultWidth);
  const [canvasHeight, setCanvasHeight] = useState(defaultHeight);
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState('#000000');
  const [secondaryColor, setSecondaryColor] = useState('#ffffff');
  const [showPalette, setShowPalette] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [renderKey, setRenderKey] = useState(0);
  const [brushSize, setBrushSize] = useState(1);
  const [rectFilled, setRectFilled] = useState(true);

  // Selection state
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  // Clipboard is now global (pixelEditorClipboard.ts) for cross-tab support
  const shiftSelectRef = useRef<Selection | null>(null); // previous selection for Shift+additive
  const selectionAnimRef = useRef(0);
  const selectionRafRef = useRef<number | null>(null);

  // Shape tool state
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [shapeEnd, setShapeEnd] = useState<{ x: number; y: number } | null>(null);

  // Custom color palette
  const [customColors, setCustomColors] = useState<string[]>([]);

  // Resize inputs
  const [resizeW, setResizeW] = useState(defaultWidth);
  const [resizeH, setResizeH] = useState(defaultHeight);
  const [showResizePanel, setShowResizePanel] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Layer panel
  const [showLayers, setShowLayers] = useState(!isMobile);
  const [editingLayerName, setEditingLayerName] = useState<string | null>(null);
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);
  const [dragLayerIdx, setDragLayerIdx] = useState<number | null>(null);
  const [dragOverLayerIdx, setDragOverLayerIdx] = useState<number | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [projectName, setProjectName] = useState('Untitled');
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [currentProjectUrl, setCurrentProjectUrl] = useState<string | null>(projectUrl || null);
  const [currentPngPath, setCurrentPngPath] = useState<string | null>(null);
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
  const [recoveryData, setRecoveryData] = useState<PixelAutoSaveData | null>(null);

  // Theme assets for custom tool icons
  const [themeAssets, setThemeAssets] = useState<ThemeAssets>(loadThemeAssets);

  const history = usePixelEditorHistory();

  // ─── Helpers ──────────────────────────────────────────────────────

  const getActiveLayer = useCallback((): LayerState => {
    return layersRef.current[activeLayerIndex] || layersRef.current[0];
  }, [activeLayerIndex]);

  const bumpLayers = useCallback(() => {
    setLayerRevision(r => r + 1);
  }, []);

  const bumpFrames = useCallback(() => {
    setFrameRevision(r => r + 1);
  }, []);

  const getSnapshot = useCallback((): PixelEditorHistorySnapshot => {
    return {
      frameIndex: activeFrameIndex,
      layers: layersRef.current.map(l => l.data),
      activeLayerIndex,
    };
  }, [activeLayerIndex, activeFrameIndex]);

  const restoreSnapshot = useCallback((snap: PixelEditorHistorySnapshot) => {
    for (let i = 0; i < layersRef.current.length && i < snap.layers.length; i++) {
      layersRef.current[i].data = snap.layers[i];
    }
    // If snapshot has different layer count, adjust
    if (snap.layers.length !== layersRef.current.length) {
      // Rebuild layer stack from snapshot
      const newLayers: LayerState[] = snap.layers.map((data, i) => {
        const existing = layersRef.current[i];
        return existing
          ? { ...existing, data }
          : { id: genLayerId(), name: `Layer ${i + 1}`, visible: true, opacity: 1, data };
      });
      layersRef.current = newLayers;
    }
    setActiveLayerIndex(Math.min(snap.activeLayerIndex, layersRef.current.length - 1));
    bumpLayers();
  }, [bumpLayers]);

  // ─── Theme Assets ─────────────────────────────────────────────────

  useEffect(() => {
    return subscribeToThemeAssets(() => {
      setThemeAssets(loadThemeAssets());
    });
  }, []);

  // ─── Rendering Trigger & Canvas Centering ────────────────────────
  // (declared early so loadProjectFromUrl can reference them)

  const triggerRender = useCallback(() => {
    setRenderKey(k => k + 1);
  }, []);

  const centerCanvas = useCallback((w: number, h: number) => {
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

  // ─── Load Project From URL ────────────────────────────────────────

  const loadProjectFromUrl = useCallback(async (url: string) => {
    try {
      const resp = await fetch(url);
      const json = await resp.text();
      const project = deserializeProject(json);
      if (!project) {
        toast.error('Invalid project file');
        return false;
      }
      if (!project.frames.length) return false;

      // Load ALL frames
      const loadedFrames: FrameData[] = [];
      for (const frameDef of project.frames) {
        const frameLayers: LayerState[] = [];
        for (const layerDef of frameDef.layers) {
          const result = await imageToPixelData(layerDef.data, project.width, project.height);
          frameLayers.push({
            id: layerDef.id || genLayerId(),
            name: layerDef.name || `Layer ${frameLayers.length + 1}`,
            visible: layerDef.visible !== false,
            opacity: layerDef.opacity ?? 1,
            data: result.data,
          });
        }
        if (frameLayers.length > 0) {
          loadedFrames.push({
            id: frameDef.id || genFrameId(),
            layers: frameLayers,
            duration: frameDef.duration,
          });
        }
      }
      if (loadedFrames.length === 0) return false;

      framesRef.current = loadedFrames;
      layersRef.current = loadedFrames[0].layers;
      setActiveFrameIndex(0);
      setCanvasWidth(project.width);
      setCanvasHeight(project.height);
      setResizeW(project.width);
      setResizeH(project.height);
      if (project.name) setProjectName(project.name);
      if (project.palette) setCustomColors(project.palette);
      if (project.frameRate) setAnimFrameRate(project.frameRate);
      if (project.loop !== undefined) setAnimLoop(project.loop);
      setShowTimeline(loadedFrames.length > 1);
      setCurrentProjectUrl(url);
      // Extract storage paths from URL for Save overwrite
      try {
        const u = new URL(url);
        const pathMatch = u.pathname.match(/\/object\/public\/[^/]+\/(.+)/);
        if (pathMatch) {
          const projPath = pathMatch[1];
          setCurrentProjectPath(projPath);
          setCurrentPngPath(projPath.replace(/\.project$/, ''));
        }
      } catch { /* ignore URL parse errors */ }
      setSelection(null);
      setActiveLayerIndex(0);
      history.reset();
      bumpLayers();
      bumpFrames();
      centerCanvas(project.width, project.height);
      triggerRender();
      return true;
    } catch (err) {
      console.warn('Failed to load pixel editor project:', err);
      toast.error('Failed to load project');
      return false;
    }
  }, [bumpLayers, bumpFrames, centerCanvas, triggerRender, history]);

  // ─── Build Project Helper (declared early for autosave effects) ──

  const buildCurrentProject = useCallback((): PixelEditorProject => {
    // Sync current frame's layers before building
    framesRef.current[activeFrameIndex].layers = layersRef.current;
    return {
      version: 2,
      name: projectName,
      width: canvasWidth,
      height: canvasHeight,
      frames: framesRef.current.map(frame => ({
        id: frame.id,
        layers: frame.layers.map(l => ({
          id: l.id,
          name: l.name,
          visible: l.visible,
          opacity: l.opacity,
          data: pixelDataToBase64(l.data),
        })),
        ...(frame.duration != null ? { duration: frame.duration } : {}),
      })),
      frameRate: animFrameRate,
      palette: customColors.length > 0 ? customColors : undefined,
      loop: animLoop,
    };
  }, [projectName, canvasWidth, canvasHeight, customColors, animFrameRate, animLoop, activeFrameIndex]);

  // ─── Imperative Handle (for tab serialization) ──────────────────

  const dirtyRef = useRef(false);

  // Track changes for dirty state
  const markDirty = useCallback(() => {
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      onMetadataChange?.({ projectName, dirty: true });
    }
  }, [projectName, onMetadataChange]);

  useImperativeHandle(ref, () => ({
    serializeState: () => ({
      projectJson: serializeProject(buildCurrentProject()),
      projectName,
      dirty: dirtyRef.current,
      currentPngPath,
      currentProjectPath,
      currentProjectUrl,
      zoom,
      panX,
      panY,
      showGrid,
      activeFrameIndex,
      activeLayerIndex,
      customColors,
    }),
  }), [buildCurrentProject, projectName, currentPngPath, currentProjectPath, currentProjectUrl, zoom, panX, panY, showGrid, activeFrameIndex, activeLayerIndex, customColors]);

  // Notify parent of metadata changes
  useEffect(() => {
    onMetadataChange?.({ projectName, dirty: dirtyRef.current });
  }, [projectName, onMetadataChange]);

  // Mark dirty on layer changes (after initial load)
  const initialLoadDoneRef = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      return;
    }
    markDirty();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerRevision]);

  // ─── Initialize ─────────────────────────────────────────────────

  useEffect(() => {
    if (loaded) return;

    /** Helper to hydrate a project from serialized JSON. Returns true on success. */
    const hydrateFromJson = async (
      json: string,
      extra?: { pngPath?: string | null; projPath?: string | null; projUrl?: string | null },
    ): Promise<boolean> => {
      try {
        const project = deserializeProject(json);
        if (!project || project.frames.length === 0) return false;
        const loadedFrames: FrameData[] = [];
        for (const frameDef of project.frames) {
          const frameLayers: LayerState[] = [];
          for (const layerDef of frameDef.layers) {
            const result = await imageToPixelData(layerDef.data, project.width, project.height);
            frameLayers.push({
              id: layerDef.id || genLayerId(),
              name: layerDef.name || `Layer ${frameLayers.length + 1}`,
              visible: layerDef.visible !== false,
              opacity: layerDef.opacity ?? 1,
              data: result.data,
            });
          }
          if (frameLayers.length > 0) {
            loadedFrames.push({ id: frameDef.id || genFrameId(), layers: frameLayers, duration: frameDef.duration });
          }
        }
        if (loadedFrames.length === 0) return false;
        framesRef.current = loadedFrames;
        layersRef.current = loadedFrames[0].layers;
        setActiveFrameIndex(0);
        setCanvasWidth(project.width);
        setCanvasHeight(project.height);
        setResizeW(project.width);
        setResizeH(project.height);
        if (project.name) setProjectName(project.name);
        if (project.palette) setCustomColors(project.palette);
        if (project.frameRate) setAnimFrameRate(project.frameRate);
        if (project.loop !== undefined) setAnimLoop(project.loop);
        setShowTimeline(loadedFrames.length > 1);
        if (extra?.pngPath !== undefined) setCurrentPngPath(extra.pngPath);
        if (extra?.projPath !== undefined) setCurrentProjectPath(extra.projPath);
        if (extra?.projUrl !== undefined) setCurrentProjectUrl(extra.projUrl);
        setActiveLayerIndex(0);
        bumpLayers();
        bumpFrames();
        centerCanvas(project.width, project.height);
        triggerRender();
        return true;
      } catch { return false; }
    };

    const loadContent = async () => {
      // 1. Check for initialProjectJson (tab system — contains latest serialized state
      //    including unsaved edits, so it takes priority over projectUrl for tab-switching)
      if (initialProjectJson) {
        const ok = await hydrateFromJson(initialProjectJson);
        if (ok) {
          // Restore save paths from the tab's project URL
          if (projectUrl) {
            setCurrentProjectUrl(projectUrl);
            try {
              const u = new URL(projectUrl);
              const pathMatch = u.pathname.match(/\/object\/public\/[^/]+\/(.+)/);
              if (pathMatch) {
                setCurrentProjectPath(pathMatch[1]);
                setCurrentPngPath(pathMatch[1].replace(/\.project$/, ''));
              }
            } catch { /* ignore */ }
          }
          setLoaded(true);
          return;
        }
      }

      // 2. Check for explicit project URL (first load from browser/URL param)
      if (projectUrl) {
        const ok = await loadProjectFromUrl(projectUrl);
        if (ok) {
          setLoaded(true);
          return;
        }
      }

      // 3. Check for cached state (legacy: non-tab page mode, e.g., modal editors)
      if (isPage && !initialProjectJson) {
        const cached = getCachedPixelEditorState();
        if (cached) {
          const ok = await hydrateFromJson(cached.projectJson, {
            pngPath: cached.currentPngPath,
            projPath: cached.currentProjectPath,
            projUrl: cached.currentProjectUrl,
          });
          if (ok) {
            setLoaded(true);
            return;
          }
        }

        // 4. Check for autosave recovery (crash/refresh recovery)
        const autoSave = readPixelAutoSave();
        if (autoSave) {
          setRecoveryData(autoSave);
        }
      }

      if (initialImage) {
        try {
          const result = await imageToPixelData(initialImage, undefined, undefined);
          const w = Math.min(result.width, MAX_CANVAS_SIZE);
          const h = Math.min(result.height, MAX_CANVAS_SIZE);
          const data = (w !== result.width || h !== result.height)
            ? resizePixelData(result.data, w, h) : result.data;
          layersRef.current = [{
            id: genLayerId(), name: 'Background', visible: true, opacity: 1, data,
          }];
          setCanvasWidth(w);
          setCanvasHeight(h);
          setResizeW(w);
          setResizeH(h);
          bumpLayers();
          centerCanvas(w, h);
        } catch (err) {
          console.warn('Failed to load initial image:', err);
          layersRef.current = [{
            id: genLayerId(), name: 'Background', visible: true, opacity: 1,
            data: createBlankImageData(defaultWidth, defaultHeight),
          }];
          bumpLayers();
          centerCanvas(defaultWidth, defaultHeight);
        }
      } else {
        bumpLayers(); // Ensure layerRevision bumps so initialLoadDoneRef guard is consumed
        centerCanvas(defaultWidth, defaultHeight);
      }

      setLoaded(true);
      triggerRender();
    };

    loadContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Autosave & Tab Persistence ────────────────────────────────

  // Periodic autosave (30s)
  useEffect(() => {
    if (!isPage || !loaded) return;
    const timer = setInterval(() => {
      const project = buildCurrentProject();
      writePixelAutoSave({
        projectJson: serializeProject(project),
        projectName,
        currentPngPath,
        currentProjectPath,
        currentProjectUrl,
        savedAt: new Date().toISOString(),
      });
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isPage, loaded, buildCurrentProject, projectName, currentPngPath, currentProjectPath, currentProjectUrl]);

  // Cache state for tab switching
  useEffect(() => {
    if (!isPage || !loaded) return;
    const project = buildCurrentProject();
    cachePixelEditorState({
      projectJson: serializeProject(project),
      projectName,
      currentPngPath,
      currentProjectPath,
      currentProjectUrl,
    });
  }, [isPage, loaded, buildCurrentProject, projectName, currentPngPath, currentProjectPath, currentProjectUrl, layerRevision]);

  // Page leave warning + autosave flush
  useEffect(() => {
    if (!isPage) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const project = buildCurrentProject();
      writePixelAutoSave({
        projectJson: serializeProject(project),
        projectName,
        currentPngPath,
        currentProjectPath,
        currentProjectUrl,
        savedAt: new Date().toISOString(),
      });
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isPage, buildCurrentProject, projectName, currentPngPath, currentProjectPath, currentProjectUrl]);

  // Recovery handlers
  const handleRecoverAutoSave = useCallback(async () => {
    if (!recoveryData) return;
    try {
      const project = deserializeProject(recoveryData.projectJson);
      if (!project) {
        toast.error('Recovery data is corrupt');
        clearPixelAutoSave();
        setRecoveryData(null);
        return;
      }
      const loadedFrames: FrameData[] = [];
      for (const frameDef of project.frames) {
        const frameLayers: LayerState[] = [];
        for (const layerDef of frameDef.layers) {
          const result = await imageToPixelData(layerDef.data, project.width, project.height);
          frameLayers.push({
            id: layerDef.id || genLayerId(),
            name: layerDef.name || `Layer ${frameLayers.length + 1}`,
            visible: layerDef.visible !== false,
            opacity: layerDef.opacity ?? 1,
            data: result.data,
          });
        }
        if (frameLayers.length > 0) {
          loadedFrames.push({ id: frameDef.id || genFrameId(), layers: frameLayers, duration: frameDef.duration });
        }
      }
      if (loadedFrames.length > 0) {
        framesRef.current = loadedFrames;
        layersRef.current = loadedFrames[0].layers;
        setActiveFrameIndex(0);
        setCanvasWidth(project.width);
        setCanvasHeight(project.height);
        setResizeW(project.width);
        setResizeH(project.height);
        if (project.name) setProjectName(project.name);
        if (project.palette) setCustomColors(project.palette);
        if (project.frameRate) setAnimFrameRate(project.frameRate);
        if (project.loop !== undefined) setAnimLoop(project.loop);
        setShowTimeline(loadedFrames.length > 1);
        setCurrentPngPath(recoveryData.currentPngPath);
        setCurrentProjectPath(recoveryData.currentProjectPath);
        setCurrentProjectUrl(recoveryData.currentProjectUrl);
        setActiveLayerIndex(0);
        history.reset();
        bumpLayers();
        bumpFrames();
        centerCanvas(project.width, project.height);
        triggerRender();
        toast.success(`Recovered "${project.name || 'Untitled'}"`);
      }
    } catch (err) {
      console.error('Recovery failed:', err);
      toast.error('Recovery failed');
    }
    clearPixelAutoSave();
    setRecoveryData(null);
  }, [recoveryData, bumpLayers, bumpFrames, centerCanvas, triggerRender, history]);

  // ─── Rendering ──────────────────────────────────────────────────

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

    // Composite all visible layers
    const layers = layersRef.current;
    const composite = compositeLayers(
      layers.map(l => l.data),
      layers.map(l => l.visible),
      layers.map(l => Math.round(l.opacity * 255)),
      canvasWidth,
      canvasHeight
    );

    // Bake floating selection pixels into the composite so they render through the same pipeline
    if (selection?.floatingData) {
      pasteRegion(composite, selection.floatingData, selection.x, selection.y);
    }

    renderPixelCanvas(ctx, composite, zoom, panX, panY, showGrid, rect.width, rect.height);

    // ── Onion skinning: render ghost frames before/after ──
    if (onionSkinning.enabled && framesRef.current.length > 1) {
      const ghostCanvas = document.createElement('canvas');
      ghostCanvas.width = canvasWidth;
      ghostCanvas.height = canvasHeight;
      const ghostCtx = ghostCanvas.getContext('2d')!;

      const renderGhostFrame = (frameIdx: number, tint: [number, number, number]) => {
        const frame = framesRef.current[frameIdx];
        if (!frame) return;
        const ghostComposite = compositeLayers(
          frame.layers.map(l => l.data),
          frame.layers.map(l => l.visible),
          frame.layers.map(l => Math.round(l.opacity * 255)),
          canvasWidth, canvasHeight,
        );
        // Apply tint to the ghost composite
        for (let i = 0; i < ghostComposite.data.length; i += 4) {
          if (ghostComposite.data[i + 3] > 0) {
            ghostComposite.data[i] = Math.round(ghostComposite.data[i] * 0.5 + tint[0] * 0.5);
            ghostComposite.data[i + 1] = Math.round(ghostComposite.data[i + 1] * 0.5 + tint[1] * 0.5);
            ghostComposite.data[i + 2] = Math.round(ghostComposite.data[i + 2] * 0.5 + tint[2] * 0.5);
            ghostComposite.data[i + 3] = Math.round(ghostComposite.data[i + 3] * onionSkinning.opacity);
          }
        }
        ghostCtx.putImageData(ghostComposite, 0, 0);
        // Draw ghost onto main canvas
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(ghostCanvas, panX, panY, canvasWidth * zoom, canvasHeight * zoom);
      };

      // Render previous frames (red tint)
      for (let i = 1; i <= onionSkinning.before; i++) {
        const idx = activeFrameIndex - i;
        if (idx >= 0) renderGhostFrame(idx, [255, 100, 100]);
      }
      // Render next frames (blue tint)
      for (let i = 1; i <= onionSkinning.after; i++) {
        const idx = activeFrameIndex + i;
        if (idx < framesRef.current.length) renderGhostFrame(idx, [100, 100, 255]);
      }
    }

    // Shape preview overlay
    const shapeStart = shapeStartRef.current;
    if (shapeStart && shapeEnd && (tool === 'rect' || tool === 'line')) {
      renderShapePreview(ctx, tool, shapeStart, shapeEnd, zoom, panX, panY, color, rectFilled);
    }

    // Selection overlay
    if (selection) {
      renderSelectionOverlay(ctx, selection, zoom, panX, panY, selectionAnimRef.current);
    }

    // Brush outline on hover
    if ((tool === 'pencil' || tool === 'eraser') && cursorPos) {
      renderBrushOutline(ctx, cursorPos.x, cursorPos.y, brushSize, zoom, panX, panY, canvasWidth, canvasHeight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey, zoom, panX, panY, showGrid, canvasWidth, canvasHeight, layerRevision, frameRevision, shapeEnd, selection, cursorPos, tool, brushSize, onionSkinning, activeFrameIndex]);

  // ─── Selection Animation ──────────────────────────────────────────

  useEffect(() => {
    if (!selection) {
      if (selectionRafRef.current != null) {
        cancelAnimationFrame(selectionRafRef.current);
        selectionRafRef.current = null;
      }
      return;
    }
    let running = true;
    const animate = () => {
      if (!running) return;
      selectionAnimRef.current = (selectionAnimRef.current + 0.5) % 16;
      triggerRender();
      selectionRafRef.current = requestAnimationFrame(animate);
    };
    selectionRafRef.current = requestAnimationFrame(animate);
    return () => {
      running = false;
      if (selectionRafRef.current != null) cancelAnimationFrame(selectionRafRef.current);
    };
  }, [selection, triggerRender]);

  // ─── Selection Helpers ────────────────────────────────────────────

  const commitFloating = useCallback(() => {
    if (!selection?.floatingData) return;
    const layer = getActiveLayer();
    pasteRegion(layer.data, selection.floatingData, selection.x, selection.y);
    setSelection(null);
    bumpLayers();
    triggerRender();
  }, [selection, getActiveLayer, bumpLayers, triggerRender]);

  const liftSelection = useCallback(() => {
    if (!selection || selection.floatingData) return;
    const layer = getActiveLayer();
    history.push(getSnapshot());
    const extracted = extractRegion(layer.data, selection.x, selection.y, selection.w, selection.h);
    clearRegion(layer.data, selection.x, selection.y, selection.w, selection.h);
    setSelection(prev => prev ? { ...prev, floatingData: extracted } : null);
    bumpLayers();
    triggerRender();
  }, [selection, getActiveLayer, history, getSnapshot, bumpLayers, triggerRender]);

  // ─── Coordinate Helpers ─────────────────────────────────────────

  const getPixelCoord = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return displayToPixel(x, y, zoom, panX, panY, canvasWidth, canvasHeight);
  }, [zoom, panX, panY, canvasWidth, canvasHeight]);

  // Also get coord even outside canvas bounds (for selection dragging)
  const getPixelCoordUnclamped = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return {
      x: Math.floor((x - panX) / zoom),
      y: Math.floor((y - panY) / zoom),
    };
  }, [zoom, panX, panY]);

  // ─── Tool Actions ───────────────────────────────────────────────

  const applyTool = useCallback((px: number, py: number) => {
    const layer = getActiveLayer();
    const data = layer.data;
    if (px < 0 || py < 0 || px >= canvasWidth || py >= canvasHeight) return;

    switch (tool) {
      case 'pencil':
        paintBrush(data, px, py, brushSize, hexToRGBA(color));
        break;
      case 'eraser':
        paintBrush(data, px, py, brushSize, [0, 0, 0, 0]);
        break;
      case 'fill':
        floodFill(data, px, py, hexToRGBA(color));
        break;
      case 'eyedropper': {
        // Sample from composite; right-click picks secondary color
        const layers = layersRef.current;
        const comp = compositeLayers(
          layers.map(l => l.data),
          layers.map(l => l.visible),
          layers.map(l => Math.round(l.opacity * 255)),
          canvasWidth, canvasHeight
        );
        const sampled = getPixel(comp, px, py);
        if (sampled[3] > 0) {
          const hex = rgbaToHex(sampled);
          if (pointerButtonRef.current === 2) {
            setSecondaryColor(hex);
          } else {
            setColor(hex);
          }
        }
        break;
      }
    }
    triggerRender();
  }, [tool, color, brushSize, canvasWidth, canvasHeight, getActiveLayer, triggerRender]);

  const applyToolWithLine = useCallback((px: number, py: number) => {
    const last = lastPixelRef.current;
    if (last && (tool === 'pencil' || tool === 'eraser')) {
      const points = bresenhamLine(last.x, last.y, px, py);
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
    pointerPositionsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    pointerButtonRef.current = e.button;

    // Middle click, two fingers, or Space held = pan/pinch
    if (e.button === 1 || activePointersRef.current.size > 1 || spaceHeldRef.current) {
      const pointers = Array.from(pointerPositionsRef.current.values());
      if (pointers.length >= 2) {
        const [p1, p2] = pointers;
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        pinchStartDistRef.current = dist;
        pinchStartZoomRef.current = zoom;
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        panStartRef.current = { x: midX, y: midY, panX, panY };
      } else {
        panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      }
      return;
    }

    const coord = getPixelCoord(e);

    // Move tool — always drags selection (creates one if needed)
    if (tool === 'move') {
      if (coord) {
        if (!selection) {
          // No selection — select entire layer content
          history.push(getSnapshot());
          const layer = getActiveLayer();
          const allData = cloneImageData(layer.data);
          clearRegion(layer.data, 0, 0, canvasWidth, canvasHeight);
          setSelection({ x: 0, y: 0, w: canvasWidth, h: canvasHeight, floatingData: allData });
          bumpLayers();
        } else if (!selection.floatingData) {
          liftSelection();
        }
        selectionDragRef.current = {
          startX: coord.x, startY: coord.y,
          origX: selection?.x ?? 0, origY: selection?.y ?? 0,
        };
        isDrawingRef.current = true;
      }
      return;
    }

    // Selection tool
    if (tool === 'select') {
      if (selection && coord) {
        // Check if clicking inside selection (only when not holding Shift for additive)
        if (!e.shiftKey) {
          const inSel = coord.x >= selection.x && coord.x < selection.x + selection.w &&
                        coord.y >= selection.y && coord.y < selection.y + selection.h;
          if (inSel) {
            // Start dragging selection
            if (!selection.floatingData) {
              liftSelection();
            }
            selectionDragRef.current = {
              startX: coord.x, startY: coord.y,
              origX: selection.x, origY: selection.y,
            };
            isDrawingRef.current = true;
            return;
          } else {
            // Click outside — commit floating and start new selection
            commitFloating();
          }
        } else {
          // Shift held — commit floating before additive selection
          commitFloating();
        }
      }
      if (coord) {
        selectionStartRef.current = { x: coord.x, y: coord.y };
        // When Shift is held, keep the previous selection for union on pointerUp
        if (!e.shiftKey) {
          setSelection(null);
        }
        shiftSelectRef.current = e.shiftKey && selection ? { ...selection } : null;
        isDrawingRef.current = true;
      }
      return;
    }

    // Shape tools
    if (tool === 'rect' || tool === 'line') {
      if (coord) {
        history.push(getSnapshot());
        shapeStartRef.current = { x: coord.x, y: coord.y };
        setShapeEnd({ x: coord.x, y: coord.y });
        isDrawingRef.current = true;
      }
      return;
    }

    if (!coord) return;

    // Drawing tools
    history.push(getSnapshot());
    isDrawingRef.current = true;
    lastPixelRef.current = null;
    applyToolWithLine(coord.x, coord.y);
  }, [panX, panY, getPixelCoord, history, getSnapshot, applyToolWithLine, tool, selection, commitFloating, liftSelection]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerPositionsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Pinch-to-zoom + pan with two fingers
    if (panStartRef.current && activePointersRef.current.size >= 2 && pinchStartDistRef.current !== null) {
      const pointers = Array.from(pointerPositionsRef.current.values());
      if (pointers.length >= 2) {
        const [p1, p2] = pointers;
        const newDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const ratio = newDist / pinchStartDistRef.current;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(pinchStartZoomRef.current * ratio)));

        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const midX = (p1.x + p2.x) / 2 - rect.left;
          const midY = (p1.y + p2.y) / 2 - rect.top;
          // Pan: zoom-center adjustment + midpoint drift
          const startMidX = panStartRef.current.x - rect.left;
          const startMidY = panStartRef.current.y - rect.top;
          const scale = newZoom / pinchStartZoomRef.current;
          const newPanX = Math.round(midX - (startMidX - panStartRef.current.panX) * scale);
          const newPanY = Math.round(midY - (startMidY - panStartRef.current.panY) * scale);
          setZoom(newZoom);
          setPanX(newPanX);
          setPanY(newPanY);
        }
        triggerRender();
      }
      return;
    }

    // Single-pointer panning (middle click)
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

    if (!isDrawingRef.current) return;

    // Selection/Move drag
    if ((tool === 'select' || tool === 'move') && selectionDragRef.current && selection) {
      const uc = getPixelCoordUnclamped(e);
      if (uc) {
        const dx = uc.x - selectionDragRef.current.startX;
        const dy = uc.y - selectionDragRef.current.startY;
        setSelection(prev => prev ? {
          ...prev,
          x: selectionDragRef.current!.origX + dx,
          y: selectionDragRef.current!.origY + dy,
        } : null);
        triggerRender();
      }
      return;
    }

    // Selection marquee
    if (tool === 'select' && selectionStartRef.current) {
      const uc = getPixelCoordUnclamped(e);
      if (uc) {
        const sx = selectionStartRef.current.x;
        const sy = selectionStartRef.current.y;
        let x = Math.max(0, Math.min(sx, uc.x));
        let y = Math.max(0, Math.min(sy, uc.y));
        let x2 = Math.min(canvasWidth - 1, Math.max(sx, uc.x));
        let y2 = Math.min(canvasHeight - 1, Math.max(sy, uc.y));

        // Shift+select: union with previous selection
        const prev = shiftSelectRef.current;
        if (prev) {
          x = Math.min(x, prev.x);
          y = Math.min(y, prev.y);
          x2 = Math.max(x2, prev.x + prev.w - 1);
          y2 = Math.max(y2, prev.y + prev.h - 1);
        }

        setSelection({ x, y, w: x2 - x + 1, h: y2 - y + 1 });
        triggerRender();
      }
      return;
    }

    // Shape preview
    if ((tool === 'rect' || tool === 'line') && shapeStartRef.current) {
      if (coord) setShapeEnd(coord);
      return;
    }

    if (!coord) return;
    applyToolWithLine(coord.x, coord.y);
  }, [getPixelCoord, getPixelCoordUnclamped, applyToolWithLine, triggerRender, tool, selection, canvasWidth, canvasHeight]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    pointerPositionsRef.current.delete(e.pointerId);
    panStartRef.current = null;
    if (activePointersRef.current.size < 2) {
      pinchStartDistRef.current = null;
    }

    // Shape commit
    if ((tool === 'rect' || tool === 'line') && shapeStartRef.current && shapeEnd && isDrawingRef.current) {
      const layer = getActiveLayer();
      if (tool === 'rect') {
        drawRect(layer.data, shapeStartRef.current.x, shapeStartRef.current.y,
          shapeEnd.x, shapeEnd.y, hexToRGBA(color), rectFilled);
      } else {
        drawLine(layer.data, shapeStartRef.current.x, shapeStartRef.current.y,
          shapeEnd.x, shapeEnd.y, hexToRGBA(color));
      }
      shapeStartRef.current = null;
      setShapeEnd(null);
      bumpLayers();
      triggerRender();
    }

    // Drawing tools (pencil, eraser, fill) — signal layer data changed
    if (isDrawingRef.current && (tool === 'pencil' || tool === 'eraser' || tool === 'fill')) {
      bumpLayers();
    }

    // Selection/Move finish
    if (tool === 'select' || tool === 'move') {
      selectionStartRef.current = null;
      selectionDragRef.current = null;
      shiftSelectRef.current = null;
    }

    isDrawingRef.current = false;
    lastPixelRef.current = null;
  }, [tool, shapeEnd, color, rectFilled, getActiveLayer, bumpLayers, triggerRender]);

  // ─── Zoom ───────────────────────────────────────────────────────

  // Prevent wheel from scrolling the page
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => { e.preventDefault(); };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    const delta = e.deltaY > 0 ? -1 : 1;
    setZoom(z => {
      const newZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta));
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
    const prev = history.undo(getSnapshot());
    if (prev) {
      restoreSnapshot(prev);
      setSelection(null);
      triggerRender();
    }
  }, [history, getSnapshot, restoreSnapshot, triggerRender]);

  const handleRedo = useCallback(() => {
    const next = history.redo(getSnapshot());
    if (next) {
      restoreSnapshot(next);
      setSelection(null);
      triggerRender();
    }
  }, [history, getSnapshot, restoreSnapshot, triggerRender]);

  // ─── Canvas Resize ─────────────────────────────────────────────

  const handleResize = useCallback(() => {
    const w = Math.max(1, Math.min(MAX_CANVAS_SIZE, resizeW));
    const h = Math.max(1, Math.min(MAX_CANVAS_SIZE, resizeH));
    if (w === canvasWidth && h === canvasHeight) return;

    const willLose = w < canvasWidth || h < canvasHeight;
    if (willLose && !window.confirm('Shrinking the canvas will crop pixels. Continue?')) {
      return;
    }

    commitFloating();
    history.push(getSnapshot());
    // Sync current frame and resize ALL frames' layers
    framesRef.current[activeFrameIndex].layers = layersRef.current;
    for (const frame of framesRef.current) {
      for (const layer of frame.layers) {
        layer.data = resizePixelData(layer.data, w, h);
      }
    }
    layersRef.current = framesRef.current[activeFrameIndex].layers;
    setCanvasWidth(w);
    setCanvasHeight(h);
    setShowResizePanel(false);
    setSelection(null);
    bumpLayers();
    bumpFrames();
    centerCanvas(w, h);
    history.reset();
  }, [resizeW, resizeH, canvasWidth, canvasHeight, history, getSnapshot, centerCanvas, commitFloating, bumpLayers, bumpFrames, activeFrameIndex]);

  // ─── Flip ─────────────────────────────────────────────────────────

  const handleFlipH = useCallback(() => {
    history.push(getSnapshot());
    if (selection?.floatingData) {
      setSelection(prev => prev ? { ...prev, floatingData: flipHorizontal(prev.floatingData!) } : null);
    } else if (selection) {
      const layer = getActiveLayer();
      const region = extractRegion(layer.data, selection.x, selection.y, selection.w, selection.h);
      const flipped = flipHorizontal(region);
      clearRegion(layer.data, selection.x, selection.y, selection.w, selection.h);
      pasteRegion(layer.data, flipped, selection.x, selection.y);
    } else {
      const layer = getActiveLayer();
      layer.data = flipHorizontal(layer.data);
    }
    bumpLayers();
    triggerRender();
  }, [history, getSnapshot, selection, getActiveLayer, bumpLayers, triggerRender]);

  const handleFlipV = useCallback(() => {
    history.push(getSnapshot());
    if (selection?.floatingData) {
      setSelection(prev => prev ? { ...prev, floatingData: flipVertical(prev.floatingData!) } : null);
    } else if (selection) {
      const layer = getActiveLayer();
      const region = extractRegion(layer.data, selection.x, selection.y, selection.w, selection.h);
      const flipped = flipVertical(region);
      clearRegion(layer.data, selection.x, selection.y, selection.w, selection.h);
      pasteRegion(layer.data, flipped, selection.x, selection.y);
    } else {
      const layer = getActiveLayer();
      layer.data = flipVertical(layer.data);
    }
    bumpLayers();
    triggerRender();
  }, [history, getSnapshot, selection, getActiveLayer, bumpLayers, triggerRender]);

  // ─── Layer Operations ─────────────────────────────────────────────

  const addLayer = useCallback(() => {
    history.push(getSnapshot());
    const newLayer: LayerState = {
      id: genLayerId(),
      name: `Layer ${layersRef.current.length + 1}`,
      visible: true,
      opacity: 1,
      data: createBlankImageData(canvasWidth, canvasHeight),
    };
    layersRef.current.push(newLayer);
    setActiveLayerIndex(layersRef.current.length - 1);
    bumpLayers();
  }, [canvasWidth, canvasHeight, history, getSnapshot, bumpLayers]);

  const deleteLayer = useCallback((idx: number) => {
    if (layersRef.current.length <= 1) return;
    history.push(getSnapshot());
    layersRef.current.splice(idx, 1);
    setActiveLayerIndex(i => Math.min(i, layersRef.current.length - 1));
    bumpLayers();
    triggerRender();
  }, [history, getSnapshot, bumpLayers, triggerRender]);

  const moveLayer = useCallback((idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= layersRef.current.length) return;
    history.push(getSnapshot());
    const tmp = layersRef.current[idx];
    layersRef.current[idx] = layersRef.current[newIdx];
    layersRef.current[newIdx] = tmp;
    setActiveLayerIndex(newIdx);
    bumpLayers();
    triggerRender();
  }, [history, getSnapshot, bumpLayers, triggerRender]);

  // Drag-and-drop layer reordering
  const handleLayerDragStart = useCallback((idx: number) => {
    setDragLayerIdx(idx);
  }, []);

  const handleLayerDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverLayerIdx(idx);
  }, []);

  const handleLayerDrop = useCallback((targetIdx: number) => {
    if (dragLayerIdx === null || dragLayerIdx === targetIdx) {
      setDragLayerIdx(null);
      setDragOverLayerIdx(null);
      return;
    }
    history.push(getSnapshot());
    const layers = layersRef.current;
    const [dragged] = layers.splice(dragLayerIdx, 1);
    layers.splice(targetIdx, 0, dragged);
    // Update active layer index to follow the dragged layer
    setActiveLayerIndex(targetIdx);
    setDragLayerIdx(null);
    setDragOverLayerIdx(null);
    bumpLayers();
    triggerRender();
  }, [dragLayerIdx, history, getSnapshot, bumpLayers, triggerRender]);

  const handleLayerDragEnd = useCallback(() => {
    setDragLayerIdx(null);
    setDragOverLayerIdx(null);
  }, []);

  const toggleLayerVisibility = useCallback((idx: number) => {
    layersRef.current[idx].visible = !layersRef.current[idx].visible;
    bumpLayers();
    triggerRender();
  }, [bumpLayers, triggerRender]);

  const setLayerOpacity = useCallback((idx: number, opacity: number) => {
    layersRef.current[idx].opacity = Math.max(0, Math.min(1, opacity));
    bumpLayers();
    triggerRender();
  }, [bumpLayers, triggerRender]);

  const renameLayer = useCallback((idx: number, name: string) => {
    layersRef.current[idx].name = name || `Layer ${idx + 1}`;
    bumpLayers();
  }, [bumpLayers]);

  // ─── Frame Operations (Animation) ────────────────────────────────

  /** Sync layersRef back into the active frame before switching. */
  const syncCurrentFrame = useCallback(() => {
    framesRef.current[activeFrameIndex].layers = layersRef.current;
  }, [activeFrameIndex]);

  const switchFrame = useCallback((newIndex: number) => {
    if (newIndex === activeFrameIndex || newIndex < 0 || newIndex >= framesRef.current.length) return;
    commitFloating();
    // Save current frame's layers
    syncCurrentFrame();
    // Switch to new frame
    layersRef.current = framesRef.current[newIndex].layers;
    setActiveFrameIndex(newIndex);
    setActiveLayerIndex(Math.min(activeLayerIndex, framesRef.current[newIndex].layers.length - 1));
    bumpLayers();
    bumpFrames();
    triggerRender();
  }, [activeFrameIndex, activeLayerIndex, commitFloating, syncCurrentFrame, bumpLayers, bumpFrames, triggerRender]);

  const addFrame = useCallback(() => {
    commitFloating();
    syncCurrentFrame();
    const newFrame: FrameData = {
      id: genFrameId(),
      layers: [{
        id: genLayerId(),
        name: 'Background',
        visible: true,
        opacity: 1,
        data: createBlankImageData(canvasWidth, canvasHeight),
      }],
    };
    const insertIdx = activeFrameIndex + 1;
    framesRef.current.splice(insertIdx, 0, newFrame);
    layersRef.current = newFrame.layers;
    setActiveFrameIndex(insertIdx);
    setActiveLayerIndex(0);
    bumpLayers();
    bumpFrames();
    triggerRender();
    markDirty();
  }, [activeFrameIndex, canvasWidth, canvasHeight, commitFloating, syncCurrentFrame, bumpLayers, bumpFrames, triggerRender, markDirty]);

  const duplicateFrame = useCallback((sourceIdx: number) => {
    commitFloating();
    syncCurrentFrame();
    const source = framesRef.current[sourceIdx];
    const clonedLayers: LayerState[] = source.layers.map(l => ({
      id: genLayerId(),
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      data: cloneImageData(l.data),
    }));
    const newFrame: FrameData = {
      id: genFrameId(),
      layers: clonedLayers,
      duration: source.duration,
    };
    const insertIdx = sourceIdx + 1;
    framesRef.current.splice(insertIdx, 0, newFrame);
    layersRef.current = newFrame.layers;
    setActiveFrameIndex(insertIdx);
    setActiveLayerIndex(0);
    bumpLayers();
    bumpFrames();
    triggerRender();
    markDirty();
  }, [commitFloating, syncCurrentFrame, bumpLayers, bumpFrames, triggerRender, markDirty]);

  const deleteFrame = useCallback((idx: number) => {
    if (framesRef.current.length <= 1) return;
    commitFloating();
    syncCurrentFrame();
    framesRef.current.splice(idx, 1);
    const newActiveIdx = Math.min(activeFrameIndex, framesRef.current.length - 1);
    layersRef.current = framesRef.current[newActiveIdx].layers;
    setActiveFrameIndex(newActiveIdx);
    setActiveLayerIndex(Math.min(activeLayerIndex, layersRef.current.length - 1));
    bumpLayers();
    bumpFrames();
    triggerRender();
    markDirty();
  }, [activeFrameIndex, activeLayerIndex, commitFloating, syncCurrentFrame, bumpLayers, bumpFrames, triggerRender, markDirty]);

  const reorderFrame = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    syncCurrentFrame();
    const [moved] = framesRef.current.splice(fromIdx, 1);
    framesRef.current.splice(toIdx, 0, moved);
    // Track active frame
    let newActiveIdx = activeFrameIndex;
    if (fromIdx === activeFrameIndex) {
      newActiveIdx = toIdx;
    } else if (fromIdx < activeFrameIndex && toIdx >= activeFrameIndex) {
      newActiveIdx = activeFrameIndex - 1;
    } else if (fromIdx > activeFrameIndex && toIdx <= activeFrameIndex) {
      newActiveIdx = activeFrameIndex + 1;
    }
    layersRef.current = framesRef.current[newActiveIdx].layers;
    setActiveFrameIndex(newActiveIdx);
    bumpFrames();
    markDirty();
  }, [activeFrameIndex, syncCurrentFrame, bumpFrames, markDirty]);

  const handleAnimPlayPause = useCallback(() => {
    setIsAnimPlaying(p => !p);
  }, []);

  const handleAnimFrameChange = useCallback((idx: number) => {
    // Sync from preview playback
    if (idx !== activeFrameIndex) {
      switchFrame(idx);
    }
  }, [activeFrameIndex, switchFrame]);

  // Frame thumbnails for timeline
  const frameInfos = useMemo(() => {
    // Sync current frame before computing thumbnails
    framesRef.current[activeFrameIndex].layers = layersRef.current;
    return framesRef.current.map(frame => ({
      id: frame.id,
      thumbnail: generateFrameThumbnail(
        frame.layers.map(l => l.data),
        frame.layers.map(l => l.visible),
        frame.layers.map(l => Math.round(l.opacity * 255)),
        canvasWidth, canvasHeight,
      ),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameRevision, layerRevision, canvasWidth, canvasHeight, activeFrameIndex]);

  // Composited frame data URLs for animation preview
  const frameCompositeUrls = useMemo(() => {
    framesRef.current[activeFrameIndex].layers = layersRef.current;
    return framesRef.current.map(frame => {
      const composite = compositeLayers(
        frame.layers.map(l => l.data),
        frame.layers.map(l => l.visible),
        frame.layers.map(l => Math.round(l.opacity * 255)),
        canvasWidth, canvasHeight,
      );
      return pixelDataToBase64(composite);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameRevision, layerRevision, canvasWidth, canvasHeight, activeFrameIndex]);

  // ─── Apply / Save ──────────────────────────────────────────────

  const getComposite = useCallback((): ImageData => {
    const layers = layersRef.current;
    return compositeLayers(
      layers.map(l => l.data),
      layers.map(l => l.visible),
      layers.map(l => Math.round(l.opacity * 255)),
      canvasWidth, canvasHeight
    );
  }, [canvasWidth, canvasHeight]);

  const handleApply = useCallback(() => {
    commitFloating();
    const base64 = pixelDataToBase64(getComposite());
    onApply(base64);
  }, [onApply, getComposite, commitFloating]);

  const doSave = useCallback(async (pngPath: string, projPath: string) => {
    commitFloating();
    setSaving(true);
    try {
      const base64 = pixelDataToBase64(getComposite());
      const project = buildCurrentProject();
      const projectJson = serializeProject(project);
      const projectBase64 = 'data:application/json;base64,' + btoa(projectJson);

      const pngResult = await uploadMediaDataUrlToPath(base64, pngPath);
      if (!pngResult) {
        toast.error('Failed to upload image');
        return;
      }
      const projectResult = await uploadMediaDataUrlToPath(projectBase64, projPath);

      setCurrentPngPath(pngPath);
      setCurrentProjectPath(projPath);
      if (projectResult?.url) {
        setCurrentProjectUrl(projectResult.url);
        onProjectUrlChange?.(projectResult.url);
      }
      onApply(pngResult.url, projectResult?.url);
      clearPixelAutoSave();
      dirtyRef.current = false;
      onMetadataChange?.({ projectName, dirty: false });
      toast.success(`Saved "${projectName}"`);
    } catch (err) {
      console.error('Cloud save failed:', err);
      toast.error('Cloud save failed');
    } finally {
      setSaving(false);
    }
  }, [getComposite, buildCurrentProject, commitFloating, projectName, onApply, onProjectUrlChange]);

  const handleSave = useCallback(async () => {
    if (currentPngPath && currentProjectPath) {
      // Overwrite existing files
      await doSave(currentPngPath, currentProjectPath);
    } else {
      // No existing paths — generate new ones (same as Save As)
      const safeName = projectName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').toLowerCase() || 'untitled';
      const ts = Date.now();
      const pngPath = `pixel-art/${safeName}/${ts}-${safeName}.png`;
      const projPath = `pixel-art/${safeName}/${ts}-${safeName}.png.project`;
      await doSave(pngPath, projPath);
    }
  }, [currentPngPath, currentProjectPath, projectName, doSave]);

  const handleSaveAs = useCallback(async () => {
    const newName = window.prompt('Save project as:', projectName);
    if (!newName) return;
    setProjectName(newName);
    const safeName = newName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').toLowerCase() || 'untitled';
    const ts = Date.now();
    const pngPath = `pixel-art/${safeName}/${ts}-${safeName}.png`;
    const projPath = `pixel-art/${safeName}/${ts}-${safeName}.png.project`;
    await doSave(pngPath, projPath);
  }, [projectName, doSave]);

  // ─── Export Sprite Sheet ─────────────────────────────────────────

  const handleExportSpriteSheet = useCallback(async () => {
    if (framesRef.current.length <= 1) {
      toast.info('Need 2+ frames to export a sprite sheet');
      return;
    }
    commitFloating();
    syncCurrentFrame();
    setSaving(true);
    try {
      const frameLayers = framesRef.current.map(f => ({
        data: f.layers.map(l => l.data),
        visibilities: f.layers.map(l => l.visible),
        opacities: f.layers.map(l => Math.round(l.opacity * 255)),
      }));
      const sheetData = compositeFramesToSpriteSheet(frameLayers, canvasWidth, canvasHeight);
      const sheetBase64 = pixelDataToBase64(sheetData);

      const safeName = projectName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').toLowerCase() || 'untitled';
      const ts = Date.now();
      const sheetPath = `pixel-art/${safeName}/${ts}-${safeName}-spritesheet.png`;
      const result = await uploadMediaDataUrlToPath(sheetBase64, sheetPath);
      if (result?.url) {
        // Copy SpriteSheetConfig metadata to clipboard
        const config = {
          imageUrl: result.url,
          frameWidth: canvasWidth,
          frameHeight: canvasHeight,
          frameCount: framesRef.current.length,
          frameDuration: Math.round(1000 / animFrameRate),
        };
        try {
          await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
          toast.success(`Sprite sheet exported! Config copied to clipboard.`);
        } catch {
          toast.success(`Sprite sheet exported to ${result.url}`);
        }
      } else {
        toast.error('Failed to upload sprite sheet');
      }
    } catch (err) {
      console.error('Sprite sheet export failed:', err);
      toast.error('Sprite sheet export failed');
    } finally {
      setSaving(false);
    }
  }, [commitFloating, syncCurrentFrame, canvasWidth, canvasHeight, projectName, animFrameRate]);

  // ─── Clipboard (Selection) ────────────────────────────────────────

  const handleCopy = useCallback(() => {
    if (!selection) return;
    if (selection.floatingData) {
      setGlobalClipboard(selection.floatingData);
    } else {
      setGlobalClipboard(extractRegion(getActiveLayer().data, selection.x, selection.y, selection.w, selection.h));
    }
    toast.success('Copied to clipboard');
  }, [selection, getActiveLayer]);

  const handleCut = useCallback(() => {
    if (!selection) return;
    handleCopy();
    history.push(getSnapshot());
    if (selection.floatingData) {
      // Just remove the floating data
      setSelection(null);
    } else {
      clearRegion(getActiveLayer().data, selection.x, selection.y, selection.w, selection.h);
      setSelection(null);
    }
    bumpLayers();
    triggerRender();
  }, [selection, handleCopy, history, getSnapshot, getActiveLayer, bumpLayers, triggerRender]);

  const handlePaste = useCallback(() => {
    const pastedData = getGlobalClipboard();
    if (!pastedData) return;
    commitFloating();
    history.push(getSnapshot());
    setSelection({
      x: 0, y: 0,
      w: pastedData.width, h: pastedData.height,
      floatingData: pastedData,
    });
    triggerRender();
  }, [commitFloating, history, getSnapshot, triggerRender]);

  const handleDeleteSelection = useCallback(() => {
    if (!selection) return;
    history.push(getSnapshot());
    if (selection.floatingData) {
      setSelection(null);
    } else {
      clearRegion(getActiveLayer().data, selection.x, selection.y, selection.w, selection.h);
      setSelection(null);
    }
    bumpLayers();
    triggerRender();
  }, [selection, history, getSnapshot, getActiveLayer, bumpLayers, triggerRender]);

  // ─── Tool Switching Helper ────────────────────────────────────────

  const switchTool = useCallback((newTool: Tool) => {
    if ((tool === 'select' || tool === 'move') && newTool !== 'select' && newTool !== 'move') {
      commitFloating();
    }
    setTool(newTool);
  }, [tool, commitFloating]);

  const swapColors = useCallback(() => {
    setColor(prev => {
      setSecondaryColor(prev);
      return secondaryColor;
    });
  }, [secondaryColor]);

  // ─── Keyboard Shortcuts ─────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (ctrl && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (ctrl && e.key === 'c') {
        if (selection) { e.preventDefault(); handleCopy(); }
      } else if (ctrl && e.key === 'x') {
        if (selection) { e.preventDefault(); handleCut(); }
      } else if (ctrl && e.key === 'v') {
        if (hasGlobalClipboard()) { e.preventDefault(); handlePaste(); }
      } else if (ctrl && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateFrame(activeFrameIndex);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection) { e.preventDefault(); handleDeleteSelection(); }
      } else if (e.key === 'Escape') {
        if (showShortcuts) {
          e.preventDefault();
          setShowShortcuts(false);
        } else if (selection) {
          e.preventDefault();
          commitFloating();
          setSelection(null);
        }
      } else if (!ctrl) {
        switch (e.key.toLowerCase()) {
          case 'b': switchTool('pencil'); break;
          case 'e': switchTool('eraser'); break;
          case 'g': switchTool('fill'); break;
          case 'i': switchTool('eyedropper'); break;
          case 's': switchTool('select'); break;
          case 'm': switchTool('move'); break;
          case 'r': switchTool('rect'); break;
          case 'l': switchTool('line'); break;
          case '=': case '+': zoomIn(); break;
          case '-': zoomOut(); break;
          case '[': setBrushSize(s => Math.max(1, s - 1)); break;
          case ']': setBrushSize(s => Math.min(16, s + 1)); break;
          case ',': case '<':
            // Previous frame
            if (framesRef.current.length > 1) {
              switchFrame(Math.max(0, activeFrameIndex - 1));
            }
            break;
          case '.': case '>':
            // Next frame
            if (framesRef.current.length > 1) {
              switchFrame(Math.min(framesRef.current.length - 1, activeFrameIndex + 1));
            }
            break;
          case 'x': swapColors(); break;
          case 'c': setShowPalette(s => !s); break;
        }
        if (e.key === '?') {
          setShowShortcuts(s => !s);
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleUndo, handleRedo, handleCopy, handleCut, handlePaste, handleDeleteSelection, commitFloating, selection, zoomIn, zoomOut, switchTool, showShortcuts, switchFrame, duplicateFrame, activeFrameIndex, swapColors]);

  // ─── Tool Hold (Spring-loaded Tools) ───────────────────────────
  // Hold Alt → eyedropper, hold Space → pan. Release snaps back.

  useEffect(() => {
    const handleHoldDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Space → pan mode (handled via spaceHeldRef, not tool switch)
      if (e.key === ' ' && !spaceHeldRef.current) {
        e.preventDefault();
        spaceHeldRef.current = true;
        setSpaceHeld(true);
        return;
      }

      // Alt → eyedropper
      if (e.key === 'Alt' && !heldToolRef.current) {
        e.preventDefault();
        preHoldToolRef.current = tool;
        heldToolRef.current = 'eyedropper';
        setTool('eyedropper');
      }
    };

    const handleHoldUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spaceHeldRef.current = false;
        setSpaceHeld(false);
        return;
      }

      if (e.key === 'Alt' && heldToolRef.current === 'eyedropper') {
        e.preventDefault();
        setTool(preHoldToolRef.current);
        heldToolRef.current = null;
      }
    };

    // Release all holds on window blur (e.g., Alt+Tab)
    const handleBlur = () => {
      spaceHeldRef.current = false;
      setSpaceHeld(false);
      if (heldToolRef.current) {
        setTool(preHoldToolRef.current);
        heldToolRef.current = null;
      }
    };

    window.addEventListener('keydown', handleHoldDown);
    window.addEventListener('keyup', handleHoldUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleHoldDown);
      window.removeEventListener('keyup', handleHoldUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [tool]);

  // ─── Tool Config ────────────────────────────────────────────────

  const toolIconMap: Record<string, keyof ThemeAssets> = {
    pencil: 'iconPixelPencil' as keyof ThemeAssets,
    eraser: 'iconPixelEraser' as keyof ThemeAssets,
    fill: 'iconPixelFill' as keyof ThemeAssets,
    eyedropper: 'iconPixelEyedropper' as keyof ThemeAssets,
    select: 'iconPixelSelect' as keyof ThemeAssets,
    move: 'iconPixelMove' as keyof ThemeAssets,
    rect: 'iconPixelRect' as keyof ThemeAssets,
    line: 'iconPixelLine' as keyof ThemeAssets,
  };

  const tools: { id: Tool; label: string; icon: string; key: string }[] = [
    { id: 'pencil', label: 'Pencil', icon: '✏️', key: 'B' },
    { id: 'eraser', label: 'Eraser', icon: '◻', key: 'E' },
    { id: 'fill', label: 'Fill', icon: '🪣', key: 'G' },
    { id: 'eyedropper', label: 'Eyedropper', icon: '💧', key: 'I' },
    { id: 'select', label: 'Select', icon: '⬚', key: 'S' },
    { id: 'move', label: 'Move', icon: '✥', key: 'M' },
    { id: 'rect', label: 'Rectangle', icon: '▭', key: 'R' },
    { id: 'line', label: 'Line', icon: '╱', key: 'L' },
  ];

  const renderToolIcon = (t: { id: Tool; icon: string }) => {
    const themeKey = toolIconMap[t.id];
    const customIcon = themeKey ? themeAssets[themeKey] as string | undefined : undefined;
    if (customIcon) {
      return <img src={customIcon} alt={t.id} className="w-5 h-5" style={{ imageRendering: 'pixelated' }} />;
    }
    return <span>{t.icon}</span>;
  };

  // ─── Render: Vertical Tool Strip (desktop) ──────────────────────

  const verticalToolbar = (
    <div className="w-10 bg-stone-900 border-r border-stone-700 flex flex-col items-center py-1.5 gap-0.5 flex-shrink-0">
      {tools.map(t => (
        <button
          key={t.id}
          onClick={() => switchTool(t.id)}
          title={`${t.label} (${t.key})`}
          className={`w-8 h-8 rounded flex items-center justify-center text-sm transition-colors ${
            tool === t.id
              ? 'bg-arcane-600 text-parchment-100'
              : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
          }`}
        >
          {renderToolIcon(t)}
        </button>
      ))}
      {/* Rect filled toggle */}
      {tool === 'rect' && (
        <button
          onClick={() => setRectFilled(f => !f)}
          title={rectFilled ? 'Filled' : 'Outline'}
          className="w-8 h-8 rounded flex items-center justify-center text-xs bg-stone-800 hover:bg-stone-700 text-stone-300"
        >
          {rectFilled ? '■' : '□'}
        </button>
      )}
      {/* Brush size (pencil/eraser) */}
      {(tool === 'pencil' || tool === 'eraser') && (
        <>
          <div className="w-6 h-px bg-stone-700 my-0.5" />
          <button
            onClick={() => setBrushSize(s => Math.max(1, s - 1))}
            className="w-8 h-6 rounded text-xs bg-stone-800 hover:bg-stone-700"
            title="Decrease brush size ([)"
          >-</button>
          <span className="text-[10px] text-stone-400">{brushSize}</span>
          <button
            onClick={() => setBrushSize(s => Math.min(16, s + 1))}
            className="w-8 h-6 rounded text-xs bg-stone-800 hover:bg-stone-700"
            title="Increase brush size (])"
          >+</button>
        </>
      )}
    </div>
  );

  // ─── Render: Action Bar (desktop, horizontal above canvas) ─────

  const actionBar = (
    <>
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
      <button onClick={handleFlipH} title="Flip Horizontal" className="px-2 py-1.5 rounded text-sm bg-stone-700 hover:bg-stone-600 text-stone-300">⇔</button>
      <button onClick={handleFlipV} title="Flip Vertical" className="px-2 py-1.5 rounded text-sm bg-stone-700 hover:bg-stone-600 text-stone-300">⇕</button>
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
      <div className="w-px bg-stone-600 mx-1" />
      <button
        onClick={() => setShowShortcuts(s => !s)}
        title="Keyboard Shortcuts (?)"
        className="px-2 py-1.5 rounded text-sm bg-stone-700 hover:bg-stone-600 text-stone-400"
      >
        {'\u2328'} ?
      </button>
    </>
  );

  // ─── Render: Mobile Toolbar (horizontal, all controls) ─────────

  const mobileToolbar = (
    <>
      {tools.map(t => (
        <button
          key={t.id}
          onClick={() => switchTool(t.id)}
          title={`${t.label} (${t.key})`}
          className={`px-2 py-1.5 rounded text-sm transition-colors ${
            tool === t.id
              ? 'bg-arcane-600 text-parchment-100'
              : 'bg-stone-700 hover:bg-stone-600 text-stone-300'
          }`}
        >
          {renderToolIcon(t)}
        </button>
      ))}
      {tool === 'rect' && (
        <button
          onClick={() => setRectFilled(f => !f)}
          title={rectFilled ? 'Filled' : 'Outline'}
          className="px-2 py-1.5 rounded text-xs bg-stone-700 hover:bg-stone-600 text-stone-300"
        >
          {rectFilled ? '■' : '□'}
        </button>
      )}
      <div className="w-px bg-stone-600 mx-1" />
      {(tool === 'pencil' || tool === 'eraser') && (
        <>
          <button
            onClick={() => setBrushSize(s => Math.max(1, s - 1))}
            className="px-1.5 py-1 rounded text-xs bg-stone-700 hover:bg-stone-600"
            title="Decrease brush size ([)"
          >-</button>
          <span className="text-xs text-stone-400 self-center min-w-[1.5rem] text-center">{brushSize}</span>
          <button
            onClick={() => setBrushSize(s => Math.min(16, s + 1))}
            className="px-1.5 py-1 rounded text-xs bg-stone-700 hover:bg-stone-600"
            title="Increase brush size (])"
          >+</button>
          <div className="w-px bg-stone-600 mx-1" />
        </>
      )}
      <button
        onClick={handleUndo}
        disabled={!history.canUndo}
        title="Undo"
        className="px-2 py-1.5 rounded text-sm bg-stone-700 hover:bg-stone-600 disabled:opacity-30 disabled:cursor-not-allowed"
      >↩</button>
      <button
        onClick={handleRedo}
        disabled={!history.canRedo}
        title="Redo"
        className="px-2 py-1.5 rounded text-sm bg-stone-700 hover:bg-stone-600 disabled:opacity-30 disabled:cursor-not-allowed"
      >↪</button>
    </>
  );

  // ─── Render: Open Project Modal ──────────────────────────────────

  const handleOpenProject = useCallback(async (projectUrl: string, projectPath: string, pngPath: string | null, projectName: string) => {
    const ok = await loadProjectFromUrl(projectUrl);
    if (ok) {
      setCurrentProjectPath(projectPath);
      if (pngPath) setCurrentPngPath(pngPath);
      setProjectName(projectName);
      toast.success('Project loaded!');
    }
  }, [loadProjectFromUrl]);

  const handleImportPng = useCallback((imageData: ImageData, width: number, height: number) => {
    layersRef.current = [{
      id: genLayerId(), name: 'Background', visible: true, opacity: 1, data: imageData,
    }];
    setCanvasWidth(width);
    setCanvasHeight(height);
    setResizeW(width);
    setResizeH(height);
    setCurrentPngPath(null);
    setCurrentProjectPath(null);
    setCurrentProjectUrl(null);
    setSelection(null);
    setActiveLayerIndex(0);
    history.reset();
    bumpLayers();
    centerCanvas(width, height);
    triggerRender();
    toast.success('PNG imported!');
  }, [bumpLayers, centerCanvas, triggerRender, history]);

  const openModal = (
    <PixelEditorOpenModal
      isOpen={showOpenModal}
      onClose={() => setShowOpenModal(false)}
      onSelectProject={handleOpenProject}
      onImportPng={handleImportPng}
    />
  );

  // ─── Render: Shortcuts Modal ──────────────────────────────────────

  const shortcutsModal = showShortcuts ? (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={() => setShowShortcuts(false)}
    >
      <div
        className="bg-stone-800 border border-stone-600 rounded-lg shadow-xl max-w-md w-full p-5 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-parchment-100">Keyboard Shortcuts</h2>
          <button
            onClick={() => setShowShortcuts(false)}
            className="text-stone-400 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center"
          >
            {'\u00D7'}
          </button>
        </div>
        <div className="space-y-4 text-sm">
          {/* Tools */}
          <div>
            <h3 className="text-xs font-bold text-stone-400 uppercase mb-2">Tools</h3>
            <div className="space-y-1.5">
              {[
                ['B', 'Pencil'],
                ['E', 'Eraser'],
                ['G', 'Fill'],
                ['I', 'Eyedropper'],
                ['S', 'Select'],
                ['M', 'Move'],
                ['R', 'Rectangle'],
                ['L', 'Line'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center gap-3">
                  <kbd className="bg-stone-700 border border-stone-600 rounded px-2 py-0.5 text-xs font-mono min-w-[28px] text-center">{key}</kbd>
                  <span className="text-parchment-200">{label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Actions */}
          <div>
            <h3 className="text-xs font-bold text-stone-400 uppercase mb-2">Actions</h3>
            <div className="space-y-1.5">
              {[
                ['Ctrl+Z', 'Undo'],
                ['Ctrl+Y', 'Redo'],
                ['Ctrl+C', 'Copy selection'],
                ['Ctrl+X', 'Cut selection'],
                ['Ctrl+V', 'Paste'],
                ['Shift+drag', 'Add to selection'],
                ['Del', 'Delete selection'],
                ['Esc', 'Deselect / commit'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center gap-3">
                  <kbd className="bg-stone-700 border border-stone-600 rounded px-2 py-0.5 text-xs font-mono min-w-[28px] text-center">{key}</kbd>
                  <span className="text-parchment-200">{label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* View & Brush */}
          <div>
            <h3 className="text-xs font-bold text-stone-400 uppercase mb-2">View &amp; Brush</h3>
            <div className="space-y-1.5">
              {[
                ['+ / -', 'Zoom in / out'],
                ['Scroll', 'Zoom at cursor'],
                ['[ / ]', 'Brush size'],
                ['X', 'Swap primary/secondary color'],
                ['C', 'Toggle color palette'],
                ['Hold Space', 'Pan canvas (drag)'],
                ['Hold Alt', 'Eyedropper (temporary)'],
                ['Middle drag', 'Pan canvas'],
                ['?', 'This reference'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center gap-3">
                  <kbd className="bg-stone-700 border border-stone-600 rounded px-2 py-0.5 text-xs font-mono min-w-[28px] text-center">{key}</kbd>
                  <span className="text-parchment-200">{label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Animation */}
          <div>
            <h3 className="text-xs font-bold text-stone-400 uppercase mb-2">Animation</h3>
            <div className="space-y-1.5">
              {[
                ['< / ,', 'Previous frame'],
                ['> / .', 'Next frame'],
                ['Ctrl+Shift+D', 'Duplicate frame'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center gap-3">
                  <kbd className="bg-stone-700 border border-stone-600 rounded px-2 py-0.5 text-xs font-mono min-w-[28px] text-center">{key}</kbd>
                  <span className="text-parchment-200">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // ─── Render: Color Palette ────────────────────────────────────────

  const colorPalette = (
    <div>
      {/* Primary/Secondary color swatches + toggle */}
      <div className="flex items-center gap-3 mb-2">
        {/* Stacked color swatches (Photoshop-style) */}
        <div className="relative w-10 h-10 flex-shrink-0">
          {/* Secondary (background) — behind, offset */}
          <div
            className="absolute bottom-0 right-0 w-7 h-7 rounded border border-stone-500 cursor-pointer"
            style={{ backgroundColor: secondaryColor }}
            onClick={() => { setColor(secondaryColor); setSecondaryColor(color); }}
            title={`Secondary: ${secondaryColor}`}
          />
          {/* Primary (foreground) — front, top-left */}
          <div
            className="absolute top-0 left-0 w-7 h-7 rounded border-2 border-white cursor-pointer z-10"
            style={{ backgroundColor: color }}
            title={`Primary: ${color}`}
          />
          {/* Swap arrow */}
          <button
            onClick={swapColors}
            className="absolute top-0 right-0 w-4 h-4 bg-stone-700 hover:bg-stone-600 rounded-sm flex items-center justify-center text-[9px] text-stone-300 z-20"
            title="Swap colors (X)"
          >
            ⇄
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-stone-500 font-mono">{color}</span>
          <span className="text-[10px] text-stone-600 font-mono">{secondaryColor}</span>
        </div>
        <button
          onClick={() => setShowPalette(s => !s)}
          className={`ml-auto px-1.5 py-0.5 rounded text-xs transition-colors ${
            showPalette ? 'bg-arcane-600 text-parchment-100' : 'bg-stone-700 hover:bg-stone-600 text-stone-400'
          }`}
          title="Toggle palette (C)"
        >
          {showPalette ? '▼' : '▶'} Palette
        </button>
      </div>
      {/* Expanded palette */}
      {showPalette && (
        <div>
          {/* Color picker + hex + add */}
          <div className="flex items-center gap-2 mb-1.5">
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer bg-transparent"
            />
            <button
              onClick={() => {
                if (!customColors.includes(color)) {
                  setCustomColors(prev => [...prev, color]);
                }
              }}
              title="Save color to palette"
              className="px-1.5 py-0.5 rounded text-xs bg-stone-700 hover:bg-stone-600"
            >
              + Save
            </button>
          </div>
          {/* Default palette */}
          <div className="grid grid-cols-8 gap-0.5">
            {PALETTE.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                onContextMenu={(e) => { e.preventDefault(); setSecondaryColor(c); }}
                className={`w-6 h-6 rounded-sm border ${
                  color === c ? 'border-white border-2' : secondaryColor === c ? 'border-arcane-400 border-2' : 'border-stone-600'
                }`}
                style={{ backgroundColor: c }}
                title={`${c} (right-click: secondary)`}
              />
            ))}
          </div>
          {/* Custom colors */}
          {customColors.length > 0 && (
            <div className="mt-1">
              <div className="text-xs text-stone-500 mb-0.5">Custom</div>
              <div className="grid grid-cols-8 gap-0.5">
                {customColors.map((c, i) => (
                  <button
                    key={`${c}-${i}`}
                    onClick={() => setColor(c)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (e.shiftKey) {
                        setCustomColors(prev => prev.filter((_, j) => j !== i));
                      } else {
                        setSecondaryColor(c);
                      }
                    }}
                    className={`w-6 h-6 rounded-sm border ${
                      color === c ? 'border-white border-2' : secondaryColor === c ? 'border-arcane-400 border-2' : 'border-stone-600'
                    }`}
                    style={{ backgroundColor: c }}
                    title={`${c} (right-click: secondary, Shift+right-click: remove)`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ─── Render: Canvas Size Controls ─────────────────────────────────

  const canvasSizeControls = (
    <div>
      <button
        onClick={() => { setShowResizePanel(p => !p); setResizeW(canvasWidth); setResizeH(canvasHeight); }}
        className="text-xs text-stone-400 hover:text-stone-300"
      >
        Canvas: {canvasWidth}x{canvasHeight} {showResizePanel ? '▼' : '▶'}
      </button>
      {showResizePanel && (
        <div className="flex items-center gap-2 mt-1 flex-wrap">
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

  // ─── Render: Layer Panel ──────────────────────────────────────────

  const layerPanel = (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-stone-300">Layers</span>
        <button
          onClick={addLayer}
          title="Add Layer"
          className="px-1.5 py-0.5 rounded text-xs bg-arcane-700 hover:bg-arcane-600"
        >
          + Add
        </button>
      </div>
      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {/* Render top-to-bottom (last layer = frontmost) */}
        {[...layersRef.current].reverse().map((layer, revIdx) => {
          const idx = layersRef.current.length - 1 - revIdx;
          const isActive = idx === activeLayerIndex;
          const isExpanded = expandedLayerId === layer.id;
          const isDragging = dragLayerIdx === idx;
          const isDragOver = dragOverLayerIdx === idx && dragLayerIdx !== idx;
          return (
            <div
              key={layer.id}
              className={`rounded overflow-hidden transition-opacity ${isDragging ? 'opacity-40' : ''}`}
              draggable
              onDragStart={() => handleLayerDragStart(idx)}
              onDragOver={(e) => handleLayerDragOver(e, idx)}
              onDrop={() => handleLayerDrop(idx)}
              onDragEnd={handleLayerDragEnd}
            >
              {/* Primary row: drag handle, visibility, name, expand toggle */}
              <div
                onClick={() => {
                  if (activeLayerIndex !== idx && selection) commitFloating();
                  setActiveLayerIndex(idx);
                }}
                className={`flex items-center gap-1 px-1 py-1 text-xs cursor-pointer ${
                  isActive ? 'bg-arcane-700 text-parchment-100' : 'bg-stone-800 hover:bg-stone-750 text-stone-300'
                } ${isDragOver ? 'ring-1 ring-arcane-400 ring-inset' : ''}`}
              >
                {/* Drag handle */}
                <span
                  className="flex-shrink-0 cursor-grab active:cursor-grabbing text-stone-500 hover:text-stone-300 select-none px-0.5"
                  title="Drag to reorder"
                >
                  ⠿
                </span>
                {/* Visibility toggle */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(idx); }}
                  className={`w-4 text-center flex-shrink-0 ${layer.visible ? '' : 'opacity-40'}`}
                  title={layer.visible ? 'Hide' : 'Show'}
                >
                  {layer.visible ? '👁' : '👁'}
                </button>
                {/* Name */}
                {editingLayerName === layer.id ? (
                  <input
                    autoFocus
                    defaultValue={layer.name}
                    onBlur={(e) => { renameLayer(idx, e.target.value); setEditingLayerName(null); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { renameLayer(idx, (e.target as HTMLInputElement).value); setEditingLayerName(null); }
                      if (e.key === 'Escape') setEditingLayerName(null);
                    }}
                    className="flex-1 bg-stone-700 rounded px-1 py-0 text-xs min-w-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="flex-1 truncate"
                    onDoubleClick={() => setEditingLayerName(layer.id)}
                  >
                    {layer.name}
                  </span>
                )}
                {/* Opacity badge (compact) */}
                {layer.opacity < 1 && (
                  <span className="text-[10px] text-stone-400 tabular-nums flex-shrink-0">{Math.round(layer.opacity * 100)}%</span>
                )}
                {/* Expand toggle */}
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedLayerId(isExpanded ? null : layer.id); }}
                  className={`flex-shrink-0 w-5 text-center rounded hover:bg-white/10 ${isExpanded ? 'text-parchment-100' : 'text-stone-400 hover:text-stone-200'}`}
                  title="Layer options"
                >
                  ⋯
                </button>
              </div>
              {/* Expanded options row */}
              {isExpanded && (
                <div
                  className={`flex items-center gap-2 px-2 py-1.5 text-xs border-t ${
                    isActive ? 'bg-arcane-700/70 border-arcane-600/50' : 'bg-stone-800/70 border-stone-700/50'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Opacity slider */}
                  <label className="text-[10px] text-stone-400 flex-shrink-0">Opacity</label>
                  <input
                    type="range"
                    min="0" max="100"
                    value={Math.round(layer.opacity * 100)}
                    onChange={(e) => setLayerOpacity(idx, parseInt(e.target.value) / 100)}
                    className="flex-1 h-3 accent-arcane-500 min-w-0"
                  />
                  <span className="text-[10px] text-stone-300 w-7 text-right tabular-nums flex-shrink-0">{Math.round(layer.opacity * 100)}%</span>
                  {/* Divider */}
                  <span className="text-stone-600">|</span>
                  {/* Move up/down */}
                  <button
                    onClick={() => moveLayer(idx, 1)}
                    disabled={idx === layersRef.current.length - 1}
                    className="text-stone-200 hover:text-white disabled:opacity-20 px-1 py-0.5 rounded hover:bg-white/10"
                    title="Move Up"
                  >↑</button>
                  <button
                    onClick={() => moveLayer(idx, -1)}
                    disabled={idx === 0}
                    className="text-stone-200 hover:text-white disabled:opacity-20 px-1 py-0.5 rounded hover:bg-white/10"
                    title="Move Down"
                  >↓</button>
                  {/* Delete */}
                  <button
                    onClick={() => deleteLayer(idx)}
                    disabled={layersRef.current.length <= 1}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-20 px-1 py-0.5 rounded"
                    title="Delete Layer"
                  >✕</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ─── Canvas cursor style ──────────────────────────────────────────
  const canvasCursor = spaceHeld ? 'grab'
    : tool === 'eyedropper' ? 'crosshair'
    : tool === 'select' ? 'crosshair'
    : tool === 'move' ? 'move'
    : 'default';

  // ─── Recovery Banner ────────────────────────────────────────────

  const recoveryBanner = recoveryData && (
    <div className="flex items-center justify-between px-4 py-2 bg-amber-900/90 border-b border-amber-500 text-sm">
      <div>
        <span className="text-amber-100 font-medium">Unsaved work found: &quot;{recoveryData.projectName}&quot;</span>
        <span className="text-amber-300/80 text-xs ml-2">
          {new Date(recoveryData.savedAt).toLocaleString()}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleRecoverAutoSave}
          className="px-3 py-1 bg-amber-700 hover:bg-amber-600 rounded text-xs text-amber-100 font-medium"
        >
          Restore
        </button>
        <button
          onClick={() => { clearPixelAutoSave(); setRecoveryData(null); }}
          className="px-3 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs text-stone-300"
        >
          Dismiss
        </button>
      </div>
    </div>
  );

  // ─── Desktop Layout ─────────────────────────────────────────────

  if (!isMobile) {
    return (
      <div className={isPage ? 'flex flex-col h-full bg-stone-950' : 'fixed inset-0 bg-black/80 flex flex-col z-50'}>
        {recoveryBanner}
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-stone-900 border-b border-stone-700">
          <div className="flex items-center gap-2">
            {isPage ? (
              <>
                <button onClick={onNew} className="px-3 py-1 bg-purple-700 hover:bg-purple-600 rounded text-sm">
                  + New
                </button>
                <button onClick={() => setShowOpenModal(true)} className="px-3 py-1 bg-stone-700 hover:bg-stone-600 rounded text-sm">
                  Open
                </button>
              </>
            ) : (
              <button onClick={onClose} className="px-3 py-1 bg-stone-700 hover:bg-stone-600 rounded text-sm">
                ✕ Close
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editingProjectName ? (
              <input
                autoFocus
                defaultValue={projectName}
                onBlur={(e) => { setProjectName(e.target.value || 'Untitled'); setEditingProjectName(false); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { setProjectName((e.target as HTMLInputElement).value || 'Untitled'); setEditingProjectName(false); }
                  if (e.key === 'Escape') setEditingProjectName(false);
                }}
                className="bg-stone-700 rounded px-2 py-0.5 text-sm text-parchment-100 font-bold text-center min-w-[120px]"
              />
            ) : (
              <span
                onClick={() => setEditingProjectName(true)}
                className="text-sm text-parchment-100 font-bold cursor-pointer hover:text-arcane-400 transition-colors"
                title="Click to rename"
              >
                {projectName}
              </span>
            )}
            <span className="text-xs text-stone-500">{canvasWidth}x{canvasHeight}</span>
          </div>
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
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {isPage && (
              <button
                onClick={handleSaveAs}
                disabled={saving}
                className="px-3 py-1 bg-stone-700 hover:bg-stone-600 rounded text-sm disabled:opacity-50"
              >
                Save As
              </button>
            )}
            {framesRef.current.length > 1 && (
              <button
                onClick={handleExportSpriteSheet}
                disabled={saving}
                className="px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-sm disabled:opacity-50"
                title="Export as horizontal sprite sheet PNG"
              >
                Export Sheet
              </button>
            )}
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-1 px-4 py-1 bg-stone-800 border-b border-stone-700">
          {actionBar}
          {/* Timeline toggle */}
          <span className="text-stone-600 mx-1">|</span>
          <button
            onClick={() => setShowTimeline(s => !s)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              showTimeline ? 'bg-arcane-600 text-parchment-100' : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
            }`}
            title="Toggle animation timeline"
          >
            🎬 Timeline
          </button>
        </div>

        {/* Main content */}
        <div className="flex flex-1 min-h-0">
          {/* Vertical Tool Strip */}
          {verticalToolbar}

          {/* Canvas + Timeline column */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Canvas area */}
            <div className="flex-1 relative bg-stone-950 overflow-auto">
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ touchAction: 'none', cursor: canvasCursor }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
                onContextMenu={(e) => e.preventDefault()}
              />
              {/* Status bar */}
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-1 bg-stone-900/80 text-xs text-stone-400 pointer-events-none">
                <span>Zoom: {zoom}x | Brush: {brushSize}</span>
                <span>
                  {cursorPos ? `Pos: (${cursorPos.x}, ${cursorPos.y})` : ''}
                  {selection ? ` | Sel: ${selection.w}x${selection.h}` : ''}
                </span>
                <span>
                  Frame: {activeFrameIndex + 1}/{framesRef.current.length}
                  {' | '}Layer: {getActiveLayer().name}
                </span>
              </div>
            </div>

            {/* Timeline */}
            {showTimeline && (
              <PixelEditorTimeline
                frames={frameInfos}
                activeFrameIndex={activeFrameIndex}
                frameRate={animFrameRate}
                isPlaying={isAnimPlaying}
                onionSkinning={onionSkinning}
                onSelectFrame={switchFrame}
                onAddFrame={addFrame}
                onDuplicateFrame={duplicateFrame}
                onDeleteFrame={deleteFrame}
                onReorderFrame={reorderFrame}
                onSetFrameRate={setAnimFrameRate}
                onPlayPause={handleAnimPlayPause}
                onSetOnionSkinning={setOnionSkinning}
              />
            )}
          </div>

          {/* Right Sidebar */}
          <div className="w-56 bg-stone-900 border-l border-stone-700 p-3 flex flex-col gap-3 overflow-y-auto">
            {colorPalette}
            <div className="border-t border-stone-700 pt-2">
              {layerPanel}
            </div>
            <div className="border-t border-stone-700 pt-2">
              {canvasSizeControls}
            </div>
          </div>
        </div>

        {/* Animation Preview (floating) */}
        {showTimeline && framesRef.current.length > 1 && (
          <PixelEditorAnimationPreview
            frameThumbnails={frameCompositeUrls}
            frameRate={animFrameRate}
            loop={animLoop}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            onFrameChange={handleAnimFrameChange}
          />
        )}

        {shortcutsModal}
        {openModal}
      </div>
    );
  }

  // ─── Mobile Layout ──────────────────────────────────────────────

  return (
    <div className={isPage ? 'flex flex-col h-full bg-stone-950' : 'fixed inset-0 bg-black flex flex-col z-50'}>
      {recoveryBanner}
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-stone-900 border-b border-stone-700">
        <div className="flex items-center gap-1">
          {isPage ? (
            <>
              <button onClick={onNew} className="px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded text-xs">
                + New
              </button>
              <button onClick={() => setShowOpenModal(true)} className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs">
                Open
              </button>
            </>
          ) : (
            <button onClick={onClose} className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs">
              ✕
            </button>
          )}
        </div>
        <span
          onClick={() => setEditingProjectName(true)}
          className="text-xs text-parchment-100 font-bold cursor-pointer hover:text-arcane-400 truncate max-w-[120px]"
          title="Click to rename"
        >
          {projectName}
        </span>
        {!isPage ? (
          <button
            onClick={handleApply}
            className="px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-xs"
          >
            Apply
          </button>
        ) : (
          <div className="flex gap-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-2 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-xs disabled:opacity-50"
            >
              {saving ? '...' : 'Save'}
            </button>
            <button
              onClick={handleSaveAs}
              disabled={saving}
              className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs disabled:opacity-50"
            >
              As
            </button>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-stone-800 border-b border-stone-700 flex-wrap">
        {mobileToolbar}
        <button
          onClick={() => setShowTimeline(s => !s)}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            showTimeline ? 'bg-arcane-600 text-parchment-100' : 'bg-stone-700 text-stone-400'
          }`}
          title="Timeline"
        >
          🎬
        </button>
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
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {/* Timeline (mobile) */}
      {showTimeline && (
        <PixelEditorTimeline
          frames={frameInfos}
          activeFrameIndex={activeFrameIndex}
          frameRate={animFrameRate}
          isPlaying={isAnimPlaying}
          onionSkinning={onionSkinning}
          onSelectFrame={switchFrame}
          onAddFrame={addFrame}
          onDuplicateFrame={duplicateFrame}
          onDeleteFrame={deleteFrame}
          onReorderFrame={reorderFrame}
          onSetFrameRate={setAnimFrameRate}
          onPlayPause={handleAnimPlayPause}
          onSetOnionSkinning={setOnionSkinning}
        />
      )}

      {/* Bottom bar: palette + layers + controls */}
      <div className="bg-stone-900 border-t border-stone-700 p-2 space-y-2 max-h-[45vh] overflow-y-auto">
        {colorPalette}
        {/* Collapsible layers */}
        <div className="border-t border-stone-700 pt-1">
          <button
            onClick={() => setShowLayers(s => !s)}
            className="text-xs text-stone-400 hover:text-stone-300 w-full text-left"
          >
            Layers {showLayers ? '▼' : '▶'}
          </button>
          {showLayers && <div className="mt-1">{layerPanel}</div>}
        </div>
        <div className="flex items-center justify-between">
          {canvasSizeControls}
          {!isPage && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 bg-arcane-700 hover:bg-arcane-600 rounded text-xs disabled:opacity-50"
            >
              {saving ? '...' : 'Save'}
            </button>
          )}
        </div>
      </div>
      {shortcutsModal}
    </div>
  );
});

PixelEditor.displayName = 'PixelEditor';
