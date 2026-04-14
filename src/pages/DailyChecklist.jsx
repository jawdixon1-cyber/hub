import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Check, ChevronRight, ChevronDown, RotateCcw, Pencil, Plus, Trash2, GripVertical, X, ExternalLink, StickyNote, Link2, Type, Clock, Target, Circle, CircleCheck, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';
import { genId } from '../data';
import { getTodayInTimezone, getTimezone } from '../utils/timezone';
import renderLinkedText from '../utils/renderLinkedText';
import QuickLinks from '../components/QuickLinks';

const ChecklistEditorModal = lazy(() => import('../components/ChecklistEditorModal'));

/* ─── Day filtering ─── */

const DAY_NAMES_TOP = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isItemForToday(item) {
  if (!item.days || item.days.length === 0) return true;
  const today = DAY_NAMES_TOP[new Date().getDay()];
  return item.days.includes(today);
}

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
  const checkableItems = items.filter((i) => i.type !== 'header' && isItemForToday(i));
  const completedCount = checkableItems.filter((i) => i.done).length;
  const logDebounce = useRef(null);
  useEffect(() => {
    if (!checklistType || !setChecklistLog || checkableItems.length === 0) return;
    if (logDebounce.current) clearTimeout(logDebounce.current);
    logDebounce.current = setTimeout(() => {
      const today = getTodayInTimezone();
      setChecklistLog((prev) => {
        const existing = prev.findIndex((e) => e.date === today && e.checklistType === checklistType);
        const entry = { id: existing >= 0 ? prev[existing].id : genId(), date: today, checklistType, totalItems: checkableItems.length, completedItems: completedCount, updatedAt: new Date().toISOString() };
        if (existing >= 0) { const updated = [...prev]; updated[existing] = entry; return updated; }
        return [...prev, entry];
      });
    }, 800);
    return () => { if (logDebounce.current) clearTimeout(logDebounce.current); };
  }, [completedCount, checklistType, setChecklistLog, checkableItems.length]);
  return { checkableItems, completedCount };
}

/* ─── Dashboard Widget Storage ─── */

const WIDGETS_KEY = 'greenteam-dashboard-widgets';

