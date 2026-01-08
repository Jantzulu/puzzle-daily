# Puzzle Game - Claude Handoff Document

## Project Overview

**Puzzle Daily** is a turn-based puzzle game built with React, TypeScript, and Vite. Players place characters on a grid, define their behavior patterns, and watch them automatically solve puzzles. The project includes comprehensive asset management systems for characters, enemies, spells, puzzle skins, and tile types.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Tailwind CSS 3, Canvas-based rendering
**Status:** Active Development (January 2026)

---

## Quick Start

```bash
cd puzzle-game
npm install
npm run dev     # Development server with HMR
npm run build   # Production build
```

---

## Directory Structure

```
puzzle-game/
├── src/
│   ├── types/
│   │   └── game.ts                 # Master type definitions (all interfaces/enums)
│   ├── engine/
│   │   ├── simulation.ts           # Turn-based game loop (600ms per turn)
│   │   ├── actions.ts              # Action execution logic
│   │   └── utils.ts                # Direction/math utilities
│   ├── components/
│   │   ├── game/
│   │   │   ├── Game.tsx            # Main play mode
│   │   │   ├── AnimatedGameBoard.tsx  # Canvas rendering engine (largest file)
│   │   │   ├── Controls.tsx        # Play/Pause/Reset UI
│   │   │   └── CharacterSelector.tsx
│   │   └── editor/
│   │       ├── AssetManager.tsx    # Hub for all asset editors
│   │       ├── CharacterEditor.tsx # Create/edit characters
│   │       ├── EnemyEditor.tsx     # Create/edit enemies
│   │       ├── SpellAssetBuilder.tsx  # Spell creation (50KB)
│   │       ├── MapEditor.tsx       # Puzzle editor (80KB)
│   │       ├── SpriteEditor.tsx    # Sprite creation (90KB)
│   │       ├── SkinEditor.tsx      # Puzzle skins
│   │       ├── TileTypeEditor.tsx  # Tile behaviors
│   │       └── ObjectEditor.tsx    # Static objects
│   ├── data/
│   │   ├── characters/             # Official characters (JSON)
│   │   ├── enemies/                # Official enemies (JSON)
│   │   └── puzzles/                # Official puzzles (JSON)
│   └── utils/
│       ├── assetStorage.ts         # LocalStorage persistence
│       └── puzzleStorage.ts        # Puzzle save/load
├── PROJECT_STATUS.md               # Detailed development status
└── CHANGELOG.md                    # Recent changes log
```

---

## Key Systems

### 1. Game Engine (`src/engine/`)

**simulation.ts** - Turn-based loop:
- `executeTurn()`: Process one turn for all entities
- `executeParallelActions()`: Run parallel spells on independent timers
- Turn interval: 600ms

**actions.ts** - Action dispatcher:
- Movement: MOVE_FORWARD, MOVE_BACKWARD, diagonals
- Rotation: TURN_LEFT, TURN_RIGHT, TURN_AROUND
- Combat: SPELL (spell system), CUSTOM_ATTACK (legacy)
- Conditional: IF_WALL, IF_ENEMY
- Special: WAIT, REPEAT, TELEPORT

**Movement Features:**
- 8-directional movement (N, NE, E, SE, S, SW, W, NW)
- Wall collision behaviors: stop, turn_left, turn_right, turn_around, continue
- Multi-tile movement per action

### 2. Rendering (`src/components/game/AnimatedGameBoard.tsx`)

**60fps canvas-based rendering:**
- Smooth character movement (280ms walking + 120ms idle)
- Projectile motion (time-based)
- Death animations (500ms)
- Ice slide animations (120ms per tile)
- Teleportation animations (300ms at destination)

**Sprite System:**
- Directional sprites (8 directions)
- Animation states: idle, moving, death, casting
- Sprite sheet support with frame configuration
- Shape-based fallbacks (circle, square, triangle, star, diamond)

**Visual Elements:**
- Tiles with custom skins
- Border sprites (18 slots for puzzle frames)
- Projectiles and particle effects
- Persistent area effects (fire, poison, etc.)

### 3. Spell System (`SpellAssetBuilder.tsx`)

**Templates:**
- Melee (single adjacent tile)
- Range Linear (projectile in straight line)
- Magic Linear (magical projectile)
- AOE (area of effect)

**Direction Modes:**
- `current_facing` - Use caster's facing direction
- `fixed` - Predefined directions
- `all_directions` - Fire in all 8 directions
- `relative` - Forward/backward relative to facing

**Features:**
- Auto-targeting nearest enemy
- Pierce through multiple targets
- Persistent ground effects (damage per turn)

### 4. Custom Tile Behaviors (`TileTypeEditor.tsx`)

**Behavior Types:**
- **Damage tiles**: Deal damage when stepped on
- **Teleport tiles**: Bidirectional linking via groupId, custom teleport sprites
- **Direction change**: Force entity facing
- **Ice/slippery**: Continue sliding in same direction
- **Pressure plates**: Toggle walls, spawn enemies

### 5. Asset Storage (`src/utils/assetStorage.ts`)

