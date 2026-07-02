import React from 'react';
import { SlabMesh } from './SlabMesh';

interface BookLayoutProps {
  /** Left face content (entry list + search) */
  leftPage: React.ReactNode;
  /** Right face content (detail view) */
  rightPage: React.ReactNode;
  /** Chapter nav — the floating capsule above the slab */
  chapterTabs: React.ReactNode;
  /** Runic chevron button, bottom-left of the slab (previous entry) */
  prevButton?: React.ReactNode;
  /** Runic chevron button, bottom-right of the slab (next entry) */
  nextButton?: React.ReactNode;
  /** Right face footer line — defaults to "— Details —" */
  rightFooter?: React.ReactNode;
  /** Additional class name */
  className?: string;
}

/**
 * Desktop slab layout: one low-poly stone slab (SVG mesh behind), two
 * content faces on the flattened plate with a seam between them. The slab
 * has a fixed height — content scrolls, the stone never resizes.
 */
export const BookLayout: React.FC<BookLayoutProps> = ({ leftPage, rightPage, chapterTabs, prevButton, nextButton, rightFooter, className = '' }) => {
  return (
    <div className={`compendium-wrapper relative ${className}`}>
      {/* Floating chapter capsule */}
      {chapterTabs}

      {/* The slab */}
      <div className="compendium-book relative">
        <SlabMesh />

        {/* Left face — entry list */}
        <div className="compendium-page compendium-page--left" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="flex-1">{leftPage}</div>
          <div className="compendium-page-number">— Index —</div>
        </div>

        {/* Carved seam between the faces */}
        <div className="compendium-spine" />

        {/* Right face — detail */}
        <div className="compendium-page compendium-page--right" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="flex-1">{rightPage}</div>
          <div className="compendium-page-number">{rightFooter ?? '— Details —'}</div>
        </div>

        {/* Runic chevrons, set into the facet border */}
        {prevButton}
        {nextButton}
      </div>
    </div>
  );
};

interface SinglePageLayoutProps {
  children: React.ReactNode;
  chapterTabs: React.ReactNode;
  /** Runic chevron prev/next buttons (rendered on the slab) */
  cornerButtons?: React.ReactNode;
  className?: string;
}

/**
 * Mobile slab layout — the same low-poly stone, one face. Fixed height;
 * the content scrolls on the plate.
 */
export const SinglePageLayout: React.FC<SinglePageLayoutProps> = ({ children, chapterTabs, cornerButtons, className = '' }) => {
  return (
    <div className={`compendium-wrapper ${className}`}>
      {/* Floating chapter capsule */}
      {chapterTabs}

      {/* The slab */}
      <div className="compendium-book--single relative">
        <SlabMesh />

        <div className="compendium-page--single">
          {children}
        </div>

        {cornerButtons}
      </div>
    </div>
  );
};
