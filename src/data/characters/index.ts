import type { Character } from '../../types/game';
import { getCustomCharacters, isAssetHidden } from '../../utils/assetStorage';
import knightData from './knight.json';
import archerData from './archer.json';
import fireballMageData from './archer-fireball.json';

const officialCharacters: Record<string, Character> = {
  [knightData.id]: knightData as Character,
  [archerData.id]: archerData as Character,
  [fireballMageData.id]: fireballMageData as Character,
};

/**
 * Check if a character ID is an official (built-in) character
 */
export const isOfficialCharacter = (id: string): boolean => {
  return id in officialCharacters;
};

export const getCharacter = (id: string): Character | undefined => {
  // Check if hidden
  if (isAssetHidden(id)) {
    return undefined;
  }

  // Check custom characters FIRST (they override official ones)
  const customCharacters = getCustomCharacters();
  const customChar = customCharacters.find(c => c.id === id);
  if (customChar) {
    console.log('[getCharacter] Loading CUSTOM character:', id, 'Behavior:', JSON.stringify(customChar.behavior, null, 2));
    return customChar;
  }

  // Check official characters as fallback
  if (officialCharacters[id]) {
    console.log('[getCharacter] Loading OFFICIAL character:', id);
    return officialCharacters[id];
  }

  return undefined;
};

export const getAllCharacters = (): Character[] => {
  const customCharacters = getCustomCharacters();
  const customIds = new Set(customCharacters.map(c => c.id));

  // Start with custom characters (includes edited official ones)
  const allCharacters = [...customCharacters];

  // Add official characters that haven't been overridden or hidden
  for (const official of Object.values(officialCharacters)) {
    if (!customIds.has(official.id) && !isAssetHidden(official.id)) {
      allCharacters.push(official);
    }
  }

  return allCharacters;
};
