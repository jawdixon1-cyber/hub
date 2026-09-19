import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePayroll } from './PayrollContext.jsx';
import { Badge, Btn, Card, Checklist, Field, inputCls, Money, Hours, Pct, Stat, Th, Td, Tip, TIPS, Warnings } from './ui.jsx';
import { toCents, toDollars } from '../../lib/payroll/money.js';
import { FINAL_CHECKLIST, OTHER_PAY_CHECKLIST, PAY_ITEM_LABELS, BONUS_TYPES, addDaysISO } from '../../lib/payroll/engine.js';
import { EmployeeSummaryTable, exportRunCsv } from './RunDetail.jsx';

const STEPS = ['Week', 'Hours', 'Jobs', 'Bonus', 'Other pay', 'Summary', 'Finalize'];

export default function RunPayroll() {
  const p = usePayroll();
  const nav = useNavigate();
  const { weekEnding: paramWeek } = useParams();
  const week = paramWeek || p.currentWeekEnding;
  const run = p.runs.find((r) => r.week_ending === week) || null;
  const finalized = run?.status === 'finalized';
  const [step, setStep] = useState(0);
  const [checks, setChecks] = useState({});
  const [otherChecks, setOtherChecks] = useState({});
  const [jobsConfirmed, setJobsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Seed local checklist state from the DB once per run (not on every refresh,
  // or an in-flight save would clobber ticks made since).
  useEffect(() => { setChecks(run?.checklist?.final || {}); setOtherChecks(run?.checklist?.other || {}); setJobsConfirmed(!!run?.checklist?.jobsConfirmed); }, [run?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo(() => (finalized && run.snapshot ? run.snapshot : p.compute(week, run?.id)), [p, week, run, finalized]);
  const ensureRun = async () => {
    if (run) return run;
    return p.save.run({ week_ending: week, status: 'draft', target_pct: p.settings.target_pct, allocation_method: p.settings.allocation_method, checklist: {} });
  };
  // Checklist ticks are saved as you go, so a reload never loses them.
  const persistChecks = async (next) => {
    if (finalized) return;
    const r = await ensureRun();
    await p.save.run({ id: r.id, week_ending: week, status: 'draft', target_pct: r.target_pct ?? p.settings.target_pct, allocation_method: r.allocation_method ?? p.settings.allocation_method, checklist: next });
  };
  const updChecks = (c) => { setChecks(c); persistChecks({ final: c, other: otherChecks, jobsConfirmed }); };
  const updOther = (c) => { setOtherChecks(c); persistChecks({ final: checks, other: c, jobsConfirmed }); };
  const updJobs = (v) => { setJobsConfirmed(v); persistChecks({ final: checks, other: otherChecks, jobsConfirmed: v }); };
  const errors = result.warnings.filter((w) => w.level === 'error');
  const allChecked = FINAL_CHECKLIST.every(([k]) => checks[k]);
  const otherAllChecked = OTHER_PAY_CHECKLIST.every(([k]) => otherChecks[k]);

  const finalize = async () => {
    if (!allChecked) return alert('Every checklist item must be checked before finalizing.');
    if (errors.length && !confirm(`There are ${errors.length} error-level warnings. Finalize anyway?`)) return;
    if (!confirm(`Finalize payroll for week ending ${week}?\n\nThis locks the numbers, marks ${result.eligibleJobIds.length} job bonus(es) as processed, and marks ${result.payItemIds.length} pay item(s) as paid.`)) return;
    setBusy(true);
    try {
      const r = await ensureRun();
      const fresh = p.compute(week, r.id);
      await p.save.finalize(r, fresh, { final: checks, other: otherChecks, jobsConfirmed });
      nav(`/payroll/runs/${r.id}`);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  const reopen = async () => {
    const typed = prompt(`REOPENING A FINALIZED PAYROLL.\n\nThe frozen numbers stay stored for audit, but the ${(run.snapshot?.eligibleJobIds || []).length} job bonus(es) and ${(run.snapshot?.payItemIds || []).length} pay item(s) this run consumed become eligible again. If you already paid people from this run, you can double-pay.\n\nType REOPEN to continue.`);
    if (typed !== 'REOPEN') return;
    setBusy(true); try { await p.save.reopen(run); setStep(0); } finally { setBusy(false); }
  };

  const goto = (i) => setStep(Math.max(0, Math.min(STEPS.length - 1, i)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-black">Run payroll</h2>
        <Badge kind={finalized ? 'finalized' : 'draft'}>{finalized ? 'Finalized' : 'Draft'}</Badge>
        {finalized && <span className="text-xs text-slate-500">Finalized {new Date(run.finalized_at).toLocaleString()} · <Link className="underline" to={`/payroll/runs/${run.id}`}>view</Link></span>}
        <div className="ml-auto flex gap-2">
          {finalized ? <Btn kind="danger" onClick={reopen} disabled={busy}>Reopen…</Btn> : null}
        </div>
      </div>

      <ol className="flex flex-wrap gap-1">
        {STEPS.map((s, i) => (
          <li key={s}><button onClick={() => goto(i)} className={`rounded-full px-3 py-1 text-xs font-bold ${i === step ? 'bg-slate-900 text-white' : i < step ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}`}>{i + 1}. {s}</button></li>
        ))}
      </ol>

      {step === 0 && (
        <Card title="Step 1 — Choose the payroll week">
          <div className="flex flex-wrap items-center gap-3">
            <Btn kind="ghost" onClick={() => nav(`/payroll/run/${addDaysISO(week, -7)}`)}>‹ Previous week</Btn>
            <div className="text-lg font-black">Week ending {week}</div>
            <Btn kind="ghost" onClick={() => nav(`/payroll/run/${addDaysISO(week, 7)}`)}>Next week ›</Btn>
            <Field label="Or pick a week-ending date"><input type="date" className={inputCls} value={week} onChange={(e) => e.target.value && nav(`/payroll/run/${e.target.value}`)} /></Field>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat label="Employees with hours" value={result.employees.filter((e) => e.total_hours > 0).length} />
            <Stat label="Jobs completing this week" value={result.completed.jobs.length} />
            <Stat label="Jobs in WIP" value={result.wip.count} tip={TIPS.wip} />
          </div>
          {p.runs.some((r) => r.week_ending < week && r.status !== 'finalized') && <p className="mt-3 text-sm text-amber-700">Heads up: an earlier week is still a draft. Finalize weeks in order so carried-forward bonuses land where you expect.</p>}
        </Card>
      )}

      {step === 1 && (
        <Card title="Step 2 — Review employees and hours" right={<Link to="/payroll/time" className="text-sm font-semibold text-[#4d7c0f] hover:underline">Edit time entries →</Link>}>
          <table className="w-full">
            <thead><tr className="border-b"><Th>Employee</Th><Th right>Production</Th><Th right>Non-prod</Th><Th right>Total</Th><Th right>Rate</Th><Th right>Base wages<Tip text={TIPS.base} /></Th><Th>Flags</Th></tr></thead>
            <tbody>{result.employees.map((e) => (
              <tr key={e.employee_id} className="border-b last:border-0">
                <Td className="font-semibold">{e.name}{!e.active && <Badge kind="inactive">Inactive</Badge>}</Td>
                <Td right><Hours hh={e.production_hours} /></Td><Td right><Hours hh={e.non_production_hours} /></Td><Td right className="font-bold"><Hours hh={e.total_hours} /></Td>
                <Td right><Money c={e.hourly_rate} />/hr</Td><Td right><Money c={e.base_wages} bold /></Td>
                <Td>{e.flags.map((f) => <Badge key={f} kind="warn">{f}</Badge>)}</Td>
              </tr>))}</tbody>
            <tfoot><tr className="border-t bg-slate-50 font-bold"><Td>Total</Td><Td right><Hours hh={result.totals.production_hours} /></Td><Td right><Hours hh={result.totals.non_production_hours} /></Td><Td right><Hours hh={result.totals.production_hours + result.totals.non_production_hours} /></Td><Td /><Td right><Money c={result.totals.base_wages} /></Td><Td /></tr></tfoot>
          </table>
          <div className="mt-3"><Warnings list={result.warnings.filter((w) => ['prod_no_job', 'no_kind', 'inactive_emp'].includes(w.code))} /></div>
        </Card>
      )}

      {step === 2 && (
        <Card title="Step 3 — Review jobs" right={<Link to="/payroll/jobs" className="text-sm font-semibold text-[#4d7c0f] hover:underline">Edit jobs →</Link>}>
          <h4 className="mb-2 font-bold">Completed — bonus-eligible this week <Badge kind="complete">{result.completed.jobs.length}</Badge></h4>
          <JobTable jobs={result.completed.jobs} />
          <h4 className="mb-2 mt-6 font-bold">WIP — held out <Badge kind="wip">{result.wip.count}</Badge><Tip text={TIPS.wip} /></h4>
          <JobTable jobs={result.wip.jobs} wip />
          <div className="mt-4"><Warnings list={result.warnings.filter((w) => ['complete_no_revenue', 'complete_no_hours', 'job_no_status', 'carried_forward', 'already_processed'].includes(w.code))} /></div>
          <label className={`mt-4 flex items-center gap-3 rounded-lg border p-3 ${jobsConfirmed ? 'border-green-300 bg-green-50' : ''}`}>
            <input type="checkbox" className="h-4 w-4" checked={jobsConfirmed} disabled={finalized} onChange={(e) => updJobs(e.target.checked)} />
            <span className="text-sm font-semibold">I confirm every job above is correctly marked WIP or Complete, with revenue and COG entered.</span>
          </label>
        </Card>
      )}

      {step === 3 && (
        <Card title="Step 4 — Production bonus">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Completed adjusted revenue" value={<Money c={result.completed.adjusted} />} sub={<><Money c={result.completed.revenue} /> revenue − <Money c={result.completed.cog} /> COG</>} tip={TIPS.adjusted} />
            <Stat label={`× ${result.targetBps / 100}% = labor budget`} value={<Money c={result.completed.targetBudget} />} />
            <Stat label="− eligible production labor" value={<Money c={result.completed.labor} />} sub={<><Hours hh={result.completed.hours} /> bonus-eligible hours</>} />
            <Stat label="= Bonus pool" value={<Money c={result.completed.pool} />} tone={result.completed.pool > 0 ? 'good' : 'bad'} tip={TIPS.pool} />
          </div>
          <div className={`mt-4 rounded-xl p-4 ${result.completed.laborPctBps == null ? 'bg-slate-100' : result.completed.laborPctBps < result.targetBps ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Production labor %<Tip text={TIPS.laborPct} /></div>
            <div className={`text-4xl font-black ${result.completed.laborPctBps == null ? 'text-slate-400' : result.completed.laborPctBps < result.targetBps ? 'text-green-700' : 'text-red-700'}`}><Pct bps={result.completed.laborPctBps} /></div>
            <div className="text-sm">{result.completed.laborPctBps == null ? 'No completed revenue this week — no bonus.' : result.completed.laborPctBps < result.targetBps ? `Under ${result.targetBps / 100}% — bonus generated.` : `At or over ${result.targetBps / 100}% — no production bonus this week.`}</div>
          </div>
          <h4 className="mb-2 mt-6 font-bold">Allocation by bonus-eligible production hours<Tip text={TIPS.share} /></h4>
          <table className="w-full">
            <thead><tr className="border-b"><Th>Employee</Th><Th right>Eligible hours</Th><Th right>Share</Th><Th right>Production bonus</Th></tr></thead>
            <tbody>{result.employees.filter((e) => e.eligible_hours > 0 || e.production_bonus > 0).map((e) => (
              <tr key={e.employee_id} className="border-b last:border-0"><Td className="font-semibold">{e.name}</Td><Td right><Hours hh={e.eligible_hours} /></Td><Td right><Pct bps={e.share_bps} /></Td><Td right><Money c={e.production_bonus} bold className="text-green-700" /></Td></tr>))}
              {!result.employees.some((e) => e.eligible_hours > 0) && <tr><Td colSpan={4} className="text-slate-500">No bonus-eligible hours this week.</Td></tr>}
            </tbody>
            <tfoot><tr className="border-t bg-slate-50 font-bold"><Td>Total</Td><Td right><Hours hh={result.completed.hours} /></Td><Td right>100%</Td><Td right><Money c={result.totals.production_bonus} /></Td></tr></tfoot>
          </table>
          {result.wip.count > 0 && <p className="mt-3 text-sm text-amber-800"><b>Held in WIP:</b> <Money c={result.wip.adjusted} /> adjusted revenue, <Hours hh={result.wip.hours} /> production hours, <Money c={result.wip.labor} /> labor across {result.wip.count} job(s). None of it is in the pool above.</p>}
        </Card>
      )}

      {step === 4 && <OtherPay week={week} result={result} finalized={finalized} checks={otherChecks} setChecks={updOther} ensureRun={ensureRun} />}

      {step === 5 && (
        <Card title="Step 6 — Employee payroll summary" right={<Btn kind="ghost" onClick={() => exportRunCsv(result, week)}>Export CSV</Btn>}>
          <EmployeeSummaryTable result={result} />
        </Card>
      )}

      {step === 6 && (
        <Card title="Step 7 — Final review checklist">
          {errors.length > 0 && <div className="mb-3"><Warnings list={errors} /></div>}
          <Checklist items={FINAL_CHECKLIST} state={checks} disabled={finalized} onChange={updChecks} />
          <div className="mt-4 flex items-center gap-3">
            {finalized ? <Badge kind="finalized">Finalized</Badge> : <Btn kind="dark" onClick={finalize} disabled={!allChecked || busy}>Finalize payroll for {week}</Btn>}
            {!allChecked && !finalized && <span className="text-xs text-slate-500">{FINAL_CHECKLIST.filter(([k]) => !checks[k]).length} item(s) unchecked</span>}
            {!otherAllChecked && !finalized && <span className="text-xs text-amber-700">Step 5 checklist isn't complete.</span>}
          </div>
          <p className="mt-3 text-xs text-slate-500">Finalizing stores a snapshot of every number used.<Tip text={TIPS.snapshot} /></p>
        </Card>
      )}

      <div className="flex justify-between">
        <Btn kind="ghost" onClick={() => goto(step - 1)} disabled={step === 0}>← Back</Btn>
        <Btn onClick={() => goto(step + 1)} disabled={step === STEPS.length - 1 || (step === 2 && !jobsConfirmed && !finalized)}>Next →</Btn>
      </div>
    </div>
  );
}

function JobTable({ jobs, wip }) {
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[720px]">
      <thead><tr className="border-b"><Th>Job</Th><Th right>Revenue</Th><Th right>COG</Th><Th right>Adjusted</Th><Th right>Prod hrs</Th><Th right>Labor</Th>{!wip && <><Th right>Labor %</Th><Th right>Bonus</Th></>}</tr></thead>
      <tbody>
        {jobs.map((j) => (
          <tr key={j.id} className="border-b last:border-0">
            <Td><Link to={`/payroll/jobs/${j.id}`} className="font-semibold text-[#4d7c0f] hover:underline">{j.name}</Link>{j.carriedForward && <Badge kind="info">Carried forward</Badge>}</Td>
            <Td right><Money c={j.revenue} /></Td><Td right><Money c={j.cog} /></Td><Td right><Money c={j.adjusted} bold /></Td>
            <Td right><Hours hh={j.hours} /></Td><Td right><Money c={j.labor} /></Td>
            {!wip && <><Td right><Pct bps={j.laborPctBps} className={j.beatTarget ? 'font-bold text-green-700' : 'font-bold text-red-700'} /></Td><Td right><Money c={j.contribution} className={j.contribution > 0 ? 'font-bold text-green-700' : ''} /></Td></>}
          </tr>))}
        {!jobs.length && <tr><Td colSpan={8} className="text-slate-500">None.</Td></tr>}
      </tbody>
    </table></div>
  );
}

function OtherPay({ week, result, finalized, checks, setChecks, ensureRun }) {
  const p = usePayroll();
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const items = p.payItems.filter((i) => i.week_ending === week);
  const emp = (id) => p.employees.find((e) => e.id === id)?.name ?? '?';
  const startNew = (type) => setEdit({ employee_id: p.employees.find((e) => e.active)?.id || '', type, amount: '', description: '', item_date: week, reference: '' });
  const save = async () => {
    if (!edit.employee_id) return alert('Pick an employee');
    if (!edit.description.trim()) return alert('Description is required — you\'ll want to know what this was later.');
    if (toCents(edit.amount) === 0) return alert('Amount can\'t be $0');
    setSaving(true);
    try {
      await ensureRun();
      await p.save.item({ ...(edit.id ? { id: edit.id } : {}), employee_id: edit.employee_id, type: edit.type, amount: toDollars(toCents(edit.amount)), description: edit.description.trim(), item_date: edit.item_date, week_ending: week, reference: edit.reference || null });
      setEdit(null);
    } finally { setSaving(false); }
  };
  return (
    <Card title="Step 5 — Other pay: bonuses, reimbursements, corrections">
      <p className="mb-3 text-sm text-slate-600">Nothing here is assumed. Check each one, then add items or mark it checked with none owed.</p>
      <Checklist items={OTHER_PAY_CHECKLIST} state={checks} disabled={finalized} onChange={setChecks} />
      {!finalized && (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(PAY_ITEM_LABELS).map(([t, l]) => <Btn key={t} kind="ghost" onClick={() => startNew(t)}>+ {l}</Btn>)}
        </div>
      )}
      {edit && (
        <div className="mt-4 rounded-lg border bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Employee"><select className={inputCls} value={edit.employee_id} onChange={(e) => setEdit({ ...edit, employee_id: e.target.value })}><option value="">—</option>{p.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
            <Field label="Type"><select className={inputCls} value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{Object.entries(PAY_ITEM_LABELS).map(([t, l]) => <option key={t} value={t}>{l}</option>)}</select></Field>
            <Field label="Amount ($)" hint={edit.type === 'correction' ? 'Negative to claw back an overpayment.' : undefined}><input className={inputCls} inputMode="decimal" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} autoFocus /></Field>
            <Field label="Description"><input className={inputCls} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder={edit.type === 'reimbursement' ? 'What it was for' : 'Why they earned it'} /></Field>
            <Field label="Date"><input type="date" className={inputCls} value={edit.item_date} onChange={(e) => setEdit({ ...edit, item_date: e.target.value })} /></Field>
            <Field label="Receipt / reference (optional)"><input className={inputCls} value={edit.reference || ''} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} placeholder="Receipt #, review link, photo name" /></Field>
          </div>
          <div className="mt-3 flex gap-2"><Btn onClick={save} disabled={saving}>Save</Btn><Btn kind="ghost" onClick={() => setEdit(null)}>Cancel</Btn>{edit.id && <Btn kind="danger" className="ml-auto" onClick={async () => { if (confirm('Delete?')) { await p.save.deleteItem(edit.id); setEdit(null); } }}>Delete</Btn>}</div>
        </div>
      )}
      <table className="mt-4 w-full">
        <thead><tr className="border-b"><Th>Employee</Th><Th>Type</Th><Th>Description</Th><Th>Date</Th><Th>Ref</Th><Th right>Amount</Th><Th>Status</Th><Th /></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b last:border-0">
              <Td className="font-semibold">{emp(i.employee_id)}</Td><Td><Badge kind={i.type === 'reimbursement' ? 'info' : BONUS_TYPES.includes(i.type) ? 'good' : 'draft'}>{PAY_ITEM_LABELS[i.type]}</Badge></Td>
              <Td>{i.description}</Td><Td className="text-slate-500">{i.item_date}</Td><Td className="text-slate-500">{i.reference}</Td>
              <Td right><Money c={toCents(i.amount)} bold /></Td>
              <Td>{i.paid_run_id ? <Badge kind="finalized">Paid</Badge> : <Badge kind="draft">Unpaid</Badge>}</Td>
              <Td right>{!i.paid_run_id && !finalized && <Btn kind="ghost" onClick={() => setEdit({ ...i, amount: i.amount })}>Edit</Btn>}</Td>
            </tr>))}
          {!items.length && <tr><Td colSpan={8} className="text-slate-500">No other pay this week.</Td></tr>}
        </tbody>
      </table>
      <div className="mt-3"><Warnings list={result.warnings.filter((w) => ['item_no_desc', 'item_already_paid'].includes(w.code))} /></div>
    </Card>
  );
}
