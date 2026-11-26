import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, MessageSquare, ExternalLink, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Leads you're working: Jobber requests + quotes, sorted into what needs you.
// Overdue → Need to contact → Assessments scheduled → Quotes out.
const SERVICES = [
  ['🎄 Christmas lights', /christmas|light/i],
  ['🍃 Leaves', /leaf|leaves|cleanup|clean-up|debris/i],
  ['🌳 Bushes', /bush|hedge|shrub|tree|palm|trim/i],
  ['🌱 Aeration', /aerat|overseed|seed/i],
  ['🪴 Beds / mulch', /bed|mulch|pine|straw|landscap|plant/i],
  ['🌿 Mowing', /mow|lawn|grass|turf/i],
];
// Whichever service they mention FIRST wins ("mowing ... trimming saplings" = mowing, "Bushes and leaf removal" = bushes).
const serviceOf = (t) => {
  let best = null; let at = Infinity;
  if (/permanent|year.?round/i.test(String(t || ''))) return '💡 Permanent lights';
  for (const [name, re] of SERVICES) { const i = String(t || '').search(re); if (i >= 0 && i < at) { at = i; best = name; } }
  return best;
};
// Within each section (except dated ones: Overdue + Assessments go by date): Christmas/permanent lights first, then bushes, then leaves, then everything else (order kept otherwise).
const RANK = { '🎄': 0, '💡': 0, '🌳': 1, '🍃': 2 };
const rankOf = (x) => RANK[serviceOf(`${x.title} ${x.need || ''}`)?.split(' ')[0]] ?? 3;
const byService = (items) => items.map((x, i) => [x, i]).sort(([a, i], [b, j]) => (a.dim ? 1 : 0) - (b.dim ? 1 : 0) || rankOf(a) - rankOf(b) || i - j).map(([x]) => x);
const daysAgo = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso)) / 864e5)) : null);
const when = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(', 12:00 AM', '');
const money = (n) => `$${Math.round(n).toLocaleString()}`;
const CACHE = 'hub-leads-cache';

// Their recent Quo chat, opened under the row: texts + calls, and a reply box (you hit Send).
// Save every photo from a chat into a new folder named after them.
// Chrome on a computer: you pick where, we make "<Name> photos" there. Otherwise: one .zip that unzips to that folder.
async function savePhotos(urls, name, setSaving) {
  const folder = `${String(name || 'Client').replace(/[^\w .-]/g, '').trim() || 'Client'} photos`;
  const ext = (b) => (/png/.test(b.type) ? 'png' : /gif/.test(b.type) ? 'gif' : /heic/.test(b.type) ? 'heic' : 'jpg');
  try {
    let dir = null;
    if (window.showDirectoryPicker) {
      try { const base = await window.showDirectoryPicker({ mode: 'readwrite' }); dir = await base.getDirectoryHandle(folder, { create: true }); }
      catch (e) { if (e?.name === 'AbortError') return; dir = null; }
    }
    const files = [];
    for (const [i, u] of urls.entries()) {
      setSaving(`Downloading ${i + 1} of ${urls.length}…`);
      const b = await fetch(u).then((r) => r.blob());
      const fname = `${folder} ${String(i + 1).padStart(2, '0')}.${ext(b)}`;
      if (dir) { const fh = await dir.getFileHandle(fname, { create: true }); const w = await fh.createWritable(); await w.write(b); await w.close(); }
      else files.push([fname, new Uint8Array(await b.arrayBuffer())]);
    }
    if (!dir) {
      const { zipSync } = await import('fflate');
      const zip = zipSync({ [folder]: Object.fromEntries(files) }, { level: 0 });
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' })); a.download = `${folder}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
    }
    setSaving(dir ? `✓ Saved to “${folder}”` : '✓ Downloaded');
  } catch (e) { setSaving(`Couldn't save: ${e.message}`); }
  setTimeout(() => setSaving(''), 4000);
}

