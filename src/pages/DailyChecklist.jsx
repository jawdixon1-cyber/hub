import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Flame, Check, ArrowLeft, ChevronRight, RotateCcw, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/AppStoreContext';
import { genId } from '../data';
import { getTodayInTimezone } from '../utils/timezone';
import renderLinkedText from '../utils/renderLinkedText';
import QuickLinks from '../components/QuickLinks';

const ChecklistEditorModal = lazy(() => import('../components/ChecklistEditorModal'));

/* ─── Hooks ─── */

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
  const byDate = {};
  for (const entry of checklistLog) {
    if (!byDate[entry.date]) byDate[entry.date] = {};
    byDate[entry.date][entry.checklistType] = entry;
  }

  const today = getTodayInTimezone();
  const startDate = new Date(today + 'T00:00:00');

  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayEntries = byDate[dateStr];

    if (!dayEntries) {
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
      if (i === 0) continue;
      break;
    }
  }

  return streak;
}

/* ─── Confetti Particles ─── */

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

/* ─── Section Step Dots ─── */

function SectionDots({ groups, activeIndex }) {
  return (
    <div className="flex items-center justify-center gap-2 my-4">
      {groups.map((group, i) => {
        const groupItems = group.items;
        const doneCount = groupItems.filter((it) => it.done).length;
        const allGroupDone = groupItems.length > 0 && doneCount === groupItems.length;

        return (
          <div
            key={i}
            className={`rounded-full transition-all duration-300 ${
              i === activeIndex
                ? 'w-8 h-2.5 bg-brand'
                : allGroupDone
                  ? 'w-2.5 h-2.5 bg-brand/60'
                  : 'w-2.5 h-2.5 bg-border-default'
            }`}
          />
        );
      })}
    </div>
  );
}

/* ─── Main Page ─── */

