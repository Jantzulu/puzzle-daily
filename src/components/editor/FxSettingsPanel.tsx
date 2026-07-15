// Performance / visual-FX toggles (2026-07-15). Surfaces the existing
// localStorage-backed render toggles (previously console-only) so frame cost
// can be bisected on a real device: flip one while a level is running — the
// render loop reads them live, no reload needed. Settings persist per device.
import React, { useState } from 'react';
import { blobShadowsEnabled, setBlobShadowsEnabled } from '../game/blobShadows';
import { lightGlowEnabled, setLightGlowEnabled } from '../game/lightGlow';
import { staticBakeEnabled, setStaticBakeEnabled } from '../game/staticBake';
import { atmosphereEnabled, setAtmosphereEnabled } from '../game/atmosphere';

interface FxToggle {
  key: string;
  label: string;
  description: string;
  get: () => boolean;
  set: (on: boolean) => void;
}

const TOGGLES: FxToggle[] = [
  {
    key: 'blob_shadows',
    label: 'Blob shadows',
    description: 'Soft ground ellipses under entities and projectiles. Off falls back to the legacy silhouette shadow.',
    get: blobShadowsEnabled,
    set: setBlobShadowsEnabled,
  },
  {
    key: 'light_glow',
    label: 'Emitted light glow',
    description: 'Additive halos behind glowing sprites (torch flicker). Off skips the pass entirely.',
    get: lightGlowEnabled,
    set: setLightGlowEnabled,
  },
  {
    key: 'atmosphere',
    label: 'Atmosphere (fog + dust)',
    description: 'The drifting mist wisps and twinkling dust specks over the board. Off skips the pass entirely.',
    get: atmosphereEnabled,
    set: setAtmosphereEnabled,
  },
  {
    key: 'static_bake',
    label: 'Static-layer bake',
    description: 'Caches border + tiles + wall AO to an offscreen canvas per turn instead of repainting every frame. Leave ON — off exists only for A/B comparison.',
    get: staticBakeEnabled,
    set: setStaticBakeEnabled,
  },
];

export const FxSettingsPanel: React.FC = () => {
  const [states, setStates] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(TOGGLES.map(t => [t.key, t.get()]))
  );

  const flip = (toggle: FxToggle) => {
    const next = !states[toggle.key];
    toggle.set(next);
    setStates(prev => ({ ...prev, [toggle.key]: next }));
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-bold mb-1">Rendering effects</h2>
      <p className="text-sm text-stone-400 mb-4">
        Live toggles for the board&apos;s per-frame effects — flip one while a level is
        running to isolate its frame cost on this device. Stored per device
        (localStorage); they affect visuals only, never gameplay.
      </p>
      <div className="space-y-3">
        {TOGGLES.map(toggle => (
          <label
            key={toggle.key}
            className="flex items-start gap-3 p-3 bg-stone-800 rounded cursor-pointer hover:bg-stone-750"
          >
            <input
              type="checkbox"
              checked={states[toggle.key]}
              onChange={() => flip(toggle)}
              className="w-4 h-4 mt-0.5 accent-copper-500"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{toggle.label}</div>
              <div className="text-xs text-stone-400 mt-0.5">{toggle.description}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};
