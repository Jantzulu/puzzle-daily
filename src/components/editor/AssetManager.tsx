import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CharacterEditor } from './CharacterEditor';
import { EnemyEditor } from './EnemyEditor';
import { SpellLibrary } from './SpellLibrary';
import { SkinEditor } from './SkinEditor';

type AssetTab = 'characters' | 'enemies' | 'spells' | 'skins' | 'tiles' | 'collectibles';

export const AssetManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AssetTab>('characters');

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header with tabs */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold">Asset Manager</h1>
            <Link to="/editor" className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700">
              ← Back to Map Editor
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('characters')}
              className={`px-4 py-2 rounded-t ${
                activeTab === 'characters'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              🎮 Characters
            </button>
            <button
              onClick={() => setActiveTab('enemies')}
              className={`px-4 py-2 rounded-t ${
                activeTab === 'enemies'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              👾 Enemies
            </button>
            <button
              onClick={() => setActiveTab('spells')}
              className={`px-4 py-2 rounded-t ${
                activeTab === 'spells'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              ✨ Spells
            </button>
            <button
              onClick={() => setActiveTab('skins')}
              className={`px-4 py-2 rounded-t ${
                activeTab === 'skins'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              🎨 Skins
            </button>
            <button
              onClick={() => setActiveTab('tiles')}
              className={`px-4 py-2 rounded-t ${
                activeTab === 'tiles'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              🧱 Tiles
            </button>
            <button
              onClick={() => setActiveTab('collectibles')}
              className={`px-4 py-2 rounded-t ${
                activeTab === 'collectibles'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              💎 Collectibles
            </button>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'characters' && <CharacterEditor />}
        {activeTab === 'enemies' && <EnemyEditor />}
        {activeTab === 'spells' && <SpellLibrary />}
        {activeTab === 'skins' && <SkinEditor />}
        {activeTab === 'tiles' && <TileEditorPlaceholder />}
        {activeTab === 'collectibles' && <CollectibleEditorPlaceholder />}
      </div>
    </div>
  );
};

// Placeholder components for tiles and collectibles (can be implemented later)
const TileEditorPlaceholder: React.FC = () => (
  <div className="p-8">
    <div className="max-w-6xl mx-auto">
      <div className="bg-gray-800 p-8 rounded text-center">
        <h2 className="text-2xl font-bold mb-4">Tile Editor</h2>
        <p className="text-gray-400">
          Coming soon! For now, tiles use default appearances (empty/wall).
          <br />
          Custom tile sprites can be added in a future update.
        </p>
      </div>
    </div>
  </div>
);

const CollectibleEditorPlaceholder: React.FC = () => (
  <div className="p-8">
    <div className="max-w-6xl mx-auto">
      <div className="bg-gray-800 p-8 rounded text-center">
        <h2 className="text-2xl font-bold mb-4">Collectible Editor</h2>
        <p className="text-gray-400">
          Coming soon! For now, collectibles use default appearances (coin star).
          <br />
          Custom collectible sprites can be added in a future update.
        </p>
      </div>
    </div>
  </div>
);
