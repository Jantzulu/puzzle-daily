import React from 'react';
import type { FilterStage, FilterType, Slide, SynthLayer, Wave } from '../../../utils/synth/types';
import { ForgeChip, ForgeSection, ForgeSlider, ForgeToggle } from './ForgeControls';
import { noteName } from './forgeModel';

// Everything that shapes ONE layer. Each group has a plain name, the trade's
// word beside it, and a line saying what it does to the sound, so the
// vocabulary is learned by using it. Nothing is hidden: the rarely needed
// numbers sit under "Fine control" in their group.

const SECONDS = { factor: 1000, unit: 'ms', decimals: 0 } as const;
const HZ = { unit: 'Hz', decimals: 0 } as const;

const WAVES: ReadonlyArray<{ id: Wave; label: string; hint: string; path: string }> = [
  { id: 'sine', label: 'Smooth', hint: 'Sine: a pure, round note. Flutes, bells, thuds.', path: 'M0 10 Q6 -4 12 10 T24 10' },
  { id: 'triangle', label: 'Soft', hint: 'Triangle: a little brighter than smooth. Gentle blips.', path: 'M0 10 L6 2 L18 18 L24 10' },
  { id: 'square', label: 'Hollow', hint: 'Square: the classic old-game note. Blips, coins.', path: 'M0 16 L0 4 L12 4 L12 16 L24 16 L24 4' },
  { id: 'sawtooth', label: 'Buzzy', hint: 'Sawtooth: rough and bright. Zaps, growls, brass.', path: 'M0 16 L12 4 L12 16 L24 4 L24 16' },
];

const FILTERS: ReadonlyArray<{ id: FilterType; label: string; hint: string }> = [
  { id: 'bandpass', label: 'Keep a band', hint: 'Bandpass: only a slice of the range gets through. Where the slice sits is the colour.' },
  { id: 'lowpass', label: 'Cut the highs', hint: 'Lowpass: everything above the mark is removed. Duller, further away.' },
  { id: 'highpass', label: 'Cut the lows', hint: 'Highpass: everything below the mark is removed. Thinner, lighter.' },
];

/** The two ends of a value that glides, plus an optional turning point. */
const SlideControls: React.FC<{
  slide: Slide;
  length: number;
  fromLabel: string;
  toLabel: string;
  min: number;
  max: number;
  notes?: boolean;
  allowEarly?: boolean;
  onChange: (slide: Slide) => void;
}> = ({ slide, length, fromLabel, toLabel, min, max, notes, allowEarly, onChange }) => (
  <>
    <ForgeSlider
      label={fromLabel} value={slide.from} min={min} max={max} scale="log" show={HZ}
      note={notes ? noteName(slide.from) : undefined}
      onChange={from => onChange({ ...slide, from })}
    />
    <ForgeSlider
      label={toLabel} value={slide.to} min={min} max={max} scale="log" show={HZ}
      note={notes ? noteName(slide.to) : undefined}
      onChange={to => onChange({ ...slide, to })}
    />
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      <ForgeChip onClick={() => onChange({ ...slide, to: slide.from })} title="Make it stay where it starts">
        Hold steady
      </ForgeChip>
      <ForgeToggle
        label="Turning point"
        on={!!slide.via}
        onChange={on => onChange(on
          ? { ...slide, via: { value: Math.sqrt(slide.from * slide.to), at: length / 2 } }
          : { from: slide.from, to: slide.to, arriveAt: slide.arriveAt })}
      />
      {allowEarly && (
        <ForgeToggle
          label="Arrive early"
          on={slide.arriveAt !== undefined}
          onChange={on => onChange(on
            ? { ...slide, arriveAt: length * 0.6 }
            : { from: slide.from, to: slide.to, via: slide.via })}
        />
      )}
    </div>
    {slide.via && (
      <>
        <ForgeSlider
          label="Passes through" value={slide.via.value} min={min} max={max} scale="log" show={HZ}
          note={notes ? noteName(slide.via.value) : undefined}
          onChange={value => onChange({ ...slide, via: { value, at: slide.via!.at } })}
        />
        <ForgeSlider
          label="...at" value={Math.min(slide.via.at, length)} min={0} max={length} show={SECONDS}
          onChange={at => onChange({ ...slide, via: { value: slide.via!.value, at } })}
        />
      </>
    )}
    {allowEarly && slide.arriveAt !== undefined && (
      <ForgeSlider
        label="Gets there by" value={Math.min(slide.arriveAt, length)} min={0.001} max={length} show={SECONDS}
        onChange={arriveAt => onChange({ ...slide, arriveAt })}
      />
    )}
  </>
);

