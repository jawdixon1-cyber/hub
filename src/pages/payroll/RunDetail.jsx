import { Link, useParams } from 'react-router-dom';
import { usePayroll } from './PayrollContext.jsx';
import { Badge, Btn, Card, Money, Hours, Pct, Stat, Th, Td, TIPS } from './ui.jsx';
import { fmt } from '../../lib/payroll/money.js';
import { PAY_ITEM_LABELS } from '../../lib/payroll/engine.js';

/** Shared with the run wizard (step 6). Renders a computed result. */
export function EmployeeSummaryTable({ result }) {
  const t = result.totals;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto"><table className="w-full min-w-[900px]">
        <thead><tr className="border-b">
          <Th>Employee</Th><Th right>Prod hrs</Th><Th right>Non-prod</Th><Th right>Paid hrs</Th><Th right>Base wages</Th><Th right>Prod bonus</Th><Th right>Other bonus</Th><Th right>Corrections</Th><Th right>Gross</Th><Th right>Reimb.</Th><Th right>Total payout</Th>
        </tr></thead>
        <tbody>{result.employees.map((e) => (
          <tr key={e.employee_id} className="border-b last:border-0 align-top">
            <Td className="font-semibold">{e.name}<div className="text-xs font-normal text-slate-500">{fmt(e.hourly_rate)}/hr</div></Td>
            <Td right><Hours hh={e.production_hours} /></Td><Td right><Hours hh={e.non_production_hours} /></Td><Td right className="font-semibold"><Hours hh={e.total_hours} /></Td>
            <Td right><Money c={e.base_wages} /></Td>
            <Td right><Money c={e.production_bonus} className={e.production_bonus ? 'text-green-700 font-semibold' : ''} /></Td>
            <Td right><Money c={e.other_bonuses} />{e.items.filter((i) => i.type !== 'reimbursement' && i.type !== 'correction').map((i) => <div key={i.id} className="text-xs text-slate-500">{PAY_ITEM_LABELS[i.type]}: {fmt(i.amount)}</div>)}</Td>
            <Td right><Money c={e.corrections} /></Td>
            <Td right className="font-black"><Money c={e.gross} /></Td>
            <Td right><Money c={e.reimbursements} className="text-blue-700" />{e.items.filter((i) => i.type === 'reimbursement').map((i) => <div key={i.id} className="text-xs text-slate-500">{i.description}</div>)}</Td>
            <Td right className="font-black"><Money c={e.payout} /></Td>
          </tr>))}</tbody>
        <tfoot><tr className="border-t bg-slate-50 font-bold">
          <Td>Total</Td><Td right><Hours hh={t.production_hours} /></Td><Td right><Hours hh={t.non_production_hours} /></Td><Td right><Hours hh={t.production_hours + t.non_production_hours} /></Td>
          <Td right><Money c={t.base_wages} /></Td><Td right><Money c={t.production_bonus} /></Td><Td right><Money c={t.other_bonuses} /></Td><Td right><Money c={t.corrections} /></Td><Td right><Money c={t.gross} /></Td><Td right><Money c={t.reimbursements} /></Td><Td right><Money c={t.payout} /></Td>
        </tr></tfoot>
      </table></div>
      <p className="text-xs text-slate-500"><b>Gross compensation</b> = base wages + production bonus + other bonuses + corrections — that's what goes into your payroll provider as wages. <b>Reimbursements</b> are shown separately and are not wages.</p>
    </div>
  );
}

export function exportRunCsv(result, week) {
  const rows = [['Week ending', week], [],
    ['Employee', 'Hourly rate', 'Production hours', 'Non-production hours', 'Total hours', 'Base wages', 'Production bonus', 'Other bonuses', 'Corrections', 'Gross compensation', 'Reimbursements', 'Total payout'],
    ...result.employees.map((e) => [e.name, e.hourly_rate / 100, e.production_hours / 100, e.non_production_hours / 100, e.total_hours / 100, e.base_wages / 100, e.production_bonus / 100, e.other_bonuses / 100, e.corrections / 100, e.gross / 100, e.reimbursements / 100, e.payout / 100]),
    [], ['Completed adjusted revenue', result.completed.adjusted / 100], ['Target %', result.targetBps / 100], ['Labor budget', result.completed.targetBudget / 100], ['Eligible production labor', result.completed.labor / 100], ['Production labor %', result.completed.laborPctBps == null ? '' : result.completed.laborPctBps / 100], ['Bonus pool', result.completed.pool / 100],
    [], ['WIP jobs', result.wip.count], ['WIP adjusted revenue', result.wip.adjusted / 100], ['WIP production hours', result.wip.hours / 100], ['WIP labor', result.wip.labor / 100],
  ];
  const csv = rows.map((r) => r.map((v) => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v ?? '')).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `payroll-${week}.csv`; a.click();
}

