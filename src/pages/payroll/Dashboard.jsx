import { Link } from 'react-router-dom';
import { usePayroll } from './PayrollContext.jsx';
import { Badge, Btn, Card, Money, Hours, Pct, Stat, Th, Td, Tip, TIPS, Warnings } from './ui.jsx';

export default function Dashboard() {
  const p = usePayroll();
  const week = p.currentWeekEnding;
  const run = p.runs.find((r) => r.week_ending === week);
  const r = run?.snapshot || p.compute(week, run?.id);
  const t = r.totals;
  const laborTone = r.completed.laborPctBps == null ? undefined : r.completed.laborPctBps < r.targetBps ? 'good' : 'bad';
  const unfinalized = p.runs.filter((x) => x.status !== 'finalized' && x.week_ending < week);
  const staleComplete = p.jobs.filter((j) => j.status === 'complete' && !j.bonus_processed_run_id && j.bonus_week_ending && j.bonus_week_ending < week);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-black">Week ending {week}</h2>
        <Badge kind={run?.status || 'draft'}>{run?.status === 'finalized' ? 'Finalized' : run ? 'Draft' : 'Not started'}</Badge>
        <Link to={`/payroll/run/${week}`} className="ml-auto"><Btn>{run?.status === 'finalized' ? 'View run' : 'Run payroll →'}</Btn></Link>
      </div>

      {(unfinalized.length > 0 || staleComplete.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          {unfinalized.length > 0 && <div>⚠ {unfinalized.length} earlier week(s) not finalized: {unfinalized.map((x) => <Link key={x.id} className="underline" to={`/payroll/run/${x.week_ending}`}>{x.week_ending}</Link>).reduce((a, b) => [a, ', ', b])}</div>}
          {staleComplete.length > 0 && <div>⚠ {staleComplete.length} completed job(s) from earlier weeks haven't had their bonus run yet — they'll be carried into this week.</div>}
        </div>
      )}

      <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Current payroll week</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total hours" value={<Hours hh={t.production_hours + t.non_production_hours} />} sub={<><Hours hh={t.production_hours} /> production · <Hours hh={t.non_production_hours} /> non-production</>} />
        <Stat label="Base payroll" value={<Money c={t.base_wages} />} tip={TIPS.base} />
        <Stat label="Completed adjusted revenue" value={<Money c={r.completed.adjusted} />} tip={TIPS.adjusted} />
        <Stat label="Production labor %" value={<Pct bps={r.completed.laborPctBps} />} tone={laborTone} sub={`target ${r.targetBps / 100}%`} tip={TIPS.laborPct} />
        <Stat label="Production bonus pool" value={<Money c={r.completed.pool} />} tone={r.completed.pool > 0 ? 'good' : undefined} tip={TIPS.pool} />
        <Stat label="Other bonuses" value={<Money c={t.other_bonuses} />} />
        <Stat label="Reimbursements" value={<Money c={t.reimbursements} />} tip={TIPS.reimb} />
        <Stat label="Total payroll" value={<Money c={t.payout} />} sub={<>gross <Money c={t.gross} /> + reimbursements</>} />
      </div>

      <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Work in progress<Tip text={TIPS.wip} /></h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="WIP jobs" value={r.wip.count} />
        <Stat label="WIP adjusted revenue" value={<Money c={r.wip.adjusted} />} sub="held out of bonus" />
        <Stat label="WIP production hours" value={<Hours hh={r.wip.hours} />} sub="already paid as base wages" />
        <Stat label="WIP labor dollars" value={<Money c={r.wip.labor} />} />
      </div>
      {r.wip.count > 0 && (
        <Card title="WIP jobs">
          <table className="w-full"><thead><tr className="border-b"><Th>Job</Th><Th>Started</Th><Th right>Adjusted</Th><Th right>Hours so far</Th><Th right>Labor so far</Th></tr></thead>
            <tbody>{r.wip.jobs.map((j) => <tr key={j.id} className="border-b last:border-0"><Td><Link to={`/payroll/jobs/${j.id}`} className="font-semibold text-[#4d7c0f] hover:underline">{j.name}</Link> <Badge kind="wip">WIP</Badge></Td><Td className="text-slate-500">{j.started_on || '—'}</Td><Td right><Money c={j.adjusted} /></Td><Td right><Hours hh={j.hours} /></Td><Td right><Money c={j.labor} /></Td></tr>)}</tbody></table>
        </Card>
      )}

      {r.warnings.length > 0 && <Card title="Things to look at"><Warnings list={r.warnings} /></Card>}

      <Card title="Recent payroll runs" right={<Link to="/payroll/runs" className="text-sm font-semibold text-[#4d7c0f] hover:underline">All runs →</Link>}>
        <table className="w-full"><thead><tr className="border-b"><Th>Week</Th><Th>Status</Th><Th right>Labor %</Th><Th right>Bonus pool</Th><Th right>Total payout</Th></tr></thead>
          <tbody>{p.runs.slice(0, 6).map((x) => { const s = x.snapshot || p.compute(x.week_ending, x.id); return (
            <tr key={x.id} className="border-b last:border-0"><Td><Link to={`/payroll/runs/${x.id}`} className="font-semibold text-[#4d7c0f] hover:underline">{x.week_ending}</Link></Td><Td><Badge kind={x.status}>{x.status}</Badge></Td><Td right><Pct bps={s.completed.laborPctBps} /></Td><Td right><Money c={s.completed.pool} /></Td><Td right className="font-bold"><Money c={s.totals.payout} /></Td></tr>); })}
            {!p.runs.length && <tr><Td colSpan={5} className="text-slate-500">No runs yet — start with <Link className="underline" to="/payroll/employees">Employees</Link>, then <Link className="underline" to="/payroll/time">Time Entries</Link>.</Td></tr>}</tbody></table>
      </Card>
    </div>
  );
}
