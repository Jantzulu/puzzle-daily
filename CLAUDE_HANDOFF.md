# Claude Handoff Document - Puzzle Daily

Last Updated: January 22, 2026

## Project Overview

**Puzzle Daily** is a sophisticated React/TypeScript puzzle game development platform with a medieval dungeon theme. It features:
- Turn-based puzzle gameplay with characters and enemies
- A full-featured map editor for creating puzzles with playtest mode
- A comprehensive asset manager for custom sprites, tiles, enemies, characters, spells, status effects, etc.
- A compendium for viewing all game content
- Cloud sync with Supabase (draft vs. live asset tiers)
- Extensive theming system with 50+ customizable properties

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 7
- **Styling**: Tailwind CSS with custom dungeon-themed palette + CSS variables for theming
- **Canvas Rendering**: Pixi.js 8 for 2D animations
- **Backend**: Supabase (PostgreSQL)
- **Hosting**: Netlify
- **Repository**: https://github.com/Jantzulu/puzzle-daily.git

## Key Directories

```
puzzle-game/
├── src/
│   ├── components/
│   │   ├── game/           # Game components (Game.tsx, AnimatedGameBoard.tsx)
│   │   ├── editor/         # Map editor, asset editors, theme editor
│   │   ├── compendium/     # Compendium views
│   │   └── shared/         # Shared components (SoundSettings, Tooltips, etc.)
│   ├── utils/
│   │   ├── themeAssets.ts  # Theme system - CSS variables, storage
│   │   ├── cloudSync.ts    # Supabase sync logic
│   │   ├── assetStorage.ts # Local storage for assets
│   │   ├── puzzleStorage.ts
│   │   ├── soundManager.ts # Audio playback
│   │   └── imageLoader.ts  # Image URL validation
│   ├── services/
│   │   └── supabaseService.ts  # Supabase API calls
│   ├── data/               # Built-in characters, enemies, tiles
│   ├── engine/             # Game simulation logic
│   │   ├── simulation.ts   # Turn-based game engine
│   │   ├── actions.ts      # Player/AI actions and damage
│   │   ├── puzzleSolver.ts # Solution finder
│   │   └── scoring.ts      # Score calculation
│   ├── types/
│   │   └── game.ts         # All TypeScript type definitions
│   └── lib/
│       └── supabase.ts     # Supabase client config
├── docs/                   # Architecture documentation
├── index.html
├── tailwind.config.js
└── package.json
```

## Game Engine Architecture

### Core Systems (src/engine/)

**simulation.ts** - Turn-based game engine:
- Character/enemy movement and AI
- Combat, damage calculation, and deflect mechanics
- Special tile effects (teleports, damage, ice, pressure plates)
- Status effect processing (poison, burn, shield, deflect, etc.)
- Win/loss condition checking
- Boss enemy system
- Lives/attempt system
- Projectile system with animations

**actions.ts** - Action execution:
- `applyDamageToEntity()` - Handles damage with source tracking for deflect
- `applyDamageToEntityNoDeflect()` - Prevents infinite deflect loops
- Melee, ranged, and AOE attack execution
- Spell casting (resurrect, heal, damage, status effects)
- Movement actions

### Key Game Concepts

**Tile Types**:
- Standard: empty, wall, goal, teleport
- Custom tile types with behaviors: damage, teleport, direction_change, ice, pressure_plate

**Cadence System**: Tiles can toggle on/off in patterns
```typescript
interface CadenceConfig {
  enabled: boolean;
  pattern: 'alternating' | 'interval' | 'custom';
  onTurns?: number;
  offTurns?: number;
  customPattern?: boolean[];
  startState: 'on' | 'off';
}
```

**Pressure Plates**: Can trigger wall toggles, enemy spawns/despawns, teleports

**Win Conditions**:
- `defeat_all_enemies`
- `defeat_boss` - All boss enemies must be defeated
- `collect_all`
- `reach_goal`
- `survive_turns`
- `win_in_turns`
- `max_characters`
- `characters_alive`

**Status Effect Types** (StatusEffectType enum):
- POISON, BURN, BLEED - Damage over time
- REGEN - Healing over time
- STUN, SLEEP - Prevents actions
- SLOW - Movement restriction
- SILENCED - Prevents ranged/spells
- DISARMED - Prevents melee
- POLYMORPH - Transformation
- STEALTH - Reduced visibility, can't be auto-targeted
- SHIELD - Damage absorption with health bar color change
- HASTE - Extra actions
- DEFLECT - Reflects spell damage back to caster

## Status Effect System

### StatusEffectAsset Interface
```typescript
interface StatusEffectAsset {
  id: string;
  name: string;
  description?: string;
  type: StatusEffectType;
  iconSprite?: SpriteReference;
  defaultDuration: number;
  defaultValue?: number;           // Damage/heal per turn, or shield amount
  processAtTurnStart?: boolean;
  removedOnDamage?: boolean;       // For Sleep
  preventsMelee?: boolean;
  preventsRanged?: boolean;
  preventsMovement?: boolean;
  preventsAllActions?: boolean;
  stackingBehavior: 'refresh' | 'stack' | 'replace' | 'highest';
  maxStacks?: number;
  healthBarColor?: string;         // For Shield type
  stealthOpacity?: number;         // For Stealth type
  overlaySprite?: SpriteReference; // Sprite overlay on entity (e.g., shield bubble)
  overlayOpacity?: number;         // Opacity of overlay (0-1, default 0.5)
}
```

