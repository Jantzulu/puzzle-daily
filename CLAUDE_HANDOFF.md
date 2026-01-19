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
- **Branding**: logo, logoAlt, siteTitle, navLabelPlay/Compendium/Editor/Assets
- **Backgrounds**: bgMain, bgPanel, bgGameArea, bgNavbar
- **Colors**: colorBgPrimary, colorBgSecondary, colorTextPrimary, colorTextSecondary, colorButtonBg, colorButtonBorder, colorButtonPrimaryBg, colorButtonPrimaryBorder, etc.
- **Styles**: borderRadius, borderWidth, shadowIntensity, fontFamily, fontFamilyHeading, fontSizeBody, fontSizeHeading

### How Theming Works
1. Theme settings are stored in localStorage under `theme_assets`
2. `applyThemeAssets()` converts theme values to CSS custom properties (e.g., `--theme-button-bg`)
3. CSS in `src/index.css` uses these variables with fallbacks
4. Components use Tailwind classes that are overridden by CSS variable rules

### Theme Editor
Located at `src/components/editor/ThemeAssetsEditor.tsx` - accessible via Assets > Theme tab

## Recent Work (This Session)

### 1. Fixed Fuzzy Graphics on Mobile (High-DPI Support)
**File**: `src/components/game/AnimatedGameBoard.tsx`

The canvas wasn't accounting for `devicePixelRatio`, causing blurry rendering on Retina/mobile displays.

**Changes**:
- Canvas resolution now multiplied by `window.devicePixelRatio`
- Canvas context scaled by dpr before drawing
- CSS constrains display size while internal resolution stays high
- Changed `imageRendering` to `'pixelated'`

### 2. Added Navigation Label Customization
**Files**: `src/utils/themeAssets.ts`, `src/App.tsx`

Added theme properties for nav button labels:
- `navLabelPlay`, `navLabelCompendium`, `navLabelEditor`, `navLabelAssets`

### 3. Fixed Nav Button Theming
**Files**: `src/index.css`, `src/App.tsx`

Nav buttons weren't responding to theme border-width and color settings.

**Changes**:
- Added `.nav-link-btn` CSS rules using theme variables
- Added `.nav-link-active` class for active state
- Removed hardcoded Tailwind color classes from App.tsx

### 4. Fixed Supabase Asset Type Constraint
User ran this SQL to add new asset types:
```sql
ALTER TABLE assets_draft DROP CONSTRAINT IF EXISTS assets_draft_type_check;
ALTER TABLE assets_draft ADD CONSTRAINT assets_draft_type_check CHECK (
  type IN ('tile_type', 'enemy', 'character', 'object', 'skin', 'spell', 'status_effect', 'folder', 'collectible_type', 'collectible', 'hidden_assets', 'sound', 'global_sound_config', 'help_content', 'theme_settings')
);
```

### 5. Animation Jitter Fix (Previous Session)
**File**: `src/components/game/AnimatedGameBoard.tsx`

Fixed entity flashing at destination before animating by using refs for synchronous position access during canvas rendering.

### 6. Renamed "Foe/Foes" to "Enemy/Enemies" (Previous Session)
Changed terminology across multiple files.

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

## Known Issues / Pending Work

1. **Theme Sync**: Theme settings now sync to cloud after DB constraint update
2. **Large Bundle Size**: Build shows warning about chunk size > 500KB

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

## Key Component Files

- **Game Board**: `src/components/game/AnimatedGameBoard.tsx` (large file, ~3200 lines)
- **Game Logic**: `src/components/game/Game.tsx`
- **Theme Editor**: `src/components/editor/ThemeAssetsEditor.tsx`
- **Cloud Sync**: `src/utils/cloudSync.ts`
- **Theme Utilities**: `src/utils/themeAssets.ts`
- **Main App/Nav**: `src/App.tsx`
- **Styles**: `src/index.css`

## User Preferences

- Uses Windows with Git Bash
- Project is at `C:\Users\jantz\Desktop\Claude\puzzle-game`
- Prefers commits with descriptive messages
- Testing on iPhone 15 Pro for mobile

## Tips for New Claude Instance

1. The AnimatedGameBoard.tsx file is very large - use offset/limit when reading
2. Theme changes require both updating themeAssets.ts (TypeScript types + config) AND index.css (CSS variable usage)
3. Always run `npm run build` to verify no errors before committing
4. The user is actively developing and testing, so quick iteration is expected
