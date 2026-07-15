// Collectible palette: legacy coin option + folder filter + search +
// selectable collectible list with effect badges. Extracted verbatim from
// MapEditor.tsx (Phase 1 decomposition, 2026-07-14).
import React from 'react';
import type { CustomCollectible } from '../../../utils/assetStorage';
import { FolderDropdown } from '../FolderDropdown';
import { SpriteThumbnail } from '../SpriteThumbnail';

interface CollectiblePaletteProps {
  collectibles: CustomCollectible[];
  totalCollectibleCount: number;
  collectibleFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedCollectibleId: string | null;
  onSelect: (collectibleId: string | null) => void;
}

export const CollectiblePalette: React.FC<CollectiblePaletteProps> = ({
  collectibles,
  totalCollectibleCount,
  collectibleFolderId,
  onFolderSelect,
  searchTerm,
  onSearchChange,
  selectedCollectibleId,
  onSelect,
}) => (
  <div className="bg-stone-800 p-4 rounded">
    <h2 className="text-lg font-bold mb-3">Select Collectible</h2>
    <FolderDropdown
      category="collectibles"
      selectedFolderId={collectibleFolderId}
      onFolderSelect={onFolderSelect}
    />
    <input
      type="text"
      placeholder="Search collectibles..."
      value={searchTerm}
      onChange={e => onSearchChange(e.target.value)}
      className="w-full bg-stone-700 rounded px-2 py-1 text-sm placeholder-stone-500 mt-2"
    />
    {/* Legacy coin option */}
    <div className="space-y-2 max-h-64 overflow-y-auto mt-2">
      {!searchTerm && (
        <button
          onClick={() => onSelect(null)}
          className={`w-full p-2 rounded text-left flex items-center gap-2 ${
            selectedCollectibleId === null ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
          }`}
        >
          <div className="w-8 h-8 rounded flex items-center justify-center bg-stone-600">
            <span className="text-yellow-400">⭐</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">Default Coin</div>
            <div className="text-xs text-stone-400">Legacy collectible (10 points)</div>
          </div>
        </button>
      )}
      {collectibles.length === 0 && totalCollectibleCount > 0 ? (
        <div className="text-center py-2">
          <p className="text-sm text-stone-400">No collectibles in this folder.</p>
        </div>
      ) : totalCollectibleCount === 0 ? (
        <div className="text-center py-2">
          <p className="text-sm text-stone-400 mb-2">No custom collectibles available.</p>
          <a href="/assets" className="text-blue-400 hover:underline text-sm">
            Create collectibles in Asset Manager
          </a>
        </div>
      ) : (
        collectibles.map(coll => (
          <button
            key={coll.id}
            onClick={() => onSelect(coll.id)}
            className={`w-full p-2 rounded text-left flex items-center gap-2 ${
              selectedCollectibleId === coll.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
            }`}
          >
            <SpriteThumbnail sprite={coll.customSprite} size={32} previewType="asset" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{coll.name}</div>
              <div className="text-xs text-stone-400">
                {coll.effects.length > 0
                  ? coll.effects.map(e => e.type).join(', ')
                  : 'No effects'}
              </div>
            </div>
            {coll.effects.length > 0 && (
              <div className="flex gap-1 flex-shrink-0">
                {coll.effects.slice(0, 2).map((effect, i) => (
                  <span
                    key={i}
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      effect.type === 'damage' ? 'bg-red-900 text-red-300' :
                      effect.type === 'heal' ? 'bg-green-900 text-green-300' :
                      effect.type === 'score' ? 'bg-yellow-900 text-yellow-300' :
                      effect.type === 'win_key' ? 'bg-purple-900 text-purple-300' :
                      'bg-blue-900 text-blue-300'
                    }`}
                  >
                    {effect.type === 'status_effect' ? 'Buff' : effect.type.charAt(0).toUpperCase()}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))
      )}
    </div>
  </div>
);
