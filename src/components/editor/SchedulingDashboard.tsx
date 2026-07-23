import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchSchedule,
  fetchPublishedPuzzles,
  schedulePuzzle,
  unschedulePuzzle,
  fetchFullScheduleWithNumbers,
  type ScheduleEntry,
} from '../../services/supabaseService';
import { toast } from '../shared/Toast';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getMonthDays(year: number, month: number): { date: Date; isCurrentMonth: boolean }[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const days: { date: Date; isCurrentMonth: boolean }[] = [];

  // Fill in previous month days
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, isCurrentMonth: false });
  }

  // Current month days
  for (let i = 1; i <= totalDays; i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  }

  // Fill remaining to complete grid (always 6 rows × 7 cols = 42)
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - startDay - totalDays + 1);
    days.push({ date: d, isCurrentMonth: false });
  }

  return days;
}

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getMonthLabel(year: number, month: number): string {
  return new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
}

const StatCard: React.FC<{ value: string; label: string; valueCls?: string }> = ({ value, label, valueCls }) => (
  <div className="bg-stone-800 border border-stone-700 rounded px-4 py-2 text-center">
    <div className={`text-lg font-bold ${valueCls ?? 'text-parchment-100'}`}>{value}</div>
    <div className="text-xs text-stone-400 whitespace-nowrap">{label}</div>
  </div>
);

