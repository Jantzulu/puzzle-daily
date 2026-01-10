import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rmkxayrfodctnqhsiphw.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Wmt7Opap7gZqeA5kXgValg_AA2iS0cZ';

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

export interface DbSpriteImage {
  id: string;
  asset_id: string;
  image_data: string; // Base64 or storage URL
  image_type: 'idle' | 'moving' | 'attack' | 'death' | 'thumbnail' | 'border' | 'tile';
  created_at: string;
}
