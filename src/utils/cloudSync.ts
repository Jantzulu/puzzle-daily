/**
 * Cloud Sync Utilities
 *
 * This module provides synchronization between local storage and Supabase cloud storage.
 * It maintains backward compatibility with existing localStorage while enabling cloud sync.
 */

import {
  fetchAllPuzzles,
  fetchAllAssets,
  savePuzzleToCloud,
  saveAssetToCloud,
  deletePuzzleFromCloud,
  deleteAssetFromCloud,
  syncFromCloud,
} from '../services/supabaseService';
import type { DbPuzzle, DbAsset } from '../lib/supabase';
import type { Puzzle } from '../types/game';
import type {
  CustomTileType,
  CustomObject,
  CustomCharacter,
  CustomEnemy,
  CustomSprite,
} from './assetStorage';
import type { PuzzleSkin, SpellAsset } from '../types/game';
import {
  getCustomTileTypes,
  getCustomObjects,
  getCustomCharacters,
  getCustomEnemies,
  getPuzzleSkins,
  getSpellAssets,
  saveTileType,
  saveObject,
  saveCharacter,
  saveEnemy,
  savePuzzleSkin,
  saveSpellAsset,
} from './assetStorage';
import { getSavedPuzzles, savePuzzle as saveLocalPuzzle } from './puzzleStorage';

// Track sync status
let lastSyncTime: Date | null = null;
let isSyncing = false;
let syncListeners: Array<(status: SyncStatus) => void> = [];

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter(l => l !== listener);
  };
}

function notifySyncStatus(status: SyncStatus) {
  syncListeners.forEach(l => l(status));
}

export function getLastSyncTime(): Date | null {
  return lastSyncTime;
}

export function isSyncInProgress(): boolean {
  return isSyncing;
}

/**
 * Push all local assets to cloud
 * This uploads everything from localStorage to Supabase
 */
export async function pushAllToCloud(): Promise<{ success: boolean; errors: string[] }> {
  if (isSyncing) {
    return { success: false, errors: ['Sync already in progress'] };
  }

  isSyncing = true;
  notifySyncStatus('syncing');
  const errors: string[] = [];

  try {
    // Push tile types
    const tileTypes = getCustomTileTypes();
    for (const tile of tileTypes) {
      const success = await saveAssetToCloud(tile.id, 'tile_type', tile.name, tile);
      if (!success) errors.push(`Failed to upload tile type: ${tile.name}`);
    }

    // Push enemies
    const enemies = getCustomEnemies();
    for (const enemy of enemies) {
      const success = await saveAssetToCloud(enemy.id, 'enemy', enemy.name, enemy as unknown as CustomEnemy);
      if (!success) errors.push(`Failed to upload enemy: ${enemy.name}`);
    }

    // Push characters
    const characters = getCustomCharacters();
    for (const character of characters) {
      const success = await saveAssetToCloud(character.id, 'character', character.name, character as unknown as CustomCharacter);
      if (!success) errors.push(`Failed to upload character: ${character.name}`);
    }

    // Push objects
    const objects = getCustomObjects();
    for (const obj of objects) {
      const success = await saveAssetToCloud(obj.id, 'object', obj.name, obj);
      if (!success) errors.push(`Failed to upload object: ${obj.name}`);
    }

    // Push skins
    const skins = getPuzzleSkins();
    for (const skin of skins) {
      if (!skin.isBuiltIn) {
        const success = await saveAssetToCloud(skin.id, 'skin', skin.name, skin);
        if (!success) errors.push(`Failed to upload skin: ${skin.name}`);
      }
    }

    // Push spells
    const spells = getSpellAssets();
    for (const spell of spells) {
      const success = await saveAssetToCloud(spell.id, 'spell', spell.name, spell);
      if (!success) errors.push(`Failed to upload spell: ${spell.name}`);
    }

    // Push puzzles
    const puzzles = getSavedPuzzles();
    console.log(`[CloudSync] Pushing ${puzzles.length} puzzles to cloud`);
    for (const savedPuzzle of puzzles) {
      // SavedPuzzle extends Puzzle directly, so savedPuzzle IS the puzzle
      console.log(`[CloudSync] Uploading puzzle: ${savedPuzzle.name} (${savedPuzzle.id})`);
      const success = await savePuzzleToCloud(savedPuzzle, savedPuzzle.name);
      if (!success) errors.push(`Failed to upload puzzle: ${savedPuzzle.name}`);
    }

    lastSyncTime = new Date();
    notifySyncStatus(errors.length > 0 ? 'error' : 'success');
    return { success: errors.length === 0, errors };

  } catch (error) {
    console.error('Push to cloud failed:', error);
    notifySyncStatus('error');
    return { success: false, errors: ['Unexpected error during sync'] };
  } finally {
    isSyncing = false;
  }
}

/**
 * Pull all assets from cloud to local storage
 * This downloads everything from Supabase to localStorage
 */
