import type { Character } from '../../types/game';
import { getCustomCharacters, isAssetHidden, type CustomCharacter } from '../../utils/assetStorage';
import knightData from './knight.json';
import archerData from './archer.json';
import fireballMageData from './archer-fireball.json';

// Type that includes both base Character and optional customSprite
export type CharacterWithSprite = Character & { customSprite?: CustomCharacter['customSprite'] };

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

export const getCharacter = (id: string): CharacterWithSprite | undefined => {
  // Check if hidden
  if (isAssetHidden(id)) {
    return undefined;
  }

  // Check custom characters FIRST (they override official ones)
  const customCharacters = getCustomCharacters();
  const customChar = customCharacters.find(c => c.id === id);
  if (customChar) {
    return customChar;
  }

  // Check official characters as fallback
  if (officialCharacters[id]) {
    return officialCharacters[id];
  }

  return undefined;
};

export const getAllCharacters = (): CharacterWithSprite[] => {
  const customCharacters = getCustomCharacters();
  const customIds = new Set(customCharacters.map(c => c.id));

  // Start with custom characters (includes edited official ones)
  const allCharacters: CharacterWithSprite[] = [...customCharacters];

  // Add official characters that haven't been overridden or hidden
  for (const official of Object.values(officialCharacters)) {
    if (!customIds.has(official.id) && !isAssetHidden(official.id)) {
      allCharacters.push(official);
    }
  }

  return allCharacters;
};
