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

export const SchedulingDashboard: React.FC = () => {
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

  return (
    <div className="min-h-screen theme-root">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <h1 className="text-3xl font-bold font-medieval text-copper-400 text-shadow-dungeon mb-1">
          Daily Schedule
        </h1>
        <p className="text-stone-400 text-sm mb-6">
          Drag published puzzles onto calendar days to schedule them.
          {gapCount > 0 && (
            <span className="text-amber-400 ml-2">
              ⚠ {gapCount} gap{gapCount !== 1 ? 's' : ''} remaining this month
            </span>
          )}
        </p>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Calendar */}
          <div className="flex-1">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={goToPrevMonth} className="p-2 bg-stone-800 rounded hover:bg-stone-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">{getMonthLabel(viewYear, viewMonth)}</h2>
                <button onClick={goToToday} className="text-xs px-2 py-1 bg-stone-700 rounded hover:bg-stone-600">
                  Today
                </button>
              </div>
              <button onClick={goToNextMonth} className="p-2 bg-stone-800 rounded hover:bg-stone-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS_OF_WEEK.map(day => (
                <div key={day} className="text-center text-xs font-medium text-stone-500 py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            {loading ? (
              <div className="text-center py-16 text-stone-400">Loading schedule...</div>
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
                        isToday ? 'bg-blue-900/30 border-blue-600' :
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
                        <span className={`font-medium ${isToday ? 'text-blue-400' : ''}`}>
                          {date.getDate()}
                        </span>
                        {puzzleNum && (
                          <span className="text-[10px] text-copper-400 font-bold">
                            #{puzzleNum}
                          </span>
                        )}
                      </div>
                      {entry && (
                        <div className="mt-1 px-1 py-0.5 bg-green-800/40 rounded text-green-300 truncate text-[10px]">
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
          <div className="lg:w-72">
            {/* Selected date details */}
            {selectedDate && scheduleMap.has(selectedDate) && (
              <div className="bg-stone-800 rounded p-4 mb-4 border border-stone-700">
                <h3 className="font-bold text-sm mb-2">{selectedDate}</h3>
                <div className="text-sm text-green-400 mb-2">
                  {puzzleNumberMap.get(selectedDate) && (
                    <span className="text-copper-400 mr-2">#{puzzleNumberMap.get(selectedDate)}</span>
                  )}
                  {scheduleMap.get(selectedDate)!.puzzleName}
                </div>
                <button
                  onClick={() => handleUnschedule(selectedDate)}
                  className="w-full px-3 py-1.5 text-xs bg-red-600/30 hover:bg-red-600/50 text-red-400 rounded border border-red-600/30"
                >
                  Unschedule
                </button>
              </div>
            )}

            {/* Published puzzles list */}
            <div className="bg-stone-800 rounded p-4 border border-stone-700">
              <h3 className="font-bold text-sm mb-3">Published Puzzles ({publishedPuzzles.length})</h3>
              {publishedPuzzles.length === 0 ? (
                <p className="text-xs text-stone-500">No published puzzles yet. Publish puzzles from the Map Editor first.</p>
              ) : (
                <div className="space-y-1 max-h-[60vh] overflow-y-auto dungeon-scrollbar">
                  {publishedPuzzles.map(puzzle => (
                    <div
                      key={puzzle.id}
                      draggable
                      onDragStart={() => handleDragStart(puzzle)}
                      onDragEnd={() => setDragPuzzle(null)}
                      className="px-3 py-2 bg-stone-700/50 rounded border border-stone-600 cursor-grab active:cursor-grabbing hover:border-stone-500 text-sm transition-colors"
                    >
                      <span className="truncate block">{puzzle.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Schedule stats */}
            <div className="bg-stone-800 rounded p-4 mt-4 border border-stone-700">
              <h3 className="font-bold text-sm mb-2">Stats</h3>
              <div className="text-xs space-y-1 text-stone-400">
                <div className="flex justify-between">
                  <span>Total scheduled</span>
                  <span className="text-parchment-200">{fullSchedule.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>This month</span>
                  <span className="text-parchment-200">{schedule.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Gaps this month</span>
                  <span className={gapCount > 0 ? 'text-amber-400' : 'text-green-400'}>{gapCount}</span>
                </div>
                {fullSchedule.length > 0 && (() => {
                  const maxNum = Math.max(...fullSchedule.map(e => e.puzzleNumber ?? 0));
                  return maxNum > 0 ? (
                    <div className="flex justify-between">
                      <span>Latest puzzle #</span>
                      <span className="text-copper-400">#{maxNum}</span>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
