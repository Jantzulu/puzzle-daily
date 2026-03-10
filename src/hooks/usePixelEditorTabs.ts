/**
 * Multi-tab management hook for the pixel editor.
 *
 * Manages an array of serialized tab states. Only one tab is "active" at a time
 * (rendered by PixelEditor). Switching tabs serializes the current editor state
 * and deserializes the target tab's state.
 */

import { useCallback, useRef, useState } from 'react';
import type { SerializedTab, PersistedTabsData } from '../types/pixelEditorDocument';
import { writeTabsPersistence, readTabsPersistence, clearTabsPersistence } from '../utils/pixelEditorTabPersistence';
import { serializeProject, type PixelEditorProjectV2 } from '../components/editor/pixelEditorUtils';

let nextTabId = 1;
function genTabId(): string {
  return `tab-${Date.now()}-${nextTabId++}`;
}

function createBlankTab(name: string = 'Untitled'): SerializedTab {
  const blankProject: PixelEditorProjectV2 = {
    version: 2,
    name,
    width: 32,
    height: 32,
    frames: [{
      id: 'frame-1',
      layers: [{
        id: 'layer-1',
        name: 'Background',
        visible: true,
        opacity: 1,
        // Blank transparent PNG (1x1 scaled up by editor on load)
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRUEFTkSuQmCC',
      }],
    }],
    frameRate: 10,
    loop: true,
  };

  return {
    id: genTabId(),
    projectJson: serializeProject(blankProject),
    projectName: name,
    dirty: false,
    currentPngPath: null,
    currentProjectPath: null,
    currentProjectUrl: null,
    zoom: 10,
    panX: 0,
    panY: 0,
    showGrid: true,
    activeFrameIndex: 0,
    activeLayerIndex: 0,
    customColors: [],
  };
}

export interface TabsState {
  tabs: SerializedTab[];
  activeTabId: string;
}

export interface PixelEditorTabsHook {
  tabs: SerializedTab[];
  activeTab: SerializedTab;
  activeTabId: string;

  /** Switch to a different tab. Call serializeCurrentTab first! */
  selectTab: (tabId: string) => void;

  /** Create a new blank tab and switch to it */
  newTab: (name?: string) => void;

  /** Create a new tab from a project URL (e.g., opened from project browser) */
  newTabFromProject: (projectUrl: string, projectName: string) => void;

  /** Close a tab. Returns false if user cancelled (unsaved changes). */
  closeTab: (tabId: string) => boolean;

  /** Update the active tab's serialized state (call before switching tabs or on autosave) */
  updateActiveTab: (updates: Partial<SerializedTab>) => void;

  /** Replace the active tab entirely (after editor state changes) */
  replaceActiveTab: (tab: SerializedTab) => void;

  /** Save all tabs to localStorage */
  persistTabs: () => void;

  /** Check if a tab has unsaved changes */
  isTabDirty: (tabId: string) => boolean;
}

export function usePixelEditorTabs(): PixelEditorTabsHook {
  // Load persisted tabs or start with a single blank tab
  const [state, setState] = useState<TabsState>(() => {
    const persisted = readTabsPersistence();
    if (persisted && persisted.tabs.length > 0) {
      // Validate the active tab ID
      const activeExists = persisted.tabs.some(t => t.id === persisted.activeTabId);
      return {
        tabs: persisted.tabs,
        activeTabId: activeExists ? persisted.activeTabId : persisted.tabs[0].id,
      };
    }
    const blank = createBlankTab();
    return { tabs: [blank], activeTabId: blank.id };
  });

  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTab = state.tabs.find(t => t.id === state.activeTabId) || state.tabs[0];

  const selectTab = useCallback((tabId: string) => {
    setState(prev => {
      if (prev.activeTabId === tabId) return prev;
      const tabExists = prev.tabs.some(t => t.id === tabId);
      if (!tabExists) return prev;
      return { ...prev, activeTabId: tabId };
    });
  }, []);

  const newTab = useCallback((name?: string) => {
    const tab = createBlankTab(name);
    setState(prev => ({
      tabs: [...prev.tabs, tab],
      activeTabId: tab.id,
    }));
  }, []);

  const newTabFromProject = useCallback((projectUrl: string, projectName: string) => {
    const tab = createBlankTab(projectName);
    tab.currentProjectUrl = projectUrl;
    setState(prev => ({
      tabs: [...prev.tabs, tab],
      activeTabId: tab.id,
    }));
  }, []);

  const closeTab = useCallback((tabId: string): boolean => {
    const tab = state.tabs.find(t => t.id === tabId);
    if (tab?.dirty) {
      if (!window.confirm(`"${tab.projectName}" has unsaved changes. Close anyway?`)) {
        return false;
      }
    }

    setState(prev => {
      const remaining = prev.tabs.filter(t => t.id !== tabId);
      if (remaining.length === 0) {
        // Can't close the last tab — replace with a blank
        const blank = createBlankTab();
        return { tabs: [blank], activeTabId: blank.id };
      }
      // If closing the active tab, switch to an adjacent tab
      let newActiveId = prev.activeTabId;
      if (prev.activeTabId === tabId) {
        const closedIndex = prev.tabs.findIndex(t => t.id === tabId);
        const newIndex = Math.min(closedIndex, remaining.length - 1);
        newActiveId = remaining[newIndex].id;
      }
      return { tabs: remaining, activeTabId: newActiveId };
    });
    return true;
  }, [state.tabs]);

  const updateActiveTab = useCallback((updates: Partial<SerializedTab>) => {
    setState(prev => ({
      ...prev,
      tabs: prev.tabs.map(t =>
        t.id === prev.activeTabId ? { ...t, ...updates } : t
      ),
    }));
  }, []);

  const replaceActiveTab = useCallback((tab: SerializedTab) => {
    setState(prev => ({
      ...prev,
      tabs: prev.tabs.map(t => t.id === prev.activeTabId ? tab : t),
    }));
  }, []);

  const persistTabs = useCallback(() => {
    // Debounce persistence writes
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }
    persistTimeoutRef.current = setTimeout(() => {
      const data: PersistedTabsData = {
        version: 1,
        activeTabId: state.activeTabId,
        tabs: state.tabs,
        savedAt: new Date().toISOString(),
      };
      writeTabsPersistence(data);
    }, 500);
  }, [state]);

  const isTabDirty = useCallback((tabId: string): boolean => {
    return state.tabs.find(t => t.id === tabId)?.dirty ?? false;
  }, [state.tabs]);

  return {
    tabs: state.tabs,
    activeTab,
    activeTabId: state.activeTabId,
    selectTab,
    newTab,
    newTabFromProject,
    closeTab,
    updateActiveTab,
    replaceActiveTab,
    persistTabs,
    isTabDirty,
  };
}