function loadWidgets() {
  try { const raw = localStorage.getItem(WIDGETS_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveWidgets(widgets) {
  try { localStorage.setItem(WIDGETS_KEY, JSON.stringify(widgets)); } catch {}
}

/* ─── Big Moves Storage ─── */

const BIG_MOVES_KEY = 'greenteam-big-moves';

function loadBigMoves() {
  try { const raw = localStorage.getItem(BIG_MOVES_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveBigMoves(moves) {
  try { localStorage.setItem(BIG_MOVES_KEY, JSON.stringify(moves)); } catch {}
}

const PRIORITY_ORDER = { urgent: 0, important: 1, someday: 2 };
const PRIORITY_COLORS = {
  urgent: 'bg-red-500',
  important: 'bg-amber-500',
  someday: 'bg-blue-500',
};
const PRIORITY_LABELS = { urgent: 'Urgent', important: 'Important', someday: 'Someday' };

function sortBigMoves(moves) {
  const active = moves.filter((m) => !m.done);
  const done = moves.filter((m) => m.done);
  active.sort((a, b) => (PRIORITY_ORDER[a.priority] || 2) - (PRIORITY_ORDER[b.priority] || 2));
  done.sort((a, b) => (PRIORITY_ORDER[a.priority] || 2) - (PRIORITY_ORDER[b.priority] || 2));
  return [...active, ...done];
}

function formatDueDate(dateStr) {
  if (!dateStr) return null;
  const today = getTodayInTimezone();
  if (dateStr < today) return { text: 'Overdue', overdue: true };
  const d = new Date(dateStr + 'T12:00:00');
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { text: `Due ${label}`, overdue: false };
}

/* ─── Big Move Item (outside main component) ─── */

function BigMoveItem({ item, onToggle, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const titleRef = useRef(null);

  useEffect(() => {
    if (editingTitle && titleRef.current) titleRef.current.focus();
  }, [editingTitle]);

  const due = formatDueDate(item.dueDate);

  const handleTitleSave = () => {
    if (titleDraft.trim()) onUpdate({ ...item, title: titleDraft.trim() });
    setEditingTitle(false);
  };

  return (
    <div className={`bg-card rounded-xl border border-border-subtle overflow-hidden ${item.done ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3 px-3 py-3">
        {/* Check button */}
        <button
          onClick={() => onToggle(item.id)}
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
            item.done ? 'border-brand bg-brand' : 'border-border-strong hover:border-brand'
          }`}
        >
          {item.done && <Check size={12} className="text-on-brand" />}
        </button>

        {/* Priority dot */}
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.someday}`} />

        {/* Title */}
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              ref={titleRef}
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') { setTitleDraft(item.title); setEditingTitle(false); } }}
              className="w-full text-sm text-primary bg-transparent outline-none border-b border-brand"
            />
          ) : (
            <p
              onClick={() => { if (!item.done) setEditingTitle(true); }}
              className={`text-sm text-primary truncate ${item.done ? 'line-through' : 'cursor-pointer'}`}
            >
              {item.title}
            </p>
          )}
          {due && (
            <p className={`text-[10px] mt-0.5 ${due.overdue ? 'text-red-500 font-bold' : 'text-muted'}`}>
              {due.text}
            </p>
          )}
        </div>

        {/* Expand / collapse for notes */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 text-muted hover:text-secondary cursor-pointer shrink-0"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border-subtle/50">
          <textarea
            value={item.notes || ''}
            onChange={(e) => onUpdate({ ...item, notes: e.target.value })}
            placeholder="Add notes..."
            className="w-full text-xs text-secondary bg-transparent outline-none resize-none min-h-[40px] mt-2"
          />
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-muted">Due:</label>
            <input
              type="date"
              value={item.dueDate || ''}
              onChange={(e) => onUpdate({ ...item, dueDate: e.target.value || null })}
              className="text-[10px] text-secondary bg-transparent outline-none border border-border-subtle rounded px-1.5 py-0.5"
            />
            <div className="flex-1" />
            <button
              onClick={() => onDelete(item.id)}
              className="p-1 text-muted hover:text-red-500 cursor-pointer"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Add Big Move Form (outside main component) ─── */

function AddBigMoveForm({ onAdd, onCancel }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('important');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const titleRef = useRef(null);

  useEffect(() => { if (titleRef.current) titleRef.current.focus(); }, []);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({
      id: genId(),
      title: title.trim(),
      priority,
      dueDate: dueDate || null,
      notes: notes.trim() || null,
      done: false,
      createdAt: new Date().toISOString(),
    });
    setTitle('');
    setPriority('important');
    setDueDate('');
    setNotes('');
  };

  return (
    <div className="bg-card rounded-xl border border-brand/50 p-3 space-y-3">
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel(); }}
        placeholder="What's the big move?"
        className="w-full text-sm text-primary bg-transparent outline-none"
      />

      {/* Priority selector */}
      <div className="flex gap-2">
        {(['urgent', 'important', 'someday']).map((p) => (
          <button
            key={p}
            onClick={() => setPriority(p)}
            className={`px-3 py-1 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
              priority === p
                ? p === 'urgent' ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50'
                  : p === 'important' ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50'
                  : 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                : 'bg-surface-alt text-muted hover:text-secondary'
            }`}
          >
            {PRIORITY_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-[10px] text-secondary bg-transparent outline-none border border-border-subtle rounded px-1.5 py-0.5"
        />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="flex-1 text-xs text-secondary bg-transparent outline-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          className="px-4 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold cursor-pointer hover:bg-brand-hover"
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg text-xs text-muted hover:text-secondary cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── Big Moves Widget (outside main component) ─── */

function BigMoves({ moves, setMoves }) {
  const [showAdd, setShowAdd] = useState(false);

  const sorted = useMemo(() => sortBigMoves(moves), [moves]);

  const handleToggle = useCallback((id) => {
    setMoves((prev) => prev.map((m) => m.id === id ? { ...m, done: !m.done } : m));
  }, [setMoves]);

  const handleUpdate = useCallback((updated) => {
    setMoves((prev) => prev.map((m) => m.id === updated.id ? updated : m));
  }, [setMoves]);

  const handleDelete = useCallback((id) => {
    setMoves((prev) => prev.filter((m) => m.id !== id));
  }, [setMoves]);

  const handleAdd = useCallback((item) => {
    setMoves((prev) => [...prev, item]);
    setShowAdd(false);
  }, [setMoves]);

  if (sorted.length === 0 && !showAdd) {
    return (
      <div className="bg-card rounded-2xl border border-border-subtle p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target size={14} className="text-brand-text" />
            <p className="text-sm font-bold text-primary">Big Moves</p>
          </div>
        </div>
        <p className="text-xs text-muted mb-3">No big moves yet. What are you working toward?</p>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold cursor-pointer hover:bg-brand-hover"
        >
          <Plus size={12} /> Add
        </button>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border-subtle p-4 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-brand-text" />
          <p className="text-sm font-bold text-primary">Big Moves</p>
        </div>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="p-1 text-muted hover:text-brand-text cursor-pointer"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {sorted.map((item) => (
        <BigMoveItem
          key={item.id}
          item={item}
          onToggle={handleToggle}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      ))}

      {showAdd && <AddBigMoveForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />}
    </div>
  );
}

/* ─── Team Activity Widget (outside main component) ─── */

function TeamActivity() {
  const presence = useAppStore((s) => s.presence);
  const permissions = useAppStore((s) => s.permissions);
  const [authUsers, setAuthUsers] = useState([]);

  // Fetch auth users for last login fallback
  useEffect(() => {
    fetch('/api/team-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) })
      .then((r) => r.json()).then((d) => { if (d.users) setAuthUsers(d.users); }).catch(() => {});
  }, []);

  const members = Object.entries(permissions || {}).map(([email, data]) => {
    const p = (presence || {})[email];
    const auth = authUsers.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    const isOnline = p?.status === 'online' && p?.lastSeen && (Date.now() - new Date(p.lastSeen).getTime()) < 300000;
    return { email, name: data.name, isOnline, lastSeen: p?.lastSeen, sessionStart: p?.sessionStart, lastLogin: auth?.lastSignIn };
  });

  members.sort((a, b) => {
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    return (b.lastSeen || b.lastLogin || '').localeCompare(a.lastSeen || a.lastLogin || '');
  });

  if (members.length === 0) return null;

  const fmtDateTime = (iso) => {
    if (!iso) return null;
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const fmtDuration = (startIso) => {
    if (!startIso) return '';
    const mins = Math.round((Date.now() - new Date(startIso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rm = mins % 60;
    return rm > 0 ? `${hrs}h ${rm}m` : `${hrs}h`;
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="bg-card rounded-2xl border border-border-subtle p-4">
      <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Team</p>
      <div className="space-y-2.5">
        {members.map((m) => (
          <div key={m.email} className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold bg-brand-light text-brand-text-strong">
                {getInitials(m.name)}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${m.isOnline ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary truncate">{m.name}</p>
              {m.isOnline ? (
                <p className="text-[10px] text-emerald-500 font-semibold">
                  Active now · {fmtDuration(m.sessionStart)} {m.sessionStart ? `(since ${fmtDateTime(m.sessionStart)})` : ''}
                </p>
              ) : (
                <p className="text-[10px] text-muted">
                  {fmtDateTime(m.lastSeen) ? `Last active: ${fmtDateTime(m.lastSeen)}` : fmtDateTime(m.lastLogin) ? `Last login: ${fmtDateTime(m.lastLogin)}` : 'No activity yet'}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Today's Schedule Widget (outside main component) ─── */

function TodaySchedule() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const today = getTodayInTimezone();
    fetch(`/api/jobber-data?action=labor&start=${today}&end=${today}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch schedule');
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const dayData = data[today];
        if (dayData && dayData.visits) {
          const sorted = [...dayData.visits].sort((a, b) => {
            const aTime = a.startAt || '';
            const bTime = b.startAt || '';
            return aTime.localeCompare(bTime);
          });
          setVisits(sorted);
        } else {
          setVisits([]);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('TodaySchedule fetch error:', err);
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: getTimezone() });
    } catch {
      return '';
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-2xl border border-border-subtle p-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={14} className="text-brand-text" />
          <p className="text-sm font-bold text-primary">Today's Schedule</p>
        </div>
        <p className="text-xs text-muted">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-2xl border border-border-subtle p-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={14} className="text-brand-text" />
          <p className="text-sm font-bold text-primary">Today's Schedule</p>
        </div>
        <p className="text-xs text-red-500">Could not load schedule</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border-subtle p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={14} className="text-brand-text" />
        <p className="text-sm font-bold text-primary">Today's Schedule</p>
        <span className="text-[10px] text-muted ml-auto">{visits.length} visit{visits.length !== 1 ? 's' : ''}</span>
      </div>

      {visits.length === 0 ? (
        <p className="text-xs text-muted">No visits scheduled</p>
      ) : (
        <div className="space-y-1.5">
          {visits.map((v) => (
            <div key={v.id} className="flex items-center gap-3 py-1.5">
              <span className="text-[11px] font-mono text-muted w-16 shrink-0 text-right">
                {formatTime(v.startAt || v.completedAt)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-primary truncate">{v.client || 'Unknown'}</p>
                {v.title && <p className="text-[10px] text-muted truncate">{v.title}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Checklist Flow (modal overlay) ─── */

function ChecklistFlow({ items, setItems, onClose, title, onEdit, userName }) {
  const isForToday = isItemForToday;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (userName || '').split(' ')[0] || '';
  const [started, setStarted] = useState(true);
  const [dismissing, setDismissing] = useState(new Set());

  const groups = useMemo(() => {
    const result = []; let cur = null;
    for (const item of items) {
      if (item.type === 'header') { if (cur) result.push(cur); cur = { header: item.text, items: [] }; }
      else if (cur && isForToday(item)) cur.items.push(item);
      else if (isForToday(item)) { if (!result.length || result[result.length - 1].header !== null) result.push({ header: null, items: [] }); result[result.length - 1].items.push(item); }
    }
    if (cur) result.push(cur);
    // Remove empty groups (header with no items for today)
    return result.filter((g) => g.items.length > 0 || !g.header);
  }, [items]);

  const checkable = items.filter((i) => i.type !== 'header' && isForToday(i));
  const done = checkable.filter((i) => i.done).length;
  const allDone = checkable.length > 0 && done === checkable.length;

  const handleToggle = useCallback((itemId) => {
    const item = items.find((i) => i.id === itemId);
    if (item?.done) { setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, done: false } : i))); return; }
    setDismissing((prev) => new Set(prev).add(itemId));
    setTimeout(() => {
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, done: true } : i)));
      setDismissing((prev) => { const next = new Set(prev); next.delete(itemId); return next; });
    }, 350);
  }, [items, setItems]);

  if (!started) {
    return (
      <div className="min-h-[calc(100svh-80px)] bg-surface flex flex-col items-center justify-center">
        <div className="text-center space-y-6 px-8">
          <p className="text-3xl font-black text-primary">{greeting}{firstName ? `, ${firstName}` : ''}</p>
          <p className="text-base text-muted">{title === 'Start Day' ? "Let's get today started." : "Time to wrap up the day."}</p>
          <button onClick={() => setStarted(true)}
            className="px-10 py-4 rounded-2xl bg-brand text-on-brand font-black text-lg cursor-pointer hover:bg-brand-hover transition-all active:scale-[0.97]">
            Open
          </button>
          <div>
            <button onClick={onClose} className="text-xs text-muted hover:text-secondary cursor-pointer mt-4">Skip for now</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100svh-80px)] bg-surface">
      <div className="h-full flex flex-col max-w-lg mx-auto">
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-muted hover:text-primary hover:bg-surface-alt cursor-pointer">
            <ChevronLeft size={16} /> Back
          </button>
          <span className={`text-xs font-semibold ${allDone ? 'text-emerald-500' : done > 0 ? 'text-amber-500' : 'text-muted'}`}>{done} of {checkable.length} complete</span>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="p-2 rounded-xl text-muted hover:text-secondary hover:bg-surface-alt cursor-pointer"><Pencil size={16} /></button>
            <button onClick={() => setItems((prev) => prev.map((i) => (i.type === 'header' ? i : { ...i, done: false })))} className="p-2 rounded-xl text-muted hover:text-secondary hover:bg-surface-alt cursor-pointer"><RotateCcw size={16} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-5">
          {allDone && (
            <div className="text-center py-8">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-brand-light text-brand-text-strong font-semibold text-sm">
                <Check size={18} /> All done
              </div>
            </div>
          )}

          {groups.map((group, gi) => (
            <div key={gi}>
              {group.header && <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted mb-2">{group.header}</h2>}
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.id} onClick={() => handleToggle(item.id)}
                    className={`relative overflow-hidden rounded-xl px-4 py-3.5 select-none cursor-pointer border transition-all duration-300 ease-out active:scale-[0.98] ${
                      item.done
                        ? 'bg-brand-light/10 border-brand/20'
                        : 'bg-card border-border-subtle hover:bg-surface-alt'
                    } ${dismissing.has(item.id) ? 'opacity-60 scale-95' : 'opacity-100'}`}
                    role="button" tabIndex={0}>
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        item.done ? 'bg-brand border-brand' : 'border-border-strong'
                      }`}>
                        {(item.done || dismissing.has(item.id)) && <Check size={14} className="text-on-brand" />}
                      </div>
                      <span className={`text-sm flex-1 transition-colors ${item.done ? 'text-muted line-through' : 'text-primary'}`}>
                        {renderLinkedText(item.text)}<QuickLinks links={item.links} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Widget Components ─── */

function NoteWidget({ widget, onUpdate, onDelete, editing }) {
  return (
    <div className="bg-card rounded-2xl border border-border-subtle p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        {editing ? (
          <input type="text" value={widget.title || ''} onChange={(e) => onUpdate({ ...widget, title: e.target.value })} placeholder="Title..."
            className="text-sm font-bold text-primary bg-transparent outline-none flex-1" />
        ) : (
          <p className="text-sm font-bold text-primary">{widget.title || 'Note'}</p>
        )}
        {editing && <button onClick={onDelete} className="p-1 text-muted hover:text-red-500 cursor-pointer shrink-0"><Trash2 size={14} /></button>}
      </div>
      {editing ? (
        <textarea value={widget.content || ''} onChange={(e) => onUpdate({ ...widget, content: e.target.value })} placeholder="Write something..."
          className="w-full text-sm text-secondary bg-transparent outline-none resize-none min-h-[60px]" />
      ) : (
        <p className="text-sm text-secondary whitespace-pre-wrap">{widget.content || ''}</p>
      )}
    </div>
  );
}

function LinkWidget({ widget, onUpdate, onDelete, editing }) {
  return (
    <div className="bg-card rounded-2xl border border-border-subtle overflow-hidden">
      {editing ? (
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <input type="text" value={widget.label || ''} onChange={(e) => onUpdate({ ...widget, label: e.target.value })} placeholder="Label..."
              className="text-sm font-bold text-primary bg-transparent outline-none flex-1" />
            <button onClick={onDelete} className="p-1 text-muted hover:text-red-500 cursor-pointer shrink-0"><Trash2 size={14} /></button>
          </div>
          <input type="text" value={widget.url || ''} onChange={(e) => onUpdate({ ...widget, url: e.target.value })} placeholder="https://..."
            className="w-full text-xs text-muted bg-transparent outline-none" />
        </div>
      ) : (
        <a href={widget.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt transition-colors">
          <ExternalLink size={16} className="text-brand-text shrink-0" />
          <span className="text-sm font-semibold text-primary">{widget.label || widget.url || 'Link'}</span>
        </a>
      )}
    </div>
  );
}

function HeadingWidget({ widget, onUpdate, onDelete, editing }) {
  return editing ? (
    <div className="flex items-center gap-2">
      <input type="text" value={widget.text || ''} onChange={(e) => onUpdate({ ...widget, text: e.target.value })} placeholder="Section title..."
        className="text-[11px] font-bold text-muted uppercase tracking-widest bg-transparent outline-none flex-1" />
      <button onClick={onDelete} className="p-1 text-muted hover:text-red-500 cursor-pointer shrink-0"><Trash2 size={14} /></button>
    </div>
  ) : (
    <p className="text-[11px] font-bold text-muted uppercase tracking-widest">{widget.text || ''}</p>
  );
}

/* ─── Growth Goals ─── */

function fmt$(n) { return n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${Math.round(n)}`; }

function OwnerDashboard() {
  const CLIENT_GOAL = 200;
  const [data, setData] = useState(null);
  const [labor, setLabor] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);

  const loadDashboard = useCallback(() => {
    setDashLoading(true);
    const today = getTodayInTimezone();
    const yearStart = today.slice(0, 4) + '-01-01';
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyStr = thirtyDaysAgo.toISOString().split('T')[0];

    // Single commander call (cached server-side for 5 min), then ytd revenue
    (async () => {
      const yearData = await fetch(`/api/commander/summary?start=${yearStart}&end=${today}`).then(r => r.ok ? r.json() : null).catch(() => null);
      const ytd = await fetch('/api/jobber-data?action=ytd-revenue').then(r => r.ok ? r.json() : null).catch(() => null);
      return [yearData, yearData, ytd, null];
    })().then(([yearData, thirtyData, ytd, laborData]) => {
      const sent = thirtyData?.kpis?.quotesSent || 0;
      const approved = thirtyData?.kpis?.quotesApproved || 0;
      setData({
        clients: yearData?.activeRecurringCount || 0,
        newLeads: thirtyData?.kpis?.newLeads || 0,
        quotesSent: sent,
        quotesApproved: approved,
        closeRate: sent > 0 ? Math.round((approved / sent) * 100) : 0,
        recurringStarts: thirtyData?.kpis?.recurringStarts || 0,
        monthlyRevAdd: thirtyData?.kpis?.startsMonthlyRevenue || 0,
        ytdRevenue: ytd?.ytdRevenue || 0,
        jobCount: ytd?.jobCount || 0,
        monthlyRecurringRevenue: yearData?.monthlyRecurringRevenue || 0,
      });

      // Compute labor stats from the week
      if (laborData) {
        let totalHrs = 0, jobHrs = 0, generalHrs = 0, totalCost = 0, revenue = 0;
        for (const [, day] of Object.entries(laborData)) {
          if (day?.labor) {
            totalHrs += day.labor.totalHours || 0;
            totalCost += day.labor.totalCost || 0;
            jobHrs += day.labor.jobHours || 0;
            generalHrs += day.labor.generalHours || 0;
          }
          if (day?.revenue) revenue += day.revenue;
        }
        setLabor({
          totalHrs: Math.round(totalHrs * 10) / 10,
          jobHrs: Math.round(jobHrs * 10) / 10,
          generalHrs: Math.round(generalHrs * 10) / 10,
          generalPct: totalHrs > 0 ? Math.round((generalHrs / totalHrs) * 100) : 0,
          laborCost: Math.round(totalCost),
          revenue: Math.round(revenue),
          revPerHour: totalHrs > 0 ? Math.round(revenue / totalHrs) : 0,
          laborPct: revenue > 0 ? Math.round((totalCost / revenue) * 100) : 0,
        });
      }
    }).finally(() => setDashLoading(false));
  }, []);

  // Auto-load on mount
  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const clients = data?.clients || 0;
  const clientPct = Math.min(100, Math.round((clients / CLIENT_GOAL) * 100));

  const monthlyRev = data?.monthlyRecurringRevenue || 0;

  return (
    <div className="space-y-4">
      {/* ── Big stats ── */}
      <div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card rounded-2xl border border-border-subtle p-5 text-center">
            <p className="text-[10px] text-muted font-bold uppercase tracking-wider">YTD Revenue</p>
            <p className="text-3xl font-black text-primary mt-2">{data ? fmt$(data.ytdRevenue) : '--'}</p>
          </div>
          <div className="bg-card rounded-2xl border border-border-subtle p-5 text-center">
            <p className="text-[10px] text-muted font-bold uppercase tracking-wider">Recurring Clients</p>
            <p className="text-3xl font-black text-brand-text mt-2">{data ? clients : '--'} <span className="text-lg text-muted font-bold">/ {CLIENT_GOAL}</span></p>
            {data && monthlyRev > 0 && <p className="text-xs text-brand-text/70 font-bold mt-1">{fmt$(monthlyRev)}/mo</p>}
          </div>
        </div>
      </div>

      {/* ── Sales ── */}
      <div>
        <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2">Sales (Last 30 Days)</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card rounded-xl border border-border-subtle p-3 text-center">
            <p className="text-[9px] text-muted font-bold uppercase">New Leads</p>
            <p className="text-xl font-black text-primary mt-1">{data?.newLeads ?? '--'}</p>
          </div>
          <div className="bg-card rounded-xl border border-border-subtle p-3 text-center">
            <p className="text-[9px] text-muted font-bold uppercase">Quotes Sent</p>
            <p className="text-xl font-black text-primary mt-1">{data?.quotesSent ?? '--'}</p>
          </div>
          <div className="bg-card rounded-xl border border-border-subtle p-3 text-center">
            <p className="text-[9px] text-muted font-bold uppercase">Close Rate</p>
            <p className={`text-xl font-black mt-1 ${(data?.closeRate || 0) >= 50 ? 'text-emerald-500' : (data?.closeRate || 0) >= 30 ? 'text-amber-500' : (data?.closeRate || 0) > 0 ? 'text-red-500' : 'text-muted'}`}>{data?.closeRate != null ? `${data.closeRate}%` : '--'}</p>
          </div>
        </div>
      </div>

    </div>
  );
}

/* ─── Monthly Profit Calendar ─── */

function MonthlyProfit() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const today = getTodayInTimezone();
  const todayDate = new Date(today + 'T12:00:00');
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());
  const [viewYear, setViewYear] = useState(todayDate.getFullYear());

  // Load big moves for calendar dots
  const bigMoves = useMemo(() => loadBigMoves(), []);
  const bigMoveDates = useMemo(() => {
    const map = {};
    for (const m of bigMoves) {
      if (m.dueDate && !m.done) {
        if (!map[m.dueDate]) map[m.dueDate] = [];
        map[m.dueDate].push(m.priority);
      }
    }
    return map;
  }, [bigMoves]);

  // Fetch whole month
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const start = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    const end = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    fetch(`/api/jobber-data?action=labor&start=${start}&end=${end}`)
      .then((r) => r.ok ? r.json() : {})
      .then((d) => { if (!cancelled) { setData(d || {}); setLoading(false); } })
      .catch((e) => { if (!cancelled) { console.error('MonthlyProfit fetch error:', e); setData({}); setLoading(false); } });
    return () => { cancelled = true; };
  }, [viewMonth, viewYear]);

  // Calendar grid
  const firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthName = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Monthly totals
  let monthRevenue = 0, monthLabor = 0, monthExpenses = 0;
  for (const [, day] of Object.entries(data)) {
    monthRevenue += day.revenue || 0;
    monthLabor += (day.labor?.totalCost || 0);
    monthExpenses += (day.expenses?.total || 0);
  }
  const monthProfit = monthRevenue - monthLabor - monthExpenses;

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1); };

  if (loading) return (
    <div className="bg-card rounded-2xl border border-border-subtle p-4 text-center">
      <p className="text-xs text-muted">Loading month...</p>
    </div>
  );

  return (
    <div className="bg-card rounded-2xl border border-border-subtle p-4 space-y-3">
      {/* Month header */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-1 text-muted hover:text-primary cursor-pointer">&larr;</button>
        <p className="text-sm font-bold text-primary">{monthName}</p>
        <button onClick={nextMonth} className="p-1 text-muted hover:text-primary cursor-pointer">&rarr;</button>
      </div>

      {/* Monthly totals */}
      <div className="grid grid-cols-4 gap-2">
        <div className="text-center">
          <p className="text-base font-bold text-primary">${monthRevenue.toFixed(0)}</p>
          <p className="text-[9px] text-muted">Revenue</p>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-primary">${monthLabor.toFixed(0)}</p>
          <p className="text-[9px] text-muted">Labor</p>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-primary">${monthExpenses.toFixed(0)}</p>
          <p className="text-[9px] text-muted">Expenses</p>
        </div>
        <div className="text-center">
          <p className={`text-base font-bold ${monthProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>${monthProfit.toFixed(0)}</p>
          <p className="text-[9px] text-muted">Profit</p>
        </div>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-1">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="text-center text-[9px] font-bold text-muted">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells before first day */}
        {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayData = data[dateStr];
          const rev = dayData?.revenue || 0;
          const lab = dayData?.labor?.totalCost || 0;
          const exp = dayData?.expenses?.total || 0;
          const profit = rev - lab - exp;
          const hasData = rev > 0 || lab > 0 || exp > 0;
          const isToday = dateStr === today;
          const isFuture = dateStr > today;
          const movePriorities = bigMoveDates[dateStr] || [];

          return (
            <div key={day} className={`rounded-lg p-1 text-center min-h-[44px] flex flex-col justify-center ${
              isToday ? 'ring-1 ring-brand' : ''
            } ${
              isFuture ? 'opacity-25' : hasData ? (profit >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10') : ''
            }`}>
              <p className={`text-[10px] ${isToday ? 'font-bold text-brand-text' : isFuture ? 'text-muted/50' : 'text-muted'}`}>{day}</p>
              {hasData && !isFuture && (
                <p className={`text-[9px] font-bold ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  ${Math.abs(profit) >= 1000 ? `${(profit / 1000).toFixed(1)}k` : profit.toFixed(0)}
                </p>
              )}
              {movePriorities.length > 0 && (
                <div className="flex justify-center gap-0.5 mt-0.5">
                  {movePriorities.map((p, idx) => (
                    <span key={idx} className={`w-1.5 h-1.5 rounded-full ${PRIORITY_COLORS[p] || PRIORITY_COLORS.someday}`} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Dashboard ─── */

export default function DailyChecklist() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Store
  const ownerStartChecklist = useAppStore((s) => s.ownerStartChecklist);
  const setOwnerStartChecklist = useAppStore((s) => s.setOwnerStartChecklist);
  const ownerEndChecklist = useAppStore((s) => s.ownerEndChecklist);
  const setOwnerEndChecklist = useAppStore((s) => s.setOwnerEndChecklist);
  const checklistLog = useAppStore((s) => s.checklistLog);
  const setChecklistLog = useAppStore((s) => s.setChecklistLog);

  // Day reset + logging
  useChecklistDay(ownerStartChecklist, setOwnerStartChecklist, 'owner-start');
  useChecklistDay(ownerEndChecklist, setOwnerEndChecklist, 'owner-end');
  const { checkableItems: morningItems, completedCount: morningDone } = useChecklistLog(ownerStartChecklist, 'owner-start', checklistLog, setChecklistLog);
  const { checkableItems: eveningItems, completedCount: eveningDone } = useChecklistLog(ownerEndChecklist, 'owner-end', checklistLog, setChecklistLog);

  const morningAllDone = morningItems.length > 0 && morningDone === morningItems.length;
  const eveningAllDone = eveningItems.length > 0 && eveningDone === eveningItems.length;

  // Checklist flow state
  const [activeFlow, setActiveFlow] = useState(null); // 'morning' | 'evening' | null
  const [showEditor, setShowEditor] = useState(null); // 'morning' | 'evening' | null

  // Auto-trigger: 3 AM EST = Start Day, 5 PM EST = End Day
  // Stays on screen until complete. Skip = temporary (comes back in 2 min)
  const [skippedUntil, setSkippedUntil] = useState({ morning: 0, evening: 0 });

  const autoFlow = (() => {
    const now = new Date();
    const est = new Date(now.toLocaleString('en-US', { timeZone: getTimezone() }));
    const hour = est.getHours();
    const nowMs = Date.now();

    // After 5 PM, evening takes priority (if morning is done)
    if (hour >= 17 && !eveningAllDone && morningAllDone && nowMs > skippedUntil.evening) return 'evening';
    // After 3 AM, show morning
    if (hour >= 3 && !morningAllDone && nowMs > skippedUntil.morning) return 'morning';
    return null;
  })();

  // Re-render every 30s to check time and skip expiry
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // When all done, auto-close after a moment
  useEffect(() => {
    if (activeFlow === 'morning' && morningAllDone) setTimeout(() => setActiveFlow(null), 1200);
    if (activeFlow === 'evening' && eveningAllDone) setTimeout(() => setActiveFlow(null), 1200);
  }, [activeFlow, morningAllDone, eveningAllDone]);

  // Auto-open disabled — owner prefers always-on dashboard.
  // Use the Start Day / End Day buttons to open checklists manually.

  // Skip = dismiss for 2 minutes, then it comes back
  const skipFlow = (type) => {
    setSkippedUntil((prev) => ({ ...prev, [type]: Date.now() + 2 * 60 * 1000 }));
    setActiveFlow(null);
  };

  // Dashboard widgets
  const [widgets, setWidgets] = useState(loadWidgets);
  const [editMode, setEditMode] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  useEffect(() => { saveWidgets(widgets); }, [widgets]);

  const addWidget = (type) => {
    const w = { id: genId(), type };
    if (type === 'note') { w.title = ''; w.content = ''; }
    if (type === 'link') { w.label = ''; w.url = ''; }
    if (type === 'heading') { w.text = ''; }
    setWidgets((prev) => [...prev, w]);
    setShowAddMenu(false);
    setEditMode(true);
  };

  const updateWidget = (id, data) => setWidgets((prev) => prev.map((w) => w.id === id ? data : w));
  const deleteWidget = (id) => setWidgets((prev) => prev.filter((w) => w.id !== id));

  const renderWidget = (w) => {
    switch (w.type) {
      case 'note': return <NoteWidget key={w.id} widget={w} onUpdate={(d) => updateWidget(w.id, d)} onDelete={() => deleteWidget(w.id)} editing={editMode} />;
      case 'link': return <LinkWidget key={w.id} widget={w} onUpdate={(d) => updateWidget(w.id, d)} onDelete={() => deleteWidget(w.id)} editing={editMode} />;
      case 'heading': return <HeadingWidget key={w.id} widget={w} onUpdate={(d) => updateWidget(w.id, d)} onDelete={() => deleteWidget(w.id)} editing={editMode} />;
      default: return null;
    }
  };

  return (
    <div className="pb-12 space-y-4">
      {/* Checklist flow overlays */}
      {activeFlow === 'morning' && (
        <ChecklistFlow items={ownerStartChecklist} setItems={setOwnerStartChecklist} onClose={() => skipFlow('morning')} title="Start Day" onEdit={() => { skipFlow('morning'); setShowEditor('morning'); }} userName={currentUser} />
      )}
      {activeFlow === 'evening' && (
        <ChecklistFlow items={ownerEndChecklist} setItems={setOwnerEndChecklist} onClose={() => skipFlow('evening')} title="End Day" onEdit={() => { skipFlow('evening'); setShowEditor('evening'); }} userName={currentUser} />
      )}

      {/* Checklist editors */}
      {showEditor && (
        <Suspense fallback={null}>
          <ChecklistEditorModal
            onClose={() => setShowEditor(null)}
            items={showEditor === 'morning' ? ownerStartChecklist : ownerEndChecklist}
            setItems={showEditor === 'morning' ? setOwnerStartChecklist : setOwnerEndChecklist}
            title={showEditor === 'morning' ? 'Edit Start Day' : 'Edit End Day'}
          />
        </Suspense>
      )}

      {/* Two-column layout: overview + checklists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left column — overview */}
        <div className="lg:col-span-2">
          <div className="bg-card rounded-2xl border border-border-subtle p-5">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">Overview</p>
            <OwnerDashboard />
          </div>

          {/* Custom widgets */}
          {widgets.length > 0 && (
            <div className="space-y-3 mt-4">
              {widgets.map(renderWidget)}
            </div>
          )}
        </div>

        {/* Right column — checklists */}
        <div>
          <div className="bg-card rounded-2xl border border-border-subtle p-5">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-4">Daily Checklists</p>
            <div className="space-y-3">
              {[
                { key: 'morning', label: 'Start Day', done: morningDone, total: morningItems.length, allDone: morningAllDone },
                { key: 'evening', label: 'End Day', done: eveningDone, total: eveningItems.length, allDone: eveningAllDone },
              ].map((c) => (
                <button key={c.key} onClick={() => setActiveFlow(c.key)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-colors ${
                    c.allDone
                      ? 'bg-emerald-500/15 border-2 border-emerald-500/40'
                      : c.done > 0
                        ? 'bg-amber-500/15 border-2 border-amber-500/40'
                        : 'bg-surface-alt border border-border-subtle hover:bg-surface-strong'
                  }`}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    c.allDone ? 'bg-emerald-500/20' : c.done > 0 ? 'bg-amber-500/20' : 'bg-card'
                  }`}>
                    {c.allDone
                      ? <CircleCheck size={28} className="text-emerald-500" />
                      : <Check size={28} className={c.done > 0 ? 'text-amber-500' : 'text-muted'} />
                    }
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`text-sm font-bold ${c.allDone ? 'text-emerald-500' : 'text-primary'}`}>{c.label}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {c.allDone ? 'Complete' : c.done > 0 ? `${c.done} of ${c.total} done` : `${c.total} items`}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
