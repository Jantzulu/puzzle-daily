import React, { useState } from 'react';
import { toast } from '../shared/Toast';
import type { StatusEffectAsset, SpriteReference } from '../../types/game';
import { StatusEffectType } from '../../types/game';
import { saveStatusEffectAsset } from '../../utils/assetStorage';
import { SpriteThumbnail } from './SpriteThumbnail';
import { SimpleIconEditor } from './SimpleIconEditor';
import { RichTextEditor } from './RichTextEditor';
import { useIsMobile } from '../../hooks/useMediaQuery';

interface StatusEffectEditorProps {
  effect?: StatusEffectAsset;
  onSave: () => void;
  onCancel: () => void;
}

// What each type does mechanically — shown below the type selector
const TYPE_DESCRIPTIONS: Record<StatusEffectType, string> = {
  [StatusEffectType.POISON]: 'Deals damage each turn. Stacks by default — multiple applications increase damage per tick.',
  [StatusEffectType.REGEN]: 'Heals a set amount each turn.',
  [StatusEffectType.SHIELD]: 'Absorbs incoming damage before health is reduced. Depletes as it absorbs hits; breaks when fully consumed. Set value to 0 for an infinite shield.',
  [StatusEffectType.STUN]: 'Cannot take any action for the duration. Not broken by damage.',
  [StatusEffectType.SLOW]: 'Skips every other movement action.',
  [StatusEffectType.HASTE]: 'Gains a bonus movement on every other movement action.',
  [StatusEffectType.SLEEP]: 'Cannot act. Immediately removed when taking any damage.',
  [StatusEffectType.SILENCED]: 'Cannot cast ranged or AOE spells.',
  [StatusEffectType.DISARMED]: 'Cannot perform melee attacks.',
  [StatusEffectType.BURN]: 'Deals fire damage each turn. Stacks by default.',
  [StatusEffectType.BLEED]: 'Deals physical damage each turn. Stacks by default.',
  [StatusEffectType.POLYMORPH]: 'Cannot act. Removed when taking damage. Optionally replaces the entity\'s sprite for the duration.',
  [StatusEffectType.STEALTH]: 'Cannot be auto-targeted by enemies. Entity is rendered at reduced opacity.',
  [StatusEffectType.DEFLECT]: 'Reflects incoming projectile damage back to the source.',
  [StatusEffectType.INVULNERABLE]: 'Completely immune to all damage for the duration.',
  [StatusEffectType.STEADFAST]: 'Immune to direction changes — redirect spells, tiles, and items have no effect.',
  [StatusEffectType.REFLECT]: 'Reflects incoming projectiles back at the caster\'s team. Configurable by direction, tint color, and sprite.',
  [StatusEffectType.CONTACT_DAMAGE]: 'Deals damage equal to the value when another entity enters the same tile. Use the value field to set how much damage is dealt.',
  [StatusEffectType.GHOST]: 'Can freely overlap and pass through other entities. Also allows other entities to pass through this one.',
  [StatusEffectType.WALL_ALIVE]: 'While alive, triggers wall-collision reactions in moving entities (turn left, turn right, bounce, etc.).',
  [StatusEffectType.WALL_DEAD]: 'While a corpse, triggers wall-collision reactions in moving entities. Has no effect while alive.',
  [StatusEffectType.WALL_BOTH]: 'Triggers wall-collision reactions in moving entities both while alive and as a corpse.',
  [StatusEffectType.HALT_ALIVE]: 'While alive, stops movement of entities that attempt to enter the same tile — without triggering wall-collision reactions.',
  [StatusEffectType.HALT_DEAD]: 'While a corpse, stops movement of entities that attempt to enter the same tile. Has no effect while alive.',
  [StatusEffectType.HALT_BOTH]: 'Stops movement of entities that attempt to enter the same tile both while alive and as a corpse.',
  [StatusEffectType.PRIORITY]: 'Acts before non-priority entities in melee ordering each turn.',
  [StatusEffectType.STURDY]: 'Cannot be pushed by push effects from spells or tiles.',
  [StatusEffectType.CHARM]: 'Temporarily inverts the entity\'s team allegiance for the duration. The entity auto-executes its normal behavior pattern but attacks its own original allies. Visually indicated by a configurable colour tint and ♥ heart icon above the entity.',
  [StatusEffectType.DISPEL]: 'Instantly strips positive status effects from the target (Regen, Shield, Haste, Stealth, Deflect, Invulnerable, Steadfast, Reflect). Use on hostile spells. Configure which effect types to remove and whether to show an icon.',
  [StatusEffectType.CLEANSE]: 'Instantly strips negative status effects from the target (Poison, Burn, Bleed, Stun, Sleep, Slow, Silenced, Disarmed, Charm, Polymorph). Use on friendly spells. Configure which effect types to remove and whether to show an icon.',
};

