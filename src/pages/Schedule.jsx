import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { CalendarInput, TimeInput, TeamAssignDropdown, to12Hour, timeStringTo24 } from './Requests';
import { getTimezone } from '../utils/timezone';
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2, Clock,
  User, ChevronDown, Check, GripVertical, MapPin, Pencil, ExternalLink,
  Archive, FileText,
} from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_COLORS = {
  visit: { bg: 'bg-emerald-600', light: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', text: 'text-emerald-400' },
  'visit-other': { bg: 'bg-purple-600', light: 'bg-purple-500/20 text-purple-300 border-purple-500/30', text: 'text-purple-400' },
  assessment: { bg: 'bg-blue-600', light: 'bg-blue-500/20 text-blue-300 border-blue-500/30', text: 'text-blue-400' },
  task: { bg: 'bg-amber-600', light: 'bg-amber-500/20 text-amber-300 border-amber-500/30', text: 'text-amber-400' },
  event: { bg: 'bg-purple-600', light: 'bg-purple-500/20 text-purple-300 border-purple-500/30', text: 'text-purple-400' },
  reminder: { bg: 'bg-rose-600', light: 'bg-rose-500/20 text-rose-300 border-rose-500/30', text: 'text-rose-400' },
};

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const minutes = Number(d.toLocaleString('en-US', { minute: 'numeric', timeZone: getTimezone() }));
  // Drop the ":00" when it's a whole hour — "6 PM" instead of "6:00 PM".
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    ...(minutes === 0 ? {} : { minute: '2-digit' }),
    hour12: true,
    timeZone: getTimezone(),
  });
}
function ds(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
// Returns the offset (in minutes) the given timezone has from UTC at the given instant.
// Used to turn a (date, wall-clock time) pair into a correct UTC ISO string regardless
// of the browser's local TZ. Positive when TZ is behind UTC (e.g. America/New_York).
function tzOffsetMinutesAt(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (date.getTime() - asUTC) / 60_000;
}
// Build an ISO string for a wall-clock date+time in the given TZ.
function isoFromDateTimeInTz(dateStr, hhmmss, tz) {
  const [Y, M, D] = dateStr.split('-').map(Number);
  const [h, m, s] = (hhmmss || '00:00:00').split(':').map(Number);
  const probe = new Date(Date.UTC(Y, M - 1, D, h, m, s));
  const offset = tzOffsetMinutesAt(probe, tz); // ET → +240
  return new Date(probe.getTime() + offset * 60_000).toISOString();
}

function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const weeks = [];
  let week = [];
  for (let i = 0; i < first.getDay(); i++) {
    const d = new Date(year, month, 1 - first.getDay() + i);
    week.push({ date: d, str: ds(d), inMonth: false });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    const date = new Date(year, month, d);
    week.push({ date, str: ds(date), inMonth: true });
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    let d = 1;
    while (week.length < 7) { const date = new Date(year, month + 1, d++); week.push({ date, str: ds(date), inMonth: false }); }
    weeks.push(week);
  }
  return weeks;
}

