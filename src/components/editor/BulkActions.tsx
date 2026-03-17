/**
 * Bulk Actions — shared hook and toolbar for multi-select operations
 * across all asset editors (characters, enemies, spells, etc.).
 */
import { useState, useCallback } from 'react';
import { toast } from '../shared/Toast';
import { getFolders, type AssetCategory } from '../../utils/assetStorage';
import { findAssetUsages, type AssetType } from '../../utils/assetDependencies';

// ============ useBulkSelect hook ============

// eslint-disable-next-line react-refresh/only-export-components
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
  onImport?: () => void;
}

export function BulkActionBar({ count, totalCount, onSelectAll, onClear, onDelete, onMoveToFolder, onExport, onImport }: BulkActionBarProps) {
  // When nothing selected, show only the Import button if available
  if (count === 0) {
    if (!onImport) return null;
    return (
      <div className="flex justify-end">
        <button onClick={onImport} className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs">
          Import
        </button>
      </div>
    );
  }

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
      {onImport && (
        <button onClick={onImport} className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs">
          Import
        </button>
      )}
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
// eslint-disable-next-line react-refresh/only-export-components
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
// eslint-disable-next-line react-refresh/only-export-components
export function bulkMoveToFolder(
  ids: string[],
  folderCategory: AssetCategory | string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAsset: (id: string) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/** Bulk export as JSON download (wrapped with metadata) */
// eslint-disable-next-line react-refresh/only-export-components
export function bulkExport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[],
  filename: string,
  assetType?: string,
) {
  const wrapper = {
    format: 'puzzle-game-assets-v1',
    assetType: assetType || filename.replace('-export.json', ''),
    exportedAt: new Date().toISOString(),
    assets: items,
  };
  const json = JSON.stringify(wrapper, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${items.length} item${items.length > 1 ? 's' : ''}`);
}

/** Bulk import from JSON file */
// eslint-disable-next-line react-refresh/only-export-components
export function bulkImport(opts: {
  assetType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveFn: (asset: any) => boolean | void;
  existingIds: Set<string>;
  onComplete: () => void;
}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Accept both wrapped format and raw arrays
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let assets: any[];
      if (Array.isArray(parsed)) {
        assets = parsed;
      } else if (parsed?.format === 'puzzle-game-assets-v1' && Array.isArray(parsed.assets)) {
        // Validate asset type matches
        if (parsed.assetType && parsed.assetType !== opts.assetType) {
          toast.warning(`Type mismatch: file contains "${parsed.assetType}" but you're in the ${opts.assetType} editor`);
          return;
        }
        assets = parsed.assets;
      } else {
        toast.warning('Invalid format: expected a JSON array or wrapped export file');
        return;
      }

      if (assets.length === 0) {
        toast.warning('File contains no assets');
        return;
      }

      // Validate each item has at least id and name
      const valid = assets.filter(a => a && typeof a.id === 'string' && typeof a.name === 'string');
      if (valid.length === 0) {
        toast.warning('No valid assets found (each needs id and name)');
        return;
      }

      let imported = 0;
      for (const asset of valid) {
        const copy = { ...asset };
        if (opts.existingIds.has(copy.id)) {
          // Generate new ID and mark as imported
          copy.id = `${opts.assetType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          if (!copy.name.endsWith(' (imported)')) {
            copy.name = `${copy.name} (imported)`;
          }
        }
        copy.createdAt = new Date().toISOString();
        opts.saveFn(copy);
        imported++;
      }

      const skipped = assets.length - valid.length;
      let msg = `Imported ${imported} ${opts.assetType}${imported !== 1 ? 's' : ''}`;
      if (skipped > 0) msg += ` (${skipped} skipped — missing id/name)`;
      toast.success(msg);
      opts.onComplete();
    } catch {
      toast.warning('Failed to read file — is it valid JSON?');
    }
  };
  input.click();
}
