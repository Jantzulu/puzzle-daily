// Hover tooltips for the map editor's asset palettes (spell details, action
// sequences, object info). Extracted verbatim from MapEditor.tsx (Phase 1
// decomposition, 2026-07-14).
import React, { useState, useRef } from 'react';
import type { CharacterAction, SpellAsset } from '../../../types/game';
import { ActionType } from '../../../types/game';
import { loadSpellAsset, type CustomObject } from '../../../utils/assetStorage';

// Helper to get all spells from character/enemy behavior
export const getAllSpells = (behavior: CharacterAction[] | undefined): SpellAsset[] => {
  if (!behavior) return [];
  const spells: SpellAsset[] = [];
  const seenIds = new Set<string>(); // Avoid duplicates if same spell used multiple times

  for (const action of behavior) {
    // Check for SPELL action type with spellId reference (from spell editor)
    // ActionType.SPELL = 'spell' (lowercase)
    if (action.type === ActionType.SPELL && action.spellId) {
      if (!seenIds.has(action.spellId)) {
        const spell = loadSpellAsset(action.spellId);
        if (spell) {
          spells.push(spell);
          seenIds.add(action.spellId);
        }
      }
    }
  }
  return spells;
};

// Helper to format action sequence for display
const formatActionSequence = (behavior: CharacterAction[] | undefined): string[] => {
  if (!behavior || behavior.length === 0) return ['No actions defined'];
  return behavior.map((action, i) => {
    const num = i + 1;
    switch (action.type) {
      case ActionType.SPELL:
        if (action.spellId) {
          const spell = loadSpellAsset(action.spellId);
          if (spell) return `${num}. ${spell.name}`;
        }
        return `${num}. Cast Spell`;
      case ActionType.MOVE_FORWARD:
        return `${num}. Move Forward`;
      case ActionType.MOVE_BACKWARD:
        return `${num}. Move Backward`;
      case ActionType.TURN_LEFT:
        return `${num}. Turn Left`;
      case ActionType.TURN_RIGHT:
        return `${num}. Turn Right`;
      case ActionType.TURN_AROUND:
        return `${num}. Turn Around`;
      case ActionType.WAIT:
        return `${num}. Wait`;
      case ActionType.REPEAT:
        return `${num}. Repeat`;
      case ActionType.REPEAT_UNTIL:
        return `${num}. Repeat Until`;
      default:
        return `${num}. ${action.type}`;
    }
  });
};

// Tooltip component for spell info - marks element with data attribute to prevent action tooltip
export const SpellTooltip: React.FC<{ spell: SpellAsset; children: React.ReactNode }> = ({ spell, children }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({ x: rect.left + rect.width / 2, y: rect.bottom });
    timeoutRef.current = setTimeout(() => setShow(true), 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  };

  return (
    <div
      className="relative inline-block"
      data-spell-tooltip="true"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {show && (
        <div
          className="fixed z-[9999] w-48 p-2 bg-stone-900 border border-stone-600 rounded shadow-lg text-xs pointer-events-none"
          style={{ left: position.x, top: position.y + 8, transform: 'translateX(-50%)' }}
        >
          <div className="font-bold text-parchment-100 mb-1">{spell.name}</div>
          <div className="text-stone-400 mb-1">{spell.description}</div>
          <div className="text-parchment-300">
            {spell.damage && <div>Damage: {spell.damage}</div>}
            {spell.healing && <div>Healing: {spell.healing}</div>}
            {spell.range && <div>Range: {spell.range}</div>}
            {spell.radius && <div>Radius: {spell.radius}</div>}
            <div>Type: {spell.templateType}</div>
          </div>
        </div>
      )}
    </div>
  );
};

// Tooltip component for action sequence - checks if mouse is over spell tooltip area
export const ActionTooltip: React.FC<{ actions: CharacterAction[] | undefined; children: React.ReactNode }> = ({ actions, children }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = formatActionSequence(actions);

  const handleMouseEnter = (e: React.MouseEvent) => {
    // Check if the mouse entered from a spell tooltip area - don't show action tooltip
    const target = e.target as HTMLElement;
    if (target.closest('[data-spell-tooltip="true"]')) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    // Position tooltip below the element, centered horizontally
    setPosition({ x: rect.left + rect.width / 2, y: rect.bottom });
    timeoutRef.current = setTimeout(() => setShow(true), 400);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  };

  // Also handle mouse movement to hide tooltip when entering spell area
  const handleMouseMove = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-spell-tooltip="true"]')) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setShow(false);
    }
  };

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onMouseMove={handleMouseMove}>
      {children}
      {show && (
        <div
          className="fixed z-[9999] w-44 p-2 bg-stone-900 border border-stone-600 rounded shadow-lg text-xs pointer-events-none"
          style={{ left: position.x, top: position.y + 8, transform: 'translateX(-50%)' }}
        >
          <div className="font-bold text-parchment-100 mb-1">Action Sequence</div>
          {sequence.map((action, i) => (
            <div key={i} className="text-parchment-300">{action}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// Tooltip component for object info
export const ObjectTooltip: React.FC<{ object: CustomObject; children: React.ReactNode }> = ({ object, children }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({ x: rect.left + rect.width / 2, y: rect.bottom });
    timeoutRef.current = setTimeout(() => setShow(true), 400);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  };

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {show && (
        <div
          className="fixed z-[9999] w-52 p-2 bg-stone-900 border border-stone-600 rounded shadow-lg text-xs pointer-events-none"
          style={{ left: position.x, top: position.y + 8, transform: 'translateX(-50%)' }}
        >
          <div className="font-bold text-parchment-100 mb-1">{object.name}</div>
          {object.description && (
            <div className="text-stone-400 mb-1">{object.description}</div>
          )}
          <div className="text-parchment-300 space-y-0.5">
            <div>Collision: <span className="capitalize">{object.collisionType.replace('_', ' ')}</span></div>
            <div>Anchor: <span className="capitalize">{object.anchorPoint.replace('_', ' ')}</span></div>
            {object.effects.length > 0 && (
              <div className="mt-1 pt-1 border-t border-stone-700">
                <div className="font-semibold mb-0.5">Effects:</div>
                {object.effects.map((effect, i) => (
                  <div key={i} className="text-stone-400">
                    • {effect.type.charAt(0).toUpperCase() + effect.type.slice(1)}
                    {effect.value ? ` (${effect.value})` : ''} - r{effect.radius}
                    {effect.affectsCharacters && effect.affectsEnemies ? ' [All]' :
                     effect.affectsCharacters ? ' [Chars]' : ' [Enemies]'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
