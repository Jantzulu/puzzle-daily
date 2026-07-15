// Object palette — dense card grid with info tooltips and effect badges.
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5 max-h-80 overflow-y-auto mt-2">
        {objects.map(obj => (
          <ObjectTooltip key={obj.id} object={obj}>
            <button
              onClick={() => onSelect(obj.id)}
              className={`w-full h-full rounded p-1.5 flex flex-col items-center ${
                selectedObjectId === obj.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
              }`}
              title={obj.name}
            >
              <SpriteThumbnail sprite={obj.customSprite} size={40} previewType="asset" />
              <span className="text-[11px] leading-tight truncate w-full text-center mt-1">{obj.name}</span>
              <span className="text-[10px] text-stone-400 capitalize truncate w-full text-center">
                {obj.collisionType.replace('_', ' ')}
              </span>
              {obj.effects.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {obj.effects.slice(0, 2).map((effect, i) => (
                    <span
                      key={i}
                      className={`text-[9px] px-1 py-0.5 rounded leading-none ${
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
