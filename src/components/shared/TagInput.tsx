import React, { useState, useRef, useEffect, useMemo } from 'react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** All known tags across puzzles — used for autocomplete */
  knownTags?: string[];
  placeholder?: string;
  maxTags?: number;
  className?: string;
}

/**
 * Pill-based tag input with autocomplete.
 * Enter or comma adds a tag, click × removes it.
 */
export const TagInput: React.FC<TagInputProps> = ({
  tags,
  onChange,
  knownTags = [],
  placeholder = 'Add tag...',
  maxTags = 20,
  className = '',
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on input
  const suggestions = useMemo(() => {
    if (!inputValue.trim()) return [];
    const query = inputValue.toLowerCase();
    return knownTags
      .filter(t =>
        t.toLowerCase().includes(query) &&
        !tags.includes(t)
      )
      .slice(0, 8);
  }, [inputValue, knownTags, tags]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase().replace(/[^a-z0-9-_ ]/g, '');
    if (!normalized) return;
    if (tags.includes(normalized)) return;
    if (tags.length >= maxTags) return;

    onChange([...tags, normalized]);
    setInputValue('');
    setShowSuggestions(false);
    setSelectedSuggestionIndex(0);
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter(t => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        addTag(suggestions[selectedSuggestionIndex]);
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'ArrowDown' && showSuggestions) {
      e.preventDefault();
      setSelectedSuggestionIndex(prev =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp' && showSuggestions) {
      e.preventDefault();
      setSelectedSuggestionIndex(prev =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // If user types a comma, add the tag
    if (val.includes(',')) {
      const parts = val.split(',');
      parts.forEach(part => {
        if (part.trim()) addTag(part);
      });
      return;
    }
    setInputValue(val);
    setShowSuggestions(val.trim().length > 0);
    setSelectedSuggestionIndex(0);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className="flex flex-wrap gap-1.5 p-2 bg-stone-700 rounded border border-stone-600 min-h-[38px] cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-copper-600/30 text-copper-300 border border-copper-500/30"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="text-copper-400 hover:text-copper-200 ml-0.5"
            >
              ×
            </button>
          </span>
        ))}
        {tags.length < maxTags && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => inputValue.trim() && setShowSuggestions(true)}
            placeholder={tags.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[80px] bg-transparent text-sm text-parchment-100 outline-none placeholder-stone-500"
          />
        )}
      </div>

      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-stone-800 border border-stone-600 rounded shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((suggestion, idx) => (
            <button
              key={suggestion}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                idx === selectedSuggestionIndex
                  ? 'bg-copper-600/30 text-copper-300'
                  : 'text-parchment-200 hover:bg-stone-700'
              }`}
              onMouseEnter={() => setSelectedSuggestionIndex(idx)}
              onClick={() => addTag(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Collect all unique tags from an array of puzzles.
 */
export function collectAllTags(puzzles: { tags?: string[] }[]): string[] {
  const tagSet = new Set<string>();
  for (const p of puzzles) {
    if (p.tags) {
      for (const tag of p.tags) {
        tagSet.add(tag);
      }
    }
  }
  return Array.from(tagSet).sort();
}
