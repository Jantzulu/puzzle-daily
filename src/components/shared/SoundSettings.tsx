import React, { useState, useEffect } from 'react';
import { soundManager } from '../../utils/soundManager';
import { isHapticsSupported, isHapticsEnabledByPlayer, setHapticsEnabledByPlayer, vibratePreview } from '../../utils/haptics';
import { NavSheet } from './NavSheet';
import type { SoundSettings as SoundSettingsType } from '../../types/game';

const Toggle: React.FC<{ on: boolean; onClick: () => void; label: string }> = ({ on, onClick, label }) => (
  <button
    onClick={onClick}
    aria-label={label}
    aria-pressed={on}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
      on ? 'bg-blue-600' : 'bg-stone-600'
    }`}
  >
    <span
      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
        on ? 'translate-x-5' : 'translate-x-1'
      }`}
    />
  </button>
);

export const SoundSettings: React.FC = () => {
  const [settings, setSettings] = useState<SoundSettingsType>(soundManager.getSettings());
  const [hapticsOn, setHapticsOn] = useState(isHapticsEnabledByPlayer());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Initialize audio context on first interaction
    const initAudio = () => {
      soundManager.initialize();
      document.removeEventListener('click', initAudio);
    };
    document.addEventListener('click', initAudio);
    return () => document.removeEventListener('click', initAudio);
  }, []);

  const handleMasterChange = (value: number) => {
    soundManager.setMasterVolume(value);
    setSettings(soundManager.getSettings());
  };

  const handleMusicChange = (value: number) => {
    soundManager.setMusicVolume(value);
    setSettings(soundManager.getSettings());
  };

  const handleSfxChange = (value: number) => {
    soundManager.setSfxVolume(value);
    setSettings(soundManager.getSettings());
  };

  const handleToggle = () => {
    soundManager.setEnabled(!settings.enabled);
    setSettings(soundManager.getSettings());
  };

  const handleHapticsToggle = () => {
    const next = !hapticsOn;
    setHapticsEnabledByPlayer(next);
    setHapticsOn(next);
    // A little buzz confirms the switch actually does something
    if (next) vibratePreview('tap');
  };

  const VolumeSlider: React.FC<{
    label: string;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
  }> = ({ label, value, onChange, disabled }) => (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-sm text-parchment-300">{label}</span>
        <span className="text-xs text-stone-500">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
          disabled ? 'bg-stone-700 opacity-50' : 'bg-stone-700'
        }`}
        style={{
          background: disabled
            ? '#374151'
            : `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${value * 100}%, #374151 ${value * 100}%, #374151 100%)`,
        }}
      />
    </div>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`nav-pill flex items-center gap-2 px-3 py-2 transition-colors ${
          settings.enabled ? 'text-parchment-300' : 'text-stone-500'
        }`}
        title="Sound & Haptics"
      >
        {settings.enabled ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6.253v11.494m0 0A5.001 5.001 0 0112 12m0 5.747V6.253m0 0A5.001 5.001 0 0012 12m0-5.747L8 9H5a1 1 0 00-1 1v4a1 1 0 001 1h3l4 2.747" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        )}
      </button>

      <NavSheet open={isOpen} onClose={() => setIsOpen(false)} label="Sound and haptics settings">
        <div className="p-3 border-b border-stone-700">
          <div className="flex items-center justify-between">
            <span className="text-parchment-100 font-medium">Sound</span>
            <Toggle on={settings.enabled} onClick={handleToggle} label="Toggle sound" />
          </div>
        </div>

        <div className="p-3 space-y-4">
          {/* eslint-disable-next-line react-hooks/static-components */}
          <VolumeSlider
            label="Master Volume"
            value={settings.masterVolume}
            onChange={handleMasterChange}
            disabled={!settings.enabled}
          />
          {/* eslint-disable-next-line react-hooks/static-components */}
          <VolumeSlider
            label="Music"
            value={settings.musicVolume}
            onChange={handleMusicChange}
            disabled={!settings.enabled}
          />
          {/* eslint-disable-next-line react-hooks/static-components */}
          <VolumeSlider
            label="Sound Effects"
            value={settings.sfxVolume}
            onChange={handleSfxChange}
            disabled={!settings.enabled}
          />
        </div>

        {!settings.enabled && (
          <div className="px-3 pb-3">
            <p className="text-stone-500 text-xs">
              Sound is muted. Toggle the switch to enable.
            </p>
          </div>
        )}

        {isHapticsSupported() && (
          <div className="p-3 border-t border-stone-700">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-parchment-100 font-medium">Haptics</span>
                <p className="text-stone-500 text-xs mt-0.5">Vibration on taps and events</p>
              </div>
              <Toggle on={hapticsOn} onClick={handleHapticsToggle} label="Toggle haptics" />
            </div>
          </div>
        )}
      </NavSheet>
    </>
  );
};

export default SoundSettings;
