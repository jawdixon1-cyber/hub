import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, AlertCircle, RefreshCw, Fuel, ChevronDown, ChevronUp } from 'lucide-react';
import { getTimezone, getTodayInTimezone } from '../utils/timezone';
import { useAppStore } from '../store/AppStoreContext';

const FUEL_COST_PER_MILE = 0.25;

// ── Format hours as Xh Ym ──
function fmtHrs(decimalHours) {
  if (!decimalHours || decimalHours <= 0) return '0m';
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

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

// ── Colors ──

function prodColor(p) { return p === 0 ? 'text-muted' : p <= 35 ? 'text-emerald-500' : p <= 45 ? 'text-amber-500' : 'text-red-500'; }
function prodBg(p) { return p <= 35 ? 'bg-emerald-500/10 border-emerald-500/30' : p <= 45 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30'; }
function prodDot(p) { return p <= 35 ? 'bg-emerald-500' : p <= 45 ? 'bg-amber-500' : 'bg-red-500'; }
function trueColor(p) { return p === 0 ? 'text-muted' : p < 40 ? 'text-emerald-500' : p <= 50 ? 'text-amber-500' : 'text-red-500'; }
function genColor(p) { return p === 0 ? 'text-muted' : p < 20 ? 'text-emerald-500' : p <= 25 ? 'text-amber-500' : 'text-red-500'; }
function rphColor(v) { return v === 0 ? 'text-muted' : v > 80 ? 'text-emerald-500' : v >= 65 ? 'text-amber-500' : 'text-red-500'; }

// ── Diagnosis ──

function diagnose(m) {
  if (m.revenue === 0) return 'No revenue data yet.';
  const p = [];
  if (m.prodLaborPct <= 35 && m.prodLaborPct > 0) p.push('jobs are priced well');
  else if (m.prodLaborPct > 45) p.push('jobs are underpriced or taking too long');
  else if (m.prodLaborPct > 35) p.push('job pricing is borderline');
  if (m.generalPct > 25) p.push('too much general time is killing efficiency');
  else if (m.generalPct > 20) p.push('general time could be tighter');
  if (m.trueLaborPct > 50) p.push('labor is eating the profit');
  else if (m.trueLaborPct < 40 && m.generalPct < 20 && p.length === 0) p.push('strong day with solid margins');
  if (p.length === 0) return 'Metrics are within acceptable range.';
  const s = p.join(', but ') + '.';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Actions ──

function getActions(m, problems) {
  const a = [];
  if (problems.length > 0) a.push(`Raise ${problems[0].client} to $${Math.ceil(problems[0].laborCost / 0.35)} or drop`);
  if (m.generalPct > 25) a.push('Cut morning startup — crew on first job by 9:15');
  else if (m.generalPct > 20) a.push('Tighten transitions between jobs');
  if (m.prodLaborPct > 45 && problems.length >= 2) a.push('Batch review pricing on red jobs this week');
  if (m.revPerHour < 65 && m.revPerHour > 0) a.push('Target higher-value properties');
  if (a.length === 0) a.push('Stay the course — all metrics healthy');
  return a.slice(0, 3);
}

// ── Expandable job row ──

function JobRow({ job }) {
  const [open, setOpen] = useState(false);
  const bp = job.byPerson || {};
  const hasPeople = Object.keys(bp).length > 0;

  const hasExpenses = (job.expenses || 0) > 0;
  const jobProfit = job.revenue - job.laborCost - (job.expenses || 0);
  const canExpand = hasPeople || hasExpenses;

  return (
    <div className={`rounded-lg border ${job.laborCost > 0 ? prodBg(job.laborPct) : 'bg-surface-alt/30 border-border-subtle'}`}>
      <button onClick={() => canExpand && setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer">
        <span className={`w-2 h-2 rounded-full shrink-0 ${job.laborCost > 0 ? prodDot(job.laborPct) : 'bg-gray-400'}`} />
        <span className="text-xs font-semibold text-primary truncate flex-1 text-left">
          {job.client}
          {job.title && job.title.includes(' - ') && <span className="text-[10px] text-muted font-normal ml-1">{job.title.split(' - ').slice(1).join(' - ')}</span>}
        </span>
        <span className="text-xs font-bold text-primary shrink-0">${job.revenue.toFixed(0)}</span>
        {hasExpenses && <span className="text-[10px] font-bold text-red-400 shrink-0">-${job.expenses.toFixed(0)}</span>}
        <span className={`text-xs font-bold shrink-0 w-12 text-right ${prodColor(job.laborPct)}`}>{job.laborPct > 0 ? `${job.laborPct.toFixed(0)}%` : '--'}</span>
        <span className={`text-xs font-bold shrink-0 w-14 text-right ${rphColor(job.revPerHour)}`}>{job.revPerHour > 0 ? `$${job.revPerHour.toFixed(0)}/hr` : ''}</span>
        {canExpand && (open ? <ChevronUp size={12} className="text-muted shrink-0" /> : <ChevronDown size={12} className="text-muted shrink-0" />)}
      </button>
      {open && canExpand && (
        <div className="px-3 pb-2 space-y-0.5">
          {Object.entries(bp).map(([name, info]) => {
            const hrs = typeof info === 'object' ? info.hours : info;
            const rate = typeof info === 'object' ? info.rate : 0;
            const cost = typeof info === 'object' ? info.cost : 0;
            return (
              <div key={name} className="flex items-center justify-between text-[11px] text-muted">
                <span>{name}</span>
                <span>{fmtHrs(hrs)} × ${rate} = ${cost.toFixed(2)}</span>
              </div>
            );
          })}
          {hasExpenses && (
            <div className="flex items-center justify-between text-[11px] text-red-400 font-semibold border-t border-white/10 pt-0.5 mt-0.5">
              <span>Materials/Expenses</span>
              <span>-${job.expenses.toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-[11px] font-bold border-t border-white/10 pt-0.5 mt-0.5">
            <span className="text-muted">Profit</span>
            <span className={jobProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}>${jobProfit.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──

export default function LaborEfficiency() {
  const todayStr = getTodayInTimezone();
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [crewOpen, setCrewOpen] = useState(false);
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
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/jobber-data?action=labor&start=${startDate}&end=${endDate}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      setData(await res.json());
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const dates = useMemo(() => getDateRange(startDate, endDate), [startDate, endDate]);

  const analysis = useMemo(() => {
    let fuel = 0, miles = 0;
    let dayTotalHrs = 0, dayGenHrs = 0, dayTotalCost = 0, dayJobCost = 0;
    const allJobs = [];
    const crew = {};
    const allExpenseItems = [];

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

      // Collect expense items
      for (const exp of (day.expenses?.items || [])) {
        allExpenseItems.push({ ...exp, date: ds });
      }

      // Crew summary (from day-level data — actual timesheets per person)
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
        const totalJobExp = v.totalJobExpenses || 0;
        const dailyHrs = v.actualDailyHours || 0;
        const jobTotal = parseFloat(v.jobTotal) || 0;
        // Raw job total from Jobber (before distribution)
        const rawJobTotal = parseFloat(v.rawJobTotal || v.jobTotal) || 0;

        // Revenue & expenses: (total / total job hours) × actual daily hours
        const dailyRevenue = totalJobHrs > 0 && dailyHrs > 0 ? rawJobTotal * (dailyHrs / totalJobHrs) : jobTotal;
        const dailyExpenses = totalJobHrs > 0 && dailyHrs > 0 ? totalJobExp * (dailyHrs / totalJobHrs) : (v.jobExpenses || 0);

        // Labor: use day-level actual from timesheets (already in day.labor)
        const cost = vl.totalCost || 0;
        const hrs = vl.totalHours || 0;

        allJobs.push({
          id: v.id + ds, client: v.client, title: v.title || '', revenue: dailyRevenue,
          laborCost: cost, hours: hrs,
          laborPct: dailyRevenue > 0 && cost > 0 ? (cost / dailyRevenue) * 100 : 0,
          revPerHour: hrs > 0 ? dailyRevenue / hrs : 0,
          byPerson: vl.byPerson || {},
          completedAt: v.completedAt || '',
          jobId: v.jobId || null,
          expenses: dailyExpenses,
        });
      }
    }

    // Scorecard: revenue from visits (proportional), labor + hours from day-level (actual)
    const revenue = allJobs.reduce((s, j) => s + j.revenue, 0);
    const totalCost = dayTotalCost;
    const totalHrs = dayTotalHrs;
    const totalExpenses = allJobs.reduce((s, j) => s + j.expenses, 0);
    const genHrs = dayGenHrs;
    const jobCost = dayJobCost;

    // Sort by completion time (earliest first)
    allJobs.sort((a, b) => (a.completedAt || '').localeCompare(b.completedAt || ''));
    const problems = allJobs.filter(j => j.laborPct > 45 && j.laborCost > 0);

    const profit = revenue - totalCost - totalExpenses - fuel;
    const m = {
      revenue, totalCost, jobCost, totalHrs, fuel, miles, totalExpenses,
      trueLaborPct: revenue > 0 ? (totalCost / revenue) * 100 : 0,
      prodLaborPct: revenue > 0 ? (jobCost / revenue) * 100 : 0,
      generalPct: totalHrs > 0 ? (genHrs / totalHrs) * 100 : 0,
      revPerHour: totalHrs > 0 ? revenue / totalHrs : 0,
      profit,
      profitPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    };

    return { m, allJobs, crew, allExpenseItems, diagnosis: diagnose(m), actions: getActions(m, problems) };
  }, [dates, data, milesByDate]);

  const { m, allJobs, crew, allExpenseItems, diagnosis, actions } = analysis;
  const [showLaborBreakdown, setShowLaborBreakdown] = useState(false);
  const [showExpenseBreakdown, setShowExpenseBreakdown] = useState(false);

  const setToday = () => { const t = getTodayInTimezone(); setStartDate(t); setEndDate(t); };
  const setYesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = toDateStr(d); setStartDate(s); setEndDate(s); };
  const setThisWeek = () => { setStartDate(toDateStr(getMonday(todayStr))); setEndDate(todayStr); };
  const setLastWeek = () => { const lm = getMonday(todayStr); lm.setDate(lm.getDate() - 7); const ls = new Date(lm); ls.setDate(ls.getDate() + 6); setStartDate(toDateStr(lm)); setEndDate(toDateStr(ls)); };
  const setThisMonth = () => { const [y, mo] = todayStr.split('-'); setStartDate(toDateStr(new Date(Number(y), Number(mo) - 1, 1))); setEndDate(todayStr); };
  const isToday = startDate === endDate && startDate === todayStr;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-primary tracking-tight">COMMAND CENTER</h1>
        <button onClick={fetchData} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Date pills */}
      <div className="flex flex-wrap gap-1.5">
        {[['Today', setToday, isToday], ['Yesterday', setYesterday], ['Week', setThisWeek], ['Last Wk', setLastWeek], ['Month', setThisMonth]].map(([l, fn, a]) => (
          <button key={l} onClick={fn} className={`px-2.5 py-1 text-[11px] font-bold rounded-md cursor-pointer ${a ? 'bg-brand text-on-brand' : 'bg-surface-alt text-secondary hover:bg-brand-light'}`}>{l}</button>
        ))}
        <div className="flex items-center gap-1.5 ml-auto text-[11px]">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-1.5 py-0.5 rounded border border-border-subtle bg-card text-primary" />
          <span className="text-muted">→</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-1.5 py-0.5 rounded border border-border-subtle bg-card text-primary" />
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-brand" /></div>}
      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs"><AlertCircle size={14} />{error}</div>}

      {!loading && !error && (
        <>
          {/* ═══ FINANCIAL SCORECARD ═══ */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-card rounded-xl border border-border-subtle p-2.5 text-center">
              <p className="text-[9px] font-bold text-muted uppercase tracking-wider">Revenue</p>
              <p className="text-lg font-black text-primary leading-tight mt-0.5">${m.revenue.toFixed(0)}</p>
            </div>
            <button onClick={() => setShowExpenseBreakdown(!showExpenseBreakdown)} className="bg-card rounded-xl border border-border-subtle p-2.5 text-center cursor-pointer hover:border-border-strong transition-colors">
              <p className="text-[9px] font-bold text-muted uppercase tracking-wider">Expenses</p>
              <p className={`text-lg font-black leading-tight mt-0.5 ${m.totalExpenses > 0 ? 'text-red-400' : 'text-muted'}`}>{m.totalExpenses > 0 ? `-$${m.totalExpenses.toFixed(0)}` : '$0'}</p>
            </button>
            <button onClick={() => setShowLaborBreakdown(!showLaborBreakdown)} className="bg-card rounded-xl border border-border-subtle p-2.5 text-center cursor-pointer hover:border-border-strong transition-colors">
              <p className="text-[9px] font-bold text-muted uppercase tracking-wider">Labor</p>
              <p className={`text-lg font-black leading-tight mt-0.5 ${m.totalCost > 0 ? 'text-amber-400' : 'text-muted'}`}>{m.totalCost > 0 ? `-$${m.totalCost.toFixed(0)}` : '$0'}</p>
            </button>
            <div className="bg-card rounded-xl border border-border-subtle p-2.5 text-center">
              <p className="text-[9px] font-bold text-muted uppercase tracking-wider">Profit</p>
              <p className={`text-lg font-black leading-tight mt-0.5 ${m.profit > 0 ? 'text-emerald-500' : m.profit < 0 ? 'text-red-500' : 'text-muted'}`}>${m.profit.toFixed(0)}</p>
            </div>
          </div>

          {/* ═══ LABOR BREAKDOWN ═══ */}
          {showLaborBreakdown && Object.keys(crew).length > 0 && (
            <div className="rounded-lg bg-card border border-amber-500/30 p-3 space-y-1.5">
              <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Labor Breakdown</p>
              {Object.entries(crew).map(([name, info]) => (
                <div key={name} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-primary">{name}</span>
                  <span className="text-muted">
                    {fmtHrs(info.hours)} × ${info.cost > 0 && info.hours > 0 ? (info.cost / info.hours).toFixed(0) : '0'}/hr = <span className="font-bold text-amber-400">${info.cost.toFixed(2)}</span>
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs border-t border-white/10 pt-1.5 mt-1">
                <span className="font-bold text-muted">Total</span>
                <span className="font-black text-amber-400">${m.totalCost.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* ═══ EXPENSE BREAKDOWN ═══ */}
          {showExpenseBreakdown && allExpenseItems.length > 0 && (
            <div className="rounded-lg bg-card border border-red-500/30 p-3 space-y-1.5">
              <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Expense Breakdown</p>
              {allExpenseItems.map((exp, i) => (
                <div key={exp.id || i} className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-primary">{exp.title}</span>
                    {exp.jobNumber && <span className="text-muted ml-1.5">Job #{exp.jobNumber}</span>}
                    {exp.description && <span className="text-muted ml-1.5">— {exp.description}</span>}
                  </div>
                  <span className="font-bold text-red-400 shrink-0 ml-2">${(exp.amount || 0).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs border-t border-white/10 pt-1.5 mt-1">
                <span className="font-bold text-muted">Total</span>
                <span className="font-black text-red-400">${allExpenseItems.reduce((s, e) => s + (e.amount || 0), 0).toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* ═══ LABOR STATS ═══ */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-card border border-border-subtle text-xs">
            <div className="text-center">
              <p className="text-[9px] font-bold text-muted uppercase">Hours</p>
              <p className="font-black text-primary">{fmtHrs(m.totalHrs)}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] font-bold text-muted uppercase">Prod Labor</p>
              <p className={`font-black ${prodColor(m.prodLaborPct)}`}>{m.prodLaborPct > 0 ? `${m.prodLaborPct.toFixed(0)}%` : '--'}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] font-bold text-muted uppercase">True Labor</p>
              <p className={`font-black ${trueColor(m.trueLaborPct)}`}>{m.trueLaborPct > 0 ? `${m.trueLaborPct.toFixed(0)}%` : '--'}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] font-bold text-muted uppercase">General</p>
              <p className={`font-black ${genColor(m.generalPct)}`}>{m.generalPct > 0 ? `${m.generalPct.toFixed(0)}%` : '--'}</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] font-bold text-muted uppercase">$/Hr</p>
              <p className={`font-black ${rphColor(m.revPerHour)}`}>{m.revPerHour > 0 ? `$${m.revPerHour.toFixed(0)}` : '--'}</p>
            </div>
            {m.miles > 0 && (
              <div className="text-center">
                <p className="text-[9px] font-bold text-muted uppercase">Fuel</p>
                <p className="font-black text-muted flex items-center gap-1"><Fuel size={10} />{m.miles}mi</p>
              </div>
            )}
          </div>

          {/* Diagnosis */}
          <p className="text-sm text-primary font-semibold">{diagnosis}</p>

          {/* Actions */}
          <div className="rounded-lg border-2 border-brand/30 bg-card p-3 space-y-1">
            <p className="text-[10px] font-black text-brand uppercase tracking-widest">ACTIONS</p>
            {actions.map((a, i) => (
              <p key={i} className="text-xs text-primary"><span className="text-brand font-black mr-1.5">→</span>{a}</p>
            ))}
          </div>

          {/* ═══ JOBS ═══ */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black text-muted uppercase tracking-widest">JOBS</p>
              <p className="text-[10px] text-muted">{allJobs.length} total</p>
            </div>
            {allJobs.map(j => <JobRow key={j.id} job={j} />)}
          </div>

          {/* ═══ CREW (collapsible) ═══ */}
          {Object.keys(crew).length > 0 && (
            <div className="rounded-lg bg-card border border-border-subtle">
              <button onClick={() => setCrewOpen(!crewOpen)} className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer">
                <p className="text-[10px] font-black text-muted uppercase tracking-widest">CREW</p>
                {crewOpen ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
              </button>
              {crewOpen && (
                <div className="px-3 pb-3 space-y-2">
                  {Object.entries(crew).map(([name, info]) => {
                    const genPct = info.hours > 0 ? (info.generalHours / info.hours) * 100 : 0;
                    return (
                      <div key={name} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-primary">{name}</span>
                          <span className="font-bold text-primary">{fmtHrs(info.hours)} · ${info.cost.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] text-muted pl-2">
                          <span>Job: {fmtHrs(info.jobHours)}</span>
                          <span className={genPct > 25 ? 'text-red-500 font-bold' : ''}>General: {fmtHrs(info.generalHours)} ({genPct.toFixed(0)}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
