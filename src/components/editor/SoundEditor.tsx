import React, { useState, useRef, useEffect } from 'react';
import type { SoundAsset, GlobalSoundConfig } from '../../types/game';
import {
  saveSoundAsset,
  getSoundAssets,
  deleteSoundAsset,
  loadSoundAsset,
  saveGlobalSoundConfig,
  getGlobalSoundConfig,
  getFolders,
} from '../../utils/assetStorage';
import { soundManager } from '../../utils/soundManager';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';

// Sound trigger categories for global config
const GLOBAL_SOUND_TRIGGERS = [
  { group: 'Tile Interactions', items: [
    { key: 'teleport', label: 'Teleport' },
    { key: 'iceSlide', label: 'Ice Slide' },
    { key: 'tileDamage', label: 'Tile Damage' },
    { key: 'pressurePlate', label: 'Pressure Plate' },
  ]},
  { group: 'Game State', items: [
    { key: 'victory', label: 'Victory' },
    { key: 'defeat', label: 'Defeat' },
    { key: 'lifeLost', label: 'Life Lost' },
  ]},
  { group: 'UI Sounds', items: [
    { key: 'buttonClick', label: 'Button Click' },
    { key: 'characterPlaced', label: 'Character Placed' },
    { key: 'characterRemoved', label: 'Character Removed' },
    { key: 'simulationStart', label: 'Simulation Start' },
    { key: 'simulationStop', label: 'Simulation Stop' },
    { key: 'error', label: 'Error' },
  ]},
  { group: 'Music', items: [
    { key: 'backgroundMusic', label: 'Background Music' },
    { key: 'victoryMusic', label: 'Victory Music' },
    { key: 'defeatMusic', label: 'Defeat Music' },
  ]},
];

