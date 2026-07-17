import React, { useState } from 'react';
import { toast } from '../shared/Toast';
import { findAssetUsages, formatUsageWarning } from '../../utils/assetDependencies';
import { scaledNameClass } from '../../utils/textScale';
import { Direction } from '../../types/game';
import type { HitStampKind } from '../../types/game';
import type { CustomVessel, CustomSprite } from '../../utils/assetStorage';
import { saveVessel, deleteVessel, getCustomVessels, getAllCollectibles } from '../../utils/assetStorage';
import { getAllEnemies } from '../../data/enemies';
import { SpriteEditor } from './SpriteEditor';
import { SpriteThumbnail } from './SpriteThumbnail';
import { RichTextEditor } from './RichTextEditor';
import { AssetEditorLayout } from './AssetEditorLayout';
import { CollapsiblePanel } from './CollapsiblePanel';
import { useIsMobile } from '../../hooks/useMediaQuery';

const FACING_OPTIONS: { value: Direction; label: string }[] = [
  { value: Direction.NORTH, label: '↑ North' },
  { value: Direction.NORTHEAST, label: '↗ North-East' },
  { value: Direction.EAST, label: '→ East' },
  { value: Direction.SOUTHEAST, label: '↘ South-East' },
  { value: Direction.SOUTH, label: '↓ South' },
  { value: Direction.SOUTHWEST, label: '↙ South-West' },
  { value: Direction.WEST, label: '← West' },
  { value: Direction.NORTHWEST, label: '↖ North-West' },
];

const HIT_KIND_OPTIONS: { value: HitStampKind; label: string }[] = [
  { value: 'melee', label: 'Melee' },
  { value: 'projectile', label: 'Projectile' },
  { value: 'contact', label: 'Contact' },
  { value: 'any', label: 'Any hit' },
];

/**
 * Vessel Editor — breakable static entities (docs/feature-backlog.md):
 * barrels, urns, mimic chests, hatching eggs. Variable HP, idle + death
 * animations only, optional transform into a nested enemy on break, on a
 * timer, on proximity, or when struck by a chosen hit kind. Vessels resolve
 * through the enemy pipeline in-game, so this editor only authors what a
 * vessel actually uses.
 */
