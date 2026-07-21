// Collectible inspect popover (2026-07-21): click a placed collectible
// with the Item tool to author a DELIVERY — the item tossed in from an
// opening on a known turn, with an optional pickup deadline and repeat
// cadence. Mirrors the object popover's session rules: click inspects,
// removal lives on right-click / long-press / the button here, one undo
// entry per popover session.
import React from 'react';
import type { PlacedCollectible, DeliveryConfig, EntranceRef } from '../../../types/game';
import { loadCollectible } from '../../../utils/assetStorage';
import { SpriteThumbnail } from '../SpriteThumbnail';
import { TurnInput } from './ObjectInspectPopover';

interface CollectibleInspectPopoverProps {
  col: PlacedCollectible;
  position: { x: number; y: number };
  /** Valid openings for the toss origin (stale markers already filtered). */
  entranceOptions: EntranceRef[];
  /** Live-applies the delivery config (one undo per popover session). */
  onSetDelivery: (delivery: DeliveryConfig | undefined) => void;
  onRemove: () => void;
  onClose: () => void;
}

const entranceKey = (r: EntranceRef) => `${r.kind}:${r.x},${r.y},${r.side}`;
const entranceLabel = (r: EntranceRef) =>
  `${r.kind === 'door' ? 'Door' : 'Hallway'} (${r.x + 1}, ${r.y + 1}) ${r.side}`;

export const CollectibleInspectPopover: React.FC<CollectibleInspectPopoverProps> = ({
  col,
  position,
  entranceOptions,
  onSetDelivery,
  onRemove,
  onClose,
}) => {
  const data = col.collectibleId ? loadCollectible(col.collectibleId) : null;
  const d = col.delivery;
  // Clearing the arrival turn clears the whole delivery; clearing the
  // deadline drops the cadence with it (repeat needs a bounded window).
  const patch = (p: Partial<DeliveryConfig>) => {
    const next = { ...(d ?? { arriveTurn: 1 }), ...p };
    if (p.arriveTurn === undefined && 'arriveTurn' in p) { onSetDelivery(undefined); return; }
    if (next.deadlineTurn === undefined) next.repeatEvery = undefined;
    onSetDelivery(next);
  };
  const selectedEntrance = d?.entersFrom ? entranceKey(d.entersFrom) : '';
  const staleEntrance = d?.entersFrom && !entranceOptions.some(o => entranceKey(o) === selectedEntrance);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-64 bg-stone-800 border border-stone-600 rounded-lg shadow-xl p-3"
        style={{
          left: Math.min(position.x, window.innerWidth - 272),
          top: Math.min(position.y + 10, window.innerHeight - 340),
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          {data?.customSprite ? (
            <SpriteThumbnail sprite={data.customSprite} size={40} previewType="asset" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-yellow-600" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate">{data?.name ?? (col.type === 'gem' ? 'Gem' : 'Coin')}</div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-yellow-600/20 text-yellow-300 border-yellow-500/40">
              Item
            </span>
          </div>
          <span className="text-[10px] text-stone-500">({col.x + 1}, {col.y + 1})</span>
        </div>

        {/* Delivery (2026-07-21): blank arrival = an ordinary item, on the
            board from load. Turns dawn like the object schedule: "Arrives" 3
            lands the moment turn 3 begins; "Vanishes" is exclusive at its
            dawn — the pickup deadline. One-shot deliveries that miss are
            missed forever, and a missed required item is a defeat. */}
        <div className="space-y-1.5 mb-2 pt-2 border-t border-stone-700">
          <div className="text-[10px] uppercase tracking-wide text-stone-500">Delivery (turns)</div>
          <TurnInput
            label="Arrives at turn"
            value={d?.arriveTurn}
            min={1}
            title="Blank = an ordinary item, on the board from load"
            onChange={(v) => patch({ arriveTurn: v })}
          />
          <TurnInput
            label="Vanishes at turn"
            value={d?.deadlineTurn}
            min={Math.max(1, (d?.arriveTurn ?? 0) + 1)}
            disabled={d === undefined}
            title={d === undefined
              ? 'Set an arrival turn first'
              : 'Pickup deadline — gone the moment this turn starts. A missed one-shot is missed forever; if a win condition needs it, that is a defeat'}
            onChange={(v) => patch({ deadlineTurn: v })}
          />
          <TurnInput
            label="Repeats every"
            value={d?.repeatEvery}
            min={1}
            disabled={d?.deadlineTurn === undefined}
            title={d?.deadlineTurn === undefined
              ? 'Set a vanish turn first — repeating needs a bounded window'
              : 'A missed window re-arrives on this cadence until collected'}
            onChange={(v) => patch({ repeatEvery: v })}
          />
          <label className={`flex items-center justify-between gap-2 text-xs ${d === undefined ? 'opacity-40' : ''}`}>
            <span className="text-stone-400">Tossed in from</span>
            <select
              value={selectedEntrance}
              disabled={d === undefined}
              onChange={(e) => {
                const found = entranceOptions.find(o => entranceKey(o) === e.target.value);
                patch({ entersFrom: found });
              }}
              className="w-32 px-1.5 py-0.5 bg-stone-700 rounded text-xs"
            >
              <option value="">Nearest opening</option>
              {entranceOptions.map(o => (
                <option key={entranceKey(o)} value={entranceKey(o)}>{entranceLabel(o)}</option>
              ))}
              {staleEntrance && (
                <option value={selectedEntrance}>⚠ stale opening</option>
              )}
            </select>
          </label>
          {staleEntrance && (
            <p className="text-[10px] text-amber-400">
              The assigned opening no longer exists — the toss falls back to the nearest one.
            </p>
          )}
          <p className="text-[10px] text-stone-500">
            The board shows a ghost + arrival turn until it lands. Playtest to see the toss.
          </p>
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
