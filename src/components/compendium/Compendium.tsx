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
  { id: 'characters', label: 'Characters', icon: '👤' },
  { id: 'enemies', label: 'Enemies', icon: '👹' },
  { id: 'status_effects', label: 'Status Effects', icon: '✨' },
  { id: 'special_tiles', label: 'Special Tiles', icon: '🔲' },
  { id: 'items', label: 'Items', icon: '⭐' },
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
      className={`p-3 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? 'bg-green-900/50 ring-2 ring-green-500'
          : 'bg-gray-700 hover:bg-gray-600'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {character.customSprite ? (
            <SpriteThumbnail sprite={character.customSprite} size={48} />
          ) : (
            <div className="w-12 h-12 bg-green-700 rounded flex items-center justify-center text-2xl">
              👤
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-green-400 truncate">{character.name}</div>
          <div className="text-xs text-gray-400">
            HP: {character.health} | Behavior: {character.behavior?.length || 0} actions
          </div>
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
      className={`p-3 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? 'bg-red-900/50 ring-2 ring-red-500'
          : 'bg-gray-700 hover:bg-gray-600'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {enemy.customSprite ? (
            <SpriteThumbnail sprite={enemy.customSprite} size={48} />
          ) : (
            <div className="w-12 h-12 bg-red-700 rounded flex items-center justify-center text-2xl">
              👹
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-red-400 truncate">{enemy.name}</div>
          {enemy.title && (
            <div className="text-xs text-gray-500 italic truncate">{enemy.title}</div>
          )}
          <div className="text-xs text-gray-400">HP: {enemy.health}</div>
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
      className="rounded bg-purple-700 flex items-center justify-center"
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
      className={`p-3 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? 'bg-purple-900/50 ring-2 ring-purple-500'
          : 'bg-gray-700 hover:bg-gray-600'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <StatusEffectIcon effect={effect} size={40} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-purple-400 truncate">
            {effect.name}
            {effect.isBuiltIn && (
              <span className="ml-2 text-xs bg-gray-600 text-gray-300 px-1.5 py-0.5 rounded">
                Built-in
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 truncate">{effect.description}</div>
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
      className={`p-3 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? 'bg-blue-900/50 ring-2 ring-blue-500'
          : 'bg-gray-700 hover:bg-gray-600'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {tile.customSprite ? (
            <SpriteThumbnail sprite={tile.customSprite} size={48} />
          ) : (
            <div className={`w-12 h-12 rounded flex items-center justify-center text-2xl ${
              tile.baseType === 'wall' ? 'bg-gray-600' : 'bg-gray-800'
            }`}>
              🔲
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-blue-400 truncate">{tile.name}</div>
          <div className="text-xs text-gray-400">
            {tile.baseType === 'wall' ? 'Wall' : 'Floor'} | {tile.behaviors.length} behavior{tile.behaviors.length !== 1 ? 's' : ''}
          </div>
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
      className={`p-3 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? 'bg-yellow-900/50 ring-2 ring-yellow-500'
          : 'bg-gray-700 hover:bg-gray-600'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {item.customSprite ? (
            <SpriteThumbnail sprite={item.customSprite} size={48} />
          ) : (
            <div className="w-12 h-12 bg-yellow-700 rounded flex items-center justify-center text-2xl">
              ⭐
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-yellow-400 truncate">{item.name}</div>
          <div className="text-xs text-gray-400">
            {item.effects.length} effect{item.effects.length !== 1 ? 's' : ''}
          </div>
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
            <div className="w-20 h-20 bg-green-700 rounded flex items-center justify-center text-4xl">
              👤
            </div>
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-green-400">{character.name}</h2>
          <div className="mt-2 space-y-1">
            <div className="text-sm">
              <span className="text-gray-400">Health:</span>{' '}
              <span className="text-red-400">{'❤️'.repeat(character.health)}</span>{' '}
              <span className="text-gray-500">({character.health})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Behavior Pattern */}
      {character.behavior && character.behavior.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Behavior Pattern</h3>
          <div className="space-y-2">
            {character.behavior.map((action, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">{idx + 1}.</span>
                <span className="text-gray-300">
                  {action.type === 'move' && `Move ${action.direction || 'forward'}`}
                  {action.type === 'attack' && 'Attack'}
                  {action.type === 'spell' && `Cast ${action.spellId || 'spell'}`}
                  {action.type === 'wait' && 'Wait'}
                  {action.type === 'turn' && `Turn ${action.turnDirection || ''}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tooltip Steps (if any) */}
      {character.tooltipSteps && character.tooltipSteps.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Description</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-400">
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
            <div className="w-20 h-20 bg-red-700 rounded flex items-center justify-center text-4xl">
              👹
            </div>
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-red-400">{enemy.name}</h2>
          {enemy.title && (
            <p className="text-gray-400 italic">{enemy.title}</p>
          )}
          <div className="mt-2 space-y-1">
            <div className="text-sm">
              <span className="text-gray-400">Health:</span>{' '}
              <span className="text-red-400">{'❤️'.repeat(Math.min(enemy.health, 10))}</span>{' '}
              <span className="text-gray-500">({enemy.health})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Behavior Pattern */}
      {enemy.behavior?.pattern && enemy.behavior.pattern.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Behavior Pattern</h3>
          <div className="space-y-2">
            {enemy.behavior.pattern.map((action, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">{idx + 1}.</span>
                <span className="text-gray-300">
                  {action.type === 'move' && `Move ${action.direction || 'forward'}`}
                  {action.type === 'attack' && 'Attack'}
                  {action.type === 'spell' && `Cast ${action.spellId || 'spell'}`}
                  {action.type === 'wait' && 'Wait'}
                  {action.type === 'turn' && `Turn ${action.turnDirection || ''}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tooltip Steps (if any) */}
      {enemy.tooltipSteps && enemy.tooltipSteps.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Description</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-400">
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
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <StatusEffectIcon effect={effect} size={64} />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-purple-400">
            {effect.name}
            {effect.isBuiltIn && (
              <span className="ml-2 text-sm bg-gray-600 text-gray-300 px-2 py-1 rounded">
                Built-in
              </span>
            )}
          </h2>
          <p className="text-gray-300 mt-1">{effect.description}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Properties</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-400">Type:</span>{' '}
            <span className="text-gray-200">{effect.type}</span>
          </div>
          <div>
            <span className="text-gray-400">Duration:</span>{' '}
            <span className="text-gray-200">{effect.defaultDuration} turns</span>
          </div>
          {effect.defaultValue !== undefined && (
            <div>
              <span className="text-gray-400">Value:</span>{' '}
              <span className="text-gray-200">{effect.defaultValue}</span>
            </div>
          )}
          <div>
            <span className="text-gray-400">Stacking:</span>{' '}
            <span className="text-gray-200">{effect.stackingBehavior}</span>
          </div>
        </div>
      </div>

      {/* Effects */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Effects</h3>
        <ul className="space-y-1 text-sm text-gray-400">
          {effect.preventsAllActions && <li>• Prevents all actions</li>}
          {effect.preventsMovement && <li>• Prevents movement</li>}
          {effect.preventsRanged && <li>• Prevents ranged attacks</li>}
          {effect.preventsMelee && <li>• Prevents melee attacks</li>}
          {effect.removedOnDamage && <li>• Removed when damaged</li>}
          {effect.processAtTurnStart && <li>• Processes at turn start</li>}
          {!effect.preventsAllActions && !effect.preventsMovement && !effect.preventsRanged && !effect.preventsMelee && (
            <li className="text-gray-500">No action restrictions</li>
          )}
        </ul>
      </div>
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          {tile.customSprite ? (
            <SpriteThumbnail sprite={tile.customSprite} size={80} />
          ) : (
            <div className={`w-20 h-20 rounded flex items-center justify-center text-4xl ${
              tile.baseType === 'wall' ? 'bg-gray-600' : 'bg-gray-800'
            }`}>
              🔲
            </div>
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-blue-400">{tile.name}</h2>
          {tile.description && (
            <p className="text-gray-300 mt-1">{tile.description}</p>
          )}
          <div className="mt-2">
            <span className={`text-xs px-2 py-1 rounded ${
              tile.baseType === 'wall' ? 'bg-gray-600 text-gray-200' : 'bg-gray-700 text-gray-300'
            }`}>
              {tile.baseType === 'wall' ? 'Wall (blocks movement)' : 'Floor'}
            </span>
          </div>
        </div>
      </div>

      {/* Behaviors */}
      {tile.behaviors.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Behaviors</h3>
          <ul className="space-y-1 text-sm text-gray-400">
            {tile.behaviors.map((behavior, idx) => (
              <li key={idx}>• {getBehaviorDescription(behavior)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Properties */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Properties</h3>
        <ul className="space-y-1 text-sm text-gray-400">
          {tile.preventPlacement && <li>• Cannot place characters here during setup</li>}
          {tile.cadence?.enabled && <li>• Toggles on/off over time</li>}
          {tile.hideBehaviorIndicators && <li>• Behavior indicators hidden</li>}
          {!tile.preventPlacement && !tile.cadence?.enabled && (
            <li className="text-gray-500">No special properties</li>
          )}
        </ul>
      </div>
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
            <div className="w-20 h-20 bg-yellow-700 rounded flex items-center justify-center text-4xl">
              ⭐
            </div>
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-yellow-400">{item.name}</h2>
          {item.description && (
            <div
              className="text-gray-300 mt-1"
              dangerouslySetInnerHTML={{ __html: item.description }}
            />
          )}
        </div>
      </div>

      {/* Effects */}
      {item.effects.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Effects</h3>
          <ul className="space-y-1 text-sm text-gray-400">
            {item.effects.map((effect, idx) => (
              <li key={idx}>• {getEffectDescription(effect)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Pickup Info */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Pickup</h3>
        <ul className="space-y-1 text-sm text-gray-400">
          <li>• Method: {item.pickupMethod === 'step_on' ? 'Step on tile' : item.pickupMethod}</li>
          {item.pickupPermissions.characters && <li>• Can be picked up by characters</li>}
          {item.pickupPermissions.enemies && <li>• Can be picked up by enemies</li>}
          {item.preventPlacement && <li>• Cannot place characters here during setup</li>}
        </ul>
      </div>
    </div>
  );
};

// ============ MAIN COMPENDIUM COMPONENT ============

export const Compendium: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('characters');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load all assets
  const characters = useMemo(() => getCustomCharacters(), []);
  const enemies = useMemo(() => getCustomEnemies(), []);
  const statusEffects = useMemo(() => getStatusEffectAssets(), []);
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

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Compendium</h1>
          <p className="text-gray-400">Browse all game elements - characters, enemies, effects, tiles, and items.</p>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-64 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-700 pb-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                activeTab === tab.id ? 'bg-blue-500' : 'bg-gray-700'
              }`}>
                {counts[tab.id]}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* List */}
          <div className="lg:w-1/2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <div className="text-center py-12 text-gray-500">
                {searchQuery ? 'No characters match your search' : 'No characters yet'}
              </div>
            )}
            {activeTab === 'enemies' && filteredEnemies.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {searchQuery ? 'No enemies match your search' : 'No enemies yet'}
              </div>
            )}
            {activeTab === 'status_effects' && filteredStatusEffects.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {searchQuery ? 'No status effects match your search' : 'No status effects yet'}
              </div>
            )}
            {activeTab === 'special_tiles' && filteredTiles.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {searchQuery ? 'No special tiles match your search' : 'No special tiles yet'}
              </div>
            )}
            {activeTab === 'items' && filteredItems.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {searchQuery ? 'No items match your search' : 'No items yet'}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          <div className="lg:w-1/2">
            <div className="bg-gray-800 rounded-lg p-6 min-h-[400px] sticky top-4">
              {!selectedId && (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <p>Select an entry to view details</p>
                </div>
              )}
              {activeTab === 'characters' && selectedCharacter && (
                <CharacterDetail character={selectedCharacter} />
              )}
              {activeTab === 'enemies' && selectedEnemy && (
                <EnemyDetail enemy={selectedEnemy} />
              )}
              {activeTab === 'status_effects' && selectedEffect && (
                <StatusEffectDetail effect={selectedEffect} />
              )}
              {activeTab === 'special_tiles' && selectedTile && (
                <TileDetail tile={selectedTile} />
              )}
              {activeTab === 'items' && selectedItem && (
                <ItemDetail item={selectedItem} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
