/**
 * Production dashboard derivations (2026-07-21, design agreed with user):
 * pure row-building for the Puzzle Resources "Production" tab. Everything
 * here is DERIVED from the three real sources (Supabase publish state,
 * puzzle JSON, asset JSON) — the single manual field is the asset's
 * `artFinal` flag, toggled from the dashboard and stored on the asset.
 */
import type { Puzzle } from '../types/game';
import { collectPuzzleAssetIds } from './publishDependencies';

export type SlabAssetType =
  | 'character'
  | 'ally'
  | 'enemy'
  | 'vessel'
  | 'status_effect'
  | 'tile_type'
  | 'collectible';

/** Normalized view of any Slab-listable asset the dashboard tracks. */
export interface ProductionAssetInput {
  id: string;
  name: string;
  type: SlabAssetType;
  description?: string;
  customSprite?: unknown;
  /** Heroes/enemies/allies only — vessels can't carry attributes (adapter drops them). */
  attributes?: unknown[];
  hideFromCompendium?: boolean;
  artFinal?: boolean;
}

export interface ProductionContext {
  /** Ids present in assets_live. */
  liveAssetIds: ReadonlySet<string>;
  /** Ids present in puzzles_live. */
  livePuzzleIds: ReadonlySet<string>;
  /** The player reveal set (fetchLiveContent.revealedAssetIds). */
  revealedAssetIds: ReadonlySet<string>;
  /** assetId → showcase-puzzle ids attaching it (local puzzle scan). */
  showcasesByAsset: ReadonlyMap<string, readonly string[]>;
}

/**
 * Where the asset stands on its road to a player-visible Slab page:
 * hidden (manual hideFromCompendium — never gets a page) > revealed (a
 * released real puzzle contains it) > awaiting_debut (published/primed but
 * no released non-showcase puzzle yet) > unpublished.
 */
export type SlabState = 'revealed' | 'awaiting_debut' | 'unpublished' | 'hidden';
export type ShowcaseState = 'none' | 'attached' | 'primed';

export interface AssetProductionRow {
  id: string;
  name: string;
  type: SlabAssetType;
  hasSprite: boolean;
  hasDescription: boolean;
  /** null = the type can't carry attributes (statuses/tiles/items/vessels). */
  hasAttributes: boolean | null;
  artFinal: boolean;
  isPublished: boolean;
  showcase: ShowcaseState;
  slabState: SlabState;
}

const ATTRIBUTE_TYPES: ReadonlySet<SlabAssetType> = new Set(['character', 'ally', 'enemy']);

export function deriveAssetRow(asset: ProductionAssetInput, ctx: ProductionContext): AssetProductionRow {
  const showcaseIds = ctx.showcasesByAsset.get(asset.id) ?? [];
  const showcase: ShowcaseState =
    showcaseIds.length === 0 ? 'none'
    : showcaseIds.some(id => ctx.livePuzzleIds.has(id)) ? 'primed'
    : 'attached';
  const isPublished = ctx.liveAssetIds.has(asset.id);
  const slabState: SlabState =
    asset.hideFromCompendium ? 'hidden'
    : ctx.revealedAssetIds.has(asset.id) ? 'revealed'
    : isPublished ? 'awaiting_debut'
    : 'unpublished';
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    hasSprite: !!asset.customSprite,
    hasDescription: !!asset.description?.trim(),
    hasAttributes: ATTRIBUTE_TYPES.has(asset.type) ? (asset.attributes?.length ?? 0) > 0 : null,
    artFinal: !!asset.artFinal,
    isPublished,
    showcase,
    slabState,
  };
}

// ── Puzzles ─────────────────────────────────────────────────────────────────

export type PuzzleReviewStatus = 'draft' | 'pending_review' | 'approved' | 'published';
/** What role the puzzle plays for players. Showcase wins over training. */
export type PuzzleKind = 'showcase' | 'training' | 'daily' | 'unassigned';

export interface PuzzleProductionRow {
  id: string;
  name: string;
  status: PuzzleReviewStatus;
  kind: PuzzleKind;
  hasDescription: boolean;
  hasQuestText: boolean;
  hasPar: boolean;
  isPublished: boolean;
  scheduledDate: string | null;
  puzzleNumber: number | null;
  /** Deleted/unresolvable asset refs (the walker's isMissing count). */
  missingDeps: number;
}

export interface ScheduleInfo {
  date: string;
  puzzleNumber: number | null;
}

export function derivePuzzleRow(
  id: string,
  name: string,
  status: PuzzleReviewStatus,
  puzzle: Puzzle,
  ctx: ProductionContext,
  schedule: ReadonlyMap<string, ScheduleInfo>,
): PuzzleProductionRow {
  const entry = schedule.get(id);
  const kind: PuzzleKind =
    puzzle.showcase ? 'showcase'
    : puzzle.isTraining ? 'training'
    : entry ? 'daily'
    : 'unassigned';
  let missingDeps = 0;
  for (const dep of collectPuzzleAssetIds(puzzle).values()) {
    if (dep.isMissing) missingDeps++;
  }
  return {
    id,
    name,
    status,
    kind,
    hasDescription: !!puzzle.description?.trim(),
    hasQuestText: !!puzzle.questDescription?.trim(),
    hasPar: puzzle.parCharacters != null || puzzle.parTurns != null,
    isPublished: ctx.livePuzzleIds.has(id),
    scheduledDate: entry?.date ?? null,
    puzzleNumber: entry?.puzzleNumber ?? null,
    missingDeps,
  };
}

/** Scan device-local puzzles for showcase attachments: assetId → puzzle ids. */
export function buildShowcasesByAsset(puzzles: readonly Puzzle[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const seenPuzzles = new Set<string>();
  for (const p of puzzles) {
    if (!p.showcase || seenPuzzles.has(p.id)) continue;
    seenPuzzles.add(p.id);
    for (const assetId of p.showcase.entityIds ?? []) {
      const list = map.get(assetId);
      if (list) list.push(p.id);
      else map.set(assetId, [p.id]);
    }
  }
  return map;
}
