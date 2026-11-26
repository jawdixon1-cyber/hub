import { useEffect, useState } from 'react';
import { Plug } from 'lucide-react';

// Apps Hub reads from. Each one gets a real test call, so "Connected" means it actually works right now.
const APPS = [
  {
    key: 'qb', name: 'QuickBooks', what: 'Your books: monthly revenue, profit, expenses',
    connect: '/api/qb-data?action=auth',
    test: async () => {
      const r = await fetch('/api/qb-data?action=company-info');
      const d = await r.json().catch(() => ({}));
      if (r.ok && !d.error) return { ok: true, note: d?.CompanyInfo?.CompanyName || '' };
      return { ok: false, note: d.error || 'Not connected' };
    },
  },
  {
    key: 'jobber', name: 'Jobber', what: 'Clients, requests, quotes, jobs, visits, timesheets',
    connect: '/api/jobber-auth',
    test: async () => {
      const d = await fetch('/api/jobber-data?action=status').then((r) => r.json()).catch(() => ({}));
      if (d.connected && !d.last_refresh_error) return { ok: true, note: d.refreshed_at ? `Refreshed ${new Date(d.refreshed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '' };
      return { ok: false, note: d.last_refresh_error || 'Not connected' };
    },
  },
];

export default function Connections() {
  const [state, setState] = useState({});
  const [back] = useState(() => { const q = new URLSearchParams(window.location.search); return q.get('qb') ? { ok: q.get('qb') === 'success', msg: q.get('msg') || '' } : null; });
  useEffect(() => {
    APPS.forEach((a) => {
      a.test().then((s) => setState((p) => ({ ...p, [a.key]: s }))).catch(() => setState((p) => ({ ...p, [a.key]: { ok: false, note: 'Could not check' } })));
    });
  }, []);
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-black text-primary flex items-center gap-2"><Plug size={22} /> Connections</h1>
      <p className="text-sm text-tertiary mt-1">Apps Hub pulls your data from.</p>
      {back && <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${back.ok ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-400'}`}>{back.ok ? '✅ QuickBooks connected' : `QuickBooks didn't connect: ${back.msg}`}</p>}
      <div className="mt-5 space-y-3">
        {APPS.map((a) => {
          const s = state[a.key];
          return (
            <div key={a.key} className="rounded-xl border border-border-subtle bg-card p-4 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-primary">{a.name}</p>
                <p className="text-xs text-tertiary">{a.what}</p>
                {s && <p className={`text-xs mt-1 truncate ${s.ok ? 'text-emerald-500' : 'text-red-400'}`}>{s.ok ? '● Connected' : '● Needs reconnect'}{s.note ? ` · ${s.note}` : ''}</p>}
                {!s && <p className="text-xs mt-1 text-muted">Checking…</p>}
              </div>
              <a href={a.connect} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${s && !s.ok ? 'bg-brand text-white' : 'border border-border-subtle text-secondary hover:bg-surface-alt'}`}>
                {s && !s.ok ? 'Connect' : 'Reconnect'}
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
