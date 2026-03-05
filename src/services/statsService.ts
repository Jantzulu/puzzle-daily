import { supabase } from '../lib/supabase';
import { getPlayerId } from '../utils/playerId';
import type { PuzzleScore, RankTier } from '../types/game';

// ============================================
// TYPES
// ============================================

export interface CompletionSubmission {
  puzzleId: string;
  puzzleDate?: string;               // ISO date string (YYYY-MM-DD)
  outcome: 'victory' | 'defeat';

  // Victory data
  score?: PuzzleScore;

  // Performance
  charactersUsed: number;
  characterIds: string[];
  turnsUsed: number;
  livesRemaining?: number;

  // Defeat data
  defeatReason?: 'damage' | 'turns' | 'concede';
  defeatTurn?: number;

  // Timing
  attemptDurationMs?: number;
}

export interface PuzzleStats {
  totalAttempts: number;
  totalVictories: number;
  totalDefeats: number;
  completionRate: number;
  avgScore: number;
  avgTurns: number;
  avgCharactersUsed: number;
  rankDistribution: { gold: number; silver: number; bronze: number };
  heroPickRates: { characterId: string; count: number; percentage: number }[];
  commonDefeatReasons: { reason: string; count: number; percentage: number }[];
  avgDefeatTurn: number | null;
}

export interface CommunityComparison {
  yourScore: number;
  avgScore: number;
  yourTurns: number;
  avgTurns: number;
  yourRank: RankTier;
  completionRate: number;
  totalPlayers: number;
  rankDistribution: { gold: number; silver: number; bronze: number };
  heroPickRates: { characterId: string; count: number; percentage: number }[];
}

export interface OverviewStats {
  totalPlays: number;
  uniquePlayers: number;
  overallCompletionRate: number;
  puzzlePlays: { puzzleId: string; puzzleName?: string; puzzleDate: string | null; plays: number; completionRate: number }[];
}

// ============================================
// SUBMISSION (Fire-and-forget)
// ============================================

/**
 * Submit a puzzle completion record (victory or defeat).
 * Fire-and-forget: never blocks gameplay, never throws.
 */
export async function submitCompletion(submission: CompletionSubmission): Promise<void> {
  try {
    const playerId = getPlayerId();

    // Optionally attach authenticated user ID
    let userId: string | undefined;
    try {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id;
    } catch { /* ignore */ }

    const row: Record<string, unknown> = {
      player_id: playerId,
      user_id: userId || null,
      puzzle_id: submission.puzzleId,
      puzzle_date: submission.puzzleDate || null,
      outcome: submission.outcome,
      characters_used: submission.charactersUsed,
      character_ids: submission.characterIds,
      turns_used: submission.turnsUsed,
      lives_remaining: submission.livesRemaining ?? null,
      defeat_reason: submission.defeatReason || null,
      defeat_turn: submission.defeatTurn || null,
      attempt_duration_ms: submission.attemptDurationMs || null,
    };

    // Add victory-specific fields
    if (submission.outcome === 'victory' && submission.score) {
      const s = submission.score;
      row.rank = s.rank;
      row.total_points = s.totalPoints;
      row.base_points = s.breakdown.basePoints;
      row.character_bonus = s.breakdown.characterBonus;
      row.turn_bonus = s.breakdown.turnBonus;
      row.lives_bonus = s.breakdown.livesBonus;
      row.side_quest_points = s.breakdown.sideQuestPoints;
      row.completed_side_quests = s.completedSideQuests;
      row.par_met_characters = s.parMet.characters;
      row.par_met_turns = s.parMet.turns;
    }

    await supabase.from('puzzle_completions').insert(row);
  } catch (e) {
    console.warn('[Stats] Failed to submit completion:', e);
  }
}

// ============================================
// COMMUNITY STATS (For post-game screen)
// ============================================

/**
 * Fetch community comparison data for a specific puzzle.
 * Called after victory/defeat to show "You vs. the community".
 */
