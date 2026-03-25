import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  FileText,
  CheckCircle2,
  Repeat,
  ArrowRight,
  RefreshCw,
  Target,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from 'lucide-react';
import { getTimezone, getTodayInTimezone, toDateStringInTimezone } from '../utils/timezone';

/* ── Helpers ── */

function fmt(d) {
  return toDateStringInTimezone(d);
}

function formatWeekLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: getTimezone() });
}

function formatWeekShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function pct(numerator, denominator) {
  if (!denominator || denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function money(val) {
  if (!val || val === 0) return '$0';
  return '$' + Math.round(val).toLocaleString();
}

/* ── Date range presets ── */

function getPresetRange(preset) {
  const todayStr = getTodayInTimezone();
  const today = new Date(todayStr + 'T00:00:00');

  switch (preset) {
    case 'today': {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { start: fmt(today), end: fmt(tomorrow), label: 'Today' };
    }
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { start: fmt(y), end: fmt(today), label: 'Yesterday' };
    }
    case 'this-week': {
      const day = today.getDay();
      const sun = new Date(today);
      sun.setDate(sun.getDate() - day);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { start: fmt(sun), end: fmt(tomorrow), label: 'This Week' };
    }
    case 'last-7': {
      const s = new Date(today);
      s.setDate(s.getDate() - 6);
      const tomorrow7 = new Date(today);
      tomorrow7.setDate(tomorrow7.getDate() + 1);
      return { start: fmt(s), end: fmt(tomorrow7), label: 'Last 7 Days' };
    }
    case 'last-14': {
      const s = new Date(today);
      s.setDate(s.getDate() - 13);
      const e = new Date(today);
      e.setDate(e.getDate() + 1);
      return { start: fmt(s), end: fmt(e), label: 'Last 14 Days' };
    }
    case 'last-30': {
      const s = new Date(today);
      s.setDate(s.getDate() - 29);
      const e = new Date(today);
      e.setDate(e.getDate() + 1);
      return { start: fmt(s), end: fmt(e), label: 'Last 30 Days' };
    }
    case 'last-90': {
      const s = new Date(today);
      s.setDate(s.getDate() - 89);
      const e = new Date(today);
      e.setDate(e.getDate() + 1);
      return { start: fmt(s), end: fmt(e), label: 'Last 90 Days' };
    }
    case 'this-month': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      const e = new Date(today);
      e.setDate(e.getDate() + 1);
      return { start: fmt(s), end: fmt(e), label: 'This Month' };
    }
    case 'last-month': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: fmt(s), end: fmt(e), label: 'Last Month' };
    }
    case 'this-year': {
      const s = new Date(today.getFullYear(), 0, 1);
      const e = new Date(today);
      e.setDate(e.getDate() + 1);
      return { start: fmt(s), end: fmt(e), label: 'This Year' };
    }
    default:
      return null;
  }
}

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this-week', label: 'This Week' },
  { id: 'last-7', label: 'Last 7 Days' },
  { id: 'last-14', label: 'Last 14 Days' },
  { id: 'last-30', label: 'Last 30 Days' },
  { id: 'last-90', label: 'Last 90 Days' },
  { id: 'this-month', label: 'This Month' },
  { id: 'last-month', label: 'Last Month' },
  { id: 'this-year', label: 'This Year' },
  { id: 'custom', label: 'Custom Range' },
];

const GROWTH_TARGET = 200;

/* ── Main Component ── */

