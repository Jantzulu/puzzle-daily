import React, { useMemo } from 'react';
import type { Puzzle } from '../../types/game';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import { getCharacter, type CharacterWithSprite } from '../../data/characters';
import { getEnemy, type EnemyWithSprite } from '../../data/enemies';
import { loadCollectible, loadSpellAsset, type CustomSprite, type CustomCollectible } from '../../utils/assetStorage';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { HelpButton } from './HelpOverlay';
import { hasDeliverySchedule, deliveryRepeat } from '../../utils/deliverySchedule';
import { BeamSign, CutawayPlate, NamePlate, CutawaySlab, WallDark, WallSetting } from './CutawayWall';
import { WALL_ABOVE_BEAM, WALL_ENTRY, WALL_HEADER_GAP, WALL_LIST, WALL_OVER_PLATE, WALL_ROW } from './cutawayStone';

interface ItemsDisplayProps {
  puzzle: Puzzle;
  className?: string;
}

// Entity source info for an item drop
interface EntitySource {
  id: string;
  name: string;
  sprite?: CustomSprite;
  isEnemy: boolean;
}

// Spell source info for throw/place items
interface SpellSource {
  spellName: string;
  entityId: string;
  entityName: string;
  entitySprite?: CustomSprite;
  isEnemy: boolean;
  isThrow: boolean; // true = thrown (range 2+), false = placed (range 0-1)
  duration?: number; // override duration from spell
}

// Item with optional drop sources
interface ItemWithSources {
  collectible: CustomCollectible;
  onMap: boolean;
  dropSources: EntitySource[];
  spellSources: SpellSource[];
  // Delivery schedules among this item's placements (full-disclosure
  // preview, 2026-07-21) — formatted labels, deduped.
  deliveries: string[];
}

/**
 * Extracts all items that appear in a puzzle (on map or from drops)
 */
function getPuzzleItemsWithSources(puzzle: Puzzle): ItemWithSources[] {
  // Map from collectible ID to item info
  const itemMap = new Map<string, ItemWithSources>();

  // First, add all collectibles that are on the map
  for (const placed of puzzle.collectibles) {
    if (placed.collectibleId) {
      const collectible = loadCollectible(placed.collectibleId);
      if (collectible) {
        if (!itemMap.has(collectible.id)) {
          itemMap.set(collectible.id, {
            collectible,
            onMap: true,
            dropSources: [],
            spellSources: [],
            deliveries: [],
          });
        } else {
          itemMap.get(collectible.id)!.onMap = true;
        }
        if (hasDeliverySchedule(placed)) {
          const d = placed.delivery!;
          let label = `Delivered turn ${d.arriveTurn}`;
          if (d.deadlineTurn !== undefined && d.deadlineTurn > d.arriveTurn) label += `, gone turn ${d.deadlineTurn}`;
          if (deliveryRepeat(d) !== undefined) label += `, repeats every ${d.repeatEvery}`;
          const entry = itemMap.get(collectible.id)!;
          if (!entry.deliveries.includes(label)) entry.deliveries.push(label);
        }
      }
    }
  }

  // Check all available characters for death drops
  for (const charId of puzzle.availableCharacters) {
    const character = getCharacter(charId);
    if (character?.droppedCollectibleId) {
      const collectible = loadCollectible(character.droppedCollectibleId);
      if (collectible) {
        if (!itemMap.has(collectible.id)) {
          itemMap.set(collectible.id, {
            collectible,
            onMap: false,
            dropSources: [],
            spellSources: [],
            deliveries: [],
          });
        }
        const item = itemMap.get(collectible.id)!;
        if (!item.dropSources.some(s => s.id === charId)) {
          item.dropSources.push({
            id: charId,
            name: character.name,
            sprite: (character as CharacterWithSprite).customSprite,
            isEnemy: false,
          });
        }
      }
    }
  }

  // Check all enemies for death drops (unique enemy IDs)
  const seenEnemyIds = new Set<string>();
  for (const placedEnemy of puzzle.enemies) {
    if (seenEnemyIds.has(placedEnemy.enemyId)) continue;
    seenEnemyIds.add(placedEnemy.enemyId);

    const enemy = getEnemy(placedEnemy.enemyId);
    if (enemy?.droppedCollectibleId) {
      const collectible = loadCollectible(enemy.droppedCollectibleId);
      if (collectible) {
        if (!itemMap.has(collectible.id)) {
          itemMap.set(collectible.id, {
            collectible,
            onMap: false,
            dropSources: [],
            spellSources: [],
            deliveries: [],
          });
        }
        const item = itemMap.get(collectible.id)!;
        if (!item.dropSources.some(s => s.id === placedEnemy.enemyId)) {
          item.dropSources.push({
            id: placedEnemy.enemyId,
            name: enemy.name,
            sprite: (enemy as EnemyWithSprite).customSprite,
            isEnemy: true,
          });
        }
      }
    }
  }

  // Check characters and enemies for Throw/Place spell sources
  const scanEntitySpells = (entityId: string, entityName: string, entitySprite: CustomSprite | undefined, isEnemy: boolean) => {
    const entity = isEnemy ? getEnemy(entityId) : getCharacter(entityId);
    if (!entity || !Array.isArray(entity.behavior)) return;

    const seenSpellIds = new Set<string>();
    for (const action of entity.behavior) {
      if (action.type !== 'spell' || !action.spellId) continue;
      if (seenSpellIds.has(action.spellId)) continue;
      seenSpellIds.add(action.spellId);

      const spell = loadSpellAsset(action.spellId);
      if (!spell || spell.templateType !== 'throw_place' || !spell.spawnCollectibleId) continue;

      const collectible = loadCollectible(spell.spawnCollectibleId);
      if (!collectible) continue;

      if (!itemMap.has(collectible.id)) {
        itemMap.set(collectible.id, {
          collectible,
          onMap: false,
          dropSources: [],
          spellSources: [],
          deliveries: [],
        });
      }
      const item = itemMap.get(collectible.id)!;
      if (!item.spellSources.some(s => s.entityId === entityId && s.spellName === spell.name)) {
        item.spellSources.push({
          spellName: spell.name,
          entityId,
          entityName,
          entitySprite: entitySprite,
          isEnemy,
          isThrow: (spell.range ?? 0) >= 2,
          duration: spell.throwPlaceDuration,
        });
      }
    }
  };

  for (const charId of puzzle.availableCharacters) {
    const character = getCharacter(charId);
    if (character) {
      scanEntitySpells(charId, character.name, (character as CharacterWithSprite).customSprite, false);
    }
  }

  const seenEnemyIds2 = new Set<string>();
  for (const placedEnemy of puzzle.enemies) {
    if (seenEnemyIds2.has(placedEnemy.enemyId)) continue;
    seenEnemyIds2.add(placedEnemy.enemyId);
    const enemy = getEnemy(placedEnemy.enemyId);
    if (enemy) {
      scanEntitySpells(placedEnemy.enemyId, enemy.name, (enemy as EnemyWithSprite).customSprite, true);
    }
  }

  return Array.from(itemMap.values());
}

