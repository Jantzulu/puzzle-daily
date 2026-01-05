import React, { useState } from 'react';
import type { CustomAttack } from '../../types/game';
import { AttackPattern } from '../../types/game';
import { saveCustomAttack } from '../../utils/assetStorage';

interface AttackEditorProps {
  attack: CustomAttack;
  onSave: (attack: CustomAttack) => void;
  onCancel: () => void;
}

export const AttackEditor: React.FC<AttackEditorProps> = ({ attack, onSave, onCancel }) => {
  const [editedAttack, setEditedAttack] = useState<CustomAttack>({ ...attack });
  const [saveToLibrary, setSaveToLibrary] = useState(true);

  const handleSave = () => {
    // Save to library if requested
    if (saveToLibrary) {
      saveCustomAttack(editedAttack);
    }
    onSave(editedAttack);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Configure Attack</h2>

        <div className="space-y-4">
          {/* Attack Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Attack Name</label>
            <input
              type="text"
              value={editedAttack.name || ''}
              onChange={(e) => setEditedAttack({ ...editedAttack, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 rounded text-white"
              placeholder="e.g., Fireball, Ice Spike, Heal"
            />
          </div>

          {/* Attack Pattern */}
          <div>
            <label className="block text-sm font-medium mb-1">Attack Pattern</label>
            <select
              value={editedAttack.pattern}
              onChange={(e) => setEditedAttack({ ...editedAttack, pattern: e.target.value as any })}
              className="w-full px-3 py-2 bg-gray-700 rounded text-white"
            >
              <option value={AttackPattern.PROJECTILE}>Projectile (straight line)</option>
              <option value={AttackPattern.MELEE}>Melee (adjacent tile)</option>
              <option value={AttackPattern.AOE_CIRCLE}>AOE Circle (radius)</option>
              <option value={AttackPattern.HEAL}>Heal</option>
            </select>
          </div>

          {/* Damage */}
          <div>
            <label className="block text-sm font-medium mb-1">Damage</label>
            <input
              type="number"
              min="0"
              value={editedAttack.damage ?? 1}
              onChange={(e) => setEditedAttack({ ...editedAttack, damage: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-gray-700 rounded text-white"
            />
          </div>

          {/* Range */}
          {(editedAttack.pattern === AttackPattern.PROJECTILE || editedAttack.pattern === AttackPattern.AOE_CIRCLE) && (
            <div>
              <label className="block text-sm font-medium mb-1">
                {editedAttack.pattern === AttackPattern.PROJECTILE ? 'Max Range (tiles)' : 'Radius (tiles)'}
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={editedAttack.range || 5}
                onChange={(e) => setEditedAttack({ ...editedAttack, range: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 bg-gray-700 rounded text-white"
              />
            </div>
          )}

          {/* Projectile-specific settings */}
          {editedAttack.pattern === AttackPattern.PROJECTILE && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Projectile Speed (tiles/second)</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={editedAttack.projectileSpeed || 5}
                  onChange={(e) => setEditedAttack({ ...editedAttack, projectileSpeed: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 bg-gray-700 rounded text-white"
                />
                <p className="text-xs text-gray-400 mt-1">Higher = faster projectile</p>
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editedAttack.projectilePierces || false}
                    onChange={(e) => setEditedAttack({ ...editedAttack, projectilePierces: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Projectile Pierces Enemies</span>
                </label>
                <p className="text-xs text-gray-400 ml-6">If enabled, projectile continues through enemies</p>
              </div>
            </>
          )}

          {/* Effect Duration */}
          <div>
            <label className="block text-sm font-medium mb-1">Effect Duration (milliseconds)</label>
            <input
              type="number"
              min="100"
              max="2000"
              step="100"
              value={editedAttack.effectDuration || 300}
              onChange={(e) => setEditedAttack({ ...editedAttack, effectDuration: parseInt(e.target.value) || 300 })}
              className="w-full px-3 py-2 bg-gray-700 rounded text-white"
            />
            <p className="text-xs text-gray-400 mt-1">How long visual effects last</p>
          </div>

          {/* AOE Targeting (for AOE attacks) */}
          {editedAttack.pattern === AttackPattern.AOE_CIRCLE && (
            <div>
              <label className="block text-sm font-medium mb-1">Target Location</label>
              <select
                value={editedAttack.aoeTargeting || 'caster'}
                onChange={(e) => setEditedAttack({ ...editedAttack, aoeTargeting: e.target.value as any })}
                className="w-full px-3 py-2 bg-gray-700 rounded text-white"
              >
                <option value="caster">Centered on Caster</option>
                <option value="target_tile">Centered on Target Tile</option>
              </select>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-green-600 rounded hover:bg-green-700"
          >
            Save Attack
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-gray-600 rounded hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
