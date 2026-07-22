import React, { useState, useMemo, useEffect } from 'react';
import {
  getCustomCharacters,
  getCustomEnemies,
  getCustomVessels,
  vesselToEnemyAsset,
  getCustomAllies,
  allyToEnemyAsset,
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
import { ShowcaseSection } from './ShowcaseBoard';
import { usePlayerReveal, isAssetRevealed } from '../../utils/reveal';

type TabId = 'characters' | 'allies' | 'enemies' | 'vessels' | 'status_effects' | 'special_tiles' | 'items';

interface TabConfig {
  id: TabId;
  label: string;
  defaultIcon: string;
  themeIconKey: keyof ThemeAssets;
}

const TABS: TabConfig[] = [
  { id: 'characters', label: 'Heroes', defaultIcon: '⚔️', themeIconKey: 'iconTabHeroes' },
  { id: 'allies', label: 'Allies', defaultIcon: '🛡️', themeIconKey: 'iconTabAllies' },
  { id: 'enemies', label: 'Enemies', defaultIcon: '👹', themeIconKey: 'iconTabEnemies' },
  { id: 'vessels', label: 'Vessels', defaultIcon: '🛢️', themeIconKey: 'iconTabVessels' },
  { id: 'status_effects', label: 'Status Effects', defaultIcon: '✨', themeIconKey: 'iconTabEnchantments' },
  { id: 'special_tiles', label: 'Dungeon Tiles', defaultIcon: '🧱', themeIconKey: 'iconTabTiles' },
  { id: 'items', label: 'Items', defaultIcon: '💎', themeIconKey: 'iconTabItems' },
];

const TAB_LABELS: Record<TabId, { plural: string; singular: string }> = {
  characters: { plural: 'Heroes', singular: 'hero' },
  allies: { plural: 'Allies', singular: 'ally' },
  enemies: { plural: 'Enemies', singular: 'enemy' },
  vessels: { plural: 'Vessels', singular: 'vessel' },
  status_effects: { plural: 'Status Effects', singular: 'status effect' },
  special_tiles: { plural: 'Dungeon Tiles', singular: 'tile' },
  items: { plural: 'Items', singular: 'item' },
};

// ============ MAIN COMPENDIUM COMPONENT ============

interface CompendiumProps {
  /**
   * Player app only: gate every chapter list behind the shared reveal
   * predicate (utils/reveal.ts). The dev app omits it and sees everything.
   */
  playerReveal?: boolean;
}

export const Compendium: React.FC<CompendiumProps> = ({ playerReveal }) => {
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

  // Player app: the reveal set gates every chapter list (empty until live
  // content loads — never leak unreleased assets); assetsVersion recomputes
  // the lists when the boot asset pull lands. Dev app: revealSet is null,
  // everything passes.
  const { revealSet, assetsVersion } = usePlayerReveal(!!playerReveal);

  // Load all assets. hideFromCompendium (2026-07-21) hides an asset from
  // the Slab even when published — showcase-only variants etc. (also part
  // of the shared predicate, so it holds on the player app too).
  /* eslint-disable react-hooks/exhaustive-deps -- assetsVersion is the deliberate "local stores changed" signal */
  const characters = useMemo(() => getCustomCharacters().filter(c => isAssetRevealed(c, revealSet) && !c.hideFromCompendium), [revealSet, assetsVersion]);
  const enemies = useMemo(() => getCustomEnemies().filter(e => isAssetRevealed(e, revealSet) && !e.hideFromCompendium), [revealSet, assetsVersion]);
  // Vessels render through the enemy adapter — same card/detail components
  const vessels = useMemo(() => getCustomVessels().filter(v => isAssetRevealed(v, revealSet) && !v.hideFromCompendium).map(vesselToEnemyAsset), [revealSet, assetsVersion]);
  // Allies too — full enemy-shaped assets on the hero side
  const allies = useMemo(() => getCustomAllies().filter(a => isAssetRevealed(a, revealSet) && !a.hideFromCompendium).map(allyToEnemyAsset), [revealSet, assetsVersion]);
  const statusEffects = useMemo(() => getStatusEffectAssets().filter(e => !e.isBuiltIn && isAssetRevealed(e, revealSet) && !e.hideFromCompendium), [revealSet, assetsVersion]);
  const tiles = useMemo(() => getCustomTileTypes().filter(t =>
    isAssetRevealed(t, revealSet) && !t.hideFromCompendium && (
      t.behaviors.length > 0 || t.preventPlacement || t.baseType === 'wall' ||
      (t.offStateBehaviors && t.offStateBehaviors.length > 0) || t.onStateBlocksMovement
    )
  ), [revealSet, assetsVersion]);
  const items = useMemo(() => getCustomCollectibles().filter(i => isAssetRevealed(i, revealSet) && !i.hideFromCompendium), [revealSet, assetsVersion]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Filter by search
  const filteredCharacters = useMemo(() =>
    characters.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [characters, searchQuery]
  );
  const filteredEnemies = useMemo(() =>
    enemies.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [enemies, searchQuery]
  );
  const filteredVessels = useMemo(() =>
    vessels.filter(v => v.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [vessels, searchQuery]
  );
  const filteredAllies = useMemo(() =>
    allies.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [allies, searchQuery]
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
  const selectedVessel = selectedId ? vessels.find(v => v.id === selectedId) : null;
  const selectedAlly = selectedId ? allies.find(a => a.id === selectedId) : null;
  const selectedEffect = selectedId ? statusEffects.find(e => e.id === selectedId) : null;
  const selectedTile = selectedId ? tiles.find(t => t.id === selectedId) : null;
  const selectedItem = selectedId ? items.find(i => i.id === selectedId) : null;

  // Counts
  const counts: Record<TabId, number> = {
    characters: filteredCharacters.length,
    allies: filteredAllies.length,
    enemies: filteredEnemies.length,
    vessels: filteredVessels.length,
    status_effects: filteredStatusEffects.length,
    special_tiles: filteredTiles.length,
    items: filteredItems.length,
  };

  // The active tab's filtered entries, in list order — drives prev/next
  // paging (page corners + arrow keys) and the folio line.
  const currentEntries: Array<{ id: string }> = useMemo(() => {
    switch (activeTab) {
      case 'characters': return filteredCharacters;
      case 'allies': return filteredAllies;
      case 'enemies': return filteredEnemies;
      case 'vessels': return filteredVessels;
      case 'status_effects': return filteredStatusEffects;
      case 'special_tiles': return filteredTiles;
      case 'items': return filteredItems;
    }
  }, [activeTab, filteredCharacters, filteredAllies, filteredEnemies, filteredVessels, filteredStatusEffects, filteredTiles, filteredItems]);

  const selectedIndex = selectedId ? currentEntries.findIndex(e => e.id === selectedId) : -1;
  const canPrev = selectedIndex > 0;
  const canNext = selectedIndex >= 0
    ? selectedIndex < currentEntries.length - 1
    : currentEntries.length > 0; // nothing selected yet — "next" opens the first page

  const goRelative = (delta: 1 | -1) => {
    if (currentEntries.length === 0) return;
    if (selectedIndex < 0) {
      if (delta === 1) {
        setSelectedId(currentEntries[0].id);
        setMobileShowDetail(true);
      }
      return;
    }
    const target = selectedIndex + delta;
    if (target < 0 || target >= currentEntries.length) return;
    setSelectedId(currentEntries[target].id);
    setMobileShowDetail(true);
  };

  // Arrow keys page through entries like leafing through the tome.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      goRelative(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEntries, selectedIndex]);

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

  // Slab aura takes the active chapter's accent color (see index.css)
  const TAB_THEME: Record<TabId, string> = {
    characters: 'compendium-theme-heroes',
    allies: 'compendium-theme-heroes', // hero-side accent until a style pass differentiates it
    enemies: 'compendium-theme-enemies',
    vessels: 'compendium-theme-enemies', // shares the enemies accent until a style pass differentiates it
    status_effects: 'compendium-theme-enchantments',
    special_tiles: 'compendium-theme-tiles',
    items: 'compendium-theme-items',
  };
  const themeClass = TAB_THEME[activeTab];

  // Floating nav stack: the chapter capsule (with the search pill hanging
  // under it when enabled) — search lives OFF the slab (a stone slab with a
  // search box carved into it broke the artifact illusion).
  // SHOW_SEARCH: parked pre-launch — asset counts are small enough that the
  // pill was noise, and hiding it lets the slab sit closer to the chapter
  // icons. The filtering plumbing stays live; flip to bring it back.
  const SHOW_SEARCH = false;
  const navStack = (orientation: 'vertical' | 'horizontal') => (
    <div className="compendium-nav-stack">
      <ChapterNav
        tabs={chapterTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        orientation={orientation}
      />
      {SHOW_SEARCH && (
        <input
          type="text"
          placeholder={`Search ${TAB_LABELS[activeTab].plural.toLowerCase()}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="compendium-search compendium-search--float"
        />
      )}
    </div>
  );

  // Get detail content based on active tab. Entity tabs append the Slab
  // showcase section (2026-07-21) — looping demo boards from puzzles
  // whose showcase config lists this asset.
  const detailContent = (() => {
    if (activeTab === 'characters' && selectedCharacter) {
      return <><CharacterDetail character={selectedCharacter} /><ShowcaseSection assetId={selectedCharacter.id} /></>;
    }
    if (activeTab === 'enemies' && selectedEnemy) {
      return <><EnemyDetail enemy={selectedEnemy} /><ShowcaseSection assetId={selectedEnemy.id} /></>;
    }
    if (activeTab === 'vessels' && selectedVessel) {
      return <><EnemyDetail enemy={selectedVessel} /><ShowcaseSection assetId={selectedVessel.id} /></>;
    }
    if (activeTab === 'allies' && selectedAlly) {
      return <><EnemyDetail enemy={selectedAlly} /><ShowcaseSection assetId={selectedAlly.id} /></>;
    }
    if (activeTab === 'status_effects' && selectedEffect) {
      return <><StatusEffectDetail effect={selectedEffect} /><ShowcaseSection assetId={selectedEffect.id} /></>;
    }
    if (activeTab === 'special_tiles' && selectedTile) {
      return <><TileDetail tile={selectedTile} /><ShowcaseSection assetId={selectedTile.id} /></>;
    }
    if (activeTab === 'items' && selectedItem) {
      return <><ItemDetail item={selectedItem} /><ShowcaseSection assetId={selectedItem.id} /></>;
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
        {activeTab === 'vessels' && filteredVessels.map((vessel) => (
          <EnemyCard
            key={vessel.id}
            enemy={vessel}
            onClick={() => handleSelect(vessel.id)}
            isSelected={selectedId === vessel.id}
          />
        ))}
        {activeTab === 'allies' && filteredAllies.map((ally) => (
          <EnemyCard
            key={ally.id}
            enemy={ally}
            onClick={() => handleSelect(ally.id)}
            isSelected={selectedId === ally.id}
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

  // Folded page-corner turn buttons + folio line
  const prevCorner = (
    <button
      className="compendium-turn-corner compendium-turn-corner--prev"
      onClick={() => goRelative(-1)}
      disabled={!canPrev}
      title="Previous entry (←)"
      aria-label="Previous entry"
    >
      <span>‹</span>
    </button>
  );
  const nextCorner = (
    <button
      className="compendium-turn-corner compendium-turn-corner--next"
      onClick={() => goRelative(1)}
      disabled={!canNext}
      title="Next entry (→)"
      aria-label="Next entry"
    >
      <span>›</span>
    </button>
  );
  const folio = selectedIndex >= 0
    ? `— ${TAB_LABELS[activeTab].plural} · Entry ${selectedIndex + 1} of ${currentEntries.length} —`
    : undefined;

  return (
    <div className="min-h-screen theme-root text-parchment-200">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Header — above the stone, in the dungeon theme, centered on the page */}
        <div className="mb-6 text-center">
          <h1 className="text-5xl md:text-6xl font-bold font-medieval text-copper-400 text-shadow-dungeon mb-2">The Slab</h1>
          <p className="text-stone-400">A magical stone containing knowledge from across the realm.</p>
        </div>

        {/* Desktop: two-face slab layout (lg+) */}
        <div className="hidden lg:block">
          <BookLayout
            className={themeClass}
            leftPage={
              // Keyed by chapter: switching tabs re-manifests the index too
              <div key={`list-${activeTab}`} className="compendium-flip--from-right">
                {entryListContent}
              </div>
            }
            rightPage={
              // Keyed by entry: every selection change plays the manifestation
              <div key={`detail-${activeTab}-${selectedId ?? 'none'}`} className="compendium-flip" style={{ height: '100%' }}>
                {detailPageContent}
              </div>
            }
            prevButton={prevCorner}
            nextButton={nextCorner}
            rightFooter={folio}
            chapterTabs={navStack('vertical')}
          />
        </div>

        {/* Mobile: single-face slab layout (< lg) */}
        <div className="lg:hidden">
          <SinglePageLayout
            className={themeClass}
            cornerButtons={mobileShowDetail && detailContent ? (
              <>
                {prevCorner}
                {nextCorner}
              </>
            ) : undefined}
            chapterTabs={navStack('horizontal')}
          >
            {mobileShowDetail && detailContent ? (
              <div key={`m-detail-${activeTab}-${selectedId ?? 'none'}`} className="compendium-flip">
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
                {/* Folio + breathing room above the corner buttons */}
                <div className="compendium-page-number pb-8">{folio}</div>
              </div>
            ) : (
              <div key={`m-list-${activeTab}`} className="compendium-flip">
                {entryListContent}
              </div>
            )}
          </SinglePageLayout>
        </div>
      </div>
    </div>
  );
};
