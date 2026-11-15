// Game Sound Events - Centralized sound trigger system
// This module provides a simple interface to play sounds for game events

import { soundManager } from './soundManager';
import { loadSoundAsset, getGlobalSoundConfig } from './assetStorage';
import { LIVE_ASSETS_UPDATED_EVENT } from './livePull';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { loadSpellAsset } from './assetStorage';
import { renderSynthSound } from './synth/render';
import type { SynthSound } from './synth/types';
import type { SoundAsset, SoundTrigger } from '../types/game';

// Cache for resolved sound data (base64 audio or URL)
const soundCache = new Map<string, string | null>();

// Cache for URL audio data (fetched from remote)
const urlAudioCache = new Map<string, ArrayBuffer>();

/**
 * Fetch audio from URL and convert to base64 data URL
 */
async function fetchAudioFromUrl(url: string): Promise<string | null> {
  // Check URL cache first
  if (urlAudioCache.has(url)) {
    const buffer = urlAudioCache.get(url)!;
    return arrayBufferToBase64DataUrl(buffer, url);
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch audio from URL: ${url}`, response.status);
      return null;
    }

    const buffer = await response.arrayBuffer();
    urlAudioCache.set(url, buffer);
    return arrayBufferToBase64DataUrl(buffer, url);
  } catch (error) {
    console.error(`Error fetching audio from URL: ${url}`, error);
    return null;
  }
}

/**
 * Convert ArrayBuffer to base64 data URL
 */
function arrayBufferToBase64DataUrl(buffer: ArrayBuffer, url: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  // Determine MIME type from URL extension
  const extension = url.split('.').pop()?.toLowerCase() || 'mp3';
  const mimeTypes: Record<string, string> = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'webm': 'audio/webm',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
  };
  const mimeType = mimeTypes[extension] || 'audio/mpeg';

  return `data:${mimeType};base64,${base64}`;
}

/**
 * Get the audio data for a sound asset ID (supports both base64 and URL)
 */
async function resolveSoundData(soundId: string | undefined): Promise<string | null> {
  if (!soundId) return null;

  // Check cache
  if (soundCache.has(soundId)) {
    return soundCache.get(soundId) || null;
  }

  // Load sound asset. A miss is NOT cached: on the player site assets
  // arrive after boot, and a cached miss kept that sound silent all session.
  const soundAsset = loadSoundAsset(soundId);
  if (!soundAsset) return null;

  // Prefer base64 data if available (faster, no network request)
  if (soundAsset.audioData) {
    soundCache.set(soundId, soundAsset.audioData);
    return soundAsset.audioData;
  }

  // Fall back to URL if available
  if (soundAsset.audioUrl) {
    const audioData = await fetchAudioFromUrl(soundAsset.audioUrl);
    soundCache.set(soundId, audioData);
    return audioData;
  }

  soundCache.set(soundId, null);
  return null;
}

// Code-made sounds (SoundAsset.synth, edited in the Sound Forge), by sound
// id. A sound that turned out to be an audio file is remembered as null so
// the library is not searched again on every hit.
const synthCache = new Map<string, SynthSound | null>();

/** Play a code-made sound on the effects channel. */
export function playSynthSound(synth: SynthSound): void {
  soundManager.playSynth((ctx, out, at) => renderSynthSound(ctx, out, at, synth));
}

/**
 * Play a sound asset by id, whichever kind it is: a code-made sound is
 * rendered on the spot, an audio file goes through the decoder. Every sound
 * slot in the game ends here, so each of them takes either kind.
 */
async function playSoundById(soundId: string | undefined): Promise<void> {
  if (!soundId) return;
  let synth = synthCache.get(soundId);
  if (synth === undefined && !soundCache.has(soundId)) {
    // Not looked up yet. A miss is NOT cached (see resolveSoundData).
    const asset = loadSoundAsset(soundId);
    if (!asset) return;
    synth = asset.synth ?? null;
    synthCache.set(soundId, synth);
  }
  if (synth) {
    playSynthSound(synth);
    return;
  }
  const audioData = await resolveSoundData(soundId);
  if (audioData) await soundManager.playSfx(audioData);
}

/** Play a sound asset directly (the editors' preview buttons). */
export async function playSoundAsset(asset: SoundAsset): Promise<void> {
  if (asset.synth) {
    playSynthSound(asset.synth);
  } else if (asset.audioData) {
    await soundManager.playSfx(asset.audioData);
  } else if (asset.audioUrl) {
    const audioData = await fetchAudioFromUrl(asset.audioUrl);
    if (audioData) await soundManager.playSfx(audioData);
  }
}

/**
 * Where a sound asset's audio can be STREAMED from: its inline data, else
 * its file URL. Used for music, which plays through an <audio> element and
 * so needs no download up front (resolveSoundData fetches the whole file).
 */
function resolveMusicSource(soundId: string | undefined): string | null {
  if (!soundId) return null;
  const soundAsset = loadSoundAsset(soundId);
  return soundAsset?.audioData || soundAsset?.audioUrl || null;
}

/**
 * Clear the sound cache (call when assets might have changed)
 */
export function clearSoundCache(): void {
  soundCache.clear();
  synthCache.clear();
}

/**
 * Play a global game sound trigger
 */
export async function playGameSound(trigger: SoundTrigger): Promise<void> {
  const config = getGlobalSoundConfig();

  let soundId: string | undefined;

  switch (trigger) {
    case 'teleport':
      soundId = config.teleport;
      break;
    case 'ice_slide':
      soundId = config.iceSlide;
      break;
    case 'tile_damage':
      soundId = config.tileDamage;
      break;
    case 'pressure_plate':
      soundId = config.pressurePlate;
      break;
    case 'victory':
      soundId = config.victory;
      break;
    case 'defeat':
      soundId = config.defeat;
      break;
    case 'life_lost':
      soundId = config.lifeLost;
      break;
    case 'button_click':
      soundId = config.buttonClick;
      break;
    case 'character_placed':
      soundId = config.characterPlaced;
      break;
    case 'character_removed':
      soundId = config.characterRemoved;
      break;
    case 'simulation_start':
      soundId = config.simulationStart;
      break;
    case 'simulation_stop':
      soundId = config.simulationStop;
      break;
    case 'error':
      soundId = config.error;
      break;
  }

  await playSoundById(soundId);
}

/**
 * Play character-specific sound (death, damage taken)
 */
export async function playCharacterSound(
  characterId: string,
  event: 'death' | 'damage_taken'
): Promise<void> {
  const character = getCharacter(characterId);
  if (!character?.sounds) return;

  let soundId: string | undefined;

  switch (event) {
    case 'death':
      soundId = character.sounds.death;
      break;
    case 'damage_taken':
      soundId = character.sounds.damageTaken;
      break;
  }

  await playSoundById(soundId);
}

/**
 * Play enemy-specific sound (death, damage taken)
 */
export async function playEnemySound(
  enemyId: string,
  event: 'death' | 'damage_taken'
): Promise<void> {
  const enemy = getEnemy(enemyId);
  if (!enemy?.sounds) return;

  let soundId: string | undefined;

  switch (event) {
    case 'death':
      soundId = enemy.sounds.death;
      break;
    case 'damage_taken':
      soundId = enemy.sounds.damageTaken;
      break;
  }

  await playSoundById(soundId);
}

/**
 * Play spell sound (cast or hit)
 */
export async function playSpellSound(
  spellId: string,
  event: 'cast' | 'hit'
): Promise<void> {
  const spell = loadSpellAsset(spellId);
  if (!spell) return;

  let soundId: string | undefined;

  switch (event) {
    case 'cast':
      soundId = spell.castSound;
      break;
    case 'hit':
      soundId = spell.hitSound;
      break;
  }

  await playSoundById(soundId);
}

/**
 * Play background music (if configured)
 * @param puzzleMusicId - Optional puzzle-specific music ID. If provided and valid, uses this instead of global config.
 */
export async function playBackgroundMusic(puzzleMusicId?: string): Promise<void> {
  backgroundRequest = { puzzleMusicId };

  // Try puzzle-specific music first, fall back to global config
  let musicId = puzzleMusicId;

  if (!musicId) {
    const config = getGlobalSoundConfig();
    musicId = config.backgroundMusic;
  }

  const source = resolveMusicSource(musicId);
  if (source) {
    await soundManager.playMusic(source, true);
  }
}

// The background music the game last asked for. On the player site a
// puzzle's sounds arrive AFTER its board is up, so the first request finds
// nothing: when assets land it is asked again. (playMusic ignores a repeat
// of the track already playing.)
let backgroundRequest: { puzzleMusicId?: string } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener(LIVE_ASSETS_UPDATED_EVENT, () => {
    if (backgroundRequest) void playBackgroundMusic(backgroundRequest.puzzleMusicId);
  });
}

/**
 * Play victory music stinger (if configured)
 */
export async function playVictoryMusic(): Promise<void> {
  const source = resolveMusicSource(getGlobalSoundConfig().victoryMusic);
  if (source) {
    stopMusic();
    await soundManager.playMusic(source, false);
  }
}

/**
 * Play defeat music stinger (if configured)
 */
export async function playDefeatMusic(): Promise<void> {
  const source = resolveMusicSource(getGlobalSoundConfig().defeatMusic);
  if (source) {
    stopMusic();
    await soundManager.playMusic(source, false);
  }
}

/**
 * Stop all music
 */
export function stopMusic(): void {
  backgroundRequest = null; // nothing to bring back when assets land
  soundManager.stopMusic();
}
