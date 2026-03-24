import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, Loader2, AlertCircle, DollarSign, Clock, RefreshCw } from 'lucide-react';

// ── Helper: format date as "Mon, Mar 20" ──
function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Helper: get Monday of current week ──
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date;
}

// ── Helper: format YYYY-MM-DD ──
function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

// ── Helper: get all dates in a range ──
function getDateRange(start, end) {
  const dates = [];
  const cur = new Date(start + 'T12:00:00');
  const endD = new Date(end + 'T12:00:00');
  while (cur <= endD) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ── Helper: labor cost % color (lower is better) ──
function laborPctColor(pct) {
  if (pct <= 33) return 'text-emerald-600';
  if (pct <= 50) return 'text-amber-600';
  return 'text-red-600';
}

function laborPctBg(pct) {
  if (pct <= 33) return 'bg-emerald-500/10 border-emerald-500/30';
  if (pct <= 50) return 'bg-amber-500/10 border-amber-500/30';
  return 'bg-red-500/10 border-red-500/30';
}

// ── localStorage helpers for manual entries ──
const STORAGE_KEY = 'labor-efficiency-entries';

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveEntries(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

// ── Stable input components (defined OUTSIDE main component) ──

function CurrencyInput({ label, value, onChange, placeholder }) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-[11px] font-medium text-muted mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={onChange}
          placeholder={placeholder || '0.00'}
          className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        />
      </div>
    </div>
  );
}

function HoursInput({ value, onChange }) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-[11px] font-medium text-muted mb-1">Hours</label>
      <div className="relative">
        <Clock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="number"
          step="0.25"
          min="0"
          value={value}
          onChange={onChange}
          placeholder="0"
          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        />
      </div>
    </div>
  );
}

function CrewRateInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-secondary whitespace-nowrap">Crew Rate</label>
      <div className="relative w-24">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
        <input
          type="number"
          step="0.50"
          min="0"
          value={value}
          onChange={onChange}
          className="w-full pl-7 pr-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        />
      </div>
      <span className="text-xs text-muted">/hr</span>
    </div>
  );
}

// ── DayCard component ──

