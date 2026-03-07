import React, { useState } from 'react';

interface CollapsiblePanelProps {
  title: string;
  /** Extra classes on the outer container (appended to "dungeon-panel p-4 rounded") */
  className?: string;
  /** Start collapsed instead of expanded */
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

/**
 * A dungeon-panel with a clickable heading that toggles content visibility.
 * Used across asset editors for collapsible sections.
 */
export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  title,
  className = '',
  defaultCollapsed = false,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={`dungeon-panel p-4 rounded ${className}`}>
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between text-lg font-bold"
      >
        <span>{title}</span>
        <span className="text-lg text-stone-400">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <div className="mt-3">
          {children}
        </div>
      )}
    </div>
  );
};
