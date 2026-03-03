import React, { useState } from 'react';
import {
  isHapticsSupported,
  getHapticSettings,
  saveHapticSettings,
  HAPTIC_TRIGGERS,
  vibrateRaw,
} from '../../utils/haptics';
import type { HapticSettings as HapticSettingsType } from '../../utils/haptics';

export const HapticSettings: React.FC = () => {
  const [settings, setSettings] = useState<HapticSettingsType>(getHapticSettings);
  const [open, setOpen] = useState(false);

  if (!isHapticsSupported()) return null;

  const update = (next: HapticSettingsType) => {
    setSettings(next);
    saveHapticSettings(next);
  };

  const toggleMaster = () => {
    const next = { ...settings, masterEnabled: !settings.masterEnabled };
    update(next);
    if (next.masterEnabled) vibrateRaw('tap');
  };

  const toggleTrigger = (id: string) => {
    const next = {
      ...settings,
      triggers: { ...settings.triggers, [id]: !settings.triggers[id] },
    };
    update(next);
    if (next.masterEnabled && next.triggers[id]) {
      const trigger = HAPTIC_TRIGGERS.find(t => t.id === id);
      if (trigger) vibrateRaw(trigger.pattern);
    }
  };

  const gameplayTriggers = HAPTIC_TRIGGERS.filter(t => t.category === 'gameplay');
  const editorTriggers = HAPTIC_TRIGGERS.filter(t => t.category === 'editor');

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`px-2 py-1.5 rounded text-xs transition-colors ${
          settings.masterEnabled
            ? 'bg-stone-700 text-parchment-200 hover:bg-stone-600'
            : 'bg-stone-800 text-stone-500 hover:bg-stone-700'
        }`}
        title="Haptic Settings"
      >
        {settings.masterEnabled ? '📳' : '📴'}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 z-50 w-64 dungeon-panel p-3 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medieval text-copper-400">Haptics</span>
              <button
                onClick={toggleMaster}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  settings.masterEnabled
                    ? 'bg-moss-700 text-moss-200'
                    : 'bg-stone-700 text-stone-400'
                }`}
              >
                {settings.masterEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {settings.masterEnabled && (
              <div className="space-y-3">
                {/* Gameplay triggers */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1.5">Gameplay</div>
                  {gameplayTriggers.map(trigger => (
                    <label
                      key={trigger.id}
                      className="flex items-center gap-2 py-1 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={settings.triggers[trigger.id] ?? true}
                        onChange={() => toggleTrigger(trigger.id)}
                        className="accent-copper-500 w-3.5 h-3.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-stone-200 group-hover:text-parchment-100">
                          {trigger.label}
                        </div>
                        <div className="text-[10px] text-stone-500 leading-tight">
                          {trigger.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Editor triggers */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1.5">Editor</div>
                  {editorTriggers.map(trigger => (
                    <label
                      key={trigger.id}
                      className="flex items-center gap-2 py-1 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={settings.triggers[trigger.id] ?? false}
                        onChange={() => toggleTrigger(trigger.id)}
                        className="accent-copper-500 w-3.5 h-3.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-stone-200 group-hover:text-parchment-100">
                          {trigger.label}
                        </div>
                        <div className="text-[10px] text-stone-500 leading-tight">
                          {trigger.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
