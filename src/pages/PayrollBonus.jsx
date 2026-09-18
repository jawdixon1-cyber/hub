import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Loader2, ChevronLeft, ChevronRight, TrendingUp, AlertCircle, Info, RefreshCw,
} from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';
import { getTimezone } from '../utils/timezone';

/* ─── Weekly payroll & bonus ───
 *
 * Labor is a fixed share of adjusted revenue. Each week the only question is
 * how much of that share went out as wages and how much is still owed as bonus:
 *
 *   adjusted revenue = revenue − materials − rentals − other
 *   target           = adjusted revenue × 30%
 *   bonus            = max(0, target − actual payroll)
 *
 * Beat the target and the crew keeps the difference. Miss it and the bonus is
 * zero — nothing carries into next week, so a rained-out week never follows
 * them into a good one.
 *
 * Production hours come from Jobber timesheets. Non-production hours (drive
 * time, shop, rain) are entered by hand because Jobber does not reliably
 * separate them — but they are still paid, so they count against the target.
 * The split is shown either way, since "how much of the week was billable" is
 * the number that explains a bad margin.
 *
 * Nothing here writes to Jobber. Timesheets are read-only in Hub.
 */

const DEFAULT_SHARE = 30;

const money = (v) =>
  `$${(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hrs = (h) => {
  if (!h) return '0h';
  const w = Math.floor(h);
  const m = Math.round((h - w) * 60);
  return m ? `${w}h ${m}m` : `${w}h`;
};

const tz = () => getTimezone();
const dateStr = (d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Monday of the week containing `d`. */
function mondayOf(d) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day + (day === 0 ? -6 : 1));
  x.setHours(12, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const prettyRange = (mon) => {
  const sun = addDays(mon, 6);
  const f = (d) => new Intl.DateTimeFormat('en-US', { timeZone: tz(), month: 'short', day: 'numeric' }).format(d);
  return `${f(mon)} – ${f(sun)}`;
};

/* ─── inputs ─── */

function MoneyInput({ label, value, onChange, hint }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <div className="mt-1 relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          placeholder="0.00"
          className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-surface-alt border border-border-subtle text-primary text-sm font-semibold focus:outline-none focus:border-brand"
        />
      </div>
      {hint && <span className="text-[10px] text-muted mt-1 block">{hint}</span>}
    </label>
  );
}

function Stat({ label, value, sub, tone }) {
  const tones = {
    good: 'text-emerald-600 dark:text-emerald-400',
    bad: 'text-red-600 dark:text-red-400',
    brand: 'text-brand-text-strong',
  };
  return (
    <div className="rounded-xl bg-surface-alt px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${tones[tone] || 'text-primary'}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PayrollBonus() {
  // The store is a Zustand selector hook — one subscription per slice, so a
  // change elsewhere doesn't re-render this page.
  const rawWeeks = useAppStore((s) => s.payrollWeeks);
  const setPayrollWeeks = useAppStore((s) => s.setPayrollWeeks);
  // Memoised because `rawWeeks || {}` builds a fresh object every render, and
  // both saveWeek and the calc depend on it. Without this the callbacks are
  // rebuilt each pass — the same identity problem that made the quoting map
  // re-zoom after every shape.
  const weeks = useMemo(() => rawWeeks || {}, [rawWeeks]);

  const [monday, setMonday] = useState(() => mondayOf(addDays(new Date(), -7))); // last full week
  const [labor, setLabor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const weekKey = dateStr(monday);
  const week = useMemo(() => weeks[weekKey] || {}, [weeks, weekKey]);
  const share = week.share ?? DEFAULT_SHARE;

  const saveWeek = useCallback((patch) => {
    setPayrollWeeks({ ...weeks, [weekKey]: { ...week, ...patch } });
  }, [setPayrollWeeks, weeks, weekKey, week]);

  // Production hours come from Jobber timesheets for this exact week.
  const loadLabor = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const start = dateStr(monday);
      const end = dateStr(addDays(monday, 6));
      const res = await fetch(`/api/jobber-data?action=labor&start=${start}&end=${end}`);
      if (!res.ok) throw new Error(res.status === 401 ? 'Jobber is disconnected' : `Jobber returned ${res.status}`);
      setLabor(await res.json());
    } catch (e) {
      setErr(e.message);
      setLabor(null);
    } finally {
      setLoading(false);
    }
  }, [monday]);

  useEffect(() => { loadLabor(); }, [loadLabor]);

  // Roll the daily Jobber response into one row per person for the week.
  const people = useMemo(() => {
    const byName = {};
    const days = labor?.days || labor || {};
    for (const day of Object.values(days)) {
      const bp = day?.labor?.byPerson;
      if (!bp) continue;
      for (const [name, v] of Object.entries(bp)) {
        if (!byName[name]) byName[name] = { name, prodHours: 0, jobberCost: 0 };
        byName[name].prodHours += v.hours || 0;
        byName[name].jobberCost += v.cost || 0;
      }
    }
    const overrides = week.people || {};
    return Object.values(byName)
      .map((p) => {
        const o = overrides[p.name] || {};
        // Derive the rate from what Jobber already costed, unless overridden.
        const derived = p.prodHours > 0 ? p.jobberCost / p.prodHours : 0;
        const rate = o.rate ?? (derived > 0 ? Number(derived.toFixed(2)) : null);
        const nonProd = o.nonProdHours ?? 0;
        const totalHours = p.prodHours + nonProd;
        return { ...p, rate, nonProd, totalHours, wages: (rate || 0) * totalHours };
      })
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [labor, week.people]);

  const setPerson = (name, patch) => {
    const cur = week.people || {};
    saveWeek({ people: { ...cur, [name]: { ...(cur[name] || {}), ...patch } } });
  };

  /* ─── the calculation ─── */
  const calc = useMemo(() => {
    const revenue = week.revenue || 0;
    const deductions = (week.materials || 0) + (week.rentals || 0) + (week.other || 0);
    const adjusted = revenue - deductions;

    const target = adjusted * (share / 100);
    const payroll = people.reduce((s, p) => s + p.wages, 0);
    const bonus = Math.max(0, target - payroll);          // floors at zero, nothing carries
    const over = payroll > target;

    const laborPct = adjusted > 0 ? (payroll / adjusted) * 100 : 0;
    const totalHours = people.reduce((s, p) => s + p.totalHours, 0);
    const prodHours = people.reduce((s, p) => s + p.prodHours, 0);

    return {
      revenue, deductions, adjusted, target, payroll, bonus, over, laborPct,
      totalHours, prodHours,
      prodPct: totalHours > 0 ? (prodHours / totalHours) * 100 : 0,
      marginBefore: adjusted - payroll,
      marginAfter: adjusted - payroll - bonus,
      // Bonus splits by hours worked — the only defensible split when the pool
      // is company-wide and everyone contributed to the same revenue.
      split: people.map((p) => ({
        ...p,
        bonus: totalHours > 0 ? bonus * (p.totalHours / totalHours) : 0,
      })),
    };
  }, [week, people, share]);

  const ready = (week.revenue || 0) > 0;

  /* Past weeks, most recent first. Recomputed from what was saved rather than
   * stored, so a change to the formula corrects history instead of leaving old
   * weeks calculated the old way. Payroll is the one figure taken as recorded —
   * hours come from Jobber and would otherwise shift under you when a timesheet
   * gets edited weeks later. */
  const history = useMemo(() =>
    Object.entries(weeks)
      .filter(([, w]) => (w.revenue || 0) > 0)
      .map(([key, w]) => {
        const adjusted = (w.revenue || 0) - ((w.materials || 0) + (w.rentals || 0) + (w.other || 0));
        const target = adjusted * ((w.share ?? DEFAULT_SHARE) / 100);
        const payroll = w.recordedPayroll || 0;
        const bonus = Math.max(0, target - payroll);
        return {
          key, adjusted, payroll, bonus,
          laborPct: adjusted > 0 ? (payroll / adjusted) * 100 : 0,
          margin: adjusted - payroll - bonus,
          marginPct: adjusted > 0 ? ((adjusted - payroll - bonus) / adjusted) * 100 : 0,
        };
      })
      .sort((a, b) => b.key.localeCompare(a.key))
      .slice(0, 12),
    [weeks]);

  // Record the computed payroll so history stays truthful even if a timesheet
  // is edited later. Written once per week, only when it actually changes.
  useEffect(() => {
    if (!ready || calc.payroll <= 0) return;
    if (Math.abs((week.recordedPayroll || 0) - calc.payroll) < 0.01) return;
    saveWeek({ recordedPayroll: calc.payroll });
  }, [ready, calc.payroll, week.recordedPayroll, saveWeek]);

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary">Payroll &amp; Bonus</h1>
          <p className="text-sm text-muted mt-0.5">
            Labor runs at {share}% of adjusted revenue. Whatever wages don&rsquo;t use, the crew keeps.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-surface-alt rounded-xl p-1">
          <button onClick={() => setMonday(addDays(monday, -7))}
            className="p-2 rounded-lg text-muted hover:text-primary hover:bg-card transition-colors cursor-pointer">
            <ChevronLeft size={15} />
          </button>
          <span className="px-3 text-sm font-semibold text-primary whitespace-nowrap">{prettyRange(monday)}</span>
          <button onClick={() => setMonday(addDays(monday, 7))}
            className="p-2 rounded-lg text-muted hover:text-primary hover:bg-card transition-colors cursor-pointer">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Week inputs */}
      <div className="rounded-2xl border border-border-subtle p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">This week&rsquo;s numbers</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MoneyInput label="Revenue" value={week.revenue} onChange={(v) => saveWeek({ revenue: v })} />
          <MoneyInput label="Materials" value={week.materials} onChange={(v) => saveWeek({ materials: v })} hint="Mulch, straw, rock, seed" />
          <MoneyInput label="Rentals" value={week.rentals} onChange={(v) => saveWeek({ rentals: v })} hint="Skid steer, aerator" />
          <MoneyInput label="Other" value={week.other} onChange={(v) => saveWeek({ other: v })} hint="Dump fees, subs" />
        </div>
      </div>

      {!ready ? (
        <div className="rounded-2xl border border-dashed border-border-subtle p-10 text-center">
          <TrendingUp size={20} className="mx-auto text-muted mb-2" />
          <p className="text-sm font-semibold text-primary">Enter this week&rsquo;s revenue</p>
          <p className="text-xs text-muted mt-1">Everything below calculates from it.</p>
        </div>
      ) : (
        <>
          {/* Headline */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Adjusted revenue" value={money(calc.adjusted)}
              sub={`${money(calc.revenue)} − ${money(calc.deductions)}`} />
            <Stat label={`Labor target (${share}%)`} value={money(calc.target)} tone="brand" />
            <Stat label="Actual payroll" value={money(calc.payroll)}
              sub={`${calc.laborPct.toFixed(1)}% of adjusted`}
              tone={calc.over ? 'bad' : undefined} />
            <Stat label="Bonus owed" value={money(calc.bonus)}
              sub={calc.over ? 'over target — no bonus' : `${(share - calc.laborPct).toFixed(1)} points under`}
              tone={calc.bonus > 0 ? 'good' : undefined} />
          </div>

          {calc.over && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
              <p className="text-xs text-red-700 dark:text-red-400">
                Payroll came in {money(calc.payroll - calc.target)} over target. No bonus this week, and
                nothing carries forward — next week starts clean.
              </p>
            </div>
          )}

          {/* Margin */}
          <div className="rounded-2xl border border-border-subtle p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted mb-3">Margin</p>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Before bonus" value={money(calc.marginBefore)}
                sub={calc.adjusted > 0 ? `${((calc.marginBefore / calc.adjusted) * 100).toFixed(1)}% of adjusted` : null} />
              <Stat label="After full payroll" value={money(calc.marginAfter)}
                sub={calc.adjusted > 0 ? `${((calc.marginAfter / calc.adjusted) * 100).toFixed(1)}% of adjusted` : null} />
            </div>
            <p className="text-[11px] text-muted mt-3 leading-relaxed">
              When a bonus is owed, margin after payroll is always {(100 - share).toFixed(0)}% &mdash; that&rsquo;s the
              point of a fixed share. The gap between these two is what an efficient week earned the crew
              rather than you.
            </p>
          </div>

          {/* Crew */}
          <div className="rounded-2xl border border-border-subtle overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-subtle">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Crew</p>
                <p className="text-[11px] text-muted mt-0.5">
                  {hrs(calc.prodHours)} production of {hrs(calc.totalHours)} paid &middot; {calc.prodPct.toFixed(0)}% billable
                </p>
              </div>
              <button onClick={loadLabor}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-muted hover:text-primary hover:bg-surface-alt transition-colors cursor-pointer">
                {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Refresh hours
              </button>
            </div>

            {err && (
              <p className="px-4 py-3 text-xs text-amber-700 dark:text-amber-500 flex items-center gap-2">
                <AlertCircle size={13} /> {err} — enter hours manually below.
              </p>
            )}

            {people.length === 0 && !loading ? (
              <p className="px-4 py-8 text-center text-xs text-muted">
                No timesheet hours found for this week.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      <th className="text-left px-4 py-2">Name</th>
                      <th className="text-right px-3 py-2">Production</th>
                      <th className="text-right px-3 py-2">Non-prod</th>
                      <th className="text-right px-3 py-2">Rate</th>
                      <th className="text-right px-3 py-2">Wages</th>
                      <th className="text-right px-4 py-2">Bonus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calc.split.map((p) => (
                      <tr key={p.name} className="border-t border-border-subtle">
                        <td className="px-4 py-2.5 font-semibold text-primary whitespace-nowrap">{p.name}</td>
                        <td className="px-3 py-2.5 text-right text-secondary tabular-nums">{hrs(p.prodHours)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number" step="0.25" min="0"
                            value={p.nonProd || ''}
                            onChange={(e) => setPerson(p.name, { nonProdHours: e.target.value === '' ? 0 : Number(e.target.value) })}
                            placeholder="0"
                            className="w-16 px-2 py-1 rounded-lg bg-surface-alt border border-border-subtle text-right text-xs text-primary focus:outline-none focus:border-brand"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number" step="0.25" min="0"
                            value={p.rate ?? ''}
                            onChange={(e) => setPerson(p.name, { rate: e.target.value === '' ? null : Number(e.target.value) })}
                            placeholder="—"
                            className="w-20 px-2 py-1 rounded-lg bg-surface-alt border border-border-subtle text-right text-xs text-primary focus:outline-none focus:border-brand"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right text-secondary tabular-nums">{money(p.wages)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {p.bonus > 0 ? money(p.bonus) : '—'}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border-strong bg-surface-alt/50">
                      <td className="px-4 py-2.5 font-bold text-primary">Total</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-primary tabular-nums">{hrs(calc.prodHours)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-primary tabular-nums">
                        {hrs(calc.totalHours - calc.prodHours)}
                      </td>
                      <td />
                      <td className="px-3 py-2.5 text-right font-bold text-primary tabular-nums">{money(calc.payroll)}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {money(calc.bonus)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <p className="px-4 py-3 text-[11px] text-muted flex items-start gap-2 border-t border-border-subtle">
              <Info size={12} className="mt-0.5 shrink-0" />
              Production hours are read from Jobber timesheets and are never written back. Rates default
              to what Jobber costed each visit; edit one and it sticks for this week only.
            </p>
          </div>

          {/* Week over week */}
          {history.length > 1 && (
            <div className="rounded-2xl border border-border-subtle overflow-hidden">
              <p className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted border-b border-border-subtle">
                Recent weeks
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      <th className="text-left px-4 py-2">Week</th>
                      <th className="text-right px-3 py-2">Adjusted rev</th>
                      <th className="text-right px-3 py-2">Labor %</th>
                      <th className="text-right px-3 py-2">Bonus</th>
                      <th className="text-right px-4 py-2">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => {
                      const active = h.key === weekKey;
                      return (
                        <tr
                          key={h.key}
                          onClick={() => setMonday(mondayOf(new Date(h.key + 'T12:00:00')))}
                          className={`border-t border-border-subtle cursor-pointer transition-colors ${
                            active ? 'bg-brand-light/40' : 'hover:bg-surface-alt'
                          }`}
                        >
                          <td className="px-4 py-2.5 font-semibold text-primary whitespace-nowrap">
                            {prettyRange(mondayOf(new Date(h.key + 'T12:00:00')))}
                          </td>
                          <td className="px-3 py-2.5 text-right text-secondary tabular-nums">{money(h.adjusted)}</td>
                          <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                            h.laborPct > share ? 'text-red-600 dark:text-red-400' : 'text-secondary'
                          }`}>
                            {h.laborPct.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                            {h.bonus > 0 ? money(h.bonus) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-primary tabular-nums">
                            {money(h.margin)}
                            <span className="text-[11px] text-muted ml-1.5">{h.marginPct.toFixed(0)}%</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2.5 text-[11px] text-muted border-t border-border-subtle">
                Click a week to open it. Labor % turns red when payroll ran past the {share}% target.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
