// The Tools panel: collapsible header + the 7-tool button grid (hotkeys 1-7).
// Extracted verbatim from MapEditor.tsx (Phase 1 decomposition, 2026-07-14).
import React from 'react';
import type { ToolType } from './editorState';

interface ToolsRowProps {
  selectedTool: ToolType;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectTool: (tool: ToolType) => void;
}

export const ToolsRow: React.FC<ToolsRowProps> = ({ selectedTool, isOpen, onToggleOpen, onSelectTool }) => (
  <div className="bg-stone-800 p-4 rounded">
    <button
      onClick={onToggleOpen}
      className="w-full flex items-center justify-between text-lg font-bold"
    >
      <span>Tools</span>
      <span className="text-lg text-stone-400">{isOpen ? '▾' : '▸'}</span>
    </button>
    {isOpen && <div className="grid grid-cols-4 gap-2 mt-3">
      <button
        onClick={() => onSelectTool('custom')}
        className={`p-3 rounded text-sm ${
          selectedTool === 'custom' || selectedTool === 'void' || selectedTool === 'empty' || selectedTool === 'wall'
            ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
        }`}
      >
        <span className="text-[10px] opacity-50 mr-0.5">1</span> Tile
      </button>
      <button
        onClick={() => onSelectTool('enemy')}
        className={`p-3 rounded text-sm ${
          selectedTool === 'enemy' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
        }`}
      >
        <span className="text-[10px] opacity-50 mr-0.5">2</span> Enemy
      </button>
      <button
        onClick={() => onSelectTool('ally')}
        className={`p-3 rounded text-sm ${
          selectedTool === 'ally' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
        }`}
      >
        <span className="text-[10px] opacity-50 mr-0.5">3</span> Ally
      </button>
      <button
        onClick={() => onSelectTool('vessel')}
        className={`p-3 rounded text-sm ${
          selectedTool === 'vessel' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
        }`}
      >
        <span className="text-[10px] opacity-50 mr-0.5">4</span> Vessel
      </button>
      <button
        onClick={() => onSelectTool('object')}
        className={`p-3 rounded text-sm ${
          selectedTool === 'object' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
        }`}
      >
        <span className="text-[10px] opacity-50 mr-0.5">5</span> Object
      </button>
      <button
        onClick={() => onSelectTool('collectible')}
        className={`p-3 rounded text-sm ${
          selectedTool === 'collectible' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
        }`}
      >
        <span className="text-[10px] opacity-50 mr-0.5">6</span> Item
      </button>
      <button
        onClick={() => onSelectTool('characters')}
        className={`p-3 rounded text-sm ${
          selectedTool === 'characters' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
        }`}
      >
        <span className="text-[10px] opacity-50 mr-0.5">7</span> Heroes
      </button>
    </div>}
  </div>
);
