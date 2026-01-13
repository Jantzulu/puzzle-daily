import React, { useState } from 'react';
import type { StatusEffectAsset, SpriteReference } from '../../types/game';
import { StatusEffectType } from '../../types/game';
import { saveStatusEffectAsset } from '../../utils/assetStorage';
import { SpriteThumbnail } from './SpriteThumbnail';
import { SimpleIconEditor } from './SimpleIconEditor';

interface StatusEffectEditorProps {
  effect?: StatusEffectAsset;
  onSave: () => void;
  onCancel: () => void;
}

const defaultIconSprite: SpriteReference = {
  type: 'inline',
  spriteData: {
    id: `icon_${Date.now()}`,
    name: 'Status Icon',
    type: 'simple',
    shape: 'circle',
    primaryColor: '#ffffff',
    createdAt: new Date().toISOString(),
  },
};

export const StatusEffectEditor: React.FC<StatusEffectEditorProps> = ({
  effect,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(effect?.name || '');
  const [description, setDescription] = useState(effect?.description || '');
  const [type, setType] = useState<StatusEffectType>(effect?.type || StatusEffectType.POISON);
  const [defaultDuration, setDefaultDuration] = useState(effect?.defaultDuration ?? 3);
  const [defaultValue, setDefaultValue] = useState(effect?.defaultValue ?? 1);
  const [processAtTurnStart, setProcessAtTurnStart] = useState(effect?.processAtTurnStart ?? false);
  const [removedOnDamage, setRemovedOnDamage] = useState(effect?.removedOnDamage ?? false);
  const [preventsMelee, setPreventsMelee] = useState(effect?.preventsMelee ?? false);
  const [preventsRanged, setPreventsRanged] = useState(effect?.preventsRanged ?? false);
  const [preventsMovement, setPreventsMovement] = useState(effect?.preventsMovement ?? false);
  const [preventsAllActions, setPreventsAllActions] = useState(effect?.preventsAllActions ?? false);
  const [stackingBehavior, setStackingBehavior] = useState<'refresh' | 'stack' | 'replace' | 'highest'>(
    effect?.stackingBehavior || 'refresh'
  );
  const [maxStacks, setMaxStacks] = useState(effect?.maxStacks ?? 5);
  const [iconSprite, setIconSprite] = useState<SpriteReference>(effect?.iconSprite || defaultIconSprite);
  const [editingIcon, setEditingIcon] = useState(false);

  const isBuiltIn = effect?.isBuiltIn ?? false;

  const handleSave = () => {
    if (!name.trim()) {
      alert('Please enter a name for the status effect.');
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
      processAtTurnStart,
      removedOnDamage,
      preventsMelee,
      preventsRanged,
      preventsMovement,
      preventsAllActions,
      stackingBehavior,
      maxStacks: stackingBehavior === 'stack' ? maxStacks : undefined,
      createdAt: effect?.createdAt || new Date().toISOString(),
      isBuiltIn: false, // Never save as built-in when editing
      folderId: effect?.folderId,
    };

    saveStatusEffectAsset(effectData);
    alert(`Saved "${name.trim()}"!`);
    onSave();
  };

  // Get suggested settings based on effect type
  const applyTypeDefaults = (newType: StatusEffectType) => {
    setType(newType);

    switch (newType) {
      case StatusEffectType.POISON:
      case StatusEffectType.BURN:
      case StatusEffectType.BLEED:
        setDefaultValue(1);
        setProcessAtTurnStart(false);
        setRemovedOnDamage(false);
        setPreventsMelee(false);
        setPreventsRanged(false);
        setPreventsMovement(false);
        setPreventsAllActions(false);
        break;
      case StatusEffectType.REGEN:
        setDefaultValue(1);
        setProcessAtTurnStart(false);
        setRemovedOnDamage(false);
        setPreventsMelee(false);
        setPreventsRanged(false);
        setPreventsMovement(false);
        setPreventsAllActions(false);
        break;
      case StatusEffectType.STUN:
        setDefaultValue(0);
        setProcessAtTurnStart(true);
        setRemovedOnDamage(false);
        setPreventsMelee(false);
        setPreventsRanged(false);
        setPreventsMovement(false);
        setPreventsAllActions(true);
        break;
      case StatusEffectType.SLEEP:
        setDefaultValue(0);
        setProcessAtTurnStart(true);
        setRemovedOnDamage(true);
        setPreventsMelee(false);
        setPreventsRanged(false);
        setPreventsMovement(false);
        setPreventsAllActions(true);
        break;
      case StatusEffectType.SLOW:
        setDefaultValue(0);
        setProcessAtTurnStart(true);
        setRemovedOnDamage(false);
        setPreventsMelee(false);
        setPreventsRanged(false);
        setPreventsMovement(true);
        setPreventsAllActions(false);
        break;
      case StatusEffectType.SILENCED:
        setDefaultValue(0);
        setProcessAtTurnStart(true);
        setRemovedOnDamage(false);
        setPreventsMelee(false);
        setPreventsRanged(true);
        setPreventsMovement(false);
        setPreventsAllActions(false);
        break;
      case StatusEffectType.DISARMED:
        setDefaultValue(0);
        setProcessAtTurnStart(true);
        setRemovedOnDamage(false);
        setPreventsMelee(true);
        setPreventsRanged(false);
        setPreventsMovement(false);
        setPreventsAllActions(false);
        break;
      case StatusEffectType.SHIELD:
        setDefaultValue(5); // Default shield absorbs 5 damage (0 = infinite)
        setProcessAtTurnStart(false);
        setRemovedOnDamage(false);
        setPreventsMelee(false);
        setPreventsRanged(false);
        setPreventsMovement(false);
        setPreventsAllActions(false);
        break;
      case StatusEffectType.HASTE:
        setDefaultValue(0);
        setProcessAtTurnStart(true);
        setRemovedOnDamage(false);
        setPreventsMelee(false);
        setPreventsRanged(false);
        setPreventsMovement(false);
        setPreventsAllActions(false);
        break;
    }
  };

  // Get color for type indicator
  const getTypeColor = (t: StatusEffectType): string => {
    switch (t) {
      case StatusEffectType.POISON: return '#22c55e';
      case StatusEffectType.BURN: return '#f97316';
      case StatusEffectType.BLEED: return '#dc2626';
      case StatusEffectType.REGEN: return '#10b981';
      case StatusEffectType.STUN: return '#eab308';
      case StatusEffectType.SLEEP: return '#6366f1';
      case StatusEffectType.SLOW: return '#3b82f6';
      case StatusEffectType.SILENCED: return '#8b5cf6';
      case StatusEffectType.DISARMED: return '#9ca3af';
      case StatusEffectType.SHIELD: return '#22d3ee'; // Cyan for shield
      case StatusEffectType.HASTE: return '#fbbf24'; // Amber/gold for haste
      default: return '#ffffff';
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">
          {effect ? (isBuiltIn ? 'View Built-in Effect' : 'Edit Status Effect') : 'Create Status Effect'}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-500"
          >
            Cancel
          </button>
          {!isBuiltIn && (
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
            >
              Save
            </button>
          )}
        </div>
      </div>

      {isBuiltIn && (
        <div className="bg-yellow-900/30 border border-yellow-600 p-3 rounded text-sm text-yellow-200">
          This is a built-in status effect and cannot be edited. Use "Duplicate" to create an editable copy.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column - Basic Info */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isBuiltIn}
              className="w-full px-3 py-2 bg-gray-700 rounded disabled:opacity-50"
              placeholder="e.g., Poison, Stun, Sleep"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isBuiltIn}
              className="w-full px-3 py-2 bg-gray-700 rounded h-20 disabled:opacity-50"
              placeholder="Describe what this effect does..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Effect Type</label>
            <select
              value={type}
              onChange={(e) => applyTypeDefaults(e.target.value as StatusEffectType)}
              disabled={isBuiltIn}
              className="w-full px-3 py-2 bg-gray-700 rounded disabled:opacity-50"
            >
              {Object.values(StatusEffectType).map(t => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <div
              className="mt-1 h-2 rounded"
              style={{ backgroundColor: getTypeColor(type) }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Default Duration (turns)</label>
              <input
                type="number"
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={isBuiltIn}
                className="w-full px-3 py-2 bg-gray-700 rounded disabled:opacity-50"
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
                disabled={isBuiltIn}
                className="w-full px-3 py-2 bg-gray-700 rounded disabled:opacity-50"
                min="0"
              />
              <p className="text-xs text-gray-400 mt-1">
                {type === StatusEffectType.SHIELD
                  ? 'Total damage absorbed before shield breaks (0 = blocks all damage)'
                  : 'Damage per turn (poison/burn) or heal per turn (regen)'}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Stacking Behavior</label>
            <select
              value={stackingBehavior}
              onChange={(e) => setStackingBehavior(e.target.value as typeof stackingBehavior)}
              disabled={isBuiltIn}
              className="w-full px-3 py-2 bg-gray-700 rounded disabled:opacity-50"
            >
              <option value="refresh">Refresh - Reset duration</option>
              <option value="stack">Stack - Increase stacks</option>
              <option value="replace">Replace - Remove old, add new</option>
              <option value="highest">Highest - Keep stronger effect</option>
            </select>
          </div>

          {stackingBehavior === 'stack' && (
            <div>
              <label className="block text-sm font-medium mb-1">Max Stacks</label>
              <input
                type="number"
                value={maxStacks}
                onChange={(e) => setMaxStacks(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={isBuiltIn}
                className="w-full px-3 py-2 bg-gray-700 rounded disabled:opacity-50"
                min="1"
                max="99"
              />
            </div>
          )}
        </div>

        {/* Right Column - Behaviors & Icon */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Icon</label>
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 bg-gray-900 rounded border border-gray-600 flex items-center justify-center cursor-pointer hover:border-blue-500"
                onClick={() => !isBuiltIn && setEditingIcon(true)}
              >
                <SpriteThumbnail sprite={iconSprite.spriteData} size={48} />
              </div>
              {!isBuiltIn && (
                <button
                  onClick={() => setEditingIcon(true)}
                  className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-700"
                >
                  Edit Icon
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium">Behavior Settings</label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={processAtTurnStart}
                onChange={(e) => setProcessAtTurnStart(e.target.checked)}
                disabled={isBuiltIn}
                className="w-4 h-4"
              />
              <span className="text-sm">Process at turn start</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={removedOnDamage}
                onChange={(e) => setRemovedOnDamage(e.target.checked)}
                disabled={isBuiltIn}
                className="w-4 h-4"
              />
              <span className="text-sm">Removed when taking damage (Sleep)</span>
            </label>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium">Action Restrictions</label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={preventsAllActions}
                onChange={(e) => setPreventsAllActions(e.target.checked)}
                disabled={isBuiltIn}
                className="w-4 h-4"
              />
              <span className="text-sm">Prevents all actions (Stun/Sleep)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={preventsMelee}
                onChange={(e) => setPreventsMelee(e.target.checked)}
                disabled={isBuiltIn || preventsAllActions}
                className="w-4 h-4"
              />
              <span className="text-sm">Prevents melee attacks (Disarmed)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={preventsRanged}
                onChange={(e) => setPreventsRanged(e.target.checked)}
                disabled={isBuiltIn || preventsAllActions}
                className="w-4 h-4"
              />
              <span className="text-sm">Prevents ranged/AOE attacks (Silenced)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={preventsMovement}
                onChange={(e) => setPreventsMovement(e.target.checked)}
                disabled={isBuiltIn || preventsAllActions}
                className="w-4 h-4"
              />
              <span className="text-sm">Slows movement (skip every other move)</span>
            </label>
          </div>

          {/* Preview */}
          <div className="mt-4 p-4 bg-gray-900 rounded">
            <h3 className="text-sm font-medium mb-2">Preview</h3>
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded flex items-center justify-center"
                style={{ backgroundColor: getTypeColor(type) }}
              >
                <SpriteThumbnail sprite={iconSprite.spriteData} size={24} />
              </div>
              <div>
                <p className="font-bold">{name || 'Unnamed'}</p>
                <p className="text-xs text-gray-400">
                  {defaultDuration} turns
                  {defaultValue > 0 && ` | ${defaultValue} ${
                    type === StatusEffectType.REGEN ? 'heal/turn' :
                    type === StatusEffectType.SHIELD ? 'dmg absorbed' :
                    'dmg/turn'
                  }`}
                  {type === StatusEffectType.SHIELD && defaultValue === 0 && ' | blocks all dmg'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Icon Editor Modal */}
      {editingIcon && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg max-w-md max-h-[90vh] overflow-auto">
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
    </div>
  );
};