### Deflect System (New)
- Added `DEFLECT` to StatusEffectType enum
- When entity with DEFLECT takes spell damage, damage reflects to caster
- Source tracking added to `applyDamageToEntity()` for deflect logic
- Separate `applyDamageToEntityNoDeflect()` prevents infinite loops
- Works with projectiles via `applyProjectileDamageWithDeflect()` in simulation.ts

### Visual Overlay System (New)
- Status effects can have an `overlaySprite` that renders on top of entities
- Supports static images and animated spritesheets
- Configurable opacity via `overlayOpacity`
- Rendered in `drawStatusEffectOverlays()` in AnimatedGameBoard.tsx

## Spell System

### SpellAsset Interface
```typescript
interface SpellAsset {
  id: string;
  name: string;
  description?: string;
  projectileSprite?: SpriteReference;
  impactSprite?: SpriteReference;
  damage?: number;
  healing?: number;
  range?: number;
  aoeRadius?: number;
  projectileSpeed?: number;
  projectilePierces?: boolean;
  statusEffects?: SpellStatusEffect[];
  // Resurrect spells
  isResurrect?: boolean;
  resurrectHealthPercent?: number;
  resurrectMaxUses?: number;
}
```

### Spell Templates in SpellAssetBuilder
- Fire (damage projectile)
- Ice (slow effect)
- Lightning (piercing)
- Heal (ally healing)
- Buff (status effect)
- Debuff (enemy status effect)
- AOE (area damage)
- Resurrect (revive dead allies)

### Auto-Targeting System (CharacterAction)
```typescript
interface CharacterAction {
  // ... other fields
  autoTargetNearestEnemy?: boolean;      // Auto-target closest enemy
  autoTargetNearestCharacter?: boolean;  // Auto-target closest ally
  autoTargetNearestDeadAlly?: boolean;   // Auto-target dead ally for resurrect
  autoTargetRange?: number;              // Max range for auto-targeting (0 = unlimited)
  autoTargetMaxTargets?: number;         // Max number of auto-targets
}
```

## Theme System

The app has a comprehensive theming system in `src/utils/themeAssets.ts`:

### Key Theme Properties
- **Branding**: logo, logoAlt, siteTitle, siteSubtitle, navLabels
- **Navigation Icons**: iconNavPlay, iconNavCompendium, iconNavEditor, iconNavAssets
- **Compendium Tab Icons**: iconTabHeroes, iconTabEnemies, iconTabEnchantments, iconTabTiles, iconTabItems
- **Backgrounds**: bgMain, bgPanel, bgGameArea, bgNavbar
- **Preview Backgrounds** (separate for entities vs assets):
  - `colorBgPreviewEntity` / `bgPreviewEntity` - For heroes/enemies
  - `colorBgPreviewAsset` / `bgPreviewAsset` - For tiles/items/enchantments
- **Panel Colors**: Defeat panel, Game Over panel, Concede modal (all customizable)
- **Styles**: borderRadius, borderWidth, shadowIntensity, fonts

### How Theming Works
1. Theme settings stored in localStorage under `theme_assets`
2. `applyThemeAssets()` converts values to CSS custom properties
3. CSS in `src/index.css` uses variables with fallbacks
4. Components use Tailwind classes overridden by CSS variable rules

### Theme Editor
Located at `src/components/editor/ThemeAssetsEditor.tsx` - accessible via Assets > Theme tab

## Data Storage & Cloud Sync

### Local Storage (src/utils/)
- **assetStorage.ts** - Manages local asset definitions
- **puzzleStorage.ts** - Manages local puzzle definitions
- **editorState.ts** - Persists editor UI state
- **historyManager.ts** - Undo/redo support

### Cloud Sync (src/utils/cloudSync.ts)
- Supabase integration for collaborative puzzle creation
- Two-tier system:
  - `assets_draft`, `puzzles_draft` - Editor work
  - `assets_live`, `puzzles_live` - Published for player app (future)

## Key Component Files

| File | Size | Purpose |
|------|------|---------|
| `AnimatedGameBoard.tsx` | ~3200 lines | Canvas-based game rendering, entity drawing, overlays |
| `MapEditor.tsx` | ~3000+ lines | Puzzle creation with embedded playtest mode |
| `Game.tsx` | Medium | Main game logic and state management |
| `simulation.ts` | Large | Turn-based game engine |
| `actions.ts` | Large | Action execution, damage, spells |
| `themeAssets.ts` | Large | Theme system with 50+ properties |
| `StatusEffectEditor.tsx` | Medium | Status effect configuration with overlay sprite UI |
| `SpellAssetBuilder.tsx` | Medium | Spell creation with templates |
| `CharacterEditor.tsx` | Medium | Character abilities, auto-targeting config |

