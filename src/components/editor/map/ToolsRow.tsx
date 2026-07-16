// The 7-tool button grid (hotkeys 1-7). Extracted from MapEditor.tsx in
// Phase 1; the collapse header was dropped in Phase 2 — the Build tab now
// scopes when tools are visible.
import React from 'react';
import type { ToolType } from './editorState';

interface ToolsRowProps {
  selectedTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
}

export const ToolsRow: React.FC<ToolsRowProps> = ({ selectedTool, onSelectTool }) => (
  <div className="bg-stone-800 p-3 rounded">
    <div className="grid grid-cols-4 gap-2">
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
      <button
        onClick={() => onSelectTool('hallway')}
        className={`p-3 rounded text-sm ${
          selectedTool === 'hallway' ? 'bg-blue-600' : 'bg-stone-700 hover:bg-stone-600'
        }`}
      >
        <span className="text-[10px] opacity-50 mr-0.5">8</span> Hallway
      </button>
    </div>
  </div>
);