export async function pullFromCloud(): Promise<{ success: boolean; errors: string[] }> {
  if (isSyncing) {
    return { success: false, errors: ['Sync already in progress'] };
  }

  isSyncing = true;
  notifySyncStatus('syncing');
  const errors: string[] = [];

  try {
    const cloudData = await syncFromCloud();

    // Import tile types
    for (const asset of cloudData.tileTypes) {
      try {
        const tileType = asset.data as unknown as CustomTileType;
        saveTileType(tileType);
      } catch (e) {
        errors.push(`Failed to import tile type: ${asset.name}`);
      }
    }

    // Import enemies
    for (const asset of cloudData.enemies) {
      try {
        const enemy = asset.data as unknown as CustomEnemy;
        saveEnemy(enemy);
      } catch (e) {
        errors.push(`Failed to import enemy: ${asset.name}`);
      }
    }

    // Import characters
    for (const asset of cloudData.characters) {
      try {
        const character = asset.data as unknown as CustomCharacter;
        saveCharacter(character);
      } catch (e) {
        errors.push(`Failed to import character: ${asset.name}`);
      }
    }

    // Import objects
    for (const asset of cloudData.objects) {
      try {
        const obj = asset.data as unknown as CustomObject;
        saveObject(obj);
      } catch (e) {
        errors.push(`Failed to import object: ${asset.name}`);
      }
    }

    // Import skins
    for (const asset of cloudData.skins) {
      try {
        const skin = asset.data as unknown as PuzzleSkin;
        if (!skin.isBuiltIn) {
          savePuzzleSkin(skin);
        }
      } catch (e) {
        errors.push(`Failed to import skin: ${asset.name}`);
      }
    }

    // Import spells
    for (const asset of cloudData.spells) {
      try {
        const spell = asset.data as unknown as SpellAsset;
        saveSpellAsset(spell);
      } catch (e) {
        errors.push(`Failed to import spell: ${asset.name}`);
      }
    }

    // Import puzzles
    console.log(`[CloudSync] Pulling ${cloudData.puzzles.length} puzzles from cloud`);
    for (const dbPuzzle of cloudData.puzzles) {
      try {
        console.log(`[CloudSync] Importing puzzle: ${dbPuzzle.name} (${dbPuzzle.id})`);
        const puzzle = dbPuzzle.data as unknown as Puzzle;
        // Ensure puzzle has the id and name from the db record
        puzzle.id = dbPuzzle.id;
        puzzle.name = dbPuzzle.name;
        saveLocalPuzzle(puzzle);
        console.log(`[CloudSync] Successfully saved puzzle to local storage: ${puzzle.id}`);
      } catch (e) {
        console.error(`[CloudSync] Failed to import puzzle ${dbPuzzle.name}:`, e);
        errors.push(`Failed to import puzzle: ${dbPuzzle.name}`);
      }
    }
    console.log(`[CloudSync] After pull, local puzzles count: ${getSavedPuzzles().length}`);

    lastSyncTime = new Date();
    notifySyncStatus(errors.length > 0 ? 'error' : 'success');
    return { success: errors.length === 0, errors };

  } catch (error) {
    console.error('Pull from cloud failed:', error);
    notifySyncStatus('error');
    return { success: false, errors: ['Unexpected error during sync'] };
  } finally {
    isSyncing = false;
  }
}

/**
 * Sync a single asset to cloud (called when saving locally)
 */
export async function syncAssetToCloud(
  id: string,
  type: 'tile_type' | 'enemy' | 'character' | 'object' | 'skin' | 'spell',
  name: string,
  data: unknown
): Promise<boolean> {
  try {
    return await saveAssetToCloud(id, type, name, data as any);
  } catch (error) {
    console.error(`Failed to sync ${type} to cloud:`, error);
    return false;
  }
}

/**
 * Sync a single puzzle to cloud (called when saving locally)
 */
export async function syncPuzzleToCloud(puzzle: Puzzle, name: string): Promise<boolean> {
  try {
    return await savePuzzleToCloud(puzzle, name);
  } catch (error) {
    console.error('Failed to sync puzzle to cloud:', error);
    return false;
  }
}

/**
 * Delete an asset from cloud
 */
export async function deleteAssetFromCloudSync(id: string): Promise<boolean> {
  try {
    return await deleteAssetFromCloud(id);
  } catch (error) {
    console.error('Failed to delete asset from cloud:', error);
    return false;
  }
}

/**
 * Delete a puzzle from cloud
 */
export async function deletePuzzleFromCloudSync(id: string): Promise<boolean> {
  try {
    return await deletePuzzleFromCloud(id);
  } catch (error) {
    console.error('Failed to delete puzzle from cloud:', error);
    return false;
  }
}

/**
 * Get cloud puzzles list (without downloading full data)
 */
export async function getCloudPuzzlesList(): Promise<DbPuzzle[]> {
  try {
    return await fetchAllPuzzles();
  } catch (error) {
    console.error('Failed to fetch cloud puzzles:', error);
    return [];
  }
}

/**
 * Get cloud assets list by type
 */
export async function getCloudAssetsList(type?: 'tile_type' | 'enemy' | 'character' | 'object' | 'skin' | 'spell'): Promise<DbAsset[]> {
  try {
    return await fetchAllAssets(type);
  } catch (error) {
    console.error('Failed to fetch cloud assets:', error);
    return [];
  }
}
