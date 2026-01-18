# Player App - Vision & Architecture

## Overview

**Two separate applications:**

1. **Developer App** (current) - Full-featured editor for creating puzzles, characters, enemies, spells, tiles, etc. Used by puzzle creators.

2. **Player App** (planned) - Streamlined game experience. Daily puzzles, progress tracking, archive access. No editing features.

---

## Player App Features

### Core Experience

- **Daily Puzzle** - One new puzzle each day (like Wordle)
- **Limited Attempts** - Progress saved to device, no unlimited retries
- **Archive Access** (paid) - Play previous days' puzzles
- **Leaderboards** (future) - Compare scores/times

### Pages

1. **Today's Puzzle** - Main game page (based on current Game.tsx)
2. **Archive** - Browse/play past puzzles (requires unlock)
3. **Stats/Profile** - Track streak, scores, history
4. **Settings** - Sound, preferences

### What Player App Does NOT Have

- Map Editor
- Asset Manager (Characters, Enemies, Spells, Tiles, etc.)
- Cloud Sync panel
- Playtest mode
- Any creation/editing tools

---

## Asset Publication Tiers

### Tier 1: Draft (Dev Only)

- Stored in `assets_draft` and `puzzles_draft` tables
- Only visible in Developer App
- Used for work-in-progress content
- Current cloud sync already uses these tables

### Tier 2: Live (Player Facing)

- Stored in `assets_live` and `puzzles_live` tables
- Visible to Player App
- Published/promoted from Draft
- Immutable once published (or versioned)

### Publication Flow

```
Developer App                          Player App
─────────────                          ──────────

[Create Asset] ──> assets_draft
       │
       ▼
[Test in Playtest]
       │
       ▼
[Promote to Live] ──> assets_live ──> [Fetch on demand]
       │
       ▼
[Schedule Puzzle] ──> daily_schedule ──> [Today's Puzzle]
```

### Database Tables

**Existing (Draft tier):**
- `assets_draft` - All asset types (characters, enemies, spells, tiles, etc.)
- `puzzles_draft` - Work-in-progress puzzles

**New (Live tier):**
- `assets_live` - Published assets for player app
- `puzzles_live` - Published puzzles for player app
- `daily_schedule` - Puzzle queue (puzzle_id, scheduled_date)

**Shared (Both tiers):**
- `help_content` - Help tooltips, tutorials (same for both apps)
- `ui_assets` - UI elements, sounds (same for both apps)
- `global_config` - Sound config, settings (same for both apps)

---

## Daily Puzzle System

### Scheduling

```typescript
// daily_schedule table
{
  id: string;
  puzzle_id: string;        // References puzzles_live
  scheduled_date: string;   // "2026-01-20"
  published_at: string;     // When it was queued
}
```

### Admin Interface (in Developer App)

- Calendar view of scheduled puzzles
- Drag-drop to assign puzzles to dates
- Preview scheduled puzzle
- Gap detection (days without puzzles)
- Bulk scheduling

### Player App Flow

```
1. App opens
2. Fetch today's date
3. Query: SELECT puzzle_id FROM daily_schedule WHERE scheduled_date = today
4. Fetch puzzle + required assets from live tables
5. Check local storage for existing progress
6. Resume or start fresh
```

---

## Progress & Attempts

### Lives System

Each puzzle has a configured number of lives (set by puzzle creator). Players can:
- **Keep trying** until they win OR run out of lives
- **Win** = Puzzle complete, score recorded, streak continues
- **Lose all lives** = Puzzle failed for the day, streak broken

### Local Storage (Player Device)

```typescript
interface PuzzleProgress {
  puzzleId: string;
  date: string;              // "2026-01-20"
  livesRemaining: number;    // Lives left for this puzzle
  maxLives: number;          // Starting lives for this puzzle
  completed: boolean;
  failed: boolean;           // True if lost all lives
  score?: number;
  rank?: 'gold' | 'silver' | 'bronze';
  turnsUsed?: number;
  charactersUsed?: number;
  completedAt?: string;

  // For resuming mid-puzzle
  gameState?: GameState;     // Serialized state
}

interface PlayerStats {
  currentStreak: number;
  longestStreak: number;
  totalCompleted: number;
  totalFailed: number;
  averageScore: number;
  history: PuzzleProgress[];
}
```

