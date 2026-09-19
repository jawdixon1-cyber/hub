import { Link } from 'react-router-dom';
import { usePayroll } from './PayrollContext.jsx';
import { Card } from './ui.jsx';

const Step = ({ n, title, to, children }) => (
  <li className="flex gap-4">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#B0FF03] font-black">{n}</div>
    <div className="flex-1">
      <h4 className="font-bold">{title}{to && <Link to={to} className="ml-2 text-xs font-semibold text-[#4d7c0f] hover:underline">open →</Link>}</h4>
      <div className="mt-1 text-sm text-slate-700 space-y-1">{children}</div>
    </div>
  </li>
);
const L = ({ items }) => <ul className="list-disc pl-5">{items.map((i) => <li key={i}>{i}</li>)}</ul>;

export default function Sop() {
  const p = usePayroll();
  const T = p.settings.target_pct;
  return (
    <Card title="Hey Jude's Lawn Care — Weekly Payroll SOP">
      <p className="mb-5 text-sm text-slate-600">Follow this every payroll week. It mirrors the Run Payroll steps. Two rules underneath everything: <b>base pay follows the week the hours were worked; bonus follows the job until the job is complete.</b></p>
      <ol className="space-y-5">
        <Step n="1" title="Verify time" to="/payroll/time">
          <p>Review every employee's hours for the week.</p>
          <L items={['Correct employee', 'Correct dates', 'Correct job (production hours need one)', 'Production vs non-production', 'No missing time', 'No duplicates']} />
        </Step>
        <Step n="2" title="Verify base pay" to="/payroll/run">
          <p>Confirm each employee's hourly rate. Total hours × rate = base wages. Every worked hour is paid this week, whether or not the job is done.</p>
        </Step>
        <Step n="3" title="Review WIP jobs" to="/payroll/jobs">
          <L items={['Is each job truly unfinished?', 'Are all production hours attached to it?', 'Do NOT include WIP revenue or labor in this week\'s bonus — the tool holds them automatically.']} />
        </Step>
        <Step n="4" title="Review completed jobs" to="/payroll/jobs">
          <p>For every job marked Complete this week:</p>
          <L items={['Full revenue entered', 'COG entered (materials, disposal, subs)', 'All prior-week and current-week production hours attached', 'Completion date set — that decides the payroll week the bonus lands in']} />
        </Step>
        <Step n="5" title="Calculate production bonus" to="/payroll/run">
          <p>Completed adjusted revenue × {T}% − completed production labor. Positive = bonus pool. Zero or negative = no production bonus. The pool splits by each employee's share of bonus-eligible production hours. The tool does the math; you check that the jobs feeding it are right.</p>
        </Step>
        <Step n="6" title="Check customer reviews" to="/payroll/run">
          <p>Read new Google reviews. Did an employee earn a review bonus? Add it, or mark "checked — none owed." Never assume.</p>
        </Step>
        <Step n="7" title="Check reimbursements" to="/payroll/run">
          <p>Does the company owe anyone for purchases, gas, supplies, food, mileage? Add each one with what it was for. Reimbursements are not wages.</p>
        </Step>
        <Step n="8" title="Check other bonuses" to="/payroll/run">
          <L items={['Referral bonus', 'Performance bonus', 'Special incentive', 'Correction from last payroll (can be negative)']} />
        </Step>
        <Step n="9" title="Review each employee's final pay" to="/payroll/run">
          <p>Base wages + production bonus + review bonus + other bonuses + corrections = <b>gross</b>. Reimbursements listed separately. Gross is what goes into the payroll provider as wages.</p>
        </Step>
        <Step n="10" title="Finalize" to="/payroll/run">
          <p>Work the final checklist. Finalize. The run is locked, a snapshot of every number is stored, job bonuses are marked processed, and pay items are marked paid. Export the CSV and enter payroll.</p>
        </Step>
      </ol>
    </Card>
  );
}
