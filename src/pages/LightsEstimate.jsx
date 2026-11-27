import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { buildShowPrompt } from '../lib/lightsPrompt';
import { Camera, Copy, Check, Sparkles, Trash2, Plus, ExternalLink, MapPin, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { priceOf, prices, EST_RATES, toJpeg, withGrid, fileToDataUrl, listEstimates, getEstimateImages, saveEstimate, removeEstimate, estimateUrl, toggleMyView } from '../lib/lightsEstimate';

// Lights price-range estimate: house photo → Claude guesses the roofline feet → range + 2 mockups (made in Jude's ChatGPT) → private link.
const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', Number.isInteger(Math.round((Number(n) || 0) * 100) / 100) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; // cents only when there are some
const when = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 6e4); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const BLANK = { client: '', phone: '', address: '', lines: [], notes: '', confidence: '' };
const LEVELS = ['easy', 'medium', 'hard'];
const DRAFT_KEY = 'hub-lights-estimate-draft';
const FORM_URL = 'https://estimate.heyjudeschristmaslights.com'; // Squarespace forward -> hub /rough-estimate-form // the C9 roofline lead form (text this to people asking for a price)
const LEVEL_COLOR = { easy: '#22c55e', medium: '#f59e0b', hard: '#ef4444' };
// Spot for a run's number badge: the middle of its traced line.
const midOf = (pts) => {
  if (!pts?.length) return null;
  if (pts.length === 1) return pts[0];
  const seg = pts.slice(1).map((b, i) => ({ a: pts[i], b, d: Math.hypot(b.x - pts[i].x, b.y - pts[i].y) }));
  let left = seg.reduce((t, x) => t + x.d, 0) / 2;
  for (const g of seg) { if (left <= g.d) { const k = g.d ? left / g.d : 0; return { x: g.a.x + (g.b.x - g.a.x) * k, y: g.a.y + (g.b.y - g.a.y) * k }; } left -= g.d; }
  return pts[pts.length - 1];
};

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export default function LightsEstimate() {
  const { orgId } = useAuth();
  const [list, setList] = useState([]);
  const [params] = useSearchParams();
  // Work in progress survives a refresh (kept on this computer until you start a new one).
  const [draft] = useState(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      const ph = String(params.get('phone') || '').replace(/\D/g, '').slice(-10);
      // Opened from a different lead's $ Range button → start fresh for them.
      if (d && (!ph || String(d.est?.phone || '').replace(/\D/g, '').slice(-10) === ph)) return d;
    } catch { /* ignore */ }
    return null;
  });
  const [est, setEst] = useState(() => draft?.est || ({ ...BLANK, client: params.get('client') || '', phone: params.get('phone') || '', address: params.get('address') || '' }));
  const [imgs, setImgs] = useState(() => draft?.imgs || {}); // photo / warm / multi data URLs
  const [dirtyImgs, setDirtyImgs] = useState(() => draft?.dirtyImgs || {});
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ est, imgs, dirtyImgs })); }
      catch { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ est, imgs: {}, dirtyImgs: {} })); } catch { /* full */ } }
    }, 300);
    return () => clearTimeout(t);
  }, [est, imgs, dirtyImgs]);
  const [busy, setBusy] = useState(''); // 'read' | 'warm' | 'multi' | 'save'
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmDel, setConfirmDel] = useState('');
  const [formCopied, setFormCopied] = useState(false);
  const [noTags, setNoTags] = useState(false); // hide the run # dots to see the lines
  const [hot, setHot] = useState(-1); // run highlighted on the photo
  // 'list' = table of everyone; 'edit' = one person's estimate. Opening from a lead's $ Range button (or a draft) goes straight to edit.
  // Always land on the list; an unsaved draft shows as a "Resume" bar instead of opening on its own.
  const [view, setView] = useState(() => (params.get('client') || params.get('phone') ? 'edit' : 'list'));
  const [resumable, setResumable] = useState(() => !params.get('client') && !params.get('phone') && !!draft?.est?.client);
  const [q, setQ] = useState('');
  const [jobber, setJobber] = useState([]); // Jobber clients matching what's typed
  const [jobberBusy, setJobberBusy] = useState(false);
  const jobberCache = useRef({}); // query -> results, so typing more letters filters instantly
  useEffect(() => {
    const t0 = q.trim();
    if (view !== 'list' || t0.length < 2) { setJobber([]); setJobberBusy(false); return undefined; }
    const key = t0.toLowerCase();
    // Show matches right away from a shorter search already done ("kay" → "kay m").
    const words = key.split(/\s+/);
    const hit = (c) => words.every((w) => `${c.name} ${c.address || ''} ${c.phone || ''}`.toLowerCase().includes(w));
    const prev = Object.keys(jobberCache.current).filter((k) => key.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    if (jobberCache.current[key]) { setJobber(jobberCache.current[key]); setJobberBusy(false); return undefined; }
    if (prev) setJobber(jobberCache.current[prev].filter(hit).slice(0, 5));
    setJobberBusy(true);
    let off = false;
    const t = setTimeout(() => {
      fetch(`/api/jobber-data?action=clients&q=${encodeURIComponent(t0)}`).then((r) => (r.ok ? r.json() : [])).then((d) => {
        const res = Array.isArray(d) ? d.slice(0, 8) : [];
        jobberCache.current[key] = res;
        if (!off) { setJobber(res.slice(0, 5)); setJobberBusy(false); }
      }).catch(() => { if (!off) setJobberBusy(false); });
    }, 120);
    return () => { off = true; clearTimeout(t); };
  }, [q, view]);

  const refresh = () => listEstimates().then(setList).catch((e) => setErr(e.message));
  useEffect(() => { refresh(); }, [orgId]); // re-load once the login is ready (the list is account-only)

  const setImg = (k, v) => { setImgs((m) => ({ ...m, [k]: v })); setDirtyImgs((m) => ({ ...m, [k]: v })); };
  const rate = { ...prices(), ...EST_RATES, ...(est.rates || {}) };
  const p = priceOf(est.lines, est.rates);
  const setRate = (k, v) => setEst((e) => ({ ...e, rates: { ...(e.rates || {}), [k]: v.replace(/[^\d.]/g, '') } }));

  const open = async (e) => {
    setResumable(false); setErr(''); setEst(e); setImgs({}); setDirtyImgs({}); setView('edit'); window.scrollTo(0, 0);
    setImgs(await getEstimateImages(e.id));
  };
  const startNew = (prefill = {}) => { setResumable(false); setErr(''); setEst({ ...BLANK, ...prefill }); setImgs({}); setDirtyImgs({}); setView('edit'); setQ(''); window.scrollTo(0, 0); };
  const backToList = () => { setResumable(false); setView('list'); refresh(); try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };
  const fromJobber = (c) => startNew({ client: c.name || '', phone: c.phone || '', email: c.email || '', address: [c.address, c.city, [c.state, c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') });
  const statusOf = (e) => (e.said ? ['✅ Wants consultation', 'text-emerald-600 dark:text-emerald-400']
    : e.declined ? ['❌ Not interested', 'text-rose-500']
    : e.views?.count ? [`👀 Opened ${e.views.count}× · ${ago(e.views.last)}`, 'text-sky-600 dark:text-sky-400']
      : e.token ? ['Sent · not opened', 'text-muted']
        : e.form ? ['📝 New from form', 'text-amber-600 dark:text-amber-400'] : ['Draft', 'text-muted']);

  const pickPhoto = async (file) => {
    if (!file) return;
    setErr('');
    try { setImg('photo', await toJpeg(await fileToDataUrl(file))); setImg('warm', ''); setImg('multi', ''); } catch (e) { setErr(e.message); }
  };

  // Paste a screenshot (⌘V) anywhere on the page = house photo.
  useEffect(() => {
    const onPaste = (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); if (slot) putMockup(slot, f); else pickPhoto(f); } };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // Add just the top ridge (peak across the top) as extra runs, without touching the runs already there.
  const addRidge = async () => {
    setBusy('ridge'); setErr('');
    try {
      const r = await post('/api/lights-measure', { mode: 'estimate', ridgeOnly: true, photo: await withGrid(imgs.photo) });
      const add = (r.lines || []).map((l) => ({ label: l.label || 'Top ridge', feet: Math.round(l.feet), level: 'hard', points: l.points || [] }));
      if (!add.length) setErr('No ridge found in this photo. Use + Add a run.');
      setEst((e) => ({ ...e, lines: [...e.lines, ...add] }));
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  // Like Add top ridge, but for a side of the house: Claude works out that side's runs from the same photo
  // (hidden parts estimated from the house's size). Re-adding a side replaces its runs.
  const SIDE_KEY = { 'Left side': 'left', 'Right side': 'right', Back: 'back' };
  const addSide = async (side) => {
    setBusy(`side:${side}`); setErr('');
    try {
      const r = await post('/api/lights-measure', { mode: 'estimate', sideOnly: SIDE_KEY[side], photo: await withGrid(imgs.photo) });
      const add = (r.lines || []).map((l) => ({ label: `${side} · ${l.label}`, feet: Math.round(l.feet), level: l.level, points: l.points || [] }));
      if (!add.length) setErr(`Couldn't work out the ${side.toLowerCase()}. Use + Add a run.`);
      setEst((e) => ({ ...e, lines: [...e.lines.filter((l) => !String(l.label || '').startsWith(`${side} · `)), ...add], readSides: [...new Set([...(e.readSides || []), side])] }));
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  // What to read when you press Estimate: the front always, plus any of these (picked before reading).
  const PARTS = [['ridge', 'Top ridge'], ['left', 'Left side'], ['right', 'Right side'], ['back', 'Back']];
  const [parts, setParts] = useState(() => { try { return JSON.parse(localStorage.getItem('le-parts') || '{}'); } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem('le-parts', JSON.stringify(parts)); } catch { /* ignore */ } }, [parts]);
  const read = async () => {
    setBusy('read'); setErr('');
    try {
      const photo = await withGrid(imgs.photo);
      const picked = PARTS.filter(([k]) => parts[k]);
      // 2 at a time, each tried twice: firing all 5 at once got some rejected (11-25).
      const jobs = [{ mode: 'estimate', photo }, ...picked.map(([k]) => (k === 'ridge' ? { mode: 'estimate', ridgeOnly: true, photo } : { mode: 'estimate', sideOnly: k, photo }))];
      const out = new Array(jobs.length);
      const failed = [];
      let next = 0;
      const worker = async () => {
        while (next < jobs.length) {
          const i = next++;
          for (let t = 0; t < 2 && !out[i]; t++) {
            try { out[i] = await post('/api/lights-measure', jobs[i]); } catch (e2) { if (t) { if (!i) throw e2; failed.push(picked[i - 1][1]); out[i] = { lines: [] }; } else await new Promise((r) => setTimeout(r, 1500)); }
          }
        }
      };
      await Promise.all([worker(), worker()]);
      const [front, ...extra] = out;
      const lines = front.lines.map((l) => ({ label: l.label, feet: Math.round(l.feet), level: l.level, points: l.points || [] }));
      picked.forEach(([k, name], i) => (extra[i].lines || []).forEach((l) => lines.push(k === 'ridge'
        ? { label: l.label || 'Top ridge', feet: Math.round(l.feet), level: 'hard', points: l.points || [] }
        : { label: `${name} · ${l.label}`, feet: Math.round(l.feet), level: l.level, points: l.points || [] })));
      const readSides = picked.filter(([k, name]) => k !== 'ridge' && !failed.includes(name)).map(([, name]) => name);
      setEst((e) => ({ ...e, lines, notes: [front.notes, ...extra.map((x) => x.notes)].filter(Boolean).join(' '), confidence: front.confidence, readSides }));
      if (failed.length) setErr(`Couldn't read: ${failed.join(', ')}. Tap its Add button below to try again.`);
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  // Mockups are made in Jude's own ChatGPT: copy the prompt + download the photo, then drop the results back here.
  const [slot, setSlot] = useState(''); // mockup box that ⌘V pastes into
  const [copiedPrompt, setCopiedPrompt] = useState('');
  const hasLines = est.lines.some((l) => l.points?.length > 1);
  // ChatGPT gets 2 photos: the clean one (it edits this) + the same photo with the runs drawn in magenta (where the lights go).
  const GUIDE_NOTE = `

I'm attaching 2 photos of the same house: the clean photo (edit this one) and a lines photo where every roofline that gets lights is traced in bright magenta. Put the lights exactly on those magenta lines and nowhere else. Leave every roofline without a magenta line dark. No magenta in the result.`;
  const copyPrompt = async (k) => { await navigator.clipboard.writeText(buildShowPrompt(k, '', 1) + (hasLines ? GUIDE_NOTE : '')); setCopiedPrompt(k); setTimeout(() => setCopiedPrompt(''), 2500); };
  const fileBase = (est.client || 'house').replace(/[^a-z0-9]+/gi, '-');
  const downloadLines = () => new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      g.strokeStyle = '#ff00ff'; g.lineWidth = Math.max(4, Math.round(img.width / 180)); g.lineCap = 'round'; g.lineJoin = 'round';
      for (const l of est.lines) {
        if (!(l.points?.length > 1)) continue;
        g.beginPath();
        l.points.forEach((q, i) => { const x = (q.x / 1000) * c.width; const y = (q.y / 1000) * c.height; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      }
      const a = document.createElement('a'); a.href = c.toDataURL('image/jpeg', 0.92); a.download = `${fileBase}-lines.jpg`; a.click(); ok();
    };
    img.src = imgs.photo;
  });
  const putMockup = async (k, file) => { if (!file) return; try { setImg(k, await toJpeg(await fileToDataUrl(file))); } catch (e) { setErr(e.message); } };

  const save = async () => {
    setBusy('save'); setErr('');
    try {
      const saved = await saveEstimate({ ...est, low: p.low, high: p.high, est: p.est, feet: p.total }, dirtyImgs, orgId);
      setEst(saved); setDirtyImgs({}); refresh();
      return saved;
    } catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  };

  // Once a link exists, price changes save themselves so the client's page always shows the current range.
  const [autoSaved, setAutoSaved] = useState('');
  // New ones save themselves too, as soon as they have a name + photo (refreshing used to lose them: Kay, 11-25).
  useEffect(() => {
    if (view !== 'edit' || busy === 'save') return undefined;
    const isNew = !est.id || !est.token;
    if (isNew ? !(est.client.trim() && imgs.photo) : !est.lines.length && !Object.keys(dirtyImgs).length) return undefined;
    const t = setTimeout(async () => {
      try {
        const pics = dirtyImgs;
        const saved = await saveEstimate({ ...est, low: p.low, high: p.high, est: p.est, feet: p.total }, pics, orgId);
        setEst((cur) => ({ ...cur, id: saved.id, token: saved.token, createdAt: saved.createdAt, has: saved.has, low: saved.low, high: saved.high, updatedAt: saved.updatedAt }));
        setDirtyImgs((d) => Object.fromEntries(Object.entries(d).filter(([k, v]) => pics[k] !== v)));
        setAutoSaved(est.lines.length ? `Saved · their page shows ${money(p.low)}–${money(p.high)}` : 'Saved');
        refresh();
      } catch (e) { setErr(`Auto-save failed: ${e.message}`); }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [est.lines, est.rates, est.client, est.phone, est.address, imgs.photo, dirtyImgs]);

  // Saves if needed, then opens their page in preview mode (not counted as an open).
  const openPreview = async () => {
    const w = window.open('', '_blank'); // open now so the browser doesn't block it after the save
    const saved = Object.keys(dirtyImgs).length || !est.token ? await save() : est;
    if (!saved?.token) { w?.close(); return; }
    // Same link the client gets: this device is logged into the Hub, so the page knows not to count it.
    if (w) w.location.href = `/estimate/${saved.token}`;
    else window.location.href = `/estimate/${saved.token}`;
  };

  const copyLink = async () => {
    const saved = Object.keys(dirtyImgs).length || !est.token ? await save() : est;
    if (!saved?.token) return;
    await navigator.clipboard.writeText(estimateUrl(saved.token));
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  const editLine = (i, patch) => setEst((e) => ({ ...e, lines: e.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const phone10 = String(est.phone || '').replace(/\D/g, '').slice(-10);
  const field = 'w-full rounded-lg border border-card-border bg-surface px-3 py-2 text-sm text-primary';

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-black text-primary">🎄 Lights estimate</h1>
          <p className="text-xs text-muted">One photo → price range + mockups → private link to text them. Range is −10% / +10% of your quoter $/ft ({money(rate.minimum)} min).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={async () => { await navigator.clipboard.writeText(FORM_URL); setFormCopied(true); setTimeout(() => setFormCopied(false), 2500); }} title={FORM_URL} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white cursor-pointer">{formCopied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy form link</>}</button>
          <a href="/rough-estimate-form" target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-surface-alt px-3 py-2 text-sm font-bold text-primary"><ExternalLink size={14} /> Form</a>
          {view === 'edit' && <button onClick={backToList} className="flex items-center gap-1 rounded-lg bg-surface-alt px-3 py-2 text-sm font-bold text-primary cursor-pointer">← All</button>}
        </div>
      </div>

      {err && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm font-bold text-rose-500">{err}</p>}

      {view === 'list' && (() => {
        const t0 = q.trim().toLowerCase();
        const rows = list.filter((e) => !t0 || `${e.client} ${e.address || ''} ${e.phone || ''}`.toLowerCase().includes(t0));
        const known = new Set(list.map((e) => String(e.client || '').toLowerCase()));
        return (
          <div className="space-y-3">
            {resumable && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5">
                <p className="text-sm text-primary">Unfinished: <b>{est.client}</b>{est.address ? <span className="text-tertiary"> · {est.address}</span> : null}</p>
                <button onClick={() => { setResumable(false); setView('edit'); window.scrollTo(0, 0); }} className="shrink-0 rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-bold text-black cursor-pointer">Resume</button>
              </div>
            )}
            <div className="relative">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && q.trim() && !rows.length) startNew({ client: q.trim() }); }}
                placeholder="Type a name to find someone or add a new person…" className="w-full rounded-xl border border-card-border bg-card px-4 py-3 text-base text-primary" />
            </div>
            {q.trim().length >= 2 && (
              <div className="rounded-xl border border-card-border bg-card divide-y divide-card-border">
                {jobber.filter((c) => !known.has(String(c.name || '').toLowerCase())).map((c) => (
                  <button key={c.id} onClick={() => fromJobber(c)} className="w-full text-left px-4 py-2.5 hover:bg-surface-alt cursor-pointer">
                    <p className="text-sm font-bold text-primary">+ {c.name} <span className="font-normal text-muted">from Jobber</span></p>
                    <p className="text-xs text-muted truncate">{[c.address, c.city].filter(Boolean).join(', ')}{c.phone ? ` · ${c.phone}` : ''}</p>
                  </button>
                ))}
                {jobberBusy && !jobber.length && <p className="px-4 py-2.5 text-sm text-muted animate-pulse">Searching Jobber…</p>}
                <button onClick={() => startNew({ client: q.trim() })} className="w-full text-left px-4 py-2.5 hover:bg-surface-alt cursor-pointer text-sm font-bold text-[#B3121F]">+ Add “{q.trim()}” as new</button>
              </div>
            )}
            <div className="rounded-xl border border-card-border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-card-border">
                  <th className="px-4 py-2 font-black">Name</th><th className="px-3 py-2 font-black">Address</th><th className="px-3 py-2 font-black">Status</th><th className="px-3 py-2 font-black">Range</th><th className="px-3 py-2 font-black">Added</th><th />
                </tr></thead>
                <tbody className="divide-y divide-card-border">
                  {rows.map((e) => { const [st, cls] = statusOf(e); return (
                    <tr key={e.id} onClick={() => open(e)} className="hover:bg-surface-alt cursor-pointer">
                      <td className="px-4 py-2.5 font-bold text-primary whitespace-nowrap">{e.client || 'No name'}</td>
                      <td className="px-3 py-2.5 text-muted max-w-[220px] truncate">{String(e.address || '').split(',')[0]}</td>
                      <td className={`px-3 py-2.5 whitespace-nowrap font-semibold ${cls}`}>{st}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-primary">{e.low ? `${money(e.low)}–${money(e.high)}` : '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted">{e.createdAt ? ago(e.createdAt) : ''}</td>
                      <td className="px-2 py-2.5 text-right" onClick={(x) => x.stopPropagation()}>
                        {confirmDel === e.id
                          ? <button onClick={() => { setConfirmDel(''); removeEstimate(e, orgId).then(refresh); }} className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white cursor-pointer">Remove?</button>
                          : <button onClick={() => setConfirmDel(e.id)} title="Remove (their link stops working)" className="p-1 text-muted hover:text-rose-500 cursor-pointer"><Trash2 size={13} /></button>}
                      </td>
                    </tr>
                  ); })}
                  {!rows.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">{list.length ? 'Nobody matches. Press Enter or tap “Add” above.' : 'Nobody yet. Type a name above, or send the form link.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {view === 'edit' && (
      <div className="grid gap-4 md:grid-cols-[1fr_280px]">
        <div className="space-y-4 min-w-0">
          {/* 1. Who */}
          {est.form && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-primary">
              <b>📝 From the form:</b> {(est.sides || []).join(', ') || 'Front'} · {est.color || 'Not sure'}{est.more?.length ? ` · Also wants: ${est.more.join(', ')}` : ''}{est.heard ? ` · Heard about us: ${est.heard}` : ''}
              {est.jobberRequestUrl ? <a href={est.jobberRequestUrl} target="_blank" rel="noreferrer" className="ml-2 font-semibold text-sky-600 dark:text-sky-400">Jobber request ↗</a> : est.jobberError ? <span className="ml-2 text-rose-500">Jobber request failed: {est.jobberError}</span> : null}
              {(est.sides || []).some((x) => x !== 'Front') && <p className="mt-1 text-xs text-muted">They want more than the front: add the other sides' runs by hand (Claude only sees the photo).</p>}
            </div>
          )}
          <div className="rounded-xl border border-card-border bg-card p-4 grid gap-2 sm:grid-cols-3">
            <input className={field} placeholder="Client name" value={est.client} onChange={(e) => setEst({ ...est, client: e.target.value })} />
            <input className={field} placeholder="Phone" value={est.phone} onChange={(e) => setEst({ ...est, phone: e.target.value })} />
            <input className={field} placeholder="Address" value={est.address} onChange={(e) => setEst({ ...est, address: e.target.value })} />
          </div>

          {/* 2. Photo */}
          <div className="rounded-xl border border-card-border bg-card p-4 space-y-3" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pickPhoto([...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'))); }}>
            {!imgs.photo && <p className="text-xs text-muted">Drag a photo here, paste a screenshot (⌘V), or tap Add house photo.</p>}
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 rounded-lg bg-surface-alt px-3 py-2 text-sm font-bold text-primary cursor-pointer">
                <Camera size={15} /> {imgs.photo ? 'Change photo' : 'Add house photo'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
              </label>
              {est.address && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(est.address)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm font-semibold text-sky-600 dark:text-sky-400">
                  <MapPin size={14} /> Street View (screenshot the front)
                </a>
              )}
              {est.address && (
                <a href={`https://earth.google.com/web/search/${encodeURIComponent(est.address)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm font-semibold text-sky-600 dark:text-sky-400">
                  🌎 Google Earth
                </a>
              )}
              {imgs.photo && (
                <div className="w-full flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted mr-1">Read:</span>
                  <span className="rounded-full bg-emerald-600/15 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">✓ Front</span>
                  {PARTS.map(([k, name]) => (
                    <button key={k} type="button" onClick={() => setParts((p0) => ({ ...p0, [k]: !p0[k] }))} disabled={!!busy}
                      className={`rounded-full px-3 py-1 text-xs font-bold cursor-pointer disabled:opacity-50 ${parts[k] ? 'bg-emerald-600 text-white' : 'bg-surface-alt text-secondary'}`}>{parts[k] ? '✓' : '+'} {name}</button>
                  ))}
                </div>
              )}
              {imgs.photo && <button onClick={read} disabled={!!busy} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white cursor-pointer disabled:opacity-50"><Sparkles size={14} /> {busy === 'read' ? 'Reading roofline…' : est.lines.length ? 'Re-read photo' : 'Estimate from photo'}</button>}
              {imgs.photo && est.lines.length > 0 && <button onClick={addRidge} disabled={!!busy} title="Adds the peak across the very top of the roof (rated hard)" className="flex items-center gap-1.5 rounded-lg bg-surface-alt px-3 py-2 text-sm font-bold text-primary cursor-pointer disabled:opacity-50"><Plus size={14} /> {busy === 'ridge' ? 'Finding ridge…' : 'Add top ridge'}</button>}
              {imgs.photo && est.lines.length > 0 && ['Left side', 'Right side', 'Back'].map((side) => (
                <button key={side} onClick={() => addSide(side)} disabled={!!busy} title={`Adds the ${side.toLowerCase()}'s rooflines, worked out from this photo (hidden parts estimated)`}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold cursor-pointer disabled:opacity-50 ${est.readSides?.includes(side) ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400' : 'bg-surface-alt text-primary'}`}>
                  {est.readSides?.includes(side) ? '✓' : <Plus size={14} />} {busy === `side:${side}` ? `Finding ${side.toLowerCase()}…` : `Add ${side.toLowerCase()}`}
                </button>
              ))}
            </div>
            {imgs.photo && (
              <div className="relative rounded-lg overflow-hidden bg-black">
                <img src={imgs.photo} alt="" className="w-full block" />
                <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                  {est.lines.map((l, i) => (l.points?.length > 1 ? (
                    <polyline key={i} points={l.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={LEVEL_COLOR[l.level] || '#fff'} strokeWidth={hot === i ? 7 : 4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={hot === -1 || hot === i ? 1 : 0.35} />
                  ) : null))}
                </svg>
                {!noTags && est.lines.map((l, i) => { const m = midOf(l.points); return m ? (
                  <button key={i} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(-1)} onClick={() => setHot(hot === i ? -1 : i)}
                    title={`Run ${i + 1} · ${l.feet} ft`}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full text-[10px] font-black text-white shadow cursor-pointer whitespace-nowrap ring-1 ring-white/80 ${hot === i ? 'px-1.5 py-0.5 z-10' : 'w-[18px] h-[18px] leading-[18px] text-center opacity-80'}`}
                    style={{ left: `${m.x / 10}%`, top: `${m.y / 10}%`, background: LEVEL_COLOR[l.level] || '#333' }}>
                    {hot === i ? `${i + 1} · ${l.feet} ft` : i + 1}
                  </button>
                ) : null; })}
                {est.lines.some((l) => l.points?.length) && (
                  <button onClick={() => setNoTags((v) => !v)} className="absolute top-2 right-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-bold text-white cursor-pointer">{noTags ? 'Show #s' : 'Hide #s'}</button>
                )}
              </div>
            )}
            {['x1', 'x2', 'x3'].some((k) => imgs[k]) && (
              <div>
                <p className="text-[11px] text-muted mb-1">Their other photos. Tap one to use it as the main photo:</p>
                <div className="flex gap-2">
                  {['x1', 'x2', 'x3'].filter((k) => imgs[k]).map((k) => (
                    <button key={k} onClick={() => { const main = imgs.photo; setImg('photo', imgs[k]); setImg(k, main); }} className="w-20 h-20 rounded-lg overflow-hidden ring-1 ring-card-border cursor-pointer"><img src={imgs[k]} alt="" className="w-full h-full object-cover" /></button>
                  ))}
                </div>
              </div>
            )}
            {est.lines.some((l) => !(l.points?.length > 1)) && (
              <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-primary">
                <b>Not in this photo (added from the sides/back):</b>{' '}
                {est.lines.map((l, i) => ({ l, i })).filter(({ l }) => !(l.points?.length > 1)).map(({ l, i }) => `#${i + 1} ${l.label} ${l.feet} ft`).join(' · ')}
              </div>
            )}
            {est.lines.some((l) => l.points?.length > 1) && <p className="text-[11px] text-muted">Each dot = <b>run #</b> (matches the list below); hover it for the feet. <b>Hide #s</b> to see just the lines. Lines are where Claude thinks each run is. <span style={{ color: LEVEL_COLOR.easy }}>■</span> easy <span style={{ color: LEVEL_COLOR.medium }}>■</span> medium <span style={{ color: LEVEL_COLOR.hard }}>■</span> hard</p>}
          </div>

          {/* 3. Lines */}
          {est.lines.length > 0 && (
            <div className="rounded-xl border border-card-border bg-card p-4 space-y-2">
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-muted">Roofline · {p.total} ft {est.confidence && <span className={est.confidence === 'low' ? 'text-amber-600' : ''}>· {est.confidence} confidence</span>}</p>
              {est.lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2" onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(-1)}>
                  <span className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black text-white" style={{ background: LEVEL_COLOR[l.level] || '#333' }}>{i + 1}</span>
                  <input className={`${field} !w-auto min-w-0 flex-1`} value={l.label} onChange={(e) => editLine(i, { label: e.target.value })} />
                  <input className={`${field} !w-16 shrink-0 text-right`} inputMode="numeric" value={l.feet} onChange={(e) => editLine(i, { feet: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                  <span className="text-xs text-muted">ft</span>
                  <select className={`${field} !w-24 shrink-0`} value={l.level} onChange={(e) => editLine(i, { level: e.target.value })}>{LEVELS.map((x) => <option key={x}>{x}</option>)}</select>
                  <span className="w-16 shrink-0 text-right text-sm font-bold text-primary tabular-nums">{money((Number(l.feet) || 0) * Number(rate[l.level] || 0))}</span>
                  <button onClick={() => setEst((e) => ({ ...e, lines: e.lines.filter((_, j) => j !== i) }))} className="p-1.5 text-muted hover:text-rose-500 cursor-pointer"><Trash2 size={14} /></button>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 border-t border-card-border pt-2">
                <button onClick={() => setEst((e) => ({ ...e, lines: [...e.lines, { label: 'Extra run', feet: 20, level: 'easy' }] }))} className="text-sm font-semibold text-sky-600 dark:text-sky-400 cursor-pointer">+ Add a run</button>
                <p className="text-sm font-black text-primary tabular-nums">{p.total} ft · Total {money(p.est)}{p.est > p.feet.easy * rate.easy + p.feet.medium * rate.medium + p.feet.hard * rate.hard ? ` (${money(rate.minimum)} min)` : ''} <span className="font-semibold text-muted">· they see {money(p.low)}–{money(p.high)}</span></p>
              </div>
              {est.notes && <p className="text-xs text-muted italic">{est.notes}</p>}
            </div>
          )}

          {/* 4. Mockups */}
          {imgs.photo && (
            <div className="rounded-xl border border-card-border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.15em] text-muted">Mockups · made in your ChatGPT</p>
                <button onClick={async () => { const a = document.createElement('a'); a.href = imgs.photo; a.download = `${fileBase}-photo.jpg`; a.click(); if (hasLines) { await new Promise((r) => setTimeout(r, 400)); await downloadLines(); } }}
                  title="Downloads the clean photo and the photo with the lights lines drawn on it" className="flex items-center gap-1 rounded-lg bg-surface-alt px-3 py-2 text-sm font-bold text-primary cursor-pointer"><Download size={14} /> {hasLines ? 'Download both photos' : 'Download photo'}</button>
              </div>
              <p className="text-xs text-muted">1. Download both photos · 2. Copy a prompt and paste it in ChatGPT with both photos · 3. Drag the result into its box (or click the box, then ⌘V).</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {['warm', 'multi'].map((k) => (
                  <div key={k} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-primary">{k === 'warm' ? 'Warm white' : 'Multicolor'}</p>
                      <button onClick={() => copyPrompt(k)} className="flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-sky-400 cursor-pointer">{copiedPrompt === k ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy prompt</>}</button>
                    </div>
                    <div onClick={() => setSlot(k)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); putMockup(k, [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'))); }}
                      className={`block rounded-lg cursor-pointer ${slot === k ? 'ring-2 ring-sky-500' : ''}`}>
                      {imgs[k] ? <img src={imgs[k]} alt="" className="w-full rounded-lg" /> : <div className="aspect-video rounded-lg border-2 border-dashed border-card-border bg-surface-alt flex items-center justify-center text-center px-3 text-xs text-muted">{slot === k ? 'Press ⌘V to paste, or drop the image here' : 'Drop ChatGPT image here'}</div>}
                    </div>
                    <label className="mr-3 text-xs font-semibold text-sky-600 dark:text-sky-400 cursor-pointer">Choose file<input type="file" accept="image/*" className="hidden" onChange={(e) => putMockup(k, e.target.files?.[0])} /></label>
                    {imgs[k] && <button onClick={() => setImg(k, '')} className="text-xs font-semibold text-muted hover:text-rose-500 cursor-pointer">Remove</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Price + link */}
        <div className="space-y-3">
          <div className="rounded-xl border border-card-border bg-card p-4 space-y-2 md:sticky md:top-4">
            <p className="text-[11px] font-black uppercase tracking-[0.15em] text-muted">Their range</p>
            <p className="text-3xl font-black text-primary">{est.lines.length ? `${money(p.low)}–${money(p.high)}` : '—'}</p>
            {est.lines.length > 0 && p.total > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-surface-alt px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Total feet</p><p className="text-xl font-black text-primary">{Math.round(p.total)} ft</p></div>
                <div className="rounded-lg bg-surface-alt px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-muted">We get per ft</p><p className="text-xl font-black text-brand-text">${(p.est / p.total).toFixed(2)}</p><p className="text-[10px] text-muted">${(p.low / p.total).toFixed(2)}–${(p.high / p.total).toFixed(2)} range</p></div>
              </div>
            )}
            {est.lines.length > 0 && (
              <div className="text-xs text-muted space-y-0.5 tabular-nums">
                {LEVELS.map((lv) => (
                  <p key={lv} className="flex justify-between gap-2"><span className="flex items-center gap-1"><span style={{ color: LEVEL_COLOR[lv] }}>■</span> {lv} {p.feet[lv]} ft × $<input value={rate[lv]} onChange={(e) => setRate(lv, e.target.value)} inputMode="decimal" className="w-10 rounded border border-card-border bg-surface px-1 text-primary text-right" />/ft</span><span>{money(p.feet[lv] * Number(rate[lv]))}</span></p>
                ))}
                <p className="flex justify-between gap-2 border-t border-card-border pt-0.5 font-bold text-primary"><span>Estimate{p.est > p.feet.easy * rate.easy + p.feet.medium * rate.medium + p.feet.hard * rate.hard ? ` (${money(rate.minimum)} min)` : ''}</span><span>{money(p.est)}</span></p>
                <p className="flex items-center gap-1">Minimum $<input value={rate.minimum} onChange={(e) => setRate('minimum', e.target.value)} inputMode="decimal" className="w-12 rounded border border-card-border bg-surface px-1 text-primary text-right" /></p>
                <p>Range = −10% / +10%. Default $7 / $9 / $10 per ft; edits here only change this estimate.</p>
              </div>
            )}
            <button onClick={save} disabled={busy === 'save' || !est.client} className="w-full rounded-lg bg-surface-alt px-3 py-2 text-sm font-bold text-primary cursor-pointer disabled:opacity-50">{busy === 'save' ? (Object.keys(dirtyImgs).length ? 'Saving photos… (a few seconds)' : 'Saving…') : 'Save'}</button>
            {/* One link: copy it to text them, or open it here (your own devices never count as them opening it) */}
            <div className="flex gap-2">
              <button onClick={copyLink} disabled={!est.client || !est.lines.length || !!busy} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white cursor-pointer disabled:opacity-50">{copied ? <><Check size={14} /> Link copied</> : <><Copy size={14} /> Copy their link</>}</button>
              <button onClick={openPreview} disabled={!est.client || !est.lines.length || !!busy} title="Open their page (doesn't count as them opening it)" className="flex items-center justify-center gap-1 rounded-lg border border-card-border bg-surface-alt px-3 py-2 text-sm font-bold text-primary cursor-pointer disabled:opacity-50"><ExternalLink size={14} /> Open</button>
            </div>
            {est.token && autoSaved && <p className="text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ {autoSaved}</p>}
            {est.token && (() => {
              const vw = list.find((x) => x.id === est.id)?.views;
              const mine = (vw?.list || []).filter((x) => x.me).length;
              if (!vw?.count && !mine) return <p className="text-center text-xs text-muted">👀 Not opened yet</p>;
              const all = [...(vw.list || [])].reverse();
              const theirs = all.filter((x) => !x.me);
              const yours = all.filter((x) => x.me);
              // The estimate page saves a random device tag (hj-vid) in each browser; same tag here = this exact browser.
              let myVid = '';
              try { myVid = localStorage.getItem('hj-vid') || ''; } catch { /* ignore */ }
              // Your other devices: any tag that's been marked "you" on any estimate.
              const myVids = new Set(list.flatMap((e) => (e.views?.list || []).filter((v) => v.me && v.vid).map((v) => v.vid)));
              const isPhone = (x) => /iphone|android|ipad/i.test(`${x.device} ${x.os}`);
              // One tag = one browser. If a tag was ever seen as a computer, its "phone" opens were Chrome's phone preview.
              const realDevice = {};
              list.forEach((e) => (e.views?.list || []).forEach((v) => { if (v.vid && !isPhone(v)) realDevice[v.vid] = v.device; }));
              const deviceOf = (x) => realDevice[x.vid] || x.device;
              const previewed = (x) => isPhone(x) && !!realDevice[x.vid];
              const nameOf = (x) => {
                const d = deviceOf(x); const icon = isPhone({ device: d }) ? '📱' : '💻';
                if (myVid && x.vid === myVid) return `${icon} This ${icon === '📱' ? 'phone' : 'computer'}`;
                if (myVids.has(x.vid)) return `${icon} Your ${d}`;
                return `${icon} ${d}`;
              };
              const table = (rows) => (
                <table className="w-full table-fixed text-[11px]">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted"><th className="w-[58px] py-1 font-semibold">When</th><th className="py-1 font-semibold">Device</th><th className="w-[52px] py-1 font-semibold text-right">Who</th></tr></thead>
                  <tbody>{rows.map((x) => {
                    return (
                      <tr key={x.at} onClick={() => toggleMyView(est.id, x.at, orgId).then(refresh)} title={`${when(x.at)} · tag #${x.vid || '?'}${x.os ? ` · ${x.os}` : ''} · tap to switch You/Them`} className="border-t border-sky-500/15 cursor-pointer hover:bg-sky-500/10 align-top">
                        <td className="py-1.5 whitespace-nowrap">{ago(x.at)}</td>
                        <td className="py-1.5 pr-1">
                          <span className="block font-semibold truncate">{nameOf(x)}{x.app ? <span className="font-normal text-muted"> · {x.app}</span> : null}</span>
                          <span className="block text-[10px] text-muted truncate">{previewed(x) ? 'phone preview in Chrome' : x.city || 'no city'}</span>
                        </td>
                        <td className="py-1.5 text-right"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${x.me ? 'bg-surface-alt text-muted' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'}`}>{x.me ? 'You' : 'Them'}</span></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              );
              return (
                <div className="rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-primary space-y-1">
                  <p className="text-sm font-bold">{vw.count ? `👀 They opened it ${vw.count}×` : '👀 They haven’t opened it yet'}</p>
                  {theirs.length > 0 && <div className="max-h-48 overflow-auto">{table(theirs)}</div>}
                  {yours.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-[11px] text-muted py-1">Your own opens ({yours.length}) · not counted</summary>
                      <div className="max-h-40 overflow-auto opacity-70">{table(yours)}</div>
                    </details>
                  )}
                  <p className="text-[10px] text-muted">Wrong? Tap a row to switch it between You and Them.</p>
                </div>
              );
            })()}
            {est.token && phone10.length === 10 && <a href={`openphone://message?number=%2B1${phone10}`} className="block text-center text-sm font-semibold text-sky-600 dark:text-sky-400">Open their Quo chat</a>}
            {est.said && <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">✅ They want the exact quote{est.said.color ? ` (${est.said.color === 'warm' ? 'warm white' : 'multicolor'})` : ''}</p>}
          </div>

        </div>
      </div>
      )}
    </div>
  );
}