export const SchedulingDashboard: React.FC = () => {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- today is used only in useState initializers, not in useMemo deps
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [publishedPuzzles, setPublishedPuzzles] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragPuzzle, setDragPuzzle] = useState<{ id: string; name: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [fullSchedule, setFullSchedule] = useState<ScheduleEntry[]>([]);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    const startDate = formatDateKey(new Date(viewYear, viewMonth, 1));
    const endDate = formatDateKey(new Date(viewYear, viewMonth + 1, 0));

    const [sched, puzzles, full] = await Promise.all([
      fetchSchedule(startDate, endDate),
      fetchPublishedPuzzles(),
      fetchFullScheduleWithNumbers(),
    ]);

    setSchedule(sched);
    setPublishedPuzzles(puzzles);
    setFullSchedule(full);
    setLoading(false);
  }, [viewYear, viewMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // Build schedule map for quick lookup
  const scheduleMap = useMemo(() => {
    const map = new Map<string, ScheduleEntry>();
    for (const entry of schedule) {
      map.set(entry.date, entry);
    }
    return map;
  }, [schedule]);

  // Build full schedule number map
  const puzzleNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of fullSchedule) {
      if (entry.puzzleNumber) {
        map.set(entry.date, entry.puzzleNumber);
      }
    }
    return map;
  }, [fullSchedule]);

  const calendarDays = useMemo(
    () => getMonthDays(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const todayKey = formatDateKey(today);

  // Count gaps (days without scheduled puzzles from today onward this month)
  const gapCount = useMemo(() => {
    let count = 0;
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth + 1, 0);
    const start = today > monthStart ? today : monthStart;

    for (let d = new Date(start); d <= monthEnd; d.setDate(d.getDate() + 1)) {
      const key = formatDateKey(d);
      if (!scheduleMap.has(key)) count++;
    }
    return count;
  }, [scheduleMap, viewYear, viewMonth, today]);

  // Navigation
  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };
  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  // Drag handlers
  const handleDragStart = (puzzle: { id: string; name: string }) => {
    setDragPuzzle(puzzle);
  };

  const handleDrop = async (dateKey: string) => {
    if (!dragPuzzle) return;
    const existing = scheduleMap.get(dateKey);
    if (existing) {
      if (!confirm(`Replace "${existing.puzzleName}" on ${dateKey}?`)) {
        setDragPuzzle(null);
        return;
      }
    }

    const result = await schedulePuzzle(dragPuzzle.id, dateKey);
    if (result.success) {
      const numLabel = result.puzzleNumber ? ` as Puzzle #${result.puzzleNumber}` : '';
      toast.success(`Scheduled "${dragPuzzle.name}" for ${dateKey}${numLabel}`);
      loadData();
    } else {
      toast.error('Failed to schedule');
    }
    setDragPuzzle(null);
  };

  const handleUnschedule = async (dateKey: string) => {
    const entry = scheduleMap.get(dateKey);
    if (!entry) return;
    if (!confirm(`Remove "${entry.puzzleName}" from ${dateKey}?`)) return;

    const success = await unschedulePuzzle(dateKey);
    if (success) {
      toast.success('Unscheduled');
      loadData();
    } else {
      toast.error('Failed to unschedule');
    }
    setSelectedDate(null);
  };

  const latestPuzzleNumber = fullSchedule.length > 0
    ? Math.max(...fullSchedule.map(e => e.puzzleNumber ?? 0))
    : 0;

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-2">
        <StatCard value={`${fullSchedule.length}`} label="total scheduled" />
        <StatCard value={`${schedule.length}`} label="this month" />
        <StatCard
          value={gapCount > 0 ? `⚠ ${gapCount}` : '0'}
          label="gaps this month"
          valueCls={gapCount > 0 ? 'text-amber-300' : 'text-green-400'}
        />
        {latestPuzzleNumber > 0 && <StatCard value={`#${latestPuzzleNumber}`} label="latest puzzle" />}
        <span className="ml-auto text-xs text-stone-500">
          Drag published puzzles onto calendar days to schedule them.
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
          {/* Calendar */}
          <div className="flex-1">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-2">
              <button onClick={goToPrevMonth} className="px-2 py-1 border border-stone-700 rounded text-stone-400 hover:text-stone-200 hover:bg-stone-800">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medieval text-copper-400">{getMonthLabel(viewYear, viewMonth)}</h2>
                <button onClick={goToToday} className="px-2 py-0.5 rounded text-xs border border-stone-700 text-stone-400 hover:text-stone-200">
                  Today
                </button>
              </div>
              <button onClick={goToNextMonth} className="px-2 py-1 border border-stone-700 rounded text-stone-400 hover:text-stone-200 hover:bg-stone-800">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS_OF_WEEK.map(day => (
                <div key={day} className="text-center text-xs uppercase text-stone-500 py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            {loading ? (
              <div className="text-center py-16 text-stone-500 text-sm">Loading schedule...</div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map(({ date, isCurrentMonth }, idx) => {
                  const dateKey = formatDateKey(date);
                  const entry = scheduleMap.get(dateKey);
                  const isToday = dateKey === todayKey;
                  const isPast = date < today && !isToday;
                  const puzzleNum = puzzleNumberMap.get(dateKey);

                  return (
                    <div
                      key={idx}
                      className={`min-h-[80px] p-1 rounded border text-xs transition-colors cursor-pointer ${
                        !isCurrentMonth ? 'bg-stone-900/50 border-stone-800 text-stone-600' :
                        isToday ? 'bg-arcane-900/30 border-arcane-500/70' :
                        entry ? 'bg-green-900/20 border-green-700/50' :
                        isPast ? 'bg-stone-900/30 border-stone-800' :
                        'bg-stone-800 border-stone-700 hover:border-stone-500'
                      } ${dragPuzzle && isCurrentMonth && !isPast ? 'ring-1 ring-copper-500/30' : ''}`}
                      onClick={() => setSelectedDate(dateKey)}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-copper-400'); }}
                      onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-copper-400'); }}
                      onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('ring-2', 'ring-copper-400'); handleDrop(dateKey); }}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-medium ${isToday ? 'text-arcane-300' : ''}`}>
                          {date.getDate()}
                        </span>
                        {puzzleNum && (
                          <span className="text-[10px] text-copper-400 font-bold">
                            #{puzzleNum}
                          </span>
                        )}
                      </div>
                      {entry && (
                        <div className="mt-1 px-1 py-0.5 bg-green-900/40 border border-green-700/50 rounded text-green-300 truncate text-[10px]">
                          {entry.puzzleName}
                        </div>
                      )}
                      {!entry && isCurrentMonth && !isPast && (
                        <div className="mt-1 text-[10px] text-stone-600 italic">empty</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:w-64">
            {/* Selected date details */}
            {selectedDate && scheduleMap.has(selectedDate) && (
              <div className="border border-stone-700 rounded overflow-hidden mb-4">
                <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">{selectedDate}</div>
                <div className="p-2 space-y-2">
                  <div className="text-sm text-parchment-100">
                    {puzzleNumberMap.get(selectedDate) && (
                      <span className="text-copper-400 mr-1.5">#{puzzleNumberMap.get(selectedDate)}</span>
                    )}
                    {scheduleMap.get(selectedDate)!.puzzleName}
                  </div>
                  <button
                    onClick={() => handleUnschedule(selectedDate)}
                    className="w-full px-2 py-1 text-xs rounded border bg-red-900/40 text-red-300 border-red-700/50 hover:bg-red-900/60"
                  >
                    Unschedule
                  </button>
                </div>
              </div>
            )}

            {/* Published puzzles list */}
            <div className="border border-stone-700 rounded overflow-hidden">
              <div className="bg-stone-800 px-2 py-1.5 text-xs uppercase text-stone-400">
                Published Puzzles ({publishedPuzzles.length})
              </div>
              {publishedPuzzles.length === 0 ? (
                <p className="px-2 py-3 text-xs text-stone-500">No published puzzles yet. Publish puzzles from the Map Editor first.</p>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto dungeon-scrollbar">
                  {publishedPuzzles.map(puzzle => (
                    <div
                      key={puzzle.id}
                      draggable
                      onDragStart={() => handleDragStart(puzzle)}
                      onDragEnd={() => setDragPuzzle(null)}
                      className="px-2 py-1.5 border-t border-stone-700/60 first:border-t-0 text-sm text-parchment-100 cursor-grab active:cursor-grabbing hover:bg-stone-800/50 transition-colors"
                    >
                      <span className="truncate block">{puzzle.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
  );
};