export default function Commander() {
  const [preset, setPreset] = useState('this-week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const [showLeadNames, setShowLeadNames] = useState(false);
  const [showQuoteNames, setShowQuoteNames] = useState(false);
  const [showApprovedNames, setShowApprovedNames] = useState(false);

  const range = useMemo(() => {
    if (preset === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return getPresetRange(preset) || getPresetRange('this-week');
  }, [preset, customStart, customEnd]);

  useEffect(() => {
    if (!range?.start || !range?.end) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setShowLeadNames(false);
    setShowQuoteNames(false);
    setShowApprovedNames(false);

    const refreshParam = retryKey > 0 ? '&refresh=1' : '';
    fetch(`/api/commander/summary?start=${range.start}&end=${range.end}${refreshParam}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        if (!cancelled) setData(json);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [range?.start, range?.end, retryKey]);

  const kpis = data?.kpis;
  const sourceTable = data?.sourceTable || [];
  const trends = data?.trends;
  const activeRecurringCount = data?.activeRecurringCount ?? 0;

  return (
    <div className="space-y-5">
      {/* 1. Header + Date Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Know Your Numbers</h1>
          <p className="text-sm text-tertiary mt-1">{PRESETS.find(p => p.id === preset)?.label || 'Growth scorecard'}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={preset}
            onChange={e => setPreset(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-surface-alt text-primary border border-border-default cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {PRESETS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={() => setRetryKey(k => k + 1)}
            disabled={loading}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-alt text-secondary hover:bg-surface-strong transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh from Jobber"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {preset === 'custom' && (
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border-default bg-card text-primary text-sm"
          />
          <span className="text-muted text-sm">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-border-default bg-card text-primary text-sm"
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-card rounded-2xl border border-border-subtle p-8 text-center">
          <p className="text-tertiary text-sm mb-4">Failed to load data: {error}</p>
          <button
            onClick={() => setRetryKey(k => k + 1)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-on-brand text-sm font-medium cursor-pointer"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* 1. Growth Target — North Star */}
          <GrowthTarget current={activeRecurringCount} goal={GROWTH_TARGET} clients={data?.recurringClientList || []} />

          {/* 2. KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="relative">
              <KpiCard label="New Requests" icon={Users} onClick={() => setShowLeadNames(v => !v)}>
                <span className="text-2xl font-bold text-primary cursor-pointer">{kpis.newLeads}</span>
              </KpiCard>
              {showLeadNames && data?.leadNames?.length > 0 && (
                <div className="absolute top-full left-0 mt-1 z-20 bg-card border border-border-default rounded-lg shadow-lg p-3 min-w-[180px] max-h-60 overflow-y-auto">
                  <p className="text-xs text-muted mb-2 font-medium">Requests in range:</p>
                  {data.leadNames.map((name, i) => (
                    <p key={i} className="text-sm text-primary py-0.5">{name}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <KpiCard label="Quotes Sent" icon={FileText} onClick={() => setShowQuoteNames(v => !v)}>
                <span className="text-2xl font-bold text-primary cursor-pointer">{kpis.quotesSent}</span>
              </KpiCard>
              {showQuoteNames && data?.quotesSentNames?.length > 0 && (
                <div className="absolute top-full left-0 mt-1 z-20 bg-card border border-border-default rounded-lg shadow-lg p-3 min-w-[180px] max-h-60 overflow-y-auto">
                  <p className="text-xs text-muted mb-2 font-medium">Quotes sent to:</p>
                  {data.quotesSentNames.map((name, i) => (
                    <p key={i} className="text-sm text-primary py-0.5">{name}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <KpiCard label="Quotes Approved" icon={CheckCircle2} onClick={() => setShowApprovedNames(v => !v)}>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-primary cursor-pointer">{kpis.quotesApproved}</span>
                  <span className="text-sm text-muted">/ {Math.max(kpis.quotesSent, kpis.quotesApproved)}</span>
                </div>
                <span className="text-xs text-tertiary">{Math.min(pct(kpis.quotesApproved, kpis.quotesSent), 100)}% approval</span>
              </KpiCard>
              {showApprovedNames && data?.quotesApprovedNames?.length > 0 && (
                <div className="absolute top-full left-0 mt-1 z-20 bg-card border border-border-default rounded-lg shadow-lg p-3 min-w-[180px] max-h-60 overflow-y-auto">
                  <p className="text-xs text-muted mb-2 font-medium">Approved quotes:</p>
                  {data.quotesApprovedNames.map((name, i) => (
                    <p key={i} className="text-sm text-primary py-0.5">{name}</p>
                  ))}
                </div>
              )}
            </div>

            <KpiCard label="Clients Signed" icon={Repeat} highlight={kpis.recurringStarts > 0}>
              <span className="text-2xl font-bold text-primary">{kpis.recurringStarts}</span>
              <span className={`text-xs ${kpis.startsMonthlyRevenue > 0 ? 'text-brand-text-strong' : 'text-tertiary'}`}>
                {kpis.startsMonthlyRevenue > 0 ? `+${money(kpis.startsMonthlyRevenue)} / mo` : '$0 / mo'}
              </span>
              {data?.recurringStartNames?.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-border-subtle">
                  {data.recurringStartNames.map((n, i) => (
                    <span key={i} className="block text-xs text-secondary truncate">{n}</span>
                  ))}
                </div>
              )}
            </KpiCard>

            <KpiCard label="Close Rate" icon={ArrowRight}>
              <span className="text-2xl font-bold text-primary">{Math.min(pct(kpis.quotesApproved, kpis.quotesSent), 100)}%</span>
              <span className="text-xs text-tertiary">{kpis.quotesApproved} of {Math.max(kpis.quotesSent, kpis.quotesApproved)} closed</span>
            </KpiCard>
          </div>

          {/* 5. Where Leads Come From */}
          <SourceTable data={sourceTable} missingSourceLeads={data?.missingSourceLeads || []} />

          {/* 6. Trends */}
          {trends && <TrendsChart trends={trends} />}
        </>
      )}
    </div>
  );
}

/* ── KPI Card ── */

function KpiCard({ label, icon: Icon, children, highlight, negative, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-card rounded-xl border p-4 flex flex-col gap-1 ${
        highlight ? 'border-brand/40' : negative ? 'border-red-300 dark:border-red-800' : 'border-border-subtle'
      } ${onClick ? 'cursor-pointer hover:border-brand/60 transition-colors' : ''}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-muted uppercase tracking-wide">{label}</span>
        <Icon size={14} className={`${negative ? 'text-red-500' : highlight ? 'text-brand-text' : 'text-muted'}`} />
      </div>
      {children}
    </div>
  );
}

/* ── Source Performance Table ── */

const SOURCE_COLORS = [
  'bg-brand',
  'bg-blue-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
];

function SourceTable({ data, missingSourceLeads = [] }) {
  const [showMissing, setShowMissing] = useState(false);
  const sorted = useMemo(() => {
    // Put "No Source Set" last
    return [...data].sort((a, b) => {
      if (a.source === 'No Source Set') return 1;
      if (b.source === 'No Source Set') return -1;
      return b.leads - a.leads;
    });
  }, [data]);

  const total = sorted.reduce((sum, r) => sum + r.leads, 0);

  if (!data.length) {
    return (
      <div className="bg-card rounded-xl border border-border-subtle p-8 text-center">
        <p className="text-tertiary text-sm">No source data for this period</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border-subtle overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle">
        <h2 className="text-sm font-semibold text-primary">Where Requests Come From</h2>
      </div>
      <div className="p-4">
        {/* Stacked bar */}
        <div className="w-full h-6 rounded-lg overflow-hidden flex">
          {sorted.map((row, i) => {
            const pctWidth = total > 0 ? (row.leads / total) * 100 : 0;
            const isMissing = row.source === 'No Source Set';
            return (
              <div
                key={row.source}
                className={`${isMissing ? 'bg-red-500/70' : SOURCE_COLORS[i % SOURCE_COLORS.length]} transition-all duration-500 relative group`}
                style={{ width: `${pctWidth}%` }}
              >
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-surface-strong text-primary text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                  {row.source}: {row.leads} ({Math.round(pctWidth)}%)
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
          {sorted.map((row, i) => {
            const pctWidth = total > 0 ? (row.leads / total) * 100 : 0;
            const isMissing = row.source === 'No Source Set';
            return (
              <div key={row.source} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-sm ${isMissing ? 'bg-red-500/70' : SOURCE_COLORS[i % SOURCE_COLORS.length]}`} />
                <span className={`text-xs ${isMissing ? 'text-red-400 font-semibold' : 'text-secondary'}`}>
                  {row.source} <span className="text-muted">— {row.leads} ({Math.round(pctWidth)}%)</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Missing source warning */}
        {missingSourceLeads.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border-subtle">
            <button
              onClick={() => setShowMissing(v => !v)}
              className="text-xs text-red-400 font-medium cursor-pointer hover:text-red-300 transition-colors"
            >
              {missingSourceLeads.length} request{missingSourceLeads.length > 1 ? 's' : ''} missing lead source — {showMissing ? 'hide' : 'tap to see who'}
            </button>
            {showMissing && (
              <div className="mt-2 space-y-1">
                {missingSourceLeads.map((name, i) => (
                  <p key={i} className="text-xs text-red-300/80 pl-2">• {name}</p>
                ))}
                <p className="text-[10px] text-muted mt-2">Set their lead source in Jobber → Client → Lead Information</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Trends Chart ── */

function TrendsChart({ trends }) {
  const { weeklyNetGrowth = [] } = trends;

  if (!weeklyNetGrowth.length) {
    return (
      <div className="bg-card rounded-xl border border-border-subtle p-8 text-center">
        <p className="text-tertiary text-sm">No trend data available</p>
      </div>
    );
  }

  const maxVal = Math.max(
    ...weeklyNetGrowth.map(w => w.leads ?? 0),
    ...weeklyNetGrowth.map(w => Math.abs(w.net)),
    1
  );

  return (
    <div className="bg-card rounded-xl border border-border-subtle overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <h2 className="text-sm font-semibold text-primary">Trends (Last 12 Weeks)</h2>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className="w-3 h-0.5 rounded bg-blue-500" /> Leads
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className="w-3 h-0.5 rounded bg-brand" /> Booked
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-end gap-1" style={{ height: '180px' }}>
          {weeklyNetGrowth.map((w, i) => {
            const leads = w.leads ?? 0;
            const net = w.net;
            const leadPx = leads > 0 ? Math.max((leads / maxVal) * 160, 8) : 0;
            const netPx = Math.abs(net) > 0 ? Math.max((Math.abs(net) / maxVal) * 160, 8) : 0;
            const isNeg = net < 0;

            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 px-2.5 py-2 rounded-lg bg-surface-strong text-primary text-[10px] leading-snug opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap shadow-lg">
                  <div className="font-semibold mb-1">{formatWeekLabel(w.weekStart)}</div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted">Leads</span>
                    <span>{leads}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted">Booked</span>
                    <span>{w.starts}</span>
                  </div>
                  {w.cancels > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted">Cancels</span>
                      <span>{w.cancels}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 pt-1 border-t border-border-subtle mt-1">
                    <span className="text-muted">Net</span>
                    <span className="font-semibold">{net >= 0 ? '+' : ''}{net}</span>
                  </div>
                </div>

                {/* Bars */}
                <div className="flex items-end justify-center gap-[2px]">
                  <div
                    className="w-[12px] rounded-t bg-blue-500/70"
                    style={{ height: `${leadPx}px` }}
                  />
                  <div
                    className={`w-[12px] rounded-t ${
                      isNeg ? 'bg-red-400/80' : net > 0 ? 'bg-brand/80' : ''
                    }`}
                    style={{ height: `${netPx}px` }}
                  />
                </div>

                <span className="text-[9px] text-muted mt-1">
                  {formatWeekShort(w.weekStart)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Growth Target ── */

const FREQ_ORDER = { 'Weekly': 1, 'Every 2 weeks': 2, 'Monthly': 3 };

function freqSortVal(client) {
  if (client.jobs.length === 1) return FREQ_ORDER[client.jobs[0].frequency] ?? 10;
  return Math.min(...client.jobs.map(j => FREQ_ORDER[j.frequency] ?? 10));
}

function GrowthTarget({ current, goal, clients = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState('name'); // name | frequency | perVisit | monthly
  const [sortDir, setSortDir] = useState('asc');
  const remaining = Math.max(goal - current, 0);
  const progressPct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const totalMonthly = clients.reduce((sum, c) => sum + c.monthly, 0);
  const avgMonthly = clients.length > 0 ? totalMonthly / clients.length : 0;

  const sorted = useMemo(() => {
    const list = [...clients];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'frequency': return (freqSortVal(a) - freqSortVal(b)) * dir;
        case 'perVisit': return (a.perVisit - b.perVisit) * dir;
        case 'monthly': return (a.monthly - b.monthly) * dir;
        default: return a.name.localeCompare(b.name) * dir;
      }
    });
    return list;
  }, [clients, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'frequency' ? 'asc' : 'desc');
    }
  };

  const SortHeader = ({ field, children, align }) => (
    <th
      className={`pb-2 pr-3 cursor-pointer hover:text-primary transition-colors select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown size={10} className={sortKey === field ? 'text-brand-text' : 'opacity-30'} />
      </span>
    </th>
  );

  return (
    <div className="bg-card rounded-xl border border-brand/30 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-brand-text" />
          <span className="text-xs font-medium text-muted uppercase tracking-wide">Growth Target</span>
        </div>
        <span className="text-xs text-muted">{remaining} to go</span>
      </div>

      <div className="flex items-baseline gap-1 mb-4 flex-wrap">
        <span className="text-4xl font-bold text-primary">{current}</span>
        <span className="text-lg text-muted font-medium">/ {goal}</span>
        <span className="text-sm text-muted ml-1">recurring clients</span>
        {totalMonthly > 0 && (
          <>
            <span className="text-sm text-brand-text font-semibold ml-2">{money(totalMonthly)}/mo</span>
            <span className="text-xs text-muted ml-1">({money(avgMonthly)} avg/client)</span>
          </>
        )}
      </div>

      <div className="w-full h-3 rounded-full bg-surface-alt overflow-hidden">
        <div
          className="h-full rounded-full bg-brand transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-muted">{Math.round(progressPct)}% of goal</p>
        {clients.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-brand-text hover:text-brand-text-strong font-medium cursor-pointer transition-colors"
          >
            {expanded ? 'Hide' : 'View all'} clients
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {/* Expanded client roster */}
      {expanded && clients.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted uppercase tracking-wide">
                  <th className="pb-2 pr-3 text-left">#</th>
                  <SortHeader field="name">Client</SortHeader>
                  <SortHeader field="frequency">Frequency</SortHeader>
                  <SortHeader field="perVisit" align="right">Per Visit</SortHeader>
                  <SortHeader field="monthly" align="right">Monthly</SortHeader>
                </tr>
              </thead>
              <tbody>
                {sorted.map((client, i) => (
                  <tr key={client.name} className="border-t border-border-subtle/50">
                    <td className="py-2 pr-3 text-muted text-xs">{i + 1}</td>
                    <td className="py-2 pr-3 text-primary font-medium">{client.name}</td>
                    <td className="py-2 pr-3 text-secondary">
                      {client.jobs.length === 1
                        ? client.jobs[0].frequency
                        : client.jobs.map((j, ji) => (
                            <span key={ji} className="block text-xs">
                              #{j.jobNumber}: {j.frequency}
                            </span>
                          ))}
                    </td>
                    <td className="py-2 pr-3 text-right text-secondary">{money(client.perVisit)}</td>
                    <td className="py-2 text-right font-semibold text-brand-text">{money(client.monthly)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border-default">
                  <td colSpan={2} className="py-2 text-xs font-semibold text-primary">
                    Total ({clients.length} clients)
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted text-right">
                    avg {money(avgMonthly)}/client
                  </td>
                  <td className="py-2 text-right text-xs font-semibold text-primary">
                    {money(clients.reduce((s, c) => s + c.perVisit, 0))}
                  </td>
                  <td className="py-2 text-right font-bold text-brand-text">
                    {money(totalMonthly)}/mo
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
