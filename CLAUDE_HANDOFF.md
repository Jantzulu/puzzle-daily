# Puzzle Game - Claude Handoff Document

This document provides context for continuing development on this project.

## Project Overview

This is a **turn-based puzzle game** built with **React + TypeScript + Vite**. Players place characters on a puzzle grid and watch them execute pre-programmed behaviors in a simulation. The game features custom sprites, enemies, spells, skins, and tile types.

### Core Concept
- Characters have behavior sequences (move forward, turn, attack, etc.)
- Simulation runs turn-by-turn with characters and enemies acting simultaneously
- Goal: Navigate characters to reach the goal tile while avoiding/defeating enemies

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build**: Vite 7.x
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM
- **Storage**: localStorage for custom assets (no backend)

## Key Directories

```
puzzle-game/
├── src/
│   ├── components/
│   │   ├── editor/           # Asset editors (characters, enemies, spells, skins, tiles)
│   │   │   ├── AssetManager.tsx      # Tab container for all editors
│   │   │   ├── CharacterEditor.tsx   # Create/edit characters
│   │   │   ├── EnemyEditor.tsx       # Create/edit enemies
│   │   │   ├── SpellLibrary.tsx      # Spell creation
│   │   │   ├── SkinEditor.tsx        # Puzzle visual themes
│   │   │   ├── TileTypeEditor.tsx    # Custom tile behaviors
│   │   │   ├── MapEditor.tsx         # Puzzle level designer
│   │   │   └── SpriteEditor.tsx      # Sprite configuration (directional, animations)
│   │   └── game/
│   │       ├── AnimatedGameBoard.tsx # Canvas-based game rendering
│   │       └── CharacterSelector.tsx # Character placement UI
│   ├── engine/
│   │   ├── actions.ts        # Movement, combat, spell execution
│   │   └── simulation.ts     # Turn execution, game state management
│   ├── types/
│   │   └── game.ts           # All TypeScript interfaces
│   ├── utils/
│   │   └── assetStorage.ts   # localStorage CRUD for custom assets
│   └── data/
│       ├── characters/       # Default character JSON files
│       └── enemies/          # Default enemy JSON files
```

## Major Systems

### 1. Character/Enemy Behavior System
Characters and enemies have a `behavior` array of `CharacterAction` objects:
- Action types: `MOVE_FORWARD`, `TURN_LEFT`, `TURN_RIGHT`, `WAIT`, `ATTACK`, `SPELL`, `IF_WALL`, etc.
- Actions can have triggers: `interval` (time-based) or `on_event` (condition-based)
- Wall collision behaviors: `stop`, `turn_left`, `turn_right`, `turn_around`, `continue`

### 2. Sprite System (`SpriteEditor.tsx`)
- **Directional sprites**: Different appearances per 8 directions
- **Animation states**: Idle, Moving, Death, Casting (each can have sprite sheets)
- **Death handling**: Death sprite sheet's final frame serves as the corpse appearance
- Sprites are stored as base64 in localStorage

### 3. Custom Tile Types (`TileTypeEditor.tsx`)
Tiles can have behaviors:
- `damage`: Deal damage when stepped on
- `teleport`: Transport to linked teleport tile (bidirectional, grouped by letter A-Z)
- `direction_change`: Force entity to face a specific direction
- `ice`: Slide until hitting a wall
- `pressure_plate`: Trigger events (toggle walls, spawn enemies)

### 4. Skin System (`SkinEditor.tsx`)
Puzzle visual themes with:
- Border sprites (walls, corners - many variants for inner/outer/thin)
- Tile sprites (floor, wall, goal)

### 5. Spell System (`SpellLibrary.tsx`)
Spells have:
- Projectile configuration (speed, range, piercing)
- Effects (damage, healing, knockback)
- Visual sprites

