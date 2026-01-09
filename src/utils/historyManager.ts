/**
 * History Manager for Undo/Redo functionality
 * Stores snapshots of state for reversible editing
 */

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface HistoryManager<T> {
  state: HistoryState<T>;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => T | null;
  redo: () => T | null;
  push: (newState: T) => void;
  clear: () => void;
}

const MAX_HISTORY_SIZE = 50;

export function createHistoryManager<T>(initialState: T): HistoryManager<T> {
  const history: HistoryState<T> = {
    past: [],
    present: JSON.parse(JSON.stringify(initialState)),
    future: [],
  };

  return {
    get state() {
      return history;
    },

    get canUndo() {
      return history.past.length > 0;
    },

    get canRedo() {
      return history.future.length > 0;
    },

    undo(): T | null {
      console.log('[History] undo called, past.length:', history.past.length, 'future.length:', history.future.length);
      if (history.past.length === 0) return null;

      const previous = history.past[history.past.length - 1];
      const newPast = history.past.slice(0, -1);

      history.future = [history.present, ...history.future];
      history.past = newPast;
      history.present = previous;

      console.log('[History] after undo, past.length:', history.past.length, 'future.length:', history.future.length);
      return JSON.parse(JSON.stringify(previous));
    },

    redo(): T | null {
      console.log('[History] redo called, past.length:', history.past.length, 'future.length:', history.future.length);
      if (history.future.length === 0) {
        console.log('[History] redo: no future states available');
        return null;
      }

      const next = history.future[0];
      const newFuture = history.future.slice(1);

      history.past = [...history.past, history.present];
      history.future = newFuture;
      history.present = next;

      console.log('[History] after redo, past.length:', history.past.length, 'future.length:', history.future.length);
      return JSON.parse(JSON.stringify(next));
    },

    push(newState: T): void {
      console.log('[History] push called, past.length:', history.past.length, 'future.length:', history.future.length);
      // Deep clone to avoid mutation issues
      const clonedState = JSON.parse(JSON.stringify(newState));

      // Add current state to past
      history.past = [...history.past, history.present];

      // Limit history size
      if (history.past.length > MAX_HISTORY_SIZE) {
        history.past = history.past.slice(-MAX_HISTORY_SIZE);
      }

      // Set new present and clear future
      history.present = clonedState;
      history.future = [];
      console.log('[History] after push, past.length:', history.past.length, 'future.length:', history.future.length);
    },

    clear(): void {
      history.past = [];
      history.future = [];
    },
  };
}

/**
 * React hook-friendly version that tracks undo/redo state
 */
export interface UseHistoryResult<T> {
  canUndo: boolean;
  canRedo: boolean;
  pushState: (state: T) => void;
  undo: () => T | null;
  redo: () => T | null;
  clearHistory: () => void;
}
