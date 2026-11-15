// The Sound Forge's editing state: one working copy per opened sound, each
// with its own undo history, so switching between sounds loses nothing.

import type { SoundAsset } from '../../../types/game';
import { chromeSoundAssetId } from '../../../utils/chromeSounds';
import { BUILT_IN_SOUNDS, type BuiltInSoundId } from '../../../utils/synth/builtIn';
import type { SynthSound } from '../../../utils/synth/types';
import { cloneSound, sameSound } from './forgeModel';

/** 'builtin:<id>' for a page sound, 'mine:<asset id>' for one of the user's. */
export type SoundKey = string;
export const builtInKey = (id: BuiltInSoundId): SoundKey => `builtin:${id}`;
export const mineKey = (assetId: string): SoundKey => `mine:${assetId}`;
export const keyBuiltInId = (key: SoundKey): BuiltInSoundId | null =>
  key.startsWith('builtin:') ? (key.slice(8) as BuiltInSoundId) : null;
export const keyAssetId = (key: SoundKey): string | null => (key.startsWith('mine:') ? key.slice(5) : null);

export interface Work {
  name: string;
  sound: SynthSound;
  past: SynthSound[];
  future: SynthSound[];
}

export interface ForgeState {
  work: Record<SoundKey, Work>;
  /** The last edit: a run of edits to the same control is one undo step. */
  stamp: { key: SoundKey; tag: string; time: number } | null;
  /** Goes up whenever the sound to hear changes (an edit, an undo, a pick). */
  tick: number;
}

export type ForgeAction =
  | { type: 'open'; key: SoundKey; name: string; sound: SynthSound }
  | { type: 'edit'; key: SoundKey; sound: SynthSound; tag: string; time: number }
  | { type: 'rename'; key: SoundKey; name: string }
  | { type: 'undo'; key: SoundKey }
  | { type: 'redo'; key: SoundKey }
  | { type: 'drop'; key: SoundKey };

const SAME_STEP_MS = 700;
const HISTORY = 100;

export function forgeReducer(state: ForgeState, action: ForgeAction): ForgeState {
  const current = state.work[action.key];
  switch (action.type) {
    case 'open':
      return {
        ...state,
        tick: state.tick + 1,
        stamp: null,
        work: current ? state.work : { ...state.work, [action.key]: { name: action.name, sound: cloneSound(action.sound), past: [], future: [] } },
      };
    case 'edit': {
      if (!current) return state;
      const s = state.stamp;
      const sameStep = !!s && s.key === action.key && s.tag === action.tag && action.time - s.time < SAME_STEP_MS;
      const past = sameStep ? current.past : [...current.past, current.sound].slice(-HISTORY);
      return {
        work: { ...state.work, [action.key]: { ...current, sound: action.sound, past, future: [] } },
        stamp: { key: action.key, tag: action.tag, time: action.time },
        tick: state.tick + 1,
      };
    }
    case 'rename':
      return current ? { ...state, work: { ...state.work, [action.key]: { ...current, name: action.name } } } : state;
    case 'undo': {
      if (!current || current.past.length === 0) return state;
      const sound = current.past[current.past.length - 1];
      return {
        work: { ...state.work, [action.key]: { ...current, sound, past: current.past.slice(0, -1), future: [current.sound, ...current.future] } },
        stamp: null,
        tick: state.tick + 1,
      };
    }
    case 'redo': {
      if (!current || current.future.length === 0) return state;
      const [sound, ...future] = current.future;
      return {
        work: { ...state.work, [action.key]: { ...current, sound, past: [...current.past, current.sound], future } },
        stamp: null,
        tick: state.tick + 1,
      };
    }
    case 'drop': {
      const work = { ...state.work };
      delete work[action.key];
      return { ...state, work, stamp: null };
    }
  }
}

/** What is saved for a sound: the shipped recipe (or this device's edit of it), or the user's asset. */
export function savedFor(key: SoundKey, library: readonly SoundAsset[]): { name: string; sound: SynthSound; edited: boolean } | null {
  const builtInId = keyBuiltInId(key);
  if (builtInId) {
    const builtIn = BUILT_IN_SOUNDS.find(b => b.id === builtInId);
    if (!builtIn) return null;
    const override = library.find(a => a.id === chromeSoundAssetId(builtInId))?.synth;
    return { name: builtIn.name, sound: override ?? builtIn.sound, edited: !!override };
  }
  const asset = library.find(a => a.id === keyAssetId(key));
  return asset?.synth ? { name: asset.name, sound: asset.synth, edited: false } : null;
}

/** True when the working copy differs from what is saved (or nothing is saved yet). */
export function isUnsaved(work: Work | undefined, saved: { name: string; sound: SynthSound } | null, builtIn: boolean): boolean {
  if (!work) return false;
  if (!saved) return true;
  return !sameSound(work.sound, saved.sound) || (!builtIn && work.name !== saved.name);
}

export function initialForgeState(library: readonly SoundAsset[]): ForgeState {
  const key = builtInKey('torch-out');
  const saved = savedFor(key, library)!;
  return {
    work: { [key]: { name: saved.name, sound: cloneSound(saved.sound), past: [], future: [] } },
    stamp: null,
    tick: 0,
  };
}
