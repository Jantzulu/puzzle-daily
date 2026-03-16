// Sound Manager - Web Audio API based sound system
// Handles sound effects, music, and volume controls

import type { SoundSettings, SoundTrigger } from '../types/game';

// Default settings
const DEFAULT_SETTINGS: SoundSettings = {
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.7,
  enabled: true,
};

const STORAGE_KEY = 'puzzle-game-sound-settings';

class SoundManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private settings: SoundSettings = DEFAULT_SETTINGS;
  private loadedSounds: Map<string, AudioBuffer> = new Map();
  private currentMusic: AudioBufferSourceNode | null = null;
  private musicStartTime: number = 0;
  private musicPauseTime: number = 0;

  // Cache for decoded audio buffers from base64
  private decodingPromises: Map<string, Promise<AudioBuffer>> = new Map();

  // Pending music to play when audio context is initialized
  private pendingMusic: { base64Audio: string; loop: boolean } | null = null;

  constructor() {
    this.loadSettings();
  }

  // Initialize audio context (must be called after user interaction)
  public async initialize(): Promise<void> {
    if (this.audioContext) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Create gain nodes for volume control hierarchy
      this.masterGain = this.audioContext.createGain();
      this.musicGain = this.audioContext.createGain();
      this.sfxGain = this.audioContext.createGain();

      // Connect hierarchy: music/sfx -> master -> destination
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.audioContext.destination);

      // Apply loaded settings
      this.applySettings();

      // Play any pending music that was requested before initialization
      if (this.pendingMusic) {
        const { base64Audio, loop } = this.pendingMusic;
        this.pendingMusic = null;
        // Use setTimeout to allow context to fully settle
        setTimeout(() => {
          this.playMusic(base64Audio, loop);
        }, 100);
      }
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
    }
  }

  // Ensure audio context is running (handles browser autoplay policy)
  private async ensureContextRunning(): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  // Load settings from localStorage
  private loadSettings(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Failed to load sound settings:', error);
    }
  }

  // Save settings to localStorage
  private saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Failed to save sound settings:', error);
    }
  }

  // Apply current settings to gain nodes
  private applySettings(): void {
    if (!this.masterGain || !this.musicGain || !this.sfxGain) return;

    const masterVol = this.settings.enabled ? this.settings.masterVolume : 0;
    this.masterGain.gain.value = masterVol;
    this.musicGain.gain.value = this.settings.musicVolume;
    this.sfxGain.gain.value = this.settings.sfxVolume;
  }

  // Public settings API
  public getSettings(): SoundSettings {
    return { ...this.settings };
  }

  public setMasterVolume(volume: number): void {
    this.settings.masterVolume = Math.max(0, Math.min(1, volume));
    this.applySettings();
    this.saveSettings();
  }

  public setMusicVolume(volume: number): void {
    this.settings.musicVolume = Math.max(0, Math.min(1, volume));
    this.applySettings();
    this.saveSettings();
  }

  public setSfxVolume(volume: number): void {
    this.settings.sfxVolume = Math.max(0, Math.min(1, volume));
    this.applySettings();
    this.saveSettings();
  }

  public setEnabled(enabled: boolean): void {
    this.settings.enabled = enabled;
    this.applySettings();
    this.saveSettings();

    // Stop music if disabled
    if (!enabled) {
      this.stopMusic();
    }
  }

  // Decode base64 audio data to AudioBuffer
  private async decodeBase64Audio(base64Data: string): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('Audio context not initialized');
    }

    // Check cache first
    if (this.loadedSounds.has(base64Data)) {
      return this.loadedSounds.get(base64Data)!;
    }

    // Check if already decoding
    if (this.decodingPromises.has(base64Data)) {
      return this.decodingPromises.get(base64Data)!;
    }

    // Start decoding
    const decodePromise = (async () => {
      // Remove data URL prefix if present
      const base64 = base64Data.includes(',')
        ? base64Data.split(',')[1]
        : base64Data;

      // Decode base64 to ArrayBuffer
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode to AudioBuffer
      const audioBuffer = await this.audioContext!.decodeAudioData(bytes.buffer);

      // Cache the result
      this.loadedSounds.set(base64Data, audioBuffer);
      this.decodingPromises.delete(base64Data);

      return audioBuffer;
    })();

    this.decodingPromises.set(base64Data, decodePromise);
    return decodePromise;
  }

  // Play a sound effect
  public async playSfx(base64Audio: string, volumeMultiplier: number = 1): Promise<void> {
    if (!this.settings.enabled || !base64Audio) return;

    try {
      await this.ensureContextRunning();

      const buffer = await this.decodeBase64Audio(base64Audio);
      const source = this.audioContext!.createBufferSource();
      source.buffer = buffer;

      // Create per-sound gain for volume multiplier
      const gainNode = this.audioContext!.createGain();
      gainNode.gain.value = volumeMultiplier;

      source.connect(gainNode);
      gainNode.connect(this.sfxGain!);

      source.start(0);
    } catch (error) {
      console.error('Failed to play sound effect:', error);
    }
  }

  // Play background music (loops by default)
  public async playMusic(base64Audio: string, loop: boolean = true): Promise<void> {
    if (!this.settings.enabled || !base64Audio) return;

    // If audio context isn't initialized yet, store as pending music
    // It will be played once the user interacts and context is initialized
    if (!this.audioContext) {
      this.pendingMusic = { base64Audio, loop };
      return;
    }

    try {
      await this.ensureContextRunning();

      // Stop current music
      this.stopMusic();

      const buffer = await this.decodeBase64Audio(base64Audio);
      this.currentMusic = this.audioContext!.createBufferSource();
      this.currentMusic.buffer = buffer;
      this.currentMusic.loop = loop;

      this.currentMusic.connect(this.musicGain!);
      this.currentMusic.start(0);
      this.musicStartTime = this.audioContext!.currentTime;
      this.musicPauseTime = 0;
    } catch (error) {
      console.error('Failed to play music:', error);
    }
  }

  // Stop background music
  public stopMusic(): void {
    if (this.currentMusic) {
      try {
        this.currentMusic.stop();
      } catch {
        // Already stopped
      }
      this.currentMusic = null;
    }
  }

  // Pause music (note: Web Audio API doesn't have true pause, so we stop and track time)
  public pauseMusic(): void {
    if (this.currentMusic && this.audioContext) {
      this.musicPauseTime = this.audioContext.currentTime - this.musicStartTime;
      this.stopMusic();
    }
  }

  // Clear cached sounds
  public clearCache(): void {
    this.loadedSounds.clear();
  }

  // Preload a sound for faster playback
  public async preloadSound(base64Audio: string): Promise<void> {
    if (!base64Audio) return;

    try {
      await this.ensureContextRunning();
      await this.decodeBase64Audio(base64Audio);
    } catch (error) {
      console.error('Failed to preload sound:', error);
    }
  }

  // Play sound for a specific game trigger
  public async playTriggerSound(
    trigger: SoundTrigger,
    soundSets: {
      globalSfx?: Record<SoundTrigger, string>;
      characterSounds?: Record<string, string>;
      enemySounds?: Record<string, string>;
      spellSounds?: Record<string, string>;
    },
    entityId?: string,
    spellId?: string
  ): Promise<void> {
    if (!this.settings.enabled) return;

    let soundData: string | undefined;

    // Priority: Entity-specific > Spell-specific > Global
    if (entityId && soundSets.characterSounds?.[entityId]) {
      soundData = soundSets.characterSounds[entityId];
    } else if (entityId && soundSets.enemySounds?.[entityId]) {
      soundData = soundSets.enemySounds[entityId];
    } else if (spellId && soundSets.spellSounds?.[spellId]) {
      soundData = soundSets.spellSounds[spellId];
    } else if (soundSets.globalSfx?.[trigger]) {
      soundData = soundSets.globalSfx[trigger];
    }

    if (soundData) {
      await this.playSfx(soundData);
    }
  }
}

// Singleton instance
export const soundManager = new SoundManager();

// Export for testing
export { SoundManager };
