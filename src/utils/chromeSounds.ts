// Chrome sounds: short effects for the page furniture (the torches, the
// quest scroll; later the gate and the signs), made by code instead of
// played from files (user pick 2026-11-13). Nothing to download; they play
// through the effects channel, so the volume sliders and the sound switch
// apply.
//
// The sounds themselves are DATA now (utils/synth): builtIn.ts holds the
// recipes that ship with the game, render.ts turns one into audio, and the
// Sound Forge (Editors > Sound Forge) edits them. This file only decides
// which recipe to play and plays it.

import { soundManager } from './soundManager';
import { store } from './bigStore';
import { getSoundAssets } from './assetStorage';
import { builtInSound, type BuiltInSoundId } from './synth/builtIn';
import { renderSynthSound, type RenderOptions } from './synth/render';
import type { SynthSound } from './synth/types';

export type ChromeSound = BuiltInSoundId;

/**
 * The sound asset that overrides a built-in page sound ON THIS DEVICE. The
 * Sound Forge saves an edited page sound under this id, so it can be heard
 * in the game straight away. Players never have one: page furniture ships
 * with the deploy (the UI-chrome rule), so a change reaches them only when
 * builtIn.ts is updated.
 */
export const chromeSoundAssetId = (sound: ChromeSound): string => `chrome_${sound}`;

// The device's overrides, re-read only when the stored sound library changes
// (the library can hold uploaded audio, so it is not parsed on every tap).
let seenLibrary: string | null | undefined;
let overrides = new Map<string, SynthSound>();
function deviceOverride(sound: ChromeSound): SynthSound | undefined {
  const library = store.getItem('sound_assets');
  if (library !== seenLibrary) {
    seenLibrary = library;
    overrides = new Map();
    for (const asset of getSoundAssets()) {
      if (asset.synth && asset.id.startsWith('chrome_')) overrides.set(asset.id, asset.synth);
    }
  }
  return overrides.get(chromeSoundAssetId(sound));
}

/** The recipe the game plays for a page sound: this device's edit, else the built-in. */
export function chromeSoundRecipe(sound: ChromeSound): SynthSound {
  return deviceOverride(sound) ?? builtInSound(sound);
}

/**
 * `variant` 1 is the second of a pair (the second torch): pitched a little
 * lower, on a different stretch of noise, so a pair never sounds like one
 * sound doubled.
 */
const variantOptions = (variant: number): RenderOptions => (variant ? { pitch: 0.9, shuffle: 0.37 } : {});

/** Draw a page sound into any audio context (used for measuring it). */
export function renderChromeSound(sound: ChromeSound, ctx: BaseAudioContext, out: AudioNode, at: number, variant = 0): void {
  renderSynthSound(ctx, out, at, chromeSoundRecipe(sound), variantOptions(variant));
}

/**
 * Play a page sound now, or `delay` seconds from now (to land on a beat
 * partway through an animation). Silent when sound is off, or when audio
 * has not been woken by a tap yet.
 */
export function playChromeSound(sound: ChromeSound, variant = 0, delay = 0): void {
  const recipe = chromeSoundRecipe(sound);
  soundManager.playSynth((ctx, out, at) => renderSynthSound(ctx, out, at + delay, recipe, variantOptions(variant)));
}
