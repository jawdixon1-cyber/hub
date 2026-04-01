import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, AlertCircle, RefreshCw, Fuel, ChevronDown, ChevronUp, TrendingUp, Users, Briefcase, CalendarDays, Link2, Repeat, ArrowUpDown, BarChart3, Clock } from 'lucide-react';
import { getTimezone, getTodayInTimezone } from '../utils/timezone';
import { useAppStore } from '../store/AppStoreContext';

const FUEL_COST_PER_MILE = 0.25;

// ── Formatting ──

function fmtHrs(h) {
  if (!h || h <= 0) return '0m';
  const hr = Math.floor(h);
  const m = Math.round((h - hr) * 60);
  if (hr === 0) return `${m}m`;
  if (m === 0) return `${hr}h`;
  return `${hr}h ${m}m`;
}
function fmtDollars(v) { return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`; }
function pct(v) { return v > 0 ? `${v.toFixed(0)}%` : '--'; }

// ── Date helpers ──

function toDateStr(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: getTimezone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function getMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return d;
}
function getDateRange(start, end) {
  const dates = [];
  const cur = new Date(start + 'T12:00:00');
  const endD = new Date(end + 'T12:00:00');
  while (cur <= endD) { dates.push(toDateStr(cur)); cur.setDate(cur.getDate() + 1); }
  return dates;
}
function shortDay(ds) {
  const d = new Date(ds + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Colors ──

function laborColor(p) { return p === 0 ? 'text-muted' : p <= 35 ? 'text-emerald-500' : p <= 45 ? 'text-amber-500' : 'text-red-500'; }
function laborBg(p) { return p <= 35 ? 'bg-emerald-500/10 border-emerald-500/30' : p <= 45 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30'; }
function laborDot(p) { return p <= 35 ? 'bg-emerald-500' : p <= 45 ? 'bg-amber-500' : 'bg-red-500'; }
function profitColor(v) { return v > 0 ? 'text-emerald-500' : v < 0 ? 'text-red-500' : 'text-muted'; }
function rphColor(v) { return v === 0 ? 'text-muted' : v > 80 ? 'text-emerald-500' : v >= 65 ? 'text-amber-500' : 'text-red-500'; }

// ── Stat Card ──

function Stat({ label, value, color, sub, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`bg-card rounded-xl border border-border-subtle p-2.5 text-center ${onClick ? 'cursor-pointer hover:border-border-strong transition-colors' : ''}`}>
      <p className="text-[9px] font-bold text-muted uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-black leading-tight mt-0.5 ${color || 'text-primary'}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </Tag>
  );
}

// ══════════════════════════════════════════
//  TAB: DAILY VIEW
// ══════════════════════════════════════════

function useCrewStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    const fetchStatus = () => {
      fetch('/api/jobber-data?action=crew-status')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setStatus(d); })
        .catch(() => {});
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);
  return status;
}

function ClockBadge({ person, elapsedMin }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 text-[10px] font-bold">
      <Clock size={10} className="animate-spin" style={{ animationDuration: '3s' }} />
      {elapsedMin}m
    </span>
  );
}

function TodayView({ allJobs }) {
  const todayStr = getTodayInTimezone();
  const todayJobs = allJobs.filter(j => j.date === todayStr);
  const crewStatus = useCrewStatus();

  // Build a map of which clients have active timers
  const activeByClient = useMemo(() => {
    const map = {};
    if (!crewStatus?.active) return map;
    for (const a of crewStatus.active) {
      const key = a.client || '__general__';
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    return map;
  }, [crewStatus]);

  const hasActive = crewStatus?.active?.length > 0;

  if (todayJobs.length === 0 && !hasActive) return <p className="text-muted text-sm py-8 text-center">No jobs logged today yet.</p>;

  const totalVisitRevenue = todayJobs.reduce((s, j) => s + (j.visitTotal || j.revenue), 0);
  const totalLabor = todayJobs.reduce((s, j) => s + j.laborCost, 0);
  const totalExpenses = todayJobs.reduce((s, j) => s + j.expenses, 0);
  const overallLaborPct = totalVisitRevenue > 0 ? (totalLabor / totalVisitRevenue) * 100 : 0;

  // Active jobs (clocked in but not in allJobs yet)
  const activeNotInJobs = (crewStatus?.active || []).filter(a => {
    if (!a.client) return true; // general time
    return !todayJobs.some(j => j.client === a.client);
  });

  return (
    <div className="space-y-3">
      {/* Active clock-ins that don't have a completed job yet */}
      {activeNotInJobs.map((a, i) => (
        <div key={`active-${i}`} className="rounded-xl border overflow-hidden bg-emerald-500/5 border-emerald-500/30">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-primary truncate">{a.client || 'General Time'}</p>
                  <ClockBadge person={a.person} elapsedMin={a.elapsedMin} />
                </div>
                <p className="text-[10px] text-muted">{a.person} — in progress</p>
              </div>
            </div>
          </div>
        </div>
      ))}

      {todayJobs.sort((a, b) => (a.completedAt || a.date || '').localeCompare(b.completedAt || b.date || '')).map(j => {
        const bp = j.byPerson || {};
        const hasPeople = Object.keys(bp).length > 0;
        const profit = (j.visitTotal || j.revenue) - j.laborCost - j.expenses;
        const activeOnJob = activeByClient[j.client] || [];

        return (
          <div key={j.id} className={`rounded-xl border overflow-hidden ${activeOnJob.length > 0 ? 'bg-emerald-500/5 border-emerald-500/30' : j.laborCost > 0 ? laborBg(j.laborPct) : 'bg-card border-border-subtle'}`}>
            {/* Job header */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-primary truncate">{j.client}</p>
                    {activeOnJob.map((a, i) => <ClockBadge key={i} person={a.person} elapsedMin={a.elapsedMin} />)}
                  </div>
                  {j.title && j.title !== j.client && (
                    <p className="text-[10px] text-muted truncate">{j.title}</p>
                  )}
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-black text-primary">{fmtDollars(j.visitTotal || j.revenue)}</p>
                  <p className={`text-[11px] font-bold ${laborColor(j.laborPct)}`}>{pct(j.laborPct)} labor</p>
                </div>
              </div>

              {/* Crew breakdown */}
              {hasPeople && (
                <div className="mt-2.5 pt-2.5 border-t border-white/10 space-y-1">
                  {Object.entries(bp).map(([name, info]) => {
                    const hrs = typeof info === 'object' ? info.hours : info;
                    const rate = typeof info === 'object' ? info.rate : 0;
                    const cost = typeof info === 'object' ? info.cost : 0;
                    return (
                      <div key={name} className="flex items-center justify-between text-[11px]">
                        <span className="text-primary font-medium">{name}</span>
                        <span className="text-muted">{fmtHrs(hrs)} × ${rate}/hr = <span className="font-bold text-primary">${cost.toFixed(2)}</span></span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Expenses */}
              {j.expenses > 0 && (
                <div className="flex items-center justify-between text-[11px] text-red-400 font-semibold mt-1 pt-1 border-t border-white/10">
                  <span>Expenses</span>
                  <span>-${j.expenses.toFixed(2)}</span>
                </div>
              )}

              {/* Profit line */}
              <div className="flex items-center justify-between text-xs mt-1.5 pt-1.5 border-t border-white/10">
                <span className="text-muted font-bold">Profit</span>
                <span className={`font-black ${profitColor(profit)}`}>{fmtDollars(profit)}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Day total */}
      <div className="rounded-xl bg-card border border-border-subtle px-4 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-muted">{todayJobs.length} jobs today</span>
          <div className="flex items-center gap-4">
            <span className="text-primary font-black">{fmtDollars(totalVisitRevenue)} rev</span>
            <span className={`font-black ${laborColor(overallLaborPct)}`}>{pct(overallLaborPct)} labor</span>
            <span className={`font-black ${profitColor(totalVisitRevenue - totalLabor - totalExpenses)}`}>{fmtDollars(totalVisitRevenue - totalLabor - totalExpenses)} profit</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  TAB: CLIENT PROFITABILITY
// ══════════════════════════════════════════

function ClientView({ allJobs }) {
  const [sortBy, setSortBy] = useState('laborPct'); // laborPct | profit | revenue | visits

  const clients = useMemo(() => {
    const map = {};
    for (const j of allJobs) {
      const name = j.client || 'Unknown';
      if (!map[name]) map[name] = { name, revenue: 0, laborCost: 0, expenses: 0, hours: 0, visits: 0, jobs: [] };
      map[name].revenue += j.revenue;
      map[name].laborCost += j.laborCost;
      map[name].expenses += j.expenses;
      map[name].hours += j.hours;
      map[name].visits += 1;
      map[name].jobs.push(j);
    }
    return Object.values(map).map(c => ({
      ...c,
      profit: c.revenue - c.laborCost - c.expenses,
      laborPct: c.revenue > 0 ? (c.laborCost / c.revenue) * 100 : 0,
      avgRevPerVisit: c.visits > 0 ? c.revenue / c.visits : 0,
      revPerHour: c.hours > 0 ? c.revenue / c.hours : 0,
    })).sort((a, b) => {
      if (sortBy === 'laborPct') return b.laborPct - a.laborPct; // worst first
      if (sortBy === 'profit') return a.profit - b.profit; // worst first
      if (sortBy === 'revenue') return b.revenue - a.revenue;
      return b.visits - a.visits;
    });
  }, [allJobs, sortBy]);

  const [expanded, setExpanded] = useState(null);

  if (clients.length === 0) return <p className="text-muted text-sm py-8 text-center">No client data for this period.</p>;

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {[['laborPct', 'Worst Labor %'], ['profit', 'Lowest Profit'], ['revenue', 'Top Revenue'], ['visits', 'Most Visits']].map(([k, l]) => (
          <button key={k} onClick={() => setSortBy(k)}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-md cursor-pointer ${sortBy === k ? 'bg-brand text-on-brand' : 'bg-surface-alt text-secondary hover:bg-brand-light'}`}>{l}</button>
        ))}
      </div>

      {clients.map((c, i) => {
        const open = expanded === c.name;
        return (
          <div key={c.name} className={`rounded-xl border overflow-hidden ${c.laborPct > 45 ? 'bg-red-500/5 border-red-500/20' : c.laborPct <= 35 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-card border-border-subtle'}`}>
            <button onClick={() => setExpanded(open ? null : c.name)}
              className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer">
              <span className={`text-xs font-black w-6 shrink-0 ${c.laborPct > 45 ? 'text-red-500' : c.laborPct <= 35 ? 'text-emerald-500' : 'text-amber-500'}`}>#{i + 1}</span>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-bold text-primary truncate">{c.name}</p>
                <p className="text-[11px] text-muted">{c.visits} visit{c.visits !== 1 ? 's' : ''} · {fmtHrs(c.hours)} · {fmtDollars(c.avgRevPerVisit)}/visit</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-black ${profitColor(c.profit)}`}>{fmtDollars(c.profit)}</p>
                <p className={`text-[11px] font-bold ${laborColor(c.laborPct)}`}>{pct(c.laborPct)} labor</p>
              </div>
              {open ? <ChevronUp size={14} className="text-muted shrink-0" /> : <ChevronDown size={14} className="text-muted shrink-0" />}
            </button>
            {open && (
              <div className="px-4 pb-3 border-t border-border-subtle pt-2 space-y-2">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-[9px] font-bold text-muted uppercase">Revenue</p>
                    <p className="text-xs font-black text-primary">{fmtDollars(c.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-muted uppercase">Labor</p>
                    <p className="text-xs font-black text-amber-400">{fmtDollars(c.laborCost)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-muted uppercase">$/Hr</p>
                    <p className={`text-xs font-black ${rphColor(c.revPerHour)}`}>${c.revPerHour.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-muted uppercase">Profit</p>
                    <p className={`text-xs font-black ${profitColor(c.profit)}`}>{fmtDollars(c.profit)}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  {c.jobs.sort((a, b) => b.laborPct - a.laborPct).map(j => (
                    <div key={j.id} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-surface-alt/50">
                      <span className="text-muted">{shortDay(j.date)}</span>
                      <span className="text-primary font-semibold">{fmtDollars(j.revenue)}</span>
                      <span className={`font-bold ${laborColor(j.laborPct)}`}>{pct(j.laborPct)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════
//  TAB: JOB SCORECARD
// ══════════════════════════════════════════

function JobsView({ allJobs }) {
  const [sortBy, setSortBy] = useState('laborPct');

  const sorted = useMemo(() => {
    const jobs = allJobs.filter(j => j.revenue > 0 || j.laborCost > 0);
    return jobs.sort((a, b) => {
      if (sortBy === 'laborPct') return b.laborPct - a.laborPct;
      if (sortBy === 'profit') return (a.revenue - a.laborCost - a.expenses) - (b.revenue - b.laborCost - b.expenses);
      if (sortBy === 'revenue') return b.revenue - a.revenue;
      return b.hours - a.hours;
    });
  }, [allJobs, sortBy]);

  const [expanded, setExpanded] = useState(null);

  if (sorted.length === 0) return <p className="text-muted text-sm py-8 text-center">No jobs for this period.</p>;

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {[['laborPct', 'Worst Labor %'], ['profit', 'Lowest Profit'], ['revenue', 'Top Revenue'], ['hours', 'Most Hours']].map(([k, l]) => (
          <button key={k} onClick={() => setSortBy(k)}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-md cursor-pointer ${sortBy === k ? 'bg-brand text-on-brand' : 'bg-surface-alt text-secondary hover:bg-brand-light'}`}>{l}</button>
        ))}
      </div>

      {sorted.map(j => {
        const open = expanded === j.id;
        const profit = j.revenue - j.laborCost - j.expenses;
        const bp = j.byPerson || {};
        const hasPeople = Object.keys(bp).length > 0;

        return (
          <div key={j.id} className={`rounded-xl border overflow-hidden ${j.laborCost > 0 ? laborBg(j.laborPct) : 'bg-card border-border-subtle'}`}>
            <button onClick={() => hasPeople && setExpanded(open ? null : j.id)}
              className="w-full flex items-center gap-2 px-4 py-2.5 cursor-pointer">
              <span className={`w-2 h-2 rounded-full shrink-0 ${j.laborCost > 0 ? laborDot(j.laborPct) : 'bg-gray-400'}`} />
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-bold text-primary truncate">{j.client}</p>
                <p className="text-[10px] text-muted">{shortDay(j.date)} · {fmtHrs(j.hours)}</p>
              </div>
              <span className="text-xs font-bold text-primary shrink-0">{fmtDollars(j.revenue)}</span>
              <span className={`text-xs font-bold shrink-0 w-10 text-right ${laborColor(j.laborPct)}`}>{pct(j.laborPct)}</span>
              <span className={`text-xs font-bold shrink-0 w-14 text-right ${profitColor(profit)}`}>{fmtDollars(profit)}</span>
              {hasPeople && (open ? <ChevronUp size={12} className="text-muted shrink-0" /> : <ChevronDown size={12} className="text-muted shrink-0" />)}
            </button>
            {open && hasPeople && (
              <div className="px-4 pb-2.5 space-y-0.5 border-t border-white/5 pt-2">
                {Object.entries(bp).map(([name, info]) => (
                  <div key={name} className="flex items-center justify-between text-[11px] text-muted">
                    <span>{name}</span>
                    <span>{fmtHrs(info.hours)} × ${info.rate} = ${info.cost.toFixed(2)}</span>
                  </div>
                ))}
                {j.expenses > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-red-400 font-semibold border-t border-white/10 pt-0.5 mt-0.5">
                    <span>Expenses</span>
                    <span>-${j.expenses.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════
//  TAB: CREW PERFORMANCE
// ══════════════════════════════════════════

function CrewView({ crew, totalRevenue }) {
  const members = useMemo(() =>
    Object.entries(crew).map(([name, info]) => {
      const genPct = info.hours > 0 ? (info.generalHours / info.hours) * 100 : 0;
      const rate = info.hours > 0 ? info.cost / info.hours : 0;
      return { name, ...info, genPct, rate };
    }).sort((a, b) => b.hours - a.hours),
  [crew]);

  if (members.length === 0) return <p className="text-muted text-sm py-8 text-center">No crew data for this period.</p>;

  return (
    <div className="space-y-3">
      {members.map(m => {
        const jobPct = m.hours > 0 ? ((m.hours - m.generalHours) / m.hours) * 100 : 0;
        return (
          <div key={m.name} className="rounded-xl bg-card border border-border-subtle p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-primary">{m.name}</p>
                <p className="text-[11px] text-muted">${m.rate.toFixed(0)}/hr · {fmtHrs(m.hours)} total</p>
              </div>
              <p className="text-lg font-black text-amber-400">${m.cost.toFixed(0)}</p>
            </div>

            {/* Time split bar */}
            <div>
              <div className="flex rounded-full h-2 overflow-hidden bg-surface-alt">
                <div className="bg-emerald-500 transition-all" style={{ width: `${jobPct}%` }} />
                <div className="bg-amber-500 transition-all" style={{ width: `${m.genPct}%` }} />
              </div>
              <div className="flex justify-between mt-1 text-[10px]">
                <span className="text-emerald-500 font-bold">Job: {fmtHrs(m.jobHours)} ({jobPct.toFixed(0)}%)</span>
                <span className={`font-bold ${m.genPct > 25 ? 'text-red-500' : 'text-amber-500'}`}>General: {fmtHrs(m.generalHours)} ({m.genPct.toFixed(0)}%)</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════
//  MAIN: FULFILL PAGE
// ══════════════════════════════════════════

// ══════════════════════════════════════════
//  TAB: RECURRING CLIENTS
// ══════════════════════════════════════════

function RecurringView() {
  const [clients, setClients] = useState([]);
  const [laborByClient, setLaborByClient] = useState({});
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('newest');
  const [sortDir, setSortDir] = useState('desc');
  const [error, setError] = useState(null);

  useEffect(() => {
    const today = getTodayInTimezone();
    const yearStart = today.slice(0, 4) + '-01-01';
    const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const thirtyStr = thirtyAgo.toISOString().split('T')[0];

    Promise.all([
      fetch(`/api/commander/summary?start=${yearStart}&end=${today}`)
        .then(r => { if (!r.ok) return r.json().catch(() => ({})).then(e => { throw new Error(e.error || `HTTP ${r.status}`); }); return r.json(); }),
      fetch(`/api/jobber-data?action=labor&start=${thirtyStr}&end=${today}`)
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([commanderData, laborData]) => {
      if (commanderData?.recurringClientList) setClients(commanderData.recurringClientList);

      // Aggregate labor % by client name from last 30 days
      if (laborData) {
        const byClient = {};
        for (const [, day] of Object.entries(laborData)) {
          for (const v of (day.visits || [])) {
            const name = v.client || 'Unknown';
            if (!byClient[name]) byClient[name] = { revenue: 0, laborCost: 0, visits: 0 };
            const vl = v.labor || {};
            const totalJobHrs = v.totalJobHours || 0;
            const dailyHrs = v.actualDailyHours || 0;
            const rawTotal = parseFloat(v.rawJobTotal || v.jobTotal) || 0;
            const dailyRev = totalJobHrs > 0 && dailyHrs > 0 ? rawTotal * (dailyHrs / totalJobHrs) : (parseFloat(v.jobTotal) || 0);
            byClient[name].revenue += dailyRev;
            byClient[name].laborCost += vl.totalCost || 0;
            byClient[name].visits += 1;
          }
        }
        setLaborByClient(byClient);
      }
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };

  // Enrich clients with labor data
  const enriched = useMemo(() => clients.map(c => {
    const labor = laborByClient[c.name];
    const laborPct = labor && labor.revenue > 0 ? (labor.laborCost / labor.revenue) * 100 : null;
    return { ...c, laborPct, laborVisits: labor?.visits || 0 };
  }), [clients, laborByClient]);

  const sorted = useMemo(() => {
    const list = [...enriched];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'perVisit': return (a.perVisit - b.perVisit) * dir;
        case 'monthly': return (a.monthly - b.monthly) * dir;
        case 'laborPct': {
          const ap = a.laborPct ?? 999; const bp = b.laborPct ?? 999;
          return (ap - bp) * dir;
        }
        case 'newest': {
          // Use first job's jobNumber as proxy for signup order (higher = newer)
          const aNum = Math.max(...a.jobs.map(j => j.jobNumber || 0));
          const bNum = Math.max(...b.jobs.map(j => j.jobNumber || 0));
          return (aNum - bNum) * dir;
        }
        default: return a.name.localeCompare(b.name) * dir;
      }
    });
    return list;
  }, [enriched, sortKey, sortDir]);

  const activeClients = enriched.filter(c => c.monthly > 0);
  const inactiveClients = enriched.filter(c => c.monthly <= 0);
  const totalMonthly = activeClients.reduce((s, c) => s + c.monthly, 0);
  const avgMonthly = activeClients.length > 0 ? totalMonthly / activeClients.length : 0;

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-brand" /></div>;
  if (error) return (
    <div className="flex flex-col items-center gap-2 py-8">
      <p className="text-muted text-sm">{error.includes('Throttled') ? 'Jobber is rate limiting — wait a moment and try again.' : error}</p>
      <button onClick={() => window.location.reload()}
        className="px-4 py-2 rounded-lg bg-brand text-on-brand text-xs font-bold cursor-pointer"><RefreshCw size={12} className="inline mr-1.5" />Retry</button>
    </div>
  );
  if (enriched.length === 0) return <p className="text-muted text-sm py-8 text-center">No recurring clients found.</p>;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card rounded-xl border border-border-subtle p-3 text-center">
          <p className="text-[9px] font-bold text-muted uppercase tracking-wider">Active</p>
          <p className="text-2xl font-black text-primary mt-0.5">{activeClients.length}</p>
          {inactiveClients.length > 0 && <p className="text-[10px] text-muted mt-0.5">+{inactiveClients.length} inactive</p>}
        </div>
        <div className="bg-card rounded-xl border border-border-subtle p-3 text-center">
          <p className="text-[9px] font-bold text-muted uppercase tracking-wider">Monthly Rev</p>
          <p className="text-2xl font-black text-emerald-500 mt-0.5">${Math.round(totalMonthly).toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl border border-border-subtle p-3 text-center">
          <p className="text-[9px] font-bold text-muted uppercase tracking-wider">Avg/Client</p>
          <p className="text-2xl font-black text-primary mt-0.5">${Math.round(avgMonthly)}</p>
        </div>
      </div>

      {/* Sort pills */}
      <div className="flex flex-wrap gap-1.5">
        {[['newest', 'Newest First'], ['name', 'A-Z'], ['laborPct', 'Worst Labor %'], ['monthly', 'Top Revenue']].map(([k, l]) => (
          <button key={k} onClick={() => toggleSort(k)}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-md cursor-pointer ${sortKey === k ? 'bg-brand text-on-brand' : 'bg-surface-alt text-secondary hover:bg-brand-light'}`}>{l}</button>
        ))}
      </div>

      {/* Active clients */}
      {sorted.filter(c => c.monthly > 0).map((c, i) => (
        <div key={c.name} className={`rounded-xl border px-4 py-3 ${c.laborPct != null && c.laborPct > 45 ? 'bg-red-500/5 border-red-500/20' : c.laborPct != null && c.laborPct <= 35 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-card border-border-subtle'}`}>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-muted w-6 shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-primary truncate">{c.name}</p>
              <p className="text-[10px] text-muted">
                {c.jobs.length === 1 ? c.jobs[0].frequency : c.jobs.map(j => j.frequency).join(', ')}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-black text-emerald-500">${Math.round(c.monthly)}/mo</p>
              <p className="text-[10px] text-muted">${Math.round(c.perVisit)}/visit</p>
            </div>
            <div className="w-12 text-right shrink-0">
              {c.laborPct != null ? (
                <p className={`text-xs font-black ${laborColor(c.laborPct)}`}>{c.laborPct.toFixed(0)}%</p>
              ) : (
                <p className="text-[10px] text-muted">--</p>
              )}
              <p className="text-[9px] text-muted">labor</p>
            </div>
          </div>
        </div>
      ))}

      {/* Total */}
      <div className="flex items-center justify-between px-4 py-3 border-t-2 border-border-default">
        <span className="text-xs font-bold text-primary">{activeClients.length} active clients</span>
        <span className="text-sm font-black text-emerald-500">${Math.round(totalMonthly).toLocaleString()}/mo</span>
      </div>

      {/* Inactive clients ($0/mo) */}
      {inactiveClients.length > 0 && (
        <>
          <p className="text-[10px] font-black text-muted uppercase tracking-widest px-4 pt-2">Not Recurring — $0/mo</p>
          {sorted.filter(c => c.monthly <= 0).map((c) => (
            <div key={c.name} className="bg-card/50 rounded-xl border border-border-subtle/50 px-4 py-3 opacity-60">
              <div className="flex items-center gap-3">
                <span className="w-6 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-muted truncate">{c.name}</p>
                  <p className="text-[10px] text-muted">
                    {c.jobs.length === 1 ? c.jobs[0].frequency : c.jobs.map(j => j.frequency).join(', ')}
                  </p>
                </div>
                <span className="text-xs font-bold text-muted w-16 text-right">${Math.round(c.perVisit)}</span>
                <span className="text-xs font-bold text-muted w-20 text-right">$0/mo</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
//  TAB: NUMBERS (scorecard + date range)
// ══════════════════════════════════════════

function NumbersView({ analysis, dates, data, milesByDate, allJobs, crew, startDate, endDate, setStartDate, setEndDate, fetchData, loading }) {
  const todayStr = getTodayInTimezone();
  const setToday = () => { const t = getTodayInTimezone(); setStartDate(t); setEndDate(t); };
  const setYesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = toDateStr(d); setStartDate(s); setEndDate(s); };
  const setThisWeek = () => { setStartDate(toDateStr(getMonday(todayStr))); setEndDate(todayStr); };
  const setLastWeek = () => { const lm = getMonday(todayStr); lm.setDate(lm.getDate() - 7); const ls = new Date(lm); ls.setDate(ls.getDate() + 6); setStartDate(toDateStr(lm)); setEndDate(toDateStr(ls)); };
  const setThisMonth = () => { const [y, mo] = todayStr.split('-'); setStartDate(toDateStr(new Date(Number(y), Number(mo) - 1, 1))); setEndDate(todayStr); };

  return (
    <div className="space-y-4">
      {/* Date pills + range */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[['Today', setToday], ['Yesterday', setYesterday], ['Week', setThisWeek], ['Last Wk', setLastWeek], ['Month', setThisMonth]].map(([l, fn]) => (
          <button key={l} onClick={fn} className="px-2.5 py-1 text-[11px] font-bold rounded-md cursor-pointer bg-surface-alt text-secondary hover:bg-brand-light">{l}</button>
        ))}
        <div className="flex items-center gap-1.5 ml-auto text-[11px]">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-1.5 py-0.5 rounded border border-border-subtle bg-card text-primary" />
          <span className="text-muted">→</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-1.5 py-0.5 rounded border border-border-subtle bg-card text-primary" />
        </div>
      </div>

      {/* Scorecard */}
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Revenue" value={fmtDollars(analysis.revenue)} />
        <Stat label="Labor %" value={pct(analysis.laborPct)} color={laborColor(analysis.laborPct)} />
        <Stat label="$/Hr" value={analysis.revPerHour > 0 ? `$${analysis.revPerHour.toFixed(0)}` : '--'} color={rphColor(analysis.revPerHour)} />
        <Stat label="Profit" value={fmtDollars(analysis.profit)} color={profitColor(analysis.profit)} sub={analysis.revenue > 0 ? `${analysis.profitPct.toFixed(0)}% margin` : undefined} />
      </div>

      {/* Jobs list for the range */}
      <ClientView allJobs={allJobs} />
    </div>
  );
}

const TABS = [
  { id: 'today', label: 'Today', icon: CalendarDays },
  { id: 'recurring', label: 'Recurring', icon: Repeat },
  { id: 'numbers', label: 'Numbers', icon: BarChart3 },
  { id: 'crew', label: 'Crew', icon: Users },
];

export default function LaborEfficiency() {
  const todayStr = getTodayInTimezone();
  const [tab, setTab] = useState('today');
  const [startDate, setStartDate] = useState(() => toDateStr(getMonday(todayStr)));
  const [endDate, setEndDate] = useState(todayStr);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [disconnected, setDisconnected] = useState(false);
  const mileageLog = useAppStore((s) => s.mileageLog);
  const vehicles = useAppStore((s) => s.vehicles);

  const companyTruckId = useMemo(() => {
    const v = (vehicles || []).find(v => v.nickname === 'Company Truck' || (v.qbName || '').includes('2016 Ford F150'));
    return v?.id;
  }, [vehicles]);

  const milesByDate = useMemo(() => {
    const map = {};
    (mileageLog || []).forEach(e => {
      if (!e.date) return;
      const n = (e.vehicleName || '').toLowerCase();
      if (!n.includes('company truck') && !n.includes('2016 ford f150') && !n.includes('2016 ford f-150')) {
        if (companyTruckId && e.vehicleId !== companyTruckId) return;
        if (!companyTruckId) return;
      }
      const mi = parseFloat(e.odometer) || 0;
      if (mi) map[e.date] = (map[e.date] || 0) + mi;
    });
    return map;
  }, [mileageLog, companyTruckId]);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null); setDisconnected(false);
    try {
      const res = await fetch(`/api/jobber-data?action=labor&start=${startDate}&end=${endDate}`);
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        if (res.status === 401 || e?.code === 'JOBBER_DISCONNECTED') { setDisconnected(true); return; }
        const msg = e?.error || (res.status === 429 ? 'Jobber is busy — try again in a minute.' : `HTTP ${res.status}`);
        throw new Error(msg);
      }
      setData(await res.json());
    } catch (e) {
      setError(e.message?.includes('Throttled') ? 'Jobber is busy — try again in a minute.' : e.message);
    } finally { setLoading(false); }
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const dates = useMemo(() => getDateRange(startDate, endDate), [startDate, endDate]);

  // ── Shared analysis (used across all tabs) ──
  const analysis = useMemo(() => {
    let fuel = 0, miles = 0;
    let dayTotalHrs = 0, dayGenHrs = 0, dayTotalCost = 0, dayJobCost = 0;
    const allJobs = [];
    const crew = {};
    let totalExpenses = 0;

    for (const ds of dates) {
      const day = data[ds];
      if (!day) continue;
      const l = day.labor || {};
      dayTotalHrs += l.totalHours || 0;
      dayTotalCost += l.totalCost || 0;
      dayJobCost += l.jobCost || 0;
      dayGenHrs += l.generalHours || 0;
      const dm = milesByDate[ds] || 0;
      miles += dm; fuel += dm * FUEL_COST_PER_MILE;

      for (const [name, info] of Object.entries(l.byPerson || {})) {
        if (typeof info !== 'object') continue;
        if (!crew[name]) crew[name] = { hours: 0, cost: 0, jobHours: 0, generalHours: 0 };
        crew[name].hours += info.hours;
        crew[name].cost += info.cost;
        crew[name].jobHours += info.jobHours || 0;
        crew[name].generalHours += info.generalHours || 0;
      }

      for (const v of (day.visits || [])) {
        const vl = v.labor || {};
        const totalJobHrs = v.totalJobHours || 0;
        const dailyHrs = v.actualDailyHours || 0;
        const totalJobExp = v.totalJobExpenses || 0;
        const jobTotal = parseFloat(v.jobTotal) || 0;
        const rawJobTotal = parseFloat(v.rawJobTotal || v.jobTotal) || 0;
        const dailyRevenue = totalJobHrs > 0 && dailyHrs > 0 ? rawJobTotal * (dailyHrs / totalJobHrs) : jobTotal;
        const dailyExpenses = totalJobHrs > 0 && dailyHrs > 0 ? totalJobExp * (dailyHrs / totalJobHrs) : (v.jobExpenses || 0);
        const cost = vl.totalCost || 0;
        const hrs = vl.totalHours || 0;
        totalExpenses += dailyExpenses;

        allJobs.push({
          id: v.id + ds, date: ds, client: v.client, title: v.title || '', revenue: dailyRevenue,
          visitTotal: rawJobTotal,
          laborCost: cost, hours: hrs, expenses: dailyExpenses,
          laborPct: dailyRevenue > 0 && cost > 0 ? (cost / dailyRevenue) * 100 : 0,
          revPerHour: hrs > 0 ? dailyRevenue / hrs : 0,
          byPerson: vl.byPerson || {},
          jobId: v.jobId || null,
        });
      }
    }

    const revenue = allJobs.reduce((s, j) => s + j.revenue, 0);
    const profit = revenue - dayTotalCost - totalExpenses - fuel;

    return {
      revenue, laborCost: dayTotalCost, totalExpenses, fuel, miles, profit,
      totalHrs: dayTotalHrs,
      laborPct: revenue > 0 ? (dayTotalCost / revenue) * 100 : 0,
      profitPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      revPerHour: dayTotalHrs > 0 ? revenue / dayTotalHrs : 0,
      allJobs, crew,
    };
  }, [dates, data, milesByDate]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-primary tracking-tight">Profitability</h1>
        <button onClick={fetchData} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Disconnected state */}
      {disconnected && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-center space-y-2">
          <p className="text-sm font-bold text-amber-500">Jobber Disconnected</p>
          <p className="text-xs text-muted">Reconnect Jobber in Settings to see your data.</p>
          <a href="/settings" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition-colors">
            <Link2 size={14} /> Go to Settings
          </a>
        </div>
      )}

      {loading && <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-brand" /></div>}
      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs"><AlertCircle size={14} />{error}</div>}

      {!loading && !error && !disconnected && (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 bg-surface-alt p-1 rounded-xl overflow-x-auto">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex-1 justify-center ${
                    active ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'
                  }`}>
                  <Icon size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {tab === 'today' && <TodayView allJobs={analysis.allJobs} />}
          {tab === 'recurring' && <RecurringView />}
          {tab === 'numbers' && <NumbersView analysis={analysis} dates={dates} data={data} milesByDate={milesByDate} allJobs={analysis.allJobs} crew={analysis.crew} startDate={startDate} endDate={endDate} setStartDate={setStartDate} setEndDate={setEndDate} fetchData={fetchData} loading={loading} />}
          {tab === 'crew' && <CrewView crew={analysis.crew} totalRevenue={analysis.revenue} />}
        </>
      )}
    </div>
  );
}
