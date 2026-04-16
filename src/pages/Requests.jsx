import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import {
  Inbox, RefreshCw, Phone, Mail, MapPin, Loader2,
  ArrowLeft, MessageSquare, Search, TrendingUp,
  Plus, X, CalendarDays, ChevronDown, Check, CheckCircle2, ClipboardList,
  MoreHorizontal, FileText, Briefcase, Archive, Trash2, Pencil, Users,
} from 'lucide-react';

const STATUS_CONFIG = {
  new: { label: 'New', dot: 'bg-blue-500', text: 'text-blue-400' },
  contacted: { label: 'Contacted', dot: 'bg-amber-500', text: 'text-amber-400' },
  scheduled: { label: 'Assessment complete', dot: 'bg-emerald-500', text: 'text-emerald-400' },
  quoted: { label: 'Quoted', dot: 'bg-cyan-500', text: 'text-cyan-400' },
  won: { label: 'Converted', dot: 'bg-green-600', text: 'text-green-400' },
  lost: { label: 'Archived', dot: 'bg-gray-500', text: 'text-gray-400' },
};
const STATUS_ORDER = ['new', 'contacted', 'scheduled', 'quoted', 'won', 'lost'];

const DATE_RANGES = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last week' },
  { id: '30', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'year', label: 'This year' },
];

