import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePayroll } from './PayrollContext.jsx';
import { jobStats } from './Jobs.jsx';
import { Badge, Card, Money, Hours, Pct, Th, Td } from './ui.jsx';

/* Reports read finalized snapshots where they exist and live computations
 * for weeks that aren't finalized, so history never shifts under you. */
export default function Reports() {
  const p = usePayroll();
  const [tab, setTab] = useState('employee');

  const weeks = useMemo(() => {
    const set = new Set([...p.runs.map((r) => r.week_ending), ...p.timeEntries.map((t) => t.week_ending)]);
    return [...set].sort().reverse().slice(0, 26).map((w) => { const run = p.runs.find((r) => r.week_ending === w); return { w, run, r: run?.snapshot || p.compute(w, run?.id) }; });
  }, [p]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        {[['employee', 'By employee'], ['company', 'Company'], ['jobs', 'Jobs']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === k ? 'border-[#4d7c0f] text-[#4d7c0f]' : 'border-transparent text-slate-500'}`}>{l}</button>
        ))}
      </div>

      {tab === 'employee' && p.employees.map((e) => {
        const rows = weeks.map(({ w, run, r }) => ({ w, run, e: r.employees.find((x) => x.employee_id === e.id) })).filter((x) => x.e && (x.e.total_hours > 0 || x.e.payout !== 0));
        if (!rows.length) return null;
        const tot = rows.reduce((a, { e: x }) => ({ h: a.h + x.total_hours, b: a.b + x.base_wages, pb: a.pb + x.production_bonus, ob: a.ob + x.other_bonuses + x.corrections, r: a.r + x.reimbursements, t: a.t + x.payout }), { h: 0, b: 0, pb: 0, ob: 0, r: 0, t: 0 });
        return (
          <Card key={e.id} title={e.name}>
            <table className="w-full"><thead><tr className="border-b"><Th>Week</Th><Th right>Hours</Th><Th right>Base wages</Th><Th right>Prod bonus</Th><Th right>Other</Th><Th right>Reimb.</Th><Th right>Total</Th></tr></thead>
              <tbody>{rows.map(({ w, run, e: x }) => <tr key={w} className="border-b last:border-0"><Td>{w} {run?.status === 'finalized' ? <Badge kind="finalized">final</Badge> : <Badge kind="draft">live</Badge>}</Td><Td right><Hours hh={x.total_hours} /></Td><Td right><Money c={x.base_wages} /></Td><Td right><Money c={x.production_bonus} /></Td><Td right><Money c={x.other_bonuses + x.corrections} /></Td><Td right><Money c={x.reimbursements} /></Td><Td right className="font-bold"><Money c={x.payout} /></Td></tr>)}</tbody>
              <tfoot><tr className="border-t bg-slate-50 font-bold"><Td>Total</Td><Td right><Hours hh={tot.h} /></Td><Td right><Money c={tot.b} /></Td><Td right><Money c={tot.pb} /></Td><Td right><Money c={tot.ob} /></Td><Td right><Money c={tot.r} /></Td><Td right><Money c={tot.t} /></Td></tr></tfoot>
            </table>
          </Card>);
      })}

      {tab === 'company' && (
        <Card title="Company — by week">
          <table className="w-full"><thead><tr className="border-b"><Th>Week</Th><Th right>Adjusted revenue</Th><Th right>Prod labor</Th><Th right>Labor %</Th><Th right>Bonus pool</Th><Th right>Total labor</Th><Th right>WIP balance</Th></tr></thead>
            <tbody>{weeks.map(({ w, run, r }) => <tr key={w} className="border-b last:border-0">
              <Td>{w} {run?.status === 'finalized' ? <Badge kind="finalized">final</Badge> : <Badge kind="draft">live</Badge>}</Td>
              <Td right><Money c={r.completed.adjusted} /></Td><Td right><Money c={r.completed.labor} /></Td>
              <Td right><Pct bps={r.completed.laborPctBps} className={r.completed.laborPctBps == null ? '' : r.completed.laborPctBps < r.targetBps ? 'text-green-700 font-bold' : 'text-red-700 font-bold'} /></Td>
              <Td right><Money c={r.completed.pool} /></Td><Td right><Money c={r.totals.gross} /></Td><Td right><Money c={r.wip.adjusted} /></Td></tr>)}</tbody></table>
          <p className="mt-2 text-xs text-slate-500">Total labor = gross compensation (wages + all bonuses + corrections). WIP balance = adjusted revenue of jobs still open at that week.</p>
        </Card>
      )}

      {tab === 'jobs' && (
        <Card title="Jobs">
          <div className="overflow-x-auto"><table className="w-full min-w-[820px]"><thead><tr className="border-b"><Th>Job</Th><Th>Status</Th><Th right>Revenue</Th><Th right>COG</Th><Th right>Adjusted</Th><Th right>Prod hrs</Th><Th right>Prod labor</Th><Th right>Labor %</Th><Th right>Bonus</Th></tr></thead>
            <tbody>{p.jobs.map((j) => { const s = jobStats(j, p.timeEntries, p.settings.target_pct); return (
              <tr key={j.id} className="border-b last:border-0"><Td><Link className="font-semibold text-[#4d7c0f] hover:underline" to={`/payroll/jobs/${j.id}`}>{j.name}</Link></Td><Td><Badge kind={j.status}>{j.status}</Badge></Td>
                <Td right><Money c={s.revenue} /></Td><Td right><Money c={s.cog} /></Td><Td right><Money c={s.adjusted} /></Td><Td right><Hours hh={s.hours} /></Td><Td right><Money c={s.labor} /></Td>
                <Td right><Pct bps={s.laborPctBps} className={s.laborPctBps == null ? '' : s.beat ? 'text-green-700 font-bold' : 'text-red-700 font-bold'} /></Td>
                <Td right>{j.status === 'complete' ? <Money c={s.contribution} /> : <span className="text-slate-400">held</span>}</Td></tr>); })}</tbody></table></div>
        </Card>
      )}
    </div>
  );
}