/**
 * An item on its shelf: THE SPRITE ITSELF, no box behind it, bobbing over
 * the shelf as it bobs on the board (user, 2026-11-25: "instead of the
 * sprite on a background, can we just render the sprite with no background,
 * and have it bob on the shelf like it would bob on the map?"). It was the
 * sprite on the asset preview's dark square. The bob is index.css
 * .shelf-bob: the board's own (AnimatedGameBoard: one cycle a second, all
 * items in step), two pixels up and two down.
 */
const ItemIcon: React.FC<{ collectible: CustomCollectible; size?: number }> = ({ collectible, size = 24 }) => (
  <span className="shelf-bob" style={{ width: size, height: size }}>
    {collectible.customSprite
      ? <SpriteThumbnail sprite={collectible.customSprite} size={size} previewType="asset" noBackground />
      // (No sprite: a star, as on the board.)
      : <span className="text-parchment-300 leading-none">⭐</span>}
  </span>
);

export const ItemsDisplay: React.FC<ItemsDisplayProps> = ({ puzzle, className = '' }) => {
  const itemsWithSources = useMemo(() => getPuzzleItemsWithSources(puzzle), [puzzle]);

  // Don't render if no items
  if (itemsWithSources.length === 0) {
    return null;
  }

  // Chiseled seam between the dungeon's informational sections
  // The lines under an entry start where its text does: further in when the icon has a shelf round it.
  const indent = 'pl-9';
  // The room the beam needs above the title.
  const divider = <div aria-hidden="true" className={WALL_ABOVE_BEAM} />;

  const count = (
    <span className="flex items-baseline gap-1">
      <span className="hud-num text-stone-400">{itemsWithSources.length}</span>
      <span className="hud-label text-stone-400">type{itemsWithSources.length !== 1 ? 's' : ''}</span>
    </span>
  );

  const content = (
    <>
      {divider}
      <div className={`relative flex items-center justify-between ${WALL_HEADER_GAP} ${WALL_ROW}`}>
        <CutawaySlab old />
        <CutawayPlate kind="items" />
        <div className="min-w-[60px]" />
        <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center ${WALL_OVER_PLATE}`}>
          <div className="absolute right-full mr-1">
            <HelpButton sectionId="items" className="!text-[#e8cc8a]" pixel />
          </div>
          <h3 className="carved-header carved-header-parchment font-medieval text-lg lg:text-xl uppercase whitespace-nowrap">Items</h3>
          <BeamSign torch={{ prefer: 'right', phase: 350 }}>{count}</BeamSign>
        </div>
        {/* Counter in the ramp's registers, like the hero/enemy panels. */}
        {/* (The count is on a sign beside the title: BeamSign, above.) */}
        <span />
      </div>

      {/* Ledger rows, two columns when the width is there */}
      <div className={WALL_LIST}>
        {itemsWithSources.map(({ collectible, onMap, dropSources, spellSources, deliveries }) => (
          <div
            key={collectible.id}
            className={`py-1.5 break-inside-avoid ${WALL_ENTRY.shelf.row}`}
          >
            <div className="flex items-start gap-2">
              {/* Icon (in the wall: on a stone shelf) */}
              <div className={`flex-shrink-0 ${WALL_ENTRY.shelf.icon}`}>
                <WallSetting on kind="shelf"><ItemIcon collectible={collectible} size={24} /></WallSetting>
              </div>

              {/* Name and effects */}
              <div className="flex-1 min-w-0 leading-snug">
                {/* Panel copy on the HUD ramp (2026-08-01): hud-title names,
                    hud-body detail — identity colors untouched. */}
                <span className="hud-title text-parchment-200 mr-2">
                  {collectible.name}
                </span>
                {/* On map indicator */}
                {onMap && (
                  <span className="dungeon-badge align-middle">
                    On Map
                  </span>
                )}

                {/* Description if available */}
                {collectible.description && (
                  <div
                    className="hud-body text-stone-400"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(collectible.description) }}
                  />
                )}
                {/* Show placement restriction info - separate line like SpecialTilesDisplay */}
                {collectible.preventPlacement && (
                  <div className="hud-body text-blood-400/70">
                    Cannot place heroes on this tile
                  </div>
                )}
                {/* Delivery schedules (full-disclosure preview) */}
                {deliveries.map((label) => (
                  <div key={label} className="hud-body text-copper-300">
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Drop sources - who drops this item */}
            {dropSources.length > 0 && (
              <div className={`mt-1 ${indent}`}>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="hud-label text-stone-500 mr-1">Dropped by:</span>
                  {dropSources.map((source) => (
                    <NamePlate
                      key={source.id}
                      kind={source.isEnemy ? 'enemies' : 'heroes'}
                      className={`text-[13px] leading-none ${source.isEnemy ? 'text-blood-300' : 'text-arcane-300'}`}
                      title={source.name}
                    >
                      {source.sprite && (
                        <SpriteThumbnail sprite={source.sprite} size={16} previewType="entity" />
                      )}
                      <span className="max-w-[84px] truncate">{source.name}</span>
                    </NamePlate>
                  ))}
                </div>
              </div>
            )}

            {/* Spell sources - who places/throws this item */}
            {spellSources.length > 0 && (
              <div className={`mt-1 ${indent}`}>
                <div className="flex items-center gap-1 flex-wrap">
                  {spellSources.map((source, idx) => (
                    <NamePlate
                      key={`${source.entityId}-${source.spellName}-${idx}`}
                      kind={source.isEnemy ? 'enemies' : 'heroes'}
                      className={`text-[13px] leading-none ${source.isEnemy ? 'text-blood-300' : 'text-arcane-300'}`}
                      title={`${source.isThrow ? 'Thrown' : 'Placed'} by ${source.entityName}`}
                    >
                      {source.entitySprite && (
                        <SpriteThumbnail sprite={source.entitySprite} size={16} previewType="entity" />
                      )}
                      <span className="max-w-[120px] truncate">
                        {source.isThrow ? 'Thrown' : 'Placed'} by {source.entityName}
                      </span>
                    </NamePlate>
                  ))}
                </div>
                {/* Duration info */}
                {spellSources.some(s => s.duration && s.duration > 0) && (
                  <div className="hud-body text-stone-400 mt-0.5">
                    {spellSources.filter(s => s.duration && s.duration > 0).map((s, i) => (
                      <span key={i}>
                        {i > 0 && ', '}Lasts {s.duration} turn{s.duration !== 1 ? 's' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Duration info for base collectible */}
            {collectible.duration && collectible.duration > 0 && spellSources.length === 0 && (
              <div className={indent}>
                <span className="hud-body text-stone-400">
                  Lasts {collectible.duration} turn{collectible.duration !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className={className} data-wall-room="room">
      {content}
      <WallDark />
    </div>
  );
};
