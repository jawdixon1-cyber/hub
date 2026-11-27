import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Search, ChevronUp, ChevronDown, ExternalLink, Plus } from 'lucide-react';
import QuoteDetail from './QuoteDetail';
import NewQuote from './NewQuote';
import { useAuth } from '../contexts/AuthContext';

// Quotes — Hub's copy of every Jobber quote, laid out like Jobber's Quotes page.
const STATUS = {
  draft: { label: 'Draft', dot: '#94A3B8', order: 0 },
  awaiting_response: { label: 'Awaiting response', dot: '#FACC15', order: 1 },
  changes_requested: { label: 'Changes requested', dot: '#F87171', order: 2 },
  approved: { label: 'Approved', dot: '#4ADE80', order: 3 },
  converted: { label: 'Converted', dot: '#60A5FA', order: 4 },
  archived: { label: 'Archived', dot: '#94A3B8', order: 5 },
};
const st = (s) => STATUS[s] || { label: s, dot: '#94A3B8', order: 9 };
const DAY = 86400000;
const DATES = [['all', 'All'], ['30', 'Past 30 days'], ['90', 'Past 90 days'], ['year', 'This year']];
const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const k = (n) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`);
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);

export function QuotePill({ s }) {
  const x = st(s);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap" style={{ background: `${x.dot}26`, color: x.dot }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: x.dot }} />{x.label}
    </span>
  );
}
function Change({ v }) {
  if (v == null) return null;
  return <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${v > 0 ? 'bg-emerald-500/15 text-emerald-400' : v < 0 ? 'bg-red-500/15 text-red-400' : 'bg-surface-strong text-secondary'}`}>{v > 0 ? '↑' : v < 0 ? '↓' : ''} {Math.abs(v)}%</span>;
}

