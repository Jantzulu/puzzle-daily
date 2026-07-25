/**
 * AssetBrowseTable — the full-width "read your whole library" view shown in
 * an asset editor when nothing is selected (2026-07-25, design agreed with
 * the user). Follows the Production dashboard styling standard: one thin
 * border, uppercase header strip, tight rows, chips for categories.
 *
 * Generic over the asset type so every editor can describe its own columns
 * without this file knowing about spells, tiles, heroes, etc.
 */
import React, { useMemo, useState } from 'react';

export interface BrowseColumn<T> {
  /** Stable key, also the sort identity. */
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  /** Sort key. Return null for "no value" — those always sort last. */
  value?: (item: T) => string | number | null;
  /** Cell content. Falls back to value() when omitted. */
  render?: (item: T) => React.ReactNode;
  /** Set false for columns that make no sense to order by (sprite, actions). */
  sortable?: boolean;
  className?: string;
}

type SortDir = 'asc' | 'desc';

/**
 * Sort state lives OUTSIDE the table so the editor can feed the same order to
 * both the table and the prev/next navigation. When the table owned it,
 * stepping with the arrows walked storage order while the table showed
 * alphabetical — "Frost Bolt" read as 3 of 17 while sitting fifth on screen.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useBrowseSort<T extends { id: string }>(
  items: T[],
  columns: BrowseColumn<T>[],
  defaultSortKey?: string,
) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sortKey);
    if (!col?.value) return items;
    const dir = sortDir === 'asc' ? 1 : -1;
    // Copy first — never sort the caller's array in place.
    return [...items].sort((a, b) => {
      const av = col.value!(a);
      const bv = col.value!(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;   // nulls last regardless of direction
      if (bv === null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [items, columns, sortKey, sortDir]);

  const toggleSort = (col: BrowseColumn<T>) => {
    if (col.sortable === false || !col.value) return;
    if (sortKey === col.key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
  };

  return { sorted, sortKey, sortDir, toggleSort };
}

interface AssetBrowseTableProps<T> {
  /** Already ordered — pass useBrowseSort's `sorted`. */
  items: T[];
  columns: BrowseColumn<T>[];
  sortKey: string | null;
  sortDir: SortDir;
  onToggleSort: (col: BrowseColumn<T>) => void;
  /** Row click — open the asset in the editor. */
  onOpen: (item: T) => void;
  /** Optional multi-select wiring, mirroring the list pane's bulk actions. */
  selection?: {
    isSelected: (id: string) => boolean;
    toggle: (id: string) => void;
  };
  /** Trailing per-row controls (duplicate / delete). Not sortable. */
  rowActions?: (item: T) => React.ReactNode;
  emptyMessage?: string;
}

export function AssetBrowseTable<T extends { id: string }>({
  items,
  columns,
  sortKey,
  sortDir,
  onToggleSort,
  onOpen,
  selection,
  rowActions,
  emptyMessage = 'Nothing here yet.',
}: AssetBrowseTableProps<T>) {
  const alignClass = (a?: BrowseColumn<T>['align']) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="overflow-x-auto border border-stone-700 rounded dense-scrollbar">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-stone-800 text-stone-400 text-xs uppercase">
            {selection && <th className="w-8 px-2 py-2" />}
            {columns.map(col => {
              const canSort = col.sortable !== false && !!col.value;
              return (
                <th
                  key={col.key}
                  onClick={() => onToggleSort(col)}
                  className={`px-2 py-2 ${alignClass(col.align)} ${col.className ?? ''} ${
                    canSort ? 'cursor-pointer select-none hover:text-stone-200' : ''
                  }`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1 text-arcane-400">{sortDir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </th>
              );
            })}
            {rowActions && <th className="px-2 py-2" />}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr
              key={item.id}
              onClick={() => onOpen(item)}
              className={`border-t border-stone-700/60 cursor-pointer transition-colors ${
                selection?.isSelected(item.id) ? 'bg-sky-900/40' : 'hover:bg-stone-800/50'
              }`}
            >
              {selection && (
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={selection.isSelected(item.id)}
                    onChange={() => selection.toggle(item.id)}
                    onClick={e => e.stopPropagation()}
                    className="accent-sky-500"
                  />
                </td>
              )}
              {columns.map(col => (
                <td key={col.key} className={`px-2 py-1.5 ${alignClass(col.align)} ${col.className ?? ''}`}>
                  {col.render ? col.render(item) : col.value?.(item) ?? <span className="text-stone-600">—</span>}
                </td>
              ))}
              {rowActions && (
                <td className="px-2 py-1.5 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1 justify-end">{rowActions(item)}</div>
                </td>
              )}
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (selection ? 1 : 0) + (rowActions ? 1 : 0)}
                className="px-3 py-4 text-center text-stone-500"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
