import React, { useState } from 'react';
import type { AssetDependency } from '../../utils/publishDependencies';

interface PublishDependencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzleName: string;
  dependencies: AssetDependency[];
  onPublish: () => Promise<void>;
}

const TYPE_ICONS: Record<string, string> = {
  tile_type: '🧱',
  enemy: '👹',
  character: '⚔️',
  spell: '✨',
  skin: '🎨',
  object: '🏺',
  collectible: '💎',
  sound: '🔊',
};

const TYPE_LABELS: Record<string, string> = {
  tile_type: 'Tile',
  enemy: 'Enemy',
  character: 'Hero',
  spell: 'Spell',
  skin: 'Skin',
  object: 'Object',
  collectible: 'Item',
  sound: 'Sound',
};

export const PublishDependencyModal: React.FC<PublishDependencyModalProps> = ({
  isOpen,
  onClose,
  puzzleName,
  dependencies,
  onPublish,
}) => {
  const [isPublishing, setIsPublishing] = useState(false);

  if (!isOpen) return null;

  const published = dependencies.filter(d => d.isPublished);
  const unpublished = dependencies.filter(d => !d.isPublished && !d.isMissing);
  const missing = dependencies.filter(d => d.isMissing);

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await onPublish();
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-stone-900 border border-stone-700 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-stone-700">
          <h2 className="text-lg font-bold">Publish "{puzzleName}"</h2>
          <p className="text-sm text-stone-400 mt-1">
            This puzzle references {dependencies.length} asset{dependencies.length !== 1 ? 's' : ''}.
            {unpublished.length > 0 && ` ${unpublished.length} will be published along with the puzzle.`}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Missing assets */}
          {missing.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-red-400 mb-2">⚠ Missing Assets ({missing.length})</h3>
              <div className="space-y-1">
                {missing.map(dep => (
                  <div key={dep.assetId} className="flex items-center gap-2 text-sm text-red-300 bg-red-900/20 rounded px-2 py-1">
                    <span className="text-red-500">✕</span>
                    <span>{TYPE_ICONS[dep.type] || '📦'}</span>
                    <span className="truncate">{dep.name}</span>
                    <span className="text-xs text-red-500 ml-auto">{TYPE_LABELS[dep.type] || dep.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unpublished assets */}
          {unpublished.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-amber-400 mb-2">Will Be Published ({unpublished.length})</h3>
              <div className="space-y-1">
                {unpublished.map(dep => (
                  <div key={dep.assetId} className="flex items-center gap-2 text-sm text-amber-200 bg-amber-900/20 rounded px-2 py-1">
                    <span className="text-amber-500">○</span>
                    <span>{TYPE_ICONS[dep.type] || '📦'}</span>
                    <span className="truncate">{dep.name}</span>
                    <span className="text-xs text-amber-500 ml-auto">{TYPE_LABELS[dep.type] || dep.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Already published */}
          {published.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-green-400 mb-2">Already Published ({published.length})</h3>
              <div className="space-y-1">
                {published.map(dep => (
                  <div key={dep.assetId} className="flex items-center gap-2 text-sm text-green-200/70 bg-green-900/10 rounded px-2 py-1">
                    <span className="text-green-500">✓</span>
                    <span>{TYPE_ICONS[dep.type] || '📦'}</span>
                    <span className="truncate">{dep.name}</span>
                    <span className="text-xs text-green-600 ml-auto">{TYPE_LABELS[dep.type] || dep.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No dependencies */}
          {dependencies.length === 0 && (
            <p className="text-stone-400 text-sm text-center py-4">
              This puzzle has no asset dependencies.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-700 rounded hover:bg-stone-600 text-sm"
            disabled={isPublishing}
          >
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={isPublishing || missing.length > 0}
            className={`px-4 py-2 rounded text-sm font-medium ${
              missing.length > 0
                ? 'bg-stone-600 text-stone-400 cursor-not-allowed'
                : isPublishing
                  ? 'bg-green-700 text-green-200 cursor-wait'
                  : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isPublishing ? 'Publishing...' : `Publish All (${unpublished.length + 1})`}
          </button>
        </div>
      </div>
    </div>
  );
};
