import React, { useState, useEffect } from 'react';
import type { SpellAsset, Direction } from '../../types/game';
import { getSpellAssets } from '../../utils/assetStorage';

interface SpellPickerProps {
  onSelect: (spell: SpellAsset) => void;
  onCancel: () => void;
}

export const SpellPicker: React.FC<SpellPickerProps> = ({ onSelect, onCancel }) => {
  const [spells, setSpells] = useState<SpellAsset[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setSpells(getSpellAssets());
  }, []);

  const filteredSpells = spells.filter(spell =>
    spell.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    spell.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getDirectionDisplay = (spell: SpellAsset): string => {
    if (spell.directionMode === 'current_facing') return 'Follows caster';
    if (spell.directionMode === 'all_directions') return 'All directions (360°)';
    if (spell.directionMode === 'relative') return `Relative: ${spell.relativeDirections?.length || 0} direction(s)`;
    return `Fixed: ${spell.defaultDirections?.length || 0} direction(s)`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-stone-800 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <h2 className="text-2xl font-bold mb-4">Select a Spell</h2>

        {/* Search */}
        <input
          type="text"
          placeholder="Search spells..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 bg-stone-700 rounded text-parchment-100 mb-4"
          autoFocus
        />

        {/* Spell List */}
        <div className="flex-1 overflow-y-auto mb-4">
          {filteredSpells.length === 0 ? (
            <div className="text-center py-12 bg-stone-900 rounded-lg border-2 border-dashed border-stone-700">
              <p className="text-stone-400 mb-2">
                {searchTerm ? 'No spells match your search' : 'No spells created yet'}
              </p>
              <p className="text-sm text-stone-500">
                Go to the Spells tab to create spell assets
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredSpells.map((spell) => (
                <button
                  key={spell.id}
                  onClick={() => onSelect(spell)}
                  className="bg-stone-900 rounded-lg p-4 border-2 border-stone-700 hover:border-blue-500 transition-colors text-left"
                >
                  {/* Spell Header */}
                  <div className="flex items-start gap-3 mb-2">
                    {spell.thumbnailIcon ? (
                      <img
                        src={spell.thumbnailIcon}
                        alt={spell.name}
                        className="w-12 h-12 object-contain bg-stone-800 rounded border border-stone-600"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-stone-800 rounded border border-stone-600 flex items-center justify-center text-stone-500 text-xs">
                        No Icon
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{spell.name}</h3>
                      <div className="text-xs text-stone-400 capitalize">
                        {spell.templateType.replace('_', ' ')}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {spell.description && (
                    <p className="text-sm text-stone-400 mb-2 line-clamp-2">
                      {spell.description}
                    </p>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-stone-800 rounded px-2 py-1">
                      <span className="text-stone-400">Damage:</span>{' '}
                      <span className="text-parchment-100 font-semibold">{spell.damage}</span>
                    </div>
                    {spell.range && (
                      <div className="bg-stone-800 rounded px-2 py-1">
                        <span className="text-stone-400">Range:</span>{' '}
                        <span className="text-parchment-100 font-semibold">{spell.range}</span>
                      </div>
                    )}
                    {spell.radius && (
                      <div className="bg-stone-800 rounded px-2 py-1">
                        <span className="text-stone-400">Radius:</span>{' '}
                        <span className="text-parchment-100 font-semibold">{spell.radius}</span>
                      </div>
                    )}
                  </div>

                  {/* Direction Info */}
                  <div className="text-xs text-stone-400 mt-2">
                    <span className="font-semibold">Direction:</span> {getDirectionDisplay(spell)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cancel Button */}
        <button
          onClick={onCancel}
          className="w-full px-4 py-2 bg-stone-600 rounded hover:bg-stone-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
