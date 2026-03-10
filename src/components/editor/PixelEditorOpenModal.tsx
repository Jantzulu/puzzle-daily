import React, { useState, useEffect, useCallback, useRef } from 'react';
import { browseMedia, type MediaEntry } from '../../utils/mediaStorage';
import { imageToPixelData } from './pixelEditorUtils';
import { toast } from '../shared/Toast';

interface ProjectEntry {
  name: string;
  projectUrl: string;
  projectPath: string;
  pngUrl?: string;
  pngPath?: string;
  date: string;
}

interface PixelEditorOpenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (projectUrl: string, projectPath: string, pngPath: string | null) => void;
  onImportPng: (imageData: ImageData, width: number, height: number) => void;
}

export const PixelEditorOpenModal: React.FC<PixelEditorOpenModalProps> = ({
  isOpen,
  onClose,
  onSelectProject,
  onImportPng,
}) => {
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      // List all folders under pixel-art/
      const folders = await browseMedia('pixel-art');
      const projectFolders = folders.filter(e => e.isFolder);

      const entries: ProjectEntry[] = [];
      for (const folder of projectFolders) {
        const files = await browseMedia(folder.path);
        // Find .project and .png files
        const projectFile = files.find(f => !f.isFolder && f.name.endsWith('.project'));
        const pngFile = files.find(f => !f.isFolder && f.name.endsWith('.png') && !f.name.endsWith('.project'));

        if (projectFile?.url) {
          entries.push({
            name: folder.name,
            projectUrl: projectFile.url,
            projectPath: projectFile.path,
            pngUrl: pngFile?.url,
            pngPath: pngFile?.path || null,
            date: projectFile.createdAt || '',
          });
        }
      }

      // Sort by date, newest first
      entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setProjects(entries);
    } catch (err) {
      console.error('Failed to browse projects:', err);
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadProjects();
  }, [isOpen, loadProjects]);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const result = await imageToPixelData(dataUrl);
      onImportPng(result.data, result.width, result.height);
      onClose();
    } catch (err) {
      console.error('Failed to import PNG:', err);
      toast.error('Failed to import image');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-stone-800 border border-stone-600 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-700">
          <h2 className="text-lg font-bold text-parchment-100">Open Project</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-200 text-lg px-2">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-stone-400 py-8 animate-pulse">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="text-center text-stone-400 py-8">
              <p className="mb-2">No saved projects found.</p>
              <p className="text-xs text-stone-500">Save a project first, or import a PNG below.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {projects.map((proj) => (
                <button
                  key={proj.projectPath}
                  onClick={() => {
                    onSelectProject(proj.projectUrl, proj.projectPath, proj.pngPath || null);
                    onClose();
                  }}
                  className="group bg-stone-900 rounded-lg border border-stone-700 hover:border-arcane-500 transition-colors overflow-hidden text-left"
                >
                  {/* Thumbnail */}
                  <div className="aspect-square bg-stone-950 flex items-center justify-center overflow-hidden sprite-preview-bg">
                    {proj.pngUrl ? (
                      <img
                        src={proj.pngUrl}
                        alt={proj.name}
                        className="max-w-full max-h-full object-contain pixelated"
                      />
                    ) : (
                      <span className="text-stone-600 text-2xl">?</span>
                    )}
                  </div>
                  {/* Info */}
                  <div className="px-2 py-1.5">
                    <p className="text-xs text-parchment-100 font-medium truncate group-hover:text-arcane-400 transition-colors">
                      {proj.name}
                    </p>
                    {proj.date && (
                      <p className="text-[10px] text-stone-500 truncate">
                        {new Date(proj.date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-stone-700">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="dungeon-btn text-sm w-full"
          >
            Import PNG from Computer
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};
