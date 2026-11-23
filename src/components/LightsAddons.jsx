import { useEffect, useRef, useState } from 'react';
import { getExtrasMeta, getImages, saveExtrasMeta, saveImage } from '../lib/lightsStore';
import { useAppStore } from '../store/AppStoreContext';
import { addonTotals, addonPrice, pricedAddons, PER_STRAND } from '../lib/lightsAddonMath';

// Quoter → "Add-ons for the client": optional extras (trees, doors, garages…) shown on the Present page
// as cards they can take out to lower the price, plus free perks (e.g. gutter cleaning) in the Hey Jude's box.
// When they say yes, the add-ons they kept go on the Jobber quote. Saved to lq-ba:<id> (not the quote
// rows, so the Quoter's autosave can't overwrite them); photos are separate lq-img rows.

// One-tap add-ons. `items` = what it uses from Material ("strands" = follows the Strands box).
const QUICK = [
  { icon: '🎄', label: 'Wreath', sub: '24" lit wreath with a red bow', price: 250, strands: 0, items: [{ id: 'wreath-24', qty: 1 }, { id: 'item-1794520055870', qty: 1 }] },
  { icon: '🌳', label: 'Tree wrap', sub: 'Spiral-wrapped trunk', strands: '', items: [{ id: 'mini-warm', qty: 'strands' }] },
  { icon: '🌿', label: 'Bushes', sub: 'Net-style wrap for full coverage', strands: '', items: [{ id: 'mini-warm', qty: 'strands' }] },
  { icon: '🪟', label: 'Around the windows', sub: 'Outlined in lights', strands: '', items: [{ id: 'mini-warm-white', qty: 'strands' }] },
  { icon: '🚪', label: 'Around the doors', sub: 'Outlined in lights', strands: '', items: [{ id: 'mini-warm-white', qty: 'strands' }] },
  { icon: '🏠', label: 'Around the garage', sub: 'Outlined in lights', strands: '', items: [{ id: 'mini-warm-white', qty: 'strands' }] },
  { icon: '🌲', label: 'Garland', sub: 'Lit garland on the railing or doorway', price: '', strands: 0, items: [{ id: 'garland-9', qty: 1 }] },
];
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const newId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function toJpeg(file, max = 1300) {
  const src = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
  const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.72);
}

