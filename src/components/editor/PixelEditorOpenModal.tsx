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
  onSelectProject: (projectUrl: string, projectPath: string, pngPath: string | null, projectName: string) => void;
  onImportPng: (imageData: ImageData, width: number, height: number) => void;
}

type ModalTab = 'projects' | 'media';

export const PixelEditorOpenModal: React.FC<PixelEditorOpenModalProps> = ({
  isOpen,
  onClose,
  onSelectProject,
  onImportPng,
}) => {
  const [tab, setTab] = useState<ModalTab>('projects');
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Media browser state
  const [mediaPath, setMediaPath] = useState('');
  const [mediaEntries, setMediaEntries] = useState<MediaEntry[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [importingUrl, setImportingUrl] = useState<string | null>(null);

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

  const loadMedia = useCallback(async (path: string) => {
    setMediaLoading(true);
    try {
      const entries = await browseMedia(path);
      setMediaEntries(entries);
      setMediaPath(path);
    } catch (err) {
      console.error('Failed to browse media:', err);
      toast.error('Failed to load media');
    } finally {
      setMediaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadProjects();
      setTab('projects');
      setMediaPath('');
      setMediaEntries([]);
    }
  }, [isOpen, loadProjects]);

  // Load media when switching to media tab
  useEffect(() => {
    if (isOpen && tab === 'media' && mediaEntries.length === 0 && !mediaLoading) {
      loadMedia('');
    }
  }, [isOpen, tab, mediaEntries.length, mediaLoading, loadMedia]);

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

  const handleImportFromUrl = async (url: string) => {
    setImportingUrl(url);
    try {
      const result = await imageToPixelData(url);
      onImportPng(result.data, result.width, result.height);
      onClose();
    } catch (err) {
      console.error('Failed to import from URL:', err);
      toast.error('Failed to import image');
    } finally {
      setImportingUrl(null);
    }
  };

  const isImageFile = (name: string) => {
    return /\.(png|jpg|jpeg|gif|webp)$/i.test(name);
  };

  if (!isOpen) return null;

  const breadcrumbs = mediaPath ? mediaPath.split('/') : [];

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-stone-800 border border-stone-600 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with tabs */}
        <div className="px-4 pt-3 pb-0 border-b border-stone-700">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-parchment-100">Open</h2>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-200 text-lg px-2">
              ✕
            </button>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setTab('projects')}
              className={`px-3 py-1.5 text-sm font-medium rounded-t border-b-2 transition-colors ${
                tab === 'projects'
                  ? 'bg-stone-700 text-parchment-100 border-arcane-500'
                  : 'text-stone-400 hover:text-stone-200 border-transparent'
              }`}
            >
              Projects
            </button>
            <button
              onClick={() => setTab('media')}
              className={`px-3 py-1.5 text-sm font-medium rounded-t border-b-2 transition-colors ${
                tab === 'media'
                  ? 'bg-stone-700 text-parchment-100 border-arcane-500'
                  : 'text-stone-400 hover:text-stone-200 border-transparent'
              }`}
            >
              Media Library
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {tab === 'projects' && (
            <>
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
                        onSelectProject(proj.projectUrl, proj.projectPath, proj.pngPath || null, proj.name);
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
            </>
          )}

          {tab === 'media' && (
            <>
              {/* Breadcrumb navigation */}
              <div className="flex items-center gap-1 mb-3 text-xs flex-wrap">
                <button
                  onClick={() => loadMedia('')}
                  className={`hover:text-arcane-400 transition-colors ${mediaPath === '' ? 'text-parchment-100 font-medium' : 'text-stone-400'}`}
                >
                  Root
                </button>
                {breadcrumbs.map((segment, i) => {
                  const path = breadcrumbs.slice(0, i + 1).join('/');
                  const isLast = i === breadcrumbs.length - 1;
                  return (
                    <React.Fragment key={path}>
                      <span className="text-stone-600">/</span>
                      <button
                        onClick={() => !isLast && loadMedia(path)}
                        className={`hover:text-arcane-400 transition-colors truncate max-w-[120px] ${
                          isLast ? 'text-parchment-100 font-medium' : 'text-stone-400'
                        }`}
                      >
                        {segment}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>

              {mediaLoading ? (
                <div className="text-center text-stone-400 py-8 animate-pulse">Loading...</div>
              ) : mediaEntries.length === 0 ? (
                <div className="text-center text-stone-400 py-8">
                  <p>No files found in this folder.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* Folders */}
                  {mediaEntries.filter(e => e.isFolder).map(entry => (
                    <button
                      key={entry.path}
                      onClick={() => loadMedia(entry.path)}
                      className="group bg-stone-900 rounded-lg border border-stone-700 hover:border-arcane-500 transition-colors overflow-hidden text-left"
                    >
                      <div className="aspect-square bg-stone-950 flex items-center justify-center">
                        <span className="text-3xl">📁</span>
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="text-xs text-parchment-100 font-medium truncate group-hover:text-arcane-400 transition-colors">
                          {entry.name}
                        </p>
                      </div>
                    </button>
                  ))}
                  {/* Image files */}
                  {mediaEntries.filter(e => !e.isFolder && isImageFile(e.name)).map(entry => (
                    <button
                      key={entry.path}
                      onClick={() => entry.url && handleImportFromUrl(entry.url)}
                      disabled={importingUrl === entry.url}
                      className="group bg-stone-900 rounded-lg border border-stone-700 hover:border-arcane-500 transition-colors overflow-hidden text-left disabled:opacity-50"
                    >
                      <div className="aspect-square bg-stone-950 flex items-center justify-center overflow-hidden sprite-preview-bg">
                        {entry.url ? (
                          <img
                            src={entry.url}
                            alt={entry.name}
                            className="max-w-full max-h-full object-contain pixelated"
                          />
                        ) : (
                          <span className="text-stone-600 text-2xl">🖼</span>
                        )}
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="text-xs text-parchment-100 font-medium truncate group-hover:text-arcane-400 transition-colors">
                          {entry.name}
                        </p>
                        {importingUrl === entry.url && (
                          <p className="text-[10px] text-arcane-400 animate-pulse">Importing...</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
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
