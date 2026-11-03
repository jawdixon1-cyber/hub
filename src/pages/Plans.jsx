import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, RefreshCw, Search, ChevronDown, ChevronRight, Ban, Phone, Mail, UserPlus, Settings } from 'lucide-react';
import { useAppStore, useStoreHandle } from '../store/AppStoreContext';
import PlanCampaigns from './PlanCampaigns';

// Client Base (route /client-base): everyone we've done a job for in Jobber: who's on a plan, whose plan ended and why, who was
// one-time, and whether it's OK to reach back out. Jobs come live from Jobber
// (api/jobber-data.js ?action=plans); reasons and do-not-contact live in the app store (planNotes),
// keyed by Jobber client id.

// One tap each; tap the picked one again to clear it. Season ended feeds the "Season ended" box.
const REASONS = [
  'Season ended',
  'Doing it themselves / family',
  'Price',
  'Budget got tight',
  'Went with someone else',
  'Moved / house sold',
  'Unhappy',
  'We let them go',
  'Stopped paying',
  'Other',
  'No reason given',
  'Not sure yet',
];

// Every reason falls in one bucket, so the Cancelled chart shows whose fault it was without extra clicks.
const BUCKETS = [
  { id: 'us', label: 'On us', hint: 'fixable', color: 'bg-red-500', reasons: ['Unhappy', 'Price'] },
  { id: 'life', label: 'Life happened', hint: 'not on us', color: 'bg-amber-400', reasons: ['Moved / house sold', 'Budget got tight', 'Doing it themselves / family', 'Went with someone else'] },
  { id: 'fit', label: 'Bad fit', hint: 'we ended it', color: 'bg-slate-700', reasons: ['We let them go', 'Stopped paying'] },
  { id: 'unknown', label: 'Unknown', hint: 'dig into these', color: 'bg-slate-300', reasons: [] }, // No reason given, Not sure yet, Other, anything else
];
const bucketOf = (reason) => BUCKETS.find((b) => b.reasons.includes(reason)) || BUCKETS[BUCKETS.length - 1];

const NONE = {}; // stable fallbacks so memos don't recompute every render
const NO_ONE = [];
const PLANS_CACHE_KEY = 'hub-warm-leads-clients';
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const money = (n) => (n || n === 0 ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '');
const priceOf = (j) => {
  // Recurring jobs: monthly amount (and per visit), worked out server-side from the real line items.
  if (j.monthly != null) return `${money(j.monthly)}/mo${j.perVisit != null ? ` (${money(j.perVisit)}/visit)` : ''}`;
  if (j.perVisit != null) return `${money(j.perVisit)}/visit`;
  if (!j.total) return '';
  const per = j.billingType === 'FIXED_PRICE' && /^monthly/i.test(j.invoices) ? '/mo' : j.billingType === 'VISIT_BASED' ? '/visit' : '';
  return money(j.total) + per;
};

