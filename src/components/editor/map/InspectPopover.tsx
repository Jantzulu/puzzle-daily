// Entity inspect popover (Phase 3): click a placed entity on the canvas
// (with an entity tool active) to see what it is without leaving the board —
// sprite, kind, HP, facing, behavior sequence, and a Remove button.
import React from 'react';
import type { PlacedEnemy } from '../../../types/game';
import { getEnemy } from '../../../data/enemies';
import { SpriteThumbnail } from '../SpriteThumbnail';
import { formatActionSequence } from './Tooltips';

const FACING_ARROWS: Record<string, string> = {
  north: '↑', northeast: '↗', east: '→', southeast: '↘',
  south: '↓', southwest: '↙', west: '←', northwest: '↖',
};

interface InspectPopoverProps {
  enemy: PlacedEnemy;
  kindLabel: 'Enemy' | 'Ally' | 'Vessel';
  position: { x: number; y: number };
  onRemove: () => void;
  onClose: () => void;
}

export const InspectPopover: React.FC<InspectPopoverProps> = ({
  enemy,
  kindLabel,
  position,
  onRemove,
  onClose,
}) => {
  const data = getEnemy(enemy.enemyId);
  const sequence = formatActionSequence(data?.behavior?.pattern);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-60 bg-stone-800 border border-stone-600 rounded-lg shadow-xl p-3"
        style={{
          left: Math.min(position.x, window.innerWidth - 256),
          top: Math.min(position.y + 10, window.innerHeight - 280),
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          {data && 'customSprite' in data && data.customSprite ? (
            <SpriteThumbnail sprite={data.customSprite} size={40} previewType="entity" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-red-500" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate">
              {data?.name ?? enemy.enemyId}
              {data?.isNoble && <span className="ml-1 text-[10px] text-copper-300 font-medium">NOBLE</span>}
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
              kindLabel === 'Ally' ? 'bg-moss-600/20 text-moss-300 border-moss-500/40' :
              kindLabel === 'Vessel' ? 'bg-amber-600/20 text-amber-300 border-amber-500/40' :
              'bg-red-600/20 text-red-300 border-red-500/40'
            }`}>
              {kindLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-parchment-300 mb-2">
          <span>HP {enemy.currentHealth}{data?.health != null ? ` / ${data.health}` : ''}</span>
          <span title={`Facing ${enemy.facing ?? 'unset'}`}>Facing {enemy.facing ? (FACING_ARROWS[enemy.facing] ?? enemy.facing) : '—'}</span>
          <span className="text-stone-500">({enemy.x + 1}, {enemy.y + 1})</span>
        </div>

        <div className="bg-stone-900/60 rounded p-2 mb-2 max-h-36 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Behavior</div>
          {sequence.map((line, i) => (
            <div key={i} className="text-xs text-parchment-300">{line}</div>
          ))}
        </div>

        <button
          onClick={onRemove}
          className="w-full px-2 py-1.5 text-xs bg-blood-600/60 hover:bg-blood-600 rounded text-red-100"
        >
          ✕ Remove from map
        </button>
      </div>
    </>
  );
};
