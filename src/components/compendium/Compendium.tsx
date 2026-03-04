import React, { useState, useMemo, useEffect } from 'react';
import {
  getCustomCharacters,
  getCustomEnemies,
  getStatusEffectAssets,
  getCustomTileTypes,
  getCustomCollectibles,
} from '../../utils/assetStorage';
import { loadThemeAssets, subscribeToThemeAssets, type ThemeAssets } from '../../utils/themeAssets';
import { BookLayout, SinglePageLayout } from './BookLayout';
import { ChapterNav, type ChapterTab } from './ChapterNav';
import {
  CharacterCard,
  EnemyCard,
  StatusEffectCard,
  TileCard,
  ItemCard,
} from './EntryCards';
import {
  CharacterDetail,
  EnemyDetail,
  StatusEffectDetail,
  TileDetail,
  ItemDetail,
} from './EntryDetails';

type TabId = 'characters' | 'enemies' | 'status_effects' | 'special_tiles' | 'items';

interface TabConfig {
  id: TabId;
  label: string;
  defaultIcon: string;
  themeIconKey: keyof ThemeAssets;
}

const TABS: TabConfig[] = [
  { id: 'characters', label: 'Heroes', defaultIcon: '⚔️', themeIconKey: 'iconTabHeroes' },
  { id: 'enemies', label: 'Enemies', defaultIcon: '👹', themeIconKey: 'iconTabEnemies' },
  { id: 'status_effects', label: 'Enchantments', defaultIcon: '✨', themeIconKey: 'iconTabEnchantments' },
  { id: 'special_tiles', label: 'Dungeon Tiles', defaultIcon: '🧱', themeIconKey: 'iconTabTiles' },
  { id: 'items', label: 'Items', defaultIcon: '💎', themeIconKey: 'iconTabItems' },
];

const TAB_LABELS: Record<TabId, { plural: string; singular: string }> = {
  characters: { plural: 'Heroes', singular: 'hero' },
  enemies: { plural: 'Enemies', singular: 'enemy' },
  status_effects: { plural: 'Enchantments', singular: 'enchantment' },
  special_tiles: { plural: 'Dungeon Tiles', singular: 'tile' },
  items: { plural: 'Items', singular: 'item' },
};

// ============ MAIN COMPENDIUM COMPONENT ============

