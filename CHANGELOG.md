# Puzzle Game - Changelog

## Recent Changes (January 2026)

### ✨ Puzzle Skins System

**Added complete visual theming system for puzzles:**

- **Skin Editor** in Asset Manager with 18 border sprite slots
- **Border sprites**: walls (front, top, side, bottom), corners (full and thin variants)
- **Tile sprites**: floor, wall, and goal tile customization
- **Smart borders**: Automatically adapts to irregular puzzle shapes with void tiles
- **Thin corner variants**: Separate sprites for interior voids (24x24) vs perimeter (24x48)
- **Skin selection** in Map Editor puzzle settings
- **Play mode support**: Tile sprites now render during gameplay

**Technical Details:**
- `PuzzleSkin` interface with `borderSprites` and `tileSprites`
- `skinId` reference on puzzles (replaces legacy `borderConfig`)
- Image caching for performance
- Fallback to default visuals when sprites not provided

---

### ✨ Parallel With Previous Execution Mode

**Added `parallel_with_previous` execution mode for backward-looking parallel actions:**

- New execution mode: `"executionMode": "parallel_with_previous"`
- Actions marked with this execute **alongside the previous action** (backward-looking)
- Complements existing `"parallel"` mode (forward-looking)
- Perfect for combining movement with spells: move+cast on same turn

**Example Use Case:**
```json
{
  "behavior": [
    { "type": "MOVE_FORWARD" },
    { "type": "WAIT" },
    { "type": "CUSTOM_SPELL", "executionMode": "parallel_with_previous", "customSpellId": "fireball" },
    { "type": "REPEAT" }
  ]
}
```
This creates the pattern: Move → Wait+Spell → Move → Wait+Spell

**How It Works:**
- Forward-looking `"parallel"`: Executes WITH the next sequential action
- Backward-looking `"parallel_with_previous"`: Executes WITH the previous action
- Multiple `parallel_with_previous` actions can chain together
- Both characters and enemies support this mode

**Files Modified:**
- `src/types/game.ts` - Added `parallel_with_previous` to ExecutionMode type
- `src/engine/simulation.ts` - Updated execution logic for both characters and enemies

---

### ✨ Dungeon-Style Board Borders

**Added decorative borders around the game board with top-down dungeon aesthetic:**

- Configurable border styles per puzzle (none, dungeon, castle, forest, custom)
- **Dungeon style** features:
  - Top wall with depth illusion (front-facing stone with highlights and shadows)
  - Bottom wall (simpler back wall with visible top edge)
  - Side walls showing depth perspective
  - Dark corners creating 3D room effect
  - Stone texture using layered rectangles
- Grid automatically offset when borders are enabled
- Click detection adjusted for border offset
- Architecture supports custom border sprites (future feature)

**Technical Implementation:**
- Added `BorderConfig` and `BorderStyle` types to puzzle definition
- Added `BORDER_SIZE` constant (48px)
- Canvas size automatically expands when borders enabled
- `drawBorder()` function with style-specific rendering
- `drawDungeonBorder()` creates layered stone wall effect
- Context translation for grid offset
- Placeholder for `drawCustomBorder()` with uploaded sprites

**Files Modified:**
- `src/types/game.ts` - Added BorderConfig interface and BorderStyle type
- `src/components/game/AnimatedGameBoard.tsx` - Border rendering system
- `src/data/puzzles/test-puzzle-01.json` - Enabled dungeon borders for testing

**Future Enhancement:**
- Custom border sprite upload (8 sections: top, bottom, left, right, 4 corners)
- Additional preset styles (castle, forest, etc.)
- Border editor in Map Editor

---

### ✨ PNG/GIF Upload for Spell Visual Effects

**Added custom image upload support for spell projectiles and damage effects:**

- Toggle between "Basic Shape" (geometric shapes) and "Custom Image" (uploaded PNG/GIF)
- File upload with real-time preview in spell builder
- Supports both PNG and GIF formats (including animated GIFs)
- Base64 encoding for localStorage persistence
- Images render in-game replacing the basic geometric shapes
- Automatic sizing and centering of custom sprites

**UI Features:**
- Mode toggle buttons for Projectile and Damage Effect sections
- File input with styled upload button
- Image preview with pixelated rendering class
- Seamless switching between shape and image modes

**Technical Implementation:**
- Extended `drawShape()` function to accept optional `imageData` parameter
- Image rendering using HTML5 Canvas `drawImage()` API
- FileReader API for Base64 encoding on upload
- Images stored in `spriteData.idleImageData` field
- Backward compatible with existing shape-based system

**Files Modified:**
- `src/components/editor/SpellAssetBuilder.tsx` - Added image upload UI
- `src/components/game/AnimatedGameBoard.tsx` - Updated rendering to support images

