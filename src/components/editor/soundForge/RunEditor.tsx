import React from 'react';
import { MAX_RUN_STEPS, runPlan, type SynthLayer } from '../../../utils/synth/types';
import { ForgeChip, ForgeSection, ForgeSlider, ForgeToggle } from './ForgeControls';
import { noteName } from './forgeModel';
import { SCALES, runRows, scaleById } from './songModel';

// A RUN (user ask 2026-11-17, after a recording of a magic flourish turned
// out to be a stream of 85 tiny notes that no single layer could hold): the
// layer's note steps through a list, so many steps a second. It is how an
// old game plays a chord, a trill or a flourish on one voice.
//
// The list is written on a GRID, like a song (it replaced a staircase of
// bars and a slider that moved one picked step at a time: the user had
// found picking notes one by one slow). One column to a step, one row to a
// key; the square filled in a column is that step's note.
//
//   tap a square              that step plays that key
//   drag across (mouse, pen)  each step it crosses is set as it goes
//   tap the "+" column        another step, on the key tapped
//
// The row marked with the layer's own Pitch is where a step of 0 sits; the
// scale buttons leave out the rows that would clash with it. Steps the
// layer is too short to reach are drawn faint, so "why can't I hear the
// end" answers itself. On a touch screen a drag scrolls, so there it is tap
// only, as on the song grid.

type Run = NonNullable<SynthLayer['run']>;

const SHAPES: ReadonlyArray<{ label: string; hint: string; steps: number[] }> = [
  { label: 'Rise', hint: 'Up a chord: the sound of gaining something', steps: [0, 4, 7, 12] },
  { label: 'Fall', hint: 'Down a chord: losing, landing, closing', steps: [12, 7, 4, 0] },
  { label: 'Up and down', hint: 'A chord going round: a shimmer when fast', steps: [0, 4, 7, 12, 7, 4] },
  { label: 'Trill', hint: 'Two notes in turn: an alarm, a flutter', steps: [0, 3] },
];

const COL_W = 18;
const ROW_H = 14;
const GUTTER_W = 40;
/** The rows shown to begin with (keys from Pitch), and the furthest they can be widened to. */
const SHOWN = { low: -5, high: 17 };
const LIMIT = { low: -36, high: 48 };