// Default icon color per type
const TYPE_COLORS: Record<StatusEffectType, string> = {
  [StatusEffectType.POISON]: '#22c55e',
  [StatusEffectType.REGEN]: '#10b981',
  [StatusEffectType.SHIELD]: '#22d3ee',
  [StatusEffectType.STUN]: '#eab308',
  [StatusEffectType.SLOW]: '#3b82f6',
  [StatusEffectType.HASTE]: '#fbbf24',
  [StatusEffectType.SLEEP]: '#6366f1',
  [StatusEffectType.SILENCED]: '#8b5cf6',
  [StatusEffectType.DISARMED]: '#9ca3af',
  [StatusEffectType.BURN]: '#f97316',
  [StatusEffectType.BLEED]: '#dc2626',
  [StatusEffectType.POLYMORPH]: '#ff69b4',
  [StatusEffectType.STEALTH]: '#4a5568',
  [StatusEffectType.DEFLECT]: '#a855f7',
  [StatusEffectType.INVULNERABLE]: '#fcd34d',
  [StatusEffectType.STEADFAST]: '#78716c',
  [StatusEffectType.REFLECT]: '#06b6d4',
  [StatusEffectType.CONTACT_DAMAGE]: '#dc2626',
  [StatusEffectType.GHOST]: '#e0f2fe',
  [StatusEffectType.WALL_ALIVE]: '#b45309',
  [StatusEffectType.WALL_DEAD]: '#78350f',
  [StatusEffectType.WALL_BOTH]: '#92400e',
  [StatusEffectType.HALT_ALIVE]: '#7c3aed',
  [StatusEffectType.HALT_DEAD]: '#4c1d95',
  [StatusEffectType.HALT_BOTH]: '#5b21b6',
  [StatusEffectType.PRIORITY]: '#be123c',
  [StatusEffectType.STURDY]: '#374151',
  [StatusEffectType.CHARM]: '#e879f9',
  [StatusEffectType.DISPEL]: '#f59e0b',
  [StatusEffectType.CLEANSE]: '#34d399',
};

function makeDefaultIcon(color: string): SpriteReference {
  return {
    type: 'inline',
    spriteData: {
      id: `icon_${Date.now()}`,
      name: 'Status Icon',
      type: 'simple',
      shape: 'circle',
      primaryColor: color,
      createdAt: new Date().toISOString(),
    },
  };
}

