import { useCallback, useRef, useState } from 'react';
import { cloneImageData } from '../components/editor/pixelEditorUtils';

const MAX_HISTORY = 30;

export interface PixelEditorHistory {
  canUndo: boolean;
  canRedo: boolean;
  /** Save a snapshot before making changes (call on pointerdown). */
  push: (data: ImageData) => void;
  /** Undo: pass current data so it can be saved for redo. Returns previous state or null. */
  undo: (currentData: ImageData) => ImageData | null;
  /** Redo: pass current data so it can be saved for undo. Returns next state or null. */
  redo: (currentData: ImageData) => ImageData | null;
  /** Clear all history (on canvas resize or project load). */
  reset: () => void;
}

export function usePixelEditorHistory(): PixelEditorHistory {
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const sync = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  const push = useCallback((data: ImageData) => {
    undoStack.current.push(cloneImageData(data));
    if (undoStack.current.length > MAX_HISTORY) {
      undoStack.current.shift();
    }
    redoStack.current = [];
    sync();
  }, [sync]);

  const undo = useCallback((currentData: ImageData): ImageData | null => {
    const prev = undoStack.current.pop();
    if (!prev) return null;
    redoStack.current.push(cloneImageData(currentData));
    sync();
    return prev;
  }, [sync]);

  const redo = useCallback((currentData: ImageData): ImageData | null => {
    const next = redoStack.current.pop();
    if (!next) return null;
    undoStack.current.push(cloneImageData(currentData));
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
