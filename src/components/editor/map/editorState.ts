// EditorState shape + defaults for the map editor. Extracted verbatim from
// MapEditor.tsx (Phase 1 decomposition, 2026-07-14). Distinct from
// src/utils/editorState.ts, which handles cross-tab caching of this state.
import type { TileOrNull, PlacedEnemy, PlacedCollectible, PlacedObject, WinCondition, BorderConfig, SideQuest, HallwayMarker, DoorMarker } from '../../../types/game';
import { createEmptyGrid } from './canvasDraw';

export type ToolType = 'empty' | 'wall' | 'void' | 'enemy' | 'ally' | 'vessel' | 'collectible' | 'object' | 'custom' | 'characters' | 'hallway';
export type EditorMode = 'edit' | 'playtest';

export interface EditorState {
  gridWidth: number;
  gridHeight: number;
  tiles: TileOrNull[][];
  enemies: PlacedEnemy[];
  collectibles: PlacedCollectible[];
  placedObjects: PlacedObject[];
  hallways: HallwayMarker[];
  doors: DoorMarker[];

  // Metadata
  puzzleName: string;
  puzzleId: string;
  maxCharacters: number;
  maxPlaceableCharacters?: number; // Max heroes player can place (if different from maxCharacters)
  maxTurns?: number;
  lives?: number; // Number of attempts (0 = unlimited, default: 3)
  availableCharacters: string[];
  winConditions: WinCondition[];
  borderConfig?: BorderConfig; // Legacy - kept for backwards compatibility
  skinId?: string; // Reference to PuzzleSkin
  backgroundMusicId?: string; // Reference to sound asset for puzzle-specific background music

  // Scoring
  parCharacters?: number;
  parTurns?: number;
  sideQuests: SideQuest[];

  // Tags & description
  tags: string[];
  description: string;

  // Training arena
  isTraining: boolean;

  // Editor state
  selectedTool: ToolType;
  isDrawing: boolean;
  mode: EditorMode;
}

// Helper to create default editor state
export const createDefaultEditorState = (): EditorState => ({
  gridWidth: 8,
  gridHeight: 8,
  tiles: createEmptyGrid(8, 8),
  enemies: [],
  collectibles: [],
  placedObjects: [],
  hallways: [],
  doors: [],

  puzzleName: 'New Puzzle',
  puzzleId: 'puzzle_' + Date.now(),
  maxCharacters: 3,
  maxTurns: 100,
  lives: 3,
  availableCharacters: [],
  winConditions: [{ type: 'defeat_all_enemies' }],
  skinId: 'builtin_dungeon', // Default skin

  // Scoring - undefined means auto-suggest from validator
  parCharacters: undefined,
  parTurns: undefined,
  sideQuests: [],

  // Tags & description
  tags: [],
  description: '',

  // Training arena
  isTraining: false,

  selectedTool: 'wall',
  isDrawing: false,
  mode: 'edit',
});
