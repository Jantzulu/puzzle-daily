import React, { lazy, Suspense, useState } from 'react';

const SchedulingDashboard = lazy(() => import('./SchedulingDashboard').then(m => ({ default: m.SchedulingDashboard })));
const StatsDashboard = lazy(() => import('./StatsDashboard').then(m => ({ default: m.StatsDashboard })));
const BugReportViewer = lazy(() => import('./BugReportViewer').then(m => ({ default: m.BugReportViewer })));

type ResourceTab = 'schedule' | 'stats' | 'bugs';

const TABS: { id: ResourceTab; label: string; icon: string }[] = [
  { id: 'schedule', label: 'Schedule', icon: '\uD83D\uDCC5' },
  { id: 'stats', label: 'Stats', icon: '\uD83D\uDCCA' },
  { id: 'bugs', label: 'Bug Reports', icon: '\uD83D\uDC1B' },
];

export const PuzzleResourcesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ResourceTab>('schedule');

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

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <div className="text-copper-400 font-medieval text-lg animate-pulse">Loading...</div>
          </div>
        }>
          {activeTab === 'schedule' && <SchedulingDashboard />}
          {activeTab === 'stats' && <StatsDashboard />}
          {activeTab === 'bugs' && <BugReportViewer />}
        </Suspense>
      </div>
    </div>
  );
};
