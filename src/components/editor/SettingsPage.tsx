import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SoundEditor } from './SoundEditor';
import { ThemeAssetsEditor } from './ThemeAssetsEditor';
import { HelpContentEditor } from './HelpContentEditor';
import { ActivityFeed } from './ActivityFeed';

type SettingsTab = 'sounds' | 'theme' | 'help' | 'activity';

const VALID_TABS: SettingsTab[] = ['sounds', 'theme', 'help', 'activity'];

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

  const tabClass = (tab: SettingsTab) => `
    dungeon-tab whitespace-nowrap
    ${activeTab === tab ? 'dungeon-tab-active' : ''}
  `;

  return (
    <div className="min-h-screen theme-root text-parchment-200">
      {/* Header with tabs */}
      <div className="bg-stone-900 border-b-2 border-stone-700">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 md:py-4">
          <div className="mb-3 md:mb-4">
            <h1 className="text-2xl md:text-3xl font-bold font-medieval text-copper-400 text-shadow-dungeon">Settings</h1>
          </div>

          {/* Tabs */}
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 dungeon-scrollbar">
            <div className="flex gap-1 md:gap-2 min-w-max">
              <button onClick={() => setActiveTab('sounds')} className={tabClass('sounds')}>
                🔊 Sounds
              </button>
              <button onClick={() => setActiveTab('theme')} className={tabClass('theme')}>
                🖼️ Theme
              </button>
              <button onClick={() => setActiveTab('help')} className={tabClass('help')}>
                ❓ Help
              </button>
              <button onClick={() => setActiveTab('activity')} className={tabClass('activity')}>
                📜 Activity
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'sounds' && <SoundEditor initialSelectedId={searchParams.get('id') || undefined} />}
        {activeTab === 'theme' && <ThemeAssetsEditor />}
        {activeTab === 'help' && (
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-6" style={{ height: 'calc(100vh - 130px)' }}>
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
