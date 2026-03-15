import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types for TypeScript
export interface DbPuzzle {
  id: string;
  name: string;
  data: object; // Full puzzle JSON
  status: 'draft' | 'pending_review' | 'approved' | 'published';
  created_at: string;
  updated_at: string;
  created_by?: string;
  scheduled_date?: string; // For daily puzzles
  deleted_at?: string | null; // Soft delete timestamp
}

export interface DbAsset {
  id: string;
  type: 'tile_type' | 'enemy' | 'character' | 'object' | 'skin' | 'spell';
  name: string;
  data: object; // Full asset JSON
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
  created_by?: string;
  deleted_at?: string | null; // Soft delete timestamp
}

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: 'player' | 'creator';
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DbBugReport {
  id: string;
  player_id: string;
  puzzle_id: string;
  puzzle_name: string | null;
  placements: object; // PlacedCharacter[] as JSONB
  outcome: 'victory' | 'defeat';
  turns_used: number | null;
  asset_type: string | null;
  asset_id: string | null;
  asset_name: string | null;
  description: string;
  status: 'new' | 'reviewed' | 'resolved';
  dev_notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DbSpriteImage {
  id: string;
  asset_id: string;
  image_data: string; // Base64 or storage URL
  image_type: 'idle' | 'moving' | 'attack' | 'death' | 'thumbnail' | 'border' | 'tile';
  created_at: string;
}

export interface DbNewsPost {
  id: string;
  title: string;
  body: string;
  summary: string | null;
  banner_url: string | null;
  category: string;
  author: string;
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
