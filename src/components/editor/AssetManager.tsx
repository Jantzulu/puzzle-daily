import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CharacterEditor } from './CharacterEditor';
import { EnemyEditor } from './EnemyEditor';
import { SpellLibrary } from './SpellLibrary';
import { StatusEffectLibrary } from './StatusEffectLibrary';
import { SkinEditor } from './SkinEditor';
import { TileTypeEditor } from './TileTypeEditor';
import { ObjectEditor } from './ObjectEditor';
import { CollectibleEditor } from './CollectibleEditor';
import { MediaLibraryTab } from './MediaLibraryTab';
import { SoundEditor } from './SoundEditor';

type AssetTab = 'characters' | 'enemies' | 'spells' | 'status_effects' | 'skins' | 'tiles' | 'objects' | 'collectibles' | 'sounds' | 'media';

const TABS: { id: AssetTab; label: string; icon: string }[] = [
  { id: 'characters', label: 'Heroes', icon: '\u2694\uFE0F' },
  { id: 'enemies', label: 'Enemies', icon: '\uD83D\uDC79' },
  { id: 'spells', label: 'Spells', icon: '\u2728' },
  { id: 'status_effects', label: 'Enchantments', icon: '\uD83D\uDD2E' },
  { id: 'tiles', label: 'Tiles', icon: '\uD83E\uDDF1' },
  { id: 'skins', label: 'Skins', icon: '\uD83C\uDFA8' },
  { id: 'objects', label: 'Objects', icon: '\uD83C\uDFFA' },
  { id: 'collectibles', label: 'Items', icon: '\uD83D\uDC8E' },
  { id: 'sounds', label: 'Sounds', icon: '\uD83D\uDD0A' },
  { id: 'media', label: 'Media', icon: '\u2601\uFE0F' },
];

const VALID_TABS = TABS.map(t => t.id);

export const AssetManager: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<AssetTab>(() => {
    const tab = searchParams.get('tab') as AssetTab;
    return tab && VALID_TABS.includes(tab) ? tab : 'characters';
  });
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Sync URL params when navigated to from global search
  useEffect(() => {
    const tab = searchParams.get('tab') as AssetTab;
    if (tab && VALID_TABS.includes(tab) && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleClearCache = () => {
    localStorage.clear();
    setShowClearConfirm(false);
    window.location.reload();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-1 bg-stone-800 border-b border-stone-700 overflow-x-auto dungeon-scrollbar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors border-b-2 whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-stone-700 text-parchment-100 border-arcane-500'
                : 'text-stone-400 hover:text-stone-200 border-transparent hover:bg-stone-750'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => setShowClearConfirm(true)}
          className="dungeon-btn-danger text-xs px-2 py-1 ml-auto flex-shrink-0"
          title="Clear all localStorage data"
        >
          Clear Cache
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'characters' && <CharacterEditor initialSelectedId={searchParams.get('id') || undefined} />}
        {activeTab === 'enemies' && <EnemyEditor initialSelectedId={searchParams.get('id') || undefined} />}
        {activeTab === 'spells' && <SpellLibrary initialSelectedId={searchParams.get('id') || undefined} />}
        {activeTab === 'status_effects' && <StatusEffectLibrary initialSelectedId={searchParams.get('id') || undefined} />}
        {activeTab === 'skins' && <SkinEditor initialSelectedId={searchParams.get('id') || undefined} />}
        {activeTab === 'tiles' && <TileTypeEditor initialSelectedId={searchParams.get('id') || undefined} />}
        {activeTab === 'objects' && <ObjectEditor initialSelectedId={searchParams.get('id') || undefined} />}
        {activeTab === 'collectibles' && <CollectibleEditor initialSelectedId={searchParams.get('id') || undefined} />}
        {activeTab === 'sounds' && <SoundEditor initialSelectedId={searchParams.get('id') || undefined} />}
        {activeTab === 'media' && <MediaLibraryTab />}
      </div>

      {/* Clear Cache Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="dungeon-panel max-w-md w-full p-6">
            <h2 className="text-xl font-medieval text-copper-400 mb-4">Clear Local Cache?</h2>
            <p className="text-stone-300 mb-2">
              This will delete <strong>all</strong> locally stored data including:
            </p>
            <ul className="text-stone-400 text-sm mb-4 list-disc list-inside space-y-1">
              <li>Custom characters, enemies, spells</li>
              <li>Custom tiles, skins, objects</li>
              <li>Theme settings and sounds</li>
              <li>Saved puzzles and maps</li>
              <li>All other localStorage data</li>
            </ul>
            <p className="text-amber-400 text-sm mb-4">
              Make sure you've pushed to cloud if you want to keep your data!
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="dungeon-btn px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleClearCache}
                className="dungeon-btn-danger px-4 py-2"
              >
                Clear All Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
