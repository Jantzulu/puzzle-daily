/**
 * The Slab reveal predicate (design locked 2026-07-21) — ONE shared rule for
 * every player-facing asset surface (Slab chapter lists AND the Training
 * Grounds sandbox roster; the sandbox inherits what the Slab shows, never
 * more):
 *
 *   revealed(asset) = asset appears in the transitive graph of a RELEASED,
 *                     NON-showcase puzzle  &&  !hideFromCompendium
 *
 * Released = a scheduled daily whose date has arrived (archived dailies stay
 * revealed — one-way door) or any published training level. Publishing a
 * SHOWCASE puzzle primes its assets (live + demo playable) but never
 * reveals; the asset's page appears the moment its first real puzzle goes
 * live, arriving complete with the demo already attached. Builtin assets
 * ship with the app and are never gated.
 *
 * The dev app never loads live content, so revealSet stays null there and
 * every surface shows everything — the team's see-it-all preview.
 */
import { useEffect, useState } from 'react';
import type { Puzzle } from '../types/game';
import { fetchLiveContent } from '../services/supabaseService';
import { loadCachedLiveContent, saveCachedLiveContent, type LiveContent, type ShowcaseIndexEntry } from './liveContentCache';
import { LIVE_ASSETS_UPDATED_EVENT, ensureAssetsLocal } from './livePull';

let liveContent: LiveContent | null = null;
let inflight: Promise<LiveContent | null> | null = null;

/**
 * Load live content once per session: fresh same-day cache, else fetch
 * (saving on success), else a stale cache — a day-old Slab beats an empty
 * one when the player is offline.
 */
export async function ensureLiveContent(): Promise<LiveContent | null> {
  if (liveContent) return liveContent;
  if (!inflight) {
    inflight = (async () => {
      const cached = loadCachedLiveContent();
      if (cached?.fresh) {
        liveContent = cached.content;
        return liveContent;
      }
      const result = await fetchLiveContent();
      if (result.status === 'ok') {
        liveContent = result.content;
        saveCachedLiveContent(result.content);
        return liveContent;
      }
      if (cached) {
        liveContent = cached.content;
        return liveContent;
      }
      return null;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * Index of cloud-published showcase demos (id + attached asset ids; empty
 * until ensureLiveContent ran). Full demo JSON is deliberately NOT here —
 * ShowcaseSection fetches it per revealed asset page (snoop-hole fix,
 * 2026-07-21 round 2).
 */
export function getLiveShowcaseIndex(): ShowcaseIndexEntry[] {
  return liveContent?.showcaseIndex ?? [];
}

/** Cloud-published training puzzles (empty until ensureLiveContent ran). */
export function getLiveTrainingPuzzles(): Puzzle[] {
  return liveContent?.trainingPuzzles ?? [];
}

interface RevealableAsset {
  id: string;
  hideFromCompendium?: boolean;
  isCustom?: boolean;
  isBuiltIn?: boolean;
}

/**
 * The shared predicate. revealSet === null means "no gating" (dev app / a
 * surface that opted out); an empty set means "player app, nothing released
 * yet". Builtins pass regardless — they ship with the client, and the
 * dependency walker never stamps them, so gating them would hide them
 * forever. Builtin detection uses EXPLICIT flags only (isBuiltIn true, or
 * isCustom literally false): store-saved customs always stamp isCustom
 * true, but statuses carry only isBuiltIn — a missing flag must read as
 * "custom", never as "builtin", or unreleased assets leak.
 */
export function isAssetRevealed(asset: RevealableAsset, revealSet: ReadonlySet<string> | null): boolean {
  if (revealSet === null) return true; // dev app: no gating whatsoever
  if (asset.hideFromCompendium) return false;
  if (asset.isBuiltIn === true || asset.isCustom === false) return true;
  return revealSet.has(asset.id);
}

/**
 * Player-surface hook. enabled=false (dev app) returns a null revealSet —
 * every asset passes. enabled=true starts from an EMPTY set (never leak
 * unreleased assets during the load) and fills in when live content lands.
 * assetsVersion bumps when the boot asset pull finishes, so lists built
 * from local stores recompute.
 */
export function usePlayerReveal(enabled: boolean): {
  revealSet: ReadonlySet<string> | null;
  assetsVersion: number;
} {
  const [revealSet, setRevealSet] = useState<ReadonlySet<string> | null>(null);
  const [assetsVersion, setAssetsVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    ensureLiveContent().then(async content => {
      if (cancelled) return;
      // Closure prefetch: make the revealed assets local BEFORE exposing
      // the reveal set, so lists/rosters and detail pages render complete
      // on first paint. Revealed = debuted — nothing undebuted is fetched.
      // (Offline: proceed with whatever is local; the set still gates.)
      if (content) await ensureAssetsLocal(content.revealedAssetIds);
      if (!cancelled) setRevealSet(new Set(content?.revealedAssetIds ?? []));
    });
    const onAssets = () => setAssetsVersion(v => v + 1);
    window.addEventListener(LIVE_ASSETS_UPDATED_EVENT, onAssets);
    return () => {
      cancelled = true;
      window.removeEventListener(LIVE_ASSETS_UPDATED_EVENT, onAssets);
    };
  }, [enabled]);

  return { revealSet: enabled ? (revealSet ?? EMPTY_SET) : null, assetsVersion };
}

const EMPTY_SET: ReadonlySet<string> = new Set();