---

### ✨ Smooth Character Movement - Animation Improvements

**Updated animation system to create more natural-looking movement:**

- Characters now spend 50% of time idle on their current tile before moving
- Movement occurs during the second 50% of the turn duration (300ms idle + 300ms travel)
- Properly triggers idle vs moving sprite states:
  - First 300ms: Idle sprite shown while character is stationary
  - Second 300ms: Moving sprite shown during travel animation
- Applies to both characters and enemies
- Creates a more deliberate, strategic feel to the turn-based gameplay

**Technical Implementation:**
- Added `IDLE_DURATION` and `MOVE_DURATION` constants (300ms each)
- Modified animation loop to check elapsed time and switch between idle and movement phases
- Updated `drawEnemy()` to accept optional render positions for smooth interpolation
- Maintains existing easeInOutQuad easing for smooth motion during travel phase

**Files Modified:**
- `src/components/game/AnimatedGameBoard.tsx` - Updated character and enemy rendering logic

---

### ✨ Spell Asset System - Complete Overhaul

Implemented a comprehensive spell/attack system with reusable assets, replacing the old embedded attack system.

#### Core Features

**1. Spell Library System**
- Standalone spell assets stored in localStorage
- Full CRUD operations (Create, Read, Update, Delete)
- Search and filter functionality
- Duplicate spell functionality for quick iteration
- Thumbnail icon support (image upload)

**2. Spell Templates**
- **Melee**: Adjacent tile attacks
- **Range Linear**: Physical projectiles in straight lines
- **Magic Linear**: Magic projectiles (can have different visuals)
- **AOE (Area of Effect)**: Radius-based attacks

**3. Direction System**
Four direction modes available:

- **Current Facing**: Spell fires in caster's current facing direction
- **Fixed**: Spell always fires in specified absolute directions (e.g., always North)
- **All Directions**: Spell fires in all 8 directions simultaneously (360°)
- **Relative** ⭐ NEW: Spell fires in directions relative to caster's facing
  - Example: "Right" always fires to the caster's right, regardless of which way they're facing
  - 8 relative directions: Forward, Backward, Left, Right, Forward-Left, Forward-Right, Backward-Left, Backward-Right
  - Automatically adjusts when character turns

**4. Direction Override System**
- Character/enemy actions can override spell's default directions
- Two override modes:
  - **Absolute Override**: Override with specific compass directions
  - **Relative Override** ⭐ NEW: Override with relative directions
- Toggle between modes with button UI
- Allows same spell to be used differently by different characters

**5. Execution Modes**
Two execution modes for spell actions:

- **Sequential**: Spell waits its turn in the action queue (turn-based)
- **Parallel**: Spell runs independently on its own timer (real-time)

**6. Parallel Action Triggers**
For parallel spells:
- **Interval**: Execute every X milliseconds (e.g., fire every 600ms)
- **On Event**: Execute when specific game events occur (placeholder for future)

**7. Visual Effects System** ⭐ NEW
- Configurable projectile appearance:
  - Shape selection: Circle, Square, Triangle, Star, Diamond
  - Color picker for custom colors
  - Outer glow and inner core rendering
- Configurable damage effect appearance:
  - Shape selection: Circle, Square, Triangle, Star, Diamond
  - Color picker for custom colors
  - Expanding animation on impact
  - Fade-out effect
- Real-time preview in game
- Each spell can have unique visual identity

**8. Combat Features**
- Configurable damage values
- Projectile settings:
  - Speed (tiles per second)
  - Range (max tiles)
  - Pierce behavior (continue through enemies or stop)
- AOE radius configuration
- Team-based collision detection (no friendly fire)

#### Technical Implementation

**Files Created:**
- `src/components/editor/SpellAssetBuilder.tsx` - Spell creation/editing UI
- `src/components/editor/SpellLibrary.tsx` - Spell library browser
- `src/components/editor/SpellPicker.tsx` - Spell selection modal

**Files Modified:**
- `src/types/game.ts` - Added SpellAsset, SpellTemplate, DirectionMode, RelativeDirection types
- `src/utils/assetStorage.ts` - Added spell storage functions
- `src/engine/actions.ts` - Added spell execution logic and relative direction conversion
- `src/engine/simulation.ts` - Added parallel action execution system
- `src/components/game/AnimatedGameBoard.tsx` - Integrated parallel action execution + visual effects rendering
- `src/components/editor/CharacterEditor.tsx` - Added SPELL action UI with override controls
- `src/components/editor/EnemyEditor.tsx` - Added SPELL action UI with override controls
- `src/components/editor/AssetManager.tsx` - Added "Spells" tab