export default function RunDetail() {
  const p = usePayroll();
  const { id } = useParams();
  const run = p.runs.find((r) => r.id === id);
  if (!run) return <div className="text-slate-500">Run not found.</div>;
  const result = run.snapshot || p.compute(run.week_ending, run.id);
  const finalized = run.status === 'finalized';
  return (
    <div className="space-y-4 print:space-y-3">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link to="/payroll/runs" className="text-xs text-slate-500 hover:underline">← Past runs</Link>
        <div className="ml-auto flex gap-2">
          <Btn kind="ghost" onClick={() => exportRunCsv(result, run.week_ending)}>Export CSV</Btn>
          <Btn kind="ghost" onClick={() => window.print()}>Print / PDF</Btn>
          {!finalized && <Link to={`/payroll/run/${run.week_ending}`}><Btn>Continue run</Btn></Link>}
          {finalized && <Link to={`/payroll/run/${run.week_ending}`}><Btn kind="ghost">Open in wizard</Btn></Link>}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-widest text-[#4d7c0f]">Hey Jude's Lawn Care · Payroll</div>
        <h2 className="text-2xl font-black">Week ending {run.week_ending} <Badge kind={finalized ? 'finalized' : 'draft'}>{finalized ? 'Finalized' : 'Draft'}</Badge></h2>
        <div className="text-xs text-slate-500">{finalized ? `Finalized ${new Date(run.finalized_at).toLocaleString()}` : 'Not finalized — numbers may change'}{run.reopened_at && ` · reopened ${new Date(run.reopened_at).toLocaleString()}`} · target {run.target_pct}% · {run.allocation_method}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6">
        <Stat label="Base payroll" value={<Money c={result.totals.base_wages} />} />
        <Stat label="Production bonus" value={<Money c={result.totals.production_bonus} />} tone={result.totals.production_bonus > 0 ? 'good' : undefined} />
        <Stat label="Other bonuses" value={<Money c={result.totals.other_bonuses} />} />
        <Stat label="Reimbursements" value={<Money c={result.totals.reimbursements} />} tip={TIPS.reimb} />
        <Stat label="Labor %" value={<Pct bps={result.completed.laborPctBps} />} tone={result.completed.laborPctBps == null ? undefined : result.completed.laborPctBps < result.targetBps ? 'good' : 'bad'} />
        <Stat label="Total payout" value={<Money c={result.totals.payout} />} />
      </div>
      <Card title="Employee summary"><EmployeeSummaryTable result={result} /></Card>
      <Card title="Bonus math">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>Completed adjusted revenue: <b><Money c={result.completed.adjusted} /></b></div>
          <div>× {result.targetBps / 100}% target = <b><Money c={result.completed.targetBudget} /></b></div>
          <div>− eligible production labor (<Hours hh={result.completed.hours} />): <b><Money c={result.completed.labor} /></b></div>
          <div>= bonus pool: <b className={result.completed.pool > 0 ? 'text-green-700' : ''}><Money c={result.completed.pool} /></b></div>
        </div>
        <table className="mt-3 w-full"><thead><tr className="border-b"><Th>Job</Th><Th right>Adjusted</Th><Th right>Hours</Th><Th right>Labor</Th><Th right>Labor %</Th><Th right>Bonus</Th></tr></thead>
          <tbody>{result.completed.jobs.map((j) => <tr key={j.id} className="border-b last:border-0"><Td>{j.name}{j.carriedForward && <Badge kind="info">carried</Badge>}</Td><Td right><Money c={j.adjusted} /></Td><Td right><Hours hh={j.hours} /></Td><Td right><Money c={j.labor} /></Td><Td right><Pct bps={j.laborPctBps} className={j.beatTarget ? 'text-green-700 font-bold' : 'text-red-700 font-bold'} /></Td><Td right><Money c={j.contribution} /></Td></tr>)}
            {!result.completed.jobs.length && <tr><Td colSpan={6} className="text-slate-500">No completed jobs this week.</Td></tr>}</tbody></table>
        {result.wip.count > 0 && <p className="mt-3 text-sm text-amber-800">Held in WIP at the time: {result.wip.count} job(s), <Money c={result.wip.adjusted} /> adjusted revenue, <Hours hh={result.wip.hours} /> hours, <Money c={result.wip.labor} /> labor.</p>}
      </Card>
      {result.warnings?.length > 0 && <Card title="Warnings at finalize"><ul className="list-disc pl-5 text-sm">{result.warnings.map((w, i) => <li key={i}>{w.msg}</li>)}</ul></Card>}
    </div>
  );
}