export async function fetchCommunityStats(puzzleId: string): Promise<CommunityComparison | null> {
  try {
    const { data, error } = await supabase
      .from('puzzle_completions')
      .select('outcome, rank, total_points, turns_used, characters_used, character_ids')
      .eq('puzzle_id', puzzleId);

    if (error || !data || data.length === 0) return null;

    const victories = data.filter((r: any) => r.outcome === 'victory');
    const completionRate = data.length > 0 ? victories.length / data.length : 0;

    // Average score (victories only)
    const avgScore = victories.length > 0
      ? victories.reduce((sum: number, r: any) => sum + (r.total_points || 0), 0) / victories.length
      : 0;

    // Average turns (all attempts)
    const avgTurns = data.length > 0
      ? data.reduce((sum: number, r: any) => sum + (r.turns_used || 0), 0) / data.length
      : 0;

    // Rank distribution (victories only)
    const rankDist = { gold: 0, silver: 0, bronze: 0 };
    for (const r of victories) {
      if ((r as any).rank === 'gold') rankDist.gold++;
      else if ((r as any).rank === 'silver') rankDist.silver++;
      else if ((r as any).rank === 'bronze') rankDist.bronze++;
    }

    // Hero pick rates (all attempts)
    const heroCounts: Record<string, number> = {};
    for (const r of data) {
      for (const cid of ((r as any).character_ids || [])) {
        heroCounts[cid] = (heroCounts[cid] || 0) + 1;
      }
    }
    const heroPickRates = Object.entries(heroCounts)
      .map(([characterId, count]) => ({
        characterId,
        count,
        percentage: data.length > 0 ? count / data.length : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      yourScore: 0,
      avgScore: Math.round(avgScore),
      yourTurns: 0,
      avgTurns: Math.round(avgTurns * 10) / 10,
      yourRank: 'bronze',
      completionRate: Math.round(completionRate * 100),
      totalPlayers: data.length,
      rankDistribution: rankDist,
      heroPickRates: heroPickRates.slice(0, 5),
    };
  } catch (e) {
    console.warn('[Stats] Failed to fetch community stats:', e);
    return null;
  }
}

// ============================================
// CREATOR/DEV STATS (For /stats dashboard)
// ============================================

/**
 * Fetch detailed stats for a specific puzzle (creator view).
 */
export async function fetchPuzzleStats(puzzleId: string): Promise<PuzzleStats | null> {
  try {
    const { data, error } = await supabase
      .from('puzzle_completions')
      .select('*')
      .eq('puzzle_id', puzzleId);

    if (error || !data) return null;
    if (data.length === 0) {
      return {
        totalAttempts: 0, totalVictories: 0, totalDefeats: 0,
        completionRate: 0, avgScore: 0, avgTurns: 0, avgCharactersUsed: 0,
        rankDistribution: { gold: 0, silver: 0, bronze: 0 },
        heroPickRates: [], commonDefeatReasons: [], avgDefeatTurn: null,
      };
    }

    const victories = data.filter((r: any) => r.outcome === 'victory');
    const defeats = data.filter((r: any) => r.outcome === 'defeat');

    const rankDist = { gold: 0, silver: 0, bronze: 0 };
    for (const r of victories) {
      if ((r as any).rank === 'gold') rankDist.gold++;
      else if ((r as any).rank === 'silver') rankDist.silver++;
      else if ((r as any).rank === 'bronze') rankDist.bronze++;
    }

    const heroCounts: Record<string, number> = {};
    for (const r of data) {
      for (const cid of ((r as any).character_ids || [])) {
        heroCounts[cid] = (heroCounts[cid] || 0) + 1;
      }
    }

    const defeatReasonCounts: Record<string, number> = {};
    let defeatTurnSum = 0;
    let defeatTurnCount = 0;
    for (const r of defeats) {
      if ((r as any).defeat_reason) {
        defeatReasonCounts[(r as any).defeat_reason] = (defeatReasonCounts[(r as any).defeat_reason] || 0) + 1;
      }
      if ((r as any).defeat_turn) {
        defeatTurnSum += (r as any).defeat_turn;
        defeatTurnCount++;
      }
    }

    return {
      totalAttempts: data.length,
      totalVictories: victories.length,
      totalDefeats: defeats.length,
      completionRate: victories.length / data.length,
      avgScore: victories.length > 0
        ? Math.round(victories.reduce((s: number, r: any) => s + (r.total_points || 0), 0) / victories.length)
        : 0,
      avgTurns: Math.round(data.reduce((s: number, r: any) => s + r.turns_used, 0) / data.length * 10) / 10,
      avgCharactersUsed: Math.round(data.reduce((s: number, r: any) => s + r.characters_used, 0) / data.length * 10) / 10,
      rankDistribution: rankDist,
      heroPickRates: Object.entries(heroCounts)
        .map(([characterId, count]) => ({
          characterId, count,
          percentage: count / data.length,
        }))
        .sort((a, b) => b.count - a.count),
      commonDefeatReasons: Object.entries(defeatReasonCounts)
        .map(([reason, count]) => ({
          reason, count,
          percentage: defeats.length > 0 ? count / defeats.length : 0,
        }))
        .sort((a, b) => b.count - a.count),
      avgDefeatTurn: defeatTurnCount > 0 ? Math.round(defeatTurnSum / defeatTurnCount * 10) / 10 : null,
    };
  } catch (e) {
    console.warn('[Stats] Failed to fetch puzzle stats:', e);
    return null;
  }
}

/**
 * Fetch overview stats across all puzzles (creator dashboard).
 */
export async function fetchOverviewStats(
  startDate?: string,
  endDate?: string
): Promise<OverviewStats | null> {
  try {
    let query = supabase
      .from('puzzle_completions')
      .select('puzzle_id, puzzle_date, outcome, player_id');

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data, error } = await query;
    if (error || !data) return null;

    const uniquePlayers = new Set(data.map((r: any) => r.player_id)).size;
    const victories = data.filter((r: any) => r.outcome === 'victory');

    // Per-puzzle breakdown
    const puzzleMap: Record<string, { plays: number; victories: number; date: string | null }> = {};
    for (const r of data) {
      const pid = (r as any).puzzle_id;
      if (!puzzleMap[pid]) {
        puzzleMap[pid] = { plays: 0, victories: 0, date: (r as any).puzzle_date };
      }
      puzzleMap[pid].plays++;
      if ((r as any).outcome === 'victory') puzzleMap[pid].victories++;
    }

    return {
      totalPlays: data.length,
      uniquePlayers,
      overallCompletionRate: data.length > 0 ? victories.length / data.length : 0,
      puzzlePlays: Object.entries(puzzleMap)
        .map(([puzzleId, stats]) => ({
          puzzleId,
          puzzleDate: stats.date,
          plays: stats.plays,
          completionRate: stats.plays > 0 ? stats.victories / stats.plays : 0,
        }))
        .sort((a, b) => b.plays - a.plays),
    };
  } catch (e) {
    console.warn('[Stats] Failed to fetch overview stats:', e);
    return null;
  }
}
