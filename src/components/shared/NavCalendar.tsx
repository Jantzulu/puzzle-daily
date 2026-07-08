import React, { useState } from 'react';
import { NavSheet } from './NavSheet';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function ordinal(d: number): string {
  if (d % 100 >= 11 && d % 100 <= 13) return `${d}th`;
  switch (d % 10) {
    case 1: return `${d}st`;
    case 2: return `${d}nd`;
    case 3: return `${d}rd`;
    default: return `${d}th`;
  }
}

/** Leading blanks + day numbers for a month's 7-column grid. */
function monthCells(year: number, month: number): (number | null)[] {
  const cells: (number | null)[] = [];
  const firstWeekday = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= dayCount; d++) cells.push(d);
  return cells;
}

/**
 * Calendar in the navbar — the marquee's left counterweight (mirrors the
 * hamburger: pinned at the left edge on mobile, in flow left of the title
 * on desktop, where it replaces the old ghost spacer at the same 44px).
 * Opens a NavSheet with a stone-carved month showing the current date.
 */
export const NavCalendar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });

  const today = new Date();
  const isTodaysMonth = view.y === today.getFullYear() && view.m === today.getMonth();

  const openSheet = () => {
    // Always greet with the current month, wherever last browsing ended
    setView({ y: today.getFullYear(), m: today.getMonth() });
    setOpen(true);
  };

  const step = (delta: number) => {
    setView(v => {
      const m = v.m + delta;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });
  };

  return (
    <>
      <button
        onClick={openSheet}
        className="p-2 text-stone-400 hover:text-copper-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center absolute left-3 md:static shrink-0"
        aria-label="Calendar"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10m-11 10h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>

      <NavSheet open={open} onClose={() => setOpen(false)} label="Calendar">
        <div className="p-4 select-none">
          {/* Month masthead with flanking step arrows */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => step(-1)}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center text-xl font-medieval text-stone-400 hover:text-copper-400 transition-colors"
              aria-label="Previous month"
            >
              ‹
            </button>
            <div className="font-medieval font-bold text-lg text-copper-400 text-shadow-dungeon">
              {MONTHS[view.m]} {view.y}
            </div>
            <button
              onClick={() => step(1)}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center text-xl font-medieval text-stone-400 hover:text-copper-400 transition-colors"
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w, i) => (
              <div key={`w${i}`} className="text-xs font-medieval text-stone-400 pb-1">
                {w}
              </div>
            ))}
            {monthCells(view.y, view.m).map((day, i) =>
              day === null ? (
                <div key={`b${i}`} />
              ) : (
                <div
                  key={`d${i}`}
                  className={`text-sm py-1.5 rounded font-medieval ${
                    isTodaysMonth && day === today.getDate()
                      ? 'font-bold text-copper-300'
                      : ''
                  }`}
                  style={
                    isTodaysMonth && day === today.getDate()
                      ? {
                          // Today: a small etched well holding an ember —
                          // the slab's selection vocabulary
                          background: 'rgba(0, 0, 0, 0.25)',
                          boxShadow:
                            'inset 0 1px 3px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(228, 185, 106, 0.4), inset 0 0 8px rgba(228, 185, 106, 0.25)',
                          textShadow: '0 0 8px rgba(228, 185, 106, 0.5)',
                        }
                      : { color: 'var(--theme-text-primary, #cbbfa4)' }
                  }
                >
                  {day}
                </div>
              )
            )}
          </div>

          <div
            className="mt-3 text-center font-medieval italic text-sm"
            style={{ color: 'var(--theme-text-secondary, #a8906c)' }}
          >
            ~ the {ordinal(today.getDate())} of {MONTHS[today.getMonth()]}, {today.getFullYear()} ~
          </div>
        </div>
      </NavSheet>
    </>
  );
};
