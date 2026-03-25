import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, AlertCircle, RefreshCw, Fuel, ChevronDown, ChevronUp } from 'lucide-react';
import { getTimezone, getTodayInTimezone } from '../utils/timezone';
import { useAppStore } from '../store/AppStoreContext';

const FUEL_COST_PER_MILE = 0.25;

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

  return (
    <div className={`rounded-lg border ${job.laborCost > 0 ? prodBg(job.laborPct) : 'bg-surface-alt/30 border-border-subtle'}`}>
      <button onClick={() => hasPeople && setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer">
        <span className={`w-2 h-2 rounded-full shrink-0 ${job.laborCost > 0 ? prodDot(job.laborPct) : 'bg-gray-400'}`} />
        <span className="text-xs font-semibold text-primary truncate flex-1 text-left">{job.client}</span>
        <span className="text-xs font-bold text-primary shrink-0">${job.revenue.toFixed(0)}</span>
        <span className={`text-xs font-bold shrink-0 w-12 text-right ${prodColor(job.laborPct)}`}>{job.laborPct > 0 ? `${job.laborPct.toFixed(0)}%` : '--'}</span>
        <span className={`text-xs font-bold shrink-0 w-14 text-right ${rphColor(job.revPerHour)}`}>{job.revPerHour > 0 ? `$${job.revPerHour.toFixed(0)}/hr` : ''}</span>
        {hasPeople && (open ? <ChevronUp size={12} className="text-muted shrink-0" /> : <ChevronDown size={12} className="text-muted shrink-0" />)}
      </button>
      {open && hasPeople && (
        <div className="px-3 pb-2 space-y-0.5">
          {Object.entries(bp).map(([name, info]) => {
            const hrs = typeof info === 'object' ? info.hours : info;
            const rate = typeof info === 'object' ? info.rate : 0;
            const cost = typeof info === 'object' ? info.cost : 0;
            return (
              <div key={name} className="flex items-center justify-between text-[11px] text-muted">
                <span>{name}</span>
                <span>{hrs.toFixed(1)}h × ${rate} = ${cost.toFixed(2)}</span>
              </div>
            );
          })}
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
    let revenue = 0, totalCost = 0, jobCost = 0, totalHrs = 0, genHrs = 0, fuel = 0, miles = 0;
    const allJobs = [];
    const crew = {};

    for (const ds of dates) {
      const day = data[ds];
      if (!day) continue;
      revenue += day.revenue || 0;
      const l = day.labor || {};
      totalCost += l.totalCost || 0;
      jobCost += l.jobCost || 0;
      totalHrs += l.totalHours || 0;
      genHrs += l.generalHours || 0;
      const dm = milesByDate[ds] || 0;
      miles += dm; fuel += dm * FUEL_COST_PER_MILE;

      // Crew summary
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
        const cost = vl.totalCost || 0;
        const hrs = vl.totalHours || 0;
        allJobs.push({
          id: v.id + ds, client: v.client, revenue: v.jobTotal || 0,
          laborCost: cost, hours: hrs,
          laborPct: v.jobTotal > 0 && cost > 0 ? (cost / v.jobTotal) * 100 : 0,
          revPerHour: hrs > 0 ? (v.jobTotal || 0) / hrs : 0,
          byPerson: vl.byPerson || {},
        });
      }
    }

    // Sort worst to best
    allJobs.sort((a, b) => b.laborPct - a.laborPct);
    const problems = allJobs.filter(j => j.laborPct > 45 && j.laborCost > 0);

    const m = {
      revenue, totalCost, jobCost, totalHrs, fuel, miles,
      trueLaborPct: revenue > 0 ? (totalCost / revenue) * 100 : 0,
      prodLaborPct: revenue > 0 ? (jobCost / revenue) * 100 : 0,
      generalPct: totalHrs > 0 ? (genHrs / totalHrs) * 100 : 0,
      revPerHour: totalHrs > 0 ? revenue / totalHrs : 0,
      netProfit: revenue - totalCost - fuel,
    };

    return { m, allJobs, crew, diagnosis: diagnose(m), actions: getActions(m, problems) };
  }, [dates, data, milesByDate]);

  const { m, allJobs, crew, diagnosis, actions } = analysis;

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
          {/* ═══ SCORECARD ═══ */}
          <div className="grid grid-cols-5 gap-2">
            {[
              ['Revenue', `$${m.revenue.toFixed(0)}`, 'text-primary'],
              ['Prod Labor', m.prodLaborPct > 0 ? `${m.prodLaborPct.toFixed(0)}%` : '--', prodColor(m.prodLaborPct)],
              ['True Labor', m.trueLaborPct > 0 ? `${m.trueLaborPct.toFixed(0)}%` : '--', trueColor(m.trueLaborPct)],
              ['General', m.generalPct > 0 ? `${m.generalPct.toFixed(0)}%` : '--', genColor(m.generalPct)],
              ['$/Hr', m.revPerHour > 0 ? `$${m.revPerHour.toFixed(0)}` : '--', rphColor(m.revPerHour)],
            ].map(([label, val, color]) => (
              <div key={label} className="bg-card rounded-xl border border-border-subtle p-2.5 text-center">
                <p className="text-[9px] font-bold text-muted uppercase tracking-wider">{label}</p>
                <p className={`text-lg font-black ${color} leading-tight mt-0.5`}>{val}</p>
              </div>
            ))}
          </div>

          {/* Net + Fuel */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-card border border-border-subtle text-xs">
            <div><span className="text-muted font-bold">NET </span><span className={`font-black ${m.netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>${m.netProfit.toFixed(2)}</span></div>
            {m.miles > 0 && <div className="text-muted flex items-center gap-1"><Fuel size={11} />{m.miles}mi · ${m.fuel.toFixed(2)}</div>}
            <div className="text-muted">{m.totalHrs.toFixed(1)}h</div>
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
                          <span className="font-bold text-primary">{info.hours.toFixed(1)}h · ${info.cost.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] text-muted pl-2">
                          <span>Job: {info.jobHours.toFixed(1)}h</span>
                          <span className={genPct > 25 ? 'text-red-500 font-bold' : ''}>General: {info.generalHours.toFixed(1)}h ({genPct.toFixed(0)}%)</span>
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
