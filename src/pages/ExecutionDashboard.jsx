import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  RotateCcw,
  Target,
  Megaphone,
  ClipboardList,
  ChevronDown,
  Moon,
  Settings,
  Pencil,
  X,
  Flame,
  Lightbulb,
  ArrowRight,
} from 'lucide-react';
import { genId } from '../data';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';
import { useChecklistDay, useChecklistLog } from '../components/owner/MyDaySection';
import renderLinkedText from '../utils/renderLinkedText';
import QuickLinks from '../components/QuickLinks';
import { ChecklistSection } from '../components/ChecklistEditorModal';

/* ─── Constants ─── */

const CATEGORIES = [
  { key: 'build', label: 'Build & Delegate', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800' },
  { key: 'sales', label: 'Sales', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800' },
];

const DEFAULT_TIME_BLOCKS = {
  sales: { start: '07:00', end: '09:00' },
  build: { start: '09:00', end: '12:00' },
};

/* ─── Helpers ─── */

// Normalize legacy flat-array parkingLot → { urgent, niceToHave }
// Returns null if input is empty/missing (preserves "no data" vs "empty list" distinction)
function normalizeParkingLot(pl, { allowNull = false } = {}) {
  if (!pl) return allowNull ? null : { urgent: [], niceToHave: [] };
  if (Array.isArray(pl)) return { urgent: pl, niceToHave: [] };
  return { urgent: pl.urgent || [], niceToHave: pl.niceToHave || [] };
}

function createFreshDay(date, keepOutcomes, keepTimeBlocks, keepWins, keepParkingLot) {
  return {
    date,
    weeklyOutcomes: keepOutcomes || [
      { id: genId(), title: '', note: '', done: false },
      { id: genId(), title: '', note: '', done: false },
      { id: genId(), title: '', note: '', done: false },
    ],
    todaysWins: keepWins || {
      sales: { text: '', done: false },
      build: { text: '', done: false },
      ops: { done: false, focusItems: [] },
    },
    timeBlocks: keepTimeBlocks || { ...DEFAULT_TIME_BLOCKS },
    doNow: [
      { id: genId(), text: '', done: false },
      { id: genId(), text: '', done: false },
      { id: genId(), text: '', done: false },
      { id: genId(), text: '', done: false },
      { id: genId(), text: '', done: false },
    ],
    parkingLot: keepParkingLot || { urgent: [], niceToHave: [] },
    endOfDay: {
      doneToday: '',
      movedToTomorrow: '',
      firstTaskTomorrow: '',
      whatWentWell: '',
      whatWentBad: '',
      whatToImprove: '',
    },
  };
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function isSameWeek(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  const getMonday = (d) => {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.getFullYear(), d.getMonth(), diff).toISOString().split('T')[0];
  };
  return getMonday(a) === getMonday(b);
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'p' : 'a';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
}


/* ─── Full-screen Checklist Overlay ─── */

function StartMyDayGate({ greeting, date, items, setItems, checklistLog, setChecklistLog, onComplete }) {
  const [started, setStarted] = useState(false);

  useChecklistDay(items, setItems, 'owner-start');
  const { checkableItems, completedCount } = useChecklistLog(items, 'owner-start', checklistLog, setChecklistLog);

  const allDone = checkableItems.length > 0 && completedCount === checkableItems.length;
  const percent = checkableItems.length > 0 ? Math.round((completedCount / checkableItems.length) * 100) : 0;

  const handleToggle = (itemId) => {
    setItems(items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)));
  };

  const markAll = () => {
    setItems(items.map((i) => (i.type === 'header' ? i : { ...i, done: !allDone })));
  };

  const groups = useMemo(() => {
    const result = [];
    let currentGroup = null;
    for (const item of items) {
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
    return result;
  }, [items]);

  // Landing screen — just the greeting + Start My Day button
  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <Target size={48} className="text-brand mb-4" />
        <h1 className="text-3xl font-bold text-primary mb-1">{greeting}</h1>
        <p className="text-sm text-muted mb-8">{date}</p>
        <button
          onClick={() => setStarted(true)}
          className="px-8 py-4 rounded-2xl bg-gradient-to-r from-brand to-brand-hover text-on-brand text-lg font-semibold hover:opacity-90 transition-all cursor-pointer shadow-lg"
        >
          Start My Day
        </button>
        <button
          onClick={onComplete}
          className="mt-4 text-xs text-muted hover:text-secondary transition-colors cursor-pointer"
        >
          Skip for now
        </button>
      </div>
    );
  }

  // Checklist screen
  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-primary mb-1">Morning Checklist</h1>
        <p className="text-sm text-muted">{completedCount}/{checkableItems.length} complete</p>
        {/* Progress bar */}
        <div className="mt-3 h-2 bg-border-subtle rounded-full overflow-hidden">
          <div
            className="h-full bg-brand rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Checklist items */}
      <div className="space-y-2">
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.header && (
              <div className="px-2 pt-4 pb-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  {renderLinkedText(group.header)}
                </h3>
              </div>
            )}
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleToggle(item.id)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer ${
                  item.done
                    ? 'bg-brand-light/50'
                    : 'bg-card border border-border-subtle hover:bg-surface-alt active:scale-[0.98]'
                } ${item.indent ? 'ml-4' : ''}`}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  item.done ? 'bg-brand border-brand' : 'border-border-strong'
                }`}>
                  {item.done && <Check size={14} className="text-on-brand" />}
                </div>
                <span className={`text-sm transition-all ${item.done ? 'text-muted line-through' : 'text-primary'}`}>
                  {renderLinkedText(item.text)}
                  <QuickLinks links={item.links} />
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={markAll}
          className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
            allDone
              ? 'bg-surface-alt text-secondary hover:bg-surface border border-border-subtle'
              : 'bg-surface-alt text-secondary hover:bg-surface border border-border-subtle'
          }`}
        >
          {allDone ? 'Undo All' : 'Complete All'}
        </button>
        <button
          onClick={onComplete}
          className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
            allDone
              ? 'bg-brand text-on-brand hover:bg-brand-hover'
              : 'bg-surface-alt text-muted border border-border-subtle'
          }`}
        >
          {allDone ? 'Let\'s Go' : 'Skip'}
        </button>
      </div>
    </div>
  );
}

/* ─── Wrap Up Day (full-screen, multi-step) ─── */

