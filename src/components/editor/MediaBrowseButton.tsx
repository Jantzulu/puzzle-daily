import React, { useState } from 'react';
import { MediaLibraryModal } from './MediaLibrary';

interface MediaBrowseButtonProps {
  onSelect: (url: string) => void;
  initialFolder?: string;
  className?: string;
  label?: string;
}

/**
 * Compact button that opens the Cloud Media Library modal.
 * Drop this next to any image URL input in editors.
 */
export const MediaBrowseButton: React.FC<MediaBrowseButtonProps> = ({
  onSelect,
  initialFolder,
  className = '',
  label = '☁️',
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`px-2 py-1.5 bg-arcane-700 hover:bg-arcane-600 rounded text-sm transition-colors ${className}`}
        title="Browse Cloud Media"
      >
        {label}
      </button>
      <MediaLibraryModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onSelect={(url) => { onSelect(url); setOpen(false); }}
        initialPath={initialFolder}
      />
    </>
  );
};
