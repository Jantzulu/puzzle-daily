import React from 'react';
import { soundLength, type SynthSound } from '../../../utils/synth/types';
import { envelopePoints, REFERENCE } from './forgeModel';
import type { SoundPicture } from './soundPreview';

// The picture of a sound: its waveform on top (what comes out), and under
// it one bar per layer showing when that layer plays and how its loudness
// rises and falls. Seeing a knock (a wall at the left) next to a breath (a
// slope) is most of learning what the numbers do.

const LABEL_W = 'w-24 md:w-32';

/** How loud the sound is next to the reference, in words and as a bar. */
export const LoudnessMeter: React.FC<{ picture: SoundPicture | null }> = ({ picture }) => {
  const ratio = picture ? picture.loudness / REFERENCE.loudness : 0;
  // The bar runs from a quarter of the reference to eight times it, evenly
  // per doubling (how loudness is heard); the reference sits at 2/5.
  const LOW = 0.25;
  const HIGH = 8;
  const place = (r: number) => Math.min(1, Math.max(0, Math.log(r / LOW) / Math.log(HIGH / LOW)));
  const peak = picture?.peak ?? 0;
  const verdict = !picture || picture.loudness === 0
    ? 'Silent'
    : peak >= 0.95
      ? 'It will distort: lower the Level'
      : ratio > 3
        ? 'Loud for a page sound'
        : ratio < 0.4
          ? 'Very quiet'
          : 'In the range of the page sounds';
  const tone = peak >= 0.95 ? 'text-blood-300' : ratio > 3 ? 'text-copper-300' : 'text-moss-300';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <div className="text-stone-400">
        Loudness: <span className="text-parchment-100 tabular-nums">{ratio ? ratio.toFixed(1) : '0'}×</span> {REFERENCE.name}
      </div>
      <div className="relative h-2 w-40 rounded bg-stone-800 border border-stone-700" title="Left: quieter. Right: louder. The mark is the reference.">
        <div className="absolute inset-y-0 w-px bg-stone-400" style={{ left: `${place(1) * 100}%` }} />
        {ratio > 0 && (
          <div
            className={`absolute top-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm ${peak >= 0.95 ? 'bg-blood-400' : 'bg-arcane-400'}`}
            style={{ left: `${place(ratio) * 100}%` }}
          />
        )}
      </div>
      <div className={tone}>{verdict}</div>
      <div className="text-stone-500 tabular-nums">peak {peak.toFixed(3)}</div>
    </div>
  );
};

// DRAGGING (user ask 2026-11-15: move, lengthen and shorten layers by
// handling the bars, "like editing a video timeline on the iphone").
//   the bar itself   slides the layer earlier or later
//   its left end     moves where it starts, keeping where it ends
//   its right end    moves where it ends
// The timeline keeps a little empty room on the right to pull into, and
// holds its scale still while a finger is down, so the bar stays under it.
type DragMode = 'move' | 'left' | 'right';
interface Drag {
  mode: DragMode;
  layerId: string;
  /** One id per drag, so the whole drag is a single undo step. */
  id: string;
  x: number;
  start: number;
  length: number;
  secondsPerPx: number;
}

/** How wide an end's grab area is (px), and the limits a drag keeps to. */
const GRIP = 14;
const MIN_LENGTH = 0.003;
const MAX_START = 2;
const MAX_LENGTH = 3;
const toMs = (seconds: number) => Math.round(seconds * 1000) / 1000;

