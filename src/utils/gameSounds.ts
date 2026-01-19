// Game Sound Events - Centralized sound trigger system
// This module provides a simple interface to play sounds for game events

import { soundManager } from './soundManager';
import { loadSoundAsset, getGlobalSoundConfig } from './assetStorage';
import { getCharacter } from '../data/characters';
import { getEnemy } from '../data/enemies';
import { loadSpellAsset } from './assetStorage';
import type { SoundTrigger, GlobalSoundConfig } from '../types/game';

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

  // Load sound asset
  const soundAsset = loadSoundAsset(soundId);
  if (!soundAsset) {
    soundCache.set(soundId, null);
    return null;
  }

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

/**
 * Clear the sound cache (call when assets might have changed)
 */
export function clearSoundCache(): void {
  soundCache.clear();
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

  const audioData = await resolveSoundData(soundId);
  if (audioData) {
    await soundManager.playSfx(audioData);
  }
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

  const audioData = await resolveSoundData(soundId);
  if (audioData) {
    await soundManager.playSfx(audioData);
  }
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

  const audioData = await resolveSoundData(soundId);
  if (audioData) {
    await soundManager.playSfx(audioData);
  }
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

  const audioData = await resolveSoundData(soundId);
  if (audioData) {
    await soundManager.playSfx(audioData);
  }
}

/**
 * Play background music (if configured)
 * @param puzzleMusicId - Optional puzzle-specific music ID. If provided and valid, uses this instead of global config.
 */
export async function playBackgroundMusic(puzzleMusicId?: string): Promise<void> {
  // Try puzzle-specific music first, fall back to global config
  let musicId = puzzleMusicId;

  if (!musicId) {
    const config = getGlobalSoundConfig();
    musicId = config.backgroundMusic;
  }

  if (!musicId) return;

  const audioData = await resolveSoundData(musicId);
  if (audioData) {
    await soundManager.playMusic(audioData, true);
  }
}

/**
 * Play victory music stinger (if configured)
 */
export async function playVictoryMusic(): Promise<void> {
  const config = getGlobalSoundConfig();
  if (config.victoryMusic) {
    const audioData = await resolveSoundData(config.victoryMusic);
    if (audioData) {
      soundManager.stopMusic();
      await soundManager.playMusic(audioData, false);
    }
  }
}

/**
 * Play defeat music stinger (if configured)
 */
export async function playDefeatMusic(): Promise<void> {
  const config = getGlobalSoundConfig();
  if (config.defeatMusic) {
    const audioData = await resolveSoundData(config.defeatMusic);
    if (audioData) {
      soundManager.stopMusic();
      await soundManager.playMusic(audioData, false);
    }
  }
}

/**
 * Stop all music
 */
export function stopMusic(): void {
  soundManager.stopMusic();
}