### Daily vs Archive Rules

- **Daily Puzzle (Free)**: Limited lives per puzzle, one chance per day
- **Archive Puzzles (Paid)**: Unlimited replays, chase high scores

---

## Monetization

### Free Tier

- Daily puzzle (today only)
- Basic stats (current streak)
- Limited history view
- Progress stored locally only

### Paid Tier - One-Time Purchase (Archive Access)

- **All previous puzzles** playable with unlimited replays
- **Full history and stats**
- **Cloud sync** - Progress saved to account, accessible on any device
- **Score chasing** - Replay to improve scores/ranks
- No ads (if ads are added to free tier later)

### Account System

- **Free users**: No account needed, local storage only
- **Paid users**: Account required for purchase + cloud sync
- Simple auth (email/password, or OAuth with Google/Apple)

---

## Developer App Changes Needed

### 1. Promote to Live Feature

**UI:** Button on puzzle/asset detail view: "Publish to Live"

**Flow:**
1. Validate asset is complete (required fields, sprites, etc.)
2. Copy from `*_draft` to `*_live` table
3. Mark as published (timestamp, version)
4. Cannot edit live version (must create new draft, re-publish)

### 2. Puzzle Scheduler

**UI:** New tab/page in Developer App

**Features:**
- Calendar grid showing scheduled puzzles
- List of published (live) puzzles available to schedule
- Drag puzzle onto calendar date
- Visual indicators for gaps, conflicts
- Preview puzzle from calendar

### 3. Live vs Draft Toggle

**UI:** Filter/toggle in asset browsers

- "Show Draft Only" (default for editing)
- "Show Live Only" (for reference)
- "Show All"

Visual badge on assets indicating status (Draft/Live)

---

## Technical Implementation Plan

### Phase 1: Database Schema