/* ─── Multi-select Filter Pill (Jobber style) ─── */
function FilterPill({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const allIds = options.map(o => o.id);
  const allSelected = selected.length === 0 || selected.length === allIds.length;
  const noneSelected = selected.length === 1 && selected[0] === '__clear__';
  const count = noneSelected ? 0 : allSelected ? allIds.length : selected.length;
  const displayValue = noneSelected ? '0' : allSelected ? 'All' : `${selected.length}`;
  const filtered = search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : options;

  const isChecked = (id) => !noneSelected && (allSelected || selected.includes(id));

  const toggle = (id) => {
    if (noneSelected) {
      // Nothing checked → check this one
      onChange([id]);
    } else if (allSelected) {
      // All checked → uncheck one = everything except this
      onChange(allIds.filter(x => x !== id));
    } else if (selected.includes(id)) {
      const next = selected.filter(x => x !== id);
      onChange(next.length === 0 ? ['__clear__'] : next);
    } else {
      const next = [...selected, id];
      onChange(next.length >= allIds.length ? [] : next);
    }
  };
  const handleHeaderBtn = () => onChange(allSelected && !noneSelected ? ['__clear__'] : []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-alt border border-border-subtle text-[11px] font-bold text-primary cursor-pointer hover:border-border-strong">
        {label} <span className="text-muted">|</span> <span className="text-brand-text">{displayValue}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl min-w-[200px] py-1">
          {/* Search */}
          <div className="px-3 py-2 border-b border-border-subtle">
            <input type="text" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-surface-alt border border-border-subtle text-[11px] text-primary placeholder:text-muted focus:outline-none" />
          </div>
          {/* Header */}
          <div className="px-3 py-2 flex items-center justify-between border-b border-border-subtle/50">
            <span className="text-[10px] font-bold text-muted">{count} selected</span>
            <button onClick={handleHeaderBtn} className="text-[10px] font-bold text-brand-text hover:underline cursor-pointer">{allSelected && !noneSelected ? 'Clear' : 'Select All'}</button>
          </div>
          {/* Options */}
          {filtered.map(o => {
            const checked = isChecked(o.id);
            return (
              <button key={o.id} onClick={() => toggle(o.id)}
                className="w-full px-3 py-2 text-left text-[11px] font-medium flex items-center gap-2.5 hover:bg-surface-alt cursor-pointer text-secondary">
                {o.dot && <span className={`w-2.5 h-2.5 rounded-full ${o.dot} shrink-0`} />}
                <span className="flex-1">{o.label}</span>
                {isChecked(o.id) && <Check size={13} className="text-emerald-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Compact Event Card (Jobber style, draggable) ─── */
function EventCard({ item, onClick, isSelected, isDimmed }) {
  const tc = TYPE_COLORS[item.type] || TYPE_COLORS.task;
  const isAssessment = item.type === 'assessment';
  const isComplete = item.status === 'complete';
  const shortTitle = isAssessment
    ? (item.title || '').replace(/^Assessment:\s*/i, '') || 'Assessment'
    : item.title;
  return (
    <button
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={onClick}
      className={`w-full text-left px-1.5 py-1 rounded text-[9px] font-bold leading-tight cursor-grab active:cursor-grabbing transition-all ${tc.bg} text-white ${
        isComplete ? 'line-through decoration-[2.5px] decoration-white opacity-75' : ''
      } ${
        isSelected ? 'ring-2 ring-amber-300 ring-offset-1 ring-offset-card shadow-lg brightness-125 z-10 relative' :
        isDimmed ? 'opacity-30 hover:opacity-60' : 'hover:brightness-125'
      }`}
      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
      {!item.all_day && !item.anytime && <span className="opacity-80 mr-0.5">{formatTime(item.start_at)}</span>}
      {shortTitle}
    </button>
  );
}

/* ─── New Event Modal (Jobber style) ─── */
function NewEventModal({ onClose, onSave, defaultDate, orgId, teamMembers = [] }) {
  const [form, setForm] = useState({
    title: '', type: 'task', date: defaultDate || ds(new Date()),
    start_time: '09:00', anytime: true, notes: '', assigned_to: [],
    client_id: null, client_name: '',
  });
  const [saving, setSaving] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const inputCls = "w-full px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50";

  const TYPE_TABS = [
    { id: 'visit', label: 'Job' },
    { id: 'assessment', label: 'Request' },
    { id: 'task', label: 'Task' },
    { id: 'event', label: 'Event' },
  ];

  // Client search
  const searchClients = async (q) => {
    setClientSearch(q);
    if (!q.trim() || !orgId) { setClientResults([]); return; }
    const { data } = await supabase.from('clients').select('id, first_name, last_name, company_name, billing_street, billing_city')
      .eq('org_id', orgId).or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,company_name.ilike.%${q}%`).limit(6);
    setClientResults(data || []);
    setShowClientDropdown(true);
  };

  const selectClient = (c) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || '';
    set('client_id', c.id);
    set('client_name', name);
    setClientSearch(name);
    setShowClientDropdown(false);
  };

  const toggleAssign = (name) => {
    set('assigned_to', form.assigned_to.includes(name)
      ? form.assigned_to.filter(n => n !== name)
      : [...form.assigned_to, name]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
        {/* Type tabs at top — Jobber style */}
        <div className="flex border-b border-border-subtle">
          {TYPE_TABS.map(t => (
            <button key={t.id} onClick={() => set('type', t.id)}
              className={`flex-1 py-3 text-xs font-bold text-center cursor-pointer transition-colors ${
                form.type === t.id
                  ? 'text-brand border-b-2 border-brand'
                  : 'text-muted hover:text-secondary'
              }`}>{t.label}</button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {/* Status pill */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-muted">Status</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">Active</span>
          </div>

          {/* Client search */}
          <div className="relative">
            <input value={clientSearch} onChange={e => searchClients(e.target.value)}
              placeholder="Search client or address" className={inputCls} />
            {showClientDropdown && clientResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-lg shadow-xl max-h-40 overflow-y-auto">
                {clientResults.map(c => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name;
                  const addr = [c.billing_street, c.billing_city].filter(Boolean).join(', ');
                  return (
                    <button key={c.id} onClick={() => selectClient(c)}
                      className="w-full px-3 py-2 text-left hover:bg-surface-alt cursor-pointer">
                      <p className="text-xs font-semibold text-primary">{name}</p>
                      {addr && <p className="text-[10px] text-muted">{addr}</p>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Title */}
          <input value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="Title" className={inputCls} />

          {/* Add Instructions toggle */}
          {!showInstructions ? (
            <button onClick={() => setShowInstructions(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-brand-text hover:underline cursor-pointer">
              <Plus size={13} /> Add Instructions
            </button>
          ) : (
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Instructions..." rows={2} className={inputCls + ' resize-none'} />
          )}

          {/* Assign toggle */}
          {!showAssign ? (
            <button onClick={() => setShowAssign(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-brand-text hover:underline cursor-pointer">
              <User size={13} /> Assign
            </button>
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted uppercase">Assign to</p>
              <div className="flex flex-wrap gap-1.5">
                {teamMembers.map(m => m.name).map(name => (
                  <button key={name} onClick={() => toggleAssign(name)}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                      form.assigned_to.includes(name)
                        ? 'bg-brand/20 text-brand-text border border-brand/40'
                        : 'bg-surface-alt text-muted border border-border-subtle'
                    }`}>{name}</button>
                ))}
              </div>
            </div>
          )}

          {/* Date + Anytime */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 text-[11px] font-semibold text-secondary cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={form.anytime} onChange={e => set('anytime', e.target.checked)}
                className="accent-brand" /> Anytime
            </label>
          </div>

          {/* Time picker — only if not anytime */}
          {!form.anytime && (
            <div>
              <label className="text-[10px] font-bold text-muted uppercase">Start time</label>
              <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} className={inputCls + ' mt-1'} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
          <button onClick={onClose} className="text-xs font-semibold text-muted hover:text-primary cursor-pointer">More Options</button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted hover:text-primary cursor-pointer">Cancel</button>
            <button onClick={async () => { setSaving(true); await onSave(form); setSaving(false); }} disabled={saving || !form.title}
              className="px-5 py-2 rounded-lg bg-brand text-on-brand text-xs font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50">
              {saving ? '...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Event Detail ─── */
function EventDetail({ item, onClose, onStatusChange, onUpdateAssigned, onEdit, anchor }) {
  const { orgId } = useAuth();
  const navigate = useNavigate();
  const tc = TYPE_COLORS[item.type] || TYPE_COLORS.task;
  const permissions = useAppStore((s) => s.permissions) || {};
  const { currentUser, user } = useAuth();
  const isAssessment = item.type === 'assessment';

  // Linked request (for client name, address, request_number) — fetched lazily.
  // If we find the request has no client_id but a matching client exists by name,
  // we self-heal by writing the client_id back so the next click is instant.
  const [linkedRequest, setLinkedRequest] = useState(null);
  useEffect(() => {
    if (!item.request_id) return;
    let cancelled = false;
    (async () => {
      const { data: req } = await supabase
        .from('requests')
        .select('id, request_number, first_name, last_name, street, city, state, zip, client_id, org_id')
        .eq('id', item.request_id)
        .maybeSingle();
      if (cancelled || !req) return;

      // Backfill client_id if missing.
      if (!req.client_id) {
        const display = [req.first_name, req.last_name].filter(Boolean).join(' ').trim().toLowerCase();
        if (display) {
          const { data: candidates } = await supabase
            .from('clients')
            .select('id, first_name, last_name, company_name')
            .eq('org_id', req.org_id);
          const buildName = (c) => (c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || '').toLowerCase();
          const match = (candidates || []).find((c) => buildName(c) === display);
          if (match?.id) {
            req.client_id = match.id;
            await supabase.from('requests').update({ client_id: match.id }).eq('id', req.id);
          }
        }
      }

      if (!cancelled) setLinkedRequest(req);
    })();
    return () => { cancelled = true; };
  }, [item.request_id]);

  const [showConvert, setShowConvert] = useState(false);

  // Drag-to-move state. Pointer-down on the top-left grip starts the drag.
  const [pos, setPos] = useState({ x: null, y: null });
  const dragOffset = useRef({ x: 0, y: 0 });
  const cardRef = useRef(null);
  const onGripDown = (e) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const move = (mv) => setPos({ x: mv.clientX - dragOffset.current.x, y: mv.clientY - dragOffset.current.y });
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  // Build team list for assign dropdown
  const teamMembers = (() => {
    const list = Object.entries(permissions).map(([email, info]) => ({ email, name: info.name || email }));
    const ownerEmail = user?.email?.toLowerCase();
    if (ownerEmail && !permissions[ownerEmail]) {
      list.unshift({ email: ownerEmail, name: currentUser || user?.user_metadata?.full_name || 'Owner' });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  })();

  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const assignRef = useRef(null);
  useEffect(() => {
    if (!showAssignMenu) return;
    const close = (e) => { if (assignRef.current && !assignRef.current.contains(e.target)) setShowAssignMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showAssignMenu]);

  const assigned = item.assigned_to || [];
  const removeAssign = (name) => onUpdateAssigned(item.id, assigned.filter(n => n !== name));
  const addAssign = (name) => { if (!assigned.includes(name)) onUpdateAssigned(item.id, [...assigned, name]); setShowAssignMenu(false); };

  // Use the request's title for assessments — never the instructions (`notes`).
  const shortName = isAssessment
    ? (item.title || '').replace(/^Assessment:\s*/, '') || 'Assessment'
    : item.title;
  const startDate = new Date(item.start_at);
  const endDate = item.end_at ? new Date(item.end_at) : null;
  const dateLabel = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: getTimezone() });

  // Linked-data derived fields — falls back to whatever was denormalized on the item.
  const clientName = linkedRequest
    ? [linkedRequest.first_name, linkedRequest.last_name].filter(Boolean).join(' ')
    : item.title.replace(/^Assessment:\s*/, '').replace(/^Request for\s*/, '');
  const address = linkedRequest
    ? [linkedRequest.street, linkedRequest.city, linkedRequest.state, linkedRequest.zip].filter(Boolean).join(', ')
    : '';
  const requestHref = linkedRequest?.request_number
    ? `/requests/${linkedRequest.request_number}`
    : (item.request_id ? `/requests` : null);

  // Position: pick the side with the most room (right > left > below > above) so the
  // popup never covers the clicked card.
  const dragged = pos.x !== null && pos.y !== null;
  const anchored = !dragged && !!anchor;
  // max-w-md ≈ 448px; bump to 460 for breathing room so we never undersize.
  const cardW = 460, cardH = 560, gap = 12;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const sidePos = (() => {
    if (!anchored) return null;
    const roomRight = vw - anchor.right - gap;
    const roomLeft = anchor.left - gap;
    const roomBelow = vh - anchor.bottom - gap;
    const roomAbove = anchor.top - gap;
    let left, top;
    if (roomRight >= cardW) {
      left = anchor.right + gap;
      top = anchor.top;
    } else if (roomLeft >= cardW) {
      left = anchor.left - cardW - gap;
      top = anchor.top;
    } else if (roomBelow >= 200) {
      left = Math.min(anchor.left, vw - cardW - gap);
      top = anchor.bottom + gap;
    } else if (roomAbove >= 200) {
      left = Math.min(anchor.left, vw - cardW - gap);
      top = Math.max(gap, anchor.top - cardH - gap);
    } else {
      // Last resort: pin near the right edge, clamped vertically.
      left = Math.max(gap, vw - cardW - gap);
      top = Math.max(gap, Math.min(anchor.top, vh - cardH - gap));
    }
    // Always clamp Y so the whole card stays on screen.
    top = Math.max(gap, Math.min(top, vh - cardH - gap));
    left = Math.max(gap, left);
    return { left, top };
  })();
  const wrapperStyle = dragged
    ? { position: 'fixed', left: pos.x, top: pos.y }
    : sidePos
      ? { position: 'fixed', left: sidePos.left, top: sidePos.top }
      : {};
  const useFloating = dragged || anchored;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Transparent backdrop — catches outside clicks to dismiss, doesn't grey the screen. */}
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />
      <div
        ref={cardRef}
        style={useFloating ? wrapperStyle : { position: 'fixed', left: '50%', top: 48, transform: 'translateX(-50%)' }}
        className="bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`h-1 ${tc.bg} rounded-t-2xl`} />
        <div className="p-5 space-y-4">
          {/* Header — drag handle on the left, close on the right */}
          <div className="flex items-start justify-between">
            <div
              onMouseDown={onGripDown}
              className="p-1 -m-1 cursor-grab active:cursor-grabbing text-muted hover:text-primary select-none"
              title="Drag to move"
            >
              {/* 6-dot grip */}
              <div className="grid grid-cols-2 gap-0.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="w-1 h-1 rounded-full bg-current" />
                ))}
              </div>
            </div>
            <button onClick={onClose} className="p-1 text-muted hover:text-primary cursor-pointer"><X size={16} /></button>
          </div>

          {/* Title block */}
          <div>
            <h2 className="text-lg font-black text-primary">{shortName || 'Untitled'}</h2>
            <p className={`text-sm font-semibold capitalize ${tc.text}`}>{item.type}</p>
          </div>

          {/* Completed — toggling on for an assessment fires the convert chooser */}
          <label
            onClick={async () => {
              const nextComplete = item.status !== 'complete';
              onStatusChange(item.id, nextComplete ? 'complete' : 'scheduled');
              // Mirror onto the linked request so the Requests page agrees.
              if (item.request_id) {
                const { data: req } = await supabase.from('requests').select('raw_payload').eq('id', item.request_id).maybeSingle();
                const nextPayload = { ...(req?.raw_payload || {}) };
                nextPayload.assessment = { ...(nextPayload.assessment || {}), completed: nextComplete };
                await supabase.from('requests').update({ raw_payload: nextPayload }).eq('id', item.request_id);
              }
              if (nextComplete && isAssessment) setShowConvert(true);
            }}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <span className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              item.status === 'complete' ? 'bg-brand border-brand' : 'border-border-subtle hover:border-muted'
            }`}>
              {item.status === 'complete' && <Check size={13} className="text-on-brand" />}
            </span>
            <span className="text-sm text-secondary">Completed</span>
          </label>

          {/* Details — client + request links */}
          {isAssessment && (
            <div>
              <p className="text-sm font-black text-primary mb-1">Details</p>
              <p className="text-sm">
                <button
                  onClick={async () => {
                    // 1. Direct client_id (the happy path once self-heal has run).
                    if (linkedRequest?.client_id) {
                      const { data: c } = await supabase.from('clients').select('client_number').eq('id', linkedRequest.client_id).maybeSingle();
                      onClose();
                      navigate(`/clients/${c?.client_number ?? linkedRequest.client_id}`);
                      return;
                    }
                    // 2. No id yet — match by display name against the org's clients.
                    const target = (clientName || '').trim().toLowerCase();
                    if (target && orgId) {
                      const { data: all } = await supabase
                        .from('clients')
                        .select('id, client_number, first_name, last_name, company_name')
                        .eq('org_id', orgId);
                      const buildName = (c) => (c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || '').toLowerCase();
                      const match = (all || []).find((c) => buildName(c) === target);
                      if (match?.id) {
                        onClose();
                        navigate(`/clients/${match.client_number ?? match.id}`);
                        return;
                      }
                    }
                    onClose();
                    navigate('/clients');
                  }}
                  className="text-brand-text underline hover:no-underline cursor-pointer"
                >
                  {clientName || 'Client'}
                </button>
                <span className="text-muted"> – </span>
                <button
                  onClick={() => { onClose(); if (requestHref) navigate(requestHref); }}
                  className="text-brand-text underline hover:no-underline cursor-pointer"
                >
                  Request {dateLabel(startDate)}
                </button>
              </p>
            </div>
          )}

          {/* Team — full names */}
          <div>
            <p className="text-sm font-black text-primary mb-2">Team</p>
            <div className="flex flex-wrap items-center gap-1.5" ref={assignRef}>
              <div className="relative">
                <button onClick={() => setShowAssignMenu(!showAssignMenu)}
                  className="w-8 h-8 rounded-full border-2 border-dashed border-border-subtle hover:border-muted flex items-center justify-center cursor-pointer transition-colors">
                  <Plus size={14} className="text-muted" />
                </button>
                {showAssignMenu && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl py-1 min-w-[200px] max-h-[200px] overflow-y-auto">
                    {teamMembers.filter(m => !assigned.includes(m.name)).map(m => (
                      <button key={m.email} onClick={() => addAssign(m.name)}
                        className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-surface-alt cursor-pointer text-secondary">
                        <span className="w-6 h-6 rounded-full bg-surface-alt text-[9px] font-bold flex items-center justify-center">
                          {m.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {assigned.map(name => (
                <span key={name} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-surface-alt text-sm font-semibold text-primary">
                  <span className="w-7 h-7 rounded-full bg-brand/20 text-brand text-[10px] font-bold flex items-center justify-center">
                    {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  {name}
                  <button onClick={() => removeAssign(name)} className="ml-0.5 text-muted hover:text-primary cursor-pointer"><X size={12} /></button>
                </span>
              ))}
              {assigned.length === 0 && <span className="text-sm text-red-400/70 italic">Unassigned</span>}
            </div>
          </div>

          {/* Location — clickable, opens Google Maps */}
          {(address || item.notes) && (
            <div>
              <p className="text-sm font-black text-primary mb-1">Location</p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || item.notes)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-text underline hover:no-underline flex items-start gap-1.5"
              >
                <MapPin size={14} className="text-muted shrink-0 mt-0.5" />
                <span>{address || item.notes}</span>
              </a>
            </div>
          )}

          {/* Date / time — single column. Shows the date and either a single
              time or a time range. If start and end land on different days,
              both dates are shown. */}
          <div>
            <p className="text-sm font-black text-primary mb-1">Date / Time</p>
            {(() => {
              const sameDay = endDate && dateLabel(startDate) === dateLabel(endDate);
              const datePart = endDate && !sameDay
                ? `${dateLabel(startDate)} – ${dateLabel(endDate)}`
                : dateLabel(startDate);
              const timePart = item.anytime
                ? 'Anytime'
                : endDate
                  ? `${formatTime(item.start_at)} – ${formatTime(item.end_at)}`
                  : formatTime(item.start_at);
              return (
                <p className="text-sm text-secondary">
                  {datePart} <span className="text-muted">·</span> {timePart}
                </p>
              );
            })()}
          </div>

          {/* Footer buttons */}
          <div className="flex gap-2 pt-2 border-t border-border-subtle">
            <button
              onClick={() => onEdit?.(item)}
              className="flex-1 px-4 py-2.5 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer text-center">
              Edit
            </button>
            <button onClick={() => { onClose(); if (requestHref) navigate(requestHref); }}
              className="flex-1 px-4 py-2.5 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer text-center">
              View Details
            </button>
          </div>
        </div>
      </div>

      {/* Convert chooser — same options as the Requests detail popup */}
      {showConvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-auto">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowConvert(false)} />
          <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
              <h3 className="text-lg font-black text-primary">Assessment completed</h3>
              <button onClick={() => setShowConvert(false)} className="p-1 text-muted hover:text-primary cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="py-2">
              <button
                onClick={async () => {
                  if (item.request_id) await supabase.from('requests').update({ status: 'quoted' }).eq('id', item.request_id);
                  setShowConvert(false); onClose();
                }}
                className="w-full flex items-center gap-3 px-6 py-3 text-left text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer"
              >
                <FileText size={18} className="text-rose-500" /> Convert to Quote
              </button>
              <button
                onClick={async () => {
                  if (item.request_id) await supabase.from('requests').update({ status: 'won' }).eq('id', item.request_id);
                  setShowConvert(false); onClose();
                }}
                className="w-full flex items-center gap-3 px-6 py-3 text-left text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer"
              >
                <span className="text-emerald-600">⚒</span> Convert to Job
              </button>
              <button
                onClick={async () => {
                  if (item.request_id) await supabase.from('requests').update({ status: 'lost' }).eq('id', item.request_id);
                  setShowConvert(false); onClose();
                }}
                className="w-full flex items-center gap-3 px-6 py-3 text-left text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer"
              >
                <Archive size={18} className="text-muted" /> Archive
              </button>
              <div className="h-px bg-border-subtle my-1 mx-6" />
              <button
                onClick={() => setShowConvert(false)}
                className="w-full flex items-center gap-3 px-6 py-3 text-left text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer"
              >
                <Check size={18} className="text-muted" /> Leave as assessment completed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Edit Assessment Modal — reuses the form pieces from Requests.jsx ─── */
function EditAssessmentModal({ item, onClose, onSaved }) {
  const { user, currentUser } = useAuth();
  const permissions = useAppStore((s) => s.permissions) || {};
  const teamMembers = (() => {
    const list = Object.entries(permissions).map(([email, info]) => ({ email, name: info.name || email }));
    const ownerEmail = user?.email?.toLowerCase();
    if (ownerEmail && !permissions[ownerEmail]) {
      list.unshift({ email: ownerEmail, name: currentUser || user?.user_metadata?.full_name || 'Owner' });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  })();

  const startDateInit = item.start_at ? new Date(item.start_at).toLocaleDateString('en-CA', { timeZone: getTimezone() }) : '';
  const toDisplay12 = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: getTimezone() }).toUpperCase();
  };

  // Title shown at the top of the modal — editable. Strip the "Assessment: " prefix
  // for editing so the user only sees/edits the meaningful part.
  const titleInit = (item.title || '').replace(/^Assessment:\s*/i, '');
  const [titleDraft, setTitleDraft] = useState(titleInit);
  const [instructions, setInstructions] = useState(item.notes || '');
  const [startDate, setStartDate] = useState(startDateInit);
  const [startTime, setStartTime] = useState(item.anytime ? '' : toDisplay12(item.start_at));
  const [endTime, setEndTime] = useState(item.anytime || !item.end_at ? '' : toDisplay12(item.end_at));
  const [scheduleLater, setScheduleLater] = useState(!item.start_at);
  const [anytime, setAnytime] = useState(!!item.anytime);
  const [assignees, setAssignees] = useState(Array.isArray(item.assigned_to) ? item.assigned_to : []);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const start24 = timeStringTo24(startTime);
    const end24 = timeStringTo24(endTime);
    const startAt = !scheduleLater && startDate
      ? new Date(`${startDate}T${anytime ? '00:00' : (start24 || '09:00')}:00`).toISOString()
      : null;
    const endAt = !scheduleLater && startDate && !anytime && end24
      ? new Date(`${startDate}T${end24}:00`).toISOString()
      : null;

    const titleClean = titleDraft.trim();

    // Update the schedule_items row.
    await supabase.from('schedule_items').update({
      title: titleClean ? `Assessment: ${titleClean}` : item.title,
      start_at: startAt,
      end_at: endAt,
      anytime,
      notes: instructions || null,
      assigned_to: assignees,
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);

    // Mirror back to the linked request — also update the request title so the
    // change shows up everywhere (requests list, schedule, detail page).
    if (item.request_id) {
      const { data: req } = await supabase.from('requests').select('raw_payload').eq('id', item.request_id).maybeSingle();
      const nextPayload = { ...(req?.raw_payload || {}) };
      nextPayload.assessment = {
        ...(nextPayload.assessment || {}),
        instructions: instructions || null,
        assignees,
        assignee: assignees[0] || null,
        end_time: anytime ? null : end24 || null,
        schedule_item_id: item.id,
      };
      await supabase.from('requests').update({
        title: titleClean || null,
        assessment_date: scheduleLater ? null : startDate || null,
        assessment_time: anytime ? null : start24 || null,
        raw_payload: nextPayload,
      }).eq('id', item.request_id);
    }
    setSaving(false);
    onSaved?.();
  };

  const handleDelete = async () => {
    if (!confirm('Delete this assessment?')) return;
    await supabase.from('schedule_items').delete().eq('id', item.id);
    if (item.request_id) {
      const { data: req } = await supabase.from('requests').select('raw_payload').eq('id', item.request_id).maybeSingle();
      const nextPayload = { ...(req?.raw_payload || {}) };
      delete nextPayload.assessment;
      await supabase.from('requests').update({
        assessment_date: null,
        assessment_time: null,
        raw_payload: Object.keys(nextPayload).length ? nextPayload : null,
      }).eq('id', item.request_id);
    }
    onSaved?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-black text-primary">Edit Assessment</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-primary cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder="Request name"
            className="w-full px-3 py-2 bg-card border border-border-subtle rounded-lg text-xl font-black text-primary placeholder:text-muted focus:outline-none focus:border-brand/50"
          />
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Instructions"
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg bg-card border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50 resize-none"
          />

          <div>
            <p className="text-sm font-black text-primary mb-2">Schedule</p>
            <div className="flex flex-col gap-3">
              {/* Date row */}
              <div className="flex flex-col gap-2">
                <CalendarInput
                  label="Date"
                  value={scheduleLater ? '' : startDate}
                  onChange={setStartDate}
                  disabled={scheduleLater}
                  placeholder="mm/dd/yyyy"
                  className="w-[260px]"
                />
                <label
                  onClick={() => {
                    const next = !scheduleLater;
                    setScheduleLater(next);
                    setAnytime(next);
                    if (!next) {
                      if (!startDate) {
                        const t = new Date();
                        setStartDate(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`);
                      }
                      if (!startTime && !endTime) {
                        const now = new Date();
                        const sh = (now.getHours() + 1) % 24;
                        setStartTime(to12Hour(sh));
                        setEndTime(to12Hour((sh + 1) % 24));
                      }
                    }
                  }}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <span className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center transition-colors ${scheduleLater ? 'bg-brand border-brand' : 'border-border-subtle'}`}>
                    {scheduleLater && <Check size={12} className="text-on-brand" />}
                  </span>
                  <span className="text-xs text-secondary">Schedule later</span>
                </label>
              </div>
              {/* Time row */}
              <div className="flex flex-col gap-2">
                <div className="flex rounded-lg overflow-hidden border border-border-subtle w-[260px]">
                  <TimeInput
                    label="Start time"
                    value={anytime ? '' : startTime}
                    onChange={(next) => {
                      setStartTime(next);
                      const s = timeStringTo24(next);
                      const e = timeStringTo24(endTime);
                      if (s && e && s >= e) {
                        const [sh, sm] = s.split(':').map(Number);
                        const nh = (sh + 1) % 24;
                        const ampm = nh >= 12 ? 'PM' : 'AM';
                        const h12 = nh % 12 || 12;
                        setEndTime(`${String(h12).padStart(2, '0')}:${String(sm).padStart(2, '0')} ${ampm}`);
                      }
                    }}
                    disabled={anytime}
                    className="w-[130px]"
                  />
                  <div className="w-px bg-border-subtle" />
                  <TimeInput
                    label="End time"
                    value={anytime ? '' : endTime}
                    onChange={(next) => {
                      setEndTime(next);
                      const s = timeStringTo24(startTime);
                      const e = timeStringTo24(next);
                      if (s && e && e < s) setStartTime(next);
                    }}
                    disabled={anytime}
                    className="w-[130px]"
                  />
                </div>
                {(() => {
                  const locked = scheduleLater;
                  return (
                    <label
                      onClick={() => {
                        if (locked) return;
                        const next = !anytime;
                        setAnytime(next);
                        if (!next && !startTime && !endTime) {
                          const now = new Date();
                          const sh = (now.getHours() + 1) % 24;
                          setStartTime(to12Hour(sh));
                          setEndTime(to12Hour((sh + 1) % 24));
                        }
                      }}
                      className={`flex items-center gap-2 select-none ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center transition-colors ${
                        locked ? 'bg-muted/40 border-muted/40' :
                        anytime ? 'bg-brand border-brand' : 'border-border-subtle'
                      }`}>
                        {(anytime || locked) && <Check size={12} className="text-on-brand" />}
                      </span>
                      <span className={`text-xs ${locked ? 'text-muted/70' : 'text-secondary'}`}>Anytime</span>
                    </label>
                  );
                })()}
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-black text-primary mb-2">Team</p>
            <TeamAssignDropdown members={teamMembers} value={assignees} onChange={setAssignees} />
          </div>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle">
          <button onClick={handleDelete} className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600 cursor-pointer">
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer">Cancel</button>
            <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ─── */
/* ── Quiet Jobber sync indicator ── */
function JobberSyncIndicator({ loading, stale, error, count, onRefresh }) {
  if (!loading && !stale && !error && count === 0) return null;
  const statusColor = error ? 'text-red-400' : stale ? 'text-amber-400' : loading ? 'text-muted' : 'text-emerald-500';
  const statusText = error ? `Jobber: ${error}` : stale ? `Showing cached Jobber visits (sync paused)` : loading ? 'Syncing Jobber…' : `${count} Jobber visit${count === 1 ? '' : 's'} this month`;
  return (
    <div className="flex items-center justify-between text-[11px] px-3 py-1.5 rounded-lg bg-surface-alt/40 border border-border-subtle/60">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${error ? 'bg-red-400' : stale ? 'bg-amber-400' : loading ? 'bg-muted animate-pulse' : 'bg-emerald-500'}`} />
        <span className={statusColor}>{statusText}</span>
      </div>
      <button onClick={onRefresh} disabled={loading} title="Refresh Jobber"
        className="p-1 rounded hover:bg-surface-alt text-muted hover:text-primary cursor-pointer disabled:opacity-50">
        <Loader2 size={11} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}

