import React, { useState, useRef } from 'react';
import type { CharacterAction, SpellAsset } from '../../types/game';
import { ActionType } from '../../types/game';
import { loadSpellAsset } from '../../utils/assetStorage';

// Helper to format action sequence for display
export const formatActionSequence = (behavior: CharacterAction[] | undefined): string[] => {
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
      case ActionType.CUSTOM_ATTACK:
        return `${num}. ${action.customAttack?.name || 'Attack'}`;
      case ActionType.ATTACK_RANGE:
        return `${num}. Ranged Attack`;
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
      default:
        return `${num}. ${action.type}`;
    }
  });
};

// Helper to get all spells from character/enemy behavior
export const getAllSpells = (behavior: CharacterAction[] | undefined): SpellAsset[] => {
  if (!behavior) return [];
  const spells: SpellAsset[] = [];
  const seenIds = new Set<string>();

  for (const action of behavior) {
    if (action.type === ActionType.SPELL && action.spellId) {
      if (!seenIds.has(action.spellId)) {
        const spell = loadSpellAsset(action.spellId);
        if (spell) {
          spells.push(spell);
          seenIds.add(action.spellId);
        }
      }
    }
    if (action.type === ActionType.CUSTOM_ATTACK && action.customAttack) {
      const attack = action.customAttack;
      if (!seenIds.has(attack.id)) {
        spells.push({
          id: attack.id,
          name: attack.name,
          description: `${attack.pattern} attack`,
          templateType: attack.pattern === 'projectile' ? 'range_linear' : 'melee',
          damage: attack.damage,
          range: attack.range,
          thumbnailIcon: '',
        } as SpellAsset);
        seenIds.add(attack.id);
      }
    }
  }
  return spells;
};

// Tooltip component for spell info
export const SpellTooltip: React.FC<{ spell: SpellAsset; children: React.ReactNode }> = ({ spell, children }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
          className="fixed z-[9999] w-48 p-2 bg-gray-900 border border-gray-600 rounded shadow-lg text-xs pointer-events-none"
          style={{ left: position.x, top: position.y + 8, transform: 'translateX(-50%)' }}
        >
          <div className="font-bold text-white mb-1">{spell.name}</div>
          <div className="text-gray-400 mb-1">{spell.description}</div>
          <div className="text-gray-300">
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

// Tooltip component for action sequence
export const ActionTooltip: React.FC<{ actions: CharacterAction[] | undefined; children: React.ReactNode }> = ({ actions, children }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sequence = formatActionSequence(actions);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-spell-tooltip="true"]')) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({ x: rect.left + rect.width / 2, y: rect.bottom });
    timeoutRef.current = setTimeout(() => setShow(true), 400);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  };

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
          className="fixed z-[9999] w-44 p-2 bg-gray-900 border border-gray-600 rounded shadow-lg text-xs pointer-events-none"
          style={{ left: position.x, top: position.y + 8, transform: 'translateX(-50%)' }}
        >
          <div className="font-bold text-white mb-1">Action Sequence</div>
          {sequence.map((action, i) => (
            <div key={i} className="text-gray-300">{action}</div>
          ))}
        </div>
      )}
    </div>
  );
};
