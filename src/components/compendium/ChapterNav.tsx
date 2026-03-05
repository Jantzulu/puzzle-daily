import React from 'react';

export interface ChapterTab {
  id: string;
  label: string;
  icon: string;
  count: number;
}

interface ChapterNavProps {
  tabs: ChapterTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /** 'vertical' for desktop (right edge), 'horizontal' for mobile (above book) */
  orientation: 'vertical' | 'horizontal';
}

/**
 * Chapter navigation — bookmark-style tabs for the compendium book.
 * Vertical mode: absolute-positioned on the right edge of the book.
 * Horizontal mode: scrollable row above the book on mobile.
 */
export const ChapterNav: React.FC<ChapterNavProps> = ({ tabs, activeTab, onTabChange, orientation }) => {
  const containerClass = orientation === 'vertical'
    ? 'compendium-chapter-tabs--vertical'
    : 'compendium-chapter-tabs--horizontal';

  return (
    <div className={containerClass}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`compendium-chapter-tab ${
            activeTab === tab.id ? 'compendium-chapter-tab--active' : ''
          }`}
          title={`${tab.label} (${tab.count})`}
        >
          <span className="inline-flex items-center gap-1.5">
            <span>{tab.icon}</span>
            <span className={orientation === 'horizontal' ? 'hidden sm:inline' : ''}>
              {tab.label}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
};
