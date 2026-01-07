import type { Enemy } from '../../types/game';
import { getCustomEnemies, isAssetHidden, type CustomEnemy } from '../../utils/assetStorage';
import goblinData from './goblin.json';

// Type that includes both base Enemy and optional customSprite
export type EnemyWithSprite = Enemy & { customSprite?: CustomEnemy['customSprite'] };

const officialEnemies: Record<string, Enemy> = {
  [goblinData.id]: goblinData as Enemy,
};

export const getEnemy = (id: string): EnemyWithSprite | undefined => {
  // Check if hidden
  if (isAssetHidden(id)) {
    return undefined;
  }

  // Check custom enemies FIRST (they override official ones)
  const customEnemies = getCustomEnemies();
  const customEnemy = customEnemies.find(e => e.id === id);
  if (customEnemy) {
    return customEnemy;
  }

  // Check official enemies as fallback
  if (officialEnemies[id]) {
    return officialEnemies[id];
  }

  return undefined;
};

export const getAllEnemies = (): EnemyWithSprite[] => {
  const customEnemies = getCustomEnemies();
  const customIds = new Set(customEnemies.map(e => e.id));

  // Start with custom enemies (includes edited official ones)
  const allEnemies: EnemyWithSprite[] = [...customEnemies];

  // Add official enemies that haven't been overridden or hidden
  for (const official of Object.values(officialEnemies)) {
    if (!customIds.has(official.id) && !isAssetHidden(official.id)) {
      allEnemies.push(official);
    }
  }

  return allEnemies;
};
