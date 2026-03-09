import React, { useCallback, useState } from 'react';
import { PixelEditor } from './PixelEditor';
import { toast } from '../shared/Toast';

/**
 * Standalone page wrapper for the Pixel Editor.
 * Handles cloud save results and provides a "New" workflow.
 */
export const PixelEditorPage: React.FC = () => {
  const [editorKey, setEditorKey] = useState(0);
  const [lastSavedUrl, setLastSavedUrl] = useState<string | null>(null);

  const handleApply = useCallback((base64: string, projectUrl?: string) => {
    if (projectUrl) {
      setLastSavedUrl(projectUrl);
    }
    toast.success('Image saved to cloud! Browse it from the Assets media library.');
  }, []);

  const handleNew = useCallback(() => {
    setEditorKey(k => k + 1);
    setLastSavedUrl(null);
  }, []);

  return (
    <PixelEditor
      key={editorKey}
      mode="page"
      onApply={handleApply}
      onClose={() => {}} // no-op in page mode — handled by nav
      onNew={handleNew}
    />
  );
};
