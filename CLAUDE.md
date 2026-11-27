# Puzzle Daily ("Knightly")

A turn-based puzzle game and the editor suite that builds it. React 19,
TypeScript, Vite, Tailwind, a custom canvas board, Supabase. One owner, who
designs the game and paints its art and is not a programmer by trade; this is
a passion project and they follow the technical detail closely. Pre-launch:
there are no players yet, so a careful refactor is preferred to working
around a problem.

## Where the current state is

`CLAUDE_HANDOFF.md` is the project's record: architecture, decisions, what the
owner accepted and what they turned down, and why.

- Its first block ("Last Updated") is the session log, one numbered item per
  line, newest last. Read the last few items before starting work.
- Record finished work as the next numbered item, on a new line at the end of
  that block. Do not lengthen an existing line: that block was once a single
  196,000-character line that the file reader could not open.
- "Key Architecture" describes how the engine works. When a change makes a
  statement there untrue, correct the statement in the same commit.
- Ideas and bugs noticed in passing go in `docs/feature-backlog.md`.

## Rules that hold everywhere

- **The game is deterministic.** The same setup gives the same result every
  run, and replay shows what happened, not a re-derivation. No `Math.random`
  or clock reads in anything that decides an outcome.
- **Logic is the source of truth.** When what is drawn and what the engine did
  disagree, the drawing is wrong: fix the visual, not the rules.
- **Five files carry the game** and take small hand edits only, never a
  sweeping rewrite or an automatic lint fix: `AnimatedGameBoard.tsx`,
  `Game.tsx`, `simulation.ts`, `actions.ts`, `types/game.ts`.
- **Other sessions may be editing this checkout at the same time.** Look at
  `git status` and the diff before committing, and stage only your own files.

## Before a commit, and after a push

All five must pass: `npm run typecheck`, `npm run lint` (it is at zero; keep
it there), `npx vitest run`, `npm run build`, `npm run build:player`.
Both sites deploy from `main`, so a push goes live. After pushing, check the
GitHub Actions run; until it is green, say "passes locally".

## Visual work

The owner judges every visual change by eye, on their phone, and a metric
never overrules them. Ship visual work as real code in small commits that
can each be reverted alone. The art is theirs: placeholder art is drawn in
their style (the rules are at the top of `src/components/game/cutawayStone.ts`)
and existing pieces are reused as they are, not redrawn. Anything that
moves is filmed and looked at before it is pushed.

## If something goes badly wrong

The safe revert point is the tag `safe-build-2026-11-27`. Reverting is the
owner's decision; say what broke and offer it.
