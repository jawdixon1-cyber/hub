import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import RequestDetail from './RequestDetail';
import { RefreshCw, Search, ChevronUp, ChevronDown, ExternalLink, Plus } from 'lucide-react';

// Requests — Hub's copy of every Jobber request, laid out like Jobber's Requests page.
// Same colors + order as Jobber: blue = new/today/upcoming/converted, red = overdue, yellow = unscheduled.
const STATUS = {
  new: { label: 'New', dot: '#60A5FA', order: 0 },
  assessment_completed: { label: 'Assessment complete', dot: '#4ADE80', order: 1 },
  overdue: { label: 'Overdue', dot: '#F87171', order: 2 },
  today: { label: 'Today', dot: '#60A5FA', order: 3 },
  upcoming: { label: 'Upcoming', dot: '#60A5FA', order: 4 },
  unscheduled: { label: 'Unscheduled', dot: '#FACC15', order: 5 },
  converted: { label: 'Converted', dot: '#60A5FA', order: 6 },
  archived: { label: 'Archived', dot: '#94A3B8', order: 7 },
};
const st = (s) => STATUS[s] || { label: s, dot: '#64748B', order: 9 };
const DAY = 86400000;
const DATES = [['all', 'All'], ['30', 'Past 30 days'], ['90', 'Past 90 days'], ['year', 'This year']];

const phoneFmt = (p) => {
  const d = String(p || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p || '';
};
// Like Jobber: weekday if within the last week, otherwise "Nov 16".
const requested = (iso) => {
  const d = new Date(iso);
  if (Date.now() - d.getTime() < 6 * DAY) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
};

export function Pill({ s }) {
  const x = st(s);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap" style={{ background: `${x.dot}26`, color: x.dot }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: x.dot }} />{x.label}
    </span>
  );
}

