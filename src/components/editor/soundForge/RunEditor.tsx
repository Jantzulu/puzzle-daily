import React from 'react';
import { MAX_RUN_STEPS, runPlan, type SynthLayer } from '../../../utils/synth/types';
import { ForgeChip, ForgeSection, ForgeSlider, ForgeToggle } from './ForgeControls';
import { noteName } from './forgeModel';

// A RUN (user ask 2026-11-17, after a recording of a magic flourish turned
// out to be a stream of 85 tiny notes that no single layer could hold): the
// layer's note steps through a list, so many steps a second. It is how an
// old game plays a chord, a trill or a flourish on one voice.
//
// The list is shown as a STAIRCASE: one bar per step, higher bars are
// higher notes. A bar is picked by tapping it; the picked step is moved with
// the slider under the picture. Steps the layer is too short to reach are
// drawn faint, so "why can't I hear the end" answers itself.

type Run = NonNullable<SynthLayer['run']>;

const SHAPES: ReadonlyArray<{ label: string; hint: string; steps: number[] }> = [
  { label: 'Rise', hint: 'Up a chord: the sound of gaining something', steps: [0, 4, 7, 12] },
  { label: 'Fall', hint: 'Down a chord: losing, landing, closing', steps: [12, 7, 4, 0] },
  { label: 'Up and down', hint: 'A chord going round: a shimmer when fast', steps: [0, 4, 7, 12, 7, 4] },
  { label: 'Trill', hint: 'Two notes in turn: an alarm, a flutter', steps: [0, 3] },
];

const PICTURE_H = 72;

/** 0 -> "same", 7 -> "+7", -2.5 -> "-2.5". */
const offsetLabel = (semitones: number): string => {
  const rounded = Math.round(semitones * 100) / 100;
  return rounded === 0 ? '0' : `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}`;
};