/** 0 -> "0", 7 -> "+7", -2.5 -> "−2.5". */
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
  const [scaleId, setScaleId] = React.useState('all');
  const [shown, setShown] = React.useState(SHOWN);
  const grid = React.useRef<HTMLDivElement>(null);
  const drawing = React.useRef(false);
  /** The steps as the drag in hand has left them: two moves can arrive before the screen has caught up with the first. */
  const live = React.useRef<number[] | null>(null);
  /** A finger is down on this square: it becomes a tap only if it lifts without the grid having scrolled. */
  const touched = React.useRef<{ col: number; offset: number } | null>(null);
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
  const setSteps = (next: number[], tag: string) => setRun({ ...run, steps: next }, tag);
  const stepHz = (semitones: number) => base * Math.pow(2, semitones / 12);
  const rows = runRows(shown.low, shown.high, scaleById(scaleId), steps);
  const rowOf = new Map(rows.map((offset, i) => [offset, i]));
  const canAdd = steps.length < MAX_RUN_STEPS;
  const columns = steps.length + (canAdd ? 1 : 0);

  const cellAt = (e: React.PointerEvent): { col: number; offset: number | undefined } => {
    const box = grid.current!.getBoundingClientRect();
    return { col: Math.floor((e.clientX - box.left) / COL_W), offset: rows[Math.floor((e.clientY - box.top) / ROW_H)] };
  };
  /** Set a step to a key; in the column after the last, add a step there. */
  const put = (col: number, offset: number | undefined) => {
    if (offset === undefined || col < 0) return;
    const now = live.current ?? steps;
    let next = now;
    if (col >= now.length) {
      if (now.length >= MAX_RUN_STEPS) return;
      next = [...now, offset];
      setPicked(now.length);
    } else {
      setPicked(col);
      if (now[col] !== offset) next = now.map((s, i) => (i === col ? offset : s));
    }
    if (next === now) return;
    if (drawing.current) live.current = next;
    setSteps(next, 'run-draw');
  };

  return section(
    <>
      <ForgeSlider
        label="Speed" value={run.rate} min={1} max={60} scale="log" show={{ unit: 'per s', decimals: 1 }}
        onChange={rate => setRun({ ...run, rate }, 'run-rate')}
      />

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-stone-400 mr-0.5">Keys shown</span>
        {SCALES.map(s => (
          <ForgeChip key={s.id} active={s.id === scaleId} onClick={() => setScaleId(s.id)} title={`${s.hint}. Its home is the note in Pitch`}>{s.label}</ForgeChip>
        ))}
        <span className="ml-auto flex gap-1">
          <ForgeChip disabled={shown.low - 12 < LIMIT.low} onClick={() => setShown(v => ({ ...v, low: v.low - 12 }))} title="Show an octave more below">▼ Lower</ForgeChip>
          <ForgeChip disabled={shown.high + 12 > LIMIT.high} onClick={() => setShown(v => ({ ...v, high: v.high + 12 }))} title="Show an octave more above">▲ Higher</ForgeChip>
        </span>
      </div>

      {/* The grid. */}
      <div className="flex rounded border border-stone-700 bg-stone-900 overflow-auto" style={{ maxHeight: 344 }}>
        <div className="sticky left-0 z-10 shrink-0 bg-stone-900 border-r border-stone-700" style={{ width: GUTTER_W }}>
          {rows.map(offset => (
            <div
              key={offset}
              title={offset === 0 ? 'The note in Pitch: a step of 0' : `${offsetLabel(offset)} keys from Pitch`}
              className={`text-right pr-1.5 text-[10px] tabular-nums border-b border-stone-800 ${offset === 0 ? 'text-copper-300 bg-copper-900/30' : offset % 12 === 0 ? 'text-parchment-100' : 'text-stone-400'}`}
              style={{ height: ROW_H, lineHeight: `${ROW_H - 1}px` }}
            >
              {noteName(stepHz(offset))}
            </div>
          ))}
        </div>
        <div
          ref={grid}
          role="application"
          aria-label="The steps of the run. Tap a square to set that step to that key; tap the last column to add a step."
          className="relative shrink-0 select-none cursor-crosshair"
          style={{
            width: columns * COL_W,
            height: rows.length * ROW_H,
            touchAction: 'pan-x pan-y',
            backgroundImage: `repeating-linear-gradient(to right, rgba(214,188,150,0.12) 0 1px, transparent 1px ${COL_W}px)`,
          }}
          onPointerDown={e => {
            if (e.button !== 0) return;
            const { col, offset } = cellAt(e);
            // A finger may be about to scroll: nothing happens until it lifts.
            if (e.pointerType === 'touch') { touched.current = offset === undefined ? null : { col, offset }; return; }
            drawing.current = true;
            live.current = null;
            put(col, offset);
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
          }}
          onPointerMove={e => {
            if (!drawing.current) return;
            const { col, offset } = cellAt(e);
            put(Math.min(col, (live.current ?? steps).length), offset);
          }}
          onPointerUp={() => {
            drawing.current = false;
            live.current = null;
            const tap = touched.current;
            touched.current = null;
            if (tap) put(tap.col, tap.offset);
          }}
          onPointerCancel={() => { drawing.current = false; live.current = null; touched.current = null; }}
        >
          {rows.map((offset, i) => (
            <div
              key={offset}
              aria-hidden="true"
              className={`absolute left-0 right-0 border-b ${offset === 0 ? 'border-copper-700/60 bg-copper-900/20' : offset % 12 === 0 ? 'border-stone-600' : 'border-stone-800'}`}
              style={{ top: i * ROW_H, height: ROW_H }}
            />
          ))}
          {canAdd && (
            <div
              aria-hidden="true"
              className="absolute top-0 bottom-0 border-l border-dashed border-stone-600 bg-stone-800/50 text-stone-500 text-[11px] text-center"
              style={{ left: steps.length * COL_W, width: COL_W }}
            >
              +
            </div>
          )}
          {steps.map((semitones, i) => {
            const row = rowOf.get(Math.round(semitones));
            if (row === undefined) return null;
            return (
              <div
                key={i}
                aria-label={`Step ${i + 1}: ${offsetLabel(semitones)} keys, ${noteName(stepHz(semitones))}`}
                className={`absolute rounded-sm pointer-events-none border ${i === at ? 'bg-arcane-400 border-arcane-200' : 'bg-copper-500 border-copper-300'} ${i >= reached ? 'opacity-30' : ''}`}
                style={{ left: i * COL_W + 1, top: row * ROW_H + 1, width: COL_W - 2, height: ROW_H - 3 }}
              />
            );
          })}
        </div>
      </div>
      <div className="text-[11px] text-stone-500">
        {steps.length} step{steps.length === 1 ? '' : 's'}, one to a column: tap a square to put that step on that key, and the + column to add one.{' '}
        {run.loop
          ? `Going round, the layer plays ${heard} in all.`
          : reached < steps.length
            ? `This layer is long enough for the first ${reached}: the faint ones are never reached. Make it last longer, or raise the Speed.`
            : 'After the last one, that note is held.'}
      </div>

      {/* The step last touched. */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 mt-1.5 border-t border-stone-700/60">
        <span className="text-xs text-parchment-300 tabular-nums">
          Step {at + 1}: {offsetLabel(steps[at])} ({noteName(stepHz(steps[at]))})
        </span>
        <ForgeChip
          disabled={!canAdd}
          title="Add a step after this one, on the same note"
          onClick={() => { setSteps([...steps.slice(0, at + 1), steps[at], ...steps.slice(at + 1)], 'run-add'); setPicked(at + 1); }}
        >
          + Add a step after it
        </ForgeChip>
        <ForgeChip
          tone="danger" disabled={steps.length <= 1}
          title="Take this step out of the run"
          onClick={() => { setSteps(steps.filter((_, i) => i !== at), 'run-remove'); setPicked(Math.max(0, at - 1)); }}
        >
          Remove it
        </ForgeChip>
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