export function LeadChat({ phone, name, token }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const boxRef = useRef(null);
  const [saving, setSaving] = useState('');
  const [view, setView] = useState(-1); // which photo is open full size (index into every photo in the chat)
  const photos = (d?.items || []).flatMap((m) => m.media || []);
  useEffect(() => {
    if (view < 0) return undefined;
    const k = (e) => { if (e.key === 'Escape') setView(-1); if (e.key === 'ArrowRight') setView((v) => Math.min(photos.length - 1, v + 1)); if (e.key === 'ArrowLeft') setView((v) => Math.max(0, v - 1)); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [view, photos.length]);
  // Newest texts at the bottom: jump there whenever the chat loads or a text is sent
  useEffect(() => { const b = boxRef.current; if (b) b.scrollTop = b.scrollHeight; }, [d]);
  const load = useCallback(() => {
    setErr('');
    fetch('/api/quo?action=thread', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ phone }) })
      .then((r) => r.json().then((j) => { if (!r.ok) throw new Error(j.error || `Error ${r.status}`); setD(j); }))
      .catch((e) => setErr(e.message));
  }, [phone, token]);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    const t = text.trim(); if (!t || !d?.phoneNumberId) return;
    setSending(true); setErr('');
    try {
      const r = await fetch('/api/quo?action=send', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ phoneNumberId: d.phoneNumberId, to: d.to, content: t }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      setText(''); load();
    } catch (e) { setErr(e.message); }
    setSending(false);
  };
  const t = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <div className="mb-2 ml-[52px] rounded-xl border border-card-border bg-surface-alt/50 p-3 space-y-2">
      {!d && !err && <p className="text-xs text-muted">Loading your chat with {name}…</p>}
      {d && !d.items.length && <p className="text-xs text-muted">No texts or calls with {name} yet.</p>}
      {d && d.items.length > 0 && (
        <div ref={boxRef} className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
          {d.items.map((m) => (m.type === 'call'
            ? <p key={m.id} className="text-center text-[11px] text-muted">📞 {m.dir === 'incoming' ? 'They called' : 'You called'}{m.duration ? ` · ${Math.round(m.duration / 60) || '<1'} min` : m.status ? ` · ${m.status}` : ''} · {t(m.at)}</p>
            : (
              <div key={m.id} className={`flex ${m.dir === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${m.dir === 'outgoing' ? 'bg-sky-600 text-white' : 'bg-card text-primary border border-card-border'}`}>
                  {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
                  {m.media.length > 0 && (
                    <div className={`grid gap-1 mt-0.5 ${m.media.length > 1 ? 'grid-cols-3' : 'grid-cols-1'}`}>
                      {m.media.map((u) => (
                        <button key={u} type="button" onClick={() => setView(photos.indexOf(u))} className="block cursor-zoom-in">
                          <img src={u} alt="" loading="lazy" className={`rounded-lg object-cover ${m.media.length > 1 ? 'w-20 h-20' : 'max-w-[220px] max-h-56'}`} />
                        </button>
                      ))}
                    </div>
                  )}
                  <p className={`text-[10px] mt-0.5 ${m.dir === 'outgoing' ? 'text-white/70' : 'text-muted'}`}>{t(m.at)}</p>
                </div>
              </div>
            )))}
        </div>
      )}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          {photos.length > 1 && <button type="button" onClick={() => setView(0)} className="text-xs font-semibold text-sky-500 hover:underline cursor-pointer">🖼️ See all {photos.length} photos</button>}
          <button type="button" disabled={!!saving} onClick={() => savePhotos(photos, name, setSaving)} className="text-xs font-semibold text-sky-500 hover:underline cursor-pointer disabled:opacity-50">{saving || `📁 Download all ${photos.length} to a folder`}</button>
        </div>
      )}
      {view >= 0 && photos[view] && (
        <div className="fixed inset-0 z-[90] bg-black/90 flex items-center justify-center" onClick={() => setView(-1)}>
          <img src={photos[view]} alt="" className="max-w-[92vw] max-h-[86vh] rounded-xl" onClick={(e) => e.stopPropagation()} />
          <p className="absolute top-4 left-1/2 -translate-x-1/2 text-white/80 text-sm font-semibold">{view + 1} / {photos.length}</p>
          <a href={photos[view]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="absolute top-3 right-14 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white">Open ↗</a>
          <button type="button" className="absolute top-3 right-4 text-white text-2xl cursor-pointer">×</button>
          {view > 0 && <button type="button" onClick={(e) => { e.stopPropagation(); setView(view - 1); }} className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white text-2xl cursor-pointer">‹</button>}
          {view < photos.length - 1 && <button type="button" onClick={(e) => { e.stopPropagation(); setView(view + 1); }} className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 text-white text-2xl cursor-pointer">›</button>}
        </div>
      )}
      {err && <p className="text-xs font-bold text-rose-500">{err}</p>}
      <div className="flex gap-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={`Text ${name}…`} className="flex-1 rounded-lg border border-card-border bg-card px-3 py-2 text-sm text-primary resize-y" />
        <button onClick={send} disabled={sending || !text.trim() || !d?.phoneNumberId} className="self-end rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40 cursor-pointer">{sending ? 'Sending…' : 'Send'}</button>
      </div>
    </div>
  );
}

export default function LeadsStep() {
  const { session } = useAuth();
  const token = session?.access_token || '';
  const [chatOpen, setChatOpen] = useState('');
  const [state, setState] = useState(() => {
    try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) return { ...c, loading: true, error: null }; } catch { /* ignore */ }
    return { requests: [], quotes: [], loading: true, error: null };
  });

  const load = useCallback(async (refresh) => {
    if (!token) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await fetch(`/api/jobber-data?action=leads${refresh ? '&refresh=1' : ''}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      setState({ requests: d.requests || [], quotes: d.quotes || [], loading: false, error: null });
      try { localStorage.setItem(CACHE, JSON.stringify({ requests: d.requests || [], quotes: d.quotes || [] })); } catch { /* full */ }
    } catch (e) { setState((s) => ({ ...s, loading: false, error: e.message })); }
  }, [token]);
  useEffect(() => { load(false); }, [load]);

  // Your Quo texts + calls, to see who you've reached out to (matched by phone number).
  const [quo, setQuo] = useState(() => { try { return JSON.parse(localStorage.getItem('hub-leads-quo') || 'null') || []; } catch { return []; } });
  const leadPhones = state.requests.filter((r) => r.status === 'new' && r.phone).map((r) => r.phone).join(',');
  useEffect(() => {
    if (!token || !leadPhones) return;
    fetch('/api/quo?action=contacts', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ phones: leadPhones.split(',') }) })
      .then((r) => r.json()).then((d) => {
        if (!d.results) return;
        setQuo(d.results);
        try { localStorage.setItem('hub-leads-quo', JSON.stringify(d.results)); } catch { /* full */ }
      }).catch(() => {});
  }, [token, leadPhones]);
  const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
  // Since the request came in: did you text/call them, and did they answer?
  const contactOf = (r) => {
    const th = quo.find((t) => last10(t.phone) && last10(t.phone) === last10(r.phone));
    const since = new Date(r.createdAt).getTime() - 864e5;
    const msgs = (th?.messages || []).filter((m) => new Date(m.at).getTime() >= since);
    const mine = msgs.filter((m) => m.dir === 'outgoing');
    if (!mine.length) return { state: 'none' };
    const last = msgs[msgs.length - 1];
    const lastMine = mine[mine.length - 1];
    if (last.dir === 'incoming') return { state: 'replied', tries: mine.length, days: daysAgo(last.at) };
    const unanswered = msgs.filter((m) => m.dir === 'outgoing' && !msgs.some((x) => x.dir === 'incoming' && new Date(x.at) > new Date(m.at)));
    // Different days you reached out with no answer: the "not committed" signal.
    const dayCount = new Set(unanswered.map((m) => new Date(m.at).toLocaleDateString('en-CA'))).size;
    const calls = unanswered.filter((m) => m.call).length;
    return { state: 'noreply', tries: unanswered.length, calls, texts: unanswered.length - calls, dayCount, days: daysAgo(lastMine.at), lastAt: lastMine.at };
  };

  // Let go: archives the request in Jobber (Undo unarchives it). Hidden here right away.
  const [gone, setGone] = useState({});
  const [undo, setUndo] = useState(null);
  const archive = (x, back) => fetch('/api/jobber-data?action=lead-archive', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: x.id, undo: back }) })
    .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); });
  const doLetGo = (x) => {
    setGone((g) => ({ ...g, [x.id]: true }));
    setUndo(x);
    archive(x, false).catch((e) => {
      setGone((g) => { const n = { ...g }; delete n[x.id]; return n; });
      setUndo(null);
      setState((s) => ({ ...s, error: `Couldn't archive ${x.client} in Jobber: ${e.message}` }));
    });
  };
  const undoLetGo = () => {
    const x = undo;
    if (!x) return;
    setUndo(null);
    archive(x, true).then(() => {
      setGone((g) => { const n = { ...g }; delete n[x.id]; return n; });
      load(true);
    }).catch((e) => setState((s) => ({ ...s, error: `Couldn't unarchive ${x.client} in Jobber: ${e.message}` })));
  };
  const isToday = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();

  const reqs = state.requests.filter((r) => !gone[r.id]);
  const overdue = reqs.filter((r) => r.status === 'overdue').sort((a, b) => new Date(a.assessmentAt) - new Date(b.assessmentAt));
  // Only requests with an actual assessment date count as "scheduled". No date yet = still working on them,
  // so they go in the contact groups (haven't reached out / replied / no reply) like a new request.
  const scheduled = reqs.filter((r) => r.assessmentAt && !r.assessed && r.status !== 'overdue' && r.status !== 'new')
    .sort((a, b) => new Date(a.assessmentAt) - new Date(b.assessmentAt));
  const toContact = reqs.filter((r) => r.status === 'new' || (r.status !== 'overdue' && !r.assessed && !r.assessmentAt && ['today', 'upcoming', 'unscheduled'].includes(r.status)))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // longest waiting first
  const changes = state.quotes.filter((q) => q.status === 'changes_requested');
  const drafts = state.quotes.filter((q) => q.status === 'draft');
  const out = state.quotes.filter((q) => q.status === 'awaiting_response').sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));

  const groups0 = [
    ...['none', 'replied', 'noreply'].map((st) => ({ key: `contact-${st}`, title: { none: 'Requests · haven\'t reached out', replied: 'Requests · they replied, your move', noreply: 'Requests · reached out, no reply' }[st], hint: { none: 'call or text these first, longest waiting first', replied: '', noreply: 'try again or let go' }[st], tone: st === 'none' ? 'red' : st === 'replied' ? 'amber' : 'blue', items: toContact.map((r) => ({ ...r, contact: contactOf(r) })).filter((r) => r.contact.state === st).map((r) => ({ ...r, kind: 'req', line: '', age: daysAgo(r.createdAt), ageLabel: 'waiting' })) })),
    { key: 'contact-old', hidden: true, title: 'Requests · need to contact', hint: 'new requests, longest waiting first', tone: 'amber', items: toContact.map((r) => ({ ...r, kind: 'req', line: '', age: daysAgo(r.createdAt), ageLabel: 'waiting' })) },
    { key: 'overdue', byDate: true, title: 'Overdue', hint: 'assessment date passed, not done', tone: 'red', items: overdue.map((r) => ({ ...r, kind: 'req', line: r.assessmentAt ? `Assessment was ${when(r.assessmentAt)}` : '', age: daysAgo(r.assessmentAt), ageLabel: 'late' })) },
    { key: 'scheduled', byDate: true, title: 'Assessments scheduled', tone: 'green', items: scheduled.map((r) => ({ ...r, kind: 'req', line: r.assessmentAt ? when(r.assessmentAt) : 'No date yet', age: null })) },
    { key: 'out', title: 'Quotes out · pending', hint: 'follow up after 3 days', tone: 'blue', items: out.map((q) => ({ ...q, kind: 'quote', age: daysAgo(q.sentAt), ageLabel: 'since sent' })) },
    { key: 'changes', title: 'Quote changes requested', tone: 'amber', items: changes.map((q) => ({ ...q, kind: 'quote', age: daysAgo(q.sentAt || q.createdAt), ageLabel: '' })) },
    { key: 'drafts', title: 'Quotes not sent yet', tone: 'amber', items: drafts.map((q) => ({ ...q, kind: 'quote', age: daysAgo(q.createdAt), ageLabel: 'in draft' })) },
  ];
  // Already tried today with no reply: nothing to do until tomorrow — sink to the bottom.
  const noreply = groups0.find((g) => g.key === 'contact-noreply');
  const triedToday = noreply.items.filter((x) => isToday(x.contact.lastAt));
  noreply.items = [...noreply.items.filter((x) => !isToday(x.contact.lastAt)), ...triedToday.map((x) => ({ ...x, dim: true }))];
  const groups = groups0;
  const toDo = groups.filter((g) => ['contact-none', 'contact-replied', 'contact-noreply', 'overdue'].includes(g.key)).reduce((n, g) => n + g.items.length, 0) - triedToday.length;
  const toneCls = { red: 'text-red-600 dark:text-red-400', amber: 'text-amber-600 dark:text-amber-400', green: 'text-emerald-700 dark:text-emerald-300', blue: 'text-sky-700 dark:text-sky-300', muted: 'text-muted' };

  return (
    <section className="border-y border-card-border bg-card">
      <div className="flex items-center justify-between gap-2 px-4 pt-2">
        <span className={`text-sm font-black ${toDo ? 'text-primary' : 'text-emerald-700 dark:text-emerald-300'}`}>{state.loading && !reqs.length ? '' : toDo ? `${toDo} to do` : 'All caught up ✓'}{triedToday.length > 0 && <span className="ml-2 text-xs font-semibold text-muted">+ {triedToday.length} tried today</span>}</span>
        <button onClick={() => load(true)} disabled={state.loading} title="Refresh from Jobber" className="p-1.5 rounded-lg text-muted hover:text-primary cursor-pointer disabled:opacity-50">
          <RefreshCw size={14} className={state.loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {undo && (
        <div className="mx-4 mt-2 flex items-center justify-between gap-2 rounded-lg bg-surface-alt px-3 py-2 text-sm">
          <span>Archived <b>{undo.client}</b> in Jobber</span>
          <button onClick={undoLetGo} className="font-bold text-brand underline cursor-pointer">Undo</button>
        </div>
      )}
      {state.error && <p className="px-4 py-2 text-sm font-bold text-rose-500">{state.error}</p>}
      <div className="px-4 py-3 max-w-4xl">
        {groups.filter((g) => !g.hidden && g.items.length).map((g) => (
          <div key={g.key} className={`mb-6 min-w-0 ${g.dim ? 'opacity-60' : ''}`}>
            <p className={`text-[11px] font-black uppercase tracking-[0.15em] ${toneCls[g.tone]}`}>{g.title} · {g.items.length}</p>
            {g.hint && <p className="text-[11px] text-muted mb-1">{g.hint}</p>}
            <div className="divide-y divide-card-border">
              {(g.byDate ? g.items : byService(g.items)).map((x) => {
                const svc = serviceOf(`${x.title} ${x.need || ''}`);
                const stale = g.key === 'out' && x.age >= 3;
                const open = chatOpen === x.id;
                return (
                  <Fragment key={x.id}>
                  <div onClick={(e) => { if (x.phone && !e.target.closest('a,button')) setChatOpen(open ? '' : x.id); }} className={`flex items-center gap-3 py-2 ${x.phone ? 'cursor-pointer hover:bg-surface-alt/60 rounded-lg' : ''} ${open ? 'bg-surface-alt/60 rounded-lg' : ''} ${x.dim && !open ? 'opacity-50' : ''}`} title={x.dim ? 'Tried today, nothing to do until tomorrow' : x.phone ? 'Tap to see your chat and reply' : undefined}>
                    <span className={`w-10 h-10 shrink-0 flex items-center justify-center text-3xl leading-none ${svc?.startsWith('🎄') ? 'rounded-full bg-[#B3121F]/10 ring-1 ring-[#B3121F]/30' : svc?.startsWith('💡') ? 'rounded-full bg-amber-400/15 ring-1 ring-amber-500/40' : ''}`} title={svc ? svc.split(' ').slice(1).join(' ') : 'Service not known yet'}>{svc ? svc.split(' ')[0] : '❔'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-primary truncate">
                        {x.client}{x.kind === 'quote' && <span className="ml-1 font-semibold text-muted">#{x.number} · {money(x.total)}</span>}
                      </p>
                      <p className="text-xs text-muted truncate">
                        {x.line || x.need || x.title || <span className="italic">No details, check Jobber</span>}
                      </p>
                      {x.kind === 'req' && x.contact && (() => {
                        const h = Math.floor((Date.now() - new Date(x.createdAt)) / 36e5);
                        const old = h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
                        const last = x.contact.days === 0 ? 'today' : `${x.contact.days}d ago`;
                        const c = x.contact;
                        return (
                          <p className="mt-0.5 text-xs">
                            {c.state === 'none' && <span className="font-black text-red-600 dark:text-red-400">Not contacted · waiting {old}</span>}
                            {c.state === 'noreply' && <><span className="font-black text-primary">{c.tries} {c.tries === 1 ? 'try' : 'tries'}</span><span className="text-muted"> · {c.dayCount} {c.dayCount === 1 ? 'day' : 'days'} · last {last} · requested {old} ago</span></>}
                            {c.state === 'replied' && <span className="font-black text-amber-600 dark:text-amber-400">They replied {last}</span>}
                          </p>
                        );
                      })()}
                      {x.age != null && !(x.kind === 'req' && x.contact) && (
                        <p className={`text-[11px] font-bold ${x.age >= 3 || stale ? 'text-amber-600 dark:text-amber-400' : 'text-muted'}`}>
                          {x.age === 0 ? 'today' : `${x.age}d`} {x.ageLabel}{stale ? ' · follow up' : ''}
                        </p>
                      )}
                    </div>
                    {x.phone && <a href={`openphone://message?number=${encodeURIComponent(`+1${last10(x.phone)}`)}`} title={`Text ${x.phone} in Quo`} className="shrink-0 p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-alt"><MessageSquare size={14} /></a>}
                    {x.kind === 'req' && x.contact?.state === 'noreply' && (
                      <button onClick={() => doLetGo(x)} title="Let go: archive this request in Jobber" className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-muted hover:text-red-600 hover:bg-surface-alt cursor-pointer"><X size={12} />Let go</button>
                    )}
                    {x.kind === 'req' && /^(🎄|💡)/.test(svc || '') && <a href={`/lights-estimate?client=${encodeURIComponent(x.client)}&phone=${encodeURIComponent(x.phone || '')}`} title="Make a price-range page for them" className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-white bg-[#B3121F] hover:brightness-110">$ Range</a>}
                    {x.url && <a href={x.url} target="_blank" rel="noopener noreferrer" title="Open in Jobber" className="shrink-0 p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-alt"><ExternalLink size={14} /></a>}
                  </div>
                  {open && <LeadChat phone={x.phone} name={String(x.client || '').split(' ')[0] || 'them'} token={token} />}
                  </Fragment>
                );
              })}
            </div>
          </div>
        ))}
        {!state.loading && groups.every((g) => !g.items.length) && <p className="text-sm text-muted">No open leads.</p>}
      </div>
    </section>
  );
}
