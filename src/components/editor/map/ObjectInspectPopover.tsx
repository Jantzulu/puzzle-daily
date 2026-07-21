// Object inspect popover (2026-07-17): click a placed object with the
// Object tool to fine-tune its per-placement offset with sliders/number
// inputs — the quick way to put two wall decorations at exactly the same
// height. Mirrors the entity inspect pattern: click inspects, removal
// lives on right-click / long-press / roster ✕ / the button here.
import React from 'react';
import type { PlacedObject } from '../../../types/game';
import { loadObject } from '../../../utils/assetStorage';
import { SpriteThumbnail } from '../SpriteThumbnail';

export interface ObjectSchedule {
  spawnTurn?: number;
  despawnTurn?: number;
  repeatEvery?: number;
}

interface ObjectInspectPopoverProps {
  obj: PlacedObject;
  position: { x: number; y: number };
  /** Live-applies offsets (art px). The editor pushes ONE undo entry per popover session. */
  onSetOffsets: (offsetX: number, offsetY: number) => void;
  /** Live-applies the spawn/despawn/repeat schedule (same one-undo-per-session rule). */
  onSetSchedule: (schedule: ObjectSchedule) => void;
  onRemove: () => void;
  onClose: () => void;
}

// ±48 art px (2 tiles): enough reach to tuck art deep into a side
// corridor (48px) from its mouth tile. Drag stays half-tile by
// construction — the sliders are the long-reach tool.
const OFFSET_MAX = 48;

const AxisControl: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
}> = ({ label, value, onChange }) => (
  <div className="flex items-center gap-2 text-xs">
    <span className="w-3 text-stone-400">{label}</span>
    <input
      type="range" min={-OFFSET_MAX} max={OFFSET_MAX} step={1}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
      className="flex-1 accent-amber-500"
    />
    <input
      type="number" min={-OFFSET_MAX} max={OFFSET_MAX}
      value={value}
      onChange={(e) => {
        const v = parseInt(e.target.value);
        if (!Number.isNaN(v)) onChange(Math.max(-OFFSET_MAX, Math.min(OFFSET_MAX, v)));
      }}
      className="w-14 px-1.5 py-0.5 bg-stone-700 rounded tabular-nums"
    />
  </div>
);

// Blank = lever off (undefined). Values clamp to >= min so "appears at
// turn 0" can't be authored (that's just the blank default).
const TurnInput: React.FC<{
  label: string;
  value: number | undefined;
  min: number;
  disabled?: boolean;
  title?: string;
  onChange: (v: number | undefined) => void;
}> = ({ label, value, min, disabled, title, onChange }) => (
  <label className={`flex items-center justify-between gap-2 text-xs ${disabled ? 'opacity-40' : ''}`} title={title}>
    <span className="text-stone-400">{label}</span>
    <input
      type="number" min={min} placeholder="—"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === '') { onChange(undefined); return; }
        const v = parseInt(e.target.value);
        if (!Number.isNaN(v)) onChange(Math.max(min, v));
      }}
      className="w-14 px-1.5 py-0.5 bg-stone-700 rounded tabular-nums"
    />
  </label>
);

export const ObjectInspectPopover: React.FC<ObjectInspectPopoverProps> = ({
  obj,
  position,
  onSetOffsets,
  onSetSchedule,
  onRemove,
  onClose,
}) => {
  const data = loadObject(obj.objectId);
  const ox = obj.offsetX ?? 0;
  const oy = obj.offsetY ?? 0;
  const schedule: ObjectSchedule = {
    spawnTurn: obj.spawnTurn,
    despawnTurn: obj.despawnTurn,
    repeatEvery: obj.repeatEvery,
  };
  // repeatEvery is meaningless without a bounded window; keep the stored
  // value from silently going stale by dropping it when despawn clears.
  const setSchedule = (patch: Partial<ObjectSchedule>) => {
    const next = { ...schedule, ...patch };
    if (next.despawnTurn === undefined) next.repeatEvery = undefined;
    onSetSchedule(next);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-64 bg-stone-800 border border-stone-600 rounded-lg shadow-xl p-3"
        style={{
          left: Math.min(position.x, window.innerWidth - 272),
          top: Math.min(position.y + 10, window.innerHeight - 360),
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

        {/* Object spawn levers (2026-07-21): per-placement schedule for
            ambient theater. Blank inputs = the default (on board from load,
            stays forever). Setup is turn 0; turns dawn like scheduled
            visitors, so "Appears" 3 shows the moment turn 3 begins and
            "Disappears" is exclusive at its dawn. */}
        <div className="space-y-1.5 mb-2 pt-2 border-t border-stone-700">
          <div className="text-[10px] uppercase tracking-wide text-stone-500">Schedule (turns)</div>
          <TurnInput
            label="Appears at turn"
            value={schedule.spawnTurn}
            min={1}
            title="Blank = on the board from load"
            onChange={(v) => setSchedule({ spawnTurn: v })}
          />
          <TurnInput
            label="Disappears at turn"
            value={schedule.despawnTurn}
            min={Math.max(1, (schedule.spawnTurn ?? 0) + 1)}
            title="Blank = never leaves. Gone the moment this turn starts"
            onChange={(v) => setSchedule({ despawnTurn: v })}
          />
          <TurnInput
            label="Repeats every"
            value={schedule.repeatEvery}
            min={1}
            disabled={schedule.despawnTurn === undefined}
            title={schedule.despawnTurn === undefined
              ? 'Set a disappear turn first — repeating needs a bounded window'
              : 'The appear/disappear window repeats on this cadence'}
            onChange={(v) => setSchedule({ repeatEvery: v })}
          />
          <p className="text-[10px] text-stone-500">
            Blank = always there. Playtest to see it; the editor board shows every object.
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
