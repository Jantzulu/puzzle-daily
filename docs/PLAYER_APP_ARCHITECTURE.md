# Player App Architecture - Hybrid Asset Loading

## Overview

This document outlines the planned architecture for the player-facing web app that will serve daily puzzles to users.

## Current State (Editor App)

- Assets (collectibles, enemies, characters, tiles, etc.) are stored in localStorage
- Cloud sync pushes/pulls all assets between desktop and Supabase
- Puzzles reference assets by ID
- Problem: Mobile users must sync all assets before puzzles work correctly

## Planned Architecture: On-Demand Asset Fetching

### Why Hybrid?

With hundreds of puzzles, embedding all asset definitions in each puzzle would cause:
- Significant storage duplication (same collectible defined in many puzzles)
- Large puzzle file sizes (sprites are base64 encoded)
- Asset updates not propagating to existing puzzles

### Proposed Solution

**Player app fetches puzzle + referenced assets separately, on-demand:**

```
1. Player requests today's puzzle
   GET /api/puzzle/:id
   -> Returns puzzle JSON with asset IDs (not full definitions)

2. App identifies required assets from puzzle
   - puzzle.collectibles[].collectibleId
   - puzzle.enemies[].enemyId
   - puzzle.availableCharacters[]
   - puzzle.tiles with customTileTypeId
   - puzzle.skinId
   - etc.

3. App fetches only needed assets
   GET /api/assets?ids=collectible_1,enemy_2,char_3
   -> Returns array of asset definitions

4. Assets are cached in memory/sessionStorage
   - Repeat plays of same puzzle don't re-fetch
   - Different puzzles sharing assets benefit from cache
```

### API Endpoints Needed

```typescript
// Fetch puzzle by ID (for daily or archived puzzles)
GET /api/puzzle/:id
Response: Puzzle (with asset IDs, not embedded definitions)

// Fetch multiple assets by ID
GET /api/assets?ids=id1,id2,id3
Response: {
  collectibles: CustomCollectible[],
  enemies: CustomEnemy[],
  characters: CustomCharacter[],
  tileTypes: CustomTileType[],
  // etc.
}

// Fetch today's puzzle (convenience endpoint)
GET /api/puzzle/today
Response: Puzzle
```

### Player App Data Flow

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│   Player App    │────>│  Supabase    │────>│   Assets    │
│                 │     │    API       │     │   Table     │
│  - No localStorage    │              │     │             │
│  - Stateless    │<────│              │<────│             │
│  - Caches in    │     └──────────────┘     └─────────────┘
│    memory only  │
└─────────────────┘
```

### Benefits

1. **No localStorage dependency** - Player app is stateless
2. **No duplication** - Assets stored once in cloud
3. **Updates propagate** - Fix a typo, all puzzles reflect it
4. **Minimal bandwidth** - Only fetch assets needed for current puzzle
5. **Caching** - Assets shared across puzzles load from cache

### Implementation Notes

- Create a runtime asset registry (Map) in player app
- `loadCollectible(id)` checks registry first, falls back to fetch
- Puzzle loading waits for all required assets before rendering
- Could show loading indicator while fetching assets

### Migration Path

1. **Phase 1 (Current)**: Full cloud sync for editor, pull to mobile
2. **Phase 2**: Add API endpoints for on-demand asset fetching
3. **Phase 3**: Build player-only app using on-demand approach
4. **Phase 4**: Daily puzzle scheduling via admin interface

## Supabase Notes

No SQL changes needed for this feature - the existing `assets_draft` table structure supports all asset types. The new `collectible` type was added alongside `collectible_type` for full-featured collectibles.

Asset types in `assets_draft.type`:
- `tile_type`
- `enemy`
- `character`
- `object`
- `skin`
- `spell`
- `status_effect`
- `folder`
- `collectible_type` (legacy simple collectibles)
- `collectible` (full-featured collectibles) <- NEW
- `hidden_assets`
- `sound`
- `global_sound_config`
- `help_content`
