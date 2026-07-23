/**
 * Shared loading indicator (plumbing 2026-07-21; art pending — see
 * src/assets/ui-kits/loadingRune.ts, awaiting-art item 1).
 *
 * While the sheet config is null this renders exactly the pre-existing
 * pulsing text each call site had (pass textClassName to keep per-spot
 * styling byte-identical). Once the sheet exists, every spot gains the
 * animated rune above its label with zero call-site changes.
 *
 * Rendering rules honored: native resolution × integer zoom (never
 * fit-to-box), pixelated. The frame step is a ~8fps interval driving
 * background-position on a tiny element — well inside the page-decoration
 * budget (the transform/opacity-only principle targets continuous 60Hz
 * filter/shadow churn, not low-rate sprite stepping).
 */
import React, { useEffect, useState } from 'react';
import { LOADING_RUNE_SHEET } from '../../assets/ui-kits/loadingRune';

interface LoadingRuneProps {
  /** Text under the rune (or the whole fallback while art is pending). */
  label?: string;
  /** Target box for the animation in px; actual size snaps to integer zoom. */
  size?: number;
  /** Styling for the label — defaults to the route-fallback look. */
  textClassName?: string;
  className?: string;
}

export const LoadingRune: React.FC<LoadingRuneProps> = ({
  label = 'Loading...',
  size = 48,
  textClassName = 'text-copper-400 font-medieval text-lg animate-pulse',
  className = '',
}) => {
  const sheet = LOADING_RUNE_SHEET;
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!sheet) return;
    const id = window.setInterval(
      () => setFrame(f => (f + 1) % sheet.frames),
      1000 / sheet.fps,
    );
    return () => window.clearInterval(id);
  }, [sheet]);

  if (!sheet) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <span className={textClassName}>{label}</span>
      </div>
    );
  }

  const zoom = Math.max(1, Math.floor(size / Math.max(sheet.frameWidth, sheet.frameHeight)));
  return (
    <div className={`flex flex-col items-center justify-center gap-1 ${className}`}>
      <div
        aria-hidden
        style={{
          width: sheet.frameWidth * zoom,
          height: sheet.frameHeight * zoom,
          backgroundImage: `url(${sheet.url})`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: `-${frame * sheet.frameWidth * zoom}px 0`,
          backgroundSize: `${sheet.frameWidth * sheet.frames * zoom}px ${sheet.frameHeight * zoom}px`,
          imageRendering: 'pixelated',
        }}
      />
      {label && <span className={textClassName}>{label}</span>}
    </div>
  );
};
