import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePayroll } from './PayrollContext.jsx';
import { Badge, Btn, Card, Field, inputCls, Money, Hours, Pct, Th, Td, Tip, TIPS } from './ui.jsx';
import { toCents, toDollars, toHundredths, laborCents, applyBps, pctToBps } from '../../lib/payroll/money.js';
import { weekEndingFor } from '../../lib/payroll/engine.js';

export function jobStats(job, timeEntries, targetPct) {
  const ents = timeEntries.filter((t) => t.job_id === job.id && t.kind === 'production');
  const hours = ents.reduce((s, t) => s + toHundredths(t.hours), 0);
  const labor = ents.reduce((s, t) => s + laborCents(toHundredths(t.hours), toCents(t.hourly_rate_snapshot)), 0);
  const revenue = toCents(job.revenue), cog = toCents(job.cog), adjusted = revenue - cog;
  const target = applyBps(adjusted, pctToBps(targetPct));
  const laborPctBps = adjusted > 0 ? Math.round((labor * 10000) / adjusted) : null;
  return { hours, labor, revenue, cog, adjusted, target, laborPctBps, beat: labor < target, contribution: Math.max(0, target - labor), entries: ents };
}

const blank = () => ({ name: '', description: '', revenue: '', cog: '', status: 'wip', started_on: new Date().toISOString().slice(0, 10), completed_on: '', notes: '' });

export default function Jobs() {
  const p = usePayroll();
  const [edit, setEdit] = useState(null);
  const [filter, setFilter] = useState('all');
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => p.jobs.filter((j) => filter === 'all' || j.status === filter).map((j) => ({ j, s: jobStats(j, p.timeEntries, p.settings.target_pct) })), [p.jobs, p.timeEntries, p.settings.target_pct, filter]);

  const save = async () => {
    if (!edit.name.trim()) return alert('Job name is required');
    if (edit.status === 'complete' && !edit.completed_on) return alert('Set the completion date — it decides which payroll week gets the bonus.');
    if (edit.status === 'complete' && toCents(edit.revenue) === 0 && !confirm('This job is complete with $0 revenue. Save anyway?')) return;
    setSaving(true);
    try {
      const completed_on = edit.status === 'complete' ? edit.completed_on : null;
      await p.save.job({
        ...(edit.id ? { id: edit.id } : {}),
        name: edit.name.trim(), description: edit.description || null,
        revenue: toDollars(toCents(edit.revenue)), cog: toDollars(toCents(edit.cog)),
        status: edit.status, started_on: edit.started_on || null, completed_on,
        bonus_week_ending: completed_on ? weekEndingFor(completed_on, p.weekEndingDay) : null,
        notes: edit.notes || null,
      });
      setEdit(null);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card title="Jobs" right={<Btn onClick={() => setEdit(blank())}>+ Add job</Btn>}>
        <div className="mb-3 flex items-center gap-3 text-sm">
          {['all', 'wip', 'complete'].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 font-semibold ${filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{f === 'all' ? 'All' : f === 'wip' ? 'WIP' : 'Complete'}</button>
          ))}
          <span className="ml-auto text-xs text-slate-500">WIP<Tip text={TIPS.wip} /></span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead><tr className="border-b"><Th>Job</Th><Th>Status</Th><Th right>Revenue</Th><Th right>COG</Th><Th right>Adjusted</Th><Th right>Prod hrs</Th><Th right>Labor</Th><Th right>Labor %</Th><Th right>Bonus</Th><Th /></tr></thead>
          <tbody>
            {rows.map(({ j, s }) => (
              <tr key={j.id} className="border-b last:border-0">
                <Td><Link to={`/payroll/jobs/${j.id}`} className="font-semibold text-[#4d7c0f] hover:underline">{j.name}</Link>
                  <div className="text-xs text-slate-500">{j.status === 'complete' ? `Completed ${j.completed_on} · bonus week ${j.bonus_week_ending}` : `Started ${j.started_on || '—'}`}{j.bonus_processed_run_id && ' · bonus processed'}</div></Td>
                <Td><Badge kind={j.status}>{j.status === 'wip' ? 'WIP' : 'Complete'}</Badge></Td>
                <Td right><Money c={s.revenue} /></Td>
                <Td right><Money c={s.cog} /></Td>
                <Td right><Money c={s.adjusted} bold /></Td>
                <Td right><Hours hh={s.hours} /></Td>
                <Td right><Money c={s.labor} /></Td>
                <Td right><Pct bps={s.laborPctBps} className={s.laborPctBps == null ? '' : s.beat ? 'font-bold text-green-700' : 'font-bold text-red-700'} /></Td>
                <Td right>{j.status === 'complete' ? <Money c={s.contribution} className={s.contribution > 0 ? 'text-green-700 font-bold' : ''} /> : <span className="text-slate-400">held</span>}</Td>
                <Td right><Btn kind="ghost" onClick={() => setEdit({ ...j, revenue: j.revenue, cog: j.cog, completed_on: j.completed_on || '' })} disabled={!!j.bonus_processed_run_id}>Edit</Btn></Td>
              </tr>
            ))}
            {!rows.length && <tr><Td className="text-slate-500" colSpan={10}>No jobs.</Td></tr>}
          </tbody>
        </table>
        </div>
      </Card>

      {edit && (
        <Card title={edit.id ? 'Edit job' : 'New job'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer / job name"><input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
            <Field label="Description"><input className={inputCls} value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Revenue ($)" hint="Customer revenue for the completed work."><input className={inputCls} inputMode="decimal" value={edit.revenue} onChange={(e) => setEdit({ ...edit, revenue: e.target.value })} /></Field>
            <Field label="COG ($)" hint="Materials, disposal, subs, other direct non-labor costs."><input className={inputCls} inputMode="decimal" value={edit.cog} onChange={(e) => setEdit({ ...edit, cog: e.target.value })} /></Field>
            <Field label="Status">
              <select className={inputCls} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                <option value="wip">WIP — still in progress</option><option value="complete">Complete</option>
              </select>
            </Field>
            <Field label="Date started"><input type="date" className={inputCls} value={edit.started_on || ''} onChange={(e) => setEdit({ ...edit, started_on: e.target.value })} /></Field>
            {edit.status === 'complete' && (
              <Field label="Date completed" hint={edit.completed_on ? `Bonus recognized in week ending ${weekEndingFor(edit.completed_on, p.weekEndingDay)}` : 'Decides the payroll week the bonus lands in.'}>
                <input type="date" className={inputCls} value={edit.completed_on || ''} onChange={(e) => setEdit({ ...edit, completed_on: e.target.value })} />
              </Field>
            )}
            <Field label="Notes"><input className={inputCls} value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          </div>
          <p className="mt-3 text-xs text-slate-600">Adjusted revenue: <b><Money c={toCents(edit.revenue) - toCents(edit.cog)} /></b>. When this flips to Complete, all of its production hours from every week become bonus-eligible together.</p>
          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={saving}>Save</Btn>
            <Btn kind="ghost" onClick={() => setEdit(null)}>Cancel</Btn>
            {edit.id && <Btn kind="danger" className="ml-auto" onClick={async () => { if (confirm('Delete this job? Its time entries will lose their job link.')) { await p.save.deleteJob(edit.id); setEdit(null); } }}>Delete</Btn>}
          </div>
        </Card>
      )}
    </div>
  );
}