export const Compendium: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('characters');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mobile detail view — when an entry is selected on mobile, show detail instead of list
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  // Theme assets for custom tab icons
  const [themeAssets, setThemeAssets] = useState<ThemeAssets>(() => loadThemeAssets());

  useEffect(() => {
    const unsubscribe = subscribeToThemeAssets((assets) => {
      setThemeAssets(assets);
    });
    return unsubscribe;
  }, []);

  // Load all assets
  const characters = useMemo(() => getCustomCharacters(), []);
  const enemies = useMemo(() => getCustomEnemies(), []);
  const statusEffects = useMemo(() => getStatusEffectAssets().filter(e => !e.isBuiltIn), []);
  const tiles = useMemo(() => getCustomTileTypes().filter(t =>
    t.behaviors.length > 0 || t.preventPlacement || t.baseType === 'wall' ||
    (t.offStateBehaviors && t.offStateBehaviors.length > 0) || t.onStateBlocksMovement
  ), []);
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

  // Counts
  const counts: Record<TabId, number> = {
    characters: filteredCharacters.length,
    enemies: filteredEnemies.length,
    status_effects: filteredStatusEffects.length,
    special_tiles: filteredTiles.length,
    items: filteredItems.length,
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId as TabId);
    setSelectedId(null);
    setMobileShowDetail(false);
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setMobileShowDetail(true);
  };

  const handleMobileBack = () => {
    setMobileShowDetail(false);
    setSelectedId(null);
  };

  // Build chapter tabs from config
  const chapterTabs: ChapterTab[] = TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    icon: (themeAssets[tab.themeIconKey] as string) || tab.defaultIcon,
    count: counts[tab.id],
  }));

  // Get detail content based on active tab
  const detailContent = (() => {
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
  })();

  // Get the current filtered list count
  const currentCount = counts[activeTab];
  const emptyMessage = searchQuery
    ? `No ${TAB_LABELS[activeTab].plural.toLowerCase()} match your search`
    : `No ${TAB_LABELS[activeTab].plural.toLowerCase()} yet`;

  // Entry list content (shared between desktop left page and mobile)
  const entryListContent = (
    <>
      {/* Page heading */}
      <h2 className="compendium-page-heading text-xl">
        {TAB_LABELS[activeTab].plural}
        <span className="text-sm font-normal ml-2" style={{ color: 'var(--text-muted)' }}>
          ({currentCount})
        </span>
      </h2>

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          placeholder={`Search ${TAB_LABELS[activeTab].plural.toLowerCase()}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="compendium-search"
        />
      </div>

      {/* Entry list */}
      <div className="space-y-1">
        {activeTab === 'characters' && filteredCharacters.map((char) => (
          <CharacterCard
            key={char.id}
            character={char}
            onClick={() => handleSelect(char.id)}
            isSelected={selectedId === char.id}
          />
        ))}
        {activeTab === 'enemies' && filteredEnemies.map((enemy) => (
          <EnemyCard
            key={enemy.id}
            enemy={enemy}
            onClick={() => handleSelect(enemy.id)}
            isSelected={selectedId === enemy.id}
          />
        ))}
        {activeTab === 'status_effects' && filteredStatusEffects.map((effect) => (
          <StatusEffectCard
            key={effect.id}
            effect={effect}
            onClick={() => handleSelect(effect.id)}
            isSelected={selectedId === effect.id}
          />
        ))}
        {activeTab === 'special_tiles' && filteredTiles.map((tile) => (
          <TileCard
            key={tile.id}
            tile={tile}
            onClick={() => handleSelect(tile.id)}
            isSelected={selectedId === tile.id}
          />
        ))}
        {activeTab === 'items' && filteredItems.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            onClick={() => handleSelect(item.id)}
            isSelected={selectedId === item.id}
          />
        ))}
      </div>

      {/* Empty state */}
      {currentCount === 0 && (
        <div className="compendium-empty">{emptyMessage}</div>
      )}
    </>
  );

  // Detail page content (right page on desktop, detail view on mobile)
  const detailPageContent = detailContent ? (
    detailContent
  ) : (
    <div className="compendium-empty" style={{ minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Select an entry to view details
    </div>
  );

  return (
    <div className="min-h-screen theme-root text-parchment-200">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Header — above the book, in the dungeon theme */}
        <div className="mb-6">
          <h1 className="text-5xl md:text-6xl font-bold font-medieval text-copper-400 text-shadow-dungeon mb-2">Compendium</h1>
          <p className="text-stone-400">A tome of all Dungeon knowledge — Heroes, Enemies, Enchantments, Tiles, and Items.</p>
        </div>

        {/* Desktop: Two-page book layout (lg+) */}
        <div className="hidden lg:block">
          <BookLayout
            leftPage={entryListContent}
            rightPage={detailPageContent}
            chapterTabs={
              <ChapterNav
                tabs={chapterTabs}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                orientation="vertical"
              />
            }
          />
        </div>

        {/* Mobile: Single-page layout (< lg) */}
        <div className="lg:hidden">
          <SinglePageLayout
            chapterTabs={
              <ChapterNav
                tabs={chapterTabs}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                orientation="horizontal"
              />
            }
          >
            {mobileShowDetail && detailContent ? (
              <>
                {/* Back button */}
                <button
                  onClick={handleMobileBack}
                  className="mb-3 text-sm font-medieval flex items-center gap-1"
                  style={{ color: 'var(--text-heading)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Index
                </button>
                {detailContent}
              </>
            ) : (
              entryListContent
            )}
          </SinglePageLayout>
        </div>
      </div>
    </div>
  );
};
