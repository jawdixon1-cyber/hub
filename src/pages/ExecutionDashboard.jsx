import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
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
} from 'lucide-react';
import { genId } from '../data';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';
import { useChecklistDay, useChecklistLog } from '../components/owner/MyDaySection';
import renderLinkedText from '../utils/renderLinkedText';

/* ─── Constants ─── */

const CATEGORIES = [
  { key: 'build', label: 'Build', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800' },
  { key: 'delegate', label: 'Delegate', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800' },
  { key: 'sales', label: 'Sales', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800' },
];

const DEFAULT_TIME_BLOCKS = {
  sales: { start: '07:00', end: '09:00' },
  build: { start: '09:00', end: '11:00' },
  delegate: { start: '11:00', end: '12:00' },
};

/* ─── Helpers ─── */

function createFreshDay(date, keepOutcomes, keepTimeBlocks) {
  return {
    date,
    weeklyOutcomes: keepOutcomes || [
      { id: genId(), title: '', note: '', done: false },
      { id: genId(), title: '', note: '', done: false },
      { id: genId(), title: '', note: '', done: false },
    ],
    todaysWins: {
      sales: { text: '', done: false },
      build: { text: '', done: false },
      delegate: { text: '', done: false },
    },
    timeBlocks: keepTimeBlocks || { ...DEFAULT_TIME_BLOCKS },
    doNow: [
      { id: genId(), text: '', done: false },
      { id: genId(), text: '', done: false },
      { id: genId(), text: '', done: false },
      { id: genId(), text: '', done: false },
      { id: genId(), text: '', done: false },
    ],
    parkingLot: [],
    endOfDay: {
      doneToday: '',
      movedToTomorrow: '',
      firstTaskTomorrow: '',
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

function WrapUpDayScreen({ dash, checklistItems, setChecklistItems, checklistLog, setChecklistLog, onRoll, onClose, onUpdateParking }) {
  // Steps: checklist → parking → tomorrow → journal
  const [step, setStep] = useState('checklist');

  // Parking lot items — local copy so user can remove/move during wrap-up
  const [parkingItems, setParkingItems] = useState(() => [...(dash.parkingLot || [])]);

  // Tomorrow's goals — pre-filled from today, user can keep/edit/clear
  const [tomorrowGoals, setTomorrowGoals] = useState(() => {
    const goals = {};
    for (const cat of CATEGORIES) {
      const todayWin = dash.todaysWins[cat.key];
      goals[cat.key] = { text: todayWin?.text || '', keep: !!todayWin?.text };
    }
    return goals;
  });

  const [journal, setJournal] = useState(dash.endOfDay.doneToday || '');

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
    // Sync parking lot changes back to dashboard
    onUpdateParking(parkingItems);
    // Build tomorrow's wins from kept goals
    const tomorrowWins = {};
    for (const cat of CATEGORIES) {
      const g = tomorrowGoals[cat.key];
      tomorrowWins[cat.key] = { text: g.keep ? g.text : '', done: false };
    }
    onRoll(journal, tomorrowWins);
  };

  const removeParkingItemLocal = (id) => {
    setParkingItems((prev) => prev.filter((i) => i.id !== id));
  };

  const moveParkingToGoal = (item, catKey) => {
    // Append parking item text to that category's tomorrow goal
    setTomorrowGoals((prev) => ({
      ...prev,
      [catKey]: { text: prev[catKey].text ? `${prev[catKey].text}; ${item.text}` : item.text, keep: true },
    }));
    setParkingItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const stepLabels = ['Checklist', 'Parking Lot', 'Tomorrow', 'Journal'];
  const stepKeys = ['checklist', 'parking', 'tomorrow', 'journal'];
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
          </div>

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
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={markAll}
              className="flex-1 py-3 rounded-xl bg-surface-alt text-secondary border border-border-subtle text-sm font-semibold hover:bg-surface transition-colors cursor-pointer"
            >
              {allDone ? 'Undo All' : 'Complete All'}
            </button>
            <button
              onClick={() => setStep('parking')}
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

      {/* ─── Step 2: Parking Lot Review ─── */}
      {step === 'parking' && (
        <>
          <div className="text-center mb-6">
            <ClipboardList size={36} className="text-amber-500 mx-auto mb-2" />
            <h1 className="text-xl font-bold text-primary">Review Parking Lot</h1>
            <p className="text-sm text-muted mt-1">Clear items, move them to tomorrow's goals, or leave them</p>
          </div>

          {parkingItems.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted">No parking lot items — nice and clean!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {parkingItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 bg-card border border-border-subtle rounded-xl px-4 py-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-2" />
                  <span className="flex-1 text-sm text-primary">{item.text}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.key}
                        onClick={() => moveParkingToGoal(item, cat.key)}
                        title={`Move to ${cat.label}`}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cat.bg} ${cat.color} ${cat.border} border hover:opacity-80 transition-colors cursor-pointer`}
                      >
                        {cat.label[0]}
                      </button>
                    ))}
                    <button
                      onClick={() => removeParkingItemLocal(item.id)}
                      className="p-1 text-muted hover:text-red-500 transition-colors cursor-pointer ml-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep('checklist')}
              className="flex-1 py-3 rounded-xl bg-surface-alt text-secondary border border-border-subtle text-sm font-semibold hover:bg-surface transition-colors cursor-pointer"
            >
              Back
            </button>
            <button
              onClick={() => setStep('tomorrow')}
              className="flex-1 py-3 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* ─── Step 3: Tomorrow's Goals ─── */}
      {step === 'tomorrow' && (
        <>
          <div className="text-center mb-6">
            <Target size={36} className="text-brand mx-auto mb-2" />
            <h1 className="text-xl font-bold text-primary">Set Up Tomorrow</h1>
            <p className="text-sm text-muted mt-1">Keep today's goals or set new ones</p>
          </div>

          <div className="space-y-3">
            {CATEGORIES.map((cat) => {
              const g = tomorrowGoals[cat.key];
              const todayText = dash.todaysWins[cat.key]?.text;
              return (
                <div key={cat.key} className={`rounded-xl border ${cat.border} ${cat.bg} p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-bold ${cat.color}`}>{cat.label}</span>
                    {todayText && (
                      <button
                        onClick={() => {
                          setTomorrowGoals((prev) => ({
                            ...prev,
                            [cat.key]: { ...prev[cat.key], keep: !prev[cat.key].keep, text: prev[cat.key].keep ? '' : todayText },
                          }));
                        }}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                          g.keep
                            ? 'bg-brand text-on-brand'
                            : 'bg-surface-alt text-muted hover:text-secondary'
                        }`}
                      >
                        {g.keep ? 'Keeping' : 'Keep'}
                      </button>
                    )}
                  </div>
                  {todayText && (
                    <p className="text-xs text-muted mb-2">Today: {todayText}</p>
                  )}
                  <input
                    type="text"
                    value={g.text}
                    onChange={(e) => {
                      setTomorrowGoals((prev) => ({
                        ...prev,
                        [cat.key]: { text: e.target.value, keep: true },
                      }));
                    }}
                    placeholder={`Tomorrow's ${cat.label.toLowerCase()} goal...`}
                    className="w-full bg-card/60 border border-border-subtle rounded-lg px-3 py-2 text-sm text-primary outline-none placeholder:text-muted focus:ring-1 focus:ring-brand"
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep('parking')}
              className="flex-1 py-3 rounded-xl bg-surface-alt text-secondary border border-border-subtle text-sm font-semibold hover:bg-surface transition-colors cursor-pointer"
            >
              Back
            </button>
            <button
              onClick={() => setStep('journal')}
              className="flex-1 py-3 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* ─── Step 4: Journal ─── */}
      {step === 'journal' && (
        <>
          <div className="text-center mb-6">
            <RotateCcw size={36} className="text-purple-500 mx-auto mb-2" />
            <h1 className="text-xl font-bold text-primary">Journal</h1>
            <p className="text-sm text-muted mt-1">What got done today?</p>
          </div>

          <textarea
            value={journal}
            onChange={(e) => setJournal(e.target.value)}
            placeholder="Wins, completions, progress, reflections..."
            rows={5}
            className="w-full bg-card border border-border-subtle rounded-xl px-4 py-3 text-sm text-primary outline-none placeholder:text-muted focus:ring-2 focus:ring-brand resize-none"
          />

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep('tomorrow')}
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

  const weeklyQuote = useMemo(() => {
    const quotes = [
      { text: 'Whatever you do, work at it with all your heart.', ref: 'Colossians 3:23' },
      { text: 'Commit to the Lord whatever you do, and he will establish your plans.', ref: 'Proverbs 16:3' },
      { text: 'The hand of the diligent will rule, while the slothful will be put to forced labor.', ref: 'Proverbs 12:24' },
      { text: 'Do everything in love.', ref: '1 Corinthians 16:14' },
      { text: 'Be strong and courageous. Do not be afraid; do not be discouraged.', ref: 'Joshua 1:9' },
      { text: 'Let us not become weary in doing good, for at the proper time we will reap a harvest.', ref: 'Galatians 6:9' },
      { text: 'Iron sharpens iron, and one man sharpens another.', ref: 'Proverbs 27:17' },
      { text: 'I can do all things through him who strengthens me.', ref: 'Philippians 4:13' },
      { text: 'The plans of the diligent lead surely to abundance.', ref: 'Proverbs 21:5' },
      { text: 'Two are better than one, because they have a good reward for their toil.', ref: 'Ecclesiastes 4:9' },
      { text: 'Whatever your hand finds to do, do it with all your might.', ref: 'Ecclesiastes 9:10' },
      { text: 'He who gathers in summer is a prudent son.', ref: 'Proverbs 10:5' },
      { text: 'As each has received a gift, use it to serve one another.', ref: '1 Peter 4:10' },
      { text: 'Well done, good and faithful servant. You have been faithful over a little; I will set you over much.', ref: 'Matthew 25:21' },
      { text: 'For we are his workmanship, created for good works.', ref: 'Ephesians 2:10' },
      { text: 'Do not be slothful in zeal, be fervent in spirit, serve the Lord.', ref: 'Romans 12:11' },
      { text: 'In all toil there is profit, but mere talk tends only to poverty.', ref: 'Proverbs 14:23' },
      { text: 'He gives power to the faint, and to him who has no might he increases strength.', ref: 'Isaiah 40:29' },
      { text: 'The Lord will fight for you; you need only to be still.', ref: 'Exodus 14:14' },
      { text: 'A generous person will prosper; whoever refreshes others will be refreshed.', ref: 'Proverbs 11:25' },
      { text: 'Let your light shine before others, that they may see your good deeds.', ref: 'Matthew 5:16' },
      { text: 'Trust in the Lord with all your heart and lean not on your own understanding.', ref: 'Proverbs 3:5' },
      { text: 'And let us consider how to stir up one another to love and good works.', ref: 'Hebrews 10:24' },
    ];
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.floor(((now - start) / 86400000 + start.getDay()) / 7);
    return quotes[weekNum % quotes.length];
  }, []);

  const [morningDismissed, setMorningDismissed] = useState(false);
  const [wrappingUp, setWrappingUp] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(ownerNotes || '');
  const notesRef = useRef(null);

  // Checklist completion status — use checklistLog (persisted) so refresh doesn't reset gate
  const startCheckable = ownerStartChecklist.filter((i) => i.type !== 'header');
  const startDone = startCheckable.filter((i) => i.done).length;
  const morningItemsComplete = startCheckable.length > 0 && startDone === startCheckable.length;
  const morningLogEntry = checklistLog.find((e) => e.date === today && e.checklistType === 'owner-start');
  const morningLogComplete = morningLogEntry && morningLogEntry.completedItems === morningLogEntry.totalItems;
  const morningComplete = morningItemsComplete || morningLogComplete;

  // Initialize or load dashboard
  const getDashboard = useCallback(() => {
    if (!executionDashboard || executionDashboard.date !== today) {
      const keepOutcomes =
        executionDashboard && isSameWeek(executionDashboard.date, today)
          ? executionDashboard.weeklyOutcomes
          : null;
      const keepTimeBlocks = executionDashboard?.timeBlocks || null;
      const fresh = createFreshDay(today, keepOutcomes, keepTimeBlocks);
      setExecutionDashboard(fresh);
      return fresh;
    }
    return executionDashboard;
  }, [executionDashboard, today, setExecutionDashboard]);

  const dash = getDashboard();

  const update = (patch) => {
    setExecutionDashboard({ ...dash, ...patch });
  };

  // Parking Lot
  const [newParkingItem, setNewParkingItem] = useState('');

  const addParkingItem = () => {
    const text = newParkingItem.trim();
    if (!text) return;
    update({ parkingLot: [...dash.parkingLot, { id: genId(), text }] });
    setNewParkingItem('');
  };

  // Roll to Tomorrow
  const handleRollToTomorrow = (journal, tomorrowWins) => {
    // Save journal to endOfDay before archiving
    const archived = { ...dash, endOfDay: { ...dash.endOfDay, doneToday: journal || '' } };
    setExecutionHistory([...(executionHistory || []), archived]);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const keepOutcomes = isSameWeek(dash.date, tomorrowStr) ? dash.weeklyOutcomes : null;

    const newDay = createFreshDay(tomorrowStr, keepOutcomes, dash.timeBlocks);

    // Pre-fill tomorrow's goals from wrap-up
    if (tomorrowWins) {
      newDay.todaysWins = tomorrowWins;
    }

    setExecutionDashboard(newDay);
    setWrappingUp(false);
  };

  // Progress
  const blocksTouched = CATEGORIES.filter(
    (c) => dash.todaysWins[c.key]?.text || dash.todaysWins[c.key]?.done
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
        onClose={() => setWrappingUp(false)}
        onUpdateParking={(items) => update({ parkingLot: items })}
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
        <div className="flex-1 min-w-0 mr-3">
          <p className="text-xs text-secondary italic leading-relaxed">"{weeklyQuote.text}" <span className="not-italic text-muted">— {weeklyQuote.ref}</span></p>
        </div>
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
              <div key={cat.key} className={`rounded-xl border ${cat.border} ${cat.bg} p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${cat.color}`}>{cat.label}</span>
                    <span className="text-xs text-muted">{formatTime(sched.start)}–{formatTime(sched.end)}</span>
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
                <input
                  type="text"
                  value={win.text}
                  onChange={(e) => {
                    update({
                      todaysWins: {
                        ...dash.todaysWins,
                        [cat.key]: { ...win, text: e.target.value },
                      },
                    });
                  }}
                  placeholder={`Today's ${cat.label.toLowerCase()} goal...`}
                  className={`w-full bg-transparent text-sm outline-none text-primary placeholder:text-muted ${
                    win.done ? 'line-through text-muted' : ''
                  }`}
                />
              </div>
            );
          })}
          {/* Ops — static info block */}
          <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-orange-600 dark:text-orange-400">Ops</span>
              <span className="text-xs text-muted">4p–6p</span>
            </div>
            <p className="text-sm text-muted">End of day checklist, editing vids, sending quotes, etc.</p>
          </div>
        </div>
      </section>

      {/* ─── Parking Lot (quick add — full review at wrap-up) ─── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
          Parking Lot
          {dash.parkingLot.length > 0 && (
            <span className="ml-2 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-bold">
              {dash.parkingLot.length}
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newParkingItem}
            onChange={(e) => setNewParkingItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addParkingItem()}
            placeholder="Jot something down for later..."
            className="flex-1 bg-card border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-primary outline-none placeholder:text-muted focus:ring-1 focus:ring-brand"
          />
          <button
            onClick={addParkingItem}
            disabled={!newParkingItem.trim()}
            className="px-3 py-2.5 rounded-xl bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
          </button>
        </div>
        {dash.parkingLot.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {dash.parkingLot.map((item) => (
              <span key={item.id} className="inline-flex items-center gap-1 text-xs bg-surface-alt border border-border-subtle rounded-lg px-2.5 py-1 text-secondary">
                {item.text}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ─── Wrap Up Day Button ─── */}
      <button
        onClick={() => setWrappingUp(true)}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-border-strong text-secondary text-sm font-semibold hover:bg-surface-alt hover:border-brand transition-all cursor-pointer"
      >
        <Moon size={18} />
        Wrap Up My Day
      </button>

      {/* ─── Reset Day (testing) ─── */}
      <button
        onClick={() => {
          if (!confirm('Reset everything for today? (checklists, goals, parking lot)')) return;
          setOwnerStartChecklist((prev) => prev.map((i) => ({ ...i, done: false })));
          setOwnerEndChecklist((prev) => prev.map((i) => ({ ...i, done: false })));
          setExecutionDashboard(createFreshDay(today, dash.weeklyOutcomes, dash.timeBlocks));
          setMorningDismissed(false);
        }}
        className="w-full text-center text-[11px] text-muted/50 hover:text-red-400 transition-colors cursor-pointer py-2"
      >
        Reset Day (testing)
      </button>
    </div>
  );
}
