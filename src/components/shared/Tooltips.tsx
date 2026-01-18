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
      case ActionType.ATTACK_FORWARD:
        return `${num}. Attack Forward`;
      case ActionType.ATTACK_AOE:
        return `${num}. Area Attack`;
      case ActionType.MOVE_FORWARD:
        return `${num}. Move Forward`;
      case ActionType.MOVE_BACKWARD:
        return `${num}. Move Backward`;
      case ActionType.MOVE_LEFT:
        return `${num}. Strafe Left`;
      case ActionType.MOVE_RIGHT:
        return `${num}. Strafe Right`;
      case ActionType.MOVE_DIAGONAL_NE:
        return `${num}. Move Diagonal (NE)`;
      case ActionType.MOVE_DIAGONAL_NW:
        return `${num}. Move Diagonal (NW)`;
      case ActionType.MOVE_DIAGONAL_SE:
        return `${num}. Move Diagonal (SE)`;
      case ActionType.MOVE_DIAGONAL_SW:
        return `${num}. Move Diagonal (SW)`;
      case ActionType.TURN_LEFT:
        return `${num}. Turn Left (90°)`;
      case ActionType.TURN_RIGHT:
        return `${num}. Turn Right (90°)`;
      case ActionType.TURN_AROUND:
        return `${num}. Turn Around (180°)`;
      case ActionType.WAIT:
        return `${num}. Wait (skip turn)`;
      case ActionType.REPEAT:
        return `${num}. Repeat from start`;
      case ActionType.TELEPORT:
        return `${num}. Teleport`;
      case ActionType.IF_WALL:
        return `${num}. If facing wall...`;
      case ActionType.IF_ENEMY:
        return `${num}. If enemy ahead...`;
      default:
        return `${num}. ${action.type}`;
    }
  });
};

// Helper to generate a natural language summary of behavior
export const summarizeBehavior = (behavior: CharacterAction[] | undefined): string => {
  if (!behavior || behavior.length === 0) return 'No behavior defined';

  const movements: string[] = [];
  const attacks: string[] = [];
  const turns: string[] = [];
  let hasRepeat = false;
  let hasWait = false;

  for (const action of behavior) {
    switch (action.type) {
      case ActionType.MOVE_FORWARD:
        movements.push('forward');
        break;
      case ActionType.MOVE_BACKWARD:
        movements.push('backward');
        break;
      case ActionType.MOVE_LEFT:
        movements.push('left');
        break;
      case ActionType.MOVE_RIGHT:
        movements.push('right');
        break;
      case ActionType.MOVE_DIAGONAL_NE:
      case ActionType.MOVE_DIAGONAL_NW:
      case ActionType.MOVE_DIAGONAL_SE:
      case ActionType.MOVE_DIAGONAL_SW:
        movements.push('diagonally');
        break;
      case ActionType.TURN_LEFT:
        turns.push('turns left');
        break;
      case ActionType.TURN_RIGHT:
        turns.push('turns right');
        break;
      case ActionType.TURN_AROUND:
        turns.push('turns around');
        break;
      case ActionType.SPELL:
        if (action.spellId) {
          const spell = loadSpellAsset(action.spellId);
          if (spell) attacks.push(spell.name);
        } else {
          attacks.push('casts a spell');
        }
        break;
      case ActionType.CUSTOM_ATTACK:
        attacks.push(action.customAttack?.name || 'attacks');
        break;
      case ActionType.ATTACK_FORWARD:
      case ActionType.ATTACK_RANGE:
      case ActionType.ATTACK_AOE:
        attacks.push('attacks');
        break;
      case ActionType.WAIT:
        hasWait = true;
        break;
      case ActionType.REPEAT:
        hasRepeat = true;
        break;
    }
  }

  const parts: string[] = [];

  if (movements.length > 0) {
    const uniqueMovements = [...new Set(movements)];
    parts.push(`Moves ${uniqueMovements.join(', ')}`);
  }

  if (turns.length > 0) {
    const uniqueTurns = [...new Set(turns)];
    parts.push(uniqueTurns.join(', '));
  }

  if (attacks.length > 0) {
    const uniqueAttacks = [...new Set(attacks)];
    parts.push(uniqueAttacks.join(', '));
  }

  if (hasWait) {
    parts.push('waits');
  }

  let summary = parts.join(', then ');

  if (hasRepeat && summary) {
    summary += ' (repeating)';
  }

  return summary || 'Static';
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
