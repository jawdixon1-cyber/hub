import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  CheckCircle2,
  Repeat,
  ArrowRight,
  RefreshCw,
  Info,
  Target,
} from 'lucide-react';

/* ── Helpers ── */

function fmt(d) {
  return d.toISOString().split('T')[0];
}

function formatWeekLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'this-week': {
      const day = today.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const mon = new Date(today);
      mon.setDate(mon.getDate() + diff);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { start: fmt(mon), end: fmt(tomorrow), label: 'This Week' };
    }
    case 'last-7': {
      const s = new Date(today);
      s.setDate(s.getDate() - 6);
      const tomorrow7 = new Date(today);
      tomorrow7.setDate(tomorrow7.getDate() + 1);
      return { start: fmt(s), end: fmt(tomorrow7), label: 'Last 7 Days' };
    }
    case 'last-30': {
      const s = new Date(today);
      s.setDate(s.getDate() - 29);
      const tomorrow30 = new Date(today);
      tomorrow30.setDate(tomorrow30.getDate() + 1);
      return { start: fmt(s), end: fmt(tomorrow30), label: 'Last 30 Days' };
    }
    case 'this-month': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      const tomorrow_m = new Date(today);
      tomorrow_m.setDate(tomorrow_m.getDate() + 1);
      return { start: fmt(s), end: fmt(tomorrow_m), label: 'This Month' };
    }
    default:
      return null;
  }
}

const PRESETS = [
  { id: 'this-week', label: 'This Week' },
  { id: 'last-7', label: 'Last 7 Days' },
  { id: 'last-30', label: 'Last 30 Days' },
  { id: 'this-month', label: 'This Month' },
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
    <div className="space-y-8">
      {/* 1. Header + Date Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Commander</h1>
          <p className="text-sm text-tertiary mt-1">Weekly growth scorecard</p>
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
          {/* 2. KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label="New Leads" icon={Users}>
              <span className="text-2xl font-bold text-primary">{kpis.newLeads}</span>
            </KpiCard>

            <KpiCard label="Quotes Sent" icon={FileText}>
              <span className="text-2xl font-bold text-primary">{kpis.quotesSent}</span>
            </KpiCard>

            <KpiCard label="Quotes Approved" icon={CheckCircle2}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-primary">{kpis.quotesApproved}</span>
                <span className="text-sm text-muted">/ {kpis.quotesSent}</span>
              </div>
              <span className="text-xs text-tertiary">{pct(kpis.quotesApproved, kpis.quotesSent)}% approval</span>
            </KpiCard>

            <KpiCard label="Recurring Starts" icon={Repeat} highlight={kpis.recurringStarts > 0}>
              <span className="text-2xl font-bold text-primary">
                {kpis.recurringStarts} <span className="text-sm font-medium text-muted">{kpis.recurringStarts === 1 ? 'client' : 'clients'}</span>
              </span>
              <span className={`text-xs ${kpis.startsMonthlyRevenue > 0 ? 'text-brand-text-strong' : 'text-tertiary'}`}>
                {kpis.startsMonthlyRevenue > 0 ? `+${money(kpis.startsMonthlyRevenue)} / mo` : '$0 / mo'}
              </span>
            </KpiCard>

            <KpiCard
              label="Net Growth"
              icon={kpis.netGrowth >= 0 ? TrendingUp : TrendingDown}
              highlight={kpis.netGrowth > 0}
              negative={kpis.netGrowth < 0}
            >
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${
                  kpis.netGrowth > 0 ? 'text-brand-text-strong' : kpis.netGrowth < 0 ? 'text-red-600 dark:text-red-400' : 'text-primary'
                }`}>
                  {kpis.netGrowth > 0 ? '+' : ''}{kpis.netGrowth}
                </span>
                {kpis.cancels > 0 && (
                  <span className="text-xs text-red-500">{kpis.cancels} cancel{kpis.cancels !== 1 ? 's' : ''}</span>
                )}
              </div>
            </KpiCard>
          </div>

          {/* 3. Funnel Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FunnelCard
              label="Lead to Quote"
              value={`${pct(kpis.quotesSent, kpis.newLeads)}%`}
              sublabel={`${kpis.quotesSent} quoted of ${kpis.newLeads} leads`}
              icon={ArrowRight}
              tooltip="Quotes Sent / New Leads"
            />
            <FunnelCard
              label="Quote to Close"
              value={`${pct(kpis.quotesApproved, kpis.quotesSent)}%`}
              sublabel={`${kpis.quotesApproved} approved of ${kpis.quotesSent} sent`}
              icon={ArrowRight}
              tooltip="Quotes Approved / Quotes Sent"
            />
          </div>

          {/* 4. Source Performance Table */}
          <SourceTable data={sourceTable} />

          {/* 5. Trends Chart */}
          {trends && <TrendsChart trends={trends} />}

          {/* 6. Growth Target */}
          <GrowthTarget current={activeRecurringCount} goal={GROWTH_TARGET} />
        </>
      )}
    </div>
  );
}

