/**
 * Compact "Used by" rendering, shared by every asset editor.
 *
 * The first cut listed one chip per usage, which reads fine for a spell used
 * by two heroes and falls apart for a skin used by every puzzle in the
 * library — and the library is only going to grow. So usages collapse by
 * kind: a single usage still shows its name (the useful common case), and
 * several become one counted chip whose tooltip carries the names.
 */
import React from 'react';
import type { AssetUsage } from '../../utils/assetDependencies';

type UsageKind = AssetUsage['type'];

const KIND_META: Record<UsageKind, { icon: string; one: string; many: string; cls: string }> = {
  puzzle:      { icon: '🧩', one: 'puzzle',  many: 'puzzles',  cls: 'bg-copper-900/40 text-copper-300 border-copper-700/50' },
  character:   { icon: '🛡', one: 'hero',    many: 'heroes',   cls: 'bg-arcane-900/40 text-arcane-300 border-arcane-700/50' },
  ally:        { icon: '🛡', one: 'ally',    many: 'allies',   cls: 'bg-arcane-900/40 text-arcane-300 border-arcane-700/50' },
  enemy:       { icon: '💀', one: 'enemy',   many: 'enemies',  cls: 'bg-red-900/40 text-red-300 border-red-700/50' },
  vessel:      { icon: '🏺', one: 'vessel',  many: 'vessels',  cls: 'bg-red-900/40 text-red-300 border-red-700/50' },
  spell:       { icon: '✨', one: 'spell',   many: 'spells',   cls: 'bg-stone-800 text-stone-300 border-stone-600' },
  collectible: { icon: '💎', one: 'item',    many: 'items',    cls: 'bg-stone-800 text-stone-300 border-stone-600' },
  skin:        { icon: '🎨', one: 'skin',    many: 'skins',    cls: 'bg-stone-800 text-stone-300 border-stone-600' },
};

/** Tooltips get the names, but a skin used by 300 puzzles shouldn't produce a 300-line one. */
const TOOLTIP_NAME_CAP = 25;

function tooltipFor(kind: UsageKind, items: AssetUsage[]): string {
  const names = items.map(u => u.name);
  const shown = names.slice(0, TOOLTIP_NAME_CAP).join('\n');
  const rest = names.length - TOOLTIP_NAME_CAP;
  const label = items.length === 1 ? KIND_META[kind].one : KIND_META[kind].many;
  return `${items.length} ${label}:\n${shown}${rest > 0 ? `\n…and ${rest} more` : ''}`;
}

export const UsageChips: React.FC<{
  usages: AssetUsage[];
  /**
   * Render nothing at all when unused, instead of the em-dash placeholder.
   * Table cells want the dash so a column reads consistently; the sidebar
   * meta line is a run of chips, where a lone dash is just noise.
   */
  hideWhenEmpty?: boolean;
}> = ({ usages, hideWhenEmpty }) => {
  if (usages.length === 0) {
    return hideWhenEmpty ? null : <span className="text-stone-600">—</span>;
  }

  // Preserve first-seen order so the grouping is stable across renders.
  const byKind = new Map<UsageKind, AssetUsage[]>();
  for (const u of usages) {
    const list = byKind.get(u.type);
    if (list) list.push(u);
    else byKind.set(u.type, [u]);
  }

  return (
    <div className="flex flex-wrap gap-1">
      {[...byKind.entries()].map(([kind, items]) => {
        const meta = KIND_META[kind];
        return (
          <span
            key={kind}
            title={tooltipFor(kind, items)}
            className={`text-[10px] px-1.5 py-0 rounded border whitespace-nowrap cursor-help ${meta.cls}`}
          >
            {meta.icon}{' '}
            {items.length === 1 ? items[0].name : `${items.length} ${meta.many}`}
          </span>
        );
      })}
    </div>
  );
};

/** Sort key for a "Used by" column — total usages, null when unused so it sorts last. */
// eslint-disable-next-line react-refresh/only-export-components -- helper belongs with the component it sorts for (same pattern as BulkActions)
export function usageSortValue(usages: AssetUsage[] | undefined): number | null {
  return usages?.length || null;
}
