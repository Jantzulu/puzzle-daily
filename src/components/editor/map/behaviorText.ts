import type { CharacterAction, SpellAsset } from '../../../types/game';
import { ActionType } from '../../../types/game';
import { loadSpellAsset } from '../../../utils/assetStorage';

// Moved out of Tooltips.tsx (2026-10-18 delint): a component file that also
// exports plain values breaks React Fast Refresh.

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

// Helper to format action sequence for display (also used by the board's
// inspect popover)
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