All custom assets persist to LocalStorage:
- Characters, Enemies, Spells
- Sprites (with directional variants)
- Puzzle Skins, Tile Types, Objects

---

## Recent Session Changes (January 2026)

### Teleport Sprite System

**Added custom "being teleported" sprite option for teleport tiles:**

1. **New Interface** (`src/types/game.ts`):
```typescript
export interface TeleportSpriteConfig {
  imageData: string;      // Base64 image data
  frameCount?: number;    // For spritesheets (default: 1)
  frameRate?: number;     // Frames per second (default: 10)
  loop?: boolean;         // Loop animation (default: true)
}
```

2. **Added to entities** (`game.ts`):
- `TileBehaviorConfig.teleportSprite` - Configure on tile
- `PlacedCharacter.teleportSprite` - Runtime state
- `PlacedEnemy.teleportSprite` - Runtime state

3. **Three-phase teleport animation** (`AnimatedGameBoard.tsx`):
- Phase 1: Walk to teleport tile with teleport sprite
- Phase 2: Show teleport sprite at destination (300ms)
- Phase 3: Show normal sprite

4. **Key Constants**:
```typescript
const TELEPORT_APPEAR_DURATION = 300; // ms to show teleport sprite at destination
```

5. **Files Modified**:
- `src/types/game.ts` - Added TeleportSpriteConfig, teleportSprite fields
- `src/engine/actions.ts` - Pass teleportSprite in processTeleportBehavior
- `src/engine/simulation.ts` - Copy teleport state to enemies, clear on turn start
- `src/components/editor/TileTypeEditor.tsx` - UI for teleport sprite upload
- `src/components/game/AnimatedGameBoard.tsx` - drawTeleportSprite function, 3-phase rendering

---

## Important Code Patterns

### Execution Modes

```typescript
// Sequential (default) - one action per turn
{ "type": "MOVE_FORWARD" }

// Parallel - runs alongside next action
{ "type": "SPELL", "spellId": "fireball", "executionMode": "parallel" }

// Parallel with previous - runs alongside previous action
{ "type": "SPELL", "spellId": "shield", "executionMode": "parallel_with_previous" }
```

### State Management

```typescript
// Immutable updates
setGameState((prevState) => {
  const newState = executeTurn({ ...prevState })
  return newState
})
```

### Animation Loop

```typescript
requestAnimationFrame(animate) {
  const progress = (now - actionStartTime) / ANIMATION_DURATION
  character.screenX = lerp(fromX, toX, progress)
  draw()
}
```

---

## Type Definitions Quick Reference

Key interfaces in `src/types/game.ts`:

- `Character` / `PlacedCharacter` - Player entities
- `Enemy` / `PlacedEnemy` - Enemy entities
- `GameState` - Full game state including grid, entities, projectiles
- `Puzzle` - Puzzle definition with tiles, enemies, win conditions
- `SpellAsset` - Reusable spell configuration
- `CustomSprite` - Sprite with directional variants and animation states
- `PuzzleSkin` - Border and tile sprites for puzzle theming
- `TileBehaviorConfig` - Custom tile behavior configuration
- `Projectile` - Active projectile in flight
- `ParticleEffect` - Visual effects (damage numbers, cast effects)

---

## Common Development Tasks

### Adding a New Action Type

1. Add to `ActionType` enum in `src/types/game.ts`
2. Add case in `executeAction()` in `src/engine/actions.ts`
3. Implement action logic
4. Update any relevant editors

### Adding a New Tile Behavior

1. Add to `TileBehaviorType` enum
2. Add config fields to `TileBehaviorConfig`
3. Implement in movement/collision logic
4. Add UI in TileTypeEditor

### Creating Custom Assets

1. Asset Manager → Select tab (Characters, Enemies, Spells, etc.)
2. Click "New" button
3. Configure settings
4. Save (persists to LocalStorage)

---

## Build Commands

```bash
npm run dev          # Development server (HMR)
npm run build        # Production build
npm run build:check  # Build with type checking
npm run lint         # ESLint
npm run preview      # Preview production build
```

---

## Git Workflow

- Main branch is production-ready
- Commit messages include emoji footer for Claude-generated commits
- No force pushing to main

---

## Known Areas for Improvement

1. **Sound system** - Not yet implemented
2. **Undo/Redo** - Not available in editors
3. **AI pathfinding** - Enemies use simple patterns only
4. **Multiplayer** - Single player only

---

## File Size Reference

| File | Size | Purpose |
|------|------|---------|
| SpriteEditor.tsx | 90KB | Sprite creation with animations |
| MapEditor.tsx | 80KB | Puzzle editor |
| SpellAssetBuilder.tsx | 50KB | Spell creation |
| AnimatedGameBoard.tsx | 40KB | Main rendering engine |
| game.ts | ~650 lines | All type definitions |

---

## Summary

This is a fully-featured puzzle game creation toolkit. The architecture emphasizes:

1. **Asset-first design** - All content is stored as reusable assets
2. **Dual execution model** - Sequential and parallel action modes
3. **60fps rendering** - Smooth canvas-based animations
4. **Full customization** - Characters, enemies, spells, tiles, skins all configurable

The project is active with all builds passing. Custom content persists to LocalStorage.
