# Claude Handoff Document - Puzzle Daily

Last Updated: January 18, 2026

## Project Overview

**Puzzle Daily** is a React/TypeScript puzzle game with a medieval dungeon theme. It features:
- Turn-based puzzle gameplay with characters and enemies
- A map editor for creating puzzles
- An asset manager for custom sprites, tiles, enemies, characters, spells, etc.
- A compendium for viewing all game content
- Cloud sync with Supabase
- Comprehensive theming system

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + custom CSS variables for theming
- **Backend**: Supabase (PostgreSQL)
- **Hosting**: GitHub Pages (likely) or similar
- **Repository**: https://github.com/Jantzulu/puzzle-daily.git

## Key Directories

```
puzzle-game/
├── src/
│   ├── components/
│   │   ├── game/           # Game components (Game.tsx, AnimatedGameBoard.tsx)
│   │   ├── editor/         # Map editor, asset editors, theme editor
│   │   ├── compendium/     # Compendium views
│   │   └── shared/         # Shared components
│   ├── utils/
│   │   ├── themeAssets.ts  # Theme system - CSS variables, storage
│   │   ├── cloudSync.ts    # Supabase sync logic
│   │   ├── assetStorage.ts # Local storage for assets
│   │   └── puzzleStorage.ts
│   ├── services/
│   │   └── supabaseService.ts  # Supabase API calls
│   ├── data/               # Built-in characters, enemies, tiles
│   ├── engine/             # Game simulation logic
│   ├── types/              # TypeScript types
│   └── lib/
│       └── supabase.ts     # Supabase client config
├── index.html
├── tailwind.config.js
└── package.json
```

## Theme System

The app has a comprehensive theming system in `src/utils/themeAssets.ts`:

### Key Theme Properties
- **Branding**: logo, logoAlt, siteTitle, siteSubtitle, siteSubtitleColor, siteSubtitleSize, navLabelPlay/Compendium/Editor/Assets
- **Navigation Icons**: iconNavPlay, iconNavCompendium, iconNavEditor, iconNavAssets
- **Compendium Tab Icons**: iconTabHeroes, iconTabEnemies, iconTabEnchantments, iconTabTiles, iconTabItems
- **Backgrounds**: bgMain, bgPanel, bgGameArea, bgNavbar
- **Preview Backgrounds** (separate for entities vs assets):
  - `colorBgPreviewEntity` / `bgPreviewEntity` - For heroes/enemies
  - `colorBgPreviewAsset` / `bgPreviewAsset` - For tiles/items/enchantments
  - `colorBgPreview` / `bgPreview` - Fallback for both
- **Colors**: colorBgPrimary, colorBgSecondary, colorTextPrimary, colorTextSecondary, colorButtonBg, colorButtonBorder, colorButtonPrimaryBg, colorButtonPrimaryBorder, etc.
- **Styles**: borderRadius, borderWidth, shadowIntensity, fontFamily, fontFamilyHeading, fontSizeBody, fontSizeHeading

### How Theming Works
1. Theme settings are stored in localStorage under `theme_assets`
2. `applyThemeAssets()` converts theme values to CSS custom properties (e.g., `--theme-button-bg`)
3. CSS in `src/index.css` uses these variables with fallbacks
4. Components use Tailwind classes that are overridden by CSS variable rules

### Preview Background System
- `PreviewType` = 'entity' | 'asset' - differentiates hero/enemy previews from tile/item previews
- `drawPreviewBackground()` function draws backgrounds on canvas with support for:
  - Solid colors
  - Background images (tiled or stretched)
  - Type-specific backgrounds (entity vs asset)
- CSS variables: `--theme-bg-preview-entity`, `--asset-bg-preview-entity`, `--theme-bg-preview-asset`, `--asset-bg-preview-asset`

### Theme Editor
Located at `src/components/editor/ThemeAssetsEditor.tsx` - accessible via Assets > Theme tab

## Recent Work (This Session - January 18, 2026)

### 1. Boss Enemy System
**Files**: `src/types/game.ts`, `src/components/editor/EnemyEditor.tsx`, `src/engine/simulation.ts`

Added boss variant for enemies:
- Added `isBoss?: boolean` property to Enemy interface
- Added boss toggle checkbox in EnemyEditor with special blood-themed styling
- Added "BOSS" badge display in enemy list
- Bosses enable the "Defeat the Boss" win condition

### 2. "Defeat the Boss" Win Condition
**Files**: `src/types/game.ts`, `src/engine/simulation.ts`, `src/components/editor/MapEditor.tsx`

New win condition type:
- Added `defeat_boss` to `WinConditionType` union
- Implemented victory check in `checkVictoryConditions()` - checks all enemies with `isBoss: true` are defeated
- Added option to win condition dropdown in MapEditor

### 3. Dynamic Boss Name in Goal Text
**Files**: `src/components/game/Game.tsx`, `src/components/editor/MapEditor.tsx`

Goal text shows boss names dynamically:
- Added `loadEnemy` import to both files
- Win condition display now shows "Defeat [Boss Name]" populated from placed enemies
- Handles multiple bosses: "Defeat Dragon & Lich"
- Falls back to "Defeat the boss" if no boss enemies found

### 4. Tile Skin Variations in Compendium
**File**: `src/components/compendium/Compendium.tsx`

Shows all sprite variations for tiles:
- **TileCard**: Small thumbnails showing off-state sprite and skin override sprites
- **TileDetail**: Two separate sections:
  - "Cadence States" - On/Off state sprites for tiles with cadence
  - "Skin Overrides" - How puzzle skins can replace the tile's default appearance
- Added `getAllPuzzleSkins` import to gather skin variations

### 5. Playtest Mode Styling Improvements
**File**: `src/components/editor/MapEditor.tsx`