export const VesselEditor: React.FC<{ initialSelectedId?: string }> = ({ initialSelectedId }) => {
  const isMobile = useIsMobile();
  const [vessels, setVessels] = useState<CustomVessel[]>(getCustomVessels);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomVessel | null>(() => {
    if (!initialSelectedId) return null;
    return getCustomVessels().find(v => v.id === initialSelectedId) ?? null;
  });
  const [activeTab, setActiveTab] = useState<'details' | 'sprite'>('details');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredVessels = vessels.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (id: string) => {
    const vessel = vessels.find(v => v.id === id);
    if (vessel) {
      setSelectedId(id);
      setEditing({ ...vessel });
      setActiveTab('details');
    }
  };

  const handleNew = () => {
    const newVessel: CustomVessel = {
      id: 'vessel_' + Date.now(),
      name: 'New Vessel',
      health: 1,
      customSprite: {
        id: 'sprite_' + Date.now(),
        name: 'Custom Sprite',
        type: 'simple',
        shape: 'square',
        primaryColor: '#8d6e63',
        secondaryColor: '#5d4037',
        size: 0.6,
        createdAt: new Date().toISOString(),
      },
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    setEditing(newVessel);
    setSelectedId(null);
    setActiveTab('details');
  };

  const handleSave = () => {
    if (!editing) return;
    saveVessel(editing);
    setVessels(getCustomVessels());
    setSelectedId(editing.id);
    toast.success(`Saved "${editing.name}"!`);
  };

  const handleDelete = (id: string) => {
    const usages = findAssetUsages('vessel', id);
    const warning = usages.length > 0 ? `\n\n${formatUsageWarning(usages)}` : '';
    if (!confirm(`Delete this vessel?${warning}`)) return;
    deleteVessel(id);
    setVessels(getCustomVessels());
    if (selectedId === id) {
      setSelectedId(null);
      setEditing(null);
    }
  };

  const handleDuplicate = (vessel: CustomVessel, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated: CustomVessel = {
      ...vessel,
      id: 'vessel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: vessel.name + ' (Copy)',
      customSprite: vessel.customSprite ? { ...vessel.customSprite, id: 'sprite_' + Date.now() } : undefined,
      createdAt: new Date().toISOString(),
    };
    setEditing(duplicated);
    setSelectedId(null);
  };

  const updateVessel = (updates: Partial<CustomVessel>) => {
    if (!editing) return;
    setEditing({ ...editing, ...updates });
  };

  const updateSprite = (sprite: CustomSprite) => {
    if (!editing) return;
    setEditing({ ...editing, customSprite: sprite });
  };

  const handleBack = () => {
    setSelectedId(null);
    setEditing(null);
  };

  const transformTargetName = (id?: string) =>
    id ? (getAllEnemies().find(e => e.id === id)?.name ?? id) : undefined;

  return (
    <AssetEditorLayout
      isEditing={!!editing}
      onBack={handleBack}
      listTitle="Vessels"
      listPanel={
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold font-medieval text-copper-400">Vessels</h2>
            <button onClick={handleNew} className="dungeon-btn-success text-sm">
              + New
            </button>
          </div>

          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="dungeon-input text-sm"
          />

          <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto overflow-x-hidden">
            {filteredVessels.length === 0 ? (
              <div className="dungeon-panel p-4 rounded text-center text-stone-400 text-sm">
                {searchTerm ? 'No vessels match your search.' : 'No vessels yet.'}
                <br />{!searchTerm && 'Click "+ New" to create one.'}
              </div>
            ) : (
              filteredVessels.map(vessel => (
                <div
                  key={vessel.id}
                  className={`p-3 rounded cursor-pointer transition-colors ${
                    selectedId === vessel.id ? 'bg-arcane-700' : 'dungeon-panel hover:bg-stone-700'
                  }`}
                  onClick={() => handleSelect(vessel.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-2 min-w-0">
                      <div
                        className="bg-stone-600 rounded flex items-center justify-center overflow-hidden flex-shrink-0 transition-all duration-150"
                        style={{ width: selectedId === vessel.id ? 56 : 40, height: selectedId === vessel.id ? 56 : 40 }}
                      >
                        <SpriteThumbnail sprite={vessel.customSprite} size={selectedId === vessel.id ? 56 : 40} previewType="entity" fillBox />
                      </div>
                      <div className="min-w-0">
                        <h3 className={`font-bold ${scaledNameClass(vessel.name)}`}>{vessel.name}</h3>
                        <p className="text-xs text-stone-400">
                          HP: {vessel.health}
                          {vessel.transformEnemyId && ` • holds ${transformTargetName(vessel.transformEnemyId)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button
                        onClick={(e) => handleDuplicate(vessel, e)}
                        className="p-1 text-xs leading-none bg-stone-600 rounded hover:bg-stone-500"
                        title="Duplicate"
                      >
                        ⎘
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(vessel.id); }}
                        className="p-1 text-xs leading-none bg-blood-700 rounded hover:bg-blood-600"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      }
      detailPanel={
        editing ? (
          <>
            {/* Persistent Header */}
            <div className="dungeon-panel p-3 md:p-4 rounded">
              <div className="flex justify-between items-center gap-2">
                <div className="flex items-center gap-2 md:gap-4 min-w-0">
                  <div className="flex w-10 h-10 md:w-16 md:h-16 bg-stone-700 rounded items-center justify-center overflow-hidden flex-shrink-0">
                    <SpriteThumbnail sprite={editing.customSprite} size={isMobile ? 40 : 64} previewType="entity" fillBox />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg md:text-2xl font-bold font-medieval text-copper-400 truncate">
                      {editing.name || 'Unnamed Vessel'}
                    </h2>
                    <p className="text-xs text-stone-400">
                      HP: {editing.health}
                      {editing.transformEnemyId
                        ? ` • holds ${transformTargetName(editing.transformEnemyId)}`
                        : ' • plain breakable'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                  <button onClick={handleSave} className="dungeon-btn-success text-sm">
                    <span className="md:hidden">💾</span>
                    <span className="hidden md:inline">Save Vessel</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1">
              {(['details', 'sprite'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`dungeon-tab ${activeTab === tab ? 'dungeon-tab-active' : ''}`}
                >
                  {tab === 'details' ? '📋 Details' : '🎨 Sprite'}
                </button>
              ))}
            </div>

            {activeTab === 'details' && (
              <div className="space-y-6">
                <CollapsiblePanel title="Basic Info" className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Name</label>
                    <input type="text" value={editing.name}
                      onChange={(e) => updateVessel({ name: e.target.value })}
                      className="w-full px-3 py-2 bg-stone-700 rounded" />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Plural Name <span className="text-stone-400 font-normal">(optional)</span></label>
                    <input type="text" value={editing.pluralName || ''}
                      onChange={(e) => updateVessel({ pluralName: e.target.value || undefined })}
                      placeholder={`e.g., ${editing.name}s`}
                      className="w-full px-3 py-2 bg-stone-700 rounded" />
                    <p className="text-xs text-stone-400 mt-1">Used in quest text when several are on the board</p>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Description</label>
                    <RichTextEditor
                      value={editing.description || ''}
                      onChange={(value) => updateVessel({ description: value || undefined })}
                      placeholder="Enter vessel description..."
                      multiline
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Health</label>
                    <input type="number" min="1" max="99" value={editing.health}
                      onChange={(e) => updateVessel({ health: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-stone-700 rounded" />
                    <p className="text-xs text-stone-400 mt-1">How much damage it takes to break — some vessels are sturdier than others</p>
                  </div>
                </CollapsiblePanel>

                <CollapsiblePanel title="Transformation" className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Holds Enemy <span className="text-stone-400 font-normal">(optional)</span></label>
                    <select
                      value={editing.transformEnemyId || ''}
                      onChange={(e) => updateVessel({ transformEnemyId: e.target.value || undefined })}
                      className="w-full px-3 py-2 bg-stone-700 rounded"
                    >
                      <option value="">None — plain breakable</option>
                      {getAllEnemies().map((enemy) => (
                        <option key={enemy.id} value={enemy.id}>{enemy.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-stone-400 mt-1">
                      The enemy that emerges when this vessel breaks. It joins the board as a real
                      combatant (idle until the turn after it appears) — the map editor's win-condition
                      checkboxes control whether it must be defeated.
                    </p>
                  </div>

                  {editing.transformEnemyId && (
                    <>
                      <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editing.transformOnBreak !== false}
                            onChange={(e) => updateVessel({ transformOnBreak: e.target.checked ? undefined : false })}
                            className="rounded"
                          />
                          <span className="text-sm">Transforms when broken</span>
                        </label>
                        <p className="text-xs text-stone-400 mt-1 ml-6">
                          Off = breaking it just destroys it (loot still drops, nothing emerges) —
                          for eggs that only hatch by timer, proximity, or a specific strike.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Hatch Timer (turns) <span className="text-stone-400 font-normal">(optional)</span></label>
                        <input type="number" min="0" max="99" value={editing.transformAfterTurns ?? 0}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 0;
                            updateVessel({ transformAfterTurns: v > 0 ? v : undefined });
                          }}
                          className="w-full px-3 py-2 bg-stone-700 rounded" />
                        <p className="text-xs text-stone-400 mt-1">
                          Transforms at the end of this many turns even if unbroken (hatching egg,
                          timed ambush). 0 = off.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Proximity Hatch (range) <span className="text-stone-400 font-normal">(optional)</span></label>
                        <div className="flex gap-2">
                          <input type="number" min="0" max="99" value={editing.transformProximityRange ?? 0}
                            onChange={(e) => {
                              const v = parseInt(e.target.value) || 0;
                              updateVessel({ transformProximityRange: v > 0 ? v : undefined });
                            }}
                            className="w-24 px-3 py-2 bg-stone-700 rounded" />
                          {(editing.transformProximityRange ?? 0) > 0 && (
                            <select
                              value={editing.transformProximityParty ?? 'hero'}
                              onChange={(e) => updateVessel({ transformProximityParty: e.target.value as 'hero' | 'enemy' | 'any' })}
                              className="flex-1 px-3 py-2 bg-stone-700 rounded"
                            >
                              <option value="hero">Senses Heroes</option>
                              <option value="enemy">Senses Enemies</option>
                              <option value="any">Senses Anyone</option>
                            </select>
                          )}
                        </div>
                        <p className="text-xs text-stone-400 mt-1">
                          Hatches when a living matching unit stands within this range at the end
                          of a turn (same distance rule as "in range" triggers — range 1 doesn't
                          include diagonals). 0 = off. Stealthed opponents don't trigger it.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Hatches When Struck By <span className="text-stone-400 font-normal">(optional)</span></label>
                        <div className="flex flex-wrap gap-3">
                          {HIT_KIND_OPTIONS.map((opt) => (
                            <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={editing.transformOnHitKinds?.includes(opt.value) ?? false}
                                onChange={(e) => {
                                  const current = editing.transformOnHitKinds ?? [];
                                  const next = e.target.checked
                                    ? [...current, opt.value]
                                    : current.filter(k => k !== opt.value);
                                  updateVessel({ transformOnHitKinds: next.length > 0 ? next : undefined });
                                }}
                                className="rounded"
                              />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-stone-400 mt-1">
                          A landed hit of a checked kind hatches it — no need to break it (struck
                          gong wakes the golem). Hits count even if deflected or absorbed. "Any"
                          also covers area, damage-over-time, tile, and push hits.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm mb-1">Emerged Facing <span className="text-stone-400 font-normal">(optional)</span></label>
                        <select
                          value={editing.transformFacing || ''}
                          onChange={(e) => updateVessel({ transformFacing: (e.target.value || undefined) as Direction | undefined })}
                          className="w-full px-3 py-2 bg-stone-700 rounded"
                        >
                          <option value="">Enemy's default facing</option>
                          {FACING_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </CollapsiblePanel>

                <CollapsiblePanel title="Loot" className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Drops on Break <span className="text-stone-400 font-normal">(optional)</span></label>
                    <select
                      value={editing.droppedCollectibleId || ''}
                      onChange={(e) => updateVessel({ droppedCollectibleId: e.target.value || undefined })}
                      className="w-full px-3 py-2 bg-stone-700 rounded"
                    >
                      <option value="">None</option>
                      {getAllCollectibles().map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-stone-400 mt-1">
                      Collectible spawned when the vessel is broken. A vessel that transforms usually
                      shouldn't also drop loot — the emerging enemy would stand on it.
                    </p>
                  </div>
                </CollapsiblePanel>
              </div>
            )}

            {activeTab === 'sprite' && editing.customSprite && (
              <div className="space-y-3">
                <div className="bg-blue-900 border border-blue-600 rounded p-2">
                  <p className="text-xs text-blue-200">
                    <strong>Vessels only use the Idle and Death sections</strong> — they never move,
                    cast, or play entrance animations, and the Default/Static direction is enough
                    (no movement arrow in-game). The death animation is the break: splinters,
                    shattering pottery, a chest snapping open.
                  </p>
                </div>
                <SpriteEditor
                  sprite={editing.customSprite}
                  onChange={updateSprite}
                  shadowPreview
                />
              </div>
            )}
          </>
        ) : null
      }
      emptyState={
        <div className="dungeon-panel p-8 rounded text-center">
          <h2 className="text-2xl font-bold font-medieval text-copper-400 mb-4">Vessel Editor</h2>
          <p className="text-stone-400 mb-6">
            Breakable things with something inside — barrels, urns, mimic chests, hatching eggs.
            Variable toughness, optional transformation into an enemy on break or on a timer.
          </p>
          <button onClick={handleNew} className="dungeon-btn-success text-lg">
            + Create New Vessel
          </button>
        </div>
      }
    />
  );
};
