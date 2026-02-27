import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Flame, Check, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/AppStoreContext';
import { genId } from '../data';
import { getTodayInTimezone } from '../utils/timezone';
import renderLinkedText from '../utils/renderLinkedText';
import QuickLinks from '../components/QuickLinks';

/* ─── Hooks (reused from MyDaySection pattern) ─── */

function useChecklistDay(items, setItems, checklistType) {
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const storageKey = `greenteam-checklist-date-${checklistType}`;
    const resetIfNewDay = () => {
      const saved = localStorage.getItem(storageKey);
      const now = getTodayInTimezone();
      if (saved !== now) {
        const current = itemsRef.current;
        if (current.some((i) => i.type !== 'header' && i.done)) {
          setItems(current.map((i) => ({ ...i, done: false })));
        }
        localStorage.setItem(storageKey, now);
      }
    };
    resetIfNewDay();
    const onVis = () => { if (document.visibilityState === 'visible') resetIfNewDay(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [checklistType, setItems]);
}

function useChecklistLog(items, checklistType, checklistLog, setChecklistLog) {
  const checkableItems = items.filter((i) => i.type !== 'header');
  const completedCount = checkableItems.filter((i) => i.done).length;
  const logDebounce = useRef(null);

  useEffect(() => {
    if (!checklistType || !setChecklistLog || checkableItems.length === 0) return;
    if (logDebounce.current) clearTimeout(logDebounce.current);
    logDebounce.current = setTimeout(() => {
      const today = getTodayInTimezone();
      setChecklistLog((prev) => {
        const existing = prev.findIndex((e) => e.date === today && e.checklistType === checklistType);
        const entry = {
          id: existing >= 0 ? prev[existing].id : genId(),
          date: today,
          checklistType,
          totalItems: checkableItems.length,
          completedItems: completedCount,
          updatedAt: new Date().toISOString(),
        };
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = entry;
          return updated;
        }
        return [...prev, entry];
      });
    }, 800);
    return () => { if (logDebounce.current) clearTimeout(logDebounce.current); };
  }, [completedCount, checklistType, setChecklistLog, checkableItems.length]);

  return { checkableItems, completedCount };
}

/* ─── Progress Ring ─── */

