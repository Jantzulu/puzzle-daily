import React, { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PixelEditor } from './PixelEditor';

/**
 * Standalone page wrapper for the Pixel Editor.
 * Handles cloud save results, "New" workflow, and URL-based project loading.
 *
 * URL params:
 *   ?project=<url>  — opens a saved .project file
 */
export const PixelEditorPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [editorKey, setEditorKey] = useState(0);

  const projectUrlFromParams = searchParams.get('project') || undefined;

  const handleApply = useCallback((_base64: string, _projectUrl?: string) => {
    // Save handled inside PixelEditor — toast shown there
  }, []);

  const handleNew = useCallback(() => {
    setEditorKey(k => k + 1);
    setSearchParams({});
  }, [setSearchParams]);

  const handleProjectUrlChange = useCallback((url: string) => {
    setSearchParams({ project: url }, { replace: true });
  }, [setSearchParams]);

  return (
    <PixelEditor
      key={editorKey}
      mode="page"
      projectUrl={projectUrlFromParams}
      onApply={handleApply}
      onClose={() => {}}
      onNew={handleNew}
      onProjectUrlChange={handleProjectUrlChange}
    />
  );
};
