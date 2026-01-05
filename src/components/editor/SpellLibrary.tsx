import React, { useState, useEffect } from 'react';
import type { SpellAsset } from '../../types/game';
import { getSpellAssets, deleteSpellAsset } from '../../utils/assetStorage';
import { SpellAssetBuilder } from './SpellAssetBuilder';

export const SpellLibrary: React.FC = () => {
  const [spells, setSpells] = useState<SpellAsset[]>([]);
  const [editingSpell, setEditingSpell] = useState<SpellAsset | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const loadSpells = () => {
    setSpells(getSpellAssets());
  };

  useEffect(() => {
    loadSpells();
  }, []);

  const handleDelete = (spellId: string) => {
    if (!confirm('Are you sure you want to delete this spell? This cannot be undone.')) {
      return;
    }

    deleteSpellAsset(spellId);
    loadSpells();
  };

  const handleDuplicate = (spell: SpellAsset) => {
    const duplicated: SpellAsset = {
      ...spell,
      id: 'spell_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: spell.name + ' (Copy)',
      createdAt: new Date().toISOString(),
    };
    setEditingSpell(duplicated);
  };

  const handleSave = () => {
    loadSpells();
    setEditingSpell(null);
    setIsCreating(false);
  };

  const filteredSpells = spells.filter(spell =>
    spell.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    spell.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Spell Library</h1>
        <p className="text-gray-400">
          Create and manage reusable spell assets. Spells can be equipped to characters and enemies.
        </p>
      </div>

      {/* Search and Create */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search spells..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 bg-gray-700 rounded text-white"
        />
        <button
          onClick={() => setIsCreating(true)}
          className="px-6 py-2 bg-blue-600 rounded hover:bg-blue-700 font-semibold"
        >
          + Create New Spell
        </button>
      </div>

      {/* Spell Grid */}
      {filteredSpells.length === 0 ? (
        <div className="text-center py-12 bg-gray-800 rounded-lg border-2 border-dashed border-gray-700">
          <p className="text-gray-400 mb-4">
            {searchTerm ? 'No spells match your search' : 'No spells created yet'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => setIsCreating(true)}
              className="px-6 py-2 bg-blue-600 rounded hover:bg-blue-700 font-semibold"
            >
              Create Your First Spell
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSpells.map((spell) => (
            <div
              key={spell.id}
              className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors"
            >
              {/* Spell Header */}
              <div className="flex items-start gap-3 mb-3">
                {spell.thumbnailIcon ? (
                  <img
                    src={spell.thumbnailIcon}
                    alt={spell.name}
                    className="w-16 h-16 object-contain bg-gray-900 rounded border border-gray-600"
                  />
                ) : (
                  <div className="w-16 h-16 bg-gray-900 rounded border border-gray-600 flex items-center justify-center text-gray-500 text-xs">
                    No Icon
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate">{spell.name}</h3>
                  <div className="text-xs text-gray-400 capitalize">{spell.templateType.replace('_', ' ')}</div>
                </div>
              </div>

              {/* Description */}
              {spell.description && (
                <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                  {spell.description}
                </p>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                <div className="bg-gray-900 rounded px-2 py-1">
                  <span className="text-gray-400">Damage:</span>{' '}
                  <span className="text-white font-semibold">{spell.damage}</span>
                </div>
                {spell.range && (
                  <div className="bg-gray-900 rounded px-2 py-1">
                    <span className="text-gray-400">Range:</span>{' '}
                    <span className="text-white font-semibold">{spell.range}</span>
                  </div>
                )}
                {spell.radius && (
                  <div className="bg-gray-900 rounded px-2 py-1">
                    <span className="text-gray-400">Radius:</span>{' '}
                    <span className="text-white font-semibold">{spell.radius}</span>
                  </div>
                )}
                {spell.projectileSpeed && (
                  <div className="bg-gray-900 rounded px-2 py-1">
                    <span className="text-gray-400">Speed:</span>{' '}
                    <span className="text-white font-semibold">{spell.projectileSpeed}</span>
                  </div>
                )}
              </div>

              {/* Direction Info */}
              <div className="text-xs text-gray-400 mb-3">
                <span className="font-semibold">Direction:</span>{' '}
                {spell.directionMode === 'current_facing' && 'Follows caster'}
                {spell.directionMode === 'all_directions' && 'All directions (360°)'}
                {spell.directionMode === 'relative' && `Relative: ${spell.relativeDirections?.length || 0} direction(s)`}
                {spell.directionMode === 'fixed' && `Fixed: ${spell.defaultDirections?.length || 0} direction(s)`}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingSpell(spell)}
                  className="flex-1 px-3 py-1.5 bg-blue-600 rounded hover:bg-blue-700 text-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDuplicate(spell)}
                  className="flex-1 px-3 py-1.5 bg-gray-600 rounded hover:bg-gray-700 text-sm"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => handleDelete(spell.id)}
                  className="px-3 py-1.5 bg-red-600 rounded hover:bg-red-700 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Spell Builder Modal */}
      {(isCreating || editingSpell) && (
        <SpellAssetBuilder
          spell={editingSpell || undefined}
          onSave={handleSave}
          onCancel={() => {
            setIsCreating(false);
            setEditingSpell(null);
          }}
        />
      )}
    </div>
  );
};