export default function Schedule() {
  const { orgId, user, currentUser } = useAuth();
  const permissions = useAppStore((s) => s.permissions) || {};
  // Single source of truth: pull team members from Settings (permissions store) +
  // include the org owner. Sorted alphabetically.
  const teamMembers = useMemo(() => {
    const list = Object.entries(permissions).map(([email, info]) => ({ email, name: info.name || email }));
    const ownerEmail = user?.email?.toLowerCase();
    if (ownerEmail && !permissions[ownerEmail]) {
      list.unshift({ email: ownerEmail, name: currentUser || user?.user_metadata?.full_name || 'Owner' });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissions, user?.email, currentUser]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showNewEvent, setShowNewEvent] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  // Anchor coordinates for the EventDetail popup so it appears near the click target.
  const [selectAnchor, setSelectAnchor] = useState(null);
  const openItem = (it, e) => {
    if (e?.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      // Pass the source rect; EventDetail picks the best side (right/left/below/above).
      setSelectAnchor({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    } else {
      setSelectAnchor(null);
    }
    setSelectedItem(it);
  };
  const [typeFilter, setTypeFilter] = useState([]);   // [] = all
  const [statusFilter, setStatusFilter] = useState([]); // [] = all
  const [teamFilter, setTeamFilter] = useState([]);     // [] = all

  // Live Jobber visits for the visible month — read-only sync, falls back on throttle
  const [jobberVisits, setJobberVisits] = useState([]);
  const [jobberLoading, setJobberLoading] = useState(false);
  const [jobberError, setJobberError] = useState(null);
  const [jobberStale, setJobberStale] = useState(false);

  // Jobber-synced visits used to be merged into the schedule view here. The schedule
  // is now Boost-native: it only renders rows from `schedule_items`. Anything that
  // needs to appear (assessments from Requests, etc.) will write to schedule_items
  // directly. No more hub_visits reads, no realtime channel, no background sync.
  // Existing rows in hub_visits are left untouched but ignored by this page.

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthLabel = currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: getTimezone() });

  // Stable key for fetch triggers
  const rangeKey = `${view}-${year}-${month}-${ds(currentDate)}`;
  const typeKey = typeFilter.join(',');
  const statusKey = statusFilter.join(',');

  const fetchItems = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    let rangeStart, rangeEnd;
    if (view === 'month') {
      rangeStart = new Date(year, month, -6).toISOString();
      rangeEnd = new Date(year, month + 1, 7).toISOString();
    } else if (view === 'week') {
      const d = new Date(currentDate); d.setDate(d.getDate() - d.getDay());
      rangeStart = d.toISOString();
      const e = new Date(d); e.setDate(e.getDate() + 7);
      rangeEnd = e.toISOString();
    } else {
      const s = new Date(currentDate); s.setHours(0,0,0,0);
      rangeStart = s.toISOString();
      const e = new Date(currentDate); e.setHours(23,59,59,999);
      rangeEnd = e.toISOString();
    }

    let q = supabase.from('schedule_items').select('*').eq('org_id', orgId)
      .gte('start_at', rangeStart).lte('start_at', rangeEnd).order('start_at');
    const typeClear = typeFilter.length === 1 && typeFilter[0] === '__clear__';
    const statusClear = statusFilter.length === 1 && statusFilter[0] === '__clear__';
    if (typeClear || statusClear) { setItems([]); setLoading(false); return; }
    if (typeFilter.length > 0) q = q.in('type', typeFilter);
    if (statusFilter.length > 0) q = q.in('status', statusFilter);
    const { data } = await q;

    // Drop stale assessment items. The calendar self-heals — no manual cleanup needed.
    let rows = data || [];
    const assessmentRequestIds = [...new Set(rows.filter(r => r.type === 'assessment' && r.request_id).map(r => r.request_id))];
    if (assessmentRequestIds.length > 0) {
      const { data: liveReqs } = await supabase
        .from('requests')
        .select('id, assessment_date, raw_payload')
        .in('id', assessmentRequestIds);
      const liveById = new Map((liveReqs || []).map((r) => [r.id, r]));
      rows = rows.filter((r) => {
        if (r.type !== 'assessment') return true;
        if (!r.request_id) return false;                                // orphan (no parent)
        const req = liveById.get(r.request_id);
        if (!req) return false;                                         // parent deleted
        if (!req.assessment_date) return false;                         // assessment removed from request
        return true; // keep completed assessments on the calendar
      });
    } else {
      rows = rows.filter((r) => r.type !== 'assessment');
    }

    // Self-heal: if end_at lands on a different calendar day from start_at in the
    // display TZ, rewrite it to share start_at's date with end_at's own time-of-day.
    // Stops the popup from saying "through next day" for stale rows.
    const tz = getTimezone();
    const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
    const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const healed = [];
    for (const it of rows) {
      if (it.end_at && it.start_at && dayOf(it.start_at) !== dayOf(it.end_at)) {
        const newEnd = isoFromDateTimeInTz(dayOf(it.start_at), timeFmt.format(new Date(it.end_at)), tz);
        if (newEnd !== it.end_at) {
          healed.push({ id: it.id, end_at: newEnd });
          it.end_at = newEnd;
        }
      }
    }
    // Fire-and-forget the writes; don't block render.
    for (const h of healed) {
      supabase.from('schedule_items').update({ end_at: h.end_at }).eq('id', h.id).then(() => {}, () => {});
    }

    setItems(rows.map(it => ({ ...it, _ds: new Date(it.start_at).toLocaleDateString('en-CA', { timeZone: getTimezone() }) })));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, rangeKey, typeKey, statusKey]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => { const d = new Date(currentDate); if (view === 'month') d.setMonth(d.getMonth() - 1); else if (view === 'week') d.setDate(d.getDate() - 7); else d.setDate(d.getDate() - 1); setCurrentDate(d); };
  const goNext = () => { const d = new Date(currentDate); if (view === 'month') d.setMonth(d.getMonth() + 1); else if (view === 'week') d.setDate(d.getDate() + 7); else d.setDate(d.getDate() + 1); setCurrentDate(d); };

  const createEvent = async (form) => {
    if (!orgId) return;
    const startAt = form.anytime ? new Date(`${form.date}T00:00:00`).toISOString() : new Date(`${form.date}T${form.start_time}:00`).toISOString();
    await supabase.from('schedule_items').insert({
      org_id: orgId, type: form.type, title: form.title,
      start_at: startAt, end_at: null,
      all_day: false, anytime: form.anytime,
      notes: form.notes || null, status: 'scheduled',
      assigned_to: form.assigned_to?.length > 0 ? form.assigned_to : [],
      client_id: form.client_id || null,
    });
    setShowNewEvent(null); fetchItems();
  };

  const updateStatus = async (id, status) => {
    await supabase.from('schedule_items').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    setItems(prev => prev.map(it => it.id === id ? { ...it, status } : it));
    setSelectedItem(prev => prev?.id === id ? { ...prev, status } : prev);
  };

  const updateAssigned = async (id, assigned_to) => {
    await supabase.from('schedule_items').update({ assigned_to, updated_at: new Date().toISOString() }).eq('id', id);
    setItems(prev => prev.map(it => it.id === id ? { ...it, assigned_to } : it));
    setSelectedItem(prev => prev?.id === id ? { ...prev, assigned_to } : prev);
  };

  const moveItemToDate = async (itemId, newDateStr) => {
    const item = items.find(it => it.id === itemId);
    if (!item || item._ds === newDateStr) return;
    // Pin to the new calendar date in the display TZ — keep the same time-of-day
    // for start AND end so they always land on the same day.
    const tz = getTimezone();
    const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const fmtTime = (d) => timeFmt.format(d); // "HH:MM:SS" in display TZ
    const newStartIso = isoFromDateTimeInTz(newDateStr, fmtTime(new Date(item.start_at)), tz);
    const newEndIso = item.end_at
      ? isoFromDateTimeInTz(newDateStr, fmtTime(new Date(item.end_at)), tz)
      : null;
    await supabase.from('schedule_items').update({
      start_at: newStartIso,
      end_at: newEndIso,
      updated_at: new Date().toISOString(),
    }).eq('id', itemId);
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, start_at: newStartIso, end_at: newEndIso, _ds: newDateStr } : it));

    // For assessment items, mirror the new date onto the linked request so the
    // Requests page agrees with the calendar.
    if (item.type === 'assessment' && item.request_id) {
      await supabase.from('requests').update({ assessment_date: newDateStr }).eq('id', item.request_id);
    }
  };

  const handleDrop = (e, dateStr) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('text/plain');
    if (itemId) moveItemToDate(itemId, dateStr);
  };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const today = ds(new Date());
  const weeks = useMemo(() => getMonthGrid(year, month), [year, month]);
  // Map Jobber visits into EventCard-compatible shape and group by local date.
  // - Title: prefer the visit/job title, fall back to client name
  // - Anytime: when startAt is midnight in local TZ, treat it as "anytime" (no clock)
  const jobberAsItems = useMemo(() => {
    return jobberVisits.map((v) => {
      const dt = v.startAt ? new Date(v.startAt) : null;
      const dateKey = dt ? dt.toLocaleDateString('en-CA', { timeZone: getTimezone() }) : null;
      const titleLower = (v.title || '').toLowerCase();
      const isAssessment = titleLower.includes('assessment') || /assess|estimate|quote/i.test(v.title || '');
      const isLawn = /\blawn\b/.test(titleLower);
      // Detect "anytime" — Jobber gives midnight when no specific time is set
      const localHM = dt ? dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: getTimezone() }) : null;
      const isAnytime = !v.startAt || localHM === '00:00' || localHM === '24:00';
      return {
        id: `jobber-${v.id}`,
        _ds: dateKey,
        type: isAssessment ? 'assessment' : (isLawn ? 'visit' : 'visit-other'),
        title: v.title || v.clientName || 'Visit',
        start_at: v.startAt,
        all_day: false,
        anytime: isAnytime,
        notes: v.address || '',
        assigned_to: v.assignees || [],
        status: v.completedAt ? 'complete' : 'scheduled',
        _jobber: true,
        _raw: v,
      };
    }).filter((it) => it._ds);
  }, [jobberVisits]);

  // Team filter — if the user has picked a subset of team members, only show items
  // that intersect that subset. An empty list means "all" (no filter applied).
  const matchesTeamFilter = (it) => {
    if (teamFilter.length === 0) return true;
    const assigned = Array.isArray(it.assigned_to) ? it.assigned_to : [];
    return assigned.some((name) => teamFilter.includes(name));
  };

  const byDate = useMemo(() => {
    const m = {};
    for (const it of items) {
      if (!matchesTeamFilter(it)) continue;
      if (!m[it._ds]) m[it._ds] = []; m[it._ds].push(it);
    }
    for (const it of jobberAsItems) {
      if (!matchesTeamFilter(it)) continue;
      if (!m[it._ds]) m[it._ds] = []; m[it._ds].push(it);
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, jobberAsItems, teamFilter]);

  // Week view
  const weekDays = useMemo(() => {
    const d = new Date(currentDate); d.setDate(d.getDate() - d.getDay());
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(x.getDate() + i); return { date: x, str: ds(x) }; });
  }, [currentDate]);

  // Day view hours
  const dayStr = ds(currentDate);
  const dayItems = byDate[dayStr] || [];

  return (
    <div className="space-y-3">
      {showNewEvent && <NewEventModal onClose={() => setShowNewEvent(null)} onSave={createEvent} defaultDate={showNewEvent} orgId={orgId} teamMembers={teamMembers} />}
      {selectedItem && <EventDetail item={selectedItem} anchor={selectAnchor} onClose={() => { setSelectedItem(null); setSelectAnchor(null); }} onStatusChange={updateStatus} onUpdateAssigned={updateAssigned} onEdit={(it) => { setSelectedItem(null); setSelectAnchor(null); setEditingItem(it); }} />}
      {editingItem && <EditAssessmentModal item={editingItem} onClose={() => setEditingItem(null)} onSaved={() => { setEditingItem(null); fetchItems(); }} />}

      {/* Header — Jobber style */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-black text-primary">{monthLabel}</h1>
          <button onClick={goPrev} className="p-1 rounded hover:bg-surface-alt text-muted hover:text-primary cursor-pointer"><ChevronLeft size={16} /></button>
          <button onClick={goNext} className="p-1 rounded hover:bg-surface-alt text-muted hover:text-primary cursor-pointer"><ChevronRight size={16} /></button>
          <button onClick={goToday} className="ml-1 px-3 py-1.5 rounded-lg border border-border-subtle text-[11px] font-bold text-primary hover:bg-surface-alt cursor-pointer">Today</button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-surface-alt rounded-lg p-0.5">
            {['month', 'week', 'day'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold cursor-pointer capitalize ${view === v ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'}`}>
                {v === 'month' ? 'Month' : v === 'week' ? 'Week' : 'Day'}
              </button>
            ))}
          </div>
          <button onClick={() => setShowNewEvent(ds(currentDate))}
            className="p-2 rounded-lg bg-brand text-on-brand hover:bg-brand-hover cursor-pointer"><Plus size={14} /></button>
        </div>
      </div>

      {/* Filter pills — Jobber style multi-select */}
      <div className="flex items-center gap-2">
        <FilterPill label="Type" selected={typeFilter} onChange={setTypeFilter}
          options={[
            { id: 'visit', label: 'Visits', dot: 'bg-emerald-500' },
            { id: 'assessment', label: 'Requests', dot: 'bg-blue-500' },
            { id: 'task', label: 'Tasks', dot: 'bg-amber-500' },
            { id: 'event', label: 'Events', dot: 'bg-purple-500' },
            { id: 'reminder', label: 'Reminders', dot: 'bg-rose-500' },
          ]} />
        <FilterPill label="Team" selected={teamFilter} onChange={setTeamFilter}
          options={[
            ...teamMembers.map((m) => ({ id: m.name, label: m.name })),
            { id: 'unassigned', label: 'Unassigned' },
          ]} />
        <FilterPill label="Status" selected={statusFilter} onChange={setStatusFilter}
          options={[
            { id: 'complete', label: 'Completed', dot: 'bg-emerald-500' },
            { id: 'scheduled', label: 'Upcoming', dot: 'bg-blue-500' },
            { id: 'in_progress', label: 'Overdue', dot: 'bg-amber-500' },
            { id: 'cancelled', label: 'Confirmed by client', dot: 'bg-purple-500' },
          ]} />
      </div>

      {loading && <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-brand" /></div>}

      {/* ─── Month View ─── */}
      {!loading && view === 'month' && (
        <div className="rounded-xl border border-border-subtle overflow-hidden">
          <div className="grid grid-cols-7 bg-surface-alt border-b border-border-subtle">
            {DAYS.map(d => <div key={d} className="px-2 py-1.5 text-center text-[10px] font-bold text-muted uppercase tracking-wider">{d}</div>)}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map(day => {
                const isToday = day.str === today;
                const di = byDate[day.str] || [];
                const visitCount = di.filter(x => x.type === 'visit' || x.type === 'assessment').length;
                return (
                  <div key={day.str}
                    onClick={() => { if (day.inMonth) { setCurrentDate(day.date); setView('day'); } }}
                    onDrop={e => handleDrop(e, day.str)} onDragOver={handleDragOver}
                    className={`border-r border-b border-border-subtle/40 min-h-[130px] cursor-pointer hover:bg-white/[0.02] transition-colors ${
                      !day.inMonth ? 'bg-black/20' : isToday ? 'bg-brand/[0.07]' : ''
                    }`}>
                    <div className="flex items-center justify-between px-1.5 py-1">
                      <div className="flex items-center gap-1">
                        <span className={`text-[11px] font-bold leading-none ${
                          isToday ? 'w-5 h-5 rounded-full bg-brand text-on-brand flex items-center justify-center text-[10px]'
                          : !day.inMonth ? 'text-muted/30' : 'text-secondary'
                        }`}>{day.date.getDate()}</span>
                        {visitCount > 0 && day.inMonth && (
                          <span className="text-[8px] font-bold text-muted">{visitCount} visit{visitCount > 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                    <div className="px-0.5 pb-0.5 space-y-0.5">
                      {di.map(it => <EventCard key={it.id} item={it} isSelected={selectedItem?.id === it.id} isDimmed={!!selectedItem && selectedItem?.id !== it.id} onClick={(e) => { e.stopPropagation(); openItem(it, e); }} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ─── Week View ─── */}
      {!loading && view === 'week' && (
        <div className="rounded-xl border border-border-subtle overflow-hidden">
          <div className="grid grid-cols-7 bg-surface-alt border-b border-border-subtle">
            {weekDays.map(d => {
              const isToday = d.str === today;
              return (
                <div key={d.str} className="px-2 py-2 text-center border-r border-border-subtle/40">
                  <span className="text-[10px] font-bold text-muted uppercase">{DAYS[d.date.getDay()]}</span>
                  <span className={`ml-1 text-sm font-black ${isToday ? 'text-brand' : 'text-primary'}`}>{d.date.getDate()}</span>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-7">
            {weekDays.map(d => {
              const isToday = d.str === today;
              const di = byDate[d.str] || [];
              return (
                <div key={d.str} onDrop={e => handleDrop(e, d.str)} onDragOver={handleDragOver}
                  className={`border-r border-border-subtle/40 min-h-[400px] ${isToday ? 'bg-brand/[0.07]' : ''}`}>
                  <div className="p-1 space-y-0.5">
                    {di.map(it => <EventCard key={it.id} item={it} isSelected={selectedItem?.id === it.id} isDimmed={!!selectedItem && selectedItem?.id !== it.id} onClick={(e) => openItem(it, e)} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Day View ─── */}
      {!loading && view === 'day' && (
        <div className="rounded-xl border border-border-subtle overflow-hidden">
          <div className="bg-surface-alt px-4 py-2 border-b border-border-subtle flex items-center justify-between">
            <span className="text-sm font-bold text-primary">
              {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: getTimezone() })}
            </span>
            <button onClick={() => setShowNewEvent(dayStr)}
              className="p-1.5 rounded-lg hover:bg-surface-alt text-muted hover:text-primary cursor-pointer"><Plus size={14} /></button>
          </div>
          {/* Anytime items */}
          {dayItems.filter(it => it.all_day || it.anytime).length > 0 && (
            <div className="px-3 py-2 bg-surface-alt/30 border-b border-border-subtle">
              <p className="text-[9px] font-bold text-muted uppercase mb-1">Anytime</p>
              <div className="space-y-1">{dayItems.filter(it => it.all_day || it.anytime).map(it => <EventCard key={it.id} item={it} isSelected={selectedItem?.id === it.id} isDimmed={!!selectedItem && selectedItem?.id !== it.id} onClick={(e) => openItem(it, e)} />)}</div>
            </div>
          )}
          {/* Hourly slots */}
          {Array.from({ length: 14 }, (_, i) => i + 6).map(h => {
            const label = h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
            const hourItems = dayItems.filter(it => !it.all_day && !it.anytime && new Date(it.start_at).getHours() === h);
            return (
              <div key={h} className="flex border-b border-border-subtle/30 min-h-[44px]">
                <div className="w-16 shrink-0 px-2 py-1 text-[10px] font-bold text-muted text-right border-r border-border-subtle/30">{label}</div>
                <div className="flex-1 p-1 space-y-0.5">
                  {hourItems.map(it => <EventCard key={it.id} item={it} isSelected={selectedItem?.id === it.id} isDimmed={!!selectedItem && selectedItem?.id !== it.id} onClick={(e) => openItem(it, e)} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
