import React from 'react';

interface BookLayoutProps {
  /** Left page content (entry list + search) */
  leftPage: React.ReactNode;
  /** Right page content (detail view) */
  rightPage: React.ReactNode;
  /** Chapter tab navigation, rendered on right edge (desktop) or above (mobile) */
  chapterTabs: React.ReactNode;
  /** Additional class name */
  className?: string;
}

/**
 * Desktop two-page open book layout.
 * Left page = index/list, right page = detail, spine between.
 * Chapter tabs rendered on right edge via absolute positioning.
 */
export const BookLayout: React.FC<BookLayoutProps> = ({ leftPage, rightPage, chapterTabs, className = '' }) => {
  return (
    <div className={`compendium-wrapper relative ${className}`}>
      {/* Chapter tabs on right edge */}
      {chapterTabs}

      {/* The book */}
      <div className="compendium-book" style={{ minHeight: '70vh' }}>
        {/* Decorative corners — left page */}
        <div className="compendium-corner compendium-corner--tl" />
        <div className="compendium-corner compendium-corner--bl" />

        {/* Left page — entry list */}
        <div className="compendium-page compendium-page--left" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="flex-1">{leftPage}</div>
          <div className="compendium-page-number">— Index —</div>
        </div>

        {/* Spine */}
        <div className="compendium-spine" />

        {/* Right page — detail */}
        <div className="compendium-page compendium-page--right" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="flex-1">{rightPage}</div>
          <div className="compendium-page-number">— Details —</div>
        </div>

        {/* Decorative corners — right page */}
        <div className="compendium-corner compendium-corner--tr" />
        <div className="compendium-corner compendium-corner--br" />
      </div>
    </div>
  );
};

interface SinglePageLayoutProps {
  children: React.ReactNode;
  chapterTabs: React.ReactNode;
  className?: string;
}

/**
 * Mobile single-page layout — looks like one parchment page.
 * Chapter tabs render horizontally above.
 */
export const SinglePageLayout: React.FC<SinglePageLayoutProps> = ({ children, chapterTabs, className = '' }) => {
  return (
    <div className={`compendium-wrapper ${className}`}>
      {/* Horizontal chapter tabs above */}
      {chapterTabs}

      {/* Single parchment page */}
      <div className="compendium-book--single">
        <div className="compendium-page--single relative">
          {/* Corners */}
          <div className="compendium-corner compendium-corner--tl" />
          <div className="compendium-corner compendium-corner--tr" />
          <div className="compendium-corner compendium-corner--bl" />
          <div className="compendium-corner compendium-corner--br" />

          {children}
        </div>
      </div>
    </div>
  );
};
