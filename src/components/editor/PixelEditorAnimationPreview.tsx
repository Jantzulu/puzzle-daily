import React, { useCallback, useEffect, useRef, useState } from 'react';

interface PixelEditorAnimationPreviewProps {
  /** Array of composited frame data URLs */
  frameThumbnails: string[];
  frameRate: number;
  loop: boolean;
  canvasWidth: number;
  canvasHeight: number;
  /** Called when animation playback selects a frame (sync with timeline) */
  onFrameChange?: (frameIndex: number) => void;
}

export const PixelEditorAnimationPreview: React.FC<PixelEditorAnimationPreviewProps> = ({
  frameThumbnails,
  frameRate,
  loop,
  canvasWidth,
  canvasHeight,
  onFrameChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastFrameTimeRef = useRef(0);

  // Preview canvas size
  const previewSize = 128;
  const scale = Math.min(previewSize / canvasWidth, previewSize / canvasHeight);
  const dw = Math.round(canvasWidth * scale);
  const dh = Math.round(canvasHeight * scale);

  // Render current frame
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.clearRect(0, 0, previewSize, previewSize);

    // Checkerboard
    const checkSize = 8;
    for (let y = 0; y < previewSize; y += checkSize) {
      for (let x = 0; x < previewSize; x += checkSize) {
        ctx.fillStyle = ((x / checkSize + y / checkSize) % 2 === 0) ? '#3a3a3a' : '#2a2a2a';
        ctx.fillRect(x, y, checkSize, checkSize);
      }
    }

    const src = frameThumbnails[currentFrame];
    if (!src) return;

    const img = new Image();
    img.onload = () => {
      const dx = Math.round((previewSize - dw) / 2);
      const dy = Math.round((previewSize - dh) / 2);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, dx, dy, dw, dh);
    };
    img.src = src;
  }, [isOpen, currentFrame, frameThumbnails, previewSize, dw, dh]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !isOpen || frameThumbnails.length <= 1) return;

    const frameDuration = 1000 / frameRate;
    lastFrameTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - lastFrameTimeRef.current;
      if (elapsed >= frameDuration) {
        lastFrameTimeRef.current = now - (elapsed % frameDuration);
        setCurrentFrame(prev => {
          const next = prev + 1;
          if (next >= frameThumbnails.length) {
            if (!loop) {
              setIsPlaying(false);
              return prev;
            }
            return 0;
          }
          return next;
        });
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, isOpen, frameRate, loop, frameThumbnails.length]);

  // Sync frame changes with parent
  useEffect(() => {
    if (isPlaying) {
      onFrameChange?.(currentFrame);
    }
  }, [currentFrame, isPlaying, onFrameChange]);

  const togglePlay = useCallback(() => {
    setIsPlaying(p => {
      if (!p) setCurrentFrame(0); // Reset to start on play
      return !p;
    });
  }, []);

  // Collapsed: small floating button in bottom-right of canvas
  if (!isOpen) {
    return (
      <div className="absolute bottom-7 right-2 z-10">
        <button
          onClick={() => setIsOpen(true)}
          className="bg-stone-800/90 border border-stone-600 rounded px-2 py-0.5 text-xs text-stone-300 hover:text-parchment-100 hover:bg-arcane-700 shadow-lg backdrop-blur-sm"
          title="Animation preview"
        >
          🎬 Preview
        </button>
      </div>
    );
  }

  // Expanded: floating panel in bottom-right of canvas
  return (
    <div className="absolute bottom-7 right-2 z-10 bg-stone-900/95 border border-stone-700 rounded-lg shadow-xl backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-stone-700">
        <span className="text-[10px] text-stone-300 font-bold">Preview</span>
        <button
          onClick={() => { setIsOpen(false); setIsPlaying(false); }}
          className="text-stone-500 hover:text-stone-300 text-xs leading-none ml-3"
        >
          ✕
        </button>
      </div>

      {/* Canvas */}
      <div className="p-1.5">
        <canvas
          ref={canvasRef}
          width={previewSize}
          height={previewSize}
          className="rounded border border-stone-700"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 px-2 pb-1.5">
        <button
          onClick={togglePlay}
          className={`px-2 py-0.5 rounded text-xs font-bold ${
            isPlaying ? 'bg-red-600 text-white' : 'bg-arcane-700 text-parchment-100'
          }`}
        >
          {isPlaying ? '⏹' : '▶'}
        </button>
        <span className="text-[10px] text-stone-400">
          {currentFrame + 1}/{frameThumbnails.length} @ {frameRate}fps
        </span>
      </div>
    </div>
  );
};
