import React, { useState, useEffect, useRef } from 'react';
import { soundManager } from '../../utils/soundManager';
import type { SoundSettings as SoundSettingsType } from '../../types/game';

interface SoundSettingsProps {
  onClose?: () => void;
}

export const SoundSettings: React.FC<SoundSettingsProps> = ({ onClose }) => {
  const [settings, setSettings] = useState<SoundSettingsType>(soundManager.getSettings());
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize audio context on first interaction
    const initAudio = () => {
      soundManager.initialize();
      document.removeEventListener('click', initAudio);
    };
    document.addEventListener('click', initAudio);
    return () => document.removeEventListener('click', initAudio);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const VolumeSlider: React.FC<{
    label: string;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
  }> = ({ label, value, onChange, disabled }) => (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-300">{label}</span>
        <span className="text-xs text-gray-500">{Math.round(value * 100)}%</span>
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
          disabled ? 'bg-gray-700 opacity-50' : 'bg-gray-700'
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
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded transition-colors bg-gray-700 hover:bg-gray-600 ${
          settings.enabled ? 'text-gray-300' : 'text-gray-500'
        }`}
        title="Sound Settings"
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
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="p-3 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">Sound Settings</span>
              <button
                onClick={handleToggle}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  settings.enabled ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    settings.enabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="p-3 space-y-4">
            <VolumeSlider
              label="Master Volume"
              value={settings.masterVolume}
              onChange={handleMasterChange}
              disabled={!settings.enabled}
            />
            <VolumeSlider
              label="Music"
              value={settings.musicVolume}
              onChange={handleMusicChange}
              disabled={!settings.enabled}
            />
            <VolumeSlider
              label="Sound Effects"
              value={settings.sfxVolume}
              onChange={handleSfxChange}
              disabled={!settings.enabled}
            />
          </div>

          {!settings.enabled && (
            <div className="px-3 pb-3">
              <p className="text-gray-500 text-xs">
                Sound is muted. Toggle the switch to enable.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SoundSettings;
