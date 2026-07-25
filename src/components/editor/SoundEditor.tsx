import React, { useState, useRef, useEffect, useMemo } from 'react';
import { toast } from '../shared/Toast';
import { findAssetUsages, formatUsageWarning } from '../../utils/assetDependencies';
import { scaledNameClass } from '../../utils/textScale';
import type { SoundAsset, GlobalSoundConfig, GlobalHapticConfig, HapticPattern } from '../../types/game';
import {
  saveSoundAsset,
  getSoundAssets,
  deleteSoundAsset,
  saveGlobalSoundConfig,
  getGlobalSoundConfig,
  saveGlobalHapticConfig,
  getFolders,
} from '../../utils/assetStorage';
import { HAPTIC_PATTERN_OPTIONS, vibratePreview, getEffectiveHapticConfig } from '../../utils/haptics';
import { soundManager } from '../../utils/soundManager';
import { AssetEditorLayout } from './AssetEditorLayout';
import { AssetBrowseTable, useBrowseSort, type BrowseColumn } from './AssetBrowseTable';
import { FolderDropdown, useFilteredAssets, InlineFolderPicker } from './FolderDropdown';
import { useBulkSelect, BulkActionBar, bulkDelete, bulkMoveToFolder, bulkExport, bulkImport } from './BulkActions';

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

// Haptic trigger categories for global config
const GLOBAL_HAPTIC_TRIGGERS = [
  { group: 'Gameplay', items: [
    { key: 'turnAdvance' as keyof GlobalHapticConfig, label: 'Turn Advance', description: 'Each turn during simulation' },
    { key: 'victory' as keyof GlobalHapticConfig, label: 'Victory', description: 'Puzzle solved' },
    { key: 'defeat' as keyof GlobalHapticConfig, label: 'Defeat', description: 'Out of turns or lethal damage' },
    { key: 'characterPlace' as keyof GlobalHapticConfig, label: 'Character Placed', description: 'Placing a hero on the board' },
    { key: 'heroSelect' as keyof GlobalHapticConfig, label: 'Hero Selected', description: 'Selecting a hero from the panel' },
    { key: 'heroRemove' as keyof GlobalHapticConfig, label: 'Hero Removed', description: 'Removing a placed hero from the board' },
    { key: 'heroTrash' as keyof GlobalHapticConfig, label: 'Clear All Heroes', description: 'Clicking trash to remove all heroes' },
    { key: 'playButton' as keyof GlobalHapticConfig, label: 'Play Button', description: 'Starting the simulation' },
    { key: 'testButton' as keyof GlobalHapticConfig, label: 'Test Button', description: 'Starting a hero or enemy test' },
    { key: 'lifeLost' as keyof GlobalHapticConfig, label: 'Life Lost', description: 'Losing a life on defeat' },
  ]},
  { group: 'Editor', items: [
    { key: 'tilePaint' as keyof GlobalHapticConfig, label: 'Tile Paint', description: 'Painting tiles in map editor' },
  ]},
];

const TABS = [
  { key: 'library' as const, label: 'Sound Library' },
  { key: 'global' as const, label: 'Sounds' },
  { key: 'haptics' as const, label: 'Haptics' },
];

/** The speaker glyph, reused at a fixed 28px box everywhere a sound is listed. */
const SoundIcon: React.FC = () => (
  <div className="w-7 h-7 bg-stone-800 border border-stone-700 rounded flex items-center justify-center flex-shrink-0">
    <svg className="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6.253v11.494m0 0A5.001 5.001 0 0012 12m0 5.747V6.253m0 0A5.001 5.001 0 0012 12m0-5.747L8 9H5a1 1 0 00-1 1v4a1 1 0 001 1h3l4 2.747" />
    </svg>
  </div>
);

