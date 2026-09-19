import { Link } from 'react-router-dom';
import { usePayroll } from './PayrollContext.jsx';
import { Badge, Btn, Card, Money, Pct, Th, Td } from './ui.jsx';

export default function Runs() {
  const p = usePayroll();
  return (
    <Card title="Past payroll runs" right={<Link to="/payroll/run"><Btn>Run this week</Btn></Link>}>
      <table className="w-full">
        <thead><tr className="border-b"><Th>Week ending</Th><Th>Status</Th><Th right>Base wages</Th><Th right>Prod bonus</Th><Th right>Other</Th><Th right>Reimb.</Th><Th right>Labor %</Th><Th right>Total payout</Th><Th /></tr></thead>
        <tbody>
          {p.runs.map((r) => { const s = r.snapshot || p.compute(r.week_ending, r.id); return (
            <tr key={r.id} className="border-b last:border-0">
              <Td className="font-semibold">{r.week_ending}</Td>
              <Td><Badge kind={r.status}>{r.status}</Badge></Td>
              <Td right><Money c={s.totals.base_wages} /></Td><Td right><Money c={s.totals.production_bonus} /></Td><Td right><Money c={s.totals.other_bonuses + s.totals.corrections} /></Td><Td right><Money c={s.totals.reimbursements} /></Td>
              <Td right><Pct bps={s.completed.laborPctBps} className={s.completed.laborPctBps == null ? '' : s.completed.laborPctBps < s.targetBps ? 'text-green-700 font-bold' : 'text-red-700 font-bold'} /></Td>
              <Td right className="font-black"><Money c={s.totals.payout} /></Td>
              <Td right><Link to={`/payroll/runs/${r.id}`} className="text-sm font-semibold text-[#4d7c0f] hover:underline">View</Link></Td>
            </tr>); })}
          {!p.runs.length && <tr><Td colSpan={9} className="text-slate-500">No runs yet.</Td></tr>}
        </tbody>
      </table>
    </Card>
  );
}
