import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCustomCharacters, getCustomEnemies, getSpellAssets, getStatusEffectAssets, getCustomTileTypes, getPuzzleSkins, getCustomObjects, getCustomCollectibles, getSoundAssets } from '../../utils/assetStorage';
import { getSavedPuzzles } from '../../utils/puzzleStorage';

interface SearchResult {
  id: string;
  name: string;
  category: string;
  icon: string;
  tab?: string;       // AssetManager tab name
  route: string;      // Route to navigate to
  subtitle?: string;
  tags?: string[];    // For tag-based search
}

const CATEGORIES = [
  { key: 'puzzles', icon: '🗺️', label: 'Puzzles', route: '/editor' },
  { key: 'characters', icon: '⚔️', label: 'Heroes', route: '/assets', tab: 'characters' },
  { key: 'enemies', icon: '👹', label: 'Enemies', route: '/assets', tab: 'enemies' },
  { key: 'spells', icon: '✨', label: 'Spells', route: '/assets', tab: 'spells' },
  { key: 'status_effects', icon: '🔮', label: 'Enchantments', route: '/assets', tab: 'status_effects' },
  { key: 'tiles', icon: '🧱', label: 'Tiles', route: '/assets', tab: 'tiles' },
  { key: 'skins', icon: '🎨', label: 'Skins', route: '/assets', tab: 'skins' },
  { key: 'objects', icon: '🏺', label: 'Objects', route: '/assets', tab: 'objects' },
  { key: 'collectibles', icon: '💎', label: 'Items', route: '/assets', tab: 'collectibles' },
  { key: 'sounds', icon: '🔊', label: 'Sounds', route: '/settings', tab: 'sounds' },
];

