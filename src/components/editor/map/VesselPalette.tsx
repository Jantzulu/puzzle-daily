// Vessel palette — first-class tool (2026-07-14). Breakable statics; place
// exactly like enemies via the adapter. Extracted verbatim from
// MapEditor.tsx (Phase 1 decomposition).
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
      <div className="space-y-2 max-h-64 overflow-y-auto mt-2">
        {vessels.map(vessel => (
          <button
            key={vessel.id}
            onClick={() => onSelect(vessel.id)}
            className={`w-full p-2 rounded text-left flex items-center gap-2 ${
              selectedVesselId === vessel.id ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
            }`}
          >
            <SpriteThumbnail sprite={vessel.customSprite} size={32} previewType="entity" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{vessel.name}</div>
              <div className="text-xs text-stone-400">
                HP: {vessel.health}
                {vessel.droppedCollectibleId && <span className="ml-2">💰 drops loot</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
    )}
  </div>
);
