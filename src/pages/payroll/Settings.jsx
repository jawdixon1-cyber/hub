import { useState } from 'react';
import { usePayroll } from './PayrollContext.jsx';
import { Btn, Card, Field, inputCls } from './ui.jsx';
import { toCents, toDollars } from '../../lib/payroll/money.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Settings() {
  const p = usePayroll();
  const [s, setS] = useState({ ...p.settings });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const pct = Number(s.target_pct);
    if (!(pct > 0 && pct < 100)) return alert('Target % must be between 0 and 100');
    setSaving(true);
    try {
      await p.save.settings({ target_pct: Math.round(pct * 100) / 100, default_hourly_rate: toDollars(toCents(s.default_hourly_rate)), week_ending_day: Number(s.week_ending_day), allocation_method: s.allocation_method });
      alert('Saved. Finalized runs keep the target they were run with.');
    } finally { setSaving(false); }
  };
  return (
    <Card title="Settings">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Production labor target (%)" hint="Bonus pool = adjusted revenue × this % − actual production labor. Changing it only affects runs that aren't finalized.">
          <input className={inputCls} inputMode="decimal" value={s.target_pct} onChange={(e) => setS({ ...s, target_pct: e.target.value })} />
        </Field>
        <Field label="Default hourly rate ($)" hint="Pre-filled when you add a new employee.">
          <input className={inputCls} inputMode="decimal" value={s.default_hourly_rate} onChange={(e) => setS({ ...s, default_hourly_rate: e.target.value })} />
        </Field>
        <Field label="Payroll week ends on" hint="Time entries are grouped into weeks ending on this day. Change with care — existing entries keep their week.">
          <select className={inputCls} value={s.week_ending_day} onChange={(e) => setS({ ...s, week_ending_day: e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
        </Field>
        <Field label="Bonus allocation method" hint="How the pool is split between employees.">
          <select className={inputCls} value={s.allocation_method} onChange={(e) => setS({ ...s, allocation_method: e.target.value })}>
            <option value="production_hours_share">Share of bonus-eligible production hours</option>
          </select>
        </Field>
      </div>
      <div className="mt-4"><Btn onClick={save} disabled={saving}>Save settings</Btn></div>
    </Card>
  );
}