/* ── KPI Card ── */

function KpiCard({ label, icon: Icon, children, highlight, negative }) {
  return (
    <div className={`bg-card rounded-xl border p-4 flex flex-col gap-1 ${
      highlight ? 'border-brand/40' : negative ? 'border-red-300 dark:border-red-800' : 'border-border-subtle'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-muted uppercase tracking-wide">{label}</span>
        <Icon size={14} className={`${negative ? 'text-red-500' : highlight ? 'text-brand-text' : 'text-muted'}`} />
      </div>
      {children}
    </div>
  );
}

/* ── Funnel Metric Card ── */

function FunnelCard({ label, value, sublabel, icon: Icon, tooltip }) {
  return (
    <div className="bg-card rounded-xl border border-border-subtle p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-muted" />
          <span className="text-[11px] font-medium text-muted uppercase tracking-wide">{label}</span>
        </div>
        {tooltip && (
          <span className="group relative">
            <Info size={12} className="text-muted" />
            <span className="absolute bottom-full right-0 mb-1 px-2 py-1 rounded bg-surface-strong text-primary text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {tooltip}
            </span>
          </span>
        )}
      </div>
      <p className="text-xl font-bold text-primary">{value}</p>
      <p className="text-xs text-tertiary mt-0.5">{sublabel}</p>
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

function SourceTable({ data }) {
  const sorted = useMemo(() => {
    return [...data].sort((a, b) => b.leads - a.leads);
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
        <h2 className="text-sm font-semibold text-primary">Where Leads Come From</h2>
      </div>
      <div className="p-4">
        {/* Stacked bar */}
        <div className="w-full h-6 rounded-lg overflow-hidden flex">
          {sorted.map((row, i) => {
            const pctWidth = total > 0 ? (row.leads / total) * 100 : 0;
            return (
              <div
                key={row.source}
                className={`${SOURCE_COLORS[i % SOURCE_COLORS.length]} transition-all duration-500 relative group`}
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
            return (
              <div key={row.source} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-sm ${SOURCE_COLORS[i % SOURCE_COLORS.length]}`} />
                <span className="text-xs text-secondary">
                  {row.source} <span className="text-muted">— {row.leads} ({Math.round(pctWidth)}%)</span>
                </span>
              </div>
            );
          })}
        </div>
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

function GrowthTarget({ current, goal }) {
  const remaining = Math.max(goal - current, 0);
  const progressPct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;

  return (
    <div className="bg-card rounded-xl border border-border-subtle p-5">
      <div className="flex items-center gap-2 mb-3">
        <Target size={15} className="text-muted" />
        <h2 className="text-sm font-semibold text-primary">Growth Target</h2>
      </div>

      <div className="flex items-baseline gap-6 mb-3">
        <div>
          <span className="text-2xl font-bold text-primary">{current}</span>
          <span className="text-sm text-muted ml-1">active recurring</span>
        </div>
        <div className="text-sm text-tertiary">
          Goal: {goal}
        </div>
        <div className="text-sm text-tertiary">
          Remaining: {remaining}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-surface-alt overflow-hidden">
        <div
          className="h-full rounded-full bg-brand transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="text-[11px] text-muted mt-1.5">{Math.round(progressPct)}% of goal</p>
    </div>
  );
}
