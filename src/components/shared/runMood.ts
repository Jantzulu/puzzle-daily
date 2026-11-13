// ============================================================================
// RUN MOOD — how the current run stands, for chrome that reacts to it
// ============================================================================
// The lintel torches gutter when a run is lost, relight on the retry, and
// flare on a win (user pick 2026-11-13). Game announces the mood; anything
// decorative can listen without Game knowing it exists (the gate-impact
// pattern in signWobble.ts). Flavor only: nothing here feeds the game.

export type RunMood = 'calm' | 'defeat' | 'victory';

let mood: RunMood = 'calm';
const listeners = new Set<(mood: RunMood) => void>();

/** Announce the run's mood. A repeat of the current mood is ignored. */
export const setRunMood = (next: RunMood): void => {
  if (next === mood) return;
  mood = next;
  listeners.forEach(l => l(next));
};

export const getRunMood = (): RunMood => mood;

/** Listen for mood changes; returns the unsubscribe. */
export const onRunMood = (listener: (mood: RunMood) => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