export default function Plans() {
  const planNotes = useAppStore((s) => s.planNotes) || NONE;
  const setPlanNotes = useAppStore((s) => s.setPlanNotes);

  // Show the last list straight away from this browser's cache, then refresh from Jobber behind it
  // (the Jobber pull takes a few seconds). Notes/reasons aren't cached here; they come from the store.
  const [data, setData] = useState(() => { try { return JSON.parse(localStorage.getItem(PLANS_CACHE_KEY)) || null; } catch { return null; } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  // Tab and open campaign live in the URL (?tab=campaigns&c=<id>, &c=new) so a refresh lands back there.
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'campaigns' ? 'campaigns' : 'clients';
  const setTab = (t) => setParams(t === 'campaigns' ? { tab: 'campaigns' } : {});

  const load = useCallback((refresh) => {
    setLoading(true); setError(null);
    fetch(`/api/jobber-data?action=plans${refresh ? '&refresh=1' : ''}`)
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Jobber returned ${r.status}`); return d; })
      .then((d) => { setData(d); try { localStorage.setItem(PLANS_CACHE_KEY, JSON.stringify(d)); } catch { /* full or blocked */ } })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(false); }, [load]);

  // Keep notes + campaigns in sync with other tabs/devices so an old tab can't save over newer edits
  const storeHandle = useStoreHandle();
  useEffect(() => {
    const keys = ['greenteam-planNotes', 'greenteam-planCampaigns', 'greenteam-planManual'];
    const pull = () => { if (document.visibilityState === 'visible') storeHandle.pullKeys?.(keys); };
    pull();
    const t = setInterval(pull, 15000);
    window.addEventListener('focus', pull);
    document.addEventListener('visibilitychange', pull);
    return () => { clearInterval(t); window.removeEventListener('focus', pull); document.removeEventListener('visibilitychange', pull); };
  }, [storeHandle]);

  const setNote = (clientId, patch) => setPlanNotes((all) => ({
    ...(all || {}),
    [clientId]: { ...((all || {})[clientId] || {}), ...patch, updatedAt: new Date().toISOString() },
  }));

  // People you add by hand (called in, never serviced) sit alongside the Jobber clients as kind 'added'.
  const planManual = useAppStore((s) => s.planManual) || NO_ONE;
  const setPlanManual = useAppStore((s) => s.setPlanManual);
  const [adding, setAdding] = useState(null); // { name, phone, note } while the add form is open
  const allClients = useMemo(() => {
    const fromJobber = data?.clients || [];
    const have = new Set(fromJobber.map((c) => c.clientId));
    return [
    ...fromJobber,
    ...planManual.filter((m) => !have.has(m.id)).map((m) => ({ clientId: m.id, name: m.name, phone: m.phone || '', email: '', jobs: [], kind: 'added', addedAt: m.createdAt, addedNote: m.note || '' })),
  ];
  }, [data, planManual]);
  // Hidden people (your own house, test clients…) are left out of everything; Settings lists them to bring back.
  const clients = useMemo(() => allClients.filter((c) => !planNotes[c.clientId]?.hidden), [allClients, planNotes]);
  const hiddenPeople = allClients.filter((c) => planNotes[c.clientId]?.hidden);
  const [showSettings, setShowSettings] = useState(false);
  // Add form: typing a name searches every client in Jobber (leads and quote-only people included).
  const [found, setFound] = useState([]);
  useEffect(() => {
    const q = adding?.name?.trim();
    if (!q || q.length < 2 || adding.pickedId) { setFound([]); return undefined; }
    const t = setTimeout(() => {
      fetch(`/api/jobber-data?action=clients&q=${encodeURIComponent(q)}`).then((r) => (r.ok ? r.json() : [])).then((rs) => setFound(Array.isArray(rs) ? rs.slice(0, 8) : [])).catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(t);
  }, [adding?.name, adding?.pickedId]);
  const pickFromJobber = (r) => {
    if (clients.some((c) => c.clientId === r.id)) {
      // Already here: just put them on next season and open their row.
      setNote(r.id, { nextSeason: true });
      setAdding(null); setFilter('all'); setSearch(r.name); setOpenId(r.id);
      return;
    }
    setAdding({ ...adding, name: r.name, phone: r.phone || '', pickedId: r.id, note: adding.note || [r.address, r.city].filter(Boolean).join(', ') });
  };
  const savePerson = () => {
    const name = adding.name.trim();
    if (!name) return;
    const id = adding.pickedId || `m${Date.now()}`;
    setPlanManual((all) => [...(all || []), { id, name, phone: adding.phone.trim(), note: adding.note.trim(), createdAt: new Date().toISOString() }]);
    setNote(id, { nextSeason: true, ...(adding.note.trim() ? { note: adding.note.trim() } : {}) });
    setAdding(null);
  };
  const removePerson = (id) => {
    if (!window.confirm('Remove this person from Client Base?')) return;
    setPlanManual((all) => (all || []).filter((m) => m.id !== id));
    setOpenId(null);
  };
  const counts = useMemo(() => {
    // Do-not-contact people count in their normal group, except Next season (a call list).
    const live = clients.filter((c) => !planNotes[c.clientId]?.dnc);
    const ended = clients.filter((c) => c.kind === 'ended');
    return {
      plan: clients.filter((c) => c.kind === 'plan').length,
      // Monthly recurring revenue: every active recurring job's monthly amount (from planMoney on the server).
      mrr: clients.reduce((sum, c) => sum + c.jobs.filter((j) => j.recurring && j.active).reduce((n, j) => n + (j.monthly || 0), 0), 0),
      ended: ended.length,
      oneTime: clients.filter((c) => c.kind === 'one-time').length,
      dnc: clients.filter((c) => planNotes[c.clientId]?.dnc).length,
      noreason: ended.filter((c) => !planNotes[c.clientId]?.reason).length,
      season: live.filter((c) => (c.kind === 'ended' && planNotes[c.clientId]?.reason === 'Season ended') || planNotes[c.clientId]?.nextSeason).length,
      cancelled: ended.filter((c) => planNotes[c.clientId]?.reason && planNotes[c.clientId].reason !== 'Season ended').length,
      reach: clients.filter((c) => c.kind !== 'plan' && !planNotes[c.clientId]?.dnc && planNotes[c.clientId]?.takeBack !== 'no').length,
    };
  }, [clients, planNotes]);

  const reasonChart = useMemo(() => {
    const t = {};
    for (const c of clients) {
      const r = planNotes[c.clientId]?.reason;
      if (c.kind === 'ended' && r && r !== 'Season ended') t[r] = (t[r] || 0) + 1;
    }
    return BUCKETS.map((b) => {
      const reasons = Object.entries(t).filter(([r]) => bucketOf(r) === b).sort((x, y) => y[1] - x[1]);
      return { ...b, total: reasons.reduce((n, [, k]) => n + k, 0), reasons };
    }).filter((b) => b.total > 0);
  }, [clients, planNotes]);
  const chartTotal = reasonChart.reduce((n, b) => n + b.total, 0) || 1;

  const needsReason = (c) => (c.kind === 'ended' && !planNotes[c.clientId]?.reason ? 0 : 1);
  const reasonAt = (c) => (planNotes[c.clientId]?.reason ? planNotes[c.clientId].reasonAt || planNotes[c.clientId].updatedAt || '' : '');
  // While a row is open the list holds still: it keeps its spot and stays in the current filter
  // even after a reason or do-not-contact change, so you can finish the note. Closing it re-sorts.
  const orderRef = useRef(null);
  /* eslint-disable react-hooks/refs -- the ref only remembers the last order to freeze it while a row is open */
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = clients.filter((c) => {
      const n = planNotes[c.clientId] || {};
      if (c.clientId === openId) return true;
      // Do-not-contact people stay in their normal group (with a red tag) so the stats are complete,
      // but never on the Next season call list. Campaigns leave them out too.
      if (n.dnc && filter === 'season') return false;
      if (['plan', 'ended', 'one-time'].includes(filter) && c.kind !== filter) return false;
      if (filter === 'reach' && (c.kind === 'plan' || n.dnc || n.takeBack === 'no')) return false;
      if (filter === 'dnc' && !n.dnc) return false;
      if (filter === 'season' && !((c.kind === 'ended' && n.reason === 'Season ended') || n.nextSeason)) return false;
      if (filter === 'cancelled' && (c.kind !== 'ended' || !n.reason || n.reason === 'Season ended')) return false;
      if (filter === 'noreason' && (c.kind !== 'ended' || n.reason)) return false;
      if (q && !`${c.name} ${c.jobs.map((j) => j.title).join(' ')} ${n.reason || ''} ${n.note || ''}`.toLowerCase().includes(q)) return false;
      return true;
    // Order: ended plans with no reason (A–Z), then the ones you most recently gave a reason, then everyone else (A–Z).
    });
    const cmp = (a, b) => needsReason(a) - needsReason(b) || reasonAt(b).localeCompare(reasonAt(a)) || a.name.localeCompare(b.name);
    if (openId && orderRef.current) {
      const pos = orderRef.current;
      return list.sort((a, b) => (pos.get(a.clientId) ?? 1e9) - (pos.get(b.clientId) ?? 1e9) || cmp(a, b));
    }
    const sorted = list.sort(cmp);
    orderRef.current = new Map(sorted.map((c, i) => [c.clientId, i]));
    return sorted;
  }, [clients, planNotes, filter, search, openId]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/refs */

  // Who each campaign group covers. Do-not-contact people are never in any of them.
  const audiences = useMemo(() => {
    const a = { plan: [], season: [], 'one-time': [], cancelled: [] };
    for (const c of clients) {
      const n = planNotes[c.clientId] || {};
      if (n.dnc) continue;
      if (c.kind === 'plan') a.plan.push(c);
      if ((c.kind === 'ended' && n.reason === 'Season ended') || n.nextSeason) a.season.push(c);
      if (c.kind === 'one-time') a['one-time'].push(c);
      if (c.kind === 'ended' && n.reason && n.reason !== 'Season ended') a.cancelled.push(c);
    }
    return a;
  }, [clients, planNotes]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-extrabold">Client Base</h1>
        <button onClick={() => setShowSettings((x) => !x)} title="Settings" className={`ml-auto rounded-lg border p-2 ${showSettings ? 'bg-slate-100' : 'hover:bg-slate-50'}`}><Settings size={16} /></button>
        <button onClick={() => load(true)} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh from Jobber
        </button>
      </div>

      {showSettings && (
        <div className="mb-4 rounded-xl border bg-white p-4">
          <p className="text-sm font-bold">Hidden people</p>
          <p className="mb-2 text-xs text-slate-500">Hidden from Client Base, counts and campaigns. Hide someone from their row (open it, then <b>Hide from Client Base</b>).</p>
          {hiddenPeople.length === 0 && <p className="text-sm text-slate-400">No one hidden.</p>}
          {hiddenPeople.map((c) => (
            <div key={c.clientId} className="flex items-center gap-3 border-b py-1.5 text-sm last:border-b-0">
              <span className="flex-1 font-semibold">{c.name}</span>
              <button onClick={() => setNote(c.clientId, { hidden: false })} className="rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-slate-50">Unhide</button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1">
        {[['clients', 'Clients'], ['campaigns', 'Campaigns']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === id ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{l}</button>
        ))}
      </div>

      {tab === 'campaigns' && data && <PlanCampaigns clients={clients} setNote={setNote} audiences={audiences} planNotes={planNotes} />}

      {/* Every ended plan should have a reason, so missing ones show as a to-do, not a box. */}
      {tab === 'clients' && data && counts.noreason > 0 && (
        <button onClick={() => setFilter(filter === 'noreason' ? 'all' : 'noreason')} className={`mb-3 flex w-full items-center gap-2 rounded-xl border px-4 py-2.5 text-left text-sm font-semibold ${filter === 'noreason' ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}>
          ⚠️ {counts.noreason} ended plan{counts.noreason === 1 ? '' : 's'} need{counts.noreason === 1 ? 's' : ''} a reason
          <span className="ml-auto text-xs font-bold underline">{filter === 'noreason' ? 'Show everyone' : 'Tag them now'}</span>
        </button>
      )}

      {tab === 'clients' && data && (
        // Each count is also a filter: click to show just those, click again for everyone.
        // Plans on one line; everyone else (one-time, do not contact) on the next.
        <div className="mb-4 space-y-3">
          {[
            ['Plans', [['plan', 'On a plan', counts.plan, 'text-[#4d7c0f]'], ['season', 'Next season', counts.season, 'text-emerald-700'], ['cancelled', 'Cancelled', counts.cancelled, 'text-slate-700']]],
            ['Other', [['one-time', 'One-time', counts.oneTime, 'text-slate-700'], ['dnc', 'Do not contact', counts.dnc, 'text-red-600']]],
          ].map(([group, boxes]) => (
            <div key={group}>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{group}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {boxes.map(([id, l, n, c]) => (
                  <button key={id} onClick={() => setFilter(filter === id ? 'all' : id)} className={`rounded-xl border px-4 py-3 text-left transition-colors ${filter === id ? 'border-[#4d7c0f] bg-lime-50 ring-1 ring-[#4d7c0f]' : 'bg-white hover:bg-slate-50'}`}>
                    <p className="text-xs font-semibold text-slate-500">{l}</p><p className={`text-2xl font-extrabold tabular-nums ${c}`}>{n}</p>
                    {id === 'plan' && counts.mrr > 0 && <p className="text-xs font-semibold text-slate-500"><span className="tabular-nums text-slate-800">{money(Math.round(counts.mrr))}</span>/mo recurring</p>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'clients' && filter === 'cancelled' && reasonChart.length > 0 && (
        // Why plans were cancelled, grouped by whose fault it was. Clicking a reason searches for it.
        <div className="mb-4 rounded-xl border bg-white p-4">
          <p className="mb-3 text-sm font-bold">Why they cancelled <span className="font-normal text-slate-400">· {chartTotal} total</span></p>
          <div className="space-y-3">
            {reasonChart.map((b) => (
              <div key={b.id}>
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-44 shrink-0 font-bold">{b.label} <span className="text-xs font-normal text-slate-400">{b.hint}</span></span>
                  <span className="h-5 flex-1 rounded bg-slate-100"><span className={`block h-5 rounded ${b.color}`} style={{ width: `${(b.total / chartTotal) * 100}%` }} /></span>
                  <span className="w-16 shrink-0 text-right font-bold tabular-nums">{b.total} <span className="text-xs font-normal text-slate-400">{Math.round((b.total / chartTotal) * 100)}%</span></span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5 pl-1">
                  {b.reasons.map(([r, n]) => (
                    <button key={r} onClick={() => setSearch(search === r ? '' : r)} className={`rounded-full border px-2.5 py-0.5 text-xs ${search === r ? 'border-[#4d7c0f] bg-[#4d7c0f] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{r} · {n}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'clients' && <div className="mb-3 flex flex-wrap items-center gap-2">
        {filter === 'season' && <button onClick={() => setAdding(adding ? null : { name: '', phone: '', note: '' })} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          <UserPlus size={14} /> Add person
        </button>}
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, plan, reason" className="w-full rounded-lg border py-2 pl-8 pr-3 text-sm" />
        </div>
      </div>}

      {tab === 'clients' && filter === 'season' && adding && (
        <div className="mb-3 rounded-xl border bg-white p-4">
          <p className="mb-2 text-sm font-bold">Add someone to reach out to next season</p>
          <p className="mb-2 text-xs text-slate-500">Start typing a name to search Jobber, or just type someone new.</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
            <div className="relative">
              <input autoFocus value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value, pickedId: null })} placeholder="Name (searches Jobber)" className="w-full rounded-lg border px-3 py-2 text-sm" />
              {adding.pickedId && <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-lime-100 px-1.5 text-[10px] font-bold text-[#4d7c0f]">FROM JOBBER</span>}
              {found.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border bg-white shadow-lg">
                  {found.map((r) => {
                    const here = clients.some((c) => c.clientId === r.id);
                    return (
                      <button key={r.id} onClick={() => pickFromJobber(r)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
                        <span className="flex-1 truncate"><b>{r.name}</b> <span className="text-xs text-slate-500">{[r.phone, r.address].filter(Boolean).join(' · ')}</span></span>
                        {here && <span className="shrink-0 text-[10px] font-bold text-slate-400">ALREADY HERE</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <input value={adding.phone} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} placeholder="Phone" inputMode="tel" className="rounded-lg border px-3 py-2 text-sm" />
          </div>
          <input value={adding.note} onChange={(e) => setAdding({ ...adding, note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && savePerson()} placeholder="Note (what they want, address, etc.)" className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" />
          <div className="mt-2 flex gap-2">
            <button onClick={savePerson} disabled={!adding.name.trim()} className="rounded-lg bg-[#4d7c0f] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Add to next season</button>
            <button onClick={() => setAdding(null)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Couldn't load from Jobber: {error}</p>}
      {loading && !data && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>}

      {tab === 'clients' && data && (
        <div className="overflow-hidden rounded-xl border bg-white">
          {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-500">No one matches.</p>}
          {rows.map((c) => {
            const n = planNotes[c.clientId] || {};
            // Row summary shows the plan, not a one-off project: active plans, else their last plan,
            // else (one-time clients) their latest job. jobs come newest first.
            const current = c.jobs.filter((j) => j.recurring && j.active);
            const lastPlan = c.jobs.find((j) => j.recurring);
            const shown = current.length ? current : [lastPlan || c.jobs[0]].filter(Boolean);
            const open = openId === c.clientId;
            return (
              <div key={c.clientId} className="border-b last:border-b-0">
                <button onClick={() => setOpenId(open ? null : c.clientId)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  {open ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold">
                      <span className="truncate">{c.name}</span>
                      {n.nextSeason && <span title="On the next-season list" className="shrink-0 text-sm">📅</span>}
                      {n.takeBack && <span title={n.takeBack === 'yes' ? 'Would take back' : "Wouldn't take back"} className="shrink-0 text-sm">{n.takeBack === 'yes' ? '👍' : '👎'}</span>}
                      {n.dnc && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700"><Ban size={11} /> Do not contact</span>}
                    </p>
                    <p className="truncate text-xs text-slate-500">{c.kind === 'added' ? [c.phone, n.note].filter(Boolean).join(' · ') || 'Added by you' : shown.map((j) => [j.title, j.freq || j.visits, priceOf(j)].filter(Boolean).join(' · ')).join('  |  ')}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {c.kind === 'plan' && <span className="rounded-full bg-lime-50 px-2.5 py-1 text-xs font-bold text-[#4d7c0f]">On a plan</span>}
                    {c.kind === 'ended' && <><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Plan ended {fmtDate(c.endedAt)}</span>
                      <p className={`mt-1 text-xs ${n.reason ? 'text-slate-600' : 'font-semibold text-amber-600'}`}>{n.reason || 'Why?'}</p></>}
                    {c.kind === 'added' && <><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">Added by you</span>
                      <p className="mt-1 text-xs text-slate-500">{fmtDate(c.addedAt)}</p></>}
                    {c.kind === 'one-time' && <><span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">One-time</span>
                      <p className="mt-1 text-xs text-slate-500">Last {fmtDate(c.lastService)}</p></>}
                  </div>
                </button>

                {open && (
                  <div className="space-y-3 bg-slate-50/60 px-4 pb-4 pl-11 pt-1 text-sm">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone size={12} />{c.phone}</a>}
                      {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail size={12} />{c.email}</a>}
                    </div>
                    <div className="space-y-1">
                      {c.jobs.map((j) => (
                        <p key={j.id} className="text-xs text-slate-600">
                          <span className="font-semibold text-slate-800">#{j.jobNumber} {j.title}</span>
                          {!j.recurring && <span className="ml-1 rounded bg-sky-50 px-1 text-[10px] font-bold text-sky-700">ONE-TIME</span>}
                          {' · '}{[j.visits, priceOf(j)].filter(Boolean).join(' · ')}
                          {' · '}{j.active ? (j.recurring ? `since ${fmtDate(j.startAt)}` : `open, ${fmtDate(j.startAt)}`) : j.recurring ? `${fmtDate(j.startAt)} – closed ${fmtDate(j.closedAt || j.endAt)}` : fmtDate(j.closedAt || j.startAt)}
                        </p>
                      ))}
                    </div>
                    {c.kind === 'ended' && (
                      <div>
                        <span className="text-xs font-semibold text-slate-500">Why their plan ended</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {(REASONS.includes(n.reason) || !n.reason ? REASONS : [...REASONS, n.reason]).map((r) => (
                            <button key={r} onClick={() => setNote(c.clientId, { reason: n.reason === r ? '' : r, reasonAt: new Date().toISOString() })}
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${n.reason === r ? 'border-[#4d7c0f] bg-[#4d7c0f] text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>{r}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-500">Notes</span>
                      <textarea value={n.note || ''} onChange={(e) => setNote(c.clientId, { note: e.target.value })} rows={2} placeholder="Anything worth remembering" className="mt-1 block w-full rounded-lg border bg-white px-2 py-1.5 text-sm" />
                    </label>
                    {c.kind !== 'plan' && (
                      <button onClick={() => setNote(c.clientId, { nextSeason: !n.nextSeason })}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${n.nextSeason ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                        📅 {n.nextSeason ? 'On the next-season list' : 'Reach out next season'}
                      </button>
                    )}
                    {c.kind !== 'plan' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500">Would you take them back?</span>
                        {[['yes', '👍'], ['no', '👎']].map(([v, icon]) => (
                          <button key={v} onClick={() => setNote(c.clientId, { takeBack: n.takeBack === v ? '' : v })}
                            className={`rounded-lg border px-2.5 py-1 text-base ${n.takeBack === v ? (v === 'yes' ? 'border-[#4d7c0f] bg-lime-50' : 'border-red-400 bg-red-50') : 'bg-white opacity-60 hover:opacity-100'}`}>{icon}</button>
                        ))}
                      </div>
                    )}
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-red-700">
                      <input type="checkbox" checked={!!n.dnc} onChange={(e) => setNote(c.clientId, { dnc: e.target.checked })} className="h-4 w-4 accent-red-600" />
                      Do not contact
                    </label>
                    {c.kind === 'added'
                      ? <button onClick={() => removePerson(c.clientId)} className="ml-4 text-xs font-semibold text-slate-400 hover:text-red-600">Remove person</button>
                      : <button onClick={() => { setNote(c.clientId, { hidden: true }); setOpenId(null); }} className="ml-4 text-xs font-semibold text-slate-400 hover:text-red-600">Hide from Client Base</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {tab === 'clients' && data?.updatedAt && <p className="mt-2 text-right text-[11px] text-slate-400">From Jobber {new Date(data.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>}
    </div>
  );
}
