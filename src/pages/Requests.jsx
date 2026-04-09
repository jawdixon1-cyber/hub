import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Inbox, RefreshCw, Phone, Mail, MapPin, Loader2,
  ArrowLeft, MessageSquare, Search, TrendingUp,
  Plus, X, CalendarDays, ChevronDown, Check, CheckCircle2,
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
      assessment_date: assessmentDate, assessment_time: assessmentTime,
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

          {/* On-site assessment */}
          <div>
            <h3 className="text-base font-black text-primary mb-3">On-site assessment</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Date</label>
                <input type="date" value={assessmentDate} onChange={e => setAssessmentDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Time</label>
                <input type="time" value={assessmentTime} onChange={e => setAssessmentTime(e.target.value)} className={inputCls} />
              </div>
            </div>
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

/* ─── Detail View ─── */
function RequestDetail({ request, onBack, onStatusChange }) {
  const r = request;
  const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown';
  const address = [r.street, r.city, r.state, r.zip].filter(Boolean).join(', ');

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted hover:text-primary cursor-pointer">
        <ArrowLeft size={16} /> Back to requests
      </button>
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-black text-primary">{name}</h2>
            <p className="text-xs text-muted mt-1">Requested {formatDate(r.created_at)}</p>
          </div>
          <StatusDot status={r.status} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Contact</p>
            {r.phone && <a href={`tel:${r.phone}`} className="flex items-center gap-2 text-sm text-brand-text hover:underline"><Phone size={14} /> {r.phone}</a>}
            {r.email && <a href={`mailto:${r.email}`} className="flex items-center gap-2 text-sm text-brand-text hover:underline"><Mail size={14} /> {r.email}</a>}
            {r.sms_consent && <p className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1"><MessageSquare size={12} /> SMS consent</p>}
          </div>
          {address && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Property</p>
              <p className="flex items-center gap-2 text-sm text-secondary"><MapPin size={14} className="shrink-0" /> {address}</p>
            </div>
          )}
        </div>
        {r.services?.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">Services</p>
            <div className="flex flex-wrap gap-1.5">
              {r.services.map(s => <span key={s} className="px-2.5 py-1 rounded-lg bg-brand-light text-brand-text text-xs font-semibold capitalize">{s.replace('-', ' ')}</span>)}
            </div>
          </div>
        )}
        {r.source && (
          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Source</p>
            <p className="text-sm text-primary font-semibold capitalize">{r.source}{r.source_other ? ` — ${r.source_other}` : ''}</p>
          </div>
        )}
        {r.notes && (
          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Notes</p>
            <p className="text-sm text-secondary">{r.notes}</p>
          </div>
        )}
      </div>
      <div className="rounded-xl bg-card border border-border-subtle p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-3">Update Status</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map(s => {
            const cfg = STATUS_CONFIG[s];
            const active = r.status === s;
            return (
              <button key={s} onClick={() => onStatusChange(r.id, s)} disabled={active}
                className={`px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-2 ${
                  active ? 'bg-white/10 text-primary ring-1 ring-white/20' : 'bg-surface-alt text-muted hover:text-primary hover:bg-white/5'
                } disabled:cursor-default`}>
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />{cfg.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function Requests() {
  const { orgId, currentUser } = useAuth();
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

  const createRequest = async (form) => {
    if (!orgId) return;
    const { error } = await supabase.from('requests').insert({
      org_id: orgId,
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
    return <div className="max-w-2xl mx-auto"><RequestDetail request={selected} onBack={() => setSelected(null)} onStatusChange={updateStatus} /></div>;
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
                  const title = r.services?.length > 0
                    ? r.services.map(s => s.replace('-', ' ')).join(', ')
                    : `Request for ${r.first_name || 'client'}`;
                  const addr = r.street
                    ? `${r.street}, ${r.city || ''}${r.state ? `, ${r.state}` : ''} ${r.zip || ''}`.trim()
                    : [r.city, r.state, r.zip].filter(Boolean).join(', ') || '';
                  return (
                    <tr key={r.id} onClick={() => setSelected(r)}
                      className={`cursor-pointer transition-colors hover:bg-white/[0.02] ${i > 0 ? 'border-t border-border-subtle/50' : ''}`}>
                      <td className="px-4 py-3"><p className="font-bold text-primary">{name}</p></td>
                      <td className="px-4 py-3 hidden sm:table-cell"><p className="text-secondary capitalize truncate max-w-[200px]">{title}</p></td>
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
