-- Migration: Asset Versions table
-- Stores manual version snapshots for puzzles and assets

CREATE TABLE asset_versions (
  id SERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,  -- 'puzzle', 'tile_type', 'enemy', 'character', 'object', 'skin', 'spell', etc.
  version_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

-- One version_number per asset_id
CREATE UNIQUE INDEX idx_asset_versions_unique
  ON asset_versions(asset_id, version_number);

-- Fast lookups by asset (newest first)
CREATE INDEX idx_asset_versions_asset
  ON asset_versions(asset_id, version_number DESC);

-- RLS
ALTER TABLE asset_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to asset_versions"
  ON asset_versions FOR ALL USING (true) WITH CHECK (true);
