import React, { useState, useCallback } from 'react';
import { Direction, ActionType, TURN_INTERVAL_MS } from '../../types/game';
import type { CharacterAction, ExecutionMode, TriggerConfig, RelativeDirection } from '../../types/game';
import { loadSpellAsset } from '../../utils/assetStorage';
import { DirectionCompass } from './DirectionCompass';

const ACTION_TYPES = Object.values(ActionType).filter(
  type => !['attack_forward', 'attack_range', 'attack_aoe', 'custom_attack'].includes(type)
);

interface BehaviorSequenceBuilderProps {
  actions: CharacterAction[];
  onChange: (actions: CharacterAction[]) => void;
  onSelectSpell: (index: number) => void;
  context: 'character' | 'enemy';
}

export const BehaviorSequenceBuilder: React.FC<BehaviorSequenceBuilderProps> = ({
  actions,
  onChange,
  onSelectSpell,
  context,
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const updateAction = useCallback((index: number, action: CharacterAction) => {
    const updated = [...actions];
    updated[index] = action;
    onChange(updated);
  }, [actions, onChange]);

  const removeAction = useCallback((index: number) => {
    const updated = actions.filter((_, i) => i !== index);
    // Clear linkedToNext on the new last item if needed
    if (updated.length > 0 && index > 0 && updated[index - 1]?.linkedToNext) {
      // If the removed action was the target of a link, clear it
      if (index >= updated.length) {
        updated[updated.length - 1] = { ...updated[updated.length - 1], linkedToNext: undefined };
      }
    }
    onChange(updated);
  }, [actions, onChange]);

  const addAction = useCallback(() => {
    onChange([...actions, { type: ActionType.MOVE_FORWARD }]);
  }, [actions, onChange]);

  // Drag and drop
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const updated = [...actions];
    const [dragged] = updated.splice(dragIndex, 1);
    updated.splice(targetIndex, 0, dragged);
    // Clear linkedToNext on last item
    if (updated.length > 0) {
      updated[updated.length - 1] = { ...updated[updated.length - 1], linkedToNext: undefined };
    }
    onChange(updated);
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, actions, onChange]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const toggleLinkedToNext = useCallback((index: number) => {
    const updated = [...actions];
    updated[index] = { ...updated[index], linkedToNext: !updated[index].linkedToNext };
    onChange(updated);
  }, [actions, onChange]);

  return (
    <div className="max-w-xl">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-bold">
          {context === 'enemy' ? 'Action Pattern' : 'Behavior Sequence'}
        </h3>
        <button
          onClick={addAction}
          className="px-3 py-1 text-sm bg-arcane-700 rounded hover:bg-arcane-600"
        >
          + Add Action
        </button>
      </div>

      <div className="space-y-0">
        {actions.map((action, index) => (
          <div key={index}>
            {/* Action Node */}
            <div
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              className={`
                bg-stone-700 p-3 rounded border-2 transition-colors
                ${dragIndex === index ? 'opacity-50' : ''}
                ${dragOverIndex === index && dragIndex !== index ? 'border-amber-500' : 'border-transparent'}
                ${action.executionMode === 'parallel' ? 'border-l-4 border-l-arcane-500' : ''}
              `}
            >
              <ActionNodeContent
                action={action}
                index={index}
                totalActions={actions.length}
                context={context}
                onUpdate={(a) => updateAction(index, a)}
                onRemove={() => removeAction(index)}
                onSelectSpell={() => onSelectSpell(index)}
              />
            </div>

            {/* Flow Connector between nodes */}
            {index < actions.length - 1 && (
              <FlowConnector
                action={action}
                index={index}
                canLink={
                  action.type !== ActionType.REPEAT &&
                  action.executionMode !== 'parallel'
                }
                onToggleLink={() => toggleLinkedToNext(index)}
              />
            )}
          </div>
        ))}
      </div>

      {actions.length === 0 && (
        <div className="text-stone-500 text-sm italic text-center py-4">
          No actions. Click "+ Add Action" to create one.
        </div>
      )}

      <p className="text-xs text-stone-400 mt-2">
        Tip: Add REPEAT at the end to loop. Drag ⠿ to reorder. Click ⛓ to link actions on the same turn.
      </p>
    </div>
  );
};

// ─── Flow Connector ────────────────────────────────────────────────

interface FlowConnectorProps {
  action: CharacterAction;
  index: number;
  canLink: boolean;
  onToggleLink: () => void;
}