export default function LightsAddons({ quoteId, onMaterials = null }) {
  const supplies = useAppStore((st) => st.lightsSupplies) || [];
  const [addons, setAddons] = useState(null); // null = loading
  const [perStrand, setPerStrandState] = useState(PER_STRAND);
  const [imgs, setImgs] = useState({}); // lq-img key → data URL (for thumbnails)
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');
  const loadedFor = useRef('');
  const timer = useRef(null);

  // Loads once per quote (the parent remounts this with key={quoteId}).
  const aRef = useRef([]); const sRef = useRef(PER_STRAND);
  useEffect(() => {
    if (!quoteId) return undefined;
    let off = false;
    getExtrasMeta(quoteId).then(async (v) => {
      if (off) return;
      sRef.current = Number(v.perStrand) > 0 ? Number(v.perStrand) : PER_STRAND;
      const a = pricedAddons(Array.isArray(v.addons) ? v.addons : [], sRef.current);
      aRef.current = a;
      setAddons(a); setPerStrandState(sRef.current);
      loadedFor.current = quoteId;
      const m = await getImages(a.map((x) => x.photo)).catch(() => ({}));
      if (!off) setImgs(m);
    }).catch(() => { if (!off) { setAddons([]); setStatus('Could not load add-ons'); } });
    return () => { off = true; };
  }, [quoteId]);

  // Every edit saves (debounced) — never on the initial load.
  const queueSave = () => {
    if (loadedFor.current !== quoteId) return;
    setStatus('Saving…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveExtrasMeta(quoteId, { addons: aRef.current, perStrand: sRef.current })
        .then(() => setStatus('Saved'))
        .catch(() => setStatus('Not saved — check connection'));
    }, 700);
  };
  const setA = (fn) => { aRef.current = fn(aRef.current); setAddons(aRef.current); queueSave(); onMaterials?.(addonTotals(aRef.current)); };
  // Changing $/strand re-prices every add-on that has strands (price = strands × $/strand).
  const setPerStrand = (n) => {
    sRef.current = Number(n) || 0; setPerStrandState(n);
    if (sRef.current > 0) setA((list) => list.map((x) => (Number(x.strands) > 0 ? { ...x, price: Number(x.strands) * sRef.current } : x)));
    else queueSave();
  };
  const edit = (id, patch) => setA((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const upload = async (id, file) => {
    if (!file) return;
    setBusy(id);
    try {
      const src = await toJpeg(file);
      const key = await saveImage(quoteId, `addon-${id}-${newId()}`, src);
      setImgs((m) => ({ ...m, [key]: src }));
      edit(id, { photo: key });
    } catch { setStatus('Photo did not upload — try again'); }
    setBusy('');
  };

  if (!quoteId) return <p className="text-sm text-muted">Pick the client first so the quote saves — then you can add add-ons.</p>;
  if (addons === null) return <p className="text-sm text-muted">Loading add-ons…</p>;

  const total = addons.reduce((t, x) => t + addonPrice(x, perStrand), 0);
  const box = 'rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:border-brand';
  const input = `w-full ${box}`;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">They show as cards on the Present page, start <b>added</b>, and the client can take them out. Prices are per season, on top of the roofline.</p>
        {status && <span className={`text-xs shrink-0 ${/Not|did not|Could not/.test(status) ? 'text-red-400' : 'text-muted'}`}>{status}</span>}
      </div>

      <label className="flex items-center gap-2 text-sm text-secondary">
        Price per strand $
        <input type="number" min="0" inputMode="decimal" value={perStrand} onChange={(e) => setPerStrand(e.target.value)} className={`${box} w-20 font-semibold`} />
        <span className="text-xs text-muted">— each add-on's “= strands × $” button uses this</span>
      </label>

      {addons.map((x) => {
        const src = imgs[x.photo] || '';
        const suggested = (Number(x.strands) || 0) * (Number(perStrand) || 0);
        return (
          <div key={x.id} className="rounded-xl border border-border-default bg-surface-alt/30 p-3 flex gap-3 flex-wrap sm:flex-nowrap">
            {/* Photo */}
            <label className={`relative shrink-0 w-full sm:w-40 aspect-[4/3] rounded-lg overflow-hidden border border-border-default bg-card cursor-pointer flex items-center justify-center ${busy === x.id ? 'opacity-50' : ''}`}>
              {src ? <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <span className="text-sm text-muted text-center px-2">{x.photo ? 'Loading…' : '📷 Add photo'}</span>}
              {src && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Change</span>}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { upload(x.id, e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {/* Details */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex gap-2">
                <input value={x.label || ''} onChange={(e) => edit(x.id, { label: e.target.value })} placeholder="Name — e.g. 2 right trees" className={`${input} font-semibold`} />
                <button onClick={() => setA((list) => list.filter((y) => y.id !== x.id))} title="Remove" className="shrink-0 rounded-lg px-3 text-sm text-red-400 hover:bg-red-500/10 cursor-pointer">✕</button>
              </div>
              <input value={x.sub || ''} onChange={(e) => edit(x.id, { sub: e.target.value })} placeholder="Short line — e.g. Spiral-wrapped trunks" className={input} />
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1.5 text-sm text-secondary">
                  Strands
                  <input type="number" min="0" inputMode="numeric" value={x.strands ?? ''} onChange={(e) => { const n = e.target.value === '' ? '' : Number(e.target.value); edit(x.id, { strands: n, ...(Number(n) > 0 && Number(perStrand) > 0 ? { price: Number(n) * Number(perStrand) } : {}) }); }} className={`${box} w-20`} />
                </label>
                {suggested > 0
                  ? <span className="text-sm text-secondary whitespace-nowrap">× ${Number(perStrand) || 0} = <b className="text-primary">{money(suggested)}</b></span>
                  : (
                    <label className="flex items-center gap-1.5 text-sm text-secondary whitespace-nowrap">
                      Price $
                      <input type="number" min="0" inputMode="decimal" value={x.price ?? ''} onChange={(e) => edit(x.id, { price: e.target.value === '' ? '' : Number(e.target.value) })} className={`${box} w-24`} />
                    </label>
                  )}
                <label className="ml-auto flex items-center gap-1.5 text-sm text-secondary cursor-pointer">
                  <input type="checkbox" checked={x.on !== false} onChange={(e) => edit(x.id, { on: e.target.checked })} />
                  Starts added
                </label>
              </div>
              {/* What it uses from Material → goes into the job's Materials */}
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="text-secondary">Uses</span>
                {(x.items || []).map((it, k) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-lg border border-border-default bg-card pl-1 pr-1.5 py-0.5">
                    <select value={it.id} onChange={(e) => edit(x.id, { items: x.items.map((y, j) => (j === k ? { ...y, id: e.target.value } : y)) })} className="bg-transparent text-sm text-primary outline-none max-w-[200px]">
                      {!supplies.some((sp) => sp.id === it.id) && <option value={it.id}>{it.id}</option>}
                      {supplies.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                    </select>
                    {it.qty === 'strands'
                      ? <span className="text-xs text-muted">× strands ({Number(x.strands) || 0})</span>
                      : <input type="number" min="0" value={it.qty} onChange={(e) => edit(x.id, { items: x.items.map((y, j) => (j === k ? { ...y, qty: Number(e.target.value) || 0 } : y)) })} className="w-12 bg-transparent text-sm text-primary outline-none text-right" />}
                    <button onClick={() => edit(x.id, { items: x.items.filter((_, j) => j !== k) })} className="text-xs text-red-400 cursor-pointer" title="Remove">✕</button>
                  </span>
                ))}
                <button onClick={() => edit(x.id, { items: [...(x.items || []), { id: supplies.find((sp) => /mini/i.test(sp.name))?.id || supplies[0]?.id || '', qty: (x.items || []).length ? 1 : 'strands' }] })}
                  className="rounded-lg border border-dashed border-border-default px-2 py-1 text-xs text-secondary hover:text-primary cursor-pointer">+ material</button>
              </div>
              {!(addonPrice(x, perStrand) > 0) && <p className="text-xs text-red-400">Needs a price to show on the Present page.</p>}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-secondary">Add:</span>
        {QUICK.map((qk) => (
          <button key={qk.label} onClick={() => setA((list) => [...list, { id: newId(), label: qk.label, sub: qk.sub, photo: '', price: qk.price ?? '', strands: qk.strands, on: true, items: qk.items.map((it) => ({ ...it })) }])}
            className="rounded-xl border border-border-default bg-card px-3 py-2 text-sm font-semibold text-primary hover:border-brand cursor-pointer">{qk.icon} {qk.label}</button>
        ))}
        <button onClick={() => setA((list) => [...list, { id: newId(), label: '', sub: '', photo: '', price: '', strands: '', on: true, items: [] }])}
          className="rounded-xl bg-brand text-on-brand px-3 py-2 text-sm font-bold hover:bg-brand-hover cursor-pointer">+ Custom</button>
      </div>
      <div>
        {addons.length > 0 && <span className="text-sm text-muted">All add-ons: <b className="text-primary">{money(total)}</b>/season · {addons.reduce((t, x) => t + (Number(x.strands) || 0), 0)} strands</span>}
      </div>

    </div>
  );
}