export default function RequestsList() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [range, setRange] = useState('all');
  const [sort, setSort] = useState({ key: 'status', dir: 1 });
  const [shown, setShown] = useState(50);

  const gotFresh = useRef(false);
  const load = (refresh, quiet) => {
    if (!quiet) setBusy(true);
    setErr('');
    fetch(`/api/jobber-data?action=requests-list${refresh ? '&refresh=1' : ''}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { if (!quiet) setErr(d.error); return; }
        if (refresh) gotFresh.current = true; else if (gotFresh.current) return; // never let the saved copy overwrite a fresh one
        setData(d);
      })
      .catch(() => { if (!quiet) setErr('Could not reach Jobber'); })
      .finally(() => setBusy(false));
  };
  // Show the saved copy instantly, then pull fresh from Jobber (so deletes/changes there show up).
  useEffect(() => { load(false); load(true, true); }, []);
  const [params, setParams] = useSearchParams();
  const openId = params.get('r');
  const openReq = (id) => { const p = new URLSearchParams(params); if (id) p.set('r', id); else p.delete('r'); setParams(p); window.scrollTo(0, 0); };
  const [moreOpen, setMoreOpen] = useState(false);

  const all = useMemo(() => data?.requests || [], [data]);

  const stats = useMemo(() => {
    const now = Date.now();
    const in30 = all.filter((r) => now - new Date(r.createdAt) < 30 * DAY);
    const prev30 = all.filter((r) => { const a = now - new Date(r.createdAt); return a >= 30 * DAY && a < 60 * DAY; });
    const count = (s) => all.filter((r) => r.status === s).length;
    const rate = (list) => { const live = list.filter((r) => r.status !== 'archived'); return live.length ? Math.round((live.filter((r) => r.status === 'converted').length / live.length) * 100) : 0; };
    // Jobber's "New requests" card only counts ones that came in from outside (website form, plugins) — not typed in or made by Hub.
    const outside = (r) => r.source && !['internal', 'Hubb'].includes(r.source);
    const o30 = in30.filter(outside).length;
    const oPrev = prev30.filter(outside).length;
    return {
      o30,
      oChange: oPrev ? Math.round(((o30 - oPrev) / oPrev) * 100) : null,
      counts: ['new', 'assessment_completed', 'overdue', 'unscheduled'].map((s) => [s, count(s)]),
      n30: in30.length,
      change: prev30.length ? Math.round(((in30.length - prev30.length) / prev30.length) * 100) : null,
      // Jobber's conversion rate: converted ÷ requests that weren't archived, for requests made in the period.
      conv: rate(in30),
      convChange: rate(prev30) ? Math.round(((rate(in30) - rate(prev30)) / rate(prev30)) * 100) : null,
    };
  }, [all]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const now = Date.now();
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    const list = all.filter((r) => {
      if (status === 'open' ? ['converted', 'archived'].includes(r.status) : status !== 'all' && r.status !== status) return false;
      const ts = new Date(r.createdAt).getTime();
      if (range === '30' && now - ts > 30 * DAY) return false;
      if (range === '90' && now - ts > 90 * DAY) return false;
      if (range === 'year' && ts < yearStart) return false;
      return !t || `${r.client} ${r.title} ${r.address} ${r.phone} ${r.email}`.toLowerCase().includes(t);
    });
    const byDate = (a, b) => b.createdAt.localeCompare(a.createdAt);
    const cmp = {
      status: (a, b) => st(a.status).order - st(b.status).order || byDate(a, b),
      client: (a, b) => a.client.localeCompare(b.client),
      title: (a, b) => a.title.localeCompare(b.title),
      requested: (a, b) => -byDate(a, b),
    }[sort.key];
    return list.sort((a, b) => cmp(a, b) * sort.dir);
  }, [all, q, status, range, sort]);

  const Head = ({ k, children, className = '' }) => (
    <th className={`px-3 py-2.5 font-semibold text-left ${className}`}>
      {k ? (
        <button onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : 1 }))} className="inline-flex items-center gap-1 cursor-pointer hover:text-primary">
          {children}
          {sort.key === k ? (sort.dir === 1 ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronDown size={13} className="opacity-30" />}
        </button>
      ) : children}
    </th>
  );

  if (openId) return <RequestDetail id={openId} onBack={() => openReq(null)} onChanged={() => load(true)} />;

  return (
    <div className="space-y-4">
      {err && <p className="rounded-lg bg-red-500/10 text-red-400 px-3 py-2 text-sm">{err}</p>}

      {/* Jobber's top-right buttons */}
      <div className="flex justify-end gap-2 -mt-2">
        <a href="https://secure.getjobber.com/requests/new" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-[#7DC243] px-3 py-2 text-sm font-bold text-black hover:brightness-110"><Plus size={15} /> New Request</a>
        <div className="relative">
          <button onClick={() => setMoreOpen((m) => !m)} className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold text-primary hover:bg-surface-alt cursor-pointer">More Actions <ChevronDown size={14} /></button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-xl border border-border-subtle bg-card shadow-2xl py-1.5 text-sm">
              <a href="https://secure.getjobber.com/requests" target="_blank" rel="noreferrer" onClick={() => setMoreOpen(false)} className="flex items-center justify-between px-3 py-2 text-secondary hover:bg-surface-alt hover:text-primary">Customize Form <ExternalLink size={12} /></a>
              <a href="https://secure.getjobber.com/requests" target="_blank" rel="noreferrer" onClick={() => setMoreOpen(false)} className="flex items-center justify-between px-3 py-2 text-secondary hover:bg-surface-alt hover:text-primary">Share or Embed <ExternalLink size={12} /></a>
            </div>
          )}
        </div>
      </div>

      {/* Top cards, like Jobber */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <div className="rounded-xl border border-border-subtle bg-card p-4">
          <p className="font-bold text-primary">Overview</p>
          <div className="mt-2 space-y-1">
            {stats.counts.map(([s, n]) => (
              <button key={s} onClick={() => setStatus(s)} className="flex items-center gap-2 text-xs text-secondary hover:text-primary cursor-pointer">
                <span className="w-2 h-2 rounded-full" style={{ background: st(s).dot }} />{st(s).label} ({n})
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border-subtle bg-card p-4">
          <p className="font-bold text-primary">New requests</p>
          <p className="text-xs text-tertiary">Past 30 days · from your website &amp; online</p>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-primary">{data ? stats.o30 : '…'}</span>
            {stats.oChange != null && <span className={`text-xs font-bold ${stats.oChange >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>{stats.oChange >= 0 ? '▲' : '▼'} {Math.abs(stats.oChange)}%</span>}
          </p>
          <p className="text-xs text-muted mt-1">{data ? stats.n30 : '…'} added in all (incl. typed in &amp; lights form)</p>
        </div>
        <div className="rounded-xl border border-border-subtle bg-card p-4">
          <p className="font-bold text-primary">Conversion rate</p>
          <p className="text-xs text-tertiary">Past 30 days · converted ÷ requests not archived</p>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-primary">{data ? `${stats.conv}%` : '…'}</span>
            {stats.convChange != null && <span className={`text-xs font-bold ${stats.convChange >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>{stats.convChange >= 0 ? '▲' : '▼'} {Math.abs(stats.convChange)}%</span>}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold text-primary mr-2">All requests <span className="text-sm font-normal text-tertiary">({rows.length} results)</span></p>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setShown(50); }} className="w-40 rounded-full border border-border-subtle bg-card px-3 py-1.5 text-sm text-primary cursor-pointer">
          <option value="all">Status · All</option>
          <option value="open">Status · Open</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>Status · {v.label}</option>)}
        </select>
        <select value={range} onChange={(e) => { setRange(e.target.value); setShown(50); }} className="w-40 rounded-full border border-border-subtle bg-card px-3 py-1.5 text-sm text-primary cursor-pointer">
          {DATES.map(([k, l]) => <option key={k} value={k}>Date · {l}</option>)}
        </select>
        <div className="relative ml-auto">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setShown(50); }} placeholder="Search requests…" className="w-56 rounded-lg border border-border-subtle bg-card pl-9 pr-3 py-2 text-sm text-primary" />
        </div>
        <button onClick={() => load(true)} disabled={busy} title="Sync from Jobber" className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-sm text-secondary hover:text-primary cursor-pointer disabled:opacity-50">
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> {busy ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed min-w-[860px]">
          <colgroup><col className="w-[16%]" /><col className="w-[21%]" /><col className="w-[19%]" /><col className="w-[19%]" /><col className="w-[9%]" /><col className="w-[16%]" /></colgroup>
          <thead>
            <tr className="text-xs text-tertiary border-b-2 border-border-subtle">
              <Head k="client" className="pl-2">Client</Head>
              <Head k="title">Title</Head>
              <Head>Property</Head>
              <Head>Contact</Head>
              <Head k="requested">Requested</Head>
              <Head k="status" className="text-right">Status</Head>
            </tr>
          </thead>
          <tbody>
            {!data && !err && <tr><td colSpan={6} className="px-3 py-10 text-center text-muted">Loading requests…</td></tr>}
            {rows.slice(0, shown).map((r) => (
              <tr key={r.id} onClick={() => openReq(r.id)} className="border-t border-border-subtle hover:bg-surface-alt cursor-pointer align-middle">
                <td className="px-3 py-2.5 font-bold text-primary truncate">{r.client || '—'}</td>
                <td className="px-3 py-2.5 text-secondary"><span className="line-clamp-3">{r.title}</span></td>
                <td className="px-3 py-2.5 text-secondary"><span className="line-clamp-2">{r.address}</span></td>
                <td className="px-3 py-2.5 text-secondary">
                  <div className="truncate">{phoneFmt(r.phone)}</div>
                  <div className="text-xs text-tertiary truncate">{r.email}</div>
                </td>
                <td className="px-3 py-2.5 text-secondary whitespace-nowrap">{requested(r.createdAt)}</td>
                <td className="px-3 py-2.5 text-right"><Pill s={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > shown && (
          <button onClick={() => setShown((n) => n + 100)} className="w-full border-t border-border-subtle py-2.5 text-sm font-semibold text-secondary hover:text-primary cursor-pointer">
            Show more ({rows.length - shown} left)
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted flex items-center gap-1">
        Synced from Jobber {data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''} · click a request to open it
      </p>
    </div>
  );
}