### 6. Combat System
- Characters have `attackDamage` and optional `retaliationDamage`
- Enemies can have `hasMeleePriority` to attack first in melee exchanges
- Entity properties:
  - `behavesLikeWall` / `behavesLikeWallDead`: Triggers wall collision reactions
  - `blocksMovement` / `blocksMovementDead`: Stops movement without triggering wall reactions
  - `canOverlapEntities`: Ghost mode - can pass through other entities

## Recent Changes (Latest Session)

1. **Movement Animation Timing**: Changed from 50/50 to 70/30 split (more time moving, less idle)
   - `MOVE_DURATION = 280ms`, `IDLE_DURATION = 120ms`

2. **Removed Corpse Sprite System**: Corpse appearance is now handled by the final frame of the Death sprite sheet
   - Removed: `corpseSpriteSheet`, `corpseImageData`, `corpseHasCollision` fields
   - Removed: `drawCorpseSprite()`, `hasCorpseSprite()` functions
   - Removed: Corpse sprite UI section in SpriteEditor

3. **Added Movement Blocking Fields**:
   - `blocksMovement`: When alive, stops entities without triggering wall reactions
   - `blocksMovementDead`: When dead, corpse stops entities without triggering wall reactions
   - Different from `behavesLikeWall` which triggers turn_left/turn_right/etc. behaviors

4. **Custom Tile Fixes**:
   - Fixed custom tiles not rendering in Map Editor
   - Fixed ice tile visual bug (diagonal lines extending outside tile bounds) using canvas clipping
   - Reformatted TileTypeEditor to match SkinEditor layout
   - Reordered Asset Manager tabs: Characters, Enemies, Spells, Tiles, Skins, Collectibles

5. **Removed Vestigial Toggle Flags**:
   - Removed `useAttackDamage` and `useRetaliationDamage` from Character/Enemy interfaces
   - These flags were never actually checked in the combat code

## Key Files to Know

| File | Purpose |
|------|---------|
| `src/types/game.ts` | All TypeScript interfaces - start here for data structures |
| `src/engine/actions.ts` | Movement, combat, spell execution logic |
| `src/engine/simulation.ts` | Turn execution, game state initialization |
| `src/components/game/AnimatedGameBoard.tsx` | Canvas rendering of the game |
| `src/components/editor/MapEditor.tsx` | Puzzle level designer |
| `src/utils/assetStorage.ts` | localStorage CRUD operations |

## Constants & Magic Numbers

- `TILE_SIZE = 48` pixels
- `BORDER_SIZE = 48` pixels (top/bottom)
- `SIDE_BORDER_SIZE = 24` pixels (left/right)
- `ANIMATION_DURATION = 400ms` per turn
- `MOVE_DURATION = 280ms` (70% of turn)
- `IDLE_DURATION = 120ms` (30% of turn)
- `DEATH_ANIMATION_DURATION = 500ms`

## Running the Project

```bash
cd puzzle-game
npm install
npm run dev     # Development server
npm run build   # Production build
```

## Known Patterns

1. **Custom assets stored in localStorage** with prefixes:
   - `puzzleSkins_`
   - `customCharacters_`
   - `customEnemies_`
   - `customTileTypes_`
   - `spellLibrary_`

2. **Canvas rendering** uses `requestAnimationFrame` loop in AnimatedGameBoard

3. **Direction system**: 8 directions - `north`, `northeast`, `east`, `southeast`, `south`, `southwest`, `west`, `northwest`

4. **Sprite direction mapping**: `default`, `north`, `northeast`, `east`, `southeast`, `south`, `southwest`, `west`, `northwest` (default is fallback)

## Potential Future Work

- Collectible Editor (currently placeholder)
- Puzzle sharing/import/export
- Sound effects
- More spell effects
- Tutorial system
- Level progression

## Important Notes

- Death animations stay on final frame (no separate corpse sprite)
- Teleport tiles are bidirectional and grouped by letter (A↔A, B↔B, etc.)
- `behavesLikeWall` triggers IF_WALL reactions; `blocksMovement` just stops movement silently
- Ghost mode (`canOverlapEntities`) is bidirectional - if either entity has it, they can overlap
