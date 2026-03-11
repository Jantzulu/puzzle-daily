import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PixelEditor, type PixelEditorHandle } from './PixelEditor';
import { PixelEditorTabBar, type TabInfo } from './PixelEditorTabBar';
import { usePixelEditorTabs } from '../../hooks/usePixelEditorTabs';
import { clearCachedPixelEditorState } from '../../utils/pixelEditorState';
import { clearPixelAutoSave } from '../../utils/pixelEditorAutoSave';

/**
 * Standalone page wrapper for the Pixel Editor.
 * Manages multiple tabs, each with its own editor state.
 *
 * URL params:
 *   ?project=<url>  — opens a saved .project file in a new tab
 */
export const PixelEditorPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const editorRef = useRef<PixelEditorHandle>(null);

  const {
    tabs,
    activeTab,
    activeTabId,
    selectTab,
    newTab,
    closeTab,
    updateActiveTab,
    persistTabs,
  } = usePixelEditorTabs();

  // Force remount of PixelEditor when switching tabs
  const [editorKey, setEditorKey] = useState(0);

  // Track the last active tab to serialize state on switch
  const lastActiveTabIdRef = useRef(activeTabId);

  // Serialize current editor state into the tab before switching
  const serializeCurrentTab = useCallback(() => {
    if (editorRef.current) {
      const state = editorRef.current.serializeState();
      updateActiveTab(state);
    }
  }, [updateActiveTab]);

  // Handle tab switching
  const handleSelectTab = useCallback((tabId: string) => {
    if (tabId === activeTabId) return;
    // Serialize current editor state
    serializeCurrentTab();
    selectTab(tabId);
    setEditorKey(k => k + 1);
  }, [activeTabId, serializeCurrentTab, selectTab]);

  // Handle new tab
  const handleNewTab = useCallback(() => {
    serializeCurrentTab();
    newTab();
    setEditorKey(k => k + 1);
  }, [serializeCurrentTab, newTab]);

  // Handle close tab
  const handleCloseTab = useCallback((tabId: string) => {
    // If closing the active tab, serialize first
    if (tabId === activeTabId) {
      serializeCurrentTab();
    }
    const closed = closeTab(tabId);
    if (closed && tabId === activeTabId) {
      setEditorKey(k => k + 1);
    }
  }, [activeTabId, serializeCurrentTab, closeTab]);

  // Handle URL param for opening projects
  const projectUrlFromParams = searchParams.get('project') || undefined;
  useEffect(() => {
    if (projectUrlFromParams && !activeTab.currentProjectUrl) {
      // Load the project into the active tab
      // The PixelEditor component handles loading via projectUrl prop
    }
  }, [projectUrlFromParams, activeTab.currentProjectUrl]);

  // Handle "New" from within the editor
  const handleNew = useCallback(() => {
    // Always confirm before discarding — even if the project hasn't been
    // explicitly "saved", the user may have drawn something they want to keep.
    if (!window.confirm('Discard current project and create a new one?')) {
      return;
    }
    clearCachedPixelEditorState();
    clearPixelAutoSave();
    // Instead of creating a whole new tab, reset the current one
    updateActiveTab({
      projectJson: '',
      projectName: 'Untitled',
      dirty: false,
      currentPngPath: null,
      currentProjectPath: null,
      currentProjectUrl: null,
    });
    setEditorKey(k => k + 1);
    setSearchParams({});
  }, [setSearchParams, updateActiveTab]);

  const handleApply = useCallback((_base64: string, _projectUrl?: string) => {
    // Save handled inside PixelEditor — toast shown there
  }, []);

  const handleProjectUrlChange = useCallback((url: string) => {
    setSearchParams({ project: url }, { replace: true });
    updateActiveTab({ currentProjectUrl: url });
  }, [setSearchParams, updateActiveTab]);

  // Handle metadata updates from editor (project name, dirty state)
  const handleMetadataChange = useCallback((meta: { projectName: string; dirty: boolean }) => {
    updateActiveTab({
      projectName: meta.projectName,
      dirty: meta.dirty,
    });
  }, [updateActiveTab]);

  // Persist tabs on tab switch
  useEffect(() => {
    // The tab switch already serialized and called updateActiveTab,
    // so a debounced persist here is fine (state will be updated by next render)
    persistTabs();
  }, [activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist on unmount (React Router navigation) and beforeunload (page close/refresh)
  // Use a ref so the cleanup always has the latest persistTabs
  const persistTabsRef = useRef(persistTabs);
  persistTabsRef.current = persistTabs;
  const editorRefForPersist = editorRef;

  useEffect(() => {
    const handlePersist = () => {
      if (editorRefForPersist.current) {
        const editorState = editorRefForPersist.current.serializeState();
        persistTabsRef.current(editorState);
      } else {
        persistTabsRef.current();
      }
    };
    window.addEventListener('beforeunload', handlePersist);
    return () => {
      window.removeEventListener('beforeunload', handlePersist);
      // Persist on component unmount (React Router navigation) — but ONLY if
      // the editor ref is still available. During HMR / hot reload, React
      // unmounts children first (PixelEditor → editorRef becomes null), then
      // fires the parent cleanup. Writing in that case would overwrite good
      // saved data with stale / blank state.  The beforeunload handler already
      // covers real page close / refresh (fires before any unmounting).
      if (editorRefForPersist.current) {
        handlePersist();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build tab info for the tab bar
  const tabInfos: TabInfo[] = tabs.map(t => ({
    id: t.id,
    name: t.projectName || 'Untitled',
    dirty: t.dirty,
  }));

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <PixelEditorTabBar
        tabs={tabInfos}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
      />
      {/* Editor */}
      <div className="flex-1 min-h-0">
        <PixelEditor
          ref={editorRef}
          key={`${activeTabId}-${editorKey}`}
          mode="page"
          projectUrl={activeTab.currentProjectUrl || projectUrlFromParams}
          initialProjectJson={activeTab.projectJson || undefined}
          onApply={handleApply}
          onClose={() => {}}
          onNew={handleNew}
          onProjectUrlChange={handleProjectUrlChange}
          onMetadataChange={handleMetadataChange}
        />
      </div>
    </div>
  );
};
