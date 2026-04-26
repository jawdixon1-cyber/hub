import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { getTimezone } from '../utils/timezone';
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2, Clock,
  User, ChevronDown, Check, GripVertical, MapPin, Pencil, ExternalLink,
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
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: getTimezone() });
}
function ds(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

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
function EventCard({ item, onClick }) {
  const tc = TYPE_COLORS[item.type] || TYPE_COLORS.task;
  return (
    <button
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={onClick}
      className={`w-full text-left px-1.5 py-1 rounded text-[9px] font-bold leading-tight cursor-grab active:cursor-grabbing transition-all hover:brightness-125 ${tc.bg} text-white`}
      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
      {!item.all_day && !item.anytime && <span className="opacity-80 mr-0.5">{formatTime(item.start_at)}</span>}
      {item.title}
    </button>
  );
}

/* ─── New Event Modal (Jobber style) ─── */
const TEAM_MEMBERS = ['Jude', 'Devin Rogers', 'Ethan Brant', 'Braden Andrus'];

function NewEventModal({ onClose, onSave, defaultDate, orgId }) {
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
                {TEAM_MEMBERS.map(name => (
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
function EventDetail({ item, onClose, onStatusChange, onUpdateAssigned, onEdit }) {
  const navigate = useNavigate();
  const tc = TYPE_COLORS[item.type] || TYPE_COLORS.task;
  const permissions = useAppStore((s) => s.permissions) || {};
  const { currentUser, user } = useAuth();
  const isAssessment = item.type === 'assessment';

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

  // Parse request info from title for assessments
  const requestName = isAssessment ? item.title.replace(/^Assessment:\s*/, '') : item.title;
  const startDate = new Date(item.start_at);
  const dateLabel = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: getTimezone() });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-sm">
        <div className={`h-1 ${tc.bg} rounded-t-2xl`} />
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2">
              <GripVertical size={16} className="text-muted mt-1 shrink-0" />
              <div>
                <h2 className="text-base font-black text-primary">{requestName}</h2>
                <p className={`text-xs font-semibold capitalize ${tc.text}`}>{item.type}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 text-muted hover:text-primary cursor-pointer"><X size={16} /></button>
          </div>

          {/* Completed checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <div onClick={() => onStatusChange(item.id, item.status === 'complete' ? 'scheduled' : 'complete')}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                item.status === 'complete' ? 'bg-brand border-brand' : 'border-border-subtle hover:border-muted'
              }`}>
              {item.status === 'complete' && <Check size={13} className="text-on-brand" />}
            </div>
            <span className="text-sm text-secondary">Completed</span>
          </label>

          {/* Details with links */}
          {isAssessment && (
            <div>
              <p className="text-sm font-black text-primary mb-1">Details</p>
              <p className="text-sm">
                <button onClick={() => { onClose(); navigate('/clients'); }} className="text-brand-text hover:underline cursor-pointer">{requestName.replace('Request for ', '')}</button>
                <span className="text-muted"> – </span>
                <button onClick={() => { onClose(); navigate(`/requests`); }} className="text-brand-text hover:underline cursor-pointer">Request {dateLabel}</button>
              </p>
            </div>
          )}

          {/* Team */}
          <div>
            <p className="text-sm font-black text-primary mb-2">Team</p>
            <div className="flex flex-wrap items-center gap-1.5" ref={assignRef}>
              <div className="relative">
                <button onClick={() => setShowAssignMenu(!showAssignMenu)}
                  className="w-8 h-8 rounded-full border-2 border-dashed border-border-subtle hover:border-muted flex items-center justify-center cursor-pointer transition-colors">
                  <Plus size={14} className="text-muted" />
                </button>
                {showAssignMenu && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl py-1 min-w-[180px] max-h-[200px] overflow-y-auto">
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
                  {name.split(' ')[0]}
                  <button onClick={() => removeAssign(name)} className="ml-0.5 text-muted hover:text-primary cursor-pointer"><X size={12} /></button>
                </span>
              ))}
              {assigned.length === 0 && <span className="text-sm text-red-400/70 italic">Unassigned</span>}
            </div>
          </div>

          {/* Location (if notes contain address-like info) */}
          {item.notes && (
            <div>
              <p className="text-sm font-black text-primary mb-1">Location</p>
              <p className="text-sm text-secondary flex items-center gap-1.5"><MapPin size={14} className="text-muted shrink-0" /> {item.notes}</p>
            </div>
          )}

          {/* Start */}
          <div>
            <p className="text-sm font-black text-primary mb-1">Start</p>
            <p className="text-sm text-secondary">{dateLabel}</p>
            <p className="text-sm text-secondary">
              {item.anytime ? 'Anytime' : formatTime(item.start_at)}
            </p>
          </div>

          {/* Footer buttons */}
          <div className="flex gap-2 pt-2 border-t border-border-subtle">
            <button onClick={() => { onClose(); if (item.request_id) navigate(`/requests`); else onEdit?.(item); }}
              className="flex-1 px-4 py-2.5 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer text-center">
              Edit
            </button>
            <button onClick={() => { onClose(); navigate('/requests'); }}
              className="flex-1 px-4 py-2.5 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer text-center">
              View Details
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
  const { orgId } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showNewEvent, setShowNewEvent] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [typeFilter, setTypeFilter] = useState([]);   // [] = all
  const [statusFilter, setStatusFilter] = useState([]); // [] = all
  const [teamFilter, setTeamFilter] = useState([]);     // [] = all

  // Live Jobber visits for the visible month — read-only sync, falls back on throttle
  const [jobberVisits, setJobberVisits] = useState([]);
  const [jobberLoading, setJobberLoading] = useState(false);
  const [jobberError, setJobberError] = useState(null);
  const [jobberStale, setJobberStale] = useState(false);

  // Read visits from hub_visits (canonical schema, source-agnostic).
  // The sync layer keeps these tables fresh from Jobber. UI never calls Jobber directly.
  const jobberRangeKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
  const loadJobberMonth = useCallback(async () => {
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), -6);
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 7);
    setJobberLoading(true);
    try {
      const { data, error } = await supabase
        .from('hub_visits')
        .select('id, title, start_at, end_at, completed_at, address, status, source, source_id, contact_id, hub_visit_assignments(assignee_name)')
        .gte('start_at', start.toISOString())
        .lte('start_at', end.toISOString())
        .order('start_at');
      if (error) throw error;

      // Pull contact names in a separate query (cheap, set lookup)
      const contactIds = [...new Set((data || []).map((v) => v.contact_id).filter(Boolean))];
      let contactMap = {};
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase.from('contacts').select('id, name').in('id', contactIds);
        contactMap = Object.fromEntries((contacts || []).map((c) => [c.id, c.name]));
      }

      const visits = (data || []).map((v) => ({
        id: v.source_id || v.id,
        title: v.title || '',
        startAt: v.start_at,
        endAt: v.end_at,
        completedAt: v.completed_at,
        clientName: contactMap[v.contact_id] || 'Unknown',
        address: v.address || '',
        assignees: (v.hub_visit_assignments || []).map((a) => a.assignee_name).filter(Boolean),
      }));
      setJobberVisits(visits);
      setJobberStale(false);
      setJobberError(null);
    } catch (err) {
      setJobberError(err.message);
    } finally {
      setJobberLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobberRangeKey]);

  // Sync from Jobber → hub_visits in the background (and on mount).
  // The UI itself just reads from Supabase, so a slow/throttled sync doesn't block render.
  const triggerSync = useCallback(async () => {
    try {
      await fetch('/api/hub-sync?source=jobber&entity=visits', { method: 'POST' });
    } catch {}
    // After sync, refresh from the table.
    loadJobberMonth();
  }, [loadJobberMonth]);

  useEffect(() => {
    loadJobberMonth();
    const id = setInterval(loadJobberMonth, 60_000);
    return () => clearInterval(id);
  }, [loadJobberMonth]);

  // Kick off a background sync once per app load (and on month change).
  useEffect(() => {
    triggerSync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobberRangeKey]);

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
    setItems((data || []).map(it => ({ ...it, _ds: new Date(it.start_at).toLocaleDateString('en-CA', { timeZone: getTimezone() }) })));
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
    // Keep same time, change the date
    const oldDate = new Date(item.start_at);
    const [y, m, d] = newDateStr.split('-').map(Number);
    const newStart = new Date(oldDate);
    newStart.setFullYear(y, m - 1, d);
    const newIso = newStart.toISOString();
    await supabase.from('schedule_items').update({ start_at: newIso, updated_at: new Date().toISOString() }).eq('id', itemId);
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, start_at: newIso, _ds: newDateStr } : it));
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

  const byDate = useMemo(() => {
    const m = {};
    for (const it of items) { if (!m[it._ds]) m[it._ds] = []; m[it._ds].push(it); }
    for (const it of jobberAsItems) { if (!m[it._ds]) m[it._ds] = []; m[it._ds].push(it); }
    return m;
  }, [items, jobberAsItems]);

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
      {showNewEvent && <NewEventModal onClose={() => setShowNewEvent(null)} onSave={createEvent} defaultDate={showNewEvent} orgId={orgId} />}
      {selectedItem && <EventDetail item={selectedItem} onClose={() => setSelectedItem(null)} onStatusChange={updateStatus} onUpdateAssigned={updateAssigned} />}

      {/* Jobber sync status — quiet indicator, the visits themselves render on the calendar */}
      <JobberSyncIndicator loading={jobberLoading} stale={jobberStale} error={jobberError} count={jobberVisits.length} onRefresh={triggerSync} />

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
            { id: 'Jude', label: 'Jude' },
            { id: 'Devin Rogers', label: 'Devin Rogers' },
            { id: 'Ethan Brant', label: 'Ethan Brant' },
            { id: 'Braden Andrus', label: 'Braden Andrus' },
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
                      {di.map(it => <EventCard key={it.id} item={it} onClick={(e) => { e.stopPropagation(); setSelectedItem(it); }} />)}
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
                    {di.map(it => <EventCard key={it.id} item={it} onClick={() => setSelectedItem(it)} />)}
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
              <div className="space-y-1">{dayItems.filter(it => it.all_day || it.anytime).map(it => <EventCard key={it.id} item={it} onClick={() => setSelectedItem(it)} />)}</div>
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
                  {hourItems.map(it => <EventCard key={it.id} item={it} onClick={() => setSelectedItem(it)} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
