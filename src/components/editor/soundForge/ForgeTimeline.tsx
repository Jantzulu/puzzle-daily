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

export const ForgeTimeline: React.FC<{
  sound: SynthSound;
  picture: SoundPicture | null;
  selectedId: string | null;
  onSelect: (layerId: string) => void;
  onToggleMute: (layerId: string) => void;
  onSolo: (layerId: string) => void;
}> = ({ sound, picture, selectedId, onSelect, onToggleMute, onSolo }) => {
  const total = Math.max(0.001, soundLength(sound));
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
  // A tick every 100ms (every 250ms on long sounds).
  const every = total > 1.2 ? 0.25 : total > 0.25 ? 0.1 : total > 0.06 ? 0.02 : 0.005;
  const ticks: number[] = [];
  for (let t = 0; t <= total + 1e-6; t += every) ticks.push(t);

  return (
    <div className="border border-stone-700 rounded overflow-hidden">
      <div className="flex bg-stone-900">
        <div className={`${LABEL_W} shrink-0 px-2 py-1 text-[11px] text-stone-500 border-r border-stone-700`}>
          The whole sound
          <div className="text-stone-600">drawn to fit</div>
        </div>
        <div className="relative flex-1 h-20">
          {ticks.map(t => (
            <div key={t} className="absolute inset-y-0 border-l border-stone-800" style={{ left: `${(t / total) * 100}%` }}>
              <span className="absolute bottom-0 left-1 text-[9px] text-stone-600 tabular-nums">{Math.round(t * 1000)}</span>
            </div>
          ))}
          {columns > 0 && (
            <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${columns} 100`} preserveAspectRatio="none" aria-hidden="true">
              <path d={wave} stroke="#a78bfa" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          <span className="absolute top-0.5 right-1 text-[9px] text-stone-600">ms</span>
        </div>
      </div>
      {sound.layers.map(layer => {
        const selected = layer.id === selectedId;
        const points = envelopePoints(layer)
          .map(([t, v]) => `${((t / Math.max(0.0001, layer.length)) * 100).toFixed(2)},${(100 - v * 92).toFixed(1)}`)
          .join(' ');
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
            <button type="button" onClick={() => onSelect(layer.id)} className="relative flex-1 h-8 cursor-pointer" aria-label={`Select ${layer.name}`}>
              <span
                className={`absolute inset-y-1 rounded-sm ${layer.muted ? 'opacity-30' : ''} ${selected ? 'bg-arcane-900/60 border border-arcane-500' : 'bg-stone-700/50 border border-stone-600'}`}
                style={{ left: `${(layer.start / total) * 100}%`, width: `${Math.max(0.6, (layer.length / total) * 100)}%` }}
              >
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <polygon points={`0,100 ${points} 100,100`} fill={layer.source === 'tone' ? '#d4a574' : '#a78bfa'} opacity="0.55" />
                </svg>
              </span>
            </button>
          </div>
        );
      })}
      <div className="flex gap-3 px-2 py-1 border-t border-stone-700/60 text-[10px] text-stone-500 bg-stone-900">
        <span><span className="inline-block w-2 h-2 rounded-sm align-middle mr-1" style={{ background: '#a78bfa' }} />noise</span>
        <span><span className="inline-block w-2 h-2 rounded-sm align-middle mr-1" style={{ background: '#d4a574' }} />tone</span>
        <span>Each bar is a layer: where it sits is when it plays, and the shape inside is its loudness.</span>
      </div>
    </div>
  );
};
