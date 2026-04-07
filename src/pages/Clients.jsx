import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { Search, ArrowLeft, ChevronRight, ChevronDown, MapPin, Phone, Mail, FileText, User, List, Map as MapIcon, Plus, DollarSign, Send, X, Check } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';
import { genId } from '../data';
import { generateAgreementHTML } from '../utils/generateAgreement';

const ServiceAgreement = lazy(() => import('./ServiceAgreement'));
const Dominate = lazy(() => import('./Dominate'));
import { RecurringView } from './LaborEfficiency';

/* ─── Helpers ─── */

function fmtTime(hours) {
  if (!hours || hours <= 0) return '--';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

function fmt(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function getContractType(client) {
  // If has Jobber recurring jobs, it's recurring
  if (client.jobberJobs?.length > 0) {
    if (client.hasContract) return 'Full Service';
    return 'Recurring';
  }
  const services = client.services;
  if (!services || services.length === 0) return 'None';
  const ids = new Set(services.map((s) => s.id));
  const hasLawn = ids.has('lawn');
  const hasLeaf = ids.has('leaf');
  const hasExtras = ids.has('aeration') || ids.has('hedge') || ids.has('mulch') || ids.has('pine');
  if (hasLawn && hasExtras) return 'Full Service';
  if (hasLawn || hasLeaf) return 'Recurring';
  return 'Project Only';
}

function getContractColor(type) {
  if (type === 'Full Service') return 'bg-emerald-500/10 text-emerald-500';
  if (type === 'Recurring') return 'bg-blue-500/10 text-blue-500';
  if (type === 'Project Only') return 'bg-amber-500/10 text-amber-500';
  return 'bg-surface-alt text-muted';
}

/* ─── Client Map ─── */

function ClientMap({ clients, onSelect }) {
  // Simple map showing all client locations
  const clientsWithCoords = clients.filter((c) => c.mapCenter);

  if (clientsWithCoords.length === 0) {
    return (
      <div className="text-center py-12">
        <MapIcon size={32} className="mx-auto text-muted/30 mb-3" />
        <p className="text-sm text-muted">No mapped clients yet</p>
        <p className="text-xs text-muted mt-1">Create contracts with property measurements to see them here</p>
      </div>
    );
  }

  // Calculate center from all client locations
  const avgLat = clientsWithCoords.reduce((s, c) => s + c.mapCenter.lat, 0) / clientsWithCoords.length;
  const avgLng = clientsWithCoords.reduce((s, c) => s + c.mapCenter.lng, 0) / clientsWithCoords.length;

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-border-subtle" style={{ height: '400px' }}>
        <Suspense fallback={<div className="h-full bg-surface-alt animate-pulse" />}>
          <ClientMapInner center={[avgLat, avgLng]} clients={clientsWithCoords} onSelect={onSelect} />
        </Suspense>
      </div>
      <p className="text-xs text-muted text-center">{clientsWithCoords.length} client{clientsWithCoords.length !== 1 ? 's' : ''} mapped</p>
    </div>
  );
}

// Lazy inner component to avoid loading leaflet until needed
const ClientMapInner = lazy(() => import('../components/ClientMapInner'));

/* ─── Client List ─── */

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ClientList({ allClients, loading, onSelect }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('leads-and-active'); // 'all' | 'leads' | 'active' | 'leads-and-active'
  const [tagFilter, setTagFilter] = useState(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());

  // Time-based stats
  const stats = useMemo(() => {
    const now = Date.now();
    const days30 = now - 30 * 86400000;
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime();
    let newLeads30 = 0, newClients30 = 0, totalNewYTD = 0;
    let prevLeads30 = 0, prevClients30 = 0;
    const days60 = now - 60 * 86400000;
    for (const c of allClients) {
      if (!c.createdAt) continue;
      const t = new Date(c.createdAt).getTime();
      if (t >= days30) {
        if (c.isLead) newLeads30++;
        else newClients30++;
      } else if (t >= days60) {
        if (c.isLead) prevLeads30++;
        else prevClients30++;
      }
      if (t >= startOfYear && !c.isLead) totalNewYTD++;
    }
    const pct = (a, b) => b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : 0);
    return {
      total: allClients.length,
      leads: allClients.filter((c) => c.isLead).length,
      active: allClients.filter((c) => !c.isLead).length,
      newLeads30, newClients30, totalNewYTD,
      leadsChange: pct(newLeads30, prevLeads30),
      clientsChange: pct(newClients30, prevClients30),
    };
  }, [allClients]);

  // All available tags
  const allTags = useMemo(() => {
    const set = new Set();
    for (const c of allClients) for (const t of (c.tags || [])) set.add(t);
    return [...set].sort();
  }, [allClients]);

  const filtered = useMemo(() => {
    let list = [...allClients];
    if (statusFilter === 'leads') list = list.filter((c) => c.isLead);
    if (statusFilter === 'active') list = list.filter((c) => !c.isLead);
    // 'leads-and-active' and 'all' show everything
    if (tagFilter) list = list.filter((c) => (c.tags || []).includes(tagFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      const aT = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bT = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bT - aT;
    });
    return list;
  }, [allClients, search, statusFilter, tagFilter]);

  const toggleRow = (id) => setSelectedRows((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => {
    if (selectedRows.size === filtered.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(filtered.map((c) => c.id)));
  };

  if (loading && allClients.length === 0) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" /></div>;
  }

  const allSelected = filtered.length > 0 && selectedRows.size === filtered.length;

  return (
    <div className="space-y-5">
      {/* ─── Stat cards row ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-xs font-semibold text-secondary">New leads</p>
          <p className="text-[10px] text-muted mt-0.5">Past 30 days</p>
          <div className="flex items-baseline gap-2 mt-4">
            <p className="text-4xl font-bold text-primary">{stats.newLeads30}</p>
            {stats.leadsChange !== 0 && (
              <span className={`text-xs font-bold ${stats.leadsChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {stats.leadsChange >= 0 ? '↑' : '↓'} {Math.abs(stats.leadsChange)}%
              </span>
            )}
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-xs font-semibold text-secondary">New clients</p>
          <p className="text-[10px] text-muted mt-0.5">Past 30 days</p>
          <div className="flex items-baseline gap-2 mt-4">
            <p className="text-4xl font-bold text-primary">{stats.newClients30}</p>
            {stats.clientsChange !== 0 && (
              <span className={`text-xs font-bold ${stats.clientsChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {stats.clientsChange >= 0 ? '↑' : '↓'} {Math.abs(stats.clientsChange)}%
              </span>
            )}
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-xs font-semibold text-secondary">Total new clients</p>
          <p className="text-[10px] text-muted mt-0.5">Year to date</p>
          <p className="text-4xl font-bold text-primary mt-4">{stats.totalNewYTD}</p>
        </div>
      </div>

      {/* ─── Section header ─── */}
      <div>
        <h2 className="text-base font-bold text-primary">
          Filtered clients <span className="text-muted font-normal text-xs">({filtered.length} results)</span>
        </h2>
      </div>

      {/* ─── Filter row ─── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter by tag */}
          <div className="relative">
            <button
              onClick={() => setTagPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-border-subtle text-secondary hover:bg-surface-alt cursor-pointer"
            >
              {tagFilter || 'Filter by tag'}
              <ChevronDown size={12} />
            </button>
            {tagPickerOpen && (
              <div className="absolute z-20 mt-1 left-0 bg-card border border-border-subtle rounded-xl shadow-lg max-h-60 overflow-y-auto min-w-[180px]">
                <button
                  onClick={() => { setTagFilter(null); setTagPickerOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-muted hover:bg-surface-alt cursor-pointer border-b border-border-subtle/50"
                >
                  Clear filter
                </button>
                {allTags.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted">No tags</p>
                ) : allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTagFilter(t); setTagPickerOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-primary hover:bg-surface-alt cursor-pointer"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status pill — clickable to cycle */}
          <button
            onClick={() => {
              const cycle = ['leads-and-active', 'leads', 'active', 'all'];
              const idx = cycle.indexOf(statusFilter);
              setStatusFilter(cycle[(idx + 1) % cycle.length]);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-brand/10 text-brand-text hover:bg-brand/20 cursor-pointer"
          >
            Status: {statusFilter === 'leads-and-active' ? 'Leads and Active' : statusFilter === 'leads' ? 'Leads' : statusFilter === 'active' ? 'Active' : 'All'}
            <span className="text-[10px]">×</span>
          </button>
        </div>

        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-card border border-border-subtle text-xs text-primary placeholder:text-muted outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      {/* ─── Table ─── */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border-subtle text-center py-16">
          <User size={32} className="mx-auto text-muted/30 mb-3" />
          <p className="text-sm text-muted">{search ? 'No clients match your search' : 'No clients found'}</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border-subtle overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[24px_2fr_3fr_1.5fr_100px_100px] gap-4 px-5 py-3 border-b border-border-subtle text-[10px] font-bold text-muted uppercase tracking-wider items-center">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="cursor-pointer accent-brand"
            />
            <span>Name</span>
            <span>Address</span>
            <span>Tags</span>
            <span>Status</span>
            <span className="text-right">Last Activity</span>
          </div>
          {/* Rows */}
          <div className="divide-y divide-border-subtle/40">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-[24px_2fr_3fr_1.5fr_100px_100px] gap-4 px-5 py-3 hover:bg-surface-alt/40 transition-colors items-center group"
              >
                <input
                  type="checkbox"
                  checked={selectedRows.has(c.id)}
                  onChange={() => toggleRow(c.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="cursor-pointer accent-brand"
                />
                <button onClick={() => onSelect && onSelect(c)} className="min-w-0 text-left cursor-pointer">
                  <p className="text-sm font-semibold text-primary truncate group-hover:text-brand-text-strong">{c.name}</p>
                </button>
                <div className="min-w-0">
                  <p className="text-xs text-secondary truncate">
                    {c.address ? `${c.address}${c.city ? `, ${c.city}` : ''}${c.state ? `, ${c.state}` : ''}${c.zip ? ` ${c.zip}` : ''}` : <span className="text-muted">—</span>}
                  </p>
                </div>
                <div className="min-w-0 flex flex-wrap gap-1">
                  {c.tags?.length > 0 ? c.tags.slice(0, 3).map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded text-[9px] font-semibold bg-surface-alt text-muted">{t}</span>
                  )) : <span className="text-[10px] text-muted">—</span>}
                </div>
                <div>
                  {c.isLead ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Lead
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-muted">{timeAgo(c.updatedAt || c.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Client Profile ─── */

function ClientProfile({ client, agreement, onBack, onViewContract, onEditContract }) {
  const contractType = getContractType(client);
  const recurringServices = (client.services || []).filter((s) => s.priceLabel === '/visit');
  const projectServices = (client.services || []).filter((s) => s.calcType !== 'included' && s.priceLabel !== '/visit');
  const hasMap = client.measurements && client.measurements.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-surface-alt cursor-pointer">
          <ArrowLeft size={20} className="text-secondary" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-primary truncate">{client.name}</h1>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${getContractColor(contractType)}`}>
              {contractType}
            </span>
          </div>
        </div>
      </div>

      {/* Contact info */}
      <div className="bg-card rounded-2xl border border-border-subtle p-5 space-y-3">
        <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Contact</p>
        {client.address && (
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-muted shrink-0" />
            <p className="text-sm text-secondary">{client.address}{client.cityStateZip ? `, ${client.cityStateZip}` : ''}</p>
          </div>
        )}
        {client.phone && (
          <a href={`tel:${client.phone}`} className="flex items-center gap-2">
            <Phone size={14} className="text-muted shrink-0" />
            <p className="text-sm text-brand-text">{client.phone}</p>
          </a>
        )}
        {client.email && (
          <a href={`mailto:${client.email}`} className="flex items-center gap-2">
            <Mail size={14} className="text-muted shrink-0" />
            <p className="text-sm text-brand-text">{client.email}</p>
          </a>
        )}
      </div>

      {/* Revenue summary */}
      <div className="bg-card rounded-2xl border border-border-subtle p-5">
        <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Revenue</p>
        <div className="grid grid-cols-3 gap-3">
          {client.perVisit > 0 && (
            <div>
              <p className="text-[10px] text-muted">Per Visit</p>
              <p className="text-lg font-bold text-primary">${fmt(client.perVisit)}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] text-muted">Monthly</p>
            <p className="text-lg font-bold text-brand-text">${fmt(client.monthlyPrice || 0)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted">Annual</p>
            <p className="text-lg font-bold text-primary">${fmt(client.annualTotal || 0)}</p>
          </div>
        </div>
      </div>

      {/* Jobber recurring jobs */}
      {client.jobberJobs?.length > 0 && (
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Recurring Jobs</p>
          <div className="space-y-2">
            {client.jobberJobs.map((j, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border-subtle/50 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-primary">Job #{j.jobNumber}</p>
                  <p className="text-[10px] text-muted">{j.frequency}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-brand-text">${fmt(j.perVisit)}/visit</p>
                  <p className="text-[10px] text-muted">${fmt(j.monthly)}/mo</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contract / Term */}
      {client.termStart && (
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Contract</p>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs text-muted">Plan</span>
              <span className="text-xs font-semibold text-primary capitalize">{(client.planTier || 'total-care').replace(/-/g, ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted">Start</span>
              <span className="text-xs font-semibold text-primary">{new Date(client.termStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted">Term</span>
              <span className="text-xs font-semibold text-primary">{client.termMonths || 12} months</span>
            </div>
          </div>
          {agreement && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={onViewContract}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-brand text-brand-text text-sm font-semibold hover:bg-brand-light/10 cursor-pointer transition-colors"
              >
                <FileText size={16} /> View PDF
              </button>
              <button
                onClick={onEditContract}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover cursor-pointer transition-colors"
              >
                <FileText size={16} /> Edit Contract
              </button>
            </div>
          )}
        </div>
      )}

      {/* Recurring services */}
      {recurringServices.length > 0 && (
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Recurring Services</p>
          <div className="space-y-2">
            {recurringServices.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-border-subtle/50 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-primary">{s.name}</p>
                  <p className="text-[10px] text-muted">{s.frequency} · {s.season}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-brand-text">${fmt(s.price)}/visit</p>
                  <p className="text-[10px] text-muted">{s.visitsPerYear} visits · ${fmt(s.price * s.visitsPerYear)}/yr</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* One-off projects */}
      {projectServices.length > 0 && (
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Projects</p>
          <div className="space-y-2">
            {projectServices.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-border-subtle/50 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-primary">{s.name}</p>
                  <p className="text-[10px] text-muted">{s.frequency} · {s.season}</p>
                </div>
                <p className="text-sm font-bold text-brand-text">${fmt(s.price)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Property data */}
      {hasMap && (
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Property</p>
          <div className="grid grid-cols-2 gap-3">
            {(() => {
              const lawn = client.measurements.filter((m) => m.category === 'lawn').reduce((s, m) => s + (m.sqft || 0), 0);
              const beds = client.measurements.filter((m) => m.category === 'beds').reduce((s, m) => s + (m.sqft || 0), 0);
              return (
                <>
                  <div className="bg-surface-alt rounded-xl p-3">
                    <p className="text-[10px] text-muted">Lawn Area</p>
                    <p className="text-lg font-bold text-emerald-500">{Math.round(lawn).toLocaleString()} sq ft</p>
                  </div>
                  <div className="bg-surface-alt rounded-xl p-3">
                    <p className="text-[10px] text-muted">Bed Area</p>
                    <p className="text-lg font-bold text-red-400">{Math.round(beds).toLocaleString()} sq ft</p>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Notes */}
      <ClientNotes clientId={client.id} />
    </div>
  );
}

/* ─── Client Notes ─── */

function ClientNotes({ clientId }) {
  const clients = useAppStore((s) => s.clients) || [];
  const setClients = useAppStore((s) => s.setClients);
  const clientData = clients.find((c) => c.id === clientId) || {};
  const [note, setNote] = useState('');

  const notes = clientData.notes || [];

  const addNote = () => {
    if (!note.trim()) return;
    const updated = [...clients];
    const idx = updated.findIndex((c) => c.id === clientId);
    if (idx >= 0) {
      updated[idx] = { ...updated[idx], notes: [{ id: genId(), text: note.trim(), date: new Date().toISOString() }, ...(updated[idx].notes || [])] };
    } else {
      updated.push({ id: clientId, notes: [{ id: genId(), text: note.trim(), date: new Date().toISOString() }] });
    }
    setClients(updated);
    setNote('');
  };

  return (
    <div className="bg-card rounded-2xl border border-border-subtle p-5">
      <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Notes</p>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }}
          placeholder="Add a note..."
          className="flex-1 px-3 py-2 rounded-xl bg-surface-alt border border-border-subtle text-sm text-primary placeholder:text-muted outline-none focus:ring-1 focus:ring-brand"
        />
        <button onClick={addNote} disabled={!note.trim()} className="px-4 py-2 rounded-xl bg-brand text-on-brand text-sm font-semibold cursor-pointer disabled:opacity-40">
          Add
        </button>
      </div>
      {notes.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {notes.map((n) => (
            <div key={n.id} className="bg-surface-alt rounded-lg px-3 py-2">
              <p className="text-sm text-secondary">{n.text}</p>
              <p className="text-[10px] text-muted mt-1">{new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">No notes yet</p>
      )}
    </div>
  );
}

/* ─── FULL_BULLETS for regenerating contracts ─── */
const FULL_BULLETS = {
  lawn: ['Mow entire lawn at the proper height for your grass type (Mar-Oct)', 'String trim where mowers can\'t reach', 'Edge along all sidewalks, driveways, and curbs', 'Edge around landscape beds', 'Blow all clippings off hard surfaces', 'Blow all leaves off beds, porches, walkways, driveways (Nov-Feb)', 'Mulch leaves into the lawn to return nutrients to the soil', 'Keep beds and the entire property looking clean year-round'],
  leaf: ['Blow all leaves off landscape beds, porches, walkways, driveways, and hard surfaces', 'Mulch leaves into the lawn to return nutrients to the soil', 'Trim grass as needed', 'Keep beds and the entire property looking clean'],
  aeration: ['Core aerate the entire lawn with commercial-grade equipment', 'Thickens your lawn with LESCO Tall Fescue Select Blend (Certified Tag) — a professional-grade seed trusted on golf courses and athletic fields. Certified for purity (no weeds, no filler) and bred for density, drought tolerance, and disease resistance, it establishes a cleaner, fuller lawn than store-bought blends'],
  sticks: ['Pick up all sticks on the property every visit', 'Haul away and dispose of off-site'],
  hedge: ['Shape and trim all shrubs, bushes, and hedges on the property', 'Remove all clippings and debris from beds and surrounding areas', 'Maintain natural shape while keeping growth in check'],
  mulch: null, // dynamic — uses saved mulchDepth
  pine: ['Weed all landscape beds before installation', 'Install fresh pine needles in all landscape beds', 'Clean up all walkways, driveways, and hard surfaces after installation'],
};

const PLAN_TIERS = [
  { id: 'total-care', name: 'Total Care', addonPerMonth: 0, description: 'All selected services bundled into one predictable monthly payment', extras: [] },
  { id: 'total-care-plus', name: 'Total Care Plus', addonPerMonth: 100, popular: true, description: 'Includes everything in Total Care +', extras: ['Leaf Upgrade (Nov-Feb): Haul off all leaves instead of mulching', 'Seasonal Bed Refresh (Fall): Turn and fluff existing mulch'] },
  { id: 'total-care-premium', name: 'Total Care Premium', addonPerMonth: 220, description: 'Includes everything in Total Care Plus +', extras: ['Up to 2 priority touch-up visits per year', 'Up to 3 storm cleanup visits per year', '48-hour priority requests'] },
];

/* ─── Raise Prices ─── */

function RaisePrices({ onBack, recurringClients }) {
  const [selected, setSelected] = useState(() => new Set((recurringClients || []).filter(c => c.monthly > 0).map(c => c.name)));
  const [increaseType, setIncreaseType] = useState('percent'); // 'percent' | 'flat'
  const [increaseAmount, setIncreaseAmount] = useState('10');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [message, setMessage] = useState(`Hi [First Name],\n\nThank you for being a valued client of Hey Jude's Lawn Care. We wanted to give you advance notice that starting [Effective Date], there will be a small adjustment to your service rate.\n\nYour new rate will be [New Rate] per visit (previously [Old Rate]). This change helps us continue delivering the same high-quality service you've come to expect — sharp results, reliable scheduling, and clear communication every visit.\n\nIf you have any questions, don't hesitate to reach out. We truly appreciate your loyalty.\n\nBest,\nJude\nHey Jude's Lawn Care\n(803) 902-7447`);
  const [step, setStep] = useState('select');
  const [sending, setSending] = useState(false);

  const pct = parseFloat(increaseAmount) || 0;
  const getNewPrice = (perVisit) => {
    if (increaseType === 'percent') return Math.round(perVisit * (1 + pct / 100));
    return Math.round(perVisit + pct);
  };

  const enriched = (recurringClients || []).filter(c => c.monthly > 0).map(c => ({
    ...c,
    newPrice: getNewPrice(c.perVisit),
    increase: getNewPrice(c.perVisit) - c.perVisit,
  })).sort((a, b) => (b.laborPct ?? -1) - (a.laborPct ?? -1));

  const toggle = (name) => setSelected(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const selectAll = () => setSelected(new Set(enriched.map(c => c.name)));
  const selectNone = () => setSelected(new Set());
  const selectUnprofitable = () => setSelected(new Set(enriched.filter(c => c.laborPct != null && c.laborPct > 25).map(c => c.name)));

  const selectedClients = enriched.filter(c => selected.has(c.name));

  const [sendResults, setSendResults] = useState(null);

  const handleSend = async () => {
    if (!message.trim() || selectedClients.length === 0) return;
    setSending(true);
    try {
      const dateFmt = effectiveDate ? new Date(effectiveDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '[Date TBD]';
      const res = await fetch('/api/ghl?action=send-bulk-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clients: selectedClients.map(c => ({
            name: c.name,
            phone: c.phone || null,
            email: c.email || null,
            oldPrice: c.perVisit,
            newPrice: c.newPrice,
            effectiveDate: dateFmt,
          })),
          message: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setSendResults(data);
      setStep('sent');
    } catch (e) {
      alert('Failed: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  if (step === 'sent') {
    const sentCount = sendResults?.sent || 0;
    const failedResults = (sendResults?.results || []).filter(r => r.status !== 'sent');
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted hover:text-secondary cursor-pointer"><ArrowLeft size={16} /> Back</button>
        <div className="text-center py-8 space-y-3">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto"><Send size={24} className="text-emerald-500" /></div>
          <p className="text-lg font-bold text-primary">Sent to {sentCount} of {sendResults?.total || selectedClients.length} clients</p>
        </div>
        {failedResults.length > 0 && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-1">
            <p className="text-xs font-bold text-red-500">{failedResults.length} failed:</p>
            {failedResults.map((r, i) => (
              <p key={i} className="text-xs text-muted">{r.name} — {r.status === 'not_found' ? 'Not found in GHL' : r.error || r.status}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step === 'message') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('select')} className="p-2 rounded-lg hover:bg-surface-alt cursor-pointer"><ArrowLeft size={20} className="text-secondary" /></button>
          <div>
            <h1 className="text-xl font-bold text-primary">Write Message</h1>
            <p className="text-xs text-muted">Sending to {selectedClients.length} clients</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {selectedClients.map(c => (
            <span key={c.name} className="px-2 py-0.5 rounded-full bg-surface-alt text-[10px] text-muted">{c.name.split(' ')[0]}</span>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={14}
          className="w-full bg-card border border-border-subtle rounded-xl p-4 text-sm text-primary placeholder:text-muted outline-none focus:ring-1 focus:ring-brand resize-none"
        />
        <p className="text-[10px] text-muted">Use [First Name], [Date], [New Rate] as placeholders. Your GHL workflow handles merge fields and delivery.</p>

        <button onClick={handleSend} disabled={sending || !message.trim()}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-brand text-on-brand font-black text-lg hover:bg-brand-hover cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]">
          <Send size={20} /> {sending ? 'Sending...' : `Send to ${selectedClients.length} Clients`}
        </button>
      </div>
    );
  }

  // Step: select clients
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-surface-alt cursor-pointer"><ArrowLeft size={20} className="text-secondary" /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-primary">Raise Prices</h1>
          <p className="text-xs text-muted">Select which clients to notify</p>
        </div>
        <span className="text-sm font-bold text-brand-text">{selected.size} selected</span>
      </div>

      {/* Price increase controls */}
      <div className="bg-card rounded-2xl border border-border-subtle p-4 space-y-3">
        <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Increase Amount</p>
        <div className="flex gap-2 items-center">
          <div className="flex gap-1 bg-surface-alt p-1 rounded-lg">
            <button onClick={() => setIncreaseType('percent')} className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${increaseType === 'percent' ? 'bg-card text-primary shadow-sm' : 'text-muted'}`}>%</button>
            <button onClick={() => setIncreaseType('flat')} className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${increaseType === 'flat' ? 'bg-card text-primary shadow-sm' : 'text-muted'}`}>$</button>
          </div>
          <input type="number" value={increaseAmount} onChange={(e) => setIncreaseAmount(e.target.value)}
            className="w-24 px-3 py-2 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary font-bold text-center outline-none focus:ring-1 focus:ring-brand" />
          <span className="text-sm text-muted">{increaseType === 'percent' ? '% increase' : '$ per visit increase'}</span>
        </div>
        <div>
          <label className="text-[10px] text-muted font-bold">Effective Date</label>
          <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary outline-none focus:ring-1 focus:ring-brand" />
        </div>
      </div>

      {/* Quick select buttons */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={selectAll} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-surface-alt text-secondary hover:bg-brand-light cursor-pointer">Select All</button>
        <button onClick={selectNone} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-surface-alt text-secondary hover:bg-brand-light cursor-pointer">Deselect All</button>
        <button onClick={selectUnprofitable} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20 cursor-pointer">Select Unprofitable (25%+)</button>
      </div>

      {/* Client list with checkboxes */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-3 px-4 text-[9px] font-bold text-muted uppercase">
          <span className="w-6"></span>
          <span className="flex-1">Client</span>
          <span className="w-16 text-right">Current</span>
          <span className="w-16 text-right">New</span>
          <span className="w-12 text-right">+$</span>
          <span className="w-14 text-right">Labor</span>
        </div>
        {enriched.map(c => (
          <button key={c.name} onClick={() => toggle(c.name)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left cursor-pointer transition-colors ${selected.has(c.name) ? 'bg-brand-light/10 border-brand/20' : 'bg-card border-border-subtle hover:bg-surface-alt/50'}`}>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${selected.has(c.name) ? 'bg-brand border-brand' : 'border-border-strong'}`}>
              {selected.has(c.name) && <Check size={12} className="text-on-brand" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-primary truncate">{c.name}</p>
              <p className="text-[10px] text-muted">{c.jobs?.[0]?.frequency || 'Recurring'}</p>
            </div>
            <span className="w-16 text-right text-[11px] text-muted">${Math.round(c.perVisit)}</span>
            <span className="w-16 text-right text-[11px] font-black text-brand-text">${c.newPrice}</span>
            <span className="w-12 text-right text-[11px] font-bold text-emerald-500">+${c.increase}</span>
            <span className={`w-14 text-right text-[11px] font-black ${c.laborPct != null ? (c.laborPct > 30 ? 'text-red-500' : c.laborPct > 25 ? 'text-amber-500' : 'text-emerald-500') : 'text-muted'}`}>{c.laborPct != null ? `${c.laborPct}%` : '--'}</span>
          </button>
        ))}
      </div>

      {/* Summary */}
      {selected.size > 0 && (() => {
        const sel = enriched.filter(c => selected.has(c.name));
        const totalCurrentMonthly = sel.reduce((s, c) => s + c.monthly, 0);
        const totalNewMonthly = sel.reduce((s, c) => s + (c.newPrice * (c.monthly / (c.perVisit || 1))), 0);
        return (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
            <span className="text-xs text-muted">Additional monthly revenue</span>
            <span className="text-lg font-black text-emerald-500">+${fmt(totalNewMonthly - totalCurrentMonthly)}/mo</span>
          </div>
        );
      })()}

      <button onClick={() => setStep('message')} disabled={selected.size === 0}
        className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-brand text-on-brand font-black text-lg hover:bg-brand-hover cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]">
        Next: Write Message ({selected.size})
      </button>
    </div>
  );
}

/* ─── Main ─── */

export default function Clients() {
  const agreements = useAppStore((s) => s.agreements) || [];
  const savedClients = useAppStore((s) => s.clients) || [];
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('crm'); // 'crm' | 'recurring' | 'map' | 'contract' | 'raise'
  const [editingContractId, setEditingContractId] = useState(null);
  const [selectedRecurring, setSelectedRecurring] = useState(null);
  const [expandedVisit, setExpandedVisit] = useState(null);
  const [jobberClients, setJobberClients] = useState([]);
  const [loadingJobber, setLoadingJobber] = useState(true);
  const [allJobberClients, setAllJobberClients] = useState([]);
  const [loadingAllClients, setLoadingAllClients] = useState(true);

  // Fetch all data once on mount
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const yearStart = today.slice(0, 4) + '-01-01';

    // Recurring clients
    fetch(`/api/commander/summary?start=${yearStart}&end=${today}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.recurringClientList) setJobberClients(data.recurringClientList);
      })
      .catch(() => {})
      .finally(() => setLoadingJobber(false));

    // All clients (CRM)
    fetch('/api/jobber-data?action=all-clients')
      .then((r) => r.ok ? r.json() : [])
      .then(setAllJobberClients)
      .catch(() => {})
      .finally(() => setLoadingAllClients(false));
  }, []);

  // Build agreements lookup by client name
  const agreementsByName = useMemo(() => {
    const map = new Map();
    for (const a of agreements) {
      const key = (a.clientName || '').toLowerCase().trim();
      const existing = map.get(key);
      if (!existing || new Date(a.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
        map.set(key, a);
      }
    }
    return map;
  }, [agreements]);

  // Merge Jobber recurring clients with agreement data
  const clientList = useMemo(() => {
    const list = jobberClients.map((jc) => {
      const agreement = agreementsByName.get((jc.name || '').toLowerCase().trim());
      return {
        id: agreement?.id || jc.name,
        name: jc.name,
        phone: agreement?.clientPhone || '',
        email: agreement?.clientEmail || '',
        address: agreement?.clientAddress || '',
        cityStateZip: agreement?.clientCityStateZip || '',
        // Jobber data
        jobberJobs: jc.jobs || [],
        perVisit: jc.perVisit || 0,
        monthlyPrice: jc.monthly || 0,
        annualTotal: (jc.monthly || 0) * 12,
        jobCount: jc.jobCount || 0,
        // Agreement data (if exists)
        services: agreement?.services || [],
        planTier: agreement?.planTier,
        termStart: agreement?.termStart,
        termMonths: agreement?.termMonths,
        measurements: agreement?.measurements || [],
        mapCenter: agreement?.mapCenter || null,
        createdAt: agreement?.createdAt,
        updatedAt: agreement?.updatedAt,
        agreementId: agreement?.id || null,
        hasContract: !!agreement,
      };
    });

    // Also add any agreement-only clients not in Jobber
    for (const a of agreements) {
      const key = (a.clientName || '').toLowerCase().trim();
      if (!jobberClients.some((jc) => (jc.name || '').toLowerCase().trim() === key)) {
        list.push({
          id: a.id,
          name: a.clientName || 'Unknown',
          phone: a.clientPhone || '',
          email: a.clientEmail || '',
          address: a.clientAddress || '',
          cityStateZip: a.clientCityStateZip || '',
          jobberJobs: [],
          perVisit: 0,
          monthlyPrice: a.monthlyPrice || 0,
          annualTotal: a.annualTotal || 0,
          jobCount: 0,
          services: a.services || [],
          planTier: a.planTier,
          termStart: a.termStart,
          termMonths: a.termMonths,
          measurements: a.measurements || [],
          mapCenter: a.mapCenter || null,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          agreementId: a.id,
          hasContract: true,
        });
      }
    }
    return list;
  }, [jobberClients, agreements, agreementsByName]);

  const totalRevenue = useMemo(() => clientList.reduce((s, c) => s + (c.monthlyPrice || 0), 0), [clientList]);

  const selected = selectedId ? clientList.find((c) => c.id === selectedId) : null;
  const agreement = selected?.agreementId ? agreements.find((a) => a.id === selected.agreementId) : null;

  // View contract PDF
  const handleViewContract = () => {
    if (!agreement) return;
    const termStart = agreement.termStart ? new Date(agreement.termStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
    const html = generateAgreementHTML({
      client: { name: agreement.clientName, phone: agreement.clientPhone || '', email: agreement.clientEmail || '', address: agreement.clientAddress || '', cityStateZip: agreement.clientCityStateZip || 'Rock Hill, SC 29732' },
      services: (agreement.services || []).map((s) => {
        let bullets = FULL_BULLETS[s.id] || [s.name];
        // Make hedge bullet dynamic with saved season
        if (s.id === 'hedge' && s.season) {
          bullets = [`Shape and trim all shrubs, bushes, and hedges on the property (${s.season})`, 'Remove all clippings and debris from beds and surrounding areas', 'Maintain natural shape while keeping growth in check'];
        }
        // Make aeration bullet dynamic with saved visit data
        if (s.id === 'aeration') {
          bullets = ['Core aerate the entire lawn with commercial-grade equipment', 'Thickens your lawn with LESCO Tall Fescue Select Blend (Certified Tag) — a professional-grade seed trusted on golf courses and athletic fields. Certified for purity (no weeds, no filler) and bred for density, drought tolerance, and disease resistance, it establishes a cleaner, fuller lawn than store-bought blends'];
        }
        // Make mulch bullet dynamic with saved depth
        if (s.id === 'mulch') {
          const depth = agreement.mulchDepth || '3';
          bullets = ['Weed all landscape beds before installation', `Install fresh mulch in all landscape beds at ${depth} inches deep`, 'Edge beds cleanly before installation', 'Clean up all walkways, driveways, and hard surfaces after installation'];
        }
        return {
          name: s.name, frequency: s.frequency || '', season: s.season || '', bullets,
          price: s.price, priceLabel: s.priceLabel || '',
          visitsPerYear: s.visitsPerYear || 1, calcType: s.calcType || 'item',
        };
      }),
      plans: PLAN_TIERS.map((p) => ({ name: p.name, monthlyPrice: `$${fmt(Math.round((agreement.annualTotal || 0) / 12) + p.addonPerMonth)}`, description: p.description, extras: p.extras, popular: p.popular || false })),
      term: { startDate: termStart, endDate: '', months: agreement.termMonths || 12 },
    });
    const win = window.open('', '_blank'); win.document.write(html); win.document.close();
  };

  // Client profile view
  if (selected && view !== 'contract') {
    return <ClientProfile client={selected} agreement={agreement} onBack={() => setSelectedId(null)} onViewContract={handleViewContract} onEditContract={() => { setEditingContractId(agreement?.id || null); setView('contract'); }} />;
  }

  // Recurring client profile
  if (selectedRecurring) {
    const rc = selectedRecurring;
    const laborPct = rc.laborPct;
    const visits = rc.visitDetails || [];
    const currentFreq = rc.jobs?.[0]?.frequency || '';
    const isWeekly = currentFreq === 'Weekly';
    const savedClient = savedClients.find((c) => c.name?.toLowerCase().trim() === rc.name?.toLowerCase().trim());
    const quotedWeekly = savedClient?.weeklyPrice || null;
    const quotedEow = savedClient?.eowPrice || null;
    const currentPerVisit = rc.perVisit || 0;
    const displayWeekly = quotedWeekly || (isWeekly ? currentPerVisit : null);
    const displayEow = quotedEow || (!isWeekly ? currentPerVisit : null);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedRecurring(null); setExpandedVisit(null); }} className="p-2 rounded-lg hover:bg-surface-alt cursor-pointer">
            <ArrowLeft size={20} className="text-secondary" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-primary truncate">{rc.name}</h1>
            <p className="text-xs text-muted">{currentFreq || 'Recurring'} · ${fmt(rc.perVisit || 0)}/visit</p>
          </div>
        </div>

        {/* Stats */}
        {(() => {
          const avgLaborCost = visits.length > 0 ? visits.reduce((s, v) => s + v.laborCost, 0) / visits.length : 0;
          const monthlyLaborEst = avgLaborCost * (rc.monthly > 0 && rc.perVisit > 0 ? rc.monthly / rc.perVisit : 0);
          const monthlyProfit = (rc.monthly || 0) - monthlyLaborEst;
          return (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card rounded-2xl border border-border-subtle p-4 text-center">
                <p className="text-[9px] font-bold text-muted uppercase">Per Visit</p>
                <p className="text-2xl font-black text-primary mt-1">${fmt(rc.perVisit || 0)}</p>
              </div>
              <div className="bg-card rounded-2xl border border-border-subtle p-4 text-center">
                <p className="text-[9px] font-bold text-muted uppercase">Monthly Rev</p>
                <p className="text-2xl font-black text-brand-text mt-1">${fmt(rc.monthly || 0)}</p>
              </div>
              <div className="bg-card rounded-2xl border border-border-subtle p-4 text-center">
                <p className="text-[9px] font-bold text-muted uppercase">Monthly Profit</p>
                <p className={`text-2xl font-black mt-1 ${monthlyProfit > 0 ? 'text-emerald-500' : 'text-muted'}`}>{visits.length > 0 ? `$${fmt(monthlyProfit)}` : '--'}</p>
              </div>
            </div>
          );
        })()}
        <div className={`rounded-2xl border p-6 text-center ${laborPct != null ? (laborPct > 30 ? 'bg-red-500/5 border-red-500/20' : laborPct > 25 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-emerald-500/5 border-emerald-500/20') : 'bg-card border-border-subtle'}`}>
          <p className="text-[9px] font-bold text-muted uppercase">Average Labor %</p>
          <p className={`text-5xl font-black mt-2 ${laborPct != null ? (laborPct > 30 ? 'text-red-500' : laborPct > 25 ? 'text-amber-500' : 'text-emerald-500') : 'text-muted'}`}>{laborPct != null ? `${laborPct.toFixed(0)}%` : '--'}</p>
        </div>

        {/* Pricing */}
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Pricing</p>
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-xl p-4 text-center ${isWeekly ? 'bg-brand-light/10 border border-brand/20' : 'bg-surface-alt'}`}>
              <p className="text-[9px] font-bold text-muted uppercase">Weekly</p>
              <p className="text-xl font-black text-primary mt-1">{displayWeekly ? `$${fmt(displayWeekly)}` : '--'}</p>
              {isWeekly && <p className="text-[9px] font-bold text-brand-text mt-1">Current</p>}
            </div>
            <div className={`rounded-xl p-4 text-center ${!isWeekly ? 'bg-brand-light/10 border border-brand/20' : 'bg-surface-alt'}`}>
              <p className="text-[9px] font-bold text-muted uppercase">Every Other Week</p>
              <p className="text-xl font-black text-primary mt-1">{displayEow ? `$${fmt(displayEow)}` : '--'}</p>
              {!isWeekly && <p className="text-[9px] font-bold text-brand-text mt-1">Current</p>}
            </div>
          </div>
          {savedClient?.quotedAt && <p className="text-[9px] text-muted text-center mt-2">Quoted {new Date(savedClient.quotedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
        </div>

        {/* Visit History */}
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-3">Visit History (Last 30 Days)</p>
          {visits.length > 0 ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-2 py-1 text-[9px] font-bold text-muted uppercase">
                <span className="flex-1">Date</span>
                <span className="w-16 text-right">Revenue</span>
                <span className="w-16 text-right">Labor $</span>
                <span className="w-14 text-right">Labor %</span>
                <span className="w-14 text-right">Hours</span>
              </div>
              {visits.sort((a, b) => b.date.localeCompare(a.date)).map((v, vi) => (
                <div key={vi}>
                  <button onClick={() => setExpandedVisit(expandedVisit === vi ? null : vi)} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg bg-surface-alt/50 text-[11px] cursor-pointer hover:bg-surface-alt transition-colors text-left">
                    <span className="flex-1 text-muted">{v.date ? new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '--'}</span>
                    <span className="w-16 text-right text-primary font-semibold">${Math.round(v.revenue)}</span>
                    <span className="w-16 text-right text-primary">${Math.round(v.laborCost)}</span>
                    <span className={`w-14 text-right font-bold ${v.laborPct != null ? (v.laborPct > 30 ? 'text-red-500' : v.laborPct > 25 ? 'text-amber-500' : 'text-emerald-500') : 'text-muted'}`}>{v.laborPct != null ? `${v.laborPct}%` : '--'}</span>
                    <span className="w-14 text-right text-muted">{fmtTime(v.hours)}</span>
                  </button>
                  {expandedVisit === vi && (
                    <div className="ml-4 mr-2 my-1 p-3 rounded-lg border border-border-subtle bg-card space-y-2">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Crew Breakdown</p>
                      {Object.keys(v.crew || {}).length > 0 ? (
                        <>
                          <div className="flex items-center gap-2 text-[9px] font-bold text-muted uppercase">
                            <span className="flex-1">Person</span>
                            <span className="w-14 text-right">Rate</span>
                            <span className="w-14 text-right">Hours</span>
                            <span className="w-16 text-right">Cost</span>
                          </div>
                          {Object.entries(v.crew).map(([person, data]) => (
                            <div key={person} className="flex items-center gap-2 text-[11px]">
                              <span className="flex-1 text-primary font-semibold">{person}</span>
                              <span className="w-14 text-right text-muted">${data.rate?.toFixed(0) || '?'}/hr</span>
                              <span className="w-14 text-right text-muted">{fmtTime(data.hours)}</span>
                              <span className="w-16 text-right text-primary font-semibold">${Math.round(data.cost || 0)}</span>
                            </div>
                          ))}
                          <div className="flex items-center gap-2 text-[11px] pt-1 border-t border-border-subtle/50">
                            <span className="flex-1 text-muted font-bold">Total Labor</span>
                            <span className="w-14 text-right"></span>
                            <span className="w-14 text-right text-muted font-bold">{fmtTime(v.hours)}</span>
                            <span className="w-16 text-right text-primary font-bold">${Math.round(v.laborCost)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border-subtle/50">
                            <span className="text-muted">Revenue: <span className="text-primary font-bold">${Math.round(v.revenue)}</span> — Labor: <span className="text-primary font-bold">${Math.round(v.laborCost)}</span></span>
                            <span className={`font-bold ${v.laborPct != null ? (v.laborPct > 30 ? 'text-red-500' : v.laborPct > 25 ? 'text-amber-500' : 'text-emerald-500') : 'text-muted'}`}>{v.laborPct != null ? `${v.laborPct}% labor` : '--'}</span>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-muted">No crew data for this visit</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {/* Average */}
              <div className="flex items-center gap-2 px-2 py-2 rounded-lg border border-brand/20 text-[11px] font-bold mt-1">
                <span className="flex-1 text-primary">Average ({visits.length} visits)</span>
                <span className="w-16 text-right text-primary">${Math.round(visits.reduce((s, v) => s + v.revenue, 0) / visits.length)}</span>
                <span className="w-16 text-right text-primary">${Math.round(visits.reduce((s, v) => s + v.laborCost, 0) / visits.length)}</span>
                <span className={`w-14 text-right ${laborPct != null ? (laborPct > 30 ? 'text-red-500' : laborPct > 25 ? 'text-amber-500' : 'text-emerald-500') : 'text-muted'}`}>{laborPct != null ? `${laborPct.toFixed(0)}%` : '--'}</span>
                <span className="w-14 text-right text-muted">{visits.length > 0 ? fmtTime(visits.reduce((s, v) => s + v.hours, 0) / visits.length) : '--'}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">No visit data from the last 30 days</p>
          )}
        </div>

      </div>
    );
  }

  // Raise prices view
  if (view === 'raise') {
    return <RaisePrices onBack={() => setView('crm')} recurringClients={jobberClients} />;
  }

  // Contract builder view (new or edit)
  if (view === 'contract') {
    return (
      <div className="space-y-4">
        <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" /></div>}>
          <ServiceAgreement editId={editingContractId} onDone={() => { setView('list'); setEditingContractId(null); setSelectedId(null); }} />
        </Suspense>
      </div>
    );
  }

  // Main view with tabs
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between pt-6">
        <div>
          <h1 className="text-3xl font-bold text-primary tracking-tight">Clients</h1>
          <p className="text-sm text-muted mt-1">Your CRM — clients, recurring services, and territory map</p>
        </div>
        <div className="flex items-center gap-2">
          {view === 'recurring' && (
            <button
              onClick={() => setView('raise')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-xs font-semibold text-secondary cursor-pointer hover:bg-surface-alt transition-colors"
            >
              <DollarSign size={14} /> Raise Prices
            </button>
          )}
          <button
            onClick={() => { setEditingContractId(null); setView('contract'); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-on-brand text-xs font-semibold cursor-pointer hover:bg-brand-hover transition-colors"
          >
            <Plus size={14} /> New Client
          </button>
          <button
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-subtle text-xs font-semibold text-secondary hover:bg-surface-alt cursor-pointer transition-colors"
          >
            More Actions <ChevronDown size={12} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-surface-alt p-1 rounded-xl">
        <button
          onClick={() => setView('crm')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex-1 justify-center ${view === 'crm' ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'}`}
        >
          <User size={14} /> Clients
        </button>
        <button
          onClick={() => setView('recurring')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex-1 justify-center ${view === 'recurring' ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'}`}
        >
          <List size={14} /> Recurring
        </button>
        <button
          onClick={() => setView('map')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex-1 justify-center ${view === 'map' ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'}`}
        >
          <MapIcon size={14} /> Map
        </button>
      </div>

      {/* Content — keep mounted, hide with CSS to prevent re-fetching */}
      <div style={{ display: view === 'crm' ? 'block' : 'none' }}>
        <ClientList allClients={allJobberClients} loading={loadingAllClients} onSelect={(c) => { setSelectedId(c.id); }} />
      </div>
      <div style={{ display: view === 'recurring' ? 'block' : 'none' }}>
        <RecurringView initialClients={jobberClients.length > 0 ? jobberClients : undefined} onSelectClient={(c) => { setSelectedRecurring(c); }} />
      </div>
      {view === 'map' && (
        <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" /></div>}>
          <Dominate />
        </Suspense>
      )}
    </div>
  );
}
