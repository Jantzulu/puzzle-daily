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

export const getCharacter = (id: string): Character | undefined => {
  // Check if hidden
  if (isAssetHidden(id)) {
    return undefined;
  }

  // Check official characters first
  if (officialCharacters[id]) {
    return officialCharacters[id];
  }

  // Check custom characters
  const customCharacters = getCustomCharacters();
  return customCharacters.find(c => c.id === id);
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
