import { useCallback, useRef, useState } from 'react';
import { cloneLayerStack } from '../components/editor/pixelEditorUtils';

const MAX_HISTORY = 30;

export interface PixelEditorHistorySnapshot {
  layers: ImageData[];
  activeLayerIndex: number;
}

export interface PixelEditorHistory {
  canUndo: boolean;
  canRedo: boolean;
  /** Save a snapshot before making changes (call on pointerdown). */
  push: (snapshot: PixelEditorHistorySnapshot) => void;
  /** Undo: pass current state so it can be saved for redo. Returns previous state or null. */
  undo: (current: PixelEditorHistorySnapshot) => PixelEditorHistorySnapshot | null;
  /** Redo: pass current state so it can be saved for undo. Returns next state or null. */
  redo: (current: PixelEditorHistorySnapshot) => PixelEditorHistorySnapshot | null;
  /** Clear all history (on canvas resize or project load). */
  reset: () => void;
}

function cloneSnapshot(s: PixelEditorHistorySnapshot): PixelEditorHistorySnapshot {
  return { layers: cloneLayerStack(s.layers), activeLayerIndex: s.activeLayerIndex };
}

export function usePixelEditorHistory(): PixelEditorHistory {
  const undoStack = useRef<PixelEditorHistorySnapshot[]>([]);
  const redoStack = useRef<PixelEditorHistorySnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const sync = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  const push = useCallback((snapshot: PixelEditorHistorySnapshot) => {
    undoStack.current.push(cloneSnapshot(snapshot));
    if (undoStack.current.length > MAX_HISTORY) {
      undoStack.current.shift();
    }
    redoStack.current = [];
    sync();
  }, [sync]);

  const undo = useCallback((current: PixelEditorHistorySnapshot): PixelEditorHistorySnapshot | null => {
    const prev = undoStack.current.pop();
    if (!prev) return null;
    redoStack.current.push(cloneSnapshot(current));
    sync();
    return prev;
  }, [sync]);

  const redo = useCallback((current: PixelEditorHistorySnapshot): PixelEditorHistorySnapshot | null => {
    const next = redoStack.current.pop();
    if (!next) return null;
    undoStack.current.push(cloneSnapshot(current));
    sync();
    return next;
  }, [sync]);

  const reset = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    sync();
  }, [sync]);

  return { canUndo, canRedo, push, undo, redo, reset };
}
