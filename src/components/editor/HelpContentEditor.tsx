import React, { useState } from 'react';
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
};

export const HelpContentEditor: React.FC = () => {
  const [sections, setSections] = useState<HelpContent[]>(() => getAllHelpSections());
  const [selectedId, setSelectedId] = useState<HelpSectionId | null>(null);
  const [editing, setEditing] = useState<HelpContent | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const selectedSection = sections.find(s => s.id === selectedId);

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
      alert(`Saved "${editing.title}"!`);
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
      <div className="w-64 flex-shrink-0 flex flex-col bg-stone-800 rounded overflow-hidden">
        <div className="p-3 border-b border-stone-700">
          <h2 className="text-lg font-bold">Help Sections</h2>
          <p className="text-xs text-stone-400 mt-1">
            Edit help content shown to players
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sections.map(section => {
            const info = SECTION_INFO[section.id];
            const isSelected = selectedId === section.id;

            return (
              <button
                key={section.id}
                onClick={() => handleSelect(section.id)}
                className={`w-full text-left p-3 border-b border-stone-700 hover:bg-stone-700 transition-colors ${
                  isSelected ? 'bg-stone-700 border-l-4 border-l-blue-500' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{info.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{section.title}</div>
                    <div className="text-xs text-stone-400 truncate">{info.description}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Panel - Editor */}
      <div className="flex-1 flex flex-col bg-stone-800 rounded overflow-hidden">
        {editing ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-stone-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{SECTION_INFO[editing.id].icon}</span>
                <div>
                  <h2 className="text-xl font-bold">Edit Help Content</h2>
                  <p className="text-xs text-stone-400">{SECTION_INFO[editing.id].description}</p>
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={!hasUnsavedChanges}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  hasUnsavedChanges
                    ? 'bg-blue-600 hover:bg-blue-700 text-parchment-100'
                    : 'bg-stone-600 text-stone-400 cursor-not-allowed'
                }`}
              >
                {hasUnsavedChanges ? 'Save Changes' : 'Saved'}
              </button>
            </div>

            {/* Edit Form */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={editing.title}
                  onChange={e => handleTitleChange(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-700 rounded border border-stone-600 focus:border-blue-500 focus:outline-none"
                  placeholder="Help section title"
                />
                <p className="text-xs text-stone-400 mt-1">
                  This appears at the top of the help overlay
                </p>
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium mb-1">Content</label>
                <div className="bg-stone-700 rounded border border-stone-600 overflow-hidden">
                  <RichTextEditor
                    value={editing.content}
                    onChange={handleContentChange}
                    placeholder="Write help content here..."
                    multiline
                  />
                </div>
                <p className="text-xs text-stone-400 mt-1">
                  Supports rich text formatting: bold, italic, bullet lists, and more
                </p>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium mb-1">Preview</label>
                <div className="bg-stone-900 rounded border border-stone-600 p-4 min-h-[200px]">
                  <h3 className="text-lg font-bold mb-3">{editing.title}</h3>
                  <div
                    className="text-parchment-300 help-preview"
                    dangerouslySetInnerHTML={{ __html: editing.content }}
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
          <div className="flex-1 flex items-center justify-center text-stone-400">
            <div className="text-center">
              <div className="text-4xl mb-4">❓</div>
              <p>Select a help section to edit</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