export default function DailyChecklist() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('morning');
  const [showBanner, setShowBanner] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [dismissing, setDismissing] = useState(new Set());
  const [showEditor, setShowEditor] = useState(false);
  const prevAllDoneRef = useRef({ morning: false, evening: false });

  // Field work toggle — persisted per day
  const [fieldWork, setFieldWork] = useState(() => {
    const today = getTodayInTimezone();
    const saved = localStorage.getItem('greenteam-fieldwork');
    if (saved) {
      try { const p = JSON.parse(saved); if (p.date === today) return p.value; } catch {}
    }
    return null; // null = not answered yet
  });

  const setFieldWorkDay = (val) => {
    setFieldWork(val);
    localStorage.setItem('greenteam-fieldwork', JSON.stringify({ date: getTodayInTimezone(), value: val }));
  };

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

  // Filter out field-work-only items when no field work
  const filteredItems = useMemo(() => {
    if (fieldWork === false) {
      return activeItems.filter((i) => !i.fieldWorkOnly);
    }
    return activeItems;
  }, [activeItems, fieldWork]);

  // Group items by headers
  const groups = useMemo(() => {
    const result = [];
    let currentGroup = null;

    for (const item of filteredItems) {
      if (item.type === 'header') {
        if (currentGroup) result.push(currentGroup);
        currentGroup = { header: item.text, items: [] };
      } else if (currentGroup) {
        currentGroup.items.push(item);
      } else {
        if (!result.length || result[result.length - 1].header !== null) {
          result.push({ header: null, items: [] });
        }
        result[result.length - 1].items.push(item);
      }
    }
    if (currentGroup) result.push(currentGroup);
    // Remove empty sections (all items were field-work-only)
    return result.filter((g) => g.items.length > 0);
  }, [filteredItems]);

  // Find the first section that isn't fully done
  const activeSectionIndex = useMemo(() => {
    for (let i = 0; i < groups.length; i++) {
      const items = groups[i].items;
      if (items.some((it) => !it.done)) return i;
    }
    return groups.length - 1; // all done, show last
  }, [groups]);

  const activeGroup = groups[activeSectionIndex];

  // Toggle handler — animate out then mark done
  const handleToggle = useCallback((itemId) => {
    // If already done, just uncheck
    const item = activeItems.find((i) => i.id === itemId);
    if (item?.done) {
      setActiveItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, done: false } : i))
      );
      return;
    }

    // Animate dismissal
    setDismissing((prev) => new Set(prev).add(itemId));

    // After animation, mark done
    setTimeout(() => {
      setActiveItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, done: true } : i))
      );
      setDismissing((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }, 350);
  }, [activeItems, setActiveItems]);

  // Today's formatted date
  const todayFormatted = useMemo(() => {
    const today = getTodayInTimezone();
    const d = new Date(today + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }, []);

  // Remaining items in current section (not done)
  const remainingItems = activeGroup ? activeGroup.items.filter((it) => !it.done) : [];

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
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1" />

        {done > 0 && (
          <button
            onClick={() => {
              setActiveItems((prev) =>
                prev.map((i) => (i.type === 'header' ? i : { ...i, done: false }))
              );
            }}
            className="p-2 rounded-xl text-muted hover:text-secondary hover:bg-surface-alt transition-colors cursor-pointer"
            title="Reset"
          >
            <RotateCcw size={16} />
          </button>
        )}

        <button
          onClick={() => setShowEditor(true)}
          className="p-2 rounded-xl text-muted hover:text-secondary hover:bg-surface-alt transition-colors cursor-pointer"
          title="Edit"
        >
          <Pencil size={18} />
        </button>
      </div>

      {/* Checklist Editor Modal */}
      {showEditor && (
        <Suspense fallback={null}>
          <ChecklistEditorModal
            onClose={() => setShowEditor(false)}
            items={activeItems}
            setItems={setActiveItems}
            title={activeTab === 'morning' ? 'Edit Morning' : 'Edit End of Day'}
          />
        </Suspense>
      )}

      {/* Tab switcher */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <button
          onClick={() => setActiveTab('morning')}
          className={`text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'morning' ? 'text-primary' : 'text-muted hover:text-secondary'
          }`}
        >
          Morning
        </button>
        <div className="w-px h-3 bg-border-default" />
        <button
          onClick={() => setActiveTab('evening')}
          className={`text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'evening' ? 'text-primary' : 'text-muted hover:text-secondary'
          }`}
        >
          End of Day
        </button>
      </div>

      {showConfetti && <div className="relative"><ConfettiParticles /></div>}

      {/* Field work prompt */}
      {fieldWork === null && (
        <div className="bg-card rounded-2xl border border-border-subtle p-5 mb-4 text-center">
          <p className="text-sm font-medium text-primary mb-3">Field work today?</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setFieldWorkDay(true)}
              className="px-6 py-2 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover cursor-pointer"
            >
              Yes
            </button>
            <button
              onClick={() => setFieldWorkDay(false)}
              className="px-6 py-2 rounded-xl bg-surface-alt text-secondary text-sm font-semibold hover:bg-surface-strong cursor-pointer"
            >
              No
            </button>
          </div>
        </div>
      )}

      {/* Change field work answer */}
      {fieldWork !== null && (
        <button
          onClick={() => setFieldWorkDay(fieldWork ? false : true)}
          className="text-[10px] text-muted hover:text-secondary cursor-pointer mb-3 block mx-auto"
        >
          {fieldWork ? 'No field work today?' : 'Actually, field work today'}
        </button>
      )}

      {/* Active section */}
      {!allDone && activeGroup && (
        <div className="mt-4">
          {/* Section header */}
          {activeGroup.header && (
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted mb-3">
              {activeGroup.header}
            </h2>
          )}

          {/* Items — only show remaining (undone) */}
          <div className="space-y-2">
            {remainingItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleToggle(item.id)}
                className={`relative overflow-hidden rounded-xl px-4 py-3.5 select-none cursor-pointer
                  bg-card border border-border-subtle hover:bg-surface-alt active:scale-[0.98]
                  transition-all duration-300 ease-out
                  ${dismissing.has(item.id) ? 'opacity-0 translate-x-8 scale-95' : 'opacity-100'}
                  ${item.indent ? 'ml-6' : ''}
                `}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full border-2 border-border-strong flex items-center justify-center shrink-0">
                    {dismissing.has(item.id) && (
                      <Check size={14} className="text-brand dc-check-appear" />
                    )}
                  </div>
                  <span className="text-sm text-primary flex-1">
                    {renderLinkedText(item.text)}
                    <QuickLinks links={item.links} />
                  </span>
                  <ChevronRight size={14} className="text-muted shrink-0" />
                </div>
              </div>
            ))}
          </div>

          {/* Section complete — auto-advances, but show a brief message */}
          {remainingItems.length === 0 && !allDone && (
            <div className="text-center py-8">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-brand-light text-brand-text-strong font-semibold text-sm">
                <Check size={18} />
                Section complete!
              </div>
            </div>
          )}
        </div>
      )}

      {/* All done state */}
      {allDone && (
        <div className="mt-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-brand-light text-brand-text-strong font-semibold text-sm">
            <Check size={18} />
            All tasks complete
          </div>

          {/* Undo button */}
          <button
            onClick={() => {
              setActiveItems((prev) =>
                prev.map((i) => (i.type === 'header' ? i : { ...i, done: false }))
              );
            }}
            className="block mx-auto text-xs text-muted hover:text-secondary underline cursor-pointer"
          >
            Reset checklist
          </button>
        </div>
      )}

    </div>
  );
}
