import { useEffect, useState, useRef, useMemo, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Sun, Moon, Users, DollarSign, RotateCcw, Pencil, Plus, X, ChevronLeft, ChevronRight, Link2, ExternalLink, Briefcase, Play, Inbox, TrendingUp, TrendingDown, Minus, FileText, Sunrise, Sunset, UsersRound, Crosshair, CreditCard, ArrowRight } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getTodayInTimezone } from '../utils/timezone';
import renderLinkedText from '../utils/renderLinkedText';
import { genId } from '../data';

const ChecklistEditorModal = lazy(() => import('../components/ChecklistEditorModal'));

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const isItemForToday = (item) => !item.days || item.days.length === 0 || item.days.includes(DAY_NAMES[new Date().getDay()]);

function useDayReset(items, setItems, key) {
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    const storageKey = `greenteam-checklist-date-${key}`;
    const reset = () => {
      const saved = localStorage.getItem(storageKey);
      const today = getTodayInTimezone();
      if (saved !== today) {
        const cur = itemsRef.current;
        if (cur.some((i) => i.type !== 'header' && i.done)) setItems(cur.map((i) => ({ ...i, done: false })));
        localStorage.setItem(storageKey, today);
      }
    };
    reset();
    const onVis = () => { if (document.visibilityState === 'visible') reset(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [key, setItems]);
}

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

// Date helpers — pin to local timezone, Sunday-first
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const isoFromDate = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const dateFromIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const dt = dateFromIso(iso); dt.setDate(dt.getDate() + n); return isoFromDate(dt); };

function dayInfo(iso, todayStr) {
  const dt = dateFromIso(iso);
  return {
    iso,
    dayName: SHORT_DAYS[dt.getDay()],
    dayNum: dt.getDate(),
    monthShort: MONTHS[dt.getMonth()],
    monthLong: MONTHS_LONG[dt.getMonth()],
    year: dt.getFullYear(),
    isToday: iso === todayStr,
  };
}

function weekDatesFromIso(anchorIso, todayStr) {
  const dt = dateFromIso(anchorIso);
  const sunday = new Date(dt);
  sunday.setDate(dt.getDate() - dt.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return dayInfo(isoFromDate(d), todayStr);
  });
}

function monthGridFromIso(anchorIso, todayStr) {
  const dt = dateFromIso(anchorIso);
  const first = new Date(dt.getFullYear(), dt.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // back up to Sunday
  // Always render 6 rows of 7 = 42 cells
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { ...dayInfo(isoFromDate(d), todayStr), inMonth: d.getMonth() === dt.getMonth() };
  });
}

const MINE_ONLY_KEY = 'greenteam-visits-mine-only';