export const LayerPanel: React.FC<{
  layer: SynthLayer;
  /** `tag` names the control, so a drag is undone in one step. */
  onChange: (layer: SynthLayer, tag: string) => void;
  onShuffle: () => void;
}> = ({ layer, onChange, onShuffle }) => {
  const set = <K extends keyof SynthLayer>(key: K, value: SynthLayer[K]) => onChange({ ...layer, [key]: value }, String(key));
  const filters = layer.filters ?? [];
  const setFilter = (index: number, stage: FilterStage) =>
    onChange({ ...layer, filters: filters.map((f, i) => (i === index ? stage : f)) }, `filter-${index}`);
  const pitch = layer.pitch ?? { from: 440, to: 440 };

  return (
    <div className="space-y-3">
      <ForgeSection
        title="Made of"
        term="source"
        hint={layer.source === 'noise'
          ? 'Noise is every pitch at once, like a hiss. Good for air, fire, impacts, paper. Its Colour (below) is what gives it character.'
          : 'A tone is a single note. Good for thuds, blips, chimes, zaps. Its Pitch and its wave shape are what give it character.'}
      >
        <div className="flex flex-wrap gap-1.5">
          <ForgeChip active={layer.source === 'noise'} onClick={() => set('source', 'noise')}>Noise</ForgeChip>
          <ForgeChip
            active={layer.source === 'tone'}
            onClick={() => onChange({ ...layer, source: 'tone', wave: layer.wave ?? 'sine', pitch }, 'source')}
          >
            Tone
          </ForgeChip>
        </div>
        {layer.source === 'tone' && (
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {WAVES.map(w => (
              <ForgeChip key={w.id} active={(layer.wave ?? 'sine') === w.id} onClick={() => set('wave', w.id)} title={w.hint}>
                <span className="inline-flex items-center gap-1.5">
                  <svg width="24" height="20" viewBox="0 0 24 20" aria-hidden="true">
                    <path d={w.path} fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  {w.label}
                </span>
              </ForgeChip>
            ))}
          </div>
        )}
        {layer.source === 'tone' && (
          <div className="text-[11px] text-stone-500 pt-1">{WAVES.find(w => w.id === (layer.wave ?? 'sine'))?.hint}</div>
        )}
      </ForgeSection>

      <ForgeSection title="When" hint="Where this layer sits in the sound, and how long it lasts.">
        <ForgeSlider label="Starts at" value={layer.start} min={0} max={2} show={SECONDS} onChange={v => set('start', v)} />
        <ForgeSlider label="Lasts" value={layer.length} min={0.003} max={3} scale="log" show={SECONDS} onChange={v => set('length', v)} />
      </ForgeSection>

      <ForgeSection
        title="Loudness"
        term="envelope"
        hint="How loud it gets, and how it gets there. A short Swell is a hit; a long Swell is a breath."
      >
        <ForgeSlider label="Level" term="peak" value={layer.level} min={0} max={2} show={{ decimals: 2 }} onChange={v => set('level', v)} />
        <ForgeSlider label="Swell" term="attack" value={Math.min(layer.attack, layer.length)} min={0} max={layer.length} show={SECONDS} onChange={v => set('attack', v)} />
        <ForgeSlider label="Stays full" term="hold" value={Math.min(layer.hold, layer.length)} min={0} max={layer.length} show={SECONDS} onChange={v => set('hold', v)} />
        <details className="pt-1">
          <summary className="text-xs text-stone-400 cursor-pointer">Fine control: the fade</summary>
          <div className="pt-1 space-y-1">
            <div className="text-[11px] text-stone-500">
              After the peak it fades down to "Fades to", then the Tail takes it to silence. A lower "Fades to" dies away sooner.
            </div>
            <ForgeSlider label="Fades to" term="decay floor" value={layer.floor} min={0.005} max={1} scale="log" show={{ factor: 100, unit: '%', decimals: 1 }} onChange={v => set('floor', v)} />
            <ForgeSlider label="Tail" term="release" value={Math.min(layer.tail, layer.length)} min={0} max={Math.min(0.3, layer.length)} show={SECONDS} onChange={v => set('tail', v)} />
          </div>
        </details>
      </ForgeSection>

      {layer.source === 'tone' && (
        <ForgeSection
          title="Pitch"
          hint="How high the note is, and where it glides to. Falling feels like landing or failing; rising feels like lifting or gaining."
        >
          <SlideControls
            slide={pitch} length={layer.length} fromLabel="From" toLabel="To" min={30} max={8000} notes allowEarly
            onChange={next => onChange({ ...layer, pitch: next }, 'pitch')}
          />
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            <ForgeToggle
              label="Wobble" on={!!layer.vibrato}
              onChange={on => set('vibrato', on ? { rate: 8, depth: 30 } : undefined)}
            />
            <ForgeToggle
              label="Bell partner" on={!!layer.overtone}
              onChange={on => set('overtone', on ? { ratio: 2.76, level: 0.22 } : undefined)}
            />
          </div>
          {layer.vibrato && (
            <>
              <div className="text-[11px] text-stone-500 pt-1">Wobble (vibrato): the pitch wavers. Slow and shallow sings; fast and deep growls.</div>
              <ForgeSlider label="Wobble speed" value={layer.vibrato.rate} min={0.5} max={60} scale="log" show={{ unit: 'per s', decimals: 1 }} onChange={rate => set('vibrato', { ...layer.vibrato!, rate })} />
              <ForgeSlider label="Wobble depth" value={layer.vibrato.depth} min={0} max={400} show={{ unit: 'cents', decimals: 0 }} onChange={depth => set('vibrato', { ...layer.vibrato!, depth })} />
            </>
          )}
          {layer.overtone && (
            <>
              <div className="text-[11px] text-stone-500 pt-1">
                Bell partner (overtone): a second, higher note sounded with it. 2 is the same note an octave up (clean); numbers like 2.76 clash a little, which is what makes a bell a bell.
              </div>
              <ForgeSlider label="How much higher" value={layer.overtone.ratio} min={1} max={8} show={{ unit: 'times', decimals: 2 }} onChange={ratio => set('overtone', { ...layer.overtone!, ratio })} />
              <ForgeSlider label="Partner level" value={layer.overtone.level} min={0} max={1} show={{ decimals: 2 }} onChange={level => set('overtone', { ...layer.overtone!, level })} />
            </>
          )}
        </ForgeSection>
      )}

      <ForgeSection
        title="Colour"
        term="filter"
        hint={layer.source === 'noise'
          ? 'Which part of the noise is let through. Low and it rumbles; in the middle it whooshes; high and it hisses. Sliding it is what makes a whoosh move.'
          : 'Takes the edge off a note. Most useful on Hollow and Buzzy waves, which are bright.'}
        right={filters.length < 2 ? (
          <ForgeChip onClick={() => onChange({ ...layer, filters: [...filters, { type: 'bandpass', q: 0.9, cutoff: { from: 1200, to: 1200 } }] }, 'filter-add')}>
            + Add
          </ForgeChip>
        ) : undefined}
      >
        {filters.length === 0 && <div className="text-xs text-stone-500">None: the whole range gets through.</div>}
        {filters.map((stage, i) => (
          <div key={i} className={i > 0 ? 'pt-2 mt-2 border-t border-stone-700/60 space-y-1' : 'space-y-1'}>
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map(f => (
                <ForgeChip
                  key={f.id} active={stage.type === f.id} title={f.hint}
                  onClick={() => setFilter(i, { ...stage, type: f.id, q: f.id === 'bandpass' ? (stage.type === 'bandpass' ? stage.q : 0.9) : undefined })}
                >
                  {f.label}
                </ForgeChip>
              ))}
              <span className="ml-auto">
                <ForgeChip tone="danger" onClick={() => onChange({ ...layer, filters: filters.filter((_, k) => k !== i) }, 'filter-remove')}>Remove</ForgeChip>
              </span>
            </div>
            <div className="text-[11px] text-stone-500">{FILTERS.find(f => f.id === stage.type)?.hint}</div>
            <SlideControls
              slide={stage.cutoff} length={layer.length} fromLabel="From" toLabel="To" min={40} max={12000}
              onChange={cutoff => setFilter(i, { ...stage, cutoff })}
            />
            {stage.type === 'bandpass' && (
              <ForgeSlider
                label="Narrowness" term="Q" value={stage.q ?? 1} min={0.2} max={12} scale="log" show={{ decimals: 2 }}
                onChange={q => setFilter(i, { ...stage, q })}
              />
            )}
          </div>
        ))}
        {filters.some(f => f.type === 'bandpass' && (f.q ?? 1) > 2.5 && f.cutoff.from !== f.cutoff.to) && (
          <div className="text-[11px] text-copper-300 pt-1">
            A narrow band that slides starts to sound like a voice or a robot. Keep Narrowness low unless that is what you want.
          </div>
        )}
      </ForgeSection>

      <ForgeSection
        title="Tremble"
        term="tremolo"
        hint="An irregular shake in the loudness. Fast and shallow suggests a sheet or a flame; slow and deep creaks."
        right={<ForgeToggle label="On" on={!!layer.tremble} onChange={on => set('tremble', on ? { rate: 60, depth: 5, seed: 0.4 } : undefined)} />}
      >
        {layer.tremble ? (
          <>
            <ForgeSlider label="Speed" value={layer.tremble.rate} min={4} max={200} scale="log" show={{ unit: 'per s', decimals: 0 }} onChange={rate => set('tremble', { ...layer.tremble!, rate })} />
            <ForgeSlider label="Depth" value={layer.tremble.depth} min={0} max={30} show={{ decimals: 1 }} onChange={depth => set('tremble', { ...layer.tremble!, depth })} />
          </>
        ) : (
          <div className="text-xs text-stone-500">Off: the loudness follows its shape smoothly.</div>
        )}
      </ForgeSection>

      {layer.source === 'noise' && (
        <ForgeSection
          title="Texture"
          hint="Noise is random, and each stretch of it has its own grain. Shuffle picks a different stretch: same recipe, slightly different result."
          right={<ForgeChip onClick={onShuffle}>Shuffle</ForgeChip>}
        >
          <details>
            <summary className="text-xs text-stone-400 cursor-pointer">Fine control: speed</summary>
            <div className="pt-1 space-y-1">
              <div className="text-[11px] text-stone-500">Playing the noise slower makes it coarser and duller; faster makes it finer.</div>
              <ForgeSlider label="Speed" term="playback rate" value={layer.noiseRate ?? 1} min={0.25} max={2} scale="log" show={{ unit: 'times', decimals: 2 }} onChange={v => set('noiseRate', v)} />
            </div>
          </details>
        </ForgeSection>
      )}
    </div>
  );
};
