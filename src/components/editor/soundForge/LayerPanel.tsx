import React from 'react';
import { MAX_HARMONICS, type FilterStage, type FilterType, type Slide, type SynthLayer, type Wave } from '../../../utils/synth/types';
import { ForgeChip, ForgeSection, ForgeSlider, ForgeToggle } from './ForgeControls';
import { NotePicker } from './NotePicker';
import { RunEditor } from './RunEditor';

// Everything that shapes ONE layer. Each group has a plain name, the trade's
// word beside it, and a line saying what it does to the sound, so the
// vocabulary is learned by using it. Nothing is hidden: the rarely needed
// numbers sit under "Fine control" in their group.
//
// ORDER: what gives the layer its character comes first, right under
// "Made of": for a tone its Pitch, its Run (RunEditor.tsx) and Stacked
// notes, for noise its Colour.
// Timing and loudness follow (they can also be set by dragging the bars).

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

/** The fine points of a glide: a turning point on the way, and arriving early. */
const GlidePath: React.FC<{
  slide: Slide;
  length: number;
  min: number;
  max: number;
  allowEarly?: boolean;
  onChange: (slide: Slide) => void;
}> = ({ slide, length, min, max, allowEarly, onChange }) => (
  <>
    <div className="flex flex-wrap gap-1.5 pt-0.5">
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

/** A filter's position: where it starts, where it ends, and the path between. */
const FilterSlide: React.FC<{
  slide: Slide;
  length: number;
  onChange: (slide: Slide) => void;
}> = ({ slide, length, onChange }) => (
  <>
    <ForgeSlider label="From" value={slide.from} min={40} max={12000} scale="log" show={HZ} onChange={from => onChange({ ...slide, from })} />
    <ForgeSlider label="To" value={slide.to} min={40} max={12000} scale="log" show={HZ} onChange={to => onChange({ ...slide, to })} />
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      <ForgeChip onClick={() => onChange({ from: slide.from, to: slide.from })} title="Make it stay where it starts">Hold steady</ForgeChip>
    </div>
    <GlidePath slide={slide} length={length} min={40} max={12000} onChange={onChange} />
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
  const setPitch = (next: Slide, tag = 'pitch') => onChange({ ...layer, pitch: next }, tag);
  // A note is STEADY unless it is told to bend (user ask 2026-11-15: a bend
  // is the rare case, so it is a switch, not two sliders always on show).
  const bends = pitch.from !== pitch.to || !!pitch.via || pitch.arriveAt !== undefined;
  // The notes stacked on the main one. An older recipe may hold a single
  // `overtone`; it is shown as the first of the stack and folded into the
  // list on the first change.
  const stack = [...(layer.overtone ? [layer.overtone] : []), ...(layer.harmonics ?? [])].slice(0, MAX_HARMONICS);
  const setStack = (next: Array<{ ratio: number; level: number }>, tag: string) =>
    onChange({ ...layer, overtone: undefined, harmonics: next.length ? next : undefined }, tag);

  const madeOf = (
    <ForgeSection
      key="made-of"
      title="Made of"
      term="source"
      hint={layer.source === 'noise'
        ? 'Noise is every pitch at once, like a hiss. Good for air, fire, impacts, paper. Its Colour is what gives it character.'
        : 'A tone is a single note. Good for thuds, blips, chimes, zaps. Its Pitch, its wave shape and its stacked notes are what give it character.'}
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
  );

  const pitchSection = (
    <ForgeSection
      key="pitch"
      title="Pitch"
      hint="Which note it plays. Pick a key and an octave; higher octaves are brighter and smaller, lower ones heavier."
      right={
        <ForgeToggle
          label="Bend"
          on={bends}
          onChange={on => setPitch(on ? { from: pitch.from, to: pitch.from * 0.75 } : { from: pitch.from, to: pitch.from }, 'bend')}
        />
      }
    >
      <NotePicker
        label={bends ? 'Starts on' : 'Note'}
        value={pitch.from}
        onChange={from => setPitch(bends ? { ...pitch, from } : { from, to: from }, 'pitch-from')}
      />
      {bends && (
        <>
          <div className="pt-1.5 mt-1.5 border-t border-stone-700/60">
            <NotePicker label="Ends on" value={pitch.to} onChange={to => setPitch({ ...pitch, to }, 'pitch-to')} />
          </div>
          <div className="text-[11px] text-stone-500 pt-1">
            Bend: the note glides from the first to the second over its length. Falling feels like landing or failing; rising feels like lifting or gaining.
          </div>
          <details className="pt-1">
            <summary className="text-xs text-stone-400 cursor-pointer">Fine control: the path of the bend</summary>
            <div className="pt-1 space-y-1">
              <div className="text-[11px] text-stone-500">A turning point sends it somewhere else on the way. Arrive early makes it reach the end note before the layer ends, then hold it.</div>
              <GlidePath slide={pitch} length={layer.length} min={30} max={8000} allowEarly onChange={next => setPitch(next, 'pitch-path')} />
            </div>
          </details>
        </>
      )}
      <div className="flex flex-wrap gap-1.5 pt-1.5">
        <ForgeToggle
          label="Wobble" on={!!layer.vibrato}
          onChange={on => set('vibrato', on ? { rate: 8, depth: 30 } : undefined)}
        />
      </div>
      {layer.vibrato && (
        <>
          <div className="text-[11px] text-stone-500 pt-1">Wobble (vibrato): the pitch wavers. Slow and shallow sings; fast and deep growls.</div>
          <ForgeSlider label="Wobble speed" value={layer.vibrato.rate} min={0.5} max={60} scale="log" show={{ unit: 'per s', decimals: 1 }} onChange={rate => set('vibrato', { ...layer.vibrato!, rate })} />
          <ForgeSlider label="Wobble depth" value={layer.vibrato.depth} min={0} max={400} show={{ unit: 'cents', decimals: 0 }} onChange={depth => set('vibrato', { ...layer.vibrato!, depth })} />
        </>
      )}
    </ForgeSection>
  );

  const stackSection = (
    <ForgeSection
      key="stack"
      title="Stacked notes"
      term="harmonics"
      hint="Extra notes sounded on top of the main one, each some number of times higher. This is where a tone gets its character, and it is how the sounds of OSRS are built."
      right={stack.length < MAX_HARMONICS ? (
        <ForgeChip onClick={() => setStack([...stack, { ratio: stack.length + 2, level: 0.3 }], 'stack-add')}>+ Add</ForgeChip>
      ) : undefined}
    >
      <div className="text-[11px] text-stone-500 space-y-0.5">
        <div><span className="text-parchment-300">Whole numbers</span> (2, 3, 4) melt into one richer note: an organ, a horn, a plucked string.</div>
        <div><span className="text-parchment-300">In-between numbers</span> (2.76, 5.4) clash: a bell, a clank, glass.</div>
        <div><span className="text-parchment-300">Just off 1</span> (1.01) thickens it, like several players at once.</div>
      </div>
      {stack.length === 0 && <div className="text-xs text-stone-500 pt-1">None: a single plain note.</div>}
      {stack.map((p, i) => (
        <div key={i} className="pt-1.5 mt-1.5 border-t border-stone-700/60 space-y-1">
          <div className="flex items-center text-[11px] text-stone-400">
            Note {i + 2}
            <span className="ml-auto">
              <ForgeChip tone="danger" onClick={() => setStack(stack.filter((_, k) => k !== i), 'stack-remove')}>Remove</ForgeChip>
            </span>
          </div>
          <ForgeSlider
            label="How much higher" term="ratio" value={p.ratio} min={0.5} max={12} scale="log" show={{ unit: 'times', decimals: 2 }}
            onChange={ratio => setStack(stack.map((q, k) => (k === i ? { ...q, ratio } : q)), `stack-ratio-${i}`)}
          />
          <ForgeSlider
            label="Its level" value={p.level} min={0} max={3} show={{ decimals: 2 }}
            onChange={level => setStack(stack.map((q, k) => (k === i ? { ...q, level } : q)), `stack-level-${i}`)}
          />
        </div>
      ))}
    </ForgeSection>
  );

  const colour = (
    <ForgeSection
      key="colour"
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
          <FilterSlide slide={stage.cutoff} length={layer.length} onChange={cutoff => setFilter(i, { ...stage, cutoff })} />
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
  );

  const when = (
    <ForgeSection key="when" title="When" hint="Where this layer sits in the sound, and how long it lasts. You can also drag its bar in the picture above.">
      <ForgeSlider label="Starts at" value={layer.start} min={0} max={2} show={SECONDS} onChange={v => set('start', v)} />
      <ForgeSlider label="Lasts" value={layer.length} min={0.003} max={3} scale="log" show={SECONDS} onChange={v => set('length', v)} />
    </ForgeSection>
  );

  const loudness = (
    <ForgeSection
      key="loudness"
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
  );

  const tremble = (
    <ForgeSection
      key="tremble"
      title="Tremble"
      term="random tremolo"
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
  );

  const pulse = (
    <ForgeSection
      key="pulse"
      title="Pulse"
      term="tremolo"
      hint="A steady throb in the loudness. Slow is a wobble or a siren; fast is a buzz or a purr. (Tremble is the irregular kind.)"
      right={<ForgeToggle label="On" on={!!layer.pulse} onChange={on => set('pulse', on ? { rate: 8, depth: 0.6 } : undefined)} />}
    >
      {layer.pulse ? (
        <>
          <ForgeSlider label="Speed" value={layer.pulse.rate} min={0.5} max={120} scale="log" show={{ unit: 'per s', decimals: 1 }} onChange={rate => set('pulse', { ...layer.pulse!, rate })} />
          <ForgeSlider label="Depth" value={layer.pulse.depth} min={0} max={1} show={{ factor: 100, unit: '%', decimals: 0 }} onChange={depth => set('pulse', { ...layer.pulse!, depth })} />
        </>
      ) : (
        <div className="text-xs text-stone-500">Off.</div>
      )}
    </ForgeSection>
  );

  const texture = (
    <ForgeSection
      key="texture"
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
  );

  return (
    <div className="space-y-3">
      {layer.source === 'tone'
        ? [madeOf, pitchSection, <RunEditor key="run" layer={layer} onChange={onChange} />, stackSection, when, loudness, colour, tremble, pulse]
        : [madeOf, colour, when, loudness, tremble, pulse, texture]}
    </div>
  );
};
