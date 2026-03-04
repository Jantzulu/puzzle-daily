import React, { useMemo } from 'react';
import {
  getAllPuzzleSkins,
  type CustomCharacter,
  type CustomEnemy,
  type CustomTileType,
  type CustomCollectible,
  type CustomSprite,
} from '../../utils/assetStorage';
import type { StatusEffectAsset } from '../../types/game';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';

// ============ SHARED HELPERS ============

interface TileSpritePreviewProps {
  src: string;
  title?: string;
  size?: number;
}

const TileSpritePreview: React.FC<TileSpritePreviewProps> = ({ src, title, size = 32 }) => {
  return (
    <div
      className="rounded pixelated"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${src})`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        imageRendering: 'pixelated',
      }}
      title={title}
    />
  );
};

const StatusEffectIcon: React.FC<{ effect: StatusEffectAsset; size?: number }> = ({ effect, size = 32 }) => {
  const iconSprite = effect.iconSprite;

  if (iconSprite.type === 'inline' && iconSprite.spriteData) {
    const spriteData = iconSprite.spriteData as CustomSprite;
    return <SpriteThumbnail sprite={spriteData} size={size} previewType="asset" />;
  }

  return (
    <div
      className="rounded-pixel flex items-center justify-center"
      style={{ width: size, height: size, background: 'rgba(74, 51, 24, 0.1)' }}
    >
      <span className="text-lg">✨</span>
    </div>
  );
};

// ============ ENTRY CARD COMPONENTS ============
// Cards styled for parchment book context (compendium-entry)

interface CardProps {
  onClick: () => void;
  isSelected: boolean;
}

export const CharacterCard: React.FC<CardProps & { character: CustomCharacter }> = ({ character, onClick, isSelected }) => {
  return (
    <div
      onClick={onClick}
      className={`compendium-entry ${isSelected ? 'compendium-entry--selected' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {character.customSprite ? (
            <SpriteThumbnail sprite={character.customSprite} size={40} previewType="entity" />
          ) : (
            <div className="w-10 h-10 rounded-pixel flex items-center justify-center text-xl" style={{ background: 'rgba(74, 51, 24, 0.1)' }}>
              ⚔️
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medieval font-semibold compendium-accent-heroes truncate">{character.name}</div>
          {character.title && (
            <div className="text-xs italic truncate" style={{ color: 'var(--text-muted)' }}>{character.title}</div>
          )}
          {character.description ? (
            <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{character.description}</div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>HP: {character.health}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export const EnemyCard: React.FC<CardProps & { enemy: CustomEnemy }> = ({ enemy, onClick, isSelected }) => {
  return (
    <div
      onClick={onClick}
      className={`compendium-entry ${isSelected ? 'compendium-entry--selected' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {enemy.customSprite ? (
            <SpriteThumbnail sprite={enemy.customSprite} size={40} previewType="entity" />
          ) : (
            <div className="w-10 h-10 rounded-pixel flex items-center justify-center text-xl" style={{ background: 'rgba(74, 51, 24, 0.1)' }}>
              👹
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medieval font-semibold compendium-accent-enemies truncate">{enemy.name}</div>
          {enemy.title && (
            <div className="text-xs italic truncate" style={{ color: 'var(--text-muted)' }}>{enemy.title}</div>
          )}
          {enemy.description ? (
            <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{enemy.description}</div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>HP: {enemy.health}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export const StatusEffectCard: React.FC<CardProps & { effect: StatusEffectAsset }> = ({ effect, onClick, isSelected }) => {
  return (
    <div
      onClick={onClick}
      className={`compendium-entry ${isSelected ? 'compendium-entry--selected' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <StatusEffectIcon effect={effect} size={36} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medieval font-semibold compendium-accent-enchantments truncate">{effect.name}</div>
          <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{effect.description}</div>
        </div>
      </div>
    </div>
  );
};

export const TileCard: React.FC<CardProps & { tile: CustomTileType }> = ({ tile, onClick, isSelected }) => {
  const skinVariations = useMemo(() => {
    const skins = getAllPuzzleSkins();
    const variations: { skinName: string; sprite: string }[] = [];

    for (const skin of skins) {
      if (skin.customTileSprites?.[tile.id]) {
        const spriteEntry = skin.customTileSprites[tile.id];
        const spriteData = typeof spriteEntry === 'string'
          ? spriteEntry
          : spriteEntry.onSprite;
        if (spriteData) {
          variations.push({ skinName: skin.name, sprite: spriteData });
        }
      }
    }
    return variations;
  }, [tile.id]);

  const hasVariations = tile.offStateSprite || skinVariations.length > 0;

  return (
    <div
      onClick={onClick}
      className={`compendium-entry ${isSelected ? 'compendium-entry--selected' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {tile.customSprite ? (
            <SpriteThumbnail sprite={tile.customSprite} size={40} previewType="asset" />
          ) : (
            <div
              className="w-10 h-10 rounded-pixel flex items-center justify-center text-xl"
              style={{ background: tile.baseType === 'wall' ? 'rgba(74, 51, 24, 0.15)' : 'rgba(74, 51, 24, 0.08)' }}
            >
              🧱
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medieval font-semibold compendium-accent-tiles truncate">{tile.name}</div>
          {tile.description ? (
            <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{tile.description}</div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {tile.baseType === 'wall' ? 'Wall' : 'Floor'} | {tile.behaviors.length} behavior{tile.behaviors.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
      {hasVariations && (
        <div className="mt-1.5 pt-1.5 flex items-center gap-1 flex-wrap" style={{ borderTop: '1px solid var(--border-warm)' }}>
          {tile.offStateSprite && (
            <TileSpritePreview
              src={tile.offStateSprite.idleImageData || tile.offStateSprite.imageData}
              title="Off State"
              size={22}
            />
          )}
          {skinVariations.map((v, idx) => (
            <TileSpritePreview
              key={idx}
              src={v.sprite}
              title={v.skinName}
              size={22}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ItemCard: React.FC<CardProps & { item: CustomCollectible }> = ({ item, onClick, isSelected }) => {
  return (
    <div
      onClick={onClick}
      className={`compendium-entry ${isSelected ? 'compendium-entry--selected' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {item.customSprite ? (
            <SpriteThumbnail sprite={item.customSprite} size={40} previewType="asset" />
          ) : (
            <div className="w-10 h-10 rounded-pixel flex items-center justify-center text-xl" style={{ background: 'rgba(74, 51, 24, 0.1)' }}>
              💎
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medieval font-semibold compendium-accent-items truncate">{item.name}</div>
          {item.description ? (
            <div
              className="text-xs truncate"
              style={{ color: 'var(--text-muted)' }}
              dangerouslySetInnerHTML={{ __html: item.description }}
            />
          ) : (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {item.effects.length} effect{item.effects.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Re-export helpers used by EntryDetails
export { TileSpritePreview, StatusEffectIcon };
