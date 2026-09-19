/* ─── Payroll, the simple way ───
 * One screen. Jobs down the side, people across the top, hours in the cells.
 * Revenue and COG per job, tick "done" when it's finished. Everything else
 * is computed by the same engine the detailed pages use, and saved to the
 * same tables, so the audit trail and WIP rules still hold. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePayroll } from './PayrollContext.jsx';
import { Badge, Btn, Money, Hours, Pct, Tip, TIPS } from './ui.jsx';
import { toCents, toDollars, toHundredths, laborCents } from '../../lib/payroll/money.js';
import { addDaysISO, weekEndingFor } from '../../lib/payroll/engine.js';
import { exportRunCsv } from './RunDetail.jsx';

const cell = 'w-full rounded-md border px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-[#B0FF03] disabled:bg-slate-50 disabled:text-slate-500';
const NP = '__np__'; // pseudo-row for non-production hours

export default function Simple() {
  const p = usePayroll();
  const nav = useNavigate();
  const { weekEnding: paramWeek } = useParams();
  const week = paramWeek || p.currentWeekEnding;
  const run = p.runs.find((r) => r.week_ending === week) || null;
  const locked = run?.status === 'finalized';
  const result = useMemo(() => (locked && run.snapshot ? run.snapshot : p.compute(week, run?.id)), [p, week, run, locked]);
  const emps = p.employees.filter((e) => e.active);
  const [busy, setBusy] = useState(false);
  const [newJob, setNewJob] = useState('');
  const [checked, setChecked] = useState(false);
  useEffect(() => setChecked(false), [week]);

  // Jobs on this week's sheet: anything still open, anything finishing this week, anything with hours this week.
  const weekEntries = p.timeEntries.filter((t) => t.week_ending === week);
  const jobs = p.jobs.filter((j) => j.status === 'wip' || j.bonus_week_ending === week || weekEntries.some((t) => t.job_id === j.id) || (j.status === 'complete' && !j.bonus_processed_run_id && j.bonus_week_ending && j.bonus_week_ending < week));

  const hoursFor = (jobId, empId) => weekEntries.filter((t) => (jobId === NP ? !t.job_id || t.kind === 'non_production' : t.job_id === jobId && t.kind === 'production') && t.employee_id === empId).reduce((s, t) => s + Number(t.hours), 0);
  const priorHours = (jobId) => p.timeEntries.filter((t) => t.job_id === jobId && t.kind === 'production' && t.week_ending !== week).reduce((s, t) => s + toHundredths(t.hours), 0);
  const itemFor = (empId, type) => p.payItems.find((i) => i.week_ending === week && i.employee_id === empId && i.type === type && !i.paid_run_id);

  /* Writes: each cell edit replaces that person's entries for that job this week with one entry. */
  const setHours = async (jobId, emp, value) => {
    const h = Math.round(Number(value || 0) * 100) / 100;
    const existing = weekEntries.filter((t) => (jobId === NP ? (!t.job_id || t.kind === 'non_production') : t.job_id === jobId && t.kind === 'production') && t.employee_id === emp.id);
    if (existing.length && existing.length === 1 && Number(existing[0].hours) === h) return;
    setBusy(true);
    try {
      for (const t of existing) await p.save.deleteTime(t.id);
      if (h > 0) await p.save.time({ employee_id: emp.id, job_id: jobId === NP ? null : jobId, worked_on: week, week_ending: week, hours: h, kind: jobId === NP ? 'non_production' : 'production', hourly_rate_snapshot: emp.hourly_rate, notes: null });
    } finally { setBusy(false); }
  };
  const setJob = async (j, patch) => { setBusy(true); try { await p.save.job({ id: j.id, ...patch }); } finally { setBusy(false); } };
  const toggleDone = (j) => setJob(j, j.status === 'complete'
    ? { status: 'wip', completed_on: null, bonus_week_ending: null }
    : { status: 'complete', completed_on: week, bonus_week_ending: week });
  const addJob = async () => {
    if (!newJob.trim()) return;
    setBusy(true);
    try { await p.save.job({ name: newJob.trim(), revenue: 0, cog: 0, status: 'wip', started_on: week }); setNewJob(''); } finally { setBusy(false); }
  };
  const setRate = (emp, v) => p.save.employee({ id: emp.id, hourly_rate: toDollars(toCents(v)) });
  const setItem = async (emp, type, v) => {
    const amt = toDollars(toCents(v)); const ex = itemFor(emp.id, type);
    if (ex && amt === Number(ex.amount)) return;
    setBusy(true);
    try {
      if (ex) { if (amt === 0) await p.save.deleteItem(ex.id); else await p.save.item({ id: ex.id, amount: amt }); }
      else if (amt !== 0) await p.save.item({ employee_id: emp.id, type, amount: amt, description: type === 'reimbursement' ? 'Reimbursement' : 'Bonus', item_date: week, week_ending: week });
    } finally { setBusy(false); }
  };
  const finalize = async () => {
    if (!checked) return;
    if (!confirm(`Finalize payroll for week ending ${week}? This locks it.`)) return;
    setBusy(true);
    try {
      const r = run || await p.save.run({ week_ending: week, status: 'draft', target_pct: p.settings.target_pct, allocation_method: p.settings.allocation_method, checklist: {} });
      await p.save.finalize(r, p.compute(week, r.id), { simple: true, checked: true });
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const reopen = async () => { if (prompt('Type REOPEN to unlock this week. Anything already paid from it could be paid again.') === 'REOPEN') { setBusy(true); try { await p.save.reopen(run); } finally { setBusy(false); } } };

  const c = result.completed;
  const under = c.laborPctBps != null && c.laborPctBps < result.targetBps;

  return (
    <div className="space-y-5">
      {/* week picker */}
      <div className="flex flex-wrap items-center gap-2">
        <Btn kind="ghost" onClick={() => nav(`/payroll/${addDaysISO(week, -7)}`)}>‹</Btn>
        <div className="text-2xl font-black">Week ending {week}</div>
        <Btn kind="ghost" onClick={() => nav(`/payroll/${addDaysISO(week, 7)}`)}>›</Btn>
        <Badge kind={locked ? 'finalized' : 'draft'}>{locked ? 'Finalized' : 'Open'}</Badge>
        {busy && <span className="text-xs text-slate-400">saving…</span>}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <Link to="/payroll/runs" className="text-slate-500 hover:underline">Past weeks</Link>
          <Link to="/payroll/dashboard" className="text-slate-500 hover:underline">Details</Link>
          <Link to="/payroll/settings" className="text-slate-500 hover:underline">Settings</Link>
        </div>
      </div>

      {emps.length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">Add your people first: <Link className="font-bold underline" to="/payroll/employees">Employees →</Link></div>}

      {/* 1. work + hours */}
      <section className="rounded-xl border bg-white">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-bold">1. This week's work &amp; hours</h3>
          <span className="text-xs text-slate-500">Tick <b>Done</b> when a job is finished. Unfinished jobs are still paid, but held out of the bonus.<Tip text={TIPS.wip} /></span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead><tr className="border-b bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left">Job</th><th className="px-3 py-2 text-right w-28">Revenue</th><th className="px-3 py-2 text-right w-24">COG</th><th className="px-3 py-2 text-center w-16">Done</th>
              {emps.map((e) => <th key={e.id} className="px-3 py-2 text-right w-24">{e.name}<div className="font-normal normal-case tracking-normal">hrs</div></th>)}
              <th className="px-3 py-2 text-right w-24">Labor</th>
            </tr></thead>
            <tbody>
              {jobs.map((j) => {
                const prior = priorHours(j.id); const done = j.status === 'complete';
                const lab = result.completed.jobs.find((x) => x.id === j.id) || result.wip.jobs.find((x) => x.id === j.id);
                return (
                  <tr key={j.id} className={`border-b last:border-0 ${done ? 'bg-green-50/40' : ''}`}>
                    <td className="px-3 py-2 text-sm">
                      <Link to={`/payroll/jobs/${j.id}`} className="font-semibold hover:underline">{j.name}</Link>
                      <div className="text-xs text-slate-500">{done ? `done · ${j.bonus_week_ending < week ? 'carried from ' + j.bonus_week_ending : 'bonus this week'}` : 'still going · held'}{prior > 0 && <> · <Hours hh={prior} /> from earlier weeks</>}</div>
                    </td>
                    <td className="px-3 py-2"><input className={cell} disabled={locked || !!j.bonus_processed_run_id} defaultValue={j.revenue || ''} placeholder="0" onBlur={(e) => toDollars(toCents(e.target.value)) !== Number(j.revenue) && setJob(j, { revenue: toDollars(toCents(e.target.value)) })} /></td>
                    <td className="px-3 py-2"><input className={cell} disabled={locked || !!j.bonus_processed_run_id} defaultValue={j.cog || ''} placeholder="0" onBlur={(e) => toDollars(toCents(e.target.value)) !== Number(j.cog) && setJob(j, { cog: toDollars(toCents(e.target.value)) })} /></td>
                    <td className="px-3 py-2 text-center"><input type="checkbox" className="h-5 w-5" checked={done} disabled={locked || !!j.bonus_processed_run_id} onChange={() => toggleDone(j)} /></td>
                    {emps.map((e) => <td key={e.id} className="px-3 py-2"><input className={cell} disabled={locked} defaultValue={hoursFor(j.id, e.id) || ''} placeholder="0" onBlur={(ev) => setHours(j.id, e, ev.target.value)} /></td>)}
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-600">{lab ? <Money c={lab.labor} /> : '—'}</td>
                  </tr>);
              })}
              <tr className="border-b bg-slate-50/60">
                <td className="px-3 py-2 text-sm"><span className="font-semibold">Other hours</span><div className="text-xs text-slate-500">shop, drive, training — paid, never in the bonus</div></td>
                <td /><td /><td />
                {emps.map((e) => <td key={e.id} className="px-3 py-2"><input className={cell} disabled={locked} defaultValue={hoursFor(NP, e.id) || ''} placeholder="0" onBlur={(ev) => setHours(NP, e, ev.target.value)} /></td>)}
                <td />
              </tr>
              {!locked && (
                <tr><td colSpan={4 + emps.length + 1} className="px-3 py-2">
                  <div className="flex gap-2"><input className="flex-1 rounded-md border px-3 py-1.5 text-sm" placeholder="Add a job (customer name / what it was)" value={newJob} onChange={(e) => setNewJob(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addJob()} /><Btn kind="ghost" onClick={addJob}>+ Add</Btn></div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. bonus math */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Box label="Revenue (done jobs)" v={<Money c={c.revenue} />} />
        <Box label="− COG" v={<Money c={c.cog} />} />
        <Box label={`= Adjusted × ${result.targetBps / 100}%`} v={<Money c={c.targetBudget} />} sub={<>adjusted <Money c={c.adjusted} /></>} />
        <Box label="− Production labor" v={<Money c={c.labor} />} sub={<Pct bps={c.laborPctBps} className={c.laborPctBps == null ? '' : under ? 'text-green-700 font-bold' : 'text-red-700 font-bold'} />} />
        <Box label="= Bonus pool" v={<Money c={c.pool} />} tone={c.pool > 0 ? 'good' : c.laborPctBps == null ? undefined : 'bad'} sub={c.laborPctBps == null ? 'no finished work' : under ? 'under target' : 'at/over target — no bonus'} />
      </section>
      {result.wip.count > 0 && <p className="-mt-2 text-xs text-amber-800">Held for later: {result.wip.count} unfinished job(s), <Money c={result.wip.adjusted} /> adjusted revenue, <Hours hh={result.wip.hours} /> hours. Not in the pool.</p>}

      {/* 3. people */}
      <section className="rounded-xl border bg-white">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-bold">2. Pay</h3>
          <span className="text-xs text-slate-500">Bonus splits by share of hours on finished jobs. Extras are optional.</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr className="border-b bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left">Person</th><th className="px-3 py-2 text-right w-24">Rate</th><th className="px-3 py-2 text-right">Hours</th><th className="px-3 py-2 text-right">Base pay</th><th className="px-3 py-2 text-right">Bonus share</th><th className="px-3 py-2 text-right">Prod. bonus</th><th className="px-3 py-2 text-right w-28">Extra bonus</th><th className="px-3 py-2 text-right w-28">Reimburse</th><th className="px-3 py-2 text-right">Total</th>
            </tr></thead>
            <tbody>
              {result.employees.filter((e) => emps.some((x) => x.id === e.employee_id)).map((e) => { const emp = emps.find((x) => x.id === e.employee_id); return (
                <tr key={e.employee_id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-semibold">{e.name}{e.flags.filter((f) => f !== '0 hours this week').map((f) => <Badge key={f} kind="warn">{f}</Badge>)}</td>
                  <td className="px-3 py-2"><input className={cell} disabled={locked} defaultValue={emp.hourly_rate} onBlur={(ev) => toDollars(toCents(ev.target.value)) !== Number(emp.hourly_rate) && setRate(emp, ev.target.value)} /></td>
                  <td className="px-3 py-2 text-right text-sm"><Hours hh={e.total_hours} /><div className="text-xs text-slate-500"><Hours hh={e.production_hours} /> prod</div></td>
                  <td className="px-3 py-2 text-right text-sm font-semibold"><Money c={e.base_wages} /></td>
                  <td className="px-3 py-2 text-right text-sm text-slate-600"><Pct bps={e.share_bps} /></td>
                  <td className="px-3 py-2 text-right text-sm font-semibold text-green-700"><Money c={e.production_bonus} /></td>
                  <td className="px-3 py-2"><input className={cell} disabled={locked} defaultValue={itemFor(emp.id, 'other_bonus')?.amount || ''} placeholder="0" onBlur={(ev) => setItem(emp, 'other_bonus', ev.target.value)} /></td>
                  <td className="px-3 py-2"><input className={cell} disabled={locked} defaultValue={itemFor(emp.id, 'reimbursement')?.amount || ''} placeholder="0" onBlur={(ev) => setItem(emp, 'reimbursement', ev.target.value)} /></td>
                  <td className="px-3 py-2 text-right text-base font-black"><Money c={e.payout} /><div className="text-[11px] font-normal text-slate-500">wages <Money c={e.gross} /></div></td>
                </tr>); })}
            </tbody>
            <tfoot><tr className="border-t bg-slate-50 font-bold text-sm">
              <td className="px-3 py-2">Total</td><td /><td className="px-3 py-2 text-right"><Hours hh={result.totals.production_hours + result.totals.non_production_hours} /></td>
              <td className="px-3 py-2 text-right"><Money c={result.totals.base_wages} /></td><td /><td className="px-3 py-2 text-right"><Money c={result.totals.production_bonus} /></td>
              <td className="px-3 py-2 text-right"><Money c={result.totals.other_bonuses} /></td><td className="px-3 py-2 text-right"><Money c={result.totals.reimbursements} /></td>
              <td className="px-3 py-2 text-right text-base"><Money c={result.totals.payout} /></td>
            </tr></tfoot>
          </table>
        </div>
        <p className="px-4 pb-3 text-xs text-slate-500">"Wages" is what goes into the payroll provider (base + bonuses). Reimbursements are paid on top and aren't wages.</p>
      </section>

      {/* 4. finalize */}
      <section className="rounded-xl border bg-white p-4">
        {locked ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge kind="finalized">Finalized {new Date(run.finalized_at).toLocaleDateString()}</Badge>
            <Btn kind="ghost" onClick={() => exportRunCsv(result, week)}>Export CSV</Btn>
            <Link to={`/payroll/runs/${run.id}`}><Btn kind="ghost">Print view</Btn></Link>
            <Btn kind="danger" className="ml-auto" onClick={reopen}>Reopen…</Btn>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> I checked reviews, reimbursements, and that every finished job is ticked Done.</label>
            <Btn kind="dark" className="ml-auto" onClick={finalize} disabled={!checked || busy}>Finalize week</Btn>
          </div>
        )}
      </section>
    </div>
  );
}

function Box({ label, v, sub, tone }) {
  const t = tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-700' : 'text-slate-900';
  return <div className="rounded-xl border bg-white p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div><div className={`text-xl font-black tabular-nums ${t}`}>{v}</div>{sub && <div className="text-xs text-slate-500">{sub}</div>}</div>;
}
