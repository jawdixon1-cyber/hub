import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, ShoppingCart, ImagePlus, ExternalLink, Phone, MessageSquare, Pencil } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';
import { Link } from 'react-router-dom';
import { PlanOverlay, OutletMarks } from './LightsMarkup';
import { supabase } from '../lib/supabase';
import { STARTER_SUPPLIES, STYLE_LABEL, quoteMaterials, quoteFeet, packPlan } from '../lib/lightsMaterials';
import { listQuotes, getQuote, patchQuoteMeta, referLinks, referInbox, makeReferLink, markReferAdded } from '../lib/lightsStore';
import { useJobberList, nameKey } from '../lib/jobberLights';

// The business side of Christmas lights, shown inside the Lights page:
//  - "quotes": every saved lights quote — sent / won / installed / lost,
//    $ out, follow-ups, close rate, material cost and profit per job.
//  - "supplies": stock on hand vs committed to won jobs, low warnings, and a
//    pack-size order list (logic adapted from the Light Install Tracker app).

const money = (v) => `$${Math.round(v || 0).toLocaleString('en-US')}`;
const n = (v) => Number(v) || 0;
const daysAgo = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);
const FOLLOW_UP_DAYS = 3;

const statusOf = (q) => q.status || 'draft';
const LAW_URL = 'https://lightsatwholesale.com';
// Supplier buttons on the Supplies page (first = default store).
const SUPPLIERS = [
  ['Lights at Wholesale', LAW_URL],
  ['Bulk Christmas Lights', 'https://bulkchristmaslights.com'],
];
// Where to reorder an item: its saved product page, or a Lights at Wholesale search.
const orderUrl = (it) => it.url || `${LAW_URL}/search?q=${encodeURIComponent(it.name || '')}`;
// Lights at Wholesale (Shopify) cart link: /cart/<variant>:<qty>,… fills the cart
// in one click. Each supply's `cart` = [{ size, id }] (store options, big → small).
function cartLines(it, need) {
  const vs = [...(it?.cart || [])].filter((v) => v.id && v.size > 0).sort((a, b) => b.size - a.size).slice(0, 2);
  if (!vs.length || need <= 0) return [];
  const [big, small] = vs;
  if (!small) return [[big.id, Math.ceil(need / big.size - 1e-9)]];
  let c = Math.floor(need / big.size);
  let k = Math.ceil((need - c * big.size) / small.size - 1e-9);
  if (k * small.size >= big.size) { c += 1; k = 0; }
  return [[big.id, c], [small.id, k]].filter(([, q]) => q > 0);
}
const CART_CODE = 'INSTALLER18';

// When an on-the-way order should land: its Arrives date, else ordered Mon–Fri →
// 4 days later; ordered Sat/Sun → ships Monday, lands Thursday (Mon = day 1 of 4).
function orderLandsOn(o) {
  const day = (iso) => (iso ? new Date(String(iso).length <= 10 ? `${iso}T12:00:00` : iso) : null);
  if (o?.eta) return day(o.eta);
  const x = day(o?.date) || new Date(); const dow = x.getDay();
  if (dow === 6 || dow === 0) x.setDate(x.getDate() + (dow === 6 ? 2 : 1) + 3);
  else x.setDate(x.getDate() + 4);
  return x;
}

// Supply sections, worked out from the item name.
// Install order: what you grab first goes first.
const CATS = [['bulb', 'Bulbs'], ['clip', 'Clips'], ['stake', 'Stakes'], ['wire', 'C9 socket wire'], ['zip', 'Zip cord'], ['plugs', 'Plugs'], ['plug', 'Gilbert One plugs'], ['timer', 'Timers'], ['strand', 'Mini strands'], ['other', 'Other']];
const catOf = (it) => {
  const name = it?.name || '';
  // Order matters: "Mini (Green Wire)" is a strand and "Plugs SPT-1" is a plug, not wire.
  if (/plug/i.test(name)) return /female|\bmale\b/i.test(name) ? 'plugs' : 'plug';
  if (/timer/i.test(name)) return 'timer';
  if (/mini|strand/i.test(name)) return 'strand';
  if (/stake/i.test(name)) return 'stake';
  if (/clip|shingle tab/i.test(name)) return 'clip';
  if (/\bc[79]\b|bulb/i.test(name) && !/wire|socket/i.test(name)) return 'bulb';
  if (/zip/i.test(name)) return 'zip';
  if (/wire|cord|spt/i.test(name)) return 'wire';
  return 'other';
};

// Order inside a section: bulbs = warm white, multicolor, then colors; timers before strands.
const rankIn = (cat, it) => (cat === 'bulb'
  ? (/warm white/i.test(it.name) ? 0 : /multi/i.test(it.name) ? 1 : 2)
  : cat === 'wire' ? (/socket/i.test(it.name) ? 0 : /zip/i.test(it.name) ? 1 : 2) // sockets together, then zips
  : cat === 'plug' ? (/female/i.test(it.name) ? 1 : /male/i.test(it.name) ? 0 : 2) // male, female, then others
  : cat === 'plugs' ? (/black/i.test(it.name) ? 0 : 2) + (/female/i.test(it.name) ? 1 : 0) // black male, black female, then green male, green female
  : cat === 'clip' ? (/white/i.test(it.name) ? 0 : /black/i.test(it.name) ? 10 : 20) // white clips together, then black, then the rest (all-in-one, magnet)
    + (/shingle tab/i.test(it.name) && /white/i.test(it.name) ? -1 : /best clip/i.test(it.name) ? 0 : /flex/i.test(it.name) ? 1 : /shingle tab/i.test(it.name) ? 2 : 3) // white tab first (most used), then gutter clips, shingle tabs, O clips
  : /timer/i.test(it.name) ? 0 : 1);
// Supplies grouped + ordered the same way everywhere: [[cat, label, items], ...]
const groupSupplies = (list) => CATS
  .map(([cat, label]) => [cat, label, list.filter((it) => catOf(it) === cat).sort((a, b) => (rankIn(cat, a) - rankIn(cat, b)) || String(a.name).localeCompare(String(b.name)))])
  .filter(([, , its]) => its.length);

// Every install needs one of each of these. Matched by item name.
const MUST_HAVE = [
  ['Bulbs', (it) => catOf(it) === 'bulb'],
  ['Clips', (it) => catOf(it) === 'clip'],
  ['Socket wire', (it) => /socket\s*wire/i.test(it.name)],
  ['Zip cord', (it) => /zip/i.test(it.name)],
  ['Male plugs', (it) => /\bmale\b/i.test(it.name) && !/female/i.test(it.name)],
  ['Female plugs', (it) => /female/i.test(it.name)],
  ['Timer', (it) => /timer/i.test(it.name)],
];

// First matching item, black first (plugs are always black).
const pickBlack = (arr, test) => arr.find((it) => test(it) && /black/i.test(it.name)) || arr.find(test);

// Every job automatically starts with these (unless it already has that kind of item).
const AUTO_ON_JOB = [
  [/timer/i, '1'],
  [/\bmale\b/i, '10', /female/i],
  [/female/i, '10'],
];
// noAuto = item ids you deleted from the job: that kind isn't auto-added again.
function withDefaults(materials, items, noAuto = []) {
  const m = { ...(materials || {}) };
  const nameOf = (id) => items.find((x) => x.id === id)?.name || '';
  AUTO_ON_JOB.forEach(([re, qty, not]) => {
    const match = (name) => re.test(name) && !(not && not.test(name));
    if ([...Object.keys(m), ...(noAuto || [])].some((id) => match(nameOf(id)))) return;
    // Plugs are always black.
    const it = items.find((x) => match(x.name) && /black/i.test(x.name)) || items.find((x) => match(x.name));
    if (it) m[it.id] = qty;
  });
  return m;
}

// Starting amount when an item is added to a job (edit any time).
const defaultQty = (it) => (/plug/i.test(it?.name || '') ? '10' : /timer/i.test(it?.name || '') ? '1' : '');