export const SoundEditor: React.FC = () => {
  const [sounds, setSounds] = useState<SoundAsset[]>(() => getSoundAssets());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SoundAsset | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [globalConfig, setGlobalConfig] = useState<GlobalSoundConfig>(() => getGlobalSoundConfig());
  const [activeTab, setActiveTab] = useState<'library' | 'global'>('library');
  const [isPlaying, setIsPlaying] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter sounds based on folder and search term
  const folderFilteredSounds = useFilteredAssets(sounds, selectedFolderId);
  const filteredSounds = folderFilteredSounds.filter(sound =>
    sound.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (sound.description && sound.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const refreshSounds = () => {
    setSounds(getSoundAssets());
  };

  const handleSelect = (id: string) => {
    const sound = sounds.find(s => s.id === id);
    if (sound) {
      setSelectedId(id);
      setEditing({ ...sound });
      setIsCreating(false);
    }
  };

  const handleNew = () => {
    const newSound: SoundAsset = {
      id: 'sound_' + Date.now(),
      name: 'New Sound',
      description: '',
      audioData: '',
      createdAt: new Date().toISOString(),
    };
    setEditing(newSound);
    setSelectedId(null);
    setIsCreating(true);
  };

  const handleSave = () => {
    if (!editing) return;
    if (!editing.audioData && !editing.audioUrl) {
      alert('Please upload an audio file or provide a URL');
      return;
    }
    saveSoundAsset(editing);
    refreshSounds();
    setSelectedId(editing.id);
    setIsCreating(false);
    alert(`Saved "${editing.name}"!`);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this sound?')) return;
    deleteSoundAsset(id);
    refreshSounds();
    if (selectedId === id) {
      setSelectedId(null);
      setEditing(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;

    // Check file type
    if (!file.type.startsWith('audio/')) {
      alert('Please upload an audio file (MP3, WAV, OGG, etc.)');
      return;
    }

    // Check file size (limit to 1MB for localStorage)
    if (file.size > 1024 * 1024) {
      alert('Audio file is too large. Please keep files under 1MB.');
      return;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;

      // Get duration using Audio element
      const audio = new Audio(base64);
      audio.onloadedmetadata = () => {
        setEditing({
          ...editing,
          audioData: base64,
          duration: audio.duration,
          name: editing.name === 'New Sound' ? file.name.replace(/\.[^/.]+$/, '') : editing.name,
        });
      };
      audio.onerror = () => {
        // Still set the data even if we can't get duration
        setEditing({
          ...editing,
          audioData: base64,
          name: editing.name === 'New Sound' ? file.name.replace(/\.[^/.]+$/, '') : editing.name,
        });
      };
    };
    reader.readAsDataURL(file);

    // Clear input for re-upload
    e.target.value = '';
  };

  const handlePlaySound = async () => {
    if ((!editing?.audioData && !editing?.audioUrl) || isPlaying) return;

    setIsPlaying(true);
    try {
      await soundManager.initialize();

      // If we have base64 data, use it directly
      if (editing.audioData) {
        await soundManager.playSfx(editing.audioData);
      } else if (editing.audioUrl) {
        // Fetch from URL and play
        const response = await fetch(editing.audioUrl);
        if (!response.ok) throw new Error('Failed to fetch audio');
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        const extension = editing.audioUrl.split('.').pop()?.toLowerCase() || 'mp3';
        const mimeTypes: Record<string, string> = {
          'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
          'webm': 'audio/webm', 'm4a': 'audio/mp4', 'aac': 'audio/aac',
        };
        const mimeType = mimeTypes[extension] || 'audio/mpeg';
        const dataUrl = `data:${mimeType};base64,${base64}`;
        await soundManager.playSfx(dataUrl);
      }

      // Reset playing state after sound duration (or 3 seconds max)
      const duration = editing.duration ? Math.min(editing.duration * 1000, 3000) : 1000;
      setTimeout(() => setIsPlaying(false), duration);
    } catch (error) {
      console.error('Failed to play sound:', error);
      setIsPlaying(false);
    }
  };

  const handleGlobalConfigChange = (key: string, soundId: string | undefined) => {
    const newConfig = { ...globalConfig, [key]: soundId || undefined };
    // Remove undefined keys
    Object.keys(newConfig).forEach(k => {
      if (newConfig[k as keyof GlobalSoundConfig] === undefined) {
        delete newConfig[k as keyof GlobalSoundConfig];
      }
    });
    setGlobalConfig(newConfig);
    saveGlobalSoundConfig(newConfig);
  };

  const handleFolderChange = (soundId: string, folderId: string | undefined) => {
    const sound = sounds.find(s => s.id === soundId);
    if (sound) {
      saveSoundAsset({ ...sound, folderId });
      refreshSounds();
      if (editing && editing.id === soundId) {
        setEditing({ ...editing, folderId });
      }
    }
  };

  const formatDuration = (seconds: number | undefined): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Sound Library */}
      <div className="lg:col-span-1 dungeon-panel rounded-lg p-4">
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('library')}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
              activeTab === 'library'
                ? 'bg-arcane-700 text-parchment-100'
                : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
            }`}
          >
            Sound Library
          </button>
          <button
            onClick={() => setActiveTab('global')}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
              activeTab === 'global'
                ? 'bg-arcane-700 text-parchment-100'
                : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
            }`}
          >
            Global Config
          </button>
        </div>

        {activeTab === 'library' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold font-medieval text-copper-400">Sounds</h2>
              <button
                onClick={handleNew}
                className="dungeon-btn-success"
              >
                + New
              </button>
            </div>

            {/* Folder Filter */}
            <div className="mb-3">
              <FolderDropdown
                category="objects"
                selectedFolderId={selectedFolderId}
                onSelect={setSelectedFolderId}
                showAllOption
              />
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search sounds..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="dungeon-input w-full mb-3"
            />

            {/* Sound List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredSounds.length === 0 ? (
                <p className="text-stone-400 text-sm text-center py-4">
                  No sounds yet. Click "+ New" to add one!
                </p>
              ) : (
                filteredSounds.map((sound) => (
                  <div
                    key={sound.id}
                    onClick={() => handleSelect(sound.id)}
                    className={`p-3 rounded cursor-pointer flex items-center justify-between ${
                      selectedId === sound.id
                        ? 'bg-arcane-700'
                        : 'bg-stone-700 hover:bg-stone-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-stone-600 rounded flex items-center justify-center">
                        <svg className="w-4 h-4 text-stone-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6.253v11.494m0 0A5.001 5.001 0 0012 12m0 5.747V6.253m0 0A5.001 5.001 0 0012 12m0-5.747L8 9H5a1 1 0 00-1 1v4a1 1 0 001 1h3l4 2.747" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-parchment-100 text-sm font-medium">{sound.name}</p>
                        <p className="text-stone-400 text-xs">{formatDuration(sound.duration)}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(sound.id);
                      }}
                      className="text-red-400 hover:text-red-300 p-1"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'global' && (
          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            <h3 className="text-parchment-100 font-medium">Global Sound Configuration</h3>
            <p className="text-stone-400 text-xs">
              Assign sounds to game events. These are the default sounds used when no entity-specific sound is configured.
            </p>

            {GLOBAL_SOUND_TRIGGERS.map((group) => (
              <div key={group.group} className="space-y-2">
                <h4 className="text-stone-300 text-sm font-medium border-b border-stone-700 pb-1">
                  {group.group}
                </h4>
                {group.items.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-2">
                    <span className="text-stone-400 text-sm">{item.label}</span>
                    <select
                      value={globalConfig[item.key as keyof GlobalSoundConfig] || ''}
                      onChange={(e) => handleGlobalConfigChange(item.key, e.target.value || undefined)}
                      className="flex-1 max-w-[140px] px-2 py-1 bg-stone-700 rounded text-parchment-100 text-xs"
                    >
                      <option value="">None</option>
                      {sounds.map((sound) => (
                        <option key={sound.id} value={sound.id}>
                          {sound.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right Panel - Sound Editor */}
      <div className="lg:col-span-2 dungeon-panel rounded-lg p-4">
        {!editing ? (
          <div className="flex items-center justify-center h-64 text-stone-400">
            Select a sound or create a new one
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-parchment-100">
                {isCreating ? 'New Sound' : 'Edit Sound'}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditing(null);
                    setSelectedId(null);
                    setIsCreating(false);
                  }}
                  className="px-3 py-1 bg-stone-600 hover:bg-stone-500 rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1 bg-moss-700 hover:bg-moss-600 rounded text-sm"
                >
                  Save
                </button>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-stone-300 text-sm mb-1">Name</label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-stone-300 text-sm mb-1">Description (optional)</label>
              <textarea
                value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm"
                rows={2}
              />
            </div>

            {/* Audio Source - File Upload OR URL */}
            <div>
              <label className="block text-stone-300 text-sm mb-2">Audio Source</label>

              {/* Upload File Option */}
              <div className="mb-3">
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-arcane-700 hover:bg-arcane-600 rounded text-sm"
                  >
                    {editing.audioData ? 'Replace Audio File' : 'Upload Audio File'}
                  </button>
                  {editing.audioData && (
                    <span className="text-green-400 text-sm">
                      File loaded ({formatDuration(editing.duration)})
                    </span>
                  )}
                </div>
                <p className="text-stone-500 text-xs mt-1">
                  Supports MP3, WAV, OGG. Max file size: 1MB (stored in browser).
                </p>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-stone-600"></div>
                <span className="text-stone-500 text-xs">OR</span>
                <div className="flex-1 h-px bg-stone-600"></div>
              </div>

              {/* URL Option */}
              <div>
                <label className="block text-stone-400 text-xs mb-1">Audio URL (Supabase, CDN, etc.)</label>
                <input
                  type="url"
                  value={editing.audioUrl || ''}
                  onChange={(e) => setEditing({ ...editing, audioUrl: e.target.value || undefined })}
                  placeholder="https://your-storage.com/audio/file.mp3"
                  className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm"
                />
                <p className="text-stone-500 text-xs mt-1">
                  Link to external audio file. No file size limit. Fetched when played.
                </p>
              </div>

              {/* Preview Button */}
              {(editing.audioData || editing.audioUrl) && (
                <div className="mt-3">
                  <button
                    onClick={handlePlaySound}
                    disabled={isPlaying}
                    className={`px-4 py-2 rounded text-sm ${
                      isPlaying
                        ? 'bg-stone-600 text-stone-400 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-700'
                    }`}
                  >
                    {isPlaying ? 'Playing...' : '▶ Preview Sound'}
                  </button>
                  {editing.audioUrl && !editing.audioData && (
                    <span className="ml-3 text-stone-400 text-xs">
                      (Will fetch from URL)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Folder */}
            {!isCreating && editing && (
              <div>
                <label className="block text-stone-300 text-sm mb-1">Folder</label>
                <InlineFolderPicker
                  category="objects"
                  currentFolderId={editing.folderId}
                  onSelect={(folderId) => handleFolderChange(editing.id, folderId)}
                />
              </div>
            )}

            {/* Audio Waveform Preview (visual indicator) */}
            {editing.audioData && (
              <div className="mt-4 p-4 bg-stone-700 rounded">
                <div className="flex items-center justify-center gap-1 h-12">
                  {/* Simple waveform visualization */}
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-blue-500 rounded-full"
                      style={{
                        height: `${Math.max(8, Math.sin(i * 0.5) * 20 + Math.random() * 20 + 10)}px`,
                        opacity: 0.5 + Math.random() * 0.5,
                      }}
                    />
                  ))}
                </div>
                <p className="text-center text-stone-400 text-xs mt-2">
                  Audio ready to use
                </p>
              </div>
            )}
          </div>
        )}
      </div>
        </div>
      </div>
    </div>
  );
};

export default SoundEditor;
