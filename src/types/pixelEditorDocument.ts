/**
 * Type definitions for the Pixel Editor's multi-tab, multi-frame document model.
 *
 * A "document" represents one open tab in the pixel editor.
 * Each document contains one or more animation frames,
 * and each frame has its own independent layer stack.
 */

// ─── Layer (runtime) ─────────────────────────────────────────────

export interface LayerState {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;   // 0-1
  data: ImageData;
}

// ─── Frame ───────────────────────────────────────────────────────

export interface FrameState {
  id: string;
  layers: LayerState[];
  duration?: number;  // optional per-frame ms override
}

// ─── Selection ───────────────────────────────────────────────────

export interface Selection {
  x: number;
  y: number;
  w: number;
  h: number;
  floatingData?: ImageData;
}

// ─── Onion Skinning ──────────────────────────────────────────────

export interface OnionSkinningConfig {
  enabled: boolean;
  before: number;   // how many previous frames to ghost (1-3)
  after: number;    // how many next frames to ghost (0-2)
  opacity: number;  // ghost opacity (0.1 - 0.5)
}

// ─── Document (one tab) ─────────────────────────────────────────

export interface PixelEditorDocument {
  // Identity
  id: string;
  projectName: string;
  dirty: boolean;

  // Canvas dimensions
  canvasWidth: number;
  canvasHeight: number;

  // Frames (animation)
  frames: FrameState[];
  activeFrameIndex: number;
  frameRate: number;
  loop: boolean;

  // Active frame editing
  activeLayerIndex: number;

  // View state (per-document)
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;

  // Selection (per-document)
  selection: Selection | null;

  // Custom palette
  customColors: string[];

  // Save metadata
  currentProjectUrl: string | null;
  currentPngPath: string | null;
  currentProjectPath: string | null;
}

// ─── Serialized Tab (for localStorage persistence) ──────────────

export interface SerializedTab {
  id: string;
  projectJson: string;         // serialized PixelEditorProjectV2
  projectName: string;
  dirty: boolean;
  currentPngPath: string | null;
  currentProjectPath: string | null;
  currentProjectUrl: string | null;
  // View state
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  activeFrameIndex: number;
  activeLayerIndex: number;
  customColors: string[];
}

export interface PersistedTabsData {
  version: 1;
  activeTabId: string;
  tabs: SerializedTab[];
  savedAt: string;
}