export const SoundEditor: React.FC<{ initialSelectedId?: string }> = ({ initialSelectedId }) => {
  const [sounds, setSounds] = useState<SoundAsset[]>(() => getSoundAssets());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SoundAsset | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [globalConfig, setGlobalConfig] = useState<GlobalSoundConfig>(() => getGlobalSoundConfig());
  const [hapticConfig, setHapticConfig] = useState<GlobalHapticConfig>(() => getEffectiveHapticConfig());
  const [activeTab, setActiveTab] = useState<'library' | 'global' | 'haptics'>('library');
  const [isPlaying, setIsPlaying] = useState(false);
  const bulk = useBulkSelect();

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

  useEffect(() => {
    if (initialSelectedId) handleSelect(initialSelectedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSelect is stable; only run on mount with initialSelectedId
  }, [initialSelectedId]);

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
      toast.warning('Please upload an audio file or provide a URL');
      return;
    }
    saveSoundAsset(editing);
    refreshSounds();
    setSelectedId(editing.id);
    setIsCreating(false);
    toast.success(`Saved "${editing.name}"!`);
  };

  const handleDelete = (id: string) => {
    const usages = findAssetUsages('sound', id);
    const warning = usages.length > 0 ? `\n\n${formatUsageWarning(usages)}` : '';
    if (!confirm(`Delete this sound?${warning}`)) return;
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
      toast.warning('Please upload an audio file (MP3, WAV, OGG, etc.)');
      return;
    }

    // Check file size (limit to 1MB for localStorage)
    if (file.size > 1024 * 1024) {
      toast.warning('Audio file is too large. Please keep files under 1MB.');
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

  const handleHapticConfigChange = (key: keyof GlobalHapticConfig, pattern: HapticPattern | null) => {
    const newConfig = { ...hapticConfig, [key]: pattern };
    setHapticConfig(newConfig);
    saveGlobalHapticConfig(newConfig);
    if (pattern) vibratePreview(pattern);
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

  const handleCancel = () => {
    setEditing(null);
    setSelectedId(null);
    setIsCreating(false);
  };

  const folderNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of getFolders('objects')) map.set(f.id, f.name);
    return map;
  }, [sounds]); // eslint-disable-line react-hooks/exhaustive-deps -- folders change alongside asset edits

  // "Used by" is derived from the global-sound config the component already
  // holds: which triggers currently point at each sound. Built once per config
  // change so the sort comparator never rewalks the trigger table.
  const triggersBySound = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const group of GLOBAL_SOUND_TRIGGERS) {
      for (const item of group.items) {
        const soundId = globalConfig[item.key as keyof GlobalSoundConfig];
        if (!soundId) continue;
        const list = map.get(soundId);
        if (list) list.push(item.label);
        else map.set(soundId, [item.label]);
      }
    }
    return map;
  }, [globalConfig]);

  const browseColumns: BrowseColumn<SoundAsset>[] = [
    {
      key: 'icon',
      label: '',
      sortable: false,
      className: 'w-10',
      render: () => <SoundIcon />,
    },
    {
      key: 'name',
      label: 'Name',
      value: (s) => s.name || 'Unnamed',
      render: (s) => <span className="text-parchment-100">{s.name || 'Unnamed'}</span>,
    },
    {
      key: 'duration',
      label: 'Duration',
      align: 'right',
      value: (s) => s.duration ?? null,
      render: (s) => <span className="text-xs text-stone-400 tabular-nums">{formatDuration(s.duration)}</span>,
    },
    {
      key: 'source',
      label: 'Source',
      value: (s) => (s.audioData ? 'File' : s.audioUrl ? 'URL' : null),
      render: (s) => {
        if (s.audioData) {
          return (
            <span className="px-1.5 py-0 rounded border text-[10px] whitespace-nowrap bg-moss-900/40 text-moss-300 border-moss-700/50">
              File
            </span>
          );
        }
        if (s.audioUrl) {
          return (
            <span className="px-1.5 py-0 rounded border text-[10px] whitespace-nowrap bg-arcane-900/40 text-arcane-300 border-arcane-700/50">
              URL
            </span>
          );
        }
        return <span className="text-stone-600">—</span>;
      },
    },
    {
      key: 'folder',
      label: 'Folder',
      value: (s) => (s.folderId ? folderNames.get(s.folderId) ?? null : null),
      render: (s) => {
        const name = s.folderId ? folderNames.get(s.folderId) : undefined;
        return name
          ? <span className="text-xs text-stone-400">{name}</span>
          : <span className="text-stone-600">—</span>;
      },
    },
    {
      key: 'usedBy',
      label: 'Used by',
      value: (s) => triggersBySound.get(s.id)?.length || null,
      render: (s) => {
        const labels = triggersBySound.get(s.id) ?? [];
        if (labels.length === 0) return <span className="text-stone-600">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {labels.map((label, i) => (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0 rounded border whitespace-nowrap bg-copper-900/40 text-copper-300 border-copper-700/50"
              >
                🔊 {label}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'description',
      label: 'Description',
      value: (s) => s.description || null,
      render: (s) => (
        s.description
          ? <div className="text-xs text-stone-400 max-w-[22rem] truncate">{s.description}</div>
          : <span className="text-stone-600">—</span>
      ),
    },
  ];

  // One ordering feeds the table, the sidebar list, and prev/next.
  const sort = useBrowseSort(filteredSounds, browseColumns, 'name');

  const tabBar = (
    <div className="flex items-center gap-1.5">
      {TABS.map(t => (
        <button
          key={t.key}
          onClick={() => setActiveTab(t.key)}
          className={`px-2 py-0.5 rounded border text-xs ${
            activeTab === t.key
              ? 'bg-stone-700 text-parchment-100 border-arcane-500'
              : 'text-stone-400 border-stone-700 hover:text-stone-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  // ── Global sound + haptic config: their own full-width pages ──────────────
  if (activeTab === 'global') {
    return (
      <div className="p-4">
        <div className="max-w-7xl mx-auto space-y-2">
          {tabBar}
          <div>
            <div className="text-lg font-medieval text-copper-400">Global Sound Configuration</div>
            <p className="text-stone-400 text-xs">
              Assign sounds to game events. These are the default sounds used when no entity-specific sound is configured.
            </p>
          </div>

          {GLOBAL_SOUND_TRIGGERS.map((group) => (
            <div key={group.group} className="border border-stone-700 rounded overflow-hidden">
              <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">
                {group.group}
              </div>
              <div className="p-3">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
                  {group.items.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-2">
                      <span className="text-stone-400 text-sm truncate">{item.label}</span>
                      <select
                        value={globalConfig[item.key as keyof GlobalSoundConfig] || ''}
                        onChange={(e) => handleGlobalConfigChange(item.key, e.target.value || undefined)}
                        className="flex-1 max-w-[140px] px-2 py-1 bg-stone-800 border border-stone-700 rounded text-parchment-100 text-xs"
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
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeTab === 'haptics') {
    return (
      <div className="p-4">
        <div className="max-w-7xl mx-auto space-y-2">
          {tabBar}
          <div>
            <div className="text-lg font-medieval text-copper-400">Haptic Feedback</div>
            <p className="text-stone-400 text-xs">
              Configure vibration patterns for game events. These apply to all users on mobile devices.
              Set "None" to disable haptics for a specific event.
            </p>
          </div>

          {GLOBAL_HAPTIC_TRIGGERS.map((group) => (
            <div key={group.group} className="border border-stone-700 rounded overflow-hidden">
              <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">
                {group.group}
              </div>
              <div className="p-3">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
                  {group.items.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-stone-300 text-sm">{item.label}</span>
                        <p className="text-stone-500 text-[10px] leading-tight">{item.description}</p>
                      </div>
                      <select
                        value={hapticConfig[item.key] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleHapticConfigChange(item.key, val ? val as HapticPattern : null);
                        }}
                        className="w-24 flex-shrink-0 px-2 py-1 bg-stone-800 border border-stone-700 rounded text-parchment-100 text-xs"
                      >
                        <option value="">None</option>
                        {HAPTIC_PATTERN_OPTIONS.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Library tab ───────────────────────────────────────────────────────────
  const searchInput = (
    <input
      type="text"
      placeholder="Search sounds..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="flex-1 min-w-0 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-parchment-100 placeholder-stone-500 focus:outline-none focus:border-arcane-500"
    />
  );

  const folderFilter = (
    <FolderDropdown
      category="objects"
      selectedFolderId={selectedFolderId}
      onFolderSelect={setSelectedFolderId}
    />
  );

  const newButton = (
    <button
      onClick={handleNew}
      className="px-2 py-0.5 rounded border text-xs bg-green-900/40 text-green-300 border-green-700/50 hover:bg-green-900/60 flex-shrink-0"
    >
      + New
    </button>
  );

  const countLabel = (
    <span className="ml-1.5 text-xs font-sans text-stone-500">
      {filteredSounds.length}{filteredSounds.length !== sounds.length && ` / ${sounds.length}`}
    </span>
  );

  const bulkBar = (
    <BulkActionBar
      count={bulk.count}
      totalCount={filteredSounds.length}
      onSelectAll={() => bulk.selectAll(filteredSounds.map(s => s.id))}
      onClear={bulk.clear}
      onDelete={() => {
        const nameMap = new Map(sounds.map(s => [s.id, s.name]));
        const deleted = bulkDelete([...bulk.selectedIds], 'sound', deleteSoundAsset, nameMap);
        if (deleted.length) { refreshSounds(); bulk.clear(); if (selectedId && deleted.includes(selectedId)) { setSelectedId(null); setEditing(null); } }
      }}
      onMoveToFolder={() => {
        bulkMoveToFolder([...bulk.selectedIds], 'objects', (id: string) => sounds.find(s => s.id === id), saveSoundAsset);
        refreshSounds(); bulk.clear();
      }}
      onExport={() => {
        const items = sounds.filter(s => bulk.selectedIds.has(s.id));
        bulkExport(items, 'sounds-export.json', 'sound');
      }}
      onImport={() => bulkImport({
        assetType: 'sound',
        saveFn: saveSoundAsset,
        existingIds: new Set(sounds.map(s => s.id)),
        onComplete: () => { refreshSounds(); bulk.clear(); },
      })}
    />
  );

  const rowActionButtons = (sound: SoundAsset) => (
    <>
      <InlineFolderPicker
        category="objects"
        currentFolderId={sound.folderId}
        onFolderChange={(folderId) => handleFolderChange(sound.id, folderId)}
      />
      <button
        onClick={() => handleDelete(sound.id)}
        className="px-1 py-0.5 text-xs leading-none rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
        title="Delete"
      >
        ✕
      </button>
    </>
  );

  return (
    <AssetEditorLayout
      isEditing={!!editing}
      onBack={handleCancel}
      listTitle="Sounds"
      listPanel={
        <>
          {tabBar}

          <div className="flex justify-between items-center gap-2">
            <h2 className="text-lg font-medieval text-copper-400">
              Sounds
              {countLabel}
            </h2>
            {newButton}
          </div>

          {/* Search + folder filter share one row so the list starts higher */}
          <div className="flex items-center gap-1.5">
            {searchInput}
            <div className="w-32 flex-shrink-0">{folderFilter}</div>
          </div>

          {bulkBar}

          <div className="border border-stone-700 rounded max-h-[calc(100vh-250px)] overflow-y-auto overflow-x-hidden dense-scrollbar">
            {sort.sorted.length === 0 ? (
              <div className="px-2 py-4 text-center text-stone-500 text-sm">
                {searchTerm ? 'No matches' : 'No sounds yet. Click "+ New" to add one!'}
              </div>
            ) : (
              sort.sorted.map((sound) => {
                const isSelected = selectedId === sound.id;
                return (
                  <div
                    key={sound.id}
                    onClick={() => handleSelect(sound.id)}
                    className={`group px-2 py-1.5 cursor-pointer transition-colors border-t border-stone-700/60 first:border-t-0 ${
                      bulk.isSelected(sound.id) ? 'bg-sky-900/40' :
                      isSelected
                        ? 'bg-copper-900/50'
                        : 'hover:bg-stone-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={bulk.isSelected(sound.id)}
                        onChange={() => bulk.toggle(sound.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-sky-500 flex-shrink-0"
                      />
                      <SoundIcon />
                      {/* Name owns the remaining width; the delete button only
                          takes space once the row is hovered, focused, or
                          selected. Deliberately a <p>, never an h3 —
                          `.theme-root h3` sizes headings at 1.25x the theme
                          heading size and beats Tailwind's text-* utility. */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-parchment-100 truncate ${scaledNameClass(sound.name)}`}>{sound.name}</p>
                        <p className="text-stone-500 text-[10px] leading-tight">{formatDuration(sound.duration)}</p>
                      </div>
                      <div className={`flex items-center gap-1 flex-shrink-0 transition-opacity ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                      }`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(sound.id);
                          }}
                          className="px-1 py-0.5 text-xs leading-none rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      }
      browseControls={
        <div className="space-y-2">
          {tabBar}
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-medieval text-copper-400 mr-1">
              Sounds
              {countLabel}
            </h2>
            <div className="w-48">{searchInput}</div>
            <div className="w-40">{folderFilter}</div>
            {newButton}
            <div className="ml-auto">{bulkBar}</div>
          </div>
        </div>
      }
      browsePanel={
        <AssetBrowseTable
          items={sort.sorted}
          columns={browseColumns}
          sortKey={sort.sortKey}
          sortDir={sort.sortDir}
          onToggleSort={sort.toggleSort}
          onOpen={(s) => handleSelect(s.id)}
          selection={{ isSelected: bulk.isSelected, toggle: bulk.toggle }}
          rowActions={rowActionButtons}
          emptyMessage={searchTerm ? 'No matches' : 'No sounds yet. Click "+ New" to add one!'}
        />
      }
      navigation={{
        items: sort.sorted.map(s => ({ id: s.id, name: s.name || 'Unnamed' })),
        currentId: selectedId,
        onSelect: (id) => handleSelect(id),
      }}
      detailPanel={
        editing ? (
          <div className="space-y-4">
            <div className="flex justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <SoundIcon />
                <div className="text-lg font-medieval text-copper-400">
                  {isCreating ? 'Create Sound' : 'Edit Sound'}
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={handleCancel}
                  className="px-2 py-0.5 rounded border text-xs border-stone-700 text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-2 py-0.5 rounded border text-xs bg-moss-900/40 text-moss-300 border-moss-700/50 hover:bg-moss-900/60"
                >
                  Save Sound
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
                className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-parchment-100"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-stone-300 text-sm mb-1">Description (optional)</label>
              <textarea
                value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-parchment-100"
                rows={2}
              />
            </div>

            {/* Audio Source - File Upload OR URL */}
            <div>
              <label className="block text-stone-300 text-sm mb-2">Audio Source</label>

              {/* Upload File Option */}
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2 py-0.5 rounded border text-xs bg-arcane-900/40 text-arcane-300 border-arcane-700/50 hover:bg-arcane-900/60"
                  >
                    {editing.audioData ? 'Replace Audio File' : 'Upload Audio File'}
                  </button>
                  {editing.audioData && (
                    <span className="text-green-400 text-xs">
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
                <div className="flex-1 h-px bg-stone-700"></div>
                <span className="text-stone-500 text-xs">OR</span>
                <div className="flex-1 h-px bg-stone-700"></div>
              </div>

              {/* URL Option */}
              <div>
                <label className="block text-stone-400 text-xs mb-1">Audio URL (Supabase, CDN, etc.)</label>
                <input
                  type="url"
                  value={editing.audioUrl || ''}
                  onChange={(e) => setEditing({ ...editing, audioUrl: e.target.value || undefined })}
                  placeholder="https://your-storage.com/audio/file.mp3"
                  className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-parchment-100"
                />
                <p className="text-stone-500 text-xs mt-1">
                  Link to external audio file. No file size limit. Fetched when played.
                </p>
              </div>

              {/* Preview Button */}
              {(editing.audioData || editing.audioUrl) && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={handlePlaySound}
                    disabled={isPlaying}
                    className={`px-2 py-0.5 rounded border text-xs ${
                      isPlaying
                        ? 'bg-stone-800 text-stone-500 border-stone-700 cursor-not-allowed'
                        : 'bg-purple-900/40 text-purple-300 border-purple-700/50 hover:bg-purple-900/60'
                    }`}
                  >
                    {isPlaying ? 'Playing...' : '▶ Preview Sound'}
                  </button>
                  {editing.audioUrl && !editing.audioData && (
                    <span className="text-stone-400 text-xs">
                      (Will fetch from URL)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Folder */}
            {!isCreating && (
              <div>
                <label className="block text-stone-300 text-sm mb-1">Folder</label>
                <InlineFolderPicker
                  category="objects"
                  currentFolderId={editing.folderId}
                  onFolderChange={(folderId) => handleFolderChange(editing.id, folderId)}
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
        ) : null
      }
      emptyState={
        <div className="border border-stone-700 rounded p-6 text-center">
          <div className="text-lg font-medieval text-copper-400 mb-2">Sound Editor</div>
          <p className="text-sm text-stone-400 mb-4">
            Create and manage sound effects and music for your puzzles.
            <br />
            Select a sound from the list or create a new one.
          </p>
          <button
            onClick={handleNew}
            className="px-2 py-0.5 rounded border text-xs bg-green-900/40 text-green-300 border-green-700/50 hover:bg-green-900/60"
          >
            + Create New Sound
          </button>
        </div>
      }
    />
  );
};

export default SoundEditor;
