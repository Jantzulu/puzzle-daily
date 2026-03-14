import type { PlacedCharacter } from './game';

/** Asset category as seen by the player */
export type BugAssetType = 'hero' | 'enemy' | 'tile' | 'item' | 'enchantment';

/** A single completed run tracked in session memory */
export interface TrackedRun {
  id: string;
  placements: PlacedCharacter[];
  outcome: 'victory' | 'defeat';
  turnsUsed: number;
  timestamp: number;
}

/** What the player submits */
export interface BugReportSubmission {
  puzzleId: string;
  puzzleName: string;
  placements: PlacedCharacter[];
  outcome: 'victory' | 'defeat';
  turnsUsed: number;
  assetType?: BugAssetType;
  assetId?: string;
  assetName?: string;
  description: string;
}

/** Row shape from Supabase */
export interface BugReport {
  id: string;
  player_id: string;
  puzzle_id: string;
  puzzle_name: string | null;
  placements: PlacedCharacter[];
  outcome: 'victory' | 'defeat';
  turns_used: number | null;
  asset_type: BugAssetType | null;
  asset_id: string | null;
  asset_name: string | null;
  description: string;
  status: 'new' | 'reviewed' | 'resolved';
  dev_notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
