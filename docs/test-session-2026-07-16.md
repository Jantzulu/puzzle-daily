# Test Session Checklist — everything shipped 2026-07-16

24 commits (`06882ee` → `7a3361f`), all pushed to main, 565 tests green.
Both sites deploy from main. Work through this top to bottom; anything
broken, note it and we fix next session.

---

## 1. Quick visual checks (play page, deployed, 2 min)

- [ ] **Loading screen**: hard-refresh a puzzle (or throttle network). The
  "Loading sprites..." text should sit on the PAGE BACKGROUND — no dark
  rectangle fill.
- [ ] **Intro animations**: after the loading text, the board fades in and
  you see enemy entrances (fly-ins, spawn sheets) FROM THE START — never
  already-in-progress. Also try switching puzzles (the case that used to
  silently skip entrances entirely).
- [ ] **Portcullis pace**: open/close the hamburger menu — statelier now
  (1.2s down, 1.0s up), gate and control rail still moving as one.
- [ ] **Quest (?) icon on your phone**: with a long quest, the (?) stays
  left of "Quest:" instead of floating on its own line.
- [ ] **Selection slide**: on a puzzle with 2+ heroes, tap between hero
  cards — the highlight tint and the caret should GLIDE to the new card
  (300ms), fade in from nothing, fade out on deselect. Same on the
  enemy/ally strips (ally caret is now copper, was blood-red).

## 2. Theme settings (2 min)

- [ ] **Modern Antiqua** appears in Body/Heading/Menu font pickers and
  renders.
- [ ] **Menu Font** (new slot next to Body/Heading Font): set it — the
  hamburger gate's steel-plate labels change; unset = Almendra as always.

## 3. Editor mobile (phone, 2 min)

- [ ] **Puzzle title** in the map editor toolbar is no longer clipped at
  the top (it was your theme's 40px heading font in a 28px line box).
- [ ] **Map/Pixel/Forge tabs** are compact on the phone.

## 4. Attack animation while moving (sprite editor + playtest)

- [ ] Pick an entity with a casting/attack sheet. In the sprite editor's
  Casting section (simple or directional), check **"⚔ Also play while
  moving"**. Playtest an attack that happens mid-move → attack animation
  plays instead of walking. Unchecked entities behave exactly as before.

## 5. Wind wall (spell builder + playtest)

Author: AOE spell, Persistent Duration ≥ 3, Damage Per Turn 0, and the new
**"Destroys Projectiles" = Hostile only**. Give it to a hero; enemy archer
across the map.

- [ ] Enemy bolts die where they enter the zone (visual stops AT the wall
  of wind, not beyond).
- [ ] Your own bolts fly THROUGH your hostile-only wall.
- [ ] Switch to **All** → your own bolts get eaten too.
- [ ] A homing enemy bolt is also screened — including when the zone sits
  on the target's own tile.
- [ ] Thrown items (THROW_PLACE) sail over any wall.
- [ ] Run the validator on a wind-wall puzzle — solver agrees with live
  play (parity is structural, but eyeball it).
- Known scope-outs: reflected return legs ignore walls; no dedicated
  kill VFX yet (bolt shrinks out).

## 6. Projectile linger (spell builder + playtest)

Author: LINEAR spell with **"Linger at End of Path" = 3ish**.

- [ ] A bolt that hits nothing rests on its final tile (projectile sprite
  lying there; amber glint if the spell has no sprite).
- [ ] First ENEMY to step on it takes the bolt's damage (+on-hit status)
  and the hazard is spent — the next walker crosses safely.
- [ ] Your own units walk over your bolt safely.
- [ ] A wall-stopped bolt lingers in front of the wall.
- [ ] A bolt that HITS someone leaves no hazard; a wind-wall kill leaves
  no hazard.
- [ ] After N turns the hazard expires quietly.

## 7. Hallways (map editor + play page)

The deployed **First Steps** test puzzle already has one hallway per side
plus doors, so the play page demos everything before you author anything.

- [ ] Play page: four wall openings — floor running through, jamb walls,
  far half dissolving to black with NO back wall (reads as continuing).
- [ ] Map editor: **Hallway tool** (tool #8 / hotkey 8). Click near a
  floor edge bordering void/outside → wall opens; same edge again →
  removed; interior edges → explanatory toast. Copper outlines while the
  tool is active. Undo/redo works. Save/load/export keeps them.
- [ ] Voids: hallways off void-adjacent edges work like outer edges.
- Known v1 limit: left/right corridors are shallower (16px band) than
  top/bottom (48px) — say the word if you want them deeper.

## 8. Doors (map editor + play page + skin editor)

- [ ] Play page (First Steps): top-center door SWINGS OPEN as the board
  reveals (currently a snap after ~450ms — no opening sheet in the
  default skin), revealing the corridor through it (phase 3). A closed
  plank door (procedural placeholder) sits on the bottom wall.
- [ ] Map editor: Hallway tool → **mode picker: Hallway / Door / Door +
  Hallway** + a "Door starts the puzzle…" select (closed / open /
  closed-then-opens / open-then-closes). Doors only accept top/bottom
  edges. "Both" places/clears the pair in one click. Doors show a copper
  outline + state letter (C / O / ▶ / ◀) while the tool is active.
- [ ] Replay/retry: the door theater replays when the board remounts,
  same cadence as spawn animations.

## 9. Skin editor — new slots (needs your art to fully exercise)

- [ ] Preview shows hallways on all four sides + two doors (one closed,
  one that plays its opening on load) even before you upload anything.
- [ ] **Hallway Top/Bottom (48x48), Hallway Left/Right (16x48)**: the
  corridor interior as one piece — draw it FULLY LIT; the game adds the
  darkness fade. Upload → preview updates live, highlight regions point
  at each opening.
- [ ] **Door Closed (48x48), Door Open (48x48), Door Opening (horizontal
  strip of square 48x48 frames)**: closing plays the strip reversed.
  Leave the doorway transparent in Door Open so hallways show through.

## 10. Regression spot-checks (5 min, because engine paths were touched)

- [ ] Plain projectile combat (hit, pierce, bounce, reflect) — the
  walkers grew a zone check; corpus stayed green but eyeball one bolt
  fight.
- [ ] A persistent damage zone WITHOUT the new option still works and
  does NOT eat projectiles.
- [ ] Ice slides + teleports still work (the move loop grew the linger
  hook at their shared site).
- [ ] One normal puzzle end-to-end on mobile — perf should be unchanged
  (hallways bake statically; doors are one drawImage per frame).

---

## Still pending from earlier batches (unchanged)

- Trigger overhaul + hit stamps + editor gestures (2026-07-14 batch).
- Migration 012 paste, summon overlay art, crown/shield art.

## Next session queue

- **Hallway arc phase 4**: doors/hallways as INITIAL-spawn entrance
  styles with families ("heroes entered through the door") — render-side
  theater on the entrance system, no engine impact.
- Hero behavior slots, vessel triggers, deeper side corridors (if
  wanted), wind-wall kill VFX (if wanted).