export const RunEditor: React.FC<{
  layer: SynthLayer;
  /** `tag` names the control, so a drag is undone in one step. */
  onChange: (layer: SynthLayer, tag: string) => void;
}> = ({ layer, onChange }) => {
  const run = layer.run;
  const [picked, setPicked] = React.useState(0);
  const setRun = (next: Run | undefined, tag: string) => onChange({ ...layer, run: next }, tag);
  const base = layer.pitch?.from ?? 440;

  const section = (children: React.ReactNode) => (
    <ForgeSection
      title="Run"
      term="arpeggio"
      hint="The note steps through a list instead of holding still, so many steps a second. It is how old games play a chord, a trill or a flourish with one voice. Each step is counted in keys (semitones) up or down from the note in Pitch."
      right={
        <ForgeToggle
          label="On"
          on={!!run}
          onChange={on => setRun(on ? { rate: 16, steps: [...SHAPES[0].steps], loop: true } : undefined, 'run')}
        />
      }
    >
      {children}
    </ForgeSection>
  );

  if (!run) return section(<div className="text-xs text-stone-500">Off: the note holds (or bends, if Bend is on).</div>);

  const steps = run.steps.slice(0, MAX_RUN_STEPS);
  const at = Math.min(picked, steps.length - 1);
  const heard = runPlan(layer).length;
  const reached = run.loop ? steps.length : Math.min(steps.length, heard);
  const low = Math.min(0, ...steps);
  const high = Math.max(0, ...steps);
  const span = Math.max(1, high - low);
  const setSteps = (next: number[], tag: string) => setRun({ ...run, steps: next }, tag);
  const stepHz = (semitones: number) => base * Math.pow(2, semitones / 12);

  return section(
    <>
      <ForgeSlider
        label="Speed" value={run.rate} min={1} max={60} scale="log" show={{ unit: 'per s', decimals: 1 }}
        onChange={rate => setRun({ ...run, rate }, 'run-rate')}
      />

      {/* The staircase. */}
      <div
        className="flex items-end gap-px rounded border border-stone-700 bg-stone-900 px-1 pt-1"
        style={{ height: PICTURE_H + 6 }}
        role="listbox"
        aria-label="The steps of the run"
      >
        {steps.map((semitones, i) => {
          const chosen = i === at;
          const faint = i >= reached;
          return (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={chosen}
              aria-label={`Step ${i + 1}: ${offsetLabel(semitones)} keys, ${noteName(stepHz(semitones))}`}
              title={`Step ${i + 1}: ${offsetLabel(semitones)} (${noteName(stepHz(semitones))})`}
              onClick={() => setPicked(i)}
              className={`flex-1 min-w-0 rounded-t-sm ${chosen ? 'bg-arcane-400' : 'bg-copper-600 hover:bg-copper-500'} ${faint ? 'opacity-30' : ''}`}
              style={{ height: 8 + ((semitones - low) / span) * (PICTURE_H - 8) }}
            />
          );
        })}
      </div>
      <div className="text-[11px] text-stone-500">
        {steps.length} step{steps.length === 1 ? '' : 's'}.{' '}
        {run.loop
          ? `Going round, the layer plays ${heard} in all.`
          : reached < steps.length
            ? `This layer is long enough for the first ${reached}: the faint ones are never reached. Make it last longer, or raise the Speed.`
            : 'After the last one, that note is held.'}
      </div>

      {/* The picked step. */}
      <div className="pt-1.5 mt-1.5 border-t border-stone-700/60 space-y-1">
        <ForgeSlider
          label={`Step ${at + 1}`} term="keys from Pitch" value={steps[at]} min={-24} max={36} show={{ decimals: 2 }}
          note={noteName(stepHz(steps[at]))}
          // (Whole keys. A run made from a recording may hold in-between
          // values; they are shown as they are until the step is moved.)
          onChange={value => setSteps(steps.map((s, i) => (i === at ? Math.round(value) : s)), `run-step-${at}`)}
        />
        <div className="flex flex-wrap gap-1.5">
          <ForgeChip onClick={() => setPicked(Math.max(0, at - 1))} disabled={at === 0} title="Pick the step before">‹ Before</ForgeChip>
          <ForgeChip onClick={() => setPicked(Math.min(steps.length - 1, at + 1))} disabled={at >= steps.length - 1} title="Pick the step after">After ›</ForgeChip>
          <ForgeChip
            disabled={steps.length >= MAX_RUN_STEPS}
            title="Add a step after this one, on the same note"
            onClick={() => { setSteps([...steps.slice(0, at + 1), steps[at], ...steps.slice(at + 1)], 'run-add'); setPicked(at + 1); }}
          >
            + Add a step
          </ForgeChip>
          <ForgeChip
            tone="danger" disabled={steps.length <= 1}
            onClick={() => { setSteps(steps.filter((_, i) => i !== at), 'run-remove'); setPicked(Math.max(0, at - 1)); }}
          >
            Remove
          </ForgeChip>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
        <ForgeToggle label="Go round" on={!!run.loop} onChange={loop => setRun({ ...run, loop }, 'run-loop')} />
        <span className="text-[11px] text-stone-500">{run.loop ? 'Loop: the list starts again when it runs out.' : 'Once through, then the last note is held.'}</span>
      </div>
      <ForgeSlider
        label="Pluck" term="each step fades" value={run.pluck ?? 0} min={0} max={1} show={{ factor: 100, unit: '%', decimals: 0 }}
        onChange={pluck => setRun({ ...run, pluck: pluck > 0.005 ? pluck : undefined }, 'run-pluck')}
      />
      <div className="text-[11px] text-stone-500">
        At 0 the notes are joined, one voice sliding its finger: the old-game sound, most of all on the Hollow wave. Higher, and each note is struck and dies before the next: a harp, a run of bells.
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] text-stone-400">Start from</span>
        {SHAPES.map(shape => (
          <ForgeChip key={shape.label} title={shape.hint} onClick={() => { setSteps([...shape.steps], 'run-shape'); setPicked(0); }}>
            {shape.label}
          </ForgeChip>
        ))}
      </div>
    </>,
  );
};
