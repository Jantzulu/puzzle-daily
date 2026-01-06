import type { Enemy } from '../../types/game';
import { getCustomEnemies, isAssetHidden } from '../../utils/assetStorage';
import goblinData from './goblin.json';

const officialEnemies: Record<string, Enemy> = {
  [goblinData.id]: goblinData as Enemy,
};

export const getEnemy = (id: string): Enemy | undefined => {
  // Check if hidden
  if (isAssetHidden(id)) {
    return undefined;
  }

  // Check official enemies first
  if (officialEnemies[id]) {
    const enemy = officialEnemies[id];
    console.log('[getEnemy] Found official enemy:', id, 'hasMeleePriority:', enemy.hasMeleePriority);
    return enemy;
  }

  // Check custom enemies
  const customEnemies = getCustomEnemies();
  const enemy = customEnemies.find(e => e.id === id);
  if (enemy) {
    console.log('[getEnemy] Found custom enemy:', id, 'hasMeleePriority:', enemy.hasMeleePriority);
  }
  return enemy;
};

export const getAllEnemies = (): Enemy[] => {
  const customEnemies = getCustomEnemies();
  const customIds = new Set(customEnemies.map(e => e.id));

  // Start with custom enemies (includes edited official ones)
  const allEnemies = [...customEnemies];

  // Add official enemies that haven't been overridden or hidden
  for (const official of Object.values(officialEnemies)) {
    if (!customIds.has(official.id) && !isAssetHidden(official.id)) {
      allEnemies.push(official);
    }
  }

  return allEnemies;
};
