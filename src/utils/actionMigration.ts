import type { CharacterAction } from '../types/game';

/**
 * Migrate actions from deprecated parallel_with_previous to linkedToNext model.
 * For each action with executionMode === 'parallel_with_previous':
 *   - Set linkedToNext = true on the preceding non-parallel action
 *   - Change this action's executionMode to 'sequential'
 */
export function migrateActions(actions: CharacterAction[]): CharacterAction[] {
  if (!actions || actions.length === 0) return actions;

  // Check if any migration is needed
  const needsMigration = actions.some(a => a.executionMode === 'parallel_with_previous');
  if (!needsMigration) return actions;

  const result = actions.map(a => ({ ...a }));

  for (let i = 1; i < result.length; i++) {
    if (result[i].executionMode === 'parallel_with_previous') {
      // Find the preceding non-parallel_with_previous action
      for (let j = i - 1; j >= 0; j--) {
        if (result[j].executionMode !== 'parallel_with_previous') {
          result[j].linkedToNext = true;
          break;
        }
      }
      result[i].executionMode = 'sequential';
    }
  }

  return result;
}