export default function QuotesList() {
  const { session } = useAuth();
  const [hubResp, setHubResp] = useState({});
  const [hubSent, setHubSent] = useState({});
  useEffect(() => {
    if (!session?.access_token) return;
    fetch('/api/jobber-data?action=quote-responses', { headers: { Authorization: `Bearer ${session.access_token}` } }).then((r) => r.json()).then((d) => { setHubResp(d.responses || {}); setHubSent(d.sent || {}); }).catch(() => {});
  }, [session?.access_token]);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [range, setRange] = useState('all');
  const [sort, setSort] = useState({ key: 'status', dir: 1 });
  const [shown, setShown] = useState(50);
  const [moreOpen, setMoreOpen] = useState(false);
  const gotFresh = useRef(false);
  const load = (refresh, quiet) => {
    if (!quiet) setBusy(true);
    setErr('');
    fetch(`/api/jobber-data?action=quotes-list${refresh ? '&refresh=1' : ''}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { if (!quiet) setErr(d.error); return; }
        if (refresh) gotFresh.current = true; else if (gotFresh.current) return;
        setData(d);
      })
      .catch(() => { if (!quiet) setErr('Could not reach Jobber'); })
      .finally(() => setBusy(false));
  };
  useEffect(() => { load(false); load(true, true); }, []);
  const [params, setParams] = useSearchParams();
  const openId = params.get('q');
  const openQuote = (id) => { const p = new URLSearchParams(params); if (id) p.set('q', id); else p.delete('q'); setParams(p); window.scrollTo(0, 0); };

  // Approvals live in Hub: a client approving on the Hub link makes the quote Approved here.
  const all = useMemo(() => (data?.quotes || []).map((x) => (hubResp[x.id]?.status === 'approved' && ['awaiting_response', 'changes_requested', 'draft'].includes(x.status) ? { ...x, status: 'approved', changedAt: hubResp[x.id].at, viaHub: true } : hubResp[x.id]?.status === 'changes' && ['awaiting_response', 'draft'].includes(x.status) ? { ...x, status: 'changes_requested', viaHub: true } : x.status === 'draft' && hubSent[x.id] ? { ...x, status: 'awaiting_response', sentAt: hubSent[x.id].at, viaHub: true } : x)), [data, hubResp, hubSent]);
  const stats = useMemo(() => {
    const now = Date.now();
    const win = (x, a, b) => x && now - new Date(x) >= a * DAY && now - new Date(x) < b * DAY;
    const sent = (a, b) => all.filter((x) => x.status !== 'draft' && win(x.createdAt, a, b));
    const conv = (a, b) => all.filter((x) => ['converted', 'approved'].includes(x.status) && win(x.changedAt, a, b));
    const sum = (l) => l.reduce((t, x) => t + x.total, 0);
    const s1 = sent(0, 30), s0 = sent(30, 60), c1 = conv(0, 30), c0 = conv(30, 60);
    const rate = (c, s) => (s.length ? Math.round((c.length / s.length) * 100) : 0);
    return {
      counts: ['draft', 'awaiting_response', 'changes_requested', 'approved'].map((s) => [s, all.filter((x) => x.status === s).length]),
      sent: s1.length, sentAmt: sum(s1), sentCh: pct(s1.length, s0.length),
      conv: c1.length, convAmt: sum(c1), convCh: pct(c1.length, c0.length),
      rate: rate(c1, s1), rateCh: pct(rate(c1, s1), rate(c0, s0)),
    };
  }, [all]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const now = Date.now();
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    const list = all.filter((x) => {
      if (status === 'open' ? !['draft', 'awaiting_response', 'changes_requested', 'approved'].includes(x.status) : status !== 'all' && x.status !== status) return false;
      const ts = new Date(x.createdAt).getTime();
      if (range === '30' && now - ts > 30 * DAY) return false;
      if (range === '90' && now - ts > 90 * DAY) return false;
      if (range === 'year' && ts < yearStart) return false;
      return !t || `${x.client} ${x.title} ${x.number} ${x.address}`.toLowerCase().includes(t);
    });
    const byDate = (a, b) => b.createdAt.localeCompare(a.createdAt);
    const cmp = {
      status: (a, b) => st(a.status).order - st(b.status).order || byDate(a, b),
      client: (a, b) => a.client.localeCompare(b.client),
      number: (a, b) => Number(a.number) - Number(b.number),
      created: (a, b) => -byDate(a, b),
      total: (a, b) => a.total - b.total,
    }[sort.key];
    return list.sort((a, b) => cmp(a, b) * sort.dir);
  }, [all, q, status, range, sort]);

  if (params.get('new')) return <NewQuote nextNumber={all.length ? Math.max(...all.map((x) => Number(x.number) || 0)) + 1 : undefined} init={{ clientId: params.get('client') || '', requestId: params.get('request') || '', similarId: params.get('similar') || '' }} onBack={() => { const p = new URLSearchParams(); setParams(p); }} onCreated={(d) => { load(true, true); setParams(new URLSearchParams(d.text ? { q: d.id, text: '1' } : d.email ? { q: d.id, email: '1' } : { q: d.id })); }} />;
  if (openId) return <QuoteDetail openText={params.get('text') === '1'} openEmail={params.get('email') === '1'} id={openId} onBack={() => openQuote(null)} onChanged={() => load(true, true)} />;

  const Head = ({ k: key, children, className = '' }) => (
    <th className={`px-3 py-2.5 font-semibold text-left ${className}`}>
      {key ? (
        <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))} className="inline-flex items-center gap-1 cursor-pointer hover:text-primary">
          {children}{sort.key === key ? (sort.dir === 1 ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronDown size={13} className="opacity-30" />}
        </button>
      ) : children}
    </th>
  );
  const card = 'rounded-xl border border-border-subtle bg-card p-4';
  return (
    <div className="space-y-4">
      {err && <p className="rounded-lg bg-red-500/10 text-red-400 px-3 py-2 text-sm">{err}</p>}
      <div className="flex justify-end gap-2 -mt-2">
        <button onClick={() => setParams(new URLSearchParams({ new: '1' }))} className="inline-flex items-center gap-1.5 rounded-lg bg-[#7DC243] px-3 py-2 text-sm font-bold text-black hover:brightness-110 cursor-pointer"><Plus size={15} /> New Quote</button>
        <div className="relative">
          <button onClick={() => setMoreOpen((m) => !m)} className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold text-primary hover:bg-surface-alt cursor-pointer">More Actions <ChevronDown size={14} /></button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-xl border border-border-subtle bg-card shadow-2xl py-1.5 text-sm">
              <a href="/lights-quoter?view=quote" onClick={() => setMoreOpen(false)} className="block px-3 py-2 text-secondary hover:bg-surface-alt hover:text-primary">Christmas lights quoter</a>
              <a href="/landscaping?tab=quoter" onClick={() => setMoreOpen(false)} className="block px-3 py-2 text-secondary hover:bg-surface-alt hover:text-primary">Landscape quoter</a>
              <a href="/products" onClick={() => setMoreOpen(false)} className="block px-3 py-2 text-secondary hover:bg-surface-alt hover:text-primary">Products & Services</a>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className={card}>
          <p className="font-bold text-primary">Overview</p>
          <div className="mt-2 space-y-1">
            {stats.counts.map(([s, n]) => (
              <button key={s} onClick={() => setStatus(s)} className="flex items-center gap-2 text-xs text-secondary hover:text-primary cursor-pointer">
                <span className="w-2 h-2 rounded-full" style={{ background: st(s).dot }} />{st(s).label} ({n})
              </button>
            ))}
          </div>
        </div>
        <div className={card}>
          <p className="font-bold text-primary">Conversion rate</p><p className="text-xs text-tertiary">Past 30 days</p>
          <p className="mt-3 flex items-baseline gap-2"><span className="text-3xl font-black text-primary">{data ? `${stats.rate}%` : '…'}</span><Change v={stats.rateCh} /></p>
        </div>
        <div className={card}>
          <p className="font-bold text-primary">Sent</p><p className="text-xs text-tertiary">Past 30 days</p>
          <p className="mt-3 flex items-baseline gap-2"><span className="text-3xl font-black text-primary">{data ? stats.sent : '…'}</span><Change v={stats.sentCh} /></p>
          <p className="text-xs text-tertiary">{k(stats.sentAmt)}</p>
        </div>
        <div className={card}>
          <p className="font-bold text-primary">Converted</p><p className="text-xs text-tertiary">Past 30 days</p>
          <p className="mt-3 flex items-baseline gap-2"><span className="text-3xl font-black text-primary">{data ? stats.conv : '…'}</span><Change v={stats.convCh} /></p>
          <p className="text-xs text-tertiary">{k(stats.convAmt)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold text-primary mr-2">All quotes <span className="text-sm font-normal text-tertiary">({rows.length} results)</span></p>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setShown(50); }} className="w-44 rounded-full border border-border-subtle bg-card px-3 py-1.5 text-sm text-primary cursor-pointer">
          <option value="all">Status · All</option>
          <option value="open">Status · Open</option>
          {Object.entries(STATUS).map(([key, v]) => <option key={key} value={key}>Status · {v.label}</option>)}
        </select>
        <select value={range} onChange={(e) => { setRange(e.target.value); setShown(50); }} className="w-40 rounded-full border border-border-subtle bg-card px-3 py-1.5 text-sm text-primary cursor-pointer">
          {DATES.map(([key, l]) => <option key={key} value={key}>Date · {l}</option>)}
        </select>
        <div className="relative ml-auto">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setShown(50); }} placeholder="Search quotes…" className="w-56 rounded-lg border border-border-subtle bg-card pl-9 pr-3 py-2 text-sm text-primary" />
        </div>
        <button onClick={() => load(true)} disabled={busy} title="Sync from Jobber" className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-sm text-secondary hover:text-primary cursor-pointer disabled:opacity-50">
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> {busy ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed min-w-[860px]">
          <colgroup><col className="w-[18%]" /><col className="w-[22%]" /><col className="w-[28%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[10%]" /></colgroup>
          <thead>
            <tr className="text-xs text-tertiary border-b-2 border-border-subtle">
              <Head k="client" className="pl-2">Client</Head><Head k="number">Quote number</Head><Head>Property</Head><Head k="created">Created</Head><Head k="status">Status</Head><Head k="total" className="text-right">Total</Head>
            </tr>
          </thead>
          <tbody>
            {!data && !err && <tr><td colSpan={6} className="px-3 py-10 text-center text-muted">Loading quotes…</td></tr>}
            {rows.slice(0, shown).map((x) => (
              <tr key={x.id} onClick={() => openQuote(x.id)} className="border-t border-border-subtle hover:bg-surface-alt cursor-pointer align-middle">
                <td className="px-3 py-2.5 font-bold text-primary truncate">{x.client || '—'}</td>
                <td className="px-3 py-2.5 text-secondary"><div>#{x.number}</div>{x.title && <div className="text-xs text-tertiary truncate">{x.title}</div>}</td>
                <td className="px-3 py-2.5 text-secondary"><span className="line-clamp-2">{x.address}</span></td>
                <td className="px-3 py-2.5 text-secondary whitespace-nowrap">{new Date(x.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td className="px-3 py-2.5"><QuotePill s={x.status} />{x.viaHub && <span className="ml-1 text-[10px] text-tertiary">Hub</span>}</td>
                <td className="px-3 py-2.5 text-right font-bold text-primary">{money(x.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > shown && <button onClick={() => setShown((n) => n + 100)} className="w-full border-t border-border-subtle py-2.5 text-sm font-semibold text-secondary hover:text-primary cursor-pointer">Show more ({rows.length - shown} left)</button>}
      </div>
      <p className="text-[11px] text-muted flex items-center gap-1">Synced from Jobber{data?.updatedAt ? ` ${new Date(data.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''} · click a quote to open it <ExternalLink size={11} /></p>
    </div>
  );
}
