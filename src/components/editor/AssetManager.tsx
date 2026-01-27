import React, { useState } from 'react';
import { CharacterEditor } from './CharacterEditor';
import { EnemyEditor } from './EnemyEditor';
import { SpellLibrary } from './SpellLibrary';
import { StatusEffectLibrary } from './StatusEffectLibrary';
import { SkinEditor } from './SkinEditor';
import { TileTypeEditor } from './TileTypeEditor';
import { ObjectEditor } from './ObjectEditor';
import { CollectibleEditor } from './CollectibleEditor';
import { SoundEditor } from './SoundEditor';
import { HelpContentEditor } from './HelpContentEditor';
import { ThemeAssetsEditor } from './ThemeAssetsEditor';

type AssetTab = 'characters' | 'enemies' | 'spells' | 'status_effects' | 'skins' | 'tiles' | 'objects' | 'collectibles' | 'sounds' | 'theme' | 'help';

export const AssetManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AssetTab>('characters');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClearCache = () => {
    localStorage.clear();
    setShowClearConfirm(false);
    // Reload to reset all state
    window.location.reload();
  };

  const tabClass = (tab: AssetTab) => `
    dungeon-tab whitespace-nowrap
    ${activeTab === tab ? 'dungeon-tab-active' : ''}
  `;

  return (
    <div className="min-h-screen theme-root text-parchment-200">
      {/* Header with tabs */}
      <div className="bg-stone-900 border-b-2 border-stone-700">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 md:py-4">
          <div className="mb-3 md:mb-4 flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-bold font-medieval text-copper-400 text-shadow-dungeon">Asset Manager</h1>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="dungeon-btn-danger text-xs px-2 py-1"
              title="Clear all localStorage data"
            >
              🗑️ Clear Cache
            </button>
          </div>

          {/* Tabs - horizontally scrollable on mobile */}
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 dungeon-scrollbar">
            <div className="flex gap-1 md:gap-2 min-w-max">
              <button onClick={() => setActiveTab('characters')} className={tabClass('characters')}>
                ⚔️ <span className="hidden sm:inline">Heroes</span><span className="sm:hidden">Chars</span>
              </button>
              <button onClick={() => setActiveTab('enemies')} className={tabClass('enemies')}>
                👹 Enemies
              </button>
              <button onClick={() => setActiveTab('spells')} className={tabClass('spells')}>
                ✨ Spells
              </button>
              <button onClick={() => setActiveTab('status_effects')} className={tabClass('status_effects')}>
                🔮 <span className="hidden sm:inline">Enchantments</span><span className="sm:hidden">Effects</span>
              </button>
              <button onClick={() => setActiveTab('tiles')} className={tabClass('tiles')}>
                🧱 Tiles
              </button>
              <button onClick={() => setActiveTab('skins')} className={tabClass('skins')}>
                🎨 Skins
              </button>
              <button onClick={() => setActiveTab('objects')} className={tabClass('objects')}>
                🏺 Objects
              </button>
              <button onClick={() => setActiveTab('collectibles')} className={tabClass('collectibles')}>
                💎 Items
              </button>
              <button onClick={() => setActiveTab('sounds')} className={tabClass('sounds')}>
                🔊 Sounds
              </button>
              <button onClick={() => setActiveTab('theme')} className={tabClass('theme')}>
                🖼️ Theme
              </button>
              <button onClick={() => setActiveTab('help')} className={tabClass('help')}>
                ❓ Help
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'characters' && <CharacterEditor />}
        {activeTab === 'enemies' && <EnemyEditor />}
        {activeTab === 'spells' && <SpellLibrary />}
        {activeTab === 'status_effects' && <StatusEffectLibrary />}
        {activeTab === 'skins' && <SkinEditor />}
        {activeTab === 'tiles' && <TileTypeEditor />}
        {activeTab === 'objects' && <ObjectEditor />}
        {activeTab === 'collectibles' && <CollectibleEditor />}
        {activeTab === 'sounds' && <SoundEditor />}
        {activeTab === 'theme' && <ThemeAssetsEditor />}
        {activeTab === 'help' && (
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-6" style={{ height: 'calc(100vh - 130px)' }}>
            <HelpContentEditor />
          </div>
        )}
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
              ⚠️ Make sure you've pushed to cloud if you want to keep your data!
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
