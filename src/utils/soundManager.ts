// Sound Manager - Web Audio API based sound system
// Handles sound effects, music, and volume controls

import type { SoundSettings, SoundTrigger } from '../types/game';
import { getMusicBlob } from './musicCache';

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
  // MUSIC STREAMS. It plays through an <audio> element (routed into
  // musicGain so the volume sliders and the on/off switch still apply),
  // which starts within moments and holds only a small buffer. It used to
  // be downloaded whole, turned into text, and decoded into memory before a
  // note played: for a two-minute track, tens of megabytes on a phone.
  // Sound effects are short and stay decoded buffers.
  private musicElement: HTMLAudioElement | null = null;
  private musicNode: MediaElementAudioSourceNode | null = null;
  private musicSrc: string | null = null;
  // The background track is played from a copy saved on the device
  // (musicCache.ts). While that copy is being fetched nothing sounds yet:
  // musicLoading names the track on its way, and musicRun changes whenever
  // the music is halted, so a load that finishes late knows it was dropped.
  private musicLoading: string | null = null;
  private musicRun = 0;
  private musicObjectUrl: string | null = null;

  // Cache for decoded audio buffers from base64
  private decodingPromises: Map<string, Promise<AudioBuffer>> = new Map();

  // Music waiting for a user gesture (browsers refuse to start audio
  // without one). unlock() starts it from inside the next gesture.
  private pendingMusic: { src: string; loop: boolean } | null = null;

  // The looping track the game currently wants, whether or not it can be
  // heard. Remembered while sound is OFF so that turning it on starts the
  // music straight away (it used to stay silent until a page refresh: the
  // request made while off had simply been dropped). Cleared by stopMusic().
  private wantedMusic: { src: string; loop: boolean } | null = null;

  constructor() {
    this.loadSettings();
  }

  // Initialize audio context (must be called after user interaction)
  public async initialize(): Promise<void> {
    if (this.audioContext) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // (Pending music is started by unlock(), from inside the gesture.)
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
    }
  }

  // Call from inside a user gesture (tap, click, key press). The first one
  // creates the audio context; every later one wakes a context the browser
  // has put to sleep. Browsers only allow that from a gesture, and iOS
  // Safari re-suspends ("interrupts") the context whenever the page goes to
  // the background or the phone locks, so one wake at the first click is
  // not enough: music would stay silent after the first app switch. A no-op
  // while the context is running.
  public unlock(): void {
    if (!this.audioContext) void this.initialize();
    const context = this.audioContext;
    if (context && context.state !== 'running') {
      void context.resume().catch(() => { /* not allowed yet; the next gesture retries */ });
    }
    // Music that was waiting for a gesture starts now, inside it.
    if (this.pendingMusic) {
      const { src, loop } = this.pendingMusic;
      this.pendingMusic = null;
      void this.playMusic(src, loop);
    } else if (this.settings.enabled && this.musicElement && this.musicElement.paused && !this.musicElement.ended) {
      // The system paused it (page backgrounded, phone locked): carry on.
      void this.musicElement.play().catch(() => { /* the next gesture retries */ });
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

    if (!enabled) {
      // Silence it, but remember what was wanted.
      this.haltMusic();
    } else if (this.wantedMusic && !this.musicElement && !this.musicLoading) {
      void this.playMusic(this.wantedMusic.src, this.wantedMusic.loop);
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

  // Play a sound made by code (chromeSounds.ts) on the effects channel, so
  // the volume sliders and the on/off switch apply. `build` schedules its
  // nodes into the destination it is given, starting at `at`.
  public playSynth(build: (context: AudioContext, destination: AudioNode, at: number) => void): void {
    if (!this.settings.enabled) return;
    // A tap on the page furniture can be the visit's very first gesture.
    if (!this.audioContext) this.unlock();
    const context = this.audioContext;
    const destination = this.sfxGain;
    if (!context || !destination) return;
    const run = () => {
      try {
        build(context, destination, context.currentTime);
      } catch (error) {
        console.error('Failed to play synthesized sound:', error);
      }
    };
    if (context.state === 'running') {
      run();
      return;
    }
    // Asleep (no gesture yet, or iOS suspended it in the background). From
    // inside a tap the wake is immediate. Otherwise the sound is dropped:
    // scheduled on a sleeping context it would go off at some later tap.
    const asked = performance.now();
    void context.resume().then(() => {
      if (performance.now() - asked < 250) run();
    }).catch(() => { /* not allowed yet */ });
  }

  // Play music (loops by default). `src` is anything an <audio> element
  // can play: a file URL or a data: URL. Nothing is downloaded while sound
  // is off: the request is only remembered.
  public async playMusic(src: string, loop: boolean = true): Promise<void> {
    if (!src) return;
    // A looping track is the background music: note it even while sound is
    // off. A one-shot stinger is not something to bring back later.
    if (loop) this.wantedMusic = { src, loop };
    if (!this.settings.enabled) return;

    // Already playing this very track, or already fetching it: leave it be
    // (callers re-request the background music whenever assets or the
    // puzzle change).
    if (loop && this.musicLoading === src) return;
    if (loop && this.musicElement && this.musicSrc === src && !this.musicElement.paused) return;

    // No audio context until the first gesture: wait for unlock().
    if (!this.audioContext || !this.musicGain) {
      this.pendingMusic = { src, loop };
      return;
    }

    this.haltMusic();

    // The looping background track plays from this device's saved copy,
    // downloaded once (musicCache.ts). On the very first visit that means
    // the music starts when the download finishes. If no copy can be had
    // (offline, no Cache Storage) it streams from the URL instead, as a
    // stinger always does.
    let playable = src;
    if (loop && /^https?:/i.test(src)) {
      const run = this.musicRun;
      this.musicLoading = src;
      const blob = await getMusicBlob(src);
      if (run !== this.musicRun) return; // halted or replaced meanwhile
      this.musicLoading = null;
      if (blob) {
        this.musicObjectUrl = URL.createObjectURL(blob);
        playable = this.musicObjectUrl;
      }
    }

    const element = new Audio();
    // Needed to route a file from another origin through the audio graph
    // (the host must allow it; Supabase Storage does).
    if (/^https?:/i.test(playable)) element.crossOrigin = 'anonymous';
    element.loop = loop;
    element.preload = 'auto';
    element.src = playable;
    try {
      this.musicNode = this.audioContext.createMediaElementSource(element);
      this.musicNode.connect(this.musicGain);
    } catch (error) {
      console.error('Failed to route music:', error);
      return;
    }
    this.musicElement = element;
    this.musicSrc = src;
    // A stinger that has finished is no longer "the music".
    element.addEventListener('ended', () => {
      if (this.musicElement === element) this.haltMusic();
    });

    try {
      await element.play();
    } catch (error) {
      if (this.musicElement !== element) return; // replaced or stopped meanwhile
      this.haltMusic();
      if ((error as { name?: string }).name === 'NotAllowedError') {
        // Not inside a gesture: the next one starts it.
        this.pendingMusic = { src, loop };
      } else {
        console.error('Failed to play music:', error);
      }
    }
  }

  // Stop background music: the game wants silence (and no track to bring
  // back when sound is turned on again).
  public stopMusic(): void {
    this.wantedMusic = null;
    this.pendingMusic = null;
    this.haltMusic();
  }

  // Stop whatever is sounding, without forgetting what was wanted.
  private haltMusic(): void {
    this.musicRun++;
    this.musicLoading = null;
    const element = this.musicElement;
    this.musicElement = null;
    this.musicSrc = null;
    if (element) {
      element.pause();
      // Drop the source so the browser stops downloading it.
      element.removeAttribute('src');
      element.load();
    }
    if (this.musicNode) {
      try { this.musicNode.disconnect(); } catch { /* already disconnected */ }
      this.musicNode = null;
    }
    if (this.musicObjectUrl) {
      URL.revokeObjectURL(this.musicObjectUrl);
      this.musicObjectUrl = null;
    }
  }

  // Pause music where it is; unlock() or setEnabled(true) carries on.
  public pauseMusic(): void {
    this.musicElement?.pause();
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