export const StatusEffectEditor: React.FC<StatusEffectEditorProps> = ({
  effect,
  onSave,
  onCancel,
}) => {
  const isMobile = useIsMobile();
  const [name, setName] = useState(effect?.name || '');
  const [description, setDescription] = useState(effect?.description || '');
  const [type, setType] = useState<StatusEffectType>(effect?.type || StatusEffectType.POISON);
  const [defaultDuration, setDefaultDuration] = useState(effect?.defaultDuration ?? 3);
  const [defaultValue, setDefaultValue] = useState(effect?.defaultValue ?? 1);
  const [stackingBehavior, setStackingBehavior] = useState<'refresh' | 'stack' | 'replace' | 'highest'>(
    effect?.stackingBehavior || 'refresh'
  );
  const [maxStacks, setMaxStacks] = useState(effect?.maxStacks ?? 5);
  const [iconSprite, setIconSprite] = useState<SpriteReference>(
    effect?.iconSprite || makeDefaultIcon(TYPE_COLORS[effect?.type || StatusEffectType.POISON])
  );
  const [editingIcon, setEditingIcon] = useState(false);
  const [healthBarColor, setHealthBarColor] = useState(effect?.healthBarColor || '#22d3ee');
  const [stealthOpacity, setStealthOpacity] = useState(effect?.stealthOpacity ?? 0.5);
  const [polymorphSprite, setPolymorphSprite] = useState<SpriteReference | undefined>(effect?.polymorphSprite);
  const [editingPolymorphSprite, setEditingPolymorphSprite] = useState(false);
  const [overlaySprite, setOverlaySprite] = useState<SpriteReference | undefined>(effect?.overlaySprite);
  const [overlayOpacity, setOverlayOpacity] = useState(effect?.overlayOpacity ?? 0.5);
  const [editingOverlay, setEditingOverlay] = useState(false);
  const [reflectTintColor, setReflectTintColor] = useState(effect?.reflectTintColor || '#ff0000');
  const [reflectOverrideSprite, setReflectOverrideSprite] = useState<SpriteReference | undefined>(effect?.reflectOverrideSprite);
  const [editingReflectSprite, setEditingReflectSprite] = useState(false);
  const [reflectImpactSprite, setReflectImpactSprite] = useState<SpriteReference | undefined>(effect?.reflectImpactSprite);
  const [editingReflectImpactSprite, setEditingReflectImpactSprite] = useState(false);
  const [reflectDirections, setReflectDirections] = useState<('front' | 'back' | 'left' | 'right')[]>(
    effect?.reflectDirections || ['front', 'back', 'left', 'right']
  );
  const reflectAllDirections = reflectDirections.length === 4;
  const [charmTintEnabled, setCharmTintEnabled] = useState(effect?.charmTintEnabled !== false);
  const [charmTintColor, setCharmTintColor] = useState(effect?.charmTintColor || '#e879f9');
  const [charmTintOpacity, setCharmTintOpacity] = useState(effect?.charmTintOpacity ?? 0.35);
  const [charmShowHeart, setCharmShowHeart] = useState(effect?.charmShowHeart !== false);

  // Dispel/Cleanse state
  const [targetingIntent, setTargetingIntent] = useState<'hostile' | 'friendly' | undefined>(effect?.targetingIntent);
  const [targetEffectTypesAll, setTargetEffectTypesAll] = useState<boolean>(
    !effect?.targetEffectTypes || effect.targetEffectTypes === 'all'
  );
  const [targetEffectTypesList, setTargetEffectTypesList] = useState<StatusEffectType[]>(
    Array.isArray(effect?.targetEffectTypes) ? effect.targetEffectTypes : []
  );
  const [immuneToDispel, setImmuneToDispel] = useState(effect?.immuneToDispel ?? false);
  const [immuneToCleanse, setImmuneToCleanse] = useState(effect?.immuneToCleanse ?? false);
  const [hideFromStatusBar, setHideFromStatusBar] = useState(effect?.hideFromStatusBar ?? false);

  const handleSave = () => {
    if (!name.trim()) {
      toast.warning('Please enter a name for the status effect.');
      return;
    }

    const effectData: StatusEffectAsset = {
      id: effect?.id || 'status_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: name.trim(),
      description: description.trim(),
      type,
      iconSprite,
      defaultDuration,
      defaultValue: defaultValue || undefined,
      stackingBehavior,
      maxStacks: stackingBehavior === 'stack' ? maxStacks : undefined,
      healthBarColor: type === StatusEffectType.SHIELD ? healthBarColor : undefined,
      stealthOpacity: type === StatusEffectType.STEALTH ? stealthOpacity : undefined,
      polymorphSprite: type === StatusEffectType.POLYMORPH ? polymorphSprite : undefined,
      overlaySprite: overlaySprite,
      overlayOpacity: overlaySprite ? overlayOpacity : undefined,
      reflectTintColor: type === StatusEffectType.REFLECT ? reflectTintColor : undefined,
      reflectOverrideSprite: type === StatusEffectType.REFLECT ? reflectOverrideSprite : undefined,
      reflectImpactSprite: type === StatusEffectType.REFLECT ? reflectImpactSprite : undefined,
      reflectDirections: type === StatusEffectType.REFLECT && !reflectAllDirections ? reflectDirections : undefined,
      charmTintEnabled: type === StatusEffectType.CHARM ? charmTintEnabled : undefined,
      charmTintColor: type === StatusEffectType.CHARM && charmTintEnabled ? charmTintColor : undefined,
      charmTintOpacity: type === StatusEffectType.CHARM && charmTintEnabled ? charmTintOpacity : undefined,
      charmShowHeart: type === StatusEffectType.CHARM ? charmShowHeart : undefined,
      targetingIntent: (type === StatusEffectType.DISPEL || type === StatusEffectType.CLEANSE) ? targetingIntent : undefined,
      targetEffectTypes: (type === StatusEffectType.DISPEL || type === StatusEffectType.CLEANSE)
        ? (targetEffectTypesAll ? 'all' : targetEffectTypesList)
        : undefined,
      immuneToDispel: immuneToDispel || undefined,
      immuneToCleanse: immuneToCleanse || undefined,
      hideFromStatusBar: (type === StatusEffectType.DISPEL || type === StatusEffectType.CLEANSE) ? hideFromStatusBar : undefined,
      createdAt: effect?.createdAt || new Date().toISOString(),
      folderId: effect?.folderId,
    };

    saveStatusEffectAsset(effectData);
    toast.success(`Saved "${name.trim()}"!`);
    onSave();
  };

  // Apply sensible defaults (duration, value, stacking, icon color) when type changes
  const applyTypeDefaults = (newType: StatusEffectType) => {
    setType(newType);
    // Update icon to the type's default color (preserves shape)
    setIconSprite(prev => ({
      ...prev,
      spriteData: prev.spriteData
        ? { ...prev.spriteData, primaryColor: TYPE_COLORS[newType] }
        : makeDefaultIcon(TYPE_COLORS[newType]).spriteData!,
    }));

    switch (newType) {
      case StatusEffectType.POISON:
      case StatusEffectType.BURN:
      case StatusEffectType.BLEED:
        setDefaultDuration(3); setDefaultValue(1);
        setStackingBehavior('stack'); setMaxStacks(5);
        break;
      case StatusEffectType.REGEN:
        setDefaultDuration(3); setDefaultValue(1);
        setStackingBehavior('refresh');
        break;
      case StatusEffectType.SHIELD:
        setDefaultDuration(3); setDefaultValue(5);
        setStackingBehavior('replace');
        break;
      case StatusEffectType.STUN:
        setDefaultDuration(1); setDefaultValue(0);
        setStackingBehavior('refresh');
        break;
      case StatusEffectType.SLEEP:
        setDefaultDuration(2); setDefaultValue(0);
        setStackingBehavior('refresh');
        break;
      case StatusEffectType.SLOW:
      case StatusEffectType.HASTE:
        setDefaultDuration(3); setDefaultValue(0);
        setStackingBehavior('refresh');
        break;
      case StatusEffectType.SILENCED:
      case StatusEffectType.DISARMED:
        setDefaultDuration(2); setDefaultValue(0);
        setStackingBehavior('refresh');
        break;
      case StatusEffectType.POLYMORPH:
        setDefaultDuration(3); setDefaultValue(0);
        setStackingBehavior('refresh');
        break;
      case StatusEffectType.STEALTH:
      case StatusEffectType.DEFLECT:
      case StatusEffectType.STEADFAST:
      case StatusEffectType.REFLECT:
        setDefaultDuration(3); setDefaultValue(0);
        setStackingBehavior('refresh');
        break;
      case StatusEffectType.INVULNERABLE:
        setDefaultDuration(1); setDefaultValue(0);
        setStackingBehavior('refresh');
        break;
      case StatusEffectType.CONTACT_DAMAGE:
        setDefaultDuration(99999); setDefaultValue(1);
        setStackingBehavior('refresh');
        break;
      case StatusEffectType.GHOST:
      case StatusEffectType.WALL_ALIVE:
      case StatusEffectType.WALL_DEAD:
      case StatusEffectType.WALL_BOTH:
      case StatusEffectType.HALT_ALIVE:
      case StatusEffectType.HALT_DEAD:
      case StatusEffectType.HALT_BOTH:
      case StatusEffectType.PRIORITY:
      case StatusEffectType.STURDY:
        setDefaultDuration(99999); setDefaultValue(0);
        setStackingBehavior('refresh');
        break;
      case StatusEffectType.CHARM:
        setDefaultDuration(3); setDefaultValue(0);
        setStackingBehavior('refresh');
        break;
      case StatusEffectType.DISPEL:
        setDefaultDuration(1); setDefaultValue(0);
        setStackingBehavior('replace');
        setTargetingIntent('hostile');
        setTargetEffectTypesAll(true);
        setHideFromStatusBar(true);
        break;
      case StatusEffectType.CLEANSE:
        setDefaultDuration(1); setDefaultValue(0);
        setStackingBehavior('replace');
        setTargetingIntent('friendly');
        setTargetEffectTypesAll(true);
        setHideFromStatusBar(true);
        break;
    }
  };

  return (
    <div className="bg-stone-800 p-4 md:p-6 rounded space-y-6">
      <div className="dungeon-panel p-3 md:p-4 rounded">
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <div className="flex w-10 h-10 md:w-16 md:h-16 bg-stone-700 rounded-pixel items-center justify-center overflow-hidden flex-shrink-0">
              {iconSprite?.type === 'inline' && iconSprite.spriteData ? (
                <SpriteThumbnail sprite={iconSprite.spriteData} size={isMobile ? 40 : 64} />
              ) : (
                <span className="text-stone-400 text-lg">🔮</span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg md:text-2xl font-bold font-medieval text-copper-400 truncate">
                {name || 'Unnamed Effect'}
              </h2>
              <p className="text-xs text-stone-400">{type}</p>
            </div>
          </div>
          <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
            <button
              onClick={onCancel}
              className="p-2 md:px-3 md:py-1.5 text-sm bg-stone-600 hover:bg-stone-500 rounded"
              title="Cancel"
            >
              <span className="md:hidden">✕</span>
              <span className="hidden md:inline">Cancel</span>
            </button>
            <button onClick={handleSave} className="dungeon-btn-success text-sm">
              <span className="md:hidden">💾</span>
              <span className="hidden md:inline">Save</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column - Basic Info */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-stone-700 rounded"
              placeholder="e.g., Poison, Stun, Sleep"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="Describe what this effect does..."
              multiline
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Effect Type</label>
            <select
              value={type}
              onChange={(e) => applyTypeDefaults(e.target.value as StatusEffectType)}
              className="w-full px-3 py-2 bg-stone-700 rounded"
            >
              {Object.values(StatusEffectType).map(t => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <div
              className="mt-1 h-1.5 rounded"
              style={{ backgroundColor: TYPE_COLORS[type] }}
            />
            <p className="mt-2 text-xs text-stone-300 bg-stone-700/60 rounded px-2 py-1.5 leading-relaxed">
              {TYPE_DESCRIPTIONS[type]}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Default Duration (turns)</label>
              <input
                type="number"
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 bg-stone-700 rounded"
                min="1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {type === StatusEffectType.SHIELD ? 'Shield Amount (0 = infinite)' : 'Default Value (dmg/heal)'}
              </label>
              <input
                type="number"
                value={defaultValue}
                onChange={(e) => setDefaultValue(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 bg-stone-700 rounded"
                min="0"
              />
              <p className="text-xs text-stone-400 mt-1">
                {type === StatusEffectType.SHIELD
                  ? 'Total damage absorbed before shield breaks (0 = blocks all damage)'
                  : type === StatusEffectType.REGEN
                  ? 'Health restored per turn'
                  : [StatusEffectType.POISON, StatusEffectType.BURN, StatusEffectType.BLEED].includes(type)
                  ? 'Damage dealt per turn (multiplied by stacks)'
                  : 'Not used by this effect type'}
              </p>
            </div>
          </div>

          {/* Health Bar Color - only for Shield type */}
          {type === StatusEffectType.SHIELD && (
            <div className="space-y-3 p-3 rounded-lg bg-cyan-900/20 border border-cyan-800">
              <h4 className="text-sm font-medium text-cyan-300">Shield Visuals</h4>
              <p className="text-xs text-stone-400">
                While shielded, the entity's health bar changes to this colour to indicate active protection.
              </p>
              <div>
                <label className="block text-xs font-medium mb-1">Health Bar Colour</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={healthBarColor}
                    onChange={(e) => setHealthBarColor(e.target.value)}
                    className="w-10 h-7 rounded cursor-pointer border border-stone-600"
                  />
                  <div
                    className="flex-1 h-4 rounded"
                    style={{ backgroundColor: healthBarColor }}
                  />
                  <span className="text-xs text-stone-400 font-mono">{healthBarColor}</span>
                  <button
                    onClick={() => setHealthBarColor('#22d3ee')}
                    className="text-xs text-stone-500 hover:text-stone-300 underline"
                  >
                    Reset
                  </button>
                </div>
                <p className="text-xs text-stone-500 mt-1">Applied to the health bar fill and border while the shield is active.</p>
              </div>
            </div>
          )}

          {/* Stealth Opacity - only for Stealth type */}
          {type === StatusEffectType.STEALTH && (
            <div className="space-y-3 p-3 rounded-lg bg-stone-700/40 border border-stone-600">
              <h4 className="text-sm font-medium text-stone-300">Stealth Visuals</h4>
              <p className="text-xs text-stone-400">
                Stealthed entities are rendered at reduced opacity and cannot be auto-targeted by opposing entities.
              </p>
              <div>
                <label className="block text-xs font-medium mb-1">Stealth Opacity</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={stealthOpacity}
                    onChange={(e) => setStealthOpacity(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xs text-stone-400 font-mono w-12 text-right">
                    {Math.round(stealthOpacity * 100)}%
                  </span>
                  <button
                    onClick={() => setStealthOpacity(0.5)}
                    className="text-xs text-stone-500 hover:text-stone-300 underline"
                  >
                    Reset
                  </button>
                </div>
                <div
                  className="mt-2 h-8 rounded border border-stone-600 flex items-center justify-center text-xs text-stone-300 overflow-hidden relative"
                  style={{ backgroundColor: '#374151' }}
                >
                  <div className="absolute inset-0" style={{ opacity: stealthOpacity, backgroundColor: '#4a5568' }} />
                  <span className="relative">Entity sprite</span>
                </div>
              </div>
            </div>
          )}

          {/* Polymorph Sprite - only for Polymorph type */}
          {type === StatusEffectType.POLYMORPH && (
            <div className="space-y-2 p-3 rounded-lg bg-pink-900/20 border border-pink-800">
              <h4 className="text-sm font-medium text-pink-300">Polymorph Sprite (optional)</h4>
              <p className="text-xs text-stone-400">
                If set, the entity's sprite is replaced with this during the transformation.
              </p>
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 bg-stone-900 rounded border border-stone-600 flex items-center justify-center cursor-pointer hover:border-pink-500"
                  onClick={() => setEditingPolymorphSprite(true)}
                >
                  {polymorphSprite?.spriteData ? (
                    <SpriteThumbnail sprite={polymorphSprite.spriteData} size={44} />
                  ) : (
                    <span className="text-[9px] text-stone-500 text-center">None</span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => setEditingPolymorphSprite(true)}
                    className="px-2 py-1 bg-pink-700 rounded text-xs hover:bg-pink-600"
                  >
                    {polymorphSprite ? 'Edit' : 'Add Sprite'}
                  </button>
                  {polymorphSprite && (
                    <button
                      onClick={() => setPolymorphSprite(undefined)}
                      className="px-2 py-1 bg-red-600 rounded text-xs hover:bg-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Reflect Configuration - only for Reflect type */}
          {type === StatusEffectType.REFLECT && (
            <div className="space-y-3 p-3 rounded-lg bg-cyan-900/20 border border-cyan-800">
              <h4 className="text-sm font-medium text-cyan-300">Reflect Behavior</h4>

              {/* Direction Filter */}
              <div>
                <label className="block text-xs font-medium mb-2">Reflect Directions</label>
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reflectAllDirections}
                      onChange={(e) => {
                        setReflectDirections(e.target.checked ? ['front', 'back', 'left', 'right'] : []);
                      }}
                      className="rounded"
                    />
                    <span className="text-sm font-medium">Reflect All Directions</span>
                  </label>
                  {!reflectAllDirections && (
                    <div className="ml-6 grid grid-cols-2 gap-1">
                      {(['front', 'back', 'left', 'right'] as const).map(dir => (
                        <label key={dir} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reflectDirections.includes(dir)}
                            onChange={(e) => {
                              setReflectDirections(prev =>
                                e.target.checked ? [...prev, dir] : prev.filter(d => d !== dir)
                              );
                            }}
                            className="rounded"
                          />
                          <span className="text-xs capitalize">{dir}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-stone-500">
                    {reflectAllDirections
                      ? 'Reflects projectiles from any direction.'
                      : reflectDirections.length === 0
                      ? 'No directions selected — will not reflect anything.'
                      : `Reflects projectiles from: ${reflectDirections.join(', ')} (relative to entity's facing direction).`
                    }
                  </p>
                </div>
              </div>

              <h4 className="text-sm font-medium text-cyan-300 pt-2 border-t border-cyan-800/50">Reflected Projectile Appearance</h4>
              <p className="text-xs text-stone-400">
                Configure how projectiles look after being reflected by this effect.
              </p>

              {/* Tint Color */}
              <div>
                <label className="block text-xs font-medium mb-1">Tint Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={reflectTintColor}
                    onChange={(e) => setReflectTintColor(e.target.value)}
                    className="w-10 h-7 rounded cursor-pointer border border-stone-600"
                  />
                  <span className="text-xs text-stone-400 font-mono">{reflectTintColor}</span>
                  <span className="text-xs text-stone-500">
                    {reflectOverrideSprite ? '(overridden by sprite below)' : 'Applied as overlay on original projectile'}
                  </span>
                </div>
              </div>

              {/* Override Sprite */}
              <div>
                <label className="block text-xs font-medium mb-1">Override Sprite (optional)</label>
                <p className="text-xs text-stone-400 mb-2">
                  Replace the reflected projectile's sprite entirely. If not set, tint color is used instead.
                </p>
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 bg-stone-900 rounded border border-stone-600 flex items-center justify-center cursor-pointer hover:border-cyan-500"
                    onClick={() => setEditingReflectSprite(true)}
                  >
                    {reflectOverrideSprite?.spriteData ? (
                      <SpriteThumbnail sprite={reflectOverrideSprite.spriteData} size={40} />
                    ) : (
                      <span className="text-[9px] text-stone-500 text-center">None</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => setEditingReflectSprite(true)}
                      className="px-2 py-1 bg-cyan-700 rounded text-xs hover:bg-cyan-600"
                    >
                      {reflectOverrideSprite ? 'Edit' : 'Add Sprite'}
                    </button>
                    {reflectOverrideSprite && (
                      <button
                        onClick={() => setReflectOverrideSprite(undefined)}
                        className="px-2 py-1 bg-red-600 rounded text-xs hover:bg-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Impact VFX Sprite */}
              <div>
                <label className="block text-xs font-medium mb-1">Impact Sprite (optional)</label>
                <p className="text-xs text-stone-400 mb-2">
                  VFX that plays at the reflect point when a projectile bounces off. If not set, a default circle using the tint color is used.
                </p>
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 bg-stone-900 rounded border border-stone-600 flex items-center justify-center cursor-pointer hover:border-cyan-500"
                    onClick={() => setEditingReflectImpactSprite(true)}
                  >
                    {reflectImpactSprite?.spriteData ? (
                      <SpriteThumbnail sprite={reflectImpactSprite.spriteData} size={40} />
                    ) : (
                      <span className="text-[9px] text-stone-500 text-center">None</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => setEditingReflectImpactSprite(true)}
                      className="px-2 py-1 bg-cyan-700 rounded text-xs hover:bg-cyan-600"
                    >
                      {reflectImpactSprite ? 'Edit' : 'Add Sprite'}
                    </button>
                    {reflectImpactSprite && (
                      <button
                        onClick={() => setReflectImpactSprite(undefined)}
                        className="px-2 py-1 bg-red-600 rounded text-xs hover:bg-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dispel Config — only for Dispel type */}
          {type === StatusEffectType.DISPEL && (
            <div className="space-y-3 p-3 rounded-lg bg-amber-900/20 border border-amber-800">
              <h4 className="text-sm font-medium text-amber-300">Dispel Configuration</h4>
              <p className="text-xs text-stone-400">
                Dispel strips <strong>positive</strong> effects from the target when this effect is applied. The effect is consumed instantly (duration 1). Best used on hostile spells.
              </p>

              {/* Effect types to remove */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
                  <input
                    type="checkbox"
                    checked={targetEffectTypesAll}
                    onChange={(e) => setTargetEffectTypesAll(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">Remove all positive effects</span>
                </label>
                {!targetEffectTypesAll && (
                  <div className="ml-6 space-y-1">
                    {([StatusEffectType.REGEN, StatusEffectType.SHIELD, StatusEffectType.HASTE, StatusEffectType.STEALTH, StatusEffectType.DEFLECT, StatusEffectType.INVULNERABLE, StatusEffectType.STEADFAST, StatusEffectType.REFLECT] as StatusEffectType[]).map(t => (
                      <label key={t} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={targetEffectTypesList.includes(t)}
                          onChange={(e) => setTargetEffectTypesList(prev =>
                            e.target.checked ? [...prev, t] : prev.filter(x => x !== t)
                          )}
                          className="rounded"
                        />
                        <span className="text-xs capitalize">{t}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Hide from status bar */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideFromStatusBar}
                  onChange={(e) => setHideFromStatusBar(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Hide icon from health bar (recommended for instant effects)</span>
              </label>
            </div>
          )}

          {/* Cleanse Config — only for Cleanse type */}
          {type === StatusEffectType.CLEANSE && (
            <div className="space-y-3 p-3 rounded-lg bg-emerald-900/20 border border-emerald-800">
              <h4 className="text-sm font-medium text-emerald-300">Cleanse Configuration</h4>
              <p className="text-xs text-stone-400">
                Cleanse strips <strong>negative</strong> effects from the target when this effect is applied. The effect is consumed instantly (duration 1). Best used on friendly spells.
              </p>

              {/* Effect types to remove */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
                  <input
                    type="checkbox"
                    checked={targetEffectTypesAll}
                    onChange={(e) => setTargetEffectTypesAll(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">Remove all negative effects</span>
                </label>
                {!targetEffectTypesAll && (
                  <div className="ml-6 space-y-1">
                    {([StatusEffectType.POISON, StatusEffectType.BURN, StatusEffectType.BLEED, StatusEffectType.STUN, StatusEffectType.SLEEP, StatusEffectType.SLOW, StatusEffectType.SILENCED, StatusEffectType.DISARMED, StatusEffectType.CHARM, StatusEffectType.POLYMORPH] as StatusEffectType[]).map(t => (
                      <label key={t} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={targetEffectTypesList.includes(t)}
                          onChange={(e) => setTargetEffectTypesList(prev =>
                            e.target.checked ? [...prev, t] : prev.filter(x => x !== t)
                          )}
                          className="rounded"
                        />
                        <span className="text-xs capitalize">{t}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Hide from status bar */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideFromStatusBar}
                  onChange={(e) => setHideFromStatusBar(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Hide icon from health bar (recommended for instant effects)</span>
              </label>
            </div>
          )}

          {/* Charm Visuals — only for Charm type */}
          {type === StatusEffectType.CHARM && (
            <div className="space-y-3 p-3 rounded-lg bg-fuchsia-900/20 border border-fuchsia-800">
              <h4 className="text-sm font-medium text-fuchsia-300">Charm Visuals</h4>
              <p className="text-xs text-stone-400">
                Charmed entities display a colour tint and ♥ heart icon by default. These are canvas-drawn and always visible — configure or disable them here.
              </p>

              {/* Tint toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={charmTintEnabled}
                  onChange={(e) => setCharmTintEnabled(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Show colour tint overlay</span>
              </label>

              {charmTintEnabled && (
                <>
                  {/* Tint color */}
                  <div>
                    <label className="block text-xs font-medium mb-1">Tint Colour</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={charmTintColor}
                        onChange={(e) => setCharmTintColor(e.target.value)}
                        className="w-10 h-7 rounded cursor-pointer border border-stone-600"
                      />
                      <span className="text-xs text-stone-400 font-mono">{charmTintColor}</span>
                      <button
                        onClick={() => setCharmTintColor('#e879f9')}
                        className="text-xs text-stone-500 hover:text-stone-300 underline"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {/* Tint opacity */}
                  <div>
                    <label className="block text-xs font-medium mb-1">Tint Opacity</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0.05"
                        max="1"
                        step="0.05"
                        value={charmTintOpacity}
                        onChange={(e) => setCharmTintOpacity(parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-xs text-stone-400 font-mono w-12 text-right">
                        {Math.round(charmTintOpacity * 100)}%
                      </span>
                    </div>
                    {/* Tint preview */}
                    <div
                      className="mt-2 h-8 rounded border border-stone-600 flex items-center justify-center text-xs text-white overflow-hidden relative"
                      style={{ backgroundColor: '#52525b' }}
                    >
                      <div
                        className="absolute inset-0"
                        style={{ backgroundColor: charmTintColor, opacity: charmTintOpacity }}
                      />
                      <span className="relative drop-shadow-md">Entity sprite</span>
                    </div>
                  </div>
                </>
              )}

              {/* Heart icon toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={charmShowHeart}
                  onChange={(e) => setCharmShowHeart(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Show ♥ heart icon above entity</span>
              </label>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Stacking Behavior</label>
            <select
              value={stackingBehavior}
              onChange={(e) => setStackingBehavior(e.target.value as typeof stackingBehavior)}
              className="w-full px-3 py-2 bg-stone-700 rounded"
            >
              <option value="refresh">Refresh — Reset duration on reapplication</option>
              <option value="stack">Stack — Increase stacks (multiply effect)</option>
              <option value="replace">Replace — Remove old, apply new</option>
              <option value="highest">Highest — Keep the stronger instance</option>
            </select>
          </div>

          {stackingBehavior === 'stack' && (
            <div>
              <label className="block text-sm font-medium mb-1">Max Stacks</label>
              <input
                type="number"
                value={maxStacks}
                onChange={(e) => setMaxStacks(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 bg-stone-700 rounded"
                min="1"
                max="99"
              />
            </div>
          )}

          {/* Dispel/Cleanse Immunity toggles — available on all types */}
          {type !== StatusEffectType.DISPEL && type !== StatusEffectType.CLEANSE && (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-stone-400 font-medium">Removal Immunity</p>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={immuneToDispel}
                  onChange={(e) => setImmuneToDispel(e.target.checked)}
                  className="rounded"
                />
                <span className="text-xs">Immune to Dispel (cannot be stripped by Dispel effects)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={immuneToCleanse}
                  onChange={(e) => setImmuneToCleanse(e.target.checked)}
                  className="rounded"
                />
                <span className="text-xs">Immune to Cleanse (cannot be stripped by Cleanse effects)</span>
              </label>
            </div>
          )}
        </div>

        {/* Right Column - Visuals */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Icon</label>
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 bg-stone-900 rounded border border-stone-600 flex items-center justify-center cursor-pointer hover:border-blue-500"
                onClick={() => setEditingIcon(true)}
              >
                <SpriteThumbnail sprite={iconSprite.spriteData} size={48} />
              </div>
              <button
                onClick={() => setEditingIcon(true)}
                className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-700"
              >
                Edit Icon
              </button>
            </div>
          </div>

          {/* Overlay Sprite Section */}
          <div>
            <label className="block text-sm font-medium mb-2">Overlay Sprite (optional)</label>
            <p className="text-xs text-stone-400 mb-2">
              Sprite displayed on top of entities with this effect (e.g., shield bubble, chains)
            </p>
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 bg-stone-900 rounded border border-stone-600 flex items-center justify-center cursor-pointer hover:border-blue-500"
                onClick={() => setEditingOverlay(true)}
                style={{ opacity: overlaySprite ? overlayOpacity : 0.3 }}
              >
                {overlaySprite?.spriteData ? (
                  <SpriteThumbnail sprite={overlaySprite.spriteData} size={48} />
                ) : (
                  <span className="text-xs text-stone-500 text-center">No<br/>Overlay</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setEditingOverlay(true)}
                  className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-700"
                >
                  {overlaySprite ? 'Edit Overlay' : 'Add Overlay'}
                </button>
                {overlaySprite && (
                  <button
                    onClick={() => setOverlaySprite(undefined)}
                    className="px-3 py-1 bg-red-600 rounded text-sm hover:bg-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            {overlaySprite && (
              <div className="mt-3">
                <label className="block text-xs font-medium mb-1">Overlay Opacity</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xs text-stone-400 font-mono w-12 text-right">
                    {Math.round(overlayOpacity * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="mt-4 p-4 bg-stone-900 rounded">
            <h3 className="text-sm font-medium mb-2">Preview</h3>
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded flex items-center justify-center"
                style={{ backgroundColor: TYPE_COLORS[type] }}
              >
                <SpriteThumbnail sprite={iconSprite.spriteData} size={24} />
              </div>
              <div>
                <p className="font-bold">{name || 'Unnamed'}</p>
                <p className="text-xs text-stone-400">
                  {defaultDuration} turn{defaultDuration !== 1 ? 's' : ''}
                  {defaultValue > 0 && ` | ${defaultValue} ${
                    type === StatusEffectType.REGEN ? 'heal/turn' :
                    type === StatusEffectType.SHIELD ? 'dmg absorbed' :
                    [StatusEffectType.POISON, StatusEffectType.BURN, StatusEffectType.BLEED].includes(type) ? 'dmg/turn' :
                    'value'
                  }`}
                  {type === StatusEffectType.SHIELD && defaultValue === 0 && ' | blocks all dmg'}
                  {stackingBehavior === 'stack' && ` | max ${maxStacks} stacks`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Icon Editor Modal */}
      {editingIcon && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-stone-800 p-6 rounded-lg max-w-md max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">Edit Status Effect Icon</h3>
            <SimpleIconEditor
              sprite={iconSprite}
              onChange={setIconSprite}
              size={96}
            />
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setEditingIcon(false)}
                className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Polymorph Sprite Editor Modal */}
      {editingPolymorphSprite && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-stone-800 p-6 rounded-lg max-w-md max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">Polymorph Replacement Sprite</h3>
            <p className="text-sm text-stone-400 mb-4">
              This sprite replaces the entity's appearance while they are polymorphed.
            </p>
            <SimpleIconEditor
              sprite={polymorphSprite || {
                type: 'inline',
                spriteData: {
                  id: `polymorph_sprite_${Date.now()}`,
                  name: 'Polymorph Sprite',
                  type: 'simple',
                  shape: 'circle',
                  primaryColor: '#ff69b4',
                  createdAt: new Date().toISOString(),
                },
              }}
              onChange={(sprite) => setPolymorphSprite(sprite)}
              size={96}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditingPolymorphSprite(false)}
                className="px-4 py-2 bg-pink-600 rounded hover:bg-pink-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reflect Override Sprite Editor Modal */}
      {editingReflectSprite && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-stone-800 p-6 rounded-lg max-w-md max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">Reflected Projectile Sprite</h3>
            <p className="text-sm text-stone-400 mb-4">
              This sprite replaces the original projectile sprite when reflected.
            </p>
            <SimpleIconEditor
              sprite={reflectOverrideSprite || {
                type: 'inline',
                spriteData: {
                  id: `reflect_sprite_${Date.now()}`,
                  name: 'Reflect Sprite',
                  type: 'simple',
                  shape: 'circle',
                  primaryColor: '#06b6d4',
                  createdAt: new Date().toISOString(),
                },
              }}
              onChange={(sprite) => setReflectOverrideSprite(sprite)}
              size={96}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditingReflectSprite(false)}
                className="px-4 py-2 bg-cyan-600 rounded hover:bg-cyan-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reflect Impact Sprite Editor Modal */}
      {editingReflectImpactSprite && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-stone-800 p-6 rounded-lg max-w-md max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">Reflect Impact VFX Sprite</h3>
            <p className="text-sm text-stone-400 mb-4">
              This sprite plays as a VFX at the reflect point when a projectile bounces off.
            </p>
            <SimpleIconEditor
              sprite={reflectImpactSprite || {
                type: 'inline',
                spriteData: {
                  id: `reflect_impact_${Date.now()}`,
                  name: 'Reflect Impact',
                  type: 'simple',
                  shape: 'circle',
                  primaryColor: '#06b6d4',
                  createdAt: new Date().toISOString(),
                },
              }}
              onChange={(sprite) => setReflectImpactSprite(sprite)}
              size={96}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditingReflectImpactSprite(false)}
                className="px-4 py-2 bg-cyan-600 rounded hover:bg-cyan-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay Sprite Editor Modal */}
      {editingOverlay && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-stone-800 p-6 rounded-lg max-w-md max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">Edit Overlay Sprite</h3>
            <p className="text-sm text-stone-400 mb-4">
              This sprite will be drawn over entities with this status effect.
            </p>
            <SimpleIconEditor
              sprite={overlaySprite || {
                type: 'inline',
                spriteData: {
                  id: `overlay_${Date.now()}`,
                  name: 'Overlay',
                  type: 'simple',
                  shape: 'circle',
                  primaryColor: '#22d3ee',
                  createdAt: new Date().toISOString(),
                },
              }}
              onChange={(sprite) => setOverlaySprite(sprite)}
              size={96}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditingOverlay(false)}
                className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
