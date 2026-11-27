# Early ideas we may have forgotten (January 2026)

> **This is not a roadmap and not a backlog.** Nothing here is planned,
> approved or promised. These are ideas from the planning papers written in
> the first days of the project (2026-01-01 to 2026-01-04), before most of the
> game existed, much of it early brainstorming. They were collected here on
> 2026-11-27 so the papers could be archived without losing anything.
>
> Things the owner intends to build live in `feature-backlog.md` and the
> approved roadmap. **Do not start work from this file, and do not cite it as
> something the owner asked for.** If an idea here is wanted, the owner moves
> it to the backlog; until then it is only a reminder that the thought once
> existed.

Each item was checked on 2026-11-27 against `feature-backlog.md`,
`PLAYER_APP_VISION.md` and the handoff, by searching for its terms, and not
found there. An idea recorded in different words could have been missed.

The papers themselves are in `archive-2026-01/` beside this repository.
They describe a game that was never built that way (a rendering library the
app does not use, attacks by walking into enemies, an attack-damage stat), so
read the ideas below, not the papers, for anything about how the game works.

## Hero concepts

From `example-characters.md`: twenty concepts, written before spells existed.
"Attack" meant a built-in strike; today each would be a spell.

Could probably be built with today's actions and spells (not tested):

1. **Archer**: ranged attack 3 tiles forward, turn right, repeat.
2. **Rogue**: move, move, attack forward, turn around, move, turn around. Hit and run.
3. **Tank** (3 HP): attack forward, left, right and backward (a "+"), move forward, turn left at a wall.
4. **Bishop**: move diagonally, attack diagonally, turn right at an obstacle.
5. **Wizard**: never moves; waits, then attacks forward, right, backward, left in turn. A turret.
6. **Assassin**: teleport 2 tiles forward, attack forward, wait, repeat.
7. **Berserker**: move and attack forward until a wall, then turn around. A corridor sweeper.
8. **Necromancer**: wait, wait, summon a skeleton forward that walks and attacks, repeat.
9. **Chess Knight**: forward twice, right once (an L), attack, turn right, repeat.
10. **Queen**: move-and-attack three times, then turn 45 degrees twice.
11. **Scout**: 3 forward without attacking, turn around, 3 back. Made for pressing plates and switches.
12. **Monk**: walks a square (move, turn right, four times). A zone patrol.
13. **Heavy Knight** (2 HP, hits for 2): the knight's loop; kills a 2-HP enemy in one hit and survives one.
14. **Glass Cannon** (1 HP, hits for 3): ranged attack 2 tiles, move backward, turn right.
15. **Bomber**: move forward three times, 3x3 explosion, removes itself. A single-use hero.
16. **Guardian**: never moves; raises a barrier on the tile in front so enemies cannot pass.

Would need a mechanic the game does not have:

17. **Paladin**: move, attack; if the attack killed, move again, otherwise turn right. There is no "on kill" trigger.
18. **Mimic**: copies the movement of the last hero placed, but attacks backward.
19. **Jester**: moves in a "random" direction seeded by its starting tile. This runs against the game's no-randomness rule.

The same paper suggested launching with 12 to 15 simple or intermediate heroes
and adding advanced ones later, in three tiers: simple (a loop of 3-4
actions), medium (6-8 actions with conditions), advanced (summoning, copying).

## Puzzle themes

From `sample-puzzles.md`. Keep these as themes only: the papers' grid drawings
do not match their own enemy counts and none was ever played.