function getDateStart(rangeId) {
  const now = new Date();
  if (rangeId === 'all') return null;
  if (rangeId === 'today') { const d = new Date(now); d.setHours(0,0,0,0); return d; }
  if (rangeId === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
  if (rangeId === '30') { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
  if (rangeId === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (rangeId === 'year') return new Date(now.getFullYear(), 0, 1);
  return null;
}

function StatusDot({ status, onClick }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-2 text-xs font-medium text-secondary hover:text-primary cursor-pointer transition-colors">
      <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} shrink-0`} />
      {cfg.label}
    </button>
  );
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ─── Dropdown wrapper ─── */
function Dropdown({ trigger, open, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);
  return (
    <div ref={ref} className="relative inline-block">
      {trigger}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl min-w-[220px] py-1 max-h-[320px] overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── New Request Modal ─── */
function NewRequestModal({ onClose, onSave, salesperson }) {
  const [title, setTitle] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [clientSearching, setClientSearching] = useState(false);
  const [showClientResults, setShowClientResults] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [notes, setNotes] = useState('');
  const [wantAssessment, setWantAssessment] = useState(false);
  const [assessmentDate, setAssessmentDate] = useState('');
  const [assessmentTime, setAssessmentTime] = useState('');
  const [saving, setSaving] = useState(false);
  const searchTimeout = useRef(null);
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const inputCls = "mt-1 w-full px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50";

  const searchClients = (q) => {
    setClientQuery(q);
    setSelectedClient(null);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.length < 2) { setClientResults([]); setShowClientResults(false); return; }
    searchTimeout.current = setTimeout(async () => {
      setClientSearching(true);
      try {
        const res = await fetch(`/api/jobber-data?action=clients&q=${encodeURIComponent(q)}`);
        if (res.ok) { setClientResults(await res.json()); setShowClientResults(true); }
      } catch {}
      setClientSearching(false);
    }, 400);
  };

  const selectClient = (client) => {
    setSelectedClient(client);
    setClientQuery(client.name);
    setShowClientResults(false);
  };

  const handleSave = async () => {
    if (!selectedClient && !title) return;
    setSaving(true);
    const [first, ...rest] = (selectedClient?.name || title || '').split(' ');
    await onSave({
      title,
      first_name: first || '', last_name: rest.join(' ') || '',
      phone: selectedClient?.phone || '', email: selectedClient?.email || '',
      street: selectedClient?.address || '', city: selectedClient?.city || '',
      state: selectedClient?.state || '', zip: selectedClient?.zip || '',
      notes, services: [],
      salesperson,
      assessment_date: wantAssessment ? assessmentDate : null,
      assessment_time: wantAssessment ? assessmentTime : null,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="h-1 bg-amber-500 rounded-t-2xl shrink-0" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <h2 className="text-lg font-black text-primary">New Request</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-primary cursor-pointer"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="text-xs font-bold text-muted uppercase tracking-wider">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Mowing request" className={inputCls} />
          </div>

          {/* Select a client */}
          <div className="relative">
            <label className="text-xs font-bold text-muted uppercase tracking-wider">Select a client</label>
            <div className="relative mt-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={clientQuery} onChange={e => searchClients(e.target.value)}
                onFocus={() => { if (clientResults.length > 0) setShowClientResults(true); }}
                placeholder="Search clients..."
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50" />
              {clientSearching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted animate-spin" />}
            </div>
            {showClientResults && clientResults.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-card border border-border-subtle rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                {clientResults.map(c => (
                  <button key={c.id} onClick={() => selectClient(c)}
                    className="w-full px-4 py-3 text-left hover:bg-surface-alt cursor-pointer border-b border-border-subtle/50 last:border-0">
                    <p className="text-sm font-bold text-primary">{c.name}</p>
                    <p className="text-[11px] text-muted">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
                    {c.address && <p className="text-[11px] text-muted">{[c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')}</p>}
                  </button>
                ))}
              </div>
            )}
            {showClientResults && clientResults.length === 0 && clientQuery.length >= 2 && !clientSearching && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-card border border-border-subtle rounded-xl shadow-2xl p-4 text-center">
                <p className="text-xs text-muted">No clients found.</p>
              </div>
            )}
            {selectedClient && (
              <div className="mt-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-400 font-semibold flex items-center gap-2">
                <CheckCircle2 size={14} /> {selectedClient.name}
                {selectedClient.phone && <span className="text-muted ml-1">· {selectedClient.phone}</span>}
              </div>
            )}
          </div>

          {/* Requested on + Salesperson (read-only) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Requested on</label>
              <p className="mt-1 px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary">{today}</p>
            </div>
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Salesperson</label>
              <p className="mt-1 px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary">{salesperson || '—'}</p>
            </div>
          </div>

          <div className="border-t border-border-subtle" />

          {/* Overview */}
          <div>
            <h3 className="text-base font-black text-primary mb-3">Overview</h3>
            <label className="text-xs font-bold text-muted uppercase tracking-wider">Service details</label>
            <p className="text-[11px] text-muted mb-1">Please provide as much information as you can.</p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={inputCls + ' resize-none'} />
          </div>

          <div className="border-t border-border-subtle" />

          {/* On-site assessment toggle */}
          <div>
            <button type="button" onClick={() => setWantAssessment(!wantAssessment)}
              className="flex items-center gap-3 w-full text-left cursor-pointer group">
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${wantAssessment ? 'bg-brand border-brand' : 'border-border-subtle group-hover:border-muted'}`}>
                {wantAssessment && <Check size={14} className="text-on-brand" />}
              </div>
              <div>
                <p className="text-sm font-bold text-primary">Create on-site assessment</p>
                <p className="text-[11px] text-muted">Schedule a visit to assess the property before quoting</p>
              </div>
            </button>
            {wantAssessment && (
              <div className="grid grid-cols-2 gap-3 mt-3 ml-8">
                <div>
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">Date</label>
                  <input type="date" value={assessmentDate} onChange={e => setAssessmentDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">Time</label>
                  <input type="time" value={assessmentTime} onChange={e => setAssessmentTime(e.target.value)} className={inputCls} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted hover:text-primary cursor-pointer">Cancel</button>
          <button onClick={handleSave} disabled={saving || (!selectedClient && !title)}
            className="px-6 py-2.5 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Team Assign Dropdown ─── */
function TeamAssignDropdown({ members, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const selected = members.find(m => m.name === value);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-border-subtle text-sm text-primary hover:bg-surface-alt cursor-pointer transition-colors">
        {value ? (
          <>
            <span className="w-6 h-6 rounded-full bg-brand/20 text-brand text-[10px] font-bold flex items-center justify-center">
              {value.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </span>
            {value}
          </>
        ) : (
          <><Users size={14} className="text-muted" /> Assign <Plus size={14} className="text-muted" /></>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl py-1 min-w-[200px] max-h-[240px] overflow-y-auto">
          {value && (
            <button onClick={() => { onChange(''); setOpen(false); }}
              className="w-full px-4 py-2.5 text-left text-xs font-medium text-red-400 hover:bg-surface-alt cursor-pointer flex items-center gap-2">
              <X size={14} /> Unassign
            </button>
          )}
          {members.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted">No team members found</p>
          )}
          {members.map(m => (
            <button key={m.email} onClick={() => { onChange(m.name); setOpen(false); }}
              className={`w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-2.5 hover:bg-surface-alt cursor-pointer transition-colors ${value === m.name ? 'text-brand' : 'text-secondary'}`}>
              <span className="w-7 h-7 rounded-full bg-surface-alt text-[10px] font-bold flex items-center justify-center shrink-0">
                {m.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
              {m.name}
              {value === m.name && <Check size={14} className="ml-auto text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Detail View ─── */
function RequestDetail({ request, onBack, onStatusChange, onUpdate, onDelete }) {
  const r = request;
  const { currentUser, user } = useAuth();
  const permissions = useAppStore((s) => s.permissions) || {};
  const teamMembers = (() => {
    const list = Object.entries(permissions).map(([email, info]) => ({ email, name: info.name || email }));
    // Include the owner if not already in permissions
    const ownerEmail = user?.email?.toLowerCase();
    if (ownerEmail && !permissions[ownerEmail]) {
      list.unshift({ email: ownerEmail, name: currentUser || user?.user_metadata?.full_name || 'Owner' });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  })();
  const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown';
  const address = [r.street, r.city, r.state, r.zip].filter(Boolean).join(', ');
  const [showMore, setShowMore] = useState(false);
  const hasAssessment = !!(r.assessment_date || r.raw_payload?.assessment?.instructions);
  const [assessOpen, setAssessOpen] = useState(false);
  const [assessComplete, setAssessComplete] = useState(r.raw_payload?.assessment?.completed || false);
  const assess = r.raw_payload?.assessment || {};
  const [instructions, setInstructions] = useState(assess.instructions || '');
  const [startDate, setStartDate] = useState(r.assessment_date || '');
  const [startTime, setStartTime] = useState(r.assessment_time || '');
  const [endTime, setEndTime] = useState(assess.end_time || '');
  const [scheduleLater, setScheduleLater] = useState(!r.assessment_date);
  const [anytime, setAnytime] = useState(!r.assessment_time);
  const [assignee, setAssignee] = useState(assess.assignee || '');
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(r.title || '');
  const moreRef = useRef(null);
  const assessRef = useRef(null);
  const titleRef = useRef(null);
  const displayTitle = r.title || `Request for ${name}`;

  useEffect(() => {
    if (!showMore) return;
    const close = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMore]);

  const saveAssessment = async () => {
    setSaving(true);
    const assessData = {
      instructions: instructions || null,
      end_time: anytime ? null : endTime || null,
      assignee: assignee || null,
      completed: assessComplete,
    };
    await onUpdate(r.id, {
      assessment_date: scheduleLater ? null : startDate || null,
      assessment_time: anytime ? null : startTime || null,
      raw_payload: { ...(r.raw_payload || {}), assessment: assessData },
    });

    // Also create/update a schedule_items entry so it shows on the calendar
    if (!scheduleLater && startDate) {
      const org = r.org_id;
      if (org) {
        const startAt = anytime
          ? new Date(`${startDate}T00:00:00`).toISOString()
          : new Date(`${startDate}T${startTime || '09:00'}:00`).toISOString();
        const scheduleId = r.raw_payload?.assessment?.schedule_item_id;
        if (scheduleId) {
          await supabase.from('schedule_items').update({
            start_at: startAt, anytime, notes: instructions || null,
            assigned_to: assignee ? [assignee] : [], updated_at: new Date().toISOString(),
          }).eq('id', scheduleId);
        } else {
          const { data: inserted } = await supabase.from('schedule_items').insert({
            org_id: org, type: 'assessment',
            title: `Assessment: ${displayTitle}`,
            start_at: startAt, end_at: null, all_day: false, anytime,
            notes: instructions || null, status: 'scheduled',
            assigned_to: assignee ? [assignee] : [],
            request_id: r.id,
          }).select('id').single();
          if (inserted?.id) {
            await onUpdate(r.id, {
              raw_payload: { ...(r.raw_payload || {}), assessment: { ...assessData, schedule_item_id: inserted.id } },
            });
          }
        }
      }
    }

    setSaving(false);
    setAssessOpen(false);
  };

  const toggleComplete = async (val) => {
    setAssessComplete(val);
    await onUpdate(r.id, {
      raw_payload: {
        ...(r.raw_payload || {}),
        assessment: { ...assess, completed: val },
      },
    });
  };

  const handleScheduleClick = () => {
    setAssessOpen(true);
    setTimeout(() => assessRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted hover:text-primary cursor-pointer">
        <ArrowLeft size={16} /> Back to requests
      </button>

      {/* ── Status bar + actions ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_ORDER.map(s => {
            const cfg = STATUS_CONFIG[s];
            const active = r.status === s;
            if (!active) return null;
            return (
              <span key={s} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${cfg.dot === 'bg-blue-500' ? 'bg-blue-500/20 text-blue-400' : cfg.dot === 'bg-amber-500' ? 'bg-amber-500/20 text-amber-400' : cfg.dot === 'bg-green-600' ? 'bg-green-600/20 text-green-400' : 'bg-white/10 text-primary'}`}>
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />{cfg.label}
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={moreRef}>
            <button onClick={() => setShowMore(!showMore)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer transition-colors">
              <MoreHorizontal size={16} /> More
            </button>
            {showMore && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl py-1 min-w-[200px]">
                <button onClick={() => { onStatusChange(r.id, 'quoted'); setShowMore(false); }}
                  className="w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                  <FileText size={16} /> Convert to Quote
                </button>
                <button onClick={() => { onStatusChange(r.id, 'won'); setShowMore(false); }}
                  className="w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                  <Briefcase size={16} /> Convert to Job
                </button>
                <div className="border-t border-border-subtle my-1" />
                <button onClick={() => { onStatusChange(r.id, 'lost'); setShowMore(false); }}
                  className="w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                  <Archive size={16} /> Archive
                </button>
                <button onClick={() => { if (confirm('Delete this request?')) { onDelete(r.id); } setShowMore(false); }}
                  className="w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-red-400">
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            )}
          </div>
          <button onClick={handleScheduleClick}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer transition-colors">
            <CalendarDays size={16} /> Schedule Assessment
          </button>
        </div>
      </div>

      {/* ── Title ── */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-start justify-between">
          {editingTitle ? (
            <div className="flex-1 flex items-center gap-2">
              <input ref={titleRef} value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { onUpdate(r.id, { title: titleDraft || null }); setEditingTitle(false); }
                  if (e.key === 'Escape') { setTitleDraft(r.title || ''); setEditingTitle(false); }
                }}
                onBlur={() => { onUpdate(r.id, { title: titleDraft || null }); setEditingTitle(false); }}
                className="text-2xl font-black text-primary bg-transparent border-b-2 border-brand focus:outline-none flex-1" />
            </div>
          ) : (
            <h2 className="text-2xl font-black text-primary">{displayTitle}</h2>
          )}
          {!editingTitle && (
            <button onClick={() => { setEditingTitle(true); setTimeout(() => titleRef.current?.focus(), 50); }}
              className="p-1.5 text-muted hover:text-primary cursor-pointer shrink-0 ml-2">
              <Pencil size={16} />
            </button>
          )}
        </div>

        {/* Client info row */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 space-y-1.5">
            <p className="text-sm font-bold text-primary flex items-center gap-1.5">{name}</p>
            {address && <p className="flex items-center gap-2 text-sm text-secondary"><MapPin size={14} className="shrink-0 text-muted" /> {address}</p>}
            {r.phone && <a href={`tel:${r.phone}`} className="flex items-center gap-2 text-sm text-brand-text hover:underline"><Phone size={14} /> {r.phone}</a>}
            {r.email && <a href={`mailto:${r.email}`} className="flex items-center gap-2 text-sm text-brand-text hover:underline"><Mail size={14} /> {r.email}</a>}
          </div>
          <div className="flex gap-8">
            <div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Request Source</p>
              <p className="text-sm text-primary font-semibold mt-1 capitalize">{r.source || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Requested</p>
              <p className="text-sm text-primary font-semibold mt-1">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── On-site assessment ── */}
      <div ref={assessRef} className="rounded-xl bg-card border border-border-subtle p-5">
        <h3 className="text-lg font-black text-primary mb-4">On-site assessment</h3>

        {assessOpen ? (
          /* ── Editing form ── */
          <>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
              placeholder="Instructions" rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50 resize-none" />

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 mt-4">
              <div>
                <p className="text-sm font-black text-primary mb-2">Schedule</p>
                <div className="flex flex-wrap gap-2">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={scheduleLater}
                    className="px-3 py-2 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary focus:outline-none disabled:opacity-40 w-[160px]" />
                  <div className="flex rounded-lg overflow-hidden border border-border-subtle">
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} disabled={anytime}
                      className="px-3 py-2 bg-surface-alt text-sm text-primary focus:outline-none disabled:opacity-40 w-[110px]" />
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} disabled={anytime}
                      className="px-3 py-2 bg-surface-alt text-sm text-primary focus:outline-none border-l border-border-subtle disabled:opacity-40 w-[110px]" />
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div onClick={() => setScheduleLater(!scheduleLater)}
                      className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center transition-colors ${scheduleLater ? 'bg-brand border-brand' : 'border-border-subtle'}`}>
                      {scheduleLater && <Check size={12} className="text-on-brand" />}
                    </div>
                    <span className="text-xs text-secondary">Schedule later</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div onClick={() => setAnytime(!anytime)}
                      className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center transition-colors ${anytime ? 'bg-brand border-brand' : 'border-border-subtle'}`}>
                      {anytime && <Check size={12} className="text-on-brand" />}
                    </div>
                    <span className="text-xs text-secondary">Anytime</span>
                  </label>
                </div>
              </div>
              <div>
                <p className="text-sm font-black text-primary mb-2">Team</p>
                <TeamAssignDropdown members={teamMembers} value={assignee} onChange={setAssignee} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-border-subtle">
              <button onClick={() => setAssessOpen(false)}
                className="px-4 py-2 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer">Cancel</button>
              <button onClick={saveAssessment} disabled={saving}
                className="px-5 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </>
        ) : hasAssessment ? (
          /* ── Saved summary ── */
          <div className="relative">
            <button onClick={() => setAssessOpen(true)}
              className="absolute top-0 right-0 p-1.5 text-muted hover:text-primary cursor-pointer">
              <Pencil size={16} />
            </button>
            {assess.instructions && (
              <div className="mb-3">
                <p className="text-xs font-bold text-muted mb-1">Instructions</p>
                <p className="text-sm text-secondary">{assess.instructions}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-8">
              <div>
                <p className="text-xs font-bold text-muted mb-1">Schedule</p>
                <p className="text-sm text-primary font-semibold">
                  {r.assessment_date
                    ? new Date(r.assessment_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Not scheduled'}
                  {r.assessment_time ? ` @ ${new Date('2000-01-01T' + r.assessment_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                  {assess.end_time ? ` – ${new Date('2000-01-01T' + assess.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted mb-1">Team</p>
                {assess.assignee ? (
                  <p className="text-sm text-primary font-semibold flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-brand/20 text-brand text-[9px] font-bold flex items-center justify-center">
                      {assess.assignee.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    {assess.assignee}
                  </p>
                ) : (
                  <p className="text-sm text-red-400/70 font-semibold italic flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-red-500/10 text-red-400 text-[9px] flex items-center justify-center">✕</span>
                    Unassigned
                  </p>
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <div onClick={() => toggleComplete(!assessComplete)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${assessComplete ? 'bg-brand border-brand' : 'border-border-subtle hover:border-muted'}`}>
                {assessComplete && <Check size={13} className="text-on-brand" />}
              </div>
              <span className="text-sm text-secondary">Complete assessment</span>
            </label>
          </div>
        ) : (
          /* ── Empty placeholder ── */
          <button onClick={() => setAssessOpen(true)}
            className="w-full rounded-xl border-2 border-dashed border-border-subtle hover:border-muted py-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors group">
            <div className="w-12 h-12 rounded-full bg-surface-alt flex items-center justify-center group-hover:bg-white/10 transition-colors">
              <ClipboardList size={22} className="text-muted" />
            </div>
            <p className="text-sm text-muted">Visit the property to assess the job before you do the work</p>
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function Requests() {
  const { orgId, currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [statusMenu, setStatusMenu] = useState(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [statusSearch, setStatusSearch] = useState('');

  // Auto-open new request modal from Create menu (?new=1)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowNewRequest(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchRequests = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('requests').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    if (error) console.error('[Requests] fetch error:', error.message);
    setAllRequests(data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Close row status menu
  useEffect(() => {
    if (!statusMenu) return;
    const close = () => setStatusMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [statusMenu]);

  // Filtered requests
  const requests = (() => {
    let filtered = allRequests;
    if (statusFilter !== 'all') filtered = filtered.filter(r => r.status === statusFilter);
    const dateStart = getDateStart(dateFilter);
    if (dateStart) filtered = filtered.filter(r => new Date(r.created_at) >= dateStart);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(r =>
        [r.first_name, r.last_name, r.email, r.phone, r.city, r.street, ...(r.services || [])]
          .filter(Boolean).some(f => f.toLowerCase().includes(q))
      );
    }
    return filtered;
  })();

  const updateStatus = async (id, newStatus) => {
    const { error } = await supabase.from('requests')
      .update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { console.error('[Requests] update error:', error.message); return; }
    setAllRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    if (selected?.id === id) setSelected(prev => ({ ...prev, status: newStatus }));
    setStatusMenu(null);
  };

  const updateRequest = async (id, fields) => {
    const { error } = await supabase.from('requests')
      .update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { console.error('[Requests] update error:', error.message); return; }
    setAllRequests(prev => prev.map(r => r.id === id ? { ...r, ...fields } : r));
    if (selected?.id === id) setSelected(prev => ({ ...prev, ...fields }));
  };

  const deleteRequest = async (id) => {
    const { error } = await supabase.from('requests').delete().eq('id', id);
    if (error) { console.error('[Requests] delete error:', error.message); return; }
    setAllRequests(prev => prev.filter(r => r.id !== id));
    setSelected(null);
  };

  const createRequest = async (form) => {
    if (!orgId) return;
    const { error } = await supabase.from('requests').insert({
      org_id: orgId,
      title: form.title || null,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      email: form.email || null,
      phone: form.phone || null,
      street: form.street || null,
      city: form.city || null,
      state: form.state || null,
      zip: form.zip || null,
      services: form.services,
      source: form.source || null,
      notes: form.notes || null,
      salesperson: form.salesperson || null,
      assessment_date: form.assessment_date || null,
      assessment_time: form.assessment_time || null,
      status: 'new',
    });
    if (error) { console.error('[Requests] create error:', error.message); return; }
    setShowNewRequest(false);
    fetchRequests();
  };

  // Stats per status
  const statusCounts = {};
  for (const s of STATUS_ORDER) statusCounts[s] = allRequests.filter(r => r.status === s).length;
  const total = allRequests.length;
  const wonCount = statusCounts.won || 0;
  const convRate = total > 0 ? Math.round((wonCount / total) * 100) : 0;

  // Status filter options with counts
  const statusOptions = STATUS_ORDER.map(s => ({ id: s, ...STATUS_CONFIG[s], count: statusCounts[s] }));
  const filteredStatusOptions = statusSearch
    ? statusOptions.filter(o => o.label.toLowerCase().includes(statusSearch.toLowerCase()))
    : statusOptions;

  const activeStatusLabel = statusFilter === 'all' ? 'All' : STATUS_CONFIG[statusFilter]?.label || 'All';
  const activeDateLabel = DATE_RANGES.find(d => d.id === dateFilter)?.label || 'All';

  if (selected) {
    return <div className="max-w-2xl mx-auto"><RequestDetail request={selected} onBack={() => setSelected(null)} onStatusChange={updateStatus} onUpdate={updateRequest} onDelete={deleteRequest} /></div>;
  }

  return (
    <div className="space-y-5">
      {showNewRequest && <NewRequestModal onClose={() => setShowNewRequest(false)} onSave={createRequest} salesperson={currentUser} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-primary">Requests</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNewRequest(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer">
            <Plus size={16} /> New Request
          </button>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-card border border-border-subtle p-4">
          <p className="text-xs font-bold text-muted mb-3">Overview</p>
          <div className="space-y-1.5">
            {statusOptions.map(o => (
              <div key={o.id} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${o.dot}`} />
                <span className="text-secondary">{o.label} ({o.count})</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-bold text-muted">New requests</p>
            <TrendingUp size={14} className="text-emerald-500" />
          </div>
          <p className="text-xs text-muted">Past 30 days</p>
          <p className="text-3xl font-black text-primary mt-2">{allRequests.filter(r => r.status === 'new' && new Date(r.created_at) >= new Date(Date.now() - 30*86400000)).length}</p>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-bold text-muted">Conversion rate</p>
            <TrendingUp size={14} className={convRate >= 50 ? 'text-emerald-500' : 'text-amber-500'} />
          </div>
          <p className="text-xs text-muted">All time</p>
          <p className={`text-3xl font-black mt-2 ${convRate >= 50 ? 'text-emerald-400' : convRate >= 25 ? 'text-amber-400' : 'text-primary'}`}>{convRate}%</p>
        </div>
      </div>

      {/* All requests header + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <span className="text-sm font-bold text-primary">All requests</span>
            <span className="text-xs text-muted ml-2">({requests.length} results)</span>
          </div>

          {/* Status filter dropdown */}
          <Dropdown
            open={showStatusDropdown}
            onClose={() => { setShowStatusDropdown(false); setStatusSearch(''); }}
            trigger={
              <button onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-surface-alt border border-border-subtle text-xs font-bold text-primary cursor-pointer hover:border-border-strong transition-colors">
                Status <span className="text-muted">|</span> {activeStatusLabel}
                <ChevronDown size={12} className="text-muted" />
              </button>
            }>
            <div className="p-2">
              <input
                type="text" placeholder="Search statuses" value={statusSearch}
                onChange={e => setStatusSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-alt border border-border-subtle text-xs text-primary placeholder:text-muted focus:outline-none mb-1" />
            </div>
            <button onClick={() => { setStatusFilter('all'); setShowStatusDropdown(false); setStatusSearch(''); }}
              className="w-full px-4 py-2.5 text-left text-xs font-medium flex items-center justify-between hover:bg-surface-alt cursor-pointer text-primary">
              All {statusFilter === 'all' && <Check size={14} className="text-brand" />}
            </button>
            {filteredStatusOptions.map(o => (
              <button key={o.id} onClick={() => { setStatusFilter(o.id); setShowStatusDropdown(false); setStatusSearch(''); }}
                className="w-full px-4 py-2.5 text-left text-xs font-medium flex items-center gap-2 hover:bg-surface-alt cursor-pointer text-secondary">
                <span className={`w-2.5 h-2.5 rounded-full ${o.dot}`} />
                <span className="flex-1">{o.label} ({o.count})</span>
                {statusFilter === o.id && <Check size={14} className="text-brand" />}
              </button>
            ))}
          </Dropdown>

          {/* Date filter dropdown */}
          <Dropdown
            open={showDateDropdown}
            onClose={() => setShowDateDropdown(false)}
            trigger={
              <button onClick={() => setShowDateDropdown(!showDateDropdown)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-surface-alt border border-border-subtle text-xs font-bold text-primary cursor-pointer hover:border-border-strong transition-colors">
                <CalendarDays size={12} /> {activeDateLabel}
                <ChevronDown size={12} className="text-muted" />
              </button>
            }>
            {DATE_RANGES.map(d => (
              <button key={d.id} onClick={() => { setDateFilter(d.id); setShowDateDropdown(false); }}
                className="w-full px-4 py-2.5 text-left text-xs font-medium flex items-center justify-between hover:bg-surface-alt cursor-pointer text-secondary">
                {d.label}
                {dateFilter === d.id && <Check size={14} className="text-brand" />}
              </button>
            ))}
          </Dropdown>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="Search requests..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 rounded-lg bg-surface-alt border border-border-subtle text-xs text-primary placeholder:text-muted focus:outline-none focus:border-brand/50 w-full sm:w-52" />
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-brand" /></div>}

      {!loading && requests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox size={48} className="text-muted mb-4" />
          <h2 className="text-lg font-bold text-primary mb-1">No requests yet</h2>
          <p className="text-sm text-muted max-w-xs">When someone submits a form on your website, their request will show up here.</p>
        </div>
      )}

      {/* Table */}
      {!loading && requests.length > 0 && (
        <div className="rounded-xl border border-border-subtle overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-alt/50 text-left border-b border-border-subtle">
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted">Client ↕</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted hidden sm:table-cell">Title ↕</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted hidden md:table-cell">Property</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted hidden lg:table-cell">Contact</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted">Requested ↕</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted text-right">Status ↕</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r, i) => {
                  const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown';
                  const title = r.title
                    || (r.services?.length > 0 ? r.services.map(s => s.replace('-', ' ')).join(', ') : `Request for ${name}`);
                  const addr = r.street
                    ? `${r.street}, ${r.city || ''}${r.state ? `, ${r.state}` : ''} ${r.zip || ''}`.trim()
                    : [r.city, r.state, r.zip].filter(Boolean).join(', ') || '';
                  return (
                    <tr key={r.id} onClick={() => setSelected(r)}
                      className={`cursor-pointer transition-colors hover:bg-white/[0.02] ${i > 0 ? 'border-t border-border-subtle/50' : ''}`}>
                      <td className="px-4 py-3"><p className="font-bold text-primary">{name}</p></td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-secondary capitalize truncate max-w-[200px]">{title || '—'}</p>
                        {r.assessment_date && <p className="text-[10px] text-amber-400 mt-0.5 flex items-center gap-1"><ClipboardList size={10} /> Assessment scheduled</p>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell"><p className="text-secondary truncate max-w-[250px]">{addr || '—'}</p></td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="space-y-0.5">
                          {r.phone && <p className="text-secondary text-xs">{r.phone}</p>}
                          {r.email && <p className="text-muted text-xs truncate max-w-[200px]">{r.email}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><p className="text-secondary text-xs">{formatDate(r.created_at)}</p></td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <StatusDot status={r.status} onClick={e => { e.stopPropagation(); setStatusMenu(statusMenu === r.id ? null : r.id); }} />
                          {statusMenu === r.id && (
                            <div className="absolute right-0 top-7 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl py-1 min-w-[170px]" onClick={e => e.stopPropagation()}>
                              {STATUS_ORDER.map(s => {
                                const cfg = STATUS_CONFIG[s];
                                return (
                                  <button key={s} onClick={() => updateStatus(r.id, s)}
                                    className={`w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2 hover:bg-surface-alt cursor-pointer ${r.status === s ? cfg.text + ' font-bold' : 'text-secondary'}`}>
                                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />{cfg.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
