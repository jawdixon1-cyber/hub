import { useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';

// P&L straight from QuickBooks (Profit & Loss report, by month, accrual).
// This year vs last year, month by month.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW_C = '#22C55E';
const LAST_C = 'rgba(148,163,184,0.45)';
const money = (n) => (n == null ? '—' : `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`);
const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

// Find a summary row (e.g. "Total Income") anywhere in the report tree.
function findRow(rows, name) {
  for (const r of rows || []) {
    const s = r.Summary?.ColData;
    if (s && s[0]?.value === name) return s.map((x) => Number(x.value) || 0);
    if (r.Rows) { const f = findRow(r.Rows.Row, name); if (f) return f; }
  }
  return null;
}

export default function PnL() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [hover, setHover] = useState(null);
  const now = new Date();
  const year = now.getFullYear();
  const thisMonth = now.getMonth();

  useEffect(() => {
    const end = `${year}-${String(thisMonth + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    fetch(`/api/qb-data?action=profit-and-loss&startDate=${year - 1}-01-01&endDate=${end}&by=Month`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setReport(d)))
      .catch(() => setError('Could not reach QuickBooks'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // months[0..11] = { month, now: {rev, gross, net}, last: {...} }
  const months = useMemo(() => {
    if (!report) return null;
    const titles = (report.Columns?.Column || []).map((c) => c.ColTitle || '');
    const rev = findRow(report.Rows?.Row, 'Total Income') || [];
    const gross = findRow(report.Rows?.Row, 'Gross Profit') || [];
    const net = findRow(report.Rows?.Row, 'Net Income') || [];
    const out = MONTHS.map((m) => ({ month: m, now: null, last: null }));
    titles.forEach((t, i) => {
      const y = Number(t.slice(-4));
      const m = MONTHS.indexOf(t.slice(0, 3));
      if (m < 0 || !y) return;
      const v = { rev: rev[i] || 0, gross: gross[i] || 0, net: net[i] || 0 };
      if (y === year) out[m].now = v;
      else if (y === year - 1) out[m].last = v;
    });
    return out;
  }, [report, year]);

  const totals = useMemo(() => {
    if (!months) return null;
    const upTo = months.slice(0, thisMonth + 1);
    const sum = (k, f) => upTo.reduce((t, m) => t + (m[k]?.[f] || 0), 0);
    const withNow = months.filter((m) => m.now && m.now.rev > 0);
    const best = withNow.reduce((b, m) => (!b || m.now.rev > b.now.rev ? m : b), null);
    return {
      rev: sum('now', 'rev'), lastRev: sum('last', 'rev'),
      net: sum('now', 'net'), lastNet: sum('last', 'net'),
      avg: withNow.length ? withNow.reduce((t, m) => t + m.now.rev, 0) / withNow.length : 0,
      best,
    };
  }, [months, thisMonth]);

  const max = months ? Math.max(1, ...months.flatMap((m) => [m.now?.rev || 0, m.last?.rev || 0])) : 1;
  const cur = months?.[thisMonth];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-black text-primary flex items-center gap-2"><TrendingUp size={22} /> P&amp;L</h1>
      <p className="text-sm text-tertiary mt-1">From QuickBooks · revenue and profit by month, {year} vs {year - 1}</p>

      {error && (
        <p className="mt-4 rounded-lg bg-red-500/10 text-red-400 px-3 py-2 text-sm">
          {error} · <a href="/connections" className="underline">Connections</a>
        </p>
      )}
      {!error && !months && <p className="mt-6 text-sm text-muted">Loading QuickBooks…</p>}

      {months && totals && (
        <>
          {/* Headline numbers */}
          <div className="grid gap-3 mt-5 grid-cols-2 lg:grid-cols-4">
            {[
              ['Revenue this year', money(totals.rev), pct(totals.rev, totals.lastRev), `${money(totals.lastRev)} same time last year`],
              ['Net profit this year', money(totals.net), null, `${totals.rev > 0 ? Math.round((totals.net / totals.rev) * 100) : 0}% of revenue · last year ${money(totals.lastNet)}`],
              [`${MONTHS[thisMonth]} so far`, money(cur?.now?.rev), pct(cur?.now?.rev || 0, cur?.last?.rev || 0), `${money(cur?.last?.rev)} all of ${MONTHS[thisMonth]} last year`],
              ['Avg month', money(totals.avg), null, totals.best ? `Best: ${totals.best.month} ${money(totals.best.now.rev)}` : ''],
            ].map(([label, big, change, sub]) => (
              <div key={label} className="rounded-xl border border-border-subtle bg-card p-4">
                <p className="text-xs text-tertiary">{label}</p>
                <p className="text-2xl font-black text-primary mt-1 tabular-nums">{big}</p>
                {change != null && (
                  <p className={`text-xs font-bold mt-0.5 ${change >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>{change >= 0 ? '▲' : '▼'} {Math.abs(change)}% vs last year</p>
                )}
                <p className="text-xs text-muted mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* Revenue by month: this year vs last year */}
          <div className="rounded-xl border border-border-subtle bg-card p-4 mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-primary">Revenue by month</p>
              <div className="flex items-center gap-4 text-xs text-secondary">
                <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: NOW_C }} /> {year}</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: LAST_C }} /> {year - 1}</span>
              </div>
            </div>
            <div className="relative mt-4 flex items-end gap-1 sm:gap-2 border-b border-border-subtle" style={{ height: 256 }}>
              {months.map((m, i) => {
                const h = (v) => `${Math.max(0, (v / max) * 100)}%`;
                const future = i > thisMonth;
                return (
                  <div
                    key={m.month}
                    className="relative flex-1 h-full flex items-end justify-center gap-[2px] cursor-default"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setHover(hover === i ? null : i)}
                  >
                    {hover === i && <div className="absolute inset-0 rounded-md bg-surface-alt/60" />}
                    <div className="relative rounded-t" style={{ width: '42%', background: LAST_C, height: h(m.last?.rev || 0) }} />
                    <div className="relative rounded-t" style={{ width: '42%', background: NOW_C, height: future ? 0 : h(m.now?.rev || 0) }} />
                    {hover === i && (
                      <div className={`absolute bottom-full mb-2 z-10 w-48 rounded-lg border border-border-subtle bg-card shadow-xl p-2.5 text-xs ${i > 8 ? 'right-0' : i < 3 ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}>
                        <p className="font-bold text-primary">{m.month}</p>
                        <p className="text-secondary mt-1 flex justify-between"><span>{year}</span><b className="text-primary tabular-nums">{future ? '—' : money(m.now?.rev)}</b></p>
                        <p className="text-secondary flex justify-between"><span>{year - 1}</span><b className="text-primary tabular-nums">{money(m.last?.rev)}</b></p>
                        {!future && pct(m.now?.rev || 0, m.last?.rev || 0) != null && (
                          <p className="text-secondary flex justify-between"><span>Change</span><b className="text-primary">{pct(m.now?.rev || 0, m.last?.rev || 0)}%</b></p>
                        )}
                        {!future && <p className="text-secondary flex justify-between mt-1 pt-1 border-t border-border-subtle"><span>Net profit</span><b className="text-primary tabular-nums">{money(m.now?.net)}</b></p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1 sm:gap-2 mt-1.5">
              {months.map((m, i) => (
                <p key={m.month} className={`flex-1 text-center text-[11px] ${i === thisMonth ? 'font-bold text-primary' : 'text-muted'}`}>{m.month}</p>
              ))}
            </div>
          </div>

          {/* Month table */}
          <div className="rounded-xl border border-border-subtle bg-card mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-tertiary text-right">
                  <th className="text-left font-semibold px-4 py-2.5">Month</th>
                  <th className="font-semibold px-3 py-2.5">Revenue</th>
                  <th className="font-semibold px-3 py-2.5">Last year</th>
                  <th className="font-semibold px-3 py-2.5">Change</th>
                  <th className="font-semibold px-3 py-2.5">Gross profit</th>
                  <th className="font-semibold px-4 py-2.5">Net profit</th>
                </tr>
              </thead>
              <tbody>
                {months.slice(0, thisMonth + 1).map((m, i) => {
                  const c = pct(m.now?.rev || 0, m.last?.rev || 0);
                  return (
                    <tr key={m.month} className="border-t border-border-subtle text-right tabular-nums">
                      <td className="text-left px-4 py-2 font-semibold text-primary">{m.month}{i === thisMonth ? ' (so far)' : ''}</td>
                      <td className="px-3 py-2 font-bold text-primary">{money(m.now?.rev)}</td>
                      <td className="px-3 py-2 text-muted">{money(m.last?.rev)}</td>
                      <td className={`px-3 py-2 font-semibold ${c == null ? 'text-muted' : c >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>{c == null ? '—' : `${c >= 0 ? '+' : ''}${c}%`}</td>
                      <td className="px-3 py-2 text-secondary">{money(m.now?.gross)}</td>
                      <td className={`px-4 py-2 font-semibold ${(m.now?.net || 0) < 0 ? 'text-red-400' : 'text-primary'}`}>{money(m.now?.net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted mt-2">Accrual basis: revenue counts when it's invoiced, not when it's paid. Matches QuickBooks → Reports → Profit and Loss.</p>
        </>
      )}
    </div>
  );
}
