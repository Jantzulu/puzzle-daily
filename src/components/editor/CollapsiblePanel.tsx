import React, { useState } from 'react';

interface CollapsiblePanelProps {
  title: string;
  /**
   * Extra classes on the CONTENT body. Every call site passes spacing
   * utilities (space-y-3 / space-y-2) intended for the fields inside; they
   * used to land on the outer container, where they did nothing, so those
   * forms rendered flush.
   */
  className?: string;
  /** Start collapsed instead of expanded */
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

/**
 * A collapsible section for the asset editors, wearing the Production
 * dashboard's chrome: one thin border, an uppercase header strip that doubles
 * as the toggle, and a tight body. Replaced the dungeon-panel look (border-2
 * plus bevel shadows) during the 2026-07-25 dev-page restyle.
 */
export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  title,
  className = '',
  defaultCollapsed = false,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="border border-stone-700 rounded overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400 hover:text-stone-200 transition-colors"
      >
        <span>{title}</span>
        <span>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <div className={`p-3 ${className}`}>
          {children}
        </div>
      )}
    </div>
  );
};
