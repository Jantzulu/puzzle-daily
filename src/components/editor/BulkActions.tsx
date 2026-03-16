/**
 * Bulk Actions — shared hook and toolbar for multi-select operations
 * across all asset editors (characters, enemies, spells, etc.).
 */
import { useState, useCallback } from 'react';
import { toast } from '../shared/Toast';
import { getFolders, type AssetCategory } from '../../utils/assetStorage';
import { findAssetUsages, formatUsageWarning, type AssetType } from '../../utils/assetDependencies';

// ============ useBulkSelect hook ============

export function useBulkSelect() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  return { selectedIds, toggle, selectAll, clear, isSelected, count: selectedIds.size };
}

// ============ BulkActionBar component ============

interface BulkActionBarProps {
  count: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onDelete: () => void;
  onMoveToFolder?: () => void;
  onExport: () => void;
}

export function BulkActionBar({ count, totalCount, onSelectAll, onClear, onDelete, onMoveToFolder, onExport }: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="bg-blue-900/60 border border-blue-600 rounded px-3 py-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-blue-200 font-medium">{count} selected</span>
      <div className="flex-1" />
      {count < totalCount && (
        <button onClick={onSelectAll} className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs">
          Select All ({totalCount})
        </button>
      )}
      {onMoveToFolder && (
        <button onClick={onMoveToFolder} className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs">
          Move
        </button>
      )}
      <button onClick={onExport} className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs">
        Export
      </button>
      <button onClick={onDelete} className="px-2 py-1 bg-blood-700 hover:bg-blood-600 rounded text-xs">
        Delete
      </button>
      <button onClick={onClear} className="px-2 py-1 text-stone-400 hover:text-white text-xs">
        {'\u00D7'}
      </button>
    </div>
  );
}

// ============ Bulk action helpers ============

/** Bulk delete with dependency warnings. Returns IDs that were actually deleted. */
export function bulkDelete(
  ids: string[],
  assetType: AssetType,
  deleteFn: (id: string) => void,
  assetNameMap: Map<string, string>,
): string[] {
  // Gather all usages
  const allUsages: { id: string; name: string; usageCount: number }[] = [];
  for (const id of ids) {
    const usages = findAssetUsages(assetType, id);
    if (usages.length > 0) {
      allUsages.push({ id, name: assetNameMap.get(id) || id, usageCount: usages.length });
    }
  }

  let message = `Delete ${ids.length} item${ids.length > 1 ? 's' : ''}?`;
  if (allUsages.length > 0) {
    const warningItems = allUsages.slice(0, 3).map(u => `"${u.name}" (${u.usageCount} refs)`).join(', ');
    const extra = allUsages.length > 3 ? ` and ${allUsages.length - 3} more` : '';
    message += `\n\n⚠️ ${allUsages.length} of these are referenced by other assets: ${warningItems}${extra}`;
  }

  if (!confirm(message)) return [];

  for (const id of ids) {
    deleteFn(id);
  }

  toast.success(`Deleted ${ids.length} item${ids.length > 1 ? 's' : ''}`);
  return ids;
}

/** Bulk move to folder */
export function bulkMoveToFolder(
  ids: string[],
  folderCategory: AssetCategory | string,
  getAsset: (id: string) => any,
  saveAsset: (asset: any) => void,
) {
  const folders = getFolders(folderCategory as AssetCategory);

  const options = [
    { id: '', name: 'Uncategorized' },
    ...folders.map(f => ({ id: f.id, name: f.name })),
  ];

  const choices = options.map((o, i) => `${i}. ${o.name}`).join('\n');
  const input = prompt(`Move ${ids.length} items to folder:\n\n${choices}\n\nEnter number:`);
  if (input === null) return;

  const index = parseInt(input, 10);
  if (isNaN(index) || index < 0 || index >= options.length) {
    toast.warning('Invalid selection');
    return;
  }

  const targetFolderId = options[index].id || undefined;
  let moved = 0;

  for (const id of ids) {
    const asset = getAsset(id);
    if (asset) {
      saveAsset({ ...asset, folderId: targetFolderId });
      moved++;
    }
  }

  toast.success(`Moved ${moved} item${moved > 1 ? 's' : ''} to "${options[index].name}"`);
}

/** Bulk export as JSON download */
export function bulkExport(
  items: any[],
  filename: string,
) {
  const json = JSON.stringify(items, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${items.length} item${items.length > 1 ? 's' : ''}`);
}
