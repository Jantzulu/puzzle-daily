/**
 * Production dashboard (2026-07-21, design agreed with user): team-internal
 * at-a-glance completion tracking for every Slab asset and every cloud
 * puzzle. Lives as a tab in Puzzle Resources. Everything is DERIVED
 * (utils/productionStatus.ts) from Supabase publish state + puzzle JSON +
 * asset JSON — the one manual field is the per-asset "art final" checkbox,
 * stored on the asset itself (reaches the cloud on the normal push, rides
 * the asset when published).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Puzzle } from '../../types/game';
import {
  getCustomCharacters,
  getCustomAllies,
  getCustomEnemies,
  getCustomVessels,
  getCustomTileTypes,
  getCustomCollectibles,
  getStatusEffectAssets,
  saveCharacter,
  saveEnemy,
  saveAlly,
  saveVessel,
  saveTileType,
  saveCollectible,
  saveStatusEffectAsset,
  type CustomCharacter,
  type CustomEnemy,
  type CustomAlly,
  type CustomVessel,
  type CustomTileType,
  type CustomCollectible,
} from '../../utils/assetStorage';
import type { StatusEffectAsset } from '../../types/game';
import { getAllPuzzles } from '../../data/puzzles';
import { getSavedPuzzles } from '../../utils/puzzleStorage';
import {
  fetchAllPuzzles,
  fetchLiveAssetIds,
  fetchLivePuzzleIds,
  fetchLiveContent,
  fetchFullScheduleWithNumbers,
} from '../../services/supabaseService';
import { localDateKey } from '../../utils/localDate';
import {
  deriveAssetRow,
  derivePuzzleRow,
  buildShowcasesByAsset,
  type AssetProductionRow,
  type ProductionAssetInput,
  type ProductionContext,
  type PuzzleProductionRow,
  type PuzzleReviewStatus,
  type ScheduleInfo,
  type SlabAssetType,
  type SlabState,
} from '../../utils/productionStatus';

// ── Normalization: the 7 Slab types → one input shape + a save dispatcher ───

interface TrackedAsset extends ProductionAssetInput {
  raw: unknown;
}

const TYPE_META: Record<SlabAssetType, { label: string; managerTab: string }> = {
  character: { label: 'Hero', managerTab: 'characters' },
  ally: { label: 'Ally', managerTab: 'allies' },
  enemy: { label: 'Enemy', managerTab: 'enemies' },
  vessel: { label: 'Vessel', managerTab: 'vessels' },
  status_effect: { label: 'Status', managerTab: 'status_effects' },
  tile_type: { label: 'Tile', managerTab: 'tiles' },
  collectible: { label: 'Item', managerTab: 'collectibles' },
};

const TYPE_ORDER: SlabAssetType[] = ['character', 'ally', 'enemy', 'vessel', 'status_effect', 'tile_type', 'collectible'];

function loadTrackedAssets(): TrackedAsset[] {
  const out: TrackedAsset[] = [];
  const push = (a: ProductionAssetInput, raw: unknown) => out.push({ ...a, raw });
  for (const c of getCustomCharacters()) {
    push({ id: c.id, name: c.name, type: 'character', description: c.description, customSprite: c.customSprite, attributes: c.attributes, hideFromCompendium: c.hideFromCompendium, artFinal: c.artFinal }, c);
  }
  for (const a of getCustomAllies()) {
    push({ id: a.id, name: a.name, type: 'ally', description: a.description, customSprite: a.customSprite, attributes: a.attributes, hideFromCompendium: a.hideFromCompendium, artFinal: a.artFinal }, a);
  }
  for (const e of getCustomEnemies()) {
    push({ id: e.id, name: e.name, type: 'enemy', description: e.description, customSprite: e.customSprite, attributes: e.attributes, hideFromCompendium: e.hideFromCompendium, artFinal: e.artFinal }, e);
  }
  for (const v of getCustomVessels()) {
    push({ id: v.id, name: v.name, type: 'vessel', description: v.description, customSprite: v.customSprite, hideFromCompendium: v.hideFromCompendium, artFinal: v.artFinal }, v);
  }
  for (const s of getStatusEffectAssets()) {
    if (s.isBuiltIn) continue;
    push({ id: s.id, name: s.name, type: 'status_effect', description: s.description, customSprite: s.iconSprite, hideFromCompendium: s.hideFromCompendium, artFinal: s.artFinal }, s);
  }
  for (const t of getCustomTileTypes()) {
    push({ id: t.id, name: t.name, type: 'tile_type', description: t.description, customSprite: t.customSprite, hideFromCompendium: t.hideFromCompendium, artFinal: t.artFinal }, t);
  }
  for (const i of getCustomCollectibles()) {
    push({ id: i.id, name: i.name, type: 'collectible', description: i.description, customSprite: i.customSprite, hideFromCompendium: i.hideFromCompendium, artFinal: i.artFinal }, i);
  }
  return out;
}

function saveArtFinal(asset: TrackedAsset, artFinal: boolean): void {
  const raw = asset.raw as Record<string, unknown>;
  const next = { ...raw, artFinal };
  switch (asset.type) {
    case 'character': saveCharacter(next as unknown as CustomCharacter); break;
    case 'ally': saveAlly(next as unknown as CustomAlly); break;
    case 'enemy': saveEnemy(next as unknown as CustomEnemy); break;
    case 'vessel': saveVessel(next as unknown as CustomVessel); break;
    case 'status_effect': saveStatusEffectAsset(next as unknown as StatusEffectAsset); break;
    case 'tile_type': saveTileType(next as unknown as CustomTileType); break;
    case 'collectible': saveCollectible(next as unknown as CustomCollectible); break;
  }
}

// ── Cloud state ─────────────────────────────────────────────────────────────

interface CloudState {
  liveAssetIds: Set<string>;
  livePuzzleIds: Set<string>;
  revealedAssetIds: Set<string>;
  drafts: Array<{ id: string; name: string; status: PuzzleReviewStatus; puzzle: Puzzle }>;
  schedule: Map<string, ScheduleInfo>;
}

// ── Small render helpers ────────────────────────────────────────────────────

const Check: React.FC<{ ok: boolean | null }> = ({ ok }) =>
  ok === null
    ? <span className="text-stone-600">—</span>
    : ok
      ? <span className="text-green-400">✓</span>
      : <span className="text-red-400/80">✗</span>;

const SLAB_CHIP: Record<SlabState, { label: string; cls: string }> = {
  revealed: { label: 'Revealed', cls: 'bg-green-900/40 text-green-300 border-green-700/50' },
  awaiting_debut: { label: 'Awaiting debut', cls: 'bg-amber-900/40 text-amber-300 border-amber-700/50' },
  unpublished: { label: 'Unpublished', cls: 'bg-stone-700/60 text-stone-300 border-stone-600' },
  hidden: { label: 'Hidden', cls: 'bg-arcane-900/40 text-arcane-300 border-arcane-700/50' },
};

const STATUS_CHIP: Record<PuzzleReviewStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-stone-700/60 text-stone-300 border-stone-600' },
  pending_review: { label: 'In review', cls: 'bg-sky-900/40 text-sky-300 border-sky-700/50' },
  approved: { label: 'Approved', cls: 'bg-amber-900/40 text-amber-300 border-amber-700/50' },
  published: { label: 'Published', cls: 'bg-green-900/40 text-green-300 border-green-700/50' },
};

const KIND_LABEL: Record<PuzzleProductionRow['kind'], string> = {
  daily: '📅 Daily',
  training: '🎯 Training',
  showcase: '📖 Showcase',
  unassigned: '—',
};

const Chip: React.FC<{ label: string; cls: string }> = ({ label, cls }) => (
  <span className={`inline-block px-2 py-0.5 rounded border text-xs whitespace-nowrap ${cls}`}>{label}</span>
);

const StatCard: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="bg-stone-800 border border-stone-700 rounded px-4 py-2 text-center">
    <div className="text-lg font-bold text-parchment-100">{value}</div>
    <div className="text-xs text-stone-400 whitespace-nowrap">{label}</div>
  </div>
);

// ── Component ───────────────────────────────────────────────────────────────

export const ProductionDashboard: React.FC = () => {
  const [cloud, setCloud] = useState<CloudState | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [localVersion, setLocalVersion] = useState(0);
  const [typeFilter, setTypeFilter] = useState<'all' | SlabAssetType>('all');

  // All setStates live in .then/.catch callbacks (never synchronously in the
  // effect body — react-hooks/set-state-in-effect); loadState boots as
  // 'loading', and the Refresh/Retry buttons re-set it from their handlers.
  const load = useCallback(() => {
    Promise.all([
      fetchLiveAssetIds(),
      fetchLivePuzzleIds(),
      fetchLiveContent(),
      fetchAllPuzzles(),
      fetchFullScheduleWithNumbers(),
    ]).then(([liveAssetIds, livePuzzleIds, liveContent, drafts, schedule]) => {
      if (!liveAssetIds || !livePuzzleIds || liveContent.status !== 'ok') {
        setLoadState('error');
        return;
      }
      setCloud({
        liveAssetIds,
        livePuzzleIds,
        revealedAssetIds: new Set(liveContent.content.revealedAssetIds),
        drafts: drafts.map(d => ({
          id: d.id,
          name: d.name,
          status: d.status,
          puzzle: d.data as unknown as Puzzle,
        })),
        schedule: new Map(schedule.map(s => [s.puzzleId, { date: s.date, puzzleNumber: s.puzzleNumber ?? null }])),
      });
      setLoadState('ready');
    }).catch(() => {
      setLoadState('error');
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const trackedAssets = useMemo(() => loadTrackedAssets(), [localVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- localVersion is the deliberate "local stores changed" signal

  const ctx: ProductionContext | null = useMemo(() => {
    if (!cloud) return null;
    // Showcase scan covers local puzzles AND cloud drafts (buildShowcasesByAsset dedupes by puzzle id).
    const scanPuzzles = [...getAllPuzzles(), ...getSavedPuzzles(), ...cloud.drafts.map(d => d.puzzle)];
    return {
      liveAssetIds: cloud.liveAssetIds,
      livePuzzleIds: cloud.livePuzzleIds,
      revealedAssetIds: cloud.revealedAssetIds,
      showcasesByAsset: buildShowcasesByAsset(scanPuzzles),
    };
  }, [cloud, localVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const assetRows: Array<AssetProductionRow & { tracked: TrackedAsset }> = useMemo(() => {
    if (!ctx) return [];
    return trackedAssets
      .map(a => ({ ...deriveAssetRow(a, ctx), tracked: a }))
      .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name));
  }, [trackedAssets, ctx]);

  const puzzleRows: PuzzleProductionRow[] = useMemo(() => {
    if (!cloud || !ctx) return [];
    return cloud.drafts
      .map(d => derivePuzzleRow(d.id, d.name, d.status, d.puzzle, ctx, cloud.schedule))
      .sort((a, b) => (a.scheduledDate ?? '9999').localeCompare(b.scheduledDate ?? '9999') || a.name.localeCompare(b.name));
  }, [cloud, ctx]);

  const filteredAssetRows = typeFilter === 'all' ? assetRows : assetRows.filter(r => r.type === typeFilter);

  const summary = useMemo(() => {
    const total = assetRows.length;
    const count = (f: (r: AssetProductionRow) => boolean) => assetRows.filter(f).length;
    const today = localDateKey();
    const futureDates = cloud ? [...cloud.schedule.values()].map(s => s.date).filter(d => d >= today).sort() : [];
    return {
      described: `${count(r => r.hasDescription)}/${total}`,
      artFinal: `${count(r => r.artFinal)}/${total}`,
      published: `${count(r => r.isPublished)}/${total}`,
      revealed: `${count(r => r.slabState === 'revealed')}/${total}`,
      awaitingDebut: count(r => r.slabState === 'awaiting_debut'),
      approvedUnscheduled: puzzleRows.filter(p => p.status === 'approved' && !p.scheduledDate).length,
      missingDeps: puzzleRows.filter(p => p.missingDeps > 0).length,
      runwayDays: futureDates.length,
      runwayEnd: futureDates[futureDates.length - 1] ?? null,
    };
  }, [assetRows, puzzleRows, cloud]);

  const toggleArtFinal = (row: AssetProductionRow & { tracked: TrackedAsset }) => {
    saveArtFinal(row.tracked, !row.artFinal);
    setLocalVersion(v => v + 1);
  };

  if (loadState === 'loading' && !cloud) {
    return <div className="flex items-center justify-center h-full text-copper-400 font-medieval text-lg animate-pulse">Consulting the ledgers...</div>;
  }
  if (loadState === 'error' && !cloud) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="text-red-400">Couldn't reach the cloud — publish state unknown.</div>
        <button onClick={() => { setLoadState('loading'); load(); }} className="dungeon-btn text-sm px-3 py-1.5">Retry</button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-6xl mx-auto">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-2">
        <StatCard value={summary.described} label="described" />
        <StatCard value={summary.artFinal} label="art final" />
        <StatCard value={summary.published} label="published" />
        <StatCard value={summary.revealed} label="revealed" />
        <StatCard value={`${summary.awaitingDebut}`} label="awaiting debut" />
        <StatCard value={`${summary.approvedUnscheduled}`} label="approved, unscheduled" />
        <StatCard
          value={summary.runwayDays > 0 ? `${summary.runwayDays}d` : '0'}
          label={summary.runwayEnd ? `daily runway → ${summary.runwayEnd}` : 'daily runway'}
        />
        {summary.missingDeps > 0 && <StatCard value={`⚠ ${summary.missingDeps}`} label="puzzles w/ missing refs" />}
        <button
          onClick={() => { setLoadState('loading'); load(); }}
          className="dungeon-btn text-xs px-3 py-1.5 ml-auto"
          disabled={loadState === 'loading'}
        >
          {loadState === 'loading' ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {/* Assets */}
      <section>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h2 className="text-lg font-medieval text-copper-400 mr-2">Assets</h2>
          {(['all', ...TYPE_ORDER] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-2 py-0.5 rounded text-xs border ${
                typeFilter === t
                  ? 'bg-stone-700 text-parchment-100 border-arcane-500'
                  : 'text-stone-400 border-stone-700 hover:text-stone-200'
              }`}
            >
              {t === 'all' ? 'All' : `${TYPE_META[t].label}s`}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto border border-stone-700 rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-800 text-stone-400 text-xs uppercase">
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-2 py-2">Type</th>
                <th className="px-2 py-2" title="Manual: the art is done">Art final</th>
                <th className="px-2 py-2">Sprite</th>
                <th className="px-2 py-2">Desc</th>
                <th className="px-2 py-2">Attrs</th>
                <th className="px-2 py-2">Published</th>
                <th className="px-2 py-2">Showcase</th>
                <th className="text-left px-2 py-2">Slab</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssetRows.map(row => (
                <tr key={row.id} className="border-t border-stone-700/60 hover:bg-stone-800/50">
                  <td className="px-3 py-1.5">
                    <Link
                      to={`/assets?tab=${TYPE_META[row.type].managerTab}&id=${encodeURIComponent(row.id)}`}
                      className="text-parchment-100 hover:text-copper-300 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-stone-400 text-xs">{TYPE_META[row.type].label}</td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={row.artFinal}
                      onChange={() => toggleArtFinal(row)}
                      className="accent-copper-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center"><Check ok={row.hasSprite} /></td>
                  <td className="px-2 py-1.5 text-center"><Check ok={row.hasDescription} /></td>
                  <td className="px-2 py-1.5 text-center"><Check ok={row.hasAttributes} /></td>
                  <td className="px-2 py-1.5 text-center"><Check ok={row.isPublished} /></td>
                  <td className="px-2 py-1.5 text-center text-xs text-stone-300">
                    {row.showcase === 'none' ? <span className="text-stone-600">—</span> : row.showcase === 'primed' ? 'Primed' : 'Attached'}
                  </td>
                  <td className="px-2 py-1.5"><Chip {...SLAB_CHIP[row.slabState]} /></td>
                </tr>
              ))}
              {filteredAssetRows.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-4 text-center text-stone-500">No assets of this type yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Puzzles */}
      <section>
        <h2 className="text-lg font-medieval text-copper-400 mb-2">Puzzles</h2>
        <div className="overflow-x-auto border border-stone-700 rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-800 text-stone-400 text-xs uppercase">
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-2 py-2">Kind</th>
                <th className="text-left px-2 py-2">Status</th>
                <th className="px-2 py-2">Desc</th>
                <th className="px-2 py-2">Quest text</th>
                <th className="px-2 py-2">Par</th>
                <th className="px-2 py-2">Live</th>
                <th className="text-left px-2 py-2">Scheduled</th>
                <th className="px-2 py-2">Refs</th>
              </tr>
            </thead>
            <tbody>
              {puzzleRows.map(row => (
                <tr key={row.id} className="border-t border-stone-700/60 hover:bg-stone-800/50">
                  <td className="px-3 py-1.5 text-parchment-100">{row.name}</td>
                  <td className="px-2 py-1.5 text-xs text-stone-300 whitespace-nowrap">{KIND_LABEL[row.kind]}</td>
                  <td className="px-2 py-1.5"><Chip {...STATUS_CHIP[row.status]} /></td>
                  <td className="px-2 py-1.5 text-center"><Check ok={row.hasDescription} /></td>
                  <td className="px-2 py-1.5 text-center"><Check ok={row.hasQuestText} /></td>
                  <td className="px-2 py-1.5 text-center"><Check ok={row.hasPar} /></td>
                  <td className="px-2 py-1.5 text-center"><Check ok={row.isPublished} /></td>
                  <td className="px-2 py-1.5 text-xs text-stone-300 whitespace-nowrap">
                    {row.scheduledDate
                      ? <>{row.scheduledDate}{row.puzzleNumber != null && <span className="text-stone-500"> · #{row.puzzleNumber}</span>}</>
                      : <span className="text-stone-600">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-center text-xs">
                    {row.missingDeps > 0
                      ? <span className="text-red-400" title="Deleted/unresolvable asset references">⚠ {row.missingDeps}</span>
                      : <span className="text-green-400">✓</span>}
                  </td>
                </tr>
              ))}
              {puzzleRows.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-4 text-center text-stone-500">No cloud puzzles yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-stone-500 mt-2">
          Rows come from the cloud draft library (review status) joined with the live table and daily schedule.
          "Art final" is the only manual field — it saves onto the asset locally and rides the next cloud push.
        </p>
      </section>
    </div>
  );
};
