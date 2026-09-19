/* Small shared pieces for the payroll screens. Kept deliberately plain. */
import { useState } from 'react';
import { Info } from 'lucide-react';
import { fmt, fmtHours } from '../../lib/payroll/money.js';

export const Money = ({ c, bold, className = '' }) => (
  <span className={`tabular-nums ${bold ? 'font-bold' : ''} ${c < 0 ? 'text-red-600' : ''} ${className}`}>{fmt(c)}</span>
);
export const Hours = ({ hh, className = '' }) => <span className={`tabular-nums ${className}`}>{fmtHours(hh)}</span>;
export const Pct = ({ bps, className = '' }) => <span className={`tabular-nums ${className}`}>{bps == null ? '—' : `${(bps / 100).toFixed(1)}%`}</span>;

export function Badge({ kind, children }) {
  const cls = {
    wip: 'bg-amber-100 text-amber-800 border-amber-200',
    complete: 'bg-green-100 text-green-800 border-green-200',
    finalized: 'bg-slate-900 text-white border-slate-900',
    draft: 'bg-slate-100 text-slate-700 border-slate-200',
    good: 'bg-green-100 text-green-800 border-green-200',
    bad: 'bg-red-100 text-red-800 border-red-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    inactive: 'bg-slate-100 text-slate-500 border-slate-200',
  }[kind] || 'bg-slate-100 text-slate-700 border-slate-200';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${cls}`}>{children}</span>;
}

export function Tip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle ml-1">
      <button type="button" onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Explain">
        <Info size={14} />
      </button>
      {open && <span className="absolute z-20 left-0 top-6 w-72 rounded-lg border bg-white p-3 text-xs leading-relaxed text-slate-700 shadow-lg">{text}</span>}
    </span>
  );
}

export const TIPS = {
  wip: 'Employees are still paid for these hours now. These production hours and the job\'s revenue are held out of the production bonus calculation until the job is complete.',
  adjusted: 'Revenue minus COG (materials, disposal, subs, other direct non-labor costs). This is the number the labor target is measured against.',
  laborPct: 'Bonus-eligible production labor ÷ completed adjusted revenue. Under the target means the crew beat the budget and the difference becomes the bonus pool.',
  pool: 'Target labor budget minus actual bonus-eligible production labor. Never negative — at or above target the pool is $0.',
  share: 'Each employee\'s share of the pool = their bonus-eligible production hours ÷ everyone\'s bonus-eligible production hours.',
  base: 'Total hours worked this week × the employee\'s hourly rate at the time. Every legitimate hour is paid, whether or not the job is finished.',
  reimb: 'Money the company owes back to the employee. Shown separately — it is not wages and never counts as production labor.',
  snapshot: 'Finalizing stores every number used (rates, hours, target %, revenue, COG) so later edits never change what this payroll says.',
};

export function Stat({ label, value, sub, tone, tip }) {
  const toneCls = tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-700' : 'text-slate-900';
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}{tip && <Tip text={tip} />}</div>
      <div className={`mt-1 text-2xl font-black tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Card({ title, right, children, className = '' }) {
  return (
    <section className={`rounded-xl border bg-white ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-bold">{title}</h3>{right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export const Btn = ({ children, kind = 'primary', className = '', ...p }) => {
  const cls = {
    primary: 'bg-[#B0FF03] text-black hover:brightness-95',
    dark: 'bg-slate-900 text-white hover:bg-slate-700',
    ghost: 'border bg-white text-slate-800 hover:bg-slate-50',
    danger: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  }[kind];
  return <button type="button" className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold disabled:opacity-40 ${cls} ${className}`} {...p}>{children}</button>;
};

export const Field = ({ label, children, hint }) => (
  <label className="block text-sm">
    <span className="mb-1 block font-semibold text-slate-700">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
  </label>
);
export const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#B0FF03]';

export function Warnings({ list }) {
  if (!list?.length) return null;
  return (
    <ul className="space-y-1.5">
      {list.map((w, i) => (
        <li key={i} className="flex items-start gap-2 text-sm"><Badge kind={w.level}>{w.level}</Badge><span>{w.msg}</span></li>
      ))}
    </ul>
  );
}

export function Checklist({ items, state, onChange, disabled }) {
  return (
    <ul className="space-y-2">
      {items.map(([k, label]) => (
        <li key={k}>
          <label className={`flex items-start gap-3 rounded-lg border p-3 ${state?.[k] ? 'border-green-300 bg-green-50' : 'bg-white'} ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={!!state?.[k]} disabled={disabled} onChange={(e) => onChange({ ...state, [k]: e.target.checked })} />
            <span className="text-sm">{label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export const Th = ({ children, right }) => <th className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
export const Td = ({ children, right, className = '' }) => <td className={`px-3 py-2 text-sm ${right ? 'text-right' : ''} ${className}`}>{children}</td>;
