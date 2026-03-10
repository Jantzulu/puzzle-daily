import React from 'react';

export interface TabInfo {
  id: string;
  name: string;
  dirty: boolean;
}

interface PixelEditorTabBarProps {
  tabs: TabInfo[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
}

export const PixelEditorTabBar: React.FC<PixelEditorTabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
}) => {
  return (
    <div className="flex items-center gap-0.5 px-1 py-0.5 bg-stone-900 border-b border-stone-700 overflow-x-auto dungeon-scrollbar">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex items-center gap-1 px-2 py-1 rounded-t text-xs cursor-pointer flex-shrink-0 max-w-[140px] group ${
              isActive
                ? 'bg-stone-800 text-parchment-100 border-t border-x border-arcane-500'
                : 'bg-stone-900 text-stone-400 hover:text-stone-200 hover:bg-stone-800/50'
            }`}
          >
            {/* Dirty indicator */}
            {tab.dirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />
            )}
            {/* Tab name */}
            <span className="truncate">{tab.name}</span>
            {/* Close button */}
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 ${
                  isActive ? 'text-stone-400 hover:text-stone-200' : 'text-stone-600 hover:text-stone-300 opacity-0 group-hover:opacity-100'
                }`}
                title="Close tab"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      {/* New tab button */}
      <button
        onClick={onNewTab}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-stone-400 hover:text-stone-200 hover:bg-stone-800 text-sm"
        title="New tab"
      >
        +
      </button>
    </div>
  );
};