function ProgressRing({ percent }) {
  const size = 64;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const done = percent >= 100;

  return (
    <div className={`relative w-16 h-16 ${done ? 'dc-ring-pulse' : ''}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="var(--color-border-default)"
          strokeWidth={stroke} fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={percent > 0 ? 'var(--color-brand)' : 'var(--color-border-default)'}
          strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {done ? (
          <Check size={24} className="text-brand dc-check-appear" />
        ) : (
          <span className="text-sm font-bold text-primary">{Math.round(percent)}%</span>
        )}
      </div>
    </div>
  );
}

/* ─── Streak Calculation ─── */

function calculateStreak(checklistLog) {
  // Group log entries by date
  const byDate = {};
  for (const entry of checklistLog) {
    if (!byDate[entry.date]) byDate[entry.date] = {};
    byDate[entry.date][entry.checklistType] = entry;
  }

  // Sort dates descending
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  const today = getTodayInTimezone();

  let streak = 0;
  // Start from today and go backwards
  const startDate = new Date(today + 'T00:00:00');

  for (let i = 0; i < 365; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayEntries = byDate[dateStr];

    if (!dayEntries) {
      // If it's today and we haven't completed yet, skip today and check yesterday
      if (i === 0) continue;
      break;
    }

    const startEntry = dayEntries['owner-start'];
    const endEntry = dayEntries['owner-end'];

    const startComplete = startEntry && startEntry.completedItems === startEntry.totalItems && startEntry.totalItems > 0;
    const endComplete = endEntry && endEntry.completedItems === endEntry.totalItems && endEntry.totalItems > 0;

    if (startComplete && endComplete) {
      streak++;
    } else {
      // If it's today and in progress, skip
      if (i === 0) continue;
      break;
    }
  }

  return streak;
}

/* ─── Hold-to-Check Item ─── */

function ChecklistItem({ item, onToggle }) {
  const [holding, setHolding] = useState(false);
  const [fillProgress, setFillProgress] = useState(0);
  const [justCompleted, setJustCompleted] = useState(false);
  const timerRef = useRef(null);
  const animRef = useRef(null);
  const startTimeRef = useRef(null);

  const HOLD_DURATION = 400;

  const startHold = useCallback((e) => {
    // If already done, single tap to uncheck
    if (item.done) {
      onToggle(item.id);
      return;
    }

    // Prevent text selection on long press
    e.preventDefault();
    setHolding(true);
    startTimeRef.current = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(elapsed / HOLD_DURATION, 1);
      setFillProgress(progress);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        // Complete!
        setJustCompleted(true);
        onToggle(item.id);
        setTimeout(() => setJustCompleted(false), 600);
      }
    };

    animRef.current = requestAnimationFrame(animate);

    timerRef.current = setTimeout(() => {
      // Handled by animation frame
    }, HOLD_DURATION);
  }, [item.done, item.id, onToggle]);

  const cancelHold = useCallback(() => {
    if (!item.done && holding) {
      setHolding(false);
      setFillProgress(0);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
  }, [holding, item.done]);

  useEffect(() => {
    if (item.done && !justCompleted) {
      setHolding(false);
      setFillProgress(0);
    }
  }, [item.done, justCompleted]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl px-4 py-3 select-none transition-all duration-300 ${
        item.done
          ? 'bg-brand-light/50 cursor-pointer'
          : 'bg-card hover:bg-surface-alt cursor-pointer active:scale-[0.98]'
      } ${item.indent ? 'ml-6' : ''}`}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      role="button"
      tabIndex={0}
    >
      {/* Hold fill bar */}
      {holding && !item.done && (
        <div
          className="absolute inset-0 bg-brand/15 dc-hold-fill"
          style={{ transform: `scaleX(${fillProgress})`, transformOrigin: 'left' }}
        />
      )}

      {/* Green sweep on complete */}
      {justCompleted && (
        <div className="absolute inset-0 dc-sweep-fill" />
      )}

      <div className="relative flex items-center gap-3">
        {/* Checkbox */}
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300 ${
          item.done
            ? 'bg-brand border-brand'
            : 'border-border-strong'
        }`}>
          {item.done && (
            <Check size={14} className={`text-on-brand ${justCompleted ? 'dc-check-appear' : ''}`} />
          )}
        </div>

        {/* Text */}
        <span className={`text-sm transition-all duration-300 ${
          item.done ? 'text-muted line-through' : 'text-primary'
        }`}>
          {renderLinkedText(item.text)}
          <QuickLinks links={item.links} />
        </span>
      </div>
    </div>
  );
}

/* ─── Confetti Particle ─── */

function ConfettiParticles() {
  const particles = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => {
      const angle = (i / 24) * 360 + (Math.random() * 15 - 7.5);
      const rad = (angle * Math.PI) / 180;
      const distance = 60 + Math.random() * 120;
      const colors = ['#B0FF03', '#4ade80', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa'];
      return {
        id: i,
        tx: Math.cos(rad) * distance,
        ty: Math.sin(rad) * distance,
        color: colors[i % colors.length],
        size: 4 + Math.random() * 4,
        delay: Math.random() * 0.2,
      };
    });
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full dc-confetti-particle"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            '--tx': `${p.tx}px`,
            '--ty': `${p.ty}px`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Completion Banner ─── */

function CompletionBanner({ tabLabel, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center dc-banner-slide-down">
      <div className="mx-4 mt-4 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-semibold text-center shadow-lg shadow-emerald-500/25 max-w-md w-full">
        All Clear! {tabLabel} checklist complete.
      </div>
    </div>
  );
}

/* ─── Main Page ─── */

export default function DailyChecklist() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('morning');
  const [showBanner, setShowBanner] = useState(null); // 'morning' | 'evening' | null
  const [showConfetti, setShowConfetti] = useState(false);
  const prevAllDoneRef = useRef({ morning: false, evening: false });

  // Store
  const ownerStartChecklist = useAppStore((s) => s.ownerStartChecklist);
  const setOwnerStartChecklist = useAppStore((s) => s.setOwnerStartChecklist);
  const ownerEndChecklist = useAppStore((s) => s.ownerEndChecklist);
  const setOwnerEndChecklist = useAppStore((s) => s.setOwnerEndChecklist);
  const checklistLog = useAppStore((s) => s.checklistLog);
  const setChecklistLog = useAppStore((s) => s.setChecklistLog);

  // Day reset
  useChecklistDay(ownerStartChecklist, setOwnerStartChecklist, 'owner-start');
  useChecklistDay(ownerEndChecklist, setOwnerEndChecklist, 'owner-end');

  // Logging
  const { checkableItems: morningItems, completedCount: morningDone } =
    useChecklistLog(ownerStartChecklist, 'owner-start', checklistLog, setChecklistLog);
  const { checkableItems: eveningItems, completedCount: eveningDone } =
    useChecklistLog(ownerEndChecklist, 'owner-end', checklistLog, setChecklistLog);

  const activeItems = activeTab === 'morning' ? ownerStartChecklist : ownerEndChecklist;
  const setActiveItems = activeTab === 'morning' ? setOwnerStartChecklist : setOwnerEndChecklist;
  const checkable = activeTab === 'morning' ? morningItems : eveningItems;
  const done = activeTab === 'morning' ? morningDone : eveningDone;
  const percent = checkable.length > 0 ? (done / checkable.length) * 100 : 0;
  const allDone = checkable.length > 0 && done === checkable.length;

  // Celebration trigger
  useEffect(() => {
    const key = activeTab;
    if (allDone && !prevAllDoneRef.current[key]) {
      setShowBanner(key);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 1500);
    }
    prevAllDoneRef.current[key] = allDone;
  }, [allDone, activeTab]);

  // Streak
  const streak = useMemo(() => calculateStreak(checklistLog), [checklistLog]);

  // Toggle handler
  const handleToggle = useCallback((itemId) => {
    setActiveItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i))
    );
  }, [setActiveItems]);

  // Group items by headers
  const groups = useMemo(() => {
    const result = [];
    let currentGroup = null;

    for (const item of activeItems) {
      if (item.type === 'header') {
        if (currentGroup) result.push(currentGroup);
        currentGroup = { header: item.text, items: [] };
      } else if (currentGroup) {
        currentGroup.items.push(item);
      } else {
        // Items before any header
        if (!result.length || result[result.length - 1].header !== null) {
          result.push({ header: null, items: [] });
        }
        result[result.length - 1].items.push(item);
      }
    }
    if (currentGroup) result.push(currentGroup);
    return result;
  }, [activeItems]);

  // Today's formatted date
  const todayFormatted = useMemo(() => {
    const today = getTodayInTimezone();
    const d = new Date(today + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }, []);

  return (
    <div className="max-w-lg mx-auto pb-12">
      {/* Banner */}
      {showBanner && (
        <CompletionBanner
          tabLabel={showBanner === 'morning' ? 'Morning' : 'End of Day'}
          onDismiss={() => setShowBanner(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={() => navigate('/')}
          className="p-2 -ml-2 rounded-xl text-secondary hover:bg-surface-alt transition-colors cursor-pointer"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-primary">My Day</h1>
          <p className="text-sm text-muted">{todayFormatted}</p>
        </div>

        {/* Streak badge */}
        {streak > 0 && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 ${
            streak >= 3 ? 'dc-streak-glow' : ''
          }`}>
            <Flame size={16} className={`text-orange-500 ${streak >= 3 ? 'dc-flame-flicker' : ''}`} />
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{streak} day{streak !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Progress ring + tab switcher */}
      <div className="flex items-center gap-5 mt-4 mb-6">
        <div className="relative">
          <ProgressRing percent={percent} />
          {showConfetti && <ConfettiParticles />}
        </div>

        <div className="flex-1">
          {/* Pill toggle */}
          <div className="inline-flex bg-surface-alt rounded-xl p-1">
            <button
              onClick={() => setActiveTab('morning')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                activeTab === 'morning'
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              Morning
            </button>
            <button
              onClick={() => setActiveTab('evening')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                activeTab === 'evening'
                  ? 'bg-card text-primary shadow-sm'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              End of Day
            </button>
          </div>

          <p className="text-xs text-muted mt-2">
            {done}/{checkable.length} completed
          </p>
        </div>
      </div>

      {/* Grouped checklist items */}
      <div className="space-y-5">
        {groups.map((group, gi) => (
          <div key={gi} className="bg-card rounded-2xl border border-border-subtle overflow-hidden shadow-sm">
            {group.header && (
              <div className="px-4 py-3 border-b border-border-subtle">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  {renderLinkedText(group.header)}
                </h3>
              </div>
            )}
            <div className="p-2 space-y-1">
              {group.items.map((item) => (
                <ChecklistItem
                  key={item.id}
                  item={item}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* All done state */}
      {allDone && (
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-brand-light text-brand-text-strong font-semibold text-sm">
            <Check size={18} />
            All tasks complete
          </div>
        </div>
      )}
    </div>
  );
}