1. **First Steps** (5x5, 2 enemies, one hero): the knight's wall-turn carries it round the edge to both. Teaches walls. (The built-in test puzzle already uses this name.)
2. **The Hallway** (a walled corridor, 4 enemies): the obvious answer uses two heroes; the best is one archer that turns on the spot. Teaches ranged attacks.
3. **The Cross** (7x7, an enemy at the middle of each edge): one stationary wizard in the centre clears all four. Teaches positioning.
4. **The Spiral** (a ring corridor full of enemies round a walled core): the tank's "+" attack clears several per step. Teaches area attacks.
5. **Collect & Conquer** (8x8, a walled inner room, enemies and coins): ignoring the coins is easy; taking all of them needs the diagonal mover. Teaches risk and reward.
6. **The Gauntlet** (a long corridor, enemies patrolling back and forth): a charge has to be timed against where the enemies will be. Teaches timing.
7. **Chess Master** (8x8, enemies on a checker pattern): a hidden one-hero answer using the L-shaped knight.
8. **The Labyrinth** (10x10 maze, enemies in dead ends): several heroes working together, more than one valid answer.

**A difficulty ramp for the daily:** days 1-7 tutorial and easy, 1-2 heroes,
introducing the first three heroes; days 8-14 medium, 2-3 heroes, collectibles
and more than one answer; days 15-21 medium-hard, moving enemies and timing;
from day 22 a rotation of easy, medium and hard with "special weekend
challenges".

**Design principles the paper proposed:**

- Every puzzle has an obvious answer with 4-5 heroes and a hidden, clever one with 1-2.
- Each puzzle shows off one or two hero abilities.
- The best answer should be an "aha".
- The layout should read at a glance.
- Knowing the answer should not spoil the satisfaction.

**Occasions:** boss puzzles as a monthly special; survival against waves that
spawn during the run.

## Mechanics

- **One-way walls**: a tile that can be crossed from one direction only, with the open question of whether it shows an arrow. (`PROJECT_VISION.md`)
- **Several sprite variants for one tile type**, the map editor choosing the variant per tile, so three wall sprites could vary a wall. (`PROJECT_VISION.md`)
- **A score-threshold objective**: win by reaching a minimum score. (`PROJECT_VISION.md`)
- **Swap places**: two units that collide swap tiles; and a priority order where the higher-priority unit pushes the other aside. (`CHARACTER_COLLISION_BEHAVIOR.md`)
- **Invisible enemy walls**: enemies turn back at them, the player never sees them. (`FEATURE_ROADMAP.md`)
- **Waypoint patrols**: an enemy walks a list of waypoints, looping or one-way, drawn in the map editor. (`FEATURE_ROADMAP.md`)
- **Fog of war and line of sight.** (`DEVELOPMENT_ROADMAP.md`)
- **An action queue on screen**: each hero's next 3 to 5 actions shown. (`DEVELOPMENT_ROADMAP.md`)
- **Spell ideas**: chain lightning, a mana or resource cost, spell combos, charged spells. (`DEVELOPMENT_PLAN_2026.md`)
- **Moving platforms.** (`DEVELOPMENT_PLAN_2026.md`)

## Tools and community

- Map editor: a symmetry mode, copy and paste of a section of map, a flood-fill tool. (`CURRENT_STATUS_AND_TODO.md`, which itself says these were not requested.)
- Share a puzzle by a short code in the URL. (same)
- Ratings and comments on puzzles; racing another player through a puzzle. (`DEVELOPMENT_ROADMAP.md`)

## Numbers the papers proposed

- Hero mix: about 80% at 1 HP dealing 1, 10% tanks, 5% heavy hitters, 5% glass cannons. Enemies: the first ten puzzles about 90% at 1 HP, puzzles 11-30 about 70/30, mixed with bosses after that. (`combat-mechanics.md`)
- The daily offers 5 heroes from a roster of about 30. (`game-design-doc.md`)

## Two things the owner had already decided then

Recorded in `PROJECT_VISION.md` as the owner's words at the time, kept here
because they are decisions, not ideas:

- No "speed tiles" ("user didn't like the idea").
- Leaderboards "not important". `PLAYER_APP_VISION.md` still lists leaderboards as a future possibility and an open question, so the two disagree; the owner's current view is not recorded here.

## Left out on purpose

Map templates and a ghost preview before placing a hero both appear in the
old papers. The owner has since turned both down, so they are not listed above.
