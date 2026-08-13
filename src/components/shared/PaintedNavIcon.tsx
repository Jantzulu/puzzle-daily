import React from 'react';

/**
 * A painted nav-chrome icon (theme slots iconNavCalendar / iconNavMenu /
 * iconNavMenuClose): renders at NATIVE × 2 — the page's Z=2 art scale —
 * so a 12×12 art canvas lands at the standard 24 CSS px footprint, and
 * any other canvas size the artist picks renders proportionally without
 * code changes. Pixelated, block display; the wrapping button keeps its
 * own hit area.
 */
export const PaintedNavIcon: React.FC<{ src: string; alt?: string }> = ({ src, alt = '' }) => (
  <img
    src={src}
    alt={alt}
    onLoad={(e) => {
      const img = e.currentTarget;
      if (!img.naturalWidth || !img.naturalHeight) return;
      img.style.width = `${img.naturalWidth * 2}px`;
      img.style.height = `${img.naturalHeight * 2}px`;
    }}
    style={{ imageRendering: 'pixelated', display: 'block' }}
  />
);
