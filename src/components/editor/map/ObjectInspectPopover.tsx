// Object inspect popover (2026-07-17): click a placed object with the
// Object tool to fine-tune its per-placement offset with sliders/number
// inputs — the quick way to put two wall decorations at exactly the same
// height. Mirrors the entity inspect pattern: click inspects, removal
// lives on right-click / long-press / roster ✕ / the button here.
import React from 'react';
import type { PlacedObject } from '../../../types/game';
import { loadObject } from '../../../utils/assetStorage';
import { SpriteThumbnail } from '../SpriteThumbnail';

interface ObjectInspectPopoverProps {
  obj: PlacedObject;
  position: { x: number; y: number };
  /** Live-applies offsets (art px). The editor pushes ONE undo entry per popover session. */
  onSetOffsets: (offsetX: number, offsetY: number) => void;
  onRemove: () => void;
  onClose: () => void;
}

const AxisControl: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
}> = ({ label, value, onChange }) => (
  <div className="flex items-center gap-2 text-xs">
    <span className="w-3 text-stone-400">{label}</span>
    <input
      type="range" min={-24} max={24} step={1}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
      className="flex-1 accent-amber-500"
    />
    <input
      type="number" min={-24} max={24}
      value={value}
      onChange={(e) => {
        const v = parseInt(e.target.value);
        if (!Number.isNaN(v)) onChange(Math.max(-24, Math.min(24, v)));
      }}
      className="w-14 px-1.5 py-0.5 bg-stone-700 rounded tabular-nums"
    />
  </div>
);

export const ObjectInspectPopover: React.FC<ObjectInspectPopoverProps> = ({
  obj,
  position,
  onSetOffsets,
  onRemove,
  onClose,
}) => {
  const data = loadObject(obj.objectId);
  const ox = obj.offsetX ?? 0;
  const oy = obj.offsetY ?? 0;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-64 bg-stone-800 border border-stone-600 rounded-lg shadow-xl p-3"
        style={{
          left: Math.min(position.x, window.innerWidth - 272),
          top: Math.min(position.y + 10, window.innerHeight - 220),
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          {data?.customSprite ? (
            <SpriteThumbnail sprite={data.customSprite} size={40} previewType="entity" />
          ) : (
            <div className="w-10 h-10 rounded bg-amber-800" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate">{data?.name ?? obj.objectId}</div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-amber-600/20 text-amber-300 border-amber-500/40">
              Object
            </span>
          </div>
          <span className="text-[10px] text-stone-500">({obj.x + 1}, {obj.y + 1})</span>
        </div>

        <div className="space-y-2 mb-2">
          <div className="text-[10px] uppercase tracking-wide text-stone-500">Offset (art px)</div>
          <AxisControl label="X" value={ox} onChange={(v) => onSetOffsets(v, oy)} />
          <AxisControl label="Y" value={oy} onChange={(v) => onSetOffsets(ox, v)} />
          <div className="flex justify-between items-center">
            <p className="text-[10px] text-stone-500">
              Type the same Y to align a row. Stacks on the asset's own offset.
            </p>
            <button
              onClick={() => onSetOffsets(0, 0)}
              disabled={ox === 0 && oy === 0}
              className="px-2 py-0.5 text-[10px] bg-stone-700 hover:bg-stone-600 disabled:opacity-40 rounded"
            >
              Reset
            </button>
          </div>
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
