import { useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react';
import { getTodayInTimezone, getTimezone } from '../utils/timezone';

const CHECKLIST_LABELS = {
  'team-start': 'Team Start',
  'team-end': 'Team End',
  'owner-start': 'Owner Start',
  'owner-end': 'Owner End',
};

function getWeekDates(weekOffset) {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset + weekOffset * 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatDate(d) {
  const tz = getTimezone();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

function StatusDot({ status }) {
  if (status === 'complete') {
    return <div className="w-3 h-3 rounded-full bg-emerald-500" title="Complete" />;
  }
  if (status === 'partial') {
    return <div className="w-3 h-3 rounded-full bg-amber-400" title="Partial" />;
  }
  return <div className="w-3 h-3 rounded-full bg-surface-strong" title="Missing" />;
}

export default function ChecklistTracker({ checklistLog }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = getWeekDates(weekOffset);
  const today = getTodayInTimezone();

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const checklistTypes = ['team-start', 'team-end', 'owner-start', 'owner-end'];

  const getStatus = (date, type) => {
    const dateStr = formatDate(date);
    const entry = checklistLog.find(
      (e) => e.date === dateStr && e.checklistType === type
    );
    if (!entry) return 'missing';
    if (entry.completedItems >= entry.totalItems) return 'complete';
    if (entry.completedItems > 0) return 'partial';
    return 'missing';
  };

  const weekLabel = () => {
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(weekDates[0])} - ${fmt(weekDates[6])}`;
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={20} className="text-brand-text" />
          <h2 className="text-base font-bold text-primary">Checklist Tracker</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-tertiary">Complete</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-xs text-tertiary">Partial</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-surface-strong" />
              <span className="text-xs text-tertiary">Missing</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-surface-alt transition-colors cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-secondary min-w-[140px] text-center">
            {weekLabel()}
          </span>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            disabled={weekOffset >= 0}
            className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-surface-alt transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs font-semibold text-brand-text hover:text-brand-text-strong cursor-pointer ml-1"
            >
              Today
            </button>
          )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left text-xs font-semibold text-tertiary py-1.5 pr-4 w-28" />
              {weekDates.map((d, i) => {
                const isToday = formatDate(d) === today;
                const isWeekend = i >= 5;
                return (
                  <th
                    key={i}
                    className={`text-center text-xs font-semibold py-1.5 px-1 ${
                      isToday ? 'text-emerald-700' : isWeekend ? 'text-muted' : 'text-tertiary'
                    }`}
                  >
                    <div>{dayNames[i]}</div>
                    <div className={`text-[10px] font-normal ${isToday ? 'text-brand-text' : ''}`}>
                      {d.getMonth() + 1}/{d.getDate()}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {checklistTypes.map((type) => (
              <tr key={type} className="border-t border-border-subtle">
                <td className="text-xs font-medium text-secondary py-1.5 pr-4 whitespace-nowrap">
                  {CHECKLIST_LABELS[type]}
                </td>
                {weekDates.map((d, i) => (
                  <td key={i} className="text-center py-1.5">
                    <div className="flex justify-center">
                      <StatusDot status={getStatus(d, type)} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
