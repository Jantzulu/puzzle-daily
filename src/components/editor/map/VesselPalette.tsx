// Vessel palette — dense card grid. Breakable statics; place exactly like
// enemies via the adapter.
import React from 'react';
import type { CustomEnemy } from '../../../utils/assetStorage';
import { SpriteThumbnail } from '../SpriteThumbnail';

interface VesselPaletteProps {
  vessels: CustomEnemy[];
  totalVesselCount: number;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedVesselId: string | null;
  onSelect: (vesselId: string) => void;
}

export const VesselPalette: React.FC<VesselPaletteProps> = ({
  vessels,
  totalVesselCount,
  searchTerm,
  onSearchChange,
  selectedVesselId,
  onSelect,
}) => (
  <div className="bg-stone-800 p-4 rounded">
    <h2 className="text-lg font-bold mb-3">🛢️ Select Vessel</h2>
    <input
      type="text"
      placeholder="Search vessels..."
      value={searchTerm}
      onChange={e => onSearchChange(e.target.value)}
      className="w-full bg-stone-700 rounded px-2 py-1 text-sm placeholder-stone-500"
    />
    {vessels.length === 0 ? (
      <p className="text-sm text-stone-400 mt-2">
        {totalVesselCount === 0 ? (
          <>
            No vessels yet. Create vessels in{' '}
            <a href="/assets?tab=vessels" className="text-blue-400 hover:underline">
              Asset Manager → Vessels
            </a>
          </>
        ) : 'No vessels match your search.'}
      </p>
    ) : (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5 max-h-80 overflow-y-auto mt-2">
        {vessels.map(vessel => (
          <button
            key={vessel.id}
            onClick={() => onSelect(vessel.id)}
            className={`w-full h-full rounded p-1.5 flex flex-col items-center ${
              selectedVesselId === vessel.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
            }`}
            title={`${vessel.name} — HP ${vessel.health}${vessel.droppedCollectibleId ? ' — drops loot' : ''}`}
          >
            <SpriteThumbnail sprite={vessel.customSprite} size={40} previewType="entity" />
            <span className="text-[11px] leading-tight truncate w-full text-center mt-1">{vessel.name}</span>
            <span className="text-[10px] text-stone-400">
              HP {vessel.health}{vessel.droppedCollectibleId && <span className="ml-1" title="Drops loot">💰</span>}
            </span>
          </button>
        ))}
      </div>
    )}
  </div>
);
