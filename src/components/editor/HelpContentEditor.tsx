import React, { useState } from 'react';
import { sanitizeRichHtml } from '../../utils/sanitizeHtml';
import { toast } from '../shared/Toast';
import {
  getAllHelpSections,
  saveHelpSection,
  type HelpContent,
  type HelpSectionId,
} from '../../utils/assetStorage';
import { RichTextEditor } from './RichTextEditor';

// Section display info
const SECTION_INFO: Record<HelpSectionId, { icon: string; description: string }> = {
  game_general: {
    icon: '🎮',
    description: 'General game instructions shown near the goal/header area',
  },
  characters: {
    icon: '🧙',
    description: 'Help for the "Available Characters" section',
  },
  enemies: {
    icon: '👹',
    description: 'Help for the "Enemies" information box',
  },
  allies: {
    icon: '🛡️',
    description: 'Help for the "Allies" information box',
  },
  items: {
    icon: '⭐',
    description: 'Help for the "Items" information box',
  },
  status_effects: {
    icon: '✨',
    description: 'Help for the "Status Effects" information box',
  },
  special_tiles: {
    icon: '🔲',
    description: 'Help for the "Special Tiles" information box',
  },
  redirect_spell: {
    icon: '🔄',
    description: 'Help for the redirect spell compass on hero cards',
  },
  spell_direction: {
    icon: '🎯',
    description: 'Help for the aimed-spell compass on hero cards',
  },
  side_quests: {
    icon: '🎯',
    description: 'Help for the side-quests row shown next to the main goal',
  },
};

export const HelpContentEditor: React.FC = () => {
  const [sections, setSections] = useState<HelpContent[]>(() => getAllHelpSections());
  const [selectedId, setSelectedId] = useState<HelpSectionId | null>(null);
  const [editing, setEditing] = useState<HelpContent | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const _selectedSection = sections.find(s => s.id === selectedId);

  const handleSelect = (id: HelpSectionId) => {
    if (hasUnsavedChanges && !confirm('You have unsaved changes. Discard them?')) {
      return;
    }
    const section = sections.find(s => s.id === id);
    if (section) {
      setSelectedId(id);
      setEditing({ ...section });
      setHasUnsavedChanges(false);
    }
  };

  const handleSave = () => {
    if (!editing) return;
    if (saveHelpSection(editing)) {
      setSections(getAllHelpSections());
      setHasUnsavedChanges(false);
      toast.success(`Saved "${editing.title}"!`);
    }
  };

  const handleContentChange = (content: string) => {
    if (!editing) return;
    setEditing({ ...editing, content });
    setHasUnsavedChanges(true);
  };

  const handleTitleChange = (title: string) => {
    if (!editing) return;
    setEditing({ ...editing, title });
    setHasUnsavedChanges(true);
  };

  return (
    <div className="flex gap-4 h-full">
      {/* Left Panel - Section List */}
      <div className="w-64 flex-shrink-0 flex flex-col border border-stone-700 rounded overflow-hidden">
        <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">
          Help Sections
        </div>

        <div className="flex-1 overflow-y-auto dense-scrollbar">
          {sections.map(section => {
            const info = SECTION_INFO[section.id];
            const isSelected = selectedId === section.id;

            return (
              <button
                key={section.id}
                onClick={() => handleSelect(section.id)}
                className={`w-full text-left px-2 py-1.5 border-t border-stone-700/60 first:border-t-0 transition-colors ${
                  isSelected ? 'bg-copper-900/50' : 'hover:bg-stone-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base flex-shrink-0">{info.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-parchment-100 truncate">{section.title}</div>
                    <div className="text-[10px] text-stone-500 truncate">{info.description}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Panel - Editor */}
      <div className="flex-1 flex flex-col border border-stone-700 rounded overflow-hidden">
        {editing ? (
          <>
            {/* Header */}
            <div className="bg-stone-800 px-2 py-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base flex-shrink-0">{SECTION_INFO[editing.id].icon}</span>
                <div className="min-w-0">
                  <div className="text-xs uppercase text-stone-400">Edit Help Content</div>
                  <div className="text-[10px] text-stone-500 truncate">{SECTION_INFO[editing.id].description}</div>
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={!hasUnsavedChanges}
                className={`px-2 py-0.5 rounded border text-xs flex-shrink-0 transition-colors ${
                  hasUnsavedChanges
                    ? 'bg-green-900/40 text-green-300 border-green-700/50 hover:bg-green-900/60'
                    : 'border-stone-700 text-stone-500 cursor-not-allowed'
                }`}
              >
                {hasUnsavedChanges ? 'Save Changes' : 'Saved'}
              </button>
            </div>

            {/* Edit Form */}
            <div className="flex-1 overflow-y-auto dense-scrollbar p-3 space-y-3">
              {/* Title */}
              <div>
                <label className="block text-xs text-stone-400 mb-1">Title</label>
                <input
                  type="text"
                  value={editing.title}
                  onChange={e => handleTitleChange(e.target.value)}
                  className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-parchment-100 focus:outline-none focus:border-arcane-500"
                  placeholder="Help section title"
                />
                <p className="text-[10px] text-stone-500 mt-1">
                  This appears at the top of the help overlay
                </p>
              </div>

              {/* Content */}
              <div>
                <label className="block text-xs text-stone-400 mb-1">Content</label>
                <div className="bg-stone-800 rounded border border-stone-700 overflow-hidden">
                  <RichTextEditor
                    value={editing.content}
                    onChange={handleContentChange}
                    placeholder="Write help content here..."
                    multiline
                  />
                </div>
                <p className="text-[10px] text-stone-500 mt-1">
                  Supports rich text formatting: bold, italic, bullet lists, and more
                </p>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-xs text-stone-400 mb-1">Preview</label>
                <div className="bg-stone-900 rounded border border-stone-700 p-3 min-h-[200px]">
                  {/* A div, not an h3 — `.theme-root h1-h4` outrank the utility class. */}
                  <div className="text-lg font-medieval text-copper-400 mb-2">{editing.title}</div>
                  <div
                    className="text-parchment-300 help-preview"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(editing.content) }}
                  />
                </div>
              </div>
            </div>

            {/* Preview Styles */}
            <style>{`
              .help-preview p {
                margin-bottom: 0.75rem;
              }
              .help-preview ul, .help-preview ol {
                margin-left: 1.5rem;
                margin-bottom: 0.75rem;
              }
              .help-preview li {
                margin-bottom: 0.25rem;
              }
              .help-preview ul {
                list-style-type: disc;
              }
              .help-preview ol {
                list-style-type: decimal;
              }
              .help-preview strong {
                color: white;
              }
              .help-preview em {
                font-style: italic;
              }
            `}</style>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl mb-1">❓</div>
              <p className="text-sm text-stone-400">Select a help section to edit</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
