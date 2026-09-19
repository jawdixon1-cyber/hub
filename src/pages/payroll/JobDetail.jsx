import { Link, useParams } from 'react-router-dom';
import { usePayroll } from './PayrollContext.jsx';
import { jobStats } from './Jobs.jsx';
import { Badge, Card, Money, Hours, Pct, Stat, Th, Td, TIPS } from './ui.jsx';
import { toCents } from '../../lib/payroll/money.js';

export default function JobDetail() {
  const p = usePayroll();
  const { id } = useParams();
  const job = p.jobs.find((j) => j.id === id);
  if (!job) return <div className="text-slate-500">Job not found. <Link to="/payroll/jobs" className="underline">Back to jobs</Link></div>;
  const s = jobStats(job, p.timeEntries, p.settings.target_pct);
  const byEmp = new Map();
  for (const t of s.entries) {
    const e = p.employees.find((x) => x.id === t.employee_id);
    const b = byEmp.get(t.employee_id) || { name: e?.name ?? '?', hours: 0, labor: 0 };
    b.hours += Math.round(Number(t.hours) * 100);
    b.labor += Math.round(Number(t.hours) * 100 * toCents(t.hourly_rate_snapshot) / 100);
    byEmp.set(t.employee_id, b);
  }
  const run = job.bonus_processed_run_id ? p.runs.find((r) => r.id === job.bonus_processed_run_id) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/payroll/jobs" className="text-xs text-slate-500 hover:underline">← Jobs</Link>
          <h2 className="text-xl font-black">{job.name} <Badge kind={job.status}>{job.status === 'wip' ? 'WIP' : 'Complete'}</Badge></h2>
          <div className="text-sm text-slate-500">{job.description}</div>
          <div className="mt-1 text-xs text-slate-500">
            Started {job.started_on || '—'}{job.completed_on && ` · Completed ${job.completed_on} · bonus week ${job.bonus_week_ending}`}
            {run && <> · <Badge kind="finalized">Bonus processed</Badge> in <Link className="underline" to={`/payroll/runs/${run.id}`}>run {run.week_ending}</Link></>}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue" value={<Money c={s.revenue} />} />
        <Stat label="COG" value={<Money c={s.cog} />} />
        <Stat label="Adjusted revenue" value={<Money c={s.adjusted} />} tip={TIPS.adjusted} />
        <Stat label={`Target (${p.settings.target_pct}%)`} value={<Money c={s.target} />} />
        <Stat label="Production hours" value={<Hours hh={s.hours} />} />
        <Stat label="Production labor" value={<Money c={s.labor} />} />
        <Stat label="Labor %" value={<Pct bps={s.laborPctBps} />} tone={s.laborPctBps == null ? undefined : s.beat ? 'good' : 'bad'} sub={s.laborPctBps == null ? 'No revenue yet' : s.beat ? `Beat the ${p.settings.target_pct}% target` : `At/over the ${p.settings.target_pct}% target`} tip={TIPS.laborPct} />
        <Stat label="Bonus generated" value={job.status === 'complete' ? <Money c={s.contribution} /> : 'Held (WIP)'} tone={job.status === 'complete' && s.contribution > 0 ? 'good' : undefined} tip={job.status === 'wip' ? TIPS.wip : TIPS.pool} />
      </div>

      <Card title="Who worked on it">
        <table className="w-full">
          <thead><tr className="border-b"><Th>Employee</Th><Th right>Production hours</Th><Th right>Labor</Th><Th right>Share of job hours</Th></tr></thead>
          <tbody>
            {[...byEmp.values()].map((b) => (
              <tr key={b.name} className="border-b last:border-0"><Td className="font-semibold">{b.name}</Td><Td right><Hours hh={b.hours} /></Td><Td right><Money c={b.labor} /></Td><Td right><Pct bps={s.hours ? Math.round((b.hours * 10000) / s.hours) : null} /></Td></tr>
            ))}
            {!byEmp.size && <tr><Td colSpan={4} className="text-slate-500">No production hours logged on this job yet.</Td></tr>}
          </tbody>
        </table>
      </Card>

      <Card title="Every time entry">
        <table className="w-full">
          <thead><tr className="border-b"><Th>Date</Th><Th>Payroll week</Th><Th>Employee</Th><Th right>Hours</Th><Th right>Rate</Th><Th right>Labor</Th><Th>Notes</Th></tr></thead>
          <tbody>
            {[...s.entries].sort((a, b) => a.worked_on.localeCompare(b.worked_on)).map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <Td>{t.worked_on}</Td><Td className="text-slate-500">{t.week_ending}</Td>
                <Td>{p.employees.find((e) => e.id === t.employee_id)?.name}</Td>
                <Td right><Hours hh={Math.round(Number(t.hours) * 100)} /></Td>
                <Td right><Money c={toCents(t.hourly_rate_snapshot)} /></Td>
                <Td right><Money c={Math.round(Number(t.hours) * toCents(t.hourly_rate_snapshot))} /></Td>
                <Td className="text-slate-500">{t.notes}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {job.notes && <Card title="Notes"><p className="text-sm whitespace-pre-wrap">{job.notes}</p></Card>}
    </div>
  );
}
