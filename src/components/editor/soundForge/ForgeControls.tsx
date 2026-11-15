import React from 'react';

// The Sound Forge's small controls. Every one is defined at module level:
// a control defined inside a component is rebuilt on each change, and a
// slider rebuilt mid-drag is dropped by the finger holding it (the volume
// sliders had exactly that bug, 2026-11-15).

/** A titled group of controls: a plain name, the trade's word for it, and a line of help. */
export const ForgeSection: React.FC<{
  title: string;
  /** What a sound designer would call it, so the vocabulary rubs off. */
  term?: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, term, hint, right, children }) => (
  <div className="border border-stone-700 rounded">
    <div className="flex items-baseline gap-2 px-3 py-1.5 bg-stone-800 border-b border-stone-700">
      <div className="text-sm font-medium text-parchment-100">{title}</div>
      {term && <div className="text-xs text-stone-500">{term}</div>}
      {right && <div className="ml-auto">{right}</div>}
    </div>
    <div className="px-3 py-2 space-y-1">
      {hint && <div className="text-xs text-stone-400 pb-1">{hint}</div>}
      {children}
    </div>
  </div>
);

/** A small bordered button; `active` marks the chosen one of a set. */
export const ForgeChip: React.FC<{
  active?: boolean;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  tone?: 'plain' | 'go' | 'danger';
  children: React.ReactNode;
}> = ({ active, onClick, title, disabled, tone = 'plain', children }) => {
  const look = active
    ? 'bg-stone-700 border-arcane-500 text-parchment-100'
    : tone === 'go'
      ? 'bg-moss-900/40 text-moss-300 border-moss-700/50 hover:bg-moss-900/60'
      : tone === 'danger'
        ? 'bg-blood-900/30 text-blood-300 border-blood-700/50 hover:bg-blood-900/50'
        : 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`px-2 py-1 rounded border text-xs whitespace-nowrap disabled:opacity-40 disabled:cursor-default ${look}`}
    >
      {children}
    </button>
  );
};

export interface SliderShow {
  /** Multiply the stored value by this for display (1000 shows seconds as ms). */
  factor?: number;
  unit?: string;
  decimals?: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * One number: a slider to play with and a box to type an exact value into.
 * `scale: 'log'` spreads the slider the way the ear hears pitch (each
 * doubling takes the same distance).
 */
export const ForgeSlider: React.FC<{
  label: string;
  term?: string;
  value: number;
  min: number;
  max: number;
  scale?: 'linear' | 'log';
  show?: SliderShow;
  /** Extra read-out after the number, such as a note name. */
  note?: string;
  /** Always put the slider on its own line (for narrow columns). */
  stacked?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}> = ({ label, term, value, min, max, scale = 'linear', show, note, stacked, disabled, onChange }) => {
  const factor = show?.factor ?? 1;
  const decimals = show?.decimals ?? 2;
  const STEPS = 1000;
  const safeMin = scale === 'log' ? Math.max(min, 1e-4) : min;
  const toPosition = (v: number) => {
    const c = clamp(v, safeMin, max);
    const u = scale === 'log' ? Math.log(c / safeMin) / Math.log(max / safeMin) : (c - safeMin) / (max - safeMin);
    return Math.round(u * STEPS);
  };
  const fromPosition = (p: number) => {
    const u = p / STEPS;
    return scale === 'log' ? safeMin * Math.pow(max / safeMin, u) : safeMin + (max - safeMin) * u;
  };
  const shown = (value * factor).toFixed(decimals);

  // While the box is being typed in it holds its own text; otherwise it
  // shows the value.
  const [typing, setTyping] = React.useState<string | null>(null);
  const commit = (text: string) => {
    const n = Number(text);
    if (text.trim() !== '' && Number.isFinite(n)) onChange(clamp(n / factor, min, max));
    setTyping(null);
  };

  return (
    // One line where there is room (name, slider, number); where there is
    // not (a phone, a narrow column) the slider drops to its own line.
    <div
      className={`grid items-center gap-x-2 ${stacked ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[7rem_minmax(0,1fr)_auto]'} ${disabled ? 'opacity-40' : ''}`}
    >
      <div className="leading-tight min-w-0">
        <div className="text-xs text-parchment-300">{label}</div>
        {term && <div className="text-[10px] text-stone-500">{term}</div>}
      </div>
      <div className={`relative h-7 min-w-0 col-span-2 order-3 ${stacked ? '' : 'md:col-span-1 md:order-none'}`}>
        <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded bg-stone-700" />
        <input
          type="range"
          min={0}
          max={STEPS}
          step={1}
          value={toPosition(value)}
          disabled={disabled}
          aria-label={label}
          onChange={e => onChange(fromPosition(Number(e.target.value)))}
          className="absolute inset-0 w-full h-full m-0 appearance-none bg-transparent cursor-pointer accent-arcane-500"
          style={{ touchAction: 'pan-y' }}
        />
      </div>
      <div className="flex items-center gap-1.5">
      <input
        type="text"
        inputMode="decimal"
        value={typing ?? shown}
        disabled={disabled}
        aria-label={`${label}, exact value`}
        onFocus={e => { setTyping(shown); e.target.select(); }}
        onChange={e => setTyping(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-16 shrink-0 bg-stone-900 border border-stone-700 rounded px-1.5 py-0.5 text-xs text-parchment-100 text-right tabular-nums"
      />
      <div className="w-12 shrink-0 text-[11px] text-stone-400 leading-tight">
        <div>{show?.unit ?? ''}</div>
        {note && <div className="text-arcane-300">{note}</div>}
      </div>
      </div>
    </div>
  );
};

/** An on/off switch with a label, for optional parts of a layer. */
export const ForgeToggle: React.FC<{
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}> = ({ label, on, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!on)}
    aria-pressed={on}
    className={`px-2 py-0.5 rounded border text-xs ${on ? 'bg-stone-700 border-arcane-500 text-parchment-100' : 'bg-stone-800 border-stone-700 text-stone-400 hover:bg-stone-700'}`}
  >
    {on ? '✓ ' : '+ '}
    {label}
  </button>
);
