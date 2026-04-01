import React, { useState, useEffect } from 'react';
import type { StatusEffectAsset } from '../../types/game';
import { getStatusEffectAssets } from '../../utils/assetStorage';
import { SpriteThumbnail } from './SpriteThumbnail';

interface StatusEffectPickerProps {
  onSelect: (effect: StatusEffectAsset) => void;
  onCancel: () => void;
}

export const TYPE_COLORS: Record<string, string> = {
  poison: '#22c55e',
  regen: '#4ade80',
  sleep: '#6366f1',
  stun: '#eab308',
  shield: '#3b82f6',
  slow: '#f97316',
  haste: '#06b6d4',
  burn: '#ef4444',
  freeze: '#67e8f9',
  disarmed: '#a855f7',
  silenced: '#ec4899',
  polymorph: '#d946ef',
  deflect: '#f59e0b',
  stealth: '#6b7280',
  invulnerable: '#fcd34d',
  steadfast: '#78716c',
  reflect: '#06b6d4',
  bleed: '#dc2626',
};

export function getStatusEffectFlags(_effect: StatusEffectAsset): string[] {
  return [];
}

export const StatusEffectPicker: React.FC<StatusEffectPickerProps> = ({ onSelect, onCancel }) => {
  const [effects, setEffects] = useState<StatusEffectAsset[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEffects(getStatusEffectAssets());
  }, []);

  const filteredEffects = effects.filter(effect =>
    effect.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    effect.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-stone-800 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <h2 className="text-2xl font-bold mb-4">Select a Status Effect</h2>

        {/* Search */}
        <input
          type="text"
          placeholder="Search status effects..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 bg-stone-700 rounded text-parchment-100 mb-4"
          autoFocus
        />

        {/* Effect List */}
        <div className="flex-1 overflow-y-auto mb-4">
          {filteredEffects.length === 0 ? (
            <div className="text-center py-12 bg-stone-900 rounded-lg border-2 border-dashed border-stone-700">
              <p className="text-stone-400 mb-2">
                {searchTerm ? 'No status effects match your search' : 'No status effects created yet'}
              </p>
              <p className="text-sm text-stone-500">
                Go to the Status Effects tab to create effect assets
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredEffects.map((effect) => {
                const typeColor = TYPE_COLORS[effect.type] || '#9ca3af';
                const specialFlags = getStatusEffectFlags(effect);

                return (
                  <button
                    key={effect.id}
                    onClick={() => onSelect(effect)}
                    className="bg-stone-900 rounded-lg p-4 border-2 border-stone-700 hover:border-blue-500 transition-colors text-left"
                  >
                    {/* Effect Header */}
                    <div className="flex items-start gap-3 mb-2">
                      <SpriteThumbnail sprite={effect.iconSprite?.type === 'inline' ? effect.iconSprite.spriteData : undefined} size={48} className="rounded border border-stone-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{effect.name}</h3>
                        <div className="text-xs capitalize" style={{ color: typeColor }}>
                          {effect.type}
                        </div>
                      </div>
                      {/* Color indicator */}
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                        style={{ backgroundColor: typeColor }}
                      />
                    </div>

                    {/* Description */}
                    {effect.description && (
                      <p className="text-sm text-stone-400 mb-2 line-clamp-2">
                        {effect.description}
                      </p>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-stone-800 rounded px-2 py-1">
                        <span className="text-stone-400">Duration:</span>{' '}
                        <span className="text-parchment-100 font-semibold">{effect.defaultDuration} turns</span>
                      </div>
                      {effect.defaultValue !== undefined && (
                        <div className="bg-stone-800 rounded px-2 py-1">
                          <span className="text-stone-400">Value:</span>{' '}
                          <span className="text-parchment-100 font-semibold">{effect.defaultValue}</span>
                        </div>
                      )}
                      <div className="bg-stone-800 rounded px-2 py-1">
                        <span className="text-stone-400">Stacking:</span>{' '}
                        <span className="text-parchment-100 font-semibold capitalize">{effect.stackingBehavior}</span>
                      </div>
                    </div>

                    {/* Special Flags */}
                    {specialFlags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {specialFlags.map((flag) => (
                          <span
                            key={flag}
                            className="text-xs px-1.5 py-0.5 rounded bg-stone-800 text-stone-300"
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
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
