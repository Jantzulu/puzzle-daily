// Entity inspect popover (Phase 3): click a placed entity on the canvas
// (with an entity tool active) to see what it is without leaving the board —
// sprite, kind, HP, facing, behavior sequence, and a Remove button.
import React from 'react';
import type { EntranceRef, PlacedEnemy } from '../../../types/game';
import { getEnemy } from '../../../data/enemies';
import { SpriteThumbnail } from '../SpriteThumbnail';
import { formatActionSequence } from './Tooltips';

const FACING_ARROWS: Record<string, string> = {
  north: '↑', northeast: '↗', east: '→', southeast: '↘',
  south: '↓', southwest: '↙', west: '←', northwest: '↖',
};

const entranceKey = (r: EntranceRef) => `${r.kind}:${r.x}:${r.y}:${r.side}`;
const entranceLabel = (r: EntranceRef) =>
  `${r.kind === 'door' ? 'Door' : 'Hallway'} — (${r.x + 1}, ${r.y + 1}) ${r.side}`;

interface InspectPopoverProps {
  enemy: PlacedEnemy;
  kindLabel: 'Enemy' | 'Ally' | 'Vessel';
  position: { x: number; y: number };
  /** Valid door/hallway markers on the current board (validity pre-filtered). */
  entranceOptions: EntranceRef[];
  onSetEntrance: (ref: EntranceRef | undefined) => void;
  onSetRecurrence: (rec: { firstTurn: number; repeatEvery?: number } | undefined) => void;
  onRemove: () => void;
  onClose: () => void;
}

export const InspectPopover: React.FC<InspectPopoverProps> = ({
  enemy,
  kindLabel,
  position,
  entranceOptions,
  onSetEntrance,
  onSetRecurrence,
  onRemove,
  onClose,
}) => {
  const data = getEnemy(enemy.enemyId);
  const sequence = formatActionSequence(data?.behavior?.pattern);
  // Entrance assignment: offered only where the sprite opts in (walk-in
  // eligibility lives on the asset, the assignment on the placement).
  const sprite = data && 'customSprite' in data ? data.customSprite : undefined;
  const eligibleEntrances = entranceOptions.filter(r =>
    r.kind === 'door' ? !!sprite?.spawnFromDoor : !!sprite?.spawnFromHallway
  );
  const currentEntrance = enemy.entersFrom && eligibleEntrances.find(
    r => entranceKey(r) === entranceKey(enemy.entersFrom!)
  );

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

        {eligibleEntrances.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Enters from</div>
            <select
              value={currentEntrance ? entranceKey(currentEntrance) : ''}
              onChange={(e) => {
                const ref = eligibleEntrances.find(r => entranceKey(r) === e.target.value);
                onSetEntrance(ref);
              }}
              className="w-full px-2 py-1 bg-stone-700 rounded text-xs"
            >
              <option value="">Normal entrance</option>
              {eligibleEntrances.map(r => (
                <option key={entranceKey(r)} value={entranceKey(r)}>{entranceLabel(r)}</option>
              ))}
            </select>
            {enemy.entersFrom && !currentEntrance && (
              <p className="text-[10px] text-amber-400 mt-1">
                Assigned opening no longer exists — normal entrance will play.
              </p>
            )}
          </div>
        )}

        {/* Scheduled visitor (passerby v2): this placement becomes an inert
            template; win-exempt copies arrive on the cadence, walking in via
            the entrance above when assigned. */}
        {kindLabel !== 'Vessel' && (
          <div className="mb-2">
            <div className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Scheduled visitor</div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={!!enemy.recurrence}
                onChange={(e) => onSetRecurrence(e.target.checked ? { firstTurn: 1 } : undefined)}
                className="w-3.5 h-3.5"
              />
              <span>Arrives on a schedule (not present at start)</span>
            </label>
            {enemy.recurrence && (
              <>
                <div className="flex items-center gap-2 text-xs mt-1">
                  <label className="text-stone-400">First turn</label>
                  <input
                    type="number" min={1} max={999}
                    value={enemy.recurrence.firstTurn}
                    onChange={(e) => onSetRecurrence({
                      firstTurn: Math.max(1, parseInt(e.target.value) || 1),
                      repeatEvery: enemy.recurrence?.repeatEvery,
                    })}
                    className="w-14 px-1.5 py-0.5 bg-stone-700 rounded"
                  />
                  <label className="text-stone-400">Every</label>
                  <input
                    type="number" min={0} max={999}
                    value={enemy.recurrence.repeatEvery ?? 0}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 0;
                      onSetRecurrence({
                        firstTurn: enemy.recurrence!.firstTurn,
                        repeatEvery: v > 0 ? v : undefined,
                      });
                    }}
                    className="w-14 px-1.5 py-0.5 bg-stone-700 rounded"
                  />
                  <span className="text-stone-500">turns</span>
                </div>
                <p className="text-[10px] text-stone-500 mt-1">
                  Win-exempt visitors arrive on this cadence (Every 0 = one visit),
                  walking in via the entrance above when assigned. An occupied
                  arrival tile skips that visit.
                </p>
              </>
            )}
          </div>
        )}

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
