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

type AssetTab = 'characters' | 'enemies' | 'spells' | 'status_effects' | 'skins' | 'tiles' | 'objects' | 'collectibles' | 'sounds' | 'help';

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
              <button
                onClick={() => setActiveTab('help')}
                className={`px-3 md:px-4 py-2 rounded-t text-sm md:text-base whitespace-nowrap ${
                  activeTab === 'help'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
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
        {activeTab === 'help' && (
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-6" style={{ height: 'calc(100vh - 130px)' }}>
            <HelpContentEditor />
          </div>
        )}
      </div>
    </div>
  );
};
