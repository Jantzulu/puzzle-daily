import React, { useCallback, useEffect, useRef, useState } from 'react';

interface FrameInfo {
  id: string;
  thumbnail: string;  // data URL of composited frame
}

interface OnionSkinningConfig {
  enabled: boolean;
  before: number;
  after: number;
  opacity: number;
}

interface PixelEditorTimelineProps {
  frames: FrameInfo[];
  activeFrameIndex: number;
  frameRate: number;
  isPlaying: boolean;
  onionSkinning: OnionSkinningConfig;
  onSelectFrame: (index: number) => void;
  onAddFrame: () => void;
  onDuplicateFrame: (index: number) => void;
  onDeleteFrame: (index: number) => void;
  onReorderFrame: (fromIndex: number, toIndex: number) => void;
  onSetFrameRate: (fps: number) => void;
  onPlayPause: () => void;
  onSetOnionSkinning: (config: OnionSkinningConfig) => void;
}

export const PixelEditorTimeline: React.FC<PixelEditorTimelineProps> = ({
  frames,
  activeFrameIndex,
  frameRate,
  isPlaying,
  onionSkinning,
  onSelectFrame,
  onAddFrame,
  onDuplicateFrame,
  onDeleteFrame,
  onReorderFrame,
  onSetFrameRate,
  onPlayPause,
  onSetOnionSkinning,
}) => {
  const [dragFrameIdx, setDragFrameIdx] = useState<number | null>(null);
  const [dragOverFrameIdx, setDragOverFrameIdx] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; frameIndex: number } | null>(null);
  const [showOnionSettings, setShowOnionSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // Scroll active frame into view
  useEffect(() => {
    if (scrollRef.current) {
      const activeThumb = scrollRef.current.children[activeFrameIndex] as HTMLElement;
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }, [activeFrameIndex]);

  const handleDragStart = useCallback((idx: number) => setDragFrameIdx(idx), []);
  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverFrameIdx(idx);
  }, []);
  const handleDrop = useCallback((targetIdx: number) => {
    if (dragFrameIdx !== null && dragFrameIdx !== targetIdx) {
      onReorderFrame(dragFrameIdx, targetIdx);
    }
    setDragFrameIdx(null);
    setDragOverFrameIdx(null);
  }, [dragFrameIdx, onReorderFrame]);
  const handleDragEnd = useCallback(() => {
    setDragFrameIdx(null);
    setDragOverFrameIdx(null);
  }, []);

  return (
    <div className="bg-stone-900 border-t border-stone-700 select-none">
      {/* Controls row */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-stone-800">
        {/* Play/Pause */}
        <button
          onClick={onPlayPause}
          className={`px-2 py-0.5 rounded text-xs font-bold ${
            isPlaying ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-arcane-700 hover:bg-arcane-600 text-parchment-100'
          }`}
          title={isPlaying ? 'Stop' : 'Play'}
        >
          {isPlaying ? '⏹' : '▶'}
        </button>

        {/* FPS */}
        <div className="flex items-center gap-1">
          <label className="text-[10px] text-stone-400">FPS</label>
          <input
            type="number"
            min="1"
            max="60"
            value={frameRate}
            onChange={(e) => onSetFrameRate(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
            className="w-10 bg-stone-800 border border-stone-600 rounded px-1 py-0.5 text-xs text-center text-parchment-100"
          />
        </div>

        {/* Onion skinning toggle */}
        <div className="relative">
          <button
            onClick={() => setShowOnionSettings(!showOnionSettings)}
            className={`px-1.5 py-0.5 rounded text-xs ${
              onionSkinning.enabled
                ? 'bg-arcane-600 text-parchment-100'
                : 'bg-stone-800 text-stone-400 hover:text-stone-200'
            }`}
            title="Onion skinning"
          >
            🧅
          </button>
          {showOnionSettings && (
            <div className="absolute bottom-full left-0 mb-1 bg-stone-800 border border-stone-600 rounded p-2 shadow-lg z-20 min-w-[160px]">
              <label className="flex items-center gap-1.5 text-xs text-stone-300 mb-1.5">
                <input
                  type="checkbox"
                  checked={onionSkinning.enabled}
                  onChange={(e) => onSetOnionSkinning({ ...onionSkinning, enabled: e.target.checked })}
                />
                Enable
              </label>
              <div className="flex items-center gap-1.5 text-xs text-stone-400 mb-1">
                <span className="w-12">Before</span>
                <input
                  type="range" min="0" max="3"
                  value={onionSkinning.before}
                  onChange={(e) => onSetOnionSkinning({ ...onionSkinning, before: parseInt(e.target.value) })}
                  className="flex-1 h-2 accent-arcane-500"
                />
                <span className="w-3 text-right">{onionSkinning.before}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-stone-400 mb-1">
                <span className="w-12">After</span>
                <input
                  type="range" min="0" max="2"
                  value={onionSkinning.after}
                  onChange={(e) => onSetOnionSkinning({ ...onionSkinning, after: parseInt(e.target.value) })}
                  className="flex-1 h-2 accent-arcane-500"
                />
                <span className="w-3 text-right">{onionSkinning.after}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-stone-400">
                <span className="w-12">Opacity</span>
                <input
                  type="range" min="10" max="50"
                  value={Math.round(onionSkinning.opacity * 100)}
                  onChange={(e) => onSetOnionSkinning({ ...onionSkinning, opacity: parseInt(e.target.value) / 100 })}
                  className="flex-1 h-2 accent-arcane-500"
                />
                <span className="w-7 text-right">{Math.round(onionSkinning.opacity * 100)}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Frame count display */}
        <span className="text-[10px] text-stone-500 ml-auto">
          Frame {activeFrameIndex + 1} / {frames.length}
        </span>

        {/* Add frame */}
        <button
          onClick={onAddFrame}
          className="px-1.5 py-0.5 rounded text-xs bg-arcane-700 hover:bg-arcane-600 text-parchment-100"
          title="Add frame"
        >
          + Frame
        </button>
      </div>

      {/* Frame thumbnails */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto dungeon-scrollbar"
      >
        {frames.map((frame, idx) => {
          const isActive = idx === activeFrameIndex;
          const isDragging = dragFrameIdx === idx;
          const isDragOver = dragOverFrameIdx === idx && dragFrameIdx !== idx;

          return (
            <div
              key={frame.id}
              className={`flex-shrink-0 cursor-pointer rounded overflow-hidden transition-all ${
                isDragging ? 'opacity-40' : ''
              } ${isDragOver ? 'ring-2 ring-arcane-400' : ''} ${
                isActive ? 'ring-2 ring-arcane-500 shadow-lg' : 'hover:ring-1 hover:ring-stone-500'
              }`}
              onClick={() => onSelectFrame(idx)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, frameIndex: idx });
              }}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
            >
              {/* Thumbnail */}
              <div className="relative w-12 h-12 bg-stone-800">
                <img
                  src={frame.thumbnail}
                  alt={`Frame ${idx + 1}`}
                  className="w-full h-full object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
                {/* Frame number */}
                <span className="absolute bottom-0 right-0 bg-black/70 text-[9px] text-stone-300 px-0.5 rounded-tl">
                  {idx + 1}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-stone-800 border border-stone-600 rounded shadow-xl z-50 py-1 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => { onDuplicateFrame(contextMenu.frameIndex); setContextMenu(null); }}
            className="w-full text-left px-3 py-1 text-xs text-stone-300 hover:bg-arcane-700 hover:text-parchment-100"
          >
            Duplicate
          </button>
          <button
            onClick={() => { onAddFrame(); setContextMenu(null); }}
            className="w-full text-left px-3 py-1 text-xs text-stone-300 hover:bg-arcane-700 hover:text-parchment-100"
          >
            Insert After
          </button>
          {frames.length > 1 && (
            <button
              onClick={() => { onDeleteFrame(contextMenu.frameIndex); setContextMenu(null); }}
              className="w-full text-left px-3 py-1 text-xs text-red-400 hover:bg-red-500/20"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
};