## Recent Work (January 22, 2026 Session)

### Deflect Status Effect
Added a new status effect type that reflects spell damage back to caster:

1. **Type Definition**: Added `DEFLECT = 'deflect'` to StatusEffectType enum
2. **Source Tracking**: Modified `applyDamageToEntity()` to accept optional `source` parameter
3. **Deflect Logic**: When entity with DEFLECT takes damage, damage is applied to source instead
4. **Loop Prevention**: Created `applyDamageToEntityNoDeflect()` to prevent infinite reflection
5. **Projectile Support**: Added `hasDeflect()` and `applyProjectileDamageWithDeflect()` helpers

### Visual Overlay System for Status Effects
Added ability to display overlay sprites on entities with status effects:

1. **Type Support**: Added `overlaySprite` and `overlayOpacity` to StatusEffectAsset
2. **Rendering**: Added `drawStatusEffectOverlays()` in AnimatedGameBoard.tsx
3. **Editor UI**: Added overlay sprite configuration in StatusEffectEditor.tsx with:
   - Preview thumbnail
   - Add/Edit/Remove buttons
   - Opacity slider (10%-100%)
   - SimpleIconEditor modal for sprite editing

### Auto-Target Range for Spells
Added configurable range limit for auto-targeting:

1. Added `autoTargetRange` to CharacterAction interface
2. Updated `findNearestEnemies`, `findNearestCharacters`, `findNearestDeadAllies` to accept maxRange
3. Added Max Range input field in CharacterEditor UI

### Resurrect Spell Feature (Previous Session)
- Added resurrect spell template to SpellAssetBuilder
- Added `autoTargetNearestDeadAlly` option for characters
- Resurrect restores dead allies with configurable health percent
- Can limit uses per game via `resurrectMaxUses`

## Supabase Configuration

- **URL**: `https://rmkxayrfodctnqhsiphw.supabase.co`
- **Tables**: `puzzles_draft`, `assets_draft`, `daily_schedule`, `puzzles_live`, `assets_live`
- **Asset Types**: tile_type, enemy, character, object, skin, spell, status_effect, folder, collectible_type, collectible, hidden_assets, sound, global_sound_config, help_content, theme_settings

## Common Commands

```bash
# Development
cd "C:/Users/jantz/Desktop/Claude/puzzle-game"
npm run dev

# Build (always run before committing to catch errors)
npm run build

# Git
git add -A && git commit -m "message" && git push
```

## Key Type Interfaces

### Enemy (src/types/game.ts)
```typescript
interface Enemy {
  id: string;
  name: string;
  health: number;
  attackDamage?: number;
  behavior?: EnemyBehavior;
  isBoss?: boolean;  // Enables 'defeat_boss' win condition
  customSprite?: CustomSprite;
}
```

### WinConditionType
```typescript
type WinConditionType =
  | 'defeat_all_enemies'
  | 'defeat_boss'
  | 'collect_all'
  | 'reach_goal'
  | 'survive_turns'
  | 'win_in_turns'
  | 'max_characters'
  | 'characters_alive';
```

### SpriteReference
```typescript
interface SpriteReference {
  type: 'stored' | 'inline';
  spriteId?: string;           // ID from asset storage
  spriteData?: CustomSprite;   // Inline sprite data
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
- `--theme-bg-preview-entity`, `--asset-bg-preview-entity`
- `--theme-bg-preview-asset`, `--asset-bg-preview-asset`

## User Preferences

- Uses Windows with Git Bash (use powershell for npm commands)
- Project is at `C:\Users\jantz\Desktop\Claude\puzzle-game`
- Prefers commits with descriptive messages
- Testing on iPhone 15 Pro for mobile
- Appreciates detailed explanations of implementation

## Tips for New Claude Instance

1. **Large Files**: AnimatedGameBoard.tsx and MapEditor.tsx are very large - use offset/limit when reading
2. **Theme Changes**: Require both updating themeAssets.ts (types + config) AND index.css (CSS variable usage)
3. **Build Verification**: Always run `npm run build` to verify no errors before committing
4. **Powershell for npm**: Use `powershell.exe -ExecutionPolicy Bypass -Command "cd 'path'; npm run build"` for build commands
5. **Boss Enemies**: Use `isBoss: true` flag and enable the `defeat_boss` win condition
6. **Status Effects**: Check StatusEffectAsset interface for all configurable properties including new overlay system
7. **Damage Tracking**: All damage functions now support optional `source` parameter for deflect mechanics
8. **Preview Backgrounds**: Differentiate between 'entity' (heroes/enemies) and 'asset' (tiles/items) types
9. **Spell Targeting**: Auto-targeting has separate flags for enemies, allies, and dead allies with optional range limit

## Architecture Documentation

Additional docs in the `docs/` folder:
- **PLAYER_APP_ARCHITECTURE.md** - Future player-facing app design with on-demand asset fetching
- **PLAYER_APP_VISION.md** - Comprehensive vision including daily puzzle system, monetization, security requirements