// Cold leads: people Jude wants to reach out to, in priority order (drag to reorder).
const BLANK_LEAD = { name: '', address: '', contacts: [{ name: '', phone: '' }], angle: '', decider: '', money: '', notes: '', followUp: '', bestTime: '' };
// Outreach status, set by the latest log entry.
const OUTREACH = [
  ['new', 'Not reached out', 'bg-surface-alt text-secondary'],
  ['no_answer', 'Reached out, idk yet', 'bg-yellow-500/15 text-yellow-400'],
  ['interested', 'Interested', 'bg-brand-light text-brand-text-strong'],
  ['booked', '📅 Booked', 'bg-emerald-500/15 text-emerald-400'],
  ['quoted', '📝 Quoted', 'bg-blue-500/15 text-blue-400'],
  ['won', '✅ Won', 'bg-brand-light text-brand-text-strong'],
  ['not_interested', 'Not interested', 'bg-red-500/15 text-red-400'],
];
const outreachOf = (l, inJobber) => OUTREACH.find((o) => o[0] === stageOf(l, inJobber)) || OUTREACH[0];
// Jobber moves people automatically: assessment scheduled → Booked, quote sent → Quoted,
// approved / job → Won, quote archived → Not interested. Otherwise it's where you put them.
const stageOf = (l, inJobber) => inJobber?.[l.id]?.stage || l.status || 'new';
// "703 Land Fall Drive" and "703 Landfall Dr" → "703landfa"
const addrKey = (a) => { const m = String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '').match(/^(\d+)([a-z]{1,6})/); return m ? m[1] + m[2] : ''; };
// Who to talk to: the contact marked pitch, else the one named in "who to pitch", else the first.
const pitchIdx = (l) => {
  const cs = contactsOf(l);
  const marked = cs.findIndex((c) => c.pitch);
  if (marked >= 0) return marked;
  const d = String(l.decider || '').toLowerCase();
  const byName = cs.findIndex((c) => c.name && d.includes(c.name.toLowerCase()));
  return byName >= 0 ? byName : 0;
};
// Older leads had one phone on the lead itself.
const contactsOf = (l) => (l.contacts?.length ? l.contacts : [{ name: '', phone: l.phone || '' }]).filter((c) => c.name || c.phone);
function ColdLeads({ leads, setLeads, inJobber = {} }) {
  const [draft, setDraft] = useState(null);
  const [dragId, setDragId] = useState('');
  const [overId, setOverId] = useState('');
  const [openLead, setOpenLead] = useState('');
  const [popLead, setPopLead] = useState(''); // lead open in the popup (from Pipeline)
  const [popView, setPopView] = useState(() => localStorage.getItem('lead-pop-view') || 'card'); // card | form
  useEffect(() => { localStorage.setItem('lead-pop-view', popView); }, [popView]);
  const [stage, setStage] = useState(''); // pipeline filter (list view)
  const [mode, setMode] = useState(() => localStorage.getItem('cold-leads-view') || 'board');
  const [overCol, setOverCol] = useState('');
  useEffect(() => { localStorage.setItem('cold-leads-view', mode); }, [mode]);
  const [logFor, setLogFor] = useState(''); // lead id being logged
  const [logDraft, setLogDraft] = useState({ status: '', note: '', how: '' }); // status '' = keep their stage
  const save = () => {
    if (!draft?.name.trim()) return;
    const lead = { ...draft, id: draft.id || `cl-${Date.now()}` };
    setLeads((list) => (draft.id ? (list || []).map((x) => (x.id === lead.id ? lead : x)) : [...(list || []), lead]));
    setDraft(null);
  };
  const saveLog = (l) => {
    if (!logDraft.status && !logDraft.note.trim()) return;
    const entry = { at: new Date().toISOString(), status: logDraft.status || stageOf(l, inJobber), how: logDraft.how, note: logDraft.note.trim() };
    setLeads((list) => (list || []).map((x) => (x.id === l.id ? { ...x, status: logDraft.status || x.status, log: [entry, ...(x.log || [])] } : x)));
    setLogFor('');
    setLogDraft({ status: '', note: '', how: '' });
  };
  const drop = (targetId) => {
    if (!dragId || dragId === targetId) return;
    setLeads((list) => {
      const arr = [...(list || [])];
      const from = arr.findIndex((x) => x.id === dragId);
      const [moved] = arr.splice(from, 1);
      const to = arr.findIndex((x) => x.id === targetId);
      arr.splice(to, 0, moved);
      return arr;
    });
  };
  const f = (key, label, wide) => (
    <label className={`text-[11px] text-muted ${wide ? 'col-span-2' : ''}`}>{label}
      <input value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} className="block w-full mt-0.5 rounded-md border border-border-strong bg-card px-2 py-1.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" />
    </label>
  );
  const draftForm = () => (
        <div className="p-4 grid grid-cols-2 gap-3 border-b border-border-subtle bg-surface-alt/40">
          <p className="col-span-2 text-[11px] font-bold uppercase tracking-wide text-muted">Contact</p>
          {f('name', 'Family name (title)', true)}
          {(draft.contacts?.length ? draft.contacts : [{}]).slice(0, 2).map((_, k) => (
            <div key={k} className="col-span-2 grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
              {['name', 'phone'].map((fld) => (
                <label key={fld} className="text-[11px] text-muted">{fld === 'name' ? `Person ${k + 1}` : 'Phone'}
                  <input
                    value={draft.contacts?.[k]?.[fld] || ''}
                    onChange={(e) => setDraft((d) => {
                      const cs = [...(d.contacts?.length ? d.contacts : [{ name: '', phone: '' }])];
                      cs[k] = { ...cs[k], [fld]: e.target.value };
                      return { ...d, contacts: cs };
                    })}
                    className="block w-full mt-0.5 rounded-md border border-border-strong bg-card px-2 py-1.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand"
                  />
                </label>
              ))}
              <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold text-primary cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={(draft.contacts || []).some((c) => c.pitch) ? !!draft.contacts?.[k]?.pitch : k === 0}
                  onChange={(e) => setDraft((d) => {
                    const cs = [...(d.contacts?.length ? d.contacts : [{ name: '', phone: '' }])];
                    return { ...d, contacts: cs.map((c, x) => ({ ...c, pitch: e.target.checked ? x === k : false })) };
                  })}
                  className="w-4 h-4 accent-[var(--color-brand)]"
                />
                🎯 Talk to
              </label>
            </div>
          ))}
          {(draft.contacts?.length || 1) < 2 && (
            <button onClick={() => setDraft((d) => ({ ...d, contacts: [...(d.contacts?.length ? d.contacts : [{ name: '', phone: '' }]), { name: '', phone: '' }] }))} className="col-span-2 justify-self-start inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline cursor-pointer">
              <Plus size={12} /> Add person 2
            </button>
          )}
          {f('address', 'Address', true)}
          {f('money', 'Money — how they have it', true)}
          <p className="col-span-2 text-[11px] font-bold uppercase tracking-wide text-muted pt-2 border-t border-border-subtle">Sales</p>
          {f('angle', 'Angle — how you know them', true)}
          {f('bestTime', 'Best time to call', true)}
          <div className="col-span-2 flex items-center gap-3">
            <button onClick={save} disabled={!draft.name.trim()} className="px-3 py-1.5 rounded-md bg-brand text-on-brand text-xs font-semibold disabled:opacity-40 cursor-pointer">Save</button>
            <button onClick={() => setDraft(null)} className="text-xs text-muted hover:text-primary cursor-pointer">Cancel</button>
          </div>
        </div>
  );
  const leadRow = (l, i) => (
          <div
            key={l.id}
            id={`lead-${l.id}`}
            draggable
            onDragStart={() => setDragId(l.id)}
            onDragOver={(e) => { e.preventDefault(); setOverId(l.id); }}
            onDragLeave={() => setOverId('')}
            onDrop={(e) => { e.preventDefault(); drop(l.id); setDragId(''); setOverId(''); }}
            onDragEnd={() => { setDragId(''); setOverId(''); }}
            className={`group px-4 py-3 flex items-start gap-3 ${overId === l.id && dragId !== l.id ? 'border-t-2 border-t-brand' : ''} ${dragId === l.id ? 'opacity-40' : ''}`}
          >
            <span className="w-6 h-6 shrink-0 rounded-full bg-surface-alt text-[11px] font-bold text-secondary flex items-center justify-center cursor-grab select-none" title="Drag to reorder">{i + 1}</span>
            <div className="flex-1 min-w-0" onClick={() => setOpenLead(openLead === l.id ? '' : l.id)}>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-primary">{l.name}</p>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${outreachOf(l, inJobber)[2]}`}>{outreachOf(l, inJobber)[1]}</span>
                {l.fromJobber && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-alt text-secondary">🌐 from website</span>}
                {inJobber[l.id]?.label && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400">{inJobber[l.id].label}</span>}
                <button onClick={(e) => { e.stopPropagation(); setLogFor(logFor === l.id ? '' : l.id); }} className="ml-auto px-2 py-0.5 rounded-md border border-border-default text-[11px] font-semibold text-secondary hover:text-primary hover:border-border-strong cursor-pointer">+ Log</button>
              </div>
              {l.money && !/^idk$/i.test(l.money.trim()) && <p className="text-xs text-secondary mt-0.5">💰 {l.money}</p>}
              {l.address && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address)}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="block text-xs text-muted hover:text-primary mt-0.5">📍 {l.address}</a>
              )}
              {logFor === l.id && (
                <div className="mt-2 rounded-lg border border-border-brand bg-surface-alt/40 p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['Call', 'Text', 'In person'].map((h) => (
                      <button key={h} onClick={() => setLogDraft((d) => ({ ...d, how: h }))} className={`px-2 py-0.5 rounded-md text-[11px] font-semibold cursor-pointer ${logDraft.how === h ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-primary'}`}>{h}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {OUTREACH.filter((o) => o[0] !== 'new').map(([k, label, cls]) => (
                      <button key={k} onClick={() => setLogDraft((d) => ({ ...d, status: k }))} className={`px-2 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${logDraft.status === k ? `${cls} ring-2 ring-ring-brand` : 'bg-surface-alt text-muted hover:text-primary'}`}>{label}</button>
                    ))}
                  </div>
                  <textarea
                    value={logDraft.note}
                    onChange={(e) => setLogDraft((d) => ({ ...d, note: e.target.value }))}
                    placeholder="What they said…"
                    rows={2}
                    className="w-full rounded-md border border-border-strong bg-card px-2 py-1.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand"
                  />
                  <div className="flex items-center gap-3">
                    <button onClick={() => saveLog(l)} className="px-3 py-1.5 rounded-md bg-brand text-on-brand text-xs font-semibold cursor-pointer">Save</button>
                    <button onClick={() => setLogFor('')} className="text-xs text-muted hover:text-primary cursor-pointer">Cancel</button>
                  </div>
                </div>
              )}
              <div className="mt-1.5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {/* Contact */}
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Contact</p>
                  {contactsOf(l).map((c, k) => (
                    <div key={k} className={`flex items-center gap-1.5 text-xs rounded-lg px-2 py-1 -mx-2 ${pitchIdx(l) === k ? 'bg-brand-light ring-1 ring-border-brand' : 'opacity-60'}`} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setLeads((list) => (list || []).map((x) => (x.id === l.id ? { ...x, contacts: contactsOf(x).map((cc, ci) => ({ ...cc, pitch: ci === k })) } : x)))}
                        className="text-primary font-semibold cursor-pointer"
                        title="Talk to this person"
                      >
                        {pitchIdx(l) === k && '🎯 '}{c.name || 'Contact'}
                      </button>
                      {c.phone ? (
                        <button
                          onClick={(e) => {
                            navigator.clipboard?.writeText(c.phone);
                            const b = e.currentTarget; const t = b.textContent;
                            b.textContent = 'Copied ✓'; setTimeout(() => { b.textContent = t; }, 1200);
                          }}
                          className="text-secondary hover:text-primary underline decoration-dotted underline-offset-2 cursor-pointer"
                          title="Copy number"
                        >
                          {c.phone}
                        </button>
                      ) : <span className="text-muted">no number</span>}
                    </div>
                  ))}
                  {!contactsOf(l).length && <p className="text-xs text-muted">No contact yet</p>}
                </div>
                {/* Sales */}
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Sales</p>
                  {l.angle && <p className="text-xs text-secondary">{l.angle}</p>}
                  {l.notes && <p className="text-xs"><span className="text-muted">📝</span> <span className="text-secondary">{l.notes}</span></p>}
                  {!l.angle && !l.notes && <p className="text-xs text-muted">Nothing yet</p>}
                  <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-muted">⏰ Best time to call
                      <input value={l.bestTime || ''} onChange={(e) => setLeads((list) => (list || []).map((x) => (x.id === l.id ? { ...x, bestTime: e.target.value } : x)))}
                        placeholder="e.g. weekdays after 5:30"
                        className="block w-full mt-0.5 rounded-md border border-border-strong bg-card px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-primary outline-none focus:ring-2 focus:ring-ring-brand" />
                    </label>
                  </div>
                  {(l.log || []).length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Outreach · {l.log.length}</p>
                      {(openLead === l.id ? l.log : l.log.slice(0, 1)).map((e, k) => {
                        const o = OUTREACH.find((x) => x[0] === e.status) || OUTREACH[0];
                        return (
                          <p key={k} className="text-xs">
                            <span className="text-muted">{new Date(e.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}{e.how ? ` · ${e.how}` : ''}</span>{' '}
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${o[2]}`}>{o[1]}</span>{' '}
                            <span className="text-secondary">{e.note}</span>
                          </p>
                        );
                      })}
                      {openLead !== l.id && l.log.length > 1 && <p className="text-[10px] text-muted">Tap to see all {l.log.length}</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              <span className={`flex items-center gap-1 ${openLead === l.id ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                <button onClick={() => setDraft({ ...BLANK_LEAD, ...l, contacts: contactsOf(l).length ? contactsOf(l).slice(0, 2) : [{ name: '', phone: '' }] })} className="p-1.5 text-muted hover:text-primary cursor-pointer" title="Edit"><Pencil size={13} /></button>
                <button onClick={() => setLeads((list) => (list || []).filter((x) => x.id !== l.id))} className="p-1.5 text-muted hover:text-red-500 cursor-pointer" title="Remove"><Trash2 size={13} /></button>
              </span>
            </div>
          </div>
  );
  // Popup = a call sheet: who to call, why, your note, log the call, history.
  const setLead = (id, p) => setLeads((list) => (list || []).map((x) => (x.id === id ? { ...x, ...p } : x)));
  const popBody = (l) => {
    const editCs = l.contacts?.length ? l.contacts : [{ name: '', phone: l.phone || '' }];
    const pi = pitchIdx(l);
    const st = outreachOf(l, inJobber);
    const box = 'w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand';
    const head = (t) => <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">{t}</p>;
    const setContact = (k, p) => setLead(l.id, { contacts: editCs.map((c, ci) => (ci === k ? { ...c, ...p } : c)) });
    const formRow = (label, input) => (
      <div className="space-y-1">
        <p className="text-sm font-semibold text-primary">{label}</p>
        {input}
      </div>
    );
    const inl = 'bg-transparent rounded-md border border-transparent px-1.5 py-0.5 -mx-1.5 outline-none hover:border-border-default focus:border-brand focus:bg-card';
    const area = (val, set, ph, cls) => (
      <textarea value={val || ''} onChange={(e) => set(e.target.value)} placeholder={ph} rows={Math.max(1, Math.ceil((val || '').length / 55))}
        className={`${inl} flex-1 resize-none ${cls}`} />
    );
    return (
      <div className="p-4 grid gap-4 md:grid-cols-2 items-start">
        {popView === 'form' ? (
          <div className="rounded-xl border border-border-default bg-surface-alt/30 p-4 space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-secondary">👤 Contact info</p>
            {formRow('1. Family name', <input autoFocus={!l.name} value={l.name || ''} onChange={(e) => setLead(l.id, { name: e.target.value })} placeholder="e.g. Name and Name Johnson" className={box} />)}
            {formRow('2. Who to call', (
              <div className="space-y-2">
                {editCs.map((c, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <input value={c.name || ''} onChange={(e) => setContact(k, { name: e.target.value })} placeholder="Name" className={box} />
                    <input value={c.phone || ''} onChange={(e) => setContact(k, { phone: e.target.value })} placeholder="Phone" className={`${box} w-44`} />
                    <button onClick={() => setLead(l.id, { contacts: editCs.map((cc, ci) => ({ ...cc, pitch: ci === k })) })} title="Call this person"
                      className={`shrink-0 px-2 py-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${k === pi ? 'bg-brand-light text-brand-text-strong ring-1 ring-border-brand' : 'bg-surface-alt text-muted hover:text-primary'}`}>🎯 Call</button>
                    {editCs.length > 1 && <button onClick={() => setLead(l.id, { contacts: editCs.filter((_, ci) => ci !== k) })} className="shrink-0 p-1 text-muted hover:text-red-500 cursor-pointer" title="Remove person"><Trash2 size={14} /></button>}
                  </div>
                ))}
                {editCs.length < 3 && <button onClick={() => setLead(l.id, { contacts: [...editCs, { name: '', phone: '' }] })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-text hover:underline cursor-pointer"><Plus size={12} /> Add another person</button>}
              </div>
            ))}
            {formRow('3. Best time to call', <input value={l.bestTime || ''} onChange={(e) => setLead(l.id, { bestTime: e.target.value })} placeholder="e.g. weekdays after 5:30" className={box} />)}
            {formRow('4. How they know me', <textarea value={l.angle || ''} onChange={(e) => setLead(l.id, { angle: e.target.value })} rows={2} placeholder="e.g. plays mahjong with Mom" className={box} />)}
            {formRow('5. How they have money', <input value={l.money || ''} onChange={(e) => setLead(l.id, { money: e.target.value })} placeholder="e.g. he's a contractor" className={box} />)}
            {formRow('6. Address', <input value={l.address || ''} onChange={(e) => setLead(l.id, { address: e.target.value })} placeholder="e.g. 1844 Farrow Drive" className={box} />)}
            <p className="text-[11px] text-muted">Saves as you type.</p>
          </div>
        ) : (
        <div className="rounded-xl border border-border-default bg-surface-alt/30 p-4 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wide text-secondary">👤 Contact info</p>
          <div className="space-y-1.5">
            {editCs.map((c, k) => (
              <div key={k} className={`group/c flex items-center gap-2 rounded-lg px-3 py-2 ${k === pi ? 'bg-brand-light ring-2 ring-border-brand' : 'bg-card'}`}>
                <button onClick={() => setLead(l.id, { contacts: editCs.map((cc, ci) => ({ ...cc, pitch: ci === k })) })} title="Call this person"
                  className={`shrink-0 cursor-pointer ${k === pi ? '' : 'opacity-30 hover:opacity-80'}`}>🎯</button>
                <input value={c.name || ''} onChange={(e) => setContact(k, { name: e.target.value })} placeholder="Name"
                  className={`${inl} min-w-0 flex-1 text-base font-semibold ${k === pi ? 'text-primary' : 'text-secondary'}`} />
                <input value={c.phone || ''} onChange={(e) => setContact(k, { phone: e.target.value })} placeholder="Phone"
                  className={`${inl} w-36 text-right text-base font-semibold tabular-nums text-brand-text`} />
                <button
                  onClick={(e) => { if (!c.phone) return; navigator.clipboard?.writeText(c.phone); const b = e.currentTarget; b.textContent = '✓'; setTimeout(() => { b.textContent = 'Copy'; }, 1200); }}
                  title="Copy number"
                  className="shrink-0 w-12 px-2 py-1 rounded-md bg-surface-alt text-[11px] font-semibold text-secondary hover:text-primary cursor-pointer"
                >Copy</button>
                {editCs.length > 1 && <button onClick={() => setLead(l.id, { contacts: editCs.filter((_, ci) => ci !== k) })} title="Remove person" className="shrink-0 opacity-0 group-hover/c:opacity-100 text-muted hover:text-red-500 cursor-pointer"><Trash2 size={13} /></button>}
              </div>
            ))}
            {editCs.length < 3 && (
              <button onClick={() => setLead(l.id, { contacts: [...editCs, { name: '', phone: '' }] })} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-brand-text cursor-pointer"><Plus size={12} /> Add person</button>
            )}
          </div>
          <div>
            {head('Best time to call')}
            <div className="flex items-center gap-2 text-sm">
              <span>⏰</span>
              <input value={l.bestTime || ''} onChange={(e) => setLead(l.id, { bestTime: e.target.value })} placeholder="e.g. weekdays after 5:30…" className={`${inl} flex-1 text-primary`} />
            </div>
          </div>
          <div>
            {head('How they know me')}
            <div className="space-y-1 text-sm">
              <div className="flex items-start gap-2"><span className="pt-1">🤝</span>{area(l.angle, (v) => setLead(l.id, { angle: v }), 'How they know me…', 'text-primary')}</div>
            </div>
          </div>
        </div>

        )}

        {/* ---------- Log ---------- */}
        <div className="rounded-xl border-2 border-blue-500/60 bg-blue-500/[0.08] p-4 space-y-3 shadow-lg shadow-blue-500/5">
          <div className="flex items-center justify-between">
            <p className="text-lg font-bold text-blue-300">📞 Log</p>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${st[2]}`}>{st[1]}</span>
          </div>
          <textarea value={logDraft.note} onChange={(e) => setLogDraft((d) => ({ ...d, note: e.target.value }))} placeholder="What they said…" rows={2} className={box} />
          <button onClick={() => saveLog(l)} className="px-4 py-1.5 rounded-lg bg-brand text-on-brand text-sm font-semibold cursor-pointer">Save to log</button>
          {(l.log || []).length > 0 && (
            <div className="pt-3 border-t border-blue-500/30 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-blue-300">History · {l.log.length}</p>
              {l.log.map((e, k) => {
                const o = OUTREACH.find((x) => x[0] === e.status) || OUTREACH[0];
                return (
                  <div key={k} className="group flex items-start gap-2 rounded-lg bg-card border border-border-default px-3 py-2 text-sm">
                    <p className="flex-1">
                      <span className="text-secondary font-semibold">{new Date(e.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>{' '}
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${o[2]}`}>{o[1]}</span>{' '}
                      <span className="text-primary">{e.note}</span>
                    </p>
                    <button onClick={() => setLead(l.id, { log: l.log.filter((_, x) => x !== k) })} title="Delete this line" className="opacity-0 group-hover:opacity-100 px-1 text-muted hover:text-red-500 cursor-pointer">✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="md:col-span-2 flex justify-end">
          <button onClick={() => { setLeads((list) => (list || []).filter((x) => x.id !== l.id)); closePop(); }} className="inline-flex items-center gap-1 text-xs text-muted hover:text-red-500 cursor-pointer"><Trash2 size={12} /> Remove lead</button>
        </div>
      </div>
    );
  };
  // Lead details as a popup over the pipeline — no scrolling away from where you were.
  const popped = popLead && (leads || []).find((x) => x.id === popLead);
  // New lead opens in the same popup; closing it with no name throws it away.
  const addLead = () => {
    const id = `cl-${Date.now()}`;
    setLeads((list) => [...(list || []), { ...BLANK_LEAD, id, contacts: [{ name: '', phone: '', pitch: true }] }]);
    setPopLead(id);
  };
  // Referrals (Mom's link): her leads wait in an inbox; one tap adds them to the pipeline.
  const [refer, setRefer] = useState({ links: [], inbox: [] });
  const [referMsg, setReferMsg] = useState('');
  const loadRefer = () => Promise.all([referLinks(), referInbox()]).then(([links, inbox]) => setRefer({ links, inbox })).catch(() => {});
  useEffect(() => { loadRefer(); const t = setInterval(() => { if (document.visibilityState === 'visible') loadRefer(); }, 60000); return () => clearInterval(t); }, []); // only the tab you're looking at re-checks
  const waiting = refer.inbox.filter((r) => !r.added && !(leads || []).some((l) => l.id === r.id));
  const addReferrals = async () => {
    const now = new Date().toISOString();
    setLeads((list) => [...(list || []), ...waiting.map((r) => ({
      ...BLANK_LEAD, id: r.id, name: r.name || r.contacts?.[0]?.name || '', address: r.address || '', contacts: r.contacts?.length ? r.contacts : [{ name: '', phone: '', pitch: true }],
      bestTime: r.bestTime || '', angle: r.angle || '', money: r.money || '', status: 'new', referredBy: r.from,
      log: [{ at: r.at || now, status: '', how: `Referred by ${r.from}`, note: `Sent in by ${r.from}` }],
    }))]);
    await markReferAdded(waiting.map((r) => r.id)).catch(() => {});
    loadRefer();
  };
  // Referral links: one per person (Mom, step dad…). Copy any of them, or make a new one.
  const [linksOpen, setLinksOpen] = useState(false);
  const [newRef, setNewRef] = useState('');
  const referUrl = (link) => `${/localhost|127\.0\.0\.1/.test(window.location.hostname) ? 'https://lawn-care-hub.vercel.app' : window.location.origin}/refer/${link.token}`;
  const copyLink = async (link) => {
    const url = referUrl(link);
    try { await navigator.clipboard.writeText(url); } catch { /* shown below */ }
    setReferMsg(`${link.name}: ${url}`);
    setTimeout(() => setReferMsg(''), 8000);
  };
  const createLink = async () => {
    const name = newRef.trim(); if (!name) return;
    const link = await makeReferLink(name);
    setNewRef(''); await loadRefer(); copyLink(link);
  };
  const dropIfBlank = (id) => setLeads((list) => (list || []).filter((x) => x.id !== id || x.name?.trim()));
  const closePop = () => { dropIfBlank(popLead); setPopLead(''); setLogFor(''); setLogDraft({ status: '', note: '', how: '' }); if (draft?.id === popLead) setDraft(null); };
  useEffect(() => {
    if (!popLead) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setLeads((list) => (list || []).filter((x) => x.id !== popLead || x.name?.trim())); setPopLead(''); setLogFor(''); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popLead, setLeads]);
  return (
    <div className="rounded-xl border border-border-default bg-card">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-primary">Cold leads</p>
          <div className="flex rounded-lg bg-surface-alt p-0.5">
            {[['board', 'Pipeline'], ['list', 'List']].map(([k, label]) => (
              <button key={k} onClick={() => setMode(k)} className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${mode === k ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-primary'}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setLinksOpen((o) => !o)} title="Referral links for Mom, step dad, anyone" className="text-sm font-medium text-secondary hover:text-primary cursor-pointer">🔗 Referral links</button>
          <button onClick={addLead} className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline cursor-pointer"><Plus size={14} /> Add lead</button>
        </div>
      </div>
      {referMsg && <p className="px-4 py-2 text-xs text-brand-text border-b border-border-subtle break-all">Copied — text this to {referMsg}</p>}
      {linksOpen && (
        <div className="px-4 py-3 border-b border-border-subtle bg-surface-alt/40 space-y-2">
          <p className="text-xs text-muted">Each person gets their own link. $50 for every one you sell — Won leads count as sold.</p>
          {refer.links.filter((l) => !l.off).map((l) => {
            const theirs = (leads || []).filter((x) => x.referredBy === l.name && x.name);
            const sold = theirs.filter((x) => stageOf(x, inJobber) === 'won').length;
            const pending = theirs.filter((x) => !['won', 'not_interested'].includes(stageOf(x, inJobber))).length;
            return (
              <div key={l.token} className="flex items-center gap-3 text-sm">
                <span className="flex-1 font-semibold text-primary">{l.name}</span>
                <span className="text-xs text-muted">{theirs.length} sent · {pending} pending</span>
                <span className="w-16 text-right font-bold text-brand-text">${sold * 50} owed</span>
                <button onClick={() => copyLink(l)} className="px-2.5 py-1 rounded-md border border-border-strong text-xs font-semibold text-primary hover:bg-surface-alt cursor-pointer">Copy link</button>
              </div>
            );
          })}
          <div className="flex items-center gap-2 pt-1">
            <input value={newRef} onChange={(e) => setNewRef(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createLink(); }} placeholder="New person (e.g. Steve)" className="flex-1 rounded-md border border-border-strong bg-card px-2.5 py-1.5 text-sm text-primary outline-none focus:border-brand" />
            <button onClick={createLink} disabled={!newRef.trim()} className="px-3 py-1.5 rounded-md bg-brand text-on-brand text-xs font-semibold disabled:opacity-40 cursor-pointer">+ Make link</button>
          </div>
        </div>
      )}
      {waiting.length > 0 && (
        <div className="px-4 py-3 border-b border-border-subtle bg-brand-light flex items-center gap-3 flex-wrap">
          <p className="text-sm font-semibold text-brand-text-strong flex-1">📥 New from {waiting[0].from} ({waiting.length}): {waiting.map((r) => r.name || r.contacts?.[0]?.name).join(', ')}</p>
          <button onClick={addReferrals} className="rounded-lg bg-brand text-on-brand px-4 py-2 text-sm font-bold hover:bg-brand-hover cursor-pointer">Add to pipeline</button>
        </div>
      )}
      {mode === 'list' && <div className="px-4 py-2.5 border-b border-border-subtle flex items-stretch gap-1.5 overflow-x-auto">
        {OUTREACH.map(([k, label, cls]) => {
          const n = (leads || []).filter((l) => stageOf(l, inJobber) === k).length;
          const on = stage === k;
          return (
            <button
              key={k}
              onClick={() => setStage(on ? '' : k)}
              className={`shrink-0 min-w-[92px] rounded-lg px-2.5 py-1.5 text-left cursor-pointer border transition-colors ${on ? 'border-border-brand ring-2 ring-ring-brand' : 'border-transparent hover:border-border-strong'} ${cls}`}
            >
              <p className="text-lg font-bold leading-none">{n}</p>
              <p className="text-[10px] font-semibold mt-0.5 whitespace-nowrap">{label}</p>
            </button>
          );
        })}
      </div>}
      {draft && !(popLead && draft.id === popLead) && draftForm()}
      {mode === 'board' && (
        <div className="p-3 flex gap-2 overflow-x-auto">
          {OUTREACH.map(([k, label, cls]) => {
            const col = (leads || []).filter((l) => stageOf(l, inJobber) === k);
            // Booked: soonest assessment first.
            if (k === 'booked') col.sort((a, b) => new Date(inJobber[a.id]?.at || 8.64e15) - new Date(inJobber[b.id]?.at || 8.64e15));
            return (
              <div
                key={k}
                onDragOver={(e) => { e.preventDefault(); setOverCol(k); }}
                onDragLeave={() => setOverCol('')}
                onDrop={() => {
                  if (dragId) setLeads((list) => (list || []).map((x) => (x.id === dragId && (x.status || 'new') !== k
                    ? { ...x, status: k, log: [{ at: new Date().toISOString(), status: k, how: 'Moved', note: '' }, ...(x.log || [])] } : x)));
                  setDragId(''); setOverCol('');
                }}
                className={`flex-1 min-w-56 rounded-xl p-2 space-y-2 transition-colors ${overCol === k ? 'bg-brand-light/40 ring-2 ring-ring-brand' : 'bg-surface-alt/50'}`}
              >
                <div className="flex items-center justify-between px-1">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>{label}</span>
                  <span className="text-xs font-bold text-muted">{col.length}</span>
                </div>
                {col.map((l) => {
                  return (
                    <div
                      key={l.id}
                      draggable
                      onDragStart={() => setDragId(l.id)}
                      onDragEnd={() => { setDragId(''); setOverCol(''); setOverId(''); }}
                      onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== l.id) setOverId(l.id); }}
                      onDragLeave={() => setOverId((o) => (o === l.id ? '' : o))}
                      onDrop={(e) => {
                        // Drop on a card = put it right above this card (and into this column).
                        e.preventDefault(); e.stopPropagation();
                        if (dragId && dragId !== l.id) {
                          drop(l.id);
                          setLeads((list) => (list || []).map((x) => (x.id === dragId && (x.status || 'new') !== k
                            ? { ...x, status: k, log: [{ at: new Date().toISOString(), status: k, how: 'Moved', note: '' }, ...(x.log || [])] } : x)));
                        }
                        setDragId(''); setOverCol(''); setOverId('');
                      }}
                      onClick={() => { setPopLead(l.id); setOpenLead(l.id); }}
                      className={`rounded-lg border bg-card p-2.5 cursor-grab active:cursor-grabbing hover:border-border-strong ${overId === l.id && dragId !== l.id ? 'border-border-default border-t-4 border-t-brand' : 'border-border-default'} ${dragId === l.id ? 'opacity-40' : ''}`}
                    >
                      <p className="text-sm font-semibold text-primary leading-tight">{l.name}</p>
                      {inJobber[l.id]?.today && <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-500 text-[9px] font-black text-black tracking-wide">TODAY</span>}
                      {inJobber[l.id]?.label && <p className="text-[10px] font-semibold text-blue-400 mt-0.5">{inJobber[l.id].label}</p>}
                      {(l.log || []).find((e) => e.note?.trim()) && <p className="text-[11px] text-muted mt-1 line-clamp-2">{l.log.find((e) => e.note?.trim()).note}</p>}
                    </div>
                  );
                })}
                {!col.length && <p className="px-1 py-2 text-[11px] text-muted">Drag here</p>}
              </div>
            );
          })}
        </div>
      )}
      {mode === 'list' && (
      <div className="divide-y divide-border-subtle">
        {(leads || []).map((l, i) => (stage && stageOf(l, inJobber) !== stage ? null : leadRow(l, i)))}
        {!(leads || []).length && !draft && <p className="px-4 py-3 text-sm text-muted">No cold leads yet. Add people you want to reach out to.</p>}
      </div>
      )}
      <div className="px-4 py-3 border-t border-border-subtle bg-surface-alt/40">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1.5">📞 Phone pitch</p>
        <p className="text-[10px] font-semibold text-brand-text mt-2 mb-0.5">Gauge interest</p>
        <ol start={1} className="space-y-1 text-sm text-primary list-decimal list-inside marker:text-muted">
          <li>"Hey, this is Jude, <span className="text-brand-text font-semibold">[reason they know me — e.g. Cindy's son]</span>."</li>
          <li>"I'm reaching out because I'm doing Christmas lights and <span className="text-brand-text font-semibold">[Mom / Gene]</span> told me you might be interested."</li>
          <li>"Are you interested in hearing more?"</li>
        </ol>
        <p className="text-[10px] font-semibold text-brand-text mt-2 mb-0.5">The sale</p>
        <ol start={4} className="space-y-1 text-sm text-primary list-decimal list-inside marker:text-muted">
          <li>"I'm really trying to get my name out there. I spent $5,000 on a course and I've already done a few jobs. You might've gotten one of my postcards, seen one of my yard signs, or seen one of my ads."</li>
          <li>"With our lights, everything's custom cut to your home, wires hidden, commercial grade, with plenty of designs to choose from. We do everything — trees, bushes, around windows, wreaths, rooflines, you name it. We design, install, maintain, take them down, and we store them."</li>
          <li><span className="text-muted">If they live in Meadow Lakes 2:</span> "We've already got one scheduled in your neighborhood."</li>
          <li>"I was wondering if this is something you'd be interested in?"</li>
        </ol>
        <p className="text-[10px] font-semibold text-brand-text mt-2 mb-0.5">The close</p>
        <ol start={8} className="space-y-1 text-sm text-primary list-decimal list-inside marker:text-muted">
          <li><span className="text-muted">If interested:</span> "The next step would be to schedule a free design consult, where we meet, create a design for your home together, and I present you a quote."</li>
        </ol>
      </div>
      {popped && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={closePop}>
          <div className={`w-full ${draft && draft.id === popped.id ? 'max-w-2xl' : 'max-w-5xl'} max-h-[92vh] flex flex-col rounded-xl border border-border-default bg-card shadow-2xl`} onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
              {popView === 'form' ? <p className="flex-1 text-lg font-bold text-primary">{popped.name?.trim() || 'New lead'}</p> : <div className="min-w-0 flex-1 pr-3">
                <div className="flex items-center gap-1 flex-wrap">
                  <input autoFocus={!popped.name} placeholder="Name and Name Johnson" value={popped.name || ''} onChange={(e) => setLead(popped.id, { name: e.target.value })} size={Math.max(8, (popped.name || '').length + 1)} className="bg-transparent rounded-md border border-transparent px-1.5 py-0.5 outline-none hover:border-border-default focus:border-brand focus:bg-surface-alt -ml-1.5 text-lg font-bold text-primary" />
                  <span className="text-sm">💰</span>
                  <input value={popped.money || ''} onChange={(e) => setLead(popped.id, { money: e.target.value })} placeholder="How they have money…" className="bg-transparent rounded-md border border-transparent px-1.5 py-0.5 outline-none hover:border-border-default focus:border-brand focus:bg-surface-alt flex-1 min-w-[200px] text-sm text-secondary" />
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(popped.address || '')}`} target="_blank" rel="noreferrer" title="Open in Maps">📍</a>
                  <input value={popped.address || ''} onChange={(e) => setLead(popped.id, { address: e.target.value })} placeholder="Address…" className="bg-transparent rounded-md border border-transparent px-1.5 py-0.5 outline-none hover:border-border-default focus:border-brand focus:bg-surface-alt flex-1 text-muted" />
                </div>
              </div>}
              <div className="shrink-0 flex items-center gap-2">
                <div className="flex rounded-lg bg-surface-alt p-0.5">
                  {[['card', 'Card'], ['form', 'Form']].map(([k, label]) => (
                    <button key={k} onClick={() => setPopView(k)} className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${popView === k ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-primary'}`}>{label}</button>
                  ))}
                </div>
                <button onClick={closePop} className="px-2 py-1 rounded-md text-muted hover:text-primary hover:bg-surface-alt cursor-pointer" title="Close (Esc)">✕</button>
              </div>
            </div>
            <div className="overflow-y-auto min-h-0">{draft && draft.id === popped.id ? draftForm() : popBody(popped)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// "+ Add material" picker with photos, grouped like the Supplies list.
function MaterialPicker({ items, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  // Every word typed must appear in the name (or its section): "white zip", "mini warm".
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length
    ? items.filter((x) => { const hay = `${x.name} ${CATS.find(([c]) => c === catOf(x))?.[1] || ''}`.toLowerCase(); return words.every((w) => hay.includes(w)); })
    : items;
  const pick = (id) => { onPick(id); setOpen(false); setQ(''); };
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen((o) => !o); setQ(''); }} className="inline-flex items-center gap-1 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-xs text-secondary hover:text-primary cursor-pointer">
        <Plus size={13} /> Add material
      </button>
      {open && (
        <div className="absolute z-40 left-0 mt-1 w-80 max-h-96 overflow-y-auto rounded-xl border border-border-default bg-card shadow-2xl pb-1">
          <div className="sticky top-0 bg-card p-2 border-b border-border-subtle">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter') { const first = groupSupplies(shown).flatMap(([, , its]) => its)[0]; if (first) pick(first.id); }
              }}
              placeholder="Search material…"
              className="w-full rounded-md border border-border-strong bg-surface-alt px-2.5 py-1.5 text-sm text-primary outline-none focus:border-brand"
            />
          </div>
          {groupSupplies(shown).map(([cat, label, its]) => (
            <div key={cat}>
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted">{label}</p>
              {its.map((x) => (
                <button key={x.id} onClick={() => pick(x.id)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-alt cursor-pointer">
                  {x.image ? <img src={x.image} alt="" className="w-8 h-8 rounded-md object-cover bg-white shrink-0" /> : <div className="w-8 h-8 rounded-md bg-surface-alt shrink-0" />}
                  <span className="flex-1 text-sm text-primary truncate">{x.name}</span>
                  <span className="text-[11px] text-muted shrink-0">{n(x.onHand)} {x.unit}</span>
                </button>
              ))}
            </div>
          ))}
          {!items.length && <p className="px-3 py-2 text-xs text-muted">No more material to add.</p>}
          {items.length > 0 && !shown.length && <p className="px-3 py-2 text-xs text-muted">Nothing matches “{q}”.</p>}
        </div>
      )}
    </div>
  );
}

// Install + takedown visits from Jobber. Takedown = title says so, or it's after
// Christmas (Jan–Mar). Install = the earliest other visit.
function jobVisits(j) {
  const vs = j?.visits || [];
  const isTake = (v) => /ta?ke?\s*-?down|removal/i.test(v.title || '') || (v.startAt && [0, 1, 2].includes(new Date(v.startAt).getMonth()));
  return { take: vs.find(isTake), inst: vs.find((v) => !isTake(v)) };
}

// Shrink a photo to a small JPEG data URL (keeps the saved job light).
function shrinkPhoto(file, max = 700) {
  return new Promise((resolve) => {
    if (!file?.type.startsWith('image/')) { resolve(null); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// After an install: finished-house photos + did they leave a review.
function InstallWrapUp({ saved, onPatch, hideReview }) {
  const photos = saved.afterPhotos || [];
  const [big, setBig] = useState('');
  const add = async (files) => {
    const shots = (await Promise.all([...(files || [])].slice(0, 6).map((f) => shrinkPhoto(f)))).filter(Boolean);
    if (shots.length) onPatch({ afterPhotos: [...photos, ...shots] });
  };
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 flex-wrap">
        {photos.map((src, i) => (
          <div key={i} className="relative group">
            <img src={src} alt="" onClick={() => setBig(src)} className="w-14 h-14 rounded-md object-cover cursor-zoom-in" />
            <button onClick={() => onPatch({ afterPhotos: photos.filter((_, k) => k !== i) })} className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-4 h-4 items-center justify-center rounded-full bg-black/80 text-[10px] text-white cursor-pointer" title="Remove">×</button>
          </div>
        ))}
        <label className="w-14 h-14 rounded-md border border-dashed border-border-strong flex flex-col items-center justify-center text-muted hover:text-primary cursor-pointer" title="Add after photos">
          <ImagePlus size={15} /><span className="text-[9px]">After pics</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
      {!hideReview && <label className="flex items-center gap-1.5 text-xs text-secondary cursor-pointer">
        <input type="checkbox" checked={!!saved.reviewed} onChange={(e) => onPatch({ reviewed: e.target.checked, reviewedAt: e.target.checked ? new Date().toISOString() : null })} />
        <span className={saved.reviewed ? 'text-yellow-400 font-semibold' : ''}>⭐ {saved.reviewed ? 'Got a review' : 'Got a review?'}</span>
      </label>}
      {big && <div onClick={() => setBig('')} className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"><img src={big} alt="" className="max-w-full max-h-full rounded-lg" /></div>}
    </div>
  );
}

// Walk booked (not installed) jobs in date order. Stock = what's in the shop now,
// plus each on-the-way order once it should have landed, minus what earlier jobs used.
// Returns [{ id, name, at, mats, problems, late, landBy, landEst }].
// The Hub quote for a Jobber job: one you linked by hand, else same Jobber client,
// else same name, else a near-identical name ("McPeters" vs "mcpeter") if only one fits.
function matchQuote(quotes, { quoteId, clientId, clientName }) {
  if (quoteId) { const q = quotes.find((x) => x.id === quoteId); if (q) return q; }
  if (clientId) { const q = quotes.find((x) => x.clientInfo?.id === clientId); if (q) return q; }
  const k = nameKey(clientName);
  const exact = quotes.find((x) => nameKey(x.clientInfo?.name || x.client) === k);
  if (exact || k.length < 8) return exact || null;
  const hits = quotes.filter((x) => { const k2 = nameKey(x.clientInfo?.name || x.client); return k2.length >= 8 && (k.startsWith(k2) || k2.startsWith(k)) && Math.abs(k.length - k2.length) <= 2; });
  return hits.length === 1 ? hits[0] : null;
}

function jobReadiness(jobsMap, items, ordersStored, liveJobs) {
  const landsOn = (d) => {
    const x = new Date(d); const dow = x.getDay();
    if (dow === 6 || dow === 0) { x.setDate(x.getDate() + (dow === 6 ? 2 : 1)); x.setDate(x.getDate() + 3); return x; }
    x.setDate(x.getDate() + 4); return x;
  };
  const dayOf = (iso) => (iso ? new Date(String(iso).length <= 10 ? `${iso}T12:00:00` : iso) : null);
  // Lines already marked arrived (part of an order came) aren't still on the way.
  const arrivals = (ordersStored || []).filter((o) => o.status === 'otw').map((o) => ({
    o: { ...o, lines: (o.lines || []).filter((l) => !l.arrived) }, at: orderLandsOn(o),
  }));
  items.forEach((x) => { if (n(x.extraOnOrder)) arrivals.push({ o: { lines: [{ itemId: x.id, qty: x.extraOnOrder }], number: '' }, at: landsOn(new Date()) }); });
  const live = Object.fromEntries((liveJobs || []).map((j) => [j.id, j]));
  const jobs = Object.entries(jobsMap).filter(([id, j]) => !j.installed && live[id]?.status !== 'archived')
    .map(([id, j]) => ({ id, name: live[id]?.clientName || j.clientName || 'Job', at: dayOf(live[id]?.visitAt || j.date), mats: withDefaults(j.materials, items, j.noAuto) }))
    .sort((a, b) => (a.at || Infinity) - (b.at || Infinity));
  const usedSoFar = {};
  const results = jobs.map((job) => {
    const problems = []; const waiting = []; let late = false; let landBy = null; let landEst = true;
    Object.entries(job.mats).forEach(([id, q]) => {
      q = n(q); if (!q) return;
      const x = items.find((y) => y.id === id); if (!x) return;
      const landed = arrivals.filter((a) => !job.at || a.at <= job.at).reduce((t, a) => t + (a.o.lines || []).filter((l) => l.itemId === id).reduce((u, l) => u + n(l.qty), 0), 0);
      const before = n(x.onHand) - (usedSoFar[id] || 0);
      if (before < q && before + landed >= q) {
        late = true;
        const nums = [...new Set(arrivals.filter((a) => (!job.at || a.at <= job.at) && (a.o.lines || []).some((l) => l.itemId === id)).map((a) => a.o.number).filter(Boolean))];
        waiting.push({ id, name: x.name, image: x.image, qty: Math.ceil(q - Math.max(0, before)), orders: nums });
        // Latest of the orders this item is waiting on.
        arrivals.filter((a) => (!job.at || a.at <= job.at) && (a.o.lines || []).some((l) => l.itemId === id))
          .forEach((a) => { if (!landBy || a.at > landBy) { landBy = a.at; landEst = !a.o.eta; } });
      }
      if (before + landed < q) {
        const lateOrder = arrivals.find((a) => job.at && a.at > job.at && (a.o.lines || []).some((l) => l.itemId === id));
        problems.push({ id, name: x.name, image: x.image, qty: Math.ceil(q - before - landed),
          note: lateOrder ? `order${lateOrder.o.number ? ` #${lateOrder.o.number}` : ''} ${lateOrder.o.eta ? `lands ${lateOrder.at.toLocaleDateString([], { month: 'short', day: 'numeric' })}` : 'on the way, may not make it'}`
            // Ordered, but earlier installs already use it all up → need more on top.
            : arrivals.some((a2) => (a2.o.lines || []).some((l) => l.itemId === id)) ? 'more than ordered — earlier jobs use the rest' : 'not ordered' });
      }
      usedSoFar[id] = (usedSoFar[id] || 0) + q;
    });
    return { ...job, problems, waiting, late, landBy, landEst };
  });
  return results;
}

// Small square product photo: click or drop a picture to set it.
function SupplyPhoto({ src, onChange }) {
  const [over, setOver] = useState(false);
  const take = (file) => {
    if (!file?.type.startsWith('image/')) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 96; // shown at ~40px; 96 stays sharp on Retina and keeps the supplies data small (fast page load)
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const k = Math.max(size / img.width, size / img.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (size - img.width * k) / 2, (size - img.height * k) / 2, img.width * k, img.height * k);
      URL.revokeObjectURL(url);
      onChange(c.toDataURL('image/jpeg', 0.8));
    };
    img.src = url;
  };
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
      className={`w-11 h-11 shrink-0 rounded-lg overflow-hidden border flex items-center justify-center cursor-pointer ${over ? 'border-border-brand ring-2 ring-ring-brand' : 'border-border-default'} ${src ? 'bg-white' : 'bg-surface-alt'}`}
      title="Click or drop a photo"
    >
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <ImagePlus size={16} className="text-muted" />}
      <input type="file" accept="image/*" className="hidden" onChange={(e) => take(e.target.files?.[0])} />
    </label>
  );
}

// Shrink a receipt screenshot so it stores small but stays readable.
// Receipt photos live in their own app_state rows ('lr:<id>'); the order keeps just 'lr:<id>'.
// Big images inside the orders data (455 KB) made the Lights page take ~10 s to open (2026-11-12).
// Old receipts saved inline (data:...) still work. If saving the row fails, the photo stays inline.
let receiptOrg;
const receiptCache = new Map();
async function saveReceipt(dataUrl) {
  try {
    if (receiptOrg === undefined) receiptOrg = (await supabase.from('app_state').select('org_id').eq('key', 'greenteam-lightsOrders').maybeSingle()).data?.org_id || null;
    const ref = `lr:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { error } = await supabase.from('app_state').upsert({ key: ref, value: { img: dataUrl }, ...(receiptOrg ? { org_id: receiptOrg } : {}) }, { onConflict: 'key' });
    if (error) throw error;
    receiptCache.set(ref, dataUrl);
    return ref;
  } catch (e) {
    console.warn('[lights] receipt save failed, keeping it inline', e?.message);
    return dataUrl;
  }
}
const receiptUpload = async (file) => saveReceipt(await receiptImage(file));
// A job's plan: the quote's photos with the lines on them (read-only). Photos load when the job opens.
const planCache = new Map();
const planLoading = new Map();
// Load a quote's plan once (shared by every job card + the Jobs-tab preload, all in parallel).
// getQuote uses this browser's saved copy when it's current (instant); otherwise downloads the photos.
const actualCache = new Map(); // crew's measured feet (Team view) per quote
function loadPlan(quoteId) {
  if (!planLoading.has(quoteId)) {
    planLoading.set(quoteId, Promise.all([
      getQuote(quoteId).then((q) => { planCache.set(quoteId, (q?.angles || []).filter((a) => a.plain && (a.lines || []).length)); }).catch(() => { planCache.set(quoteId, []); }),
      supabase.from('app_state').select('value').eq('key', `lq-actual:${quoteId}`).maybeSingle()
        .then(({ data }) => { actualCache.set(quoteId, data?.value || null); }).catch(() => {}),
    ]));
  }
  return planLoading.get(quoteId);
}
function JobPlan({ quoteId }) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!quoteId || planCache.has(quoteId)) return undefined;
    let live = true;
    loadPlan(quoteId).then(() => { if (live) bump((x) => x + 1); });
    return () => { live = false; };
  }, [quoteId]);
  const sides = planCache.get(quoteId);
  if (!quoteId) return null;
  if (!sides) return <p className="text-xs text-muted">Loading plan…</p>;
  if (!sides.length) return <p className="text-xs text-muted">No lines drawn yet.</p>;
  // Crew's actual measurements (Team view): totals + any line 5+ ft off the plan.
  const act = actualCache.get(quoteId);
  const measured = (() => {
    if (!act?.actual || !Object.keys(act.actual).length) return null;
    let plan = 0; let actual = 0; let count = 0; const off = [];
    sides.forEach((sd, si) => (sd.lines || []).forEach((l, li) => {
      const v = act.actual[`${si}-${li}`]; if (v == null || v === '') return;
      count += 1; plan += Number(l.feet) || 0; actual += Number(v) || 0;
      if (Math.abs((Number(v) || 0) - (Number(l.feet) || 0)) >= 5) off.push(`section ${si + 1} line ${li + 1}: plan ${l.feet || '?'} → ${v} ft`);
    }));
    return { plan, actual, count, off };
  })();
  return (
    <div className="space-y-2">
    {measured && (
      <div className={`rounded-lg px-3 py-2 text-sm ${measured.off.length ? 'bg-yellow-500/10 text-yellow-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
        📏 Crew measured {measured.count} line{measured.count === 1 ? '' : 's'}: <b>{Math.round(measured.actual * 10) / 10} ft</b> actual vs <b>{Math.round(measured.plan * 10) / 10} ft</b> plan
        {measured.off.length > 0 && <span className="block text-xs">Off 5+ ft — {measured.off.join(' · ')}</span>}
      </div>
    )}
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {sides.map((side, i) => {
        const w = side.w || 1600; const h = side.h || 1200;
        return (
          <div key={i} className="relative rounded-lg overflow-hidden bg-black">
            <img src={side.plain} alt="" className="block w-full" />
            {side.w > 0 && (
              <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                <PlanOverlay lines={side.lines} jumps={side.jumps} w={w} h={h} tags />
                <OutletMarks outlets={side.outlets} w={w} h={h} />
                <OutletMarks inline outlets={side.inlines} w={w} h={h} />
              </svg>
            )}
          </div>
        );
      })}
    </div>
    </div>
  );
}

function useReceiptSrc(ref) {
  const isRef = typeof ref === 'string' && ref.startsWith('lr:');
  const [, bump] = useState(0); // re-render once the row arrives
  useEffect(() => {
    if (!isRef || receiptCache.has(ref)) return undefined;
    let live = true;
    supabase.from('app_state').select('value').eq('key', ref).maybeSingle().then(({ data }) => {
      receiptCache.set(ref, data?.value?.img || '');
      if (live) bump((x) => x + 1);
    });
    return () => { live = false; };
  }, [ref, isRef]);
  return isRef ? receiptCache.get(ref) || '' : ref;
}
function ReceiptImg({ src, ...props }) {
  const url = useReceiptSrc(src);
  return url ? <img src={url} {...props} /> : <span className={`${props.className || ''} inline-block animate-pulse`} />;
}

function receiptImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1100 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function NumInput({ value, onChange, className = '' }) {
  return (
    <input
      value={value}
      inputMode="decimal"
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      className={`w-20 rounded-md border border-border-strong bg-card px-2 py-1 text-sm text-primary text-right outline-none focus:ring-2 focus:ring-ring-brand ${className}`}
    />
  );
}

// The material list used on both jobs and quotes: photo, name, amount, cost, a note
// (✏️ — highlights the row) and remove. fallbackNotes = notes from the quote, shown on
// the job until the job has its own note for that item.
function MaterialRows({ mats, items, locked, onQty, onRemove, notes = {}, fallbackNotes = {}, onNote }) {
  const [noteOpen, setNoteOpen] = useState('');
  const itemById = (id) => items.find((x) => x.id === id);
  return (
    <div className="space-y-1.5">
      {groupSupplies(Object.keys(mats).map((id) => itemById(id) || { id, name: 'Removed item' })).flatMap(([, , its]) => its).map(({ id }) => {
        const it = itemById(id); const qty = mats[id];
        const note = notes[id] !== undefined ? notes[id] : (fallbackNotes[id] || '');
        return (
          <div key={id} className={note ? 'rounded-lg bg-yellow-500/[0.10] ring-1 ring-yellow-500/40 -mx-2 px-2 py-1' : ''}>
            <div className="flex items-center gap-2.5">
              {it?.image ? <img src={it.image} alt="" className="w-8 h-8 rounded-md object-cover bg-white" /> : <div className="w-8 h-8 rounded-md bg-surface-alt" />}
              <span className="flex-1 text-sm text-primary truncate">{it?.name || 'Removed item'}</span>
              <input value={qty} inputMode="decimal" disabled={locked} onChange={(e) => onQty(id, e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-20 rounded-md border border-border-strong bg-card px-2 py-1 text-sm text-primary text-right disabled:opacity-60" />
              <span className="w-12 text-xs text-muted">{it?.unit}</span>
              <span className="w-20 text-right text-sm text-secondary tabular-nums">{n(qty) && n(it?.cost) ? `$${(n(qty) * n(it.cost)).toFixed(2)}` : '—'}</span>
              {onNote && <button onClick={() => setNoteOpen(noteOpen === id ? '' : id)} className={`p-1 cursor-pointer ${note ? 'text-yellow-400' : 'text-muted/50 hover:text-primary'}`} title={note ? 'Edit note' : 'Add a note'}><Pencil size={13} /></button>}
              {!locked && <button onClick={() => onRemove(id)} className="p-1 text-muted hover:text-red-500 cursor-pointer" title="Remove"><Trash2 size={13} /></button>}
            </div>
            {noteOpen === id ? (
              <input autoFocus value={note} onChange={(e) => onNote(id, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setNoteOpen(''); }} onBlur={() => setNoteOpen('')}
                placeholder="Note for this item (e.g. use the black ones, bring extra)…"
                className="mt-1 ml-[42px] w-[calc(100%-42px)] rounded-md border border-border-strong bg-card px-2 py-1 text-xs text-primary outline-none focus:border-brand" />
            ) : note ? <p onClick={() => onNote && setNoteOpen(id)} className="mt-0.5 ml-[42px] text-xs text-yellow-400 cursor-pointer">📝 {note}</p> : null}
          </div>
        );
      })}
      {!Object.keys(mats).length && <p className="text-xs text-muted">No materials yet.</p>}
    </div>
  );
}

// Must-have checklist: red = missing (tap to add), yellow = added but no amount, green = done.
function MustHaveChips({ mats, items, onAdd, readOnly }) {
  const onJob = Object.keys(mats || {}).map((id) => items.find((x) => x.id === id)).filter(Boolean);
  const list = MUST_HAVE.map(([label, test]) => {
    const present = onJob.filter(test);
    return { label, present: present.length > 0, filled: present.some((it) => n(mats[it.id]) > 0), pick: pickBlack(items, test) };
  });
  const missing = list.filter((c) => !c.filled).length;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {list.map((c) => (
        <button key={c.label} disabled={readOnly || c.present || !c.pick} onClick={() => c.pick && onAdd(c.pick)}
          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${c.filled ? 'border-emerald-500/40 text-emerald-400' : c.present ? 'border-yellow-500/50 text-yellow-400' : `border-red-500/50 text-red-400 ${readOnly ? '' : 'hover:bg-red-500/10 cursor-pointer'}`}`}
          title={c.filled ? 'Done' : c.present ? 'Type how many' : c.pick ? `Add ${c.pick.name}` : 'Add this item to Material first'}>
          {c.filled ? '✓' : c.present ? '…' : '+'} {c.label}
        </button>
      ))}
      {missing > 0 && <span className="text-[11px] text-muted ml-1">{missing} to go</span>}
    </div>
  );
}

// Materials on a quote: plug in what the job will take (fills the job when it's sold).
// What part each item plays, so a color pick can swap it for the same part in another color.
const ROLE_OF = (name = '') => (/plug/i.test(name) ? (/female/i.test(name) ? 'female' : /gilbert one/i.test(name) ? 'gilbert' : /\bmale\b/i.test(name) ? 'male' : '')
  : /socket\s*wire/i.test(name) ? 'socket' : /zip/i.test(name) ? 'zip' : /shingle tab/i.test(name) ? 'tab' : '');
const colorRe = (c) => new RegExp(`\\b${c}\\b`, 'i');

export function QuoteMaterialsCard({ value, onChange, quote, notes, onNotes, wire, onWire, photos = [], power, onPower, powerPhoto = '', onPowerPhoto = null, part = 'all', designs = [], design, onDesign, start = 1, only = null, before = null, groups = null, customColor = '', onCustomColor = null }) {
  const [bigPhoto, setBigPhoto] = useState('');
  const [items] = useLightsSupplies();
  const list = items || [];
  // Same as jobs: a timer + male and female plugs are always on it unless you remove them.
  // (A removed one is kept as 0 so it doesn't come right back.)
  const all = withDefaults(value || {}, list);
  const mats = Object.fromEntries(Object.entries(all).filter(([, q]) => q !== 0));
  const itemById = (id) => list.find((x) => x.id === id);
  const set = (id, qty) => onChange({ ...all, [id]: qty });
  const isAuto = (id) => AUTO_ON_JOB.some(([re, , not]) => re.test(itemById(id)?.name || '') && !(not && not.test(itemById(id)?.name || '')));
  const drop = (id) => { const m = { ...all }; if (isAuto(id)) m[id] = 0; else delete m[id]; onChange(m); };
  const ft = quoteFeet(quote);
  const fill = () => {
    const filled = { ...all, ...quoteMaterials(quote, list) };
    MUST_HAVE.forEach(([, test]) => { if (!Object.keys(filled).some((id) => itemById(id) && test(itemById(id)))) { const it = pickBlack(list, test); if (it) filled[it.id] = defaultQty(it); } });
    onChange(filled);
  };
  const cost = Object.entries(mats).reduce((t, [id, qty]) => t + n(qty) * n(itemById(id)?.cost), 0);
  // Materials never refill on their own (it overwrote hand-entered amounts). Only the
  // "Fill from measurements" button puts in amounts from the feet.
  // Swap every item of these parts to the picked color (same amounts).
  const swapColor = (roles, color, base = all) => {
    const next = { ...base };
    Object.keys(base).forEach((id) => {
      const it = itemById(id); const role = ROLE_OF(it?.name);
      if (!it || !roles.includes(role) || colorRe(color).test(it.name)) return;
      const to = list.find((x) => ROLE_OF(x.name) === role && colorRe(color).test(x.name));
      if (!to) return;
      const qty = base[id]; delete next[id];
      if (qty !== 0) next[to.id] = qty; else next[to.id] = 0;
    });
    return next;
  };
  const plugColor = Object.keys(mats).some((id) => ['male', 'female'].includes(ROLE_OF(itemById(id)?.name)) && /black/i.test(itemById(id)?.name)) ? 'black' : 'green';
  const timers = list.filter((x) => catOf(x) === 'timer');
  const pickTimer = (t) => {
    const next = { ...all };
    timers.forEach((x) => { if (x.id !== t.id && x.id in next) next[x.id] = 0; });
    next[t.id] = n(next[t.id]) || 1;
    onChange(next);
  };
  const showQ = part !== 'materials';
  const showM = part !== 'questions';
  return (
    <div className={part === 'all' ? 'rounded-xl border border-border-default bg-card p-4 space-y-3' : 'space-y-3'}>
      {/* Quick questions — each answer swaps the matching items below. */}
      {showQ && (() => {
        const opt = (on, onClick, children, key) => (
          <button key={key} onClick={onClick}
            className={`flex-1 min-w-[110px] inline-flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold cursor-pointer transition-colors ${on ? 'border-white/50 bg-surface-alt text-primary' : 'border-border-default text-secondary hover:border-border-strong hover:text-primary'}`}>
            {on && <span className="text-primary">✓</span>}{children}
          </button>
        );
        const dot = (c) => <span className="w-4 h-4 rounded-full border border-black/30" style={{ background: c }} />;
        // Every question looks the same: card, number, question, even grid of answers.
        const q = (num, label, buttons, cols = 'grid-cols-2', extra = null, warn = false) => (
          <div className="rounded-xl border border-border-default bg-surface-alt/30 p-4 space-y-3">
            <p className="flex items-center gap-2.5 text-base font-semibold text-primary">
              <span className="w-6 h-6 shrink-0 rounded-full bg-surface-alt text-xs font-bold text-secondary flex items-center justify-center">{num}</span>
              {label}
              {warn && <span className="ml-auto rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-400">Ask them</span>}
            </p>
            <div className={`grid gap-2 ${cols}`}>{buttons}</div>
            {extra}
          </div>
        );
        // Question numbers: power, wire, plugs, timer, mockup color (skipping any that aren't shown).
        // Which questions show here (only = a list of them), numbered in order from `start`.
        const has = (k) => !only || only.includes(k);
        const shown = [['design', onDesign && designs.length > 0 && has('design')], ['power', onPower && has('power')], ['wire', onWire && has('wire')], ['plugs', has('plugs')], ['timer', timers.length > 1 && has('timer')]]
          .filter(([, on]) => on).map(([k]) => k);
        const num = (k) => start + shown.indexOf(k);
        const nPower = num('power'); const nWire = num('wire'); const nPlugs = num('plugs'); const nTimer = num('timer'); const nDesign = num('design');
        const POWER = ['Front porch', 'Garage', 'Side of house', 'Back'];
        const powerSpot = POWER.find((p) => power?.startsWith(p)) || '';
        return (
          <div className="space-y-3">
            {before}
            {photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((src, i) => (
                  <img key={i} src={src} alt={`Side ${i + 1}`} onClick={() => setBigPhoto(src)} className="h-24 rounded-lg object-cover cursor-zoom-in border border-border-default" />
                ))}
              </div>
            )}
            {shown.includes('design') && q(nDesign, 'What color do they want?', designs.map((d) => opt(design === d.id, () => onDesign(d.id), <>
              {d.colors.length > 0 && <span className="flex -space-x-1">{d.colors.map((c) => <span key={c} className="w-4 h-4 rounded-full border border-black/30" style={{ background: c }} />)}</span>}
              {d.label}
            </>, d.id)), 'grid-cols-3', design === 'custom' && onCustomColor ? (
              <input value={customColor} onChange={(e) => onCustomColor(e.target.value)} autoFocus={!customColor}
                placeholder="Type the custom colors — e.g. alternating blue and cool white"
                className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:border-brand" />
            ) : null)}
            {shown.includes('power') && q(nPower, "Where's the power?", POWER.map((p) => opt(power?.startsWith(p), () => onPower(power?.startsWith(p) ? '' : p), p, p)), 'grid-cols-4',
              <input value={powerSpot ? power.slice(powerSpot.length).replace(/^\s*—\s*/, '') : (power || '')}
                onChange={(e) => onPower(powerSpot ? (e.target.value ? `${powerSpot} — ${e.target.value}` : powerSpot) : e.target.value)}
                placeholder="Details — e.g. GFCI left of garage door, outlet under porch light"
                className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:border-brand" />)}
            {shown.includes('power') && onPowerPhoto && (
              powerPhoto ? (
                <div className="relative inline-block">
                  <img src={powerPhoto} alt="Where the power is" onClick={() => setBigPhoto(powerPhoto)} className="h-40 rounded-lg object-cover cursor-zoom-in border border-border-default" />
                  <button onClick={() => onPowerPhoto('')} title="Remove photo" className="absolute top-1.5 right-1.5 rounded-md bg-black/70 px-2 py-0.5 text-xs font-semibold text-white cursor-pointer hover:bg-black">Remove</button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-strong px-3 py-4 text-sm font-semibold text-secondary cursor-pointer hover:border-brand hover:text-primary">
                  📷 Add a photo of the outlet
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0]; e.target.value = '';
                    if (!f) return;
                    const img = new Image(); const url = URL.createObjectURL(f);
                    img.onload = () => {
                      const k = Math.min(1, 1200 / Math.max(img.width, img.height));
                      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
                      onPowerPhoto(c.toDataURL('image/jpeg', 0.7));
                    };
                    img.src = url;
                  }} />
                </label>
              )
            )}
            {shown.includes('wire') && q(nWire, 'What color wire?', ['white', 'black'].map((c) => opt(wire === c, () => {
              onWire(c);
              // Just swap colors — same amounts. Amounts only change when you hit Fill.
              onChange(swapColor(['socket', 'zip', 'tab'], c));
            }, <>{dot(c === 'white' ? '#fff' : '#111')} {c === 'white' ? 'White' : 'Black'}</>, c)))}
            {shown.includes('plugs') && q(nPlugs, 'What color plugs?', ['green', 'black'].map((c) => opt(plugColor === c, () => onChange(swapColor(['male', 'female', 'gilbert'], c)), <>{dot(c === 'green' ? '#1f8a3b' : '#111')} {c === 'green' ? 'Green' : 'Black'}</>, c)))}
            {shown.includes('timer') && q(nTimer, 'Which timer?', timers.map((t) => opt(n(mats[t.id]) > 0, () => pickTimer(t), <>
              {t.image && <img src={t.image} alt="" className="w-7 h-7 rounded-md object-cover bg-white" />}
              {/digital/i.test(t.name) ? 'Digital' : /photo/i.test(t.name) ? 'Photocell' : t.name.split(' ').slice(0, 2).join(' ')}
            </>, t.id)))}
          </div>
        );
      })()}
      {bigPhoto && <div onClick={() => setBigPhoto('')} className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"><img src={bigPhoto} alt="" className="max-w-full max-h-full rounded-lg" /></div>}
      {showM && <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-muted">Hit ⚡ Fill from measurements to put in amounts — nothing changes on its own. Becomes the job's materials when it's sold.</p>
        {ft > 0 && <button onClick={fill} className="px-3 py-1.5 rounded-lg border border-border-brand bg-brand-light text-xs font-semibold text-brand-text-strong hover:brightness-110 cursor-pointer">⚡ Fill from measurements ({ft} ft)</button>}
      </div>
      <MustHaveChips mats={mats} items={list} onAdd={(it) => set(it.id, defaultQty(it))} />
      {groups ? (() => {
        // Grouped: each plan need, then the items for it — so you can tell at a glance it adds up.
        const used = new Set();
        const rows = groups.map((g) => {
          const ids = Object.keys(mats).filter((id) => !used.has(id) && itemById(id) && g.test(itemById(id)));
          ids.forEach((id) => used.add(id));
          return { ...g, ids };
        });
        const other = Object.keys(mats).filter((id) => !used.has(id));
        if (other.length) rows.push({ section: 'Other', label: 'Other', amt: '', detail: 'added by hand', ids: other });
        const sections = [];
        rows.forEach((r) => { const last = sections[sections.length - 1]; if (last && last.name === r.section) last.rows.push(r); else sections.push({ name: r.section, rows: [r] }); });
        const onNote = onNotes ? (id, v) => onNotes({ ...(notes || {}), [id]: v }) : null;
        return (
          <div className="space-y-4">
            {sections.map((sec) => (
            <div key={sec.name} className="rounded-xl border border-border-default overflow-hidden">
              <p className="px-3 py-2.5 bg-surface-alt text-base font-bold text-primary">{sec.name}</p>
              <div className="divide-y divide-border-subtle">
            {sec.rows.map((g) => {
              const have = g.ids.reduce((t, id) => t + n(mats[id]), 0);
              const ok = g.want == null || have === g.want;
              return (
                <div key={g.label}>
                  <div className="flex items-baseline gap-3 px-3 pt-2.5 pb-1">
                    <span className="text-sm font-semibold text-primary">{g.label}</span>
                    {g.amt && <span className="text-sm font-bold text-primary tabular-nums">{g.amt}</span>}
                    {g.detail && <span className="text-xs text-muted">{g.detail}</span>}
                    {g.want != null && g.want > 0 && (ok
                      ? <span className="ml-auto text-xs font-semibold text-brand-text">✓ {have}</span>
                      : <span className="ml-auto text-xs font-semibold text-yellow-400">items add up to {have}, plan needs {g.want}</span>)}
                  </div>
                  <div className="px-2 py-1">
                    {g.ids.length
                      ? <MaterialRows mats={Object.fromEntries(g.ids.map((id) => [id, mats[id]]))} items={list} onQty={set} onRemove={drop} notes={notes || {}} onNote={onNote} />
                      : <p className="px-1 py-1.5 text-xs text-muted">Nothing yet — hit ⚡ Fill.</p>}
                  </div>
                </div>
              );
            })}
              </div>
            </div>
            ))}
          </div>
        );
      })() : (
      <MaterialRows mats={mats} items={list} onQty={set} onRemove={drop}
        notes={notes || {}} onNote={onNotes ? (id, v) => onNotes({ ...(notes || {}), [id]: v }) : null} />
      )}
      <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
        <MaterialPicker items={list.filter((x) => !(x.id in mats))} onPick={(id) => set(id, defaultQty(itemById(id)))} />
        {cost > 0 && <span className="ml-auto text-sm text-muted">Materials <b className="text-primary tabular-nums">${cost.toFixed(2)}</b></span>}
      </div>
      </>}
    </div>
  );
}

function useLightsSupplies() {
  const stored = useAppStore((s) => s.lightsSupplies);
  const setSupplies = useAppStore((s) => s.setLightsSupplies);
  // null = not loaded from the cloud yet; [] = loaded and empty
  return [stored || [], setSupplies, Array.isArray(stored) && stored.length === 0, stored == null];
}

// Lights visits on the Jobber schedule this season (Nov 1 → Feb 1).
const isLightsTitle = (t) => /\b(lights?|lites?|lighting)\b|christmas/i.test(t || '');

// Jobber data for the Lights page. Shows the last copy instantly (saved in this
// browser), then refreshes in the background, so the page never sits empty.
const useLightsSchedule = (enabled, tick) => useJobberList('recent-jobs', 'jobs', enabled, tick);
const useJobberLightsQuotes = (enabled, tick) => useJobberList('lights-quotes', 'quotes', enabled, tick);
const useLightsRequests = (enabled, tick) => useJobberList('lights-requests', 'requests', enabled, tick);

const JOBBER_STATUS = {
  draft: ['Draft', 'bg-surface-alt text-secondary'],
  awaiting_response: ['Sent', 'bg-blue-500/15 text-blue-400'],
  changes_requested: ['Changes asked', 'bg-yellow-500/15 text-yellow-400'],
  approved: ['Approved', 'bg-brand-light text-brand-text-strong'],
  converted: ['Job created', 'bg-emerald-500/15 text-emerald-400'],
  archived: ['Archived', 'bg-red-500/15 text-red-400'],
};


export default function LightsBusiness({ view, onOpen = null }) {
  const [tick, setTick] = useState(0); // ↻ Refresh: pull fresh from Jobber
  const needsJobber = view === 'quotes' || view === 'jobs' || view === 'supplies' || view === 'sales';
  const schedule = useLightsSchedule(needsJobber, tick);
  const jobber = useJobberLightsQuotes(needsJobber, tick);
  const lightsReq = useLightsRequests(needsJobber, tick);
  const coldLeads = useAppStore((st) => st.lightsColdLeads) || [];
  const setColdLeads = useAppStore((st) => st.setLightsColdLeads);
  const ordersStored = useAppStore((st) => st.lightsOrders);
  const setOrders = useAppStore((st) => st.setLightsOrders);
  const returnsStored = useAppStore((st) => st.lightsReturns);
  const setReturns = useAppStore((st) => st.setLightsReturns);
  const [retDraft, setRetDraft] = useState(null); // { itemId, qty, from, refund } — adding a return
  const [orderDraft, setOrderDraft] = useState(null);
  const [openOrder, setOpenOrder] = useState('');
  const [receiptView, setReceiptView] = useState('');
  const [dropOn, setDropOn] = useState('');
  const jobsStored = useAppStore((st) => st.lightsJobs);
  const setJobsMap = useAppStore((st) => st.setLightsJobs);
  const [filter, setFilter] = useState('cold'); // dashboard card open: cold (My list, default), booked, sent, scheduled, won, closed
  const [editing, setEditing] = useState(''); // supply row open for editing
  const [doneOpen, setDoneOpen] = useState([]); // installed jobs whose materials are expanded
  const [installing, setInstalling] = useState(null); // { id, draft } — "what did you actually use?"
  const [openJob, setOpenJob] = useState(''); // Jobs tab: the one job clicked open
  const [openGroups, setOpenGroups] = useState({}); // Jobs tab: collapsible groups (Prepped / Installed)
  const [rawItems, setItems, empty, notLoaded] = useLightsSupplies();
  // "On order" = lines on every on-the-way order (always in sync, however the
  // order got added) + anything marked ordered without a receipt (extraOnOrder).
  const items = useMemo(() => {
    const q = {};
    (ordersStored || []).filter((o) => o.status === 'otw').forEach((o) => (o.lines || []).forEach((l) => {
      if (l.itemId && n(l.qty) && !l.arrived) q[l.itemId] = (q[l.itemId] || 0) + n(l.qty); // arrived lines are in Have, not coming
    }));
    return (rawItems || []).map((x) => ({ ...x, onOrder: n(x.extraOnOrder) + (q[x.id] || 0) }));
  }, [rawItems, ordersStored]);
  const [quotes, setQuotes] = useState([]);
  const [quotesReady, setQuotesReady] = useState(false); // quotes load ~2 s after the page; don't say "no quote" before then
  // Jobs pull their materials straight from their quote — one source, always in sync.
  // (Installed jobs keep what was actually used.) A job with no quote keeps its own list.
  const jobsMap = useMemo(() => {
    const raw = jobsStored || {};
    const live = Object.fromEntries((schedule.jobs || []).map((j) => [j.id, j]));
    const ids = new Set([...Object.keys(raw), ...(schedule.jobs || []).filter((j) => j.status !== 'archived' && isLightsTitle(j.title)).map((j) => j.id)]);
    const out = {};
    ids.forEach((id) => {
      const j = raw[id] || { clientName: live[id]?.clientName, title: live[id]?.title, date: live[id]?.visitAt };
      if (j.installed) { out[id] = j; return; }
      const q = matchQuote(quotes, { quoteId: j.quoteId, clientId: live[id]?.clientId, clientName: j.clientName || live[id]?.clientName });
      // "Real" materials = anything besides the default plugs + timer every quote shows.
      const isDefault = (itemId) => { const nm = items.find((x) => x.id === itemId)?.name || ''; return AUTO_ON_JOB.some(([re, , not]) => re.test(nm) && !(not && not.test(nm))); };
      const real = (m) => Object.entries(m || {}).filter(([k, v]) => n(v) > 0 && !isDefault(k));
      const same = (a, b) => { const A = Object.fromEntries(Object.entries(a || {}).filter(([, v]) => n(v) > 0).map(([k, v]) => [k, n(v)])); const B = Object.fromEntries(Object.entries(b || {}).filter(([, v]) => n(v) > 0).map(([k, v]) => [k, n(v)])); return Object.keys(A).length === Object.keys(B).length && Object.keys(A).every((k) => A[k] === B[k]); };
      if (!q) { if (raw[id]) out[id] = { ...j, noQuote: true }; return; }
      const fromQ = { ...j, materials: q.materials || {}, matNotes: q.matNotes || {}, confirmed: !!q.matOk, fromQuote: q.id };
      if (!real(j.materials).length || j.oldResolved || same(j.materials, q.materials)) { out[id] = fromQ; return; }
      // Old copy on the job that differs from the quote: you pick which one is right (one time).
      if (!real(q.materials).length) out[id] = { ...j, fromQuote: q.id, needsMove: true, oldList: j.materials };
      else out[id] = { ...fromQ, conflict: true, oldList: j.materials };
    });
    return out;
  }, [jobsStored, quotes, schedule.jobs, items]);

  const refresh = () => listQuotes().then((qs) => { setQuotes(qs); setQuotesReady(true); }).catch(() => {});
  // Jobs tab: start loading every quote's plan at once, so opening any job shows its plan right away.
  // One at a time (photos are big — all at once clogged the connection for 20+ s). Uses this browser's saved copy when current.
  useEffect(() => {
    if (view !== 'jobs' || !quotesReady) return undefined;
    let stop = false;
    (async () => { await new Promise((r) => setTimeout(r, 1500)); for (const q of quotes) { if (stop) break; if (q.id) await loadPlan(q.id); } })();
    return () => { stop = true; };
  }, [view, quotesReady, quotes]);
  useEffect(() => { refresh(); }, [view]);

  const patchItem = (id, p) => setItems((list) => (list || []).map((x) => (x.id === id ? { ...x, ...p } : x)));

  // Committed = materials entered on Jobs that aren't installed yet, plus Won
  // Hub quotes whose client doesn't have a job entry yet.
  const committed = useMemo(() => {
    const out = {};
    const add = (mats) => Object.entries(mats || {}).forEach(([id, qty]) => { out[id] = (out[id] || 0) + n(qty); });
    const jobClients = new Set();
    Object.values(jobsMap).forEach((j) => {
      jobClients.add(nameKey(j.clientName));
      if (!j.installed) add(withDefaults(j.materials, items, j.noAuto));
    });
    quotes.filter((q) => statusOf(q) === 'won' && !jobClients.has(nameKey(q.clientInfo?.name || q.client)))
      .forEach((q) => add(withDefaults(q.materials, items)));
    return out;
  }, [quotes, items, jobsMap]);



  // ---------------- Jobs ----------------
  // A job manager: every lights job moves itself through the steps —
  // materials → scheduled in Jobber → stock → ready to install → wrap-up → done.
  if (view === 'jobs') {
    const lightsClients = new Set([...jobber.quotes.map((q) => nameKey(q.clientName)), ...lightsReq.requests.map((r) => nameKey(r.clientName))]);
    const jobberJobs = schedule.jobs.filter((j) => j.status !== 'archived'
      && (isLightsTitle(j.title) || (!j.title.trim() && lightsClients.has(nameKey(j.clientName)))));
    // Every job always has a timer + plugs unless it's installed (then it's what was used).
    const withTimer = (saved) => (saved.installed ? saved : { ...saved, materials: withDefaults(saved.materials, items, saved.noAuto) });
    const all = jobberJobs.map((j) => ({ ...j, saved: withTimer(jobsMap[j.id] || {}) }));
    const readyById = Object.fromEntries(jobReadiness(jobsMap, items, ordersStored, schedule.jobs).map((r) => [r.id, r]));
    const patchJob = (j, p) => setJobsMap((m) => ({ ...(m || {}), [j.id]: { clientName: j.clientName, title: j.title, date: j.visitAt, ...((m || {})[j.id] || {}), ...p } }));
    const itemById = (id) => items.find((x) => x.id === id);
    // A quote you linked by hand wins; otherwise match by Jobber client / name.
    const jobQuote = (j) => matchQuote(quotes, { quoteId: j.saved?.quoteId, clientId: j.clientId, clientName: j.clientName });
    const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'no date');
    const DAY = 864e5;

    // What actually went up on the house (falls back to the plan for older installs).
    const usedOf = (j) => j.saved.actual || j.saved.materials || {};
    const moveStock = (mats, dir) => setItems((list) => (list || []).map((x) => (n(mats[x.id])
      ? { ...x, onHand: n(x.onHand) - dir * n(mats[x.id]), used: Math.max(0, n(x.used) + dir * n(mats[x.id])) } : x)));
    const finishInstall = (j, actual) => {
      moveStock(actual, 1);
      patchJob(j, { installed: true, installedAt: new Date().toISOString(), actual });
      setInstalling(null);
    };
    const undoInstall = (j) => { moveStock(usedOf(j), -1); patchJob(j, { installed: false, installedAt: null, actual: null }); };
    // Fix a number after the fact: stock moves by the difference only.
    const setActual = (j, id, qty) => {
      const prev = usedOf(j); const delta = n(qty) - n(prev[id]);
      if (delta) moveStock({ [id]: delta }, 1);
      patchJob(j, { actual: { ...prev, [id]: qty } });
    };

    const WRAP = [['pics', '📸 After pics'], ['review', '⭐ Asked for a review'], ['sign', '🪧 Yard sign'], ['fb', '📣 Facebook post'], ['hangers', '🚪 Door hangers on neighbors']];
    const wrapOf = (j) => {
      const w = j.saved.wrap || {};
      return { pics: (j.saved.afterPhotos || []).length > 0, review: !!(w.review || j.saved.reviewed), sign: !!w.sign, fb: !!w.fb, hangers: !!w.hangers };
    };
    const stageOf = (j) => {
      const { inst, take } = jobVisits(j);
      if (j.saved.installed) {
        const w = wrapOf(j);
        if (!WRAP.every(([k]) => w[k])) return 'wrap';
        if (take?.startAt && !take.done && new Date(take.startAt) - new Date().getTime() < 14 * DAY) return 'takedown';
        return 'done';
      }
      if (!j.saved.confirmed) return 'materials';
      if (!inst?.startAt || !take?.startAt) return 'schedule';
      const rd = readyById[j.id];
      if (rd && (rd.problems.length || rd.late)) return 'stock';
      return 'ready';
    };
    const instAt = (j) => new Date(jobVisits(j).inst?.startAt || j.visitAt || 8.64e15);
    const STAGES = [
      ['materials', '📝 Needs materials', 'New from Jobber — plug in what it takes, then confirm', (a, b) => n(b.jobNumber) - n(a.jobNumber)],
      ['schedule', '📅 Needs scheduling', 'Install or takedown visit missing in Jobber'],
      ['stock', '📦 Waiting on stock', 'Short, or waiting on an order to land'],
      ['ready', '✅ Ready to install', 'Everything’s in stock — soonest first'],
      ['wrap', '🎉 Wrap-up', 'Installed — get the most out of it before it’s done'],
      ['takedown', '🧰 Takedown soon', 'Coming down in the next 2 weeks'],
      ['done', 'Completed', ''],
    ];
    const byStage = Object.fromEntries(STAGES.map(([k, , , sort]) => [k, all.filter((j) => stageOf(j) === k).sort(sort || ((a, b) => instAt(a) - instAt(b)))]));

    // Small "photo + number" chips (materials at a glance).
    const chips = (mats, tone = 'bg-surface-alt text-primary') => (
      <div className="flex items-center gap-1.5 flex-wrap">
        {groupSupplies(Object.keys(mats).filter((id) => n(mats[id])).map((id) => itemById(id) || { id, name: 'Removed item' })).flatMap(([, , its]) => its).map((it) => (
          <span key={it.id} title={it.name} className={`inline-flex items-center gap-1.5 rounded-md pl-0.5 pr-2 py-0.5 ${tone}`}>
            {it.image ? <img src={it.image} alt="" className="w-7 h-7 rounded object-cover bg-white" /> : <span className="w-7 h-7 rounded bg-surface-alt" />}
            <b className="text-sm tabular-nums">{n(mats[it.id])}</b>
          </span>
        ))}
      </div>
    );

    // Each material with where it stands: ✓ in stock, 📦 coming on order #, 🔴 short.
    const statusChips = (j, mats) => {
      const rd = readyById[j.id];
      return (
        <div className="flex items-start gap-1.5 flex-wrap">
          {groupSupplies(Object.keys(mats).filter((id) => n(mats[id])).map((id) => itemById(id) || { id, name: 'Removed item' })).flatMap(([, , its]) => its).map((it) => {
            const short = rd?.problems.find((p) => p.id === it.id);
            const wait = rd?.waiting.find((w) => w.id === it.id);
            const [tag, tone] = short ? [`short ${short.qty}`, 'text-red-400 bg-red-500/10'] : wait ? [wait.orders.length ? `#${wait.orders.join(' + #')} coming` : 'coming', 'text-blue-300 bg-blue-500/10'] : ['✓ in stock', 'text-emerald-400 bg-emerald-500/10'];
            return (
              <span key={it.id} title={`${it.name}${short ? ` · ${short.note}` : ''}`} className="inline-flex flex-col items-center gap-0.5 rounded-md bg-surface-alt px-1 pt-1 pb-0.5 min-w-[64px]">
                <span className="inline-flex items-center gap-1.5">
                  {it.image ? <img src={it.image} alt="" className="w-7 h-7 rounded object-cover bg-white" /> : <span className="w-7 h-7 rounded bg-card" />}
                  <b className="text-sm tabular-nums text-primary">{n(mats[it.id])}</b>
                </span>
                <span className={`w-full text-center rounded px-1 text-[10px] font-semibold ${tone}`}>{tag}</span>
              </span>
            );
          })}
        </div>
      );
    };

    const visitChips = (j) => {
      const { inst, take } = jobVisits(j);
      const fmtV = (v) => new Date(v.startAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      const chip = (label, v) => (
        !v ? <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-red-500/15 text-red-400">⚠️ {label}: no visit in Jobber</span>
          : !v.startAt ? <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-red-500/15 text-red-400" title={v.title}>⚠️ {label}: not scheduled</span>
            : <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${v.done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-alt text-primary'}`} title={v.title}>{label}: {fmtV(v)}{v.done ? ' ✓' : ''}</span>
      );
      return <div className="flex items-center gap-1.5 flex-wrap">{chip('🔨 Install', inst)}{chip('📦 Takedown', take)}</div>;
    };

    const stockLine = (j) => {
      const rd = readyById[j.id]; if (!rd) return null;
      const row = (label, tone, list, note) => (
        <div className="flex items-center gap-2 flex-wrap"><span className={`text-xs font-semibold ${tone}`}>{label}</span>{list.map((w) => (
          <span key={w.id} title={`${w.name}${note(w)}`} className={`inline-flex items-center gap-1.5 rounded-md pl-0.5 pr-2 py-0.5 ${tone === 'text-red-400' ? 'bg-red-500/10' : 'bg-blue-500/10'}`}>
            {w.image ? <img src={w.image} alt="" className="w-7 h-7 rounded object-cover bg-white" /> : <span className="w-7 h-7 rounded bg-surface-alt" />}
            <b className={`text-sm tabular-nums ${tone}`}>{w.qty}</b>
            {w.note && <span className="text-[10px] text-muted">{w.note}</span>}
          </span>
        ))}</div>
      );
      if (rd.problems.length) return row('🔴 Short:', 'text-red-400', rd.problems, (w) => ` · ${w.note}`);
      if (rd.late) return row(`📦 Waiting on${rd.landBy && !rd.landEst ? ` (lands ${rd.landBy.toLocaleDateString([], { month: 'short', day: 'numeric' })})` : ''}:`, 'text-blue-400', rd.waiting, (w) => (w.orders.length ? ` · order #${w.orders.join(' + #')}` : ''));
      return <span className="inline-block px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-500/15 text-emerald-400">✅ Everything’s in stock</span>;
    };

    // Materials on a job = its quote's Materials step (the one source). Shown here, edited in the quote.
    // One-time pick: move the job's old list into the quote, or keep the quote. Either way the
    // job stops having its own list (marked resolved; the old list is kept on the job as a backup).
    const moveIntoQuote = async (list) => {
      for (const j of list) {
        const q = quotes.find((x) => x.id === j.saved.fromQuote);
        // Keep what the quote had, so this can be undone.
        await patchQuoteMeta(j.saved.fromQuote, { materials: { ...(j.saved.oldList || {}) }, matNotes: { ...(j.saved.matNotes || {}) }, materialsBefore: { ...(q?.materials || {}) }, matNotesBefore: { ...(q?.matNotes || {}) } });
        patchJob(j, { oldResolved: true });
      }
      refresh();
    };
    const keepQuote = (j) => patchJob(j, { oldResolved: true });
    const editor = (j) => {
      const mats = Object.fromEntries(Object.entries(j.saved.materials || {}).filter(([, v]) => n(v) > 0));
      const cost = Object.entries(mats).reduce((t, [id, qty]) => t + n(qty) * n(itemById(id)?.cost), 0);
      return (
        <div className="space-y-2.5">
          {j.saved.needsMove && (
            <div className="rounded-lg border border-yellow-400/50 bg-yellow-400/10 p-3 flex items-center gap-3 flex-wrap">
              <p className="flex-1 text-sm text-yellow-300">This list is only on the job, not in the quote yet.</p>
              <button onClick={() => moveIntoQuote([j])} className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold cursor-pointer">Move into the quote</button>
            </div>
          )}
          {j.saved.noQuote && <p className="text-sm text-yellow-300">No quote linked. Link one above; materials live in the quote.</p>}
          {Object.keys(mats).length > 0 ? (
            <>
              <MustHaveChips mats={mats} items={items} readOnly onAdd={() => {}} />
              <MaterialRows mats={mats} items={items} locked onQty={() => {}} onRemove={() => {}} notes={j.saved.matNotes || {}} onNote={() => {}} />
            </>
          ) : <p className="text-sm text-muted">No materials in the quote yet.</p>}
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border-subtle">
            <span className="text-xs text-muted">{j.saved.fromQuote && !j.saved.needsMove ? 'From the quote. Always in sync.' : ''}</span>
            <span className="ml-auto text-sm text-muted">Materials <b className="text-primary tabular-nums">${cost.toFixed(2)}</b></span>
            {onOpen && j.saved.fromQuote && !j.saved.needsMove && <button onClick={() => onOpen(j.saved.fromQuote, 3)} className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold cursor-pointer">{j.saved.confirmed ? 'Edit in quote' : 'Finish in quote'}</button>}
          </div>
        </div>
      );
    };

    // "What did you actually use?" — before stock comes off.
    const installPanel = (j) => {
      const draft = installing.draft;
      return (
        <div className="rounded-lg border border-border-brand bg-brand-light/40 p-3 space-y-2">
          <p className="text-sm font-semibold text-primary">What did you actually use? <span className="text-xs font-normal text-muted">Stock comes off by these numbers.</span></p>
          {groupSupplies(Object.keys(draft).map((id) => itemById(id) || { id, name: 'Removed item' })).flatMap(([, , its]) => its).map((it) => (
            <div key={it.id} className="flex items-center gap-2.5">
              {it.image ? <img src={it.image} alt="" className="w-7 h-7 rounded object-cover bg-white" /> : <span className="w-7 h-7 rounded bg-surface-alt" />}
              <span className="flex-1 text-sm text-primary truncate">{it.name}</span>
              <span className="text-[11px] text-muted">planned {n(j.saved.materials?.[it.id])}</span>
              <input value={draft[it.id]} inputMode="decimal" onChange={(e) => setInstalling({ id: j.id, draft: { ...draft, [it.id]: e.target.value.replace(/[^0-9.]/g, '') } })}
                className="w-20 rounded-md border border-border-strong bg-card px-2 py-1 text-sm text-primary text-right" />
              <span className="w-10 text-xs text-muted">{it.unit}</span>
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 pt-1">
            <MaterialPicker items={items.filter((x) => !(x.id in draft))} onPick={(id) => setInstalling({ id: j.id, draft: { ...draft, [id]: '' } })} />
            <button onClick={() => setInstalling(null)} className="text-xs text-muted hover:text-primary cursor-pointer">Cancel</button>
            <button onClick={() => finishInstall(j, Object.fromEntries(Object.entries(draft).filter(([, v]) => n(v))))} className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold cursor-pointer">✓ Installed — take it out of stock</button>
          </div>
        </div>
      );
    };

    // After install: what was used (fixable — stock adjusts by the difference).
    const actualEditor = (j) => {
      const used = usedOf(j);
      return (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted">Actually used — fix any number and Material stock adjusts by the difference.</p>
          {groupSupplies(Object.keys(used).map((id) => itemById(id) || { id, name: 'Removed item' })).flatMap(([, , its]) => its).map((it) => (
            <div key={it.id} className="flex items-center gap-2.5">
              {it.image ? <img src={it.image} alt="" className="w-7 h-7 rounded object-cover bg-white" /> : <span className="w-7 h-7 rounded bg-surface-alt" />}
              <span className="flex-1 text-sm text-primary truncate">{it.name}</span>
              <input value={used[it.id]} inputMode="decimal" onChange={(e) => setActual(j, it.id, e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-20 rounded-md border border-border-strong bg-card px-2 py-1 text-sm text-primary text-right" />
              <span className="w-10 text-xs text-muted">{it.unit}</span>
            </div>
          ))}
          <div className="flex justify-end"><button onClick={() => undoInstall(j)} className="text-[11px] text-muted hover:text-red-400 underline cursor-pointer">Undo install (puts it all back in stock)</button></div>
        </div>
      );
    };

    const card = (j, stage) => {
      const open = doneOpen.includes(j.id);
      const toggle = () => setDoneOpen((d) => (open ? d.filter((x) => x !== j.id) : [...d, j.id]));
      const mats = stage === 'wrap' || stage === 'takedown' || stage === 'done' ? usedOf(j) : (j.saved.materials || {});
      const cost = Object.entries(mats).reduce((t, [id, qty]) => t + n(qty) * n(itemById(id)?.cost), 0);
      const w = wrapOf(j);
      return (
        <div key={j.id} className="p-4 space-y-3">
          {/* Top: what matters most — stock + the plan + its materials. Dates, links and buttons are at the bottom. */}
          {jobQuote(j)?.power && <p className="text-xs font-semibold text-yellow-400">🔌 Power: {jobQuote(j).power}</p>}
          {stage === 'materials' && jobQuote(j) && onOpen && (
            <p className="text-sm text-yellow-300">📝 Materials not confirmed yet — <button onClick={() => onOpen(jobQuote(j).id, 3)} className="underline font-semibold cursor-pointer">confirm them in the quote</button></p>
          )}
          {(stage === 'materials' || stage === 'stock' || stage === 'ready' || stage === 'schedule') && stockLine(j)}
          {installing?.id === j.id && installPanel(j)}

          {/* The plan: photos with the lines */}
          {jobQuote(j) && stage !== 'wrap' && stage !== 'takedown' && stage !== 'done' && <JobPlan quoteId={jobQuote(j).id} />}

          {(stage === 'materials' || stage === 'schedule' || stage === 'stock' || stage === 'ready') && (open ? editor(j) : (
            <div className="space-y-2"><MustHaveChips mats={mats} items={items} readOnly onAdd={() => {}} />{statusChips(j, mats)}</div>
          ))}

          {(stage === 'wrap' || stage === 'takedown' || stage === 'done') && (
            <>
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2.5 space-y-2.5">
                <p className="text-sm font-semibold text-emerald-400">✅ Installed {j.saved.installedAt ? fmtDate(j.saved.installedAt) : ''} — good job! 🎉</p>
                {/* The money on this job: Jobber price − materials that went up (at your costs) */}
                {(() => {
                  // Revenue: your number if you typed one, else Jobber's job total. Click it to edit.
                  const own = j.saved.revenue != null && j.saved.revenue !== '';
                  const rev = own ? n(j.saved.revenue) : n(j.total);
                  return (
                    <p className="text-sm text-secondary tabular-nums flex items-center gap-1 flex-wrap">
                      Job
                      <span className="inline-flex items-center rounded-md border border-border-strong bg-card px-1.5 focus-within:border-brand">
                        <span className="text-muted">$</span>
                        <input key={`${j.id}-${j.saved.revenue ?? ''}`} defaultValue={rev || ''} placeholder="price" inputMode="decimal" title="Click to change what this job brought in"
                          onBlur={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (v === String(rev || '')) return; patchJob(j, { revenue: v === '' ? null : v }); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          className="w-20 bg-transparent py-0.5 text-sm font-bold text-primary outline-none" />
                      </span>
                      {own && <button onClick={() => patchJob(j, { revenue: null })} title={`Back to Jobber's ${money(n(j.total))}`} className="text-[10px] text-muted hover:text-primary underline cursor-pointer">edited · reset</button>}
                      {rev > 0 ? (
                        <>− Materials <b className="text-primary">{money(cost)}</b> = <b className="text-brand-text text-base">{money(rev - cost)}</b>
                          <span className="text-muted"> · {Math.round(((rev - cost) / rev) * 100)}% left after materials</span></>
                      ) : (
                        <>· Materials <b className="text-primary">{money(cost)}</b> · <span className="text-yellow-400">type the job price</span></>
                      )}
                    </p>
                  );
                })()}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {WRAP.map(([k, label]) => (k === 'pics'
                    ? <span key={k} className={`px-2 py-1 rounded-md text-xs font-semibold ${w.pics ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface-alt text-muted'}`}>{w.pics ? '✓' : '○'} {label}</span>
                    : (
                      <button key={k} onClick={() => patchJob(j, k === 'review'
                        ? { reviewed: !w.review, wrap: { ...(j.saved.wrap || {}), review: !w.review } }
                        : { wrap: { ...(j.saved.wrap || {}), [k]: !w[k] } })}
                        className={`px-2 py-1 rounded-md text-xs font-semibold cursor-pointer ${w[k] ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface-alt text-secondary hover:text-primary'}`}>
                        {w[k] ? '✓' : '○'} {label}
                      </button>
                    )))}
                </div>
                <InstallWrapUp saved={j.saved} onPatch={(p) => patchJob(j, p)} hideReview />
              </div>
              {open ? actualEditor(j) : <div className="flex items-center justify-between gap-3">{chips(mats)}</div>}
            </>
          )}
          {/* Bottom: install / takedown dates, links, lock, Team view, actions */}
          <div className="pt-3 border-t border-border-subtle flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1.5 min-w-0">
              {visitChips(j)}
              {(() => {
                const qq = jobQuote(j);
                if (!onOpen) return null;
                if (!qq?.id && !quotesReady) return <p className="text-xs text-muted">Loading quote…</p>;
                if (!qq?.id) return (
                  <label className="flex items-center gap-2 flex-wrap text-sm text-muted">No quote linked yet.
                    <select value="" onChange={(e) => e.target.value && patchJob(j, { quoteId: e.target.value })} className="rounded-lg border border-border-strong bg-card px-2 py-1.5 text-sm text-primary cursor-pointer">
                      <option value="">Link a quote…</option>
                      {[...quotes].filter((q) => q.id).sort((a, b) => String(a.clientInfo?.name || a.client || '').localeCompare(String(b.clientInfo?.name || b.client || ''))).map((q) => (
                        <option key={q.id} value={q.id}>{q.clientInfo?.name || q.client || 'Unnamed quote'}</option>
                      ))}
                    </select>
                  </label>
                );
                const btn = 'px-3 py-1.5 rounded-lg border border-border-strong text-sm font-semibold text-primary hover:bg-surface-alt cursor-pointer';
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => onOpen(qq.id, 3)} className={btn}>📐 Plan</button>
                    <button onClick={() => onOpen(qq.id, 3)} className={btn}>📦 Materials</button>
                    {/* Lock / unlock the plan + materials (same lock as the quote's Plan step) */}
                    <button onClick={() => { const on = !qq.planLocked; setQuotes((qs) => qs.map((x) => (x.id === qq.id ? { ...x, planLocked: on } : x))); patchQuoteMeta(qq.id, { planLocked: on }).catch(() => refresh()); }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${qq.planLocked ? 'border border-yellow-500/50 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20' : 'bg-yellow-400 text-black hover:bg-yellow-300'}`}>
                      {qq.planLocked ? '🔒 Locked · Unlock' : '🔓 Lock plan + materials'}
                    </button>
                    {qq.crewToken && <a href={`/crew/${qq.crewToken}`} target="_blank" rel="noreferrer" className={btn}>👀 Team view</a>}
                    {/* Same presentation as the quote's last step */}
                    <Link to={`/lights-presentation/${qq.id}`} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white hover:brightness-110 cursor-pointer" style={{ background: '#B3121F' }}>🎄 Present</Link>
                    {!j.saved.fromQuote && !j.saved.installed && <span className="text-xs text-yellow-300">Materials here are the job's own list. The quote's Materials step is empty, so its plugs/timer there are just defaults.</span>}
                    {j.saved?.quoteId && <button onClick={() => patchJob(j, { quoteId: null })} title={`Linked to ${qq.clientInfo?.name || qq.client}`} className="text-xs text-muted hover:text-primary underline cursor-pointer">Wrong quote? Unlink</button>}
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-2">
              {stage === 'ready' && installing?.id !== j.id && (
                <button onClick={() => setInstalling({ id: j.id, draft: { ...(j.saved.materials || {}) } })} className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold cursor-pointer">Mark installed</button>
              )}
              {(stage === 'stock' || stage === 'schedule') && installing?.id !== j.id && (
                <button onClick={() => setInstalling({ id: j.id, draft: { ...(j.saved.materials || {}) } })} className="text-xs text-muted hover:text-primary underline cursor-pointer">Mark installed</button>
              )}
              <button onClick={toggle} className="text-xs text-muted hover:text-primary underline cursor-pointer">{open ? 'Hide' : 'Materials'}</button>
            </div>
          </div>
        </div>
      );
    };


    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted">Every lights job from Jobber, sorted by what it needs next.</p>
          <button onClick={() => setTick((t) => t + 1)} disabled={schedule.loading} className="text-xs text-muted hover:text-primary disabled:opacity-50 cursor-pointer">{schedule.loading ? 'Updating…' : '↻ Refresh from Jobber'}</button>
        </div>
        {schedule.loading && !all.length && <p className="text-sm text-muted">Loading jobs from Jobber…</p>}
        {schedule.error && !all.length && <p className="text-sm text-red-400">Couldn't reach Jobber: {schedule.error.slice(0, 80)}</p>}
        {!schedule.loading && !schedule.error && !all.length && <p className="text-sm text-muted">No lights jobs in Jobber yet.</p>}
        {all.length > 0 && (
          <p className="text-base font-bold text-primary">{all.length} job{all.length === 1 ? '' : 's'} <span className="text-sm font-normal text-muted">· 🔒 {all.filter((j) => jobQuote(j)?.planLocked).length} plans locked</span></p>
        )}
        {(() => {
          // One-time cleanup: jobs that still carry their own old list. You pick which list is right.
          const stuck = all.filter((j) => j.saved.needsMove || j.saved.conflict);
          const loose = all.filter((j) => j.saved.noQuote);
          if (!stuck.length && !loose.length) return null;
          const listOf = (m) => Object.entries(m || {}).filter(([, v]) => n(v) > 0).map(([id, v]) => `${itemById(id)?.name || 'Removed item'} ${n(v)}`);
          return (
            <div className="rounded-xl border border-yellow-400/50 bg-yellow-400/10 p-4 space-y-3">
              {stuck.length > 0 && <>
                <div>
                  <p className="text-sm font-bold text-yellow-300">Pick the right materials: {stuck.length} job{stuck.length === 1 ? '' : 's'}</p>
                  <p className="text-xs text-secondary">These jobs still have an old list that isn't in the quote. Pick one per client. After that the quote is the only place materials live (the old list stays saved as a backup).</p>
                </div>
                {stuck.map((j) => {
                  const q = quotes.find((x) => x.id === j.saved.fromQuote);
                  const jobL = listOf(j.saved.oldList); const qL = listOf(q?.materials);
                  return (
                    <div key={j.id} className="rounded-lg bg-card border border-border-default p-3 space-y-2">
                      <p className="text-sm font-bold text-primary">{j.clientName} <span className="text-xs font-normal text-muted">#{j.jobNumber}</span></p>
                      <div className="grid sm:grid-cols-2 gap-3 text-xs">
                        <div><p className="font-semibold text-secondary mb-1">Old job list</p>{jobL.map((t) => <p key={t} className="text-primary">{t}</p>)}</div>
                        <div><p className="font-semibold text-secondary mb-1">Quote</p>{qL.length ? qL.map((t) => <p key={t} className="text-primary">{t}</p>) : <p className="text-muted">Empty</p>}</div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => moveIntoQuote([j])} className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold cursor-pointer">Use old job list (puts it in the quote)</button>
                        {j.saved.conflict && <button onClick={() => keepQuote(j)} className="px-3 py-1.5 rounded-lg border border-border-strong text-xs font-semibold text-primary cursor-pointer">Keep the quote</button>}
                      </div>
                    </div>
                  );
                })}
              </>}
              {quotesReady && loose.length > 0 && <p className="text-sm text-yellow-300">No quote linked: {loose.map((j) => j.clientName).join(', ')}. Open the job and link its quote.</p>}
            </div>
          );
        })()}
        {(() => {
          // One slim row per job; click it to open the full card (materials etc.).
          const NEED = { materials: ['Needs materials', 'bg-red-500/15 text-red-400'], schedule: ['Not scheduled', 'bg-yellow-400/15 text-yellow-300'], stock: ['Waiting on stock', 'bg-blue-500/15 text-blue-300'], ready: ['Ready', 'bg-emerald-500/15 text-emerald-400'], wrap: ['Wrap-up', 'bg-surface-alt text-secondary'], takedown: ['Takedown soon', 'bg-yellow-400/15 text-yellow-300'], done: ['Done', 'bg-surface-alt text-muted'] };
          const row = (j, stage) => {
            const isOpen = openJob === j.id;
            const inst = jobVisits(j).inst;
            const [label, tone] = NEED[stage];
            return (
              <div key={j.id} className={`rounded-xl border bg-card ${isOpen ? 'border-border-brand' : 'border-border-default'}`}>
                <div className="flex items-center">
                <button onClick={() => setOpenJob(isOpen ? '' : j.id)} className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-4 py-3 text-left cursor-pointer hover:bg-surface-alt/40 rounded-xl">
                  <span className="text-muted text-sm w-3">{isOpen ? '▾' : '▸'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-semibold text-primary truncate">{j.clientName} <span className="text-xs font-normal text-muted">#{j.jobNumber}</span>{jobQuote(j)?.planLocked && <span title="Plan + materials locked" className="ml-1.5">🔒</span>}</span>
                    <span className="block text-xs text-muted">{inst?.startAt ? `Install ${fmtDate(inst.startAt)}` : 'No install date'}</span>
                    {/* Installed jobs: the wrap-up checklist right on the row (tap to check off; after pics come from the photos) */}
                    {(stage === 'wrap' || stage === 'takedown' || stage === 'done') && (() => {
                      const w = wrapOf(j);
                      return (
                        <span className="flex items-center gap-1 flex-wrap mt-1.5">
                          {WRAP.map(([k, lbl]) => (
                            <span key={k} role={k === 'pics' ? undefined : 'button'} title={k === 'pics' ? 'Add after pics inside the job' : w[k] ? 'Done — tap to undo' : 'Tap when done'}
                              onClick={k === 'pics' ? undefined : (e) => { e.stopPropagation(); patchJob(j, k === 'review' ? { reviewed: !w.review, wrap: { ...(j.saved.wrap || {}), review: !w.review } } : { wrap: { ...(j.saved.wrap || {}), [k]: !w[k] } }); }}
                              className={`px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap ${k === 'pics' ? '' : 'cursor-pointer'} ${w[k] ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface-alt text-secondary hover:text-primary'}`}>
                              {w[k] ? '✓' : '○'} {lbl}
                            </span>
                          ))}
                        </span>
                      );
                    })()}
                  </span>
                  <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${tone}`}>{label}</span>
                </button>
                </div>
                {isOpen && <div className="border-t border-border-subtle">{card(j, stage)}</div>}
              </div>
            );
          };
          const group = (key, title, sub, list, collapsible) => {
            if (!list.length) return null;
            const shown = !collapsible || openGroups[key];
            return (
              <section key={key} className="space-y-2">
                {collapsible
                  ? <button onClick={() => setOpenGroups((g) => ({ ...g, [key]: !g[key] }))} className="w-full flex items-center justify-between rounded-xl bg-surface-alt/50 px-4 py-3 text-left cursor-pointer hover:bg-surface-alt">
                      <span className="text-sm font-bold text-primary">{shown ? '▾' : '▸'} {title} <span className="text-muted font-normal">· {list.length}</span></span>
                      <span className="text-xs text-muted">{sub}</span>
                    </button>
                  : <div><p className="text-base font-bold text-primary">{title} <span className="text-muted font-normal">· {list.length}</span></p><p className="text-xs text-muted">{sub}</p></div>}
                {shown && list.map(([j, st]) => row(j, st))}
              </section>
            );
          };
          const tag = (ks) => ks.flatMap((k2) => byStage[k2].map((j) => [j, k2])).sort(([a], [b]) => instAt(a) - instAt(b)); // soonest install first; no date last
          return (
            <>
              {group('prep', 'Needs prep', 'Click a job to finish it', tag(['materials', 'schedule', 'stock']), false)}
              {group('ready', '✅ Prepped', 'Ready to install', tag(['ready']), true)}
              {group('installed', '🎉 Installed', 'Wrap-up and takedowns', tag(['wrap', 'takedown']), true)}
              {group('done', 'Completed', '', tag(['done']), true)}
            </>
          );
        })()}
      </div>
    );
  }

  // ---------------- Sales ----------------
  // Every lights job in Jobber is a sale: one big total + the list.
  if (view === 'sales') {
    const lightsClients = new Set([...jobber.quotes.map((q) => nameKey(q.clientName)), ...lightsReq.requests.map((r) => nameKey(r.clientName))]);
    const sold = schedule.jobs.filter((j) => j.status !== 'archived'
      && (isLightsTitle(j.title) || (!j.title.trim() && lightsClients.has(nameKey(j.clientName)))))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const total = sold.reduce((t, j) => t + n(j.total), 0);
    const day = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—');
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border-brand bg-brand-light px-5 py-5">
          <p className="text-xs font-semibold text-brand-text-strong">Total lights sales</p>
          <p className="text-4xl font-bold text-brand-text">{schedule.loading && !sold.length ? '…' : money(total)}</p>
        </div>
        <div className="rounded-xl border border-border-default bg-card divide-y divide-border-subtle">
          {sold.map((j) => (
            <div key={j.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary truncate">{j.clientName} <span className="text-xs font-normal text-muted">#{j.jobNumber}</span></p>
                <p className="text-[11px] text-muted">Sold {day(j.createdAt)}</p>
              </div>
              <span className="text-base font-bold text-primary tabular-nums">{money(n(j.total))}</span>
            </div>
          ))}
          {!sold.length && <p className="px-4 py-3 text-sm text-muted">{schedule.loading ? 'Loading from Jobber…' : 'No lights jobs yet.'}</p>}
        </div>
      </div>
    );
  }

  // ---------------- Supplies ----------------
  if (view === 'supplies') {
    // Returns not refunded yet: set aside, so they don't count as spare stock.
    const returns = returnsStored || [];
    const returning = {};
    returns.filter((r) => r.status !== 'refunded').forEach((r) => { returning[r.itemId] = (returning[r.itemId] || 0) + n(r.qty); });
    const rows = items.map((x) => {
      const com = committed[x.id] || 0;
      const avail = n(x.onHand) - com;
      const coming = n(x.onOrder);
      const ret = returning[x.id] || 0;
      // Have + On the way − For jobs − Returning = what's left. Order whatever it takes to get
      // back to the spare you want to keep on top of booked jobs.
      const left = n(x.onHand) + coming - com - ret;
      const spare = n(x.spare); // "Alert below": spare left after booked jobs
      const gap = Math.max(0, spare - left);
      // Buy in set batches (e.g. 1000 ft spools) until back above the alert line.
      const need = gap && n(x.buy) ? Math.ceil(gap / n(x.buy)) * n(x.buy) : gap;
      // Round up to what the store actually sells (e.g. 250 shingle tabs → 3 packs of 100 = 300).
      const plan = packPlan(x, need);
      return { x, com, avail, coming, ret, left, spare, need: plan ? plan.qty : need, shortJobs: Math.max(0, -left), plan };
    });

    if (notLoaded) return <p className="text-sm text-muted p-4">Loading material…</p>;
    if (empty) {
      return (
        <div className="rounded-xl border border-border-default bg-card p-6 text-center space-y-3">
          <p className="text-sm text-secondary">No material yet.</p>
          <button onClick={() => setItems(STARTER_SUPPLIES)} className="rounded-lg bg-brand text-on-brand text-sm font-semibold px-4 py-2 cursor-pointer">Use Todd's starter list (21 items with pack sizes)</button>
          <button onClick={() => setItems([{ id: `item-${Date.now()}`, name: 'New item', unit: 'ea', onHand: 0, lowAt: 0, cost: 0, used: 0, packs: [] }])} className="block mx-auto text-xs text-muted hover:text-primary cursor-pointer">or start blank</button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* (Top money cards removed — the money ledger lives in Real orders, 2026-11-13) */}
        {(() => {
          // Which booked (not installed) jobs use each item, for the tap-to-open breakdown.
          const byJob = {};
          Object.values(jobsMap).forEach((j) => {
            if (j.installed) return;
            Object.entries(withDefaults(j.materials, items, j.noAuto)).forEach(([id, q]) => {
              if (n(q)) (byJob[id] = byJob[id] || []).push([String(j.clientName || 'Job').split(' ')[0], n(q)]);
            });
          });
          const ordered = groupSupplies(rows.map((r) => r.x)).flatMap(([, , its]) => its.map((it) => rows.find((r) => r.x.id === it.id)));
          // One list, in category order. Anything to buy is highlighted red in place.
          const list = ordered;
          const toBuy = list.filter((r) => r.need > 0);
          return (
            <div className="rounded-xl border border-border-default bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border-subtle flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-primary">Material</p>
                  <p className="text-[11px] text-muted">{toBuy.length ? <><span className="text-red-400 font-semibold">{toBuy.length} to order</span> · highlighted in red</> : 'Nothing to order right now'}</p>
                </div>
                {toBuy.length > 0 && (() => {
                  const inCart = toBuy.filter((r) => cartLines(r.x, r.need).length);
                  const elsewhere = toBuy.filter((r) => !cartLines(r.x, r.need).length);
                  if (!inCart.length) return null;
                  const href = `${LAW_URL}/cart/${inCart.flatMap((r) => cartLines(r.x, r.need)).map(([id, q]) => `${id}:${q}`).join(',')}?discount=${CART_CODE}`;
                  return (
                    <div className="text-right shrink-0">
                      <a href={href} target="_blank" rel="noreferrer" className="inline-block px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600">🛒 Build my cart · {inCart.length} item{inCart.length === 1 ? '' : 's'}</a>
                      <p className="text-[10px] text-muted mt-1">Lights at Wholesale · {CART_CODE} applied · you check out</p>
                      {elsewhere.length > 0 && <p className="text-[10px] text-yellow-400">Order separately: {elsewhere.map((r) => r.x.name).join(', ')}</p>}
                    </div>
                  );
                })()}
              </div>
              {list.map(({ x, com, coming, ret, left, spare, need, shortJobs, plan }, i) => {
                const cat = catOf(x);
                const head = i === 0 || catOf(list[i - 1].x) !== cat
                  ? <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted border-t border-border-subtle first:border-t-0">{CATS.find(([c]) => c === cat)?.[1]}</p>
                  : null;
                const open = editing === x.id;
                const buy = need > 0;
                return (
                  <Fragment key={x.id}>
                  {head}
                  <div className={`border-t border-border-subtle border-l-4 ${buy ? 'bg-red-500/[0.09] border-l-red-500' : x.note ? 'bg-yellow-500/[0.08] border-l-yellow-500' : 'border-l-transparent'}`}>
                    <button onClick={() => setEditing(open ? '' : x.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-alt/50 cursor-pointer">
                      {buy ? (
                        <span className="w-28 text-right shrink-0 text-red-400 whitespace-nowrap">
                          <span className="block text-[10px] uppercase tracking-wide">Left</span>
                          <span className="block text-lg font-bold tabular-nums leading-tight">{Math.round(left)}</span>
                          <span className="block text-xs font-bold tabular-nums">Order {Math.ceil(need)}</span>
                          <span className="block text-[10px] text-muted tabular-nums">to have {Math.round(left + Math.ceil(need))} left</span>
                        </span>
                      ) : (
                        <span className="w-28 text-right shrink-0 text-secondary">
                          <span className="block text-[10px] uppercase tracking-wide">Left</span>
                          <span className="block text-lg font-bold tabular-nums leading-tight text-primary">{Math.round(left)}</span>
                        </span>
                      )}
                      {x.image ? <img src={x.image} alt="" className="w-10 h-10 rounded-md object-cover bg-white shrink-0" /> : <span className="w-10 h-10 rounded-md bg-surface-alt shrink-0" />}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-primary truncate">{x.name}</span>
                        {x.note && <span className="block text-xs text-yellow-400">📝 {x.note}</span>}
                        {/* The math, left to right: Have + coming − jobs = left */}
                        <span className="block text-xs text-secondary tabular-nums">
                          Have <b className="text-primary">{n(x.onHand)}</b>
                          {coming > 0 && <> + <b className="text-blue-400">{coming}</b> coming</>}
                          {com > 0 && <> − <b className="text-primary">{com}</b> for jobs</>}
                          {ret > 0 && <> − <b className="text-orange-400">{ret}</b> returning</>}
                          {' = '}<b className={left < 0 ? 'text-red-400' : 'text-primary'}>{Math.round(left)}</b> left
                          {/* Already went up on installed jobs (came out of Have) — shown, not subtracted again */}
                          {n(x.used) > 0 && <span className="text-muted"> · {n(x.used)} used on installs</span>}
                        </span>
                        {buy && (
                          <span className="block text-xs text-red-400 tabular-nums">
                            {shortJobs > 0 ? `Short ${Math.ceil(shortJobs)} for jobs` : `Under ${spare}`} → order <b>{Math.ceil(need)}</b>
                          </span>
                        )}
                      </span>
                    </button>
                    {buy && !open && (
                      <div className="flex items-center gap-3 px-4 pb-2.5 -mt-1 pl-[192px] text-xs">
                        <a href={orderUrl(x)} target="_blank" rel="noreferrer" className="font-semibold text-red-400 hover:underline">🛒 Order {plan ? plan.text : `${Math.ceil(need)} ${x.unit}`}</a>
                        <button onClick={() => patchItem(x.id, { extraOnOrder: n(x.extraOnOrder) + (plan ? plan.qty : Math.ceil(need)) })} className="text-muted hover:text-primary underline cursor-pointer">I ordered it</button>
                      </div>
                    )}
                    {n(x.extraOnOrder) > 0 && !open && (
                      <div className="px-4 pb-2.5 -mt-1 pl-[192px]">
                        <button onClick={() => patchItem(x.id, { onHand: n(x.onHand) + n(x.extraOnOrder), extraOnOrder: '' })} className="px-2 py-0.5 rounded-md bg-brand text-on-brand text-[11px] font-semibold cursor-pointer">It arrived — add {n(x.extraOnOrder)} to Have</button>
                      </div>
                    )}
                    {open && (
                      <div className="px-4 pb-3 pt-1 space-y-3 bg-surface-alt/40">
                        {(byJob[x.id] || []).length > 0 && (
                          <p className="text-xs text-secondary"><span className="text-muted">Jobs using it:</span> {byJob[x.id].map(([who, q]) => `${who} ${q}`).join(' · ')}</p>
                        )}
                        <div className="flex items-end gap-3 flex-wrap">
                          {[['Have', 'onHand'], ['Alert below', 'spare'], ['Buy at a time', 'buy'], ['Ordered (no receipt)', 'extraOnOrder'], ['Cost $', 'cost']].map(([lbl, k]) => (
                            <label key={k} className="text-[11px] text-muted">
                              {lbl}
                              <NumInput value={x[k] ?? ''} onChange={(v) => patchItem(x.id, { [k]: v })} className="block mt-0.5" />
                            </label>
                          ))}
                          <label className="text-[11px] text-muted">
                            Name
                            <input value={x.name} onChange={(e) => patchItem(x.id, { name: e.target.value })} className="block mt-0.5 w-56 rounded-md border border-border-strong bg-card px-2 py-1 text-sm text-primary outline-none" />
                          </label>
                          <label className="text-[11px] text-muted flex-1 min-w-[200px]">
                            Note
                            <input value={x.note || ''} onChange={(e) => patchItem(x.id, { note: e.target.value })} placeholder="e.g. only for brick houses, green ones going away…" className="block mt-0.5 w-full rounded-md border border-border-strong bg-card px-2 py-1 text-sm text-primary outline-none focus:border-brand" />
                          </label>
                          <SupplyPhoto src={x.image} onChange={(image) => patchItem(x.id, { image })} />
                          <span className="ml-auto flex items-center gap-2">
                            <a href={orderUrl(x)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-secondary hover:text-primary"><ShoppingCart size={13} /> Order</a>
                            <button onClick={() => { setItems((all) => all.filter((y) => y.id !== x.id)); setEditing(''); }} className="p-1 text-muted hover:text-red-500 cursor-pointer" title="Remove item"><Trash2 size={14} /></button>
                            <button onClick={() => setEditing('')} className="px-3 py-1 rounded-md bg-brand text-on-brand text-xs font-semibold cursor-pointer">Done</button>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  </Fragment>
                );
              })}
            </div>
          );
        })()}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setItems((list) => [...(list || []), { id: `item-${Date.now()}`, name: 'New item', unit: 'ea', onHand: 0, lowAt: 0, cost: 0, used: 0, packs: [] }])}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline cursor-pointer"
          ><Plus size={14} /> Add item</button>
          <span className="text-xs text-muted">Stock value {money(items.reduce((t, x) => t + n(x.onHand) * n(x.cost), 0))}</span>
        </div>

        {/* Real receipts — a record only, never changes stock */}
        {(() => {
          const orders = [...(ordersStored || [])].sort((a, b) => (n(b.number) - n(a.number)) || String(b.date).localeCompare(String(a.date)));
          const real = orders.filter((o) => o.status !== 'draft').reduce((t, o) => t + n(o.total), 0);
          const hub = items.reduce((t, x) => t + (Math.max(0, n(x.onHand)) + n(x.used) + n(x.onOrder)) * n(x.cost), 0);
          const diff = real - hub;
          // The lines of an order whose stock is already in Have: all of them once it's arrived, else the ones marked arrived.
          const inHave = (o) => ((o.status || 'arrived') === 'arrived' ? (o.lines || []) : (o.lines || []).filter((l) => l.arrived));
          const blank = { id: '', date: new Date().toISOString().slice(0, 10), store: 'Lights at Wholesale', number: '', items: '', total: '', lines: [], status: 'otw' };
          // Stock moves for an order's lines: dir +1 = add, -1 = take back. Only Have
          // (onHand) is stored; On order is worked out from on-the-way orders.
          const moveStock = (lines, field, dir) => {
            const q = {};
            (lines || []).forEach((l) => { if (l.itemId && n(l.qty)) q[l.itemId] = (q[l.itemId] || 0) + n(l.qty); });
            setItems((list) => (list || []).map((x) => (q[x.id] ? { ...x, [field]: Math.max(0, n(x[field]) + dir * q[x.id]) } : x)));
          };
          const save = () => {
            if (!orderDraft || (!n(orderDraft.total) && orderDraft.status !== 'draft')) return;
            const isNew = !orderDraft.id;
            const o = { ...orderDraft, id: orderDraft.id || `ord-${Date.now()}` };
            // Arrived orders add to Have. Becoming / un-becoming arrived moves stock;
            // editing lines on an arrived order swaps old lines for new.
            const prev = isNew ? null : (ordersStored || []).find((x) => x.id === o.id);
            if (prev) moveStock(inHave(prev), 'onHand', -1);
            moveStock(inHave(o), 'onHand', 1);
            setOrders((list) => [...(list || []).filter((x) => x.id !== o.id), o]);
            setOrderDraft(null);
          };
          const placed = (o) => {
            setOrders((list) => (list || []).map((x) => (x.id === o.id ? { ...x, status: 'otw', date: new Date().toISOString().slice(0, 10) } : x)));
          };
          // Whole order here: add whatever hadn't arrived yet.
          const arrived = (o) => {
            moveStock((o.lines || []).filter((l) => !l.arrived), 'onHand', 1);
            setOrders((list) => (list || []).map((x) => (x.id === o.id ? { ...x, status: 'arrived', arrivedAt: new Date().toISOString(), lines: (x.lines || []).map((l) => ({ ...l, arrived: true })) } : x)));
          };
          // Marked arrived by mistake: take its items back out of Have, back to On the way.
          const notArrived = (o) => {
            moveStock(o.lines, 'onHand', -1);
            setOrders((list) => (list || []).map((x) => (x.id === o.id ? { ...x, status: 'otw', arrivedAt: null, lines: (x.lines || []).map((l) => ({ ...l, arrived: false })) } : x)));
          };
          // One item on an order arrived (orders often come in pieces). Tap again to undo.
          // When every item is here the order flips to Arrived.
          const toggleLine = (o, i) => {
            const l = (o.lines || [])[i]; if (!l) return;
            const was = (o.status || 'arrived') === 'arrived' || !!l.arrived;
            moveStock([l], 'onHand', was ? -1 : 1);
            setOrders((list) => (list || []).map((x) => {
              if (x.id !== o.id) return x;
              const lines = (x.lines || []).map((y, k) => (k === i ? { ...y, arrived: !was } : (x.status || 'arrived') === 'arrived' ? { ...y, arrived: true } : y));
              const all = lines.every((y) => y.arrived);
              return { ...x, lines, status: all ? 'arrived' : 'otw', arrivedAt: all ? new Date().toISOString() : null };
            }));
          };
          const setLine = (i, patch) => setOrderDraft((d) => ({ ...d, lines: d.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }));
          const field = (key, label, cls = 'w-32', type = 'text') => (
            <label className="text-[11px] text-muted">{label}
              <input type={type} value={orderDraft[key]} onChange={(e) => setOrderDraft((d) => ({ ...d, [key]: e.target.value }))} className={`block mt-0.5 rounded-md border border-border-strong bg-card px-2 py-1 text-sm text-primary outline-none ${cls}`} />
            </label>
          );
          return (
            <div className="rounded-xl border border-border-default bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-semibold text-primary">Real orders</p>
                <button onClick={() => setOrderDraft(blank)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline cursor-pointer"><Plus size={14} /> Log order</button>
              </div>
              {/* Money, top to bottom: what you spent vs what the Hub counts, then where that stock is going. */}
              {(() => {
                const at = (qty, x) => Math.max(0, qty) * n(x.cost);
                const committedV = rows.reduce((t, r) => t + at(r.com, r.x), 0);
                const usedV = rows.reduce((t, r) => t + at(n(r.x.used), r.x), 0);
                const returningV = rows.reduce((t, r) => t + at(r.ret || 0, r.x), 0);
                const leftV = rows.reduce((t, r) => t + at(r.left, r.x), 0); // have + coming − jobs − returning
                const line = (label, value, note, tone = 'text-primary', big = false) => (
                  <div className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="text-sm text-secondary">{label}{note && <span className="block text-[10px] text-muted">{note}</span>}</span>
                    <span className={`${big ? 'text-xl' : 'text-lg'} font-bold tabular-nums ${tone}`}>{value}</span>
                  </div>
                );
                return (
                  <div className="rounded-lg bg-surface-alt px-4 py-2 divide-y divide-border-subtle">
                    <div>
                      {line('Actually spent', money(real), `${orders.length} receipt${orders.length === 1 ? '' : 's'}`)}
                      {line('Hub thinks', money(hub), 'have + used + on order, at your costs')}
                      {line('Difference', `${diff >= 0 ? '+' : '−'}${money(Math.abs(diff))}`, Math.abs(diff) < 25 ? 'matches' : diff > 0 ? 'spent more than Hub counts (shipping, tax, missing items?)' : 'Hub counts more than you spent (it prices before your discount code)', Math.abs(diff) < 25 ? 'text-brand-text' : 'text-yellow-400')}
                    </div>
                    <div>
                      {line('Committed to jobs', money(committedV), 'set aside for booked installs')}
                      {line('Used on installs', money(usedV), 'already up on houses')}
                      {returningV > 0 && line('Being returned', money(returningV), 'on the Returns list', 'text-orange-400')}
                      {line('Stock left', money(leftV), 'not spoken for — in the shop + on the way', 'text-brand-text', true)}
                    </div>
                  </div>
                );
              })()}
              {/* Returns — right under the money: stuff going back for a refund. Refunded → comes out of Have. */}
              {(() => {
                const itemOf = (id) => items.find((x) => x.id === id);
                const open = returns.filter((r) => r.status !== 'refunded');
                const done = returns.filter((r) => r.status === 'refunded');
                const owed = open.reduce((t, r) => t + n(r.refund), 0);
                const setRet = (id, p) => setReturns((list) => (list || []).map((r) => (r.id === id ? { ...r, ...p } : r)));
                const refunded = (r) => {
                  // Money's back: the items leave Have for good.
                  setItems((list) => (list || []).map((x) => (x.id === r.itemId ? { ...x, onHand: Math.max(0, n(x.onHand) - n(r.qty)) } : x)));
                  setRet(r.id, { status: 'refunded', refundedAt: new Date().toISOString() });
                };
                const unrefund = (r) => {
                  setItems((list) => (list || []).map((x) => (x.id === r.itemId ? { ...x, onHand: n(x.onHand) + n(r.qty) } : x)));
                  setRet(r.id, { status: 'sent', refundedAt: null });
                };
                const row = (r) => {
                  const it = itemOf(r.itemId);
                  return (
                    <div key={r.id} className="px-4 py-2.5 border-t border-border-subtle flex items-center gap-3 flex-wrap">
                      {it?.image ? <img src={it.image} alt="" className="w-9 h-9 rounded-md object-cover bg-white shrink-0" /> : <span className="w-9 h-9 rounded-md bg-surface-alt shrink-0" />}
                      <div className="flex-1 min-w-[180px]">
                        <p className="text-sm font-semibold text-primary"><span className="tabular-nums">{n(r.qty)}</span> × {it?.name || 'Removed item'}</p>
                        <p className="text-[11px] text-muted">{r.from || 'No order noted'}{n(r.refund) > 0 && <> · refund ~<b className="text-primary">{money(n(r.refund))}</b></>}{r.note ? ` · ${r.note}` : ''}</p>
                      </div>
                      {r.status === 'refunded' ? (
                        <>
                          <span className="text-xs font-semibold text-emerald-400">✓ Refunded</span>
                          <button onClick={() => unrefund(r)} className="text-[11px] text-muted hover:text-primary underline cursor-pointer">Undo</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setRet(r.id, { status: r.status === 'sent' ? 'todo' : 'sent' })} className={`px-2 py-1 rounded-md text-xs font-semibold cursor-pointer ${r.status === 'sent' ? 'bg-blue-500/15 text-blue-300' : 'bg-surface-alt text-secondary hover:text-primary'}`}>{r.status === 'sent' ? '📦 Sent back' : '○ Not sent yet'}</button>
                          <button onClick={() => refunded(r)} className="px-2 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 cursor-pointer">💵 Refunded</button>
                          <button onClick={() => setReturns((list) => (list || []).filter((x) => x.id !== r.id))} className="p-1 text-muted hover:text-red-500 cursor-pointer" title="Remove from list"><Trash2 size={13} /></button>
                        </>
                      )}
                    </div>
                  );
                };
                const addRet = () => {
                  if (!retDraft?.itemId || !n(retDraft.qty)) return;
                  setReturns((list) => [...(list || []), { id: `ret-${Date.now()}`, itemId: retDraft.itemId, qty: n(retDraft.qty), from: retDraft.from || '', refund: n(retDraft.refund), status: 'todo', createdAt: new Date().toISOString() }]);
                  setRetDraft(null);
                };
                return (
                  <div className="rounded-xl border border-orange-500/30 bg-card overflow-hidden">
                    <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-primary">↩️ Returns</p>
                        <p className="text-[11px] text-muted">{open.length ? <>{open.length} to send back{owed > 0 && <> · ~<b className="text-primary">{money(owed)}</b> coming back</>} · set aside, not counted as spare</> : 'Nothing to return'}</p>
                      </div>
                      {!retDraft && <button onClick={() => setRetDraft({ itemId: '', qty: '', from: '', refund: '' })} className="text-xs font-semibold text-secondary hover:text-primary cursor-pointer">+ Add return</button>}
                    </div>
                    {retDraft && (
                      <div className="px-4 py-2.5 border-t border-border-subtle flex items-end gap-2 flex-wrap text-[11px] text-muted">
                        <label>Item<select value={retDraft.itemId} onChange={(e) => setRetDraft((d) => ({ ...d, itemId: e.target.value }))} className="block mt-0.5 rounded-md border border-border-strong bg-card px-2 py-1 text-sm text-primary outline-none max-w-[260px]"><option value="">Pick…</option>{groupSupplies(items).flatMap(([, , its]) => its).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                        <label>Qty<input value={retDraft.qty} inputMode="decimal" onChange={(e) => setRetDraft((d) => ({ ...d, qty: e.target.value.replace(/[^0-9.]/g, '') }))} className="block mt-0.5 w-20 rounded-md border border-border-strong bg-card px-2 py-1 text-sm text-primary outline-none" /></label>
                        <label>From order<input value={retDraft.from} placeholder="Lights at Wholesale #2" onChange={(e) => setRetDraft((d) => ({ ...d, from: e.target.value }))} className="block mt-0.5 w-48 rounded-md border border-border-strong bg-card px-2 py-1 text-sm text-primary outline-none" /></label>
                        <label>Refund $<input value={retDraft.refund} inputMode="decimal" onChange={(e) => setRetDraft((d) => ({ ...d, refund: e.target.value.replace(/[^0-9.]/g, '') }))} className="block mt-0.5 w-24 rounded-md border border-border-strong bg-card px-2 py-1 text-sm text-primary outline-none" /></label>
                        <button onClick={addRet} className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold cursor-pointer">Add</button>
                        <button onClick={() => setRetDraft(null)} className="px-2 py-1.5 text-xs text-muted hover:text-primary cursor-pointer">Cancel</button>
                      </div>
                    )}
                    {open.map(row)}
                    {done.length > 0 && <details className="border-t border-border-subtle"><summary className="px-4 py-2 text-[11px] text-muted cursor-pointer">{done.length} refunded</summary>{done.map(row)}</details>}
                  </div>
                );
              })()}
              {orderDraft && (
                <div className="rounded-lg border border-border-brand p-3 space-y-3">
                  <div className="flex items-end gap-3 flex-wrap">
                    {field('date', 'Date', 'w-36', 'date')}
                    {field('store', 'Store', 'w-44')}
                    {field('number', 'Order #', 'w-24')}
                    {field('eta', 'Arrives (est.)', 'w-36', 'date')}
                    {field('total', 'Total paid $', 'w-24')}
                  </div>
                  {!orderDraft.id && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-muted">What's in it</p>
                      {orderDraft.lines.map((l, i) => {
                        const it = items.find((x) => x.id === l.itemId);
                        return (
                          <div key={i} className="flex items-center gap-2.5">
                            {it?.image ? <img src={it.image} alt="" className="w-8 h-8 rounded-md object-cover bg-white" /> : <span className="w-8 h-8 rounded-md bg-surface-alt" />}
                            <span className="flex-1 text-sm text-primary truncate">{it?.name}</span>
                            <NumInput value={l.qty} onChange={(v) => setLine(i, { qty: v })} className="w-20" />
                            <span className="w-10 text-xs text-muted">{it?.unit}</span>
                            <span className="text-xs text-muted">$</span>
                            <NumInput value={l.price ?? ''} onChange={(v) => setLine(i, { price: v })} className="w-20" />
                            <button onClick={() => setOrderDraft((d) => ({ ...d, lines: d.lines.filter((_, k) => k !== i) }))} className="p-1 text-muted hover:text-red-500 cursor-pointer"><Trash2 size={13} /></button>
                          </div>
                        );
                      })}
                      <MaterialPicker items={items} onPick={(id) => setOrderDraft((d) => ({ ...d, lines: [...d.lines, { itemId: id, qty: '', price: '' }] }))} />
                    </div>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    {(
                      <div className="flex gap-1 bg-surface-alt rounded-lg p-1">
                        {[['draft', '📝 Draft'], ['otw', '📦 On the way'], ['arrived', '✓ Already here']].map(([k, label]) => (
                          <button key={k} onClick={() => setOrderDraft((d) => ({ ...d, status: k }))} className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer ${orderDraft.status === k ? 'bg-card text-primary shadow-sm' : 'text-secondary'}`}>{label}</button>
                        ))}
                      </div>
                    )}
                    <button onClick={save} disabled={!n(orderDraft.total) && orderDraft.status !== 'draft'} className="px-3 py-1.5 rounded-md bg-brand text-on-brand text-xs font-semibold disabled:opacity-40 cursor-pointer">Save</button>
                    <button onClick={() => setOrderDraft(null)} className="text-xs text-muted hover:text-primary cursor-pointer">Cancel</button>
                    {<span className="text-[11px] text-muted">{orderDraft.status === 'draft' ? "Just a plan — doesn't touch stock or spend until you mark it ordered." : orderDraft.status === 'arrived' ? 'Adds these to Have.' : 'Adds these to On order — hit Arrived when it shows up.'}</span>}
                  </div>
                </div>
              )}
              <div className="divide-y divide-border-subtle">
                {orders.map((o) => {
                  const open = openOrder === o.id;
                  const lines = (o.lines || []).map((l) => ({ ...l, it: items.find((x) => x.id === l.itemId) }));
                  return (
                    <div
                      key={o.id}
                      className={`py-2.5 rounded-lg ${dropOn === o.id ? 'ring-2 ring-ring-brand bg-brand-light/40' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDropOn(o.id); }}
                      onDragLeave={() => setDropOn('')}
                      onDrop={async (e) => {
                        e.preventDefault(); setDropOn('');
                        const files = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
                        if (!files.length) return;
                        const pics = await Promise.all(files.map(receiptUpload));
                        setOrders((list) => (list || []).map((x) => (x.id === o.id ? { ...x, receipts: [...(x.receipts || []), ...pics] } : x)));
                      }}
                    >
                      <div className="flex items-center gap-4">
                        {/* left: store, date, status */}
                        <div className="w-44 shrink-0">
                          <button onClick={() => setOpenOrder(open ? '' : o.id)} className="text-left cursor-pointer">
                            <p className="text-sm font-semibold text-primary">{o.store}{o.number && <span className="font-normal text-muted"> #{o.number}</span>}</p>
                            <p className="text-[11px] text-muted">{o.date ? new Date(`${o.date}T12:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'no date'}</p>
                          </button>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${o.status === 'draft' ? 'bg-surface-alt text-secondary' : o.status === 'otw' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                              {o.status === 'draft' ? 'Draft' : o.status === 'otw' ? ((o.lines || []).some((l) => l.arrived) ? `Part here · ${(o.lines || []).filter((l) => l.arrived).length} of ${(o.lines || []).length}` : 'On the way') : 'Arrived'}
                            </span>
                            {o.status === 'draft' && <button onClick={() => placed(o)} className="text-[10px] font-semibold text-brand-text hover:underline cursor-pointer">Mark ordered</button>}
                            {o.status === 'otw' && <button onClick={() => arrived(o)} className="text-[10px] font-semibold text-brand-text hover:underline cursor-pointer">Mark arrived</button>}
                            {(o.status || 'arrived') === 'arrived' && <button onClick={() => notArrived(o)} title="Not here yet: takes these back out of Have" className="text-[10px] font-semibold text-muted hover:text-primary hover:underline cursor-pointer">Not here yet</button>}
                          </div>
                        </div>
                        {/* middle: product photos */}
                        <button onClick={() => setOpenOrder(open ? '' : o.id)} className="flex-1 min-w-0 flex items-center gap-2 flex-wrap text-left cursor-pointer">
                          {lines.length > 0 ? lines.map((l, i) => {
                            // On-the-way orders: tap an item when it shows up (✓ = here). Faded = still coming.
                            const here = (o.status || 'arrived') === 'arrived' || !!l.arrived;
                            const tappable = o.status === 'otw'; // shows ✓ / faded; marking happens inside the order
                            return (
                              <span key={i}
                                className={`relative ${tappable && !here ? 'opacity-45' : ''}`}
                                title={`${l.qty} × ${l.it?.name || l.itemId}${tappable ? (here ? ' — here' : ' — still coming') : ''}`}>
                                {l.it?.image ? <img src={l.it.image} alt="" className={`w-10 h-10 rounded-md object-cover bg-white border ${tappable && here ? 'border-emerald-400 ring-2 ring-emerald-400/60' : 'border-border-subtle'}`} /> : <span className="block w-10 h-10 rounded-md bg-surface-alt" />}
                                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-black text-white text-[9px] font-bold leading-[18px] text-center">{l.qty >= 1000 ? `${l.qty / 1000}k` : l.qty}</span>
                                {tappable && here && <span className="absolute -bottom-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-emerald-500 text-white text-[10px] font-bold leading-[18px] text-center">✓</span>}
                              </span>
                            );
                          }) : <span className="text-[11px] text-muted truncate">{o.items}</span>}
                        </button>
                        {/* receipt: click to see it full screen */}
                        {(o.receipts || []).length > 0 && (
                          <button onClick={() => setReceiptView({ list: o.receipts, i: 0 })} className="relative shrink-0 cursor-zoom-in" title={o.receipts.length > 1 ? `View ${o.receipts.length} receipts` : 'View receipt'}>
                            <ReceiptImg src={o.receipts[0]} alt="Receipt" className="w-10 h-12 rounded border border-border-default object-cover object-top bg-white" />
                            {o.receipts.length > 1 && <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-black text-white text-[9px] font-bold leading-4">{o.receipts.length}</span>}
                          </button>
                        )}
                        {/* right: total + small actions */}
                        <div className="shrink-0 text-right">
                          <p className={`text-lg font-bold tabular-nums ${o.status === 'draft' ? 'text-muted' : 'text-primary'}`}>${n(o.total).toFixed(2)}</p>
                          <div className="flex items-center justify-end gap-1 mt-0.5 text-muted">

                            <label className="p-1 hover:text-primary cursor-pointer" title="Add a receipt photo (or drag it onto this order)">
                              <ImagePlus size={13} />
                              <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                                const pics = await Promise.all([...(e.target.files || [])].map(receiptUpload));
                                setOrders((list) => (list || []).map((x) => (x.id === o.id ? { ...x, receipts: [...(x.receipts || []), ...pics] } : x)));
                              }} />
                            </label>
                            <button onClick={() => setOrderDraft(o)} className="px-1 text-[11px] hover:text-primary cursor-pointer">Edit</button>
                            <button onClick={() => {
                              // An arrived order already added its items to Have — take them back out.
                              moveStock(inHave(o), 'onHand', -1);
                              setOrders((list) => (list || []).filter((x) => x.id !== o.id));
                            }} className="p-1 hover:text-red-500 cursor-pointer" title="Delete"><Trash2 size={12} /></button>
                          </div>
                        </div>
                      </div>
                      {open && (
                        <div className="mt-2 sm:ml-[108px] rounded-lg bg-surface-alt/50 p-2 space-y-1">
                          {lines.map((l, i) => (
                            <div key={i} className="flex items-center gap-2.5 text-sm">
                              {l.it?.image ? <img src={l.it.image} alt="" className="w-8 h-8 rounded-md object-cover bg-white" /> : <span className="w-8 h-8 rounded-md bg-surface-alt" />}
                              <span className="flex-1 text-primary truncate">{l.it?.name || l.itemId}</span>
                              <span className="text-xs text-muted tabular-nums">{l.qty} {l.it?.unit}</span>
                              <span className="w-20 text-right text-xs text-secondary tabular-nums">{l.price != null ? `$${n(l.price).toFixed(2)}` : ''}</span>
                              {/* Mark each item as it shows up (on-the-way orders) */}
                              {(o.status === 'otw' || (o.status || 'arrived') === 'arrived') && (() => {
                                const here = (o.status || 'arrived') === 'arrived' || !!l.arrived; // arrived orders: every item is here
                                return (
                                  <button onClick={() => toggleLine(o, i)} title={here ? 'Click if this item isn’t actually here yet' : 'Click when this item shows up'}
                                    className={`w-28 shrink-0 px-2 py-1 rounded-md text-xs font-semibold cursor-pointer ${here ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'border border-border-strong text-secondary hover:text-primary hover:bg-surface-alt'}`}>
                                    {here ? '✓ Arrived' : 'Mark arrived'}
                                  </button>
                                );
                              })()}
                            </div>
                          ))}
                          {o.items && <p className="text-[11px] text-muted pt-1">{o.items}</p>}
                          {(o.receipts || []).length > 0 && (
                            <div className="flex gap-2 pt-1 flex-wrap">
                              {o.receipts.map((r, ri) => (
                                <span key={ri} className="relative">
                                  <ReceiptImg src={r} alt="Receipt" onClick={() => setReceiptView({ list: o.receipts, i: o.receipts.indexOf(r) })} className="w-24 rounded border border-border-default bg-white cursor-zoom-in" />
                                  <button onClick={() => setOrders((list) => (list || []).map((x) => (x.id === o.id ? { ...x, receipts: x.receipts.filter((_, k) => k !== ri) } : x)))} className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-black text-white hover:bg-red-600 cursor-pointer" title="Remove receipt"><Trash2 size={10} /></button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!orders.length && <p className="py-2 text-sm text-muted">No receipts yet.</p>}
                {receiptView && (() => {
                  // Full-screen receipts; ‹ › (or arrow keys) flip through an order's receipts.
                  const list = receiptView.list || [receiptView];
                  const i = Math.min(receiptView.i || 0, list.length - 1);
                  const go = (d) => setReceiptView({ list, i: (i + d + list.length) % list.length });
                  return (
                    <div tabIndex={-1} ref={(el) => el?.focus()} onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'Escape') setReceiptView(''); }}
                      className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out outline-none" onClick={() => setReceiptView('')}>
                      <ReceiptImg src={list[i]} alt="Receipt" className="max-w-full max-h-full rounded-lg bg-white" />
                      {list.length > 1 && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); go(-1); }} className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 hover:bg-white/30 text-white text-3xl font-bold cursor-pointer" title="Previous receipt">‹</button>
                          <button onClick={(e) => { e.stopPropagation(); go(1); }} className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 hover:bg-white/30 text-white text-3xl font-bold cursor-pointer" title="Next receipt">›</button>
                          <span className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/70 text-white text-sm font-semibold">Receipt {i + 1} of {list.length}</span>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}
        <div className="flex justify-center gap-2 flex-wrap">
          {SUPPLIERS.map(([label, url], i) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold px-4 py-2 ${i === 0 ? 'bg-brand text-on-brand hover:bg-brand-hover' : 'border border-border-default text-secondary hover:text-primary hover:border-border-strong'}`}
            >
              <ShoppingCart size={15} /> {label} <ExternalLink size={13} />
            </a>
          ))}
        </div>
        <p className="text-[11px] text-muted">
          Committed = materials for <b>Won</b> quotes (1 bulb, 1 clip and 1 ft of socket wire per roof foot, a timer, 50 ft zip cord, strands), split by the quote's light pattern.
          <b> Installed</b> takes them off On hand. To order rounds shortfalls up to whole packs.
        </p>
      </div>
    );
  }

  // ---------------- Dashboard ----------------
  const shortDate = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const when = (iso) => {
    const d = new Date(iso);
    const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (days === 0) return `Today, ${time}`;
    if (days === 1) return `Tomorrow, ${time}`;
    if (days === -1) return `Yesterday, ${time}`;
    return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  // Requests (Jobber)
  const rq = lightsReq.requests;
  const openReq = rq.filter((r) => !['converted', 'archived'].includes(r.status));
  const booked = openReq.filter((r) => r.assessmentAt && !r.assessmentDone && r.status !== 'overdue');
  const overdue = openReq.filter((r) => r.status === 'overdue');
  // Leads = no assessment booked, and the client doesn't already have one booked,
  // a quote or a job (Jobber often has a second request for the same person).
  const handled = new Set([
    ...rq.filter((r) => r.assessmentAt).map((r) => nameKey(r.clientName)),
    ...jobber.quotes.map((q) => nameKey(q.clientName)),
  ]);
  const toBook = openReq.filter((r, i, all) => !r.assessmentAt && !handled.has(nameKey(r.clientName))
    && all.findIndex((x) => !x.assessmentAt && nameKey(x.clientName) === nameKey(r.clientName)) === i);

  // Quotes (Jobber)
  const jq = jobber.quotes;
  const jSent = jq.filter((q) => q.status === 'awaiting_response' || q.status === 'changes_requested');
  const jWon = jq.filter((q) => q.status === 'approved' || q.status === 'converted');
  const jLost = jq.filter((q) => q.status === 'archived');
  const jFollow = jSent.filter((q) => (daysAgo(q.sentAt) ?? 0) >= FOLLOW_UP_DAYS);
  const jClose = jWon.length + jLost.length ? Math.round((jWon.length / (jWon.length + jLost.length)) * 100) : null;

  // Schedule (Jobber jobs): a lights job = lights title, or a client with a lights quote/request
  const lightsClients = new Set([...jq.map((q) => nameKey(q.clientName)), ...rq.map((r) => nameKey(r.clientName))]);
  // On schedule = upcoming lights jobs: lights in the title (or no title, for a lights client),
  // visit not done yet, and not archived / waiting on an invoice.
  const lightsJobs = schedule.jobs.filter((j) => j.visitAt && !j.visitDone
    && ['upcoming', 'today', 'action_required'].includes(j.status)
    && (isLightsTitle(j.title) || (!j.title.trim() && lightsClients.has(nameKey(j.clientName)))));
  const jobFor = (name) => lightsJobs.filter((j) => nameKey(j.clientName) === nameKey(name)).sort((a, b) => new Date(a.visitAt) - new Date(b.visitAt))[0];
  // Won but not booked = no lights job at all in Jobber (upcoming or already done).
  const hasAnyLightsJob = (name) => schedule.jobs.some((j) => nameKey(j.clientName) === nameKey(name) && j.status !== 'archived'
    && (isLightsTitle(j.title) || !j.title.trim()));
  const wonNotScheduled = jWon.filter((q) => !hasAnyLightsJob(q.clientName));
  const sumQ = (list) => list.reduce((t, q) => t + n(q.total), 0);

  // My list = your leads + new website leads from Jobber (shown as cards; saved the
  // moment you touch one). Then Jobber moves each person along automatically.
  const matcher = (l) => {
    const ak = addrKey(l.address);
    const names = [...contactsOf(l).map((c) => nameKey(`${c.name} ${l.name}`)), ...contactsOf(l).map((c) => nameKey(c.name)), nameKey(l.jobberName)].filter(Boolean);
    return (x) => (ak && addrKey(x.address) === ak) || names.includes(nameKey(x.clientName));
  };
  const webLeads = [];
  rq.filter((r) => r.status !== 'archived').forEach((r) => {
    if (coldLeads.some((l) => l.id === `jr-${r.id}` || matcher(l)(r))) return;
    if (webLeads.some((w) => nameKey(w.jobberName) === nameKey(r.clientName))) return;
    webLeads.push({ id: `jr-${r.id}`, name: r.clientName, jobberName: r.clientName, address: r.address || '', contacts: [{ name: r.clientName, phone: r.phone || '' }], angle: '', money: '', notes: r.title || '', status: 'new', fromJobber: true, virtual: true, log: [] });
  });
  const pipeLeads = [...coldLeads, ...webLeads];
  const inJobber = {};
  for (const l of pipeLeads) {
    const hit0 = matcher(l);
    const reqs = rq.filter(hit0);
    // Quotes/jobs have no address — also match them by the Jobber name on the request.
    const jNames = new Set(reqs.map((r) => nameKey(r.clientName)));
    const hit = (x) => hit0(x) || jNames.has(nameKey(x.clientName));
    const qs = jq.filter(hit);
    const job = schedule.jobs.find((j) => hit(j) && j.status !== 'archived' && (isLightsTitle(j.title) || !j.title.trim()));
    const won = qs.find((q) => q.status === 'approved' || q.status === 'converted');
    const open = qs.find((q) => q.status === 'awaiting_response' || q.status === 'changes_requested');
    const assess = reqs.find((r) => r.assessmentAt);
    if (won || job) inJobber[l.id] = { stage: 'won', label: `✅ Won${won ? ` · ${money(won.total)}` : ''} → Jobs tab` };
    else if (open) inJobber[l.id] = { stage: 'quoted', label: `📝 Quote ${money(open.total)}${open.sentAt ? ` · sent ${shortDate(open.sentAt)}` : ''}` };
    else if (qs.length && qs.every((q) => q.status === 'archived')) inJobber[l.id] = { stage: 'not_interested', label: 'Quote archived' };
    else if (assess) inJobber[l.id] = { stage: 'booked', at: assess.assessmentAt, today: new Date(assess.assessmentAt).toDateString() === new Date().toDateString(), label: `📅 Assessment ${when(assess.assessmentAt)}` };
  }
  // Touching a website lead (drag, log, edit) saves it into your list.
  const setPipeLeads = (upd) => setColdLeads((stored) => {
    const merged = [...(stored || []), ...webLeads];
    const next = typeof upd === 'function' ? upd(merged) : upd;
    const untouched = new Set(webLeads);
    return (next || []).filter((x) => !untouched.has(x)).map((x) => (x.virtual ? { ...x, virtual: false } : x));
  });
  const cards = [
    // Big number = assessments scheduled (today or later).
    ['Upcoming assessments', String(pipeLeads.filter((l) => inJobber[l.id]?.stage === 'booked' && inJobber[l.id].at && new Date(inJobber[l.id].at) >= new Date(new Date().toDateString())).length), (() => {
      return '';
    })(), 'cold'],
    ['Quotes waiting', money(sumQ(jSent)), `${jSent.length} quote${jSent.length === 1 ? '' : 's'}`, 'sent'],
    ['Upcoming jobs', schedule.loading ? '…' : String(lightsJobs.length), schedule.error ? 'Jobber busy — try later' : wonNotScheduled.length ? `${wonNotScheduled.length} won not booked` : 'lights installs booked', 'scheduled'],
  ];
  // Results row (separate from the pipeline above)
  const results = [
    ['Won', money(sumQ(jWon)), `${jWon.length} approved / job created`, 'won'],
    ['Close rate', jClose == null ? '—' : `${jClose}%`, `${jWon.length} won · ${jLost.length} lost`, 'closed'],
  ];
  const reqFilter = { needs: toBook, booked, overdue }[filter];
  const quoteFilter = { sent: jSent, won: jWon, follow: jFollow, closed: [...jWon, ...jLost] }[filter];

  const reqRow = (r) => (
    <div key={r.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[180px]">
        <p className="text-sm font-semibold text-primary">{r.clientName}</p>
        <p className="text-[11px] text-muted">{r.title}{r.address && ` · ${r.address}`}</p>
      </div>
      <span className={`text-xs font-semibold ${r.status === 'overdue' ? 'text-red-400' : r.assessmentAt ? 'text-emerald-400' : 'text-yellow-400'}`}>
        {r.assessmentAt ? `${r.status === 'overdue' ? 'was ' : ''}${when(r.assessmentAt)}` : `asked ${shortDate(r.createdAt)} · not booked`}
      </span>
    </div>
  );
  const quoteRow = (q) => {
    const [label, cls] = JOBBER_STATUS[q.status] || [q.status, 'bg-surface-alt text-secondary'];
    const job = jobFor(q.clientName);
    const age = daysAgo(q.sentAt);
    const follow = jFollow.includes(q);
    const isWon = jWon.includes(q);
    return (
      <div key={q.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <p className="text-sm font-semibold text-primary">{q.clientName}{q.companyName && q.companyName !== q.clientName && <span className="text-xs font-normal text-muted"> · {q.companyName}</span>} <span className="text-xs font-normal text-muted">#{q.quoteNumber}</span></p>
          <p className="text-[11px] text-muted">
            {q.title || 'Lights quote'}
            {q.sentAt && ` · sent ${shortDate(q.sentAt)}`}
            {follow && <span className="ml-1 font-semibold text-yellow-400">· follow up ({age}d)</span>}
            {job ? <span className="ml-1 font-semibold text-emerald-400">· on schedule {shortDate(job.visitAt)}</span>
              : isWon && !schedule.loading && !schedule.error && !hasAnyLightsJob(q.clientName) ? <span className="ml-1 font-semibold text-red-400">· not scheduled yet</span> : null}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${cls}`}>{label}</span>
        <span className="w-20 text-right text-sm font-bold text-primary">{money(q.total)}</span>
      </div>
    );
  };
  const panel = (title, right, rows, empty) => (
    <div className="rounded-xl border border-border-default bg-card">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
        <p className="text-sm font-semibold text-primary">{title}</p>
        <span className="text-[11px] text-muted">{right}</span>
      </div>
      <div className="divide-y divide-border-subtle">{rows.length ? rows : <p className="px-4 py-3 text-sm text-muted">{empty}</p>}</div>
    </div>
  );
  const showAll = <button onClick={() => setFilter('')} className="underline hover:text-primary cursor-pointer">show all</button>;
  const cardTitle = [...cards, ...results].find((c) => c[3] === filter)?.[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="ml-auto flex items-center gap-1.5">
          {results.map(([label, big, sub, key]) => (
            <button
              key={label}
              onClick={() => setFilter((f) => (f === key ? '' : key))}
              title={sub}
              className={`rounded-md border px-2 py-1 text-[11px] cursor-pointer ${filter === key ? 'border-border-brand ring-1 ring-ring-brand' : 'border-border-default hover:border-border-strong'}`}
            >
              <span className="text-muted">{label}</span> <span className="font-bold text-primary">{big}</span>
            </button>
          ))}
          <button
            onClick={() => setTick((t) => t + 1)}
            disabled={schedule.loading || jobber.loading || lightsReq.loading}
            className="ml-1 text-xs text-muted hover:text-primary disabled:opacity-50 cursor-pointer"
            title="Pull the latest from Jobber"
          >
            {schedule.loading || jobber.loading || lightsReq.loading ? 'Updating…' : '↻'}
          </button>
        </div>
      </div>
      {(() => {
        const card = ([label, big, sub, key]) => {
          const on = filter === key;
          const hot = key === 'cold' && webLeads.some((l) => stageOf(l, inJobber) === 'new');
          return (
            <button
              key={label}
              onClick={() => setFilter((f) => (f === key ? '' : key))}
              className={`text-left rounded-xl border px-3 py-3 transition-colors cursor-pointer hover:border-border-strong ${hot ? 'bg-red-500/10' : on ? 'bg-surface-alt' : 'bg-card'} ${on ? 'border-border-strong' : hot ? 'border-red-500/50' : 'border-border-default'}`}
            >
              <p className={`text-[11px] leading-tight ${hot ? 'text-red-400 font-semibold' : on ? 'text-primary font-semibold' : 'text-muted'}`}>{hot && '🔥 '}{label}</p>
              <p className="text-xl font-bold text-primary mt-1">{big}</p>
              <p className={`text-[10px] leading-tight ${hot ? 'text-red-300' : 'text-muted'}`}>{sub}</p>
            </button>
          );
        };
        return (
          <div className="grid gap-2 grid-cols-3 items-stretch">
            {cards.map(card)}
          </div>
        );
      })()}

      {filter === 'cold' && <ColdLeads leads={pipeLeads} setLeads={setPipeLeads} inJobber={inJobber} />}
      {reqFilter && panel(cardTitle, <>{reqFilter.length} · {showAll}</>, (() => {
        if (filter !== 'booked') return reqFilter.map(reqRow);
        const isToday = (r) => new Date(r.assessmentAt).toDateString() === new Date().toDateString();
        const sorted = [...reqFilter].sort((a, b) => new Date(a.assessmentAt) - new Date(b.assessmentAt));
        const today = sorted.filter(isToday);
        const later = sorted.filter((r) => !isToday(r));
        const head = (t) => <p key={`h-${t}`} className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-brand-text">{t}</p>;
        return [
          ...(today.length ? [head('Today'), ...today.map(reqRow)] : []),
          ...(later.length ? [head(today.length ? 'Coming up' : 'Coming up'), ...later.map(reqRow)] : []),
        ];
      })(), 'Nothing here.')}
      {filter === 'scheduled' && panel(cardTitle, <>{lightsJobs.length} · {showAll}</>,
        [...lightsJobs].sort((a, b) => new Date(a.visitAt) - new Date(b.visitAt)).map((j) => (
          <div key={j.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm font-semibold text-primary">{j.clientName} <span className="text-xs font-normal text-muted">Job #{j.jobNumber}</span></p>
              <p className="text-[11px] text-muted">{j.title || 'Lights job'}</p>
            </div>
            <span className="text-sm font-semibold text-emerald-400">{new Date(j.visitAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span className="w-20 text-right text-sm font-bold text-primary">{n(j.total) ? money(j.total) : '—'}</span>
          </div>
        )), 'No upcoming lights installs.')}
      {quoteFilter && panel(cardTitle, <>{quoteFilter.length} · {showAll}</>, quoteFilter.map(quoteRow), 'Nothing here.')}

      {!filter && <p className="text-xs text-muted text-center pt-2">Click a card to see who's in it.</p>}
    </div>
  );
}

