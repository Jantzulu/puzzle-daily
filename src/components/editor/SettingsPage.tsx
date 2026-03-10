import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SoundEditor } from './SoundEditor';
import { ThemeAssetsEditor } from './ThemeAssetsEditor';
import { HelpContentEditor } from './HelpContentEditor';
import { ActivityFeed } from './ActivityFeed';

type SettingsTab = 'sounds' | 'theme' | 'help' | 'activity';

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'sounds', label: 'Sounds', icon: '\uD83D\uDD0A' },
  { id: 'theme', label: 'Theme', icon: '\uD83D\uDDBC\uFE0F' },
  { id: 'help', label: 'Help', icon: '\u2753' },
  { id: 'activity', label: 'Activity', icon: '\uD83D\uDCDC' },
];

const VALID_TABS = TABS.map(t => t.id);

export const SettingsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const tab = searchParams.get('tab') as SettingsTab;
    return tab && VALID_TABS.includes(tab) ? tab : 'sounds';
  });

  // Sync URL params when navigated to from global search
  useEffect(() => {
    const tab = searchParams.get('tab') as SettingsTab;
    if (tab && VALID_TABS.includes(tab) && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-1 bg-stone-800 border-b border-stone-700">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'bg-stone-700 text-parchment-100 border-arcane-500'
                : 'text-stone-400 hover:text-stone-200 border-transparent hover:bg-stone-750'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'sounds' && <SoundEditor initialSelectedId={searchParams.get('id') || undefined} />}
        {activeTab === 'theme' && <ThemeAssetsEditor />}
        {activeTab === 'help' && (
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-6 h-full">
            <HelpContentEditor />
          </div>
        )}
        {activeTab === 'activity' && (
          <div className="max-w-2xl mx-auto px-4 md:px-8 py-4 md:py-6">
            <ActivityFeed />
          </div>
        )}
      </div>
    </div>
  );
};