**Key Algorithms:**
- `relativeToAbsolute()`: Converts relative directions to absolute based on current facing using angle-based math
- `executeParallelActions()`: Runs parallel actions at 60fps independent of turn-based system
- `executeSpell()`: Determines cast directions and executes spell for each direction
- `drawShape()`: Renders projectiles and particles with configured shapes (circle, square, triangle, star, diamond)
- `drawStar()`: Helper function to draw 5-pointed star shapes
- Team-based projectile collision detection

#### Bug Fixes

**1. Enemy Self-Damage Bug**
- **Problem**: Enemies were killing themselves with their own spells
- **Fix**: Modified projectile spawning to detect source type (enemy vs character) and set correct `sourceEnemyId` or `sourceCharacterId`
- **Result**: Projectiles now only hit opposing team (characters hit enemies, enemies hit characters)

**2. Movement Stuttering with Parallel Spells**
- **Problem**: Character moved 2 tiles, paused, moved 2 tiles, paused repeatedly
- **Fix**: Changed parallel action skipping in `executeTurn()` from `continue` to `while` loop
- **Result**: Parallel actions no longer consume sequential turn slots

**3. Action Reorganization**
- Added up/down arrow buttons to reorder actions in character/enemy behavior
- Actions can now be moved up or down in the execution queue

#### UI Improvements

**Spell Asset Builder:**
- Template type selector with descriptions
- Direction mode dropdown with explanations
- 8-directional selection grids (both absolute and relative)
- Conditional fields based on template (range for projectiles, radius for AOE)
- Visual effects configuration:
  - Shape pickers for projectiles and damage effects
  - Color pickers with real-time preview
  - 5 shape options: Circle, Square, Triangle, Star, Diamond
- Validation to ensure required fields are filled
- Visual feedback for selected directions
- Informational tooltips and examples

**Character/Enemy Editors:**
- Spell action configuration section
- Execution mode selector (Sequential/Parallel)
- Trigger configuration for parallel spells
- Direction override section with Absolute/Relative toggle
- 8-directional grid selector for both modes
- Spell picker modal integration
- "Change Spell" button to swap spells easily

**Spell Library:**
- Grid view of all spells with thumbnails
- Search by name or description
- Spell stat display (damage, range, speed, etc.)
- Direction mode display
- Edit/Duplicate/Delete buttons
- Empty state with call-to-action

**Spell Picker:**
- Modal overlay for spell selection
- Search functionality
- Spell details display
- Visual feedback on hover
- Cancel button

---

## Upcoming Features

### 🧱 Custom Tile Types (Next Up)
- Tile type editor with behavior configuration
- Behavior types: damage, teleport, direction change, ice/slip, pressure plates
- Default sprites per tile type
- Integration with Skins for visual overrides

### 🎨 Enhanced Visual Effects (Planned)
- Per-direction projectile sprites
- Cast effect sprites
- Visual effect preview in builder

### 🔊 Sound Effects System (Planned)
- Sound effect triggers:
  - Character/enemy death
  - Spell casting
  - Spell impact
  - Collectible pickup
  - Victory/defeat
- Audio library management
- Volume controls

### ✅ Recently Fixed
- Wall lookahead bug (fixed)
- Event-based triggers for parallel actions (implemented)
- Spell visual effects (basic shapes/colors + PNG/GIF upload)

---

## Development Notes

### Architecture Decisions

**Asset-First Design:**
- Spells are standalone, reusable assets
- Characters/enemies reference spells by ID
- Promotes reusability and consistency
- Similar to how WoW manages spells in a spellbook

**Dual Execution Model:**
- Sequential actions use traditional turn-based system
- Parallel actions use time-based system checked every frame
- Allows for both strategic turn-based gameplay and dynamic real-time effects

**Relative Direction System:**
- Uses angle-based math (0°=North, 45°=Northeast, etc.)
- Converts relative directions to absolute at execution time
- Automatically adapts to character rotation

**Team-Based Collision:**
- Prevents friendly fire
- Characters can only damage enemies
- Enemies can only damage characters
- Self-damage is impossible

### Performance Considerations
- Parallel actions checked at 60fps but only execute based on trigger conditions
- Projectile collision uses simple distance checks
- LocalStorage used for persistence (client-side only)
- Spell library searches run in-memory (no backend queries)

---

## Migration Notes

### Deprecated Systems
- Old attack actions (ATTACK_FORWARD, ATTACK_RANGE, ATTACK_AOE, CUSTOM_ATTACK) are filtered out of UI
- Use SPELL action instead for all combat
- Old attack data structures still supported for backward compatibility

### Breaking Changes
- None - old puzzles continue to work
- New puzzles should use SPELL system