function loadAllAssets(): SearchResult[] {
  const results: SearchResult[] = [];

  // Puzzles
  for (const p of getSavedPuzzles()) {
    results.push({
      id: p.id,
      name: p.name || 'Untitled Puzzle',
      category: 'puzzles',
      icon: '🗺️',
      route: '/editor',
      subtitle: p.tags?.length ? `${p.width}×${p.height} · ${p.tags.join(', ')}` : `${p.width}×${p.height}`,
      tags: p.tags,
    });
  }

  // Characters
  for (const c of getCustomCharacters()) {
    results.push({
      id: c.id,
      name: c.name,
      category: 'characters',
      icon: '⚔️',
      route: '/assets',
      tab: 'characters',
      subtitle: `HP ${c.health}`,
    });
  }

  // Enemies
  for (const e of getCustomEnemies()) {
    results.push({
      id: e.id,
      name: e.name,
      category: 'enemies',
      icon: '👹',
      route: '/assets',
      tab: 'enemies',
      subtitle: `HP ${e.health}`,
    });
  }

  // Spells
  for (const s of getSpellAssets()) {
    results.push({
      id: s.id,
      name: s.name,
      category: 'spells',
      icon: '✨',
      route: '/assets',
      tab: 'spells',
      subtitle: s.templateType?.replace(/_/g, ' '),
    });
  }

  // Status Effects
  for (const se of getStatusEffectAssets()) {
    if (se.id.startsWith('builtin_')) continue; // skip built-ins
    results.push({
      id: se.id,
      name: se.name,
      category: 'status_effects',
      icon: '🔮',
      route: '/assets',
      tab: 'status_effects',
      subtitle: se.type,
    });
  }

  // Tiles
  for (const t of getCustomTileTypes()) {
    results.push({
      id: t.id,
      name: t.name,
      category: 'tiles',
      icon: '🧱',
      route: '/assets',
      tab: 'tiles',
      subtitle: t.baseType,
    });
  }

  // Skins
  for (const s of getPuzzleSkins()) {
    results.push({
      id: s.id,
      name: s.name,
      category: 'skins',
      icon: '🎨',
      route: '/assets',
      tab: 'skins',
      subtitle: s.description,
    });
  }

  // Objects
  for (const o of getCustomObjects()) {
    results.push({
      id: o.id,
      name: o.name,
      category: 'objects',
      icon: '🏺',
      route: '/assets',
      tab: 'objects',
    });
  }

  // Collectibles
  for (const c of getCustomCollectibles()) {
    results.push({
      id: c.id,
      name: c.name,
      category: 'collectibles',
      icon: '💎',
      route: '/assets',
      tab: 'collectibles',
    });
  }

  // Sounds
  for (const s of getSoundAssets()) {
    results.push({
      id: s.id,
      name: s.name,
      category: 'sounds',
      icon: '🔊',
      route: '/settings',
      tab: 'sounds',
      subtitle: s.category,
    });
  }

  return results;
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Load all assets when modal opens
  const allAssets = useMemo(() => {
    if (!isOpen) return [];
    return loadAllAssets();
  }, [isOpen]);

  // Filter results
  const filtered = useMemo(() => {
    if (!query.trim()) return allAssets;
    const q = query.toLowerCase();
    return allAssets.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.subtitle?.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      r.tags?.some(t => t.toLowerCase().includes(q))
    );
  }, [allAssets, query]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: { category: typeof CATEGORIES[number]; items: SearchResult[] }[] = [];
    for (const cat of CATEGORIES) {
      const items = filtered.filter(r => r.category === cat.key);
      if (items.length > 0) {
        groups.push({ category: cat, items });
      }
    }
    return groups;
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatResults = useMemo(() => grouped.flatMap(g => g.items), [grouped]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback((result: SearchResult) => {
    onClose();
    const params = new URLSearchParams();
    if (result.tab) params.set('tab', result.tab);
    params.set('id', result.id);
    navigate(`${result.route}?${params.toString()}`);
  }, [navigate, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatResults[selectedIndex]) {
          handleSelect(flatResults[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!isOpen) return null;

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg mx-4 dungeon-panel overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b-2 border-stone-700">
          <svg className="w-5 h-5 text-copper-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search all assets and puzzles..."
            className="flex-1 bg-transparent text-parchment-200 placeholder-stone-500 outline-none text-base"
            autoComplete="off"
          />
          <kbd className="hidden sm:inline-block text-xs text-stone-500 bg-stone-800 px-1.5 py-0.5 rounded border border-stone-700">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto dungeon-scrollbar">
          {flatResults.length === 0 ? (
            <div className="px-4 py-8 text-center text-stone-500">
              {query ? `No results for "${query}"` : 'No assets found'}
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.category.key}>
                {/* Category header */}
                <div className="px-4 py-1.5 text-xs font-semibold text-copper-400 bg-stone-800/50 uppercase tracking-wider sticky top-0">
                  {group.category.icon} {group.category.label}
                  <span className="ml-1 text-stone-500">({group.items.length})</span>
                </div>
                {/* Items */}
                {group.items.map(item => {
                  const idx = flatIndex++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      data-selected={isSelected}
                      className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-copper-400/20 text-parchment-100'
                          : 'text-parchment-300 hover:bg-stone-700/50'
                      }`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <span className="text-lg flex-shrink-0">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium text-sm">
                          {query ? highlightMatch(item.name, query) : item.name}
                        </div>
                        {item.subtitle && (
                          <div className="text-xs text-stone-400 truncate">{item.subtitle}</div>
                        )}
                      </div>
                      <svg className={`w-4 h-4 flex-shrink-0 transition-opacity ${isSelected ? 'opacity-60' : 'opacity-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {flatResults.length > 0 && (
          <div className="px-4 py-2 border-t-2 border-stone-700 flex items-center justify-between text-xs text-stone-500">
            <span>{flatResults.length} result{flatResults.length !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-2">
              <kbd className="bg-stone-800 px-1 py-0.5 rounded border border-stone-700">↑↓</kbd>
              <span>navigate</span>
              <kbd className="bg-stone-800 px-1 py-0.5 rounded border border-stone-700">↵</kbd>
              <span>open</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** Highlight matching substring in bold */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-copper-400 font-bold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}
