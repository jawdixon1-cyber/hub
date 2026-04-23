import { useState, useEffect, useMemo, useCallback, lazy, Suspense, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, RefreshCw, Users, TrendingUp, MapPinned, ChevronLeft, ChevronRight } from 'lucide-react';
import { getTodayInTimezone } from '../utils/timezone';

const ClientMapInner = lazy(() => import('../components/ClientMapInner'));

const FREQ_ORDER = { 'Weekly': 1, 'Every 2 weeks': 2, 'Monthly': 3 };
const money = (v) => `$${Math.round(v).toLocaleString()}`;
const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const earliest = (dates) => {
  const valid = dates.filter(Boolean).map(d => new Date(d).getTime()).filter(t => !isNaN(t));
  return valid.length ? new Date(Math.min(...valid)).toISOString() : null;
};
const latest = (dates) => {
  const valid = dates.filter(Boolean).map(d => new Date(d).getTime()).filter(t => !isNaN(t));
  return valid.length ? new Date(Math.max(...valid)).toISOString() : null;
};

const REPORTS = [
  { id: 'clients', path: '/insights/clients', label: 'Recurring Clients', description: 'Full roster with frequency, service, dates, and revenue', icon: Users },
  { id: 'leads', path: '/insights/leads', label: 'Leads', description: 'Where your requests come from and how sources perform', icon: MapPinned },
  { id: 'profitability', path: '/insights/profitability-full', label: 'Profitability', description: 'One-off jobs, recurring jobs, labor + contribution margin per job', icon: TrendingUp },
  { id: 'profitability-today', path: '/insights/profitability', label: 'Profitability Today', description: 'Today\'s lawns with labor cost, revenue, and per-crew breakdown', icon: TrendingUp },
];