function DayCard({ dateStr, revenue, visits, labor, entry, crewRate, onEntryChange }) {
  const expenses = parseFloat(entry.expenses) || 0;
  // Use Jobber timesheet hours, fall back to manual
  const jobberHours = labor?.totalHours || 0;
  const manualHours = parseFloat(entry.hours) || 0;
  const hours = jobberHours > 0 ? jobberHours : manualHours;
  const laborOverride = parseFloat(entry.laborCost) || 0;
  const laborCost = laborOverride > 0 ? laborOverride : hours * crewRate;
  const laborPct = revenue > 0 ? (laborCost / revenue) * 100 : 0;
  const netProfit = revenue - expenses - laborCost;
  const byPerson = labor?.byPerson || {};

  return (
    <div className={`rounded-xl border p-4 ${laborCost > 0 ? laborPctBg(laborPct) : 'bg-card border-border-subtle'}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-primary">{formatDateLabel(dateStr)}</h3>
        <div className="text-right">
          <p className="text-lg font-bold text-primary">${revenue.toFixed(2)}</p>
          <p className="text-[11px] text-muted">{visits.length} visit{visits.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Visit list */}
      {visits.length > 0 && (
        <div className="mb-3 space-y-1">
          {visits.map((v) => (
            <div key={v.id} className="flex items-center justify-between text-xs text-secondary">
              <span className="truncate mr-2">{v.client}</span>
              <span className="font-medium shrink-0">${(v.jobTotal || 0).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Jobber labor hours */}
      {jobberHours > 0 && (
        <div className="mb-3 p-2.5 rounded-lg bg-surface-alt/50 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted">LABOR (from Jobber)</span>
            <span className="text-xs font-bold text-primary">{jobberHours.toFixed(1)} hrs · ${(laborCost).toFixed(2)}</span>
          </div>
          {Object.entries(byPerson).map(([name, hrs]) => (
            <div key={name} className="flex items-center justify-between text-xs text-secondary">
              <span>{name}</span>
              <span>{hrs.toFixed(1)} hrs</span>
            </div>
          ))}
        </div>
      )}

      {/* Manual inputs (expenses always, hours only if no Jobber data) */}
      <div className="flex gap-2 mb-2">
        <CurrencyInput
          label="Expenses"
          value={entry.expenses}
          onChange={(e) => onEntryChange(dateStr, 'expenses', e.target.value)}
          placeholder="0.00"
        />
        {jobberHours <= 0 && (
          <HoursInput
            value={entry.hours}
            onChange={(e) => onEntryChange(dateStr, 'hours', e.target.value)}
          />
        )}
        <CurrencyInput
          label="Labor $ Override"
          value={entry.laborCost}
          onChange={(e) => onEntryChange(dateStr, 'laborCost', e.target.value)}
          placeholder={hours > 0 ? (hours * crewRate).toFixed(2) : '0.00'}
        />
      </div>

      {/* Labor Cost % */}
      {laborCost > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-black/10">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Labor Cost:</span>
            <span className={`text-sm font-bold ${laborPctColor(laborPct)}`}>
              {laborPct.toFixed(0)}%
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted mr-1">Net:</span>
            <span className={`text-sm font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              ${netProfit.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page component ──

export default function LaborEfficiency() {
  const today = new Date();
  const monday = getMonday(today);

  const [startDate, setStartDate] = useState(toDateStr(monday));
  const [endDate, setEndDate] = useState(toDateStr(today));
  const [crewRate, setCrewRate] = useState(() => {
    try { return parseFloat(localStorage.getItem('labor-crew-rate')) || 15; } catch { return 15; }
  });
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [entries, setEntries] = useState(loadEntries);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/labor-data?start=${startDate}&end=${endDate}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to fetch' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Save crew rate
  useEffect(() => {
    try { localStorage.setItem('labor-crew-rate', String(crewRate)); } catch {}
  }, [crewRate]);

  // Entry change handler
  const handleEntryChange = useCallback((dateStr, field, value) => {
    setEntries((prev) => {
      const updated = {
        ...prev,
        [dateStr]: { ...prev[dateStr], [field]: value },
      };
      saveEntries(updated);
      return updated;
    });
  }, []);

  // Date range presets
  const setThisWeek = () => {
    setStartDate(toDateStr(getMonday(today)));
    setEndDate(toDateStr(today));
  };

  const setLastWeek = () => {
    const lastMonday = getMonday(today);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastSunday.getDate() + 6);
    setStartDate(toDateStr(lastMonday));
    setEndDate(toDateStr(lastSunday));
  };

  const setThisMonth = () => {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(toDateStr(first));
    setEndDate(toDateStr(today));
  };

  // Compute dates and summary
  const dates = useMemo(() => getDateRange(startDate, endDate), [startDate, endDate]);

  const summary = useMemo(() => {
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalLabor = 0;
    let daysWithLabor = 0;
    let efficiencySum = 0;

    for (const dateStr of dates) {
      const dayData = data[dateStr];
      const entry = entries[dateStr] || {};
      const revenue = dayData?.revenue || 0;
      const expenses = parseFloat(entry.expenses) || 0;
      const jobberHours = dayData?.labor?.totalHours || 0;
      const manualHours = parseFloat(entry.hours) || 0;
      const hours = jobberHours > 0 ? jobberHours : manualHours;
      const laborOverride = parseFloat(entry.laborCost) || 0;
      const laborCost = laborOverride > 0 ? laborOverride : hours * crewRate;

      totalRevenue += revenue;
      totalExpenses += expenses;
      totalLabor += laborCost;

      if (laborCost > 0 && revenue > 0) {
        daysWithLabor++;
        efficiencySum += (laborCost / revenue) * 100;
      }
    }

    const avgLaborPct = daysWithLabor > 0 ? efficiencySum / daysWithLabor : 0;
    const netProfit = totalRevenue - totalExpenses - totalLabor;

    return { totalRevenue, totalExpenses, totalLabor, avgLaborPct, netProfit, daysWithLabor };
  }, [dates, data, entries, crewRate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-light flex items-center justify-center">
            <TrendingUp size={20} className="text-brand" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-primary">Labor Efficiency</h1>
            <p className="text-sm text-muted">Track revenue vs. labor costs</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Quick select + date range */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { const t = toDateStr(new Date()); setStartDate(t); setEndDate(t); }} className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${startDate === endDate && startDate === toDateStr(new Date()) ? 'bg-brand text-on-brand' : 'bg-surface-alt text-secondary hover:bg-brand-light hover:text-brand-text-strong'}`}>Today</button>
        <button onClick={() => { const y = new Date(); y.setDate(y.getDate() - 1); const ys = toDateStr(y); setStartDate(ys); setEndDate(ys); }} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-alt text-secondary hover:bg-brand-light hover:text-brand-text-strong cursor-pointer transition-colors">Yesterday</button>
        <button onClick={setThisWeek} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-alt text-secondary hover:bg-brand-light hover:text-brand-text-strong cursor-pointer transition-colors">This Week</button>
        <button onClick={setLastWeek} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-alt text-secondary hover:bg-brand-light hover:text-brand-text-strong cursor-pointer transition-colors">Last Week</button>
        <button onClick={setThisMonth} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface-alt text-secondary hover:bg-brand-light hover:text-brand-text-strong cursor-pointer transition-colors">This Month</button>
      </div>

      {/* Custom date range */}
      <div className="flex items-center gap-3">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-card text-primary focus:outline-none focus:ring-2 focus:ring-brand/30" />
        <span className="text-xs text-muted">to</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-card text-primary focus:outline-none focus:ring-2 focus:ring-brand/30" />
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-muted">Hourly Rate</span>
          <div className="relative w-20">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted text-xs">$</span>
            <input type="number" step="0.50" min="0" value={crewRate}
              onChange={(e) => setCrewRate(parseFloat(e.target.value) || 0)}
              className="w-full pl-5 pr-2 py-1.5 text-sm rounded-lg border border-border-subtle bg-card text-primary focus:outline-none focus:ring-2 focus:ring-brand/30" />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-card rounded-xl border border-border-subtle p-4 text-center">
          <p className="text-[11px] font-medium text-muted mb-1">Revenue</p>
          <p className="text-lg font-bold text-primary">${summary.totalRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border-subtle p-4 text-center">
          <p className="text-[11px] font-medium text-muted mb-1">Expenses</p>
          <p className="text-lg font-bold text-primary">${summary.totalExpenses.toFixed(2)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border-subtle p-4 text-center">
          <p className="text-[11px] font-medium text-muted mb-1">Labor</p>
          <p className="text-lg font-bold text-primary">${summary.totalLabor.toFixed(2)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border-subtle p-4 text-center">
          <p className="text-[11px] font-medium text-muted mb-1">Avg Labor %</p>
          <p className={`text-lg font-bold ${summary.daysWithLabor > 0 ? laborPctColor(summary.avgLaborPct) : 'text-muted'}`}>
            {summary.daysWithLabor > 0 ? `${summary.avgLaborPct.toFixed(0)}%` : '--'}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border-subtle p-4 text-center col-span-2 sm:col-span-1">
          <p className="text-[11px] font-medium text-muted mb-1">Net Profit</p>
          <p className={`text-lg font-bold ${summary.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            ${summary.netProfit.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-brand" />
          <span className="ml-2 text-sm text-muted">Loading visit data...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
          <AlertCircle size={18} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Daily cards */}
      {!loading && (
        <div className="space-y-3">
          {dates.map((dateStr) => {
            const dayData = data[dateStr] || { visits: [], revenue: 0 };
            const entry = entries[dateStr] || {};
            return (
              <DayCard
                key={dateStr}
                dateStr={dateStr}
                revenue={dayData.revenue}
                visits={dayData.visits}
                labor={dayData.labor}
                entry={entry}
                crewRate={crewRate}
                onEntryChange={handleEntryChange}
              />
            );
          })}
        </div>
      )}

      {!loading && !error && dates.length === 0 && (
        <div className="text-center py-12 text-muted text-sm">
          Select a date range to view labor efficiency data.
        </div>
      )}
    </div>
  );
}
