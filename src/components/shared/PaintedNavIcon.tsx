import React from 'react';

/**
 * A painted nav-chrome icon (hardcoded drop-path art — see
 * src/assets/icons/navChrome.ts): renders at NATIVE × 2 — the page's Z=2
 * art scale — so the standard 13×13 canvas (odd = a true center pixel)
 * lands at 26 CSS px, and any other canvas size renders proportionally
 * without code changes. Pixelated, block display; the wrapping button
 * keeps its own hit area.
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
