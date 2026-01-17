import React, { useState } from 'react';
import { CharacterEditor } from './CharacterEditor';
import { EnemyEditor } from './EnemyEditor';
import { SpellLibrary } from './SpellLibrary';
import { StatusEffectLibrary } from './StatusEffectLibrary';
import { SkinEditor } from './SkinEditor';
import { TileTypeEditor } from './TileTypeEditor';
import { ObjectEditor } from './ObjectEditor';
import { SoundEditor } from './SoundEditor';

type AssetTab = 'characters' | 'enemies' | 'spells' | 'status_effects' | 'skins' | 'tiles' | 'objects' | 'collectibles' | 'sounds';

export const AssetManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AssetTab>('characters');

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header with tabs */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 md:py-4">
          <div className="mb-3 md:mb-4">
            <h1 className="text-2xl md:text-3xl font-bold">Asset Manager</h1>
          </div>

          {/* Tabs - horizontally scrollable on mobile */}
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <div className="flex gap-1 md:gap-2 min-w-max">
              <button
                onClick={() => setActiveTab('characters')}
                className={`px-3 md:px-4 py-2 rounded-t text-sm md:text-base whitespace-nowrap ${
                  activeTab === 'characters'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                🎮 <span className="hidden sm:inline">Characters</span><span className="sm:hidden">Chars</span>
              </button>
              <button
                onClick={() => setActiveTab('enemies')}
                className={`px-3 md:px-4 py-2 rounded-t text-sm md:text-base whitespace-nowrap ${
                  activeTab === 'enemies'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                👾 Enemies
              </button>
              <button
                onClick={() => setActiveTab('spells')}
                className={`px-3 md:px-4 py-2 rounded-t text-sm md:text-base whitespace-nowrap ${
                  activeTab === 'spells'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                ✨ Spells
              </button>
              <button
                onClick={() => setActiveTab('status_effects')}
                className={`px-3 md:px-4 py-2 rounded-t text-sm md:text-base whitespace-nowrap ${
                  activeTab === 'status_effects'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                ☠️ <span className="hidden sm:inline">Status Effects</span><span className="sm:hidden">Effects</span>
              </button>
              <button
                onClick={() => setActiveTab('tiles')}
                className={`px-3 md:px-4 py-2 rounded-t text-sm md:text-base whitespace-nowrap ${
                  activeTab === 'tiles'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                🧱 Tiles
              </button>
              <button
                onClick={() => setActiveTab('skins')}
                className={`px-3 md:px-4 py-2 rounded-t text-sm md:text-base whitespace-nowrap ${
                  activeTab === 'skins'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                🎨 Skins
              </button>
              <button
                onClick={() => setActiveTab('objects')}
                className={`px-3 md:px-4 py-2 rounded-t text-sm md:text-base whitespace-nowrap ${
                  activeTab === 'objects'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                🏺 Objects
              </button>
              <button
                onClick={() => setActiveTab('collectibles')}
                className={`px-3 md:px-4 py-2 rounded-t text-sm md:text-base whitespace-nowrap ${
                  activeTab === 'collectibles'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                💎 <span className="hidden sm:inline">Collectibles</span><span className="sm:hidden">Items</span>
              </button>
              <button
                onClick={() => setActiveTab('sounds')}
                className={`px-3 md:px-4 py-2 rounded-t text-sm md:text-base whitespace-nowrap ${
                  activeTab === 'sounds'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                🔊 Sounds
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
        {activeTab === 'collectibles' && <CollectibleEditorPlaceholder />}
        {activeTab === 'sounds' && <SoundEditor />}
      </div>
    </div>
  );
};

// Placeholder component for collectibles (can be implemented later)
const CollectibleEditorPlaceholder: React.FC = () => (
  <div className="p-4 md:p-8">
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row gap-4 md:gap-8">
        {/* Collectible List - Left Sidebar */}
        <div className="w-full md:w-72 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Collectibles</h2>
            <button
              className="px-3 py-1 bg-gray-600 rounded text-sm cursor-not-allowed opacity-50"
              disabled
            >
              + New
            </button>
          </div>

          <input
            type="text"
            placeholder="Search..."
            className="w-full px-3 py-2 bg-gray-700 rounded text-sm opacity-50"
            disabled
          />

          <div className="bg-gray-800 p-4 rounded text-center text-gray-400 text-sm">
            No collectibles yet.
            <br />
            Coming soon!
          </div>
        </div>

        {/* Collectible Editor - Right Panel */}
        <div className="flex-1">
          <div className="bg-gray-800 p-8 rounded text-center">
            <h2 className="text-2xl font-bold mb-4">Collectible Editor</h2>
            <p className="text-gray-400 mb-6">
              Create collectible assets that can be placed on maps for players to gather.
              <br />
              Coming soon! For now, collectibles use default appearances.
            </p>
            <button
              className="px-6 py-3 bg-gray-600 rounded text-lg cursor-not-allowed opacity-50"
              disabled
            >
              + Create New Collectible
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);
