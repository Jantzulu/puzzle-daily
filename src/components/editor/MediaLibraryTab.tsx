import React from 'react';
import { MediaLibraryInner } from './MediaLibrary';

export const MediaLibraryTab: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-6" style={{ height: 'calc(100vh - 130px)' }}>
      <MediaLibraryInner />
    </div>
  );
};
