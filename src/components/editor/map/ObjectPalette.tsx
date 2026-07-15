// Object palette: folder filter + search + selectable object list with
// info tooltips and effect badges. Extracted verbatim from MapEditor.tsx
// (Phase 1 decomposition, 2026-07-14).
import React from 'react';
import type { CustomObject } from '../../../utils/assetStorage';
import { FolderDropdown } from '../FolderDropdown';
import { SpriteThumbnail } from '../SpriteThumbnail';
import { ObjectTooltip } from './Tooltips';

interface ObjectPaletteProps {
  objects: CustomObject[];
  totalObjectCount: number;
  objectFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedObjectId: string | null;
  onSelect: (objectId: string) => void;
}

export const ObjectPalette: React.FC<ObjectPaletteProps> = ({
  objects,
  totalObjectCount,
  objectFolderId,
  onFolderSelect,
  searchTerm,
  onSearchChange,
  selectedObjectId,
  onSelect,
}) => (
  <div className="bg-stone-800 p-4 rounded">
    <h2 className="text-lg font-bold mb-3">Select Object</h2>
    <FolderDropdown
      category="objects"
      selectedFolderId={objectFolderId}
      onFolderSelect={onFolderSelect}
    />
    <input
      type="text"
      placeholder="Search objects..."
      value={searchTerm}
      onChange={e => onSearchChange(e.target.value)}
      className="w-full bg-stone-700 rounded px-2 py-1 text-sm placeholder-stone-500 mt-2"
    />
    {objects.length === 0 ? (
      <div className="text-center py-4">
        <p className="text-sm text-stone-400 mb-2">
          {totalObjectCount === 0 ? 'No objects available.' : searchTerm ? 'No objects match your search.' : 'No objects in this folder.'}
        </p>
        {totalObjectCount === 0 && (
          <a href="/assets" className="text-blue-400 hover:underline text-sm">
            Create objects in Asset Manager
          </a>
        )}
      </div>
    ) : (
      <div className="space-y-2 max-h-64 overflow-y-auto mt-2">
        {objects.map(obj => (
          <ObjectTooltip key={obj.id} object={obj}>
            <button
              onClick={() => onSelect(obj.id)}
              className={`w-full p-2 rounded text-left flex items-center gap-2 ${
                selectedObjectId === obj.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
              }`}
            >
              <SpriteThumbnail sprite={obj.customSprite} size={32} previewType="asset" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{obj.name}</div>
                <div className="text-xs text-stone-400 capitalize">
                  {obj.collisionType.replace('_', ' ')}
                  {obj.effects.length > 0 && ` • ${obj.effects.length} effect${obj.effects.length > 1 ? 's' : ''}`}
                </div>
              </div>
              {obj.effects.length > 0 && (
                <div className="flex gap-1 flex-shrink-0">
                  {obj.effects.slice(0, 2).map((effect, i) => (
                    <span
                      key={i}
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        effect.type === 'damage' ? 'bg-red-900 text-red-300' :
                        effect.type === 'heal' ? 'bg-green-900 text-green-300' :
                        'bg-blue-900 text-blue-300'
                      }`}
                    >
                      {effect.type.charAt(0).toUpperCase()}
                    </span>
                  ))}
                </div>
              )}
            </button>
          </ObjectTooltip>
        ))}
      </div>
    )}
  </div>
);
