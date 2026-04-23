import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, RefreshCw, ChevronLeft, ChevronDown, ChevronRight, Briefcase, Repeat } from 'lucide-react';
import { getTodayInTimezone } from '../utils/timezone';

const money = (v) => v == null || isNaN(v) ? '—' : `$${Math.round(v).toLocaleString()}`;
const moneyExact = (v) => v == null || isNaN(v) ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => v == null || isNaN(v) ? '—' : `${v.toFixed(0)}%`;
const fmtHrs = (h) => { if (!h) return '0h'; const hr = Math.floor(h); const m = Math.round((h - hr) * 60); return m === 0 ? `${hr}h` : hr === 0 ? `${m}m` : `${hr}h ${m}m`; };
const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };

const DEFAULT_RANGE = 30; // days

export default function InsightsProfitability() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rangeDays, setRangeDays] = useState(DEFAULT_RANGE);
  const [tab, setTab] = useState('oneoff');
  const [expanded, setExpanded] = useState(null);
  const [sortKey, setSortKey] = useState('contrib');
  const [sortDir, setSortDir] = useState('desc');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const today = getTodayInTimezone();
    const start = new Date(Date.now() - rangeDays * 86400000).toISOString().slice(0, 10);

    const attempt = async () => {
      const r = await fetch(`/api/jobber-data?action=labor&start=${start}&end=${today}&skipLineItems=1&skipJobExpenses=1`);
      if (r.ok) return r.json();
      let body = null;
      try { body = await r.json(); } catch {}
      const msg = body?.error || `HTTP ${r.status}`;
      const err = new Error(msg); err.status = r.status; err.code = body?.code;
      throw err;
    };

    try {
      const d = await attempt();
      setJobs(flattenDays(d));
    } catch (err) {
      if (err.status === 429) {
        setError('Jobber is rate-limiting us. Wait ~60 seconds, then tap refresh. Pick a shorter range if it keeps happening.');
      } else {
        setError(err.message || 'Failed to load');
      }
    } finally {
      setLoading(false);
    }
  }, [rangeDays]);

  useEffect(() => { load(); }, [load]);

  // Aggregate job-level stats from day-level visit data
  const { oneOffs, recurring } = useMemo(() => {
    const byJob = {};
    for (const j of jobs) {
      const key = j.jobId || `orphan-${j.client}-${j.title}`;
      if (!byJob[key]) {
        byJob[key] = {
          jobId: j.jobId, jobType: j.jobType, jobStatus: j.jobStatus,
          client: j.client, title: j.title,
          visits: [], totalRevenue: 0, totalLabor: 0, totalHours: 0, totalExpenses: 0,
          firstDate: j.date, lastDate: j.date, completedCount: 0,
        };
      }
      const b = byJob[key];
      b.visits.push(j);
      b.totalRevenue += (j.visitTotal ?? j.revenue) || 0;
      b.totalLabor += j.laborCost || 0;
      b.totalHours += j.hours || 0;
      b.totalExpenses += j.expenses || 0;
      if (j.date < b.firstDate) b.firstDate = j.date;
      if (j.date > b.lastDate) b.lastDate = j.date;
      if (j.completedAt || (j.hours > 0 && j.revenue > 0)) b.completedCount += 1;
      // De-dupe: one-off "total revenue" shouldn't compound across days — use visitTotal once
    }
    // Fix one-off revenue: for one-offs, revenue should be the job total (not summed daily slices)
    for (const key of Object.keys(byJob)) {
      const b = byJob[key];
      if (b.jobType === 'ONE_OFF') {
        // Use max rawJobTotal seen (should be constant across days for the same job)
        const maxRaw = Math.max(...b.visits.map(v => v.visitTotal ?? v.revenue ?? 0));
        b.totalRevenue = maxRaw;
      }
      // Labor margin: (rev - labor) / rev
      b.laborMargin = b.totalRevenue > 0 ? ((b.totalRevenue - b.totalLabor) / b.totalRevenue) * 100 : null;
      // Contribution margin: (rev - labor - expenses) / rev
      b.contribMargin = b.totalRevenue > 0 ? ((b.totalRevenue - b.totalLabor - b.totalExpenses) / b.totalRevenue) * 100 : null;
      b.contributionDollars = b.totalRevenue - b.totalLabor - b.totalExpenses;
      b.revPerHour = b.totalHours > 0 ? b.totalRevenue / b.totalHours : null;
    }
    const list = Object.values(byJob);
    const oneOffs = list.filter(b => b.jobType === 'ONE_OFF' || (!b.jobType && b.visits.length === 1));
    const recurring = list.filter(b => b.jobType === 'RECURRING' || (!b.jobType && b.visits.length > 1));
    return { oneOffs, recurring };
  }, [jobs]);

  const activeList = tab === 'oneoff' ? oneOffs : recurring;

  const sorted = useMemo(() => {
    const list = [...activeList];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'client': return a.client.localeCompare(b.client) * dir;
        case 'revenue': return ((a.totalRevenue || 0) - (b.totalRevenue || 0)) * dir;
        case 'labor': return ((a.totalLabor || 0) - (b.totalLabor || 0)) * dir;
        case 'expenses': return ((a.totalExpenses || 0) - (b.totalExpenses || 0)) * dir;
        case 'hours': return ((a.totalHours || 0) - (b.totalHours || 0)) * dir;
        case 'laborMargin': return ((a.laborMargin ?? -Infinity) - (b.laborMargin ?? -Infinity)) * dir;
        case 'contrib': return ((a.contribMargin ?? -Infinity) - (b.contribMargin ?? -Infinity)) * dir;
        case 'date': return (new Date(a.lastDate || 0) - new Date(b.lastDate || 0)) * dir;
        default: return 0;
      }
    });
    return list;
  }, [activeList, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'client' || key === 'date' ? 'asc' : 'desc'); }
  };

  // Aggregates for the header stat cards
  const headerStats = useMemo(() => {
    const list = activeList;
    const totalRev = list.reduce((s, b) => s + (b.totalRevenue || 0), 0);
    const totalLabor = list.reduce((s, b) => s + (b.totalLabor || 0), 0);
    const totalExp = list.reduce((s, b) => s + (b.totalExpenses || 0), 0);
    const totalContrib = totalRev - totalLabor - totalExp;
    const avgContribMargin = list.length > 0
      ? list.reduce((s, b) => s + (b.contribMargin ?? 0), 0) / list.filter(b => b.contribMargin != null).length
      : null;
    return { count: list.length, totalRev, totalLabor, totalExp, totalContrib, avgContribMargin };
  }, [activeList]);

  const SortH = ({ field, align, children }) => (
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

  const marginTone = (m) => m == null ? 'text-muted' : m >= 50 ? 'text-emerald-500' : m >= 30 ? 'text-amber-400' : m >= 0 ? 'text-orange-500' : 'text-red-500';

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/insights')} className="p-2 rounded-lg hover:bg-surface-alt cursor-pointer">
          <ChevronLeft size={18} className="text-muted" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-primary">Profitability</h1>
          <p className="text-sm text-muted mt-0.5">One-off + recurring jobs · labor margin · contribution margin</p>
        </div>
        <select value={rangeDays} onChange={(e) => setRangeDays(parseInt(e.target.value))}
          className="bg-card border border-border-default rounded-lg px-2.5 py-1.5 text-xs font-semibold text-secondary cursor-pointer">
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
          <option value={180}>180 days</option>
          <option value={365}>1 year</option>
        </select>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border-default bg-card text-secondary text-sm font-semibold hover:bg-surface disabled:opacity-50 cursor-pointer">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface-alt">
        <button onClick={() => { setTab('oneoff'); setExpanded(null); }}
          className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${tab === 'oneoff' ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'}`}>
          <Briefcase size={14} /> One-Off Jobs <span className="text-muted text-[10px]">({oneOffs.length})</span>
        </button>
        <button onClick={() => { setTab('recurring'); setExpanded(null); }}
          className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${tab === 'recurring' ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'}`}>
          <Repeat size={14} /> Recurring Jobs <span className="text-muted text-[10px]">({recurring.length})</span>
        </button>
      </div>

      {/* Header stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatCard label="Jobs" value={headerStats.count} />
        <StatCard label="Revenue" value={money(headerStats.totalRev)} />
        <StatCard label="Labor" value={money(headerStats.totalLabor)} />
        <StatCard label="Expenses" value={money(headerStats.totalExp)} />
        <StatCard label="Contribution" value={money(headerStats.totalContrib)} tone={marginTone(headerStats.avgContribMargin)} sub={headerStats.avgContribMargin != null ? `${pct(headerStats.avgContribMargin)} avg margin` : null} />
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border-subtle p-4">
        {error && <p className="text-sm text-red-500 py-8 text-center">{error}</p>}
        {!error && loading && sorted.length === 0 && <p className="text-sm text-muted py-16 text-center">Loading…</p>}
        {!error && !loading && sorted.length === 0 && <p className="text-sm text-muted py-16 text-center">No {tab === 'oneoff' ? 'one-off' : 'recurring'} jobs in this range.</p>}
        {sorted.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted uppercase tracking-wide">
                  <th className="pb-2 pr-2"></th>
                  <SortH field="client">Client / Job</SortH>
                  <SortH field="date">{tab === 'oneoff' ? 'Completed' : 'Last Visit'}</SortH>
                  {tab === 'recurring' && <th className="pb-2 pr-3 text-right">Visits</th>}
                  <SortH field="hours" align="right">Hours</SortH>
                  <SortH field="revenue" align="right">Revenue</SortH>
                  <SortH field="labor" align="right">Labor</SortH>
                  <SortH field="expenses" align="right">Expenses</SortH>
                  <SortH field="laborMargin" align="right">Labor Margin</SortH>
                  <SortH field="contrib" align="right">Contrib Margin</SortH>
                </tr>
              </thead>
              <tbody>
                {sorted.map((b, i) => {
                  const isOpen = expanded === i;
                  return (
                    <>
                      <tr key={i} onClick={() => setExpanded(isOpen ? null : i)} className="border-t border-border-subtle/50 cursor-pointer hover:bg-surface-alt/40">
                        <td className="py-2 pr-2 text-muted">{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</td>
                        <td className="py-2 pr-3 text-primary font-medium">
                          {b.client}
                          {b.title && b.title !== b.client && <span className="block text-[10px] text-muted">{b.title}</span>}
                        </td>
                        <td className="py-2 pr-3 text-secondary text-xs whitespace-nowrap">{fmtDate(b.lastDate)}</td>
                        {tab === 'recurring' && <td className="py-2 pr-3 text-right text-secondary">{b.visits.length}</td>}
                        <td className="py-2 pr-3 text-right text-secondary">{fmtHrs(b.totalHours)}</td>
                        <td className="py-2 pr-3 text-right text-primary font-semibold">{money(b.totalRevenue)}</td>
                        <td className="py-2 pr-3 text-right text-secondary">{money(b.totalLabor)}</td>
                        <td className="py-2 pr-3 text-right text-secondary">{money(b.totalExpenses)}</td>
                        <td className={`py-2 pr-3 text-right font-semibold ${marginTone(b.laborMargin)}`}>{pct(b.laborMargin)}</td>
                        <td className={`py-2 text-right font-semibold ${marginTone(b.contribMargin)}`}>{pct(b.contribMargin)}</td>
                      </tr>
                      {isOpen && (
                        <tr key={i + '-details'} className="bg-surface-alt/40">
                          <td></td>
                          <td colSpan={tab === 'recurring' ? 9 : 8} className="py-3 pr-3">
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Visit breakdown</p>
                              {b.visits.sort((x, y) => (y.date || '').localeCompare(x.date || '')).map((v, vi) => {
                                const vProfit = (v.visitTotal ?? v.revenue) - v.laborCost - v.expenses;
                                return (
                                  <div key={vi} className="bg-card rounded-lg border border-border-subtle/50 p-2 flex items-center gap-3 text-xs">
                                    <span className="text-muted whitespace-nowrap">{fmtDate(v.date)}</span>
                                    <span className="text-secondary">{fmtHrs(v.hours)}</span>
                                    <span className="text-primary font-semibold ml-auto">{moneyExact(v.visitTotal ?? v.revenue)}</span>
                                    <span className="text-muted">labor {moneyExact(v.laborCost)}</span>
                                    <span className="text-muted">exp {moneyExact(v.expenses)}</span>
                                    <span className={`font-semibold w-20 text-right ${vProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{moneyExact(vProfit)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, tone }) {
  return (
    <div className="bg-card rounded-2xl border border-border-subtle p-4">
      <p className="text-[10px] text-muted font-bold uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-black mt-1.5 ${tone || 'text-primary'}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted font-semibold mt-0.5">{sub}</p>}
    </div>
  );
}

// Fallback if the API returns {days: {}} shape instead of {allJobs: []}
function flattenDays(days) {
  const out = [];
  for (const [date, day] of Object.entries(days)) {
    for (const v of (day.visits || [])) {
      out.push({
        id: v.id + date,
        date,
        client: v.client,
        title: v.title || '',
        revenue: v.jobTotal || 0,
        visitTotal: v.rawJobTotal || v.jobTotal || 0,
        laborCost: v.labor?.totalCost || 0,
        hours: v.labor?.totalHours || 0,
        expenses: v.jobExpenses || 0,
        completedAt: v.completedAt || null,
        jobId: v.jobId || null,
        jobType: v.jobType || null,
        jobStatus: v.jobStatus || null,
      });
    }
  }
  return out;
}