function JobberVisitsForDay({ iso, isToday }) {
  const [state, setState] = useState({ loading: true, visits: [], error: null });
  const [mineOnly, setMineOnlyState] = useState(() => {
    if (typeof window === 'undefined') return true;
    const v = localStorage.getItem(MINE_ONLY_KEY);
    return v === null ? true : v === '1';
  });
  const toggleMine = () => {
    setMineOnlyState((prev) => {
      const next = !prev;
      try { localStorage.setItem(MINE_ONLY_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  };
  const myName = getMyName().toLowerCase();

  useEffect(() => {
    let cancel = false;
    setState({ loading: true, visits: [], error: null });
    // Single attempt — Jobber throttles by per-minute cost budget, and aggressive
    // retries make it strictly worse. The server-side cache (60s TTL) handles
    // legitimate repeats; if we throttle, we surface the message and stop.
    fetch(`/api/jobber-data?action=today-visits&date=${iso}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancel) return;
        if (res.ok) {
          setState({ loading: false, visits: Array.isArray(data?.visits) ? data.visits : [], error: null });
        } else {
          setState({ loading: false, visits: [], error: data?.error || `HTTP ${res.status}` });
        }
      })
      .catch((err) => { if (!cancel) setState({ loading: false, visits: [], error: err.message }); });
    return () => { cancel = true; };
  }, [iso]);

  if (state.loading) {
    return (
      <div className="px-3 sm:px-4 pb-3">
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs font-bold text-amber-300/80 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400/60 animate-pulse" />
          Loading visits from Jobber…
        </div>
      </div>
    );
  }

  const filtered = mineOnly
    ? state.visits.filter((v) => (v.assignees || []).some((a) => (a || '').toLowerCase().includes(myName)))
    : state.visits;
  const total = filtered.length;
  const done = filtered.filter((v) => v.completedAt).length;
  const hiddenByFilter = mineOnly ? state.visits.length - filtered.length : 0;

  return (
    <div className="px-3 sm:px-4 pb-3">
      <div
        className="relative overflow-hidden rounded-2xl border border-amber-400/30 p-3 sm:p-4"
        style={{
          background: 'radial-gradient(120% 120% at 0% 0%, rgba(251,191,36,0.14) 0%, rgba(251,191,36,0.02) 60%, transparent 100%), rgba(255,255,255,0.01)',
        }}
      >
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-300 flex items-center justify-center shrink-0">
              <Briefcase size={14} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300 truncate">From Jobber · Schedule</div>
              <div className="text-[10px] font-bold text-muted truncate">{isToday ? 'Today' : iso} · {done}/{total} complete</div>
            </div>
          </div>
          <button
            onClick={toggleMine}
            title={mineOnly ? `Showing only visits assigned to "${getMyName()}"` : 'Showing all visits'}
            className={`shrink-0 px-2.5 h-7 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
              mineOnly
                ? 'bg-amber-400/20 text-amber-200 border border-amber-400/40'
                : 'bg-surface-alt text-muted hover:text-primary border border-card-border'
            }`}
          >
            {mineOnly ? 'Mine' : 'All'}
          </button>
        </div>
        <div className="relative space-y-2">
          {state.error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] font-bold text-red-300">
              Couldn't reach Jobber: {state.error}
            </div>
          )}
          {!state.error && total === 0 && hiddenByFilter > 0 && (
            <div className="rounded-xl border border-card-border bg-card/40 px-3 py-3 text-[11px] font-semibold text-muted text-center">
              No visits assigned to {getMyName()} for {isToday ? 'today' : iso}.
              {' '}<button onClick={toggleMine} className="text-amber-300 hover:text-amber-200 cursor-pointer">Show all {hiddenByFilter}</button>
            </div>
          )}
          {!state.error && state.visits.length === 0 && (
            <div className="rounded-xl border border-card-border bg-card/40 px-3 py-3 text-[11px] font-semibold text-muted text-center">
              No visits scheduled in Jobber for {isToday ? 'today' : iso}.
            </div>
          )}
          {filtered.map((v) => <VisitCard key={v.id} visit={v} />)}
        </div>
      </div>
    </div>
  );
}

// Stored once per browser; user's display name as it appears in Jobber's "assigned to".
// Used to filter the visits panel to "mine only".
const ME_KEY = 'greenteam-myJobberName';
const getMyName = () => (typeof window !== 'undefined' ? localStorage.getItem(ME_KEY) || 'Jude' : 'Jude');
const setMyName = (name) => { try { localStorage.setItem(ME_KEY, name); } catch {} };

function VisitCard({ visit }) {
  const start = visit.startAt ? new Date(visit.startAt) : null;
  const time = start ? start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  const isDone = !!visit.completedAt;
  return (
    <div className={`flex items-stretch gap-3 p-3 rounded-xl border transition-colors ${
      isDone
        ? 'border-emerald-400/25 bg-emerald-500/5'
        : 'border-card-border bg-card/60 hover:bg-card'
    }`}>
      <div className={`shrink-0 w-16 flex flex-col items-end justify-center pr-2 border-r ${
        isDone ? 'border-emerald-400/20' : 'border-card-border'
      }`}>
        <div className={`text-sm font-black leading-tight ${isDone ? 'text-emerald-400 line-through' : 'text-amber-300'}`}>
          {time || '—'}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className={`text-sm font-bold truncate ${isDone ? 'text-muted line-through' : 'text-primary'}`}>
            {visit.clientName || visit.title || 'Untitled visit'}
          </div>
          {isDone && (
            <span className="shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 border border-emerald-400/30">
              Done
            </span>
          )}
        </div>
        {visit.jobNumber && (
          <div className={`text-[11px] font-semibold truncate mt-0.5 ${isDone ? 'text-muted' : 'text-secondary'}`}>
            Job #{visit.jobNumber}
          </div>
        )}
        {visit.assignees && visit.assignees.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {visit.assignees.map((name) => (
              <span key={name} className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                isDone ? 'bg-emerald-400/10 text-emerald-300/70' : 'bg-amber-400/10 text-amber-200 border border-amber-400/20'
              }`}>
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Planner({ todos, setTodos }) {
  const todayStr = useMemo(() => getTodayInTimezone(), []);
  const [view, setView] = useState('day'); // 'day' | 'week' | 'month'
  const [activeDate, setActiveDate] = useState(todayStr);
  const [draft, setDraft] = useState('');

  // Auto-rollover: any unchecked task with a date earlier than today gets pulled into today.
  // Runs once per day per browser (localStorage key) so we don't fight the user's manual moves.
  const todosRef = useRef(todos);
  todosRef.current = todos;
  useEffect(() => {
    const ROLL_KEY = 'greenteam-todos-rollover-date';
    const lastRolled = localStorage.getItem(ROLL_KEY);
    if (lastRolled === todayStr) return;
    const cur = todosRef.current;
    const stale = cur.filter((t) => !t.done && t.date && t.date < todayStr);
    if (stale.length > 0) {
      setTodos(cur.map((t) => (!t.done && t.date && t.date < todayStr ? { ...t, date: todayStr } : t)));
    }
    localStorage.setItem(ROLL_KEY, todayStr);
  }, [todayStr, setTodos]);

  const week = useMemo(() => weekDatesFromIso(activeDate, todayStr), [activeDate, todayStr]);
  const month = useMemo(() => monthGridFromIso(activeDate, todayStr), [activeDate, todayStr]);
  const active = useMemo(() => dayInfo(activeDate, todayStr), [activeDate, todayStr]);

  const navPrev = () => {
    if (view === 'day') setActiveDate(addDays(activeDate, -1));
    else if (view === 'week') setActiveDate(addDays(activeDate, -7));
    else { const dt = dateFromIso(activeDate); dt.setMonth(dt.getMonth() - 1); setActiveDate(isoFromDate(dt)); }
  };
  const navNext = () => {
    if (view === 'day') setActiveDate(addDays(activeDate, 1));
    else if (view === 'week') setActiveDate(addDays(activeDate, 7));
    else { const dt = dateFromIso(activeDate); dt.setMonth(dt.getMonth() + 1); setActiveDate(isoFromDate(dt)); }
  };
  const isOnToday = activeDate === todayStr || (view === 'week' && week.some((d) => d.isToday)) || (view === 'month' && month.some((d) => d.inMonth && d.isToday));

  const headerLabel = (() => {
    if (view === 'day') {
      if (active.isToday) return 'Today';
      if (activeDate === addDays(todayStr, 1)) return 'Tomorrow';
      if (activeDate === addDays(todayStr, -1)) return 'Yesterday';
      return `${active.dayName} · ${active.monthShort} ${active.dayNum}`;
    }
    if (view === 'week') {
      const first = week[0], last = week[6];
      const containsToday = week.some((d) => d.isToday);
      if (containsToday) return 'This week';
      return `${first.monthShort} ${first.dayNum} – ${last.monthShort} ${last.dayNum}`;
    }
    return `${active.monthLong} ${active.year}`;
  })();

  const dayTodos = todos.filter((t) => t.date === activeDate);
  const dayDoneCount = (iso) => todos.filter((t) => t.date === iso && t.done).length;
  const dayTotalCount = (iso) => todos.filter((t) => t.date === iso).length;

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    setTodos([...todos, { id: genId(), date: activeDate, text, done: false }]);
    setDraft('');
  };
  const toggle = (id) => setTodos(todos.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  const remove = (id) => setTodos(todos.filter((t) => t.id !== id));
  const updateText = (id, text) => {
    const trimmed = text.trim();
    if (!trimmed) return remove(id);
    setTodos(todos.map((t) => t.id === id ? { ...t, text: trimmed } : t));
  };
  const updateUrl = (id, url) => {
    const cleaned = (url || '').trim();
    setTodos(todos.map((t) => t.id === id ? { ...t, url: cleaned || null } : t));
  };
  const promptForLink = (t) => {
    const next = window.prompt(t.url ? 'Edit link (clear to remove):' : 'Paste a link URL:', t.url || 'https://');
    if (next === null) return; // cancelled
    let val = next.trim();
    if (val && !/^https?:\/\//i.test(val)) val = 'https://' + val;
    updateUrl(t.id, val);
  };

  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const startEdit = (t) => { setEditingId(t.id); setEditDraft(t.text); };
  const commitEdit = () => { if (editingId) updateText(editingId, editDraft); setEditingId(null); };

  // Drag-and-drop between days
  const [dragId, setDragId] = useState(null);
  const [dragOverIso, setDragOverIso] = useState(null);
  const onDragStart = (e, id) => {
    setDragId(id);
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); } catch {}
  };
  const onDragOverDay = (e, iso) => { e.preventDefault(); if (dragOverIso !== iso) setDragOverIso(iso); };
  const onDragLeaveDay = (iso) => { if (dragOverIso === iso) setDragOverIso(null); };
  const onDropDay = (e, iso) => {
    e.preventDefault();
    if (!dragId) return;
    setTodos(todos.map((t) => t.id === dragId ? { ...t, date: iso } : t));
    setDragId(null);
    setDragOverIso(null);
  };
  const onDragEnd = () => { setDragId(null); setDragOverIso(null); };

  return (
    <div className="rounded-3xl border border-card-border bg-card overflow-hidden"
      style={{ background: 'radial-gradient(120% 110% at 50% 0%, rgba(190,242,100,0.06) 0%, transparent 60%), var(--card-bg, rgb(13,13,13))' }}>
      <div className="px-5 sm:px-6 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-black text-primary tracking-tight truncate">Plan</h2>
          <p className="text-xs font-bold text-secondary mt-0.5 truncate">{headerLabel}</p>
        </div>
        <div className="shrink-0 flex items-center gap-1 flex-wrap">
          {/* View toggle */}
          <div className="flex bg-surface-alt rounded-xl p-1">
            {['day', 'week', 'month'].map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 h-7 rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer transition-colors ${
                  view === v ? 'bg-brand text-on-brand' : 'text-secondary hover:text-primary'
                }`}>
                {v}
              </button>
            ))}
          </div>
          {/* Nav */}
          <button onClick={navPrev} title="Previous"
            className="w-9 h-9 rounded-xl bg-surface-alt hover:bg-card-border text-secondary hover:text-primary cursor-pointer flex items-center justify-center transition-colors">
            <ChevronLeft size={18} />
          </button>
          {!isOnToday && (
            <button onClick={() => setActiveDate(todayStr)} title="Jump to today"
              className="px-3 h-9 rounded-xl bg-surface-alt hover:bg-card-border text-xs font-black text-secondary hover:text-primary cursor-pointer">
              Today
            </button>
          )}
          <button onClick={navNext} title="Next"
            className="w-9 h-9 rounded-xl bg-surface-alt hover:bg-card-border text-secondary hover:text-primary cursor-pointer flex items-center justify-center transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Day view: compact drag strip so you can reschedule without switching views */}
      {view === 'day' && (
        <div className="px-3 sm:px-4 pb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
          {week.map((d) => {
            const total = dayTotalCount(d.iso);
            const done = dayDoneCount(d.iso);
            const allDone = total > 0 && done === total;
            const isActive = d.iso === activeDate;
            const isDropTarget = dragOverIso === d.iso;
            return (
              <button
                key={d.iso}
                onClick={() => setActiveDate(d.iso)}
                onDragOver={(e) => onDragOverDay(e, d.iso)}
                onDragLeave={() => onDragLeaveDay(d.iso)}
                onDrop={(e) => onDropDay(e, d.iso)}
                className={`shrink-0 flex flex-col items-center justify-center min-w-[54px] py-2 rounded-xl border transition-all cursor-pointer ${
                  isDropTarget
                    ? 'bg-brand/30 border-brand scale-110 shadow-[0_0_24px_rgba(190,242,100,0.55)]'
                    : isActive
                      ? 'bg-brand text-on-brand border-brand shadow-[0_0_18px_rgba(190,242,100,0.35)]'
                      : d.isToday
                        ? 'border-brand/40 bg-brand/8 text-primary hover:bg-brand/12'
                        : 'border-card-border bg-surface-alt/60 text-secondary hover:bg-surface-alt'
                }`}
              >
                <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${isActive ? '' : d.isToday ? 'text-brand' : 'text-muted'}`}>
                  {d.dayName}
                </span>
                <span className="text-lg font-black leading-none mt-0.5">{d.dayNum}</span>
                {total > 0 && (
                  <span className={`mt-0.5 text-[9px] font-bold ${isActive ? 'opacity-80' : allDone ? 'text-emerald-400' : 'text-muted'}`}>
                    {done}/{total}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Week view: 7-column kanban with tasks visible per day. Drag tasks between columns. */}
      {view === 'week' && (
        <div className="px-3 sm:px-4 pb-4 flex gap-2 overflow-x-auto no-scrollbar">
          {week.map((d) => {
            const colTodos = todos.filter((t) => t.date === d.iso);
            const total = colTodos.length;
            const done = colTodos.filter((t) => t.done).length;
            const allDone = total > 0 && done === total;
            const isDropTarget = dragOverIso === d.iso;
            return (
              <div
                key={d.iso}
                onDragOver={(e) => onDragOverDay(e, d.iso)}
                onDragLeave={() => onDragLeaveDay(d.iso)}
                onDrop={(e) => onDropDay(e, d.iso)}
                className={`shrink-0 w-[200px] sm:w-[210px] rounded-2xl border transition-all flex flex-col ${
                  isDropTarget
                    ? 'border-brand bg-brand/15 shadow-[0_0_28px_rgba(190,242,100,0.45)]'
                    : d.isToday
                      ? 'border-brand/40 bg-brand/5'
                      : 'border-card-border bg-surface-alt/30'
                }`}
              >
                <button
                  onClick={() => { setActiveDate(d.iso); setView('day'); }}
                  className="px-3 pt-3 pb-2 flex items-center justify-between cursor-pointer hover:bg-surface-alt/40 rounded-t-2xl"
                  title="Open this day"
                >
                  <div className="text-left">
                    <div className={`text-[10px] font-black uppercase tracking-[0.15em] ${d.isToday ? 'text-brand' : 'text-muted'}`}>
                      {d.dayName}
                    </div>
                    <div className={`text-xl font-black leading-none mt-0.5 ${d.isToday ? 'text-brand' : 'text-primary'}`}>{d.dayNum}</div>
                  </div>
                  {total > 0 && (
                    <div className={`text-[10px] font-black ${allDone ? 'text-emerald-400' : 'text-muted'}`}>
                      {done}/{total}
                    </div>
                  )}
                </button>
                <div className="px-2 pb-2 space-y-1.5 min-h-[120px]">
                  {colTodos.length === 0 && (
                    <div className="text-[11px] text-muted text-center py-4 italic">Drop here</div>
                  )}
                  {colTodos.map((t) => {
                    const isDragging = dragId === t.id;
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, t.id)}
                        onDragEnd={onDragEnd}
                        className={`group flex items-start gap-2 rounded-xl px-2.5 py-2 cursor-grab active:cursor-grabbing transition-all ${
                          isDragging ? 'opacity-40 scale-95' : ''
                        } ${t.done ? 'bg-emerald-500/10' : 'bg-card hover:bg-surface-alt border border-card-border'}`}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); toggle(t.id); }}
                          className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 cursor-pointer ${
                            t.done ? 'bg-emerald-400 text-emerald-950' : 'border-2 border-card-border bg-surface-alt'
                          }`}
                        >
                          {t.done && <Check size={10} strokeWidth={4} />}
                        </button>
                        <span className={`flex-1 text-xs font-bold leading-snug break-words ${t.done ? 'text-muted line-through' : 'text-primary'}`}>
                          {t.text}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); remove(t.id); }}
                          className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-500 cursor-pointer shrink-0"
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Month view: calendar grid with task chips you can drag between days */}
      {view === 'month' && (
        <div className="px-3 sm:px-4 pb-4">
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {SHORT_DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-black uppercase tracking-wider text-muted py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {month.map((d) => {
              const cellTodos = todos.filter((t) => t.date === d.iso);
              const total = cellTodos.length;
              const done = cellTodos.filter((t) => t.done).length;
              const allDone = total > 0 && done === total;
              const isDropTarget = dragOverIso === d.iso;
              const visibleChips = cellTodos.slice(0, 3);
              const overflow = total - visibleChips.length;
              return (
                <div
                  key={d.iso}
                  onDragOver={(e) => onDragOverDay(e, d.iso)}
                  onDragLeave={() => onDragLeaveDay(d.iso)}
                  onDrop={(e) => onDropDay(e, d.iso)}
                  className={`relative min-h-[110px] sm:min-h-[120px] flex flex-col rounded-xl border text-sm transition-all overflow-hidden ${
                    isDropTarget
                      ? 'border-brand bg-brand/25 shadow-[0_0_18px_rgba(190,242,100,0.45)]'
                      : !d.inMonth
                        ? 'border-transparent bg-surface-alt/20'
                        : d.isToday
                          ? 'border-brand bg-brand/10 shadow-[0_0_14px_rgba(190,242,100,0.2)]'
                          : 'border-card-border bg-surface-alt/30 hover:bg-surface-alt/50'
                  }`}
                >
                  <button
                    onClick={() => { setActiveDate(d.iso); setView('day'); }}
                    className="flex items-center justify-between px-2 pt-1.5 pb-1 cursor-pointer hover:bg-white/5"
                    title="Open this day"
                  >
                    <span className={`text-sm sm:text-base font-black leading-none ${
                      !d.inMonth ? 'text-muted/40' : d.isToday ? 'text-brand' : 'text-primary'
                    }`}>{d.dayNum}</span>
                    {d.inMonth && total > 0 && (
                      <span className={`text-[9px] font-black ${allDone ? 'text-emerald-400' : 'text-muted'}`}>
                        {done}/{total}
                      </span>
                    )}
                  </button>
                  {d.inMonth && (
                    <div className="px-1 pb-1 space-y-0.5 flex-1 overflow-hidden">
                      {visibleChips.map((t) => {
                        const isDragging = dragId === t.id;
                        return (
                          <div
                            key={t.id}
                            draggable
                            onDragStart={(e) => { e.stopPropagation(); onDragStart(e, t.id); }}
                            onDragEnd={onDragEnd}
                            onClick={(e) => { e.stopPropagation(); toggle(t.id); }}
                            title={t.text}
                            className={`text-[10px] leading-tight font-bold rounded px-1.5 py-0.5 truncate cursor-grab active:cursor-grabbing transition-all ${
                              isDragging ? 'opacity-40' : ''
                            } ${t.done
                                ? 'bg-emerald-500/15 text-emerald-300/80 line-through'
                                : 'bg-card text-primary border border-card-border hover:bg-surface-alt'
                            }`}
                          >
                            {t.text}
                          </div>
                        );
                      })}
                      {overflow > 0 && (
                        <div className="text-[9px] font-bold text-muted px-1.5">+{overflow} more</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Jobber visits scheduled for the active day — read-only overlay */}
      {view === 'day' && <JobberVisitsForDay iso={activeDate} isToday={active.isToday} />}

      {/* Add input — only on day view (week kanban + month grid have their own affordances) */}
      {view === 'day' && (
        <div className="px-5 sm:px-6 pb-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder={`Add a task for ${active.dayName} ${active.monthShort} ${active.dayNum}…`}
            className="flex-1 bg-surface-alt rounded-xl px-4 py-3 text-sm font-semibold text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <button onClick={add} disabled={!draft.trim()}
            className="shrink-0 px-4 rounded-xl bg-brand text-on-brand font-black hover:bg-brand-hover cursor-pointer disabled:opacity-40 inline-flex items-center gap-1">
            <Plus size={16} /> Add
          </button>
        </div>
      )}

      {/* Tasks for active day — only on day view */}
      {view === 'day' && (
      <div className="px-3 sm:px-4 pb-5">
        {dayTodos.length === 0 && (
          <p className="text-sm text-muted text-center py-6">Nothing planned for this day.</p>
        )}
        {dayTodos.map((t) => {
          const isEditing = editingId === t.id;
          const isDragging = dragId === t.id;
          return (
            <div key={t.id}
              draggable={!isEditing}
              onDragStart={(e) => onDragStart(e, t.id)}
              onDragEnd={onDragEnd}
              className={`group flex items-start gap-3 rounded-2xl px-4 py-3 transition-all ${
                isDragging ? 'opacity-40 scale-95' : ''
              } ${t.done ? 'bg-emerald-500/8' : 'hover:bg-surface-alt'} ${isEditing ? '' : 'cursor-grab active:cursor-grabbing'}`}>
              <button onClick={() => toggle(t.id)}
                className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-all ${
                  t.done
                    ? 'bg-emerald-400 text-emerald-950 shadow-[0_0_14px_rgba(52,211,153,0.4)]'
                    : 'border-2 border-card-border bg-surface-alt'
                }`}>
                {t.done && <Check size={14} strokeWidth={3.5} />}
              </button>
              {isEditing ? (
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 bg-surface-alt rounded-lg px-2 py-1 text-base font-bold text-primary focus:outline-none focus:ring-1 focus:ring-brand"
                />
              ) : (
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <span onClick={() => toggle(t.id)} className={`flex-1 text-base font-bold leading-snug cursor-pointer truncate ${t.done ? 'text-muted line-through' : 'text-primary'}`}>
                    {t.text}
                  </span>
                  {t.url && (
                    <a href={t.url} target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-brand hover:text-brand-hover bg-brand/10 hover:bg-brand/15 rounded-lg px-2 py-1"
                      title={t.url}>
                      <ExternalLink size={12} /> Open
                    </a>
                  )}
                </div>
              )}
              <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => promptForLink(t)}
                  className={`cursor-pointer p-1 rounded-lg ${t.url ? 'text-brand hover:text-brand-hover' : 'text-muted hover:text-primary'}`}
                  title={t.url ? 'Edit link' : 'Add link'}>
                  <Link2 size={14} />
                </button>
                <button onClick={() => startEdit(t)}
                  className="text-muted hover:text-primary cursor-pointer p-1 rounded-lg" title="Edit">
                  <Pencil size={14} />
                </button>
                <button onClick={() => remove(t.id)}
                  className="text-muted hover:text-red-500 cursor-pointer p-1 rounded-lg" title="Remove">
                  <X size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtle, accent, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-3xl border border-card-border bg-card p-6 sm:p-8 ${onClick ? 'cursor-pointer transition-transform hover:-translate-y-0.5 hover:border-primary/30' : ''}`}
      style={{
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}>
      <div className="relative flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-2xl bg-surface-alt border border-card-border flex items-center justify-center text-primary">
          <Icon size={22} />
        </div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-tertiary">{label}</p>
      </div>
      <p className="relative text-6xl sm:text-7xl font-black tracking-tight leading-none text-primary">
        {value}
      </p>
      {subtle && <p className="relative mt-3 text-sm text-tertiary font-semibold">{subtle}</p>}
    </div>
  );
}

function RouteGoalBanner({ clients, goal, monthly, loading, onClick }) {
  const current = clients ?? 0;
  const pct = Math.min(100, Math.round((current / goal) * 100));
  const remaining = Math.max(0, goal - current);
  const filled = current >= goal;

  return (
    <div
      onClick={onClick}
      className="relative overflow-hidden rounded-3xl border border-card-border bg-card p-6 sm:p-8 cursor-pointer transition-transform hover:-translate-y-0.5"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <div className="flex items-start justify-between gap-6 flex-wrap mb-5">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-tertiary">Route Progress</p>
          <div className="flex items-baseline gap-3 mt-2">
            <p className="text-6xl sm:text-7xl font-black tracking-tight text-primary leading-none">
              {loading && clients == null ? '—' : current}
            </p>
            <p className="text-2xl sm:text-3xl font-black text-tertiary">/ {goal}</p>
          </div>
          <p className="text-sm font-bold text-tertiary mt-2">
            {filled ? 'Route is full. Time to raise the goal.' : `${remaining} more recurring client${remaining === 1 ? '' : 's'} to fill the route`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-tertiary">Monthly Revenue</p>
          <p className="text-3xl sm:text-4xl font-black text-primary mt-1 leading-none">
            {loading && monthly == null ? '—' : money(monthly || 0)}
          </p>
          <p className="text-xs font-bold text-tertiary mt-1">From recurring</p>
        </div>
      </div>

      <div className="h-3 rounded-full bg-surface-alt overflow-hidden">
        <div
          className={`h-full transition-all duration-700 ${filled ? 'bg-emerald-500' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] font-black uppercase tracking-wider text-tertiary">
        <span>{pct}% filled</span>
        <span>{goal}</span>
      </div>
    </div>
  );
}

function WeekDetailModal({ open, onClose, weekLabel, items, label, showAmount }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-card rounded-3xl border border-card-border max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-card-border">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-tertiary">{label}</p>
            <h2 className="text-xl font-black text-primary mt-0.5">Week of {weekLabel} · {items.length}</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-surface-alt flex items-center justify-center cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-2">
          {items.length === 0 ? (
            <p className="text-sm text-tertiary font-semibold text-center py-8">Nothing this week.</p>
          ) : (
            <ul className="divide-y divide-card-border">
              {items.map((it) => (
                <li key={it.id} className="py-3 px-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-primary truncate">{it.label}</p>
                    {it.sub && <p className="text-xs text-tertiary font-semibold truncate">{it.sub}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {showAmount && it.amount != null && (
                      <p className="font-black text-primary">${Number(it.amount).toLocaleString()}</p>
                    )}
                    {it.when && (
                      <p className="text-[10px] text-tertiary font-bold">
                        {new Date(it.when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function WeeklyHistoryCard({ data, icon: Icon, label, unitSingular, unitPlural, showAmount }) {
  const { weeks, thisWeek, lastWeek, loading, error } = data;
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const [openWeekIdx, setOpenWeekIdx] = useState(null);
  const openWeek = openWeekIdx == null ? null : weeks[openWeekIdx];
  const delta = thisWeek != null && lastWeek != null
    ? (lastWeek === 0 ? (thisWeek > 0 ? 100 : 0) : Math.round(((thisWeek - lastWeek) / lastWeek) * 100))
    : null;
  const DeltaIcon = delta == null ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaColor = delta == null ? 'text-tertiary' : delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-tertiary';
  const totalCount = weeks.reduce((s, w) => s + w.count, 0);
  const totalAmount = weeks.reduce((s, w) => s + (w.amount || 0), 0);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-card-border bg-card p-6 sm:p-8" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-surface-alt border border-card-border flex items-center justify-center text-primary">
            <Icon size={22} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-tertiary">{label}</p>
            <div className="flex items-baseline gap-3 mt-1">
              <p className="text-5xl sm:text-6xl font-black tracking-tight text-primary leading-none">
                {loading && thisWeek == null ? '—' : error && thisWeek == null ? '?' : thisWeek ?? 0}
              </p>
              {delta != null && (
                <span className={`inline-flex items-center gap-1 text-sm font-bold ${deltaColor}`}>
                  <DeltaIcon size={14} />
                  {delta > 0 ? '+' : ''}{delta}% vs last wk
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-tertiary">Past 12 Weeks</p>
          <p className="text-sm font-bold text-tertiary mt-1">
            {totalCount} {totalCount === 1 ? unitSingular : unitPlural}
            {showAmount && totalAmount > 0 ? ` · $${totalAmount.toLocaleString()}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-end gap-1.5 h-32">
          {weeks.length === 0 && (
            <div className="w-full flex items-center justify-center text-sm text-tertiary font-semibold">
              {loading ? 'Loading…' : error ? 'Could not load' : 'No data'}
            </div>
          )}
          {weeks.map((w, i) => {
            const isCurrent = i === weeks.length - 1;
            const h = Math.max(4, Math.round((w.count / max) * 120));
            const tip = `Week of ${w.label}: ${w.count} ${w.count === 1 ? unitSingular : unitPlural}${showAmount && w.amount ? ` ($${w.amount.toLocaleString()})` : ''}`;
            const clickable = (w.items?.length || 0) > 0;
            return (
              <button
                key={i}
                onClick={() => clickable && setOpenWeekIdx(i)}
                disabled={!clickable}
                className={`flex-1 flex flex-col items-center gap-1 group ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className={`text-[10px] font-bold transition-opacity ${w.count > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'} text-tertiary`}>
                  {w.count}
                </span>
                <div
                  className={`w-full rounded-md transition-transform ${isCurrent ? 'bg-primary' : 'bg-surface-alt border border-card-border'} ${clickable ? 'group-hover:scale-105' : ''}`}
                  style={{ height: `${h}px` }}
                  title={tip}
                />
                <span className="text-[9px] font-bold text-tertiary truncate">{w.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <WeekDetailModal
        open={openWeekIdx != null}
        onClose={() => setOpenWeekIdx(null)}
        weekLabel={openWeek?.label}
        items={openWeek?.items || []}
        label={label}
        showAmount={showAmount}
      />
    </div>
  );
}

function ChecklistCard({ kind, title, icon: Icon, items, setItems, completedCount, totalCount, onResetAll, onEdit }) {
  const allDone = totalCount > 0 && completedCount === totalCount;
  const pct = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const toggle = (id) => setItems(items.map((i) => i.id === id ? { ...i, done: !i.done } : i));

  // Render only items that apply to today; preserve headers in-place if they have visible siblings after them.
  const visible = items.filter((i) => i.type === 'header' || isItemForToday(i));

  return (
    <div className="relative overflow-hidden rounded-3xl border border-card-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-black text-primary tracking-tight">{title}</h2>
          <p className="text-xs font-bold text-muted mt-0.5">{completedCount}/{totalCount}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {completedCount > 0 && (
            <button onClick={onResetAll} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-alt cursor-pointer" title="Reset">
              <RotateCcw size={14} />
            </button>
          )}
          <button onClick={onEdit} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-surface-alt cursor-pointer" title="Edit checklist">
            <Pencil size={14} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 sm:px-6">
        <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${allDone ? 'bg-emerald-400' : kind === 'start' ? 'bg-amber-400' : 'bg-indigo-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Compact summary */}
      <div className="px-5 sm:px-6 pb-5 pt-4">
        {allDone ? (
          <div className="rounded-2xl bg-emerald-500/12 border border-emerald-500/30 px-4 py-4 text-center">
            <p className="text-sm font-black text-emerald-300">All done. {kind === 'start' ? 'Get out there.' : 'Lock it up.'}</p>
          </div>
        ) : (
          <Link
            to={`/workflow/${kind}/0`}
            className={`w-full flex items-center justify-between gap-3 rounded-2xl px-5 py-4 cursor-pointer font-black uppercase tracking-wider text-sm ${
              kind === 'start'
                ? 'bg-amber-400 text-amber-950 hover:brightness-110'
                : 'bg-indigo-400 text-indigo-950 hover:brightness-110'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Play size={16} fill="currentColor" /> {completedCount === 0 ? 'Start' : 'Continue'} Workflow
            </span>
            <span className="text-xs font-black opacity-70">{totalCount - completedCount} left</span>
          </Link>
        )}
      </div>
    </div>
  );
}

/* ─── WorkflowRow — top-of-home funnel: Requests → Quotes → Jobs → Invoices ─── */
function WorkflowRow() {
  const navigate = useNavigate();
  const { orgId } = useAuth();
  // Hydrate from localStorage so the numbers show instantly across page loads.
  // First-ever load gets a loading state (`hydrated: false`) instead of "0".
  const WORKFLOW_CACHE_KEY = 'boost-home-workflow-cache';
  const [data, setData] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(WORKFLOW_CACHE_KEY) || 'null');
      if (cached) return { ...cached, hydrated: true };
    } catch { /* ignore */ }
    return {
      requests: { new: 0, assessmentsComplete: 0, overdue: 0 },
      jobs: { active: 0, activeAmount: 0, requiresInvoicing: 0, requiresAmount: 0 },
      hydrated: false,
    };
  });

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const { data: reqs, error: reqErr } = await supabase
        .from('requests')
        .select('id, status, assessment_date, raw_payload')
        .eq('org_id', orgId);
      // Compare as YYYY-MM-DD strings in local time — `new Date("YYYY-MM-DD")` is UTC,
      // which lies in negative-offset timezones (Eastern, etc.).
      const td = new Date();
      const todayYmd = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}-${String(td.getDate()).padStart(2, '0')}`;
      const dateYmd = (s) => (s ? String(s).slice(0, 10) : '');
      const isComplete = (r) => r.raw_payload?.assessment?.completed === true;
      const newCount = (reqs || []).filter(r => r.status === 'new' && !r.assessment_date && !isComplete(r)).length;
      const completeCount = (reqs || []).filter(isComplete).length;
      const overdueCount = (reqs || []).filter(r => r.assessment_date && !isComplete(r) && dateYmd(r.assessment_date) < todayYmd).length;

      const { data: clients } = await supabase.from('clients').select('id').eq('org_id', orgId);
      const clientIds = (clients || []).map(c => c.id);
      let active = 0, activeAmt = 0, reqInv = 0, reqAmt = 0;
      if (clientIds.length > 0) {
        const { data: jobs } = await supabase
          .from('hub_jobs')
          .select('status, total_amount')
          .in('contact_id', clientIds);
        for (const j of jobs || []) {
          if (j.status === 'active') { active++; activeAmt += Number(j.total_amount) || 0; }
          else if (j.status === 'completed') { reqInv++; reqAmt += Number(j.total_amount) || 0; }
        }
      }

      if (cancelled) return;
      const next = {
        requests: { new: newCount, assessmentsComplete: completeCount, overdue: overdueCount },
        jobs: { active, activeAmount: activeAmt, requiresInvoicing: reqInv, requiresAmount: reqAmt },
        hydrated: true,
      };
      setData(next);
      try { localStorage.setItem(WORKFLOW_CACHE_KEY, JSON.stringify(next)); } catch { /* ignore quota */ }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  const fmtMoney = (n) => {
    if (!n) return '$0';
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
    return `$${Math.round(n)}`;
  };

  // Each row's `to` is what /<path>?status=<bucket> link the row jumps to.
  const cards = [
    {
      label: 'Requests',
      icon: Inbox,
      bar: 'bg-amber-500',
      path: '/requests',
      headline: { num: data.requests.new, label: 'New', filter: 'new' },
      rows: [
        { label: 'Assessments complete', value: `(${data.requests.assessmentsComplete})`, filter: 'assessment_complete' },
        { label: 'Overdue', value: `(${data.requests.overdue})`, filter: 'overdue' },
      ],
    },
    {
      label: 'Quotes',
      icon: Crosshair,
      bar: 'bg-rose-500',
      path: '/sales',
      headline: { num: 0, label: 'Approved' },
      rows: [
        { label: 'Draft', value: '(0)' },
        { label: 'Changes requested', value: '(0)' },
      ],
    },
    {
      label: 'Jobs',
      icon: Briefcase,
      bar: 'bg-emerald-500',
      path: '/jobs',
      headline: { num: data.jobs.requiresInvoicing, amount: fmtMoney(data.jobs.requiresAmount), label: 'Requires invoicing' },
      rows: [
        { label: `Active (${data.jobs.active})`, value: fmtMoney(data.jobs.activeAmount) },
        { label: 'Action required', value: '(0)' },
      ],
    },
    {
      label: 'Invoices',
      icon: CreditCard,
      bar: 'bg-sky-500',
      path: '/invoices',
      headline: { num: 0, amount: '$0', label: 'Awaiting payment' },
      rows: [
        { label: 'Draft', value: '(0)' },
        { label: 'Past due', value: '(0)' },
      ],
    },
  ];

  const goTo = (path, filter) => {
    navigate(filter ? `${path}?status=${encodeURIComponent(filter)}` : path);
  };

  return (
    <div>
      <h2 className="text-xs font-black uppercase tracking-[0.18em] text-tertiary mb-3">Workflow</h2>
      {/* Single connected panel — sections share a wrapper, dividers + arrows between */}
      <div className="relative overflow-hidden rounded-xl bg-card border border-border-subtle">
        <div className="flex flex-col lg:flex-row items-stretch">
          {cards.map((c, idx) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="relative flex-1 min-w-0 flex">
                <div className="relative flex-1 min-w-0">
                  <div className={`absolute inset-x-0 top-0 h-1 ${c.bar}`} />
                  <div className="p-4 pt-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon size={14} className="text-muted" />
                      <span className="text-xs font-bold text-muted">{c.label}</span>
                    </div>
                    <button
                      onClick={() => goTo(c.path, c.headline.filter)}
                      className="w-full text-left cursor-pointer rounded-lg p-2 -mx-2 mb-1 border border-transparent hover:border-border-strong hover:bg-surface-alt/40 transition-colors"
                    >
                      <div className="flex items-baseline gap-2 mb-1">
                        {data.hydrated ? (
                          <span className="text-3xl font-black text-primary leading-none">{c.headline.num}</span>
                        ) : (
                          <span className="inline-block h-7 w-10 rounded-md bg-surface-alt animate-pulse" />
                        )}
                        {c.headline.amount && (
                          data.hydrated
                            ? <span className="text-sm font-bold text-secondary">{c.headline.amount}</span>
                            : <span className="inline-block h-4 w-10 rounded-md bg-surface-alt animate-pulse" />
                        )}
                      </div>
                      <p className="text-xs font-semibold text-secondary">{c.headline.label}</p>
                    </button>
                    <div className="space-y-1 border-t border-border-subtle pt-2 mt-2">
                      {c.rows.map((row, i) => (
                        <button
                          key={i}
                          onClick={() => goTo(c.path, row.filter)}
                          className="w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-md border border-transparent hover:border-border-strong hover:bg-surface-alt/40 cursor-pointer transition-colors"
                        >
                          <span className="text-muted">{row.label}</span>
                          <span className="text-secondary tabular-nums">{row.value}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Connector: vertical divider + arrow chip floating over it. Hidden after the last section. */}
                {idx < cards.length - 1 && (
                  <>
                    {/* Divider line — horizontal on mobile, vertical on lg+ */}
                    <div className="hidden lg:block w-px bg-border-subtle" />
                    <div className="block lg:hidden h-px bg-border-subtle" />
                    {/* Arrow chip on top of the divider */}
                    <div className="absolute z-10 left-1/2 lg:left-auto lg:right-0 top-full lg:top-1/2 -translate-x-1/2 lg:translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-card border border-border-subtle flex items-center justify-center">
                      <ArrowRight size={12} className="text-muted rotate-90 lg:rotate-0" />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function OwnerHome() {
  const navigate = useNavigate();
  const ownerStartChecklist = useAppStore((s) => s.ownerStartChecklist);
  const setOwnerStartChecklist = useAppStore((s) => s.setOwnerStartChecklist);
  const ownerEndChecklist = useAppStore((s) => s.ownerEndChecklist);
  const setOwnerEndChecklist = useAppStore((s) => s.setOwnerEndChecklist);
  const ownerTodos = useAppStore((s) => s.ownerTodos) || [];
  const setOwnerTodos = useAppStore((s) => s.setOwnerTodos);

  useDayReset(ownerStartChecklist, setOwnerStartChecklist, 'owner-start');
  useDayReset(ownerEndChecklist, setOwnerEndChecklist, 'owner-end');

  const startCheckable = ownerStartChecklist.filter((i) => i.type !== 'header' && isItemForToday(i));
  const endCheckable = ownerEndChecklist.filter((i) => i.type !== 'header' && isItemForToday(i));
  const startDone = startCheckable.filter((i) => i.done).length;
  const endDone = endCheckable.filter((i) => i.done).length;

  const resetStart = () => setOwnerStartChecklist(ownerStartChecklist.map((i) => ({ ...i, done: false })));
  const resetEnd = () => setOwnerEndChecklist(ownerEndChecklist.map((i) => ({ ...i, done: false })));

  // 'start' | 'end' | null
  const [editing, setEditing] = useState(null);

  // Recurring data — hydrate from localStorage cache on mount so the page is never empty.
  const RECURRING_CACHE_KEY = 'boost-recurring-summary-cache';
  const [recurring, setRecurring] = useState(() => {
    try {
      const cached = localStorage.getItem(RECURRING_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return { clients: parsed.clients, monthly: parsed.monthly, loading: false, error: null };
      }
    } catch { /* ignore parse errors */ }
    return { clients: null, monthly: null, loading: true, error: null };
  });
  const fetchRecurring = () => {
    fetch(`/api/jobber-data?action=recurring-summary&_=${Date.now()}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d) => {
        const lawnMonthly = (d?.lawnJobs || []).reduce((s, j) => s + (j.monthly || 0), 0);
        const clients = (d?.recurringClientList || []).length;
        setRecurring({ clients, monthly: lawnMonthly, loading: false, error: null });
        try { localStorage.setItem(RECURRING_CACHE_KEY, JSON.stringify({ clients, monthly: lawnMonthly })); } catch { /* ignore quota */ }
      })
      .catch((err) => setRecurring((prev) => ({
        clients: prev.clients,
        monthly: prev.monthly,
        loading: false,
        error: prev.clients == null ? err.message : null,
      })));
  };
  // Trigger a fresh sync from Jobber (catches missed webhook updates). Throttled to 1/min.
  const lastSyncRef = useRef(0);
  const triggerSyncAndRefresh = async () => {
    const now = Date.now();
    if (now - lastSyncRef.current < 60_000) {
      fetchRecurring();
      return;
    }
    lastSyncRef.current = now;
    try {
      await fetch(`/api/jobber-data?action=hub-sync&entity=visits&sinceDays=7&untilDays=30&_=${now}`, { cache: 'no-store' });
    } catch { /* ignore — sync is best-effort */ }
    fetchRecurring();
  };
  useEffect(() => {
    triggerSyncAndRefresh();
    const onFocus = () => { if (document.visibilityState === 'visible') triggerSyncAndRefresh(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Generic weekly-history hook — used by Requests and Quotes cards.
  const useWeeklyHistory = (action, cacheKey) => {
    const [state, setState] = useState(() => {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) return { ...JSON.parse(cached), loading: false, error: null };
      } catch { /* ignore */ }
      return { weeks: [], thisWeek: null, lastWeek: 0, loading: true, error: null };
    });
    useEffect(() => {
      fetch(`/api/jobber-data?action=${action}`, { cache: 'no-store' })
        .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then((d) => {
          const next = { weeks: d.weeks || [], thisWeek: d.thisWeek, lastWeek: d.lastWeek };
          setState({ ...next, loading: false, error: null });
          try {
            // Cache without items[] to keep localStorage tiny; items refetch on every load.
            const slim = { ...next, weeks: next.weeks.map(({ items, ...w }) => w) };
            localStorage.setItem(cacheKey, JSON.stringify(slim));
          } catch { /* ignore */ }
        })
        .catch((err) => setState((prev) => ({ ...prev, loading: false, error: prev.weeks.length ? null : err.message })));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return state;
  };
  const requestsData = useWeeklyHistory('requests-history', 'boost-requests-history-cache');
  const quotesData = useWeeklyHistory('quotes-history', 'boost-quotes-history-cache');
  const bookedData = useWeeklyHistory('booked-history', 'boost-booked-history-cache');

  // Route goal — target number of recurring clients to fill the route.
  const ROUTE_GOAL = 100;

  const dailyShortcuts = [
    { label: 'Start of Day', path: '/workflow/start', icon: Sunrise, done: startDone, total: startCheckable.length },
    { label: 'End of Day', path: '/workflow/end', icon: Sunset, done: endDone, total: endCheckable.length },
    { label: 'Team Today', path: '/workflow/team-today', icon: UsersRound, done: null, total: null },
  ];

  return (
    <div className="pb-16 space-y-6 sm:space-y-8">
      {/* Top-of-home Workflow row — Requests → Quotes → Jobs → Invoices */}
      <WorkflowRow />

      {/* Daily workflow shortcuts (moved from sidebar) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {dailyShortcuts.map((s) => {
          const Icon = s.icon;
          const allDone = s.total && s.done === s.total;
          return (
            <button
              key={s.label}
              onClick={() => navigate(s.path)}
              className="flex items-center gap-3 rounded-xl bg-card border border-border-subtle p-4 text-left hover:border-border-strong cursor-pointer transition-colors"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${allDone ? 'bg-emerald-500/15 text-emerald-500' : 'bg-surface-alt text-secondary'}`}>
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-primary">{s.label}</p>
                {s.total != null ? (
                  <p className={`text-[11px] font-semibold ${allDone ? 'text-emerald-500' : 'text-muted'}`}>{s.done}/{s.total} done</p>
                ) : (
                  <p className="text-[11px] text-muted">Team checklist</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Goal: fill the route */}
      <RouteGoalBanner
        clients={recurring.clients}
        goal={ROUTE_GOAL}
        monthly={recurring.monthly}
        loading={recurring.loading}
        onClick={() => navigate('/insights/clients')}
      />

      {/* The Funnel — top to bottom: attention → selling → winning → money */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-black uppercase tracking-[0.18em] text-tertiary">The Funnel — This Week</h2>
          <p className="text-xs font-bold text-tertiary hidden sm:block">Requests → Quotes → Booked</p>
        </div>
        <div className="space-y-4">
          <WeeklyHistoryCard data={requestsData} icon={Inbox}    label="Requests"        unitSingular="request" unitPlural="requests" />
          <WeeklyHistoryCard data={quotesData}   icon={FileText} label="Quotes Sent"     unitSingular="quote"   unitPlural="quotes"   showAmount />
          <WeeklyHistoryCard data={bookedData}   icon={Briefcase} label="New Recurring Clients" unitSingular="client" unitPlural="clients" showAmount />
        </div>
      </div>

      {editing && (
        <Suspense fallback={null}>
          <ChecklistEditorModal
            onClose={() => setEditing(null)}
            items={editing === 'start' ? ownerStartChecklist : ownerEndChecklist}
            setItems={editing === 'start' ? setOwnerStartChecklist : setOwnerEndChecklist}
            title={editing === 'start' ? 'Edit Start of Day' : 'Edit End of Day'}
            kind={editing}
          />
        </Suspense>
      )}
    </div>
  );
}
