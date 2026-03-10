import React, { lazy, Suspense, useState } from 'react';

const MapEditor = lazy(() => import('./MapEditor').then(m => ({ default: m.MapEditor })));
const PixelEditorPage = lazy(() => import('./PixelEditorPage').then(m => ({ default: m.PixelEditorPage })));

type EditorTab = 'map' | 'pixel';

const TABS: { id: EditorTab; label: string; icon: string }[] = [
  { id: 'map', label: 'Map Editor', icon: '\uD83D\uDEE0' },
  { id: 'pixel', label: 'Pixel Editor', icon: '\uD83C\uDFA8' },
];

export const EditorsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<EditorTab>('map');

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-1 bg-stone-800 border-b border-stone-700">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'bg-stone-700 text-parchment-100 border-arcane-500'
                : 'text-stone-400 hover:text-stone-200 border-transparent hover:bg-stone-750'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Editor content */}
      <div className="flex-1 min-h-0">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <div className="text-copper-400 font-medieval text-lg animate-pulse">Loading...</div>
          </div>
        }>
          {activeTab === 'map' ? <MapEditor /> : <PixelEditorPage />}
        </Suspense>
      </div>
    </div>
  );
};
