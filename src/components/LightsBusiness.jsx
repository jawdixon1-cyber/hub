import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, ShoppingCart, ImagePlus, ExternalLink, Phone, MessageSquare, Pencil } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';
import { STARTER_SUPPLIES, STYLE_LABEL, quoteMaterials, quoteFeet, packPlan } from '../lib/lightsMaterials';
import { listQuotes } from '../lib/lightsStore';

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

// Supply sections, worked out from the item name.
const CATS = [['bulb', 'Bulbs'], ['wire', 'Wire & cord'], ['clip', 'Clips & stakes'], ['plug', 'Plugs'], ['timer', 'Timers & strands'], ['other', 'Other']];
const catOf = (it) => {
  const name = it?.name || '';
  if (/\bc[79]\b|bulb/i.test(name) && !/wire|clip|stake/i.test(name)) return 'bulb';
  if (/wire|cord|spt/i.test(name)) return 'wire';
  if (/clip|stake/i.test(name)) return 'clip';
  if (/plug/i.test(name)) return 'plug';
  if (/timer|mini|strand/i.test(name)) return 'timer';
  return 'other';
};

// Order inside a section: bulbs = warm white, multicolor, then colors; timers before strands.
const rankIn = (cat, it) => (cat === 'bulb'
  ? (/warm white/i.test(it.name) ? 0 : /multi/i.test(it.name) ? 1 : 2)
  : /timer/i.test(it.name) ? 0 : 1);
// Supplies grouped + ordered the same way everywhere: [[cat, label, items], ...]
const groupSupplies = (list) => CATS
  .map(([cat, label]) => [cat, label, list.filter((it) => catOf(it) === cat).sort((a, b) => rankIn(cat, a) - rankIn(cat, b))])
  .filter(([, , its]) => its.length);

// Every install needs one of each of these. Matched by item name.
const MUST_HAVE = [
  ['Bulbs', (it) => catOf(it) === 'bulb'],
  ['Socket wire', (it) => /socket\s*wire/i.test(it.name)],
  ['Zip cord', (it) => /zip/i.test(it.name)],
  ['Clips', (it) => /clip/i.test(it.name)],
  ['Male plugs', (it) => /\bmale\b/i.test(it.name) && !/female/i.test(it.name)],
  ['Female plugs', (it) => /female/i.test(it.name)],
  ['Timer', (it) => /timer/i.test(it.name)],
];

// Every job automatically starts with these (unless it already has that kind of item).
const AUTO_ON_JOB = [
  [/timer/i, '1'],
  [/\bmale\b/i, '10', /female/i],
  [/female/i, '10'],
];
function withDefaults(materials, items) {
  const m = { ...(materials || {}) };
  const nameOf = (id) => items.find((x) => x.id === id)?.name || '';
  AUTO_ON_JOB.forEach(([re, qty, not]) => {
    const match = (name) => re.test(name) && !(not && not.test(name));
    if (Object.keys(m).some((id) => match(nameOf(id)))) return;
    const it = items.find((x) => match(x.name));
    if (it) m[it.id] = qty;
  });
  return m;
}

// Starting amount when an item is added to a job (edit any time).
const defaultQty = (it) => (/plug/i.test(it?.name || '') ? '10' : /timer/i.test(it?.name || '') ? '1' : '');