Updated playtest mode to match Game page styling:
- Changed CSS classes to dungeon-themed classes (`dungeon-btn-success`, `dungeon-panel-dark`, etc.)
- Updated victory/defeat panels with `victory-panel` and `defeat-panel` classes
- Added Step button to setup mode controls (was only in running mode)
- Updated turn counter to show max turns with themed styling

### 6. Separate Preview Backgrounds for Entities vs Assets
**Files**: `src/utils/themeAssets.ts`, `src/components/editor/SpriteThumbnail.tsx`, `src/components/editor/SpriteEditor.tsx`, `src/components/editor/StaticSpriteEditor.tsx`, `src/components/compendium/Compendium.tsx`

Theme system now supports separate preview backgrounds:
- `PreviewType` = 'entity' | 'asset'
- SpriteThumbnail accepts `previewType` prop
- Compendium uses 'entity' for characters/enemies, 'asset' for tiles/items/enchantments
- CSS variables for entity-specific and asset-specific backgrounds

## Previous Session Work

### Fixed Fuzzy Graphics on Mobile (High-DPI Support)
**File**: `src/components/game/AnimatedGameBoard.tsx`

Canvas now accounts for `devicePixelRatio` for sharp rendering on Retina/mobile displays.

### Added Navigation Label Customization
Theme properties for nav button labels: `navLabelPlay`, `navLabelCompendium`, `navLabelEditor`, `navLabelAssets`

### Fixed Nav Button Theming
Added `.nav-link-btn` and `.nav-link-active` CSS rules using theme variables.

### Animation Jitter Fix
Fixed entity flashing at destination before animating by using refs for synchronous position access.

## Supabase Configuration

- **URL**: `https://rmkxayrfodctnqhsiphw.supabase.co`
- **Tables**: `puzzles_draft`, `assets_draft`, `daily_schedule`, `puzzles_live`
- **Asset Types**: tile_type, enemy, character, object, skin, spell, status_effect, folder, collectible_type, collectible, hidden_assets, sound, global_sound_config, help_content, theme_settings

## Common Commands

```bash
# Development
cd "C:/Users/jantz/Desktop/Claude/puzzle-game"
npm run dev

# Build
npm run build

# Git
git add -A && git commit -m "message" && git push
```

## Key Type Interfaces

### Enemy (src/types/game.ts)
```typescript
interface Enemy {
  // ... existing properties
  isBoss?: boolean;  // If true, enables 'defeat_boss' win condition
}
```

### WinConditionType (src/types/game.ts)
```typescript
type WinConditionType =
  | 'defeat_all_enemies'
  | 'defeat_boss'        // All boss enemies must be defeated
  | 'collect_all'
  | 'reach_goal'
  | 'survive_turns'
  | 'win_in_turns'
  | 'max_characters'
  | 'characters_alive';
```

### PuzzleSkin Tile Sprites (src/types/game.ts)
```typescript
interface PuzzleSkin {
  customTileSprites?: {
    [customTileTypeId: string]: string | {
      onSprite?: string;   // Base64 sprite for on state
      offSprite?: string;  // Base64 sprite for off state
    };
  };
}
```

## CSS Variable Reference

Key CSS variables used throughout the app:
- `--theme-bg-primary`, `--theme-bg-secondary`
- `--theme-text-primary`, `--theme-text-secondary`
- `--theme-border-primary`, `--theme-border-accent`
- `--theme-button-bg`, `--theme-button-border`
- `--theme-button-primary-bg`, `--theme-button-primary-border`
- `--theme-button-danger-bg`, `--theme-button-danger-border`
- `--theme-border-radius`, `--theme-border-width`
- `--theme-font-family`, `--theme-font-family-heading`
- `--theme-bg-preview-entity`, `--asset-bg-preview-entity` (hero/enemy previews)
- `--theme-bg-preview-asset`, `--asset-bg-preview-asset` (tile/item previews)
- `--theme-bg-preview`, `--asset-bg-preview` (fallback)

## Key Component Files

- **Game Board**: `src/components/game/AnimatedGameBoard.tsx` (large file, ~3200 lines)
- **Game Logic**: `src/components/game/Game.tsx`
- **Theme Editor**: `src/components/editor/ThemeAssetsEditor.tsx`
- **Enemy Editor**: `src/components/editor/EnemyEditor.tsx`
- **Map Editor**: `src/components/editor/MapEditor.tsx` (large file, includes playtest mode)
- **Simulation Engine**: `src/engine/simulation.ts`
- **Cloud Sync**: `src/utils/cloudSync.ts`
- **Theme Utilities**: `src/utils/themeAssets.ts`
- **Asset Storage**: `src/utils/assetStorage.ts`
- **Compendium**: `src/components/compendium/Compendium.tsx`
- **Main App/Nav**: `src/App.tsx`
- **Styles**: `src/index.css`

## User Preferences

- Uses Windows with Git Bash
- Project is at `C:\Users\jantz\Desktop\Claude\puzzle-game`
- Prefers commits with descriptive messages
- Testing on iPhone 15 Pro for mobile

## Tips for New Claude Instance

1. The AnimatedGameBoard.tsx and MapEditor.tsx files are very large - use offset/limit when reading
2. Theme changes require both updating themeAssets.ts (TypeScript types + config) AND index.css (CSS variable usage)
3. Always run `npm run build` to verify no errors before committing
4. The user is actively developing and testing, so quick iteration is expected
5. Boss enemies use `isBoss: true` flag and enable the `defeat_boss` win condition
6. Puzzle skins can override tile sprites - check `customTileSprites` in PuzzleSkin interface
7. Preview backgrounds differentiate between 'entity' (heroes/enemies) and 'asset' (tiles/items) types
