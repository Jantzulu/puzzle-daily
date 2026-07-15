// Item palette — dense card grid: legacy coin first, then custom items with
// effect badges.
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
    <h2 className="text-lg font-bold mb-3">Select Item</h2>
    <FolderDropdown
      category="collectibles"
      selectedFolderId={collectibleFolderId}
      onFolderSelect={onFolderSelect}
    />
    <input
      type="text"
      placeholder="Search items..."
      value={searchTerm}
      onChange={e => onSearchChange(e.target.value)}
      className="w-full bg-stone-700 rounded px-2 py-1 text-sm placeholder-stone-500 mt-2"
    />
    <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5 max-h-80 overflow-y-auto mt-2">
      {/* Legacy coin option */}
      {!searchTerm && (
        <button
          onClick={() => onSelect(null)}
          className={`w-full h-full rounded p-1.5 flex flex-col items-center ${
            selectedCollectibleId === null ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
          }`}
          title="Legacy collectible (10 points)"
        >
          <div className="w-10 h-10 rounded flex items-center justify-center bg-stone-600">
            <span className="text-yellow-400 text-lg">⭐</span>
          </div>
          <span className="text-[11px] leading-tight truncate w-full text-center mt-1">Default Coin</span>
          <span className="text-[10px] text-stone-400">10 pts</span>
        </button>
      )}
      {collectibles.map(coll => (
        <button
          key={coll.id}
          onClick={() => onSelect(coll.id)}
          className={`w-full h-full rounded p-1.5 flex flex-col items-center ${
            selectedCollectibleId === coll.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
          }`}
          title={`${coll.name}${coll.effects.length > 0 ? ` — ${coll.effects.map(e => e.type).join(', ')}` : ''}`}
        >
          <SpriteThumbnail sprite={coll.customSprite} size={40} previewType="asset" />
          <span className="text-[11px] leading-tight truncate w-full text-center mt-1">{coll.name}</span>
          {coll.effects.length > 0 ? (
            <div className="flex gap-0.5 mt-0.5">
              {coll.effects.slice(0, 2).map((effect, i) => (
                <span
                  key={i}
                  className={`text-[9px] px-1 py-0.5 rounded leading-none ${
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
          ) : (
            <span className="text-[10px] text-stone-500">No effects</span>
          )}
        </button>
      ))}
    </div>
    {collectibles.length === 0 && totalCollectibleCount > 0 && (
      <p className="text-sm text-stone-400 text-center py-2">No items in this folder.</p>
    )}
    {totalCollectibleCount === 0 && (
      <div className="text-center py-2">
        <p className="text-sm text-stone-400 mb-2">No custom items available.</p>
        <a href="/assets" className="text-blue-400 hover:underline text-sm">
          Create items in Asset Manager
        </a>
      </div>
    )}
  </div>
);
