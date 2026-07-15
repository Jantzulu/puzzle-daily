// Placed-entity roster (Phase 2, 2026-07-14): everything currently on the
// board in one list — enemies/allies/vessels, objects, items. Hovering a row
// highlights its tile on the canvas; ✕ removes the placement (undoable).
import React from 'react';
import type { PlacedEnemy, PlacedCollectible, PlacedObject } from '../../../types/game';
import { getEnemy } from '../../../data/enemies';
import { loadObject, loadCollectible } from '../../../utils/assetStorage';
import { SpriteThumbnail } from '../SpriteThumbnail';

export type RosterKind = 'enemy' | 'object' | 'collectible';

interface PlacedRosterProps {
  enemies: PlacedEnemy[];
  placedObjects: PlacedObject[];
  collectibles: PlacedCollectible[];
  allyIds: Set<string>;
  vesselIds: Set<string>;
  onHoverTile: (tile: { x: number; y: number } | null) => void;
  onRemove: (kind: RosterKind, index: number) => void;
}

const badgeClass = 'text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0';

export const PlacedRoster: React.FC<PlacedRosterProps> = ({
  enemies,
  placedObjects,
  collectibles,
  allyIds,
  vesselIds,
  onHoverTile,
  onRemove,
}) => {
  const total = enemies.length + placedObjects.length + collectibles.length;

  const row = (
    key: string,
    kind: RosterKind,
    index: number,
    x: number,
    y: number,
    name: string,
    thumb: React.ReactNode,
    badge?: React.ReactNode,
  ) => (
    <div
      key={key}
      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-stone-700 group"
      onMouseEnter={() => onHoverTile({ x, y })}
      onMouseLeave={() => onHoverTile(null)}
    >
      <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">{thumb}</div>
      <span className="text-sm truncate flex-1 min-w-0">{name}</span>
      {badge}
      <span className="text-xs text-stone-500 flex-shrink-0">({x + 1}, {y + 1})</span>
      <button
        onClick={() => { onHoverTile(null); onRemove(kind, index); }}
        className="px-1.5 py-0.5 rounded text-xs text-stone-500 hover:text-red-300 hover:bg-blood-600/40 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove from map"
      >
        ✕
      </button>
    </div>
  );

  return (
    <div className="bg-stone-800 p-3 rounded">
      <h2 className="text-sm font-semibold mb-1 px-2">On the Board ({total})</h2>
      {total === 0 ? (
        <p className="text-xs text-stone-500 px-2 pb-1">Nothing placed yet — pick a tool and click the map.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {enemies.map((enemy, i) => {
            const data = getEnemy(enemy.enemyId);
            const isAlly = allyIds.has(enemy.enemyId);
            const isVessel = vesselIds.has(enemy.enemyId);
            return row(
              `e${i}`,
              'enemy',
              i,
              enemy.x,
              enemy.y,
              data?.name ?? enemy.enemyId,
              data && 'customSprite' in data && data.customSprite
                ? <SpriteThumbnail sprite={data.customSprite} size={24} previewType="entity" />
                : <div className="w-4 h-4 rounded-full bg-red-500" />,
              isAlly ? (
                <span className={`${badgeClass} bg-moss-600/20 text-moss-300 border-moss-500/40`}>Ally</span>
              ) : isVessel ? (
                <span className={`${badgeClass} bg-amber-600/20 text-amber-300 border-amber-500/40`}>Vessel</span>
              ) : undefined,
            );
          })}
          {placedObjects.map((obj, i) => {
            const data = loadObject(obj.objectId);
            return row(
              `o${i}`,
              'object',
              i,
              obj.x,
              obj.y,
              data?.name ?? obj.objectId,
              data?.customSprite
                ? <SpriteThumbnail sprite={data.customSprite} size={24} previewType="asset" />
                : <div className="w-4 h-4 bg-amber-800 rounded-sm" />,
              <span className={`${badgeClass} bg-stone-600/30 text-stone-300 border-stone-500/40`}>Object</span>,
            );
          })}
          {collectibles.map((coll, i) => {
            const data = coll.collectibleId ? loadCollectible(coll.collectibleId) : null;
            return row(
              `c${i}`,
              'collectible',
              i,
              coll.x,
              coll.y,
              data?.name ?? 'Coin (legacy)',
              data?.customSprite
                ? <SpriteThumbnail sprite={data.customSprite} size={24} previewType="asset" />
                : <span className="text-yellow-400 text-sm">⭐</span>,
              <span className={`${badgeClass} bg-yellow-600/20 text-yellow-300 border-yellow-500/40`}>Item</span>,
            );
          })}
        </div>
      )}
    </div>
  );
};
