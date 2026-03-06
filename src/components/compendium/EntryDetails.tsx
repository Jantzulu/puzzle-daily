import React, { useMemo } from 'react';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import {
  getAllPuzzleSkins,
  type CustomCharacter,
  type CustomEnemy,
  type CustomTileType,
  type CustomCollectible,
} from '../../utils/assetStorage';
import type { StatusEffectAsset } from '../../types/game';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { RichTextRenderer } from '../editor/RichTextEditor';
import { TileSpritePreview, StatusEffectIcon } from './EntryCards';

// ============ SHARED UI HELPERS ============

const Divider: React.FC = () => (
  <div className="compendium-divider">
    <span className="compendium-divider-ornament">◆ ◆ ◆</span>
  </div>
);

// ============ DETAIL COMPONENTS ============
// Styled for the parchment book context using compendium-detail-section

export const CharacterDetail: React.FC<{ character: CustomCharacter }> = ({ character }) => {
  return (
    <div className="space-y-4">
      {/* Sprite Showcase */}
      <div className="compendium-sprite-showcase">
        <div className="compendium-sprite-frame compendium-sprite-frame--hero">
          {character.customSprite ? (
            <SpriteThumbnail sprite={character.customSprite} size={120} previewType="entity" />
          ) : (
            <div className="w-[120px] h-[120px] flex items-center justify-center text-6xl">
              ⚔️
            </div>
          )}
        </div>
      </div>

      {/* Name & Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold font-medieval compendium-accent-heroes">{character.name}</h2>
        {character.title && (
          <p className="italic mt-0.5" style={{ color: 'var(--text-muted)' }}>{character.title}</p>
        )}
        <div className="mt-2 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>Health:</span>{' '}
          <span className="compendium-accent-enemies">{'❤️'.repeat(Math.min(character.health, 10))}</span>{' '}
          <span style={{ color: 'var(--text-muted)' }}>({character.health})</span>
        </div>
      </div>

      <Divider />

      {/* Description */}
      {character.description && (
        <div className="compendium-detail-section">
          <h3>Description</h3>
          <p className="text-sm compendium-drop-cap" style={{ color: 'var(--text-primary)' }}>{character.description}</p>
        </div>
      )}

      {/* Behavior (Tooltip Steps) */}
      {character.tooltipSteps && character.tooltipSteps.length > 0 && (
        <div className="compendium-detail-section">
          <h3>Behavior</h3>
          <ul className="list-disc list-inside space-y-1 text-sm" style={{ color: 'var(--text-primary)' }}>
            {character.tooltipSteps.map((step, idx) => (
              <li key={idx}><RichTextRenderer html={step} /></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export const EnemyDetail: React.FC<{ enemy: CustomEnemy }> = ({ enemy }) => {
  return (
    <div className="space-y-4">
      {/* Sprite Showcase */}
      <div className="compendium-sprite-showcase">
        <div className="compendium-sprite-frame compendium-sprite-frame--enemy">
          {enemy.customSprite ? (
            <SpriteThumbnail sprite={enemy.customSprite} size={120} previewType="entity" />
          ) : (
            <div className="w-[120px] h-[120px] flex items-center justify-center text-6xl">
              👹
            </div>
          )}
        </div>
      </div>

      {/* Name & Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold font-medieval compendium-accent-enemies">{enemy.name}</h2>
        {enemy.title && (
          <p className="italic mt-0.5" style={{ color: 'var(--text-muted)' }}>{enemy.title}</p>
        )}
        <div className="mt-2 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>Health:</span>{' '}
          <span className="compendium-accent-enemies">{'❤️'.repeat(Math.min(enemy.health, 10))}</span>{' '}
          <span style={{ color: 'var(--text-muted)' }}>({enemy.health})</span>
        </div>
      </div>

      <Divider />

      {/* Description */}
      {enemy.description && (
        <div className="compendium-detail-section">
          <h3>Description</h3>
          <p className="text-sm compendium-drop-cap" style={{ color: 'var(--text-primary)' }}>{enemy.description}</p>
        </div>
      )}

      {/* Behavior (Tooltip Steps) */}
      {enemy.tooltipSteps && enemy.tooltipSteps.length > 0 && (
        <div className="compendium-detail-section">
          <h3>Behavior</h3>
          <ul className="list-disc list-inside space-y-1 text-sm" style={{ color: 'var(--text-primary)' }}>
            {enemy.tooltipSteps.map((step, idx) => (
              <li key={idx}><RichTextRenderer html={step} /></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export const StatusEffectDetail: React.FC<{ effect: StatusEffectAsset }> = ({ effect }) => {
  const hasEffects = effect.preventsAllActions || effect.preventsMovement ||
                     effect.preventsRanged || effect.preventsMelee ||
                     effect.removedOnDamage || effect.processAtTurnStart;

  return (
    <div className="space-y-4">
      {/* Enchantment Icon Showcase */}
      <div className="compendium-sprite-showcase">
        <div className="compendium-enchantment-glow">
          <StatusEffectIcon effect={effect} size={80} />
        </div>
      </div>

      {/* Name & Description */}
      <div className="text-center">
        <h2 className="text-2xl font-bold font-medieval compendium-accent-enchantments">{effect.name}</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-primary)' }}>{effect.description}</p>
      </div>

      <Divider />

      {/* Stats */}
      <div className="compendium-detail-section">
        <h3>Properties</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Type:</span>{' '}
            <span style={{ color: 'var(--text-primary)' }}>{effect.type}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Duration:</span>{' '}
            <span style={{ color: 'var(--text-primary)' }}>{effect.defaultDuration} turns</span>
          </div>
          {effect.defaultValue !== undefined && (
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Value:</span>{' '}
              <span style={{ color: 'var(--text-primary)' }}>{effect.defaultValue}</span>
            </div>
          )}
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Stacking:</span>{' '}
            <span style={{ color: 'var(--text-primary)' }}>{effect.stackingBehavior}</span>
          </div>
        </div>
      </div>

      {/* Effects */}
      {hasEffects && (
        <div className="compendium-detail-section">
          <h3>Effects</h3>
          <ul className="space-y-1 text-sm" style={{ color: 'var(--text-primary)' }}>
            {effect.preventsAllActions && <li>• Prevents all actions</li>}
            {effect.preventsMovement && <li>• Prevents movement</li>}
            {effect.preventsRanged && <li>• Prevents ranged attacks</li>}
            {effect.preventsMelee && <li>• Prevents melee attacks</li>}
            {effect.removedOnDamage && <li>• Removed when damaged</li>}
            {effect.processAtTurnStart && <li>• Processes at turn start</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

export const TileDetail: React.FC<{ tile: CustomTileType }> = ({ tile }) => {
  const getBehaviorDescription = (behavior: CustomTileType['behaviors'][0]) => {
    switch (behavior.type) {
      case 'damage':
        return `Deals ${behavior.damageAmount || 1} damage${behavior.damageOnce ? ' (once)' : ''}`;
      case 'teleport':
        return 'Teleports to linked tiles';
      case 'direction_change':
        return `Changes facing to ${behavior.newFacing || 'a direction'}`;
      case 'ice':
        return 'Slides until hitting an obstacle';
      case 'pressure_plate':
        return 'Pressure plate - triggers effects when stepped on';
      default:
        return behavior.type;
    }
  };

  const hasOffStateBehaviors = tile.offStateBehaviors && tile.offStateBehaviors.length > 0;
  const hasProperties = tile.cadence?.enabled || tile.hideBehaviorIndicators || tile.onStateBlocksMovement;

  const skinVariations = useMemo(() => {
    const skins = getAllPuzzleSkins();
    const variations: { skinName: string; onSprite?: string; offSprite?: string }[] = [];

    for (const skin of skins) {
      if (skin.customTileSprites?.[tile.id]) {
        const spriteEntry = skin.customTileSprites[tile.id];
        if (typeof spriteEntry === 'string') {
          variations.push({ skinName: skin.name, onSprite: spriteEntry });
        } else {
          if (spriteEntry.onSprite || spriteEntry.offSprite) {
            variations.push({
              skinName: skin.name,
              onSprite: spriteEntry.onSprite,
              offSprite: spriteEntry.offSprite
            });
          }
        }
      }
    }
    return variations;
  }, [tile.id]);

  return (
    <div className="space-y-4">
      {/* Sprite Showcase */}
      <div className="compendium-sprite-showcase">
        <div className="compendium-sprite-frame compendium-sprite-frame--tile">
          {tile.customSprite ? (
            <SpriteThumbnail sprite={tile.customSprite} size={120} previewType="asset" />
          ) : (
            <div className="w-[120px] h-[120px] flex items-center justify-center text-6xl">
              🧱
            </div>
          )}
        </div>
      </div>

      {/* Name & Info */}
      <div className="text-center">
        <h2 className="text-2xl font-bold font-medieval compendium-accent-tiles">{tile.name}</h2>
        {tile.description && (
          <p className="mt-1 text-sm" style={{ color: 'var(--text-primary)' }}>{tile.description}</p>
        )}
        <div className="mt-2">
          <span className="compendium-badge">
            {tile.baseType === 'wall' ? 'Wall (blocks movement)' : 'Floor'}
          </span>
        </div>
        {tile.preventPlacement && (
          <div className="text-xs mt-2 compendium-accent-enemies">
            Cannot place heroes on this tile
          </div>
        )}
      </div>

      <Divider />

      {/* Behaviors (On State) */}
      {tile.behaviors.length > 0 && (
        <div className="compendium-detail-section">
          <h3>{hasOffStateBehaviors ? 'Behaviors (On State)' : 'Behaviors'}</h3>
          <ul className="space-y-1 text-sm" style={{ color: 'var(--text-primary)' }}>
            {tile.behaviors.map((behavior, idx) => (
              <li key={idx}>• {getBehaviorDescription(behavior)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Behaviors (Off State) */}
      {hasOffStateBehaviors && (
        <div className="compendium-detail-section">
          <h3>Behaviors (Off State)</h3>
          <ul className="space-y-1 text-sm" style={{ color: 'var(--text-primary)' }}>
            {tile.offStateBehaviors!.map((behavior, idx) => (
              <li key={idx}>• {getBehaviorDescription(behavior)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Properties */}
      {hasProperties && (
        <div className="compendium-detail-section">
          <h3>Properties</h3>
          <ul className="space-y-1 text-sm" style={{ color: 'var(--text-primary)' }}>
            {tile.cadence?.enabled && <li>• Toggles on/off over time</li>}
            {tile.onStateBlocksMovement && <li>• Blocks movement when active (on)</li>}
            {tile.hideBehaviorIndicators && <li>• Behavior indicators hidden</li>}
          </ul>
        </div>
      )}

      {/* Cadence States */}
      {tile.offStateSprite && (
        <div className="compendium-detail-section">
          <h3>Cadence States</h3>
          <div className="flex gap-4">
            {tile.customSprite && (
              <div className="flex flex-col items-center gap-1">
                <div className="rounded p-1" style={{ background: 'rgba(74, 51, 24, 0.08)' }}>
                  <SpriteThumbnail sprite={tile.customSprite} size={48} previewType="asset" />
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>On State</span>
              </div>
            )}
            <div className="flex flex-col items-center gap-1">
              <div className="rounded p-1" style={{ background: 'rgba(74, 51, 24, 0.08)' }}>
                <img
                  src={tile.offStateSprite.idleImageData || tile.offStateSprite.imageData}
                  alt="Off state"
                  className="w-12 h-12 object-contain"
                />
              </div>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Off State</span>
            </div>
          </div>
        </div>
      )}

      {/* Alternate Appearances */}
      {skinVariations.length > 0 && (
        <div className="compendium-detail-section">
          <h3>Alternate Appearances</h3>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Other visual styles for this tile</p>
          <div className="flex flex-wrap gap-2">
            {skinVariations.map((variation, idx) => (
              <React.Fragment key={idx}>
                {variation.onSprite && (
                  <TileSpritePreview
                    src={variation.onSprite}
                    title={variation.skinName}
                    size={48}
                  />
                )}
                {variation.offSprite && (
                  <TileSpritePreview
                    src={variation.offSprite}
                    title={`${variation.skinName} (Off)`}
                    size={48}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const ItemDetail: React.FC<{ item: CustomCollectible }> = ({ item }) => {
  const getEffectDescription = (effect: CustomCollectible['effects'][0]) => {
    switch (effect.type) {
      case 'heal':
        return `Heals ${effect.value || 1} health`;
      case 'damage':
        return `Deals ${effect.value || 1} damage`;
      case 'score':
        return `Awards ${effect.value || 0} points`;
      case 'status_effect':
        return 'Applies a status effect';
      case 'key':
        return 'Key item';
      default:
        return effect.type;
    }
  };

  return (
    <div className="space-y-4">
      {/* Sprite Showcase */}
      <div className="compendium-sprite-showcase">
        <div className="compendium-sprite-frame compendium-sprite-frame--item">
          {item.customSprite ? (
            <SpriteThumbnail sprite={item.customSprite} size={96} previewType="asset" />
          ) : (
            <div className="w-[96px] h-[96px] flex items-center justify-center text-5xl">
              💎
            </div>
          )}
        </div>
      </div>

      {/* Name & Description */}
      <div className="text-center">
        <h2 className="text-2xl font-bold font-medieval compendium-accent-items">{item.name}</h2>
        {item.description && (
          <div
            className="mt-1 text-sm"
            style={{ color: 'var(--text-primary)' }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.description) }}
          />
        )}
        {item.preventPlacement && (
          <div className="text-xs mt-2 compendium-accent-enemies">
            Cannot place heroes on this tile
          </div>
        )}
      </div>

      <Divider />

      {/* Effects */}
      {item.effects.length > 0 && (
        <div className="compendium-detail-section">
          <h3>Effects</h3>
          <ul className="space-y-1 text-sm" style={{ color: 'var(--text-primary)' }}>
            {item.effects.map((effect, idx) => (
              <li key={idx}>• {getEffectDescription(effect)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Interact Info */}
      <div className="compendium-detail-section">
        <h3>Interact</h3>
        <ul className="space-y-1 text-sm" style={{ color: 'var(--text-primary)' }}>
          <li>• Method: {item.pickupMethod === 'step_on' ? 'Step on tile' : item.pickupMethod}</li>
          {item.pickupPermissions.characters && <li>• Can be picked up by heroes</li>}
          {item.pickupPermissions.enemies && <li>• Can be picked up by enemies</li>}
        </ul>
      </div>
    </div>
  );
};