function WrapUpDayScreen({ dash, checklistItems, setChecklistItems, checklistLog, setChecklistLog, onRoll, onClose }) {
  // Steps: checklist → journal
  const [step, setStep] = useState('checklist');
  const [editMode, setEditMode] = useState(false);

  const [journalGood, setJournalGood] = useState(dash.endOfDay.whatWentWell || '');
  const [journalBad, setJournalBad] = useState(dash.endOfDay.whatWentBad || '');
  const [journalBetter, setJournalBetter] = useState(dash.endOfDay.whatToImprove || '');

  // Checklist
  useChecklistDay(checklistItems, setChecklistItems, 'owner-end');
  const { checkableItems, completedCount } = useChecklistLog(checklistItems, 'owner-end', checklistLog, setChecklistLog);
  const allDone = checkableItems.length > 0 && completedCount === checkableItems.length;
  const percent = checkableItems.length > 0 ? Math.round((completedCount / checkableItems.length) * 100) : 0;

  const handleToggle = (itemId) => {
    setChecklistItems(checklistItems.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)));
  };

  const markAll = () => {
    setChecklistItems(checklistItems.map((i) => (i.type === 'header' ? i : { ...i, done: !allDone })));
  };

  const groups = useMemo(() => {
    const result = [];
    let currentGroup = null;
    for (const item of checklistItems) {
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
    return result;
  }, [checklistItems]);

  const handleFinish = () => {
    onRoll({ whatWentWell: journalGood, whatWentBad: journalBad, whatToImprove: journalBetter });
  };

  const stepLabels = ['Checklist', 'Journal'];
  const stepKeys = ['checklist', 'journal'];
  const currentStepIndex = stepKeys.indexOf(step);

  return (
    <div className="max-w-lg mx-auto pb-8">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {stepLabels.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              i === currentStepIndex
                ? 'bg-brand text-on-brand'
                : i < currentStepIndex
                  ? 'bg-brand-light text-brand-text-strong'
                  : 'bg-surface-alt text-muted'
            }`}>
              {i < currentStepIndex ? <Check size={12} /> : null}
              {label}
            </div>
            {i < stepLabels.length - 1 && <div className="w-6 h-px bg-border-subtle" />}
          </div>
        ))}
      </div>

      {/* ─── Step 1: Checklist ─── */}
      {step === 'checklist' && (
        <>
          <div className="text-center mb-6">
            <Moon size={36} className="text-indigo-500 mx-auto mb-2" />
            <h1 className="text-xl font-bold text-primary">End-of-Day Checklist</h1>
            <p className="text-sm text-muted mt-1">{completedCount}/{checkableItems.length} complete</p>
            <div className="mt-3 h-2 bg-border-subtle rounded-full overflow-hidden">
              <div
                className="h-full bg-brand rounded-full transition-all duration-500 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            <button
              onClick={() => setEditMode(!editMode)}
              className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                editMode
                  ? 'bg-brand text-on-brand'
                  : 'bg-surface-alt text-secondary border border-border-subtle hover:bg-surface'
              }`}
            >
              <Pencil size={12} />
              {editMode ? 'Done Editing' : 'Edit Checklist'}
            </button>
          </div>

          {editMode ? (
            <div className="bg-card border border-border-subtle rounded-2xl p-5 min-h-[300px] flex flex-col">
              <ChecklistSection
                items={checklistItems}
                setItems={setChecklistItems}
              />
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((group, gi) => (
                <div key={gi}>
                  {group.header && (
                    <div className="px-2 pt-4 pb-1">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                        {renderLinkedText(group.header)}
                      </h3>
                    </div>
                  )}
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleToggle(item.id)}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer ${
                        item.done
                          ? 'bg-brand-light/50'
                          : 'bg-card border border-border-subtle hover:bg-surface-alt active:scale-[0.98]'
                      } ${item.indent ? 'ml-4' : ''}`}
                    >
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        item.done ? 'bg-brand border-brand' : 'border-border-strong'
                      }`}>
                        {item.done && <Check size={14} className="text-on-brand" />}
                      </div>
                      <span className={`text-sm transition-all ${item.done ? 'text-muted line-through' : 'text-primary'}`}>
                        {renderLinkedText(item.text)}
                        <QuickLinks links={item.links} />
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={markAll}
              className="flex-1 py-3 rounded-xl bg-surface-alt text-secondary border border-border-subtle text-sm font-semibold hover:bg-surface transition-colors cursor-pointer"
            >
              {allDone ? 'Undo All' : 'Complete All'}
            </button>
            <button
              onClick={() => setStep('journal')}
              className="flex-1 py-3 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full mt-3 text-xs text-muted hover:text-secondary transition-colors cursor-pointer text-center"
          >
            Back to dashboard
          </button>
        </>
      )}

      {/* ─── Step 2: Journal ─── */}
      {step === 'journal' && (
        <>
          <div className="text-center mb-6">
            <RotateCcw size={36} className="text-purple-500 mx-auto mb-2" />
            <h1 className="text-xl font-bold text-primary">Journal</h1>
            <p className="text-sm text-muted mt-1">Daily reflection</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-500 mb-1.5">What did I do good today?</label>
              <textarea
                value={journalGood}
                onChange={(e) => setJournalGood(e.target.value)}
                placeholder="Wins, completions, progress..."
                rows={3}
                className="w-full bg-card border border-border-subtle rounded-xl px-4 py-3 text-sm text-primary outline-none placeholder:text-muted focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-red-400 mb-1.5">What did I do bad today?</label>
              <textarea
                value={journalBad}
                onChange={(e) => setJournalBad(e.target.value)}
                placeholder="Mistakes, missed opportunities, wasted time..."
                rows={3}
                className="w-full bg-card border border-border-subtle rounded-xl px-4 py-3 text-sm text-primary outline-none placeholder:text-muted focus:ring-2 focus:ring-red-400 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-blue-400 mb-1.5">What will I do better tomorrow?</label>
              <textarea
                value={journalBetter}
                onChange={(e) => setJournalBetter(e.target.value)}
                placeholder="Adjustments, new habits, focus areas..."
                rows={3}
                className="w-full bg-card border border-border-subtle rounded-xl px-4 py-3 text-sm text-primary outline-none placeholder:text-muted focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep('checklist')}
              className="flex-1 py-3 rounded-xl bg-surface-alt text-secondary border border-border-subtle text-sm font-semibold hover:bg-surface transition-colors cursor-pointer"
            >
              Back
            </button>
            <button
              onClick={handleFinish}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
            >
              <RotateCcw size={16} />
              Roll to Tomorrow
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Main Dashboard ─── */

export default function ExecutionDashboard() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const executionDashboard = useAppStore((s) => s.executionDashboard);
  const setExecutionDashboard = useAppStore((s) => s.setExecutionDashboard);
  const executionHistory = useAppStore((s) => s.executionHistory);
  const setExecutionHistory = useAppStore((s) => s.setExecutionHistory);

  // Persistent notes
  const ownerNotes = useAppStore((s) => s.ownerNotes);
  const setOwnerNotes = useAppStore((s) => s.setOwnerNotes);

  // Schedule (persistent defaults)
  const ownerSchedule = useAppStore((s) => s.ownerSchedule);
  const setOwnerSchedule = useAppStore((s) => s.setOwnerSchedule);

  // Checklist store
  const ownerStartChecklist = useAppStore((s) => s.ownerStartChecklist);
  const setOwnerStartChecklist = useAppStore((s) => s.setOwnerStartChecklist);
  const ownerEndChecklist = useAppStore((s) => s.ownerEndChecklist);
  const setOwnerEndChecklist = useAppStore((s) => s.setOwnerEndChecklist);
  const checklistLog = useAppStore((s) => s.checklistLog);
  const setChecklistLog = useAppStore((s) => s.setChecklistLog);

  const today = getTodayStr();
  const firstName = currentUser?.split(' ')[0] || 'Boss';


  const [morningDismissed, setMorningDismissed] = useState(false);
  const [wrappingUp, setWrappingUp] = useState(false);
  const [eodDismissedToday, setEodDismissedToday] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(ownerNotes || '');
  const notesRef = useRef(null);

  // ─── New-day reset: clear checklist done flags so the morning gate shows again ───
  const lastResetDateRef = useRef(null);
  useEffect(() => {
    const storageKey = 'greenteam-owner-checklist-reset-date';
    const saved = localStorage.getItem(storageKey);
    if (saved === today || lastResetDateRef.current === today) return;
    lastResetDateRef.current = today;
    localStorage.setItem(storageKey, today);
    // Reset morning checklist items
    if (ownerStartChecklist.some((i) => i.type !== 'header' && i.done)) {
      setOwnerStartChecklist(ownerStartChecklist.map((i) => ({ ...i, done: false })));
    }
    // Reset end-of-day checklist items
    if (ownerEndChecklist.some((i) => i.type !== 'header' && i.done)) {
      setOwnerEndChecklist(ownerEndChecklist.map((i) => ({ ...i, done: false })));
    }
  }, [today, ownerStartChecklist, setOwnerStartChecklist, ownerEndChecklist, setOwnerEndChecklist]);

  // Checklist completion status — use checklistLog (persisted) so refresh doesn't reset gate
  const startCheckable = ownerStartChecklist.filter((i) => i.type !== 'header');
  const startDone = startCheckable.filter((i) => i.done).length;
  const morningItemsComplete = startCheckable.length > 0 && startDone === startCheckable.length;
  const morningLogEntry = checklistLog.find((e) => e.date === today && e.checklistType === 'owner-start');
  const morningLogComplete = morningLogEntry && morningLogEntry.completedItems === morningLogEntry.totalItems;
  const morningComplete = morningItemsComplete || morningLogComplete;

  // ─── End-of-day completion status ───
  const endLogEntry = checklistLog.find((e) => e.date === today && e.checklistType === 'owner-end');
  const endOfDayComplete = endLogEntry && endLogEntry.completedItems === endLogEntry.totalItems;

  // ─── 6 PM auto-prompt for end-of-day wrap-up ───
  useEffect(() => {
    if (wrappingUp || endOfDayComplete || eodDismissedToday) return;
    const check6PM = () => {
      const now = new Date();
      if (now.getHours() >= 18 && !wrappingUp && !endOfDayComplete) {
        setWrappingUp(true);
      }
    };
    check6PM(); // check immediately
    const interval = setInterval(check6PM, 60_000); // re-check every minute
    return () => clearInterval(interval);
  }, [wrappingUp, endOfDayComplete, eodDismissedToday]);

  // Initialize or load dashboard — carry forward everything on date change
  const getDashboard = useCallback(() => {
    if (!executionDashboard) {
      // First time ever — create a blank dashboard
      const fresh = createFreshDay(today, null, null, null, null);
      setExecutionDashboard(fresh);
      return fresh;
    }
    if (executionDashboard.date !== today) {
      // Date changed — keep all items, just update the date
      const updated = { ...executionDashboard, date: today };
      setExecutionDashboard(updated);
      return updated;
    }
    return executionDashboard;
  }, [executionDashboard, today, setExecutionDashboard]);

  const dash = getDashboard();

  // ─── One-time restore: recover items lost from past wrap-ups (runs once EVER, not every session) ───
  const RESTORE_FLAG = 'greenteam-history-restored';
  const alreadyRestored = useRef(false);
  useEffect(() => {
    if (alreadyRestored.current) return;
    try { if (localStorage.getItem(RESTORE_FLAG)) { alreadyRestored.current = true; return; } } catch {}
    if (!executionHistory || executionHistory.length === 0 || !dash) return;
    alreadyRestored.current = true;
    try { localStorage.setItem(RESTORE_FLAG, '1'); } catch {}

    const currentIds = new Set();
    // Collect IDs already in the current dashboard
    (dash.doNow || []).forEach((i) => { if (i.id) currentIds.add(i.id); });
    const cp = normalizeParkingLot(dash.parkingLot);
    (cp.urgent || []).forEach((i) => { if (i.id) currentIds.add(i.id); });
    (cp.niceToHave || []).forEach((i) => { if (i.id) currentIds.add(i.id); });
    for (const cat of CATEGORIES) {
      (dash.todaysWins?.[cat.key]?.focusItems || []).forEach((i) => { if (i.id) currentIds.add(i.id); });
    }
    (dash.weeklyOutcomes || []).forEach((i) => { if (i.id) currentIds.add(i.id); });

    // Scan all archived days and collect lost items
    const lostDoNow = [];
    const lostUrgent = [];
    const lostNice = [];
    const lostFocus = {};
    const lostOutcomes = [];
    for (const cat of CATEGORIES) lostFocus[cat.key] = [];

    for (const archived of executionHistory) {
      // doNow items with actual text
      (archived.doNow || []).forEach((i) => {
        if (i.text && i.text.trim() && i.id && !currentIds.has(i.id)) {
          currentIds.add(i.id);
          lostDoNow.push(i);
        }
      });
      // Parking lot
      const ap = normalizeParkingLot(archived.parkingLot);
      (ap.urgent || []).forEach((i) => {
        if (i.text && i.id && !currentIds.has(i.id)) {
          currentIds.add(i.id);
          lostUrgent.push(i);
        }
      });
      (ap.niceToHave || []).forEach((i) => {
        if (i.text && i.id && !currentIds.has(i.id)) {
          currentIds.add(i.id);
          lostNice.push(i);
        }
      });
      // Focus items under each category
      for (const cat of CATEGORIES) {
        (archived.todaysWins?.[cat.key]?.focusItems || []).forEach((i) => {
          if (i.text && i.id && !currentIds.has(i.id)) {
            currentIds.add(i.id);
            lostFocus[cat.key].push(i);
          }
        });
      }
      // Weekly outcomes with actual titles
      (archived.weeklyOutcomes || []).forEach((i) => {
        if (i.title && i.title.trim() && i.id && !currentIds.has(i.id)) {
          currentIds.add(i.id);
          lostOutcomes.push(i);
        }
      });
    }

    const hasLost = lostDoNow.length || lostUrgent.length || lostNice.length || lostOutcomes.length ||
      CATEGORIES.some((c) => lostFocus[c.key].length);

    if (!hasLost) return;

    setExecutionDashboard((prev) => {
      const merged = { ...prev };
      // Restore doNow
      if (lostDoNow.length) {
        merged.doNow = [...(prev.doNow || []), ...lostDoNow];
      }
      // Restore parking lot
      if (lostUrgent.length || lostNice.length) {
        const pp = normalizeParkingLot(prev.parkingLot);
        merged.parkingLot = {
          urgent: [...pp.urgent, ...lostUrgent],
          niceToHave: [...pp.niceToHave, ...lostNice],
        };
      }
      // Restore focus items
      const newWins = { ...prev.todaysWins };
      for (const cat of CATEGORIES) {
        if (lostFocus[cat.key].length) {
          const existing = newWins[cat.key] || {};
          newWins[cat.key] = { ...existing, focusItems: [...(existing.focusItems || []), ...lostFocus[cat.key]] };
        }
      }
      merged.todaysWins = newWins;
      // Restore weekly outcomes
      if (lostOutcomes.length) {
        merged.weeklyOutcomes = [...(prev.weeklyOutcomes || []), ...lostOutcomes];
      }
      return merged;
    });
  }, [executionHistory, dash, setExecutionDashboard]);

  const update = (patch) => {
    setExecutionDashboard((prev) => ({ ...prev, ...patch }));
  };

  // Parking Lot (two lanes: urgent / nice-to-have)
  const parking = normalizeParkingLot(dash.parkingLot);
  const [newUrgentItem, setNewUrgentItem] = useState('');
  const [newNiceItem, setNewNiceItem] = useState(''); // kept for potential direct add to light work

  const addParkingItem = (lane) => {
    const text = lane === 'urgent' ? newUrgentItem.trim() : newNiceItem.trim();
    if (!text) return;
    const updated = { ...parking, [lane]: [...parking[lane], { id: genId(), text }] };
    update({ parkingLot: updated });
    lane === 'urgent' ? setNewUrgentItem('') : setNewNiceItem('');
  };

  const removeParkingItem = (lane, id) => {
    update({ parkingLot: { ...parking, [lane]: parking[lane].filter((item) => item.id !== id) } });
  };

  const toggleParkingDone = (lane, id) => {
    update({ parkingLot: { ...parking, [lane]: parking[lane].map((item) => item.id === id ? { ...item, done: !item.done } : item) } });
  };

  const moveParkingLane = (fromLane, toLane, id) => {
    const item = parking[fromLane].find((i) => i.id === id);
    if (!item) return;
    update({ parkingLot: {
      ...parking,
      [fromLane]: parking[fromLane].filter((i) => i.id !== id),
      [toLane]: [...parking[toLane], item],
    }});
  };

  const totalParkingCount = parking.urgent.length + parking.niceToHave.length;

  // Inline editing for parking lot items
  const [editingParkingId, setEditingParkingId] = useState(null);
  const [editingParkingText, setEditingParkingText] = useState('');
  const editInputRef = useRef(null);

  const startEditParking = (lane, item) => {
    setEditingParkingId(`${lane}:${item.id}`);
    setEditingParkingText(item.text);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };
  const commitEditParking = (lane, id) => {
    const text = editingParkingText.trim();
    if (!text) { setEditingParkingId(null); return; }
    update({ parkingLot: { ...parking, [lane]: parking[lane].map((i) => i.id === id ? { ...i, text } : i) } });
    setEditingParkingId(null);
  };

  // Inline editing for focus items
  const [editingFocusId, setEditingFocusId] = useState(null);
  const [editingFocusText, setEditingFocusText] = useState('');
  const editFocusRef = useRef(null);

  const startEditFocus = (catKey, item) => {
    setEditingFocusId(`${catKey}:${item.id}`);
    setEditingFocusText(item.text);
    setTimeout(() => editFocusRef.current?.focus(), 0);
  };
  const commitEditFocus = (catKey, id) => {
    const text = editingFocusText.trim();
    if (!text) { setEditingFocusId(null); return; }
    const win = dash.todaysWins[catKey] || { done: false, focusItems: [] };
    update({ todaysWins: { ...dash.todaysWins, [catKey]: { ...win, focusItems: (win.focusItems || []).map((i) => i.id === id ? { ...i, text } : i) } } });
    setEditingFocusId(null);
  };

  // Drag-and-drop: reorder within lane + move between lanes
  const [dragItem, setDragItem] = useState(null); // { lane, id }
  const [dragOverLane, setDragOverLane] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);

  const dragItemRef = useRef(null);
  const handleDragStart = (lane, id) => (e) => {
    const d = { lane, id };
    setDragItem(d);
    dragItemRef.current = d;
    e.dataTransfer.effectAllowed = 'all';
    e.dataTransfer.setData('text/plain', id);
  };
  const handleDragOver = (lane) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverLane(lane);
  };
  const handleDragLeave = () => { setDragOverLane(null); setDragOverItemId(null); };
  const handleItemDragOver = (lane, itemId) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverLane(lane);
    setDragOverItemId(itemId);
  };
  const handleDrop = (targetLane) => (e) => {
    e.preventDefault();
    setDragOverLane(null);
    const targetItemId = dragOverItemId;
    setDragOverItemId(null);
    if (!dragItem) return;

    const { lane: srcLane, id: srcId } = dragItem;
    if (srcLane === targetLane) {
      // Reorder within same lane
      const items = [...parking[targetLane]];
      const fromIdx = items.findIndex((i) => i.id === srcId);
      let toIdx = (targetItemId && targetItemId !== '__bottom') ? items.findIndex((i) => i.id === targetItemId) : items.length;
      if (fromIdx === -1 || fromIdx === toIdx) { setDragItem(null); return; }
      const [moved] = items.splice(fromIdx, 1);
      if (toIdx > fromIdx) toIdx--;
      items.splice(toIdx, 0, moved);
      update({ parkingLot: { ...parking, [targetLane]: items } });
    } else {
      // Move between lanes, insert at drop position
      const item = parking[srcLane].find((i) => i.id === srcId);
      if (!item) { setDragItem(null); return; }
      const destItems = [...parking[targetLane]];
      const insertIdx = (targetItemId && targetItemId !== '__bottom') ? destItems.findIndex((i) => i.id === targetItemId) : destItems.length;
      destItems.splice(insertIdx === -1 ? destItems.length : insertIdx, 0, item);
      update({ parkingLot: {
        ...parking,
        [srcLane]: parking[srcLane].filter((i) => i.id !== srcId),
        [targetLane]: destItems,
      }});
    }
    setDragItem(null);
  };
  const handleDragEnd = () => { setDragItem(null); dragItemRef.current = null; setDragOverLane(null); setDragOverItemId(null); setDragOverFocus(null); setDragOverFocusItemId(null); };

  // Drop onto Today's Focus blocks
  const [dragOverFocus, setDragOverFocus] = useState(null);
  const handleFocusDragOver = (catKey) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFocus(catKey);
  };
  const handleFocusDragLeave = () => setDragOverFocus(null);
  const handleFocusDrop = (catKey) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFocus(null);
    // Use ref for reliable access — state may be stale in drag handlers
    const di = dragItemRef.current;
    if (!di) return;
    const { lane, id } = di;
    const currentParking = normalizeParkingLot(dash.parkingLot);
    const item = currentParking[lane].find((i) => i.id === id);
    if (!item) { setDragItem(null); dragItemRef.current = null; return; }
    // Append text to the focus block goal
    const win = dash.todaysWins[catKey] || { done: false, focusItems: [] };
    // Add as a focus item (list), not appended to text
    const focusItems = [...(win.focusItems || []), { id: item.id, text: item.text, fromLane: lane }];
    // Remove from parking lot
    const updatedParking = { ...currentParking, [lane]: currentParking[lane].filter((i) => i.id !== id) };
    update({
      todaysWins: { ...dash.todaysWins, [catKey]: { ...win, focusItems } },
      parkingLot: updatedParking,
    });
    setDragItem(null);
    dragItemRef.current = null;
  };

  // Drag focus items — reorder within block or drag back to parking lot
  const [dragOverFocusItemId, setDragOverFocusItemId] = useState(null);

  const handleFocusItemDragStart = (catKey, item) => (e) => {
    const d = { lane: '__focus', id: item.id, catKey, fromLane: item.fromLane || 'urgent' };
    setDragItem(d);
    dragItemRef.current = d;
    e.dataTransfer.effectAllowed = 'all';
    e.dataTransfer.setData('text/plain', item.id);
  };

  const handleFocusItemDragOver = (catKey, itemId) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFocus(catKey);
    setDragOverFocusItemId(itemId);
  };

  const handleFocusItemDrop = (catKey) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const di = dragItemRef.current;
    const targetItemId = dragOverFocusItemId;
    setDragOverFocusItemId(null);
    setDragOverFocus(null);
    if (!di) return;

    // Reorder within same focus block
    if (di.lane === '__focus' && di.catKey === catKey) {
      const win = dash.todaysWins[catKey] || { done: false, focusItems: [] };
      const items = [...(win.focusItems || [])];
      const fromIdx = items.findIndex((i) => i.id === di.id);
      let toIdx = (targetItemId && targetItemId !== '__bottom') ? items.findIndex((i) => i.id === targetItemId) : items.length;
      if (fromIdx === -1 || fromIdx === toIdx) { setDragItem(null); dragItemRef.current = null; return; }
      const [moved] = items.splice(fromIdx, 1);
      if (toIdx > fromIdx) toIdx--;
      items.splice(toIdx, 0, moved);
      update({ todaysWins: { ...dash.todaysWins, [catKey]: { ...win, focusItems: items } } });
      setDragItem(null);
      dragItemRef.current = null;
      return;
    }

    // Cross-block move: focus item dragged from one block to another
    if (di.lane === '__focus' && di.catKey !== catKey) {
      const srcWin = dash.todaysWins[di.catKey] || { done: false, focusItems: [] };
      const item = (srcWin.focusItems || []).find((i) => i.id === di.id);
      if (!item) { setDragItem(null); dragItemRef.current = null; return; }
      const destWin = dash.todaysWins[catKey] || { done: false, focusItems: [] };
      const destItems = [...(destWin.focusItems || [])];
      const insertIdx = (targetItemId && targetItemId !== '__bottom') ? destItems.findIndex((i) => i.id === targetItemId) : destItems.length;
      destItems.splice(insertIdx === -1 ? destItems.length : insertIdx, 0, item);
      update({
        todaysWins: {
          ...dash.todaysWins,
          [di.catKey]: { ...srcWin, focusItems: srcWin.focusItems.filter((i) => i.id !== di.id) },
          [catKey]: { ...destWin, focusItems: destItems },
        },
      });
      setDragItem(null);
      dragItemRef.current = null;
      return;
    }

    // Otherwise fall through to normal focus drop (from parking lot)
    handleFocusDrop(catKey)(e);
  };

  const removeFocusItem = (catKey, itemId) => {
    const win = dash.todaysWins[catKey] || { done: false, focusItems: [] };
    update({
      todaysWins: { ...dash.todaysWins, [catKey]: { ...win, focusItems: (win.focusItems || []).filter((i) => i.id !== itemId) } },
    });
  };

  // Override parking drop to also accept focus items being dragged back
  const origHandleDrop = handleDrop;
  const handleParkingDrop = (targetLane) => (e) => {
    const di = dragItemRef.current;
    if (di && di.lane === '__focus') {
      e.preventDefault();
      setDragOverLane(null);
      setDragOverItemId(null);
      // Move focus item back to parking lane
      const { catKey, id } = di;
      const win = dash.todaysWins[catKey] || { done: false, focusItems: [] };
      const item = (win.focusItems || []).find((i) => i.id === id);
      if (!item) { setDragItem(null); dragItemRef.current = null; return; }
      const currentParking = normalizeParkingLot(dash.parkingLot);
      update({
        todaysWins: { ...dash.todaysWins, [catKey]: { ...win, focusItems: win.focusItems.filter((i) => i.id !== id) } },
        parkingLot: { ...currentParking, [targetLane]: [...currentParking[targetLane], { id: item.id, text: item.text }] },
      });
      setDragItem(null);
      dragItemRef.current = null;
      return;
    }
    origHandleDrop(targetLane)(e);
  };

  // Roll to Tomorrow — archive today, keep EVERYTHING intact (nothing resets unless user deletes it)
  const handleRollToTomorrow = (journal) => {
    setExecutionDashboard((current) => {
      // Archive today's snapshot
      const archived = { ...current, endOfDay: { ...current.endOfDay, ...journal } };
      setExecutionHistory([...(executionHistory || []), archived]);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      // Only change date and clear journal — everything else stays
      return {
        ...current,
        date: tomorrowStr,
        endOfDay: { doneToday: '', movedToTomorrow: '', firstTaskTomorrow: '', whatWentWell: '', whatWentBad: '', whatToImprove: '' },
      };
    });
    setWrappingUp(false);
  };

  // Progress
  const blocksTouched = CATEGORIES.filter(
    (c) => dash.todaysWins[c.key]?.text || dash.todaysWins[c.key]?.done || (dash.todaysWins[c.key]?.focusItems?.length > 0)
  ).length;

  // ─── Wrap Up gate ───
  if (wrappingUp) {
    return (
      <WrapUpDayScreen
        dash={dash}
        checklistItems={ownerEndChecklist}
        setChecklistItems={setOwnerEndChecklist}
        checklistLog={checklistLog}
        setChecklistLog={setChecklistLog}
        onRoll={handleRollToTomorrow}
        onClose={() => { setWrappingUp(false); setEodDismissedToday(true); }}
      />
    );
  }

  // ─── Morning gate: must complete checklist before seeing dashboard ───
  if (!morningComplete && !morningDismissed) {
    return (
      <StartMyDayGate
        greeting={`${getGreeting()}, ${firstName}`}
        date={formatDisplayDate(dash.date)}
        items={ownerStartChecklist}
        setItems={setOwnerStartChecklist}
        checklistLog={checklistLog}
        setChecklistLog={setChecklistLog}
        onComplete={() => setMorningDismissed(true)}
      />
    );
  }

  return (
    <div className="space-y-8 pb-8">
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 mr-3" />
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/owner-dashboard')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-secondary hover:bg-surface-alt transition-colors cursor-pointer"
          >
            <ClipboardList size={14} />
            Manage
          </button>
          <button
            onClick={() => navigate('/owner-dashboard?announce=1')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-secondary hover:bg-surface-alt transition-colors cursor-pointer"
          >
            <Megaphone size={14} />
          </button>
        </div>
      </div>

      {/* ─── Owner Notes (persistent) ─── */}
      <section>
        {editingNotes ? (
          <div className="rounded-xl border border-brand/40 bg-card p-4">
            <textarea
              ref={notesRef}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Where we're at, what we need, priorities..."
              rows={4}
              className="w-full bg-transparent text-sm text-primary outline-none placeholder:text-muted resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => { setNotesDraft(ownerNotes || ''); setEditingNotes(false); }}
                className="text-xs text-muted hover:text-secondary px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setOwnerNotes(notesDraft); setEditingNotes(false); }}
                className="text-xs font-semibold bg-brand text-on-brand px-3 py-1.5 rounded-lg hover:bg-brand-hover transition-colors cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => { setNotesDraft(ownerNotes || ''); setEditingNotes(true); }}
            className="w-full text-left rounded-xl border border-border-subtle bg-card p-4 hover:border-brand/30 transition-colors cursor-pointer group"
          >
            {ownerNotes ? (
              <div className="flex items-start gap-3">
                <div className="flex-1 text-sm text-secondary whitespace-pre-wrap">{ownerNotes}</div>
                <Pencil size={14} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
              </div>
            ) : (
              <p className="text-sm text-muted flex items-center gap-2">
                <Pencil size={14} />
                Tap to write your thoughts — priorities, where we're at, what's needed...
              </p>
            )}
          </div>
        )}
      </section>

      {/* ─── Today's Focus: Goals + Time Blocks (combined) ─── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Today's Focus</h2>
          <button
            onClick={() => setEditingSchedule((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted hover:text-secondary transition-colors cursor-pointer"
          >
            <Settings size={12} />
            {editingSchedule ? 'Done' : 'Edit Schedule'}
          </button>
        </div>

        {/* Schedule editor (only when editing) */}
        {editingSchedule && (
          <div className="rounded-xl border border-border-subtle bg-card p-4 mb-3 space-y-3">
            <p className="text-xs text-muted">Set your default time blocks — these persist every day.</p>
            {CATEGORIES.map((cat) => {
              const sched = ownerSchedule[cat.key] || DEFAULT_TIME_BLOCKS[cat.key];
              return (
                <div key={cat.key} className="flex items-center gap-3">
                  <span className={`text-xs font-semibold w-20 shrink-0 ${cat.color}`}>{cat.label}</span>
                  <input
                    type="time"
                    value={sched.start}
                    onChange={(e) => {
                      setOwnerSchedule({ ...ownerSchedule, [cat.key]: { ...sched, start: e.target.value } });
                    }}
                    className="bg-surface border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-primary outline-none focus:ring-2 focus:ring-brand cursor-pointer"
                  />
                  <span className="text-xs text-muted font-medium">to</span>
                  <input
                    type="time"
                    value={sched.end}
                    onChange={(e) => {
                      setOwnerSchedule({ ...ownerSchedule, [cat.key]: { ...sched, end: e.target.value } });
                    }}
                    className="bg-surface border border-border-subtle rounded-lg px-2 py-1.5 text-sm text-primary outline-none focus:ring-2 focus:ring-brand cursor-pointer"
                  />
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CATEGORIES.map((cat) => {
            const win = dash.todaysWins[cat.key];
            const sched = ownerSchedule[cat.key] || DEFAULT_TIME_BLOCKS[cat.key];
            return (
              <div
                key={cat.key}
                onDragOver={handleFocusDragOver(cat.key)}
                onDragLeave={handleFocusDragLeave}
                onDrop={handleFocusDrop(cat.key)}
                className={`rounded-xl border p-4 transition-all ${dragOverFocus === cat.key ? `${cat.border} ${cat.bg} ring-2 ring-offset-1 ring-brand scale-[1.02]` : `${cat.border} ${cat.bg}`}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${cat.color}`}>{cat.label}</span>
                    <span className="text-xs text-muted">{formatTime(sched.start)}–{formatTime(sched.end)}</span>
                    {cat.key === 'sales' && (
                      <>
                        <a
                          href="https://secure.getjobber.com/home"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                        >
                          Send Quotes... &rarr;
                        </a>
                        <a
                          href="https://secure.getjobber.com/sales"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                        >
                          Follow-Ups &rarr;
                        </a>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      update({
                        todaysWins: {
                          ...dash.todaysWins,
                          [cat.key]: { ...win, done: !win.done },
                        },
                      });
                    }}
                    className="shrink-0 cursor-pointer"
                  >
                    {win.done ? (
                      <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center">
                        <Check size={14} className="text-on-brand" />
                      </div>
                    ) : (
                      <Circle size={22} className="text-muted" />
                    )}
                  </button>
                </div>
                {/* Focus items dragged in from parking lot */}
                {win.focusItems?.length > 0 && (
                  <div
                    className="mt-2.5 space-y-1 border-t border-border-subtle/50 pt-2"
                    onDragOver={(e) => { e.preventDefault(); setDragOverFocus(cat.key); }}
                    onDrop={handleFocusItemDrop(cat.key)}
                  >
                    {win.focusItems.map((fi) => (
                      <div
                        key={fi.id}
                        draggable={editingFocusId !== `${cat.key}:${fi.id}`}
                        onDragStart={handleFocusItemDragStart(cat.key, fi)}
                        onDragOver={handleFocusItemDragOver(cat.key, fi.id)}
                        onDragEnd={handleDragEnd}
                        className={`group flex items-center gap-2 text-xs rounded-md px-2 py-1.5 transition-all ${dragOverFocusItemId === fi.id && dragItem?.id !== fi.id ? 'border-t-2 border-brand' : 'border-t-2 border-transparent'} ${dragItem?.id === fi.id ? 'opacity-30' : ''} ${editingFocusId === `${cat.key}:${fi.id}` ? '' : 'cursor-grab active:cursor-grabbing'} hover:bg-white/40 dark:hover:bg-white/5`}
                      >
                        <span className={`w-1 h-1 rounded-full shrink-0 ${fi.fromLane === 'urgent' ? 'bg-red-400' : 'bg-amber-400'}`} />
                        {editingFocusId === `${cat.key}:${fi.id}` ? (
                          <input
                            ref={editFocusRef}
                            type="text"
                            value={editingFocusText}
                            onChange={(e) => setEditingFocusText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitEditFocus(cat.key, fi.id); if (e.key === 'Escape') setEditingFocusId(null); }}
                            onBlur={() => commitEditFocus(cat.key, fi.id)}
                            className="flex-1 bg-transparent outline-none text-xs text-primary py-0"
                          />
                        ) : (
                          <span className="flex-1 text-primary/80 truncate" onDoubleClick={() => startEditFocus(cat.key, fi)}>{fi.text}</span>
                        )}
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEditFocus(cat.key, fi)} className="p-0.5 text-muted hover:text-primary cursor-pointer" title="Edit"><Pencil size={10} /></button>
                          <button onClick={() => removeFocusItem(cat.key, fi.id)} className="p-0.5 text-muted hover:text-red-500 cursor-pointer" title="Remove"><X size={10} /></button>
                        </div>
                      </div>
                    ))}
                    {/* Bottom drop zone */}
                    <div
                      onDragOver={handleFocusItemDragOver(cat.key, '__bottom')}
                      onDrop={handleFocusItemDrop(cat.key)}
                      className={`h-3 rounded transition-all ${dragOverFocusItemId === '__bottom' && dragOverFocus === cat.key ? 'border-t-2 border-brand' : ''}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {/* Ops — drop target block */}
          {(() => {
            const opsWin = dash.todaysWins.ops || { done: false, focusItems: [] };
            return (
              <div
                onDragOver={handleFocusDragOver('ops')}
                onDragLeave={handleFocusDragLeave}
                onDrop={handleFocusDrop('ops')}
                className={`rounded-xl border p-4 transition-all ${dragOverFocus === 'ops' ? 'border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-950/30 ring-2 ring-offset-1 ring-brand scale-[1.02]' : 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-orange-600 dark:text-orange-400">Ops</span>
                  <span className="text-xs text-muted">4p–6p</span>
                </div>
                {opsWin.focusItems?.length > 0 && (
                  <div
                    className="mt-2 space-y-1 border-t border-border-subtle/50 pt-2"
                    onDragOver={(e) => { e.preventDefault(); setDragOverFocus('ops'); }}
                    onDrop={handleFocusItemDrop('ops')}
                  >
                    {opsWin.focusItems.map((fi) => (
                      <div
                        key={fi.id}
                        draggable={editingFocusId !== `ops:${fi.id}`}
                        onDragStart={handleFocusItemDragStart('ops', fi)}
                        onDragOver={handleFocusItemDragOver('ops', fi.id)}
                        onDragEnd={handleDragEnd}
                        className={`group flex items-center gap-2 text-xs rounded-md px-2 py-1.5 transition-all ${dragOverFocusItemId === fi.id && dragItem?.id !== fi.id ? 'border-t-2 border-brand' : 'border-t-2 border-transparent'} ${dragItem?.id === fi.id ? 'opacity-30' : ''} ${editingFocusId === `ops:${fi.id}` ? '' : 'cursor-grab active:cursor-grabbing'} hover:bg-white/40 dark:hover:bg-white/5`}
                      >
                        <span className={`w-1 h-1 rounded-full shrink-0 ${fi.fromLane === 'urgent' ? 'bg-red-400' : 'bg-amber-400'}`} />
                        {editingFocusId === `ops:${fi.id}` ? (
                          <input
                            ref={editFocusRef}
                            type="text"
                            value={editingFocusText}
                            onChange={(e) => setEditingFocusText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitEditFocus('ops', fi.id); if (e.key === 'Escape') setEditingFocusId(null); }}
                            onBlur={() => commitEditFocus('ops', fi.id)}
                            className="flex-1 bg-transparent outline-none text-xs text-primary py-0"
                          />
                        ) : (
                          <span className="flex-1 text-primary/80 truncate" onDoubleClick={() => startEditFocus('ops', fi)}>{fi.text}</span>
                        )}
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEditFocus('ops', fi)} className="p-0.5 text-muted hover:text-primary cursor-pointer" title="Edit"><Pencil size={10} /></button>
                          <button onClick={() => removeFocusItem('ops', fi.id)} className="p-0.5 text-muted hover:text-red-500 cursor-pointer" title="Remove"><X size={10} /></button>
                        </div>
                      </div>
                    ))}
                    {/* Bottom drop zone */}
                    <div
                      onDragOver={handleFocusItemDragOver('ops', '__bottom')}
                      onDrop={handleFocusItemDrop('ops')}
                      className={`h-3 rounded transition-all ${dragOverFocusItemId === '__bottom' && dragOverFocus === 'ops' ? 'border-t-2 border-brand' : ''}`}
                    />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </section>

      {/* ─── Parking Lot ─── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
          Parking Lot
          {totalParkingCount > 0 && (
            <span className="ml-2 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-bold">
              {totalParkingCount}
            </span>
          )}
        </h2>

        {/* Single add input */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newUrgentItem}
            onChange={(e) => setNewUrgentItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addParkingItem('urgent')}
            placeholder="Add a task..."
            className="flex-1 bg-card border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-primary outline-none placeholder:text-muted focus:ring-1 focus:ring-brand"
          />
          <button
            onClick={() => addParkingItem('urgent')}
            disabled={!newUrgentItem.trim()}
            className="px-4 py-2.5 rounded-xl bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Adds to Deep Work — drag to Light Work if needed"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* ── Deep Work ── */}
          <div
            onDragOver={handleDragOver('urgent')}
            onDragLeave={handleDragLeave}
            onDrop={handleParkingDrop('urgent')}
            className={`rounded-xl p-3 min-h-[80px] transition-all ${dragOverLane === 'urgent' ? 'bg-red-50 dark:bg-red-950/30 ring-2 ring-red-300 dark:ring-red-700' : 'bg-surface-alt'}`}>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Flame size={13} className="text-red-500" />
              <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">Deep Work</span>
              {parking.urgent.length > 0 && (
                <span className="text-[10px] text-muted ml-auto">{parking.urgent.length}</span>
              )}
            </div>
            {parking.urgent.length > 0 && (
              <div className="space-y-1">
                {parking.urgent.map((item, idx) => (
                  <div
                    key={item.id}
                    draggable={editingParkingId !== `urgent:${item.id}`}
                    onDragStart={handleDragStart('urgent', item.id)}
                    onDragOver={handleItemDragOver('urgent', item.id)}
                    onDragEnd={handleDragEnd}
                    className={`group flex items-center gap-2 text-xs rounded-lg px-2.5 py-2 transition-all ${dragOverItemId === item.id && dragItem?.id !== item.id ? 'border-t-2 border-red-300' : 'border-t-2 border-transparent'} ${dragItem?.id === item.id ? 'opacity-30' : ''} ${editingParkingId === `urgent:${item.id}` ? '' : 'cursor-grab active:cursor-grabbing'} ${item.done ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : 'bg-card hover:bg-card/80'}`}>
                    <button onClick={() => toggleParkingDone('urgent', item.id)} className="shrink-0 cursor-pointer" title={item.done ? 'Undo' : 'Done'}>
                      {item.done ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Circle size={14} className="text-muted/40" />}
                    </button>
                    {editingParkingId === `urgent:${item.id}` ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingParkingText}
                        onChange={(e) => setEditingParkingText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEditParking('urgent', item.id); if (e.key === 'Escape') setEditingParkingId(null); }}
                        onBlur={() => commitEditParking('urgent', item.id)}
                        className="flex-1 bg-transparent outline-none text-xs text-primary py-0"
                      />
                    ) : (
                      <span
                        className={`flex-1 truncate ${item.done ? 'line-through text-muted' : 'text-primary'}`}
                        onDoubleClick={() => startEditParking('urgent', item)}
                      >{item.text}</span>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEditParking('urgent', item)} className="p-0.5 text-muted hover:text-primary cursor-pointer" title="Edit"><Pencil size={11} /></button>
                      <button onClick={() => removeParkingItem('urgent', item.id)} className="p-0.5 text-muted hover:text-red-500 cursor-pointer" title="Remove"><X size={11} /></button>
                    </div>
                  </div>
                ))}
                <div
                  onDragOver={handleItemDragOver('urgent', '__bottom')}
                  className={`h-3 rounded transition-all ${dragOverItemId === '__bottom' && dragOverLane === 'urgent' ? 'border-t-2 border-red-300' : ''}`}
                />
              </div>
            )}
          </div>

          {/* ── Light Work ── */}
          <div
            onDragOver={handleDragOver('niceToHave')}
            onDragLeave={handleDragLeave}
            onDrop={handleParkingDrop('niceToHave')}
            className={`rounded-xl p-3 min-h-[80px] transition-all ${dragOverLane === 'niceToHave' ? 'bg-amber-50 dark:bg-amber-950/30 ring-2 ring-amber-300 dark:ring-amber-700' : 'bg-surface-alt'}`}>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Lightbulb size={13} className="text-amber-500" />
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Light Work</span>
              {parking.niceToHave.length > 0 && (
                <span className="text-[10px] text-muted ml-auto">{parking.niceToHave.length}</span>
              )}
            </div>
            {parking.niceToHave.length > 0 && (
              <div className="space-y-1">
                {parking.niceToHave.map((item, idx) => (
                  <div
                    key={item.id}
                    draggable={editingParkingId !== `niceToHave:${item.id}`}
                    onDragStart={handleDragStart('niceToHave', item.id)}
                    onDragOver={handleItemDragOver('niceToHave', item.id)}
                    onDragEnd={handleDragEnd}
                    className={`group flex items-center gap-2 text-xs rounded-lg px-2.5 py-2 transition-all ${dragOverItemId === item.id && dragItem?.id !== item.id ? 'border-t-2 border-amber-300' : 'border-t-2 border-transparent'} ${dragItem?.id === item.id ? 'opacity-30' : ''} ${editingParkingId === `niceToHave:${item.id}` ? '' : 'cursor-grab active:cursor-grabbing'} ${item.done ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : 'bg-card hover:bg-card/80'}`}>
                    <button onClick={() => toggleParkingDone('niceToHave', item.id)} className="shrink-0 cursor-pointer" title={item.done ? 'Undo' : 'Done'}>
                      {item.done ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Circle size={14} className="text-muted/40" />}
                    </button>
                    {editingParkingId === `niceToHave:${item.id}` ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingParkingText}
                        onChange={(e) => setEditingParkingText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEditParking('niceToHave', item.id); if (e.key === 'Escape') setEditingParkingId(null); }}
                        onBlur={() => commitEditParking('niceToHave', item.id)}
                        className="flex-1 bg-transparent outline-none text-xs text-primary py-0"
                      />
                    ) : (
                      <span
                        className={`flex-1 truncate ${item.done ? 'line-through text-muted' : 'text-primary'}`}
                        onDoubleClick={() => startEditParking('niceToHave', item)}
                      >{item.text}</span>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEditParking('niceToHave', item)} className="p-0.5 text-muted hover:text-primary cursor-pointer" title="Edit"><Pencil size={11} /></button>
                      <button onClick={() => removeParkingItem('niceToHave', item.id)} className="p-0.5 text-muted hover:text-red-500 cursor-pointer" title="Remove"><X size={11} /></button>
                    </div>
                  </div>
                ))}
                <div
                  onDragOver={handleItemDragOver('niceToHave', '__bottom')}
                  className={`h-3 rounded transition-all ${dragOverItemId === '__bottom' && dragOverLane === 'niceToHave' ? 'border-t-2 border-amber-300' : ''}`}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Wrap Up Day Button ─── */}
      <button
        onClick={() => setWrappingUp(true)}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-border-strong text-secondary text-sm font-semibold hover:bg-surface-alt hover:border-brand transition-all cursor-pointer"
      >
        <Moon size={18} />
        Wrap Up My Day
      </button>

      {/* ─── Reset Day ─── */}
      <button
        onClick={() => {
          if (!confirm('Reset checklists for today? (Your goals, parking lot & focus items stay)')) return;
          setOwnerStartChecklist((prev) => prev.map((i) => ({ ...i, done: false })));
          setOwnerEndChecklist((prev) => prev.map((i) => ({ ...i, done: false })));
          setMorningDismissed(false);
        }}
        className="w-full text-center text-[11px] text-muted/50 hover:text-red-400 transition-colors cursor-pointer py-2"
      >
        Reset Day
      </button>
    </div>
  );
}