// Cold leads: people Jude wants to reach out to, in priority order (drag to reorder).
const BLANK_LEAD = { name: '', address: '', contacts: [{ name: '', phone: '' }], angle: '', decider: '', money: '', notes: '' };
// Outreach status, set by the latest log entry.
const OUTREACH = [
  ['new', 'Not reached out', 'bg-surface-alt text-secondary'],
  ['no_answer', 'No answer', 'bg-yellow-500/15 text-yellow-400'],
  ['pending', 'Pending', 'bg-blue-500/15 text-blue-400'],
  ['interested', 'Interested', 'bg-brand-light text-brand-text-strong'],
  ['booked', 'Booked', 'bg-emerald-500/15 text-emerald-400'],
  ['not_interested', 'Not interested', 'bg-red-500/15 text-red-400'],
];
const outreachOf = (l) => OUTREACH.find((o) => o[0] === (l.status || 'new')) || OUTREACH[0];
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
function ColdLeads({ leads, setLeads }) {
  const [draft, setDraft] = useState(null);
  const [dragId, setDragId] = useState('');
  const [overId, setOverId] = useState('');
  const [openLead, setOpenLead] = useState('');
  const [logFor, setLogFor] = useState(''); // lead id being logged
  const [logDraft, setLogDraft] = useState({ status: 'no_answer', note: '', how: 'Call' });
  const save = () => {
    if (!draft?.name.trim()) return;
    const lead = { ...draft, id: draft.id || `cl-${Date.now()}` };
    setLeads((list) => (draft.id ? (list || []).map((x) => (x.id === lead.id ? lead : x)) : [...(list || []), lead]));
    setDraft(null);
  };
  const saveLog = (l) => {
    const entry = { at: new Date().toISOString(), status: logDraft.status, how: logDraft.how, note: logDraft.note.trim() };
    setLeads((list) => (list || []).map((x) => (x.id === l.id ? { ...x, status: entry.status, log: [entry, ...(x.log || [])] } : x)));
    setLogFor('');
    setLogDraft({ status: 'no_answer', note: '', how: 'Call' });
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
  return (
    <div className="rounded-xl border border-border-default bg-card">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
        <p className="text-sm font-semibold text-primary">Cold leads <span className="text-xs font-normal text-muted">· drag the number to reorder</span></p>
        <button onClick={() => setDraft({ ...BLANK_LEAD })} className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline cursor-pointer"><Plus size={14} /> Add lead</button>
      </div>
      {draft && (
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
          {f('decider', 'Decision maker — who to pitch')}
          {f('notes', 'Notes', true)}
          <div className="col-span-2 flex items-center gap-3">
            <button onClick={save} disabled={!draft.name.trim()} className="px-3 py-1.5 rounded-md bg-brand text-on-brand text-xs font-semibold disabled:opacity-40 cursor-pointer">Save</button>
            <button onClick={() => setDraft(null)} className="text-xs text-muted hover:text-primary cursor-pointer">Cancel</button>
          </div>
        </div>
      )}
      <div className="divide-y divide-border-subtle">
        {(leads || []).map((l, i) => (
          <div
            key={l.id}
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
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${outreachOf(l)[2]}`}>{outreachOf(l)[1]}</span>
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
                  {openLead === l.id && l.notes && <p className="text-xs"><span className="text-muted">📝</span> <span className="text-secondary">{l.notes}</span></p>}
                  {!l.angle && <p className="text-xs text-muted">Nothing yet</p>}
                  {(l.log || []).length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Outreach · {l.log.length}</p>
                      {(openLead === l.id ? l.log : l.log.slice(0, 1)).map((e, k) => {
                        const o = OUTREACH.find((x) => x[0] === e.status) || OUTREACH[0];
                        return (
                          <p key={k} className="text-xs">
                            <span className="text-muted">{new Date(e.at).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {e.how}</span>{' '}
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
        ))}
        {!(leads || []).length && !draft && <p className="px-4 py-3 text-sm text-muted">No cold leads yet. Add people you want to reach out to.</p>}
      </div>
      <div className="px-4 py-3 border-t border-border-subtle bg-surface-alt/40">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1.5">📞 Phone pitch</p>
        <ol className="space-y-1 text-sm text-primary list-decimal list-inside marker:text-muted">
          <li>"Hey, this is Jude, <span className="text-brand-text font-semibold">[reason they know me — e.g. Cindy's son]</span>."</li>
          <li>"I'm reaching out because I'm doing Christmas lights and <span className="text-brand-text font-semibold">[Mom / Gene]</span> told me you might be interested."</li>
          <li>"You might've gotten one of my postcards, or seen my ads or my yard signs."</li>
          <li>"I'm really trying to get my name out there. I spent $5,000 on a course and I've already done a few jobs."</li>
          <li>"Everything's fully customized — commercial grade, custom cut. Trees, bushes, around the windows, rooflines — you name it, we do it all."</li>
          <li>"I was wondering if this is something you'd be interested in?"</li>
        </ol>
      </div>
    </div>
  );
}

// "+ Add material" picker with photos, grouped like the Supplies list.
function MaterialPicker({ items, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-xs text-secondary hover:text-primary cursor-pointer">
        <Plus size={13} /> Add material
      </button>
      {open && (
        <div className="absolute z-40 left-0 mt-1 w-80 max-h-96 overflow-y-auto rounded-xl border border-border-default bg-card shadow-2xl py-1">
          {groupSupplies(items).map(([cat, label, its]) => (
            <div key={cat}>
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted">{label}</p>
              {its.map((x) => (
                <button key={x.id} onClick={() => { onPick(x.id); setOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-alt cursor-pointer">
                  {x.image ? <img src={x.image} alt="" className="w-8 h-8 rounded-md object-cover bg-white shrink-0" /> : <div className="w-8 h-8 rounded-md bg-surface-alt shrink-0" />}
                  <span className="flex-1 text-sm text-primary truncate">{x.name}</span>
                  <span className="text-[11px] text-muted shrink-0">{n(x.onHand)} {x.unit}</span>
                </button>
              ))}
            </div>
          ))}
          {!items.length && <p className="px-3 py-2 text-xs text-muted">No more material to add.</p>}
        </div>
      )}
    </div>
  );
}

// Small square product photo: click or drop a picture to set it.
function SupplyPhoto({ src, onChange }) {
  const [over, setOver] = useState(false);
  const take = (file) => {
    if (!file?.type.startsWith('image/')) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 160;
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
function useJobberList(action, field, enabled, tick = 0) {
  const key = `lights-jobber-${action}`;
  const [state, setState] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(key) || 'null');
      if (cached) return { [field]: cached, error: '', loading: false, cached: true };
    } catch { /* ignore */ }
    return { [field]: [], error: '', loading: false };
  });
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      setState((st) => ({ ...st, loading: true }));
      fetch(`/api/jobber-data?action=${action}${tick ? '&fresh=1' : ''}`)
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          if (d[field]) {
            try { localStorage.setItem(key, JSON.stringify(d[field])); } catch { /* full */ }
            setState({ [field]: d[field], error: '', loading: false });
          } else {
            // keep showing the last good copy if Jobber is busy
            setState((st) => ({ ...st, error: d.error || 'Jobber unavailable', loading: false }));
          }
        })
        .catch((e) => { if (alive) setState((st) => ({ ...st, error: e.message, loading: false })); });
    }, 0);
    return () => { alive = false; clearTimeout(t); };
  }, [enabled, tick, action, field, key]);
  return state;
}
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

const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

export default function LightsBusiness({ view, onNew }) {
  const [tick, setTick] = useState(0); // ↻ Refresh: pull fresh from Jobber
  const needsJobber = view === 'quotes' || view === 'jobs';
  const schedule = useLightsSchedule(needsJobber, tick);
  const jobber = useJobberLightsQuotes(needsJobber, tick);
  const lightsReq = useLightsRequests(needsJobber, tick);
  const coldLeads = useAppStore((st) => st.lightsColdLeads) || [];
  const setColdLeads = useAppStore((st) => st.setLightsColdLeads);
  const ordersStored = useAppStore((st) => st.lightsOrders);
  const setOrders = useAppStore((st) => st.setLightsOrders);
  const [orderDraft, setOrderDraft] = useState(null);
  const [openOrder, setOpenOrder] = useState('');
  const [receiptView, setReceiptView] = useState('');
  const [dropOn, setDropOn] = useState('');
  const jobsStored = useAppStore((st) => st.lightsJobs);
  const jobsMap = useMemo(() => jobsStored || {}, [jobsStored]);
  const setJobsMap = useAppStore((st) => st.setLightsJobs);
  const [filter, setFilter] = useState(''); // '', sent, won, scheduled, follow, closed
  const [editing, setEditing] = useState(''); // supply row open for editing
  const [items, setItems, empty, notLoaded] = useLightsSupplies();
  const [quotes, setQuotes] = useState([]);

  const refresh = () => listQuotes().then(setQuotes).catch(() => {});
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
      if (!j.installed) add(withDefaults(j.materials, items));
    });
    quotes.filter((q) => statusOf(q) === 'won' && !jobClients.has(nameKey(q.clientInfo?.name || q.client)))
      .forEach((q) => add(quoteMaterials(q, items)));
    return out;
  }, [quotes, items, jobsMap]);



  // ---------------- Jobs ----------------
  if (view === 'jobs') {
    const lightsClients = new Set([...jobber.quotes.map((q) => nameKey(q.clientName)), ...lightsReq.requests.map((r) => nameKey(r.clientName))]);
    const jobberJobs = schedule.jobs.filter((j) => j.status !== 'archived'
      && (isLightsTitle(j.title) || (!j.title.trim() && lightsClients.has(nameKey(j.clientName)))));
    // Every job always has a timer (1) unless it's already installed.
    const withTimer = (saved) => (saved.installed ? saved : { ...saved, materials: withDefaults(saved.materials, items) });
    const list = jobberJobs.map((j) => ({ ...j, saved: withTimer(jobsMap[j.id] || {}) }))
      .sort((a, b) => (!!a.saved.installed - !!b.saved.installed) || new Date(a.visitAt || 0) - new Date(b.visitAt || 0));
    const patchJob = (j, p) => setJobsMap((m) => ({ ...(m || {}), [j.id]: { clientName: j.clientName, title: j.title, date: j.visitAt, ...((m || {})[j.id] || {}), ...p } }));
    const setQty = (j, itemId, qty) => patchJob(j, { materials: { ...(j.saved.materials || {}), [itemId]: qty } });
    const removeMat = (j, itemId) => { const m = { ...(j.saved.materials || {}) }; delete m[itemId]; patchJob(j, { materials: m }); };
    const quoteFor = (name) => quotes.find((q) => nameKey(q.clientInfo?.name || q.client) === nameKey(name));
    const install = (j, on) => {
      const mats = j.saved.materials || {};
      const dir = on ? 1 : -1;
      setItems((all) => (all || []).map((x) => (n(mats[x.id]) ? { ...x, onHand: n(x.onHand) - dir * n(mats[x.id]), used: Math.max(0, n(x.used) + dir * n(mats[x.id])) } : x)));
      patchJob(j, { installed: on, installedAt: on ? new Date().toISOString() : null });
    };
    const itemById = (id) => items.find((x) => x.id === id);
    const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'no date');

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted">Lights jobs from Jobber. Enter what each job takes — it's held as Committed in Material until you mark it installed.</p>
          <button onClick={() => setTick((t) => t + 1)} disabled={schedule.loading} className="text-xs text-muted hover:text-primary disabled:opacity-50 cursor-pointer">{schedule.loading ? 'Updating…' : '↻ Refresh from Jobber'}</button>
        </div>
        {schedule.loading && !list.length && <p className="text-sm text-muted">Loading jobs from Jobber…</p>}
        {schedule.error && !list.length && <p className="text-sm text-red-400">Couldn't reach Jobber: {schedule.error.slice(0, 80)}</p>}
        {!schedule.loading && !schedule.error && !list.length && <p className="text-sm text-muted">No lights jobs in Jobber yet.</p>}
        {list.length > 0 && (() => {
          const costOf = (j) => Object.entries(j.saved.materials || {}).reduce((t, [id, qty]) => t + n(qty) * n(itemById(id)?.cost), 0);
          const jobsTotal = list.reduce((t, j) => t + n(j.total), 0);
          const matTotal = list.reduce((t, j) => t + costOf(j), 0);
          const left = jobsTotal - matTotal;
          const pct = jobsTotal ? Math.round((matTotal / jobsTotal) * 100) : 0;
          return (
            <div className="rounded-xl border border-border-brand bg-brand-light px-5 py-4 grid grid-cols-3 gap-4">
              <div>
                <p className="text-[11px] text-secondary">Jobs ({list.length})</p>
                <p className="text-2xl font-bold text-primary">{money(jobsTotal)}</p>
              </div>
              <div>
                <p className="text-[11px] text-secondary">Materials</p>
                <p className="text-2xl font-bold text-primary">{money(matTotal)}</p>
                <p className="text-[10px] text-muted">{pct}% of job $</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-brand-text-strong">Left for labor &amp; profit</p>
                <p className="text-2xl font-bold text-brand-text">{money(left)}</p>
                <p className="text-[10px] text-muted">{100 - pct}% of job $</p>
              </div>
            </div>
          );
        })()}
        {list.map((j) => {
          const mats = j.saved.materials || {};
          const q = quoteFor(j.clientName);
          const cost = Object.entries(mats).reduce((t, [id, qty]) => t + n(qty) * n(itemById(id)?.cost), 0);
          const installed = !!j.saved.installed;
          const confirmed = !!j.saved.confirmed;
          const locked = installed || confirmed;
          const unused = items.filter((x) => !(x.id in mats));
          // Checklist: which must-haves are on the job with an amount
          const onJob = Object.keys(mats).map((id) => itemById(id)).filter(Boolean);
          const checklist = MUST_HAVE.map(([label, test]) => {
            const present = onJob.filter(test);
            const filled = present.some((it) => n(mats[it.id]) > 0);
            const pick = items.find(test);
            return { label, present: present.length > 0, filled, pick };
          });
          const missing = checklist.filter((c) => !c.filled);
          return (
            <div key={j.id} className={`rounded-xl border bg-card p-4 space-y-3 ${installed ? 'border-emerald-500/40' : 'border-border-default'}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-base font-semibold text-primary">{j.clientName} <span className="text-xs font-normal text-muted">#{j.jobNumber}</span></p>
                  <p className="text-[11px] text-muted">
                    {j.title || 'Lights job'} · {fmtDate(j.visitAt)}{n(j.total) ? ` · ${money(j.total)}` : ''}
                    {j.visitDone && !installed && <span className="ml-1 font-semibold text-yellow-400">· done in Jobber — log materials &amp; mark installed</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {installed
                    ? <><span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-400">Installed {j.saved.installedAt ? fmtDate(j.saved.installedAt) : ''}</span>
                      <button onClick={() => install(j, false)} className="text-[11px] text-muted hover:text-primary underline cursor-pointer">Undo</button></>
                    : confirmed
                      ? <><span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-brand-light text-brand-text-strong">✓ Confirmed {j.saved.confirmedAt ? fmtDate(j.saved.confirmedAt) : ''}</span>
                        <button onClick={() => patchJob(j, { confirmed: false, confirmedAt: null })} className="text-[11px] text-muted hover:text-primary underline cursor-pointer">Change</button>
                        <button onClick={() => install(j, true)} className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold cursor-pointer" title="Takes these materials out of Material">Mark installed</button></>
                      : <button onClick={() => patchJob(j, { materials: j.saved.materials, confirmed: true, confirmedAt: new Date().toISOString() })} disabled={missing.length > 0} className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold disabled:opacity-40 cursor-pointer" title={missing.length ? `Still need: ${missing.map((c) => c.label).join(', ')}` : 'This is what the job needs'}>Confirm materials</button>}
                </div>
              </div>

              {!locked && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {checklist.map((c) => (
                    <button
                      key={c.label}
                      disabled={c.present || !c.pick}
                      onClick={() => c.pick && setQty(j, c.pick.id, defaultQty(c.pick))}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${c.filled ? 'border-emerald-500/40 text-emerald-400' : c.present ? 'border-yellow-500/50 text-yellow-400' : 'border-red-500/50 text-red-400 hover:bg-red-500/10 cursor-pointer'}`}
                      title={c.filled ? 'Done' : c.present ? 'Type how many' : c.pick ? `Add ${c.pick.name}` : 'Add this item to Supplies first'}
                    >
                      {c.filled ? '✓' : c.present ? '…' : '+'} {c.label}
                    </button>
                  ))}
                  {missing.length > 0 && <span className="text-[11px] text-muted ml-1">{missing.length} to go</span>}
                </div>
              )}

              <div className="space-y-1.5">
                {groupSupplies(Object.keys(mats).map((id) => itemById(id) || { id, name: 'Removed item' })).flatMap(([, , its]) => its).map(({ id }) => [id, mats[id]]).map(([id, qty]) => {
                  const it = itemById(id);
                  return (
                    <div key={id} className="flex items-center gap-2.5">
                      {it?.image ? <img src={it.image} alt="" className="w-8 h-8 rounded-md object-cover bg-white" /> : <div className="w-8 h-8 rounded-md bg-surface-alt" />}
                      <span className="flex-1 text-sm text-primary truncate">{it?.name || 'Removed item'}</span>
                      <input
                        value={qty}
                        inputMode="decimal"
                        disabled={locked}
                        onChange={(e) => setQty(j, id, e.target.value.replace(/[^0-9.]/g, ''))}
                        className="w-20 rounded-md border border-border-strong bg-card px-2 py-1 text-sm text-primary text-right disabled:opacity-60"
                      />
                      <span className="w-12 text-xs text-muted">{it?.unit}</span>
                      <span className="w-20 text-right text-sm text-secondary tabular-nums">{n(qty) && n(it?.cost) ? `$${(n(qty) * n(it.cost)).toFixed(2)}` : '—'}</span>
                      {!locked && <button onClick={() => removeMat(j, id)} className="p-1 text-muted hover:text-red-500 cursor-pointer" title="Remove"><Trash2 size={13} /></button>}
                    </div>
                  );
                })}
                {!Object.keys(mats).length && <p className="text-xs text-muted">No materials yet.</p>}
                {cost > 0 && (
                  <div className="flex items-center justify-end gap-4 pt-2 mt-1 border-t border-border-subtle text-sm">
                    <span className="text-muted">Materials</span>
                    <span className="font-bold text-primary tabular-nums">${cost.toFixed(2)}</span>
                    {n(j.total) > 0 && <>
                      <span className="text-muted">Job</span>
                      <span className="text-primary tabular-nums">{money(j.total)}</span>
                      <span className="text-muted">Profit</span>
                      <span className="font-bold text-brand-text tabular-nums">{money(n(j.total) - cost)}</span>
                    </>}
                  </div>
                )}
              </div>

              {!locked && (
                <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border-subtle">
                  <MaterialPicker items={unused} onPick={(id) => setQty(j, id, defaultQty(itemById(id)))} />
                  {q && quoteFeet(q) > 0 && (
                    <button onClick={() => {
                      const filled = { ...mats, ...quoteMaterials(q, items) };
                      MUST_HAVE.forEach(([, test]) => {
                        if (!Object.keys(filled).some((id) => itemById(id) && test(itemById(id)))) { const it = items.find(test); if (it) filled[it.id] = defaultQty(it); }
                      });
                      patchJob(j, { materials: filled });
                    }} className="text-xs text-brand-text hover:underline cursor-pointer">
                      Fill from quote ({quoteFeet(q)} ft, {STYLE_LABEL[q.style || 'warm'] || 'custom colors — warm white bulbs'})
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ---------------- Supplies ----------------
  if (view === 'supplies') {
    const rows = items.map((x) => {
      const com = committed[x.id] || 0;
      const avail = n(x.onHand) - com;
      const coming = n(x.onOrder);
      // Counting what's already on order, so ordered items stop flagging.
      const shortForJobs = Math.max(0, com - n(x.onHand) - coming);
      const shortForLow = n(x.lowAt) > 0 && avail + coming < n(x.lowAt) ? n(x.lowAt) - Math.max(avail + coming, 0) : 0;
      const need = Math.max(shortForJobs, shortForLow);
      return { x, com, avail, low: n(x.lowAt) > 0 && avail <= n(x.lowAt), need, plan: packPlan(x, need) };
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
        {(() => {
          const val = (f) => items.reduce((t, x) => t + f(x) * n(x.cost), 0);
          const onHandV = val((x) => Math.max(0, n(x.onHand)));
          const comV = val((x) => Math.min(Math.max(0, n(x.onHand)), committed[x.id] || 0));
          const usedV = val((x) => n(x.used));
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['Stock on hand', onHandV, 'everything in the shop', true],
                ['Committed to jobs', comV, 'set aside for booked installs'],
                ['Free to use', onHandV - comV, 'not spoken for yet'],
                ['Used this season', usedV, 'went up on houses'],
              ].map(([label, v, sub, big]) => (
                <div key={label} className={`rounded-xl border px-4 py-3 ${big ? 'bg-brand-light border-border-brand' : 'bg-card border-border-default'}`}>
                  <p className={`text-[11px] ${big ? 'font-semibold text-brand-text-strong' : 'text-muted'}`}>{label}</p>
                  <p className={`text-2xl font-bold ${big ? 'text-brand-text' : 'text-primary'}`}>{money(v)}</p>
                  <p className="text-[10px] text-muted">{sub}</p>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="rounded-xl border border-border-default bg-card overflow-hidden">
          <div className="grid grid-cols-[1fr_70px_70px_70px_150px] gap-2 px-4 py-2 text-[11px] text-muted border-b border-border-subtle">
            <span>Item</span><span className="text-right">Have</span><span className="text-right">For jobs</span><span className="text-right">Free</span><span className="text-right">Status</span>
          </div>
          {groupSupplies(rows.map((r) => r.x)).map(([cat, label, its]) => (
            <div key={cat}>
              <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
              {its.map((it) => {
                const { x, com, avail, need, plan } = rows.find((r) => r.x.id === it.id);
                const coming = n(x.onOrder);
                const short = avail < 0 && need > 0;
                const status = short ? ['red', `Short ${Math.ceil(-avail - coming)}`]
                  : need > 0 ? ['yellow', 'Running low']
                  : coming > 0 ? ['blue', `📦 ${coming} coming`]
                  : ['ok', '✓ OK'];
                const tone = { red: 'text-red-400', yellow: 'text-yellow-400', blue: 'text-blue-400', ok: 'text-muted' }[status[0]];
                const open = editing === x.id;
                return (
                  <div key={x.id} className={`border-t border-border-subtle ${status[0] === 'red' ? 'bg-red-500/[0.07]' : status[0] === 'yellow' ? 'bg-yellow-500/[0.07]' : ''}`}>
                    <button onClick={() => setEditing(open ? '' : x.id)} className="w-full grid grid-cols-[1fr_70px_70px_70px_150px] gap-2 items-center px-4 py-2 text-left hover:bg-surface-alt/50 cursor-pointer">
                      <span className="flex items-center gap-3 min-w-0">
                        {x.image ? <img src={x.image} alt="" className="w-9 h-9 rounded-md object-cover bg-white shrink-0" /> : <span className="w-9 h-9 rounded-md bg-surface-alt shrink-0" />}
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-primary truncate">{x.name}</span>
                          <span className="block text-[11px] text-muted">${n(x.cost).toFixed(2)}/{x.unit}</span>
                        </span>
                      </span>
                      <span className="text-right text-sm text-primary tabular-nums">{n(x.onHand)}</span>
                      <span className="text-right text-sm text-secondary tabular-nums">{com || '—'}</span>
                      <span className={`text-right text-sm font-semibold tabular-nums ${avail < 0 ? 'text-red-400' : 'text-primary'}`}>{avail}</span>
                      <span className={`text-right text-xs font-semibold ${tone}`}>{status[1]}</span>
                    </button>
                    {(need > 0 && !open) && (
                      <div className="flex items-center justify-end gap-3 px-4 pb-2 -mt-1 text-[11px]">
                        <a href={orderUrl(x)} target="_blank" rel="noreferrer" className={`font-semibold hover:underline ${tone}`}>🛒 Order {plan ? plan.text : `${Math.ceil(need)} ${x.unit}`}</a>
                        <button onClick={() => patchItem(x.id, { onOrder: coming + (plan ? plan.qty : Math.ceil(need)) })} className="text-muted hover:text-primary underline cursor-pointer">I ordered it</button>
                      </div>
                    )}
                    {coming > 0 && !open && (
                      <div className="flex justify-end px-4 pb-2 -mt-1">
                        <button onClick={() => patchItem(x.id, { onHand: n(x.onHand) + coming, onOrder: '' })} className="px-2 py-0.5 rounded-md bg-brand text-on-brand text-[11px] font-semibold cursor-pointer">It arrived — add {coming} to Have</button>
                      </div>
                    )}
                    {open && (
                      <div className="px-4 pb-3 pt-1 flex items-end gap-3 flex-wrap bg-surface-alt/40">
                        {[['Have', 'onHand'], ['Low at', 'lowAt'], ['On order', 'onOrder'], ['Cost $', 'cost']].map(([lbl, key]) => (
                          <label key={key} className="text-[11px] text-muted">
                            {lbl}
                            <NumInput value={x[key] ?? ''} onChange={(v) => patchItem(x.id, { [key]: v })} className="block mt-0.5" />
                          </label>
                        ))}
                        <label className="text-[11px] text-muted">
                          Name
                          <input value={x.name} onChange={(e) => patchItem(x.id, { name: e.target.value })} className="block mt-0.5 w-56 rounded-md border border-border-strong bg-card px-2 py-1 text-sm text-primary outline-none" />
                        </label>
                        <SupplyPhoto src={x.image} onChange={(image) => patchItem(x.id, { image })} />
                        <span className="ml-auto flex items-center gap-2">
                          <a href={orderUrl(x)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-secondary hover:text-primary"><ShoppingCart size={13} /> Order</a>
                          <button onClick={() => { setItems((list) => list.filter((y) => y.id !== x.id)); setEditing(''); }} className="p-1 text-muted hover:text-red-500 cursor-pointer" title="Remove item"><Trash2 size={14} /></button>
                          <button onClick={() => setEditing('')} className="px-3 py-1 rounded-md bg-brand text-on-brand text-xs font-semibold cursor-pointer">Done</button>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setItems((list) => [...(list || []), { id: `item-${Date.now()}`, name: 'New item', unit: 'ea', onHand: 0, lowAt: 0, cost: 0, used: 0, packs: [] }])}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline cursor-pointer"
          ><Plus size={14} /> Add item</button>
          <span className="text-xs text-muted">Stock value {money(items.reduce((t, x) => t + n(x.onHand) * n(x.cost), 0))}</span>
        </div>

        {/* Real receipts — a record only, never changes stock */}
        {(() => {
          const orders = [...(ordersStored || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
          const real = orders.filter((o) => o.status !== 'draft').reduce((t, o) => t + n(o.total), 0);
          const hub = items.reduce((t, x) => t + (Math.max(0, n(x.onHand)) + n(x.used) + n(x.onOrder)) * n(x.cost), 0);
          const diff = real - hub;
          const blank = { id: '', date: new Date().toISOString().slice(0, 10), store: 'Lights at Wholesale', number: '', items: '', total: '', lines: [], status: 'otw' };
          // Stock moves for an order's lines: dir +1 = add, -1 = take back. field = onOrder | onHand
          const moveStock = (lines, field, dir) => {
            const q = {};
            (lines || []).forEach((l) => { if (l.itemId && n(l.qty)) q[l.itemId] = (q[l.itemId] || 0) + n(l.qty); });
            setItems((list) => (list || []).map((x) => (q[x.id] ? { ...x, [field]: Math.max(0, n(x[field]) + dir * q[x.id]) } : x)));
          };
          const save = () => {
            if (!orderDraft || (!n(orderDraft.total) && orderDraft.status !== 'draft')) return;
            const isNew = !orderDraft.id;
            const o = { ...orderDraft, id: orderDraft.id || `ord-${Date.now()}` };
            // Where an order's items count: draft → nowhere, on the way → On order, arrived → Have.
            const fieldFor = (st) => (st === 'arrived' ? 'onHand' : st === 'otw' ? 'onOrder' : null);
            const prev = isNew ? null : (ordersStored || []).find((x) => x.id === o.id);
            const before = isNew ? null : fieldFor(prev?.status || 'arrived');
            const after = fieldFor(o.status || 'arrived');
            if (before !== after) {
              if (before) moveStock(prev.lines, before, -1);
              if (after) moveStock(o.lines, after, 1);
            }
            setOrders((list) => [...(list || []).filter((x) => x.id !== o.id), o]);
            setOrderDraft(null);
          };
          const placed = (o) => {
            moveStock(o.lines, 'onOrder', 1);
            setOrders((list) => (list || []).map((x) => (x.id === o.id ? { ...x, status: 'otw', date: new Date().toISOString().slice(0, 10) } : x)));
          };
          const arrived = (o) => {
            moveStock(o.lines, 'onOrder', -1);
            moveStock(o.lines, 'onHand', 1);
            setOrders((list) => (list || []).map((x) => (x.id === o.id ? { ...x, status: 'arrived', arrivedAt: new Date().toISOString() } : x)));
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
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-surface-alt px-3 py-2"><p className="text-[11px] text-muted">Actually spent</p><p className="text-xl font-bold text-primary">{money(real)}</p><p className="text-[10px] text-muted">{orders.length} receipt{orders.length === 1 ? '' : 's'}</p></div>
                <div className="rounded-lg bg-surface-alt px-3 py-2"><p className="text-[11px] text-muted">Hub thinks</p><p className="text-xl font-bold text-primary">{money(hub)}</p><p className="text-[10px] text-muted">have + used + on order, at your costs</p></div>
                <div className="rounded-lg bg-surface-alt px-3 py-2"><p className="text-[11px] text-muted">Difference</p><p className={`text-xl font-bold ${Math.abs(diff) < 25 ? 'text-brand-text' : 'text-yellow-400'}`}>{diff >= 0 ? '+' : '−'}{money(Math.abs(diff))}</p><p className="text-[10px] text-muted">{Math.abs(diff) < 25 ? 'matches' : diff > 0 ? 'spent more than Hub counts (shipping, tax, missing items?)' : 'Hub counts more than you spent'}</p></div>
              </div>
              {orderDraft && (
                <div className="rounded-lg border border-border-brand p-3 space-y-3">
                  <div className="flex items-end gap-3 flex-wrap">
                    {field('date', 'Date', 'w-36', 'date')}
                    {field('store', 'Store', 'w-44')}
                    {field('number', 'Order #', 'w-24')}
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
                        const pics = await Promise.all(files.map(receiptImage));
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
                              {o.status === 'draft' ? 'Draft' : o.status === 'otw' ? 'On the way' : 'Arrived'}
                            </span>
                            {o.status === 'draft' && <button onClick={() => placed(o)} className="text-[10px] font-semibold text-brand-text hover:underline cursor-pointer">Mark ordered</button>}
                            {o.status === 'otw' && <button onClick={() => arrived(o)} className="text-[10px] font-semibold text-brand-text hover:underline cursor-pointer">Mark arrived</button>}
                          </div>
                        </div>
                        {/* middle: product photos */}
                        <button onClick={() => setOpenOrder(open ? '' : o.id)} className="flex-1 min-w-0 flex items-center gap-2 flex-wrap text-left cursor-pointer">
                          {lines.length > 0 ? lines.map((l, i) => (
                            <span key={i} className="relative" title={`${l.qty} × ${l.it?.name || l.itemId}`}>
                              {l.it?.image ? <img src={l.it.image} alt="" className="w-10 h-10 rounded-md object-cover bg-white border border-border-subtle" /> : <span className="block w-10 h-10 rounded-md bg-surface-alt" />}
                              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-black text-white text-[9px] font-bold leading-[18px] text-center">{l.qty >= 1000 ? `${l.qty / 1000}k` : l.qty}</span>
                            </span>
                          )) : <span className="text-[11px] text-muted truncate">{o.items}</span>}
                        </button>
                        {/* receipt: click to see it full screen */}
                        {(o.receipts || []).length > 0 && (
                          <button onClick={() => setReceiptView(o.receipts[0])} className="relative shrink-0 cursor-zoom-in" title="View receipt">
                            <img src={o.receipts[0]} alt="Receipt" className="w-10 h-12 rounded border border-border-default object-cover object-top bg-white" />
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
                                const pics = await Promise.all([...(e.target.files || [])].map(receiptImage));
                                setOrders((list) => (list || []).map((x) => (x.id === o.id ? { ...x, receipts: [...(x.receipts || []), ...pics] } : x)));
                              }} />
                            </label>
                            <button onClick={() => setOrderDraft(o)} className="px-1 text-[11px] hover:text-primary cursor-pointer">Edit</button>
                            <button onClick={() => setOrders((list) => (list || []).filter((x) => x.id !== o.id))} className="p-1 hover:text-red-500 cursor-pointer" title="Delete"><Trash2 size={12} /></button>
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
                            </div>
                          ))}
                          {o.items && <p className="text-[11px] text-muted pt-1">{o.items}</p>}
                          {(o.receipts || []).length > 0 && (
                            <div className="flex gap-2 pt-1 flex-wrap">
                              {o.receipts.map((r, ri) => (
                                <span key={ri} className="relative">
                                  <img src={r} alt="Receipt" onClick={() => setReceiptView(r)} className="w-24 rounded border border-border-default bg-white cursor-zoom-in" />
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
                {receiptView && (
                  <div className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setReceiptView('')}>
                    <img src={receiptView} alt="Receipt" className="max-w-full max-h-full rounded-lg bg-white" />
                  </div>
                )}
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
  const when = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

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
  const nextBooked = [...booked].sort((a, b) => new Date(a.assessmentAt) - new Date(b.assessmentAt))[0];
  const sumQ = (list) => list.reduce((t, q) => t + n(q.total), 0);

  const cards = [
    ['Cold leads', String(coldLeads.length), (() => {
      if (!coldLeads.length) return "people you haven't reached out to";
      const left = coldLeads.filter((l) => !l.status || l.status === 'new').length;
      const waiting = coldLeads.filter((l) => ['no_answer', 'pending'].includes(l.status)).length;
      return `${left} to reach out${waiting ? ` · ${waiting} waiting` : ''}`;
    })(), 'cold'],
    ['Warm leads', String(toBook.length), lightsReq.loading ? 'loading…' : 'reached out to you · book an assessment', 'needs'],
    ['Upcoming assessments', String(booked.length), nextBooked ? `next ${when(nextBooked.assessmentAt)}` : 'none coming up', 'booked'],
    ['Sent, waiting', money(sumQ(jSent)), `${jSent.length} quote${jSent.length === 1 ? '' : 's'}`, 'sent'],
    ['Upcoming schedule', schedule.loading ? '…' : String(lightsJobs.length), schedule.error ? 'Jobber busy — try later' : wonNotScheduled.length ? `${wonNotScheduled.length} won not booked` : 'lights installs booked', 'scheduled'],
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
        {onNew && (
          <button onClick={onNew} className="inline-flex items-center gap-1.5 rounded-lg bg-brand text-on-brand text-sm font-semibold px-4 py-2 hover:bg-brand-hover cursor-pointer">
            <Plus size={15} /> New quote
          </button>
        )}
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
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted -mb-2">Pipeline</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {cards.map(([label, big, sub, key]) => {
          const on = filter === key;
          return (
            <button
              key={label}
              onClick={() => setFilter((f) => (f === key ? '' : key))}
              className={`text-left rounded-xl border bg-card px-3 py-3 transition-colors cursor-pointer hover:border-border-strong ${on ? 'border-border-brand ring-2 ring-ring-brand' : 'border-border-default'}`}
            >
              <p className={`text-[11px] leading-tight ${on ? 'text-brand-text font-semibold' : 'text-muted'}`}>{label}</p>
              <p className="text-xl font-bold text-primary mt-1">{big}</p>
              <p className="text-[10px] text-muted leading-tight">{sub}</p>
            </button>
          );
        })}
      </div>

      {filter === 'cold' && <ColdLeads leads={coldLeads} setLeads={setColdLeads} />}
      {reqFilter && panel(cardTitle, <>{reqFilter.length} · {showAll}</>, reqFilter.map(reqRow), 'Nothing here.')}
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