export default function Insights() {
  const navigate = useNavigate();
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-primary">Insights</h1>
        <p className="text-sm text-muted mt-1">Pick a report</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.id}
              onClick={() => navigate(r.path)}
              className="bg-card rounded-2xl border border-border-subtle p-5 text-left hover:border-brand transition-colors cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                  <Icon size={18} className="text-brand-text" />
                </div>
                <ChevronRight size={18} className="text-muted group-hover:text-primary transition-colors mt-1" />
              </div>
              <p className="text-base font-bold text-primary">{r.label}</p>
              <p className="text-xs text-muted mt-1 leading-relaxed">{r.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RecurringClientsReport() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [geocoded, setGeocoded] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback((refresh = false) => {
    setLoading(true);
    setError(null);
    const today = getTodayInTimezone();
    const yearStart = today.slice(0, 4) + '-01-01';
    const url = `/api/commander/summary?start=${yearStart}&end=${today}${refresh ? '&refresh=1' : ''}`;
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => setClients(d?.recurringClientList || []))
      .catch(err => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(false); }, [load]);

  // Pull geocoded client coords from the dominate endpoint (same Jobber data, already geocoded server-side)
  useEffect(() => {
    fetch('/api/commander/dominate')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.clients) setGeocoded(d.clients); })
      .catch(() => {});
  }, []);

  const mappedClients = useMemo(() => {
    if (!geocoded.length || !clients.length) return [];
    const byName = new Map(geocoded.filter(g => g.lat && g.lng).map(g => [g.name.toLowerCase().trim(), g]));
    return clients.map((c, i) => {
      const g = byName.get(c.name.toLowerCase().trim());
      if (!g) return null;
      return {
        id: `rc-${i}`,
        name: c.name,
        address: [g.street, g.city].filter(Boolean).join(', '),
        monthlyPrice: c.monthly,
        mapCenter: { lat: g.lat, lng: g.lng },
      };
    }).filter(Boolean);
  }, [clients, geocoded]);

  const mapCenter = useMemo(() => {
    if (mappedClients.length === 0) return [34.9249, -81.025]; // Rock Hill, SC fallback
    const lat = mappedClients.reduce((s, c) => s + c.mapCenter.lat, 0) / mappedClients.length;
    const lng = mappedClients.reduce((s, c) => s + c.mapCenter.lng, 0) / mappedClients.length;
    return [lat, lng];
  }, [mappedClients]);

  const freqSortVal = (c) => {
    if (!c.jobs?.length) return 10;
    return Math.min(...c.jobs.map(j => FREQ_ORDER[j.frequency] ?? 10));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.jobs.some(j => (j.services || []).some(s => s.toLowerCase().includes(q)) || j.frequency.toLowerCase().includes(q))
    );
  }, [clients, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    const startMs = (c) => {
      const d = earliest(c.jobs.map(j => j.startDate));
      return d ? new Date(d).getTime() : Infinity;
    };
    list.sort((a, b) => {
      switch (sortKey) {
        case 'frequency': return (freqSortVal(a) - freqSortVal(b)) * dir;
        case 'perVisit': return (a.perVisit - b.perVisit) * dir;
        case 'monthly': return (a.monthly - b.monthly) * dir;
        case 'start': return (startMs(a) - startMs(b)) * dir;
        default: return a.name.localeCompare(b.name) * dir;
      }
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' || key === 'frequency' ? 'asc' : 'desc'); }
  };

  const totalPerVisit = clients.reduce((s, c) => s + c.perVisit, 0);
  const totalMonthly = clients.reduce((s, c) => s + c.monthly, 0);
  const avgMonthly = clients.length > 0 ? totalMonthly / clients.length : 0;

  const SortHeader = ({ field, align, children }) => (
    <th
      onClick={() => toggleSort(field)}
      className={`pb-2 pr-3 cursor-pointer select-none hover:text-primary transition-colors ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown size={10} className={sortKey === field ? 'text-brand-text' : 'opacity-30'} />
      </span>
    </th>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/insights')}
          className="p-2 rounded-lg hover:bg-surface-alt cursor-pointer"
        >
          <ChevronLeft size={18} className="text-muted" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-primary">Recurring Clients</h1>
          <p className="text-sm text-muted mt-0.5">Roster, revenue, and service breakdown</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-default bg-card text-secondary text-sm font-semibold hover:bg-surface disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[10px] text-muted font-bold uppercase tracking-wider">Recurring Clients</p>
          <p className="text-3xl font-black text-brand-text mt-2">{clients.length || '--'}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[10px] text-muted font-bold uppercase tracking-wider">Monthly Revenue</p>
          <p className="text-3xl font-black text-primary mt-2">{totalMonthly > 0 ? money(totalMonthly) : '--'}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <p className="text-[10px] text-muted font-bold uppercase tracking-wider">Avg / Client</p>
          <p className="text-3xl font-black text-primary mt-2">{avgMonthly > 0 ? money(avgMonthly) : '--'}</p>
        </div>
      </div>

      {mappedClients.length > 0 && (
        <div className="bg-card rounded-2xl border border-border-subtle overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <MapPinned size={16} className="text-brand-text" />
              <h2 className="text-sm font-bold text-primary">Where they are</h2>
            </div>
            <span className="text-xs text-muted">{mappedClients.length} of {clients.length} pinned</span>
          </div>
          <div style={{ height: 420 }}>
            <Suspense fallback={<div className="w-full h-full bg-surface-alt flex items-center justify-center text-sm text-muted">Loading map…</div>}>
              <ClientMapInner center={mapCenter} clients={mappedClients} onSelect={() => {}} />
            </Suspense>
          </div>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border-subtle p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-brand-text" />
            <h2 className="text-sm font-bold text-primary">Recurring Clients</h2>
            <span className="text-xs text-muted">({sorted.length})</span>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, service, frequency..."
            className="flex-1 min-w-[180px] max-w-xs bg-surface-alt rounded-lg px-3 py-1.5 text-sm text-primary placeholder:text-placeholder-muted focus:outline-none focus:ring-1 focus:ring-border-default"
          />
        </div>

        {error && <p className="text-sm text-red-500 py-8 text-center">{error}</p>}
        {!error && loading && clients.length === 0 && <p className="text-sm text-muted py-16 text-center">Loading…</p>}
        {!error && !loading && clients.length === 0 && <p className="text-sm text-muted py-16 text-center">No recurring clients found.</p>}

        {clients.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted uppercase tracking-wide">
                  <th className="pb-2 pr-3 text-left">#</th>
                  <SortHeader field="name">Client</SortHeader>
                  <SortHeader field="frequency">Frequency</SortHeader>
                  <th className="pb-2 pr-3 text-left">Service</th>
                  <SortHeader field="start">Start</SortHeader>
                  <th className="pb-2 pr-3 text-left">End</th>
                  <SortHeader field="perVisit" align="right">Per Visit</SortHeader>
                  <SortHeader field="monthly" align="right">Monthly</SortHeader>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => {
                  const startIso = earliest(c.jobs.map(j => j.startDate));
                  const hasOngoing = c.jobs.some(j => !j.endDate);
                  const endIso = hasOngoing ? null : latest(c.jobs.map(j => j.endDate));
                  const startStr = fmtDate(startIso);
                  const endStr = fmtDate(endIso);
                  const key = c.name + i;
                  const isOpen = expanded === key;
                  return (
                    <Fragment key={key}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : key)}
                        className="border-t border-border-subtle/50 align-top cursor-pointer hover:bg-surface-alt/50"
                      >
                        <td className="py-3 pr-3 text-muted text-xs">{i + 1}</td>
                        <td className="py-3 pr-3 text-primary font-medium">{c.name}</td>
                        <td className="py-3 pr-3 text-secondary text-xs">
                          {c.jobs.length === 1
                            ? c.jobs[0].frequency
                            : c.jobs.map((j, ji) => <span key={ji} className="block">#{j.jobNumber}: {j.frequency}</span>)}
                        </td>
                        <td className="py-3 pr-3 text-secondary text-xs">
                          {c.jobs.flatMap(j => j.services || []).filter((s, idx, arr) => arr.indexOf(s) === idx).join(', ') || '—'}
                        </td>
                        <td className="py-3 pr-3 text-secondary text-xs whitespace-nowrap">{startStr || '—'}</td>
                        <td className="py-3 pr-3 text-secondary text-xs whitespace-nowrap">{endStr || <span className="text-brand-text font-semibold">Ongoing</span>}</td>
                        <td className="py-3 pr-3 text-right text-secondary">{money(c.perVisit)}</td>
                        <td className="py-3 text-right font-semibold text-brand-text">{money(c.monthly)}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-surface-alt/40">
                          <td></td>
                          <td colSpan={7} className="py-3 pr-3">
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Line items from Jobber</p>
                              {c.jobs.map((j, ji) => (
                                <div key={ji} className="bg-card rounded-lg border border-border-subtle p-3">
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <p className="text-xs font-semibold text-primary">Job #{j.jobNumber} — {j.frequency}</p>
                                    {j.itemSource && (
                                      <span className="text-[10px] font-semibold text-muted uppercase tracking-wide">
                                        Source: {j.itemSource === 'job' ? 'job template' : j.itemSource === 'visit' ? 'recent visit' : j.itemSource === 'upcoming visit' ? 'upcoming visit' : 'job total (fallback)'}
                                      </span>
                                    )}
                                  </div>
                                  {(!j.lineItems || j.lineItems.length === 0) ? (
                                    <p className="text-xs text-muted italic">Jobber returned no line items for this job — using job.total ({money(j.perVisit)}) as the per-visit amount.</p>
                                  ) : (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-[10px] text-muted uppercase">
                                          <th className="text-left pb-1 pr-3">Name</th>
                                          <th className="text-right pb-1 pr-3">Qty</th>
                                          <th className="text-right pb-1">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {j.lineItems.map((li, lii) => (
                                          <tr key={lii} className={`border-t border-border-subtle/50 ${li.excluded ? 'text-muted italic line-through' : 'text-secondary'}`}>
                                            <td className="py-1 pr-3">
                                              {li.name || '(no name)'}
                                              {li.excluded && <span className="ml-1 not-italic no-underline text-[10px] text-amber-500 font-semibold">· excluded (one-time)</span>}
                                            </td>
                                            <td className="py-1 pr-3 text-right">{li.quantity}</td>
                                            <td className="py-1 text-right">{money(li.totalPrice)}</td>
                                          </tr>
                                        ))}
                                        <tr className="border-t-2 border-border-default font-semibold text-primary">
                                          <td className="py-1 pr-3">Per visit (recurring only)</td>
                                          <td></td>
                                          <td className="py-1 text-right">{money(j.perVisit)}</td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border-default">
                  <td colSpan={6} className="py-3 text-xs font-semibold text-primary">
                    Total ({clients.length} clients)
                  </td>
                  <td className="py-3 pr-3 text-right text-xs font-semibold text-primary">{money(totalPerVisit)}</td>
                  <td className="py-3 text-right font-bold text-brand-text">{money(totalMonthly)}/mo</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