```sql
-- Live assets table (mirrors assets_draft structure)
CREATE TABLE assets_live (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  published_from UUID REFERENCES assets_draft(id),
  version INTEGER DEFAULT 1
);

-- Live puzzles table
CREATE TABLE puzzles_live (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  published_from UUID REFERENCES puzzles_draft(id),
  version INTEGER DEFAULT 1
);

-- Daily schedule
CREATE TABLE daily_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id UUID REFERENCES puzzles_live(id) NOT NULL,
  scheduled_date DATE NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Phase 2: Developer App - Publish Feature

- Add "Publish to Live" button
- Implement copy logic (draft → live)
- Add status badges to asset lists
- Prevent editing of live assets

### Phase 3: Developer App - Scheduler

- Build calendar UI component
- Implement drag-drop scheduling
- Add gap/conflict detection
- Preview functionality

### Phase 4: Player App - Core

- New React app (or route split from current app)
- Fetch today's puzzle from `daily_schedule` + `puzzles_live`
- Fetch required assets from `assets_live`
- Game page (stripped down Game.tsx)
- Local progress storage

### Phase 5: Player App - Archive

- Archive browser page
- Payment/unlock integration
- Puzzle list with completion status

### Phase 6: Polish

- Stats/profile page
- Streak tracking
- Social sharing
- Push notifications (optional)

---

## Hints System (Planned)

### Possible Hint Types

1. **Character Hint** - "Try using the Wizard for this puzzle"
2. **Placement Hint** - Highlight a tile where a character should go
3. **Strategy Hint** - "Focus on the enemies in the corner first"
4. **Full Solution** - Show the optimal solution (nuclear option)

### Hint Economy Options

- **Free limited hints** - X hints per day/week
- **Earned hints** - Earn hints by maintaining streaks
- **Paid hints** - Part of premium tier or separate purchase
- **Watch ad for hint** - Free tier monetization

*TBD: Which approach fits best with the game's feel*

---

## Post-Game Analysis ("Wizard's Score Analysis")

Inspired by Wordle's shareable results, show players an analysis of their play:

### Analysis Components

```
╔══════════════════════════════════════╗
║     🧙 Wizard's Score Analysis 🧙      ║
╠══════════════════════════════════════╣
║  Puzzle #42 - "The Frozen Throne"    ║
║  ⭐⭐⭐ GOLD TROPHY                   ║
╠══════════════════════════════════════╣
║  Characters: 2/4 (Par: 3) ✓          ║
║  Turns: 8 (Par: 12) ✓                ║
║  Lives Used: 1/3                     ║
║  Side Quests: 2/2 ✓                  ║
╠══════════════════════════════════════╣
║  📊 Performance Breakdown:           ║
║  ████████░░ Efficiency: 80%          ║
║  ██████████ Character Choice: 100%   ║
║  ███████░░░ Speed: 70%               ║
╠══════════════════════════════════════╣
║  🔥 Current Streak: 15 days          ║
║  🏆 Best Streak: 23 days             ║
╚══════════════════════════════════════╝
```

### Shareable Format

Generate a text/image that can be shared on social media:

```
Puzzle Daily #42 🧙
⭐⭐⭐ Gold
👤👤⬜⬜ Characters
🔄🔄🔄🔄🔄🔄🔄🔄 Turns
❤️❤️🖤 Lives
🔥 15 day streak
```

### Metrics to Track

- **Efficiency Score** - How close to par (characters + turns)
- **Survival Score** - Lives remaining vs lives used
- **Completionist Score** - Side quests completed
- **Speed Score** - Real-time solving speed (optional)
- **Consistency** - Streak length, completion rate

---

## Open Questions

### Resolved ✓

1. ~~**Attempt Limits**~~ → Lives system per puzzle, play until win or out of lives
2. ~~**Monetization Model**~~ → One-time purchase for archive access (TBD final)
3. ~~**Progress Sync**~~ → Local only for free, cloud sync for paid users
4. ~~**Versioning**~~ → Use new/updated sprites (assets update globally)

### Still Open

1. **Beta/Preview**: Should there be a way to preview tomorrow's puzzle?

2. **Difficulty Curve**: How to ensure daily puzzles have appropriate difficulty progression?
   - Manual curation?
   - Difficulty rating system?
   - Weekday = easy, weekend = hard?

3. **Hints Implementation**: Which hint types? How are they earned/purchased?

4. **Social Features**:
   - Shareable results (like Wordle)?
   - Leaderboards (global, friends)?
   - Compare scores with friends?

5. **Notifications**: Push notifications for daily puzzle? Streak reminders?

---

## Summary

### Two-App Architecture

| | Developer App | Player App |
|---|---|---|
| **Purpose** | Create puzzles & assets | Play daily puzzles |
| **Features** | Full editor suite | Game only |
| **Data Source** | Draft tables | Live tables |
| **Users** | Puzzle creators | Players |

### Content Pipeline

```
Create (Draft) → Test (Playtest) → Publish (Live) → Schedule (Daily)
```

### Key Decisions

| Decision | Choice |
|----------|--------|
| Lives/Attempts | Per-puzzle lives, play until win or fail |
| Monetization | One-time purchase for archive access |
| Progress Sync | Local (free) / Cloud (paid) |
| Asset Updates | Use latest version globally |
| Hints | TBD - exploring options |
| Analysis | "Wizard's Score Analysis" with shareable results |

### Database Structure

- **Draft tables** (`assets_draft`, `puzzles_draft`) - Development work
- **Live tables** (`assets_live`, `puzzles_live`) - Published content
- **Shared tables** (help, UI, sounds, config) - Same for both apps
- **Schedule table** (`daily_schedule`) - Puzzle queue by date

### Player Experience

1. Open app → Fetch today's puzzle
2. Play with limited lives
3. Win → Score recorded, streak continues
4. Lose all lives → Failed for the day
5. See "Wizard's Score Analysis"
6. Share results (optional)
7. Pay for archive → Replay any puzzle, chase high scores