export const ForgeTimeline: React.FC<{
  sound: SynthSound;
  picture: SoundPicture | null;
  selectedId: string | null;
  onSelect: (layerId: string) => void;
  onToggleMute: (layerId: string) => void;
  onSolo: (layerId: string) => void;
  /** A bar was dragged: the layer's new start and length (s). */
  onDragLayer: (layerId: string, change: { start: number; length: number }, dragId: string) => void;
}> = ({ sound, picture, selectedId, onSelect, onToggleMute, onSolo, onDragLayer }) => {
  const natural = Math.max(0.001, soundLength(sound));
  // Room on the right to drag into; frozen while a drag is under way.
  const [frozen, setFrozen] = React.useState<number | null>(null);
  const total = Math.max(natural, frozen ?? Math.max(natural * 1.12, natural + 0.03));

  // The track's width in px, to turn a finger's travel into seconds.
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = React.useState(0);
  React.useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => setTrackWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const drag = React.useRef<Drag | null>(null);
  const begin = (e: React.PointerEvent<HTMLElement>, layerId: string, mode: DragMode, start: number, length: number) => {
    if (e.button !== 0 || !(trackWidth > 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, layerId, id: `drag-${layerId}-${e.timeStamp}`, x: e.clientX, start, length, secondsPerPx: total / trackWidth };
    setFrozen(total);
    onSelect(layerId);
  };
  const move = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dt = (e.clientX - d.x) * d.secondsPerPx;
    if (Math.abs(e.clientX - d.x) < 2) return; // a tap, not a drag
    let start = d.start;
    let length = d.length;
    if (d.mode === 'move') {
      start = Math.min(MAX_START, Math.max(0, d.start + dt));
    } else if (d.mode === 'left') {
      const end = d.start + d.length;
      start = Math.min(end - MIN_LENGTH, Math.max(0, end - MAX_LENGTH, d.start + dt));
      length = end - start;
    } else {
      length = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, d.length + dt));
    }
    onDragLayer(d.layerId, { start: toMs(start), length: Math.max(MIN_LENGTH, toMs(length)) }, d.id);
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    setFrozen(null);
  };

  const columns = picture?.low.length ?? 0;
  // Drawn to fit: the tallest moment fills the height, so a quiet sound
  // still shows its shape. The meter says how loud it really is.
  const fit = picture && picture.peak > 0 ? 46 / picture.peak : 0;
  let wave = '';
  if (picture) {
    for (let c = 0; c < columns; c++) {
      wave += `M${c} ${(50 - picture.high[c] * fit).toFixed(1)}V${(50 - picture.low[c] * fit).toFixed(1)}`;
    }
  }
  // A tick every 100ms (every 250ms on long sounds, finer on short ones).
  const every = total > 1.2 ? 0.25 : total > 0.25 ? 0.1 : total > 0.06 ? 0.02 : 0.005;
  const ticks: number[] = [];
  for (let t = 0; t <= total + 1e-6; t += every) ticks.push(t);

  const grab = { touchAction: 'pan-y' } as const; // sideways belongs to the drag, up and down still scrolls

  return (
    <div className="border border-stone-700 rounded overflow-hidden select-none">
      <div className="flex bg-stone-900">
        <div className={`${LABEL_W} shrink-0 px-2 py-1 text-[11px] text-stone-500 border-r border-stone-700`}>
          The whole sound
          <div className="text-stone-600">drawn to fit</div>
        </div>
        <div ref={trackRef} className="relative flex-1 h-20">
          {ticks.map(t => (
            <div key={t} className="absolute inset-y-0 border-l border-stone-800" style={{ left: `${(t / total) * 100}%` }}>
              <span className="absolute bottom-0 left-1 text-[9px] text-stone-600 tabular-nums">{Math.round(t * 1000)}</span>
            </div>
          ))}
          {/* Where the sound ends; the room to its right is for dragging into. */}
          <div className="absolute inset-y-0 border-l border-dashed border-stone-600" style={{ left: `${(natural / total) * 100}%` }} />
          {columns > 0 && (
            <svg
              className="absolute inset-y-0 left-0 h-full" style={{ width: `${(Math.min(natural, picture?.length ?? natural) / total) * 100}%` }}
              viewBox={`0 0 ${columns} 100`} preserveAspectRatio="none" aria-hidden="true"
            >
              <path d={wave} stroke="#a78bfa" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          <span className="absolute top-0.5 right-1 text-[9px] text-stone-600">ms</span>
        </div>
      </div>
      <div className="md:max-h-[38vh] md:overflow-y-auto">
      {sound.layers.map(layer => {
        const selected = layer.id === selectedId;
        const points = envelopePoints(layer)
          .map(([t, v]) => `${((t / Math.max(0.0001, layer.length)) * 100).toFixed(2)},${(100 - v * 92).toFixed(1)}`)
          .join(' ');
        const barPx = (layer.length / total) * trackWidth;
        const startPx = (layer.start / total) * trackWidth;
        // A wide bar has its grips inside its ends. A narrow one would have
        // nothing left to slide by, so its grips sit just outside it.
        const inside = barPx >= GRIP * 3;
        const handlers = (mode: DragMode) => ({
          onPointerDown: (e: React.PointerEvent<HTMLElement>) => begin(e, layer.id, mode, layer.start, layer.length),
          onPointerMove: move,
          onPointerUp: end,
          onPointerCancel: end,
        });
        return (
          <div key={layer.id} className={`flex border-t border-stone-700/60 ${selected ? 'bg-stone-800' : 'hover:bg-stone-800/50'}`}>
            <div className={`${LABEL_W} shrink-0 flex items-center gap-1 px-1.5 border-r border-stone-700`}>
              <button
                type="button"
                onClick={() => onSelect(layer.id)}
                className={`flex-1 min-w-0 truncate text-left text-xs py-1.5 ${selected ? 'text-parchment-100' : 'text-stone-300'} ${layer.muted ? 'line-through opacity-50' : ''}`}
                title={`${layer.name} (${layer.source})`}
              >
                {layer.name}
              </button>
              <button
                type="button" onClick={() => onSolo(layer.id)}
                className="px-1 text-[11px] text-stone-400 hover:text-parchment-100" title="Hear this layer alone" aria-label={`Hear ${layer.name} alone`}
              >
                ▶
              </button>
              <button
                type="button" onClick={() => onToggleMute(layer.id)}
                className={`px-1 text-[11px] ${layer.muted ? 'text-blood-300' : 'text-stone-500 hover:text-parchment-100'}`}
                title={layer.muted ? 'Muted: click to bring it back' : 'Mute this layer'} aria-pressed={!!layer.muted} aria-label={`Mute ${layer.name}`}
              >
                M
              </button>
            </div>
            <div className="relative flex-1 h-9" onPointerDown={() => onSelect(layer.id)}>
              <div
                className={`group absolute inset-y-1 rounded-sm ${layer.muted ? 'opacity-30' : ''} ${selected ? 'bg-arcane-900/60 border border-arcane-500' : 'bg-stone-700/50 border border-stone-600'}`}
                style={{ left: `${(layer.start / total) * 100}%`, width: `${(layer.length / total) * 100}%`, minWidth: 3 }}
              >
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <polygon points={`0,100 ${points} 100,100`} fill={layer.source === 'tone' ? '#d4a574' : '#a78bfa'} opacity="0.55" />
                </svg>
                {/* The bar: slide the whole layer. */}
                <div
                  {...handlers('move')}
                  className="absolute -inset-y-1 inset-x-0 cursor-grab active:cursor-grabbing"
                  style={grab}
                  title="Drag to move this layer earlier or later"
                />
                {/* Its ends: make it start or end somewhere else. */}
                {(inside || startPx >= GRIP) && (
                  <div
                    {...handlers('left')}
                    className="absolute -inset-y-1 cursor-ew-resize flex items-center justify-center"
                    style={{ ...grab, width: GRIP, left: inside ? 0 : -GRIP }}
                    title="Drag to change where this layer starts"
                  >
                    <span className={`w-[3px] h-3/5 rounded-full ${selected ? 'bg-arcane-300' : 'bg-stone-400 opacity-0 group-hover:opacity-100'}`} />
                  </div>
                )}
                <div
                  {...handlers('right')}
                  className="absolute -inset-y-1 cursor-ew-resize flex items-center justify-center"
                  style={{ ...grab, width: GRIP, right: inside ? 0 : -GRIP }}
                  title="Drag to change where this layer ends"
                >
                  <span className={`w-[3px] h-3/5 rounded-full ${selected ? 'bg-arcane-300' : 'bg-stone-400 opacity-0 group-hover:opacity-100'}`} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
      </div>
      <div className="flex flex-wrap gap-x-3 px-2 py-1 border-t border-stone-700/60 text-[10px] text-stone-500 bg-stone-900">
        <span><span className="inline-block w-2 h-2 rounded-sm align-middle mr-1" style={{ background: '#a78bfa' }} />noise</span>
        <span><span className="inline-block w-2 h-2 rounded-sm align-middle mr-1" style={{ background: '#d4a574' }} />tone</span>
        <span>Each bar is a layer, and the shape inside is its loudness. Drag a bar to move it; drag its ends to make it longer or shorter.</span>
      </div>
    </div>
  );
};
