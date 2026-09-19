import { useMemo, useState } from 'react';
import { usePayroll } from './PayrollContext.jsx';
import { Badge, Btn, Card, Field, inputCls, Money, Hours, Th, Td, Tip, TIPS } from './ui.jsx';
import { toCents, toDollars, laborCents, toHundredths } from '../../lib/payroll/money.js';
import { weekEndingFor, addDaysISO } from '../../lib/payroll/engine.js';

export default function TimeEntries() {
  const p = usePayroll();
  const [week, setWeek] = useState(p.currentWeekEnding);
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => p.timeEntries.filter((t) => t.week_ending === week).sort((a, b) => a.worked_on.localeCompare(b.worked_on) || a.employee_id.localeCompare(b.employee_id)), [p.timeEntries, week]);
  const emp = (id) => p.employees.find((e) => e.id === id);
  const job = (id) => p.jobs.find((j) => j.id === id);
  const totals = rows.reduce((a, t) => { const hh = toHundredths(t.hours); a.hours += hh; a[t.kind] += hh; a.labor += laborCents(hh, toCents(t.hourly_rate_snapshot)); return a; }, { hours: 0, production: 0, non_production: 0, labor: 0 });

  const startNew = () => {
    const first = p.employees.find((e) => e.active);
    setEdit({ worked_on: addDaysISO(week, -6), employee_id: first?.id || '', job_id: '', hours: '', kind: 'production', notes: '', rate: first ? first.hourly_rate : '' });
  };
  const onEmp = (id) => { const e = emp(id); setEdit({ ...edit, employee_id: id, rate: e ? e.hourly_rate : edit.rate }); };

  const save = async () => {
    if (!edit.employee_id) return alert('Pick an employee');
    if (!(Number(edit.hours) > 0)) return alert('Hours must be greater than 0');
    if (edit.kind === 'production' && !edit.job_id && !confirm('Production hours with no job can never earn a bonus. Save anyway?')) return;
    const e = emp(edit.employee_id);
    if (e && !e.active && !confirm(`${e.name} is inactive. Save anyway?`)) return;
    setSaving(true);
    try {
      await p.save.time({
        ...(edit.id ? { id: edit.id } : {}),
        employee_id: edit.employee_id, job_id: edit.job_id || null, worked_on: edit.worked_on,
        week_ending: weekEndingFor(edit.worked_on, p.weekEndingDay),
        hours: Math.round(Number(edit.hours) * 100) / 100, kind: edit.kind,
        hourly_rate_snapshot: toDollars(toCents(edit.rate)), notes: edit.notes || null,
      });
      // keep the form open for rapid entry: same date, next employee cleared
      setEdit(edit.id ? null : { ...edit, id: undefined, hours: '', notes: '' });
    } finally { setSaving(false); }
  };

  const weekLocked = p.runs.some((r) => r.week_ending === week && r.status === 'finalized');

  return (
    <div className="space-y-4">
      <Card title="Time entries" right={
        <div className="flex items-center gap-2">
          <Btn kind="ghost" onClick={() => setWeek(addDaysISO(week, -7))}>‹</Btn>
          <span className="text-sm font-semibold">Week ending {week}</span>
          <Btn kind="ghost" onClick={() => setWeek(addDaysISO(week, 7))}>›</Btn>
          <Btn onClick={startNew} disabled={weekLocked}>+ Add hours</Btn>
        </div>}>
        {weekLocked && <div className="mb-3 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">This week's payroll is <b>finalized</b>. Reopen the run to change hours.</div>}
        <p className="mb-3 text-sm text-slate-600">One row per employee per job per day. Production hours on a WIP job are paid this week and held for bonus until the job completes.<Tip text={TIPS.wip} /></p>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead><tr className="border-b"><Th>Date</Th><Th>Employee</Th><Th>Job</Th><Th right>Hours</Th><Th>Type</Th><Th right>Rate</Th><Th right>Labor</Th><Th>Notes</Th><Th /></tr></thead>
          <tbody>
            {rows.map((t) => { const j = job(t.job_id); const hh = toHundredths(t.hours); return (
              <tr key={t.id} className="border-b last:border-0">
                <Td>{t.worked_on}</Td>
                <Td className="font-semibold">{emp(t.employee_id)?.name ?? '?'}</Td>
                <Td>{j ? <>{j.name} <Badge kind={j.status}>{j.status === 'wip' ? 'WIP' : 'Done'}</Badge></> : <span className="text-slate-400">—</span>}</Td>
                <Td right><Hours hh={hh} /></Td>
                <Td><Badge kind={t.kind === 'production' ? 'good' : 'draft'}>{t.kind === 'production' ? 'Production' : 'Non-prod'}</Badge></Td>
                <Td right><Money c={toCents(t.hourly_rate_snapshot)} /></Td>
                <Td right><Money c={laborCents(hh, toCents(t.hourly_rate_snapshot))} /></Td>
                <Td className="text-slate-500">{t.notes}</Td>
                <Td right>{!weekLocked && <Btn kind="ghost" onClick={() => setEdit({ ...t, rate: t.hourly_rate_snapshot, job_id: t.job_id || '' })}>Edit</Btn>}</Td>
              </tr>); })}
            {!rows.length && <tr><Td colSpan={9} className="text-slate-500">No hours this week.</Td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr className="border-t bg-slate-50 font-bold"><Td colSpan={3}>Week total</Td><Td right><Hours hh={totals.hours} /></Td><Td className="text-xs font-normal text-slate-500"><Hours hh={totals.production} /> prod · <Hours hh={totals.non_production} /> non-prod</Td><Td /><Td right><Money c={totals.labor} /></Td><Td colSpan={2} /></tr></tfoot>}
        </table>
        </div>
      </Card>

      {edit && (
        <Card title={edit.id ? 'Edit hours' : 'Add hours'}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date"><input type="date" className={inputCls} value={edit.worked_on} onChange={(e) => setEdit({ ...edit, worked_on: e.target.value })} /></Field>
            <Field label="Employee">
              <select className={inputCls} value={edit.employee_id} onChange={(e) => onEmp(e.target.value)}>
                <option value="">—</option>{p.employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.active ? '' : ' (inactive)'}</option>)}
              </select>
            </Field>
            <Field label="Job" hint={edit.kind === 'production' ? 'Required for the bonus to ever count.' : 'Optional for non-production time.'}>
              <select className={inputCls} value={edit.job_id} onChange={(e) => setEdit({ ...edit, job_id: e.target.value })}>
                <option value="">— none (shop, training, drive…) —</option>
                {p.jobs.filter((j) => j.status === 'wip' || !j.bonus_processed_run_id).map((j) => <option key={j.id} value={j.id}>{j.name} ({j.status === 'wip' ? 'WIP' : 'Complete'})</option>)}
              </select>
            </Field>
            <Field label="Hours"><input className={inputCls} inputMode="decimal" value={edit.hours} onChange={(e) => setEdit({ ...edit, hours: e.target.value })} autoFocus /></Field>
            <Field label="Type">
              <select className={inputCls} value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>
                <option value="production">Production</option><option value="non_production">Non-production</option>
              </select>
            </Field>
            <Field label="Rate used ($/hr)" hint="Defaults to the employee's current rate; stays with this entry forever."><input className={inputCls} inputMode="decimal" value={edit.rate} onChange={(e) => setEdit({ ...edit, rate: e.target.value })} /></Field>
            <Field label="Notes"><input className={inputCls} value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          </div>
          <div className="mt-2 text-xs text-slate-600">Payroll week: <b>{weekEndingFor(edit.worked_on || week, p.weekEndingDay)}</b> · Labor: <b><Money c={laborCents(toHundredths(edit.hours), toCents(edit.rate))} /></b></div>
          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={saving}>{edit.id ? 'Save' : 'Save & add another'}</Btn>
            <Btn kind="ghost" onClick={() => setEdit(null)}>Done</Btn>
            {edit.id && <Btn kind="danger" className="ml-auto" onClick={async () => { if (confirm('Delete this entry?')) { await p.save.deleteTime(edit.id); setEdit(null); } }}>Delete</Btn>}
          </div>
        </Card>
      )}
    </div>
  );
}
