import React, { useState } from 'react';
import { isHapticsSupported, isHapticsEnabled, setHapticsEnabled } from '../../utils/haptics';

export const HapticSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(isHapticsEnabled());

  if (!isHapticsSupported()) return null;

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setHapticsEnabled(next);
    // Give immediate feedback
    if (next) {
      try { navigator.vibrate(10); } catch {}
    }
  };

  return (
    <button
      onClick={toggle}
      className={`px-2 py-1.5 rounded text-xs transition-colors ${
        enabled
          ? 'bg-stone-700 text-parchment-200 hover:bg-stone-600'
          : 'bg-stone-800 text-stone-500 hover:bg-stone-700'
      }`}
      title={enabled ? 'Haptics On' : 'Haptics Off'}
    >
      {enabled ? '📳' : '📴'}
    </button>
  );
};
