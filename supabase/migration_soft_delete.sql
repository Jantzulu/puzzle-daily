-- Migration: Add soft delete support
-- Run this in Supabase SQL Editor to add deleted_at column to draft tables

-- Add deleted_at column to puzzles_draft
ALTER TABLE puzzles_draft
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Add deleted_at column to assets_draft
ALTER TABLE assets_draft
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Add indexes for efficient filtering of non-deleted items
CREATE INDEX IF NOT EXISTS idx_puzzles_draft_deleted ON puzzles_draft(deleted_at);
CREATE INDEX IF NOT EXISTS idx_assets_draft_deleted ON assets_draft(deleted_at);

-- Optional: Create a view for non-deleted items (convenience)
CREATE OR REPLACE VIEW puzzles_draft_active AS
SELECT * FROM puzzles_draft WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW assets_draft_active AS
SELECT * FROM assets_draft WHERE deleted_at IS NULL;