const FlowConnector: React.FC<FlowConnectorProps> = ({ action, canLink, onToggleLink }) => {
  const linked = action.linkedToNext;

  return (
    <div className="flex items-center justify-center py-1 select-none">
      {canLink ? (
        <button
          onClick={onToggleLink}
          className={`
            flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors
            ${linked
              ? 'bg-amber-900/50 text-amber-300 border border-amber-600 hover:bg-amber-900/70'
              : 'bg-stone-800 text-stone-500 border border-stone-700 hover:bg-stone-700 hover:text-stone-300'
            }
          `}
          title={linked ? 'Linked: executes on same turn (click to unlink)' : 'Click to link: next action executes on same turn'}
        >
          {linked ? '⛓ same turn' : '│'}
        </button>
      ) : (
        <span className="text-stone-600 text-xs">│</span>
      )}
    </div>
  );
};

// ─── Action Node Content ───────────────────────────────────────────

interface ActionNodeContentProps {
  action: CharacterAction;
  index: number;
  totalActions: number;
  context: 'character' | 'enemy';
  onUpdate: (action: CharacterAction) => void;
  onRemove: () => void;
  onSelectSpell: () => void;
}

const ActionNodeContent: React.FC<ActionNodeContentProps> = ({
  action,
  index,
  context,
  onUpdate,
  onRemove,
  onSelectSpell,
}) => {
  const spell = action.spellId ? loadSpellAsset(action.spellId) : null;

  return (
    <>
      {/* Header row: drag handle, step number, type selector, remove */}
      <div className="flex gap-2 items-center mb-2">
        <span className="cursor-grab text-stone-500 hover:text-stone-300 select-none" title="Drag to reorder">⠿</span>
        <span className="text-sm text-stone-400 w-6">{index + 1}.</span>
        <select
          value={action.type}
          onChange={(e) => onUpdate({ ...action, type: e.target.value as ActionType })}
          className="flex-1 px-2 py-1 bg-stone-600 rounded text-sm"
        >
          {ACTION_TYPES.map(type => (
            <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
          ))}
        </select>
        {action.executionMode === 'parallel' && (
          <span className="text-[10px] font-bold text-arcane-400 bg-arcane-900/50 px-1.5 py-0.5 rounded">PARALLEL</span>
        )}
        <button onClick={onRemove} className="px-2 py-1 text-sm bg-blood-700 rounded hover:bg-blood-600">✕</button>
      </div>

      {/* Movement config */}
      {action.type.startsWith('move_') && (
        <MovementConfig action={action} onUpdate={onUpdate} />
      )}

      {/* Turn config */}
      {(action.type === ActionType.TURN_LEFT || action.type === ActionType.TURN_RIGHT) && (
        <TurnConfig action={action} onUpdate={onUpdate} />
      )}

      {/* Face Direction config */}
      {action.type === ActionType.FACE_DIRECTION && (
        <div className="ml-8 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-stone-400">Direction:</label>
            <select
              value={action.faceDirection ?? Direction.NORTH}
              onChange={(e) => onUpdate({ ...action, faceDirection: Number(e.target.value) as Direction })}
              className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs"
            >
              {Object.entries(Direction).filter(([k]) => isNaN(Number(k))).map(([name, val]) => (
                <option key={val} value={val}>{name.charAt(0) + name.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Spell config */}
      {action.type === ActionType.SPELL && (
        <SpellConfig
          action={action}
          spell={spell}
          context={context}
          onUpdate={onUpdate}
          onSelectSpell={onSelectSpell}
        />
      )}
    </>
  );
};

// ─── Movement Config ───────────────────────────────────────────────

const MovementConfig: React.FC<{ action: CharacterAction; onUpdate: (a: CharacterAction) => void }> = ({ action, onUpdate }) => (
  <div className="ml-8 space-y-2">
    <div className="flex items-center gap-2">
      <label className="text-xs text-stone-400">Tiles:</label>
      <input type="number" min="1" max="5" value={action.tilesPerMove || 1}
        onChange={(e) => onUpdate({ ...action, tilesPerMove: parseInt(e.target.value) || 1 })}
        className="w-16 px-2 py-1 bg-stone-600 rounded text-sm" />
      <label className="text-xs text-stone-400">Wall:</label>
      <select value={action.onWallCollision || 'stop'}
        onChange={(e) => onUpdate({ ...action, onWallCollision: e.target.value as any })}
        className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs">
        <option value="stop">Stop</option>
        <option value="turn_left">Turn Left</option>
        <option value="turn_right">Turn Right</option>
        <option value="turn_around">Turn Around</option>
        <option value="continue">Continue</option>
      </select>
    </div>
    {(action.onWallCollision === 'turn_left' || action.onWallCollision === 'turn_right') && (
      <div className="flex items-center gap-2">
        <label className="text-xs text-stone-400">Turn degrees:</label>
        <select value={action.turnDegrees || 90}
          onChange={(e) => onUpdate({ ...action, turnDegrees: parseInt(e.target.value) as 45 | 90 | 135 })}
          className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs">
          <option value={45}>45°</option>
          <option value={90}>90°</option>
          <option value={135}>135°</option>
        </select>
      </div>
    )}
  </div>
);

// ─── Turn Config ───────────────────────────────────────────────────

const TurnConfig: React.FC<{ action: CharacterAction; onUpdate: (a: CharacterAction) => void }> = ({ action, onUpdate }) => (
  <div className="ml-8">
    <div className="flex items-center gap-2">
      <label className="text-xs text-stone-400">Degrees:</label>
      <select value={action.turnDegrees || 90}
        onChange={(e) => onUpdate({ ...action, turnDegrees: parseInt(e.target.value) as 45 | 90 | 135 })}
        className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs">
        <option value={45}>45°</option>
        <option value={90}>90°</option>
        <option value={135}>135°</option>
      </select>
    </div>
  </div>
);

// ─── Spell Config ──────────────────────────────────────────────────

interface SpellConfigProps {
  action: CharacterAction;
  spell: ReturnType<typeof loadSpellAsset> | null;
  context: 'character' | 'enemy';
  onUpdate: (a: CharacterAction) => void;
  onSelectSpell: () => void;
}

const SpellConfig: React.FC<SpellConfigProps> = ({ action, spell, context, onUpdate, onSelectSpell }) => {
  const turnEquivalent = (ms: number) => Math.round((ms / TURN_INTERVAL_MS) * 10) / 10;

  // Event options differ by context
  const eventOptions = context === 'character'
    ? [
        { value: 'enemy_adjacent', label: 'Enemy Adjacent' },
        { value: 'enemy_in_range', label: 'Enemy in Range' },
        { value: 'contact_with_enemy', label: 'Overlap with Enemy' },
        { value: 'character_adjacent', label: 'Character Adjacent' },
        { value: 'character_in_range', label: 'Character in Range' },
        { value: 'contact_with_character', label: 'Overlap with Character' },
        { value: 'wall_ahead', label: 'Wall Ahead' },
        { value: 'health_below_50', label: 'Health Below 50%' },
        { value: 'on_death', label: 'On Death' },
      ]
    : [
        { value: 'character_adjacent', label: 'Character Adjacent' },
        { value: 'character_in_range', label: 'Character in Range' },
        { value: 'enemy_in_range', label: 'Enemy in Range' },
        { value: 'wall_ahead', label: 'Wall Ahead' },
        { value: 'health_below_50', label: 'Health Below 50%' },
      ];

  const defaultEvent = context === 'character' ? 'enemy_adjacent' : 'character_adjacent';

  // Check if any auto-targeting is active (used for direction override visibility)
  const hasAutoTarget = action.autoTargetNearestEnemy || action.autoTargetNearestCharacter || action.autoTargetNearestDeadAlly;

  return (
    <div className="ml-8 space-y-2">
      {/* Spell picker */}
      {spell ? (
        <div className="flex items-center gap-2 dungeon-panel p-2 rounded">
          {spell.thumbnailIcon && <img src={spell.thumbnailIcon} alt={spell.name} className="w-8 h-8 object-contain" />}
          <div className="flex-1">
            <div className="text-sm font-semibold">{spell.name}</div>
            <div className="text-xs text-stone-400 capitalize">{spell.templateType.replace('_', ' ')}</div>
          </div>
          <button onClick={onSelectSpell} className="px-2 py-1 text-xs bg-arcane-700 rounded hover:bg-arcane-600">Change</button>
        </div>
      ) : (
        <button onClick={onSelectSpell} className="px-3 py-1 bg-moss-700 rounded text-xs hover:bg-moss-600">Select Spell</button>
      )}

      {spell && (
        <>
          {/* Execution mode — no parallel_with_previous */}
          <div>
            <label className="text-xs text-stone-400">Execution:</label>
            <select value={action.executionMode || 'sequential'}
              onChange={(e) => onUpdate({ ...action, executionMode: e.target.value as ExecutionMode })}
              className="w-full px-2 py-1 bg-stone-600 rounded text-xs mt-1">
              <option value="sequential">Sequential</option>
              <option value="parallel">Parallel</option>
            </select>
          </div>

          {/* Parallel trigger config */}
          {action.executionMode === 'parallel' && (
            <div className="dungeon-panel p-2 rounded space-y-2">
              <div className="text-xs font-semibold text-stone-300">Trigger:</div>
              <select value={action.trigger?.mode || 'interval'}
                onChange={(e) => {
                  const newTrigger: TriggerConfig = {
                    mode: e.target.value as any,
                    ...(e.target.value === 'interval' ? { intervalMs: 600 } : { event: defaultEvent })
                  };
                  onUpdate({ ...action, trigger: newTrigger });
                }}
                className="w-full px-2 py-1 bg-stone-600 rounded text-xs">
                <option value="interval">Interval</option>
                <option value="on_event">On Event</option>
              </select>

              {action.trigger?.mode === 'interval' && (
                <div className="flex items-center gap-2">
                  <input type="number" min="100" max="5000" step="100"
                    value={action.trigger.intervalMs || 600}
                    onChange={(e) => onUpdate({ ...action, trigger: { ...action.trigger!, intervalMs: parseInt(e.target.value) || 600 } })}
                    className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs" placeholder="ms" />
                  <span className="text-xs text-amber-400 whitespace-nowrap">
                    ≈{turnEquivalent(action.trigger.intervalMs || 600)} turns
                  </span>
                </div>
              )}

              {action.trigger?.mode === 'on_event' && (
                <>
                  <select value={action.trigger.event || defaultEvent}
                    onChange={(e) => onUpdate({ ...action, trigger: { ...action.trigger!, event: e.target.value as any } })}
                    className="w-full px-2 py-1 bg-stone-600 rounded text-xs">
                    {eventOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {(action.trigger.event === 'character_in_range' || action.trigger.event === 'enemy_in_range') && (
                    <div className="flex items-center gap-2 mt-1">
                      <label className="text-xs text-stone-400">Range (tiles):</label>
                      <input type="number" min="1" max="10"
                        value={action.trigger.eventRange || 2}
                        onChange={(e) => onUpdate({ ...action, trigger: { ...action.trigger!, eventRange: parseInt(e.target.value) || 2 } })}
                        className="w-16 px-2 py-1 bg-stone-600 rounded text-xs" />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Auto-targeting */}
          <div className="dungeon-panel p-2 rounded space-y-1">
            {context === 'enemy' ? (
              <>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={action.autoTargetNearestCharacter || false}
                    onChange={(e) => onUpdate({
                      ...action,
                      autoTargetNearestCharacter: e.target.checked,
                      autoTargetNearestEnemy: false,
                      homing: e.target.checked ? action.homing : false
                    })}
                    className="w-3 h-3" />
                  Auto-Target Character
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={action.autoTargetNearestEnemy || false}
                    onChange={(e) => onUpdate({
                      ...action,
                      autoTargetNearestEnemy: e.target.checked,
                      autoTargetNearestCharacter: false,
                      homing: e.target.checked ? action.homing : false
                    })}
                    className="w-3 h-3" />
                  Auto-Target Enemy
                </label>
              </>
            ) : (
              <>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={action.autoTargetNearestEnemy || false}
                    onChange={(e) => onUpdate({
                      ...action,
                      autoTargetNearestEnemy: e.target.checked,
                      autoTargetNearestCharacter: false,
                      autoTargetNearestDeadAlly: false,
                      homing: e.target.checked ? action.homing : false
                    })}
                    className="w-3 h-3" />
                  Auto-Target Enemy
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={action.autoTargetNearestCharacter || false}
                    onChange={(e) => onUpdate({
                      ...action,
                      autoTargetNearestCharacter: e.target.checked,
                      autoTargetNearestEnemy: false,
                      autoTargetNearestDeadAlly: false,
                      homing: e.target.checked ? action.homing : false
                    })}
                    className="w-3 h-3" />
                  Auto-Target Character
                </label>
                <label className="flex items-center gap-2 text-xs text-green-300">
                  <input type="checkbox" checked={action.autoTargetNearestDeadAlly || false}
                    onChange={(e) => onUpdate({
                      ...action,
                      autoTargetNearestDeadAlly: e.target.checked,
                      autoTargetNearestEnemy: false,
                      autoTargetNearestCharacter: false,
                      homing: false
                    })}
                    className="w-3 h-3" />
                  Auto-Target Dead Ally (Resurrect)
                </label>
              </>
            )}

            {/* Homing — not for dead ally */}
            {(action.autoTargetNearestEnemy || action.autoTargetNearestCharacter) && (
              <label className="flex items-center gap-2 text-xs ml-4 text-yellow-300">
                <input type="checkbox" checked={action.homing || false}
                  onChange={(e) => onUpdate({ ...action, homing: e.target.checked })}
                  className="w-3 h-3" />
                Homing (guaranteed hit)
              </label>
            )}

            {/* Max targets — available for all auto-targeting modes */}
            {hasAutoTarget && (
              <>
                <label className="flex items-center gap-2 text-xs ml-4">
                  Max Targets:
                  <input type="number" min={1} max={10}
                    value={action.maxTargets || 1}
                    onChange={(e) => onUpdate({ ...action, maxTargets: parseInt(e.target.value) || 1 })}
                    className="w-12 px-1 py-0.5 bg-stone-700 border border-stone-600 rounded text-xs" />
                </label>
                {/* Max range — character only */}
                {context === 'character' && (
                  <label className="flex items-center gap-2 text-xs ml-4">
                    Max Range:
                    <input type="number" min={0} max={20}
                      value={action.autoTargetRange || 0}
                      onChange={(e) => onUpdate({ ...action, autoTargetRange: parseInt(e.target.value) || 0 })}
                      className="w-12 px-1 py-0.5 bg-stone-700 border border-stone-600 rounded text-xs" />
                    <span className="text-stone-500">(0 = unlimited)</span>
                  </label>
                )}
              </>
            )}
          </div>

          {/* Self-targeting */}
          <div className="dungeon-panel p-2 rounded space-y-1">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={action.targetSelf || false}
                onChange={(e) => onUpdate({
                  ...action,
                  targetSelf: e.target.checked,
                  targetSelfOnly: e.target.checked ? false : action.targetSelfOnly
                })}
                className="w-3 h-3"
                disabled={action.targetSelfOnly} />
              Also Target Self
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={action.targetSelfOnly || false}
                onChange={(e) => onUpdate({
                  ...action,
                  targetSelfOnly: e.target.checked,
                  targetSelf: e.target.checked ? false : action.targetSelf
                })}
                className="w-3 h-3" />
              Target Self Only
            </label>
            {(action.targetSelf || action.targetSelfOnly) && (
              <p className="text-xs text-stone-400 ml-5">
                {action.targetSelfOnly
                  ? 'Spell only affects the caster'
                  : 'Spell affects caster in addition to targets'}
              </p>
            )}
          </div>

          {/* Direction Override — only when not auto-targeting */}
          {!hasAutoTarget && (
            <DirectionOverrideConfig action={action} onUpdate={onUpdate} />
          )}
        </>
      )}
    </div>
  );
};

// ─── Direction Override Config ──────────────────────────────────────

const DirectionOverrideConfig: React.FC<{ action: CharacterAction; onUpdate: (a: CharacterAction) => void }> = ({ action, onUpdate }) => {
  const hasOverride = action.useRelativeOverride !== undefined || action.directionOverride !== undefined || action.relativeDirectionOverride !== undefined;

  return (
    <div className="dungeon-panel p-2 rounded space-y-2">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={hasOverride}
            onChange={(e) => {
              if (e.target.checked) {
                onUpdate({
                  ...action,
                  useRelativeOverride: true,
                  relativeDirectionOverride: ['forward'],
                  directionOverride: undefined
                });
              } else {
                onUpdate({
                  ...action,
                  useRelativeOverride: undefined,
                  relativeDirectionOverride: undefined,
                  directionOverride: undefined
                });
              }
            }}
            className="w-3 h-3" />
          Override Direction
        </label>
      </div>

      {hasOverride && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-stone-400">Mode:</label>
            <select
              value={action.useRelativeOverride ? 'relative' : 'absolute'}
              onChange={(e) => {
                const isRelative = e.target.value === 'relative';
                onUpdate({
                  ...action,
                  useRelativeOverride: isRelative,
                  relativeDirectionOverride: isRelative ? ['forward'] : undefined,
                  directionOverride: isRelative ? undefined : [Direction.NORTH]
                });
              }}
              className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs">
              <option value="relative">Relative (to facing)</option>
              <option value="absolute">Absolute (fixed)</option>
            </select>
          </div>

          <DirectionCompass
            mode={action.useRelativeOverride ? 'relative' : 'absolute'}
            selectedDirections={
              action.useRelativeOverride
                ? (action.relativeDirectionOverride || ['forward'])
                : (action.directionOverride || [Direction.NORTH])
            }
            onChange={(dirs) => {
              if (action.useRelativeOverride) {
                onUpdate({ ...action, relativeDirectionOverride: dirs as RelativeDirection[] });
              } else {
                onUpdate({ ...action, directionOverride: dirs as Direction[] });
              }
            }}
          />
        </>
      )}
    </div>
  );
};
