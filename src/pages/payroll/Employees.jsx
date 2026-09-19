import { useState } from 'react';
import { usePayroll } from './PayrollContext.jsx';
import { Badge, Btn, Card, Field, inputCls, Money, Th, Td } from './ui.jsx';
import { toCents, toDollars } from '../../lib/payroll/money.js';

const blank = (rate) => ({ name: '', active: true, hourly_rate: rate || '', notes: '' });

export default function Employees() {
  const p = usePayroll();
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!edit.name.trim()) return alert('Name is required');
    setSaving(true);
    try {
      await p.save.employee({ ...(edit.id ? { id: edit.id } : {}), name: edit.name.trim(), active: !!edit.active, hourly_rate: toDollars(toCents(edit.hourly_rate)), notes: edit.notes || null });
      setEdit(null);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card title="Employees" right={<Btn onClick={() => setEdit(blank(p.settings.default_hourly_rate))}>+ Add employee</Btn>}>
        <p className="mb-3 text-sm text-slate-600">Each employee is a record. Add as many as you need — nothing else changes. Changing a rate here only affects hours entered from now on; every time entry keeps the rate it was made at.</p>
        <table className="w-full">
          <thead><tr className="border-b"><Th>Name</Th><Th right>Hourly rate</Th><Th>Status</Th><Th>Notes</Th><Th /></tr></thead>
          <tbody>
            {p.employees.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <Td className="font-semibold">{e.name}</Td>
                <Td right><Money c={toCents(e.hourly_rate)} />/hr</Td>
                <Td><Badge kind={e.active ? 'good' : 'inactive'}>{e.active ? 'Active' : 'Inactive'}</Badge></Td>
                <Td className="text-slate-500">{e.notes}</Td>
                <Td right><Btn kind="ghost" onClick={() => setEdit({ ...e })}>Edit</Btn></Td>
              </tr>
            ))}
            {!p.employees.length && <tr><Td className="text-slate-500" colSpan={5}>No employees yet.</Td></tr>}
          </tbody>
        </table>
      </Card>

      {edit && (
        <Card title={edit.id ? 'Edit employee' : 'New employee'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
            <Field label="Hourly rate ($)"><input className={inputCls} inputMode="decimal" value={edit.hourly_rate} onChange={(e) => setEdit({ ...edit, hourly_rate: e.target.value })} /></Field>
            <Field label="Status">
              <select className={inputCls} value={edit.active ? 'active' : 'inactive'} onChange={(e) => setEdit({ ...edit, active: e.target.value === 'active' })}>
                <option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
            </Field>
            <Field label="Notes"><input className={inputCls} value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex gap-2"><Btn onClick={save} disabled={saving}>Save</Btn><Btn kind="ghost" onClick={() => setEdit(null)}>Cancel</Btn></div>
        </Card>
      )}
    </div>
  );
}
