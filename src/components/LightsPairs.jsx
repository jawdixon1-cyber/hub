import { useEffect, useRef, useState } from 'react';
import { getExtrasMeta, getImages, saveExtrasMeta, saveImage } from '../lib/lightsStore';

// Quoter → Mockup: before/after pairs for the Present page ("Drag to see the difference").
// One per side you want to show — e.g. Front of the house, Side + garage. Each photo is its own
// lq-img row; the list lives in lq-ba:<id>.pairs. When there are pairs, the Present page shows these
// sliders instead of the single night-photo/mockup one.

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function toJpeg(file, max = 1400) {
  const src = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
  const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.72);
}

export default function LightsPairs({ quoteId }) {
  const [pairs, setPairs] = useState(null); // null = loading
  const [imgs, setImgs] = useState({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');
  const ref = useRef([]);
  const loaded = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!quoteId) return undefined;
    let off = false;
    getExtrasMeta(quoteId).then(async (v) => {
      if (off) return;
      // Give older pairs an id so they can be edited.
      const p = (Array.isArray(v.pairs) ? v.pairs : []).map((x, i) => ({ id: x.id || `p-old-${i}`, ...x }));
      ref.current = p; setPairs(p); loaded.current = true;
      const m = await getImages(p.flatMap((x) => [x.before, x.after])).catch(() => ({}));
      if (!off) setImgs(m);
    }).catch(() => { if (!off) { setPairs([]); setStatus('Could not load before/afters'); } });
    return () => { off = true; };
  }, [quoteId]);

  const queueSave = () => {
    if (!loaded.current) return;
    setStatus('Saving…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveExtrasMeta(quoteId, { pairs: ref.current })
        .then(() => setStatus('Saved'))
        .catch(() => setStatus('Not saved — check connection'));
    }, 700);
  };
  const setP = (fn) => { ref.current = fn(ref.current); setPairs(ref.current); queueSave(); };
  const edit = (id, patch) => setP((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const upload = async (id, which, file) => {
    if (!file) return;
    setBusy(`${id}-${which}`);
    try {
      const src = await toJpeg(file);
      const key = await saveImage(quoteId, `${which}-${id}-${newId()}`, src);
      setImgs((m) => ({ ...m, [key]: src }));
      edit(id, { [which]: key });
    } catch { setStatus('Photo did not upload — try again'); }
    setBusy('');
  };

  if (!quoteId) return <p className="text-sm text-muted">Pick the client first so the quote saves.</p>;
  if (pairs === null) return <p className="text-sm text-muted">Loading before/afters…</p>;

  const box = 'w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:border-brand';
  const slot = (x, which, label) => {
    const src = imgs[x[which]] || '';
    return (
      <label className={`relative flex-1 min-w-[140px] aspect-[4/3] rounded-lg overflow-hidden border border-border-default bg-card cursor-pointer flex items-center justify-center ${busy === `${x.id}-${which}` ? 'opacity-50' : ''}`}>
        {src ? <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <span className="text-sm text-muted text-center px-2">{x[which] ? 'Loading…' : `📷 ${label}`}</span>}
        <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">{label}</span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { upload(x.id, which, e.target.files?.[0]); e.target.value = ''; }} />
      </label>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">One per side you want to show. Use the same angle for both — the Present page lines them up as a drag slider.</p>
        {status && <span className={`text-xs shrink-0 ${/Not|did not|Could not/.test(status) ? 'text-red-400' : 'text-muted'}`}>{status}</span>}
      </div>
      {pairs.map((x, i) => (
        <div key={x.id} className="rounded-xl border border-border-default bg-surface-alt/30 p-3 space-y-2">
          <div className="flex gap-2">
            <input value={x.label || ''} onChange={(e) => edit(x.id, { label: e.target.value })} placeholder={i === 0 ? 'e.g. Front of the house' : 'e.g. Side + garage'} className={`${box} font-semibold`} />
            <button onClick={() => setP((list) => list.filter((y) => y.id !== x.id))} title="Remove" className="shrink-0 rounded-lg px-3 text-sm text-red-400 hover:bg-red-500/10 cursor-pointer">✕</button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {slot(x, 'before', 'Before')}
            {slot(x, 'after', 'After')}
          </div>
          {!(x.before && x.after) && <p className="text-xs text-red-400">Needs both photos to show.</p>}
        </div>
      ))}
      <button onClick={() => setP((list) => [...list, { id: newId(), label: '', before: '', after: '' }])}
        className="rounded-xl bg-brand text-on-brand px-4 py-2.5 text-sm font-bold hover:bg-brand-hover cursor-pointer">+ Add a before / after</button>
    </div>
  );
}
