import React, { useState, useMemo } from 'react';
import {
  getCustomCharacters,
  getCustomEnemies,
  getStatusEffectAssets,
  getCustomTileTypes,
  getCustomCollectibles,
  type CustomCharacter,
  type CustomEnemy,
  type CustomTileType,
  type CustomCollectible,
  type CustomSprite,
} from '../../utils/assetStorage';
import type { StatusEffectAsset } from '../../types/game';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { RichTextRenderer } from '../editor/RichTextEditor';

type TabId = 'characters' | 'enemies' | 'status_effects' | 'special_tiles' | 'items';

interface TabConfig {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { id: 'characters', label: 'Heroes', icon: '⚔️' },
  { id: 'enemies', label: 'Enemies', icon: '👹' },
  { id: 'status_effects', label: 'Enchantments', icon: '✨' },
  { id: 'special_tiles', label: 'Dungeon Tiles', icon: '🧱' },
  { id: 'items', label: 'Items', icon: '💎' },
];

// ============ ENTRY CARD COMPONENTS ============

interface CharacterCardProps {
  character: CustomCharacter;
  onClick: () => void;
  isSelected: boolean;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ character, onClick, isSelected }) => {
  return (
    <div
      onClick={onClick}
      className={`dungeon-card ${
        isSelected
          ? 'dungeon-card-selected border-copper-500'
          : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {character.customSprite ? (
            <SpriteThumbnail sprite={character.customSprite} size={48} />
          ) : (
            <div className="w-12 h-12 bg-copper-800 rounded-pixel flex items-center justify-center text-2xl">
              ⚔️
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-copper-400 truncate">{character.name}</div>
          {character.title && (
            <div className="text-xs text-stone-500 italic truncate">{character.title}</div>
          )}
          {character.description ? (
            <div className="text-xs text-stone-400 truncate">{character.description}</div>
          ) : (
            <div className="text-xs text-stone-400">HP: {character.health}</div>
          )}
        </div>
      </div>
    </div>
  );
};

interface EnemyCardProps {
  enemy: CustomEnemy;
  onClick: () => void;
  isSelected: boolean;
}

const EnemyCard: React.FC<EnemyCardProps> = ({ enemy, onClick, isSelected }) => {
  return (
    <div
      onClick={onClick}
      className={`dungeon-card ${
        isSelected
          ? 'dungeon-card-selected border-blood-500'
          : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {enemy.customSprite ? (
            <SpriteThumbnail sprite={enemy.customSprite} size={48} />
          ) : (
            <div className="w-12 h-12 bg-blood-800 rounded-pixel flex items-center justify-center text-2xl">
              👹
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-blood-400 truncate">{enemy.name}</div>
          {enemy.title && (
            <div className="text-xs text-stone-500 italic truncate">{enemy.title}</div>
          )}
          {enemy.description ? (
            <div className="text-xs text-stone-400 truncate">{enemy.description}</div>
          ) : (
            <div className="text-xs text-stone-400">HP: {enemy.health}</div>
          )}
        </div>
      </div>
    </div>
  );
};

interface StatusEffectCardProps {
  effect: StatusEffectAsset;
  onClick: () => void;
  isSelected: boolean;
}

const StatusEffectIcon: React.FC<{ effect: StatusEffectAsset; size?: number }> = ({ effect, size = 32 }) => {
  const iconSprite = effect.iconSprite;

  if (iconSprite.type === 'inline' && iconSprite.spriteData) {
    const spriteData = iconSprite.spriteData as CustomSprite;
    return <SpriteThumbnail sprite={spriteData} size={size} />;
  }

  return (
    <div
      className="rounded-pixel bg-arcane-800 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span className="text-lg">✨</span>
    </div>
  );
};

const StatusEffectCard: React.FC<StatusEffectCardProps> = ({ effect, onClick, isSelected }) => {
  return (
    <div
      onClick={onClick}
      className={`dungeon-card ${
        isSelected
          ? 'dungeon-card-selected border-arcane-500'
          : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <StatusEffectIcon effect={effect} size={40} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-arcane-400 truncate">{effect.name}</div>
          <div className="text-xs text-stone-400 truncate">{effect.description}</div>
        </div>
      </div>
    </div>
  );
};

interface TileCardProps {
  tile: CustomTileType;
  onClick: () => void;
  isSelected: boolean;
}

const TileCard: React.FC<TileCardProps> = ({ tile, onClick, isSelected }) => {
  return (
    <div
      onClick={onClick}
      className={`dungeon-card ${
        isSelected
          ? 'dungeon-card-selected border-rust-500'
          : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {tile.customSprite ? (
            <SpriteThumbnail sprite={tile.customSprite} size={48} />
          ) : (
            <div className={`w-12 h-12 rounded-pixel flex items-center justify-center text-2xl ${
              tile.baseType === 'wall' ? 'bg-stone-600' : 'bg-stone-800'
            }`}>
              🧱
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-rust-400 truncate">{tile.name}</div>
          {tile.description ? (
            <div className="text-xs text-stone-400 truncate">{tile.description}</div>
          ) : (
            <div className="text-xs text-stone-400">
              {tile.baseType === 'wall' ? 'Wall' : 'Floor'} | {tile.behaviors.length} behavior{tile.behaviors.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface ItemCardProps {
  item: CustomCollectible;
  onClick: () => void;
  isSelected: boolean;
}

const ItemCard: React.FC<ItemCardProps> = ({ item, onClick, isSelected }) => {
  return (
    <div
      onClick={onClick}
      className={`dungeon-card ${
        isSelected
          ? 'dungeon-card-selected border-parchment-500'
          : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {item.customSprite ? (
            <SpriteThumbnail sprite={item.customSprite} size={48} />
          ) : (
            <div className="w-12 h-12 bg-parchment-700 rounded-pixel flex items-center justify-center text-2xl">
              💎
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-parchment-400 truncate">{item.name}</div>
          {item.description ? (
            <div
              className="text-xs text-stone-400 truncate"
              dangerouslySetInnerHTML={{ __html: item.description }}
            />
          ) : (
            <div className="text-xs text-stone-400">
              {item.effects.length} effect{item.effects.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ DETAIL PANEL COMPONENTS ============

interface CharacterDetailProps {
  character: CustomCharacter;
}

const CharacterDetail: React.FC<CharacterDetailProps> = ({ character }) => {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          {character.customSprite ? (
            <SpriteThumbnail sprite={character.customSprite} size={80} />
          ) : (
            <div className="w-20 h-20 bg-copper-800 rounded-pixel flex items-center justify-center text-4xl">
              ⚔️
            </div>
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold font-medieval text-copper-400">{character.name}</h2>
          {character.title && (
            <p className="text-stone-400 italic">{character.title}</p>
          )}
          <div className="mt-2 space-y-1">
            <div className="text-sm">
              <span className="text-stone-400">Health:</span>{' '}
              <span className="text-blood-400">{'❤️'.repeat(Math.min(character.health, 10))}</span>{' '}
              <span className="text-stone-500">({character.health})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {character.description && (
        <div className="dungeon-panel-dark p-4">
          <h3 className="text-sm font-semibold text-copper-400 mb-2">Description</h3>
          <p className="text-sm text-stone-400">{character.description}</p>
        </div>
      )}

      {/* Behavior (Tooltip Steps) */}
      {character.tooltipSteps && character.tooltipSteps.length > 0 && (
        <div className="dungeon-panel-dark p-4">
          <h3 className="text-sm font-semibold text-copper-400 mb-2">Behavior</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-stone-400">
            {character.tooltipSteps.map((step, idx) => (
              <li key={idx}><RichTextRenderer html={step} /></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

interface EnemyDetailProps {
  enemy: CustomEnemy;
}

const EnemyDetail: React.FC<EnemyDetailProps> = ({ enemy }) => {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          {enemy.customSprite ? (
            <SpriteThumbnail sprite={enemy.customSprite} size={80} />
          ) : (
            <div className="w-20 h-20 bg-blood-800 rounded-pixel flex items-center justify-center text-4xl">
              👹
            </div>
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold font-medieval text-blood-400">{enemy.name}</h2>
          {enemy.title && (
            <p className="text-stone-400 italic">{enemy.title}</p>
          )}
          <div className="mt-2 space-y-1">
            <div className="text-sm">
              <span className="text-stone-400">Health:</span>{' '}
              <span className="text-blood-400">{'❤️'.repeat(Math.min(enemy.health, 10))}</span>{' '}
              <span className="text-stone-500">({enemy.health})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {enemy.description && (
        <div className="dungeon-panel-dark p-4">
          <h3 className="text-sm font-semibold text-blood-400 mb-2">Description</h3>
          <p className="text-sm text-stone-400">{enemy.description}</p>
        </div>
      )}

      {/* Behavior (Tooltip Steps) */}
      {enemy.tooltipSteps && enemy.tooltipSteps.length > 0 && (
        <div className="dungeon-panel-dark p-4">
          <h3 className="text-sm font-semibold text-blood-400 mb-2">Behavior</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-stone-400">
            {enemy.tooltipSteps.map((step, idx) => (
              <li key={idx}><RichTextRenderer html={step} /></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

interface StatusEffectDetailProps {
  effect: StatusEffectAsset;
}

const StatusEffectDetail: React.FC<StatusEffectDetailProps> = ({ effect }) => {
  // Check if there are any effects to show
  const hasEffects = effect.preventsAllActions || effect.preventsMovement ||
                     effect.preventsRanged || effect.preventsMelee ||
                     effect.removedOnDamage || effect.processAtTurnStart;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <StatusEffectIcon effect={effect} size={64} />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold font-medieval text-arcane-400">{effect.name}</h2>
          <p className="text-parchment-300 mt-1">{effect.description}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="dungeon-panel-dark p-4">
        <h3 className="text-sm font-semibold text-arcane-400 mb-2">Properties</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-stone-400">Type:</span>{' '}
            <span className="text-parchment-200">{effect.type}</span>
          </div>
          <div>
            <span className="text-stone-400">Duration:</span>{' '}
            <span className="text-parchment-200">{effect.defaultDuration} turns</span>
          </div>
          {effect.defaultValue !== undefined && (
            <div>
              <span className="text-stone-400">Value:</span>{' '}
              <span className="text-parchment-200">{effect.defaultValue}</span>
            </div>
          )}
          <div>
            <span className="text-stone-400">Stacking:</span>{' '}
            <span className="text-parchment-200">{effect.stackingBehavior}</span>
          </div>
        </div>
      </div>

      {/* Effects - only show if there are effects */}
      {hasEffects && (
        <div className="dungeon-panel-dark p-4">
          <h3 className="text-sm font-semibold text-arcane-400 mb-2">Effects</h3>
          <ul className="space-y-1 text-sm text-stone-400">
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

interface TileDetailProps {
  tile: CustomTileType;
}

const TileDetail: React.FC<TileDetailProps> = ({ tile }) => {
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

  // Check if there are any properties to show
  const hasProperties = tile.cadence?.enabled || tile.hideBehaviorIndicators;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          {tile.customSprite ? (
            <SpriteThumbnail sprite={tile.customSprite} size={80} />
          ) : (
            <div className={`w-20 h-20 rounded-pixel flex items-center justify-center text-4xl ${
              tile.baseType === 'wall' ? 'bg-stone-600' : 'bg-stone-800'
            }`}>
              🧱
            </div>
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold font-medieval text-rust-400">{tile.name}</h2>
          {tile.description && (
            <p className="text-parchment-300 mt-1">{tile.description}</p>
          )}
          <div className="mt-2">
            <span className={`dungeon-badge ${
              tile.baseType === 'wall' ? 'bg-stone-600 text-stone-200' : ''
            }`}>
              {tile.baseType === 'wall' ? 'Wall (blocks movement)' : 'Floor'}
            </span>
          </div>
          {/* Placement restriction - styled like game page */}
          {tile.preventPlacement && (
            <div className="text-xs text-blood-400/70 mt-2">
              Cannot place heroes on this tile
            </div>
          )}
        </div>
      </div>

      {/* Behaviors */}
      {tile.behaviors.length > 0 && (
        <div className="dungeon-panel-dark p-4">
          <h3 className="text-sm font-semibold text-rust-400 mb-2">Behaviors</h3>
          <ul className="space-y-1 text-sm text-stone-400">
            {tile.behaviors.map((behavior, idx) => (
              <li key={idx}>• {getBehaviorDescription(behavior)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Properties - only show if there are properties */}
      {hasProperties && (
        <div className="dungeon-panel-dark p-4">
          <h3 className="text-sm font-semibold text-rust-400 mb-2">Properties</h3>
          <ul className="space-y-1 text-sm text-stone-400">
            {tile.cadence?.enabled && <li>• Toggles on/off over time</li>}
            {tile.hideBehaviorIndicators && <li>• Behavior indicators hidden</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

interface ItemDetailProps {
  item: CustomCollectible;
}

const ItemDetail: React.FC<ItemDetailProps> = ({ item }) => {
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
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          {item.customSprite ? (
            <SpriteThumbnail sprite={item.customSprite} size={80} />
          ) : (
            <div className="w-20 h-20 bg-parchment-700 rounded-pixel flex items-center justify-center text-4xl">
              💎
            </div>
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold font-medieval text-parchment-400">{item.name}</h2>
          {item.description && (
            <div
              className="text-parchment-300 mt-1"
              dangerouslySetInnerHTML={{ __html: item.description }}
            />
          )}
          {/* Placement restriction - styled like game page */}
          {item.preventPlacement && (
            <div className="text-xs text-blood-400/70 mt-2">
              Cannot place heroes on this tile
            </div>
          )}
        </div>
      </div>

      {/* Effects */}
      {item.effects.length > 0 && (
        <div className="dungeon-panel-dark p-4">
          <h3 className="text-sm font-semibold text-parchment-400 mb-2">Effects</h3>
          <ul className="space-y-1 text-sm text-stone-400">
            {item.effects.map((effect, idx) => (
              <li key={idx}>• {getEffectDescription(effect)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Interact Info */}
      <div className="dungeon-panel-dark p-4">
        <h3 className="text-sm font-semibold text-parchment-400 mb-2">Interact</h3>
        <ul className="space-y-1 text-sm text-stone-400">
          <li>• Method: {item.pickupMethod === 'step_on' ? 'Step on tile' : item.pickupMethod}</li>
          {item.pickupPermissions.characters && <li>• Can be picked up by heroes</li>}
          {item.pickupPermissions.enemies && <li>• Can be picked up by enemies</li>}
        </ul>
      </div>
    </div>
  );
};

// ============ MOBILE DETAIL MODAL ============

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const DetailModal: React.FC<DetailModalProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      {/* Modal content - slides up from bottom */}
      <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-stone-900 border-t-2 border-stone-700 rounded-t-2xl overflow-hidden flex flex-col">
        {/* Handle bar */}
        <div className="flex justify-center py-2 flex-shrink-0">
          <div className="w-12 h-1 bg-stone-600 rounded-full" />
        </div>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-3 p-2 text-stone-400 hover:text-copper-400 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 pb-8 dungeon-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

// ============ MAIN COMPENDIUM COMPONENT ============

export const Compendium: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('characters');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load all assets - filter out built-in status effects
  const characters = useMemo(() => getCustomCharacters(), []);
  const enemies = useMemo(() => getCustomEnemies(), []);
  const statusEffects = useMemo(() => getStatusEffectAssets().filter(e => !e.isBuiltIn), []);
  const tiles = useMemo(() => getCustomTileTypes().filter(t => t.behaviors.length > 0 || t.preventPlacement || t.baseType === 'wall'), []);
  const items = useMemo(() => getCustomCollectibles(), []);

  // Filter by search
  const filteredCharacters = useMemo(() =>
    characters.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [characters, searchQuery]
  );
  const filteredEnemies = useMemo(() =>
    enemies.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [enemies, searchQuery]
  );
  const filteredStatusEffects = useMemo(() =>
    statusEffects.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [statusEffects, searchQuery]
  );
  const filteredTiles = useMemo(() =>
    tiles.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [tiles, searchQuery]
  );
  const filteredItems = useMemo(() =>
    items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [items, searchQuery]
  );

  // Get selected item details
  const selectedCharacter = selectedId ? characters.find(c => c.id === selectedId) : null;
  const selectedEnemy = selectedId ? enemies.find(e => e.id === selectedId) : null;
  const selectedEffect = selectedId ? statusEffects.find(e => e.id === selectedId) : null;
  const selectedTile = selectedId ? tiles.find(t => t.id === selectedId) : null;
  const selectedItem = selectedId ? items.find(i => i.id === selectedId) : null;

  // Get counts for badges
  const getCounts = () => ({
    characters: filteredCharacters.length,
    enemies: filteredEnemies.length,
    status_effects: filteredStatusEffects.length,
    special_tiles: filteredTiles.length,
    items: filteredItems.length,
  });
  const counts = getCounts();

  // Reset selection when tab changes
  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
    setSelectedId(null);
  };

  // Close modal (for mobile)
  const handleCloseDetail = () => {
    setSelectedId(null);
  };

  // Get detail content based on active tab
  const getDetailContent = () => {
    if (activeTab === 'characters' && selectedCharacter) {
      return <CharacterDetail character={selectedCharacter} />;
    }
    if (activeTab === 'enemies' && selectedEnemy) {
      return <EnemyDetail enemy={selectedEnemy} />;
    }
    if (activeTab === 'status_effects' && selectedEffect) {
      return <StatusEffectDetail effect={selectedEffect} />;
    }
    if (activeTab === 'special_tiles' && selectedTile) {
      return <TileDetail tile={selectedTile} />;
    }
    if (activeTab === 'items' && selectedItem) {
      return <ItemDetail item={selectedItem} />;
    }
    return null;
  };

  const detailContent = getDetailContent();

  return (
    <div className="min-h-screen theme-root text-parchment-200">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold font-medieval text-copper-400 text-shadow-dungeon mb-2">Compendium</h1>
          <p className="text-stone-400">Browse all dungeon elements - heroes, enemies, enchantments, tiles, and treasure.</p>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="dungeon-input w-full md:w-64"
          />
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b-2 border-stone-700 pb-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`dungeon-tab flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'dungeon-tab-active'
                  : ''
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-pixel ${
                activeTab === tab.id ? 'bg-copper-800 text-copper-200' : 'bg-stone-700 text-stone-400'
              }`}>
                {counts[tab.id]}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* List - full width on mobile, half on desktop */}
          <div className="w-full lg:w-1/2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeTab === 'characters' && filteredCharacters.map((char) => (
                <CharacterCard
                  key={char.id}
                  character={char}
                  onClick={() => setSelectedId(char.id)}
                  isSelected={selectedId === char.id}
                />
              ))}
              {activeTab === 'enemies' && filteredEnemies.map((enemy) => (
                <EnemyCard
                  key={enemy.id}
                  enemy={enemy}
                  onClick={() => setSelectedId(enemy.id)}
                  isSelected={selectedId === enemy.id}
                />
              ))}
              {activeTab === 'status_effects' && filteredStatusEffects.map((effect) => (
                <StatusEffectCard
                  key={effect.id}
                  effect={effect}
                  onClick={() => setSelectedId(effect.id)}
                  isSelected={selectedId === effect.id}
                />
              ))}
              {activeTab === 'special_tiles' && filteredTiles.map((tile) => (
                <TileCard
                  key={tile.id}
                  tile={tile}
                  onClick={() => setSelectedId(tile.id)}
                  isSelected={selectedId === tile.id}
                />
              ))}
              {activeTab === 'items' && filteredItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onClick={() => setSelectedId(item.id)}
                  isSelected={selectedId === item.id}
                />
              ))}
            </div>

            {/* Empty state */}
            {activeTab === 'characters' && filteredCharacters.length === 0 && (
              <div className="text-center py-12 text-stone-500">
                {searchQuery ? 'No heroes match your search' : 'No heroes yet'}
              </div>
            )}
            {activeTab === 'enemies' && filteredEnemies.length === 0 && (
              <div className="text-center py-12 text-stone-500">
                {searchQuery ? 'No enemies match your search' : 'No enemies yet'}
              </div>
            )}
            {activeTab === 'status_effects' && filteredStatusEffects.length === 0 && (
              <div className="text-center py-12 text-stone-500">
                {searchQuery ? 'No enchantments match your search' : 'No custom enchantments yet'}
              </div>
            )}
            {activeTab === 'special_tiles' && filteredTiles.length === 0 && (
              <div className="text-center py-12 text-stone-500">
                {searchQuery ? 'No dungeon tiles match your search' : 'No dungeon tiles yet'}
              </div>
            )}
            {activeTab === 'items' && filteredItems.length === 0 && (
              <div className="text-center py-12 text-stone-500">
                {searchQuery ? 'No treasure matches your search' : 'No treasure yet'}
              </div>
            )}
          </div>

          {/* Detail Panel - hidden on mobile, shown on desktop */}
          <div className="hidden lg:block lg:w-1/2">
            <div className="dungeon-panel p-6 min-h-[400px] sticky top-4">
              {!selectedId && (
                <div className="flex items-center justify-center h-full text-stone-500">
                  <p>Select an entry to view details</p>
                </div>
              )}
              {detailContent}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Detail Modal */}
      <DetailModal isOpen={!!selectedId} onClose={handleCloseDetail}>
        {detailContent}
      </DetailModal>
    </div>
  );
};
